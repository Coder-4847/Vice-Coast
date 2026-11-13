import { CITY, HILL, terrainHeight } from '../Terrain';

/**
 * Port Valeria's deterministic plan. Everything here is a pure function of the seed, so chunks can be generated
 * (and regenerated) on demand with no stored geometry: roads are two 1-D axes of straight streets, blocks are the
 * rectangles between them, and each block is filled by a district-specific generator.
 */

export const CHUNK = 256;
export const SIDEWALK = 3.6;
export const STREET_HW = 7.5;
export const ARTERIAL_HW = 12.5;
export const PLAN_RADIUS = 725;

export type District = 'boardwalk' | 'downtown' | 'midtown' | 'residential' | 'industrial' | 'hills' | 'hood';
export type BlockKind = 'normal' | 'park' | 'plaza' | 'stadium' | 'hospital' | 'police' | 'mall';

/** Facade/appearance mode, sent to the building shader per instance. */
export const MODE = { WALL: 0, GLASS: 1, PUNCHED: 2, CLERESTORY: 3, NEON: 4, METAL: 5, SEATS: 6, GLOW: 7 } as const;

export interface Road {
  idx: number;
  pos: number;
  hw: number;
  arterial: boolean;
  name: string;
}

export interface Block {
  i: number;
  j: number;
  x0: number; x1: number; z0: number; z1: number;
  cx: number; cz: number;
  w: number; d: number;
  district: District;
  kind: BlockKind;
}

/** One instanced box (or cylinder) of scenery. Centre-based, optionally yawed. */
export interface Prim {
  x: number; y: number; z: number;
  sx: number; sy: number; sz: number;
  ry: number;
  color: number;
  mode: number;
  solid: boolean;
  /** Optional tilt (radians) applied before the yaw: pitch about x, roll about z. */
  rx?: number;
  rz?: number;
}
export interface Lamp { x: number; z: number; yaw: number; y: number }
export interface Tree { x: number; y: number; z: number; kind: 0 | 1 | 2; s: number; tint: number }
export interface Signal { x: number; z: number; yaw: number; axis: 0 | 1 }

export interface ChunkData {
  cx: number;
  cz: number;
  boxes: Prim[];
  cyls: Prim[];
  lamps: Lamp[];
  trees: Tree[];
  signals: Signal[];
  /** Wild vegetation and rocks (see source.ts). */
  veg?: import('./source').Veg[];
}

export interface Landmark {
  id: string;
  name: string;
  kind: 'stadium' | 'hospital' | 'police' | 'mall' | 'pier' | 'funfair' | 'hills' | 'beach';
  x: number;
  z: number;
}
export interface DistrictLabel { name: string; x: number; z: number }

// ------------------------------------------------------------------------------------------ random helpers

export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(a: number, b: number, c = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
const rngFor = (a: number, b: number, c = 0): (() => number) => mulberry32(hash2(a, b, c));
const pick = <T>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length]!;
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const h = (a: number, b: number) => hash2(a, b, 77) / 4294967296;
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}

// ---------------------------------------------------------------------------------------------- palettes

const PAL = {
  glass: [0x6c8aa6, 0x4f6f8c, 0x7d95a8, 0x55708a, 0x8aa0b0, 0x394c63, 0x5d7d86],
  stone: [0xb9b2a6, 0xc9c2b4, 0x9a958c, 0xd2cbbf, 0xa8a398, 0xbfb6a4],
  brick: [0xa35f55, 0x8c5446, 0xb4755c, 0x7a4a3f, 0x9b6a52],
  pastel: [0xe9c7b5, 0xf0d9a8, 0xbfd8d2, 0xe8b4b8, 0xc9d4e8, 0xf3e3c8, 0xd8e8c0],
  industrial: [0x7f8c93, 0x6b7780, 0x9a8f7a, 0x5d6a52, 0x8a7d6e, 0xa4a8aa],
  villa: [0xf1ece4, 0xe4ddd1, 0xd9d2c5, 0xece6dc],
  container: [0xb3472f, 0x2f6b8a, 0xc9a227, 0x4a7a4a, 0x8a3a3a, 0x3b4d6b, 0xd0d0cc],
  neon: [0xff2e88, 0x27e6ff, 0xffb02e, 0x8a5cff, 0x39ff88, 0xff5a3c],
  dark: [0x40454c, 0x363b42, 0x4b4f55],
  faded: [0xc9b79a, 0xb7a58c, 0xa9b2a0, 0xc4a48e, 0x9fa8b2, 0xd2c3a4, 0xb59a86, 0x8f9a86],
};

// -------------------------------------------------------------------------------------------- the plan

const STREET_NAMES_NS = ['Ocean Boulevard', 'Palmetto Avenue', 'Meridian Avenue', 'Crown Avenue', 'Harbor Avenue', 'Sunset Boulevard', 'Lantern Avenue', 'Valeria Parkway'];
const STREET_NAMES_EW = ['Valeria Avenue', 'Grand Street', 'Marlow Street', 'Costa Boulevard', 'Orchard Street', 'Kestrel Avenue', 'Bayview Boulevard', 'Foundry Road'];

export class CityPlan {
  readonly id = 'port-valeria';
  readonly X: Road[] = [];
  readonly Z: Road[] = [];
  readonly blocks: Block[] = [];
  readonly landmarks: Landmark[] = [];
  readonly districts: DistrictLabel[] = [];
  /** Bounding box of everything the plan draws. */
  readonly box = { x0: 215, x1: 1765, z0: -745, z1: 745 };
  readonly seed: number;
  private readonly blockAt = new Map<string, Block>();
  private readonly byChunk = new Map<string, Block[]>();
  readonly stadiumBlock: Block | null;
  readonly hospitalBlock: Block | null;
  readonly policeBlock: Block | null;
  readonly mallBlock: Block | null;
  readonly villas: { x: number; z: number; yaw: number }[] = [];

  constructor(seed = 1987) {
    this.seed = seed;
    this.buildAxes();
    this.buildBlocks();
    this.stadiumBlock = this.findSpecial('stadium');
    this.hospitalBlock = this.findSpecial('hospital');
    this.policeBlock = this.findSpecial('police');
    this.mallBlock = this.findSpecial('mall');
    this.buildHills();
    this.buildLandmarks();
    for (const b of this.blocks) {
      const key = `${Math.floor(b.cx / CHUNK)},${Math.floor(b.cz / CHUNK)}`;
      let list = this.byChunk.get(key);
      if (!list) this.byChunk.set(key, (list = []));
      list.push(b);
    }
  }

  // ---------------------------------------------------------------------------------------------- axes

  private buildAxes(): void {
    const r = rngFor(this.seed, 1);
    const gaps = [100, 92, 108, 96, 104, 90];
    // north–south roads (positions along x)
    let x = 232;
    let k = 0;
    let wide1 = false, wide2 = false;
    for (;;) {
      const arterial = k % 4 === 0;
      this.X.push({ idx: k, pos: x, hw: arterial ? ARTERIAL_HW : STREET_HW, arterial, name: arterial ? STREET_NAMES_NS[(k / 4) % STREET_NAMES_NS.length]! : `${ordinal(k)} Avenue` });
      let gap = pick(r, gaps);
      if (!wide2 && x >= 600) { gap = 192; wide2 = true; }
      else if (!wide1 && x >= 1370) { gap = 244; wide1 = true; }
      x += gap;
      k++;
      if (x > this.box.x1 - 10) break;
    }
    // east–west roads (positions along z); z = 0 is the main avenue
    const rz = rngFor(this.seed, 2);
    const zs: number[] = [0];
    let z = 0;
    let wideDone = false;
    while (z < this.box.z1 - 25) {
      let gap = pick(rz, gaps);
      if (!wideDone && z >= 290) { gap = 204; wideDone = true; }
      z += gap;
      zs.push(z);
    }
    z = 0;
    const rn = rngFor(this.seed, 3);
    const neg: number[] = [];
    while (z > this.box.z0 + 25) {
      z -= pick(rn, gaps);
      neg.push(z);
    }
    const all = [...neg.reverse(), ...zs];
    const zero = neg.length;
    all.forEach((pos, i) => {
      const rel = i - zero;
      const arterial = ((rel % 4) + 4) % 4 === 0;
      this.Z.push({
        idx: i, pos, hw: arterial ? ARTERIAL_HW : STREET_HW, arterial,
        name: arterial ? STREET_NAMES_EW[Math.abs(rel / 4) % STREET_NAMES_EW.length]! : `${ordinal(Math.abs(rel))} Street`,
      });
    });
  }

