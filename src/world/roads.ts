import { GEO, groundHeight, setRoadCarve, smooth, TERRAIN } from './heightfield';

/**
 * The road and rail network outside Port Valeria's own grid. Pure data + geometry (no rendering): centre-lines are smooth
 * splines, each with a graded bed height; the heightfield cuts a road bed into the ground along them (see `setRoadCarve`),
 * the renderer drapes ribbon meshes on them, and traffic follows them.
 */
export type RoadKind = 'highway' | 'road' | 'street' | 'dirt' | 'rail';

export interface RoadDef {
  id: string;
  name: string;
  kind: RoadKind;
  /** Half-width of the paved (or ballasted) surface in metres. */
  hw: number;
  /** Control points (x, z); a Catmull–Rom spline is fitted through them. */
  pts: readonly (readonly [number, number])[];
  /** Maximum grade of the bed (rise/run). */
  grade?: number;
  /** Tiny height offset so crossing roads don't z-fight. */
  lift?: number;
  /** Lanes per direction (0 = unmarked). */
  lanes?: number;
}

export interface RoadPath {
  def: RoadDef;
  idx: number;
  n: number;
  xs: Float32Array;
  zs: Float32Array;
  /** Bed height. */
  ys: Float32Array;
  /** Unit tangent. */
  tx: Float32Array;
  tz: Float32Array;
  /** Distance along the road at each sample. */
  s: Float32Array;
  length: number;
}

export const RES = 4;

/** Hand-placed network. Town streets are appended by the town modules (see towns/). */
export const BASE_ROADS: RoadDef[] = [
  {
    id: 'coastway', name: 'Coastway', kind: 'highway', hw: 11, lanes: 2,
    pts: [[628, 745], [612, 950], [588, 1200], [566, 1420], [548, 1590], [540, 1740], [536, 1960], [526, 2200], [516, 2500], [508, 2800], [504, 2960]],
  },
  {
    id: 'northway', name: 'Pinecrest Highway', kind: 'highway', hw: 11, lanes: 2, grade: 0.07,
    pts: [[232, -745], [262, -820], [330, -920], [392, -1100], [430, -1300], [470, -1500], [500, -1700], [520, -1900], [560, -2020], [632, -2150], [700, -2250]],
  },
  {
    id: 'cinderway', name: 'Cinder Highway', kind: 'highway', hw: 11, lanes: 2, grade: 0.08,
    pts: [[1765, 0], [1880, 50], [1990, 118], [2130, 160], [2300, 175], [2520, 215], [2800, 300], [3040, 420], [3160, 520], [3350, 556], [3560, 590], [3760, 760], [3900, 940]],
  },
  {
    id: 'kestrel-road', name: 'Mount Kestrel Road', kind: 'road', hw: 5.2, lanes: 1, grade: 0.11,
    pts: spiral(),
  },
  {
    id: 'lighthouse-road', name: 'Lighthouse Road', kind: 'road', hw: 4.8, lanes: 1, grade: 0.09,
    pts: [[700, -2250], [640, -2430], [520, -2570], [330, -2690], [160, -2690], [96, -2660]],
  },
  {
    id: 'airstrip-road', name: 'Airstrip Track', kind: 'dirt', hw: 3.4,
    pts: [[3350, 640], [3300, 800], [3230, 1000], [3140, 1200], [3030, 1405]],
  },
  {
    id: 'logging-road', name: 'Sawmill Track', kind: 'dirt', hw: 3.4, grade: 0.12,
    pts: [[760, -2330], [860, -2500], [1040, -2660], [1250, -2740], [1470, -2700]],
  },
  {
    id: 'lake-trail', name: 'Lake Trail', kind: 'dirt', hw: 1.6, grade: 0.22,
    pts: [[1010, -1650], [1090, -1740], [1170, -1820], [1230, -1870]],
  },
  {
    id: 'dune-trail', name: 'Dune Run', kind: 'dirt', hw: 3.0, grade: 0.2,
    pts: [[3040, 300], [3000, 120], [3080, -80], [3260, -220], [3480, -240], [3640, -110], [3590, 70], [3500, 300], [3360, 470]],
  },
  {
    id: 'mesa-trail', name: 'Mesa Run', kind: 'dirt', hw: 2.6, grade: 0.2,
    pts: [[3600, 640], [3780, 560], [3980, 430], [4120, 560], [4090, 800]],
  },
  {
    id: 'coast-line', name: 'Coast Line', kind: 'rail', hw: 2.5, grade: 0.03, lift: 0.02,
    pts: [[820, 690], [740, 900], [700, 1250], [690, 1700], [676, 2100], [650, 2500], [624, 2860], [606, 3040]],
  },
];

