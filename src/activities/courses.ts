import { GEO } from '../world/heightfield';
import type { RaceSrc } from './Race';

const C = GEO.cinder, A = GEO.airport, K = GEO.kestrel;
const CITYC = { x: 980, z: 0 };

/** Every race in San Verano. Cars and bikes follow the real roads between the `via` points. */
export const RACES: RaceSrc[] = [
  // ------------------------------------------------------------------------------------------------ street
  { id: 'street1', act: 'race.street', title: 'Marlowe Dash', blurb: 'Round the heart of Port Valeria and back. Three rivals, no rules.', mode: 'car', spec: 'veloce', rivals: ['barrage', 'pico', 'marlow'], kmh: 105, via: [[1140, -70], [930, -160], [1380, -250], [1110, 130], [1140, -70]], par: 120, reward: 2500 },
  { id: 'street2', act: 'race.street', title: 'Harbor Sprint', blurb: 'From the city to Dusk Harbor along the coast. Flat out.', mode: 'car', spec: 'barrage', rivals: ['veloce', 'barrage'], kmh: 125, via: [[900, 200], [470, 1720]], par: 150, reward: 3500 },
  { id: 'street3', act: 'race.street', title: 'Costa Cup', blurb: 'A lap of the casino district in Costa Merida.', mode: 'car', spec: 'veloce', rivals: ['barrage', 'veloce', 'pico'], kmh: 105, via: [[640, 3305], [300, 3500], [200, 3200], [640, 3305]], par: 110, reward: 3000 },
  // ------------------------------------------------------------------------------------------------ circuit
  { id: 'circuit1', act: 'race.circuit', title: 'City Circuit', blurb: 'Two laps round the downtown grid.', mode: 'car', spec: 'veloce', rivals: ['barrage', 'veloce', 'pico'], kmh: 110, laps: 2, via: [[CITYC.x - 300, CITYC.z - 250], [CITYC.x + 300, CITYC.z - 250], [CITYC.x + 300, CITYC.z + 250], [CITYC.x - 300, CITYC.z + 250], [CITYC.x - 300, CITYC.z - 250]], par: 200, reward: 4000 },
  { id: 'circuit2', act: 'race.circuit', title: 'Airport Loop', blurb: 'Two laps of the service roads round Valeria International.', mode: 'car', spec: 'barrage', rivals: ['veloce', 'barrage'], kmh: 118, laps: 2, via: [[A.x - 250, A.apronZ + 20], [A.x + 250, A.apronZ + 20], [A.x + 250, A.apronZ - 160], [A.x - 250, A.apronZ - 160], [A.x - 250, A.apronZ + 20]], par: 170, reward: 4500 },
  // ------------------------------------------------------------------------------------------------ rally
  { id: 'rally1', act: 'race.rally', title: 'Flats Rally', blurb: 'Dirt, dust and Dead Man\'s Gap.', mode: 'car', spec: 'ridgeback', rivals: ['ridgeback', 'ridgeback'], kmh: 85, via: [[C.x, C.z + 60], [C.x + 330, C.z + 210], [C.x + 200, C.z - 120], [C.x - 90, C.z - 130], [C.x, C.z + 60]], par: 150, reward: 4000 },
  { id: 'rally2', act: 'race.rally', title: 'Salt Pan Dash', blurb: 'Across the flats to the salt pan, with nothing to hit but each other.', mode: 'car', spec: 'ridgeback', rivals: ['ridgeback', 'pico'], kmh: 90, via: [[C.x + 100, C.z], [GEO.salt.x - 300, GEO.salt.z - 100], [GEO.salt.x + 100, GEO.salt.z + 100]], par: 140, reward: 4500 },
  // ------------------------------------------------------------------------------------------------ downhill
  { id: 'down1', act: 'race.downhill', title: 'Kestrel Downhill', blurb: 'From the lodge to the sawmill: brakes are optional.', mode: 'car', spec: 'barrage', rivals: ['veloce', 'barrage'], kmh: 100, via: [[1090, -1650], [960, -2255]], par: 90, reward: 3500 },
  { id: 'down2', act: 'race.downhill', title: 'Cable Car Run', blurb: 'The cable car station down to Crestview.', mode: 'car', spec: 'veloce', rivals: ['barrage', 'pico'], kmh: 100, via: [[1330, -1980], [1090, -1650], [1060, -1100]], par: 120, reward: 4000 },
  // ------------------------------------------------------------------------------------------------ bike
  { id: 'bike1', act: 'race.bike', title: 'Boardwalk Time Trial', blurb: 'Round the downtown streets on two wheels. Beat the clock.', mode: 'bike', spec: 'sparrow', via: [[1140, -70], [930, -160], [1110, 130], [1140, -70]], par: 75, reward: 3000 },
  { id: 'bike2', act: 'race.bike', title: 'Depot Dash', blurb: 'A fast run from the newsroom to the industrial depot.', mode: 'bike', spec: 'sparrow', via: [[1110, 130], [1380, -250]], par: 55, reward: 3000 },
  // ------------------------------------------------------------------------------------------------ boat
  { id: 'boat1', act: 'race.boat', title: 'Valeria Bay Buoys', blurb: 'Out of the pier marina, round the buoys and home.', mode: 'boat', spec: 'marlin', via: [[-214, -290], [-420, -250], [-560, -40], [-420, 180], [-214, -290]], par: 70, reward: 3000 },
  { id: 'boat2', act: 'race.boat', title: 'Pinecrest Bay', blurb: 'A slalom round the bay below the lighthouse.', mode: 'boat', spec: 'marlin', via: [[440, -2300], [300, -2120], [150, -2260], [250, -2460], [440, -2300]], par: 70, reward: 3500 },
  // ------------------------------------------------------------------------------------------------ air
  { id: 'air1', act: 'race.air', title: 'Valeria Gates', blurb: 'Take off and thread the gates over the city.', mode: 'air', spec: 'rook', via: [[A.x - 300, A.z], [1000, 600], [980, 200], [980, -200], [1200, -100], [1160, 600]], par: 160, reward: 4000, alt: 100 },
  { id: 'air2', act: 'race.air', title: 'Island Hop', blurb: 'From the airport out over the water to Isla Rojo.', mode: 'air', spec: 'rook', via: [[A.x - 300, A.z], [400, 1100], [-200, 1150], [-700, 1150], [-500, 900]], par: 190, reward: 5000, alt: 110 },
];

void K;