  // --------------------------------------------------------------------------------------------- blocks

  districtAt(x: number, z: number): District {
    if (z < -760) return 'hills';
    const n = (vnoise(x * 0.004, z * 0.004) - 0.5) * 120;
    const dx = x - 1020, dz = z + 30;
    const d = Math.hypot(dx, dz) + n;
    if (x < 345) return 'boardwalk';
    if (d < 290) return 'downtown';
    if ((x + n > 1330 && z < 40) || (z + n < -430 && x > 880)) return 'industrial';
    // Southside: the old neighbourhood south-east of the core, where the gangs hold the corners
    if (z + n * 0.5 > 300 && x + n * 0.5 > 1180 && x - n * 0.5 < 1620) return 'hood';
    if (z + n > 210 || x + n > 1470) return 'residential';
    return 'midtown';
  }

  inCity(x: number, z: number): boolean {
    return Math.hypot(x - CITY.x, z - CITY.z) < PLAN_RADIUS;
  }

  private buildBlocks(): void {
    for (let i = 0; i < this.X.length - 1; i++) {
      for (let j = 0; j < this.Z.length - 1; j++) {
        const a = this.X[i]!, b = this.X[i + 1]!, c = this.Z[j]!, d = this.Z[j + 1]!;
        const x0 = a.pos + a.hw + SIDEWALK, x1 = b.pos - b.hw - SIDEWALK;
        const z0 = c.pos + c.hw + SIDEWALK, z1 = d.pos - d.hw - SIDEWALK;
        if (x1 - x0 < 14 || z1 - z0 < 14) continue;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        if (!this.inCity(cx, cz)) continue;
        const district = this.districtAt(cx, cz);
        const blk: Block = { i, j, x0, x1, z0, z1, cx, cz, w: x1 - x0, d: z1 - z0, district, kind: 'normal' };
        const hr = rngFor(i, j, this.seed)();
        if (blk.w > 200 && blk.d > 165) blk.kind = 'stadium';
        else if (hr < 0.11 && district !== 'downtown' && district !== 'industrial' && district !== 'boardwalk') blk.kind = 'park';
        else if (hr < 0.2 && district === 'downtown') blk.kind = 'plaza';
        this.blocks.push(blk);
        this.blockAt.set(`${i},${j}`, blk);
      }
    }
    // Hospital, mall (the second wide column) and police HQ are chosen among normal blocks near anchor points.
    const wideCol = this.X.findIndex((r, k) => k < this.X.length - 1 && this.X[k + 1]!.pos - r.pos > 180 && this.X[k + 1]!.pos - r.pos < 200);
    const near = (tx: number, tz: number, filter: (b: Block) => boolean): Block | null => {
      let best: Block | null = null;
      let bd = Infinity;
      for (const b of this.blocks) {
        if (b.kind === 'stadium' || b.kind === 'hospital' || b.kind === 'mall' || b.kind === 'police' || !filter(b)) continue;
        const dd = Math.hypot(b.cx - tx, b.cz - tz);
        if (dd < bd) { bd = dd; best = b; }
      }
      return best;
    };
    const wide = (b: Block) => b.i === wideCol;
    const hosp = near(700, 250, wide);
    if (hosp) hosp.kind = 'hospital';
    const mall = near(700, -300, wide);
    if (mall) mall.kind = 'mall';
    const pol = near(1180, 175, (b) => b.i !== wideCol && b.district !== 'industrial');
    if (pol) pol.kind = 'police';
  }

  private findSpecial(k: BlockKind): Block | null {
    return this.blocks.find((b) => b.kind === k) ?? null;
  }

  // ------------------------------------------------------------------------------------------- hills

  /** Point on the spiral road up Crestview Hill; t in [0,1]. */
  hillRoad(t: number): { x: number; z: number; yaw: number } {
    const th = Math.PI * 0.5 + t * Math.PI * 3.5;
    const r = lerp(300, 105, t);
    const x = HILL.x + Math.cos(th) * r;
    const z = HILL.z + Math.sin(th) * r;
    // tangent (counter-clockwise, shrinking radius)
    const dr = -(300 - 105) / (Math.PI * 3.5);
    const tx = dr * Math.cos(th) - r * Math.sin(th);
    const tz = dr * Math.sin(th) + r * Math.cos(th);
    return { x, z, yaw: Math.atan2(-tz, tx) };
  }

  private buildHills(): void {
    const n = 22;
    for (let k = 0; k < n; k++) {
      const t = 0.1 + (k / n) * 0.88;
      const p = this.hillRoad(t);
      const side = k % 2 === 0 ? 1 : -1; // alternate inner/outer
      const inward = Math.atan2(HILL.z - p.z, HILL.x - p.x);
      const off = 34 + (k % 3) * 6;
      const x = p.x + Math.cos(inward) * off * side;
      const z = p.z + Math.sin(inward) * off * side;
      this.villas.push({ x, z, yaw: side > 0 ? inward + Math.PI : inward });
    }
  }

  // ---------------------------------------------------------------------------------------- landmarks

  private buildLandmarks(): void {
    const L = this.landmarks;
    if (this.stadiumBlock) L.push({ id: 'arena', name: 'Valeria Arena', kind: 'stadium', x: this.stadiumBlock.cx, z: this.stadiumBlock.cz });
    if (this.hospitalBlock) L.push({ id: 'hospital', name: 'St. Aurelia Medical Center', kind: 'hospital', x: this.hospitalBlock.cx, z: this.hospitalBlock.cz });
    if (this.policeBlock) L.push({ id: 'police', name: 'Valeria PD Headquarters', kind: 'police', x: this.policeBlock.cx, z: this.policeBlock.cz });
    if (this.mallBlock) L.push({ id: 'mall', name: 'Galleria Costa', kind: 'mall', x: this.mallBlock.cx, z: this.mallBlock.cz });
    L.push({ id: 'pier', name: 'Seaside Pier', kind: 'pier', x: PIER.x1 + 120, z: PIER.z });
    L.push({ id: 'funfair', name: 'Sunwheel Funfair', kind: 'funfair', x: FUNFAIR.x, z: FUNFAIR.z });
    this.districts.push(
      { name: 'Valeria Core', x: 1020, z: -30 },
      { name: 'Seaside', x: 290, z: 380 },
      { name: 'Midtown', x: 790, z: -150 },
      { name: 'Orchard Row', x: 1000, z: 470 },
      { name: 'Rustwater', x: 1520, z: -290 },
      { name: 'Southside', x: 1400, z: 480 },
      { name: 'Crestview Hills', x: HILL.x, z: HILL.z },
    );
  }

  // --------------------------------------------------------------------------------------- queries

