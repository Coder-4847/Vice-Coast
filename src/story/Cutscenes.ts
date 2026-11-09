import * as THREE from 'three';
import type { Story } from './Story';
import { CHARS, VOICES } from './chars';
import { lookFor } from './Figures';
import { terrainHeight } from '../world/Terrain';
import type { CutsceneDef, Line, Shot, V3 } from './types';

const ease = (t: number): number => t * t * (3 - 2 * t);
export const lineSecs = (text: string): number => Math.max(1.7, 0.85 + text.length * 0.055);

/** Browser text-to-speech, one voice per character. Off unless the player turns it on. */
export class Speech {
  private voices: SpeechSynthesisVoice[] = [];
  private cache = new Map<string, SpeechSynthesisVoice | null>();

  constructor(private readonly on: () => boolean) {
    if (typeof speechSynthesis !== 'undefined') {
      const load = (): void => { this.voices = speechSynthesis.getVoices(); this.cache.clear(); };
      load();
      speechSynthesis.addEventListener?.('voiceschanged', load);
    }
  }

  private pick(prefer: 'f' | 'm'): SpeechSynthesisVoice | null {
    const key = prefer;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const en = this.voices.filter((v) => /^en/i.test(v.lang));
    const fem = /female|woman|zira|samantha|victoria|karen|moira|tessa|fiona|susan|hazel|aria|jenny/i;
    const pool = en.length ? en : this.voices;
    const m = pool.find((v) => (prefer === 'f') === fem.test(v.name)) ?? pool[0] ?? null;
    this.cache.set(key, m);
    return m;
  }

  say(who: string, text: string): void {
    if (!this.on() || typeof speechSynthesis === 'undefined' || !text) return;
    const v = VOICES[who];
    if (!v || !v.name) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = v.pitch;
      u.rate = v.rate;
      u.volume = 0.9;
      const voice = this.pick(v.prefer);
      if (voice) u.voice = voice;
      speechSynthesis.speak(u);
    } catch { /* speech is optional */ }
  }

  stop(): void {
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch { /* ignore */ }
  }
}

interface Saved { weaponDrawn: boolean; fov: number }

/**
 * Real-time cutscenes: the scene is staged in the live world with pedestrian-drawn actors, shot with scripted camera
 * moves under a letterbox, and subtitled line by line. Anything can be skipped.
 */
export class Cutscenes {
  active = false;
  private def: CutsceneDef | null = null;
  private shotI = -1;
  private t = 0;
  private dur = 1;
  private lines: { line: Line; at: number; dur: number }[] = [];
  private lineI = -1;
  private ax = 0; private az = 0; private h = 0;
  private gy = 0;
  private saved: Saved | null = null;
  private skipT = 0;
  private fromPos = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private onEnd: (() => void) | null = null;

  constructor(private readonly s: Story) {
    window.addEventListener('keydown', (e) => {
      if (!this.active || e.repeat) return;
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') { this.requestSkip(); e.preventDefault(); }
    });
  }

  /** Scene space [right, up, forward] → world. */
  private world(v: V3, out: THREE.Vector3): THREE.Vector3 {
    const c = Math.cos(this.h), sn = Math.sin(this.h);
    out.set(this.ax - c * v[0] + sn * v[2], this.gy + v[1], this.az + sn * v[0] + c * v[2]);
    return out;
  }

  private xz(a: [number, number]): { x: number; z: number } {
    const c = Math.cos(this.h), sn = Math.sin(this.h);
    return { x: this.ax - c * a[0] + sn * a[1], z: this.az + sn * a[0] + c * a[1] };
  }

  start(def: CutsceneDef, onEnd?: () => void): void {
    const s = this.s, g = s.g;
    this.end(true);
    this.def = def;
    this.onEnd = onEnd ?? null;
    this.active = true;
    if (g.driving && g.driving.mode !== 'foot') g.driving.abort();
    if (g.piloting && g.piloting.mode !== 'foot') g.piloting.abort();
    // anchor
    if (def.anchor === 'player') {
      this.ax = g.player!.pos.x; this.az = g.player!.pos.z;
      this.h = (def.heading !== undefined ? def.heading * Math.PI / 180 : 0) + g.player!.yaw + Math.PI;
    } else {
      const p = s.place(def.anchor);
      this.ax = p.x; this.az = p.z;
      this.h = (def.heading ?? 0) * Math.PI / 180;
    }
    this.gy = terrainHeight(this.ax, this.az);
    if (def.hour !== undefined) g.world.setHour(def.hour);
    // take over the game
    this.saved = { weaponDrawn: !!g.weapon?.isDrawn, fov: g.camera.fov };
    if (g.weapon?.isDrawn) g.weapon.toggleHolster();
    if (g.viewmodel) g.viewmodel.group.visible = false;
    g.player!.frozen = true;
    g.input.gameplayEnabled = false;
    if (g.combat) g.combat.vitals.invulnerable = true;
    s.hostiles.hold = true;
    s.hud.setBars(true);
    s.hud.setChromeHidden(true);
    s.hud.setSkipHint('Enter · Skip');
    g.ui.hudRoot.classList.add('cin');
    // actors
    const active = s.active;
    for (const a of def.actors) {
      const p = this.xz(a.at);
      const look = lookFor(a.look, 'char' in a.look && a.look.char === active ? g.commerce?.eco.p.outfit : undefined);
      const yaw = this.faceYaw(a.face, p.x, p.z, this.h);
      s.figures.spawn(`cut:${a.id}`, look, p.x, p.z, yaw, !!a.aim);
    }
    // the actual protagonist stays hidden (first person); the actor for them stands in
    this.shotI = -1;
    this.nextShot();
  }

