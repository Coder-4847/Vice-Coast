import { Kit, MODE, PAL, pick } from '../world/towns/kit';
import { terrainHeight } from '../world/Terrain';
import { GEO } from '../world/heightfield';
import type { Point } from './Points';

const COLORS: Record<string, number> = { clothing: 0x4aa8ff, barber: 0xff5a8a, weapons: 0xff7a59, showroom: 0xff8a5c, tuning: 0xffb02e, food: 0xffcf40, property: 0xffd166, atm: 0x39ff88 };

/**
 * The little buildings behind the entrances: an ATM kiosk, a shop front, a house, a hangar. Inside Port Valeria the
 * existing buildings are the shop fronts, so there it is only a sign post.
 */
export function buildShopFronts(points: Point[], inCity: (x: number, z: number) => boolean): Kit {
  const k = new Kit('shop-fronts', 303);
  const r = k.r;
  for (const p of points) {
    const g = terrainHeight(p.x, p.z);
    const c = COLORS[p.kind] ?? 0xffffff;
    if (p.kind === 'atm') {
      k.box(p.x, p.z - 1.0, 1.0, 0.7, 2.0, 0x2c3036);
      k.box(p.x, p.z - 0.62, 0.6, 0.05, 0.5, 0x39ff88, { y0: g + 1.25, mode: MODE.GLOW, solid: false });
      k.box(p.x, p.z - 1.0, 1.1, 0.8, 0.12, c, { y0: g + 2.0, mode: MODE.NEON, solid: false });
      continue;
    }
    const city = inCity(p.x, p.z);
    if (city) {
      k.sign(p.x + 1.6, p.z + 0.4, 0, 2.2, 0.8, 2.8, c);
      continue;
    }
    p.built = true;
    const wall = pick(r, PAL.paint);
    const front = (w: number, d: number, h: number): void => { k.box(p.x, p.z - 1.8 - d / 2 + d / 2, w * 0.7, 0.2, 0.5, c, { y0: g + h - 0.9, mode: MODE.NEON, solid: false }); };
    const bx = p.x;
    if (p.kind === 'property') {
      const id = p.ref;
      if (id === 'hangar') {
        const A = GEO.airport;
        k.hangar(bx, p.z - 12, 24, 10, Math.PI / 2, 0xe8e6e0, 0x7a8086);
        void A;
      } else if (id === 'downtown') {
        k.building(bx, p.z - 5.5, 9, 9, 24, 0, 0x9aa6b4, { roof: 'flat', mode: MODE.GLASS });
      } else if (id === 'trailer') {
        k.building(bx, p.z - 3.4, 10, 3.2, 2.8, 0, 0xd9d6cc, { roof: 'shed', roofColor: 0x9a9ea2, mode: MODE.PUNCHED });
        k.box(bx + 6.5, p.z - 3.4, 3, 3, 0.4, 0x7a5a3a, { y0: g });
      } else if (id === 'cabin') {
        k.building(bx, p.z - 5, 10, 7, 3.6, 0, 0x7a5a3a, { roof: 'gable', roofColor: 0x4a3a30, mode: MODE.PUNCHED });
        k.cyl(bx + 3, p.z - 7, 0.9, 6.2, 0x5a4a40);
      } else if (id === 'crestview' || id === 'rojo') {
        k.building(bx, p.z - 8, 22, 12, 6, 0, 0xf4f2ec, { roof: 'flat', mode: MODE.GLASS });
        k.box(bx + 4, p.z - 8, 18, 10, 3.4, 0xe8e4da, { y0: g + 6, mode: MODE.GLASS });
        k.box(bx - 6, p.z + 6, 14, 8, 0.15, 0x2a9bc9, { y0: g, mode: MODE.GLOW, solid: false });
      } else if (id === 'dock') {
        k.building(bx, p.z - 5, 14, 8, 4.2, 0, 0x8a7a68, { roof: 'gable', roofColor: 0x2a5a7a, mode: MODE.PUNCHED });
      } else {
        k.building(bx, p.z - 6, id === 'boardwalk' ? 12 : 12, 8, id === 'boardwalk' ? 7.5 : 4.6, 0, wall, { roof: id === 'boardwalk' ? 'flat' : 'gable', mode: MODE.PUNCHED });
      }
      k.box(bx, p.z - 0.8, 2.2, 0.3, 0.9, c, { y0: g + 2.1, mode: MODE.NEON, solid: false });
    } else {
      const big = p.kind === 'showroom' || p.kind === 'tuning';
      const w = big ? 14 : 9, d = big ? 9 : 6, h = big ? 4.2 : 3.6;
      k.building(bx, p.z - 1.8 - d / 2, w, d, h, 0, wall, { roof: 'false', mode: big ? MODE.GLASS : MODE.PUNCHED });
      front(w, d, h);
      k.sign(bx + w / 2 + 1, p.z - 0.6, 0, 2.6, 1, 3.4, c);
    }
  }
  return k;
}
