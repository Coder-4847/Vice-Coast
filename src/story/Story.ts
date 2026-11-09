import * as THREE from 'three';
import type { Game } from '../Game';
import { StoryHud } from '../ui/StoryHud';
import { btn, row, section, type Page } from '../ui/Modal';
import { money } from '../economy/Economy';
import { h } from '../ui/dom';
import { VEHICLES } from '../vehicles/specs';
import { Beacons } from './Beacons';
import { CHARS, VOICES } from './chars';
import { CUTSCENES } from './content/cutscenes';
import { MISSIONS } from './content/missions';
import { Cutscenes, lineSecs, Speech } from './Cutscenes';
import { Drivers } from './Drivers';
import { Figures } from './Figures';
import { Hostiles } from './Hostiles';
import { MissionRun, type MissionDef } from './Missions';
import { PLACES } from './places';
import { Protagonists } from './Protagonists';
import { Heists } from './Heists';
import { HEIST_MISSIONS } from './content/heists';
import { glyphFor } from '../input/Glyphs';
import type { CharId, MissionRecord, Place, StoryState } from './types';

const BY_ID: Record<string, MissionDef> = Object.fromEntries([...MISSIONS, ...HEIST_MISSIONS].map((m) => [m.id, m]));

/**
 * The story layer: owns the mission engine, cutscenes, the three protagonists and heists, and wires them into the
 * game loop. Everything it saves lives in `profile.story`.
 */
export class Story {
  readonly hud: StoryHud;
  readonly beacons = new Beacons();
  readonly figures: Figures;
  readonly hostiles: Hostiles;
  readonly drivers: Drivers;
  readonly cutscenes: Cutscenes;
  readonly speech: Speech;
  readonly protagonists: Protagonists;
  readonly heists: Heists;
  mission: MissionRun | null = null;
  /** The text for the interact prompt when a mission start or heist board is in reach. */
  prompt: string | null = null;
  private near: { kind: 'mission'; def: MissionDef } | { kind: 'heist'; id: string } | null = null;
  private readonly placeCache = new Map<string, { x: number; z: number }>();
  private readonly markerIds = new Map<string, number>();
  private markerKey = '';
  private markerT = 0;
  /** Banners that wait until the player is back in the game (after a summary card). */
  private readonly queue: (() => void)[] = [];
  private queueT = 0;
  private ready = false;

  constructor(readonly g: Game) {
    const root = document.getElementById('ui')!;
    this.hud = new StoryHud(root, g.ui.hudRoot);
    this.figures = new Figures(g);
    this.hostiles = new Hostiles(g);
    this.drivers = new Drivers(g);
    this.speech = new Speech(() => g.settings.data.accessibility.spokenDialogue);
    this.cutscenes = new Cutscenes(this);
    this.protagonists = new Protagonists(this);
    this.heists = new Heists(this);
    g.world.scene.add(this.beacons.group);
    for (const m of this.beacons.materials) g.world.rig.register(m);
    this.hostiles.onKilled = (p, tag) => this.onKill(p, tag);
    this.hostiles.onAlert = () => { if (this.mission) this.mission.stats.alerts++; };
    // count shots for the accuracy medal
    const w = g.weapon;
    if (w) {
      const prev = w.onFire;
      w.onFire = (k) => {
        prev?.(k);
        if (this.mission) this.mission.stats.shots++;
        if (!w.suppressed[w.def.id]) this.hostiles.noise(g.player!.pos.x, g.player!.pos.z, 40);
        else this.hostiles.noise(g.player!.pos.x, g.player!.pos.z, 9);
      };
    }
    // civilians killed by the player (for the "no casualties" medal)
    const hooks = g.npcs?.peds.hooks;
    if (hooks) {
      const prevK = hooks.killed;
      hooks.killed = (p, byPlayer) => {
        prevK?.(p, byPlayer);
        if (byPlayer && this.mission && p.role === 'civ') this.mission.stats.civKills++;
      };
    }
  }

  get st(): StoryState { return this.g.commerce!.eco.p.story; }
  get active(): CharId { return this.st.active; }

  static get missions(): MissionDef[] { return MISSIONS; }
  static def(id: string): MissionDef | undefined { return BY_ID[id]; }
  defOf(id: string): MissionDef | undefined { return BY_ID[id]; }

