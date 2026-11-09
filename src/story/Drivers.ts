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
    // aim point: a look-ahead along the path, clamped by the straight target when near
    const speed = v.speed;
    const look = 9 + Math.abs(speed) * 0.55;
    let ax = tgt.x, az = tgt.z;
    if (dist > look * 1.2 && d.path.length > 1) {
      // advance past the points we have reached, then walk `look` metres along the polyline
      while (d.pi < d.path.length - 2 && Math.hypot(d.path[d.pi + 1]![0] - px, d.path[d.pi + 1]![1] - pz) < Math.max(7, look * 0.5)) d.pi++;
      let rem = look;
      let cx = px, cz = pz;
      for (let i = d.pi + 1; i < d.path.length; i++) {
        const nx = d.path[i]![0], nz = d.path[i]![1];
        const seg = Math.hypot(nx - cx, nz - cz);
        if (seg >= rem) { ax = cx + (nx - cx) * (rem / seg); az = cz + (nz - cz) * (rem / seg); break; }
        rem -= seg; cx = nx; cz = nz; ax = nx; az = nz;
      }
    }
    _f.set(0, 0, -1).applyQuaternion(v.quaternion);
    const tx = ax - px, tz = az - pz;
    const tl = Math.hypot(tx, tz) || 1;
    const dot = (_f.x * tx + _f.z * tz) / tl;
    const crossY = (_f.z * tx - _f.x * tz) / tl;
    const ang = Math.atan2(-crossY, dot);

    // speed plan: slow for sharp turns, never exceed cruise
    const cruise = (d.o.kmh ?? 60) / 3.6;
    let want = cruise * (1 - clamp(Math.abs(ang) / 1.3, 0, 0.72));
    if (d.o.aggressive) want = Math.max(want, cruise * 0.5);
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
