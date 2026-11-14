import { GEO, lakeLevel } from '../heightfield';
import { roadPaths } from '../roads';
import { Kit, MODE, PAL, VEG, pick } from './kit';

/** Cable-car line: base station → pylons → summit station. Shared with the animated gondola. */
export const CABLE = {
  base: { x: 1330, z: -1980 },
  top: { x: GEO.kestrel.x - 60, z: GEO.kestrel.z - 40 },
};

/**
 * Mount Kestrel: a lodge with a trailhead car park, a camp by the lake, a boulder cave with the hidden shrine, the cable car
 * stations and pylons, the summit radio tower with an observation deck, and the downhill-bike / skydive launch ramp.
 */
export function buildMountKestrel(): Kit {
  const k = new Kit('kestrel', 71);
  const r = k.r;
  const K = GEO.kestrel;

  // --------------------------------------------------------------------------------------------- the lodge
  {
    const rd = roadPaths().find((p) => p.def.id === 'kestrel-road')!;
    // somewhere early on the climb with room to spare
    const i = Math.min(rd.n - 1, 70);
    const x = rd.xs[i]! + 36, z = rd.zs[i]! - 10;
    const y = k.ground(x, z);
    k.box(x + 10, z, 60, 40, 0.15, 0x585858, { y0: y, solid: false }); // car park
    k.building(x - 4, z - 22, 30, 16, 6.2, 0, 0x7a5a3a, { door: 'hotel', roof: 'gable', roofColor: 0x3f4a42, mode: MODE.PUNCHED, pitch: 0.5, floors: 2 });
    k.building(x + 26, z - 22, 14, 10, 4.2, 0, 0x8a6a48, { roof: 'gable', roofColor: 0x3f4a42, mode: MODE.PUNCHED, pitch: 0.5 });
    for (let c = 0; c < 6; c++) k.building(x - 24 + c * 12, z + 34, 8, 7, 3.4, 0, pick(r, PAL.wood), { door: 'cabin', roof: 'gable', roofColor: 0x3f4a42, mode: MODE.PUNCHED, pitch: 0.55 }); // cabins
    for (let c = 0; c < 7; c++) { const cx = x - 8 + c * 6.4; k.box(cx, z + 2, 2.1, 4.5, 1.5, pick(r, [0x777777, 0x8a3a2f, 0x3a5a8a, 0xdadada]), { ry: 0 }); }
    k.sign(x + 36, z - 6, Math.PI, 5.4, 2.4, 3.4, 0x4a7a5a, MODE.WALL);
    k.scatter(VEG.PINE, x, z, 60, 18, 0.9, 1.3);
    // trailhead board
    k.box(x + 40, z + 14, 3.2, 0.3, 2.2, 0x6e5238); k.box(x + 40, z + 14, 0.3, 0.3, 3, 0x5a4230);
  }
  // ------------------------------------------------------------------------------------------- lake camp
  {
    const l = GEO.lake;
    const cx = l.x + 150, cz = l.z + 60;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const tx = cx + Math.cos(a) * 11, tz = cz + Math.sin(a) * 11;
      const tent = pick(r, [0xc9722a, 0x3a6aa0, 0x5a8a4a, 0xd0c050]);
      const t = k.box(tx, tz, 3.4, 2.4, 0.2, tent, { y0: k.ground(tx, tz) + 1.2, ry: -a, rx: 0.9, solid: false });
      const t2 = k.box(tx, tz, 3.4, 2.4, 0.2, tent, { y0: k.ground(tx, tz) + 1.2, ry: -a, rx: -0.9, solid: false });
      void t; void t2;
      k.box(tx, tz, 3, 2.4, 1.2, tent, { y0: k.ground(tx, tz) });
    }
    k.cyl(cx, cz, 2.4, 0.4, 0x4a4a46, { solid: false }); k.box(cx, cz, 0.6, 0.6, 0.5, 0xff8a2a, { y0: k.ground(cx, cz) + 0.4, mode: MODE.GLOW, solid: false });
    for (let i = 0; i < 4; i++) k.pipe(cx + Math.cos(i * 1.6) * 3.2, k.ground(cx, cz) + 0.35, cz + Math.sin(i * 1.6) * 3.2, 0.5, 2.2, 0x6e5238, i * 1.6, MODE.WALL, false);
    // a wooden jetty
    k.box(l.x - l.r * 0.9, l.z + 8, 26, 2.6, 0.3, 0x7a5a3a, { y0: lakeLevel() + 0.4, solid: true });
  }
  // ------------------------------------------------------------------------------------ cable car stations
  const station = (x: number, z: number, yaw: number, top: boolean): void => {
    const y = k.ground(x, z);
    k.building(x, z, 22, 12, 7, yaw, 0x8a6a48, { roof: 'shed', roofColor: 0x3f4a42, mode: MODE.PUNCHED, pitch: 0.12, y0: y });
    k.box(x, z, 10, 12.4, 3, 0xcfd4d8, { y0: y + 7.4, ry: -yaw, solid: false, mode: MODE.METAL });
    k.cyl(x, z, 7, 1.2, 0x3a3d42, { y0: y + 8.4, solid: false });
    k.box(x, z, 5, 0.5, 4, 0xc23a2a, { y0: y + 7, solid: false });
    void top;
  };
  const bx = CABLE.base.x, bz = CABLE.base.z, tx = CABLE.top.x, tz = CABLE.top.z;
  const cableYaw = Math.atan2(tz - bz, tx - bx);
  station(bx, bz, cableYaw, false);
  station(tx, tz, cableYaw, true);
  // pylons carry the two ropes; they are sized so the line (station roof to station roof) rests on their cross-arms
  const yA = k.ground(bx, bz) + 9.2, yB = k.ground(tx, tz) + 9.2;
  const horiz = Math.hypot(tx - bx, tz - bz);
  const incline = Math.atan2(yB - yA, horiz);
  const len = Math.hypot(horiz, yB - yA);
  for (const dz of [-1.0, 1.0]) {
    const [mx, mz] = k.at((bx + tx) / 2, (bz + tz) / 2, cableYaw, 0, dz);
    k.box(mx, mz, len, 0.09, 0.09, 0x2a2d32, { y0: (yA + yB) / 2 - 0.05, ry: -cableYaw, rz: incline, solid: false });
  }
  const nP = 4;
  for (let i = 1; i <= nP; i++) {
    const t = i / (nP + 1);
    const px = bx + (tx - bx) * t, pz = bz + (tz - bz) * t;
    const gy = k.ground(px, pz);
    const lineY = yA + (yB - yA) * t;
    const H = Math.max(14, lineY - gy - 0.6);
    k.box(px, pz, 1.4, 1.4, H, 0x8a8f92, { y0: gy });
    k.box(px, pz, 0.8, 5, 0.8, 0x8a8f92, { y0: lineY - 1.4, ry: -cableYaw, solid: false });
    k.box(px, pz, 2.4, 0.3, 1.4, 0xc23a2a, { y0: lineY - 0.7, ry: -cableYaw, solid: false });
  }
  // ------------------------------------------------------------------------------------- summit
  {
    const sx = K.summit.x, sz = K.summit.z;
    const y = k.ground(sx, sz);
    // radio tower: a tapering lattice of stacked boxes, banded red and white
    for (let i = 0; i < 6; i++) { const w = 6 - i * 0.8; k.box(sx, sz - 6, w, w, 10, i % 2 ? 0xc23a2a : 0xf0ede6, { y0: y + i * 10, solid: i < 2, mode: MODE.METAL }); }
    k.box(sx, sz - 6, 0.5, 0.5, 14, 0xcfcfcf, { y0: y + 60, solid: false });
    for (const h of [18, 36, 54]) { k.box(sx, sz - 6, 9, 0.3, 0.3, 0x666666, { y0: y + h, solid: false }); k.box(sx, sz - 6, 0.3, 9, 0.3, 0x666666, { y0: y + h, solid: false }); }
    k.box(sx, sz - 6, 0.7, 0.7, 0.7, 0xff3a2a, { y0: y + 74, mode: MODE.GLOW, solid: false });
    k.building(sx + 18, sz - 4, 14, 10, 4, 0, 0x8a8f92, { roof: 'flat', mode: MODE.METAL }); // equipment hut
    // observation deck & café
    k.building(sx - 18, sz + 14, 20, 12, 4.6, 0, 0x7a5a3a, { roof: 'gable', roofColor: 0x3f4a42, mode: MODE.GLASS, pitch: 0.3 });
    k.box(sx - 18, sz + 28, 26, 12, 0.4, 0x6e5238, { y0: y + 0.1 });
    for (let i = -6; i <= 6; i += 3) k.box(sx - 18 + i * 2, sz + 34.2, 0.15, 0.15, 1.1, 0xcfcfcf, { solid: false });
    k.box(sx - 18, sz + 34.2, 26, 0.12, 0.12, 0xcfcfcf, { y0: y + 1.2, solid: false });
    for (let i = 0; i < 3; i++) { const x = sx - 28 + i * 10; k.box(x, sz + 31, 0.5, 0.5, 1.4, 0x3a3d42); k.box(x, sz + 31, 0.7, 1.0, 0.3, 0x666666, { y0: y + 1.4, solid: false, rx: 0.4 }); } // telescopes
    k.cyl(sx + 30, sz + 20, 12, 0.3, 0x3a5a3a, { solid: false }); // helipad
    k.box(sx + 30, sz + 20, 7, 1.0, 0.1, 0xf0ede6, { y0: y + 0.3, solid: false });
    // the downhill launch ramp & the skydive platform
    const lx = sx + 52, lz = sz - 28;
    k.box(lx, lz, 16, 6, 0.6, 0x7a5a3a, { y0: k.ground(lx, lz) + 0.2 });
    k.box(lx + 12, lz, 12, 6, 0.4, 0x8a6a48, { y0: k.ground(lx + 12, lz) + 0.2, rz: -0.28 });
    for (const dz of [-3, 3]) k.box(lx, lz + dz, 16, 0.12, 0.12, 0xcfcfcf, { y0: k.ground(lx, lz) + 1.3, solid: false });
    k.sign(lx - 8, lz + 5, Math.PI, 5, 2.2, 3.2, 0xffb02e, MODE.WALL);
    k.scatter(VEG.ROCK, sx, sz, 40, 14, 1.0, 2.6);
  }
  // ----------------------------------------------------------------------- the boulder cave & its shrine
  {
    const cx = 1904, cz = -1700;
    const y = k.ground(cx, cz);
    const face = Math.atan2(K.z - cz, K.x - cx) + Math.PI; // the mouth faces away from the peak, downhill
    // an outcrop of big rocks forming a hollow: back wall, two side walls, a roof of slabs, an arch of boulders at the mouth
    const R = (u: number, v: number): [number, number] => k.at(cx, cz, face, u, v);
    const rockC = [0x6a6862, 0x77746d, 0x5f5d58];
    const w = (u: number, v: number, sx: number, sz: number, h: number, ry = 0): void => { const [x, z] = R(u, v); k.box(x, z, sx, sz, h, pick(r, rockC), { y0: y - 0.3, ry: -face - ry, mode: MODE.WALL }); };
    w(0, -9, 16, 3, 7); w(-8, -3, 3, 14, 6.4, 0.1); w(8, -3, 3, 14, 6.4, -0.1);
    w(-6, 5, 4, 4, 5); w(6, 5, 4, 4, 5);
    const [rx, rz] = R(0, -2);
    k.box(rx, rz, 20, 18, 1.6, 0x5f5d58, { y0: y + 5.4, ry: -face, solid: true });
    k.box(rx, rz, 12, 9, 2.6, 0x6a6862, { y0: y + 6.8, ry: -face + 0.2, solid: false });
    for (let i = 0; i < 10; i++) { const [px, pz] = R((r() - 0.5) * 22, (r() - 0.8) * 18); k.plant(VEG.ROCK, px, pz, 1.2 + r() * 1.8); }
    // the shrine: a ring of standing stones, glowing runes, a small obelisk and a hand-painted sign
    const [sx, sz] = R(0, -4);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const px = sx + Math.cos(a) * 2.6, pz = sz + Math.sin(a) * 2.6; k.box(px, pz, 0.7, 0.5, 1.8 + (i % 3) * 0.3, 0x55524d, { y0: y }); k.box(px, pz, 0.45, 0.1, 0.6, 0x39ffe8, { y0: y + 0.6, ry: a, mode: MODE.NEON, solid: false }); }
    k.box(sx, sz, 0.8, 0.8, 2.6, 0x1a1c1e, { y0: y, mode: MODE.WALL }); k.box(sx, sz, 0.3, 0.3, 0.9, 0x39ffe8, { y0: y + 2.7, mode: MODE.NEON, solid: false });
    const [gx, gz] = R(0, 5);
    k.box(gx, gz, 2.4, 0.15, 1.1, 0xb8946a, { y0: y + 0.8, ry: -face, solid: false }); k.box(gx, gz, 0.2, 0.2, 0.9, 0x5a4230);
  }
  // trail markers along the lake trail & the forest road
  for (const id of ['lake-trail']) {
    const p = roadPaths().find((q) => q.def.id === id);
    if (!p) continue;
    for (let i = 8; i < p.n; i += 14) { const x = p.xs[i]! + 2.2, z = p.zs[i]!; k.box(x, z, 0.14, 0.14, 1.4, 0xc9a227, { solid: false }); }
  }
  return k;
}
