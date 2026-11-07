/**
 * The shape of San Verano. Pure maths with no imports, so the same code runs on the main thread, in the bake worker and in
 * Node tests. `terrainHeight(x, z)` is authoritative; the game bakes it into a 4 m grid (see TerrainBake) for rendering,
 * physics and ground queries.
 *
 * Coordinates: +x east, +z south. The Pacific is to the west (x < 0). Port Valeria sits in the middle, Mount Kestrel and
 * Pinecrest Bay to the north, Cinder Flats on the desert plateau to the east, Dusk Harbor and Costa Merida down the south coast.
 */

/** The flat district where Port Valeria sits; streets in the terrain shader use the same numbers. */
export const CITY = { x: 980, z: 0, flat: 760, blend: 260, height: 4.5, cell: 64 } as const;
export const TERRAIN = { x0: -1400, x1: 4800, z0: -3400, z1: 4400 } as const;
/** Heightmap sample spacing (m). The terrain texture, physics heightfield and ground queries all use it. */
export const HM_CELL = 4;
export const HM_COLS = Math.round((TERRAIN.x1 - TERRAIN.x0) / HM_CELL);
export const HM_ROWS = Math.round((TERRAIN.z1 - TERRAIN.z0) / HM_CELL);
/** Crestview Hill, north of the city: a gentle rise carrying the villa road. */
export const HILL = { x: 1060, z: -1040, h: 64, s: 300 } as const;

/** Where everything is. Content modules place themselves relative to these. */
export const GEO = {
  kestrel: { x: 2150, z: -2150, summit: { x: 2150, z: -2150 } },
  lake: { x: 1250, z: -1900, r: 120 },
  pinecrest: { x: 700, z: -2290, bayX: 190, bayZ: -2290, bayR: 330, lighthouse: { x: 36, z: -2610 } },
  cinder: { x: 3350, z: 560 },
  salt: { x: 4020, z: 1180, rx: 520, rz: 340 },
  airstrip: { x: 3000, z: 1420, yaw: -0.12, len: 1250, w: 46 },
  harbor: { x: 470, z: 1760, basin: { x0: 36, x1: 395, z0: 1585, z1: 1975 } },
  costa: { x: 520, z: 3350, r: 400, height: 3.2 },
} as const;

/** Canals of Costa Merida (water is the sea plane at y = 0, so a cut below zero floods automatically). */
export const CANALS: readonly { x0: number; x1: number; z0: number; z1: number }[] = [
  { x0: 20, x1: 880, z0: GEO.costa.z - 11, z1: GEO.costa.z + 11 },
  { x0: 290, x1: 304, z0: GEO.costa.z - 340, z1: GEO.costa.z + 340 },
  { x0: 520, x1: 534, z0: GEO.costa.z - 340, z1: GEO.costa.z + 340 },
  { x0: 750, x1: 764, z0: GEO.costa.z - 300, z1: GEO.costa.z + 300 },
];

export const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

const hash = (x: number, y: number): number => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export const vnoise = (x: number, y: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
export const fbm = (x: number, y: number, oct = 5): number => {
  let a = 0.5;
  let f = 0;
  for (let i = 0; i < oct; i++) {
    f += a * vnoise(x, y);
    x = x * 2.03 + 5.2;
    y = y * 2.03 + 1.3;
    a *= 0.5;
  }
  return f;
};
/** Ridged multifractal-ish noise in [0, 1]: sharp crests, broad valleys. */
const ridged = (x: number, y: number, oct = 5): number => {
  let a = 0.5;
  let f = 0;
  let w = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(vnoise(x, y) * 2 - 1);
    n *= n;
    f += a * n * w;
    w = clamp(n * 1.6, 0.25, 1);
    x = x * 2.1 + 3.7;
    y = y * 2.1 + 9.2;
    a *= 0.5;
  }
  return clamp(f * 1.35, 0, 1);
};

/** Ocean-floor/beach profile along x (west = sea). Also mirrored in the ocean shader. */
export const coastHeight = (x: number): number => -70 + 74 * smooth(-260, 40, x);

/** Rectangle mask with soft edges (1 inside). */
const rectMask = (x: number, z: number, x0: number, x1: number, z0: number, z1: number, soft: number): number =>
  smooth(x0 - soft, x0 + soft, x) * (1 - smooth(x1 - soft, x1 + soft, x)) * smooth(z0 - soft, z0 + soft, z) * (1 - smooth(z1 - soft, z1 + soft, z));