  /** What the ground at (x, z) is: used for tyre grip, footstep/impact surface and the map. */
  roadAt(x: number, z: number): { kind: 'road' | 'sidewalk' | 'none'; road: Road | null; arterial: boolean } {
    if (!this.inCity(x, z)) return { kind: 'none', road: null, arterial: false };
    let rx: Road | null = null, rz: Road | null = null;
    let dx = Infinity, dz = Infinity;
    for (const r of this.X) { const d = Math.abs(x - r.pos) - r.hw; if (d < dx) { dx = d; rx = r; } }
    for (const r of this.Z) { const d = Math.abs(z - r.pos) - r.hw; if (d < dz) { dz = d; rz = r; } }
    const d = Math.min(dx, dz);
    if (d < 0) {
      const road = dx < dz ? rx : rz;
      return { kind: 'road', road, arterial: !!road?.arterial };
    }
    if (d < SIDEWALK) return { kind: 'sidewalk', road: dx < dz ? rx : rz, arterial: false };
    return { kind: 'none', road: null, arterial: false };
  }

  /** True when (x, z) lies on the Crestview Hill spiral road. */
  onHillRoad(x: number, z: number): boolean {
    const dx = x - HILL.x, dz = z - HILL.z;
    const r = Math.hypot(dx, dz);
    const t = (300 - r) / 195;
    if (t < 0 || t > 1) return false;
    let diff = Math.atan2(dz, dx) - (Math.PI * 0.5 + t * Math.PI * 3.5);
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    return Math.abs(diff) * r < 5.5;
  }

  /** Ground material under a world point (roads → asphalt, boardwalk → wood, parks/yards → dirt). */
  surfaceAt(x: number, z: number): 'asphalt' | 'concrete' | 'wood' | 'dirt' {
    if (x > 193 && x < 217) return 'wood';
    if (this.onHillRoad(x, z)) return 'asphalt';
    const g = this.roadAt(x, z);
    if (g.kind === 'road') return 'asphalt';
    if (g.kind === 'sidewalk') return 'concrete';
    let bi = -1, bj = -1;
    for (let i = 0; i < this.X.length - 1; i++) if (x > this.X[i]!.pos + this.X[i]!.hw && x < this.X[i + 1]!.pos - this.X[i + 1]!.hw) { bi = i; break; }
    for (let j = 0; j < this.Z.length - 1; j++) if (z > this.Z[j]!.pos + this.Z[j]!.hw && z < this.Z[j + 1]!.pos - this.Z[j + 1]!.hw) { bj = j; break; }
    const b = this.blockAt.get(`${bi},${bj}`);
    if (!b) return 'dirt';
    if (b.kind === 'park' || b.district === 'residential' || b.district === 'hood') return 'dirt';
    if (b.kind === 'mall' || b.kind === 'police' || b.district === 'industrial') return 'asphalt';
    return 'concrete';
  }

  /** Nearest road's name, for the HUD location label. */
  streetAt(x: number, z: number): string {
    let best = '';
    let bd = Infinity;
    for (const r of this.X) { const d = Math.abs(x - r.pos) - r.hw; if (d < bd) { bd = d; best = r.name; } }
    for (const r of this.Z) { const d = Math.abs(z - r.pos) - r.hw; if (d < bd) { bd = d; best = r.name; } }
    return bd < 60 ? best : '';
  }

  districtName(x: number, z: number): string {
    if (x < 215) return 'Valeria Beach';
    if (!this.inCity(x, z)) return z < -745 && Math.hypot(x - HILL.x, z - HILL.z) < 420 ? 'Crestview Hills' : 'San Verano';
    switch (this.districtAt(x, z)) {
      case 'boardwalk': return 'Seaside';
      case 'downtown': return 'Valeria Core';
      case 'midtown': return 'Midtown';
      case 'residential': return 'Orchard Row';
      case 'hood': return 'Southside';
      case 'industrial': return 'Rustwater';
      default: return 'Crestview Hills';
    }
  }

  chunkRange(): { cx0: number; cx1: number; cz0: number; cz1: number } {
    const b = this.box;
    return { cx0: Math.floor(-210 / CHUNK), cx1: Math.floor(b.x1 / CHUNK), cz0: Math.floor((b.z0 - 450) / CHUNK), cz1: Math.floor(b.z1 / CHUNK) };
  }

  // ------------------------------------------------------------------------------------------ chunks

  generateChunk(cx: number, cz: number): ChunkData {
    const out: ChunkData = { cx, cz, boxes: [], cyls: [], lamps: [], trees: [], signals: [] };
    const blocks = this.byChunk.get(`${cx},${cz}`);
    if (blocks) for (const b of blocks) this.genBlock(b, out);
    this.genRoadside(cx, cz, out);
    this.genFeatures(cx, cz, out);
    return out;
  }

  private genBlock(b: Block, out: ChunkData): void {
    const r = rngFor(b.i, b.j, this.seed + 5);
    switch (b.kind) {
      case 'stadium': genStadium(b, r, out); return;
      case 'hospital': genHospital(b, r, out); return;
      case 'police': genPolice(b, r, out); return;
      case 'mall': genMall(b, r, out); return;
      case 'park': genPark(b, r, out, false); return;
      case 'plaza': genPark(b, r, out, true); return;
      default: break;
    }
    switch (b.district) {
      case 'downtown': genDowntown(b, r, out); break;
      case 'midtown': genMidtown(b, r, out); break;
      case 'boardwalk': genSeaside(b, r, out); break;
      case 'residential': genResidential(b, r, out); break;
      case 'hood': genHood(b, r, out); break;
      case 'industrial': genIndustrial(b, r, out); break;
      default: break;
    }
  }

