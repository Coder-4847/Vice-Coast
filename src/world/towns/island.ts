import { GEO } from '../heightfield';
import { Kit, MODE, VEG, pick } from './kit';

/** Isla Rojo: a private island with a clifftop-style villa and pool, guest bungalows, a dock, a hangar and an airstrip. */
export function buildIslaRojo(): Kit {
  const k = new Kit('isla-rojo', 113);
  const r = k.r;
  const I = GEO.island;
  const H = I.height;
  const vx = I.x - 110, vz = I.z + 85;

  // the villa: stacked white boxes with glass, a cantilevered roof, terrace and an infinity pool
  k.box(vx, vz, 44, 18, 5.2, 0xf4f2ec, { y0: H, mode: MODE.GLASS });
  k.box(vx + 8, vz - 2, 30, 16, 4.6, 0xe8e4da, { y0: H + 5.2, mode: MODE.GLASS });
  k.box(vx + 4, vz - 2, 42, 20, 0.5, 0x2a2d32, { y0: H + 9.8, solid: false });
  k.box(vx - 10, vz + 20, 26, 14, 0.2, 0x2a9bc9, { y0: H, mode: MODE.GLOW, solid: false });
  k.box(vx - 10, vz + 20, 28, 16, 0.4, 0xe8e0d0, { y0: H - 0.1, solid: false });
  for (let i = 0; i < 6; i++) { k.box(vx - 20 + i * 4, vz + 32, 1.6, 0.7, 0.4, 0xf0ede6, { y0: H }); k.cyl(vx - 20 + i * 4 + 2.4, vz + 32, 0.1, 2.3, 0xcfcfcf, { y0: H, solid: false }); }
  // guest bungalows
  for (let i = 0; i < 5; i++) k.building(vx + 60 + i * 20, vz - 10 + (i % 2) * 14, 11, 8, 3.4, 0, 0xf2ece0, { roof: 'hip', roofColor: 0xb8664a, mode: MODE.PUNCHED, y0: H });
  // helipad and a beach bar
  k.cyl(vx + 28, vz + 40, 16, 0.3, 0x3a5a3a, { y0: H, solid: false });
  k.box(vx + 28, vz + 40, 9, 1.2, 0.1, 0xf0ede6, { y0: H + 0.3, solid: false });
  k.building(I.x + 150, I.z - 90, 14, 9, 3.6, 0, 0xc98a5a, { roof: 'hip', roofColor: 0x8a4b38, mode: MODE.PUNCHED, y0: H });
  for (let i = 0; i < 12; i++) { const x = I.x + 120 + r() * 70, z = I.z - 120 + r() * 40; k.cyl(x, z, 0.1, 2.3, 0xe8e0d0, { solid: false }); k.cyl(x, z, 3.0, 0.12, pick(r, [0xc23a2a, 0x2f6bb8, 0xe0a82a, 0xf0ede6]), { y0: k.ground(x, z) + 2.3, solid: false }); }
  // hangars at the west end of the strip and fuel
  k.hangar(I.x - 255, I.z - 40, 40, 16, 0, 0xf0ede6, 0x9a9ea2);
  k.hangar(I.x - 255, I.z - 80, 40, 16, 0, 0xf0ede6, 0x9a9ea2);
  k.cyl(I.x - 200, I.z - 60, 6, 4, 0xe8e4da); k.box(I.x - 195, I.z - 52, 1.2, 0.8, 1.4, 0xc23a2a);
  k.box(I.x + 20, I.z - 60, 4, 4, 14, 0xd8d6d0); k.box(I.x + 20, I.z - 60, 6, 6, 3, 0x2f4a5a, { y0: H + 14, mode: MODE.GLASS, solid: false }); // tower
  // the dock: a long pier into the sea on the eastern shore, with a boathouse
  const dx = I.x + 318;
  k.box(dx + 30, I.z + 12, 90, 4, 0.5, 0x7a5a3a, { y0: 1.6 });
  for (let i = 0; i < 10; i++) k.cyl(dx - 10 + i * 9, I.z + 13.8, 0.6, 3.6, 0x4a3a2a, { y0: -1.6, solid: false });
  k.box(dx + 40, I.z + 28, 50, 3, 0.5, 0x7a5a3a, { y0: 1.6 });
  k.building(dx + 4, I.z - 2, 16, 10, 4, 0, 0xf4f2ec, { roof: 'gable', roofColor: 0x2a5a7a, mode: MODE.PUNCHED, y0: 1.7 });
  // palms everywhere, rocks, scrub
  for (let i = 0; i < 70; i++) {
    const a = r() * 6.2832, d = Math.sqrt(r());
    const x = I.x + Math.cos(a) * d * I.rx * 0.62, z = I.z + Math.sin(a) * d * I.rz * 0.62;
    if (Math.abs(z - I.z) < 30 && Math.abs(x - I.x) < 280) continue; // keep the strip clear
    if (k.ground(x, z) < 2) continue;
    k.tree(x, z, 1, 0.9 + r() * 0.6);
  }
  k.scatter(VEG.SCRUB, I.x, I.z, 280, 60, 0.6, 1.1);
  for (let i = 0; i < 18; i++) k.plant(VEG.ROCK, I.x - 330 + r() * 660, I.z + (r() - 0.5) * 300, 1 + r() * 1.6);
  return k;
}
