import { CANALS, GEO } from '../heightfield';
import { COSTA_X, COSTA_Z } from './layouts';
import { Kit, MODE, PAL, VEG, pick } from './kit';

type Face = 'N' | 'E' | 'S' | 'W';
const YAW: Record<Face, number> = { S: 0, N: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 };
const G = GEO.costa.height;
const TERRA = [0x9a4b38, 0xa85a3e, 0x8a4232];

interface Rect { x0: number; x1: number; z0: number; z1: number }

/**
 * Costa Merida: a pastel resort town a quarter the size of Port Valeria. A grid of streets threaded with canals (bridges at
 * every crossing), a seafront promenade with beach clubs and hotels, the Gran Casino with its neon crown, a market square,
 * a cathedral, a canal-side marina, palms and street lamps throughout.
 */
export function buildCostaMerida(): Kit {
  const k = new Kit('costa', 83);
  const r = k.r;

  // grid lines, with the canals merged in; insets keep buildings clear of street + pavement or canal + quay
  const xs: { v: number; canal: boolean }[] = [...COSTA_X.map((v) => ({ v: v as number, canal: false })), ...[297, 527, 757].map((v) => ({ v, canal: true }))].sort((a, b) => a.v - b.v);
  const zs: { v: number; canal: boolean }[] = [...COSTA_Z.map((v) => ({ v: v as number, canal: false })), { v: 3350, canal: true }].sort((a, b) => a.v - b.v);
  const inset = (g: { canal: boolean }, vertical: boolean): number => (g.canal ? (vertical ? 14.2 : 10.2) : 8.8);

  // ---------------------------------------------------------------------------------------------- bridges
  const bridge = (x: number, z: number, alongX: boolean, span: number, width: number): void => {
    const sx = alongX ? span : width, sz = alongX ? width : span;
    k.box(x, z, sx, sz, 4.7, 0xcfc9bb, { y0: G - 4.5 + 0.0, mode: MODE.WALL });
    for (const side of [-1, 1]) {
      const [rx, rz] = alongX ? [x, z + side * (width / 2 - 0.2)] : [x + side * (width / 2 - 0.2), z];
      k.box(rx, rz, alongX ? sx : 0.3, alongX ? 0.3 : sz, 1.0, 0xe6dfd0, { y0: G + 0.2, solid: true });
    }
  };
  for (const c of CANALS) {
    const vertical = c.z1 - c.z0 > c.x1 - c.x0; // runs north–south
    if (vertical) {
      const cx = (c.x0 + c.x1) / 2, w = c.x1 - c.x0;
      for (const z of COSTA_Z) if (z > c.z0 && z < c.z1) bridge(cx, z, true, w + 7, 18);
    } else {
      const cz = (c.z0 + c.z1) / 2, w = c.z1 - c.z0;
      for (const x of COSTA_X) if (x > c.x0 + 60 && x < c.x1) bridge(x, cz, false, w + 7, x === 130 ? 20 : 18);
    }
  }

  // ------------------------------------------------------------------------------------------------ blocks
  const FACE_COLORS = [...PAL.pastel];
  const edge = (rect: Rect, face: Face, depth: number, hMin: number, hMax: number, shopfront: boolean): void => {
    const horizontal = face === 'N' || face === 'S';
    const len = horizontal ? rect.x1 - rect.x0 : rect.z1 - rect.z0 - (depth + 1) * 2;
    let cur = horizontal ? rect.x0 : rect.z0 + depth + 1;
    const end = cur + len;
    while (cur < end - 8) {
      const w = Math.min(end - cur, 12 + r() * 12);
      if (end - cur - w < 9) { /* absorb the leftover */ }
      const ww = end - cur - w < 9 ? end - cur : w;
      const along = cur + ww / 2;
      const h = (hMin + Math.floor(r() * (hMax - hMin + 1))) * 3.3 + 0.6;
      const col = pick(r, FACE_COLORS);
      let x: number, z: number;
      if (face === 'N') { x = along; z = rect.z0 + depth / 2; }
      else if (face === 'S') { x = along; z = rect.z1 - depth / 2; }
      else if (face === 'W') { x = rect.x0 + depth / 2; z = along; }
      else { x = rect.x1 - depth / 2; z = along; }
      const yaw = YAW[face];
      const hip = h < 15 && r() < 0.35;
      k.building(x, z, ww - 0.4, depth, h, yaw, col, { roof: hip ? 'hip' : 'flat', roofColor: pick(r, TERRA), mode: MODE.PUNCHED, pitch: 0.4, y0: G });
      // balcony band and awning
      if (h > 9) {
        const [bx, bz] = k.at(x, z, yaw, 0, depth / 2 + 0.55);
        k.box(bx, bz, (ww - 0.4) * 0.84, 1.1, 0.16, 0xe6e0d4, { y0: G + 6.6, ry: -yaw, solid: false });
        k.box(bx, bz, (ww - 0.4) * 0.84, 0.08, 0.9, 0xcfc9bb, { y0: G + 6.8, ry: -yaw, solid: false });
        if (h > 18) { const [b2x, b2z] = k.at(x, z, yaw, 0, depth / 2 + 0.55); k.box(b2x, b2z, (ww - 0.4) * 0.84, 1.1, 0.16, 0xe6e0d4, { y0: G + 10, ry: -yaw, solid: false }); }
      }
      if (shopfront && r() < 0.65) {
        const [ax, az] = k.at(x, z, yaw, 0, depth / 2 + 1.1);
        const stripe = pick(r, [0xc23a2a, 0x2f6bb8, 0xe0a82a, 0x3a8a5a, 0xcf6a9a]);
        const aw = k.box(ax, az, (ww - 0.4) * 0.8, 2.2, 0.12, stripe, { y0: G + 2.9, ry: -yaw, solid: false });
        aw.rx = 0.45;
      }
      if (r() < 0.55) { // rooftop clutter
        const [rx, rz] = k.at(x, z, yaw, (r() - 0.5) * ww * 0.5, (r() - 0.5) * depth * 0.4);
        if (r() < 0.5) k.cyl(rx, rz, 2.2, 2.6, 0x7a766c, { y0: G + h + 0.4, solid: false });
        else k.box(rx, rz, 2.4, 1.8, 1.4, 0xb8b4aa, { y0: G + h + 0.4, solid: false });
      }
      cur += ww;
    }
  };

  const special = new Set<string>();
  const cell = (i: number, j: number): Rect | null => {
    const a = xs[i], b = xs[i + 1], c = zs[j], d = zs[j + 1];
    if (!a || !b || !c || !d) return null;
    return { x0: a.v + inset(a, true) + (i === 0 ? 4 : 0), x1: b.v - inset(b, true), z0: c.v + inset(c, false), z1: d.v - inset(d, false) };
  };
  const find = (xv: number, zv: number): [number, number] => [xs.findIndex((g) => g.v === xv), zs.findIndex((g) => g.v === zv)];

  // the casino occupies the block between Avenida Coral's canal and Calle Luna... (x 600–680, z 3260–3350)
  {
    const [i, j] = find(600, 3260);
    const rc = cell(i, j)!;
    special.add(`${i},${j}`);
    const cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2;
    k.box(cx, cz, 60, 62, 9, 0xe9d8c0, { y0: G, mode: MODE.PUNCHED });
    k.box(cx, cz, 61, 63, 0.8, 0x9a8a70, { y0: G + 9, solid: false });
    k.box(cx + 4, cz - 4, 30, 30, 66, 0x3a3f7a, { y0: G + 9.8, mode: MODE.GLASS });
    k.box(cx + 4, cz - 4, 36, 36, 3.2, 0xff2e88, { y0: G + 75.8, mode: MODE.NEON, solid: false });
    k.cyl(cx + 4, cz - 4, 18, 1.2, 0x27e6ff, { y0: G + 79, mode: MODE.NEON, solid: false });
    k.box(cx + 4, cz - 4, 0.6, 0.6, 16, 0xffffff, { y0: G + 80.2, mode: MODE.GLOW, solid: false });
    // marquee signs on the west and south faces
    k.box(rc.x0 - 0.4, cz, 0.6, 44, 8, 0xffb02e, { y0: G + 12, mode: MODE.NEON, solid: false });
    k.box(cx, rc.z1 + 0.4, 44, 0.6, 8, 0x8a5cff, { y0: G + 12, mode: MODE.NEON, solid: false });
    // porte-cochère
    k.box(rc.x0 + 12, rc.z1 - 3, 22, 10, 0.6, 0xf0ede6, { y0: G + 5.6, solid: false });
    for (const dx of [2, 22]) k.cyl(rc.x0 + dx, rc.z1 - 7, 0.9, 5.6, 0xf0ede6);
    // fountain forecourt
    k.cyl(rc.x0 + 14, rc.z1 - 18, 14, 0.9, 0x3a8ab0, { solid: true });
    k.cyl(rc.x0 + 14, rc.z1 - 18, 1.2, 6, 0xf0f4f8, { solid: false });
    for (let n = 0; n < 8; n++) { const a = (n / 8) * Math.PI * 2; k.tree(rc.x0 + 14 + Math.cos(a) * 12, rc.z1 - 18 + Math.sin(a) * 12, 1, 1.1); }
    // searchlights
    for (const dx of [-24, 30]) k.box(cx + dx, cz + 28, 0.7, 0.7, 20, 0xfff0c8, { y0: G + 9.8, mode: MODE.GLOW, solid: false, rz: dx < 0 ? 0.25 : -0.25 });
  }
  // market square: striped stalls around a fountain, a clock tower on the north side
  {
    const [i, j] = find(380, 3170);
    const rc = cell(i, j)!;
    special.add(`${i},${j}`);
    const cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2;
    k.box(cx, cz, rc.x1 - rc.x0, rc.z1 - rc.z0, 0.14, 0xd9cbb0, { y0: G, solid: false });
    for (let row = 0; row < 3; row++) {
      for (let n = 0; n < 5; n++) {
        const sx = rc.x0 + 8 + n * 11, sz = rc.z0 + 16 + row * 16;
        const col = pick(r, [0xc23a2a, 0x2f6bb8, 0xe0a82a, 0x3a8a5a, 0xcf6a9a, 0x8a5cff]);
        k.box(sx, sz, 3, 2.6, 1.0, 0x8a6a48);
        for (const sgn of [-1, 1]) { const a = k.box(sx, sz + sgn * 1.3, 3.4, 1.9, 0.12, sgn > 0 ? col : 0xf0ede6, { y0: G + 2.4, solid: false }); a.rx = sgn * 0.3; }
        for (let g = 0; g < 3; g++) k.box(sx - 0.9 + g * 0.9, sz, 0.6, 0.6, 0.5, pick(r, [0xd0402a, 0xe0b82a, 0x4a9a4a, 0xcf7a2a]), { y0: G + 1.0, solid: false });
      }
    }
    k.cyl(cx, cz - 2, 9, 0.9, 0x3a8ab0); k.cyl(cx, cz - 2, 1.4, 4.2, 0xf0f4f8, { solid: false });
    k.building(cx, rc.z0 + 6, 8, 8, 24, 0, 0xf2dca4, { roof: 'hip', roofColor: 0x9a4b38, mode: MODE.PUNCHED, y0: G });
    k.box(cx, rc.z0 + 6 + 4.3, 4, 0.2, 4, 0xf4f0e0, { y0: G + 18, mode: MODE.GLOW, solid: false });
  }
  // the cathedral and its plaza
  {
    const [i, j] = find(380, 3350);
    const rc = cell(i, j)!;
    special.add(`${i},${j}`);
    const cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2;
    k.box(cx, cz, rc.x1 - rc.x0, rc.z1 - rc.z0, 0.14, 0xd9cbb0, { y0: G, solid: false });
    k.building(cx, cz + 14, 16, 36, 16, 0, 0xf4ede0, { roof: 'gable', roofColor: 0x8a4b38, mode: MODE.CLERESTORY, pitch: 0.5, y0: G });
    for (const dx of [-9, 9]) { k.box(cx + dx, cz - 6, 7, 7, 30, 0xf4ede0, { y0: G, mode: MODE.WALL }); k.box(cx + dx, cz - 6, 8, 8, 1, 0xcfc9bb, { y0: G + 30, solid: false }); const p = k.box(cx + dx, cz - 6, 5.2, 5.2, 8, 0x8a4b38, { y0: G + 31, solid: false, ry: Math.PI / 4 }); void p; k.box(cx + dx, cz - 6, 0.25, 0.25, 4, 0xe0c040, { y0: G + 39, solid: false }); }
    k.cyl(cx, cz - 26, 9, 0.8, 0x3a8ab0); k.cyl(cx, cz - 26, 1.2, 3.6, 0xf0f4f8, { solid: false });
    for (let n = 0; n < 8; n++) k.tree(rc.x0 + 6, rc.z0 + 8 + n * 10, 1, 1.0), k.tree(rc.x1 - 6, rc.z0 + 8 + n * 10, 1, 1.0);
  }
  // seafront hotels along the promenade
  {
    const j0 = [0, 1, 3].map((j) => ({ j, h: 8 + Math.floor(r() * 4) }));
    for (const { j, h } of j0) {
      const rc = cell(0, j);
      if (!rc) continue;
      special.add(`0,${j}`);
      const cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2;
      k.building(cx - 8, cz, 34, rc.z1 - rc.z0 - 8, h * 3.4, YAW.W, pick(r, PAL.pastel), { roof: 'flat', mode: MODE.GLASS, y0: G });
      k.box(cx + 16, cz, 12, rc.z1 - rc.z0 - 10, 0.5, 0x2a9bc9, { y0: G + 0.2, solid: false, mode: MODE.GLOW }); // pool deck
      k.sign(cx - 26, cz - 12, YAW.W, 4, 2, 12, pick(r, PAL.neon));
      for (let n = 0; n < 5; n++) k.tree(cx + 14, rc.z0 + 8 + n * 13, 1, 1.1);
    }
  }
  // everything else: terracotta-and-pastel perimeter blocks with a courtyard garden
  for (let j = 0; j < zs.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      if (special.has(`${i},${j}`)) continue;
      const rc = cell(i, j);
      if (!rc || rc.x1 - rc.x0 < 20 || rc.z1 - rc.z0 < 20) continue;
      const depth = Math.min(15, (rc.x1 - rc.x0) / 3, (rc.z1 - rc.z0) / 3);
      const tall = (i + j) % 4 === 0 ? 2 : 0;
      edge(rc, 'N', depth, 3 + tall, 6 + tall, true);
      edge(rc, 'S', depth, 3 + tall, 6 + tall, true);
      edge(rc, 'W', depth, 3, 6, true);
      edge(rc, 'E', depth, 3, 6, true);
      const cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2;
      k.box(cx, cz, rc.x1 - rc.x0 - depth * 2, rc.z1 - rc.z0 - depth * 2, 0.1, 0x6f9a5a, { y0: G, solid: false });
      for (let n = 0; n < 3; n++) k.tree(cx + (r() - 0.5) * (rc.x1 - rc.x0 - depth * 2 - 4), cz + (r() - 0.5) * (rc.z1 - rc.z0 - depth * 2 - 4), 1, 1.0 + r() * 0.3);
    }
  }

  // ---------------------------------------------------------------------------- streets: palms and lamps
  for (const x of COSTA_X) {
    for (let z = 3070; z < 3640; z += 22) {
      if (Math.abs(z - 3350) < 22) continue;
      if (CANALS.some((c) => c.z1 - c.z0 > 100 && z > c.z0 - 8 && z < c.z1 + 8 && Math.abs(x - (c.x0 + c.x1) / 2) < 10)) continue;
      k.tree(x - 7.4, z + 3, 1, 1.0 + r() * 0.25);
      if (x !== 130) k.tree(x + 7.4, z + 14, 1, 1.0 + r() * 0.25);
    }
    for (let z = 3070; z < 3640; z += 38) { if (Math.abs(z - 3350) < 24) continue; k.lamp(x + 6.6, z, Math.PI); }
  }
  for (const z of COSTA_Z) for (let x = 140; x < 840; x += 40) { if (CANALS.some((c) => !(c.z1 - c.z0 > 100) ? false : Math.abs(x - (c.x0 + c.x1) / 2) < 14)) continue; k.lamp(x, z - 6.6, -Math.PI / 2); }

  // --------------------------------------------------------------------- seafront: promenade, beach and clubs
  for (let z = 3070; z < 3640; z += 30) { k.box(118, z, 1.6, 0.5, 0.5, 0xf0ede6, { solid: false }); } // benches
  for (let n = 0; n < 34; n++) {
    const x = 48 + r() * 54, z = 3070 + r() * 570;
    if (Math.abs(z - 3350) < 16) continue;
    k.cyl(x, z, 0.12, 2.4, 0xf0ede6, { solid: false });
    k.cyl(x, z, 3.2, 0.12, pick(r, [0xc23a2a, 0x2f6bb8, 0xe0a82a, 0xf0ede6, 0x3a8a5a]), { y0: k.ground(x, z) + 2.3, solid: false });
    k.box(x + 1.6, z + 0.8, 0.8, 2.0, 0.35, 0xf0ede6, { solid: false, ry: r() * 0.6 });
  }
  for (const z of [3150, 3270, 3440, 3560]) { // lifeguard towers and beach bars
    k.box(70, z, 3, 3, 2.6, 0xf0ede6, { y0: G + 2.4, solid: false });
    for (const dx of [-1.2, 1.2]) for (const dz of [-1.2, 1.2]) k.box(70 + dx, z + dz, 0.2, 0.2, 2.6, 0x9a9a92, { solid: false });
    k.box(70, z, 3.6, 3.6, 0.3, 0xc23a2a, { y0: G + 5.0, solid: false });
    k.building(86, z + 14, 12, 7, 3.6, YAW.W, pick(r, PAL.pastel), { roof: 'hip', roofColor: 0x6a5a48, mode: MODE.PUNCHED, y0: G });
    k.sign(94, z + 8, YAW.W, 3, 1.6, 4, pick(r, PAL.neon));
  }
  // the pier: a long boardwalk jutting into the sea with a carousel pavilion at the end
  k.box(40, 3300, 70, 6, 0.4, 0x9a7a55, { y0: 1.6 });
  for (let n = 0; n < 12; n++) k.cyl(6 + n * 6, 3297, 0.6, 3.4, 0x4a3a2a, { y0: -1.2, solid: false });
  k.building(-4, 3300, 16, 12, 5, 0, 0xf2dca4, { roof: 'hip', roofColor: 0xc23a2a, mode: MODE.PUNCHED, y0: 2.0 });

  // ------------------------------------------------------------------------------ marina and canal boats
  const yacht = (x: number, z: number, len: number, yaw: number): void => {
    const col = pick(r, [0xf0ede6, 0xe8e4d8, 0x2f4a6a, 0xcf6a4a]);
    k.box(x, z, len, len * 0.27, 1.4, col, { y0: -0.8, ry: -yaw, mode: MODE.METAL });
    const [cx, cz] = k.at(x, z, yaw, -len * 0.1, 0);
    k.box(cx, cz, len * 0.4, len * 0.2, 1.8, 0xf0ede6, { y0: 0.6, ry: -yaw, mode: MODE.GLASS, solid: false });
    k.box(cx, cz, len * 0.34, len * 0.16, 0.2, 0x3a3f46, { y0: 2.4, ry: -yaw, solid: false });
  };
  for (let n = 0; n < 8; n++) yacht(60 + n * 26, n % 2 ? 3345.5 : 3354, 11 + r() * 5, 0);
  for (const cx of [297, 527, 757]) for (let n = 0; n < 3; n++) { const z = 3110 + n * 80 + r() * 20; const col = pick(r, [0xc23a2a, 0x2f6bb8, 0xe0a82a]); k.box(cx + (r() - 0.5) * 6, z, 3.0, 8, 0.9, col, { y0: -0.6 }); k.box(cx, z, 1.4, 3.2, 1.2, 0xf0ede6, { y0: 0.3, solid: false }); }

  // ------------------------------------------------------------------------------------------ the station
  k.building(612, 3042, 40, 12, 8, 0, 0xf2dca4, { roof: 'hip', roofColor: 0x9a4b38, mode: MODE.PUNCHED, y0: G });
  k.box(606, 3052, 70, 4, 0.6, 0x9a968c, { y0: G, solid: false });
  k.box(606, 3052, 66, 3.2, 0.3, 0xcfc9bb, { y0: G + 3.6, solid: false });
  k.scatter(VEG.SCRUB, 600, 3030, 30, 8, 0.6, 1.0);
  return k;
}