  private faceYaw(face: number | string | undefined, x: number, z: number, base: number): number {
    if (face === undefined) return base;
    if (typeof face === 'number') return base + face * Math.PI / 180;
    if (face === 'cam') return Math.atan2(this.camPos.x - x, this.camPos.z - z);
    const o = this.s.figures.get(`cut:${face}`);
    return o ? Math.atan2(o.x - x, o.z - z) : base;
  }

  private nextShot(): void {
    const def = this.def;
    if (!def) return;
    this.shotI++;
    if (this.shotI >= def.shots.length) { this.end(false); return; }
    const shot: Shot = def.shots[this.shotI]!;
    this.t = 0;
    this.lines = [];
    let at = 0;
    for (const l of shot.lines ?? []) {
      const d = lineSecs(l.text);
      this.lines.push({ line: l, at, dur: d });
      at += d + 0.25;
    }
    this.dur = shot.dur ?? Math.max(2.2, at + 0.3);
    this.lineI = -1;
    this.world(shot.from, this.camPos);
    this.fromPos.copy(this.camPos);
    for (const a of shot.act ?? []) {
      const fig = this.s.figures;
      const id = `cut:${a.id}`;
      if (a.remove) { fig.remove(id); continue; }
      const p = fig.get(id);
      if (!p) continue;
      if (a.walkTo) { const w = this.xz(a.walkTo); fig.walkTo(id, w.x, w.z, 1.5); }
      if (a.face !== undefined) p.yaw = this.faceYaw(a.face, p.x, p.z, this.h);
      if (a.aim !== undefined) fig.setAim(id, a.aim);
    }
  }

  requestSkip(): void {
    if (!this.active) return;
    if (this.skipT > 0) { this.end(false); return; }
    this.skipT = 2.2;
    this.s.hud.setSkipHint('Press again to skip');
  }

  update(dt: number): void {
    if (!this.active || !this.def) return;
    const s = this.s;
    const nav = s.g.input.nav;
    if (nav.confirm || nav.back) this.requestSkip();
    if (this.skipT > 0) { this.skipT -= dt; if (this.skipT <= 0) s.hud.setSkipHint('Enter · Skip'); }
    this.t += dt;
    const shot = this.def.shots[this.shotI]!;
    // subtitles & speech
    const li = this.lines.findIndex((l, i) => this.t >= l.at && (i === this.lines.length - 1 || this.t < this.lines[i + 1]!.at));
    if (li >= 0 && li !== this.lineI) {
      this.lineI = li;
      const l = this.lines[li]!;
      s.say(l.line.who, l.line.text, l.dur + 0.2);
    }
    if (this.t >= this.dur) this.nextShot();
    void shot;
  }

  /** Called last in the frame: put the camera where the shot wants it. */
  applyCamera(cam: THREE.PerspectiveCamera): void {
    if (!this.active || !this.def) return;
    const shot = this.def.shots[this.shotI];
    if (!shot) return;
    const k = ease(Math.min(1, this.t / this.dur));
    const from = this.world(shot.from, this.tmp).clone();
    const to = this.world(shot.to ?? shot.from, new THREE.Vector3());
    cam.position.lerpVectors(from, to, k);
    const gy = terrainHeight(cam.position.x, cam.position.z) + 0.35;
    if (cam.position.y < gy) cam.position.y = gy;
    const l0 = this.world(shot.look, new THREE.Vector3());
    const l1 = this.world(shot.lookTo ?? shot.look, new THREE.Vector3());
    this.camLook.lerpVectors(l0, l1, k);
    this.camPos.copy(cam.position);
    cam.lookAt(this.camLook);
    const fov = shot.fov ?? 45;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }

  /** Finish (or abandon) the scene and hand control back. */
  end(silent: boolean): void {
    if (!this.active) return;
    const s = this.s, g = s.g;
    this.active = false;
    const def = this.def;
    this.def = null;
    s.hud.clearSay();
    s.speech.stop();
    s.hud.setBars(false);
    s.hud.setChromeHidden(false);
    s.hud.setSkipHint(null);
    g.ui.hudRoot.classList.remove('cin');
    // the player continues from where their actor ended up
    if (def) {
      const mine = def.actors.find((a) => 'char' in a.look && a.look.char === s.active);
      const me = mine ? s.figures.get(`cut:${mine.id}`) : undefined;
      if (me && g.player) g.player.teleport(me.x, me.z, me.yaw + Math.PI);
    }
    s.figures.clear('cut:');
    if (g.viewmodel) g.viewmodel.group.visible = true;
    if (g.player) g.player.frozen = false;
    if (g.combat) g.combat.vitals.invulnerable = false;
    s.hostiles.hold = false;
    if (!s.sceneBlocksInput()) g.input.gameplayEnabled = true;
    if (this.saved) { g.camera.fov = this.saved.fov; g.camera.updateProjectionMatrix(); }
    this.saved = null;
    const cb = this.onEnd;
    this.onEnd = null;
    void silent; void CHARS;
    cb?.();
  }
}
