import type { Vehicle } from '../vehicles/Vehicle';
import type { Ped } from '../npc/Pedestrians';
import { HEAT } from '../combat/Wanted';
import { terrainHeight } from '../world/Terrain';
import { CHARS } from './chars';
import { lineSecs } from './Cutscenes';
import type { Driver } from './Drivers';
import type { HostileOpts } from './Hostiles';
import type { Story } from './Story';
import type { CharId, Line, Place } from './types';

export type Gen = Generator<void, void, void>;

export interface RunStats {
  /** Seconds of play (cutscenes do not count). */
  time: number;
  shots: number;
  hits: number;
  /** Health and armour lost to damage. */
  hpLost: number;
  kills: number;
  civKills: number;
  maxStars: number;
  alerts: number;
  /** 0–1; 1 when no shots were fired. */
  accuracy: number;
  /** Numbers scripts record for mission-specific gold objectives. */
  extra: Record<string, number>;
}

export interface GoldDef { id: string; label: string; test: (s: RunStats) => boolean }

/** Common gold-medal objectives. */
export const GOLD = {
  time: (secs: number): GoldDef => ({ id: 'time', label: `Under ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, test: (s) => s.time <= secs }),
  accuracy: (min: number): GoldDef => ({ id: 'accuracy', label: `${Math.round(min * 100)}% accuracy`, test: (s) => s.shots < 6 || s.accuracy >= min }),
  flawless: (maxLost: number): GoldDef => ({ id: 'flawless', label: maxLost <= 0 ? 'Take no damage' : `Lose under ${maxLost} health`, test: (s) => s.hpLost <= maxLost }),
  clean: (): GoldDef => ({ id: 'clean', label: 'Never wanted', test: (s) => s.maxStars === 0 }),
  noCivs: (): GoldDef => ({ id: 'civs', label: 'No civilian casualties', test: (s) => s.civKills === 0 }),
  stealth: (): GoldDef => ({ id: 'stealth', label: 'Never spotted', test: (s) => s.alerts === 0 }),
  lowStars: (n: number): GoldDef => ({ id: 'stars', label: `Under ${n} stars`, test: (s) => s.maxStars < n }),
};

export interface MissionDef {
  id: string;
  title: string;
  char: CharId | 'any';
  act: number;
  blurb: string;
  /** Cast id of whoever calls you. */
  giver?: string;
  start: Place;
  after?: string[];
  /** Hour of day to set when it begins. */
  hour?: number;
  stages: ((m: MissionRun) => Gen)[];
  gold: GoldDef[];
  reward: number;
  /** Runs once, the first time the mission is passed (or skipped). */
  unlock?: (s: Story) => void;
  /** A prep or heist piece: not started from a marker. */
  hidden?: boolean;
  /** Heist ids: stats are tracked as usual but the pay-out is the heist's. */
  noReward?: boolean;
  /** A repeatable side activity (see activities/defs.ts): never "done", pays out every time, counts toward the tracker. */
  activity?: string;
  /** Banner kicker instead of "Act N". */
  kicker?: string;
  /** No "mission passed" banner or summary card (the prologue cuts straight on). */
  noSummary?: boolean;
  /** Runs when the player abandons the mission from the failure screen. */
  onQuit?: (s: Story) => void;
  /** Extra availability test (e.g. a heist must be finished first). */
  gate?: (s: Story) => boolean;
  /** Data the activity wants to keep with the definition (race course, job parameters). */
  meta?: unknown;
}

interface Snap {
  stage: number;
  x: number; z: number; yaw: number;
  inVehicle: string | null;
  vehicles: { name: string; spec: string; x: number; z: number; yaw: number; hp: number; color?: string }[];
  char: CharId;
}

interface VehEntry { v: Vehicle; spec: string; color?: string; blip: number; driver: Driver | null }

/** Thrown into a stage to stop it. */
class Abort { constructor(readonly reason: string) {} }

/**
 * One play of a mission. Stages are generator functions: they `yield*` helpers that wait for things to happen
 * (reach a place, kill the gang, watch a cutscene) and the engine steps them once a frame. Every stage start is a
 * checkpoint; retrying rebuilds the world to that moment.
 */
export class MissionRun {
  stage = -1;
  gen: Gen | null = null;
  readonly stats: RunStats = { time: 0, shots: 0, hits: 0, hpLost: 0, kills: 0, civKills: 0, maxStars: 0, alerts: 0, accuracy: 1, extra: {} };
  state: 'running' | 'passed' | 'failed' | 'quit' = 'running';
  failReason = '';
  /** A retried run cannot earn gold. */
  retried = false;
  replay = false;
  /** Missions that use switching turn this off. */
  noSwitch = true;
  objText = '';
  objSub = '';
  private timerLeft = -1;
  private timerLabel = '';
  private timerFail = '';
  private readonly fails: { id: string; test: () => boolean; reason: string }[] = [];
  private readonly vehicles = new Map<string, VehEntry>();
  private readonly blips = new Map<string, number>();
  private cp: Snap | null = null;
  private lastHp = 0;
  private dying = 0;
  private dyingKind = '';
  private hitSeen = false;
  /** The gold objectives that are currently satisfied (for the HUD). */
  goldNow: boolean[] = [];
  tags = new Set<string>();
  /** Seconds this frame (cutscene frames included). */
  dt = 1 / 60;
  private readonly disposers: (() => void)[] = [];
  private readonly hooks: (() => void)[] = [];
  private readonly craftsMade = new Map<string, import('../craft/Craft').Craft>();

  constructor(readonly s: Story, readonly def: MissionDef) {}

  get g(): Story['g'] { return this.s.g; }
  get active(): CharId { return this.s.active; }

  // ------------------------------------------------------------------------------------------------ lifecycle

  begin(): void {
    const s = this.s, g = this.g;
    this.lastHp = g.combat!.vitals.health + g.combat!.vitals.armour;
    if (this.def.hour !== undefined) g.world.setHour(this.def.hour);
    this.goldNow = this.def.gold.map(() => true);
    g.wanted?.clear();
    this.startStage(0);
    s.hud.showBanner(this.def.kicker ?? (this.def.activity ? 'Side activity' : `Act ${this.def.act}`), this.def.title.toUpperCase(), CHARS[this.def.char === 'any' ? this.active : this.def.char].name, 'neutral', 3.2);
  }

  private startStage(i: number): void {
    this.stage = i;
    this.snapshot();
    this.gen = this.def.stages[i]!(this);
  }

  /** Remember where everything is so Retry can rebuild it. */
  private snapshot(): void {
    const g = this.g;
    const p = g.player!;
    const veh = [...this.vehicles.entries()].filter(([, e]) => !e.v.exploded).map(([name, e]) => {
      const f = _fwd(e.v);
      return { name, spec: e.spec, x: e.v.position.x, z: e.v.position.z, yaw: Math.atan2(-f.x, -f.z), hp: e.v.health, color: e.color };
    });
    const d = g.driving;
    let inV: string | null = null;
    if (d && d.mode === 'driving') for (const [name, e] of this.vehicles) if (e.v === d.vehicle) inV = name;
    this.cp = { stage: this.stage, x: p.pos.x, z: p.pos.z, yaw: p.yaw, inVehicle: inV, vehicles: veh, char: this.active };
  }

  /** Rebuild the world at the last checkpoint and run that stage again. */
  restoreCheckpoint(): void {
    const cp = this.cp;
    if (!cp) return;
    const s = this.s, g = this.g;
    this.retried = true;
    this.cleanup(false);
    s.hostiles.clear();
    s.drivers.clear();
    g.wanted?.clear();
    g.police?.release(true);
    this.state = 'running';
    this.failReason = '';
    this.dying = 0;
    if (s.active !== cp.char) s.protagonists.setActiveNow(cp.char);
    g.combat?.vitals.reset();
    g.player!.frozen = false;
    g.player!.teleport(cp.x, cp.z, cp.yaw);
    for (const v of cp.vehicles) {
      const veh = this.vehicle(v.name, v.spec, { x: v.x, z: v.z }, { yaw: v.yaw, color: v.color, blip: false });
      veh.health = Math.max(v.hp, 400);
    }
    if (cp.inVehicle) {
      const e = this.vehicles.get(cp.inVehicle);
      if (e) g.driving?.forceEnter(e.v);
    }
    this.lastHp = g.combat!.vitals.health + g.combat!.vitals.armour;
    this.gen = this.def.stages[cp.stage]!(this);
    this.stage = cp.stage;
  }

  /** Remove everything the mission put in the world. */
  cleanup(full = true): void {
    const s = this.s;
    for (const id of this.blips.values()) s.beacons.remove(id);
    this.blips.clear();
    for (const [, e] of this.vehicles) {
      if (e.blip) s.beacons.remove(e.blip);
      if (e.driver) s.drivers.stop(e.v);
      if (full) this.removeVehicle(e);
      else this.removeVehicle(e);
    }
    this.vehicles.clear();
    for (const d of this.disposers.splice(0)) d();
    this.fails.length = 0;
    this.hooks.length = 0;
    this.timerLeft = -1;
    s.hud.setTimer(null);
    s.hud.setObjective(null, null);
    s.clearWaypoint();
  }

  private removeVehicle(e: VehEntry): void {
    const g = this.g;
    if (g.driving?.vehicle === e.v && g.driving.mode !== 'foot') g.driving.abort();
    g.vehicles?.remove(e.v);
  }

  // ------------------------------------------------------------------------------------------------ per frame

  tick(dt: number): void {
    const s = this.s, g = this.g;
    if (this.state !== 'running') return;
    this.dt = dt;
    const vit = g.combat!.vitals;
    const cut = s.cutscenes.active;
    if (!cut) {
      this.stats.time += dt;
      if (this.timerLeft >= 0) {
        this.timerLeft -= dt;
        s.hud.setTimer(this.timerLabel, this.timerLeft, this.timerLeft < 20);
        if (this.timerLeft <= 0) this.fail(this.timerFail || 'You ran out of time.');
      }
    }
    // damage taken
    const hp = vit.health + vit.armour;
    if (hp < this.lastHp - 0.01) this.stats.hpLost += this.lastHp - hp;
    this.lastHp = hp;
    // accuracy: a hit marker appearing counts one hit
    const hm = g.weapon?.hitMarker ?? 0;
    if (hm > 0.12 && !this.hitSeen) { this.hitSeen = true; this.stats.hits++; } else if (hm < 0.04) this.hitSeen = false;
    const stars = g.wanted?.stars ?? 0;
    if (stars > this.stats.maxStars) this.stats.maxStars = stars;
    this.stats.accuracy = this.stats.shots > 0 ? Math.min(1, this.stats.hits / this.stats.shots) : 1;

    // dying fails the mission once the Wasted / Busted sequence has played
    if (g.combat?.flow) {
      this.dying = 1;
      this.dyingKind = g.combat.flow.kind;
      this.stats.maxStars = Math.max(this.stats.maxStars, stars);
      return;
    }
    if (this.dying === 1) { this.fail(this.dyingKind === 'wasted' ? 'You were killed.' : 'You were arrested.'); return; }
    for (const f of this.fails) if (f.test()) { this.fail(f.reason); return; }

    // per-frame hooks, then step the stage
    for (const h of this.hooks) h();
    if (this.gen) {
      try {
        const r = this.gen.next();
        if (r.done) this.nextStage();
      } catch (e) {
        if (e instanceof Abort) { this.fail(e.reason); return; }
        console.error('mission error', this.def.id, e);
        this.fail('Something went wrong in the mission script.');
        return;
      }
    }
    this.refreshHud();
  }

  private nextStage(): void {
    this.fails.length = 0;
    this.hooks.length = 0;
    if (this.stage + 1 >= this.def.stages.length) { this.pass(); return; }
    this.startStage(this.stage + 1);
    this.s.hud.showTip('Checkpoint', 2);
  }

  private refreshHud(): void {
    const gold = this.def.gold.map((d, i) => {
      const ok = !this.retried && d.test(this.stats);
      this.goldNow[i] = ok;
      return { label: d.label, done: ok };
    });
    this.s.hud.setObjective(`${this.def.title}`, this.objText || null, this.objSub, gold);
  }

  // ------------------------------------------------------------------------------------------------ end states

  pass(): void {
    if (this.state !== 'running') return;
    this.state = 'passed';
    this.s.endMission(this);
  }

  fail(reason: string): void {
    if (this.state !== 'running') return;
    this.state = 'failed';
    this.failReason = reason;
    this.gen = null;
    this.s.endMission(this);
  }

  quit(): void {
    if (this.state === 'passed') return;
    this.state = 'quit';
    this.gen = null;
    this.s.endMission(this);
  }

  /** Gold objectives earned on this run. */
  earned(): string[] {
    if (this.retried) return [];
    return this.def.gold.filter((d) => d.test(this.stats)).map((d) => d.id);
  }

  // ------------------------------------------------------------------------------------------------ script API

  objective(text: string, sub = ''): void { this.objText = text; this.objSub = sub; }

  say(who: string, text: string, secs = lineSecs(text)): void { this.s.say(who, text, secs); }

  tip(text: string, secs = 6): void { this.s.hud.showTip(text, secs); }

  flag(name: string, value: number | string | boolean = true): void { this.s.st.flags[name] = value; }

  /** Fail the mission if `test()` ever becomes true. */
  failIf(id: string, test: () => boolean, reason: string): void {
    this.fails.push({ id, test, reason });
  }

  /** A countdown that fails the mission when it runs out. */
  limit(label: string, secs: number, reason = 'You ran out of time.'): void {
    this.timerLabel = label; this.timerLeft = secs; this.timerFail = reason;
  }

  clearLimit(): void { this.timerLeft = -1; this.s.hud.setTimer(null); }

  get timeLeft(): number { return this.timerLeft; }

  clearFails(): void { this.fails.length = 0; }

  /** Run `fn` every frame until the end of this stage. */
  each(fn: () => void): void { this.hooks.push(fn); }

  clearRoute(): void { this.s.clearWaypoint(); }

  /** Take the pistol out if it is holstered. */
  draw(): void {
    const w = this.g.weapon;
    if (w && !w.isDrawn) w.toggleHolster();
  }

  /** Abort the whole mission from inside a stage. */
  abort(reason: string): never { throw new Abort(reason); }

  // ---- places ------------------------------------------------------------------------------------------------

  at(p: Place): { x: number; z: number } { return this.s.place(p); }

  /** A map blip and beam at a place. Returns a handle for `unblip`. */
  blip(key: string, p: Place, o: { color?: string; glyph?: string; name?: string; r?: number; tall?: number } = {}): { x: number; z: number } {
    this.unblip(key);
    const w = this.s.place(p);
    const id = this.s.beacons.add(w.x, w.z, { color: o.color ?? CHARS[this.active].color, glyph: o.glyph ?? '◎', name: o.name ?? this.objText, r: o.r ?? 2.8, tall: o.tall });
    this.blips.set(key, id);
    return w;
  }

  unblip(key: string): void {
    const id = this.blips.get(key);
    if (id !== undefined) { this.s.beacons.remove(id); this.blips.delete(key); }
  }

  /** Route the GPS to a place. */
  route(p: Place | null): void {
    if (!p) { this.s.clearWaypoint(); return; }
    const w = this.s.place(p);
    this.s.setWaypoint(w.x, w.z);
  }

  // ---- vehicles -----------------------------------------------------------------------------------------------

  /** Get-or-create a named mission vehicle. */
  vehicle(name: string, spec: string, p: Place, o: { yaw?: number; color?: string; blip?: boolean; glyph?: string } = {}): Vehicle {
    const have = this.vehicles.get(name);
    if (have && !have.v.exploded) return have.v;
    if (have) this.removeVehicle(have);
    const w = this.s.place(p, true);
    const yaw = o.yaw ?? this.s.roadYaw(w.x, w.z);
    const v = this.g.vehicles!.spawn(spec, w.x, w.z, yaw, o.color);
    const e: VehEntry = { v, spec, color: o.color, blip: 0, driver: null };
    if (o.blip !== false) e.blip = this.s.beacons.add(w.x, w.z, { color: '#4aa8ff', r: 2.2, tall: 6, glyph: o.glyph ?? '◈', name: name });
    this.vehicles.set(name, e);
    return v;
  }

  veh(name: string): Vehicle {
    const e = this.vehicles.get(name);
    if (!e) throw new Error(`no mission vehicle ${name}`);
    return e.v;
  }

  hasVeh(name: string): boolean { return this.vehicles.has(name); }

  /** Remove the pickup blip of a vehicle (once it is yours, or no longer matters). */
  unmark(name: string): void {
    const e = this.vehicles.get(name);
    if (e?.blip) { this.s.beacons.remove(e.blip); e.blip = 0; }
  }

  /** Let a scripted driver take the car to a target. */
  drive(name: string, target: () => { x: number; z: number } | null, o: { kmh?: number; aggressive?: boolean; arrive?: number; onArrive?: () => void } = {}): Driver {
    const e = this.vehicles.get(name)!;
    if (e.blip) this.unmark(name);
    e.driver = this.s.drivers.drive(e.v, { target, ...o });
    return e.driver;
  }

  /** Remove a named vehicle from the world. */
  dispose(name: string): void {
    const e = this.vehicles.get(name);
    if (!e) return;
    if (e.blip) this.s.beacons.remove(e.blip);
    if (e.driver) this.s.drivers.stop(e.v);
    this.removeVehicle(e);
    this.vehicles.delete(name);
  }

  playerIn(name: string): boolean {
    const d = this.g.driving;
    const e = this.vehicles.get(name);
    return !!(d && e && d.mode === 'driving' && d.vehicle === e.v);
  }

  playerInAnyCar(): boolean { return this.g.driving?.mode === 'driving'; }

  /** Is the player (or the car they drive) within `r` of a place? */
  near(p: Place, r: number): boolean {
    const w = this.s.place(p);
    const pos = this.playerPos();
    return Math.hypot(pos.x - w.x, pos.z - w.z) < r;
  }

  playerPos(): { x: number; z: number } {
    const g = this.g;
    const d = g.driving;
    const c = g.piloting?.active ? g.piloting.craft : null;
    const pos = c ? c.position : d && d.mode === 'driving' ? d.vehicle!.position : g.player!.pos;
    return { x: pos.x, z: pos.z };
  }

  /** Is the player flying this named craft? */
  playerFlying(name: string): boolean {
    const c = this.craftsMade.get(name);
    return !!c && !!this.g.piloting?.active && this.g.piloting.craft === c;
  }

  /** Spawn a boat, helicopter or plane for the mission and mark it. */
  craft(name: string, spec: string, p: Place, o: { yaw?: number; blip?: boolean } = {}): import('../craft/Craft').Craft {
    const have = this.craftsMade.get(name);
    if (have) return have;
    const w = this.s.place(p);
    const c = this.g.crafts!.spawn(spec, w.x, w.z, o.yaw ?? 0);
    this.craftsMade.set(name, c);
    if (o.blip !== false) this.blip('craft:' + name, w, { color: '#4aa8ff', glyph: '✈', name, r: 3 });
    return c;
  }

  craftOf(name: string): import('../craft/Craft').Craft { return this.craftsMade.get(name)!; }

  /** Give the player a weapon for the mission. */
  give(id: import('../player/Weapons').WeaponId, rounds = 90): void {
    const w = this.g.weapon;
    if (!w) return;
    w.give(id, rounds);
    if (!w.isDrawn) w.toggleHolster();
    w.select(id);
  }

  /** Something to clean up when the mission ends or restarts (ramps, props). */
  onCleanup(fn: () => void): void { this.disposers.push(fn); }

  // ---- generator helpers --------------------------------------------------------------------------------------

  *wait(secs: number): Gen {
    let t = 0;
    while (t < secs) { if (!this.s.cutscenes.active) t += 1 / 60; yield; }
  }

  *until(cond: () => boolean): Gen {
    while (!cond()) yield;
  }

  /** Go to a place. `vehicle`: arrive in that mission vehicle; `onFoot`: arrive on foot. */
  *goto(p: Place, text: string, o: { r?: number; vehicle?: string; onFoot?: boolean; sub?: string; key?: string; color?: string; glyph?: string } = {}): Gen {
    const key = o.key ?? 'goto';
    this.objective(text, o.sub ?? '');
    const w = this.blip(key, p, { color: o.color, glyph: o.glyph ?? '◎', name: text, r: o.onFoot ? 2.4 : 3.6 });
    this.s.setWaypoint(w.x, w.z);
    const r = o.r ?? (o.onFoot ? 3 : 7);
    while (true) {
      const here = this.near(p, r);
      const car = this.playerInAnyCar();
      const okVeh = o.vehicle ? this.playerIn(o.vehicle) : true;
      const okFoot = o.onFoot ? !car : true;
      if (here && okVeh && okFoot) break;
      this.objective(o.vehicle && !this.playerIn(o.vehicle) ? `Get back in the ${this.vehName(o.vehicle)}` : text, o.sub ?? '');
      yield;
    }
    this.unblip(key);
    this.s.clearWaypoint();
  }

  private vehName(name: string): string {
    const e = this.vehicles.get(name);
    return e ? (this.s.vehicleLabel(e.spec)) : 'vehicle';
  }

  /** Get into a named vehicle. */
  *enter(name: string, text?: string): Gen {
    const e = this.vehicles.get(name)!;
    this.objective(text ?? `Get in the ${this.vehName(name)}`);
    this.s.setWaypoint(e.v.position.x, e.v.position.z);
    while (!this.playerIn(name)) {
      if (e.blip) this.s.beacons.move(e.blip, e.v.position.x, e.v.position.z);
      yield;
    }
    this.unmark(name);
    this.s.clearWaypoint();
  }

  *cutscene(id: string): Gen {
    this.s.playCutscene(id);
    yield;
    while (this.s.cutscenes.active) yield;
  }

  /** Subtitled dialogue while the game keeps running. */
  *talk(lines: Line[]): Gen {
    for (const l of lines) {
      const secs = lineSecs(l.text);
      this.s.say(l.who, l.text, secs + 0.1);
      yield* this.wait(secs + 0.2);
    }
  }

  /** Spawn gunmen and wait until all are down. */
  *kill(tag: string, spawns: HostileOpts[], text: string, o: { sub?: string; blip?: boolean } = {}): Gen {
    const peds: Ped[] = [];
    for (const sp of spawns) {
      const w = this.s.snap(sp.x, sp.z);
      const p = this.s.hostiles.spawn({ ...sp, x: w.x, z: w.z, tag });
      if (p) peds.push(p);
    }
    this.tags.add(tag);
    const total = peds.length;
    this.objective(text, o.sub ?? '');
    while (this.s.hostiles.alive(tag) > 0) {
      this.objective(`${text} (${this.s.hostiles.alive(tag)} left)`, o.sub ?? '');
      yield;
    }
    void total;
    this.objective(text);
  }

  /** Raise the wanted level and wait for the police to lose you. */
  *escape(stars: number, text = 'Lose the cops'): Gen {
    const g = this.g;
    const p = this.playerPos();
    if (stars > 0) g.wanted?.report(HEAT[stars]! + 2, p.x, p.z, true);
    this.objective(text);
    yield* this.wait(1.5);
    while ((g.wanted?.stars ?? 0) > 0) yield;
  }

  /** Wait until a mission vehicle is wrecked. */
  *destroy(name: string, text: string): Gen {
    const e = this.vehicles.get(name)!;
    this.objective(text);
    while (!(e.v.exploded || e.v.health <= 0)) { if (e.blip) this.s.beacons.move(e.blip, e.v.position.x, e.v.position.z); yield; }
  }

  /** A short beat on foot at the checkpoint spot, e.g. after a cutscene. */
  *settle(): Gen { yield* this.wait(0.4); }

  /** Hold the interact key at a spot for `secs` seconds (lockpicks, drills, hacks). */
  *hold(p: Place, text: string, secs: number, o: { r?: number; key?: string; glyph?: string } = {}): Gen {
    const key = o.key ?? 'hold';
    this.blip(key, p, { color: '#ffd166', glyph: o.glyph ?? '✦', name: text, r: 1.5 });
    const label = this.s.interactKey();
    let prog = 0;
    while (prog < secs) {
      const near = this.near(p, o.r ?? 2.4) && !this.playerInAnyCar();
      const holding = near && this.g.input.down('interact');
      this.objective(text, near ? `Hold ${label}: ${Math.round((prog / secs) * 100)}%` : 'Move to the marker');
      if (holding) prog += this.dt;
      else if (near) prog = Math.max(0, prog - this.dt * 0.6);
      yield;
    }
    this.unblip(key);
  }

  /** Wait until the player is controlling `c` (telling them to switch if they are not). */
  *asChar(c: CharId, text: string, sub = ''): Gen {
    this.noSwitch = false;
    while (this.active !== c) {
      this.objective(`Switch to ${CHARS[c].nick} (${this.s.switchKey()})`, sub);
      yield;
    }
    this.objective(text, sub);
  }

  /** Fly or drive to a place and land / stop there. `r` is the radius, plane must be on the ground and slow. */
  *land(name: string, p: Place, text: string, r = 260): Gen {
    const c = this.craftsMade.get(name)!;
    const w = this.blip('land', p, { color: '#ffd166', glyph: '✈', name: text, r: 6 });
    this.s.setWaypoint(w.x, w.z);
    this.objective(text);
    while (true) {
      const d = Math.hypot(c.position.x - w.x, c.position.z - w.z);
      const grounded = c.wheels.length ? c.wheels.every((q) => q.onGround) : c.speedKmh < 3;
      if (d < r && grounded && c.speedKmh < 25) break;
      yield;
    }
    this.unblip('land');
    this.s.clearWaypoint();
  }

  *switchTo(c: CharId, why?: string): Gen {
    if (this.active === c) return;
    this.s.protagonists.switchTo(c, why);
    yield;
    while (this.s.protagonists.busy) yield;
    this.snapshot();
  }

  /** Where on the ground a position sits (convenience for scripts). */
  ground(x: number, z: number): number { return terrainHeight(x, z); }
}

import * as THREE from 'three';
const __f = new THREE.Vector3();
function _fwd(v: Vehicle): THREE.Vector3 { return __f.set(0, 0, -1).applyQuaternion(v.quaternion); }
