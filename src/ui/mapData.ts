import { CITY, GEO } from '../world/heightfield';
import { roadPaths, type RoadKind } from '../world/roads';

export interface Region { name: string; x: number; z: number; r: number }

/** Named areas for the map labels and the "you are in…" readout. Nearest centre within its radius wins. */
export const REGIONS: Region[] = [
  { name: 'Port Valeria', x: CITY.x, z: CITY.z, r: 760 },
  { name: 'Costa Merida', x: GEO.costa.x, z: GEO.costa.z, r: 520 },
  { name: 'Dusk Harbor', x: GEO.harbor.x + 80, z: GEO.harbor.z, r: 420 },
  { name: 'Pinecrest Bay', x: GEO.pinecrest.x - 60, z: GEO.pinecrest.z, r: 520 },
  { name: 'Cinder Flats', x: GEO.cinder.x, z: GEO.cinder.z, r: 520 },
  { name: 'Salt Pan', x: GEO.salt.x, z: GEO.salt.z, r: 560 },
  { name: 'Cinder Airstrip', x: GEO.airstrip.x, z: GEO.airstrip.z, r: 700 },
  { name: 'Mount Kestrel', x: GEO.kestrel.x, z: GEO.kestrel.z, r: 1300 },
  { name: 'Kestrel Lake', x: GEO.lake.x, z: GEO.lake.z, r: 260 },
  { name: 'Crestview Hills', x: 1060, z: -1040, r: 420 },
];

/** Looser, larger labels shown on the zoomed-out map. */
export const MAP_LABELS: { name: string; x: number; z: number; size: number }[] = [
  { name: 'Pacific Ocean', x: -520, z: 200, size: 24 },
  { name: 'Port Valeria', x: CITY.x, z: CITY.z + 30, size: 20 },
  { name: 'Costa Merida', x: GEO.costa.x + 40, z: GEO.costa.z - 20, size: 17 },
  { name: 'Dusk Harbor', x: GEO.harbor.x + 120, z: GEO.harbor.z - 150, size: 15 },
  { name: 'Pinecrest Bay', x: GEO.pinecrest.x + 60, z: GEO.pinecrest.z - 130, size: 16 },
  { name: 'Cinder Flats', x: GEO.cinder.x, z: GEO.cinder.z - 120, size: 17 },
  { name: 'Mount Kestrel', x: GEO.kestrel.x, z: GEO.kestrel.z + 40, size: 19 },
  { name: 'Salt Pan', x: GEO.salt.x, z: GEO.salt.z - 130, size: 15 },
  { name: 'Pinecrest Forest', x: 1100, z: -1700, size: 15 },
  { name: 'Cinder Desert', x: 3300, z: -400, size: 17 },
  { name: 'Valeria Range', x: 1900, z: 700, size: 15 },
];

export interface Marker { name: string; x: number; z: number; glyph: string; color?: string }
export const MARKERS: Marker[] = [
  { name: 'Pinecrest Lighthouse', x: GEO.pinecrest.lighthouse.x, z: GEO.pinecrest.lighthouse.z, glyph: '⚓' },
  { name: 'Sawmill', x: 960, z: -2255, glyph: '⚙' },
  { name: 'Summit Radio Tower', x: GEO.kestrel.summit.x, z: GEO.kestrel.summit.z - 6, glyph: '▲' },
  { name: 'Cable Car', x: 1330, z: -1980, glyph: '◆' },
  { name: 'Kestrel Lodge', x: 1090, z: -1650, glyph: '⌂' },
  { name: 'Hollow Pine Cave', x: 1904, z: -1700, glyph: '?' },
  { name: 'Cinder Airstrip', x: GEO.airstrip.x - 400, z: GEO.airstrip.z - 80, glyph: '✈' },
  { name: 'Stranded Hull', x: GEO.salt.x - 90, z: GEO.salt.z - 40, glyph: '⛵' },
  { name: 'Moonshine & Scrap', x: 3500, z: 660, glyph: '☠' },
  { name: 'Iron Hound Bar', x: 3450, z: 530, glyph: '♞' },
  { name: 'Container Port', x: 760, z: 1760, glyph: '▣' },
  { name: 'Gran Casino', x: 640, z: 3305, glyph: '♠' },
  { name: 'Coast Rail Station', x: 606, z: 3042, glyph: '🚆' },
];

export function regionAt(x: number, z: number): string | null {
  let best: Region | null = null;
  let bd = Infinity;
  for (const r of REGIONS) {
    const d = Math.hypot(x - r.x, z - r.z);
    if (d < r.r && d / r.r < bd) { bd = d / r.r; best = r; }
  }
  return best?.name ?? null;
}

const STYLE: Record<RoadKind, { w: number; color: string; casing: string; dash?: number[] }> = {
  highway: { w: 16, color: '#ecd9a4', casing: '#2b2417' },
  road: { w: 11, color: '#d6d8dc', casing: '#262a30' },
  street: { w: 8, color: '#a8adb6', casing: '#23262c' },
  dirt: { w: 4, color: '#a58a60', casing: '#2a2218', dash: [14, 10] },
  rail: { w: 4, color: '#8a8f98', casing: '#1f2227', dash: [18, 9] },
  runway: { w: 40, color: '#8d8f93', casing: '#2a2b2e' },
};

export interface NetStroke { path: Path2D; w: number; color: string; casing: string; dash?: number[] }

/** Prebuilt strokes for every road outside Port Valeria's grid, in draw order (bottom first). */
export function buildNetStrokes(): NetStroke[] {
  const order: RoadKind[] = ['runway', 'dirt', 'rail', 'street', 'road', 'highway'];
  const out: NetStroke[] = [];
  for (const kind of order) {
    const path = new Path2D();
    for (const p of roadPaths()) {
      if (p.def.kind !== kind) continue;
      for (let i = 0; i < p.n; i += kind === 'street' || kind === 'runway' ? 2 : 3) {
        if (i === 0) path.moveTo(p.xs[i]!, p.zs[i]!); else path.lineTo(p.xs[i]!, p.zs[i]!);
      }
      path.lineTo(p.xs[p.n - 1]!, p.zs[p.n - 1]!);
    }
    out.push({ path, ...STYLE[kind] });
  }
  return out;
}