interface FlatZone { x: number; z: number; r: number; blend: number; h: number; ex?: number; yaw?: number; len?: number; w?: number }

/** Natural landform: everything except flattened settlements, canals and roads. */
function landform(x: number, z: number): number {
  let h = coastHeight(x);
  const land = smooth(-30, 70, x);

  // Eastern range between Port Valeria and the desert. A pass is cut at z ≈ 150.
  const rxLine = 2060 + 150 * Math.sin(z / 430) + 70 * Math.sin(z / 150 + 1.3);
  const across = (x - rxLine) / 330;
  const pass = 1 - Math.exp(-(((z - 150) / 130) ** 2));
  const taper = 1 - 0.62 * smooth(1700, 3000, z);
  const range = Math.exp(-across * across) * pass * taper;
  h += land * range * (100 + 220 * ridged(x * 0.0021, z * 0.0021, 5));
  // Foothills on the valley side so the rim reads as a wall, not a fence.
  const rim = smooth(1000, 1700, Math.hypot((x - CITY.x) * 0.7, z - CITY.z)) * (1 - smooth(1900, 2400, x)) * pass;
  h += land * rim * (30 + 90 * Math.pow(fbm(x * 0.0018, z * 0.0018, 4), 1.6)) * smooth(-1400, -200, -Math.abs(z + 200) + 1100);

  // Mount Kestrel: a big massif with a ridged crown.
  const kx = x - GEO.kestrel.x;
  const kz = z - GEO.kestrel.z;
  const dk = Math.hypot(kx * 0.92, kz);
  const shoulder = Math.exp(-Math.pow(dk / 1450, 1.7));
  const core = Math.exp(-Math.pow(dk / 640, 2));
  const kr = ridged(x * 0.0034 + 11, z * 0.0034 + 4, 6);
  h += land * (shoulder * (300 + 130 * (fbm(x * 0.004, z * 0.004, 4) - 0.35)) + core * (370 + 130 * kr));

  // Rolling country: wooded hills in the north, gentle swells elsewhere.
  const north = smooth(-450, -1700, z);
  const roll = (fbm(x * 0.0042, z * 0.0042, 5) - 0.38) * (20 + 105 * north) * smooth(30, 360, x);
  const nearCity = smooth(CITY.flat * 0.6, CITY.flat + 300, Math.hypot(x - CITY.x, z - CITY.z));
  h += roll * mix(1, nearCity, 1 - north);
  h += north * land * 26 * (fbm(x * 0.012 + 40, z * 0.012, 3) - 0.4);

  // The desert plateau: a broad shelf with buttes and mesas.
  const plat = smooth(2300, 3150, x) * (1 - smooth(4150, 4700, x));
  const shelf = 84 + 26 * fbm(x * 0.0024 + 8, z * 0.0024 + 3, 4);
  h = mix(h, Math.max(h * 0.2 + shelf, shelf), plat * (1 - core));
  const mn = fbm(x * 0.0041 + 70, z * 0.0041 - 20, 4);
  const mesa = smooth(0.625, 0.65, mn) * plat * smooth(2750, 3250, x);
  h += mesa * (46 + 34 * vnoise(x * 0.01, z * 0.01)) + smooth(0.58, 0.625, mn) * plat * 14;
  h += plat * (fbm(x * 0.02, z * 0.02, 3) - 0.4) * 6;

  // Coastal swells either side of the bay and harbour.
  const hl = GEO.pinecrest.lighthouse;
  h += Math.exp(-(((x - hl.x) ** 2 + (z - hl.z) ** 2) / (2 * 150 * 150))) * 98;
  h += Math.exp(-(((x - 30) ** 2 + (z + 1850) ** 2) / (2 * 200 * 200))) * 55;
  return h;
}

let zones: FlatZone[] | null = null;
function flatZones(): FlatZone[] {
  if (zones) return zones;
  const at = (x: number, z: number): number => landform(x, z);
  const avg = (x: number, z: number, r = 70): number => (at(x, z) + at(x + r, z) + at(x - r, z) + at(x, z + r) + at(x, z - r)) / 5;
  const k = GEO.kestrel;
  zones = [
    { x: GEO.costa.x, z: GEO.costa.z, r: GEO.costa.r, blend: 190, h: GEO.costa.height },
    { x: GEO.harbor.x + 120, z: GEO.harbor.z, r: 330, blend: 220, h: 4.8 },
    { x: GEO.pinecrest.x, z: GEO.pinecrest.z, r: 190, blend: 130, h: avg(GEO.pinecrest.x, GEO.pinecrest.z) },
    { x: GEO.cinder.x, z: GEO.cinder.z, r: 300, blend: 140, h: avg(GEO.cinder.x, GEO.cinder.z, 100) },
    { x: GEO.salt.x, z: GEO.salt.z, r: 1, blend: 90, h: 76, ex: 1 },
    { x: GEO.airstrip.x, z: GEO.airstrip.z, r: 1, blend: 70, h: avg(GEO.airstrip.x, GEO.airstrip.z, 120), len: GEO.airstrip.len, w: GEO.airstrip.w, yaw: GEO.airstrip.yaw },
    { x: k.summit.x, z: k.summit.z, r: 34, blend: 60, h: at(k.summit.x, k.summit.z) + 3 },
  ];
  return zones;
}

