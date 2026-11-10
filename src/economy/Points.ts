import * as THREE from 'three';
import type { ChunkSource } from '../world/city/source';
import type { ChunkData } from '../world/city/plan';
import { CHUNK } from '../world/city/plan';
import { terrainHeight } from '../world/Terrain';
import type { Marker } from '../ui/mapData';
import { ATMS, PROPERTIES, SHOPS, type PointKind, type PropertyKind } from './catalog';

export interface Point {
  id: string;
  kind: PointKind;
  name: string;
  x: number;
  z: number;
  /** On-foot trigger radius (m). */
  r: number;
  glyph: string;
  /** Property or shop id. */
  ref: string;
  /** True when a building was made for it (it sits behind the entrance, to the north). */
  built?: boolean;
}

const GLYPH: Record<PointKind, string> = { atm: '$', property: '⌂', clothing: '▤', barber: '✂', weapons: '✦', showroom: '◈', tuning: '⚙', food: '●' };
const COLOR: Record<PointKind, number> = { atm: 0x7be28f, property: 0xffd166, clothing: 0x6ab7ff, barber: 0x6ab7ff, weapons: 0xff7a59, showroom: 0xff8a5c, tuning: 0xff8a5c, food: 0xffb347 };

/** Cache of the generated (non-wild) scenery chunks, to test whether a spot is free. */
class Clearance {
  private readonly cache = new Map<string, ChunkData[]>();
  constructor(private readonly sources: ChunkSource[]) {}

  private chunks(cx: number, cz: number): ChunkData[] {
    const k = `${cx},${cz}`;
    let c = this.cache.get(k);
    if (!c) {
      c = [];
      for (const s of this.sources) {
        const r = s.chunkRange();
        if (cx >= r.cx0 && cx <= r.cx1 && cz >= r.cz0 && cz <= r.cz1) c.push(s.generateChunk(cx, cz));
      }
      this.cache.set(k, c);
    }
    return c;
  }

  /** True when no solid scenery lies within `m` metres of (x, z). */
  free(x: number, z: number, m: number): boolean {
    const cx0 = Math.floor((x - m - 20) / CHUNK), cx1 = Math.floor((x + m + 20) / CHUNK);
    const cz0 = Math.floor((z - m - 20) / CHUNK), cz1 = Math.floor((z + m + 20) / CHUNK);
    const gy = terrainHeight(x, z);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        for (const d of this.chunks(cx, cz)) {
          for (const b of d.boxes) {
            if (b.y + b.sy / 2 < gy + 0.25 || b.y - b.sy / 2 > gy + 3.2) continue;
            const dx = x - b.x, dz = z - b.z;
            if (Math.abs(dx) > b.sx + b.sz + m + 4 || Math.abs(dz) > b.sx + b.sz + m + 4) continue;
            const c = Math.cos(b.ry), s = Math.sin(b.ry);
            const lx = c * dx - s * dz, lz = s * dx + c * dz;
            if (Math.abs(lx) < b.sx / 2 + m && Math.abs(lz) < b.sz / 2 + m) return false;
          }
          for (const b of d.cyls) {
            if (b.y + b.sy / 2 < gy + 0.25 || b.y - b.sy / 2 > gy + 3.2) continue;
            if (Math.hypot(x - b.x, z - b.z) < Math.max(b.sx, b.sz) / 2 + m) return false;
          }
          for (const t of d.trees) if (Math.hypot(x - t.x, z - t.z) < 1.6 * t.s + m * 0.6) return false;
          for (const l of d.lamps) if (Math.hypot(x - l.x, z - l.z) < 0.8 + m * 0.4) return false;
        }
      }
    }
    return true;
  }
}

export interface PlacementEnv {
  sources: ChunkSource[];
  /** Inside Port Valeria's street grid (there the existing buildings are the shop fronts). */
  inCity(x: number, z: number): boolean;
  /** City sidewalk test: inside the city grid only sidewalks are acceptable. */
  walkable(x: number, z: number): boolean;
}

