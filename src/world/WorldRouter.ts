import { CityPlan } from './city/plan';
import { CITY } from './Terrain';
import { roadPaths } from './roads';
import type { Route } from './city/route';

interface Node { x: number; z: number }
interface Edge { to: number; cost: number }

/**
 * Shortest route over every road in the world: Port Valeria's street grid plus the sampled highways, county roads, town
 * streets and (at a steep penalty) dirt tracks. Roads that cross, or end at each other, are joined where they come within
 * a few metres. Rail and runways are not drivable.
 */
export class WorldRouter {
  private readonly nodes: Node[] = [];
  private readonly adj: Edge[][] = [];

  constructor(plan: CityPlan) {
    const add = (x: number, z: number): number => {
      this.nodes.push({ x, z });
      this.adj.push([]);
      return this.nodes.length - 1;
    };
    const link = (a: number, b: number, factor: number): void => {
      const na = this.nodes[a]!, nb = this.nodes[b]!;
      const cost = Math.hypot(na.x - nb.x, na.z - nb.z) * factor;
      this.adj[a]!.push({ to: b, cost });
      this.adj[b]!.push({ to: a, cost });
    };
    // the city grid (only what the plan actually builds)
    const X = plan.X, Z = plan.Z;
    const idx: number[][] = [];
    for (let i = 0; i < X.length; i++) {
      idx.push([]);
      for (let j = 0; j < Z.length; j++) idx[i]!.push(Math.hypot(X[i]!.pos - CITY.x, Z[j]!.pos - CITY.z) < 713 ? add(X[i]!.pos, Z[j]!.pos) : -1);
    }
    for (let i = 0; i < X.length; i++) for (let j = 0; j < Z.length; j++) {
      const a = idx[i]![j]!;
      if (a < 0) continue;
      if (j + 1 < Z.length && idx[i]![j + 1]! >= 0) link(a, idx[i]![j + 1]!, X[i]!.arterial ? 1 : 1.35);
      if (i + 1 < X.length && idx[i + 1]![j]! >= 0) link(a, idx[i + 1]![j]!, Z[j]!.arterial ? 1 : 1.35);
    }
    const cityNodes = this.nodes.length;
    // sampled roads
    const ends: number[] = [];
    const factor = { highway: 1, road: 1.18, street: 1.35, dirt: 2.8, rail: 0, runway: 0 } as const;
    for (const p of roadPaths()) {
      const f = factor[p.def.kind];
      if (!f) continue;
      let prev = -1;
      for (let i = 0; i < p.n; i += 3) {
        const n = add(p.xs[i]!, p.zs[i]!);
        if (prev >= 0) link(prev, n, f);
        else if (p.def.kind === 'highway') ends.push(n);
        prev = n;
      }
      const last = p.n - 1;
      if (last % 3) { const n = add(p.xs[last]!, p.zs[last]!); if (prev >= 0) link(prev, n, f); }
    }
    // junctions: nodes of different roads (or the city grid) that nearly touch
    const cell = 24;
    const buckets = new Map<number, number[]>();
    this.nodes.forEach((n, i) => {
      const k = Math.floor(n.x / cell) * 4096 + Math.floor(n.z / cell);
      let b = buckets.get(k);
      if (!b) buckets.set(k, (b = []));
      b.push(i);
    });
    const linked = new Set<number>();
    this.nodes.forEach((n, i) => {
      const cx = Math.floor(n.x / cell), cz = Math.floor(n.z / cell);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        for (const j of buckets.get((cx + a) * 4096 + (cz + b)) ?? []) {
          if (j <= i) continue;
          const m = this.nodes[j]!;
          const d = Math.hypot(n.x - m.x, n.z - m.z);
          if (d > 16 || this.adj[i]!.some((e) => e.to === j)) continue;
          // only join across different roads: nodes already close along one road are neighbours anyway
          const key = i * 100003 + j;
          if (linked.has(key)) continue;
          linked.add(key);
          link(i, j, 1.4);
        }
      }
    });
    // highways meet the city grid a short drive from its last node
    for (const e of ends) {
      const n = this.nodes[e]!;
      let best = -1, bd = 260;
      for (let j = 0; j < cityNodes; j++) {
        const m = this.nodes[j]!;
        const d = Math.hypot(n.x - m.x, n.z - m.z);
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) link(e, best, 1.2);
    }
  }

  private nearest(x: number, z: number): { n: number; d: number } {
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i]!;
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < bd) { bd = d; best = i; }
    }
    return { n: best, d: Math.sqrt(bd) };
  }

  route(x0: number, z0: number, x1: number, z1: number): Route {
    const a = this.nearest(x0, z0), b = this.nearest(x1, z1);
    const direct = (): Route => ({ pts: [[x0, z0], [x1, z1]], length: Math.hypot(x1 - x0, z1 - z0) });
    if (a.n < 0 || b.n < 0) return direct();
    const N = this.nodes.length;
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    // binary heap
    const heap: [number, number][] = [[0, a.n]];
    dist[a.n] = 0;
    while (heap.length) {
      let m = 0;
      for (let i = 1; i < heap.length; i++) if (heap[i]![0] < heap[m]![0]) m = i; // linear scan: graph is small enough
      const [d, u] = heap[m]!;
      heap[m] = heap[heap.length - 1]!;
      heap.pop();
      if (done[u]) continue;
      done[u] = 1;
      if (u === b.n) break;
      for (const e of this.adj[u]!) {
        const nd = d + e.cost;
        if (nd < dist[e.to]!) { dist[e.to] = nd; prev[e.to] = u; heap.push([nd, e.to]); }
      }
    }
    if (!Number.isFinite(dist[b.n]!)) return direct();
    const pts: [number, number][] = [];
    for (let n = b.n; n >= 0; n = prev[n]!) pts.push([this.nodes[n]!.x, this.nodes[n]!.z]);
    pts.reverse();
    pts.unshift([x0, z0]);
    pts.push([x1, z1]);
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
    return { pts, length };
  }
}
