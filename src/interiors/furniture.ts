import { S, type Builder, type Surf } from './Builder';

/** Facing: 0 = front looks toward +z, 1 = toward -z, 2 = toward +x, 3 = toward -x. */
export type Face = 0 | 1 | 2 | 3;
const FW: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]];

/** Local (a = to the right, c = toward the front) → room coordinates. */
export function loc(f: Face, x: number, z: number, a: number, c: number): [number, number] {
  const [fx, fz] = FW[f]!;
  const rx = fz, rz = -fx;
  return [x + a * rx + c * fx, z + a * rz + c * fz];
}

/** A box in furniture space: `w` across, `d` deep (toward the front), standing on y0. */
export function part(b: Builder, f: Face, x: number, z: number, a: number, c: number, y0: number, w: number, h: number, d: number, surf: Surf, solid = false, occl = true): void {
  const [wx, wz] = loc(f, x, z, a, c);
  const along = f < 2;
  b.box(wx, y0, wz, along ? w : d, h, along ? d : w, surf, solid, occl);
}
function glowPart(b: Builder, f: Face, x: number, z: number, a: number, c: number, y0: number, w: number, h: number, d: number, col: number, bright = 1): void {
  const [wx, wz] = loc(f, x, z, a, c);
  const along = f < 2;
  b.glow(wx, y0, wz, along ? w : d, h, along ? d : w, col, bright);
}

// ------------------------------------------------------------------------------------------------ palettes

export const WOOD = [0x8a6040, 0x6b4a30, 0xa67c52, 0x4a3424, 0xc49a6c];
export const FABRIC = [0x5a6f8a, 0x8a5a4a, 0x4a6a5a, 0x7a7a72, 0x3a3f4a, 0xa88a6a, 0x6a4a6a, 0x2f4f6f];
export const PAINT = [0xeae4d8, 0xdfe6e2, 0xe8dcc8, 0xd8dde6, 0xf0e8dc, 0xe2d6c6, 0xcfd9cf, 0xe6d2c8];

// ------------------------------------------------------------------------------------------------ living

export function sofa(b: Builder, x: number, z: number, f: Face, col: number, w = 2.1): void {
  const fab = S('fabric', col, 0.5);
  part(b, f, x, z, 0, 0, 0, w, 0.42, 0.9, fab, true);
  part(b, f, x, z, 0, -0.36, 0.42, w, 0.42, 0.2, fab);
  for (const s of [-1, 1]) part(b, f, x, z, s * (w / 2 - 0.1), 0.02, 0.42, 0.2, 0.2, 0.86, fab);
  for (let i = 0; i < 2; i++) part(b, f, x, z, (i - 0.5) * (w - 0.5) / 1, 0.06, 0.42, (w - 0.5) / 2 - 0.02, 0.1, 0.62, S('fabric', col, 0.4));
  for (const s of [-1, 1]) part(b, f, x, z, s * (w / 2 - 0.5), -0.22, 0.52, 0.42, 0.32, 0.12, S('fabric', b.pick(FABRIC), 0.3));
}

export function armchair(b: Builder, x: number, z: number, f: Face, col: number): void {
  const fab = S('fabric', col, 0.5);
  part(b, f, x, z, 0, 0, 0, 0.9, 0.42, 0.85, fab, true);
  part(b, f, x, z, 0, -0.33, 0.42, 0.9, 0.48, 0.2, fab);
  for (const s of [-1, 1]) part(b, f, x, z, s * 0.37, 0.02, 0.42, 0.16, 0.2, 0.8, fab);
}

export function coffeeTable(b: Builder, x: number, z: number, w = 1.1, d = 0.6): void {
  const wd = S('wood', b.pick(WOOD), 1.2);
  b.box(x, 0.36, z, w, 0.06, d, wd, true);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) b.box(x + sx * (w / 2 - 0.06), 0, z + sz * (d / 2 - 0.06), 0.05, 0.36, 0.05, wd, false, false);
  // a magazine and a mug
  b.box(x - 0.2, 0.42, z + 0.05, 0.28, 0.01, 0.2, S('plain', b.pick([0xc43c3c, 0x3c6cc4, 0xe8d24a])), false, false);
  b.cyl(x + 0.25, 0.42, z - 0.08, 0.04, 0.09, S('plain', 0xf2f2f2), false, 10);
}

export function table(b: Builder, x: number, z: number, w: number, d: number, surf = S('wood', 0x8a6040, 1.2), h = 0.75): void {
  b.box(x, h - 0.05, z, w, 0.05, d, surf, true);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) b.box(x + sx * (w / 2 - 0.07), 0, z + sz * (d / 2 - 0.07), 0.06, h - 0.05, 0.06, surf, false, false);
}

export function roundTable(b: Builder, x: number, z: number, r = 0.45, surf = S('wood', 0x6b4a30, 1), h = 0.74): void {
  b.cyl(x, h - 0.04, z, r, 0.04, surf, true, 20);
  b.cyl(x, 0, z, 0.05, h - 0.04, S('metal', 0x2a2d33), false, 8);
  b.cyl(x, 0, z, 0.25, 0.03, S('metal', 0x2a2d33), false, 14);
}

export function chair(b: Builder, x: number, z: number, f: Face, surf = S('wood', 0x6b4a30, 1)): void {
  part(b, f, x, z, 0, 0, 0.43, 0.44, 0.05, 0.44, surf);
  part(b, f, x, z, 0, -0.2, 0.48, 0.42, 0.46, 0.04, surf);
  for (const [sa, sc] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) part(b, f, x, z, sa * 0.19, sc * 0.19, 0, 0.04, 0.43, 0.04, surf, false, false);
}

