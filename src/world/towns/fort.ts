import { GEO } from '../heightfield';
import { Kit, MODE, PAL, VEG, pick } from './kit';

export const FORT_SPAWNS = {
  tanks: [[-70, -20], [-45, -20]] as [number, number][],
  apcs: [[-70, 8], [-45, 8]] as [number, number][],
  helis: [[120, 90], [160, 90], [200, 90]] as [number, number][],
  /** The jet strip: runs east–west across the south side of the base. */
  runway: { x0: -260, x1: 160, z: -75, w: 30 },
  jets: [[-238, -82], [-238, -68]] as [number, number][],
};

/**
 * Fort Halloran: a fenced army base. A gatehouse on the northern road, watchtowers at the corners, an HQ with a flagpole,
 * six barracks, a motor pool with a vehicle shed, a hangar and helipads, a fuel depot, a radar dome and bunkers.
 */
export function buildFortHalloran(): Kit {
  const k = new Kit('fort', 131);
  const r = k.r;
  const F = GEO.fort;
  const cx = F.x, cz = F.z;
  const hw = 280, hd = 230; // half extents of the fence
  const H = k.ground(cx, cz);
  const khaki = 0x6f7358, dark = 0x4a4f3a, concrete = 0x8d8f88;

  // double perimeter fence, gate gap on the north side where Halloran Road arrives
  const gate = 14;
  k.wall(cx - hw, cz - hd, cx - gate, cz - hd, 3.2, 0x6a6e66, 0.3, MODE.METAL);
  k.wall(cx + gate, cz - hd, cx + hw, cz - hd, 3.2, 0x6a6e66, 0.3, MODE.METAL);
  k.wall(cx + hw, cz - hd, cx + hw, cz + hd, 3.2, 0x6a6e66, 0.3, MODE.METAL);
  k.wall(cx + hw, cz + hd, cx - hw, cz + hd, 3.2, 0x6a6e66, 0.3, MODE.METAL);
  k.wall(cx - hw, cz + hd, cx - hw, cz - hd, 3.2, 0x6a6e66, 0.3, MODE.METAL);
  k.fence(cx - hw - 6, cz - hd - 6, cx + hw + 6, cz - hd - 6, 2.4, 0x555a50, 5, false);
  // gatehouse, barrier arms and warning signs
  k.building(cx - 22, cz - hd + 4, 10, 8, 3.6, 0, concrete, { roof: 'flat', mode: MODE.PUNCHED, y0: H });
  k.building(cx + 22, cz - hd + 4, 10, 8, 3.6, 0, concrete, { roof: 'flat', mode: MODE.PUNCHED, y0: H });
  k.box(cx - 7, cz - hd - 8, 14, 0.25, 0.25, 0xc23a2a, { y0: H + 1.2, solid: false });
  k.box(cx + 7, cz - hd - 8, 14, 0.25, 0.25, 0xf0ede6, { y0: H + 1.2, solid: false });
  for (const dx of [-60, 60]) k.sign(cx + dx, cz - hd - 24, 0, 9, 3.2, 3.4, 0xc23a2a, MODE.NEON);
  k.sign(cx - 24, cz - hd - 260, 0, 11, 3.6, 4, 0xe8c050, MODE.WALL);
  k.sign(cx + 20, cz - hd - 520, 0, 11, 3.6, 4, 0xe8c050, MODE.WALL);
  // watchtowers at the corners and midway along each side
  const tower = (x: number, z: number): void => {
    for (const dx of [-1.4, 1.4]) for (const dz of [-1.4, 1.4]) k.box(x + dx, z + dz, 0.4, 0.4, 9, dark);
    k.box(x, z, 4.4, 4.4, 2.4, khaki, { y0: H + 9, mode: MODE.PUNCHED });
    k.box(x, z, 5.4, 5.4, 0.4, dark, { y0: H + 11.4, solid: false });
    k.box(x, z, 0.5, 0.5, 0.5, 0xfff0c8, { y0: H + 11.8, mode: MODE.GLOW, solid: false });
  };
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [0, hd], [-hw, 0], [hw, 0]] as const) tower(cx + x * 0.98, cz + z * 0.98);

  // HQ with flagpole, parade ground
  k.building(cx - 90, cz - 140, 46, 22, 9, 0, khaki, { roof: 'hip', roofColor: dark, mode: MODE.PUNCHED, y0: H, floors: 2 });
  k.cyl(cx - 90, cz - 108, 0.3, 18, 0xcfcfcf); k.box(cx - 88, cz - 108, 3.6, 0.05, 2.2, 0xc23a2a, { y0: H + 15, solid: false });
  k.box(cx, cz + 40, 190, 120, 0.1, 0x8a8a7e, { y0: H, solid: false });
  // barracks
  for (let i = 0; i < 6; i++) {
    const x = cx - 230 + (i % 3) * 82 - 40, z = cz + 150 - Math.floor(i / 3) * 50;
    k.building(x + 40, z, 50, 12, 4.2, 0, khaki, { roof: 'gable', roofColor: dark, mode: MODE.PUNCHED, pitch: 0.3, y0: H });
  }
  for (let i = 0; i < 3; i++) k.building(cx + 190, cz - 150 + i * 36, 40, 14, 4.2, 0, khaki, { roof: 'gable', roofColor: dark, mode: MODE.PUNCHED, pitch: 0.3, y0: H });
  // motor pool: a long vehicle shed, parked trucks, and the tank and APC pads (the drivable ones spawn here)
  k.building(cx - 60, cz + 70, 90, 28, 7, 0, 0x7a7e68, { roof: 'shed', roofColor: 0x555a4a, mode: MODE.METAL, pitch: 0.1, y0: H });
  k.box(cx - 58, cz - 10, 100, 40, 0.15, 0x6a6e62, { y0: H, solid: false });
  for (let i = 0; i < 6; i++) { const x = cx - 100 + i * 14; k.box(x, cz + 40, 3, 8, 2.8, pick(r, [0x55604a, 0x4a5240]), { y0: H }); k.box(x, cz + 35.5, 2.6, 2.4, 2.4, 0x4a5240, { y0: H, solid: false }); }
  // hangar and helipads beyond the parade ground
  k.hangar(cx + 120, cz + 150, 50, 18, Math.PI / 2, 0x8a8f86, 0x5f6358);
  for (const [dx, dz] of FORT_SPAWNS.helis) { k.cyl(cx + dx, cz + dz, 18, 0.3, 0x4a4f3a, { y0: H, solid: false }); k.box(cx + dx, cz + dz, 10, 1.4, 0.1, 0xf0ede6, { y0: H + 0.3, solid: false }); }
  // the jet strip: asphalt, edge lines, centre dashes and threshold bars
  const RW = FORT_SPAWNS.runway;
  const rwx = cx + (RW.x0 + RW.x1) / 2, rwl = RW.x1 - RW.x0;
  k.box(rwx, cz + RW.z, rwl, RW.w, 0.12, 0x34373a, { y0: H, solid: false });
  for (const s of [-1, 1]) k.box(rwx, cz + RW.z + s * (RW.w / 2 - 1), rwl, 0.5, 0.14, 0xf0ede6, { y0: H, solid: false });
  for (let x = RW.x0 + 30; x < RW.x1 - 20; x += 24) k.box(cx + x, cz + RW.z, 12, 0.6, 0.14, 0xf0ede6, { y0: H, solid: false });
  for (const ex of [RW.x0 + 6, RW.x1 - 6]) for (let i = -5; i <= 5; i++) if (i) k.box(cx + ex, cz + RW.z + i * 2.4, 8, 1.2, 0.14, 0xf0ede6, { y0: H, solid: false });
  // fuel depot, radar dome and ammo bunkers
  for (let i = 0; i < 4; i++) k.cyl(cx + 200 + (i % 2) * 22, cz + 130 + Math.floor(i / 2) * 22, 16, 8, 0xb8b9b0, { y0: H });
  k.cyl(cx + 210, cz + 10, 3, 14, 0xcfd0c8); k.cyl(cx + 210, cz + 10, 12, 0.5, 0x8a8f86, { y0: H + 14, solid: false });
  for (let i = 0; i < 4; i++) { const x = cx - 240 + i * 30, z = cz - 190; k.box(x, z, 18, 12, 4, 0x6a6e66, { y0: H }); k.box(x, z, 20, 14, 1.2, 0x5a5f50, { y0: H + 4, solid: false }); }
  // sandbag emplacements and tank traps near the gate
  for (let i = 0; i < 10; i++) { const x = cx - 80 + i * 18, z = cz - hd + 40 + (i % 2) * 4; k.box(x, z, 5, 2, 1.1, 0xa89a78, { y0: H }); }
  for (let i = 0; i < 8; i++) k.box(cx + (i - 3.5) * 8, cz - hd - 40, 0.5, 4, 2, 0x5a5f50, { y0: H, ry: 0.78, rz: 0.78, solid: false });
  // searchlights
  for (const [x, z] of [[-200, -150], [200, -150], [-200, 150], [200, 150]] as const) { k.box(cx + x, cz + z, 0.8, 0.8, 8, dark); k.box(cx + x, cz + z, 1.6, 1.2, 1.2, 0xfff0c8, { y0: H + 8, mode: MODE.GLOW, solid: false }); }
  k.scatter(VEG.SCRUB, cx, cz, 400, 30, 0.6, 1.1);
  void PAL;
  return k;
}