  /** Streetlights, trees, signals and street furniture along roads inside the chunk. */
  private genRoadside(cx: number, cz: number, out: ChunkData): void {
    const x0 = cx * CHUNK, x1 = x0 + CHUNK, z0 = cz * CHUNK, z1 = z0 + CHUNK;
    const inX = (v: number) => v >= x0 && v < x1;
    const inZ = (v: number) => v >= z0 && v < z1;
    const crossing = (roads: Road[], v: number, pad: number): boolean => roads.some((r) => Math.abs(v - r.pos) < r.hw + pad);

    // N–S roads (positions along z)
    for (const rd of this.X) {
      if (rd.pos < x0 - 20 || rd.pos > x1 + 20) continue;
      const lampStep = rd.arterial ? 36 : 46;
      const treeStep = rd.arterial ? 16 : 22;
      const kz0 = Math.ceil(z0 / lampStep);
      for (let k = kz0; k * lampStep < z1; k++) {
        const z = k * lampStep;
        if (!this.inCity(rd.pos, z) || crossing(this.Z, z, 5)) continue;
        const side = k % 2 === 0 ? -1 : 1;
        const lx = rd.pos + side * (rd.hw + 1.0);
        if (inX(lx)) out.lamps.push({ x: lx, z, yaw: side < 0 ? 0 : Math.PI, y: G });
      }
      const palm = rd.idx === 0;
      for (let k = Math.ceil(z0 / 13); k * 13 < z1; k++) {
        const z = k * 13 + 4;
        if (!inZ(z) || !this.inCity(rd.pos, z) || crossing(this.Z, z, 7)) continue;
        for (const side of [-1, 1]) {
          const fx = rd.pos + side * (rd.hw + 1.7);
          const hh = hash2(k, rd.idx, side + 77);
          if (inX(fx) && hh % 3 !== 0) furniture(out, fx, z, side < 0 ? Math.PI / 2 : -Math.PI / 2, hh, rd.arterial);
        }
      }
      const kt0 = Math.ceil(z0 / treeStep);
      for (let k = kt0; k * treeStep < z1; k++) {
        const z = k * treeStep + treeStep * 0.5;
        if (!inZ(z) || !this.inCity(rd.pos, z) || crossing(this.Z, z, 6)) continue;
        for (const side of [-1, 1]) {
          const tx = rd.pos + side * (rd.hw + 2.7);
          if (!inX(tx)) continue;
          if (hash2(k, rd.idx, side + 9) % 7 === 0) continue;
          this.pushTree(out, tx, z, palm || this.districtAt(tx, z) === 'boardwalk', hash2(k, rd.idx, side));
        }
      }
    }
    // E–W roads (positions along x)
    for (const rd of this.Z) {
      if (rd.pos < z0 - 20 || rd.pos > z1 + 20) continue;
      const lampStep = rd.arterial ? 36 : 46;
      const treeStep = rd.arterial ? 16 : 22;
      const kx0 = Math.ceil(x0 / lampStep);
      for (let k = kx0; k * lampStep < x1; k++) {
        const x = k * lampStep + 11;
        if (!inX(x) || !this.inCity(x, rd.pos) || crossing(this.X, x, 5)) continue;
        const side = k % 2 === 0 ? -1 : 1;
        const lz = rd.pos + side * (rd.hw + 1.0);
        if (inZ(lz)) out.lamps.push({ x, z: lz, yaw: side < 0 ? -Math.PI / 2 : Math.PI / 2, y: G });
      }
      for (let k = Math.ceil(x0 / 13); k * 13 < x1; k++) {
        const x = k * 13 + 9;
        if (!inX(x) || !this.inCity(x, rd.pos) || crossing(this.X, x, 7)) continue;
        for (const side of [-1, 1]) {
          const fz = rd.pos + side * (rd.hw + 1.7);
          const hh = hash2(k, rd.idx, side + 91);
          if (inZ(fz) && hh % 3 !== 0) furniture(out, x, fz, side < 0 ? 0 : Math.PI, hh, rd.arterial);
        }
      }
      const kt0 = Math.ceil(x0 / treeStep);
      for (let k = kt0; k * treeStep < x1; k++) {
        const x = k * treeStep + treeStep * 0.5 + 3;
        if (!inX(x) || !this.inCity(x, rd.pos) || crossing(this.X, x, 6)) continue;
        for (const side of [-1, 1]) {
          const tz = rd.pos + side * (rd.hw + 2.7);
          if (!inZ(tz)) continue;
          if (hash2(k, rd.idx, side + 41) % 7 === 0) continue;
          this.pushTree(out, x, tz, this.districtAt(x, tz) === 'boardwalk', hash2(k, rd.idx, side + 5));
        }
      }
    }
    // Traffic signals: one pole per approach, on the driver's right just before the crossing, lens facing the traffic.
    for (const rx of this.X) {
      if (!inX(rx.pos)) continue;
      for (const rz of this.Z) {
        if (!inZ(rz.pos) || !this.inCity(rx.pos, rz.pos)) continue;
        const ax = rx.hw + 1.4, az = rz.hw + 1.4;
        out.signals.push({ x: rx.pos - ax, z: rz.pos + az, yaw: -Math.PI / 2, axis: 1 }); // heading east
        out.signals.push({ x: rx.pos + ax, z: rz.pos - az, yaw: Math.PI / 2, axis: 1 }); // heading west
        out.signals.push({ x: rx.pos - ax, z: rz.pos - az, yaw: Math.PI, axis: 0 }); // heading south (+z)
        out.signals.push({ x: rx.pos + ax, z: rz.pos + az, yaw: 0, axis: 0 }); // heading north (−z)
      }
    }
  }

  private pushTree(out: ChunkData, x: number, z: number, palm: boolean, h: number): void {
    const r = mulberry32(h);
    const kind: 0 | 1 | 2 = palm ? 1 : r() < 0.22 ? 2 : 0;
    out.trees.push({ x, y: G, z, kind, s: 0.8 + r() * 0.5, tint: r() });
  }

  /** Piers, beach details and hillside villas. */
  private genFeatures(cx: number, cz: number, out: ChunkData): void {
    const x0 = cx * CHUNK, x1 = x0 + CHUNK, z0 = cz * CHUNK, z1 = z0 + CHUNK;
    const inside = (x: number, z: number) => x >= x0 && x < x1 && z >= z0 && z < z1;
    genBeach(x0, x1, z0, z1, out);
    genPier(inside, out);
    genFunfair(inside, out);
    for (let k = 0; k < this.villas.length; k++) {
      const v = this.villas[k]!;
      if (inside(v.x, v.z)) genVilla(v.x, v.z, v.yaw, rngFor(k, 99, this.seed), out);
    }
    // the hill road gets a streetlight every ~60 m
    for (let k = 0; k < 40; k++) {
      const p = this.hillRoad(k / 40);
      const lx = p.x + Math.cos(p.yaw - Math.PI / 2) * 6.5, lz = p.z - Math.sin(p.yaw - Math.PI / 2) * 6.5;
      if (inside(lx, lz)) out.lamps.push({ x: lx, z: lz, yaw: p.yaw + Math.PI / 2, y: terrainHeight(lx, lz) });
    }
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

// ============================================================================================== fixtures

export const PIER = { z: -300, x0: 56, x1: -190, w: 9 };
export const FUNFAIR = { x: 130, z: -330 };

// ------------------------------------------------------------------------------------- prim helpers

const G = CITY.height;

function box(out: Prim[], x0: number, z0: number, x1: number, z1: number, y0: number, h: number, color: number, mode: number, solid = true): Prim {
  const p: Prim = { x: (x0 + x1) / 2, y: y0 + h / 2, z: (z0 + z1) / 2, sx: x1 - x0, sy: h, sz: z1 - z0, ry: 0, color, mode, solid };
  out.push(p);
  return p;
}
function boxC(out: Prim[], x: number, y0: number, z: number, sx: number, h: number, sz: number, color: number, mode: number, solid = true, ry = 0): Prim {
  const p: Prim = { x, y: y0 + h / 2, z, sx, sy: h, sz, ry, color, mode, solid };
  out.push(p);
  return p;
}
function cyl(out: Prim[], x: number, y0: number, z: number, r: number, h: number, color: number, mode: number, solid = true): Prim {
  const p: Prim = { x, y: y0 + h / 2, z, sx: r * 2, sy: h, sz: r * 2, ry: 0, color, mode, solid };
  out.push(p);
  return p;
}
function treeAt(out: ChunkData, x: number, z: number, r: () => number, kind: 0 | 1 | 2 = 0, y: number = G): void {
  out.trees.push({ x, y, z, kind, s: 0.8 + r() * 0.55, tint: r() });
}

/** Split a rectangle into an nx × nz grid of lots with a small gap. */
function lots(x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, gap = 2): [number, number, number, number][] {
  const res: [number, number, number, number][] = [];
  const w = (x1 - x0 - gap * (nx - 1)) / nx;
  const d = (z1 - z0 - gap * (nz - 1)) / nz;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const a = x0 + i * (w + gap), c = z0 + j * (d + gap);
      res.push([a, c, a + w, c + d]);
    }
  }
  return res;
}

/** A neon sign slab stuck on one of the lot's four faces. */
function neonSign(out: ChunkData, r: () => number, x0: number, z0: number, x1: number, z1: number, y: number, len: number): void {
  const face = Math.floor(r() * 4);
  const color = pick(r, PAL.neon);
  const h = 2.2 + r() * 1.4;
  const t = 0.5;
  if (face < 2) {
    const cx = lerp(x0, x1, 0.25 + r() * 0.5);
    const z = face === 0 ? z0 - t / 2 : z1 + t / 2;
    boxC(out.boxes, cx, y, z, Math.min(len, x1 - x0 - 4), h, t, color, MODE.NEON, false);
  } else {
    const cz = lerp(z0, z1, 0.25 + r() * 0.5);
    const x = face === 2 ? x0 - t / 2 : x1 + t / 2;
    boxC(out.boxes, x, y, cz, t, h, Math.min(len, z1 - z0 - 4), color, MODE.NEON, false);
  }
}

