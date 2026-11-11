import * as THREE from 'three';
import type { Story } from '../story/Story';
import { money } from '../economy/Economy';
import { terrainHeight, waterLevelAt } from '../world/Terrain';
import { h } from '../ui/dom';

export interface FishDef { name: string; min: number; max: number; perKg: number; fight: number; rare: number }

const SEA: FishDef[] = [
  { name: 'Mackerel', min: 0.4, max: 1.4, perKg: 9, fight: 0.6, rare: 1 },
  { name: 'Sea bass', min: 1, max: 4.5, perKg: 14, fight: 0.8, rare: 0.8 },
  { name: 'Red snapper', min: 1.2, max: 6, perKg: 18, fight: 0.9, rare: 0.55 },
  { name: 'Barracuda', min: 3, max: 11, perKg: 15, fight: 1.15, rare: 0.3 },
  { name: 'Yellowfin tuna', min: 9, max: 36, perKg: 22, fight: 1.45, rare: 0.12 },
  { name: 'Mako shark', min: 30, max: 90, perKg: 12, fight: 1.8, rare: 0.04 },
];
const FRESH: FishDef[] = [
  { name: 'Rainbow trout', min: 0.4, max: 2.5, perKg: 12, fight: 0.65, rare: 1 },
  { name: 'Largemouth bass', min: 0.8, max: 4, perKg: 14, fight: 0.85, rare: 0.75 },
  { name: 'Channel catfish', min: 1.5, max: 9, perKg: 10, fight: 1, rare: 0.45 },
  { name: 'Northern pike', min: 2, max: 12, perKg: 13, fight: 1.25, rare: 0.22 },
  { name: 'Lake sturgeon', min: 12, max: 45, perKg: 16, fight: 1.6, rare: 0.05 },
];
const JUNK = [{ name: 'An old boot', value: 0 }, { name: 'A licence plate', value: 5 }, { name: 'A bottle with a note in it', value: 25 }];

export interface FishSpot { id: string; name: string; x: number; z: number; fresh: boolean }
export const FISH_SPOTS: FishSpot[] = [
  { id: 'pier', name: 'Del Sol Pier', x: -150, z: -300, fresh: false },
  { id: 'harbor', name: 'Dusk Harbor breakwater', x: 330, z: 1600, fresh: false },
  { id: 'lake', name: 'Kestrel Lake', x: 1250, z: -1785, fresh: true },
  { id: 'pine', name: 'Pinecrest Marina', x: 420, z: -2280, fresh: false },
  { id: 'costa', name: 'Costa Merida canal', x: 300, z: 3200, fresh: false },
];

/** Pick a fish for a spot (weighted by rarity), or junk now and then. Exported for tests. */
export function rollCatch(fresh: boolean, r = Math.random): { fish: FishDef; kg: number } | { junk: string; value: number } {
  if (r() < 0.06) { const j = JUNK[Math.floor(r() * JUNK.length)]!; return { junk: j.name, value: j.value }; }
  const pool = fresh ? FRESH : SEA;
  const total = pool.reduce((s, f) => s + f.rare, 0);
  let x = r() * total;
  let fish = pool[0]!;
  for (const f of pool) { x -= f.rare; if (x <= 0) { fish = f; break; } }
  const kg = fish.min + (fish.max - fish.min) * Math.pow(r(), 1.8);
  return { fish, kg: Math.round(kg * 10) / 10 };
}

type Phase = 'ready' | 'charge' | 'cast' | 'wait' | 'bite' | 'fight' | 'done';

