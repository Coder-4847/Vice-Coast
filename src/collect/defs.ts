import { CITY, GEO } from '../world/heightfield';

/** The five kinds of collectible in San Verano. */
export type CKind = 'package' | 'graffiti' | 'art' | 'jump' | 'plate';
export const CKINDS: CKind[] = ['package', 'graffiti', 'art', 'jump', 'plate'];

export interface KindInfo {
  name: string;
  plural: string;
  glyph: string;
  color: string;
  pay: number;
  /** Bonus for the whole set. */
  set: number;
  how: string;
}

export const KINDS: Record<CKind, KindInfo> = {
  package: { name: 'Hidden package', plural: 'Hidden packages', glyph: '◆', color: '#ffb347', pay: 250, set: 10000, how: 'Glowing crates tucked into corners all over San Verano. Drive or run through them.' },
  graffiti: { name: 'Graffiti spot', plural: 'Graffiti spots', glyph: '✎', color: '#ff7ab0', pay: 300, set: 8000, how: 'Blank walls. Stand in front and spray them.' },
  art: { name: 'Street art', plural: 'Street art', glyph: '✿', color: '#b49aff', pay: 350, set: 6000, how: 'Murals worth a photograph. Get close and take the shot.' },
  jump: { name: 'Stunt jump', plural: 'Stunt jumps', glyph: '⇗', color: '#6ae0ff', pay: 600, set: 12000, how: 'Ramps in the open. Hit one fast and clear the distance.' },
  plate: { name: 'License-plate trophy', plural: 'License-plate trophies', glyph: '▭', color: '#ffe07a', pay: 800, set: 20000, how: 'Plates nailed up in the hardest places to reach: summits, islands, lighthouses.' },
};

export interface CItem {
  id: string;
  kind: CKind;
  /** Where to look (before the snap to open ground). */
  x: number;
  z: number;
  yaw: number;
  /** A short clue for the tracker. */
  where: string;
  /** Art / tag design number. */
  design: number;
  /** Set once the position has been snapped onto open ground. */
  ok: boolean;
}

interface Region { name: string; x: number; z: number; r: number }

const R = {
  city: { name: 'Port Valeria', x: CITY.x, z: CITY.z, r: 620 },
  costa: { name: 'Costa Merida', x: GEO.costa.x, z: GEO.costa.z, r: 330 },
  harbor: { name: 'Dusk Harbor', x: GEO.harbor.x + 60, z: GEO.harbor.z, r: 300 },
  pine: { name: 'Pinecrest Bay', x: GEO.pinecrest.x - 60, z: GEO.pinecrest.z, r: 380 },
  kestrel: { name: 'Mount Kestrel', x: 1700, z: -1900, r: 620 },
  cinder: { name: 'Cinder Flats', x: GEO.cinder.x, z: GEO.cinder.z, r: 420 },
  salt: { name: 'Salt Pan', x: GEO.salt.x, z: GEO.salt.z, r: 330 },
  airport: { name: 'Valeria International', x: GEO.airport.x, z: GEO.airport.z - 120, r: 480 },
  island: { name: 'Isla Rojo', x: GEO.island.x, z: GEO.island.z, r: 250 },
  airstrip: { name: 'Cinder Airstrip', x: GEO.airstrip.x, z: GEO.airstrip.z, r: 420 },
} satisfies Record<string, Region>;

/** A tiny deterministic generator, so every game has the same collectibles in the same places. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scatter(kind: CKind, seed: number, plan: [Region, number][]): CItem[] {
  const r = rng(seed);
  const out: CItem[] = [];
  let n = 0;
  for (const [reg, count] of plan) {
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * reg.r;
      out.push({ id: `${kind}${++n}`, kind, x: reg.x + Math.cos(a) * d, z: reg.z + Math.sin(a) * d, yaw: r() * Math.PI * 2, where: reg.name, design: Math.floor(r() * 1000), ok: false });
    }
  }
  return out;
}

/** Hand-placed trophies. */
const PLATES: { x: number; z: number; where: string }[] = [
  { x: GEO.pinecrest.lighthouse.x + 8, z: GEO.pinecrest.lighthouse.z + 4, where: 'Pinecrest Lighthouse' },
  { x: GEO.kestrel.summit.x + 7, z: GEO.kestrel.summit.z + 3, where: 'Mount Kestrel summit' },
  { x: 960 + 10, z: -2255 + 6, where: 'The sawmill' },
  { x: 1330 + 5, z: -1980 + 6, where: 'Cable car station' },
  { x: 1090 + 8, z: -1650, where: 'Kestrel Lodge' },
  { x: 1904 + 5, z: -1700 + 4, where: 'Hollow Pine Cave' },
  { x: GEO.salt.x - 80, z: GEO.salt.z - 32, where: 'The stranded hull' },
  { x: GEO.island.x - 120, z: GEO.island.z - 130, where: 'Isla Rojo ridge' },
  { x: GEO.island.x + 60, z: GEO.island.z + 90, where: 'Isla Rojo villa' },
  { x: GEO.island.x + 250, z: GEO.island.z - 60, where: 'Isla Rojo east shore' },
  { x: GEO.airstrip.x - 400, z: GEO.airstrip.z - 70, where: 'Cinder Airstrip' },
  { x: 760, z: 1760 + 20, where: 'Container Port' },
  { x: 1060, z: -1040, where: 'Crestview Hill' },
  { x: 1250, z: -1900 + 135, where: 'Kestrel Lake shore' },
  { x: GEO.cinder.x + 200, z: GEO.cinder.z - 100, where: "Dead Man's Gap" },
];

export function buildItems(): CItem[] {
  const out: CItem[] = [];
  out.push(...scatter('package', 7101, [[R.city, 11], [R.costa, 5], [R.harbor, 4], [R.pine, 4], [R.kestrel, 4], [R.cinder, 4], [R.salt, 2], [R.airport, 3], [R.island, 3]]));
  out.push(...scatter('graffiti', 7202, [[R.city, 12], [R.costa, 5], [R.harbor, 4], [R.cinder, 3]]));
  out.push(...scatter('art', 7303, [[R.city, 7], [R.costa, 4], [R.harbor, 2], [R.pine, 1], [R.cinder, 2]]));
  out.push(...scatter('jump', 7404, [[R.airport, 3], [R.cinder, 3], [R.salt, 3], [R.airstrip, 3]]));
  PLATES.forEach((p, i) => out.push({ id: `plate${i + 1}`, kind: 'plate', x: p.x, z: p.z, yaw: 0, where: p.where, design: 100 + i, ok: false }));
  return out;
}

export const WORDS = ['VICE', 'RAZE', 'KOI', 'NOVA', 'SLICK', 'HOLLOW', 'JUNO', 'FERAL', 'ECHO', 'TIDE', 'MOTH', 'ZEAL'];
