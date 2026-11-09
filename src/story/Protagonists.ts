import * as THREE from 'three';
import type { Story } from './Story';
import { CHARS } from './chars';
import { lookFromOutfit } from './Figures';
import { avatar } from '../economy/Avatar';
import { glyphFor } from '../input/Glyphs';
import { h } from '../ui/dom';
import { CHAR_IDS, type CharId } from './types';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const easeIO = (t: number): number => t * t * (3 - 2 * t);

const ABILITY = {
  slipstream: { scale: 0.34, secs: 7, cost: 0.14, tint: 'rgba(255,159,67,0.16)' },
  overwatch: { scale: 0.4, secs: 7, cost: 0.14, tint: 'rgba(74,168,255,0.16)' },
  rampage: { scale: 1, secs: 9, cost: 0.11, tint: 'rgba(214,60,48,0.2)' },
} as const;

/**
 * The three playable characters: switching between them, the switch wheel, per-character state and the special abilities.
 * Characters you are not playing stand where you left them.
 */
export class Protagonists {
  busy = false;
  private phase: 'none' | 'up' | 'hold' | 'down' = 'none';
  private t = 0;
  private target: CharId = 'mack';
  private quick = false;
  private onDone: (() => void) | null = null;
  readonly wheel: HTMLElement;
  private readonly cards = new Map<CharId, HTMLButtonElement>();
  private sel = 0;
  wheelOpen = false;
  private readonly fx: HTMLElement;
  /** Ability running (seconds left), 0 when idle. */
  abilityT = 0;
  private fromPos = new THREE.Vector3();
  private fromQuat = new THREE.Quaternion();
  private skyPos = new THREE.Vector3();
  private skyQuat = new THREE.Quaternion();
  private readonly tmpCam = new THREE.PerspectiveCamera();

