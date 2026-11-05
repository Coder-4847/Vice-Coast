import * as THREE from 'three';
import { CITY, terrainHeight } from '../world/Terrain';
import { mulberry32, type CityPlan, type District } from '../world/city/plan';
import type { SignalClock } from './Signals';

const G: number = CITY.height;
const SIDE = 1.8; // sidewalk centre-line offset from the road edge

// ======================================================================================== sidewalk graph

export interface PedEdge {
  a: number;
  b: number;
  len: number;
  cross: boolean;
  /** For crossings: the axis of the traffic being crossed (0 = N–S road, 1 = E–W road). */
  axis: 0 | 1;
}

/** Pedestrian network: the four sidewalk corners of every junction, joined along sidewalks and across zebra crossings. */
export class PedNet {
  readonly nx: number[] = [];
  readonly nz: number[] = [];
  readonly ok: boolean[] = [];
  readonly edges: PedEdge[] = [];
  readonly adj: number[][] = [];
  private readonly total: number;
  private readonly cum: number[] = [];

  constructor(plan: CityPlan) {
    const { X, Z } = plan;
    const id = (i: number, j: number, sx: number, sz: number) => (i * Z.length + j) * 4 + (sx > 0 ? 1 : 0) + (sz > 0 ? 2 : 0);
    for (let i = 0; i < X.length; i++) {
      for (let j = 0; j < Z.length; j++) {
        for (let c = 0; c < 4; c++) {
          const sx = c & 1 ? 1 : -1, sz = c & 2 ? 1 : -1;
          const x = X[i]!.pos + sx * (X[i]!.hw + SIDE), z = Z[j]!.pos + sz * (Z[j]!.hw + SIDE);
          this.nx.push(x);
          this.nz.push(z);
          this.ok.push(Math.hypot(X[i]!.pos - CITY.x, Z[j]!.pos - CITY.z) < 700);
          this.adj.push([]);
        }
      }
    }
    const add = (a: number, b: number, cross: boolean, axis: 0 | 1) => {
      if (!this.ok[a] || !this.ok[b]) return;
      const e: PedEdge = { a, b, len: Math.hypot(this.nx[a]! - this.nx[b]!, this.nz[a]! - this.nz[b]!), cross, axis };
      this.adj[a]!.push(this.edges.length);
      this.adj[b]!.push(this.edges.length);
      this.edges.push(e);
    };
    for (let i = 0; i < X.length; i++) {
      for (let j = 0; j < Z.length; j++) {
        for (const s of [-1, 1]) {
          if (j < Z.length - 1) add(id(i, j, s, 1), id(i, j + 1, s, -1), false, 0); // along the N–S road
          if (i < X.length - 1) add(id(i, j, 1, s), id(i + 1, j, -1, s), false, 1); // along the E–W road
          add(id(i, j, -1, s), id(i, j, 1, s), true, 0); // across the N–S road
          add(id(i, j, s, -1), id(i, j, s, 1), true, 1); // across the E–W road
        }
      }
    }
    let acc = 0;
    for (const e of this.edges) { acc += e.cross ? 4 : e.len; this.cum.push(acc); }
    this.total = acc;
  }

  randomEdge(r: () => number): number {
    const t = r() * this.total;
    let lo = 0, hi = this.cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid]! < t) lo = mid + 1; else hi = mid;
    }
    return lo;
  }
}

// ====================================================================================== appearances

export type Arch = 'walker' | 'commuter' | 'jogger' | 'worker' | 'tourist' | 'party' | 'drunk' | 'kid' | 'musician' | 'listener' | 'protester' | 'sunbather' | 'stroller' | 'local';
export type PedState = 'walk' | 'wait' | 'idle' | 'flee' | 'film' | 'down' | 'stand' | 'path' | 'lie';

const SKIN = [0xf1c7a5, 0xe0ac86, 0xc68863, 0xa8693f, 0x7a4a2b, 0x5b3a22];
const HAIR = [0x16110d, 0x2a1d14, 0x4b3322, 0x7a5a36, 0xb08a52, 0x8d8d8a, 0x5a2a1c];
const SUIT = [0x1d2230, 0x2a2d33, 0x3b3f4a, 0x4a4036, 0x20302c];
const SHIRT_BIZ = [0xe8e8e4, 0xb8c6d8, 0xd4c8b8, 0x9fb0c4, 0xe6d9d9];
const CASUAL = [0x3b5b8c, 0x8c3b3b, 0x4a7a54, 0xd0a23a, 0x6c4a8c, 0x2c2c2f, 0xc9c9c4, 0xd9743a, 0x2f8a8c];
const BRIGHT = [0xff4f8b, 0x2ee6ff, 0xffb02e, 0x9a6bff, 0x4dff9a, 0xff6a3c, 0xf5f5f0, 0xffe14d];
const JEANS = [0x2b3a5a, 0x3b4a6a, 0x1e2230, 0x4a4a4e, 0x6b5a46];
const SHORTS = [0xd8c8a0, 0x6aa0c8, 0xe8e8e0, 0xc86a5a];
const HIVIS = [0xff7a1a, 0xe8ff2a];
const SPORT = [0x00c2ff, 0xff3b6b, 0x7dff3b, 0xffa500, 0xf5f5f5];

