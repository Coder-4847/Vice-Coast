import { GEO } from '../heightfield';
import { PINE_X, PINE_Z } from './layouts';
import { Kit, MODE, PAL, VEG, pick } from './kit';

type Face = 'N' | 'E' | 'S' | 'W';
const YAW: Record<Face, number> = { S: 0, N: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 };

/**
 * Pinecrest Bay: a quiet logging-and-fishing town on the east shore of its bay. A five-by-five street grid with a bank,
 * general store, diner, sheriff's station, church and town square; a marina with slips and boats; a sawmill with log decks
 * at the east end; a lighthouse and keeper's cottage on the northern headland.
 */
export function buildPinecrest(): Kit {
  const k = new Kit('pinecrest', 53);
  const r = k.r;
  const blockC = (i: number, j: number): [number, number] => [(PINE_X[i]! + PINE_X[i + 1]!) / 2, (PINE_Z[j]! + PINE_Z[j + 1]!) / 2];

  const house = (cx: number, cz: number, face: Face, w: number, d: number, h: number, col: number, roofCol = pick(r, PAL.roof), floors = 1): void => {
    const yaw = YAW[face];
    k.building(cx, cz, w, d, h, yaw, col, { roof: 'gable', roofColor: roofCol, mode: MODE.PUNCHED, pitch: 0.55, floors });
    // porch
    const [px, pz] = k.at(cx, cz, yaw, 0, d / 2 + 1.4);
    k.box(px, pz, w * 0.6, 2.4, 0.25, 0x8a6a48, { y0: k.ground(px, pz) + 0.3, ry: -yaw, solid: false });
    for (const u of [-w * 0.27, w * 0.27]) { const [qx, qz] = k.at(cx, cz, yaw, u, d / 2 + 2.4); k.box(qx, qz, 0.18, 0.18, 2.4, 0xefe8da, { y0: k.ground(qx, qz) + 0.5, solid: false }); }
    yard(cx, cz, 15);
    // chimney
    const [ch, cz2] = k.at(cx, cz, yaw, w * 0.3, -d * 0.1);
    k.box(ch, cz2, 0.9, 0.9, h + 1.8, 0x7a4a3a, { solid: false });
  };
  const yard = (cx: number, cz: number, rad: number): void => {
    k.scatter(VEG.PINE, cx, cz, rad, 4, 0.7, 1.1);
    k.scatter(VEG.BROAD, cx, cz, rad, 2, 0.7, 1.0);
    k.scatter(VEG.SCRUB, cx, cz, rad, 4, 0.6, 0.9);
  };
  const houseOn = (i: number, j: number, offX: number, offZ: number, face: Face): void => {
    const [bx, bz] = blockC(i, j);
    house(bx + offX, bz + offZ, face, 9 + r() * 4, 8 + r() * 3, 3.4 + r() * 0.8, pick(r, PAL.paint));
  };

  // ------------------------------------------------------------------------------------------- the blocks
  // west row (facing Shore Road): the waterfront
  {
    const [bx, bz] = blockC(0, 0);
    house(bx - 4, bz, 'W', 12, 9, 3.8, 0xd9c7a8);
    k.box(bx + 14, bz - 14, 5, 5, 3, 0x5a7a8a, { mode: MODE.PUNCHED }); // bait shop
    k.sign(bx - 24, bz + 20, YAW.W, 4.4, 1.8, 3.2, 0x27e6ff);
  }
  {
    const [bx, bz] = blockC(0, 1);
    // Hook & Ladle Diner
    k.building(bx - 6, bz, 22, 10, 4.2, YAW.W, 0xe8e0d0, { door: 'diner', roof: 'shed', roofColor: 0x6a4a3a, mode: MODE.GLASS, pitch: 0.1 });
    k.building(bx + 8, bz + 2, 12, 8, 3.8, YAW.W, 0xcfd6c9, { roof: 'gable', roofColor: 0x6a5a50, mode: MODE.PUNCHED });
    k.sign(bx - 22, bz - 11, YAW.W, 4.0, 3.0, 8, 0xff5a3c);
  }
  {
    const [bx, bz] = blockC(0, 2);
    k.building(bx - 2, bz - 6, 24, 12, 5, YAW.W, 0x7a6a58, { roof: 'gable', roofColor: 0x5a4a45, mode: MODE.METAL, pitch: 0.28 }); // fish market
    for (let i = 0; i < 5; i++) { const x = bx + 16, z = bz - 18 + i * 8; k.box(x, z, 0.2, 0.2, 3.4, 0x6a4a3a); k.box(x, z + 2, 0.2, 5, 0.2, 0x6a4a3a, { y0: k.ground(x, z) + 3.2, solid: false }); } // drying racks
    k.box(bx - 14, bz + 18, 10, 6, 3.2, 0xcfd6c9, { mode: MODE.PUNCHED });
  }
  {
    const [bx, bz] = blockC(0, 3);
    k.building(bx, bz - 4, 26, 16, 8, YAW.W, 0x8a6a48, { roof: 'gable', roofColor: 0x5a4a45, mode: MODE.METAL, pitch: 0.35 }); // boathouse
    k.box(bx - 22, bz - 4, 8, 12, 0.4, 0x6a6a68, { y0: k.ground(bx, bz) + 0.05, solid: false }); // launch pad
    k.box(bx - 4, bz + 20, 8, 3, 2.4, 0xb8c7d6, { ry: 0.3 }); k.box(bx + 6, bz + 22, 7, 2.6, 2.2, 0xc23a2a, { ry: -0.2 }); // boats on trailers
  }
  // main street
  {
    const [bx, bz] = blockC(1, 1);
    k.building(bx, bz, 26, 18, 8.4, YAW.W, 0xcfc4a8, { door: 'store', roof: 'flat', mode: MODE.PUNCHED, floors: 2 }); // Larkin's Mercantile
    const [px, pz] = k.at(bx, bz, YAW.W, 0, 11);
    k.box(px, pz, 26, 3.4, 0.25, 0x7a5a3a, { y0: k.ground(px, pz) + 3.2, ry: -YAW.W, solid: false });
    for (const u of [-11, -4, 4, 11]) { const [qx, qz] = k.at(bx, bz, YAW.W, u, 12.6); k.box(qx, qz, 0.25, 0.25, 3.3, 0x5a4230, { solid: false }); }
    k.sign(bx - 14, bz, YAW.W, 6, 1.6, 6.2, 0xffb02e);
  }
  {
    const [bx, bz] = blockC(1, 2);
    // Pinecrest Savings & Loan: stone, columns, a clock
    k.building(bx, bz, 22, 16, 9, YAW.W, 0xb9b2a6, { door: 'office', roof: 'flat', mode: MODE.PUNCHED });
    for (let i = 0; i < 4; i++) { const [px, pz] = k.at(bx, bz, YAW.W, -7.5 + i * 5, 10.4); k.cyl(px, pz, 1.0, 7.2, 0xe8e2d4, { solid: true }); }
    const [rx, rz] = k.at(bx, bz, YAW.W, 0, 10);
    k.box(rx, rz, 22, 4.6, 0.8, 0xcfc9bb, { y0: k.ground(rx, rz) + 7.4, ry: -YAW.W, solid: false });
    const [tx, tz] = k.at(bx, bz, YAW.W, 0, 6);
    k.box(tx, tz, 4, 3, 5, 0xb9b2a6, { y0: k.ground(tx, tz) + 9.4, ry: -YAW.W, solid: false });
    k.box(tx - 0.3, tz, 2.4, 0.2, 2.4, 0xf4f0e0, { y0: k.ground(tx, tz) + 10.4, ry: -YAW.W, mode: MODE.GLOW, solid: false });
    k.sign(bx - 14, bz - 12, YAW.W, 4, 1.4, 3.6, 0x4a7a5a);
  }
  {
    const [bx, bz] = blockC(1, 3);
    k.building(bx, bz, 20, 12, 5.6, YAW.W, 0xd9c7a8, { roof: 'gable', roofColor: 0x6a4a3a, mode: MODE.PUNCHED, pitch: 0.4 }); // community hall
    k.box(bx - 8, bz + 18, 14, 8, 0.2, 0x7a7568, { solid: false });
  }
  // sheriff's station
  {
    const [bx, bz] = blockC(2, 1);
    k.building(bx, bz, 24, 15, 5.6, YAW.E, 0x9a5a48, { roof: 'hip', roofColor: 0x5a4a45, mode: MODE.PUNCHED });
    k.building(bx + 14, bz - 10, 8, 8, 4, YAW.E, 0x8a4a3a, { door: 'police', roof: 'flat', mode: MODE.WALL }); // the jail annex
    const [fx, fz] = k.at(bx, bz, YAW.E, 9, 10);
    k.cyl(fx, fz, 0.18, 9, 0xe8e8e4); k.box(fx, fz + 0.9, 0.05, 1.8, 1.1, 0xc23a2a, { y0: k.ground(fx, fz) + 7.6, solid: false });
    for (let i = 0; i < 2; i++) { const [cx, cz] = k.at(bx, bz, YAW.E, -6 + i * 6, 16); k.box(cx, cz, 5, 2.0, 1.5, i ? 0x1a1a1a : 0xf0f0f0, { ry: -YAW.E }); k.box(cx, cz, 2.2, 1.9, 0.3, i ? 0xc23a2a : 0x2f6bb8, { y0: k.ground(cx, cz) + 1.5, ry: -YAW.E, mode: MODE.GLOW, solid: false }); }
    k.sign(bx + 20, bz + 6, YAW.E, 4.4, 1.6, 3.6, 0x2f6bb8);
  }
  // the town square
  {
    const [bx, bz] = blockC(2, 2);
    k.box(bx, bz, 62, 50, 0.12, 0x8a8a7e, { solid: false });
    // gazebo
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.cyl(bx + Math.cos(a) * 3.2, bz + Math.sin(a) * 3.2, 0.3, 3.4, 0xefe8da); }
    k.cyl(bx, bz, 8.4, 0.5, 0x6a4a3a, { y0: k.ground(bx, bz) + 3.4, solid: false });
    k.cyl(bx, bz, 5, 1.1, 0x5a3a2c, { y0: k.ground(bx, bz) + 3.9, solid: false });
    k.cyl(bx, bz, 2, 1.0, 0x5a3a2c, { y0: k.ground(bx, bz) + 5.0, solid: false });
    k.cyl(bx, bz, 7, 0.15, 0x8a6a48, { y0: k.ground(bx, bz) + 0.1, solid: false });
    // war memorial and benches
    k.box(bx + 18, bz, 1.6, 1.6, 5, 0x9a968c); k.box(bx + 18, bz, 2.6, 2.6, 0.8, 0x7a766c);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; k.box(bx + Math.cos(a) * 12, bz + Math.sin(a) * 12, 2, 0.6, 0.5, 0x6e5238, { ry: -a }); }
    k.scatter(VEG.BROAD, bx, bz, 22, 8, 0.9, 1.3); k.scatter(VEG.PINE, bx, bz, 24, 4, 0.8, 1.1);
    for (let i = 0; i < 3; i++) k.lamp(bx - 24 + i * 24, bz - 24, 0);
  }
  {
    const [bx, bz] = blockC(2, 3);
    // St. Brendan's, with a steeple
    k.building(bx, bz, 12, 22, 7, YAW.E, PAL.white, { door: 'look', roof: 'gable', roofColor: 0x5a4a45, mode: MODE.PUNCHED, pitch: 0.7 });
    const [tx, tz] = k.at(bx, bz, YAW.E, 0, 12);
    k.box(tx, tz, 5, 5, 12, PAL.white);
    k.box(tx, tz, 5.8, 5.8, 1, 0x5a4a45, { y0: k.ground(tx, tz) + 12, solid: false });
    k.box(tx, tz, 3.6, 3.6, 5, 0x5a4a45, { y0: k.ground(tx, tz) + 13, ry: Math.PI / 4, solid: false, mode: MODE.WALL });
    k.box(tx, tz, 0.15, 0.15, 3, 0xcfcfcf, { y0: k.ground(tx, tz) + 18, solid: false });
    k.cyl(bx + 20, bz, 8, 0.2, 0x4a4a42, { solid: false });
    k.scatter(VEG.PINE, bx, bz, 26, 6, 0.9, 1.2);
  }
  // east blocks: homes, an inn and the lumber yard
  houseOn(1, 0, -4, 6, 'W'); houseOn(1, 0, 18, -10, 'E'); houseOn(2, 0, -8, 0, 'E'); houseOn(2, 0, 18, 8, 'W'); houseOn(3, 0, -10, 5, 'E'); houseOn(3, 0, 16, -5, 'W');
  houseOn(1, 0, 4, -16, 'E'); houseOn(2, 0, 2, 17, 'W'); houseOn(3, 0, 2, 17, 'E'); houseOn(1, 3, 20, -14, 'W'); houseOn(3, 3, 2, 22, 'W'); houseOn(2, 3, -18, -12, 'E'); houseOn(0, 0, 8, 22, 'W');
  houseOn(3, 3, -8, -8, 'E'); houseOn(3, 3, 16, 10, 'W'); houseOn(2, 3, 18, 4, 'W');
  {
    const [bx, bz] = blockC(3, 1);
    k.building(bx, bz, 30, 14, 8, YAW.E, 0x7a5a3a, { door: 'hotel', roof: 'gable', roofColor: 0x4a5a4a, mode: MODE.PUNCHED, pitch: 0.42, floors: 2 }); // Timberline Inn
    const [px, pz] = k.at(bx, bz, YAW.E, 0, 8.4);
    k.box(px, pz, 30, 3, 0.3, 0x6a4a2a, { y0: k.ground(px, pz) + 3.4, ry: -YAW.E, solid: false });
    k.sign(bx + 18, bz + 14, YAW.E, 5, 2.2, 5, 0x39ff88);
  }
  {
    const [bx, bz] = blockC(3, 2);
    k.building(bx - 12, bz, 22, 14, 5.2, YAW.E, 0xb8a888, { roof: 'shed', roofColor: 0x6a7178, mode: MODE.METAL, pitch: 0.12 }); // feed & hardware
    for (let s = 0; s < 6; s++) k.box(bx + 10 + (s % 3) * 5.2, bz - 14 + Math.floor(s / 3) * 6, 4.8, 5.2, 1.4 + (s % 2) * 0.8, pick(r, PAL.wood)); // stacked lumber
    for (let s = 0; s < 3; s++) k.pipe(bx + 14, k.ground(bx, bz) + 0.4 + s * 0.9, bz + 14, 0.8, 8, 0x5a4230, 0, MODE.WALL, false);
  }

  // --------------------------------------------------------------------------------------------- the marina
  {
    const x0 = 548, len = 74;
    for (const z of [-2380, -2330, -2280]) {
      k.box(x0 - len / 2, z, len, 3.2, 0.4, 0x7a5a3a, { y0: 1.7, solid: true });
      for (let i = 0; i < 9; i++) k.cyl(x0 - i * 9, z + 1.4, 0.5, 2.6, 0x4a3a2a, { y0: -0.5, solid: false });
      for (let i = 0; i < 4; i++) {
        const bx = x0 - 14 - i * 17, bz = z + (i % 2 ? 6 : -6);
        const col = pick(r, [0xf0ede6, 0xc23a2a, 0x2f6bb8, 0x3a6a4a, 0xc9a227]);
        k.box(bx, bz, 9 + r() * 4, 3.0, 1.6, col, { y0: -0.5, mode: MODE.METAL });
        k.box(bx + 1, bz, 3.4, 2.4, 1.8, 0xf0ede6, { y0: 1.1, mode: MODE.PUNCHED, solid: false });
        k.box(bx + 1, bz, 0.12, 0.12, 6, 0xcfcfcf, { y0: 2.9, solid: false });
      }
    }
    k.box(x0 - 2, -2305, 4, 100, 0.4, 0x7a5a3a, { y0: 1.7 }); // the connecting walkway
    k.building(556, -2395, 9, 7, 3.6, 0, 0xcf3a2a, { roof: 'gable', roofColor: 0x4a4a4a, mode: MODE.PUNCHED }); // harbourmaster
    k.cyl(550, -2255, 1.2, 1.6, 0x888888); k.box(550, -2255, 1.6, 0.6, 0.6, 0xe0702a, { y0: 1.6, solid: false }); // fuel dock pump
  }

  // ------------------------------------------------------------------------------------------- the sawmill
  {
    const cx = 960, cz = -2255;
    k.building(cx, cz, 44, 24, 13, 0, 0x7a7a72, { roof: 'gable', roofColor: 0x5a6068, mode: MODE.METAL, pitch: 0.2 });
    k.building(cx + 40, cz - 20, 20, 14, 9, 0, 0x8a7a68, { roof: 'shed', roofColor: 0x5a6068, mode: MODE.METAL, pitch: 0.15 });
    // conveyor and the silo
    k.box(cx - 40, cz, 28, 1.6, 0.8, 0x4a4a46, { y0: 6, rz: 0.3, solid: false });
    k.cyl(cx + 30, cz + 10, 8, 18, 0x9a9a92); k.cyl(cx + 30, cz + 10, 4, 3, 0x7a7a72, { y0: k.ground(cx, cz) + 18, solid: false });
    k.cyl(cx + 54, cz + 12, 12, 16, 0x4a4a46); k.cyl(cx + 54, cz + 12, 7, 6, 0x5a5a52, { y0: k.ground(cx, cz) + 16, solid: false }); // the burner
    // the log deck: stacked pine logs
    for (let row = 0; row < 3; row++) {
      for (let n = 0; n < 14 - row * 3; n++) k.pipe(cx - 46 + n * 1.0, 0.9 + row * 0.9 + k.ground(cx, cz + 22), cz + 22 + row * 0.0 - 12, 1.0, 10, 0x6a4a2e, 1.57, MODE.WALL, false);
    }
    for (let i = 0; i < 4; i++) {
      for (let n = 0; n < 9; n++) { const lx = cx - 30 + i * 2.6, lz = cz + 26 + n * 1.05; k.pipe(lx, k.ground(lx, lz) + 0.8, lz, 1.1, 9, 0x6e4e30, 0, MODE.WALL, false); }
    }
    k.box(cx - 30 + 3.9, cz + 30, 11, 10, 1.4, 0x6a4a2e, { solid: true });
    // trucks
    for (let i = 0; i < 3; i++) { const tx = cx - 20 + i * 9, tz = cz - 28; k.box(tx, tz, 3, 9, 3.2, pick(r, [0xc23a2a, 0x2f6bb8, 0xc9a227])); k.box(tx, tz + 7, 2.8, 2.4, 2.4, 0xe8e0d0, { solid: false }); }
    k.scatter(VEG.SCRUB, cx, cz, 50, 14, 0.6, 1.2);
    k.sign(cx - 50, cz + 40, 0, 6, 2.2, 4, 0x8a5a2a, MODE.WALL);
  }

  // ------------------------------------------------------------------------------------------ the lighthouse
  {
    const lx = GEO.pinecrest.lighthouse.x, lz = GEO.pinecrest.lighthouse.z;
    const y = k.ground(lx, lz);
    const bands = [0xf4f0e8, 0xc23a2a, 0xf4f0e8, 0xc23a2a, 0xf4f0e8];
    bands.forEach((c, i) => k.cyl(lx, lz, 8.4 - i * 0.7, 6, c, { y0: y + i * 6 }));
    k.cyl(lx, lz, 7.4, 0.5, 0x2a2d32, { y0: y + 30, solid: false });
    k.cyl(lx, lz, 4.2, 4, 0xfff0c0, { y0: y + 30.5, mode: MODE.GLOW, solid: false });
    k.cyl(lx, lz, 5.2, 0.6, 0x2a2d32, { y0: y + 34.5, solid: false });
    k.cyl(lx, lz, 3.6, 1.4, 0xc23a2a, { y0: y + 35.1, solid: false });
    k.cyl(lx, lz, 0.5, 2.5, 0x2a2d32, { y0: y + 36.5, solid: false });
    k.building(lx + 22, lz + 10, 13, 9, 3.8, 0, 0xf0ede6, { roof: 'hip', roofColor: 0x8a4b38, mode: MODE.PUNCHED }); // keeper's cottage
    k.fence(lx + 8, lz + 24, lx + 40, lz + 24, 1.2, 0xe8e8e0, 2.5, false);
    k.scatter(VEG.SCRUB, lx, lz, 36, 10, 0.7, 1.1);
    k.scatter(VEG.ROCK, lx - 10, lz - 8, 24, 8, 1.2, 2.4);
  }
  return k;
}