function roofClutter(out: ChunkData, r: () => number, x0: number, z0: number, x1: number, z1: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const w = 2 + r() * 3.5, d = 2 + r() * 3.5, h = 1.4 + r() * 2.4;
    const x = lerp(x0 + w, x1 - w, r()), z = lerp(z0 + d, z1 - d, r());
    if (x1 - x0 < w * 3 || z1 - z0 < d * 3) continue;
    boxC(out.boxes, x, y, z, w, h, d, pick(r, PAL.dark), MODE.METAL, false);
  }
}

// ----------------------------------------------------------------------------------------- districts

function tower(out: ChunkData, r: () => number, x0: number, z0: number, x1: number, z1: number, core: number): void {
  const podH = 8 + Math.floor(r() * 3) * 4;
  const stone = pick(r, PAL.stone);
  box(out.boxes, x0, z0, x1, z1, G, podH, stone, MODE.PUNCHED);
  const inset = 3 + r() * 7;
  const tx0 = x0 + inset * (0.4 + r() * 0.9), tx1 = x1 - inset * (0.4 + r() * 0.9);
  const tz0 = z0 + inset * (0.4 + r() * 0.9), tz1 = z1 - inset * (0.4 + r() * 0.9);
  let H = 40 + Math.pow(r(), 1.7) * (40 + core * 190);
  H = Math.round(H / 3.8) * 3.8;
  const glass = r() < 0.72;
  const col = glass ? pick(r, PAL.glass) : pick(r, PAL.stone);
  const mode = glass ? MODE.GLASS : MODE.PUNCHED;
  box(out.boxes, tx0, tz0, tx1, tz1, G + podH, H, col, mode);
  let top = G + podH + H;
  let ax0 = tx0, ax1 = tx1, az0 = tz0, az1 = tz1;
  if (H > 90 && r() < 0.7) {
    const sIn = 4 + r() * 5;
    ax0 += sIn; ax1 -= sIn; az0 += sIn; az1 -= sIn;
    if (ax1 - ax0 > 8 && az1 - az0 > 8) {
      const h2 = Math.round((H * (0.2 + r() * 0.2)) / 3.8) * 3.8;
      box(out.boxes, ax0, az0, ax1, az1, top, h2, col, mode);
      top += h2;
    }
  }
  const cw = (ax1 - ax0) * 0.45, cd = (az1 - az0) * 0.45;
  const mx = (ax0 + ax1) / 2, mz = (az0 + az1) / 2;
  boxC(out.boxes, mx, top, mz, cw, 4 + r() * 7, cd, pick(r, PAL.dark), MODE.METAL);
  if (H > 110) {
    const sp = 14 + r() * 26;
    boxC(out.boxes, mx, top, mz, 0.9, sp + 8, 0.9, 0x70757c, MODE.METAL, false);
    boxC(out.boxes, mx, top + sp + 8, mz, 1.3, 1.3, 1.3, 0xff3322, MODE.NEON, false);
  }
  roofClutter(out, r, x0, z0, x1, z1, G + podH, 3);
  if (r() < 0.55 + core * 0.2) neonSign(out, r, x0, z0, x1, z1, G + 4.5 + r() * 6, 12 + r() * 14);
}

function genDowntown(b: Block, r: () => number, out: ChunkData): void {
  const core = clamp(1 - Math.hypot(b.cx - 1020, b.cz + 30) / 300, 0, 1);
  const long = b.w > b.d;
  const n = (long ? b.w : b.d) > 88 ? 2 : 1;
  const ls = lots(b.x0 + 0.6, b.z0 + 0.6, b.x1 - 0.6, b.z1 - 0.6, long ? n : 1, long ? 1 : n);
  for (const l of ls) tower(out, r, l[0], l[1], l[2], l[3], core);
}

function genMidtown(b: Block, r: () => number, out: ChunkData): void {
  const nx = b.w > 70 ? 2 : 1, nz = b.d > 70 ? 2 : 1;
  for (const l of lots(b.x0 + 0.6, b.z0 + 0.6, b.x1 - 0.6, b.z1 - 0.6, nx, nz, 3)) {
    const floors = 4 + Math.floor(Math.pow(r(), 1.5) * 14);
    const h = floors * 3.8 + 1;
    const col = r() < 0.5 ? pick(r, PAL.brick) : r() < 0.5 ? pick(r, PAL.pastel) : pick(r, PAL.stone);
    box(out.boxes, l[0], l[1], l[2], l[3], G, h, col, MODE.PUNCHED);
    // cornice + roof
    box(out.boxes, l[0] - 0.4, l[1] - 0.4, l[2] + 0.4, l[3] + 0.4, G + h - 0.2, 0.7, pick(r, PAL.stone), MODE.WALL, false);
    roofClutter(out, r, l[0], l[1], l[2], l[3], G + h, 2 + Math.floor(r() * 3));
    if (r() < 0.3) neonSign(out, r, l[0], l[1], l[2], l[3], G + 4.2, 8 + r() * 8);
  }
}

function genSeaside(b: Block, r: () => number, out: ChunkData): void {
  // narrow hotel / shop strips along the long axis
  const n = Math.max(2, Math.round(b.d / 36));
  for (const l of lots(b.x0 + 0.6, b.z0 + 0.6, b.x1 - 0.6, b.z1 - 0.6, 1, n, 2)) {
    const floors = 3 + Math.floor(r() * 9);
    const h = floors * 3.6 + 1;
    const col = pick(r, PAL.pastel);
    box(out.boxes, l[0], l[1], l[2], l[3], G, h, col, MODE.PUNCHED);
    // stepped terrace on the sea side
    if (floors > 4) box(out.boxes, l[0], l[1] + 2, l[0] + (l[2] - l[0]) * 0.45, l[3] - 2, G + h, 3.6, col, MODE.PUNCHED);
    box(out.boxes, l[0] + 1, l[1] + 1, l[2] - 1, l[3] - 1, G + h, 1.1, 0xeeeeee, MODE.WALL, false);
    roofClutter(out, r, l[0], l[1], l[2], l[3], G + h + 1, 2);
    if (r() < 0.6) neonSign(out, r, l[0], l[1], l[2], l[3], G + 5 + r() * 6, 10 + r() * 10);
  }
}

function genResidential(b: Block, r: () => number, out: ChunkData): void {
  const nx = Math.max(1, Math.round(b.w / 24)), nz = b.d > 60 ? 2 : 1;
  for (const l of lots(b.x0 + 0.6, b.z0 + 0.6, b.x1 - 0.6, b.z1 - 0.6, nx, nz, 1.5)) {
    const apartment = r() < 0.28;
    const yard = apartment ? 3 : 4.5;
    const x0 = l[0] + yard * (0.5 + r() * 0.5), x1 = l[2] - yard * (0.5 + r() * 0.5);
    const z0 = l[1] + yard, z1 = l[3] - yard * 1.2;
    if (x1 - x0 < 6 || z1 - z0 < 6) continue;
    const h = apartment ? 13 + Math.floor(r() * 5) * 3.6 : 6.5 + Math.floor(r() * 2) * 3.2;
    const col = apartment ? pick(r, PAL.brick) : pick(r, PAL.pastel);
    box(out.boxes, x0, z0, x1, z1, G, h, col, MODE.PUNCHED);
    if (!apartment) {
      box(out.boxes, x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5, G + h, 0.5, 0xd8d0c4, MODE.WALL, false);
      // pitched look: a darker flat roof slab smaller than the house
      box(out.boxes, x0 + 0.6, z0 + 0.6, x1 - 0.6, z1 - 0.6, G + h + 0.5, 1.2, pick(r, PAL.dark), MODE.WALL, false);
    } else {
      roofClutter(out, r, x0, z0, x1, z1, G + h, 2);
    }
    if (r() < 0.8) treeAt(out, lerp(l[0] + 2, l[2] - 2, r()), l[1] + 2 + r() * 1.5, r, 0);
    if (r() < 0.5) treeAt(out, lerp(l[0] + 2, l[2] - 2, r()), l[3] - 2 - r() * 1.5, r, r() < 0.3 ? 2 : 0);
  }
}