export interface Look { skin: number; hair: number; shirt: number; sleeve: number; pants: number; shoe: number; h: number; w: number }

const pick = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length]!;

export function lookFor(arch: Arch, district: District | 'beach', r: () => number): Look {
  const skin = pick(r, SKIN);
  const hair = pick(r, HAIR);
  let shirt = pick(r, CASUAL), pants = pick(r, JEANS), shoe = 0x1c1c1e;
  let long = true;
  switch (arch) {
    case 'commuter':
      shirt = r() < 0.55 ? pick(r, SUIT) : pick(r, SHIRT_BIZ);
      pants = pick(r, SUIT);
      break;
    case 'worker': shirt = pick(r, HIVIS); pants = pick(r, [0x2a3042, 0x3a3a3a]); shoe = 0x3a2c1c; break;
    case 'tourist': shirt = pick(r, [...BRIGHT, ...CASUAL]); pants = pick(r, SHORTS); shoe = pick(r, [0xe8e8e8, 0x2a2a2a]); long = false; break;
    case 'party': shirt = pick(r, BRIGHT); pants = r() < 0.5 ? pick(r, [0x111114, 0x1b1b24]) : pick(r, JEANS); shoe = pick(r, [0xf0f0f0, 0x111111, 0xd0305a]); break;
    case 'drunk': shirt = pick(r, CASUAL); pants = pick(r, JEANS); break;
    case 'jogger': shirt = pick(r, SPORT); pants = pick(r, [0x111114, 0x24262e, 0xc8c8c8]); shoe = pick(r, [0xf5f5f5, 0xff5a3c, 0x7dff3b]); long = r() < 0.3; break;
    case 'sunbather': shirt = pick(r, BRIGHT); pants = pick(r, [0x2a6ac8, 0xc83a4a, 0x1a1a1a, 0xf0f0f0]); long = false; shoe = skin; break;
    case 'protester': shirt = pick(r, [0xc83a3a, 0x1d1d22, 0x2a6a4a, 0xf0f0f0]); pants = pick(r, JEANS); break;
    case 'musician': shirt = pick(r, [0x6b2a2a, 0x1d2a3a, 0x3a3a2a]); pants = pick(r, JEANS); break;
    case 'kid': shirt = pick(r, BRIGHT); pants = pick(r, [...JEANS, ...SHORTS]); long = r() < 0.5; shoe = pick(r, [0xff5a3c, 0x2ee6ff, 0x111111]); break;
    default:
      if (district === 'boardwalk' || district === 'beach') { shirt = pick(r, [...BRIGHT, ...CASUAL]); if (r() < 0.45) { pants = pick(r, SHORTS); long = false; } }
      else if (district === 'downtown') { shirt = r() < 0.4 ? pick(r, SHIRT_BIZ) : pick(r, CASUAL); }
  }
  const kid = arch === 'kid';
  return {
    skin, hair, shirt, sleeve: long ? shirt : skin, pants, shoe,
    h: kid ? 0.62 + r() * 0.1 : 0.93 + r() * 0.14,
    w: kid ? 0.78 : 0.9 + r() * 0.24,
  };
}

// ================================================================================================ peds

export class Ped {
  active = false;
  id = 0;
  state: PedState = 'walk';
  arch: Arch = 'walker';
  look: Look = { skin: 0, hair: 0, shirt: 0, sleeve: 0, pants: 0, shoe: 0, h: 1, w: 1 };
  x = 0; y = G; z = 0; yaw = 0;
  /** Pose yaw of the body (separate so a filming ped can face the action while standing). */
  speed = 1.4;
  baseSpeed = 1.4;
  phase = 0;
  edge = -1;
  /** +1 walking a → b, −1 walking b → a. */
  dir: 1 | -1 = 1;
  s = 0;
  lane = 0;
  stateT = 0;
  idleT = 0;
  health = 100;
  fall = 0;
  fallSign = 1;
  tx = 0; tz = 0; // threat / look-at target, or path end point
  px = 0; pz = 0; // path start (for 'path' strollers)
  vx = 0; vz = 0; // knock-back slide
  accessory: 0 | 1 | 2 | 3 | 4 | 5 = 0; // none, phone, sign, guitar, bag, towel
  wobble = 0;
  buddy: Ped | null = null;
  onRoad = false;
  screamed = false;
  seed = 0;
  dist = 1e9;
}

export interface PedHooks {
  scream(x: number, z: number): void;
}

export interface VehicleHit { x: number; z: number; vx: number; vz: number; fx: number; fz: number; hl: number; hw: number }

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);

/** Time-of-day crowd size (relative). */
export function pedDensity(hour: number): number {
  const bump = (c: number, w: number) => Math.exp(-(((hour - c) / w) ** 2));
  return Math.min(1, 0.12 + 0.5 * bump(8.5, 1.6) + 0.75 * bump(13, 3.6) + 0.7 * bump(18, 2.2) + 0.55 * bump(23, 2.2));
}