/**
 * A road spiralling up Mount Kestrel along its contours: it holds a steady grade by letting its height rise a little with
 * every metre travelled, then finds the radius at which the mountain reaches that height. Spurs and gullies make it swing
 * in and out like real switchbacks, and it never needs a deep cutting.
 */
function spiral(): [number, number][] {
  const K = GEO.kestrel;
  const pts: [number, number][] = [[470, -1500], [640, -1560], [820, -1610]];
  let th = Math.atan2(-1650 - K.z, 1010 - K.x);
  let r = Math.hypot(1010 - K.x, -1650 - K.z);
  let px = K.x + Math.cos(th) * r, pz = K.z + Math.sin(th) * r;
  pts.push([px, pz]);
  let Y = groundHeight(px, pz);
  const top = groundHeight(K.x, K.z) - 70;
  const grade = 0.085;
  for (let i = 0; i < 900 && Y < top; i++) {
    th -= 0.032;
    const f = (rr: number): number => groundHeight(K.x + Math.cos(th) * rr * 1.04, K.z + Math.sin(th) * rr) - Y;
    // track the contour: from the previous radius, walk towards where the ground reaches Y
    let rr = r;
    const up = f(rr) > 0;
    for (let k = 0; k < 160; k++) {
      const next = rr + (up ? 4 : -4);
      if (next < 60 || next > 1400) break;
      rr = next;
      if ((f(rr) > 0) !== up) break;
    }
    r = rr;
    const nx = K.x + Math.cos(th) * r * 1.04, nz = K.z + Math.sin(th) * r;
    Y += grade * Math.hypot(nx - px, nz - pz);
    px = nx; pz = nz;
    if (i % 3 === 0) pts.push([px, pz]);
  }
  pts.push([px, pz]);
  return pts;
}

// ------------------------------------------------------------------------------------------------ build

let _paths: RoadPath[] | null = null;
let _extra: RoadDef[] = [];

/** Town modules register their streets before the network is built. */
export function addRoads(defs: RoadDef[]): void {
  _extra = _extra.concat(defs);
  _paths = null;
  _grid = null;
}

