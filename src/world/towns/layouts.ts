import { CANALS, GEO } from '../heightfield';
import type { RoadDef } from '../roads';

/**
 * Pure street layouts for the settlements (no rendering imports), shared by the road network and the town generators so
 * streets and buildings always agree. Coordinates are world metres.
 */

// ---------------------------------------------------------------------------------------------- Costa Merida
export const COSTA_X = [130, 210, 380, 460, 600, 680, 820] as const;
export const COSTA_Z = [3080, 3170, 3260, 3440, 3530, 3620] as const;
export const COSTA_BOX = { x0: 100, x1: 850, z0: 3050, z1: 3650 } as const;
export const COSTA_NAMES_X = ['Promenade de la Mar', 'Calle Alba', 'Avenida Sol', 'Calle Luna', 'Avenida Coral', 'Calle Brisa', 'Avenida Alameda'];
export const COSTA_NAMES_Z = ['Calle Norte', 'Calle Jazmín', 'Calle del Mercado', 'Calle Naranja', 'Calle Estrella', 'Calle Sur'];

// -------------------------------------------------------------------------------------------- Cinder Flats
/** The strip town's main street is the Cinder Highway between these points. */
export const CINDER = { a: [3160, 520], b: [3560, 590] } as const;
export const CINDER_YAW = Math.atan2(CINDER.b[1] - CINDER.a[1], CINDER.b[0] - CINDER.a[0]);
export const CINDER_O: [number, number] = [(CINDER.a[0] + CINDER.b[0]) / 2, (CINDER.a[1] + CINDER.b[1]) / 2];

// ---------------------------------------------------------------------------------------------- Pinecrest
export const PINE_X = [560, 640, 720, 800, 880] as const;
export const PINE_Z = [-2400, -2330, -2260, -2190, -2120] as const;

// ------------------------------------------------------------------------------------------------ Harbor
export const HARBOR_YARD = { x0: 420, x1: 930, z0: 1590, z1: 1960 } as const;