  // ------------------------------------------------------------------------------------------------ setup

  /** A save was loaded, or a new game began. */
  onBegin(isNew: boolean): void {
    const g = this.g;
    this.endEverything();
    const st = this.st;
    const q = new URLSearchParams(location.search);
    const debug = q.has('debug');
    if (isNew) {
      const mack = CHARS.mack;
      g.commerce!.eco.p.outfit = { ...mack.outfit };
      g.commerce!.applyOutfit();
      g.commerce!.eco.grantProperty(mack.home);
      g.commerce!.eco.p.home = mack.home;
      st.chars.mack = undefined;
      if (!debug) {
        const home = this.place(mack.start);
        g.player!.teleport(home.x, home.z + 5, 0);
        g.world.city.warm(home.x, home.z);
      }
    } else {
      // the active character's looks come from the profile; the others from the story
      g.commerce!.eco.p.home ??= CHARS[st.active].home;
    }
    for (const id of st.unlocked) { const c = CHARS[id]; g.commerce!.eco.grantProperty(c.home); g.commerce!.spawnPropCrafts(c.home); }
    this.protagonists.applyPassives();
    this.protagonists.refreshAllFigures();
    this.markerKey = '';
    this.ready = true;
    g.commerce!.refreshMarkers();
    if (isNew && !debug && !st.introSeen) {
      st.introSeen = true;
      setTimeout(() => this.playCutscene('intro', () => {
        this.hud.showTip('Your first job is marked on the map (M). Phone: Missions app.', 10);
        const w = this.place('gala');
        this.setWaypoint(w.x, w.z);
      }), 1800);
    }
  }

  private endEverything(): void {
    this.mission?.cleanup();
    this.mission = null;
    this.hostiles.clear();
    this.drivers.clear();
    this.figures.clear();
    this.clearMarkers();
    this.hud.setObjective(null, null);
    this.hud.setTimer(null);
    this.protagonists.endAbility();
    this.cutscenes.end(true);
  }

  // ------------------------------------------------------------------------------------------------ helpers for scripts

  place(p: Place, car = false): { x: number; z: number } {
    if (typeof p !== 'string') return car ? this.snap(p.x, p.z, 3.2) : { x: p.x, z: p.z };
    const def = PLACES[p];
    if (!def) throw new Error(`unknown place ${p}`);
    const hit = this.placeCache.get(p + (car ? '!' : ''));
    if (hit) return hit;
    const cm = this.g.commerce!;
    let out: { x: number; z: number };
    const pt = def.ref ? cm.points.byRef(def.ref) : undefined;
    if (pt && def.off) out = cm.points.find(pt.x + def.off[0], pt.z + def.off[1], (car || def.car) ? 3.4 : 2.2, { walkOnly: false, maxR: 40 });
    else if (pt) out = { x: pt.x, z: pt.z };
    else out = cm.points.find(def.x, def.z, (car || def.car) ? 3.4 : 2.2, { walkOnly: false, maxR: 140 });
    this.placeCache.set(p + (car ? '!' : ''), out);
    return out;
  }

  /** The nearest open ground to a point (for spawning people). */
  snap(x: number, z: number, margin = 0.9): { x: number; z: number } {
    return this.g.commerce!.points.find(x, z, margin, { walkOnly: false, maxR: 24 });
  }

  interactKey(): string { return glyphFor(this.g.input, 'interact', this.g.input.activeDevice); }

  switchKey(): string {
    const g = this.g;
    return g.input.activeDevice === 'gamepad' ? 'D-pad ←' : g.input.activeDevice === 'touch' ? 'Switch' : 'Z';
  }

