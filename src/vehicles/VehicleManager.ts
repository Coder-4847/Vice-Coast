import * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import { terrainHeight } from '../world/Terrain';
import { Vehicle } from './Vehicle';
import { VEHICLES } from './specs';

/** Owns every vehicle in the world: spawning, stepping, interpolation, and "what can the player enter?". */
export class VehicleManager {
  readonly vehicles: Vehicle[] = [];
  readonly group = new THREE.Group();
  /** Builds the visual for a vehicle (set once the model code is loaded). */
  modelFactory: ((v: Vehicle) => THREE.Object3D) | null = null;
  private readonly models = new Map<Vehicle, THREE.Object3D>();

  constructor(private readonly physics: Physics) {}

  spawn(id: string, x: number, z: number, yaw: number, color?: string): Vehicle {
    const spec = VEHICLES[id];
    if (!spec) throw new Error(`Unknown vehicle ${id}`);
    const y = Math.max(terrainHeight(x, z), 0);
    const v = new Vehicle(this.physics, spec, x, y, z, yaw);
    if (color) (v as { paintOverride?: string }).paintOverride = color;
    this.vehicles.push(v);
    if (this.modelFactory) {
      const m = this.modelFactory(v);
      this.models.set(v, m);
      this.group.add(m);
    }
    return v;
  }

  /** Attach visuals to vehicles that were spawned before the model factory existed. */
  attachModels(): void {
    if (!this.modelFactory) return;
    for (const v of this.vehicles) {
      if (this.models.has(v)) continue;
      const m = this.modelFactory(v);
      this.models.set(v, m);
      this.group.add(m);
    }
  }

  modelOf(v: Vehicle): THREE.Object3D | undefined {
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
        m.position.copy(v.position);
        m.quaternion.copy(v.quaternion);
      }
    }
  }

  /** The nearest vehicle whose driver door is within reach of `pos`, if any. */
  nearestEnterable(pos: THREE.Vector3, maxDist = 3.4): Vehicle | null {
    let best: Vehicle | null = null;
    let bestD = maxDist;
    const door = new THREE.Vector3();
    for (const v of this.vehicles) {
      if (v.occupied) continue;
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
