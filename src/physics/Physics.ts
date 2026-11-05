import * as THREE from 'three';
import type { Collider, Ray, RigidBody, World as RapierWorld } from '@dimforge/rapier3d-compat';
import { terrainHeight, TERRAIN, CITY } from '../world/Terrain';

type Rapier = typeof import('@dimforge/rapier3d-compat').default;

export type Surface = 'concrete' | 'asphalt' | 'dirt' | 'sand' | 'metal' | 'wood' | 'glass' | 'water' | 'flesh';

/** Collision groups: membership in the high 16 bits, filter in the low 16. */
export const GROUP = {
  WORLD: 0x0001,
  PROP: 0x0002,
  PLAYER: 0x0004,
  VEHICLE: 0x0008,
} as const;
export const groups = (member: number, filter: number): number => ((member << 16) | filter) >>> 0;

export interface RayHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  surface: Surface;
  collider: Collider | null;
  /** Set when the hit collider belongs to a registered dynamic prop. */
  body: RigidBody | null;
}

/** Result of a wheel/ground probe; written in place to avoid per-frame allocation. */
export interface Probe {
  hit: boolean;
  distance: number;
  px: number; py: number; pz: number;
  nx: number; ny: number; nz: number;
  surface: Surface;
}
export const newProbe = (): Probe => ({ hit: false, distance: 0, px: 0, py: 0, pz: 0, nx: 0, ny: 1, nz: 0, surface: 'asphalt' });

export interface BuildingBox {
  cx: number; cy: number; cz: number;
  hx: number; hy: number; hz: number;
  /** Yaw in radians (stadium segments, villas). */
  ry?: number;
  /** Facade mode (see city MODE): lets bullets tell glass from wall. */
  win?: number;
  /** Cylinder (radius = hx) instead of a cuboid. */
  cyl?: boolean;
}

const HEIGHT_CELL = 8; // metres per heightfield cell
/** Physics runs at 60 × SUBSTEPS Hz so stiff vehicle suspension stays stable. */
export const SUBSTEPS = 2;

/**
 * Rapier world + the static colliders of the Phase 3 test world, with material-aware ray queries
 * (used for bullets, ledge detection and ground probing).
 */
export class Physics {
  readonly world: RapierWorld;
  private readonly surfaces = new Map<number, Surface>();
  /** Streamed city colliders, keyed by collider handle. */
  private readonly buildingBoxes = new Map<number, BuildingBox>();
  private readonly buildingBodies = new Map<number, Collider>();
  private terrainCollider: Collider | null = null;
  /** City plan lookup: road / pavement / lot, so tyres and bullets can tell them apart. */
  groundHook: ((x: number, z: number) => Surface) | null = null;
  /** Bodies of registered dynamic props, keyed by collider handle. */
  private readonly propBodies = new Map<number, RigidBody>();

  private constructor(readonly R: Rapier) {
    this.world = new R.World({ x: 0, y: -16, z: 0 });
    this.world.timestep = 1 / (60 * SUBSTEPS);
  }

  /** Loads the (large, WASM-inlined) Rapier chunk on demand. */
  static async create(): Promise<Physics> {
    const mod = await import('@dimforge/rapier3d-compat');
    const R = mod.default;
    await R.init();
    return new Physics(R);
  }

  /** Hooks run before every physics sub-step (vehicle tyre/suspension forces). */
  readonly substepHooks: ((h: number) => void)[] = [];

  /** Advance one 1/60 s frame as SUBSTEPS physics steps. */
  step(): void {
    const h = 1 / (60 * SUBSTEPS);
    for (let i = 0; i < SUBSTEPS; i++) {
      for (const hook of this.substepHooks) hook(h);
      this.world.step();
    }
  }

  // -------------------------------------------------------------------- static world

