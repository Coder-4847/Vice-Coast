import { CHUNK, MODE, hash2, mulberry32, type ChunkData, type Lamp, type Prim, type Tree } from '../city/plan';
import { mergeChunks, VEG, type ChunkSource, type Veg, type VegKind } from '../city/source';
import { terrainHeight } from '../heightfield';

/** Palettes shared by the towns. */
export const PAL = {
  wood: [0x8a6a48, 0x7a5a3a, 0x9a7a55, 0x6e5238, 0xa68660],
  paint: [0xe8e0d0, 0xc9d6c8, 0xd9c7a8, 0xb8c7d6, 0xe3c9c0, 0xcfd8b5],
  barn: [0x8c3b2e, 0x7a3228, 0x9a4535],
  rust: [0x8a5a3c, 0x7b4a32, 0x9a6a46, 0x6b4a3a, 0xa7794e],
  metal: [0x8a9096, 0x737b82, 0x9ba2a8, 0x6a7178],
  container: [0xb3472f, 0x2f6b8a, 0xc9a227, 0x4a7a4a, 0x8a3a3a, 0x3b4d6b, 0xd0d0cc, 0xd8741f, 0x5a6f7a],
  pastel: [0xf0c9b8, 0xf2dca4, 0xbfdcd4, 0xedb8bc, 0xcbd8ee, 0xf7e7cf, 0xdbeac4, 0xf5b9a0, 0xa9d6d2],
  neon: [0xff2e88, 0x27e6ff, 0xffb02e, 0x8a5cff, 0x39ff88, 0xff5a3c],
  roof: [0x8a4b38, 0x7a3f30, 0x9a5a40, 0x5a4a45, 0x6a5a50, 0x495a5a],
  dark: [0x40454c, 0x363b42, 0x4b4f55],
  white: 0xf0ede6,
};

export const pick = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length]!;

export interface BoxOpts { y0?: number; ry?: number; solid?: boolean; mode?: number; rx?: number; rz?: number }

/**
 * Authoring kit for hand-placed settlements: collects instanced boxes and cylinders, lamps, trees and vegetation, then hands
 * them out chunk by chunk. All y values default to the terrain height at the object's centre (settlements sit on flat ground).
 */
export class Kit {
  readonly boxes: Prim[] = [];
  readonly cyls: Prim[] = [];
  readonly lamps: Lamp[] = [];
  readonly trees: Tree[] = [];
  readonly veg: Veg[] = [];
  readonly r: () => number;

  constructor(readonly name: string, seed: number) {
    this.r = mulberry32(hash2(seed, 77, 5));
  }

  ground(x: number, z: number): number {
    return terrainHeight(x, z);
  }

  /** Centre-based box standing on `y0` (default: the ground at its centre). */
  box(x: number, z: number, w: number, d: number, h: number, color: number, o: BoxOpts = {}): Prim {
    const y0 = o.y0 ?? this.ground(x, z);
    const p: Prim = { x, y: y0 + h / 2, z, sx: w, sy: h, sz: d, ry: o.ry ?? 0, color, mode: o.mode ?? MODE.WALL, solid: o.solid ?? true };
    if (o.rx) p.rx = o.rx;
    if (o.rz) p.rz = o.rz;
    this.boxes.push(p);
    return p;
  }

  /** Vertical cylinder (or, with tilt, a log / pipe). `dia` and `h` in metres. */
  cyl(x: number, z: number, dia: number, h: number, color: number, o: BoxOpts = {}): Prim {
    const y0 = o.y0 ?? this.ground(x, z);
    const p: Prim = { x, y: y0 + h / 2, z, sx: dia, sy: h, sz: dia, ry: o.ry ?? 0, color, mode: o.mode ?? MODE.WALL, solid: o.solid ?? true };
    if (o.rx) p.rx = o.rx;
    if (o.rz) p.rz = o.rz;
    this.cyls.push(p);
    return p;
  }

  /** Horizontal cylinder along local x (rotated by yaw), centred at height `y`. */
  pipe(x: number, y: number, z: number, dia: number, len: number, color: number, yaw = 0, mode: number = MODE.WALL, solid = false): Prim {
    const p: Prim = { x, y, z, sx: dia, sy: len, sz: dia, ry: yaw, rz: Math.PI / 2, color, mode, solid };
    this.cyls.push(p);
    return p;
  }

  /**
   * Offset local (u, v) by `yaw` about (cx, cz). Convention: `yaw` is the world heading (atan2(dz, dx)) of the building's
   * width axis; +u runs along it and +v is a quarter-turn clockwise from it on the map (towards +z when yaw = 0).
   */
  at(cx: number, cz: number, yaw: number, u: number, v: number): [number, number] {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return [cx + u * c - v * s, cz + u * s + v * c];
  }

