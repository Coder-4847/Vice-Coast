import * as THREE from 'three';
import type { Game } from '../Game';
import type { Vehicle } from '../vehicles/Vehicle';
import { terrainHeight } from '../world/Terrain';

export interface DriverOpts {
  /** Where to go (re-read every update; return null to coast). */
  target: () => { x: number; z: number } | null;
  /** Cruise speed in km/h. */
  kmh?: number;
  /** Rams and cuts corners hard (chasers). */
  aggressive?: boolean;
  /** Stop when within this many metres of the target (0 = never stop). */
  arrive?: number;
  onArrive?: () => void;
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const _f = new THREE.Vector3();

/** A scripted driver: follows the road network to a target with pure pursuit, unsticks itself, and brakes for bends. */
export class Driver {
  path: [number, number][] = [];
  pi = 0;
  repath = 0;
  stuck = 0;
  reverse = 0;
  lastX = 0;
  lastZ = 0;
  arrived = false;
  /** Seconds the car has been wedged badly enough to be teleported. */
  rescues = 0;

  constructor(readonly v: Vehicle, readonly o: DriverOpts) {
    this.lastX = v.position.x;
    this.lastZ = v.position.z;
  }
}

export class Drivers {
  private readonly list: Driver[] = [];

  constructor(private readonly g: Game) {}

  drive(v: Vehicle, o: DriverOpts): Driver {
    const d = new Driver(v, o);
    v.occupied = true;
    this.list.push(d);
    return d;
  }

  stop(v: Vehicle): void {
    const i = this.list.findIndex((d) => d.v === v);
    if (i >= 0) this.list.splice(i, 1);
    v.input.throttle = 0; v.input.brake = 0.6; v.input.steer = 0; v.input.handbrake = false;
  }

  /** Stop driving and let a car be parked. */
  release(v: Vehicle): void {
    this.stop(v);
    v.occupied = false;
  }

  clear(): void {
    for (const d of this.list) { d.v.occupied = false; d.v.input.throttle = 0; d.v.input.brake = 0.5; d.v.input.steer = 0; }
    this.list.length = 0;
  }

  get active(): number { return this.list.length; }

  fixedUpdate(dt: number): void {
    for (const d of [...this.list]) this.drive1(d, dt);
  }

