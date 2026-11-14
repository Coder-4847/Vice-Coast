import * as THREE from 'three';
import type { Game } from '../Game';
import type { Ped } from './Pedestrians';

interface Dog { x: number; z: number; y: number; yaw: number; speed: number; phase: number; owner: Ped | null; size: number; color: number; tx: number; tz: number; t: number; scared: number; barkT: number; companion?: boolean; target?: Ped | null; biteT?: number; hidden?: boolean }
interface Pigeon { x: number; y: number; z: number; vx: number; vy: number; vz: number; yaw: number; peck: number; flying: boolean }

const COATS = [0x8a6a4a, 0x2a2420, 0xd8c8a8, 0x6a4a2a, 0xb08050, 0x3a3a3c, 0xe8e2d8];

/**
 * Animals in town: dogs out with their owners (and a few strays in Southside), and pigeons pecking on the pavement that
 * burst into the air when you come close or fire a shot. All drawn as instanced parts.
 */
export class Animals {
  private readonly dogs: Dog[] = [];
  private readonly birds: Pigeon[] = [];
  private flockAt: { x: number; z: number } | null = null;
  private dogT = 3;
  private birdT = 2;
  private readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  private readonly dBody: THREE.InstancedMesh;
  private readonly dHead: THREE.InstancedMesh;
  private readonly dLegs: THREE.InstancedMesh;
  private readonly dTail: THREE.InstancedMesh;
  private readonly pBody: THREE.InstancedMesh;
  private readonly pWing: THREE.InstancedMesh;
  private readonly col = new THREE.Color();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly q2 = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  stats = { dogs: 0, pigeons: 0, bites: 0 };
  /** Your own dog, once adopted from the shelter (phone). */
  /** Your dog, if you adopted one. */
  buddy: Dog | null = null;

  /** Adopt Rufus: $500, then he lives with you for good. */
  adopt(): void {
    const g = this.g;
    if (g.story?.st.flags.dog) return;
    if (!g.commerce?.eco.spend(500, 'Pound & Paws')) { g.ui.toast('You need $500 to adopt Rufus.'); return; }
    if (g.story) g.story.st.flags.dog = true;
    g.ui.toast('Rufus is yours! He is waiting right behind you. Press K to send him at whatever you aim at.');
  }

