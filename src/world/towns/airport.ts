import { GEO } from '../heightfield';
import { Kit, MODE, PAL, pick } from './kit';

/**
 * Valeria International: a long glass terminal with jet bridges, a control tower, three arched hangars, a fuel farm,
 * a car park, apron floodlights, runway edge lights, a windsock and the perimeter fence.
 */
export function buildAirport(): Kit {
  const k = new Kit('airport', 97);
  const r = k.r;
  const A = GEO.airport;
  const H = A.height;
  const zt = A.apronZ - 52;

  // terminal: a low concourse with a taller central hall
  k.box(A.x, zt, 250, 34, 11, 0xd8d6d0, { y0: H, mode: MODE.GLASS });
  k.box(A.x, zt, 252, 36, 0.8, 0x55585e, { y0: H + 11, solid: false });
  k.box(A.x, zt - 4, 70, 40, 20, 0xe6e3dc, { y0: H, mode: MODE.GLASS });
  k.box(A.x, zt - 4, 76, 44, 1.2, 0x2a2d32, { y0: H + 20, solid: false });
  k.box(A.x, zt + 22, 120, 10, 0.6, 0x2a2d32, { y0: H + 6.5, solid: false }); // departure canopy
  for (let i = 0; i < 9; i++) k.box(A.x - 56 + i * 14, zt + 26, 0.9, 0.9, 6.5, 0x8a8f92);
  k.box(A.x, zt + 17.4, 60, 0.6, 3.4, 0x2f6bb8, { y0: H + 14, mode: MODE.NEON, solid: false }); // sign
  // jet bridges on the apron side
  for (let i = 0; i < 6; i++) {
    const x = A.x - 100 + i * 40;
    k.box(x, zt + 40, 3.2, 26, 3.4, 0xcfd2d6, { y0: H + 3.4, solid: false });
    k.box(x, zt + 55, 5, 5, 4, 0x8a8f92, { y0: H + 3.0, solid: false });
    k.box(x, zt + 54, 0.4, 0.4, 3.2, 0x55585e);
  }
  // control tower
  const tx = A.x + 150, tz = zt - 10;
  k.cyl(tx, tz, 7, 38, 0xd8d6d0);
  k.cyl(tx, tz, 11, 4.4, 0x2f4a5a, { y0: H + 38, mode: MODE.GLASS, solid: false });
  k.cyl(tx, tz, 12, 0.8, 0x55585e, { y0: H + 42.4, solid: false });
  k.cyl(tx, tz, 0.4, 8, 0xcfcfcf, { y0: H + 43, solid: false });
  k.box(tx, tz, 0.5, 0.5, 0.5, 0xff3030, { y0: H + 51, mode: MODE.GLOW, solid: false });
  // hangars along the east apron
  for (let i = 0; i < 3; i++) k.hangar(A.x + 300 + i * 0, A.apronZ - 10 + i * 0, 46, 17, 0, pick(r, PAL.metal), 0x6a6e72);
  k.hangar(A.x + 300, A.apronZ - 4, 46, 17, 0, 0x8a9096, 0x6a6e72);
  k.hangar(A.x - 340, A.apronZ - 4, 46, 17, 0, 0x8a9096, 0x6a6e72);
  // fuel farm & cargo shed
  for (let i = 0; i < 3; i++) { k.cyl(A.x - 220 + i * 18, zt + 80, 14, 10, 0xe8e4da); }
  k.building(A.x + 220, zt - 12, 60, 30, 12, 0, 0x8a9096, { roof: 'gable', roofColor: 0x6a6e72, mode: MODE.METAL, pitch: 0.12, y0: H });
  // car park with a few cars
  k.box(A.x, zt - 62, 220, 50, 0.1, 0x3a3b3d, { y0: H, solid: false });
  for (let i = 0; i < 30; i++) { k.box(A.x - 100 + (i % 15) * 14 + (r() - 0.5) * 2, zt - 52 + Math.floor(i / 15) * 22, 2, 4.5, 1.4, pick(r, [0x8a3a2f, 0x3a5a8a, 0xdadada, 0x2a2d32, 0xc9a227]), { y0: H }); }
  // floodlights on the apron and runway edge lights
  for (let i = 0; i < 8; i++) { const x = A.x - 280 + i * 80; k.box(x, A.apronZ + 70, 0.8, 0.8, 24, 0x55585e); k.box(x, A.apronZ + 70, 5, 1.2, 1.4, 0xfff0c8, { y0: H + 24, mode: MODE.GLOW, solid: false }); }
  for (let x = A.x - A.len / 2; x <= A.x + A.len / 2; x += 60) { for (const dz of [-23.5, 23.5]) k.box(x, A.z + dz, 0.4, 0.4, 0.5, 0xfff2c0, { y0: H, mode: MODE.GLOW, solid: false }); }
  // windsock and the perimeter fence along the runway's north side
  k.cyl(A.x - 140, A.z - 60, 0.2, 8, 0xcfcfcf, { solid: false });
  k.box(A.x - 138, A.z - 60, 2.8, 0.9, 0.9, 0xe0702a, { y0: H + 7.4, solid: false, rz: -0.3 });
  k.fence(A.x - 450, A.z + 70, A.x + 450, A.z + 70, 2.2, 0x6a6e72, 4, true);
  k.fence(A.x - 450, A.z + 70, A.x - 450, A.apronZ - 90, 2.2, 0x6a6e72, 4, true);
  k.fence(A.x + 450, A.z + 70, A.x + 450, A.apronZ - 90, 2.2, 0x6a6e72, 4, true);
  return k;
}