  private drive1(d: Driver, dt: number): void {
    const v = d.v;
    if (v.exploded || v.health <= 0) { this.stop(v); return; }
    const tgt = d.o.target();
    const inp = v.input;
    if (!tgt) { inp.throttle = 0; inp.brake = 0.4; inp.steer = 0; return; }
    const px = v.position.x, pz = v.position.z;
    const dist = Math.hypot(tgt.x - px, tgt.z - pz);
    if (d.o.arrive && dist < d.o.arrive) {
      inp.throttle = 0; inp.brake = 1; inp.steer = 0;
      if (!d.arrived) { d.arrived = true; d.o.onArrive?.(); }
      return;
    }
    d.arrived = false;

    // route: recompute every few seconds, and straight at it when close
    d.repath -= dt;
    if (d.repath <= 0) {
      d.repath = d.o.aggressive ? 1.6 : 3.5;
      const r = this.g.map.router.route(px, pz, tgt.x, tgt.z);
      d.path = r.pts as [number, number][];
      d.pi = 0;
    }
    // follow the path: find where we are on it, then aim `look` metres further along
    const speed = v.speed;
    const look = Math.max(9, Math.min(30, 6 + Math.abs(speed) * 0.9));
    let ax = tgt.x, az = tgt.z;
    let bend = 0;
    if (d.path.length > 1 && dist > look * 1.1) {
      const P = d.path;
      // closest point on the next few segments (progress only moves forward)
      let bi = d.pi, bd = Infinity, bt = 0;
      for (let i = d.pi; i < Math.min(P.length - 1, d.pi + 8); i++) {
        const x0 = P[i]![0], z0 = P[i]![1], x1 = P[i + 1]![0], z1 = P[i + 1]![1];
        const sx = x1 - x0, sz = z1 - z0, sl = sx * sx + sz * sz || 1;
        const t = clamp(((px - x0) * sx + (pz - z0) * sz) / sl, 0, 1);
        const qx = x0 + sx * t, qz = z0 + sz * t;
        const dd = (px - qx) * (px - qx) + (pz - qz) * (pz - qz);
        if (dd < bd) { bd = dd; bi = i; bt = t; }
      }
      d.pi = bi;
      // walk `look` metres along the polyline from the projection
      let i = bi;
      let cx = P[i]![0] + (P[i + 1]![0] - P[i]![0]) * bt, cz = P[i]![1] + (P[i + 1]![1] - P[i]![1]) * bt;
      let rem = look;
      let ahead = 0;
      const h0 = Math.atan2(P[i + 1]![0] - P[i]![0], P[i + 1]![1] - P[i]![1]);
      while (i < P.length - 1) {
        const nx = P[i + 1]![0], nz = P[i + 1]![1];
        const seg = Math.hypot(nx - cx, nz - cz);
        if (seg >= rem) { const k = seg > 1e-6 ? rem / seg : 0; ax = cx + (nx - cx) * k; az = cz + (nz - cz) * k; rem = 0; break; }
        rem -= seg; ahead += seg; cx = nx; cz = nz; ax = nx; az = nz; i++;
        if (ahead < 34 && i < P.length - 1) {
          const h1 = Math.atan2(P[i + 1]![0] - P[i]![0], P[i + 1]![1] - P[i]![1]);
          bend = Math.max(bend, Math.abs(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0))));
        }
      }
    }
    _f.set(0, 0, -1).applyQuaternion(v.quaternion);
    const tx = ax - px, tz = az - pz;
    const tl = Math.hypot(tx, tz) || 1;
    const dot = (_f.x * tx + _f.z * tz) / tl;
    const crossY = (_f.z * tx - _f.x * tz) / tl;
    const ang = Math.atan2(-crossY, dot);

    // speed plan: slow for the bend ahead and for sharp heading errors, never exceed cruise
    const cruise = (d.o.kmh ?? 60) / 3.6;
    let want = cruise * (1 - clamp(Math.max(bend * 0.9, Math.abs(ang) * 0.6) / 1.3, 0, 0.78));
    if (d.o.aggressive) want = Math.max(want, cruise * 0.45);
    if (d.o.arrive) want = Math.min(want, Math.max(4, dist * 0.35));

    // unstick: if we are barely moving while asking for throttle, back up for a second
    const moved = Math.hypot(px - d.lastX, pz - d.lastZ);
    d.lastX = px; d.lastZ = pz;
    if (d.reverse > 0) {
      d.reverse -= dt;
      inp.throttle = 0; inp.brake = 0.9; inp.steer = -clamp(ang * 1.6, -1, 1);
      if (d.reverse <= 0) d.stuck = 0;
      return;
    }
    if (Math.abs(speed) < 0.8 && want > 3 && moved < dt * 0.4) d.stuck += dt; else d.stuck = Math.max(0, d.stuck - dt * 2);
    if (d.stuck > 1.6) {
      d.reverse = 1.3; d.stuck = 0; d.rescues++;
      if (d.rescues > 4) {
        // wedged for good: put it on the path ahead
        const p = d.path[Math.min(d.path.length - 1, d.pi + 2)];
        if (p) { v.teleport(p[0], Math.max(terrainHeight(p[0], p[1]), 0), p[1], Math.atan2(-_f.x, -_f.z)); d.rescues = 0; }
      }
      return;
    }

    inp.steer = clamp(ang * 1.7, -1, 1);
    inp.throttle = clamp((want - speed) * 0.5, 0, 1);
    inp.brake = speed > want + 2 ? clamp((speed - want) * 0.25, 0, 1) : 0;
    inp.handbrake = Math.abs(ang) > 1.7 && speed > 8;
  }
}