/** Southside: one-storey houses behind chain-link fences, a few walk-ups, a corner store and a basketball court. */
function genHood(b: Block, r: () => number, out: ChunkData): void {
  const nx = Math.max(1, Math.round(b.w / 18)), nz = b.d > 50 ? 2 : 1;
  let court = r() < 0.18;
  for (const l of lots(b.x0 + 0.6, b.z0 + 0.6, b.x1 - 0.6, b.z1 - 0.6, nx, nz, 1.2)) {
    const lw = l[2] - l[0], ld = l[3] - l[1];
    if (court && lw > 16 && ld > 12) {
      // fenced court with two hoops
      court = false;
      box(out.boxes, l[0] + 1, l[1] + 1, l[2] - 1, l[3] - 1, G, 0.06, 0x3a5a7a, MODE.WALL, false);
      const cxm = (l[0] + l[2]) / 2;
      for (const zz of [l[1] + 2, l[3] - 2]) { cyl(out.cyls, cxm, G, zz, 0.08, 3.4, 0x8a8f96, MODE.METAL); boxC(out.boxes, cxm, G + 3.0, zz, 1.6, 1.0, 0.08, 0xf2f2f2, MODE.WALL); }
      for (const [ax, az, bx, bz] of [[l[0], l[1], l[2], l[1]], [l[0], l[3], l[2], l[3]], [l[0], l[1], l[0], l[3]], [l[2], l[1], l[2], l[3]]] as const) box(out.boxes, Math.min(ax, bx) - 0.04, Math.min(az, bz) - 0.04, Math.max(ax, bx) + 0.04, Math.max(az, bz) + 0.04, G, 3.2, 0x9aa0a6, MODE.METAL, true);
      continue;
    }
    const kind = r();
    if (kind < 0.12 && lw > 10) {
      // corner liquor store with a lit sign
      const x0 = l[0] + 1, x1 = l[2] - 1, z0 = l[1] + 1, z1 = l[3] - 3;
      box(out.boxes, x0, z0, x1, z1, G, 4.6, pick(r, PAL.faded), MODE.PUNCHED);
      neonSign(out, r, x0, z1 - 0.2, x1, z1, G + 3.2, Math.min(6, x1 - x0 - 1));
      continue;
    }
    const walkup = kind > 0.78;
    const yard = walkup ? 2 : 3.2;
    const x0 = l[0] + yard * (0.6 + r() * 0.4), x1 = l[2] - yard * (0.6 + r() * 0.4);
    const z0 = l[1] + yard, z1 = l[3] - yard * 1.4;
    if (x1 - x0 < 5 || z1 - z0 < 5) continue;
    const h = walkup ? 7.2 + Math.floor(r() * 2) * 3.3 : 3.6;
    const col = pick(r, PAL.faded);
    box(out.boxes, x0, z0, x1, z1, G, h, col, MODE.PUNCHED);
    box(out.boxes, x0 - 0.4, z0 - 0.4, x1 + 0.4, z1 + 0.4, G + h, 0.35, pick(r, PAL.dark), MODE.WALL, false);
    if (walkup) roofClutter(out, r, x0, z0, x1, z1, G + h + 0.35, 1);
    // chain-link fence along the front and a gate gap; some yards have a beat-up car or an old couch
    const fz = l[1] + 0.4;
    const gx = lerp(l[0] + 2, l[2] - 3, r());
    if (gx - l[0] > 0.6) box(out.boxes, l[0] + 0.2, fz - 0.03, gx, fz + 0.03, G, 1.3, 0x9aa0a6, MODE.METAL, true);
    if (l[2] - (gx + 1.4) > 0.6) box(out.boxes, gx + 1.4, fz - 0.03, l[2] - 0.2, fz + 0.03, G, 1.3, 0x9aa0a6, MODE.METAL, true);
    if (r() < 0.3) boxC(out.boxes, lerp(l[0] + 2, l[2] - 2, r()), G, l[1] + 1.8, 2.0, 0.8, 0.8, pick(r, [0x6a4a3a, 0x3a4a5a, 0x5a5a3a]), MODE.WALL, true);
    if (r() < 0.6) treeAt(out, lerp(l[0] + 1.5, l[2] - 1.5, r()), l[3] - 1.2, r, r() < 0.4 ? 2 : 0);
    // a utility pole on the lot line
    if (r() < 0.45) cyl(out.cyls, l[0] + 0.5, G, l[1] + 0.6, 0.12, 8.5, 0x5a4636, MODE.WALL);
  }
}

/** Sidewalk furniture: hydrants, bins, benches, news boxes and the odd bus shelter. `ry` turns it to face the road. */
function furniture(out: ChunkData, x: number, z: number, ry: number, h: number, arterial: boolean): void {
  const k = h % 11;
  if (k === 0 || k === 6) {
    cyl(out.cyls, x, G, z, 0.16, 0.62, 0xb8322a, MODE.WALL);
    cyl(out.cyls, x, G + 0.62, z, 0.11, 0.14, 0xd8d8d0, MODE.METAL, false);
  } else if (k === 1 || k === 7) {
    cyl(out.cyls, x, G, z, 0.3, 0.95, 0x2f4a3a, MODE.WALL);
  } else if (k === 2) {
    boxC(out.boxes, x, G + 0.42, z, 1.9, 0.08, 0.5, 0x6b4a2e, MODE.WALL, true, ry);
    boxC(out.boxes, x, G, z, 1.7, 0.42, 0.12, 0x34383e, MODE.METAL, false, ry);
  } else if (k === 3) {
    boxC(out.boxes, x, G, z, 0.5, 1.05, 0.45, [0x2a5aa8, 0xc4302b, 0xe6b422][h % 3]!, MODE.WALL, true, ry);
  } else if (k === 4 && arterial) {
    // bus shelter: roof, back panel and an ad box
    boxC(out.boxes, x, G + 2.4, z, 3.6, 0.12, 1.6, 0x3a3f46, MODE.METAL, false, ry);
    boxC(out.boxes, x, G, z, 3.4, 2.3, 0.08, 0x9ab4c8, MODE.GLASS, true, ry);
    boxC(out.boxes, x, G + 0.2, z, 1.2, 1.9, 0.22, 0xf0e6d2, MODE.GLOW, false, ry);
  }
}

