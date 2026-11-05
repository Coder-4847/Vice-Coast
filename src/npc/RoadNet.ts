import { CityPlan, PLAN_RADIUS, type Road } from '../world/city/plan';
import { CITY } from '../world/Terrain';

/** Headings: 0 = +x (east), 1 = +z (south), 2 = −x (west), 3 = −z (north). Right-hand traffic. */
export type Heading = 0 | 1 | 2 | 3;
export const HEAD_DX = [1, 0, -1, 0] as const;
export const HEAD_DZ = [0, 1, 0, -1] as const;
export const right = (h: Heading): Heading => ((h + 1) % 4) as Heading;
export const left = (h: Heading): Heading => ((h + 3) % 4) as Heading;

export const STOP_BACK = 5.4; // front bumper stops this far before the crossing road's edge (clear of the zebra)

export interface LaneDef {
  id: number;
  axis: 0 | 1;
  dir: 1 | -1;
  heading: Heading;
  /** 0 = innermost lane of its direction. */
  laneIdx: number;
  laneCount: number;
  /** World coordinate of the lane's centreline across the axis (x for axis 0, z for axis 1). */
  off: number;
  /** Start and end coordinate along the axis (the edges of the junction boxes). */
  sA: number;
  sB: number;
  len: number;
  stopU: number;
  a: number;
  b: number;
  speed: number;
  art: boolean;
  road: Road;
}

export interface TurnPath {
  x0: number; z0: number; x1: number; z1: number; x2: number; z2: number;
  len: number;
  straight: boolean;
}

export interface NetNode { x: number; z: number; i: number; j: number; ok: boolean }

/**
 * The drivable network derived from the city plan: directed lanes between junctions, with turn paths through the
 * junction boxes. Pure data, no rendering.
 */
export class RoadNet {
  readonly nodes: NetNode[] = [];
  readonly lanes: LaneDef[] = [];
  private readonly from = new Map<number, LaneDef[]>();
  private readonly into = new Map<number, LaneDef[]>();
  private readonly cum: number[] = [];
  private readonly paths = new Map<number, TurnPath>();
  private readonly totalLen: number;
  private readonly nz: number;

  constructor(readonly plan: CityPlan) {
    const { X, Z } = plan;
    this.nz = Z.length;
    for (let i = 0; i < X.length; i++) {
      for (let j = 0; j < Z.length; j++) {
        const x = X[i]!.pos, z = Z[j]!.pos;
        this.nodes.push({ x, z, i, j, ok: Math.hypot(x - CITY.x, z - CITY.z) < PLAN_RADIUS - 12 });
      }
    }
    const idx = (i: number, j: number) => i * this.nz + j;
    const offs = (r: Road): number[] => (r.arterial ? [3.2, 9.0] : [3.75]);
    const add = (l: Omit<LaneDef, 'id' | 'len' | 'stopU'>) => {
      const len = Math.abs(l.sB - l.sA);
      const lane: LaneDef = { ...l, id: this.lanes.length, len, stopU: len - STOP_BACK };
      this.lanes.push(lane);
      const key = lane.a * 4 + lane.heading;
      let list = this.from.get(key);
      if (!list) this.from.set(key, (list = []));
      list.push(lane);
      const ik = lane.b * 4 + lane.heading;
      let il = this.into.get(ik);
      if (!il) this.into.set(ik, (il = []));
      il.push(lane);
    };
    // N–S roads (axis 0): segment between Z[j] and Z[j+1]
    for (let i = 0; i < X.length; i++) {
      const r = X[i]!;
      for (let j = 0; j < Z.length - 1; j++) {
        const n0 = idx(i, j), n1 = idx(i, j + 1);
        if (!this.nodes[n0]!.ok || !this.nodes[n1]!.ok) continue;
        const s0 = Z[j]!.pos + Z[j]!.hw, s1 = Z[j + 1]!.pos - Z[j + 1]!.hw;
        const o = offs(r);
        o.forEach((off, k) => {
          const base = { axis: 0 as const, laneIdx: k, laneCount: o.length, speed: r.arterial ? 15.5 : 10.5, art: r.arterial, road: r };
          add({ ...base, dir: 1, heading: 1, off: r.pos - off, sA: s0, sB: s1, a: n0, b: n1 });
          add({ ...base, dir: -1, heading: 3, off: r.pos + off, sA: s1, sB: s0, a: n1, b: n0 });
        });
      }
    }
    // E–W roads (axis 1): segment between X[i] and X[i+1]
    for (let j = 0; j < Z.length; j++) {
      const r = Z[j]!;
      for (let i = 0; i < X.length - 1; i++) {
        const n0 = idx(i, j), n1 = idx(i + 1, j);
        if (!this.nodes[n0]!.ok || !this.nodes[n1]!.ok) continue;
        const s0 = X[i]!.pos + X[i]!.hw, s1 = X[i + 1]!.pos - X[i + 1]!.hw;
        const o = offs(r);
        o.forEach((off, k) => {
          const base = { axis: 1 as const, laneIdx: k, laneCount: o.length, speed: r.arterial ? 15.5 : 10.5, art: r.arterial, road: r };
          add({ ...base, dir: 1, heading: 0, off: r.pos + off, sA: s0, sB: s1, a: n0, b: n1 });
          add({ ...base, dir: -1, heading: 2, off: r.pos - off, sA: s1, sB: s0, a: n1, b: n0 });
        });
      }
    }
    for (const list of this.from.values()) list.sort((p, q) => p.laneIdx - q.laneIdx);
    let acc = 0;
    for (const l of this.lanes) {
      acc += l.len * (l.art ? 1.7 : 1);
      this.cum.push(acc);
    }
    this.totalLen = acc;
  }

