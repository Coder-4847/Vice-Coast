import * as THREE from 'three';
import type { Story } from '../story/Story';
import { money } from '../economy/Economy';
import { terrainHeight, waterLevelAt } from '../world/Terrain';
import { h } from '../ui/dom';

interface Species { id: string; name: string; color: number; belly: number; s: number; walk: number; run: number; hp: number; value: number; sense: number; aggro: number; weight: number }
const SPECIES: Species[] = [
  { id: 'deer', name: 'mule deer', color: 0x8a6038, belly: 0xd8c4a0, s: 1, walk: 1.3, run: 11, hp: 55, value: 140, sense: 60, aggro: 0, weight: 5 },
  { id: 'boar', name: 'wild boar', color: 0x3e3129, belly: 0x5a4a3e, s: 0.62, walk: 1.1, run: 8.5, hp: 85, value: 120, sense: 45, aggro: 0.55, weight: 3 },
  { id: 'rabbit', name: 'jackrabbit', color: 0xa38c6c, belly: 0xe8dcc6, s: 0.24, walk: 0.9, run: 9, hp: 8, value: 30, sense: 30, aggro: 0, weight: 3 },
  { id: 'coyote', name: 'coyote', color: 0x9a7f5a, belly: 0xcbb592, s: 0.5, walk: 1.5, run: 10, hp: 45, value: 95, sense: 55, aggro: 0.7, weight: 2 },
  { id: 'cougar', name: 'mountain lion', color: 0xb08a5a, belly: 0xe2cfa8, s: 0.72, walk: 1.4, run: 12.5, hp: 95, value: 420, sense: 70, aggro: 1, weight: 0.5 },
];

export const HUNT = { lodge: { x: 1112, z: -1640 }, x: 1520, z: -1800, r: 460 };

interface Animal {
  sp: Species; g: THREE.Group; legs: THREE.Object3D[]; x: number; z: number; y: number; yaw: number; hp: number;
  state: 'graze' | 'walk' | 'alert' | 'flee' | 'charge' | 'dead'; t: number; tx: number; tz: number; speed: number; phase: number;
  hits: number; head: boolean; fall: number; buck: boolean; bite: number; __animal: true;
}

function buildAnimal(sp: Species, buck: boolean, mats: Map<number, THREE.MeshStandardMaterial>): { g: THREE.Group; legs: THREE.Object3D[] } {
  const mat = (c: number): THREE.MeshStandardMaterial => { let m = mats.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.92 }); mats.set(c, m); } return m; };
  const g = new THREE.Group();
  const s = sp.s;
  const box = (w: number, hh: number, d: number, c: number, x: number, y: number, z: number, rx = 0): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w * s, hh * s, d * s), mat(c));
    m.position.set(x * s, y * s, z * s); m.rotation.x = rx; m.castShadow = true; g.add(m); return m;
  };
  const long = sp.id === 'rabbit' ? 0.7 : sp.id === 'cougar' || sp.id === 'coyote' ? 1.25 : 1.15;
  const bodyY = sp.id === 'boar' ? 0.8 : sp.id === 'rabbit' ? 0.55 : 1.05;
  box(0.48, 0.5, long, sp.color, 0, bodyY, 0);
  box(0.4, 0.14, long * 0.85, sp.belly, 0, bodyY - 0.26, 0);
  // neck and head
  if (sp.id === 'boar') { box(0.42, 0.42, 0.42, sp.color, 0, bodyY + 0.02, long / 2 + 0.16); box(0.2, 0.18, 0.2, 0x2a201a, 0, bodyY - 0.06, long / 2 + 0.44); box(0.04, 0.12, 0.04, 0xe8e0d0, 0.12, bodyY - 0.02, long / 2 + 0.4); box(0.04, 0.12, 0.04, 0xe8e0d0, -0.12, bodyY - 0.02, long / 2 + 0.4); }
  else if (sp.id === 'rabbit') { box(0.3, 0.3, 0.32, sp.color, 0, bodyY + 0.25, long / 2 + 0.05); box(0.07, 0.42, 0.05, sp.color, 0.08, bodyY + 0.6, long / 2); box(0.07, 0.42, 0.05, sp.color, -0.08, bodyY + 0.6, long / 2); }
  else {
    box(0.2, 0.5, 0.2, sp.color, 0, bodyY + 0.36, long / 2 - 0.02, -0.5);
    box(0.24, 0.24, 0.42, sp.color, 0, bodyY + 0.62, long / 2 + 0.16);
    box(0.06, 0.16, 0.05, sp.color, 0.1, bodyY + 0.8, long / 2 + 0.04); box(0.06, 0.16, 0.05, sp.color, -0.1, bodyY + 0.8, long / 2 + 0.04);
    if (buck) for (const sx of [-1, 1]) { box(0.035, 0.42, 0.035, 0xd8c8a8, sx * 0.1, bodyY + 1.0, long / 2 + 0.08); box(0.035, 0.035, 0.3, 0xd8c8a8, sx * 0.13, bodyY + 1.14, long / 2 + 0.18); box(0.035, 0.22, 0.035, 0xd8c8a8, sx * 0.16, bodyY + 1.18, long / 2 - 0.02); }
  }
  // tail
  box(0.08, 0.08, sp.id === 'cougar' ? 0.7 : 0.18, sp.id === 'deer' ? 0xf0ece0 : sp.color, 0, bodyY + 0.12, -long / 2 - (sp.id === 'cougar' ? 0.3 : 0.05), sp.id === 'cougar' ? 0.5 : -0.4);
  // legs hang from pivots so they can swing
  const legs: THREE.Object3D[] = [];
  const legLen = bodyY - 0.05;
  for (const [lx, lz] of [[0.16, long / 2 - 0.12], [-0.16, long / 2 - 0.12], [0.16, -long / 2 + 0.12], [-0.16, -long / 2 + 0.12]] as [number, number][]) {
    const pivot = new THREE.Group();
    pivot.position.set(lx * s, (bodyY - 0.1) * s, lz * s);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, legLen * s, 0.11 * s), mat(sp.id === 'boar' ? 0x2a201a : sp.color));
    leg.position.y = (-legLen / 2) * s;
    leg.castShadow = true;
    pivot.add(leg);
    g.add(pivot);
    legs.push(pivot);
  }
  return { g, legs };
}