/** Rod fishing from the shore: cast, wait for the bobber to go under, strike, then play the fish on the line. */
export class Fishing {
  active = false;
  private phase: Phase = 'ready';
  private spot: FishSpot | null = null;
  private readonly rod: THREE.Mesh;
  private readonly bobber: THREE.Mesh;
  private readonly line: THREE.Line;
  private readonly linePos: Float32Array;
  private readonly hud: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly info: HTMLElement;
  private readonly hint: HTMLElement;
  private charge = 0;
  private bob = new THREE.Vector3();
  private castFrom = new THREE.Vector3();
  private castT = 0;
  private timer = 0;
  private tension = 0;
  private dist = 0;
  private run = 0;
  private catchRoll: ReturnType<typeof rollCatch> | null = null;
  private slack = 0;
  private reelT = 0;
  private haul = 0;
  private caught = 0;

  constructor(private readonly s: Story) {
    const g = s.g;
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.4, metalness: 0.3 });
    this.rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.014, 2.2, 6).translate(0, 1.1, 0), rodMat);
    this.bobber = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff3b2f, roughness: 0.5, emissive: 0x330000 }));
    this.linePos = new Float32Array(16 * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.7 }));
    this.line.frustumCulled = false;
    for (const o of [this.rod, this.bobber, this.line]) { o.visible = false; g.world.scene.add(o); }
    g.world.rig.register(rodMat);
    this.fill = h('i', '');
    this.bar = h('div', 'ps-bar', this.fill, h('b', 'ps-zone'));
    this.info = h('div', 'ps-info', '');
    this.hint = h('div', 'ps-hint', '');
    this.hud = h('div', 'ps-hud is-hidden', h('div', 'ps-title', 'Fishing'), this.info, this.bar, this.hint);
    g.ui.hudRoot.append(this.hud);
  }

  /** Spot the player is standing at (for the prompt). */
  near(x: number, z: number): FishSpot | null {
    for (const sp of FISH_SPOTS) if (Math.hypot(sp.x - x, sp.z - z) < 30) return sp;
    return null;
  }

  start(spot: FishSpot): void {
    const g = this.s.g;
    this.active = true;
    this.spot = spot;
    this.phase = 'ready';
    this.haul = 0;
    this.caught = 0;
    g.player!.rooted = true;
    if (g.weapon?.isDrawn) g.weapon.toggleHolster();
    this.rod.visible = true;
    this.hud.classList.remove('is-hidden');
    this.s.hud.showTip(`${spot.name}. Hold ${this.s.interactKey()} to cast; strike when the float goes under. ${this.jumpKey()} to stop.`, 7);
  }

  private jumpKey(): string { const d = this.s.g.input.activeDevice; return d === 'gamepad' ? 'A' : d === 'touch' ? 'Jump' : 'Space'; }

  stop(): void {
    const g = this.s.g;
    if (!this.active) return;
    this.active = false;
    g.player!.rooted = false;
    this.rod.visible = this.bobber.visible = this.line.visible = false;
    this.hud.classList.add('is-hidden');
    if (this.haul > 0) {
      g.commerce!.eco.earn(this.haul, 'Fish sold');
      g.ui.toast(`Sold ${this.caught} catch${this.caught === 1 ? '' : 'es'} to the bait shop · +${money(this.haul)}`);
    }
    this.haul = 0;
  }

  update(dt: number): void {
    if (!this.active) return;
    const g = this.s.g;
    const inp = g.input;
    const cam = g.camera;
    if (g.driving?.mode !== 'foot' || g.combat?.vitals.dead || (g.wanted?.stars ?? 0) > 0) { this.stop(); return; }
    if (g.weapon?.isDrawn) g.weapon.toggleHolster();
    if (inp.pressed('jump')) { inp.swallow('jump'); this.stop(); return; }

    // the rod sits in front of the camera, angled up and out
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const base = cam.position.clone().addScaledVector(right, 0.28).addScaledVector(fwd, 0.45).add(new THREE.Vector3(0, -0.42, 0));
    const lift = this.phase === 'charge' ? -0.6 * this.charge : this.phase === 'fight' ? 0.25 + Math.sin(performance.now() / 90) * 0.04 * this.tension : 0;
    const dir = fwd.clone().setY(0).normalize().multiplyScalar(0.8).add(new THREE.Vector3(0, 1.1 + lift, 0)).normalize();
    this.rod.position.copy(base);
    this.rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const tip = base.clone().addScaledVector(dir, 2.2);

    const held = inp.down('interact');
    switch (this.phase) {
      case 'ready':
        this.bobber.visible = this.line.visible = false;
        this.hintText(`Hold ${this.s.interactKey()} to cast`);
        this.info.textContent = this.caught ? `${this.caught} in the cooler · ${money(this.haul)}` : this.spot!.name;
        this.setBar(0, false);
        if (inp.pressed('interact')) { inp.swallow('interact'); this.phase = 'charge'; this.charge = 0; }
        break;
      case 'charge':
        this.charge = Math.min(1, this.charge + dt / 1.1);
        this.setBar(this.charge, false);
        this.hintText('Release to cast');
        if (!held) {
          const d = 8 + this.charge * 16;
          const p = g.player!.pos;
          const fx = fwd.x, fz = fwd.z, fl = Math.hypot(fx, fz) || 1;
          const tx = p.x + (fx / fl) * d, tz = p.z + (fz / fl) * d;
          const wl = waterLevelAt(tx, tz);
          if (terrainHeight(tx, tz) > wl - 0.4) { this.phase = 'ready'; g.ui.toast('That is not water. Face the water and cast again.'); break; }
          this.castFrom.copy(tip);
          this.bob.set(tx, wl, tz);
          this.castT = 0;
          this.phase = 'cast';
          g.audio.sport('swish', 0.5);
        }
        break;
      case 'cast': {
        this.castT += dt / 0.7;
        const k = Math.min(1, this.castT);
        const p = this.castFrom.clone().lerp(this.bob, k);
        p.y += Math.sin(k * Math.PI) * 4;
        this.bobber.position.copy(p);
        this.bobber.visible = this.line.visible = true;
        if (k >= 1) {
          g.audio.sport('plop', 0.4, this.bob);
          this.phase = 'wait';
          this.timer = 3 + Math.random() * 9;
          this.dist = Math.hypot(this.bob.x - g.player!.pos.x, this.bob.z - g.player!.pos.z);
        }
        break;
      }
      case 'wait':
        this.timer -= dt;
        this.bobber.position.set(this.bob.x, this.bob.y + Math.sin(performance.now() / 500) * 0.02 + (this.timer < 1.2 && Math.random() < 0.08 ? -0.05 : 0), this.bob.z);
        this.hintText('Wait for a bite…');
        if (inp.pressed('interact')) { inp.swallow('interact'); this.phase = 'ready'; g.ui.toast('Reeled in too early.'); break; }
        if (this.timer <= 0) { this.phase = 'bite'; this.timer = 1.1; g.audio.sport('bite', 0.8, this.bob); g.input.rumble(0.6, 0.3, 160); }
        break;
      case 'bite':
        this.timer -= dt;
        this.bobber.position.set(this.bob.x, this.bob.y - 0.12, this.bob.z);
        this.hintText(`STRIKE! Press ${this.s.interactKey()}`);
        if (inp.pressed('interact')) {
          inp.swallow('interact');
          this.catchRoll = rollCatch(this.spot!.fresh);
          this.tension = 0.3; this.run = 0; this.slack = 0;
          this.phase = 'fight';
        } else if (this.timer <= 0) { this.phase = 'ready'; g.ui.toast('It got away. Strike faster when the float dips.'); }
        break;
      case 'fight': {
        const c = this.catchRoll!;
        const fight = 'fish' in c ? c.fish.fight * (0.8 + c.kg / (c.fish.max * 2)) : 0.25;
        this.run -= dt;
        if (this.run <= -1.2 && Math.random() < dt * 0.9 * fight) this.run = 0.8 + Math.random() * 1.6 * fight;
        const pull = (this.run > 0 ? 1.6 : 0.35) * fight;
        if (held) {
          this.tension += (pull * 0.4 + 0.1) * dt;
          this.dist -= (3.2 - pull * 0.8) * dt;
          this.reelT -= dt;
          if (this.reelT <= 0) { g.audio.sport('reel', 0.6); this.reelT = 0.07; }
          this.slack = 0;
        } else {
          this.tension -= 0.7 * dt;
          this.dist += pull * 0.8 * dt;
          this.slack += dt;
        }
        this.tension = Math.max(0, this.tension);
        // the float follows the fish, swinging side to side during a run
        const p = g.player!.pos;
        const ang = Math.atan2(this.bob.x - p.x, this.bob.z - p.z) + (this.run > 0 ? Math.sin(performance.now() / 300) * 0.25 : 0);
        this.bobber.position.set(p.x + Math.sin(ang) * this.dist, this.bob.y - 0.05, p.z + Math.cos(ang) * this.dist);
        this.setBar(this.tension, true);
        this.info.textContent = `${this.dist.toFixed(1)} m · ${'fish' in c && c.kg > c.fish.max * 0.55 ? 'Something big' : 'On the line'}${this.run > 0 ? ' · running!' : ''}`;
        this.hintText(this.tension > 0.8 ? 'Ease off or the line snaps!' : `Hold ${this.s.interactKey()} to reel · let go when it runs`);
        if (this.tension >= 1) { g.audio.sport('snap', 0.7); g.ui.toast('The line snapped.'); this.phase = 'ready'; }
        else if (this.dist > 46 || this.slack > 7) { g.ui.toast('It threw the hook.'); this.phase = 'ready'; }
        else if (this.dist < 2) this.land(c);
        break;
      }
      case 'done':
        this.phase = 'ready';
        break;
    }
    // the line from the rod tip to the float, sagging when slack
    if (this.line.visible) {
      const b = this.bobber.position;
      const sag = this.phase === 'fight' ? 0.4 * (1 - this.tension) : 1.2;
      for (let i = 0; i < 16; i++) {
        const t = i / 15;
        this.linePos[i * 3] = tip.x + (b.x - tip.x) * t;
        this.linePos[i * 3 + 1] = tip.y + (b.y - tip.y) * t - Math.sin(t * Math.PI) * sag;
        this.linePos[i * 3 + 2] = tip.z + (b.z - tip.z) * t;
      }
      this.line.geometry.attributes.position!.needsUpdate = true;
    }
  }

  private land(c: NonNullable<Fishing['catchRoll']>): void {
    const g = this.s.g;
    this.phase = 'done';
    g.audio.sport('plop', 0.7);
    if ('junk' in c) {
      this.s.hud.showBanner('Reeled in', c.junk, c.value ? `+${money(c.value)}` : 'Worth nothing', 'neutral', 3);
      this.haul += c.value;
      return;
    }
    const value = Math.round(c.kg * c.fish.perKg);
    this.haul += value;
    this.caught++;
    const rec = (this.s.st.acts['pastime.fish'] ??= { plays: 0, wins: 0, best: 0, ext: {} });
    const best = rec.ext['kg:' + c.fish.name] ?? 0;
    const record = c.kg > best;
    if (record) rec.ext['kg:' + c.fish.name] = c.kg;
    this.s.actWin('pastime.fish');
    this.s.hud.showBanner(record ? 'New personal best' : 'Caught', `${c.fish.name} · ${c.kg.toFixed(1)} kg`, `Worth ${money(value)}`, 'good', 3.4);
    if (c.fish.rare < 0.1) g.audio.sport('cheer', 0.5);
  }

  private setBar(v: number, fight: boolean): void {
    this.fill.style.transform = `scaleX(${Math.min(1, v)})`;
    this.bar.classList.toggle('fight', fight);
    this.bar.classList.toggle('danger', fight && v > 0.8);
  }

  private hintText(t: string): void { if (this.hint.textContent !== t) this.hint.textContent = t; }
}