  lanesFrom(node: number, heading: Heading): LaneDef[] {
    return this.from.get(node * 4 + heading) ?? [];
  }

  /** Lanes that end at `node` while travelling with `heading`. */
  lanesInto(node: number, heading: Heading): LaneDef[] {
    return this.into.get(node * 4 + heading) ?? [];
  }

  /** The lane leaving `node` towards `next` (matching `prefer` lane index where possible). */
  laneToward(node: number, next: number, prefer: number): LaneDef | null {
    let best: LaneDef | null = null;
    for (let h = 0; h < 4; h++) {
      for (const l of this.lanesFrom(node, h as Heading)) {
        if (l.b !== next) continue;
        if (!best || Math.abs(l.laneIdx - prefer) < Math.abs(best.laneIdx - prefer)) best = l;
      }
    }
    return best;
  }

  /** Shortest sequence of nodes from `a` to `b` over the lane graph (BFS by length), or null. */
  route(a: number, b: number): number[] | null {
    const dist = new Map<number, number>([[a, 0]]);
    const prev = new Map<number, number>();
    const open = [a];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (dist.get(open[i]!)! < dist.get(open[bi]!)!) bi = i;
      const n = open.splice(bi, 1)[0]!;
      if (n === b) break;
      for (let h = 0; h < 4; h++) {
        for (const l of this.lanesFrom(n, h as Heading)) {
          if (l.laneIdx !== 0) continue;
          const nd = dist.get(n)! + l.len;
          if (nd < (dist.get(l.b) ?? Infinity)) { dist.set(l.b, nd); prev.set(l.b, n); open.push(l.b); }
        }
      }
    }
    if (!prev.has(b) && a !== b) return null;
    const out: number[] = [];
    for (let n: number | undefined = b; n !== undefined; n = prev.get(n)) out.push(n);
    return out.reverse();
  }

  /** World position of a point `u` metres along a lane. */
  point(lane: LaneDef, u: number, out: { x: number; z: number }): void {
    const s = lane.sA + lane.dir * u;
    if (lane.axis === 0) { out.x = lane.off; out.z = s; } else { out.x = s; out.z = lane.off; }
  }

  /** Path through the junction from the end of `a` to the start of `b` (cached). */
  turn(a: LaneDef, b: LaneDef): TurnPath {
    const key = a.id * 100000 + b.id;
    let p = this.paths.get(key);
    if (p) return p;
    const e = { x: 0, z: 0 }, s = { x: 0, z: 0 };
    this.point(a, a.len, e);
    this.point(b, 0, s);
    const straight = a.axis === b.axis;
    let cx = (e.x + s.x) / 2, cz = (e.z + s.z) / 2;
    if (!straight) {
      // the lane centrelines cross at (x of the N–S lane, z of the E–W lane)
      cx = a.axis === 0 ? a.off : b.off;
      cz = a.axis === 1 ? a.off : b.off;
    }
    let len = 0;
    let px = e.x, pz = e.z;
    for (let k = 1; k <= 8; k++) {
      const t = k / 8, w = 1 - t;
      const x = w * w * e.x + 2 * w * t * cx + t * t * s.x, z = w * w * e.z + 2 * w * t * cz + t * t * s.z;
      len += Math.hypot(x - px, z - pz);
      px = x; pz = z;
    }
    p = { x0: e.x, z0: e.z, x1: cx, z1: cz, x2: s.x, z2: s.z, len, straight };
    this.paths.set(key, p);
    return p;
  }

  /** Pick the lane to continue on from the end of `lane`, or null at the edge of town. */
  choose(lane: LaneDef, r: () => number, forceStraight = false): LaneDef | null {
    const n = lane.b;
    const h = lane.heading;
    const all: { lanes: LaneDef[]; w: number; kind: 0 | 1 | 2 }[] = [
      { lanes: this.lanesFrom(n, h), w: 0.62, kind: 0 },
      { lanes: this.lanesFrom(n, right(h)), w: forceStraight ? 0 : 0.2, kind: 1 },
      { lanes: this.lanesFrom(n, left(h)), w: forceStraight ? 0 : 0.18, kind: 2 },
    ];
    const opts = all.filter((o) => o.lanes.length > 0);
    if (!opts.length) return null;
    let total = 0;
    for (const o of opts) total += o.w;
    if (total <= 0) return opts[0]!.lanes[0]!;
    let pickW = r() * total;
    let chosen = opts[0]!;
    for (const o of opts) { if ((pickW -= o.w) <= 0) { chosen = o; break; } }
    const ls = chosen.lanes;
    if (chosen.kind === 0) return ls[Math.min(lane.laneIdx, ls.length - 1)]!;
    if (chosen.kind === 1) return ls[ls.length - 1]!;
    return ls[0]!;
  }

  /** A random lane position, weighted by lane length. */
  random(r: () => number): { lane: LaneDef; u: number } {
    const t = r() * this.totalLen;
    let lo = 0, hi = this.cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid]! < t) lo = mid + 1; else hi = mid;
    }
    const l = this.lanes[lo]!;
    return { lane: l, u: 4 + r() * Math.max(1, l.len - 14) };
  }
}
