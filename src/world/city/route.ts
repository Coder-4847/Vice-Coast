import { CityPlan, PLAN_RADIUS } from './plan';
import { CITY } from '../Terrain';

export interface Route {
  /** Polyline in world (x, z). */
  pts: [number, number][];
  /** Length in metres, including the straight legs to and from the road network. */
  length: number;
}

interface Edge { a: number; b: number; len: number; cost: number }

/** Shortest road route over the plan's grid of intersections (arterials are preferred). */
export class Router {
  private readonly nodes: { x: number; z: number; ok: boolean }[] = [];
  private readonly edges: Edge[] = [];
  private readonly adj: number[][] = [];
  private readonly nz: number;

  constructor(plan: CityPlan) {
    const { X, Z } = plan;
    this.nz = Z.length;
    for (const rx of X) {
      for (const rz of Z) {
        this.nodes.push({ x: rx.pos, z: rz.pos, ok: Math.hypot(rx.pos - CITY.x, rz.pos - CITY.z) < PLAN_RADIUS - 12 });
      }
    }
    this.nodes.forEach(() => this.adj.push([]));
    const idx = (i: number, j: number) => i * this.nz + j;
    const add = (a: number, b: number, art: boolean) => {
      const na = this.nodes[a]!, nb = this.nodes[b]!;
      if (!na.ok || !nb.ok) return;
      const len = Math.hypot(na.x - nb.x, na.z - nb.z);
      const e = { a, b, len, cost: len * (art ? 1 : 1.35) };
      this.adj[a]!.push(this.edges.length);
      this.adj[b]!.push(this.edges.length);
      this.edges.push(e);
    };
    for (let i = 0; i < X.length; i++) for (let j = 0; j < Z.length - 1; j++) add(idx(i, j), idx(i, j + 1), X[i]!.arterial);
    for (let j = 0; j < Z.length; j++) for (let i = 0; i < X.length - 1; i++) add(idx(i, j), idx(i + 1, j), Z[j]!.arterial);
  }

  /** Nearest point on any road centreline: the edge, the projected point and the distance to it. */
  private snap(x: number, z: number): { e: number; px: number; pz: number; d: number; t: number } {
    let best = { e: -1, px: x, pz: z, d: Infinity, t: 0 };
    for (let k = 0; k < this.edges.length; k++) {
      const e = this.edges[k]!;
      const a = this.nodes[e.a]!, b = this.nodes[e.b]!;
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const px = a.x + dx * t, pz = a.z + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best.d) best = { e: k, px, pz, d, t };
    }
    return best;
  }

  route(fx: number, fz: number, tx: number, tz: number): Route | null {
    if (!this.edges.length) return null;
    const s = this.snap(fx, fz);
    const g = this.snap(tx, tz);
    const pts: [number, number][] = [[fx, fz], [s.px, s.pz]];
    let length = s.d;
    if (s.e === g.e) {
      pts.push([g.px, g.pz]);
      length += Math.hypot(g.px - s.px, g.pz - s.pz);
    } else {
      const es = this.edges[s.e]!, eg = this.edges[g.e]!;
      // Dijkstra from the two ends of the start edge
      const dist = new Float64Array(this.nodes.length).fill(Infinity);
      const prev = new Int32Array(this.nodes.length).fill(-1);
      const open: number[] = [];
      const seed = (n: number, d: number) => {
        if (d < dist[n]!) { dist[n] = d; open.push(n); }
      };
      seed(es.a, s.t * es.cost);
      seed(es.b, (1 - s.t) * es.cost);
      const done = new Uint8Array(this.nodes.length);
      while (open.length) {
        let bi = 0;
        for (let i = 1; i < open.length; i++) if (dist[open[i]!]! < dist[open[bi]!]!) bi = i;
        const n = open.splice(bi, 1)[0]!;
        if (done[n]) continue;
        done[n] = 1;
        for (const ei of this.adj[n]!) {
          const e = this.edges[ei]!;
          const m = e.a === n ? e.b : e.a;
          const nd = dist[n]! + e.cost;
          if (nd < dist[m]!) { dist[m] = nd; prev[m] = n; open.push(m); }
        }
      }
      // finish at whichever end of the goal edge is cheaper
      const ca = dist[eg.a]! + g.t * eg.cost, cb = dist[eg.b]! + (1 - g.t) * eg.cost;
      let end = ca <= cb ? eg.a : eg.b;
      if (!isFinite(dist[end]!)) end = ca <= cb ? eg.b : eg.a;
      if (!isFinite(dist[end]!)) return null;
      const chain: number[] = [];
      for (let n = end; n !== -1; n = prev[n]!) chain.push(n);
      chain.reverse();
      // the first node may be either end of the start edge; if the chain starts at the far end, the start point
      // is projected on the way, which is what we want
      for (const n of chain) pts.push([this.nodes[n]!.x, this.nodes[n]!.z]);
      pts.push([g.px, g.pz]);
      for (let i = 2; i < pts.length; i++) length += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
    }
    pts.push([tx, tz]);
    length += g.d;
    return { pts, length };
  }
}