export function stool(b: Builder, x: number, z: number, h = 0.75, top = 0x8a2a2a): void {
  b.cyl(x, h - 0.08, z, 0.19, 0.08, S('leather', top, 0.4), false, 16);
  b.cyl(x, 0, z, 0.03, h - 0.08, S('metal', 0x9aa0a8), false, 8);
  b.cyl(x, 0, z, 0.2, 0.03, S('metal', 0x9aa0a8), false, 14);
  b.cyl(x, 0.28, z, 0.15, 0.02, S('metal', 0x9aa0a8), false, 14);
}

export function tv(b: Builder, x: number, z: number, f: Face, w = 1.3, on = true): void {
  const wd = S('wood', 0x3a2a1c, 1);
  part(b, f, x, z, 0, 0, 0, w + 0.4, 0.5, 0.42, wd, true);
  part(b, f, x, z, 0, -0.05, 0.5, w, w * 0.56, 0.05, S('plain', 0x0c0d10));
  glowPart(b, f, x, z, 0, -0.02, 0.53, w - 0.06, w * 0.56 - 0.06, 0.02, on ? b.pick([0x5a8acc, 0x6acc8a, 0xcc8a5a, 0x8a6acc]) : 0x08090c, on ? 0.9 : 1);
  if (on) { const [lx, lz] = loc(f, x, z, 0, 0.6); b.light(lx, 0.9, lz, 0x8ab0ff, 0.35, 2.2, false); }
}

export function bookcase(b: Builder, x: number, z: number, f: Face, w = 1.0): void {
  const wd = S('wood', b.pick(WOOD), 1);
  part(b, f, x, z, 0, 0, 0, w, 2.0, 0.34, wd, true);
  for (let row = 0; row < 4; row++) {
    let a = -w / 2 + 0.06;
    while (a < w / 2 - 0.1) {
      const bw = b.range(0.03, 0.07), bh = b.range(0.22, 0.32);
      if (b.r() < 0.12) { a += 0.1; continue; }
      part(b, f, x, z, a + bw / 2, 0.18, 0.12 + row * 0.47, bw, bh, 0.24, S('plain', b.pick([0x8a2a2a, 0x2a4a8a, 0x2a6a3a, 0xc4a24a, 0x3a3a3a, 0xe8e0d0, 0x6a3a6a])), false, false);
      a += bw + 0.005;
    }
  }
}

export function plant(b: Builder, x: number, z: number, big = true): void {
  const pot = b.pick([0xc46a3a, 0xe8e4dc, 0x2a2d33, 0x6a8a9a]);
  b.cyl(x, 0, z, big ? 0.22 : 0.14, big ? 0.42 : 0.26, S('plain', pot), true, 16, big ? 0.26 : 0.17);
  const leaf = b.pick([0x3a6a32, 0x4a7a3a, 0x2f5a2a]);
  const top = big ? 0.42 : 0.26;
  if (big) {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + b.r() * 0.5, rr = b.range(0.1, 0.28);
      b.ball(x + Math.cos(a) * rr, top + b.range(0.45, 1.1), z + Math.sin(a) * rr, b.range(0.18, 0.3), S('fabric', leaf, 0.3), 0.8);
    }
    b.cyl(x, top, z, 0.025, 0.7, S('wood', 0x4a3424), false, 6);
  } else b.ball(x, top + 0.18, z, 0.2, S('fabric', leaf, 0.3));
}

export function floorLamp(b: Builder, x: number, z: number, col = 0xffd9a8): void {
  b.cyl(x, 0, z, 0.15, 0.03, S('metal', 0x2a2d33), false, 14);
  b.cyl(x, 0.03, z, 0.015, 1.5, S('metal', 0x2a2d33), false, 6);
  b.cyl(x, 1.4, z, 0.22, 0.3, S('fabric', 0xf2e6d0, 0.3), false, 16, 0.14);
  b.glow(x, 1.42, z, 0.2, 0.02, 0.2, col, 1.6);
  b.light(x, 1.5, z, col, 0.7, 3, false);
}

export function rug(b: Builder, x: number, z: number, w: number, d: number, col: number): void {
  b.box(x, 0, z, w, 0.012, d, S('carpet', col, 0.6), false, false);
  b.box(x, 0, z, w - 0.2, 0.014, d - 0.2, S('carpet', b.pick(FABRIC), 0.5), false, false);
}

// ------------------------------------------------------------------------------------------------ bedroom & bath

export function bed(b: Builder, x: number, z: number, f: Face, w = 1.6, col = 0xe8e4dc): void {
  const wd = S('wood', b.pick(WOOD), 1);
  part(b, f, x, z, 0, 0, 0, w + 0.1, 0.32, 2.1, wd, true);
  part(b, f, x, z, 0, 0.02, 0.32, w, 0.22, 2.0, S('fabric', 0xf4f2ee, 0.4));
  part(b, f, x, z, 0, 0.25, 0.5, w + 0.04, 0.08, 1.45, S('fabric', col, 0.5));
  part(b, f, x, z, 0, -1.06, 0, w + 0.14, 1.05, 0.08, wd, true);
  const n = w > 1.2 ? 2 : 1;
  for (let i = 0; i < n; i++) part(b, f, x, z, n === 1 ? 0 : (i - 0.5) * (w / 2), -0.75, 0.54, w / n - 0.14, 0.14, 0.42, S('fabric', 0xfafafa, 0.3), false, false);
}