  private companion(dt: number): void {
    const g = this.g, pl = g.player!;
    if (!g.story?.st.flags.dog) { if (this.buddy) { this.dogs.splice(this.dogs.indexOf(this.buddy), 1); this.buddy = null; } return; }
    if (!this.buddy) {
      this.buddy = { x: pl.pos.x - 1.5, z: pl.pos.z - 1.5, y: pl.pos.y, yaw: 0, speed: 0, phase: 0, owner: null, size: 1.25, color: 0xc89050, tx: 0, tz: 0, t: 0, scared: 0, barkT: 4, companion: true, target: null, biteT: 0 };
      this.dogs.unshift(this.buddy);
    }
    const d = this.buddy;
    // in a car or aircraft with you: out of sight, and right there when you get out
    const away = g.driving?.mode !== 'foot' || !!g.piloting?.busy || pl.state === 'swim';
    if (away) { d.hidden = true; d.target = null; d.x = pl.pos.x - 1.2; d.z = pl.pos.z - 1.2; return; }
    if (d.hidden || Math.hypot(d.x - pl.pos.x, d.z - pl.pos.z) > 60) { d.hidden = false; const a = pl.yaw + Math.PI * 0.75; d.x = pl.pos.x + Math.sin(a) * 1.6; d.z = pl.pos.z + Math.cos(a) * 1.6; }
    // orders: K sends him at what you aim at (or the nearest gunman); he also jumps in when you are being shot at
    const hostiles = g.story.hostiles;
    if (g.input.pressed('dog')) {
      let t: Ped | null = null;
      const e = pl.eyePosition, dir = new THREE.Vector3();
      pl.lookDirection(dir);
      const hit = g.npcs?.rayHit(e.x, e.y, e.z, dir.x, dir.y, dir.z, 45);
      if (hit && (hit.target as Ped).x !== undefined) t = hit.target as Ped;
      if (!t) t = this.nearestThreat(d, 30);
      d.target = t && t.state !== 'down' ? t : null;
      this.g.audio.bark(new THREE.Vector3(d.x, d.y + 0.5, d.z), 0.8);
      g.ui.toast(d.target ? 'Rufus! Get him!' : 'Rufus! Here, boy!');
    }
    if (!d.target && (g.combat?.vitals.sinceHit ?? 99) < 1.5) d.target = this.nearestThreat(d, 22);
    void hostiles;
    const t = d.target;
    if (t && (!t.active || t.state === 'down')) { d.target = null; this.g.audio.bark(new THREE.Vector3(d.x, d.y + 0.5, d.z), 0.8); }
    if (d.target) {
      const tx = d.target.x, tz = d.target.z;
      const dist = Math.hypot(tx - d.x, tz - d.z);
      this.moveDog(d, tx, tz, 7.5, dt);
      d.biteT = (d.biteT ?? 0) - dt;
      if (dist < 1.1 && d.biteT <= 0) {
        d.biteT = 0.7;
        const res = g.npcs!.peds.knockDown(d.target, (tx - d.x) * 2, (tz - d.z) * 2, 22, true, false);
        d.target.flinch = 0.32;
        this.stats.bites++;
        g.audio.bark(new THREE.Vector3(d.x, d.y + 0.5, d.z), 0.9);
        if (res === 'kill' || res === 'down') d.target = null;
      }
    } else {
      // at heel, a step behind and to the right; trots to catch up
      const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
      const hx = pl.pos.x - fx * 1.1 + fz * 0.9, hz = pl.pos.z - fz * 1.1 - fx * 0.9;
      const far = Math.hypot(hx - d.x, hz - d.z);
      this.moveDog(d, hx, hz, far > 4 ? 6.5 : Math.max(1.2, pl.speed2D * 1.1), dt);
    }
    d.y = g.world.heightAt(d.x, d.z);
    d.phase += dt * (2 + d.speed * 4);
  }

  private nearestThreat(d: Dog, r: number): Ped | null {
    const g = this.g;
    let best: Ped | null = null, bd = r;
    for (const p of g.story?.hostiles.list ?? []) {
      if (!p.active || p.state === 'down' || !g.story!.hostiles.awake(p)) continue;
      const dd = Math.hypot(p.x - d.x, p.z - d.z);
      if (dd < bd) { bd = dd; best = p; }
    }
    // with the police after you, he goes for the nearest officer on foot
    if (!best && (g.wanted?.stars ?? 0) > 0) for (const p of g.npcs?.peds.peds ?? []) {
      if (!p.active || p.state === 'down' || p.role !== 'cop') continue;
      const dd = Math.hypot(p.x - d.x, p.z - d.z);
      if (dd < bd) { bd = dd; best = p; }
    }
    return best;
  }

  private moveDog(d: Dog, tx: number, tz: number, sp: number, dt: number): void {
    const dx = tx - d.x, dz = tz - d.z, dist = Math.hypot(dx, dz);
    if (dist > 0.3) {
      const step = Math.min(dist, sp * dt);
      d.x += (dx / dist) * step; d.z += (dz / dist) * step;
      let dy = Math.atan2(dx, dz) - d.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      d.yaw += dy * Math.min(1, dt * 9);
      d.speed = step / dt;
    } else d.speed = 0;
  }

