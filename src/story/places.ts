import { GEO } from '../world/heightfield';
import type { Place } from './types';

/**
 * Named places the story refers to. `ref` points at a property or shop (already snapped onto open ground by the
 * economy); everything else is a rough coordinate that the story snaps to the nearest open ground when it is first used.
 */
export interface PlaceDef { x: number; z: number; ref?: string; label: string; /** Needs room for a car, not just a person. */ car?: boolean }

const A = GEO.airport, I = GEO.island, C = GEO.cinder;

export const PLACES: Record<string, PlaceDef> = {
  'home.mack': { x: 150, z: 70, ref: 'boardwalk', label: 'Boardwalk Studio' },
  'home.imani': { x: A.x + 100, z: A.apronZ - 40, ref: 'hangar', label: 'Hangar 3' },
  'home.teddy': { x: C.x - 20, z: C.z + 50, ref: 'trailer', label: 'Cinder Flats Trailer' },
  'tower': { x: 1010, z: -60, label: 'Meridian Tower', car: true },
  'gala': { x: 1000, z: -24, label: 'The Gala', car: true },
  'redline': { x: 830, z: 140, ref: 'redline', label: 'Redline Customs', car: true },
  'motors': { x: 880, z: -90, ref: 'motors', label: 'Valeria Motors', car: true },
  'beach': { x: 120, z: 0, label: 'Spawn Beach' },
  'lot': { x: 150, z: -10, label: 'Beach Lot', car: true },
  'marlowe': { x: 1140, z: -70, label: 'Marlowe Row', car: true },
  'bank': { x: 930, z: -160, label: 'Valeria Savings', car: true },
  'newsroom': { x: 1110, z: 130, label: 'Valeria Sun newsroom', car: true },
  'depot': { x: 1380, z: -250, label: 'Industrial Depot', car: true },
  'harbor': { x: 470, z: 1720, label: 'Dusk Harbor', car: true },
  'airport.apron': { x: A.x + 60, z: A.apronZ + 60, label: 'Valeria International apron', car: true },
  'airport.strip': { x: A.x - 330, z: A.z, label: 'Valeria International runway' },
  'island.strip': { x: I.x, z: I.z, label: 'Isla Rojo airstrip' },
  'island.ridge': { x: I.x - 120, z: I.z - 130, label: 'Isla Rojo ridge' },
  'island.villa': { x: I.x + 60, z: I.z + 90, label: 'Isla Rojo villa' },
  'cinder': { x: C.x, z: C.z, label: 'Cinder Flats', car: true },
  'taqueria': { x: C.x - 30, z: C.z + 40, ref: 'taco', label: 'Mama Jo\'s', car: true },
  'stash': { x: C.x + 330, z: C.z + 210, label: 'Lazaro stash house', car: true },
  'ramp': { x: C.x + 200, z: C.z - 120, label: 'Dead Man\'s Gap', car: true },
  'highway.east': { x: 2300, z: 420, label: 'East Highway', car: true },
};

export function isPlace(p: Place): p is string { return typeof p === 'string'; }