export function nightstand(b: Builder, x: number, z: number, lamp = true): void {
  const wd = S('wood', b.pick(WOOD), 1);
  b.box(x, 0, z, 0.45, 0.55, 0.4, wd, true);
  if (lamp) {
    b.cyl(x, 0.55, z, 0.06, 0.25, S('plain', 0xd8d0c0), false, 10);
    b.cyl(x, 0.78, z, 0.15, 0.2, S('fabric', 0xf2e6d0, 0.3), false, 14, 0.1);
    b.glow(x, 0.8, z, 0.12, 0.02, 0.12, 0xffd9a8, 1.4);
    b.light(x, 0.9, z, 0xffd9a8, 0.45, 2.2, false);
  }
}

export function wardrobe(b: Builder, x: number, z: number, f: Face, w = 1.4): void {
  const wd = S('wood', b.pick(WOOD), 1);
  part(b, f, x, z, 0, 0, 0, w, 2.1, 0.6, wd, true);
  part(b, f, x, z, 0, 0.305, 0.05, 0.01, 2.0, 0.01, S('plain', 0x2a1e14), false, false);
  for (const s of [-1, 1]) part(b, f, x, z, s * 0.08, 0.32, 1.0, 0.02, 0.25, 0.03, S('metal', 0xc8c0b0), false, false);
}

export function dresser(b: Builder, x: number, z: number, f: Face): void {
  const wd = S('wood', b.pick(WOOD), 1);
  part(b, f, x, z, 0, 0, 0, 1.2, 0.85, 0.48, wd, true);
  for (let i = 0; i < 3; i++) part(b, f, x, z, 0, 0.245, 0.12 + i * 0.25, 1.1, 0.2, 0.01, S('wood', 0x5a3e28, 1), false, false);
  part(b, f, x, z, 0, -0.18, 0.85, 0.8, 0.7, 0.03, S('plain', 0xb8c8d0), false, false); // mirror
}

export function toilet(b: Builder, x: number, z: number, f: Face): void {
  const pc = S('plain', 0xf6f6f2);
  part(b, f, x, z, 0, -0.28, 0, 0.38, 0.8, 0.18, pc, true);
  const [cx, cz] = loc(f, x, z, 0, 0.02);
  b.cyl(cx, 0, cz, 0.2, 0.4, pc, true, 14, 0.18);
  b.cyl(cx, 0.4, cz, 0.21, 0.03, pc, false, 14);
}

export function basin(b: Builder, x: number, z: number, f: Face): void {
  part(b, f, x, z, 0, 0, 0, 0.6, 0.82, 0.45, S('wood', 0xe8e4dc, 1), true);
  part(b, f, x, z, 0, 0, 0.82, 0.62, 0.06, 0.47, S('marble', 0xf4f2ee, 0.8));
  part(b, f, x, z, 0, 0.02, 0.86, 0.4, 0.02, 0.28, S('plain', 0xd8dde2), false, false);
  part(b, f, x, z, 0, -0.2, 0.88, 0.04, 0.18, 0.04, S('metal', 0xc8ccd0), false, false);
  part(b, f, x, z, 0, -0.22, 1.2, 0.6, 0.75, 0.02, S('plain', 0xb8c8d0), false, false); // mirror
}

export function bathtub(b: Builder, x: number, z: number, along: 'x' | 'z'): void {
  const w = along === 'x' ? 1.7 : 0.78, d = along === 'x' ? 0.78 : 1.7;
  b.box(x, 0, z, w, 0.56, d, S('tile', 0xf4f4f0, 0.3), true);
  b.box(x, 0.5, z, w - 0.16, 0.07, d - 0.16, S('plain', 0xa8c8d8), false, false);
}

export function shower(b: Builder, x: number, z: number): void {
  b.box(x, 0, z, 0.95, 0.08, 0.95, S('tile', 0xe8eef0, 0.3));
  b.box(x + 0.47, 0.08, z, 0.02, 2.0, 0.95, S('plain', 0xc8dde6), true, false);
  b.box(x, 0.08, z + 0.47, 0.95, 2.0, 0.02, S('plain', 0xc8dde6), true, false);
  b.cyl(x - 0.35, 1.95, z - 0.35, 0.08, 0.03, S('metal', 0xc8ccd0), false, 10);
}

// ------------------------------------------------------------------------------------------------ kitchen

/** A run of base cabinets with worktop, sink and hob, wall cabinets above; the front faces `f`. */
export function kitchen(b: Builder, x: number, z: number, f: Face, len: number, col = b.pick([0xe8e4dc, 0x6a7a6a, 0x2a3a4a, 0xc4a882])): void {
  const cab = S('panel', col, 1.2);
  part(b, f, x, z, 0, 0, 0, len, 0.88, 0.6, S('plain', col), true);
  for (let a = -len / 2 + 0.3; a < len / 2 - 0.1; a += 0.6) part(b, f, x, z, a, 0.305, 0.1, 0.56, 0.7, 0.01, cab, false, false);
  part(b, f, x, z, 0, 0.02, 0.88, len + 0.02, 0.04, 0.64, S('marble', b.pick([0x3a3a3a, 0xf2f0ea, 0x8a7a6a]), 0.7));
  part(b, f, x, z, -len / 4, 0.05, 0.9, 0.55, 0.02, 0.4, S('metal', 0xb8bcc0), false, false);
  part(b, f, x, z, -len / 4, -0.2, 0.92, 0.03, 0.28, 0.03, S('metal', 0xc8ccd0), false, false);
  part(b, f, x, z, len / 4, 0.02, 0.92, 0.6, 0.015, 0.5, S('plain', 0x101214), false, false);
  for (const [a, c] of [[-0.14, -0.12], [0.14, -0.12], [-0.14, 0.12], [0.14, 0.12]] as const) part(b, f, x, z, len / 4 + a, c + 0.02, 0.935, 0.18, 0.005, 0.18, S('plain', 0x2a2a2a), false, false);
  part(b, f, x, z, 0, -0.12, 1.5, len, 0.7, 0.35, S('plain', col), true);
  part(b, f, x, z, 0, -0.29, 0.92, len, 0.58, 0.02, S('tile', 0xf2f2ee, 0.25), false, false); // splashback
  part(b, f, x, z, len / 4, -0.15, 1.48, 0.6, 0.02, 0.3, S('metal', 0x9aa0a8), false, false); // hood
}