function fit(pts: readonly (readonly [number, number])[]): [number, number][] {
  // centripetal Catmull–Rom, then resampled to uniform arc length
  const P = pts.map((p) => [p[0], p[1]] as [number, number]);
  const ext = [[2 * P[0]![0] - P[1]![0], 2 * P[0]![1] - P[1]![1]] as [number, number], ...P, [2 * P[P.length - 1]![0] - P[P.length - 2]![0], 2 * P[P.length - 1]![1] - P[P.length - 2]![1]] as [number, number]];
  const dense: [number, number][] = [];
  for (let i = 1; i < ext.length - 2; i++) {
    const p0 = ext[i - 1]!, p1 = ext[i]!, p2 = ext[i + 1]!, p3 = ext[i + 2]!;
    const d1 = Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), 0.5) || 1;
    const d2 = Math.pow(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), 0.5) || 1;
    const d3 = Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]), 0.5) || 1;
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(2, Math.ceil(segLen / 2));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const pt: [number, number] = [0, 0];
      for (let a = 0; a < 2; a++) {
        const m1 = (p1[a]! - p0[a]!) / d1 - (p2[a]! - p0[a]!) / (d1 + d2) + (p2[a]! - p1[a]!) / d2;
        const m2 = (p2[a]! - p1[a]!) / d2 - (p3[a]! - p1[a]!) / (d2 + d3) + (p3[a]! - p2[a]!) / d3;
        const M1 = m1 * d2, M2 = m2 * d2;
        const t2 = t * t, t3 = t2 * t;
        pt[a] = (2 * t3 - 3 * t2 + 1) * p1[a]! + (t3 - 2 * t2 + t) * M1 + (-2 * t3 + 3 * t2) * p2[a]! + (t3 - t2) * M2;
      }
      dense.push(pt);
    }
  }
  dense.push([P[P.length - 1]![0], P[P.length - 1]![1]]);
  const out: [number, number][] = [dense[0]!];
  let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1]!, b = dense[i]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let pos = RES - carry;
    while (pos <= seg) {
      const f = pos / seg;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      pos += RES;
    }
    carry = seg - (pos - RES);
  }
  return out;
}

function buildPath(def: RoadDef, idx: number): RoadPath {
  const pts = fit(def.pts);
  const n = pts.length;
  const xs = new Float32Array(n), zs = new Float32Array(n), ys = new Float32Array(n), tx = new Float32Array(n), tz = new Float32Array(n), s = new Float32Array(n);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = pts[i]![0];
    zs[i] = pts[i]![1];
    raw[i] = groundHeight(xs[i]!, zs[i]!);
  }
  // smooth the profile (the bed ignores small bumps), then cap the grade
  const win = def.kind === 'highway' ? 16 : def.kind === 'rail' ? 24 : def.kind === 'dirt' ? 2 : 9;
  const sm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let k = -win; k <= win; k++) {
      const j = i + k;
      if (j < 0 || j >= n) continue;
      const w = 1 - Math.abs(k) / (win + 1);
      sum += raw[j]! * w;
      cnt += w;
    }
    sm[i] = sum / cnt;
  }
  sm[0] = raw[0]!;
  sm[n - 1] = raw[n - 1]!;
  const g = (def.grade ?? 0.06) * RES;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < n; i++) sm[i] = Math.min(sm[i - 1]! + g, Math.max(sm[i - 1]! - g, sm[i]!));
    for (let i = n - 2; i >= 0; i--) sm[i] = Math.min(sm[i + 1]! + g, Math.max(sm[i + 1]! - g, sm[i]!));
  }
  for (let i = 0; i < n; i++) ys[i] = sm[i]!;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(n - 1, i + 1)]!;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l;
    tz[i] = dz / l;
    if (i > 0) acc += Math.hypot(xs[i]! - xs[i - 1]!, zs[i]! - zs[i - 1]!);
    s[i] = acc;
  }
  return { def, idx, n, xs, zs, ys, tx, tz, s, length: acc };
}

/** All road paths (building them needs the un-carved ground, so this runs before the carve is installed). */
export function roadPaths(): RoadPath[] {
  if (!_paths) {
    _paths = [...BASE_ROADS, ..._extra].map((d, i) => buildPath(d, i));
  }
  return _paths;
}

// ------------------------------------------------------------------------------------------ spatial index

const CELL = 64;
let _grid: Map<number, number[]> | null = null;

function blendOf(def: RoadDef): number {
  return def.kind === 'rail' ? 7 : def.kind === 'dirt' ? 6 : def.kind === 'street' ? 5 : 11;
}
const shoulderOf = (def: RoadDef): number => (def.kind === 'dirt' ? 0.8 : def.kind === 'rail' ? 2.2 : def.kind === 'street' ? 1.6 : 2.4);