  constructor(private readonly s: Story) {
    const root = document.getElementById('ui')!;
    const hint = h('div', 'switch-hint', '');
    this.wheel = h('div', 'switch-wheel');
    this.wheel.setAttribute('role', 'dialog');
    this.wheel.setAttribute('aria-label', 'Switch character');
    this.wheel.append(hint);
    this.fx = h('div', 'ability-fx');
    root.append(this.wheel, this.fx);
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  // ------------------------------------------------------------------------------------------------- wheel

  private buildWheel(): void {
    const st = this.s.st;
    this.wheel.querySelectorAll('.sw-card').forEach((c) => c.remove());
    this.cards.clear();
    const hint = this.wheel.querySelector('.switch-hint') as HTMLElement;
    const g = this.s.g;
    const dev = g.input.activeDevice;
    const sw = glyphFor(g.input, 'character', dev);
    hint.textContent = dev === 'gamepad' ? 'D-pad / stick choose · A switch · B close' : dev === 'touch' ? 'Tap a character' : `← → choose · Enter switch · 1 2 3 · ${sw} or Esc close`;
    CHAR_IDS.forEach((id, i) => {
      const c = CHARS[id];
      const open = st.unlocked.includes(id);
      const outfit = id === st.active ? g.commerce!.eco.p.outfit : (st.chars[id]?.outfit ?? c.outfit);
      const card = h('button', `sw-card${id === st.active ? ' cur' : ''}${open ? '' : ' locked'}`,
        avatar(outfit),
        h('span', 'sw-name', c.nick),
        h('span', 'sw-role', open ? c.role : 'Not met yet'),
        open ? h('span', 'sw-skills', `Drive ${'★'.repeat(c.skills.driving)}${'☆'.repeat(5 - c.skills.driving)}\nAim ${'★'.repeat(c.skills.shooting)}${'☆'.repeat(5 - c.skills.shooting)}\nFly ${'★'.repeat(c.skills.flying)}${'☆'.repeat(5 - c.skills.flying)}`) : null,
      );
      (card.querySelector('.sw-skills') as HTMLElement | null)?.setAttribute('style', 'white-space:pre-line');
      card.type = 'button';
      card.style.setProperty('--c', c.color);
      card.addEventListener('click', () => { this.sel = i; this.confirm(); });
      this.cards.set(id, card);
      this.wheel.insertBefore(card, hint);
    });
    this.sel = Math.max(0, CHAR_IDS.indexOf(st.active));
    this.paint();
  }

  private paint(): void {
    CHAR_IDS.forEach((id, i) => this.cards.get(id)?.classList.toggle('sel', i === this.sel));
  }

  canSwitch(): string | null {
    const s = this.s, g = this.g;
    if (this.busy || s.cutscenes.active) return 'busy';
    if (s.st.unlocked.length < 2) return 'Only one character is available so far.';
    if (g.combat?.flow) return 'busy';
    if (s.mission?.noSwitch) return 'You can\'t switch characters right now.';
    if (g.piloting?.busy || g.skydive?.active) return 'You can\'t switch while flying.';
    return null;
  }

  private get g(): Story['g'] { return this.s.g; }

  toggleWheel(): void {
    if (this.wheelOpen) { this.closeWheel(); return; }
    const why = this.canSwitch();
    if (why) { if (why !== 'busy') this.s.g.ui.toast(why); return; }
    this.buildWheel();
    this.wheelOpen = true;
    this.wheel.classList.add('open');
    this.g.input.gameplayEnabled = false;
    this.g.loop.timeScale = 0.06;
    this.g.ui.hudRoot.classList.add('dim');
  }

  closeWheel(): void {
    if (!this.wheelOpen) return;
    this.wheelOpen = false;
    this.wheel.classList.remove('open');
    this.g.loop.timeScale = this.timeScaleNow();
    this.g.ui.hudRoot.classList.remove('dim');
    if (!this.s.sceneBlocksInput()) this.g.input.gameplayEnabled = true;
  }

  private confirm(): void {
    const id = CHAR_IDS[this.sel]!;
    if (!this.s.st.unlocked.includes(id)) return;
    this.closeWheel();
    if (id !== this.s.st.active) this.switchTo(id);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.wheelOpen || e.repeat) return;
    const k = e.code;
    const step = (d: number): void => { this.sel = (this.sel + d + 3) % 3; this.paint(); };
    if (k === 'ArrowLeft' || k === 'KeyA') step(-1);
    else if (k === 'ArrowRight' || k === 'KeyD') step(1);
    else if (k === 'Enter' || k === 'Space' || k === 'KeyE') this.confirm();
    else if (k === 'Digit1' || k === 'Digit2' || k === 'Digit3') { this.sel = Number(k.slice(5)) - 1; this.paint(); this.confirm(); }
    else if (k === 'Escape' || this.g.input.binding('character').kbm.includes(k)) this.closeWheel();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  /** Gamepad navigation of the wheel. */
  padNav(): void {
    if (!this.wheelOpen) return;
    const n = this.g.input.nav;
    if (n.x) { this.sel = (this.sel + (n.x > 0 ? 1 : -1) + 3) % 3; this.paint(); }
    if (n.confirm) this.confirm();
    if (n.back) this.closeWheel();
  }

  // ------------------------------------------------------------------------------------------------- switching

  /** Save the current character's state into the story. */
  private stash(): void {
    const s = this.s, g = this.g;
    const p = g.player!;
    const v = g.combat!.vitals;
    s.st.chars[s.st.active] = {
      x: p.pos.x, z: p.pos.z, yaw: p.yaw,
      health: v.health, armour: v.armour,
      outfit: { ...g.commerce!.eco.p.outfit },
    };
  }

  /** Where a character stands (saved position, or their front door the first time). */
  stateOf(id: CharId): { x: number; z: number; yaw: number; health: number; armour: number } {
    const have = this.s.st.chars[id];
    if (have) return have;
    const home = this.s.place(CHARS[id].start);
    return { x: home.x, z: home.z + 4, yaw: 0, health: 100, armour: 0 };
  }

  /** Put a character somewhere (mission set-ups). */
  put(id: CharId, x: number, z: number, yaw = 0): void {
    const have = this.s.st.chars[id] ?? { ...this.stateOf(id), outfit: { ...CHARS[id].outfit } };
    this.s.st.chars[id] = { ...have, x, z, yaw };
    if (id !== this.s.st.active) this.refreshFigure(id);
  }

  /** The stand-in figure for a character the player is not controlling. */
  refreshFigure(id: CharId): void {
    const s = this.s;
    const key = `char:${id}`;
    if (id === s.st.active || !s.st.unlocked.includes(id)) { s.figures.remove(key); return; }
    const c = this.stateOf(id);
    const outfit = s.st.chars[id]?.outfit ?? CHARS[id].outfit;
    // figures use the pedestrian yaw convention (forward = sin, cos); the player's is the opposite
    s.figures.spawn(key, lookFromOutfit(outfit), c.x, c.z, c.yaw + Math.PI);
  }

  refreshAllFigures(): void {
    for (const id of CHAR_IDS) this.refreshFigure(id);
  }

  /** Swap instantly: the player becomes `id` right where that character stands. */
  setActiveNow(id: CharId): void {
    const s = this.s, g = this.g;
    if (id === s.st.active && s.st.chars[id]) { this.refreshAllFigures(); return; }
    if (g.driving && g.driving.mode !== 'foot') g.driving.abort();
    if (s.st.chars[s.st.active]) this.stash();
    else this.stash();
    s.st.active = id;
    const c = this.stateOf(id);
    g.player!.teleport(c.x, c.z, c.yaw);
    const v = g.combat!.vitals;
    v.reset();
    v.health = Math.max(40, c.health);
    v.armour = c.armour;
    const outfit = s.st.chars[id]?.outfit ?? CHARS[id].outfit;
    g.commerce!.eco.p.outfit = { ...outfit };
    g.commerce!.applyOutfit();
    g.commerce!.eco.p.home = CHARS[id].home;
    this.applyPassives();
    this.refreshAllFigures();
    g.world.city.warm(c.x, c.z);
    g.commerce!.refreshMarkers();
  }

  /** Switch with the sky-high camera move. */
  switchTo(id: CharId, why?: string): void {
    const s = this.s, g = this.g;
    if (this.busy || id === s.st.active || !s.st.unlocked.includes(id)) return;
    void why;
    this.busy = true;
    this.target = id;
    this.t = 0;
    this.phase = 'up';
    this.quick = g.settings.data.accessibility.reduceMotion;
    this.endAbility();
    g.input.gameplayEnabled = false;
    g.player!.frozen = true;
    g.combat!.vitals.invulnerable = true;
    s.hostiles.hold = true;
    this.fromPos.copy(g.camera.position);
    this.fromQuat.copy(g.camera.quaternion);
    this.skyPos.set(g.camera.position.x, g.camera.position.y + 260, g.camera.position.z + 60);
    this.tmpCam.position.copy(this.skyPos);
    this.tmpCam.lookAt(g.player!.pos.x, g.player!.pos.y, g.player!.pos.z);
    this.skyQuat.copy(this.tmpCam.quaternion);
    g.audio.mech('magIn');
  }

  private finish(): void {
    const s = this.s, g = this.g;
    this.phase = 'none';
    this.busy = false;
    g.player!.frozen = false;
    g.combat!.vitals.invulnerable = false;
    s.hostiles.hold = false;
    if (!s.sceneBlocksInput()) g.input.gameplayEnabled = true;
    s.hud.showBanner('', CHARS[s.st.active].nick.toUpperCase(), CHARS[s.st.active].role, 'neutral', 2);
    this.onDone?.();
    this.onDone = null;
  }

  /** Per-frame transition: returns true while the camera is being driven. */
  applyCamera(cam: THREE.PerspectiveCamera, dt: number): boolean {
    if (this.phase === 'none') return false;
    const s = this.s;
    const up = this.quick ? 0.25 : 0.95, hold = 0.25, down = this.quick ? 0.25 : 1.15;
    this.t += dt;
    if (this.phase === 'up') {
      const k = easeIO(clamp(this.t / up, 0, 1));
      cam.position.lerpVectors(this.fromPos, this.skyPos, k);
      cam.quaternion.slerpQuaternions(this.fromQuat, this.skyQuat, k);
      cam.fov = 75 + 25 * k;
      cam.updateProjectionMatrix();
      if (this.t >= up) {
        this.setActiveNow(this.target);
        this.phase = 'hold';
        this.t = 0;
        // sit above the new character for a beat while the ground streams in
        const p = this.g.player!.pos;
        this.skyPos.set(p.x, p.y + 260, p.z + 60);
        this.tmpCam.position.copy(this.skyPos);
        this.tmpCam.lookAt(p.x, p.y, p.z);
        this.skyQuat.copy(this.tmpCam.quaternion);
        s.hud.setBars(true);
      }
    } else if (this.phase === 'hold') {
      cam.position.copy(this.skyPos);
      cam.quaternion.copy(this.skyQuat);
      if (this.t >= hold) { this.phase = 'down'; this.t = 0; }
    } else {
      // the player's own first-person camera is already on `cam`: descend into it
      const k = 1 - Math.pow(1 - easeIO(clamp(this.t / down, 0, 1)), 2);
      this.tmpCam.position.copy(cam.position);
      this.tmpCam.quaternion.copy(cam.quaternion);
      cam.position.lerpVectors(this.skyPos, this.tmpCam.position, k);
      cam.quaternion.slerpQuaternions(this.skyQuat, this.tmpCam.quaternion, k);
      cam.fov = 100 - 25 * k;
      cam.updateProjectionMatrix();
      if (this.t >= down) { s.hud.setBars(false); this.finish(); }
    }
    cam.updateMatrixWorld();
    return true;
  }

  // ------------------------------------------------------------------------------------------------- abilities & passives

  /** Per-character passive effects. */
  applyPassives(): void {
    const g = this.g;
    const c = g.combat;
    if (!c) return;
    const id = this.s.st.active;
    c.fallScale = id === 'teddy' ? 0.4 : 1;
    c.blastScale = id === 'teddy' ? 1.25 : 1;
    c.craftScale = id === 'imani' ? 0.6 : 1;
  }

  private timeScaleNow(): number {
    if (this.abilityT <= 0) return 1;
    const a = this.s.st.active;
    return a === 'mack' ? ABILITY.slipstream.scale : a === 'imani' ? ABILITY.overwatch.scale : ABILITY.rampage.scale;
  }

  get ability(): { name: string; id: string } {
    const a = CHARS[this.s.st.active].ability;
    return { name: a.name, id: a.id };
  }

  tryAbility(): void {
    const s = this.s, g = this.g;
    if (this.abilityT > 0 || this.busy || s.cutscenes.active || this.wheelOpen) return;
    const id = s.st.active;
    const def = CHARS[id].ability;
    const meter = s.st.meter[id];
    if (meter < 0.3) { g.ui.toast(`${def.name} is recharging`); return; }
    if (def.id === 'slipstream' && g.driving?.mode !== 'driving') { g.ui.toast('Slipstream needs a vehicle'); return; }
    if (def.id === 'overwatch' && (g.driving?.mode === 'driving' || g.piloting?.active)) { /* usable from aircraft too */ }
    this.abilityT = ABILITY[def.id].secs * meter / 1;
    this.abilityT = Math.max(2, this.abilityT);
    this.fx.style.background = `radial-gradient(circle, transparent 38%, ${ABILITY[def.id].tint} 100%)`;
    this.fx.classList.add('on');
    g.loop.timeScale = this.timeScaleNow();
    g.audio.mech('slide');
    this.applyAbility(true);
    g.ui.toast(def.name);
  }

  private applyAbility(on: boolean): void {
    const g = this.g;
    const id = this.s.st.active;
    const v = g.combat!.vitals;
    if (id === 'mack') { const car = g.driving?.vehicle; if (car) car.abilityGrip = on ? 1 : 0; }
    if (id === 'imani' && g.weapon) g.weapon.spreadScale = on ? 0.12 : 1;
    if (id === 'teddy') v.damageScale = on ? 0.3 : 1;
  }

  endAbility(): void {
    if (this.abilityT <= 0) return;
    this.abilityT = 0;
    const g = this.g;
    for (const car of g.vehicles?.vehicles ?? []) car.abilityGrip = 0;
    if (g.weapon) g.weapon.spreadScale = 1;
    g.combat!.vitals.damageScale = 1;
    g.loop.timeScale = this.wheelOpen ? 0.06 : 1;
    this.fx.classList.remove('on');
  }

  update(dt: number): void {
    const s = this.s, g = this.g;
    const id = s.st.active;
    const def = CHARS[id].ability;
    // dt arrives scaled by the loop's time factor? No: it is real time. Ability time is real seconds so slow-motion feels right.
    if (this.abilityT > 0) {
      s.st.meter[id] = Math.max(0, s.st.meter[id] - dt * ABILITY[def.id].cost);
      this.abilityT -= dt;
      if (def.id === 'slipstream') {
        const car = g.driving?.vehicle;
        if (g.driving?.mode !== 'driving') this.endAbility();
        else if (car) car.abilityGrip = 1;
      }
      if (this.abilityT <= 0 || s.st.meter[id] <= 0.001) this.endAbility();
    } else if (s.st.meter[id] < 1) {
      s.st.meter[id] = Math.min(1, s.st.meter[id] + dt * 0.022);
    }
    // inputs
    if (!this.busy && !s.cutscenes.active && g.state === 'playing') {
      if (g.input.pressed('character')) this.toggleWheel();
      if (g.input.pressed('ability')) { if (this.abilityT > 0) this.endAbility(); else this.tryAbility(); }
    }
    const show = s.st.unlocked.length > 0 && !s.cutscenes.active;
    s.hud.setMeter(show ? def.name : null, s.st.meter[id], this.abilityT > 0, CHARS[id].color, glyphFor(g.input, 'ability', g.input.activeDevice));
  }
}