export function fridge(b: Builder, x: number, z: number, f: Face): void {
  part(b, f, x, z, 0, 0, 0, 0.72, 1.85, 0.7, S('metal', b.pick([0xe8e8e8, 0xb8bcc0, 0x2a2d33])), true);
  part(b, f, x, z, 0, 0.355, 1.2, 0.7, 0.01, 0.01, S('plain', 0x202020), false, false);
  part(b, f, x, z, 0.28, 0.37, 0.7, 0.03, 0.9, 0.03, S('metal', 0x8a8f96), false, false);
}

// ------------------------------------------------------------------------------------------------ shops

/** A gondola of shelves stocked with colourful packets, running along `axis`. */
export function aisle(b: Builder, x: number, z: number, len: number, axis: 'x' | 'z', h = 1.6, stock: number[] = [0xd83a2a, 0xf2c43a, 0x2a7ad8, 0x3ab84a, 0xf28a2a, 0xe8e0d0, 0x8a3ad8, 0x2ad8c4]): void {
  const w = axis === 'x' ? len : 0.9, d = axis === 'x' ? 0.9 : len;
  b.box(x, 0, z, axis === 'x' ? len : 0.12, h, axis === 'x' ? 0.12 : len, S('metal', 0xd8dade));
  b.box(x, 0, z, w, 0.1, d, S('metal', 0x8a8e94), false, false);
  b.solids.push({ cx: x, cy: h / 2, cz: z, hx: w / 2, hy: h / 2, hz: d / 2 });
  for (let row = 0; row < 4; row++) {
    const y = 0.12 + row * (h - 0.2) / 4;
    for (const side of [-1, 1]) {
      const off = side * 0.24;
      b.box(axis === 'x' ? x : x + off, y, axis === 'x' ? z + off : z, axis === 'x' ? len : 0.42, 0.03, axis === 'x' ? 0.42 : len, S('metal', 0xc8cace), false, false);
      let p = -len / 2 + 0.06;
      while (p < len / 2 - 0.08) {
        const pw = b.range(0.08, 0.2), ph = b.range(0.12, (h - 0.2) / 4 - 0.05);
        const c = b.pick(stock);
        const px = axis === 'x' ? x + p + pw / 2 : x + off + side * 0.02;
        const pz = axis === 'x' ? z + off + side * 0.02 : z + p + pw / 2;
        b.box(px, y + 0.03, pz, axis === 'x' ? pw - 0.01 : 0.3, ph, axis === 'x' ? 0.3 : pw - 0.01, S('plain', c), false, false);
        p += pw;
      }
    }
  }
}

/** Glass-fronted drinks fridges along a wall; the doors face `f`. */
export function cooler(b: Builder, x: number, z: number, f: Face, len: number): void {
  part(b, f, x, z, 0, 0, 0, len, 2.1, 0.75, S('metal', 0x2a2d33), true);
  const n = Math.max(1, Math.round(len / 0.75));
  for (let i = 0; i < n; i++) {
    const a = -len / 2 + (i + 0.5) * (len / n);
    glowPart(b, f, x, z, a, 0.38, 0.12, len / n - 0.08, 1.8, 0.02, 0xe8f4ff, 0.9);
    for (let row = 0; row < 5; row++) {
      for (let k = 0; k < 4; k++) part(b, f, x, z, a - len / n / 2 + 0.12 + k * (len / n - 0.16) / 3.5, 0.2, 0.18 + row * 0.36, 0.07, 0.24, 0.07, S('plain', b.pick([0xd83a2a, 0x2a7ad8, 0x3ab84a, 0xf2c43a, 0x2a2a2a, 0xe8e8e8])), false, false);
    }
    part(b, f, x, z, a + len / n / 2 - 0.08, 0.4, 0.9, 0.025, 0.5, 0.04, S('metal', 0xb8bcc0), false, false);
  }
  const [lx, lz] = loc(f, x, z, 0, 1.0);
  b.light(lx, 1.2, lz, 0xe0f0ff, 0.5, 3, false);
}

/** Shop counter with a till; the customer side faces `f`. */
export function counter(b: Builder, x: number, z: number, f: Face, len: number, surf = S('wood', 0x6b4a30, 1), till = true): void {
  part(b, f, x, z, 0, 0, 0, len, 1.0, 0.65, surf, true);
  part(b, f, x, z, 0, 0, 1.0, len + 0.06, 0.05, 0.72, S('marble', 0x3a3a3a, 0.8));
  if (till) {
    part(b, f, x, z, -len / 4, -0.05, 1.05, 0.4, 0.12, 0.35, S('plain', 0x2a2d33));
    part(b, f, x, z, -len / 4, -0.12, 1.17, 0.3, 0.2, 0.05, S('plain', 0x1a1c20));
    glowPart(b, f, x, z, -len / 4, -0.1, 1.2, 0.26, 0.14, 0.02, 0x4aff9a, 0.7);
  }
}

