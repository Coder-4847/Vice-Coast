import { GEO } from '../heightfield';
import { CINDER_O, CINDER_YAW } from './layouts';
import { Kit, MODE, PAL, VEG, pick } from './kit';

const TAU = Math.PI * 2;

/** Wind-turbine bases on the ridge north of the strip; the rotors are animated by the living world. */
export const TURBINES: [number, number][] = [[3180, -40], [3290, -110], [3400, -170], [3510, -150], [3620, -90], [3720, 10], [3250, 180], [3470, 220], [3010, 60]];
export const TURBINE_HUB = 79.5;

/**
 * Cinder Flats: a dusty desert strip town along the highway, a trailer park, a biker bar, a "moonshine and scrap" yard, the
 * abandoned airstrip with its hangar and derelict plane, wind turbines on the ridge, and the dried salt lake with a stranded hull.
 */
export function buildCinderFlats(): Kit {
  const k = new Kit('cinder', 31);
  const r = k.r;
  const Y = CINDER_YAW;
  const [ox, oz] = CINDER_O;
  /** World position from street-local (u along the highway, v to its south). */
  const L = (u: number, v: number): [number, number] => k.at(ox, oz, Y, u, v);
  const N = 25; // clear distance from the street centre to a front wall
  const north = (u: number, _w: number, d: number): { x: number; z: number; yaw: number } => ({ ...pos(L(u, -(N + d / 2))), yaw: Y });
  const south = (u: number, _w: number, d: number): { x: number; z: number; yaw: number } => ({ ...pos(L(u, N + d / 2)), yaw: Y + Math.PI });
  function pos(p: [number, number]): { x: number; z: number } { return { x: p[0], z: p[1] }; }
  const pad = (x: number, z: number, w: number, d: number, yaw: number, color = 0x77705f): void => { k.box(x, z, w, d, 0.1, color, { ry: -yaw, solid: false }); };

  // ------------------------------------------------------------------------------------------ main street
  // Cinder Fuel: canopy, pumps and a convenience store
  {
    const p = north(-176, 12, 10);
    k.building(p.x, p.z, 12, 8, 3.6, p.yaw, 0xe4ded0, { roof: 'flat', mode: MODE.PUNCHED });
    const [cx, cz] = L(-176, -N + 6);
    pad(cx, cz + 0, 26, 18, Y, 0x6b6a68);
    for (const du of [-5, 5]) for (const dv of [-3, 3]) { const [px, pz] = k.at(cx, cz, Y, du, dv); k.box(px, pz, 0.35, 0.35, 5, 0xd9d9d6); }
    const [rx, rz] = k.at(cx, cz, Y, 0, 0);
    k.box(rx, rz, 14, 9, 0.5, 0xc23a2a, { y0: k.ground(rx, rz) + 5, ry: -Y, solid: false });
    for (const du of [-3, 3]) { const [px, pz] = k.at(cx, cz, Y, du, 0); k.box(px, pz, 0.7, 0.5, 1.5, 0xc23a2a); k.box(px, pz, 0.5, 0.3, 0.3, 0xf4e8c0, { y0: k.ground(px, pz) + 1.0, mode: MODE.GLOW, solid: false }); }
    k.sign(...L(-196, -N - 4), Y, 3.6, 3.0, 9, 0xff4a2a);
  }
  // Sidewinder Motel: a long row of rooms, an office with a neon sign and an empty pool
  {
    const p = north(-122, 36, 8);
    k.building(p.x, p.z, 36, 7, 3.4, p.yaw, 0xd8c4a0, { door: 'motel', roof: 'shed', roofColor: 0x7a5a48, mode: MODE.PUNCHED, pitch: 0.12 });
    for (let i = 0; i < 12; i++) { const [dx, dz] = k.at(p.x, p.z, p.yaw, -16.5 + i * 3, 3.55); k.box(dx, dz, 1.0, 0.1, 2.1, i % 3 === 0 ? 0x2d6a8a : 0x7a2f2a, { solid: false }); }
    const o = north(-92, 10, 9);
    k.building(o.x, o.z, 9, 9, 3.8, o.yaw, 0xeadfc6, { roof: 'gable', roofColor: 0x8a4b38, mode: MODE.PUNCHED });
    k.sign(...L(-100, -N + 1), Y, 2.4, 4.2, 10, 0xff2e88);
    const [px, pz] = L(-124, -52);
    k.box(px, pz, 12, 6, 0.12, 0x2a9bc9, { solid: false, y0: k.ground(px, pz) + 0.05, mode: MODE.GLOW });
    k.fence(px - 8, pz - 5, px + 8, pz - 5, 1.2, 0xcfcfcf, 2, false); k.fence(px - 8, pz + 5, px + 8, pz + 5, 1.2, 0xcfcfcf, 2, false);
  }
  // Rusty Spoon Diner
  {
    const p = north(-66, 22, 10);
    k.building(p.x, p.z, 22, 9, 4.2, p.yaw, 0xcfd4d8, { roof: 'shed', roofColor: 0x9aa0a4, mode: MODE.GLASS, pitch: 0.08 });
    const [bx, bz] = k.at(p.x, p.z, p.yaw, 0, 4.6);
    k.box(bx, bz, 22.2, 0.4, 0.7, 0xc23a2a, { y0: k.ground(bx, bz) + 3.0, ry: -p.yaw, solid: false });
    k.sign(...L(-58, -N - 2), Y, 3.8, 3.4, 9, 0x27e6ff);
    pad(...L(-66, -N + 10), 26, 14, Y, 0x5d5d5d);
    for (let i = 0; i < 4; i++) { const [cx, cz] = L(-76 + i * 5, -N + 12); k.box(cx, cz, 2.0, 4.4, 1.5, pick(r, [0x8a3a2f, 0x3a5a8a, 0xc9a227, 0x6a6a6a]), { ry: -Y, solid: true }); }
  }
  // General store with a porch
  {
    const p = north(-24, 18, 12);
    k.building(p.x, p.z, 17, 11, 4.2, p.yaw, 0x9a7a55, { roof: 'false', mode: MODE.PUNCHED });
    const [px, pz] = k.at(p.x, p.z, p.yaw, 0, 7.5);
    k.box(px, pz, 17, 3.2, 0.25, 0x6e5238, { y0: k.ground(px, pz) + 2.9, ry: -p.yaw, solid: false });
    for (const u of [-8, -3, 3, 8]) { const [qx, qz] = k.at(p.x, p.z, p.yaw, u, 8.8); k.box(qx, qz, 0.25, 0.25, 3.0, 0x5a4230, { solid: false }); }
    const [bx, bz] = k.at(p.x, p.z, p.yaw, 4, 7.6);
    k.box(bx, bz, 1.5, 0.8, 0.9, 0x6e5238); k.cyl(bx - 2.6, bz, 0.9, 1.0, 0x5a4a3a);
    k.sign(...L(-24, -N + 3), Y, 6, 1.4, 5.8, 0xffb02e);
  }
  // Dust Bowl Saloon
  {
    const p = north(8, 19, 14);
    k.building(p.x, p.z, 18, 13, 5.4, p.yaw, 0x8a6a48, { roof: 'false', mode: MODE.PUNCHED });
    const [px, pz] = k.at(p.x, p.z, p.yaw, 0, 8.5);
    k.box(px, pz, 18, 3.4, 0.25, 0x5a4230, { y0: k.ground(px, pz) + 3.0, ry: -p.yaw, solid: false });
    for (const u of [-8.5, -4, 4, 8.5]) { const [qx, qz] = k.at(p.x, p.z, p.yaw, u, 9.9); k.box(qx, qz, 0.25, 0.25, 3.1, 0x4a3828, { solid: false }); }
    const [hx, hz] = k.at(p.x, p.z, p.yaw, 0, 11.2);
    k.box(hx, hz, 8, 0.2, 0.2, 0x4a3828, { y0: k.ground(hx, hz) + 1.0, ry: -p.yaw, solid: false });
    k.cyl(hx + 5.2, hz + 0.6, 1.0, 1.1, 0x6e5238); k.cyl(hx - 5.4, hz + 0.4, 1.0, 1.1, 0x6e5238);
  }
  // Post office and a chapel
  {
    const p = north(50, 12, 9);
    k.building(p.x, p.z, 11, 8, 3.8, p.yaw, 0xd8d0c0, { roof: 'hip', roofColor: 0x7a3f30, mode: MODE.PUNCHED });
    const [fx, fz] = k.at(p.x, p.z, p.yaw, 6.5, 5.5);
    k.cyl(fx, fz, 0.16, 7, 0xcfcfcf); k.box(fx + 0.5, fz, 1.2, 0.05, 0.8, 0xc23a2a, { y0: k.ground(fx, fz) + 6.1, solid: false });
    const c = north(176, 9, 13);
    k.building(c.x, c.z, 9, 13, 5, c.yaw + Math.PI / 2, PAL.white, { roof: 'gable', roofColor: 0x6a5a50, mode: MODE.PUNCHED });
    const [tx, tz] = k.at(c.x, c.z, c.yaw + Math.PI / 2, 5.5, 0);
    k.box(tx, tz, 3, 3, 8, PAL.white, { mode: MODE.WALL }); k.box(tx, tz, 3.6, 3.6, 1.4, 0x6a5a50, { y0: k.ground(tx, tz) + 8, solid: false, rz: 0 });
    k.box(tx, tz, 0.15, 0.15, 2.6, 0x444444, { y0: k.ground(tx, tz) + 9.4, solid: false });
  }
  // Iron Hound: the biker bar
  {
    const p = north(96, 26, 16);
    k.building(p.x, p.z, 25, 15, 5, p.yaw, 0x2e3035, { roof: 'flat', mode: MODE.PUNCHED });
    k.sign(...L(100, -N + 2), Y, 7, 2.6, 6.5, 0xff2e88);
    k.sign(...L(90, -N + 2), Y, 3, 3, 8, 0xffb02e);
    pad(...L(96, -N + 11), 36, 14, Y, 0x5f5f5f);
    for (let i = 0; i < 9; i++) { const [bx, bz] = L(80 + i * 3.2, -N + 9 + (i % 2) * 2); k.box(bx, bz, 0.5, 2.0, 1.0, pick(r, [0x1a1a1a, 0x8a1a1a, 0x2a3a5a, 0xaaaaaa]), { ry: -Y + (r() - 0.5) * 0.5 }); }
    const [fx, fz] = L(120, -N - 2); k.cyl(fx, fz, 0.9, 1.0, 0x6a3a22); k.box(fx, fz, 0.5, 0.5, 0.3, 0xff8a2a, { y0: k.ground(fx, fz) + 1.0, mode: MODE.GLOW, solid: false });
    for (const du of [-4, 4]) { const [tx, tz] = L(112 + du, -N - 6); k.box(tx, tz, 2.0, 0.9, 0.9, 0x6e5238); k.box(tx, tz - 1.0, 2.0, 0.35, 0.5, 0x6e5238, { solid: false }); }
  }
  // Water tower
  {
    const [wx, wz] = L(140, -N - 22);
    for (const [dx, dz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]] as const) k.box(wx + dx, wz + dz, 0.35, 0.35, 11, 0x5a4a3a);
    k.cyl(wx, wz, 7.4, 6.2, 0x7a5a42, { y0: k.ground(wx, wz) + 11, solid: false });
    k.cyl(wx, wz, 1.2, 1.6, 0x4a3a2a, { y0: k.ground(wx, wz) + 17.2, solid: false });
    k.box(wx, wz, 5.5, 0.3, 0.3, 0x4a3a2a, { y0: k.ground(wx, wz) + 12, solid: false, ry: 0.78 });
  }

  // ------------------------------------------------------------------------------------------ south side
  // Hot Rod Heaven garage
  {
    const p = south(-12, 20, 14);
    k.building(p.x, p.z, 20, 13, 5.4, p.yaw, 0x8a9096, { roof: 'shed', roofColor: 0x6a7178, mode: MODE.METAL, pitch: 0.1 });
    for (let i = 0; i < 3; i++) { const [dx, dz] = k.at(p.x, p.z, p.yaw, -6 + i * 6, 6.6); k.box(dx, dz, 4.2, 0.2, 3.6, 0x3a3d42, { ry: -p.yaw, solid: false }); }
    pad(...L(-12, N + 8), 30, 14, Y, 0x585858);
    for (let i = 0; i < 3; i++) { const [cx, cz] = L(-24 + i * 7, N + 12); k.box(cx, cz, 4.4, 1.9, 1.3, pick(r, [0xc9a227, 0x8a1a1a, 0x1a4a7a]), { ry: -Y + 0.4 * (i - 1) }); }
    for (let i = 0; i < 6; i++) { const [tx, tz] = L(10 + (i % 3) * 1.1, N + 3 + Math.floor(i / 3) * 1.1); k.cyl(tx, tz, 1.0, 0.45, 0x1c1c1c); }
    k.sign(...L(-12, N - 3), Y + Math.PI, 5.5, 2.0, 7, 0xff5a3c);
  }
  // Cactus Jack's Trading Post
  {
    const p = south(32, 15, 11);
    k.building(p.x, p.z, 14, 10, 4.2, p.yaw, 0xd9a86a, { roof: 'false', mode: MODE.PUNCHED });
    for (let i = 0; i < 3; i++) { const [dx, dz] = L(26 + i * 5, N - 1); k.plant(VEG.SAGUARO, dx, dz, 0.9 + i * 0.15); }
    k.sign(...L(36, N - 4), Y + Math.PI, 4.4, 3.2, 8, 0x39ff88);
  }
  // Cinder Flats Grocery & a laundromat
  {
    const p = south(66, 16, 12);
    k.building(p.x, p.z, 16, 11, 4.4, p.yaw, 0xc9d6c8, { roof: 'flat', mode: MODE.PUNCHED });
    const q = south(88, 10, 10);
    k.building(q.x, q.z, 10, 9, 3.8, q.yaw, 0xbfd0e0, { roof: 'gable', roofColor: 0x6a5a50, mode: MODE.PUNCHED });
  }

  // ------------------------------------------------------------------------------------- trailer park
  {
    const rows = [58, 92];
    for (const v of rows) {
      for (let i = 0; i < 8; i++) {
        const u = -184 + i * 20 + (r() - 0.5) * 3;
        const [x, z] = L(u, v);
        const yaw = Y + (r() - 0.5) * 0.08;
        const col = pick(r, [0xf1ece4, 0xe4d9bb, 0xb8d6d2, 0xd9c7a8, 0xc9d6c8]);
        k.building(x, z, 9.5, 3.2, 2.6, yaw, col, { door: 'trailer', doorBack: true, roof: 'shed', roofColor: 0xb8b8b4, mode: MODE.PUNCHED, pitch: 0.05, overhang: 0.25 });
        const [ax, az] = k.at(x, z, yaw, 0, 3.0);
        k.box(ax, az, 6, 2.2, 0.15, pick(r, [0x2f6b8a, 0xc23a2a, 0x4a7a4a]), { y0: k.ground(ax, az) + 2.2, ry: -yaw, solid: false, rx: -0.12 });
        if (r() < 0.6) { const [cx, cz] = k.at(x, z, yaw, 8, 4.2); k.box(cx, cz, 4.4, 1.9, 1.3, pick(r, [0x8a3a2f, 0x3a5a8a, 0x777777, 0x5a6a4a]), { ry: -yaw + (r() - 0.5) * 0.3 }); }
        if (r() < 0.7) { const [sx, sz] = k.at(x, z, yaw, -6, 4.6); k.cyl(sx, sz, 0.9, 1.1, 0x4d6a8a, { solid: false }); }
        if (r() < 0.5) k.plant(VEG.CACTUS, ...k.at(x, z, yaw, 6.5, -2.8), 0.8);
      }
    }
    const [gx, gz] = L(-196, 36); k.sign(gx, gz, Y + Math.PI, 5.2, 2.6, 6, 0xffb02e);
    // the windmill pump
    const [wx, wz] = L(-30, 120);
    k.box(wx, wz, 0.5, 0.5, 11, 0x6a5a4a, { solid: true });
    for (let i = 0; i < 6; i++) k.box(wx, wz, 5.2, 0.12, 0.7, 0xb8b8b4, { y0: k.ground(wx, wz) + 10.4, ry: (i * TAU) / 6, solid: false });
    k.cyl(wx + 4, wz + 1, 3.2, 2.4, 0x6a7178);
    // the park's water tank
    const [tx, tz] = L(-60, 120); k.cyl(tx, tz, 4, 3.5, 0x7a7068);
  }

  // -------------------------------------------------------------------------------- Moonshine & Scrap
  {
    const cu = 132, cv = 82;
    const w = 70, d = 56;
    const corners: [number, number][] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
    const wc = corners.map(([a, b]) => L(cu + a, cv + b));
    for (let i = 0; i < 4; i++) { const a = wc[i]!, b = wc[(i + 1) % 4]!; if (i === 0) { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; k.wall(a[0], a[1], m[0]! - 6, m[1]!  - 0.8, 2.4, 0x7a6a58, 0.2); k.wall(m[0]! + 6, m[1]! + 0.8, b[0], b[1], 2.4, 0x7a6a58, 0.2); } else k.wall(a[0], a[1], b[0], b[1], 2.4, 0x7a6a58, 0.2); }
    // the shed with a corrugated roof, and copper stills
    const [sx, sz] = L(cu + 14, cv + 10);
    k.building(sx, sz, 24, 13, 5, Y, 0x8a7a68, { roof: 'shed', roofColor: 0x9aa0a4, mode: MODE.METAL, pitch: 0.14 });
    for (let i = 0; i < 4; i++) {
      const [px, pz] = L(cu - 22 + i * 5.2, cv - 12);
      k.cyl(px, pz, 2.6, 3.8, 0xb87333, { solid: true });
      k.cyl(px, pz, 1.5, 1.4, 0xb87333, { y0: k.ground(px, pz) + 3.8, solid: false });
      k.pipe(px + 1.8, k.ground(px, pz) + 4.2, pz + 1.6, 0.3, 4, 0xb87333, Y + 0.7);
    }
    for (let i = 0; i < 3; i++) { const [tx, tz] = L(cu - 14 + i * 6, cv + 18); k.pipe(tx, k.ground(tx, tz) + 1.2, tz, 2.4, 7, 0xd6d0c4, Y, MODE.METAL, false); k.box(tx, tz, 7, 2.4, 1.2, 0x555555, { ry: -Y, solid: true, y0: k.ground(tx, tz) }); }
    // barrels, wrecks and scrap heaps
    for (let i = 0; i < 26; i++) { const [bx, bz] = L(cu - 30 + r() * 62, cv - 24 + r() * 50); if (Math.hypot(bx - sx, bz - sz) < 11) continue; k.cyl(bx, bz, 0.9, 1.1, pick(r, [0x8a3a2f, 0x3a5a8a, 0x5a5a5a, 0x7a6a2a])); }
    for (let i = 0; i < 9; i++) {
      const [wx2, wz2] = L(cu - 28 + (i % 5) * 12, cv + 8 + Math.floor(i / 5) * 11);
      if (Math.hypot(wx2 - sx, wz2 - sz) < 14) continue;
      const stack = 1 + Math.floor(r() * 3);
      for (let s = 0; s < stack; s++) k.box(wx2, wz2, 4.2, 1.9, 1.0, pick(r, PAL.rust), { y0: k.ground(wx2, wz2) + s * 1.1, ry: -Y + (r() - 0.5) * 0.4 });
    }
    for (let i = 0; i < 7; i++) { const [hx, hz] = L(cu - 30 + r() * 62, cv - 24 + r() * 50); k.box(hx, hz, 2 + r() * 3, 2 + r() * 3, 0.8 + r() * 1.2, pick(r, PAL.rust), { ry: r() * 3, rx: (r() - 0.5) * 0.4, solid: false }); }
    // a gantry of rusty pipe and a sign
    const [px, pz] = L(cu - 12, cv + 26);
    k.box(px, pz, 0.4, 0.4, 7, 0x4a3a2a); k.box(px + 8, pz, 0.4, 0.4, 7, 0x4a3a2a); k.box(px + 4, pz, 9, 0.5, 0.5, 0x4a3a2a, { y0: k.ground(px, pz) + 7, solid: false });
    k.sign(...L(cu, cv - 30), Y + Math.PI, 6.5, 2.2, 3.2, 0xff4a2a);
  }

  // -------------------------------------------------------------------------------------- power & signs
  for (let u = -700; u <= 700; u += 46) {
    const [px, pz] = L(u, 18);
    if (Math.abs(u) < 215 && Math.abs(u) > 0) continue; // the town's buildings carry their own lines
    k.box(px, pz, 0.32, 0.32, 11.5, 0x5a4a3a);
    k.box(px, pz, 0.12, 3.6, 0.14, 0x3a3128, { y0: k.ground(px, pz) + 10.4, ry: -Y, solid: false });
  }
  k.sign(...L(-520, 16), Y + Math.PI, 9, 4.4, 5.2, 0xe8c050, MODE.WALL);
  k.sign(...L(-520, 16), Y + Math.PI, 8, 3.6, 5.2, 0x7a3a2a, MODE.WALL);
  k.sign(...L(560, -16), Y, 9, 4.4, 5.2, 0xe8c050, MODE.WALL);

  // --------------------------------------------------------------------------------------- wind turbines
  for (const [tx, tz] of TURBINES) {
    k.cyl(tx, tz, 4.2, 78, 0xe9e9e6, { solid: true });
    k.box(tx, tz, 6, 3, 3.4, 0xdadad6, { y0: k.ground(tx, tz) + 78, solid: false });
    k.plant(VEG.SCRUB, tx + 6, tz + 4, 1);
  }

  // ----------------------------------------------------------------------------- the abandoned airstrip
  {
    const a = GEO.airstrip;
    const ay = a.yaw;
    const A = (u: number, v: number): [number, number] => k.at(a.x, a.z, ay, u, v);
    // hangar with an arched roof
    const [hx, hz] = A(-a.len * 0.3, -70);
    const len = 44, rad = 17;
    k.box(hx, hz, len, 0.6, 9.5, 0x8a8f92, { y0: k.ground(hx, hz), ry: -ay, solid: false });
    const hp = k.at(hx, hz, ay, 0, 0);
    // two end walls with a big door opening, side walls under the arch
    for (const e of [-1, 1]) { const [ex, ez] = k.at(hx, hz, ay, e * (len / 2 - 0.3), 0); k.box(ex, ez, 0.5, rad * 2, 8.2, 0x8a8f92, { ry: -ay, mode: MODE.METAL }); }
    const [sxa, sza] = k.at(hx, hz, ay, 0, -rad); k.box(sxa, sza, len, 0.5, 6, 0x8a8f92, { ry: -ay, mode: MODE.METAL });
    const [sxb, szb] = k.at(hx, hz, ay, 0, rad); k.box(sxb, szb, len, 0.5, 6, 0x8a8f92, { ry: -ay, mode: MODE.METAL });
    const facets = 9;
    for (let i = 0; i < facets; i++) {
      const phi = ((i + 0.5) / facets - 0.5) * Math.PI * 0.92;
      const [fx, fz] = k.at(hx, hz, ay, 0, Math.sin(phi) * rad);
      const fw = (2 * rad * Math.tan(Math.PI * 0.46 / facets)) * 1.05;
      k.box(fx, fz, len, fw, 0.25, i % 2 ? 0x6a5a4a : 0x7a6a58, { y0: k.ground(hx, hz) + 5.5 + Math.cos(phi) * (rad - 5.5) , ry: -ay, rx: phi, solid: false });
    }
    void hp;
    // control tower
    const [tx, tz] = A(-a.len * 0.18, -48);
    k.box(tx, tz, 6, 6, 12, 0xcfc9bb, { mode: MODE.PUNCHED, ry: -ay });
    k.box(tx, tz, 9, 9, 3.2, 0x2f4a5a, { y0: k.ground(tx, tz) + 12, mode: MODE.GLASS, ry: -ay, solid: false });
    k.box(tx, tz, 10, 10, 0.4, 0x55585e, { y0: k.ground(tx, tz) + 15.2, ry: -ay, solid: false });
    // windsock
    const [wx, wz] = A(-a.len * 0.05, -52);
    k.cyl(wx, wz, 0.2, 7, 0xcfcfcf, { solid: false }); k.box(wx + 1.2, wz, 2.4, 0.8, 0.8, 0xe0702a, { y0: k.ground(wx, wz) + 6.6, solid: false, rz: -0.35 });
    // the derelict plane on the apron
    const [px, pz] = A(-a.len * 0.1, -46);
    const pyaw = ay + 0.45;
    k.box(px, pz, 19, 3.0, 3.0, 0xc9c9c2, { y0: k.ground(px, pz) + 0.7, ry: -pyaw, mode: MODE.METAL });
    const [wx1, wz1] = k.at(px, pz, pyaw, 1, 0);
    k.box(wx1, wz1, 3.6, 21, 0.35, 0xb8b8b2, { y0: k.ground(px, pz) + 1.3, ry: -pyaw, solid: false });
    const [tx1, tz1] = k.at(px, pz, pyaw, -9, 0);
    k.box(tx1, tz1, 1.8, 0.3, 4.2, 0xb8b8b2, { y0: k.ground(px, pz) + 1.3, ry: -pyaw, solid: false });
    k.box(tx1, tz1, 3.2, 8.5, 0.25, 0xb8b8b2, { y0: k.ground(px, pz) + 4.2, ry: -pyaw, solid: false });
    const [nx, nz] = k.at(px, pz, pyaw, 8.8, 0);
    k.box(nx, nz, 2.6, 2.6, 2.4, 0xaaaaa4, { y0: k.ground(px, pz) + 0.7, ry: -pyaw, solid: false });
    // fuel drums & crates
    for (let i = 0; i < 12; i++) { const [dx, dz] = A(-a.len * 0.32 + r() * 18, -34 + r() * 12); k.cyl(dx, dz, 0.9, 1.1, pick(r, [0x8a3a2f, 0x4a5a6a, 0x8a7a2a])); }
    for (let i = 0; i < 5; i++) { const [dx, dz] = A(-a.len * 0.26 + r() * 26, -26 + r() * 6); k.box(dx, dz, 2.2, 1.6, 1.4, pick(r, PAL.wood), { ry: r() * 3 }); }
    // runway edge lights (dead) and a line of tyres
    for (let i = -8; i <= 8; i++) { const [lx, lz] = A(i * 70, 24.5); k.cyl(lx, lz, 0.4, 0.7, 0x888880, { solid: false }); }
    // sand-blasted sign
    k.sign(...A(-a.len * 0.5 - 14, -26), ay + Math.PI / 2, 6, 3, 4.5, 0xb08a58, MODE.WALL);
  }

  // ------------------------------------------------------------------------------------ the salt lake
  {
    const sx = GEO.salt.x - 90, sz = GEO.salt.z - 40;
    // the stranded hull: a rusty tanker bow-up on the lake bed
    const hy = 0.5;
    const hull = (u: number, w: number, h: number, color: number, y = 0): void => { const [x, z] = k.at(sx, sz, hy, u, 0); k.box(x, z, 14, w, h, color, { y0: k.ground(sx, sz) + y, ry: -hy, mode: MODE.METAL }); };
    for (let i = -3; i <= 3; i++) hull(i * 14, 20 - Math.abs(i) * 1.4, 11, i < 0 ? 0x7a3a2a : 0x6b4a3a, 0.5);
    hull(-52, 16, 7, 0x5a3a2c, 0.5);
    const [bx, bz] = k.at(sx, sz, hy, -34, 0);
    k.box(bx, bz, 14, 14, 12, 0xcfc9bb, { y0: k.ground(sx, sz) + 11.5, ry: -hy, mode: MODE.PUNCHED });
    k.cyl(bx + 3, bz, 3.4, 10, 0x6a4a3a, { y0: k.ground(sx, sz) + 23, solid: false });
    for (let i = 0; i < 5; i++) { const [mx, mz] = k.at(sx, sz, hy, -10 + i * 14, 0); k.cyl(mx, mz, 0.7, 9, 0x6a5a4a, { y0: k.ground(sx, sz) + 11.5, solid: false }); }
    // speed-record marker posts across the pan
    for (let i = 0; i < 12; i++) { const mx = GEO.salt.x - 380 + i * 60, mz = GEO.salt.z + 150; k.box(mx, mz, 0.5, 0.5, 3.2, i % 2 ? 0xc23a2a : 0xf0ede6, { solid: false }); }
    k.sign(GEO.salt.x - 400, GEO.salt.z + 140, 0, 6, 3.4, 5.5, 0xffffff, MODE.WALL);
    for (let i = 0; i < 5; i++) { const x = GEO.salt.x - 200 + r() * 360, z = GEO.salt.z - 150 + r() * 250; k.box(x, z, 2.2, 6.4, 1.8, pick(r, PAL.rust), { ry: r() * 3, solid: true }); }
  }

  // ----------------------------------------------------------------------------- dirt-bike trail jumps
  const jumps: [number, number, number][] = [[3000, 120, 0.1], [3260, -220, 0.3], [3640, -110, 2.2], [3500, 300, 3.5], [3095, -70, 4.4]];
  for (const [jx, jz, jy] of jumps) {
    k.box(jx, jz, 3.4, 7.5, 0.4, 0x8a6a48, { y0: k.ground(jx, jz) + 0.55, ry: -jy, rx: 0, rz: -0.38 });
    k.box(jx - Math.cos(jy) * 3.6, jz - Math.sin(jy) * 3.6, 3.4, 5, 0.3, 0x9a7a55, { solid: false });
  }
  // desert dressing: boulders around the strip and a few dead trees
  for (let i = 0; i < 40; i++) { const [x, z] = L(-300 + r() * 600, (r() < 0.5 ? -1 : 1) * (60 + r() * 150)); k.plant(r() < 0.35 ? VEG.ROCK : r() < 0.6 ? VEG.SCRUB : VEG.DEAD, x, z, 0.8 + r()); }
  return k;
}