/**
 * The crowd. Pedestrians walk the sidewalk graph, wait at kerbs for the signals, cross on the zebras, and react to
 * gunshots, crashes and cars. Each has a look drawn from a district- and time-of-day-dependent archetype
 * (commuters by day, partygoers and drunks at night downtown, joggers on the seafront, hi-vis workers in the
 * industrial district, tourists and kids at the beach). All are drawn as animated instanced parts.
 */
export class Pedestrians {
  readonly net: PedNet;
  readonly peds: Ped[] = [];
  hooks: PedHooks | null = null;
  target = 60;
  frustum = new THREE.Frustum();
  focus = new THREE.Vector3();
  hour = 12;
  private readonly rnd = mulberry32((Date.now() >>> 3) & 0xffffff);
  private spawnT = 0;
  private nextId = 1;
  private screamT = 0;
  stats = { active: 0, fleeing: 0, down: 0, crossing: 0 };

  constructor(private readonly plan: CityPlan, private readonly signals: SignalClock, readonly capacity = 170) {
    this.net = new PedNet(plan);
    for (let i = 0; i < capacity; i++) this.peds.push(new Ped());
  }

  private free(): Ped | null {
    for (const p of this.peds) if (!p.active) return p;
    return null;
  }

  // ---------------------------------------------------------------------------------------- spawning

  private districtAt(x: number, z: number): District | 'beach' {
    if (x < 215) return 'beach';
    return this.plan.districtAt(x, z);
  }

  private archFor(d: District | 'beach', hour: number): Arch {
    const r = this.rnd();
    const night = hour >= 21 || hour < 4;
    const commute = (hour >= 6.3 && hour < 9.8) || (hour >= 16.3 && hour < 19.8);
    if (night && (d === 'downtown' || d === 'boardwalk') && r < 0.5) return r < 0.07 ? 'drunk' : 'party';
    if (d === 'industrial') return r < 0.6 ? 'worker' : 'local';
    if ((d === 'boardwalk' || d === 'beach') && !night) {
      if (r < 0.2) return 'tourist';
      if (r < 0.28 && (hour < 10 || hour > 16.5)) return 'jogger';
      if (r < 0.36) return 'kid';
      return 'local';
    }
    if (d === 'residential') {
      if (r < 0.1 && (hour < 9 || hour > 16.5)) return 'jogger';
      if (r < 0.2 && hour > 8 && hour < 19) return 'kid';
      return 'local';
    }
    if (commute && (d === 'downtown' || d === 'midtown') && r < 0.6) return 'commuter';
    if (d === 'downtown' && r < 0.15) return 'tourist';
    return 'local';
  }

  private outfit(p: Ped, arch: Arch, d: District | 'beach'): void {
    const r = this.rnd;
    p.arch = arch;
    p.look = lookFor(arch, d, r);
    p.baseSpeed = (arch === 'jogger' ? 2.9 : arch === 'kid' ? 1.45 : arch === 'commuter' ? 1.65 : arch === 'drunk' ? 0.85 : arch === 'tourist' ? 1.15 : 1.3) * (0.9 + r() * 0.2);
    p.speed = p.baseSpeed;
    p.wobble = arch === 'drunk' ? 1 : 0;
    p.accessory = arch === 'commuter' && r() < 0.5 ? 4 : r() < 0.18 ? 1 : 0;
    p.idleT = 3 + r() * 14;
    p.health = 100;
    p.fall = 0;
    p.vx = p.vz = 0;
    p.screamed = false;
    p.buddy = null;
    p.seed = r();
  }