  /**
   * A building with walls and a roof. `roof`: 'flat' (parapet), 'gable' (ridge along width), 'hip', 'shed', or 'false'
   * (a taller false front facing +v, as in a western main street). `yaw` rotates the whole thing (ry sign as in plan.ts).
   */
  building(x: number, z: number, w: number, d: number, h: number, yaw: number, wall: number, o: {
    roof?: 'flat' | 'gable' | 'hip' | 'shed' | 'false' | 'none'; roofColor?: number; mode?: number; pitch?: number; overhang?: number; y0?: number; floors?: number; solid?: boolean;
  } = {}): void {
    const ry = -yaw;
    const y0 = o.y0 ?? this.ground(x, z);
    const mode = o.mode ?? MODE.WALL;
    this.box(x, z, w, d, h, wall, { y0, ry, mode, solid: o.solid });
    const roof = o.roof ?? 'flat';
    const rc = o.roofColor ?? pick(this.r, PAL.roof);
    const ov = o.overhang ?? 0.5;
    const top = y0 + h;
    if (roof === 'flat') {
      this.box(x, z, w + 0.3, d + 0.3, 0.45, 0x55585e, { y0: top, ry, solid: false });
    } else if (roof === 'gable') {
      const pitch = o.pitch ?? 0.5; // radians
      const half = d / 2 + ov;
      const slope = half / Math.cos(pitch);
      const rise = Math.tan(pitch) * half;
      for (const sgn of [-1, 1]) {
        const [px, pz] = this.at(x, z, yaw, 0, sgn * half / 2);
        const r = this.box(px, pz, w + ov * 2, slope, 0.22, rc, { y0: top + rise / 2 - 0.1, ry, solid: false });
        r.rx = sgn * pitch;
      }
      // gable ends: stepped fill so the triangle reads from the side
      const steps = 4;
      for (let k = 0; k < steps; k++) {
        const ww = (d * (steps - k)) / steps;
        this.box(x, z, w * 0.98, ww, rise / steps + 0.02, wall, { y0: top + (rise / steps) * k, ry, solid: false });
      }
    } else if (roof === 'hip') {
      const pitch = o.pitch ?? 0.45;
      const half = Math.min(w, d) / 2 + ov;
      const slope = half / Math.cos(pitch);
      const rise = Math.tan(pitch) * half;
      for (const [u, v, sx, sz, rxs, rzs] of [[0, -1, w + ov * 2, slope, -1, 0], [0, 1, w + ov * 2, slope, 1, 0], [-1, 0, slope, d + ov * 2, 0, 1], [1, 0, slope, d + ov * 2, 0, -1]] as const) {
        const [px, pz] = this.at(x, z, yaw, (u * (w / 2 + ov)) / 2, (v * (d / 2 + ov)) / 2);
        const b = this.box(px, pz, sx, sz, 0.2, rc, { y0: top + rise / 2 - 0.1, ry, solid: false });
        b.rx = rxs * pitch; b.rz = rzs * pitch;
      }
      this.box(x, z, w * 0.5, d * 0.5, rise * 0.8, rc, { y0: top, ry, solid: false });
    } else if (roof === 'shed') {
      const pitch = o.pitch ?? 0.18;
      const b = this.box(x, z, w + ov, d + ov * 2, 0.2, rc, { y0: top + 0.3, ry, solid: false });
      b.rx = pitch;
    } else if (roof === 'false') {
      const [px, pz] = this.at(x, z, yaw, 0, d / 2 - 0.15);
      this.box(px, pz, w, 0.3, 2.2, wall, { y0: top, ry, solid: false });
      this.box(x, z, w + 0.2, d + 0.2, 0.3, 0x4a4d52, { y0: top, ry, solid: false });
    }
  }