export function clothesRack(b: Builder, x: number, z: number, axis: 'x' | 'z', len = 1.6): void {
  const m = S('metal', 0xb8bcc0);
  for (const s of [-1, 1]) {
    const px = axis === 'x' ? x + s * len / 2 : x, pz = axis === 'x' ? z : z + s * len / 2;
    b.cyl(px, 0, pz, 0.02, 1.5, m, false, 6);
    b.cyl(px, 0, pz, 0.18, 0.02, m, false, 10);
  }
  b.box(x, 1.48, z, axis === 'x' ? len : 0.03, 0.03, axis === 'x' ? 0.03 : len, m, false, false);
  const pal = [0x2a3a5a, 0x8a2a2a, 0xe8e4dc, 0x3a5a3a, 0x1a1a1a, 0xc4a24a, 0x6a6a72, 0xd88aa8];
  const col = b.pick(pal);
  for (let p = -len / 2 + 0.1; p < len / 2 - 0.05; p += 0.07) {
    const hang = b.range(0.7, 0.95);
    b.box(axis === 'x' ? x + p : x, 1.46 - hang, axis === 'x' ? z : z + p, axis === 'x' ? 0.035 : 0.5, hang, axis === 'x' ? 0.5 : 0.035, S('fabric', b.r() < 0.7 ? col : b.pick(pal), 0.3), false, false);
  }
  b.solids.push({ cx: x, cy: 0.75, cz: z, hx: axis === 'x' ? len / 2 : 0.3, hy: 0.75, hz: axis === 'x' ? 0.3 : len / 2 });
}

export function mannequin(b: Builder, x: number, z: number, col: number): void {
  b.cyl(x, 0, z, 0.2, 0.03, S('metal', 0x2a2d33), false, 12);
  b.cyl(x, 0.03, z, 0.02, 0.85, S('metal', 0x8a8f96), false, 6);
  b.cyl(x, 0.88, z, 0.16, 0.6, S('fabric', col, 0.3), true, 12, 0.2);
  b.ball(x, 1.62, z, 0.11, S('plain', 0xe8e4dc), 1.2);
}

export function barberChair(b: Builder, x: number, z: number, f: Face): void {
  const lea = S('leather', 0x8a1a1a, 0.4);
  b.cyl(x, 0, z, 0.28, 0.05, S('metal', 0xc8ccd0), false, 16);
  b.cyl(x, 0.05, z, 0.07, 0.38, S('metal', 0xc8ccd0), false, 10);
  part(b, f, x, z, 0, 0, 0.43, 0.6, 0.14, 0.6, lea, true);
  part(b, f, x, z, 0, -0.27, 0.57, 0.56, 0.7, 0.1, lea);
  for (const s of [-1, 1]) part(b, f, x, z, s * 0.31, 0.02, 0.6, 0.06, 0.06, 0.5, S('metal', 0xc8ccd0), false, false);
  part(b, f, x, z, 0, 0.5, 0.12, 0.36, 0.03, 0.18, S('metal', 0xc8ccd0), false, false);
}

/** Wall of guns: dark silhouettes on a pegboard. */
export function gunWall(b: Builder, x: number, z: number, f: Face, len: number): void {
  part(b, f, x, z, 0, 0, 0.9, len, 1.6, 0.05, S('fabric', 0xd8ccb4, 0.2));
  for (let row = 0; row < 4; row++) {
    for (let a = -len / 2 + 0.5; a < len / 2 - 0.4; a += 0.9) {
      const long = row < 2;
      const gl = long ? b.range(0.75, 1.0) : 0.3;
      part(b, f, x, z, a + (long ? 0 : b.range(-0.2, 0.2)), 0.05, 1.05 + row * 0.36, gl, 0.07, 0.04, S('metal', 0x1a1c20), false, false);
      if (long) { part(b, f, x, z, a - gl / 2 + 0.1, 0.05, 0.98 + row * 0.36, 0.18, 0.1, 0.04, S('wood', 0x5a3e28), false, false); part(b, f, x, z, a + 0.05, 0.05, 0.96 + row * 0.36, 0.05, 0.1, 0.04, S('metal', 0x1a1c20), false, false); }
      else part(b, f, x, z, a - 0.08, 0.05, 0.96 + row * 0.36, 0.05, 0.12, 0.04, S('metal', 0x1a1c20), false, false);
    }
  }
}

/** Glass display counter (jewellery, guns): lit inside. */
export function display(b: Builder, x: number, z: number, f: Face, len: number, goods: number[] = [0xe6c84a, 0xd8dde6, 0x9ad7ff]): void {
  part(b, f, x, z, 0, 0, 0, len, 0.7, 0.6, S('wood', 0x3a2a1c, 1), true);
  glowPart(b, f, x, z, 0, 0, 0.7, len, 0.02, 0.6, 0xf2f6ff, 0.8);
  part(b, f, x, z, 0, 0, 1.0, len, 0.02, 0.6, S('plain', 0xb8d8e8), false, false);
  for (let a = -len / 2 + 0.15; a < len / 2 - 0.1; a += 0.22) part(b, f, x, z, a, b.range(-0.15, 0.15), 0.72, 0.08, 0.04, 0.06, S('metal', b.pick(goods)), false, false);
  for (const s of [-1, 1]) part(b, f, x, z, s * (len / 2 - 0.01), 0, 0.72, 0.02, 0.28, 0.6, S('metal', 0xc8ccd0), false, false);
}