  /** Place a ped on the graph at a random spot; returns false when it would be seen or collide. */
  spawnWalker(): Ped | null {
    const p = this.free();
    if (!p) return null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const ei = this.net.randomEdge(this.rnd);
      const e = this.net.edges[ei]!;
      const s = this.rnd() * e.len;
      const t = s / e.len;
      const x = this.net.nx[e.a]! + (this.net.nx[e.b]! - this.net.nx[e.a]!) * t;
      const z = this.net.nz[e.a]! + (this.net.nz[e.b]! - this.net.nz[e.a]!) * t;
      const d = Math.hypot(x - this.focus.x, z - this.focus.z);
      if (d < 30 || d > 200) continue;
      if (e.cross && !this.signals.walk(e.axis)) continue;
      _p.set(x, G + 1, z);
      if (d < 130 && this.frustum.containsPoint(_p)) continue;
      const dist = this.districtAt(x, z);
      const weight = dist === 'downtown' ? 1 : dist === 'boardwalk' || dist === 'beach' ? 0.9 : dist === 'midtown' ? 0.7 : dist === 'residential' ? 0.5 : 0.3;
      if (this.rnd() > weight) continue;
      p.active = true;
      p.id = this.nextId++;
      this.outfit(p, this.archFor(dist, this.hour), dist);
      p.state = 'walk';
      p.edge = ei;
      p.dir = this.rnd() < 0.5 ? 1 : -1;
      p.s = p.dir === 1 ? s : e.len - s;
      p.lane = (this.rnd() - 0.5) * 1.6;
      p.phase = this.rnd() * 6;
      p.x = x; p.z = z; p.y = G;
      p.yaw = Math.atan2(this.net.nx[e.b]! - this.net.nx[e.a]!, this.net.nz[e.b]! - this.net.nz[e.a]!) + (p.dir === 1 ? 0 : Math.PI);
      p.onRoad = e.cross;
      return p;
    }
    return null;
  }

  /** Scripted pedestrian placed anywhere (ambient events use this). */
  place(x: number, z: number, arch: Arch, state: PedState, yaw = 0, district?: District | 'beach'): Ped | null {
    const p = this.free();
    if (!p) return null;
    p.active = true;
    p.id = this.nextId++;
    this.outfit(p, arch, district ?? this.districtAt(x, z));
    p.state = state;
    p.edge = -1;
    p.x = x; p.z = z; p.yaw = yaw;
    p.y = x < 215 ? terrainHeight(x, z) : G;
    p.phase = this.rnd() * 6;
    p.onRoad = false;
    p.stateT = 0;
    return p;
  }

  // ----------------------------------------------------------------------------------------- reactions

  /** A loud or alarming thing happened at (x, z): nearby pedestrians run, stare or film. */
  alarm(x: number, z: number, kind: 'gunshot' | 'crash' | 'siren'): void {
    for (const p of this.peds) {
      if (!p.active || p.state === 'down' || p.state === 'lie') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      const flee = kind === 'gunshot' ? 34 : kind === 'crash' ? 12 : 0;
      const film = kind === 'gunshot' ? 70 : kind === 'crash' ? 45 : 0;
      if (d < flee && this.rnd() < 0.9) this.startFlee(p, x, z, 7 + this.rnd() * 7);
      else if (d < film && p.state !== 'flee' && this.rnd() < (kind === 'crash' ? 0.6 : 0.3)) {
        p.state = 'film';
        p.stateT = 6 + this.rnd() * 6;
        p.tx = x; p.tz = z;
        p.accessory = 1;
      }
    }
  }

  /** Return a scripted pedestrian to ordinary life: back onto the nearest sidewalk. */
  resume(p: Ped): void {
    if (!p.active || p.state === 'down') return;
    p.state = 'walk';
    p.speed = p.baseSpeed;
    p.accessory = 0;
    if (p.arch === 'sunbather') p.arch = 'local';
    this.snapToGraph(p);
  }

  private startFlee(p: Ped, x: number, z: number, secs: number): void {
    if (p.state === 'down') return;
    p.state = 'flee';
    p.stateT = secs;
    p.tx = x; p.tz = z;
    p.speed = 4.4 + this.rnd() * 1.2;
    if (!p.screamed && this.screamT <= 0 && this.rnd() < 0.55) {
      p.screamed = true;
      this.screamT = 0.25;
      this.hooks?.scream(p.x, p.z);
    }
  }

  knockDown(p: Ped, vx: number, vz: number, damage = 100): void {
    p.health -= damage;
    if (p.health > 0) {
      this.startFlee(p, p.x - vx, p.z - vz, 9);
      return;
    }
    p.state = 'down';
    p.stateT = 0;
    p.vx = vx; p.vz = vz;
    p.fallSign = this.rnd() < 0.5 ? 1 : -1;
    p.fall = 0;
    p.onRoad = this.plan.roadAt(p.x, p.z).kind === 'road';
  }

  /** Bullet test against all pedestrians; returns the nearest hit (distance along the ray). */
  rayHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): { ped: Ped; t: number } | null {
    let best: { ped: Ped; t: number } | null = null;
    for (const p of this.peds) {
      if (!p.active || p.state === 'lie') continue;
      const lying = p.state === 'down' ? p.fall > 0.5 : false;
      const r = lying ? 0.7 : 0.34;
      const h = (lying ? 0.4 : 1.78) * p.look.h;
      // ray vs vertical cylinder (xz circle) then y range
      const fx = ox - p.x, fz = oz - p.z;
      const a = dx * dx + dz * dz;
      if (a < 1e-6) continue;
      const b = 2 * (fx * dx + fz * dz);
      const c = fx * fx + fz * fz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0 || t > maxDist || (best && t >= best.t)) continue;
      const y = oy + dy * t;
      if (y < p.y || y > p.y + h) continue;
      best = { ped: p, t };
    }
    return best;
  }

  // ------------------------------------------------------------------------------------------- update

  update(dt: number, vehicles: VehicleHit[], player: { x: number; z: number }): void {
    this.screamT -= dt;
    this.stats.active = this.stats.fleeing = this.stats.down = this.stats.crossing = 0;
    const net = this.net;
    for (const p of this.peds) {
      if (!p.active) continue;
      this.stats.active++;
      p.dist = Math.hypot(p.x - this.focus.x, p.z - this.focus.z);
      p.stateT -= dt;
      switch (p.state) {
        case 'walk': this.walk(p, dt); break;
        case 'wait': this.wait(p, dt); break;
        case 'idle':
          p.speed = 0;
          if (p.stateT <= 0) { p.state = 'walk'; p.speed = p.baseSpeed; }
          break;
        case 'flee': this.flee(p, dt); this.stats.fleeing++; break;
        case 'film':
          p.speed = 0;
          p.yaw = this.turnTo(p.yaw, Math.atan2(p.tx - p.x, p.tz - p.z), dt * 6);
          if (p.stateT <= 0) { p.state = p.edge >= 0 ? 'walk' : 'stand'; p.speed = p.baseSpeed; }
          break;
        case 'down':
          p.fall = Math.min(1, p.fall + dt * 3);
          p.x += p.vx * dt; p.z += p.vz * dt;
          p.vx *= Math.max(0, 1 - dt * 3.5); p.vz *= Math.max(0, 1 - dt * 3.5);
          p.stateT += 0; // counts up via stateT decrement below
          this.stats.down++;
          break;
        case 'path': this.pathWalk(p, dt); break;
        default: break; // stand / lie
      }
      // keep clear of the player and of moving vehicles
      if (p.state !== 'down' && p.state !== 'lie') {
        const dx = p.x - player.x, dz = p.z - player.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.9 && d > 0.01) { p.x += (dx / d) * (0.9 - d) * Math.min(1, dt * 8); p.z += (dz / d) * (0.9 - d) * Math.min(1, dt * 8); }
        for (const v of vehicles) {
          const rx = p.x - v.x, rz = p.z - v.z;
          const sp = Math.hypot(v.vx, v.vz);
          if (sp < 1.8 || Math.abs(rx) > 9 || Math.abs(rz) > 9) continue;
          // in the vehicle's frame
          const lx = rx * v.fz - rz * v.fx; // lateral
          const lz = rx * v.fx + rz * v.fz; // along
          if (Math.abs(lz) < v.hl + 0.3 && Math.abs(lx) < v.hw + 0.3) {
            if (sp > 3.5) { this.knockDown(p, v.vx * 0.55, v.vz * 0.55); this.alarm(p.x, p.z, 'crash'); }
          } else if (lz > 0 && lz < 11 + sp * 0.5 && Math.abs(lx) < v.hw + 2.2 && p.state !== 'flee' && sp > 5) {
            // the car is coming: sprint sideways out of its path
            this.startFlee(p, v.x, v.z, 2.5);
          }
        }
      }
      void net;
    }
    // down peds fade out after a while (stateT counted down from 0 → negative)
    for (const p of this.peds) {
      if (p.active && p.state === 'down') {
        p.idleT -= dt;
        if (p.idleT < -45) p.active = false;
      }
    }
    // despawn those far away or out of sight
    for (const p of this.peds) {
      if (!p.active || p.state === 'down' && p.dist < 90) continue;
      if (p.dist > 235) p.active = false;
      else if (p.dist > 120 && p.state === 'walk' && this.rnd() < dt * 0.15) {
        _p.set(p.x, G + 1, p.z);
        if (!this.frustum.containsPoint(_p)) p.active = false;
      }
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.12;
      let n = 0;
      for (const p of this.peds) if (p.active && p.edge >= 0) n++;
      if (n < this.target) {
        const w = this.spawnWalker();
        // occasionally a pair walking together
        if (w && this.rnd() < 0.22) {
          const b = this.free();
          if (b) {
            b.active = true; b.id = this.nextId++;
            this.outfit(b, w.arch === 'jogger' ? 'jogger' : 'local', this.districtAt(w.x, w.z));
            b.state = 'walk'; b.edge = w.edge; b.dir = w.dir; b.s = Math.max(0, w.s - 0.9 * w.dir); b.lane = w.lane + 0.7;
            b.baseSpeed = w.baseSpeed; b.speed = w.speed; b.x = w.x; b.z = w.z; b.y = G; b.onRoad = w.onRoad;
            b.buddy = w; b.phase = w.phase + 1.5;
          }
        }
      }
    }
  }

  private turnTo(cur: number, target: number, k: number): number {
    let d = target - cur;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return cur + d * Math.min(1, k);
  }

  /** Edge-following walk with junction decisions. */
  private walk(p: Ped, dt: number): void {
    const net = this.net;
    if (p.buddy) {
      const b = p.buddy;
      if (!b.active || b.state !== 'walk') p.buddy = null;
      else {
        const e = net.edges[b.edge]!;
        p.edge = b.edge; p.dir = b.dir; p.speed = b.speed;
        p.s = b.s - 0.85 * b.dir;
        if (p.s < 0 || p.s > e.len) p.s = Math.min(e.len, Math.max(0, p.s));
        this.placeOnEdge(p, dt);
        return;
      }
    }
    if (p.edge < 0) { p.state = 'stand'; return; }
    const e = net.edges[p.edge]!;
    // idle for a moment now and then
    if (!e.cross && p.idleT > 0) {
      p.idleT -= dt;
      if (p.idleT <= 0 && p.arch !== 'jogger' && p.arch !== 'commuter' && this.rnd() < 0.5) {
        p.state = 'idle';
        p.stateT = 2.5 + this.rnd() * 7;
        p.accessory = this.rnd() < 0.6 ? 1 : p.accessory;
        p.idleT = 12 + this.rnd() * 20;
        return;
      }
      if (p.idleT <= 0) p.idleT = 10 + this.rnd() * 20;
    }
    let sp = p.speed;
    if (e.cross && !this.signals.walk(e.axis)) sp *= 1.3; // hurry across once the light has turned
    p.s += sp * dt;
    if (p.s >= e.len) {
      this.arrive(p, e);
    } else {
      this.placeOnEdge(p, dt);
    }
    p.onRoad = e.cross;
    if (e.cross) this.stats.crossing++;
  }

  private arrive(p: Ped, e: PedEdge): void {
    const net = this.net;
    const node = p.dir === 1 ? e.b : e.a;
    const opts = net.adj[node]!.filter((k) => k !== p.edge);
    if (!opts.length) { p.dir = (p.dir === 1 ? -1 : 1); p.s = 0; return; }
    // prefer going straight, then crossing, then turning
    const dxIn = (net.nx[e.b]! - net.nx[e.a]!) * p.dir, dzIn = (net.nz[e.b]! - net.nz[e.a]!) * p.dir;
    const li = Math.hypot(dxIn, dzIn) || 1;
    let best = -1, total = 0;
    const weights = opts.map((k) => {
      const f = net.edges[k]!;
      const dir = f.a === node ? 1 : -1;
      const dx = (net.nx[f.b]! - net.nx[f.a]!) * dir, dz = (net.nz[f.b]! - net.nz[f.a]!) * dir;
      const dot = (dx * dxIn + dz * dzIn) / ((Math.hypot(dx, dz) || 1) * li);
      const w = dot > 0.8 ? 0.62 : f.cross ? 0.22 : 0.16;
      total += w;
      return w;
    });
    let t = this.rnd() * total;
    for (let i = 0; i < opts.length; i++) { if ((t -= weights[i]!) <= 0) { best = opts[i]!; break; } }
    if (best < 0) best = opts[0]!;
    const f = net.edges[best]!;
    p.edge = best;
    p.dir = f.a === node ? 1 : -1;
    p.s = 0;
    // wait at the kerb for the walk phase
    if (f.cross && !this.signals.walk(f.axis)) {
      p.state = 'wait';
      p.stateT = 0;
      p.speed = 0;
    }
  }

  private wait(p: Ped, dt: number): void {
    const e = this.net.edges[p.edge]!;
    p.speed = 0;
    p.stateT += dt;
    p.phase += dt * 0.5;
    // face the road
    const dx = this.net.nx[e.b]! - this.net.nx[e.a]!, dz = this.net.nz[e.b]! - this.net.nz[e.a]!;
    p.yaw = this.turnTo(p.yaw, Math.atan2(dx * p.dir, dz * p.dir), dt * 5);
    if (this.signals.walk(e.axis) || p.stateT > 40) {
      p.state = 'walk';
      p.speed = p.baseSpeed;
    }
  }

  private placeOnEdge(p: Ped, dt: number): void {
    const net = this.net;
    const e = net.edges[p.edge]!;
    const t = (p.dir === 1 ? p.s : e.len - p.s) / e.len;
    const ax = net.nx[e.a]!, az = net.nz[e.a]!, bx = net.nx[e.b]!, bz = net.nz[e.b]!;
    const dx = (bx - ax) * p.dir, dz = (bz - az) * p.dir;
    const l = Math.hypot(dx, dz) || 1;
    // lateral offset, perpendicular to the walking direction; crossings stay in the zebra
    const lat = e.cross ? p.lane * 0.35 : p.lane;
    let x = ax + (bx - ax) * t + (-dz / l) * lat;
    let z = az + (bz - az) * t + (dx / l) * lat;
    if (p.wobble) {
      const w = Math.sin(p.phase * 0.55 + p.seed * 9) * 0.5;
      x += (-dz / l) * w; z += (dx / l) * w;
    }
    p.x = x; p.z = z; p.y = G;
    p.yaw = this.turnTo(p.yaw, Math.atan2(dx, dz), dt * 8);
    p.phase += p.speed * dt * (p.arch === 'jogger' ? 2.6 : 3.2);
  }

  private flee(p: Ped, dt: number): void {
    let dx = p.x - p.tx, dz = p.z - p.tz;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    p.yaw = this.turnTo(p.yaw, Math.atan2(dx, dz), dt * 9);
    p.x += Math.sin(p.yaw) * p.speed * dt;
    p.z += Math.cos(p.yaw) * p.speed * dt;
    p.phase += p.speed * dt * 2.3;
    p.onRoad = this.plan.roadAt(p.x, p.z).kind === 'road';
    if (p.stateT <= 0) {
      // calm down and rejoin the nearest sidewalk edge
      p.state = 'walk';
      p.speed = p.baseSpeed;
      p.accessory = 0;
      this.snapToGraph(p);
    }
  }

  private snapToGraph(p: Ped): void {
    const net = this.net;
    let best = -1, bd = Infinity, bt = 0;
    for (let k = 0; k < net.edges.length; k++) {
      const e = net.edges[k]!;
      if (e.cross) continue;
      const ax = net.nx[e.a]!, az = net.nz[e.a]!, bx = net.nx[e.b]!, bz = net.nz[e.b]!;
      if (Math.abs(ax - p.x) > 140 && Math.abs(bx - p.x) > 140) continue;
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / (dx * dx + dz * dz)));
      const d = Math.hypot(p.x - (ax + dx * t), p.z - (az + dz * t));
      if (d < bd) { bd = d; best = k; bt = t; }
    }
    if (best < 0 || bd > 60) { p.active = false; return; }
    const e = net.edges[best]!;
    p.edge = best;
    p.dir = this.rnd() < 0.5 ? 1 : -1;
    p.s = p.dir === 1 ? bt * e.len : (1 - bt) * e.len;
    p.onRoad = false;
  }

  /** Strollers and joggers on the boardwalk: back and forth along a line. */
  private pathWalk(p: Ped, dt: number): void {
    const dx = p.tx - p.x, dz = p.tz - p.z;
    const l = Math.hypot(dx, dz);
    if (l < 1.5) { const sx = p.px, sz = p.pz; p.px = p.tx; p.pz = p.tz; p.tx = sx; p.tz = sz; return; }
    p.yaw = this.turnTo(p.yaw, Math.atan2(dx, dz), dt * 6);
    p.x += (dx / l) * p.speed * dt;
    p.z += (dz / l) * p.speed * dt;
    p.y = terrainHeight(p.x, p.z);
    p.phase += p.speed * dt * (p.arch === 'jogger' ? 2.6 : 3.2);
    if (p.wobble) p.x += Math.sin(p.phase * 0.6) * dt * 0.8;
  }
}