  /** A launch ramp: returns a remover. `ry` is the direction of travel (forward = (sin ry, cos ry)). */
  ramp(x: number, z: number, ry: number, len = 15, width = 9, rise = 3.6): () => void {
    const g = this.g;
    const gy = this.g.world.heightAt(x, z);
    const th = Math.asin(rise / len);
    const t = 0.7;
    const cy = gy + (len / 2) * Math.sin(th) - (t / 2) * Math.cos(th) + 0.1;
    const handles = g.physics!.addBuildings([{ cx: x, cy, cz: z, hx: width / 2, hy: t / 2, hz: len / 2, ry, rx: -th }]);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, t, len), this.rampMat());
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(-th, ry, 0);
    mesh.position.set(x, cy, z);
    g.world.scene.add(mesh);
    return () => { g.physics!.removeBuildings(handles); g.world.scene.remove(mesh); mesh.geometry.dispose(); };
  }

  private rampM: THREE.MeshStandardMaterial | null = null;
  private rampMat(): THREE.MeshStandardMaterial {
    if (!this.rampM) {
      this.rampM = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.8, metalness: 0.1 });
      this.g.world.rig.register(this.rampM);
    }
    return this.rampM;
  }

  placeName(p: Place): string { return typeof p === 'string' ? (PLACES[p]?.label ?? p) : 'there'; }

  /** A heading that follows the nearest street (so parked mission cars sit along the kerb). */
  roadYaw(x: number, z: number): number {
    const plan = this.g.world.city.plan;
    if (!plan.inCity(x, z)) return 0;
    const alongZ = plan.roadAt(x, z + 9).kind === 'road' && plan.roadAt(x, z - 9).kind === 'road';
    return alongZ ? 0 : Math.PI / 2;
  }

  vehicleLabel(spec: string): string { return VEHICLES[spec]?.name ?? 'vehicle'; }

  setWaypoint(x: number, z: number): void {
    const g = this.g;
    g.silentWp = true;
    g.map.setWaypoint({ x, z });
    g.silentWp = false;
  }

  clearWaypoint(): void {
    const g = this.g;
    if (!g.map.waypoint) return;
    g.silentWp = true;
    g.map.setWaypoint(null);
    g.silentWp = false;
  }

  /** Subtitle + optional speech for one line. */
  say(who: string, text: string, secs = lineSecs(text)): void {
    const v = VOICES[who];
    if (this.g.settings.data.accessibility.subtitles) this.hud.say(v?.name ?? who, v?.color ?? '#eceef3', text, secs);
    this.speech.say(who, text);
  }

  playCutscene(id: string, onEnd?: () => void): void {
    const def = CUTSCENES[id];
    if (!def) { console.warn('no cutscene', id); onEnd?.(); return; }
    this.cutscenes.start(def, onEnd);
  }

  /** Gameplay input stays off while a cutscene or a character switch is running. */
  sceneBlocksInput(): boolean {
    return this.cutscenes.active || this.protagonists.busy || this.protagonists.wheelOpen || this.g.state !== 'playing' && this.g.state !== 'phone';
  }

  /** Fade to black, run `mid`, fade back. */
  fadeThrough(mid: () => void, hold = 350): void {
    const root = document.getElementById('ui')!;
    const el = root.appendChild(h('div', 'fade-black'));
    requestAnimationFrame(() => el.classList.add('on'));
    setTimeout(() => {
      mid();
      setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 700); }, hold);
    }, 650);
  }

  // ------------------------------------------------------------------------------------------------ progress

  record(id: string): MissionRecord {
    return (this.st.missions[id] ??= { done: false, skipped: false, medals: [], best: 0, fails: 0, plays: 0 });
  }

  done(id: string): boolean { return !!this.st.missions[id]?.done; }

  available(def: MissionDef): boolean {
    if (def.hidden) return false;
    if (this.done(def.id)) return false;
    if (def.char !== 'any' && !this.st.unlocked.includes(def.char)) return false;
    return (def.after ?? []).every((a) => this.done(a));
  }

  unlockChar(id: CharId): void {
    const st = this.st;
    if (st.unlocked.includes(id)) return;
    st.unlocked.push(id);
    const c = CHARS[id];
    const cm = this.g.commerce!;
    cm.eco.grantProperty(c.home);
    cm.spawnPropCrafts(c.home);
    this.protagonists.refreshFigure(id);
    cm.refreshMarkers();
    this.queue.push(() => this.hud.showBanner('New character', c.nick.toUpperCase(), `${c.role} · press ${this.switchKey()} to switch`, 'good', 4));
  }

  // ------------------------------------------------------------------------------------------------ mission flow

  startMission(def: MissionDef, replay = false): boolean {
    const g = this.g;
    if (this.mission || this.cutscenes.active || this.protagonists.busy) return false;
    if (g.combat?.flow) return false;
    if ((g.wanted?.stars ?? 0) > 0) { g.ui.toast('Lose the cops first'); return false; }
    if (def.char !== 'any' && def.char !== this.active) {
      if (!this.st.unlocked.includes(def.char)) return false;
      if (replay) this.protagonists.setActiveNow(def.char);
      else { g.ui.toast(`This is ${CHARS[def.char].nick}'s job: switch with ${g.input.activeDevice === 'gamepad' ? 'D-pad ←' : 'Z'}`); return false; }
    }
    this.clearMarkers();
    this.hostiles.clear();
    this.drivers.clear();
    const run = new MissionRun(this, def);
    run.replay = replay;
    this.mission = run;
    this.record(def.id).plays++;
    run.begin();
    return true;
  }

  /** Replay a finished mission from the phone: fade to its start marker and run it again. */
  replay(def: MissionDef): void {
    const g = this.g;
    if (this.mission || this.cutscenes.active || this.protagonists.busy) return;
    if ((g.wanted?.stars ?? 0) > 0) { g.ui.toast('Lose the cops first'); return; }
    const w = this.place(def.start);
    this.fadeThrough(() => {
      if (def.char !== 'any' && this.active !== def.char) this.protagonists.setActiveNow(def.char);
      g.player!.teleport(w.x, w.z + 2, 0);
      g.world.city.warm(w.x, w.z);
      this.startMission(def, true);
    });
  }

  /** The player's choice from the failure screen, or a quit from the phone. */
  quitMission(): void {
    const run = this.mission;
    if (!run) return;
    run.quit();
  }

  /** Called by a run when it finishes in any way. */
  endMission(run: MissionRun): void {
    const g = this.g;
    if (run.state === 'passed') this.completeMission(run);
    else if (run.state === 'failed') this.showFail(run);
    else this.finishRun(run);
    g.ui.hudRoot.classList.remove('cin');
  }

  private finishRun(run: MissionRun): void {
    run.cleanup();
    this.hostiles.clear();
    this.drivers.clear();
    this.figures.clear('cut:');
    if (this.mission === run) this.mission = null;
    this.hud.setObjective(null, null);
    this.hud.setTimer(null);
    this.hud.clearSay();
    this.g.loop.timeScale = 1;
    this.markerKey = '';
  }

  private completeMission(run: MissionRun): void {
    const g = this.g, cm = g.commerce!;
    const def = run.def;
    const rec = this.record(def.id);
    const first = !rec.done;
    const medals = run.earned();
    const allGold = medals.length === def.gold.length && def.gold.length > 0;
    rec.done = true;
    rec.skipped = false;
    const t = Math.round(run.stats.time);
    rec.best = rec.best ? Math.min(rec.best, t) : t;
    for (const m of medals) if (!rec.medals.includes(m)) rec.medals.push(m);
    const payout = Math.round(run.stats.extra.payout ?? 0);
    const pay = (def.noReward ? 0 : run.replay ? Math.floor(def.reward / 2) : first ? def.reward : Math.floor(def.reward / 2)) + payout;
    if (pay > 0) cm.eco.earn(pay, `Mission: ${def.title}`);
    this.finishRun(run);
    if (first) def.unlock?.(this);
    g.wanted?.clear();
    this.protagonists.applyPassives();
    cm.refreshMarkers();
    this.hud.showBanner('Mission passed', def.title.toUpperCase(), pay ? `+${money(pay)}` : '', 'good', 4);
    void cm.save(cm.slot ?? 1, true);
    // a summary card
    const goldRows = def.gold.map((d) => ({ d, ok: medals.includes(d.id) }));
    const best = def.gold.length && goldRows.every((r) => rec.medals.includes(r.d.id));
    void allGold; void best;
    setTimeout(() => { if (!this.mission) cm.open(this.summaryPage(def, run, pay, goldRows.map((r) => ({ label: r.d.label, ok: r.ok })))); }, 1200);
  }

  private summaryPage(def: MissionDef, run: MissionRun, pay: number, gold: { label: string; ok: boolean }[]): Page {
    const stars = gold.filter((x) => x.ok).length;
    return {
      title: 'Mission passed',
      kicker: def.title,
      hideMoney: false,
      hints: 'Enter  continue',
      render: (host) => {
        const t = Math.round(run.stats.time);
        host.body.append(
          h('div', 'st-block', h('h3', '', `${'★'.repeat(stars)}${'☆'.repeat(gold.length - stars)}  ${stars === gold.length && gold.length ? 'Gold medal' : 'Gold objectives'}`), h('p', '', run.retried ? 'Gold needs a run without retries.' : 'Complete all of them in one run for a gold medal.')),
          ...gold.map((x) => row({ label: x.label, right: x.ok ? '★' : '☆', selected: x.ok })),
          section('Result'),
          row({ label: 'Time', right: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` }),
          row({ label: 'Reward', right: pay ? money(pay) : '—' }),
          row({ label: 'Accuracy', right: run.stats.shots ? `${Math.round(run.stats.accuracy * 100)}%` : '—' }),
          ...(run.stats.extra.gross !== undefined ? [section('The split'), row({ label: 'Total take', right: money(run.stats.extra.gross) }), row({ label: 'Crew cuts', right: `−${money(run.stats.extra.cuts ?? 0)}` }), row({ label: 'Your share', right: money(run.stats.extra.payout ?? 0), selected: true })] : []),
          btn('Continue', 'primary', () => host.close()),
        );
      },
    };
  }

  private showFail(run: MissionRun): void {
    const g = this.g, cm = g.commerce!;
    const rec = this.record(run.def.id);
    rec.fails++;
    const fails = rec.fails;
    let handled = false;
    this.hud.setObjective(null, null);
    this.hud.setTimer(null);
    this.g.loop.timeScale = 1;
    this.protagonists.endAbility();
    this.hostiles.hold = true;
    const page: Page = {
      title: 'Mission failed',
      kicker: run.failReason,
      hints: 'Choose how to continue',
      onClose: () => { if (!handled) { handled = true; this.quitMission2(run); } },
      render: (host) => {
        const cp = run.stage > 0 || true;
        host.body.append(
          row({ label: 'Retry from checkpoint', sub: run.stage > 0 ? `Stage ${run.stage + 1}` : 'Start of the mission', onClick: () => { handled = true; host.close(); this.retry(run, false); } }),
          row({ label: 'Restart mission', sub: 'From the very beginning', onClick: () => { handled = true; host.close(); this.retry(run, true); } }),
          ...(fails >= 3 ? [row({ label: 'Skip mission', sub: 'Move the story on, with no reward or medal', onClick: () => { handled = true; host.close(); this.skipMission(run); } })] : []),
          row({ label: 'Quit mission', sub: 'Back to the city', onClick: () => { handled = true; host.close(); this.quitMission2(run); } }),
          h('p', 'm-info', fails >= 3 ? 'You can skip this one.' : `Failed ${fails} time${fails === 1 ? '' : 's'}: skip becomes available after three.`),
        );
        void cp;
      },
    };
    setTimeout(() => { if (this.mission === run) cm.open(page); }, 600);
  }

  private retry(run: MissionRun, full: boolean): void {
    const g = this.g;
    this.hostiles.hold = false;
    if (full) {
      const def = run.def;
      run.cleanup();
      this.hostiles.clear();
      this.drivers.clear();
      this.mission = null;
      g.wanted?.clear();
      // back to the start marker, then run it again
      const w = this.place(def.start);
      this.fadeThrough(() => {
        if (def.char !== 'any' && this.active !== def.char) this.protagonists.setActiveNow(def.char);
        g.player!.teleport(w.x, w.z + 2, 0);
        g.combat!.vitals.reset();
        this.startMission(def, run.replay);
      });
      return;
    }
    this.fadeThrough(() => run.restoreCheckpoint());
  }

  private quitMission2(run: MissionRun): void {
    this.hostiles.hold = false;
    run.state = 'quit';
    this.finishRun(run);
    this.g.wanted?.clear();
    this.hud.showBanner('', 'Mission abandoned', run.def.title, 'neutral', 2.5);
  }

  private skipMission(run: MissionRun): void {
    const def = run.def;
    const rec = this.record(def.id);
    const first = !rec.done;
    rec.done = true;
    rec.skipped = true;
    this.hostiles.hold = false;
    this.finishRun(run);
    if (first) def.unlock?.(this);
    this.g.wanted?.clear();
    this.g.commerce!.refreshMarkers();
    this.hud.showBanner('Mission skipped', def.title.toUpperCase(), 'The story moves on', 'neutral', 3);
  }

  // ------------------------------------------------------------------------------------------------ markers

  private clearMarkers(): void {
    for (const id of this.markerIds.values()) this.beacons.remove(id);
    this.markerIds.clear();
    this.markerKey = '';
  }

  private syncMarkers(): void {
    const st = this.st;
    const list = MISSIONS.filter((d) => this.available(d));
    const heistKey = this.heists.markerKey();
    const key = `${st.active}|${list.map((d) => d.id).join(',')}|${heistKey}`;
    if (key === this.markerKey) return;
    this.markerKey = key;
    this.clearMarkers();
    for (const d of list) {
      const w = this.place(d.start);
      const mine = d.char === 'any' || d.char === st.active;
      const color = d.char === 'any' ? '#ffd166' : CHARS[d.char].color;
      const glyph = d.char === 'any' ? '★' : CHARS[d.char].nick[0]!;
      const id = this.beacons.add(w.x, w.z, { color: mine ? color : '#6c7183', glyph, name: d.title + (mine ? '' : ` (${CHARS[d.char as CharId].nick})`), r: 3.2, tall: mine ? 14 : 6 });
      this.markerIds.set(d.id, id);
    }
    this.heists.addMarkers(this.markerIds);
  }

  // ------------------------------------------------------------------------------------------------ per frame

  fixedUpdate(dt: number): void {
    this.drivers.fixedUpdate(dt);
  }

  update(dt: number): void {
    const g = this.g;
    if (!this.ready || !g.player) return;
    this.hud.update(dt);
    this.hostiles.update();
    this.cutscenes.update(dt);
    this.protagonists.update(dt);
    this.protagonists.padNav();
    this.markerT -= dt;
    if (!this.mission && !this.cutscenes.active) {
      if (this.markerT <= 0) { this.markerT = 0.5; this.syncMarkers(); }
    } else if (this.markerIds.size) this.clearMarkers();
    this.mission?.tick(dt);
    this.queueT -= dt;
    if (this.queue.length && this.queueT <= 0 && g.state === 'playing' && !g.commerce!.modal.active && !this.cutscenes.active && !this.mission) { this.queue.shift()!(); this.queueT = 4.5; }
    this.heists.update(dt);
    this.beacons.update(dt, g.player.pos.x, g.player.pos.z);
    this.updatePrompt();
  }

  /** The player's position for markers: their car if driving. */
  private updatePrompt(): void {
    const g = this.g;
    this.prompt = null;
    this.near = null;
    if (this.mission || this.cutscenes.active || this.protagonists.busy || g.combat?.flow || g.piloting?.busy || g.skydive?.active) return;
    const drv = g.driving;
    const car = drv && drv.mode === 'driving' ? drv.vehicle : null;
    if (drv && (drv.mode === 'entering' || drv.mode === 'exiting')) return;
    const pos = car ? car.position : g.player!.pos;
    if (car && Math.abs(car.speedKmh) > 6) return;
    for (const d of MISSIONS) {
      if (!this.markerIds.has(d.id)) continue;
      const w = this.place(d.start);
      if (Math.hypot(w.x - pos.x, w.z - pos.z) < (car ? 7 : 3.4)) {
        const mine = d.char === 'any' || d.char === this.active;
        this.near = { kind: 'mission', def: d };
        this.prompt = mine ? `Start: ${d.title}` : `${d.title}: switch to ${CHARS[d.char as CharId].nick}`;
        break;
      }
    }
    if (!this.near) {
      const hs = this.heists.nearBoard(pos.x, pos.z, car ? 7 : 3.4);
      if (hs) { this.near = { kind: 'heist', id: hs.id }; this.prompt = hs.prompt; }
    }
    if (this.near && g.input.pressed('interact')) {
      g.input.swallow('interact');
      if (this.near.kind === 'mission') this.startMission(this.near.def);
      else this.heists.openBoard(this.near.id);
    }
  }

  /** Last in the frame: cutscene and switch cameras take over. */
  applyCamera(cam: THREE.PerspectiveCamera, dt: number): void {
    if (this.protagonists.applyCamera(cam, dt)) return;
    this.cutscenes.applyCamera(cam);
  }

  private onKill(_p: unknown, _tag: string): void {
    if (this.mission) this.mission.stats.kills++;
  }
}