// ------------------------------------------------------------------------------------------------ food & drink

export function booth(b: Builder, x: number, z: number, f: Face, col = 0x8a1a1a): void {
  const lea = S('leather', col, 0.4);
  for (const s of [-1, 1]) {
    part(b, f, x, z, 0, s * 0.75, 0, 1.3, 0.45, 0.5, lea, true);
    part(b, f, x, z, 0, s * 0.98, 0.45, 1.3, 0.6, 0.12, lea);
  }
  part(b, f, x, z, 0, 0, 0.72, 1.2, 0.04, 0.75, S('marble', 0xe8e4dc, 0.7), true);
  part(b, f, x, z, 0, 0, 0, 0.1, 0.72, 0.1, S('metal', 0x9aa0a8), false, false);
  part(b, f, x, z, 0.4, 0.1, 0.76, 0.06, 0.12, 0.06, S('plain', 0xd83a2a), false, false);
  part(b, f, x, z, 0.3, 0.1, 0.76, 0.05, 0.1, 0.05, S('plain', 0xf2c43a), false, false);
}

/** The back bar: bottles on lit glass shelves and a mirror. */
export function backBar(b: Builder, x: number, z: number, f: Face, len: number): void {
  part(b, f, x, z, 0, 0, 0, len, 0.9, 0.45, S('wood', 0x3a2a1c, 1), true);
  part(b, f, x, z, 0, -0.18, 0.9, len, 1.4, 0.04, S('plain', 0x7a8a96));
  for (let row = 0; row < 3; row++) {
    glowPart(b, f, x, z, 0, -0.05, 1.0 + row * 0.42, len, 0.02, 0.22, 0xffc888, 0.8);
    for (let a = -len / 2 + 0.08; a < len / 2 - 0.05; a += b.range(0.08, 0.14)) {
      const [px, pz] = loc(f, x, z, a, -0.05);
      b.cyl(px, 1.02 + row * 0.42, pz, 0.035, b.range(0.2, 0.3), S('plain', b.pick([0x3a6a2a, 0x8a4a1a, 0xe8e0d0, 0x5a2a1a, 0x2a4a6a, 0xc4a24a])), false, 8, 0.02);
    }
  }
  const [lx, lz] = loc(f, x, z, 0, 0.6);
  b.light(lx, 1.6, lz, 0xffb870, 0.8, 3.2, false);
}

export function menuBoard(b: Builder, x: number, y: number, z: number, w: number, face: Face, title: string): void {
  b.sign(title, x, y, z, w, face, '#ffe9a8', '#1a1410');
}

// ------------------------------------------------------------------------------------------------ work & public

export function desk(b: Builder, x: number, z: number, f: Face, monitor = true, w = 1.4): void {
  const top = S('wood', b.pick([0xe8e4dc, 0x8a6040, 0x3a3a3a]), 1);
  part(b, f, x, z, 0, 0, 0.72, w, 0.04, 0.7, top, true);
  for (const s of [-1, 1]) part(b, f, x, z, s * (w / 2 - 0.03), 0, 0, 0.04, 0.72, 0.66, S('metal', 0x3a3d42), false, false);
  if (monitor) {
    part(b, f, x, z, 0, -0.2, 0.76, 0.08, 0.2, 0.08, S('plain', 0x1a1c20), false, false);
    part(b, f, x, z, 0, -0.22, 0.92, 0.6, 0.36, 0.03, S('plain', 0x101214), false, false);
    glowPart(b, f, x, z, 0, -0.205, 0.94, 0.56, 0.32, 0.01, b.pick([0x9ac4ff, 0xe8f0ff, 0x8affc4]), 0.8);
    part(b, f, x, z, 0, 0.1, 0.76, 0.45, 0.02, 0.15, S('plain', 0x2a2d33), false, false);
  }
  const [cx, cz] = loc(f, x, z, 0, 0.6);
  officeChair(b, cx, cz);
}

export function officeChair(b: Builder, x: number, z: number, col = 0x1a1c20): void {
  b.cyl(x, 0, z, 0.3, 0.05, S('metal', 0x2a2d33), false, 5);
  b.cyl(x, 0.05, z, 0.03, 0.38, S('metal', 0x8a8f96), false, 8);
  b.box(x, 0.43, z, 0.5, 0.08, 0.48, S('fabric', col, 0.3));
  b.box(x, 0.55, z + (b.r() < 0.5 ? 0.22 : -0.22), 0.46, 0.55, 0.06, S('fabric', col, 0.3));
}

export function cubicle(b: Builder, x: number, z: number, f: Face): void {
  const pan = S('fabric', b.pick([0x6a7480, 0x8a8478, 0x5a6a72]), 0.5);
  part(b, f, x, z, 0, -0.55, 0, 1.8, 1.3, 0.06, pan, true);
  for (const s of [-1, 1]) part(b, f, x, z, s * 0.9, 0, 0, 0.06, 1.3, 1.1, pan, true);
  desk(b, ...loc(f, x, z, 0, -0.2), f, true, 1.5);
}

export function chairRow(b: Builder, x: number, z: number, f: Face, n: number, col = 0x2a4a7a): void {
  for (let i = 0; i < n; i++) {
    const [cx, cz] = loc(f, x, z, (i - (n - 1) / 2) * 0.55, 0);
    part(b, f, cx, cz, 0, 0, 0.42, 0.5, 0.06, 0.46, S('plain', col));
    part(b, f, cx, cz, 0, -0.21, 0.48, 0.5, 0.42, 0.04, S('plain', col));
  }
  const [a0, a1] = loc(f, x, z, 0, 0);
  part(b, f, a0, a1, 0, 0, 0, n * 0.55, 0.42, 0.4, S('metal', 0x3a3d42), true, false);
}