const localTo = (x: number, z: number, cx: number, cz: number, yaw: number): [number, number] => {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const dx = x - cx;
  const dz = z - cz;
  return [dx * c + dz * s, -dx * s + dz * c];
};

function applyFlats(h: number, x: number, z: number): number {
  for (const f of flatZones()) {
    let w: number;
    if (f.len) {
      const [lx, lz] = localTo(x, z, f.x, f.z, f.yaw ?? 0);
      const d = Math.max(Math.abs(lx) - f.len / 2, Math.abs(lz) - f.w! / 2, 0);
      w = 1 - smooth(0, f.blend, d);
    } else if (f.ex) {
      const e = Math.hypot((x - f.x) / GEO.salt.rx, (z - f.z) / GEO.salt.rz);
      w = 1 - smooth(0.82, 1.0 + f.blend / GEO.salt.rx, e);
    } else {
      w = 1 - smooth(f.r, f.r + f.blend, Math.hypot(x - f.x, z - f.z));
    }
    if (w > 0) h = mix(h, f.h, w);
  }
  return h;
}

/** Terrain with settlements flattened and water features carved, before roads are laid. */
export function groundHeight(x: number, z: number): number {
  let h = landform(x, z);
  const dx = x - CITY.x;
  const dz = z - CITY.z;
  const d = Math.hypot(dx, dz);
  // Port Valeria's flat district (coastal strip blends in from the beach).
  const flat = 1 - smooth(CITY.flat, CITY.flat + CITY.blend, d);
  h = h + (CITY.height - h) * flat * smooth(30, 170, x);
  h = applyFlats(h, x, z);

  // Pinecrest Bay: a bite out of the coast with a beach shelving into deep water.
  {
    const p = GEO.pinecrest;
    const d2 = Math.hypot(x - p.bayX, (z - p.bayZ) * 1.1);
    if (d2 < p.bayR + 120) {
      const depth = -32 * Math.pow(1 - clamp(d2 / p.bayR, 0, 1), 0.8) - 2 * smooth(p.bayR + 120, p.bayR - 60, d2);
      const w = 1 - smooth(p.bayR - 20, p.bayR + 120, d2);
      h = mix(h, Math.min(h, depth + 3.2 * smooth(p.bayR - 90, p.bayR, d2)), w);
    }
  }
  // Dusk Harbor basin: vertical quays, a deep channel to the sea and two finger piers left standing.
  {
    const b = GEO.harbor.basin;
    const m = Math.max(
      rectMask(x, z, b.x0 - 80, b.x1, b.z0, b.z1, 2.2),
      rectMask(x, z, b.x0 - 80, b.x0 + 60, GEO.harbor.z - 40, GEO.harbor.z + 40, 2.2),
    );
    if (m > 0.001) {
      const piers = Math.max(rectMask(x, z, 130, 340, 1672, 1692, 1.6), rectMask(x, z, 130, 340, 1790, 1810, 1.6), rectMask(x, z, 200, 360, 1880, 1896, 1.6));
      const floor = -13 + 5 * smooth(b.x1 - 30, b.x1, x);
      h = mix(h, Math.min(h, floor), m * (1 - piers));
    }
  }
  // Costa Merida's canals.
  for (const c of CANALS) {
    const m = rectMask(x, z, c.x0, c.x1, c.z0, c.z1, 1.4);
    if (m > 0.001) h = mix(h, Math.min(h, -3.2), m);
  }
  // Mount Kestrel's lake: a bowl with a level bench round it.
  {
    const l = GEO.lake;
    const d2 = Math.hypot(x - l.x, z - l.z);
    if (d2 < l.r + 140) {
      const lvl = lakeLevel();
      const bowl = lvl - 9 * (1 - (d2 / l.r) ** 2);
      const bench = Math.max(landform(x, z), lvl + 1.2);
      const t = smooth(l.r, l.r + 110, d2);
      const target = d2 < l.r ? bowl : mix(lvl + 0.4 + (d2 - l.r) * 0.02, bench, t);
      h = mix(h, target, 1 - smooth(l.r + 40, l.r + 140, d2));
    }
  }
  return h;
}