  /** Heightfield collider sampled from the same function that shapes the visual terrain. */
  buildTerrain(): void {
    if (this.terrainCollider) return;
    const w = TERRAIN.x1 - TERRAIN.x0;
    const d = TERRAIN.z1 - TERRAIN.z0;
    const cols = Math.round(w / HEIGHT_CELL);
    const rows = Math.round(d / HEIGHT_CELL);
    const heights = new Float32Array((rows + 1) * (cols + 1));
    // Rapier heightfields are column-major: heights[col * (rows + 1) + row], rows run along z.
    for (let c = 0; c <= cols; c++) {
      const x = TERRAIN.x0 + (c / cols) * w;
      for (let r = 0; r <= rows; r++) {
        const z = TERRAIN.z0 + (r / rows) * d;
        heights[c * (rows + 1) + r] = terrainHeight(x, z);
      }
    }
    const desc = this.R.ColliderDesc.heightfield(rows, cols, heights, { x: w, y: 1, z: d })
      .setTranslation((TERRAIN.x0 + TERRAIN.x1) / 2, 0, (TERRAIN.z0 + TERRAIN.z1) / 2)
      .setFriction(0.9)
      .setCollisionGroups(groups(GROUP.WORLD, GROUP.PLAYER | GROUP.PROP));
    this.terrainCollider = this.world.createCollider(desc);
  }

  /** Add static colliders for city geometry (one chunk at a time); returns handles for removal. */
  addBuildings(boxes: BuildingBox[]): number[] {
    const handles: number[] = [];
    for (const b of boxes) {
      const desc = b.cyl
        ? this.R.ColliderDesc.cylinder(b.hy, b.hx)
        : this.R.ColliderDesc.cuboid(b.hx, b.hy, b.hz);
      desc.setTranslation(b.cx, b.cy, b.cz).setFriction(0.6).setCollisionGroups(groups(GROUP.WORLD, GROUP.PLAYER | GROUP.PROP));
      if (b.ry) desc.setRotation({ x: 0, y: Math.sin(b.ry / 2), z: 0, w: Math.cos(b.ry / 2) });
      const col = this.world.createCollider(desc);
      this.buildingBoxes.set(col.handle, b);
      this.buildingBodies.set(col.handle, col);
      handles.push(col.handle);
    }
    return handles;
  }

  removeBuildings(handles: number[]): void {
    for (const h of handles) {
      const c = this.buildingBodies.get(h);
      if (c) this.world.removeCollider(c, false);
      this.buildingBodies.delete(h);
      this.buildingBoxes.delete(h);
    }
  }

  get buildingCount(): number {
    return this.buildingBodies.size;
  }

  /** Register a fixed or dynamic collider's surface type. */
  tagSurface(collider: Collider, surface: Surface, body?: RigidBody): void {
    this.surfaces.set(collider.handle, surface);
    if (body) this.propBodies.set(collider.handle, body);
  }

  forget(collider: Collider): void {
    this.surfaces.delete(collider.handle);
    this.propBodies.delete(collider.handle);
  }

  // ------------------------------------------------------------------------ queries

  /** What a point on the terrain is made of (city paving vs beach sand vs dirt). */
  groundSurface(x: number, y: number): Surface {
    const inCity = Math.hypot(x - CITY.x, y - CITY.z) < CITY.flat - 20 && x > 200;
    if (inCity) return this.groundHook ? this.groundHook(x, y) : 'asphalt';
    if (x < 220 && terrainHeight(x, y) < 3.6) return 'sand';
    return 'dirt';
  }

  /** Window test mirroring the facade shader, so shots at glass sound and spark like glass. */
  private isWindow(b: BuildingBox, p: THREE.Vector3, n: THREE.Vector3): boolean {
    const mode = b.win ?? 2;
    if (Math.abs(n.y) >= 0.5 || b.ry || b.cyl || mode === 0 || mode >= 4) return false;
    const lx = p.x - (b.cx - b.hx);
    const ly = p.y - (b.cy - b.hy);
    const lz = p.z - (b.cz - b.hz);
    const sizeY = b.hy * 2;
    const fcx = Math.abs(n.x) > Math.abs(n.z) ? lz : lx;
    if (mode === 3) return ly > sizeY - 5 && ly < sizeY - 2.2;
    if (ly <= 4.5 || ly >= sizeY - 1.2) return false;
    if (mode === 1) {
      const fx = (fcx / 2.6) % 1, fy = (ly / 3.7) % 1;
      return fx > 0.05 && fx < 0.95 && fy > 0.08 && fy < 0.9;
    }
    const fx = (fcx / 3.4) % 1;
    const fy = (ly / 3.8) % 1;
    return fx > 0.16 && fx < 0.84 && fy > 0.2 && fy < 0.82;
  }