function genIndustrial(b: Block, r: () => number, out: ChunkData): void {
  const kind = r();
  if (kind < 0.55) {
    // warehouse + annex + loading dock
    const x0 = b.x0 + 4, x1 = b.x1 - 4, z0 = b.z0 + 4, z1 = b.z1 - 24;
    const h = 9 + r() * 7;
    const col = pick(r, PAL.industrial);
    box(out.boxes, x0, z0, x1, z1, G, h, col, MODE.CLERESTORY);
    box(out.boxes, x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5, G + h, 0.6, 0x555a60, MODE.METAL, false);
    if (x1 - x0 > 40) box(out.boxes, x0 + 6, z1, x0 + 28, z1 + 14, G, 5.5, pick(r, PAL.industrial), MODE.WALL);
    roofClutter(out, r, x0, z0, x1, z1, G + h + 0.6, 4);
    if (r() < 0.5) cyl(out.cyls, lerp(x0 + 8, x1 - 8, r()), G + h, lerp(z0 + 6, z1 - 6, r()), 1.6, 24 + r() * 12, 0x80858a, MODE.METAL);
    // container stacks in the yard
    const rows = Math.floor((b.x1 - b.x0 - 14) / 13);
    for (let i = 0; i < rows; i++) {
      if (r() < 0.25) continue;
      const stack = 1 + Math.floor(r() * 3);
      for (let s = 0; s < stack; s++) {
        boxC(out.boxes, b.x0 + 9 + i * 13, G + s * 2.6, b.z1 - 8, 12, 2.6, 2.5, pick(r, PAL.container), MODE.WALL);
      }
    }
  } else if (kind < 0.85) {
    // container yard
    for (let i = 0; i < Math.floor((b.x1 - b.x0 - 8) / 13); i++) {
      for (let j = 0; j < Math.floor((b.z1 - b.z0 - 8) / 5.8); j++) {
        if (r() < 0.3) continue;
        const stack = 1 + Math.floor(r() * 3);
        for (let s = 0; s < stack; s++) boxC(out.boxes, b.x0 + 8 + i * 13, G + s * 2.6, b.z0 + 6 + j * 5.8, 12, 2.6, 2.5, pick(r, PAL.container), MODE.WALL);
      }
    }
  } else {
    // tank farm + stack
    const nt = 3 + Math.floor(r() * 3);
    for (let i = 0; i < nt; i++) {
      const rr = 6 + r() * 5;
      cyl(out.cyls, lerp(b.x0 + 12, b.x1 - 12, (i + 0.5) / nt), G, lerp(b.z0 + 14, b.z1 - 14, r()), rr, 10 + r() * 12, r() < 0.5 ? 0xd9dcdc : 0xa8b0b4, MODE.METAL);
    }
    cyl(out.cyls, b.x1 - 8, G, b.z0 + 10, 2.4, 52, 0x8a6a5a, MODE.WALL);
    boxC(out.boxes, b.x1 - 8, G + 52, b.z0 + 10, 1.4, 1.4, 1.4, 0xff3322, MODE.NEON, false);
    box(out.boxes, b.x0 + 6, b.z1 - 24, b.x0 + 36, b.z1 - 6, G, 7, pick(r, PAL.industrial), MODE.CLERESTORY);
  }
}

function genPark(b: Block, r: () => number, out: ChunkData, plaza: boolean): void {
  const n = Math.floor((b.w * b.d) / (plaza ? 700 : 220));
  for (let i = 0; i < n; i++) {
    const x = lerp(b.x0 + 4, b.x1 - 4, r()), z = lerp(b.z0 + 4, b.z1 - 4, r());
    if (plaza && Math.hypot(x - b.cx, z - b.cz) < 12) continue;
    treeAt(out, x, z, r, plaza ? 1 : r() < 0.2 ? 2 : 0);
  }
  if (plaza) {
    cyl(out.cyls, b.cx, G, b.cz, 7, 0.9, 0xcfc8bb, MODE.WALL, false);
    cyl(out.cyls, b.cx, G + 0.9, b.cz, 5.4, 0.15, 0x3ab6e0, MODE.GLOW, false);
    cyl(out.cyls, b.cx, G, b.cz, 0.7, 4, 0xcfc8bb, MODE.WALL, false);
  } else {
    // pavilion
    box(out.boxes, b.cx - 6, b.cz - 4, b.cx + 6, b.cz + 4, G, 3.6, pick(r, PAL.stone), MODE.WALL);
    box(out.boxes, b.cx - 7.5, b.cz - 5.5, b.cx + 7.5, b.cz + 5.5, G + 3.6, 0.5, 0x7d5a46, MODE.WALL, false);
  }
}

function genMall(b: Block, r: () => number, out: ChunkData): void {
  const x0 = b.x0 + 6, x1 = b.x1 - 6, z0 = b.z0 + 6, z1 = b.z0 + b.d * 0.55;
  box(out.boxes, x0, z0, x1, z1, G, 15, 0xd8c9b0, MODE.PUNCHED);
  box(out.boxes, x0 + 20, z0 - 3, x0 + 70, z0 + 3, G, 11, 0xbfd2d8, MODE.GLASS);
  box(out.boxes, x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5, G + 15, 0.8, 0x7c6f60, MODE.METAL, false);
  boxC(out.boxes, x0 + 45, G + 15, z0 - 2, 36, 5, 0.8, 0xff2e88, MODE.NEON, false);
  roofClutter(out, r, x0, z0, x1, z1, G + 15.8, 6);
  for (let i = 0; i < 8; i++) treeAt(out, lerp(x0, x1, (i + 0.5) / 8), z1 + 7, r, 1);
}

function genPolice(b: Block, r: () => number, out: ChunkData): void {
  const x0 = b.x0 + 5, x1 = b.x1 - 5, z0 = b.z0 + 5, z1 = b.z1 - 28;
  box(out.boxes, x0, z0, x1, z1, G, 14, 0x8895a6, MODE.PUNCHED);
  box(out.boxes, x0 + 10, z0 + 8, x1 - 10, z1 - 6, G + 14, 30, 0x5d6d82, MODE.GLASS);
  boxC(out.boxes, (x0 + x1) / 2, G + 44, (z0 + z1) / 2, 14, 3, 14, 0x3a4658, MODE.METAL);
  boxC(out.boxes, (x0 + x1) / 2, G + 44, (z0 + z1) / 2, 0.8, 34, 0.8, 0x70757c, MODE.METAL, false);
  boxC(out.boxes, (x0 + x1) / 2, G + 78, (z0 + z1) / 2, 1.3, 1.3, 1.3, 0xff3322, MODE.NEON, false);
  boxC(out.boxes, (x0 + x1) / 2, G + 6, z0 - 0.3, Math.min(30, x1 - x0 - 10), 1.4, 0.6, 0x2f7bff, MODE.NEON, false);
  box(out.boxes, x0 + 4, z1 + 6, x0 + 40, z1 + 10, G, 2.6, 0x3a3f46, MODE.WALL);
  roofClutter(out, r, x0, z0, x1, z1, G + 14, 3);
}

function genHospital(b: Block, r: () => number, out: ChunkData): void {
  const cx = b.cx, cz = b.cz;
  const col = 0xe7e8e4;
  box(out.boxes, cx - 82, cz - 22, cx - 30, cz + 22, G, 26, col, MODE.PUNCHED);
  box(out.boxes, cx + 30, cz - 22, cx + 82, cz + 22, G, 26, col, MODE.PUNCHED);
  box(out.boxes, cx - 34, cz - 18, cx + 34, cz + 18, G, 52, 0xdfe6ea, MODE.GLASS);
  boxC(out.boxes, cx, G + 52, cz, 22, 3, 22, 0x9aa4aa, MODE.METAL);
  cyl(out.cyls, cx + 56, G + 26, cz, 9, 0.5, 0x595f66, MODE.METAL);
  boxC(out.boxes, cx + 56, G + 26.5, cz, 1.6, 0.1, 8, 0xffd23c, MODE.GLOW, false);
  boxC(out.boxes, cx + 56, G + 26.5, cz, 8, 0.1, 1.6, 0xffd23c, MODE.GLOW, false);
  // red cross sign
  boxC(out.boxes, cx, G + 38, b.z0 - 0.3 + 0.8, 9, 2.4, 0.5, 0xff2d2d, MODE.NEON, false);
  boxC(out.boxes, cx, G + 38, b.z0 - 0.3 + 0.8, 2.4, 9, 0.5, 0xff2d2d, MODE.NEON, false);
  for (let i = 0; i < 6; i++) treeAt(out, lerp(b.x0 + 12, b.x1 - 12, r()), b.z1 - 6 - r() * 6, r, 0);
}