let _lake = NaN;
/** Surface height of Mount Kestrel's lake. */
export function lakeLevel(): number {
  if (Number.isNaN(_lake)) _lake = Math.round(landform(GEO.lake.x, GEO.lake.z)) - 3;
  return _lake;
}

/** Slot for the road network: lowers/raises the ground to lay a graded road bed. Installed by roads.ts. */
let roadCarve: ((x: number, z: number, h: number) => number) | null = null;
export function setRoadCarve(fn: ((x: number, z: number, h: number) => number) | null): void {
  roadCarve = fn;
}

/** Ground height in metres at world (x, z). Pure function so gameplay can query it without the mesh. */
export function terrainHeight(x: number, z: number): number {
  let h = groundHeight(x, z);
  if (roadCarve) h = roadCarve(x, z, h);
  // The world ends in sea to the north, east and south.
  const edge = Math.min(smooth(TERRAIN.z0, TERRAIN.z0 + 380, z), smooth(TERRAIN.z1, TERRAIN.z1 - 380, z), smooth(TERRAIN.x1, TERRAIN.x1 - 380, x));
  if (edge < 1) h = mix(-60, h, edge) - (1 - edge) * 6;
  return h;
}

// ------------------------------------------------------------------------------------ surface classification

/** Is this point part of a settlement (no wild vegetation)? Radii are generous, plan modules cut their own clearings. */
const TOWNS: readonly [number, number, number][] = [
  [CITY.x, CITY.z, CITY.flat + 60],
  [GEO.costa.x, GEO.costa.z, GEO.costa.r + 90],
  [GEO.harbor.x + 120, GEO.harbor.z, 360],
  [GEO.pinecrest.x, GEO.pinecrest.z, 230],
  [GEO.cinder.x, GEO.cinder.z, 320],
];

export interface Surface4 { desert: number; forest: number; salt: number; dirt: number }

/** Biome blend weights (0…1) used by the terrain shader and by vegetation placement. `slope` = 1 − normal.y. */
export function surfaceWeights(x: number, z: number, h: number, slope: number, out: Surface4): Surface4 {
  const ex = x + 160 * (fbm(x * 0.004, z * 0.004, 3) - 0.5);
  let desert = smooth(2250, 2700, ex) * (1 - smooth(4300, 4600, x)) * (1 - Math.exp(-Math.pow(Math.hypot((x - GEO.kestrel.x) * 0.92, z - GEO.kestrel.z) / 900, 2)) * 0.9);
  // dry scrub bleeding into the south-east hills
  desert = Math.max(desert, smooth(1700, 2600, x) * smooth(1500, 2600, z) * 0.55);
  let town = 0;
  for (const [tx, tz, tr] of TOWNS) town = Math.max(town, 1 - smooth(tr * 0.8, tr, Math.hypot(x - tx, z - tz)));
  const north = smooth(-500, -1500, z);
  const k = Math.exp(-Math.pow(Math.hypot((x - GEO.kestrel.x) * 0.92, z - GEO.kestrel.z) / 1500, 2));
  const n = fbm(x * 0.0026 + 13, z * 0.0026 - 7, 4);
  let forest = (north * 0.85 + k * 0.7 + 0.12) + (n - 0.5) * 1.1;
  forest = smooth(0.42, 0.62, forest);
  forest *= 1 - smooth(470, 620, h + (n - 0.5) * 120);          // tree line
  forest *= 1 - smooth(0.32, 0.55, slope);                       // no trees on cliffs
  forest *= 1 - desert * 0.9;
  forest *= smooth(5.5, 12, h);                                 // not on the beach
  forest *= 1 - town;
  const sdx = (x - GEO.salt.x) / GEO.salt.rx;
  const sdz = (z - GEO.salt.z) / GEO.salt.rz;
  const salt = 1 - smooth(0.88, 1.06, Math.hypot(sdx, sdz));
  const dirt = smooth(0.58, 0.72, fbm(x * 0.0071 + 5, z * 0.0071 + 90, 3)) * (0.5 + 0.5 * desert);
  out.desert = desert * (1 - town * 0.5);
  out.forest = forest;
  out.salt = salt;
  out.dirt = dirt;
  return out;
}
