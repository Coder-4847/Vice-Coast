import * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import { terrainHeight } from '../world/Terrain';
import { Vehicle } from './Vehicle';
import { VEHICLES, type VehicleSpec } from './specs';
import { BikeModel } from './BikeModel';
import { CarModel } from './CarModel';
import type { Outfit, OwnedVehicle, VehicleCustom } from '../economy/types';

/** Common surface of CarModel / BikeModel. */
export interface VehicleVisual {
  group: THREE.Group;
  materials: THREE.Material[];
  update(): void;
  applyOutfit?(o: Outfit): void;
  applyCustom?(c: VehicleCustom): void;
  setLights(headlights: boolean, braking: boolean, reversing: boolean, night: number): void;
}

export function createVisual(v: Vehicle): VehicleVisual {
  return v.spec.kind === 'bike' ? new BikeModel(v) : new CarModel(v);
}

/** Owns every vehicle in the world: spawning, stepping, interpolation, and "what can the player enter?". */
export class VehicleManager {
  readonly vehicles: Vehicle[] = [];
  readonly group = new THREE.Group();
  /** Called for each new visual so the world can register its materials (shadows, fog). */
  onVisual: ((visual: VehicleVisual) => void) | null = null;
  /** 0 = day … 1 = night; set each frame for lights. */
  night = 0;
  private readonly models = new Map<Vehicle, VehicleVisual>();

  constructor(private readonly physics: Physics) {}

  spawn(id: string, x: number, z: number, yaw: number, color?: string): Vehicle {
    const spec = VEHICLES[id];
    if (!spec) throw new Error(`Unknown vehicle ${id}`);
    const y = Math.max(terrainHeight(x, z), 0);
    const v = new Vehicle(this.physics, spec, x, y, z, yaw);
    v.home = { x, z, yaw };
    if (color) (v as { paintOverride?: string }).paintOverride = color;
    this.vehicles.push(v);
    const visual = createVisual(v);
    this.models.set(v, visual);
    this.group.add(visual.group);
    this.onVisual?.(visual);
    if (this.outfit) visual.applyOutfit?.(this.outfit);
    return v;
  }

  outfit: Outfit | null = null;

  /** An owned vehicle with its performance parts applied to a copy of the spec, and its paint on the model. */
  spawnOwned(o: OwnedVehicle, x: number, z: number, yaw: number): Vehicle {
    const base = VEHICLES[o.spec];
    if (!base) throw new Error(`Unknown vehicle ${o.spec}`);
    const spec = tuneSpec(base, o.custom);
    const y = Math.max(terrainHeight(x, z), 0);
    const v = new Vehicle(this.physics, spec, x, y, z, yaw);
    v.home = { x, z, yaw };
    v.ownedUid = o.uid;
    v.custom = o.custom;
    this.vehicles.push(v);
    const visual = createVisual(v);
    this.models.set(v, visual);
    this.group.add(visual.group);
    this.onVisual?.(visual);
    visual.applyCustom?.(o.custom);
    if (this.outfit) visual.applyOutfit?.(this.outfit);
    return v;
  }

  /** Repaint / re-tune a live owned vehicle in place (the tuning shop). */
  recustom(v: Vehicle, c: VehicleCustom): void {
    v.custom = c;
    this.models.get(v)?.applyCustom?.(c);
  }

  setOutfit(o: Outfit): void {
    this.outfit = o;
    for (const m of this.models.values()) m.applyOutfit?.(o);
  }

  /** Remove a vehicle (stored in a garage, sold, or replaced). */
  remove(v: Vehicle): void {
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
    const m = this.models.get(v);
    if (m) { this.group.remove(m.group); this.models.delete(v); }
    v.dispose();
  }

  /** Put every vehicle back in its slot, repaired (after a wasted / busted respawn). */
  resetAll(): void {
    for (const v of this.vehicles) {
      if (v.occupied || !v.home) continue;
      v.health = 1000;
      v.exploded = false;
      for (const w of v.wheels) w.popped = false;
      v.teleport(v.home.x, Math.max(terrainHeight(v.home.x, v.home.z), 0), v.home.z, v.home.yaw);
      const m = this.models.get(v);
      if (m) for (const mat of m.materials) { const c = (mat as THREE.MeshStandardMaterial).color; if (c && (mat as { userData: { burnt?: boolean } }).userData.burnt) { c.multiplyScalar(4); (mat as { userData: { burnt?: boolean } }).userData.burnt = false; } }
    }
  }

  visualOf(v: Vehicle): VehicleVisual | undefined {
    return this.models.get(v);
  }

  fixedUpdate(dt: number): void {
    for (const v of this.vehicles) v.fixedUpdate(dt);
  }

  /** Per rendered frame: place the models on the interpolated physics transforms. */
  update(alpha: number): void {
    for (const v of this.vehicles) {
      v.interpolate(alpha);
      const m = this.models.get(v);
      if (m) {
        m.group.position.copy(v.position);
        m.group.quaternion.copy(v.quaternion);
        m.update();
        m.setLights(v.headlights, v.braking, v.reversing, this.night);
      }
    }
  }

  /** The nearest vehicle whose driver door is within reach of `pos`, if any. */
  nearestEnterable(pos: THREE.Vector3, maxDist = 3.4): Vehicle | null {
    let best: Vehicle | null = null;
    let bestD = maxDist;
    const door = new THREE.Vector3();
    for (const v of this.vehicles) {
      if (v.occupied || v.exploded) continue;
      this.doorWorld(v, door);
      const d = Math.hypot(door.x - pos.x, door.z - pos.z);
      // also allow approaching the nearest body corner
      const dc = v.position.distanceTo(pos) - Math.max(v.spec.size.length, v.spec.size.width) * 0.5;
      const dd = Math.min(d, dc + 0.8);
      if (dd < bestD && Math.abs(door.y - pos.y) < 2.5) {
        best = v;
        bestD = dd;
      }
    }
    return best;
  }

  /** World position of the driver's door handle. */
  doorWorld(v: Vehicle, out: THREE.Vector3): THREE.Vector3 {
    out.set(v.spec.doorSide * (v.spec.size.width / 2 + 0.35), -v.spec.comHeight + 0.2, v.spec.seat.z - 0.1);
    return out.applyQuaternion(v.quaternion).add(v.position);
  }
}

/** Performance parts → a copy of the spec with more power, bite and grip. */
export function tuneSpec(base: VehicleSpec, c: VehicleCustom): VehicleSpec {
  const p = c.perf;
  if (!p.engine && !p.brakes && !p.suspension && !p.turbo) return base;
  const s = structuredClone(base) as VehicleSpec;
  s.engine.peakTorque *= 1 + 0.07 * p.engine + (p.turbo ? 0.1 : 0);
  s.engine.topSpeedKmh *= 1 + 0.025 * p.engine + (p.turbo ? 0.03 : 0);
  if (p.turbo) s.engine.turbo = true;
  s.brake.force *= 1 + 0.12 * p.brakes;
  s.grip.lat *= 1 + 0.03 * p.suspension;
  s.grip.long *= 1 + 0.02 * p.brakes + 0.015 * p.suspension;
  s.suspension.antiRoll *= 1 + 0.12 * p.suspension;
  s.suspension.dampingRatio = Math.min(0.95, s.suspension.dampingRatio * (1 + 0.04 * p.suspension));
  return s;
}