function grid(): Map<number, number[]> {
  if (_grid) return _grid;
  const g = new Map<number, number[]>();
  for (const p of roadPaths()) {
    if (p.def.kind === 'dirt') continue;
    const reach = p.def.hw + shoulderOf(p.def) + blendOf(p.def) + 1;
    for (let i = 0; i < p.n - 1; i++) {
      const x0 = Math.min(p.xs[i]!, p.xs[i + 1]!) - reach, x1 = Math.max(p.xs[i]!, p.xs[i + 1]!) + reach;
      const z0 = Math.min(p.zs[i]!, p.zs[i + 1]!) - reach, z1 = Math.max(p.zs[i]!, p.zs[i + 1]!) + reach;
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
          const k = (cx + 4096) * 8192 + (cz + 4096);
          let l = g.get(k);
          if (!l) g.set(k, (l = []));
          l.push(p.idx * 65536 + i);
        }
      }
    }
  }
  _grid = g;
  return g;
}

export interface RoadHit {
  path: RoadPath;
  /** Segment index and fraction along it. */
  i: number;
  t: number;
  /** Distance from the centre-line (m) and signed lateral offset (+ = right of travel). */
  d: number;
  side: number;
  y: number;
}

/** Nearest road to (x, z) within `reach` metres of its centre-line, or null. */
export function nearestRoad(x: number, z: number, reach = 12): RoadHit | null {
  const g = grid();
  const paths = roadPaths();
  let best: RoadHit | null = null;
  const r = Math.ceil(reach / CELL);
  const cx0 = Math.floor(x / CELL), cz0 = Math.floor(z / CELL);
  for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
    for (let cz = cz0 - r; cz <= cz0 + r; cz++) {
      const l = g.get((cx + 4096) * 8192 + (cz + 4096));
      if (!l) continue;
      for (const code of l) {
        const p = paths[code >> 16]!;
        const i = code & 0xffff;
        const ax = p.xs[i]!, az = p.zs[i]!;
        const dx = p.xs[i + 1]! - ax, dz = p.zs[i + 1]! - az;
        const L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        const px = ax + dx * t - x, pz = az + dz * t - z;
        const d = Math.hypot(px, pz);
        if (d <= reach && (!best || d < best.d)) {
          const side = (x - (ax + dx * t)) * -dz + (z - (az + dz * t)) * dx;
          best = { path: p, i, t, d, side: side > 0 ? 1 : -1, y: p.ys[i]! + (p.ys[i + 1]! - p.ys[i]!) * t };
        }
      }
    }
  }
  return best;
}

let carveInstalled = false;

function carve(x: number, z: number, h: number): number {
  const g = grid();
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  const l = g.get((cx + 4096) * 8192 + (cz + 4096));
  if (!l) return h;
  const paths = roadPaths();
  let wsum = 0, wy = 0, wmax = 0;
  for (const code of l) {
    const p = paths[code >> 16]!;
    const i = code & 0xffff;
    const ax = p.xs[i]!, az = p.zs[i]!;
    const dx = p.xs[i + 1]! - ax, dz = p.zs[i + 1]! - az;
    const L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    const flat = p.def.hw + shoulderOf(p.def);
    const w = 1 - smooth(flat, flat + blendOf(p.def), d);
    if (w <= 0) continue;
    const y = p.ys[i]! + (p.ys[i + 1]! - p.ys[i]!) * t;
    wsum += w;
    wy += w * y;
    if (w > wmax) wmax = w;
  }
  if (wsum <= 0) return h;
  return h + (wy / wsum - h) * wmax;
}

/** Lay the road beds into the heightfield. Safe to call more than once. */
export function installRoads(): void {
  if (carveInstalled) return;
  roadPaths();
  grid();
  carveInstalled = true;
  setRoadCarve(carve);
}

/** Does any road, rail or trail lie within the world? (Used by tests.) */
export const WORLD = TERRAIN;
