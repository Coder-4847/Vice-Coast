import { GEO, lakeLevel } from '../world/heightfield';
import { FORT_SPAWNS } from '../world/towns/fort';
import type { CraftManager } from './CraftManager';

const east = -Math.PI / 2; // yaw that points a craft towards +x
const west = Math.PI / 2;
const north = 0;
const south = Math.PI;

/** Where the boats, helicopters and planes are left for the player to find. */
export function spawnCrafts(c: CraftManager): void {
  const A = GEO.airport, I = GEO.island, F = GEO.fort, K = GEO.kestrel;

  // ---- boats ------------------------------------------------------------------------------------------------
  c.spawn('zephyr', -34, 70, west);                 // by the spawn beach
  c.spawn('marlin', -214, -290, west);              // off the end of Valeria Pier
  c.spawn('gull', 150, 1655, east);                 // Dusk Harbor basin
  c.spawn('marlin', 235, 1648, east);
  c.spawn('zephyr', 336, 1628, east);
  c.spawn('aurelia', -14, 3322, west);              // Costa Merida marina
  c.spawn('marlin', 8, 3384, west);
  c.spawn('zephyr', 24, 3430, west);
  c.spawn('gull', 430, -2440, south);               // Pinecrest Bay
  c.spawn('marlin', 440, -2246, west);
  c.spawn('zephyr', 1176, -1902, west, { y: lakeLevel() - 0.1 }); // Kestrel lake
  c.spawn('aurelia', I.x + 380, I.z + 46, east);    // Isla Rojo dock
  c.spawn('marlin', I.x + 372, I.z + 8, east);

  // ---- armour: the motor pool at Fort Halloran ----------------------------------------------------------------
  for (const [dx, dz] of FORT_SPAWNS.tanks) c.spawn('bulwark', F.x + dx, F.z + dz, east);
  for (const [dx, dz] of FORT_SPAWNS.apcs) c.spawn('warden', F.x + dx, F.z + dz, east);

  // ---- helicopters ------------------------------------------------------------------------------------------
  c.spawn('sparrow', A.x - 60, A.apronZ + 78, east);     // Valeria International apron
  c.spawn('newsbird', A.x + 30, A.apronZ + 78, east);
  c.spawn('sparrow', K.summit.x + 30, K.summit.z + 20, south); // Kestrel summit helipad
  c.spawn('sparrow', I.x - 82, I.z + 125, east);         // Isla Rojo helipad
  const army = 0x3c4a3a;
  c.spawn('sparrow', F.x + 120, F.z + 90, west, { paint: army }); // Fort Halloran pads
  c.spawn('newsbird', F.x + 160, F.z + 90, west, { paint: army });
  c.spawn('hornet', F.x + FORT_SPAWNS.helis[2]![0], F.z + FORT_SPAWNS.helis[2]![1], west); // the gunship pad
  c.spawn('hornet', A.x + 120, A.apronZ + 78, east);           // a National Guard bird on the airport apron
  // ---- jets: the Fort Halloran flight line ------------------------------------------------------------------------
  for (const [dx, dz] of FORT_SPAWNS.jets) c.spawn('lancer', F.x + dx, F.z + dz, east);

  // ---- planes ------------------------------------------------------------------------------------------------
  c.spawn('skylark', A.x - 330, A.z, east);              // Valeria International
  c.spawn('rook', A.x - 285, A.z + 70, east);
  c.spawn('meridian', A.x + 50, A.apronZ + 120, east);
  const a = GEO.airstrip;
  c.spawn('rook', a.x - 410 * Math.cos(a.yaw), a.z - 410 * Math.sin(a.yaw), Math.atan2(-Math.cos(a.yaw), -Math.sin(a.yaw)), { paint: 0xe8c050 });
  c.spawn('skylark', I.x - 150, I.z, east);              // Isla Rojo airstrip
  c.spawn('meridian', I.x - 230, I.z - 40, east, { paint: 0x1c2a44 });
  void north; void F;
}
