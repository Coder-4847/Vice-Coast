import type { ChunkSource } from '../city/source';
import { buildCinderFlats } from './cinder';
import { buildDuskHarbor } from './harbor';
import { buildAirport } from './airport';
import { buildFortHalloran } from './fort';
import { buildIslaRojo } from './island';
import { KitSource } from './kit';
import { buildCostaMerida } from './costa';
import { buildMountKestrel } from './kestrel';
import { buildPinecrest } from './pinecrest';

/** Every authored settlement, as streamed chunk sources. */
export function buildTowns(): ChunkSource[] {
  return [new KitSource('cinder-flats', buildCinderFlats()), new KitSource('dusk-harbor', buildDuskHarbor()), new KitSource('pinecrest-bay', buildPinecrest()), new KitSource('mount-kestrel', buildMountKestrel()), new KitSource('costa-merida', buildCostaMerida()), new KitSource('valeria-intl', buildAirport()), new KitSource('isla-rojo', buildIslaRojo()), new KitSource('fort-halloran', buildFortHalloran())];
}