/** The Kestrel hunting grounds: animals with senses, a rifle from the lodge and pelts for cash. */
export class Hunting {
  active = false;
  readonly animals: Animal[] = [];
  private readonly mats = new Map<number, THREE.MeshStandardMaterial>();
  private readonly hud: HTMLElement;
  private readonly info: HTMLElement;
  private readonly hint: HTMLElement;
  private pelts = 0;
  private earned = 0;
  private spawnT = 0;
  private registered = new Set<THREE.Material>();

  constructor(private readonly s: Story) {
    this.info = h('div', 'ps-info', '');
    this.hint = h('div', 'ps-hint', '');
    this.hud = h('div', 'ps-hud hunt is-hidden', h('div', 'ps-title', 'Hunting'), this.info, this.hint);
    s.g.ui.hudRoot.append(this.hud);
  }

  inGrounds(x: number, z: number, pad = 0): boolean { return Math.hypot(x - HUNT.x, z - HUNT.z) < HUNT.r + pad; }

  start(): void {
    const g = this.s.g;
    this.active = true;
    this.pelts = 0; this.earned = 0;
    const w = g.weapon;
    if (w) {
      if (w.inv.rifle.ammo + w.inv.rifle.reserve < 20) w.give('rifle', 40);
      w.select('rifle');
    }
    this.hud.classList.remove('is-hidden');
    this.s.hud.showBanner('Hunting', 'Kestrel hunting grounds', 'Crouch to get close · clean shots pay more', 'neutral', 3.5);
    this.spawnT = 0;
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.hud.classList.add('is-hidden');
    for (const a of this.animals) this.s.g.world.scene.remove(a.g);
    this.animals.length = 0;
    if (this.pelts) this.s.g.ui.toast(`Hunt over: ${this.pelts} pelt${this.pelts === 1 ? '' : 's'}, ${money(this.earned)}`);
  }