// ==================================================================================== instanced render

interface PartSpec { geo: THREE.BufferGeometry; cap: number; mat: THREE.Material }

export class PedRenderer {
  readonly group = new THREE.Group();
  readonly mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  readonly skinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0 });
  private readonly head: THREE.InstancedMesh;
  private readonly hair: THREE.InstancedMesh;
  private readonly torso: THREE.InstancedMesh;
  private readonly arms: THREE.InstancedMesh;
  private readonly legs: THREE.InstancedMesh;
  private readonly shoes: THREE.InstancedMesh;
  private readonly acc: THREE.InstancedMesh;
  private readonly col = new THREE.Color();

  constructor(cap: number) {
    const mk = (spec: PartSpec, shadow: boolean): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(spec.geo, spec.mat, spec.cap);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spec.cap * 3), 3);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = shadow;
      m.count = 0;
      this.group.add(m);
      return m;
    };
    this.head = mk({ geo: new THREE.SphereGeometry(0.115, 10, 8).scale(1, 1.15, 1.05), cap, mat: this.skinMat }, true);
    this.hair = mk({ geo: new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.58).translate(0, 0.012, -0.005), cap, mat: this.mat }, false);
    this.torso = mk({ geo: new THREE.BoxGeometry(0.4, 0.58, 0.22), cap, mat: this.mat }, true);
    this.arms = mk({ geo: new THREE.BoxGeometry(0.095, 0.56, 0.095).translate(0, -0.28, 0), cap: cap * 2, mat: this.mat }, false);
    this.legs = mk({ geo: new THREE.BoxGeometry(0.165, 0.84, 0.175).translate(0, -0.42, 0), cap: cap * 2, mat: this.mat }, true);
    this.shoes = mk({ geo: new THREE.BoxGeometry(0.17, 0.09, 0.3).translate(0, -0.84, 0.06), cap: cap * 2, mat: this.mat }, false);
    this.acc = mk({ geo: new THREE.BoxGeometry(1, 1, 1), cap: cap * 3, mat: this.mat }, false);
  }

  get materials(): THREE.Material[] {
    return [this.mat, this.skinMat];
  }

  private set(m: THREE.InstancedMesh, i: number, q: THREE.Quaternion, ox: number, oy: number, oz: number, bx: number, by: number, bz: number, sx: number, sy: number, sz: number, color: number): void {
    _v.set(ox, oy, oz).applyQuaternion(_qb);
    _p.set(bx + _v.x, by + _v.y, bz + _v.z);
    _m.compose(_p, q, _s.set(sx, sy, sz));
    m.setMatrixAt(i, _m);
    m.setColorAt(i, this.col.setHex(color));
  }

  sync(peds: Ped[]): void {
    let n = 0, na = 0, nl = 0, nacc = 0;
    for (const p of peds) {
      if (!p.active) continue;
      const L = p.look;
      const h = L.h, w = L.w;
      // body pose: yaw, forward lean when running, tipping over when down
      let pitch = 0;
      let lift = 0;
      const running = p.state === 'flee' || p.arch === 'jogger';
      if (running && p.speed > 2) pitch = 0.16;
      if (p.state === 'down') { pitch = p.fall * 1.45 * p.fallSign; lift = p.fall * 0.1; }
      if (p.state === 'lie') { pitch = -1.5; lift = 0.1; }
      if (p.state === 'idle' || p.state === 'wait' || p.state === 'film') pitch += Math.sin(p.phase + p.seed * 5) * 0.02;
      const bob = p.speed > 0.1 && p.state !== 'down' ? Math.abs(Math.sin(p.phase)) * 0.025 * h : 0;
      _q.setFromAxisAngle(_axisY, p.yaw);
      _q2.setFromAxisAngle(_axisX, pitch);
      _qb.copy(_q).multiply(_q2);
      const bx = p.x, by = p.y + lift + bob, bz = p.z;
      // limb angles about the hip / shoulder
      const moving = p.speed > 0.1 && p.state !== 'down';
      const amp = (running ? 0.95 : 0.55) * Math.min(1, p.speed / 1.3);
      const sw = moving ? Math.sin(p.phase) * amp : 0;
      let armL = moving ? sw * 0.8 * (running ? 1.3 : 1) : Math.sin(p.phase) * 0.03;
      let armR = -armL;
      let legL = sw, legR = -sw;
      if (p.state === 'down') { legL = 0.3; legR = -0.2; armL = 0.5; armR = -0.4; }
      if (p.state === 'film') { armL = -1.35; armR = -1.35; }
      else if (p.arch === 'protester' || p.accessory === 2) { armL = -2.85; armR = -2.85; }
      else if (p.accessory === 3) { armL = -0.9; armR = -0.55; }
      else if (p.accessory === 1 && p.state !== 'down' && p.state !== 'flee') armR = -1.2;

      this.set(this.head, n, _qb, 0, 1.6 * h, 0, bx, by, bz, w, h, w, L.skin);
      this.set(this.hair, n, _qb, 0, 1.6 * h, 0, bx, by, bz, w, h, w, L.hair);
      this.set(this.torso, n, _qb, 0, 1.17 * h, 0, bx, by, bz, w, h, w, L.shirt);
      n++;
      for (const side of [-1, 1]) {
        _q2.setFromAxisAngle(_axisX, side < 0 ? armL : armR);
        _q.copy(_qb).multiply(_q2);
        this.set(this.arms, na++, _q, side * 0.255 * w, 1.42 * h, 0, bx, by, bz, w, h, w, L.sleeve);
        _q2.setFromAxisAngle(_axisX, side < 0 ? legL : legR);
        _q.copy(_qb).multiply(_q2);
        this.set(this.legs, nl, _q, side * 0.095 * w, 0.84 * h, 0, bx, by, bz, w, h, w, L.pants);
        this.set(this.shoes, nl, _q, side * 0.095 * w, 0.84 * h, 0, bx, by, bz, w, h, w, L.shoe);
        nl++;
      }
      // accessories
      if (p.state === 'film' || (p.accessory === 1 && p.state !== 'down' && p.state !== 'flee')) {
        this.set(this.acc, nacc++, _qb, 0.255 * w, 1.3 * h, 0.5 * h, bx, by, bz, 0.07, 0.14, 0.015, 0x111214);
      } else if (p.accessory === 4) {
        this.set(this.acc, nacc++, _qb, -0.3 * w, 0.62 * h, 0.04, bx, by, bz, 0.34, 0.26, 0.1, 0x2a2018);
      } else if (p.accessory === 2 || p.arch === 'protester') {
        this.set(this.acc, nacc++, _qb, 0, 2.18 * h, 0.05, bx, by, bz, 0.78, 0.5, 0.03, [0xf5f5f0, 0xffd23c, 0xff4f4f][p.id % 3]!);
      } else if (p.accessory === 3) {
        this.set(this.acc, nacc++, _qb, 0.18 * w, 0.95 * h, 0.28, bx, by, bz, 0.34, 0.4, 0.09, 0x8a5a2a);
        this.set(this.acc, nacc++, _qb, 0.25 * w, 1.2 * h, 0.5, bx, by, bz, 0.06, 0.5, 0.045, 0x2a1a0e);
      }
      if (p.state === 'lie') {
        _qb.copy(_q.setFromAxisAngle(_axisY, p.yaw));
        this.set(this.acc, nacc++, _qb, 0, 0.0, 0, bx, p.y, bz, 0.95, 0.03, 1.9, [0xff7ab0, 0x4fd0ff, 0xffe14d, 0xf5f5f0][p.id % 4]!);
      }
    }
    this.head.count = this.hair.count = this.torso.count = n;
    this.arms.count = na;
    this.legs.count = this.shoes.count = nl;
    this.acc.count = nacc;
    for (const m of [this.head, this.hair, this.torso, this.arms, this.legs, this.shoes, this.acc]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