export function elevator(b: Builder, x: number, z: number, f: Face): void {
  part(b, f, x, z, 0, 0, 0, 1.5, 2.4, 0.06, S('metal', 0xa8acb0), false, false);
  for (const s of [-1, 1]) part(b, f, x, z, s * 0.36, 0.03, 0.02, 0.7, 2.2, 0.02, S('metal', 0xc8ccd0, 0.3), false, false);
  part(b, f, x, z, 0, 0.03, 2.2, 0.02, 0.01, 0.02, S('plain', 0x2a2d33), false, false);
  const [px, pz] = loc(f, x, z, 0.95, 0.04);
  b.box(px, 1.05, pz, f < 2 ? 0.12 : 0.03, 0.22, f < 2 ? 0.03 : 0.12, S('metal', 0x8a8f96), false, false);
  b.glow(px, 1.15, pz, f < 2 ? 0.05 : 0.035, 0.05, f < 2 ? 0.035 : 0.05, 0xffb84a, 1.2);
}

/** A closed apartment / room door on a wall, with a number plate. */
export function doorLeaf(b: Builder, x: number, z: number, f: Face, label: string, col = 0x6b4a30): void {
  part(b, f, x, z, 0, 0, 0, 1.1, 2.25, 0.08, S('plain', 0xe8e4dc), false, false);
  part(b, f, x, z, 0, 0.03, 0, 0.92, 2.15, 0.06, S('panel', col, 2.2), false, false);
  part(b, f, x, z, 0.36, 0.07, 1.0, 0.1, 0.03, 0.04, S('metal', 0xc8b878), false, false);
  const [lx, lz] = loc(f, x, z, 0, 0.065);
  b.sign(label, lx, 1.7, lz, 0.28, f, '#2a2010', '#d8c890');
}

export function mailboxes(b: Builder, x: number, z: number, f: Face, n = 12): void {
  part(b, f, x, z, 0, 0, 0.9, Math.ceil(n / 3) * 0.32, 0.9, 0.12, S('metal', 0xb8a878), true);
  for (let i = 0; i < n; i++) part(b, f, x, z, (Math.floor(i / 3) - (Math.ceil(n / 3) - 1) / 2) * 0.32, 0.065, 0.95 + (i % 3) * 0.29, 0.28, 0.24, 0.01, S('metal', 0x8a7a50), false, false);
}

export function crates(b: Builder, x: number, z: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const s = b.range(0.6, 1.1);
    b.box(x + b.range(-0.6, 0.6), (i % 3) * 0.7, z + b.range(-0.6, 0.6), s, 0.68, s, S('wood', b.pick([0xb89a6a, 0xa8865a, 0x8a6a48]), 0.6), true);
  }
}

/** Steel pallet racking with boxes; runs along `axis`. */
export function palletRack(b: Builder, x: number, z: number, len: number, axis: 'x' | 'z', levels = 3): void {
  const blue = S('metal', 0x2a5aa8), org = S('metal', 0xe86a1a);
  const w = axis === 'x' ? len : 1.1, d = axis === 'x' ? 1.1 : len;
  for (let p = -len / 2; p <= len / 2 + 0.01; p += len / Math.max(1, Math.round(len / 2.7))) for (const s of [-0.5, 0.5]) {
    const px = axis === 'x' ? x + p : x + s, pz = axis === 'x' ? z + s : z + p;
    b.box(px, 0, pz, 0.08, levels * 1.5 + 0.2, 0.08, blue, false, false);
  }
  for (let l = 0; l < levels; l++) {
    b.box(x, 0.1 + l * 1.5, z, w, 0.1, d, org, false, false);
    for (let p = -len / 2 + 0.7; p < len / 2 - 0.4; p += 1.3) {
      if (b.r() < 0.2) continue;
      const px = axis === 'x' ? x + p : x, pz = axis === 'x' ? z : z + p;
      b.box(px, 0.2 + l * 1.5, pz, 1.0, b.range(0.6, 1.1), 1.0, S('wood', b.pick([0xc4a476, 0xb89a6a, 0x8a9a7a, 0xd8d0c0]), 0.6), false, true);
    }
  }
  b.solids.push({ cx: x, cy: levels * 0.75, cz: z, hx: w / 2, hy: levels * 0.75, hz: d / 2 });
}

export function forklift(b: Builder, x: number, z: number, f: Face): void {
  const y = S('metal', 0xe8b81a);
  part(b, f, x, z, 0, 0, 0.2, 1.1, 0.9, 2.0, y, true);
  part(b, f, x, z, 0, -0.5, 1.1, 1.0, 1.1, 0.06, S('metal', 0x2a2d33), false, false);
  for (const s of [-1, 1]) for (const c of [-0.6, 0.6]) { const [wx, wz] = loc(f, x, z, s * 0.5, c); b.cyl(wx, 0, wz, 0.25, 0.25, S('plain', 0x1a1a1a), false, 12); }
  for (const s of [-1, 1]) part(b, f, x, z, s * 0.4, 1.2, 0, 0.1, 2.4, 0.1, S('metal', 0x2a2d33), false, false);
  for (const s of [-1, 1]) part(b, f, x, z, s * 0.3, 1.65, 0.1, 0.12, 0.05, 1.0, S('metal', 0x2a2d33), false, false);
}