/** Clearance needed behind a property's entrance for its building (offset from the entrance, radius). */
const FOOT: Record<PropertyKind, { dz: number; m: number }> = {
  apartment: { dz: -6, m: 8 }, house: { dz: -6, m: 8 }, mansion: { dz: -9, m: 13 }, penthouse: { dz: -7, m: 8 }, trailer: { dz: -4, m: 6.5 },
  cabin: { dz: -5, m: 7 }, garage: { dz: -5, m: 7 }, hangar: { dz: -14, m: 15 }, dock: { dz: -6, m: 8 },
};

/** The shop fronts, ATMs and property entrances, placed on the nearest open ground to where the catalogue asks for them. */
export class Points {
  readonly list: Point[] = [];
  private readonly clear: Clearance;
  private readonly env: PlacementEnv;
  readonly group = new THREE.Group();
  private readonly beams: THREE.InstancedMesh;
  private readonly rings: THREE.InstancedMesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private t = 0;
  private readonly baseM: THREE.Matrix4[] = [];
  private readonly hidden: boolean[] = [];
  private static readonly ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(env: PlacementEnv) {
    this.env = env;
    this.clear = new Clearance(env.sources.filter((s) => s.id !== 'wild'));
    const place = (nx: number, nz: number, margin: number, also?: { dz: number; m: number }): { x: number; z: number } => this.find(nx, nz, margin, also ? { also, maxR: 160 } : {});

    for (const p of PROPERTIES) {
      const s = place(p.near.x, p.near.z, 2.6, env.inCity(p.near.x, p.near.z) ? undefined : FOOT[p.kind]);
      this.list.push({ id: `prop:${p.id}`, kind: 'property', name: p.name, x: s.x, z: s.z, r: 2.6, glyph: GLYPH.property, ref: p.id });
    }
    for (const sh of SHOPS) {
      const s = place(sh.near.x, sh.near.z, 2.6, env.inCity(sh.near.x, sh.near.z) ? undefined : sh.kind === 'tuning' || sh.kind === 'showroom' ? { dz: -7, m: 6.5 } : { dz: -5, m: 5.5 });
      // vehicle shops need room to drive in; they get a wider trigger
      this.list.push({ id: `shop:${sh.id}`, kind: sh.kind, name: sh.name, x: s.x, z: s.z, r: sh.kind === 'tuning' ? 7 : sh.kind === 'showroom' ? 3 : 2.6, glyph: GLYPH[sh.kind], ref: sh.id });
    }
    for (const a of ATMS) {
      const s = place(a.near.x, a.near.z, 1.8);
      this.list.push({ id: a.id, kind: 'atm', name: 'ATM', x: s.x, z: s.z, r: 1.9, glyph: GLYPH.atm, ref: a.id });
    }

    // visuals: one instanced beam + one ground ring per point, tinted by kind
    const n = this.list.length;
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.beams = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.55, 1, 14, 1, true), this.mat, n);
    this.rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.9, 1.15, 28).rotateX(-Math.PI / 2), this.ringMat, n);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    this.list.forEach((p, i) => {
      const y = terrainHeight(p.x, p.z);
      const h = p.kind === 'atm' ? 2.2 : 7;
      m4.compose(new THREE.Vector3(p.x, y + h / 2, p.z), new THREE.Quaternion(), new THREE.Vector3(p.kind === 'atm' ? 0.6 : 1, h, p.kind === 'atm' ? 0.6 : 1));
      this.beams.setMatrixAt(i, m4);
      this.baseM.push(m4.clone());
      this.hidden.push(false);
      const rs = p.kind === 'tuning' ? 5.2 : p.kind === 'atm' ? 0.9 : 1.7;
      m4.compose(new THREE.Vector3(p.x, y + 0.08, p.z), new THREE.Quaternion(), new THREE.Vector3(rs, 1, rs));
      this.rings.setMatrixAt(i, m4);
      col.setHex(COLOR[p.kind]);
      this.beams.setColorAt(i, col);
      this.rings.setColorAt(i, col);
    });
    this.beams.frustumCulled = false;
    this.rings.frustumCulled = false;
    this.group.add(this.beams, this.rings);
  }

  /** The nearest open ground to (nx, nz) with `margin` metres clear of solid scenery. `walkOnly` keeps to sidewalks inside the city. */
  find(nx: number, nz: number, margin: number, opts: { walkOnly?: boolean; maxR?: number; water?: boolean; also?: { dz: number; m: number } } = {}): { x: number; z: number } {
    const walkOnly = opts.walkOnly ?? true, maxR = opts.maxR ?? 90;
    const ok = (x: number, z: number): boolean => {
      const h = terrainHeight(x, z);
      if (opts.water) return h < -2.2 && this.clear.free(x, z, margin);
      if (h < 1.4) return false;
      if (Math.abs(terrainHeight(x + 2, z) - h) > 0.7 || Math.abs(terrainHeight(x, z + 2) - h) > 0.7) return false;
      if (opts.also && !this.clear.free(x, z + opts.also.dz, opts.also.m)) return false;
      return (!walkOnly || this.env.walkable(x, z)) && this.clear.free(x, z, margin);
    };
    if (ok(nx, nz)) return { x: nx, z: nz };
    for (let r = 3; r <= maxR; r += 3) {
      const n = Math.max(8, Math.round((r * Math.PI * 2) / 3));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = nx + Math.cos(a) * r, z = nz + Math.sin(a) * r;
        if (ok(x, z)) return { x, z };
      }
    }
    return { x: nx, z: nz };
  }

  /** True when no solid scenery lies within `m` metres of (x, z). */
  free(x: number, z: number, m: number): boolean { return this.clear.free(x, z, m); }

  get materials(): THREE.Material[] { return [this.mat, this.ringMat]; }

  /** Property beams go green when owned. */
  setOwned(owned: (propId: string) => boolean): void {
    const col = new THREE.Color();
    this.list.forEach((p, i) => {
      if (p.kind !== 'property') return;
      col.setHex(owned(p.ref) ? 0x5ad17a : COLOR.property);
      this.beams.setColorAt(i, col);
      this.rings.setColorAt(i, col);
    });
    if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
  }

  /** The beam would fill the screen from inside, so it hides while you stand in it. */
  update(dt: number, px = 1e9, pz = 1e9): void {
    this.t += dt;
    this.mat.opacity = 0.34 + 0.12 * Math.sin(this.t * 2.2);
    let dirty = false;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i]!;
      const inside = Math.hypot(p.x - px, p.z - pz) < (p.kind === 'tuning' ? 6 : 2.4);
      if (inside !== this.hidden[i]) {
        this.hidden[i] = inside;
        this.beams.setMatrixAt(i, inside ? Points.ZERO : this.baseM[i]!);
        dirty = true;
      }
    }
    if (dirty) this.beams.instanceMatrix.needsUpdate = true;
  }

  /** The closest point whose trigger covers (x, z), with an optional radius boost (vehicles). */
  near(x: number, z: number, boost = 0): Point | null {
    let best: Point | null = null;
    let bd = Infinity;
    for (const p of this.list) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < p.r + boost && d < bd) { best = p; bd = d; }
    }
    return best;
  }

  mapMarkers(owned: (propId: string) => boolean): Marker[] {
    return this.list
      .filter((p) => p.kind !== 'atm' || true)
      .map((p) => ({ name: p.name, x: p.x, z: p.z, glyph: p.glyph, color: p.kind === 'property' ? (owned(p.ref) ? '#5ad17a' : '#ffd166') : p.kind === 'atm' ? '#7be28f' : '#6ab7ff' }));
  }

  byRef(ref: string): Point | undefined { return this.list.find((p) => p.ref === ref); }
}