export function townRoads(): RoadDef[] {
  const out: RoadDef[] = [];
  const c = GEO.costa;
  // Costa Merida: a grid of streets with the canals threaded through; bridges are built where they cross
  COSTA_X.forEach((x, i) => out.push({ id: `costa-ns-${i}`, name: COSTA_NAMES_X[i]!, kind: 'street', hw: i === 0 ? 7 : 5.6, lanes: 1, minY: c.height, lift: 0.01 + i * 0.002, pts: [[x, COSTA_BOX.z0 + 8], [x, 3350], [x, COSTA_BOX.z1 - 8]] }));
  COSTA_Z.forEach((z, i) => out.push({ id: `costa-ew-${i}`, name: COSTA_NAMES_Z[i]!, kind: 'street', hw: 5.6, lanes: 1, minY: c.height, lift: 0.03 + i * 0.002, pts: [[COSTA_BOX.x0 + 30, z], [(COSTA_BOX.x0 + COSTA_BOX.x1) / 2, z], [COSTA_BOX.x1 - 8, z]] }));
  void CANALS;

  // Pinecrest: five streets each way
  PINE_X.forEach((x, i) => out.push({ id: `pine-ns-${i}`, name: ['Shore Road', 'Fir Street', 'Main Street', 'Cedar Street', 'Mill Road'][i]!, kind: 'street', hw: 4.4, lanes: 1, lift: 0.01 + i * 0.002, pts: [[x, PINE_Z[0]! - 40], [x, PINE_Z[2]!], [x, PINE_Z[4]! + 40]] }));
  PINE_Z.forEach((z, i) => out.push({ id: `pine-ew-${i}`, name: ['Lantern Lane', 'Harbor Road', 'Spruce Avenue', 'Bayview Drive', 'Timber Road'][i]!, kind: 'street', hw: 4.4, lanes: 1, lift: 0.03 + i * 0.002, pts: [[PINE_X[0]! - 40, z], [PINE_X[2]!, z], [PINE_X[4]! + 60, z]] }));

  // Cinder Flats: trailer lanes behind the strip, the scrap yard track and the airstrip
  out.push({ id: 'cinder-lane-a', name: 'Trailer Lane', kind: 'street', hw: 3.6, lanes: 0, lift: 0.01, pts: [[3175, 610], [3260, 624], [3340, 640], [3400, 648]] });
  out.push({ id: 'cinder-lane-b', name: 'Scrap Road', kind: 'dirt', hw: 3.4, pts: [[3420, 640], [3470, 660], [3520, 690], [3560, 720]] });
  const a = GEO.airstrip;
  const c0 = Math.cos(a.yaw), s0 = Math.sin(a.yaw);
  out.push({ id: 'airstrip-runway', name: 'Cinder Flats Airstrip', kind: 'runway', hw: 22, pts: [[a.x - c0 * a.len * 0.46, a.z - s0 * a.len * 0.46], [a.x, a.z], [a.x + c0 * a.len * 0.46, a.z + s0 * a.len * 0.46]] });
  out.push({ id: 'airstrip-taxi', name: 'Airstrip Taxiway', kind: 'street', hw: 7, lanes: 0, pts: [[a.x - c0 * a.len * 0.3, a.z - s0 * a.len * 0.3 - 26], [a.x - c0 * a.len * 0.3 - 40, a.z - s0 * a.len * 0.3 - 70], [a.x - c0 * a.len * 0.3 - 60, a.z - s0 * a.len * 0.3 - 110]] });

  // Dusk Harbor: yard roads
  const y = HARBOR_YARD;
  out.push({ id: 'yard-n', name: 'Quay Road North', kind: 'street', hw: 7, lanes: 1, minY: 4.8, pts: [[y.x0 - 20, 1640], [(y.x0 + y.x1) / 2, 1640], [y.x1, 1640]] });
  out.push({ id: 'yard-s', name: 'Quay Road South', kind: 'street', hw: 7, lanes: 1, minY: 4.8, lift: 0.01, pts: [[y.x0 - 20, 1870], [(y.x0 + y.x1) / 2, 1870], [y.x1, 1870]] });
  out.push({ id: 'yard-m', name: 'Container Row', kind: 'street', hw: 7, lanes: 1, minY: 4.8, lift: 0.02, pts: [[655, y.z0 + 10], [655, 1760], [655, y.z1 - 10]] });
  out.push({ id: 'yard-link', name: 'Harbor Link', kind: 'street', hw: 7, lanes: 1, minY: 4.8, lift: 0.03, pts: [[548, 1590], [548, 1640]] });

  // Valeria International: runway 09/27, taxiways, apron and the access road from the city
  const A = GEO.airport;
  out.push({ id: 'via-runway', name: 'Valeria Intl runway', kind: 'runway', hw: 22, lanes: 1, pts: [[A.x - A.len / 2, A.z], [A.x, A.z], [A.x + A.len / 2, A.z]] });
  for (const dx of [-300, 300]) out.push({ id: `via-taxi-${dx}`, name: 'Taxiway', kind: 'street', hw: 8, lanes: 0, minY: A.height, lift: 0.02, pts: [[A.x + dx, A.z - 26], [A.x + dx, A.z - 60], [A.x + dx, A.apronZ + 50]] });
  out.push({ id: 'via-apron', name: 'Apron', kind: 'street', hw: 14, lanes: 0, minY: A.height, lift: 0.03, pts: [[A.x - 280, A.apronZ + 40], [A.x, A.apronZ + 40], [A.x + 280, A.apronZ + 40]] });
  out.push({ id: 'via-access', name: 'Airport Road', kind: 'road', hw: 7, lanes: 1, minY: A.height, pts: [[1120, 700], [1120, 760], [1120, 812]] });

  // Isla Rojo
  const I = GEO.island;
  out.push({ id: 'island-strip', name: 'Isla Rojo airstrip', kind: 'runway', hw: 13, lanes: 1, pts: [[I.x - 250, I.z], [I.x, I.z], [I.x + 250, I.z]] });
  out.push({ id: 'island-road', name: 'Villa Drive', kind: 'street', hw: 4, lanes: 0, minY: I.height, pts: [[I.x + 290, I.z + 28], [I.x + 120, I.z + 44], [I.x - 60, I.z + 70], [I.x - 160, I.z + 60]] });

  // Fort Halloran
  const F = GEO.fort;
  out.push({ id: 'fort-road', name: 'Halloran Road', kind: 'road', hw: 6.5, lanes: 1, grade: 0.09, pts: [[3350, 650], [3320, 1000], [3300, 1500], [3250, 1900], [3300, 2300], [3500, 2600], [F.x, F.z - 230]] });
  out.push({ id: 'fort-main', name: 'Parade Road', kind: 'street', hw: 6, lanes: 0, minY: 0, pts: [[F.x, F.z - 230], [F.x, F.z - 100], [F.x, F.z + 60], [F.x, F.z + 200]] });
  out.push({ id: 'fort-cross', name: 'Barracks Row', kind: 'street', hw: 5, lanes: 0, minY: 0, pts: [[F.x - 230, F.z - 60], [F.x, F.z - 60], [F.x + 230, F.z - 60]] });
  out.push({ id: 'fort-strip', name: 'Halloran airstrip', kind: 'runway', hw: 16, lanes: 1, pts: [[F.x - 400, F.z + 400], [F.x, F.z + 400], [F.x + 400, F.z + 400]] });
  return out;
}