export function treadmill(b: Builder, x: number, z: number, f: Face): void {
  part(b, f, x, z, 0, 0, 0, 0.8, 0.22, 1.8, S('plain', 0x2a2d33), true);
  part(b, f, x, z, 0, 0, 0.22, 0.6, 0.01, 1.6, S('fabric', 0x111111, 0.3), false, false);
  for (const s of [-1, 1]) part(b, f, x, z, s * 0.36, -0.75, 0.22, 0.05, 1.1, 0.05, S('metal', 0x8a8f96), false, false);
  part(b, f, x, z, 0, -0.78, 1.3, 0.72, 0.25, 0.1, S('plain', 0x1a1c20), false, false);
  glowPart(b, f, x, z, 0, -0.72, 1.36, 0.3, 0.12, 0.01, 0x4ae0ff, 0.9);
}

export function bench(b: Builder, x: number, z: number, f: Face): void {
  part(b, f, x, z, 0, 0, 0.42, 0.32, 0.08, 1.2, S('leather', 0x1a1a1a, 0.3), true);
  part(b, f, x, z, 0, 0, 0, 0.12, 0.42, 1.0, S('metal', 0x3a3d42), false, false);
  for (const s of [-1, 1]) part(b, f, x, z, s * 0.5, -0.5, 0, 0.05, 1.2, 0.05, S('metal', 0x8a8f96), false, false);
  part(b, f, x, z, 0, -0.5, 1.15, 1.6, 0.04, 0.04, S('metal', 0xc8ccd0), false, false);
  for (const s of [-1, 1]) { const [px, pz] = loc(f, x, z, s * 0.7, -0.5); b.cyl(px, 0.95, pz, 0.22, 0.05, S('metal', 0x1a1a1a), false, 14); }
}

export function reception(b: Builder, x: number, z: number, f: Face, len: number, surf = S('wood', 0x4a3424, 1)): void {
  part(b, f, x, z, 0, 0, 0, len, 1.1, 0.7, surf, true);
  part(b, f, x, z, 0, 0.05, 1.1, len + 0.1, 0.06, 0.6, S('marble', 0xf2f0ea, 0.8));
  part(b, f, x, z, 0, -0.5, 0.72, len - 0.3, 0.04, 0.5, S('wood', 0x3a2a1c, 1));
  part(b, f, x, z, len / 4, -0.55, 0.76, 0.5, 0.32, 0.03, S('plain', 0x101214), false, false);
  part(b, f, x, z, -len / 3, 0.1, 1.16, 0.12, 0.1, 0.12, S('metal', 0xc8b878), false, false); // bell
}

export function fountain(b: Builder, x: number, z: number, r = 2.2): void {
  b.cyl(x, 0, z, r, 0.5, S('marble', 0xe8e4dc, 1), true, 28);
  b.cyl(x, 0.5, z, r - 0.15, 0.02, S('plain', 0x4aa8d8), false, 28);
  b.glow(x, 0.505, z, (r - 0.3) * 1.3, 0.01, (r - 0.3) * 1.3, 0x6ac8ff, 0.5);
  b.cyl(x, 0.5, z, 0.25, 1.2, S('marble', 0xe8e4dc, 1), false, 14);
  b.cyl(x, 1.7, z, 0.6, 0.1, S('marble', 0xe8e4dc, 1), false, 18);
}

export function hospitalBed(b: Builder, x: number, z: number, f: Face): void {
  part(b, f, x, z, 0, 0, 0.5, 0.95, 0.15, 2.0, S('fabric', 0xe8eef2, 0.4), true);
  part(b, f, x, z, 0, 0, 0.2, 0.9, 0.3, 1.9, S('metal', 0xc8ccd0), false, false);
  part(b, f, x, z, 0, -1.0, 0.2, 0.95, 0.9, 0.05, S('metal', 0xc8ccd0), false, false);
  part(b, f, x, z, 0.6, -0.8, 0, 0.05, 1.8, 0.05, S('metal', 0xc8ccd0), false, false);
  part(b, f, x, z, 0.6, -0.8, 1.7, 0.2, 0.3, 0.05, S('plain', 0xd8e8f0), false, false);
}

export function vending(b: Builder, x: number, z: number, f: Face, col = 0xc42a2a): void {
  part(b, f, x, z, 0, 0, 0, 0.9, 1.9, 0.8, S('metal', col), true);
  glowPart(b, f, x, z, -0.12, 0.41, 0.6, 0.55, 1.1, 0.01, 0xf2f6ff, 1);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) part(b, f, x, z, -0.32 + k * 0.13, 0.4, 0.68 + r * 0.26, 0.08, 0.16, 0.04, S('plain', b.pick([0xd83a2a, 0x2a7ad8, 0x3ab84a, 0xf2c43a, 0xe8e8e8])), false, false);
}

export function atm(b: Builder, x: number, z: number, f: Face): void {
  part(b, f, x, z, 0, 0, 0, 0.7, 1.7, 0.6, S('metal', 0x2c3036), true);
  glowPart(b, f, x, z, 0, 0.31, 1.15, 0.36, 0.26, 0.01, 0x39ff88, 0.9);
}

export function pool(b: Builder, x: number, z: number, w: number, d: number): void {
  b.box(x, 0, z, w + 0.6, 0.1, d + 0.6, S('stone', 0xe8e0d0, 0.8), false);
  b.glow(x, 0.08, z, w, 0.03, d, 0x48b8e8, 0.85);
}