function genStadium(b: Block, _r: () => number, out: ChunkData): void {
  const cx = b.cx, cz = b.cz;
  const rx = Math.min(100, b.w / 2 - 12), rz = Math.min(80, b.d / 2 - 12);
  const seg = 32;
  const gate = (a: number) => [0, seg / 4, seg / 2, (3 * seg) / 4].some((g) => Math.abs(a - g) < 1.2);
  const tiers: [number, number, number, number][] = [
    // scale, height, thickness, colour
    [1.0, 24, 7, 0xcfc9bf],
    [0.88, 15, 6, 0x9b2b2b],
    [0.76, 8, 6, 0xb8b0a4],
    [0.66, 3.2, 5, 0x9b2b2b],
  ];
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
    for (let t = 0; t < tiers.length; t++) {
      const [s, h, th, col] = tiers[t]!;
      if (t === 0 && gate(k + 0.5)) continue;
      const px = cx + Math.cos(am) * rx * s, pz = cz + Math.sin(am) * rz * s;
      const len = Math.hypot(rx * Math.sin(am), rz * Math.cos(am)) * s * (a1 - a0) * 1.06;
      // box local +x is its thickness: point it along the ellipse's outward normal so +z runs tangent
      const ry = -Math.atan2(Math.sin(am) / rz, Math.cos(am) / rx);
      boxC(out.boxes, px, G, pz, th, h, len, col, t === 0 ? MODE.WALL : MODE.SEATS, true, ry);
    }
  }
  // floodlight masts
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const px = cx + sx * (rx + 6), pz = cz + sz * (rz + 6);
    cyl(out.cyls, px, G, pz, 0.8, 58, 0x70757c, MODE.METAL);
    boxC(out.boxes, px, G + 58, pz, 8, 4, 3, 0xfff2cc, MODE.GLOW, false, Math.atan2(-sz, -sx));
  }
}

function genBeach(x0: number, x1: number, z0: number, z1: number, out: ChunkData): void {
  // lifeguard towers every ~190 m along the sand
  if (x0 > 128 || x1 < 128) return;
  for (let z = Math.ceil(z0 / 190) * 190 + 40; z < z1; z += 190) {
    if (Math.abs(z) < 120) continue;
    const g = G - 0.4;
    boxC(out.boxes, 148, g + 2.2, z, 2.6, 0.3, 2.6, 0xf5f0e6, MODE.WALL);
    boxC(out.boxes, 148, g + 2.5, z, 2.2, 2.2, 2.2, 0xe85a4f, MODE.PUNCHED);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) boxC(out.boxes, 148 + dx * 1.1, g, z + dz * 1.1, 0.25, 2.2, 0.25, 0xf5f0e6, MODE.WALL, false);
  }
}

function genPier(inside: (x: number, z: number) => boolean, out: ChunkData): void {
  const len = PIER.x0 - PIER.x1;
  const step = 20;
  for (let x = PIER.x0; x > PIER.x1; x -= step) {
    const cx = x - step / 2;
    if (!inside(cx, PIER.z)) continue;
    boxC(out.boxes, cx, 3.95, PIER.z, step, 0.6, PIER.w, 0x8a6a4a, MODE.WALL);
    // railings
    for (const s of [-1, 1]) boxC(out.boxes, cx, 4.55, PIER.z + s * (PIER.w / 2 - 0.2), step, 1.0, 0.18, 0x6b4f38, MODE.WALL, false);
    for (let px = x - 2; px > x - step; px -= 6) {
      for (const s of [-1, 1]) cyl(out.cyls, px, -9, PIER.z + s * (PIER.w / 2 - 0.9), 0.35, 13, 0x4a3a2c, MODE.WALL, false);
    }
  }
  // pier-head: round kiosk + sign
  if (inside(PIER.x1 + 10, PIER.z)) {
    boxC(out.boxes, PIER.x1 + 14, 4.5, PIER.z, 9, 3.4, 7, 0xf2ead8, MODE.PUNCHED);
    boxC(out.boxes, PIER.x1 + 14, 7.9, PIER.z, 10, 0.5, 8, 0xe85a4f, MODE.WALL, false);
    boxC(out.boxes, PIER.x1 + 8.8, 8.8, PIER.z, 0.5, 2, 7, 0x27e6ff, MODE.NEON, false);
  }
  void len;
}

function genFunfair(inside: (x: number, z: number) => boolean, out: ChunkData): void {
  if (!inside(FUNFAIR.x, FUNFAIR.z)) return;
  const { x, z } = FUNFAIR;
  const r = rngFor(5, 5, 5);
  // gate arch
  boxC(out.boxes, x + 44, G, z - 22, 1.6, 9, 1.6, 0xf2ead8, MODE.WALL);
  boxC(out.boxes, x + 44, G, z + 22, 1.6, 9, 1.6, 0xf2ead8, MODE.WALL);
  boxC(out.boxes, x + 44, G + 9, z, 1.4, 3.2, 47, 0xff2e88, MODE.NEON, false);
  // stalls
  for (let i = 0; i < 6; i++) {
    const sx = x + 14 + (i % 3) * 14, sz = z + (i < 3 ? -26 : 26);
    boxC(out.boxes, sx, G, sz, 8, 3.2, 6, pick(r, PAL.pastel), MODE.PUNCHED);
    boxC(out.boxes, sx, G + 3.2, sz, 9.4, 0.5, 7.4, pick(r, PAL.neon), MODE.NEON, false);
  }
  // wheel legs (the wheel itself is an animated mesh)
  for (const s of [-1, 1]) {
    boxC(out.boxes, x - 4, G, z + s * 9, 1.2, 29, 1.2, 0x9aa4aa, MODE.METAL);
  }
  for (let i = 0; i < 6; i++) treeAt(out, x - 30 + r() * 20, z - 38 + r() * 76, r, 1);
}

function genVilla(x: number, z: number, yaw: number, r: () => number, out: ChunkData): void {
  const w = 20 + r() * 9, d = 13 + r() * 5;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // lowest and highest ground under the footprint
  let lo = Infinity, hi = -Infinity;
  for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]] as const) {
    const px = x + (u * w * 0.5) * c - (v * d * 0.5) * s;
    const pz = z + (u * w * 0.5) * s + (v * d * 0.5) * c;
    const h = terrainHeight(px, pz);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  const base = lo - 0.4;
  const ground = hi - base + 3.4; // foundation up to the highest corner plus a storey
  const col = pick(r, PAL.villa);
  const ry = -yaw;
  boxC(out.boxes, x, base, z, w, ground, d, col, MODE.PUNCHED, true, ry);
  boxC(out.boxes, x + 3 * c - 0 * s, base + ground, z + 3 * s, w * 0.7, 3.4, d * 0.8, col, MODE.GLASS, true, ry);
  boxC(out.boxes, x, base + ground + 3.4, z, w * 0.85, 0.5, d * 0.95, 0x40454c, MODE.WALL, false, ry);
  treeAt(out, x - 11 * c, z - 11 * s, r, 1, base + 0.2);
  treeAt(out, x + 12 * c, z + 9 * s, r, 2, base + 0.2);
}