  private spawn(): void {
    const g = this.s.g;
    const p = g.player!.pos;
    const total = SPECIES.reduce((s, sp) => s + sp.weight, 0);
    let r = Math.random() * total;
    let sp = SPECIES[0]!;
    for (const q of SPECIES) { r -= q.weight; if (r <= 0) { sp = q; break; } }
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 160;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (!this.inGrounds(x, z) || terrainHeight(x, z) < waterLevelAt(x, z) + 0.4) continue;
      const buck = sp.id === 'deer' && Math.random() < 0.4;
      const { g: grp, legs } = buildAnimal(sp, buck, this.mats);
      for (const m of this.mats.values()) if (!this.registered.has(m)) { g.world.rig.register(m); this.registered.add(m); }
      const an: Animal = { sp, g: grp, legs, x, z, y: g.world.heightAt(x, z), yaw: Math.random() * 6.28, hp: sp.hp * (buck ? 1.2 : 1), state: 'graze', t: 2 + Math.random() * 5, tx: x, tz: z, speed: 0, phase: 0, hits: 0, head: false, fall: 0, buck, bite: 0, __animal: true };
      g.world.scene.add(grp);
      this.animals.push(an);
      return;
    }
  }

  /** A gunshot: everything nearby bolts (and the brave ones come for you). */
  heard(x: number, z: number): void {
    const p = this.s.g.player!.pos;
    for (const a of this.animals) {
      if (a.state === 'dead' || Math.hypot(a.x - x, a.z - z) > 160) continue;
      const dp = Math.hypot(a.x - p.x, a.z - p.z);
      a.state = a.sp.aggro > 0 && dp < 30 && Math.random() < a.sp.aggro ? 'charge' : 'flee';
      a.t = 6 + Math.random() * 5;
    }
  }

  rayHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): { t: number; target: { animal: Animal; head: boolean } } | null {
    let best: { t: number; target: { animal: Animal; head: boolean } } | null = null;
    const test = (cx: number, cy: number, cz: number, r: number): number => {
      const lx = cx - ox, ly = cy - oy, lz = cz - oz;
      const tc = lx * dx + ly * dy + lz * dz;
      if (tc < 0) return -1;
      const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
      if (d2 > r * r) return -1;
      return tc - Math.sqrt(r * r - d2);
    };
    for (const a of this.animals) {
      if (a.state === 'dead') continue;
      const s = a.sp.s, fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
      if (Math.abs(a.x - ox) > max + 5 || Math.abs(a.z - oz) > max + 5) continue;
      const by = a.y + (a.sp.id === 'boar' ? 0.8 : a.sp.id === 'rabbit' ? 0.5 : 1.0) * s;
      const hy = a.sp.id === 'boar' ? by : by + 0.6 * s;
      const th = test(a.x + fx * 0.75 * s, hy, a.z + fz * 0.75 * s, 0.2 * s + 0.04);
      if (th > 0 && th < max && (!best || th < best.t)) best = { t: th, target: { animal: a, head: true } };
      for (const k of [-0.3, 0.3]) {
        const tb = test(a.x + fx * k * s, by, a.z + fz * k * s, 0.38 * s + 0.05);
        if (tb > 0 && tb < max && (!best || tb < best.t)) best = { t: tb, target: { animal: a, head: false } };
      }
    }
    return best;
  }

  hurt(target: { animal: Animal; head: boolean }, dmg: number): void {
    const a = target.animal;
    if (a.state === 'dead') return;
    a.hits++;
    a.hp -= dmg * (target.head ? 3 : 1);
    if (a.hp <= 0) { a.state = 'dead'; a.head = target.head; a.fall = 0; this.s.g.audio.sport('groan', 0.25, { x: a.x, y: a.y + 1, z: a.z }); return; }
    const p = this.s.g.player!.pos;
    a.state = a.sp.aggro > 0.5 && Math.hypot(a.x - p.x, a.z - p.z) < 40 ? 'charge' : 'flee';
    a.t = 8;
  }

  /** A dead animal close enough to skin. */
  offer(): { text: string; go: () => void } | null {
    if (!this.active) return null;
    const p = this.s.g.player!.pos;
    for (const a of this.animals) {
      if (a.state !== 'dead' || a.fall < 1 || Math.hypot(a.x - p.x, a.z - p.z) > 2.6) continue;
      return { text: `Skin the ${a.buck ? 'buck' : a.sp.name}`, go: () => this.skin(a) };
    }
    return null;
  }

  private skin(a: Animal): void {
    const g = this.s.g;
    const clean = a.head || a.hits === 1;
    const value = Math.round(a.sp.value * (a.buck ? 1.45 : 1) * (clean ? 1.3 : 1));
    g.commerce!.eco.earn(value, 'Pelt');
    this.pelts++; this.earned += value;
    this.s.actWin('pastime.hunt');
    const rec = this.s.st.acts['pastime.hunt']!;
    rec.ext['sp:' + a.sp.id] = (rec.ext['sp:' + a.sp.id] ?? 0) + 1;
    this.s.hud.showBanner(clean ? 'Clean kill' : 'Pelt', a.buck ? 'Mule deer buck' : a.sp.name[0]!.toUpperCase() + a.sp.name.slice(1), `+${money(value)}`, 'good', 2.6);
    g.world.scene.remove(a.g);
    this.animals.splice(this.animals.indexOf(a), 1);
  }

  update(dt: number): void {
    if (!this.active) return;
    const g = this.s.g;
    const pl = g.player!;
    const p = pl.pos;
    const inCar = g.driving?.mode !== 'foot';
    const pos = inCar && g.driving?.vehicle ? g.driving.vehicle.position : p;
    if (!this.inGrounds(pos.x, pos.z, 160) || g.combat?.vitals.dead) { this.stop(); return; }
    this.info.textContent = `${this.pelts} pelt${this.pelts === 1 ? '' : 's'} · ${money(this.earned)}`;
    const t = this.inGrounds(pos.x, pos.z) ? 'Crouch and move slowly. Leave the grounds to finish.' : 'Leaving the hunting grounds…';
    if (this.hint.textContent !== t) this.hint.textContent = t;
    this.spawnT -= dt;
    const live = this.animals.filter((a) => a.state !== 'dead').length;
    if (this.spawnT <= 0 && live < 9 && this.inGrounds(pos.x, pos.z)) { this.spawn(); this.spawnT = 2.5; }
    const crouch = pl.crouchBlend > 0.5, sprint = pl.sprinting;
    const senseMul = inCar ? 1.6 : crouch ? 0.45 : sprint ? 1.5 : pl.moving ? 1 : 0.7;
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i]!;
      const dp = Math.hypot(a.x - pos.x, a.z - pos.z);
      if (dp > 330) { g.world.scene.remove(a.g); this.animals.splice(i, 1); continue; }
      a.t -= dt;
      let want = 0;
      let face = a.yaw;
      switch (a.state) {
        case 'graze':
          if (a.t <= 0) { a.state = 'walk'; const ang = Math.random() * 6.28; a.tx = a.x + Math.cos(ang) * 20; a.tz = a.z + Math.sin(ang) * 20; a.t = 12; }
          if (dp < a.sp.sense * senseMul) { a.state = 'alert'; a.t = 0.7 + Math.random() * 0.8; }
          break;
        case 'walk':
          want = a.sp.walk; face = Math.atan2(a.tx - a.x, a.tz - a.z);
          if (Math.hypot(a.tx - a.x, a.tz - a.z) < 1.5 || a.t <= 0) { a.state = 'graze'; a.t = 3 + Math.random() * 6; }
          if (dp < a.sp.sense * senseMul) { a.state = 'alert'; a.t = 0.6 + Math.random() * 0.8; }
          break;
        case 'alert':
          face = Math.atan2(pos.x - a.x, pos.z - a.z);
          if (a.t <= 0) { a.state = a.sp.aggro > 0 && dp < 28 && Math.random() < a.sp.aggro ? 'charge' : 'flee'; a.t = 7 + Math.random() * 4; }
          break;
        case 'flee':
          want = a.sp.run; face = Math.atan2(a.x - pos.x, a.z - pos.z) + Math.sin(a.phase * 0.05) * 0.4;
          if (a.t <= 0 && dp > a.sp.sense * 1.5) { a.state = 'graze'; a.t = 4; }
          break;
        case 'charge':
          want = a.sp.run * 0.85; face = Math.atan2(pos.x - a.x, pos.z - a.z);
          a.bite -= dt;
          if (dp < 1.9 && !inCar) {
            want = 0;
            if (a.bite <= 0) { a.bite = 1.1; g.combat?.vitals.hurt(a.sp.id === 'cougar' ? 28 : a.sp.id === 'boar' ? 18 : 12, a.x, a.z); g.audio.sport('groan', 0.4, { x: a.x, y: a.y + 0.8, z: a.z }); }
          }
          if (a.hp < a.sp.hp * 0.35 || a.t <= 0) { a.state = 'flee'; a.t = 8; }
          break;
        case 'dead':
          a.fall = Math.min(1, a.fall + dt * 2.2);
          a.g.rotation.z = a.fall * Math.PI / 2;
          a.g.position.y = a.y + a.fall * 0.25 * a.sp.s;
          continue;
      }
      // turn, then move (avoiding water)
      let dy = face - a.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      a.yaw += Math.max(-dt * 5, Math.min(dt * 5, dy));
      a.speed += (want - a.speed) * Math.min(1, dt * 4);
      const nx = a.x + Math.sin(a.yaw) * a.speed * dt, nz = a.z + Math.cos(a.yaw) * a.speed * dt;
      if (terrainHeight(nx, nz) > waterLevelAt(nx, nz) + 0.3) { a.x = nx; a.z = nz; } else a.yaw += 1.2 * dt * 3;
      a.y = g.world.heightAt(a.x, a.z);
      a.phase += a.speed * dt * (4.5 / Math.max(0.3, a.sp.s));
      const amp = Math.min(0.7, a.speed * 0.12);
      a.legs.forEach((l, k) => { l.rotation.x = Math.sin(a.phase + (k === 0 || k === 3 ? 0 : Math.PI)) * amp; });
      a.g.position.set(a.x, a.y, a.z);
      a.g.rotation.set(0, a.yaw, 0);
      // grazing animals dip their heads now and then
      if (a.state === 'graze') a.g.rotation.x = Math.sin(performance.now() / 900 + i) > 0.6 ? 0.12 : 0;
    }
  }
}