  constructor(private readonly g: Game) {
    const mk = (geo: THREE.BufferGeometry, n: number, shadow = false): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(geo, this.mat, n);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.castShadow = shadow; m.count = 0;
      this.group.add(m);
      return m;
    };
    this.dBody = mk(new THREE.CapsuleGeometry(0.13, 0.42, 3, 8).rotateX(Math.PI / 2), 12, true);
    this.dHead = mk(mergeHead(), 12);
    this.dLegs = mk(new THREE.CylinderGeometry(0.035, 0.03, 0.32, 6).translate(0, -0.16, 0), 48);
    this.dTail = mk(new THREE.CylinderGeometry(0.02, 0.012, 0.26, 5).translate(0, 0.13, 0), 12);
    this.pBody = mk(new THREE.SphereGeometry(0.09, 8, 6).scale(0.8, 0.85, 1.25), 24);
    this.pWing = mk(new THREE.BoxGeometry(0.22, 0.01, 0.1), 48);
    g.world.scene.add(this.group);
    g.world.rig.register(this.mat);
  }

  update(dt: number): void {
    const g = this.g;
    const p = g.player?.pos;
    if (!p || g.state !== 'playing' || !g.npcs) return;
    const plan = g.world.city.plan;
    const inCity = plan.inCity(p.x, p.z);
    const shot = !!g.weapon?.firedThisFrame && !g.weapon.def.melee;
    // ---- dogs: walkers bring theirs; Southside has strays
    this.dogT -= dt;
    if (this.dogT <= 0) {
      this.dogT = 4;
      for (let i = this.dogs.length - 1; i >= 0; i--) {
        const d = this.dogs[i]!;
        if (d.companion) continue;
        if (Math.hypot(d.x - p.x, d.z - p.z) > 200 || (d.owner && !d.owner.active)) this.dogs.splice(i, 1);
      }
      if (inCity && this.dogs.length < 6) {
        const peds = g.npcs.peds.peds;
        const owner = peds.find((q) => q.active && q.role === 'civ' && q.state === 'walk' && !q.buddy && q.dist > 40 && q.dist < 120 && !this.dogs.some((d) => d.owner === q) && q.seed % 1 < 0.35);
        if (owner) this.addDog(owner.x, owner.z, owner);
        const hood = g.world.city.plan.districtAt?.(p.x, p.z) === 'hood';
        if (hood && this.dogs.filter((d) => !d.owner).length < 2) {
          const a = Math.random() * Math.PI * 2;
          this.addDog(p.x + Math.cos(a) * 60, p.z + Math.sin(a) * 60, null);
        }
      }
    }
    this.companion(dt);
    for (const d of this.dogs) if (!d.companion) this.stepDog(d, dt, p, shot);
    // ---- pigeons: a flock on a nearby pavement, by day
    const hour = g.world.tod.hour;
    this.birdT -= dt;
    if (this.birdT <= 0 && !this.flockAt && inCity && hour > 6 && hour < 20) {
      this.birdT = 25;
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 30;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        if (plan.roadAt(x, z).kind !== 'sidewalk') continue;
        this.flockAt = { x, z };
        const n = 6 + Math.floor(Math.random() * 7);
        for (let k = 0; k < n; k++) {
          const bx = x + (Math.random() - 0.5) * 3, bz = z + (Math.random() - 0.5) * 3;
          this.birds.push({ x: bx, y: g.world.heightAt(bx, bz) + 0.08, z: bz, vx: 0, vy: 0, vz: 0, yaw: Math.random() * 6.3, peck: Math.random() * 6, flying: false });
        }
        break;
      }
    }
    if (this.flockAt) {
      const near = Math.hypot(this.flockAt.x - p.x, this.flockAt.z - p.z);
      const car = g.driving?.mode === 'driving' ? g.driving.vehicle : null;
      const startle = near < 5.5 || (shot && near < 45) || (car && near < 14 && Math.abs(car.speed) > 3);
      for (const b of this.birds) {
        if (!b.flying && startle) {
          b.flying = true;
          const a = Math.atan2(b.z - p.z, b.x - p.x) + (Math.random() - 0.5) * 1.2;
          b.vx = Math.cos(a) * (3 + Math.random() * 3); b.vz = Math.sin(a) * (3 + Math.random() * 3); b.vy = 3.5 + Math.random() * 2;
          b.yaw = Math.atan2(b.vx, b.vz);
        }
        if (b.flying) { b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vy = Math.max(1.2, b.vy - dt * 1.5); }
        else { b.peck += dt * (2 + Math.random() * 2); if (Math.random() < dt * 0.4) b.yaw += (Math.random() - 0.5) * 1.5; }
      }
      if (this.birds.length && this.birds.every((b) => b.flying && b.y - g.world.heightAt(b.x, b.z) > 35) || near > 160) { this.birds.length = 0; this.flockAt = null; }
      if (startle && this.birds.some((b) => b.flying && b.y < 2)) g.audio.sport('swish', 0.5, new THREE.Vector3(this.flockAt?.x ?? 0, 1, this.flockAt?.z ?? 0));
    }
    this.draw();
    this.stats.dogs = this.dogs.length; this.stats.pigeons = this.birds.length;
  }

  private addDog(x: number, z: number, owner: Ped | null): void {
    const size = 0.75 + Math.random() * 0.55;
    this.dogs.push({ x, z, y: this.g.world.heightAt(x, z), yaw: 0, speed: 0, phase: Math.random() * 6, owner, size, color: COATS[Math.floor(Math.random() * COATS.length)]!, tx: x, tz: z, t: 0, scared: 0, barkT: 3 + Math.random() * 6 });
  }

  private stepDog(d: Dog, dt: number, p: THREE.Vector3, shot: boolean): void {
    const g = this.g;
    d.t -= dt;
    d.barkT -= dt;
    const pd = Math.hypot(d.x - p.x, d.z - p.z);
    if (shot && pd < 40) d.scared = 6;
    d.scared = Math.max(0, d.scared - dt);
    let tx = d.tx, tz = d.tz, sp = 1.1;
    if (d.scared > 0) { const a = Math.atan2(d.z - p.z, d.x - p.x); tx = d.x + Math.cos(a) * 10; tz = d.z + Math.sin(a) * 10; sp = 6; }
    else if (d.owner) {
      // trots at the owner's heel, on the leash side
      const o = d.owner;
      const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw);
      tx = o.x + fx * 0.9 + fz * 0.7; tz = o.z + fz * 0.9 - fx * 0.7;
      sp = Math.max(0.6, o.speed * 1.15);
      if (o.state === 'flee') { sp = 5; }
    } else if (d.t <= 0) {
      d.t = 3 + Math.random() * 5;
      d.tx = d.x + (Math.random() - 0.5) * 16; d.tz = d.z + (Math.random() - 0.5) * 16;
      if (pd < 9 && Math.random() < 0.5) { d.tx = p.x; d.tz = p.z; }
    }
    const dx = tx - d.x, dz = tz - d.z, dist = Math.hypot(dx, dz);
    if (dist > 0.25) {
      const step = Math.min(dist, sp * dt * (dist > 3 ? 1.5 : 1));
      d.x += (dx / dist) * step; d.z += (dz / dist) * step;
      let dy = Math.atan2(dx, dz) - d.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      d.yaw += dy * Math.min(1, dt * 8);
      d.speed = step / dt;
    } else d.speed = 0;
    d.y = g.world.heightAt(d.x, d.z);
    d.phase += dt * (2 + d.speed * 4);
    // a bark now and then: more at the player, at a gun, or when scared
    if (d.barkT <= 0 && pd < 30) {
      d.barkT = (pd < 6 || g.weapon?.isDrawn ? 1.6 : 6) + Math.random() * 6;
      if (pd < 12 || Math.random() < 0.3) g.audio.bark(new THREE.Vector3(d.x, d.y + 0.5, d.z), d.size - 0.5);
    }
  }

  private put(m: THREE.InstancedMesh, i: number, x: number, y: number, z: number, q: THREE.Quaternion, s: number, color: number): void {
    this.m.compose(this.v.set(x, y, z), q, this.s.setScalar(s));
    m.setMatrixAt(i, this.m);
    m.setColorAt(i, this.col.setHex(color));
  }

  private draw(): void {
    let nd = 0, nl = 0;
    const ax = new THREE.Vector3(1, 0, 0), ay = new THREE.Vector3(0, 1, 0);
    for (const d of this.dogs) {
      if (nd >= 12) break;
      if (d.hidden) continue;
      const s = d.size;
      this.q.setFromAxisAngle(ay, d.yaw);
      const off = (lx: number, ly: number, lz: number): THREE.Vector3 => this.v.set(lx * s, ly * s, lz * s).applyQuaternion(this.q);
      const bob = d.speed > 0.2 ? Math.abs(Math.sin(d.phase)) * 0.03 * s : 0;
      let o = off(0, 0.42, 0);
      this.put(this.dBody, nd, d.x + o.x, d.y + o.y + bob, d.z + o.z, this.q, s, d.color);
      o = off(0, 0.6, 0.38);
      this.put(this.dHead, nd, d.x + o.x, d.y + o.y + bob, d.z + o.z, this.q, s, d.color);
      const wag = Math.sin(performance.now() / 90 + d.phase) * 0.6;
      this.q2.copy(this.q).multiply(new THREE.Quaternion().setFromAxisAngle(ax, -0.7)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), wag));
      o = off(0, 0.48, -0.32);
      this.put(this.dTail, nd, d.x + o.x, d.y + o.y, d.z + o.z, this.q2, s, d.color);
      for (const [lx, lz, ph] of [[-0.08, 0.2, 0], [0.08, 0.2, Math.PI], [-0.08, -0.2, Math.PI], [0.08, -0.2, 0]] as const) {
        const sw = d.speed > 0.2 ? Math.sin(d.phase + ph) * 0.55 : 0;
        this.q2.copy(this.q).multiply(new THREE.Quaternion().setFromAxisAngle(ax, sw));
        o = off(lx, 0.34, lz);
        this.put(this.dLegs, nl++, d.x + o.x, d.y + o.y, d.z + o.z, this.q2, s, d.color);
      }
      nd++;
    }
    this.dBody.count = this.dHead.count = this.dTail.count = nd;
    this.dLegs.count = nl;
    let nb = 0, nw = 0;
    for (const b of this.birds) {
      if (nb >= 24) break;
      this.q.setFromAxisAngle(ay, b.yaw);
      const peck = b.flying ? 0 : Math.max(0, Math.sin(b.peck)) * 0.35;
      this.q2.copy(this.q).multiply(new THREE.Quaternion().setFromAxisAngle(ax, peck));
      this.put(this.pBody, nb++, b.x, b.y, b.z, this.q2, 1, 0x7a7e86);
      const flap = b.flying ? Math.sin(performance.now() / 45 + b.peck) * 0.9 : 0.05;
      for (const sd of [-1, 1]) {
        this.q2.copy(this.q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sd * flap));
        this.v.set(sd * 0.09, 0.02, 0).applyQuaternion(this.q2);
        this.put(this.pWing, nw++, b.x + this.v.x, b.y + this.v.y, b.z + this.v.z, this.q2, 1, 0x5a5e66);
      }
    }
    this.pBody.count = nb; this.pWing.count = nw;
    for (const m of [this.dBody, this.dHead, this.dLegs, this.dTail, this.pBody, this.pWing]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
}

/** A dog's head: skull, a snout, two ears. */
function mergeHead(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.11, 10, 8);
  const pos: number[] = [], nor: number[] = [];
  const add = (geo: THREE.BufferGeometry): void => {
    const n = geo.index ? geo.toNonIndexed() : geo;
    pos.push(...(n.getAttribute('position').array as Float32Array));
    nor.push(...(n.getAttribute('normal').array as Float32Array));
  };
  add(g);
  add(new THREE.BoxGeometry(0.09, 0.08, 0.14).translate(0, -0.03, 0.12));
  add(new THREE.ConeGeometry(0.04, 0.09, 4).translate(-0.06, 0.1, -0.01));
  add(new THREE.ConeGeometry(0.04, 0.09, 4).translate(0.06, 0.1, -0.01));
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
