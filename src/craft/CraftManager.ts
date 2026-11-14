import * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import { terrainHeight, waterLevelAt } from '../world/Terrain';
import { Craft } from './Craft';
import { CRAFT } from './specs';
import { createCraftVisual, type CraftVisual } from './models';

const _d = new THREE.Vector3();

/** Owns every boat, helicopter and plane: spawning, simulation range, interpolation and "what can the player board?". */
export class CraftManager {
  readonly crafts: Craft[] = [];
  readonly group = new THREE.Group();
  private readonly visuals = new Map<Craft, CraftVisual>();
  /** Crafts further than this from the player are parked (their physics is asleep). */
  simRadius = 300;
  night = 0;

  constructor(private readonly physics: Physics) {}

  spawn(id: string, x: number, z: number, yaw: number, o: { y?: number; paint?: number } = {}): Craft {
    const spec = CRAFT[id];
    if (!spec) throw new Error(`Unknown craft ${id}`);
    const ground = Math.max(terrainHeight(x, z), waterLevelAt(x, z));
    const y = o.y ?? (spec.kind === 'boat' ? waterLevelAt(x, z) - spec.boat!.draft * 0.5 + 0.1 : ground);
    const c = new Craft(this.physics, spec, x, y, z, yaw);
    c.home = { x, y, z, yaw };
    if (o.paint !== undefined) c.paint = o.paint;
    else c.paint = spec.paints[Math.floor((x * 7 + z * 13) % spec.paints.length + spec.paints.length) % spec.paints.length]!;
    this.crafts.push(c);
    const v = createCraftVisual(spec, c.paint);
    this.visuals.set(c, v);
    this.group.add(v.group);
    return c;
  }

  /** Take a craft out of the world (sold). */
  remove(c: Craft): void {
    const i = this.crafts.indexOf(c);
    if (i < 0 || c.occupied) return;
    this.crafts.splice(i, 1);
    const v = this.visuals.get(c);
    if (v) { this.group.remove(v.group); v.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); }
    this.visuals.delete(c);
    c.dispose();
  }

  /** After a wasted / busted respawn: unattended craft go back to their berths, repaired. */
  resetAll(): void {
    for (const c of this.crafts) {
      if (c.occupied || !c.home) continue;
      c.teleport(c.home.x, c.home.y, c.home.z, c.home.yaw);
    }
  }

  byCollider(handle: number): Craft | null {
    for (const c of this.crafts) if (c.collider.handle === handle) return c;
    return null;
  }

  fixedUpdate(dt: number, fx: number, fz: number, waves: number): void {
    for (const c of this.crafts) {
      const d = Math.hypot(c.position.x - fx, c.position.z - fz);
      c.setActive(c.occupied || d < this.simRadius);
      if (c.spec.kind === 'boat') c.setWeather(waves);
      c.fixedUpdate(dt);
    }
  }

  update(alpha: number, camera: THREE.Camera): void {
    for (const c of this.crafts) {
      const v = this.visuals.get(c)!;
      const d = _d.copy(c.position).sub(camera.position).length();
      v.group.visible = d < 1800;
      if (!v.group.visible) continue;
      if (c.active || c.occupied) c.interpolate(alpha);
      v.group.position.copy(c.position);
      v.group.quaternion.copy(c.quaternion);
      v.update(c, 0);
      v.setNight(this.night);
    }
  }

  /** The nearest boardable craft whose door is within reach of `pos`. */
  nearestEnterable(pos: THREE.Vector3, maxDist = 3.8): Craft | null {
    let best: Craft | null = null;
    let bd = maxDist;
    const door = new THREE.Vector3();
    for (const c of this.crafts) {
      if (c.occupied || c.exploded) continue;
      this.doorWorld(c, door);
      const d = Math.hypot(door.x - pos.x, door.z - pos.z);
      const dc = Math.max(0, c.position.distanceTo(pos) - Math.max(c.spec.size.length, c.spec.size.width) * 0.35);
      const dd = Math.min(d, dc + 0.6);
      if (dd < bd && Math.abs(door.y - pos.y) < 3.2) { best = c; bd = dd; }
    }
    return best;
  }

  doorWorld(c: Craft, out: THREE.Vector3): THREE.Vector3 {
    const s = c.spec;
    out.set(s.doorSide * (s.hull.w / 2 + 0.5), -s.comHeight + 0.5, s.seat.z);
    return out.applyQuaternion(c.quaternion).add(c.position);
  }
}