  /** A run of fence: posts every `step` metres and a rail (cosmetic, solid rail so players don't walk through). */
  fence(x0: number, z0: number, x1: number, z1: number, h = 1.8, color = 0x7a7066, step = 3, solid = true): void {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(z1 - z0, x1 - x0);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.box(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, 0.14, 0.14, h, color, { solid: false });
    }
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    this.box(mx, mz, len, 0.08, 0.1, color, { y0: this.ground(mx, mz) + h * 0.8, ry: -yaw, solid: false });
    this.box(mx, mz, len, 0.08, 0.1, color, { y0: this.ground(mx, mz) + h * 0.4, ry: -yaw, solid });
  }

  /** Chain-link style fence with a solid body (thin, so it blocks movement but not sight). */
  wall(x0: number, z0: number, x1: number, z1: number, h: number, color: number, thick = 0.25, mode: number = MODE.WALL): void {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(z1 - z0, x1 - x0);
    this.box((x0 + x1) / 2, (z0 + z1) / 2, len, thick, h, color, { ry: -yaw, mode });
  }

  /** An arched hangar (nine roof facets) with open ends: width = 2·rad, length along `yaw`. */
  hangar(x: number, z: number, len: number, rad: number, yaw: number, wall: number, roof: number): void {
    const y0 = this.ground(x, z);
    const ry = -yaw;
    for (const sgn of [-1, 1]) {
      const [sx, sz] = this.at(x, z, yaw, 0, sgn * rad);
      this.box(sx, sz, len, 0.5, 5.5, wall, { y0, ry, mode: MODE.METAL });
    }
    const [bx, bz] = this.at(x, z, yaw, -len / 2 + 0.25, 0);
    this.box(bx, bz, 0.5, rad * 2, 9, wall, { y0, ry, mode: MODE.METAL, solid: true });
    const facets = 9;
    for (let i = 0; i < facets; i++) {
      const phi = ((i + 0.5) / facets - 0.5) * Math.PI * 0.92;
      const [fx, fz] = this.at(x, z, yaw, 0, Math.sin(phi) * rad);
      const fw = 2 * rad * Math.tan((Math.PI * 0.46) / facets) * 1.05;
      this.box(fx, fz, len, fw, 0.25, roof, { y0: y0 + 5.5 + Math.cos(phi) * (rad - 5.5), ry, rx: phi, solid: false });
    }
  }

  lamp(x: number, z: number, yaw: number): void {
    this.lamps.push({ x, z, yaw, y: this.ground(x, z) });
  }

  tree(x: number, z: number, kind: 0 | 1 | 2 = 0, s = 1): void {
    this.trees.push({ x, y: this.ground(x, z), z, kind, s, tint: this.r() });
  }

  plant(kind: VegKind, x: number, z: number, s = 1, tint = this.r()): void {
    this.veg.push({ kind, x, y: this.ground(x, z), z, s, yaw: this.r() * 6.2832, tint });
  }

  /** Scatter plants inside a disc (used for yards and gardens). */
  scatter(kind: VegKind, cx: number, cz: number, rad: number, count: number, s0 = 0.8, s1 = 1.3): void {
    for (let i = 0; i < count; i++) {
      const a = this.r() * 6.2832, d = Math.sqrt(this.r()) * rad;
      this.plant(kind, cx + Math.cos(a) * d, cz + Math.sin(a) * d, s0 + this.r() * (s1 - s0));
    }
  }

  /** A pitched pole sign: post(s) and a panel facing along `yaw`. */
  sign(x: number, z: number, yaw: number, w: number, h: number, poleH: number, color: number, mode: number = MODE.NEON): void {
    this.box(x, z, 0.3, 0.3, poleH, 0x3a3d42);
    const [px, pz] = this.at(x, z, yaw, 0, 0);
    this.box(px, pz, w, 0.35, h, color, { y0: this.ground(x, z) + poleH, ry: -yaw, mode, solid: false });
  }

  // ------------------------------------------------------------------------------------------------ output
  private cache: Map<string, ChunkData> | null = null;

  private bucket(): Map<string, ChunkData> {
    if (this.cache) return this.cache;
    const m = new Map<string, ChunkData>();
    const get = (x: number, z: number): ChunkData => {
      const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
      const k = `${cx},${cz}`;
      let d = m.get(k);
      if (!d) m.set(k, (d = { cx, cz, boxes: [], cyls: [], lamps: [], trees: [], signals: [], veg: [] }));
      return d;
    };
    for (const b of this.boxes) get(b.x, b.z).boxes.push(b);
    for (const b of this.cyls) get(b.x, b.z).cyls.push(b);
    for (const l of this.lamps) get(l.x, l.z).lamps.push(l);
    for (const t of this.trees) get(t.x, t.z).trees.push(t);
    for (const v of this.veg) get(v.x, v.z).veg!.push(v);
    this.cache = m;
    return m;
  }

  chunkAt(cx: number, cz: number): ChunkData | undefined {
    return this.bucket().get(`${cx},${cz}`);
  }

  range(): { cx0: number; cx1: number; cz0: number; cz1: number } {
    const r = { cx0: Infinity, cx1: -Infinity, cz0: Infinity, cz1: -Infinity };
    for (const k of this.bucket().keys()) {
      const [a, b] = k.split(',').map(Number) as [number, number];
      r.cx0 = Math.min(r.cx0, a); r.cx1 = Math.max(r.cx1, a); r.cz0 = Math.min(r.cz0, b); r.cz1 = Math.max(r.cz1, b);
    }
    return r;
  }
}

/** Serves a Kit as a chunk source. */
export class KitSource implements ChunkSource {
  constructor(readonly id: string, private readonly kit: Kit) {}
  chunkRange(): { cx0: number; cx1: number; cz0: number; cz1: number } {
    return this.kit.range();
  }
  generateChunk(cx: number, cz: number): ChunkData {
    return this.kit.chunkAt(cx, cz) ?? { cx, cz, boxes: [], cyls: [], lamps: [], trees: [], signals: [] };
  }
}

export { mergeChunks, VEG, MODE };