  private readonly _ray = { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 1 } };

  /**
   * Cast a ray through the world. Includes an implicit sea surface at y = 0 so bullets splash.
   * `exclude` lets the shooter ignore its own collider.
   */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, exclude?: Collider, mask = GROUP.WORLD | GROUP.PROP): RayHit | null {
    const r = this._ray;
    r.origin.x = origin.x; r.origin.y = origin.y; r.origin.z = origin.z;
    r.dir.x = dir.x; r.dir.y = dir.y; r.dir.z = dir.z;
    const hit = this.world.castRayAndGetNormal(
      r as unknown as Ray, maxDist, true, undefined, groups(0xffff, mask), exclude,
    );
    let best: RayHit | null = null;
    if (hit) {
      const point = new THREE.Vector3(origin.x + dir.x * hit.timeOfImpact, origin.y + dir.y * hit.timeOfImpact, origin.z + dir.z * hit.timeOfImpact);
      const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
      let surface = this.surfaces.get(hit.collider.handle);
      const bb = this.buildingBoxes.get(hit.collider.handle);
      if (bb) surface = this.isWindow(bb, point, normal) ? 'glass' : 'concrete';
      else if (hit.collider.handle === this.terrainCollider?.handle) surface = this.groundSurface(point.x, point.z);
      best = {
        point, normal, distance: hit.timeOfImpact, surface: surface ?? 'concrete',
        collider: hit.collider, body: this.propBodies.get(hit.collider.handle) ?? null,
      };
    }
    // Sea surface
    if (origin.y > 0 && dir.y < -1e-4) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < maxDist && (!best || t < best.distance)) {
        const p = new THREE.Vector3(origin.x + dir.x * t, 0, origin.z + dir.z * t);
        if (terrainHeight(p.x, p.z) < 0) {
          best = { point: p, normal: new THREE.Vector3(0, 1, 0), distance: t, surface: 'water', collider: null, body: null };
        }
      }
    }
    return best;
  }

  /**
   * Cast a ray into the static world and write the result into `out` (no allocation on our side).
   * Used for wheel suspension, so it only sees WORLD geometry.
   */
  probe(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number, exclude: Collider | undefined, out: Probe): Probe {
    const r = this._ray;
    r.origin.x = ox; r.origin.y = oy; r.origin.z = oz;
    r.dir.x = dx; r.dir.y = dy; r.dir.z = dz;
    const hit = this.world.castRayAndGetNormal(r as unknown as Ray, len, true, undefined, groups(0xffff, GROUP.WORLD), exclude);
    out.hit = false;
    let best = hit ? hit.timeOfImpact : Infinity;
    if (hit && hit.timeOfImpact >= 0) {
      out.hit = true;
      out.distance = hit.timeOfImpact;
      out.px = ox + dx * best; out.py = oy + dy * best; out.pz = oz + dz * best;
      out.nx = hit.normal.x; out.ny = hit.normal.y; out.nz = hit.normal.z;
      const h = hit.collider.handle;
      const tagged = this.surfaces.get(h);
      out.surface = this.buildingBoxes.has(h) ? 'concrete' : h === this.terrainCollider?.handle ? this.groundSurface(out.px, out.pz) : (tagged ?? 'concrete');
    }
    // the sea is solid for wheels only as a shallow-water drag surface; vehicles don't float yet
    void best;
    return out;
  }

  /** How open the sky/surroundings are around a point, 0 (canyon / indoors) … 1 (open field). Drives gunshot reverb. */
  openness(p: THREE.Vector3): number {
    const dirs = [
      [0, 1, 0], [1, 0.1, 0], [-1, 0.1, 0], [0, 0.1, 1], [0, 0.1, -1],
      [0.7, 0.1, 0.7], [-0.7, 0.1, 0.7], [0.7, 0.1, -0.7], [-0.7, 0.1, -0.7],
    ];
    let open = 0;
    const o = new THREE.Vector3();
    const d = new THREE.Vector3();
    for (const v of dirs) {
      d.set(v[0]!, v[1]!, v[2]!).normalize();
      o.copy(p);
      const h = this.raycast(o, d, v[0] === 0 && v[2] === 0 ? 40 : 35, undefined, GROUP.WORLD);
      open += h && h.surface !== 'water' ? Math.min(1, h.distance / (d.y > 0.9 ? 40 : 35)) : 1;
    }
    return open / dirs.length;
  }
}
