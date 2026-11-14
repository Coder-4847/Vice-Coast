import { GEO } from '../heightfield';
import { Kit, MODE, PAL, VEG, pick } from './kit';

const H = 4.8; // quay level

/**
 * Dusk Harbor: a working container port. A deep basin with finger piers, quay cranes, a block-stacked container yard
 * with a rail spur, warehouses and fuel tanks, a moored container ship, trawlers, and the Harbor Authority tower.
 */
export function buildDuskHarbor(): Kit {
  const k = new Kit('harbor', 47);
  const r = k.r;
  const b = GEO.harbor.basin;

  const container = (x: number, z: number, yaw: number, stack: number, y0 = H): void => {
    const col = pick(r, PAL.container);
    for (let s = 0; s < stack; s++) k.box(x, z, 12.2, 2.44, 2.6, col, { y0: y0 + s * 2.6, ry: -yaw, mode: MODE.METAL });
  };

  // ------------------------------------------------------------------------------------------ container yard
  const block = (x0: number, x1: number, z0: number, z1: number, rowsPer: number, density: number): void => {
    for (let z = z0; z < z1 - 3; z += rowsPer * 2.75 + 7.5) {
      for (let row = 0; row < rowsPer; row++) {
        for (let x = x0; x < x1 - 12; x += 12.6) {
          if (r() > density) continue;
          container(x + 6.1, z + row * 2.75, 0, 1 + Math.floor(r() * r() * 5));
        }
      }
    }
  };
  block(566, 644, 1660, 1856, 4, 0.82);
  block(668, 692, 1660, 1856, 3, 0.9);
  block(714, 920, 1660, 1856, 4, 0.8);
  // lightly stocked lanes east of the rail line and by the north quay
  block(432, 520, 1600, 1620, 2, 0.5);
  // reach-stacker and a few straddle carriers (boxes on legs)
  for (let i = 0; i < 4; i++) {
    const x = 590 + i * 70, z = 1648 + (i % 2) * 8;
    for (const dx of [-3, 3]) for (const dz of [-1.6, 1.6]) k.box(x + dx, z + dz, 0.5, 0.5, 4.2, 0xd8b020);
    k.box(x, z, 7.4, 4.0, 1.0, 0xd8b020, { y0: H + 4.2, solid: false });
    k.box(x - 2, z, 2.2, 2.4, 1.8, 0x2f3a46, { y0: H + 5.2, solid: false, mode: MODE.GLASS });
  }

  // ------------------------------------------------------------------------------------------------ quay cranes
  for (let i = 0; i < 5; i++) {
    const z = 1650 + i * 64;
    const x = b.x1 + 8;
    const col = i % 2 ? 0xe0702a : 0xcf3a2a;
    for (const dx of [-8, 8]) for (const dz of [-7, 7]) k.box(x + dx, z + dz, 1.8, 1.8, 26, col, { y0: H });
    for (const dx of [-8, 8]) k.box(x + dx, z, 1.4, 16, 1.4, col, { y0: H + 26, solid: false });
    for (const dz of [-7, 7]) k.box(x, z + dz, 18, 1.4, 1.4, col, { y0: H + 18, solid: false });
    // boom out over the water, back-reach over the yard, with a hanging spreader
    k.box(x - 28, z, 70, 2.2, 2.2, col, { y0: H + 27.4, solid: false });
    k.box(x + 17, z, 24, 2.2, 2.2, col, { y0: H + 27.4, solid: false });
    k.box(x + 8, z, 7, 8, 5, 0xdadad6, { y0: H + 29.6, solid: false });
    const tx = x - 38 + (r() - 0.5) * 20;
    k.box(tx, z, 4, 3, 2.4, 0x444a50, { y0: H + 24.5, solid: false });
    k.box(tx, z, 12.4, 2.5, 0.4, 0x2f3a46, { y0: H + 21, solid: false });
    // a few cables
    for (const dz of [-1, 1]) k.box(tx, z + dz, 0.08, 0.08, 3.4, 0x222222, { y0: H + 21.4, solid: false });
    k.box(x + 8, z, 0.5, 0.5, 6, 0xffffff, { y0: H + 34.6, solid: false });
    k.box(x - 62, z, 0.6, 0.6, 0.6, 0xff3a2a, { y0: H + 28.6, mode: MODE.GLOW, solid: false });
  }

  // -------------------------------------------------------------------------------------------- warehouses
  for (let i = 0; i < 3; i++) {
    const z = 1620 + i * 96;
    k.building(465, z + 28, 56, 34, 9, 0, pick(r, PAL.metal), { door: 'warehouse', roof: 'gable', roofColor: 0x6a7178, mode: MODE.METAL, pitch: 0.12, y0: H });
    for (let d = 0; d < 4; d++) k.box(437 - 0.3, z + 28 - 13 + d * 8.4, 0.4, 5, 4.8, 0x3a3d42, { y0: H, solid: false });
    k.box(465, z + 28, 52, 30, 0.3, 0x55585e, { y0: H + 9.3, solid: false });
  }
  // the Harbor Authority tower and a gatehouse on the Coastway
  k.building(506, 1618, 26, 26, 42, 0, 0x6c8aa6, { door: 'office', roof: 'flat', mode: MODE.GLASS, y0: H });
  k.box(506, 1618, 14, 14, 6, 0xcfd4d8, { y0: H + 42.4, solid: false });
  k.box(506, 1618, 0.4, 0.4, 14, 0xffffff, { y0: H + 48, solid: false });
  k.building(556, 1628, 8, 6, 3.4, 0, 0xd8d0c0, { roof: 'flat', mode: MODE.PUNCHED, y0: H });
  k.box(560, 1636, 12, 0.3, 0.3, 0xc23a2a, { y0: H + 1.1, solid: false });

  // ---------------------------------------------------------------------------------------------- tank farm
  for (let i = 0; i < 6; i++) {
    const x = 790 + (i % 3) * 42, z = 1905 + Math.floor(i / 3) * 40;
    k.cyl(x, z, 26, 15, i % 2 ? 0xe8e4da : 0xcfd2cf, { y0: H });
    k.cyl(x, z, 25, 0.8, 0x9a9a96, { y0: H + 15, solid: false });
    k.box(x + 14, z, 0.5, 0.5, 15, 0x666666, { y0: H, solid: false });
  }
  k.wall(765, 1885, 925, 1885, 1.4, 0x8a8a86, 0.8); k.wall(765, 1885, 765, 1960, 1.4, 0x8a8a86, 0.8); k.wall(925, 1885, 925, 1960, 1.4, 0x8a8a86, 0.8);
  for (let i = 0; i < 7; i++) k.pipe(790 + i * 20, H + 1.4, 1896, 0.9, 20, 0x6a6e72, 0, MODE.METAL, false);

  // ---------------------------------------------------------------------------------------- the container ship
  {
    const cz = 1741, x0 = 96, len = 224;
    const hull = (x: number, l: number, w: number, y: number, h: number, col: number): void => { k.box(x, cz, l, w, h, col, { y0: y, mode: MODE.METAL }); };
    hull(x0 + len / 2 + 12, len - 24, 32, -4, 17, 0x2a3a4e);
    hull(x0 + len / 2 + 12, len - 24, 32.4, 8.4, 3.5, 0x6a2a24); // red boot-top band is under the waterline; this is the topsides
    // bow: stepped taper
    for (let i = 0; i < 4; i++) hull(x0 + 10 - i * 7, 14, 30 - i * 8, -4, 17 - i, 0x2a3a4e);
    // deckhouse at the stern
    k.box(x0 + len - 20, cz, 22, 26, 20, 0xf0ede6, { y0: 12.5, mode: MODE.PUNCHED });
    k.box(x0 + len - 20, cz, 16, 30, 4, 0xf0ede6, { y0: 32.5, mode: MODE.GLASS, solid: false });
    k.cyl(x0 + len - 8, cz, 5, 12, 0xc23a2a, { y0: 24.5, solid: false });
    // deck cargo
    for (let ix = 0; ix < 12; ix++) {
      for (let iz = 0; iz < 6; iz++) {
        if (r() < 0.1) continue;
        const st = 1 + Math.floor(r() * 3);
        for (let s = 0; s < st; s++) k.box(x0 + 30 + ix * 12.8, cz - 13 + iz * 5.2, 12.2, 2.44, 2.6, pick(r, PAL.container), { y0: 12.5 + s * 2.6, mode: MODE.METAL });
      }
    }
  }
  // a mooring pier bollard line, lamp posts and floodlight masts
  for (let z = b.z0 + 10; z < b.z1; z += 36) { k.cyl(b.x1 + 1, z, 0.7, 0.7, 0x2a2a2a, { y0: H, solid: false }); }
  for (let i = 0; i < 12; i++) { const x = 440 + (i % 6) * 100, z = 1625 + Math.floor(i / 6) * 320; k.box(x, z, 0.8, 0.8, 30, 0x55585e); k.box(x, z, 4, 1, 1.4, 0xfff0c8, { y0: H + 30, mode: MODE.GLOW, solid: false }); }
  for (let z = 1600; z < 1960; z += 40) { k.lamp(548 - 11, z, Math.PI); }
  // fishing trawlers tied up in the basin
  const boat = (x: number, z: number, len: number, yaw: number, col: number): void => {
    k.box(x, z, len, len * 0.28, 2.6, col, { y0: -1.2, ry: -yaw, mode: MODE.METAL });
    const [wx, wz] = k.at(x, z, yaw, -len * 0.2, 0);
    k.box(wx, wz, len * 0.28, len * 0.2, 2.6, 0xf0ede6, { y0: 1.4, ry: -yaw, mode: MODE.PUNCHED, solid: false });
    k.box(wx, wz, 0.2, 0.2, 7, 0x444444, { y0: 4, solid: false });
  };
  for (let i = 0; i < 4; i++) boat(190 + i * 38, 1850, 12 + r() * 5, 0, pick(r, [0x2a5a7a, 0x8a2a2a, 0xcfcfc8]));
  // crates and pallets on the piers
  for (let i = 0; i < 40; i++) { const x = 140 + r() * 190, z = pick(r, [1682, 1800, 1888]) + (r() - 0.5) * 4; k.box(x, z, 1.4, 1.4, 1.2, pick(r, PAL.wood), { y0: H, ry: r() }); }
  for (let i = 0; i < 20; i++) k.plant(VEG.SCRUB, 430 + r() * 60, 1600 + r() * 360, 0.8);
  return k;
}
