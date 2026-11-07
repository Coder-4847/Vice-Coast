import { CHUNK, hash2, mulberry32, type ChunkData } from './city/plan';
import { VEG, type ChunkSource, type Veg } from './city/source';
import { TERRAIN, townInfluence, type Surface4 } from './heightfield';
import { nearestRoad } from './roads';
import { TerrainData } from './TerrainData';
import { terrainHeight } from './Terrain';

const CELL = 6.5;
const _s: Surface4 = { desert: 0, forest: 0, salt: 0, dirt: 0 };

/**
 * Everything wild: pine forests on the northern slopes, cacti and scrub on the desert plateau, scattered broadleaf trees,
 * boulders on rocky ground. A pure function of the terrain, so any chunk can be regenerated on demand.
 */
export class Wilderness implements ChunkSource {
  readonly id = 'wild';

  chunkRange(): { cx0: number; cx1: number; cz0: number; cz1: number } {
    return { cx0: Math.floor(TERRAIN.x0 / CHUNK), cx1: Math.floor(TERRAIN.x1 / CHUNK), cz0: Math.floor(TERRAIN.z0 / CHUNK), cz1: Math.floor(TERRAIN.z1 / CHUNK) };
  }

  generateChunk(cx: number, cz: number): ChunkData {
    const veg: Veg[] = [];
    const td = TerrainData.current;
    if (td) {
      const x0 = cx * CHUNK, z0 = cz * CHUNK;
      const n = Math.floor(CHUNK / CELL);
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const gi = cx * n + i, gj = cz * n + j;
          const r = mulberry32(hash2(gi, gj, 911));
          const x = x0 + (i + 0.15 + r() * 0.7) * CELL;
          const z = z0 + (j + 0.15 + r() * 0.7) * CELL;
          if (x < TERRAIN.x0 + 40 || x > TERRAIN.x1 - 40 || z < TERRAIN.z0 + 40 || z > TERRAIN.z1 - 40) continue;
          const roll = r();
          const kindRoll = r();
          const sizeRoll = r();
          const tint = r();
          const yaw = r() * 6.2832;
          td.surface(x, z, _s);
          const flatN = td.flatness(x, z);
          const town = townInfluence(x, z);
          if (town > 0.5) continue;
          const h = td.sample(x, z);
          if (h < 1.8) continue;
          const road = nearestRoad(x, z, 18);
          if (road && road.d < road.path.def.hw + (road.path.def.kind === 'dirt' ? 1.6 : 4.5)) continue;
          const push = (kind: Veg['kind'], s: number): void => {
            // boulders carry their rock type in the tint: < 0.5 grey granite, ≥ 0.5 red desert sandstone
            const t = kind === VEG.ROCK ? (_s.desert > 0.4 ? 0.5 + tint * 0.5 : tint * 0.5) : tint;
            veg.push({ kind, x, y: terrainHeight(x, z), z, s, yaw, tint: t });
          };
          if (_s.forest > 0.32) {
            // conifers dominate; broadleaf stands appear lower down and near water
            if (roll < _s.forest * 0.62 * flatN) {
              const lowland = h < 140 && kindRoll < 0.28;
              if (lowland) push(VEG.BROAD, 0.85 + sizeRoll * 0.6);
              else push(VEG.PINE, (0.8 + sizeRoll * 0.8) * (h > 380 ? 0.8 : 1));
            } else if (roll > 0.992) push(VEG.ROCK, 0.5 + sizeRoll * 1.1);
          } else if (_s.desert > 0.3) {
            const d = _s.desert * (1 - _s.salt);
            if (roll < 0.013 * d && flatN > 0.9) push(VEG.SAGUARO, 0.8 + sizeRoll * 0.7);
            else if (roll < 0.02 * d) push(VEG.JOSHUA, 0.8 + sizeRoll * 0.6);
            else if (roll < 0.055 * d) push(VEG.CACTUS, 0.7 + sizeRoll * 0.7);
            else if (roll < 0.07 * d + 0.12 * d * d) push(VEG.SCRUB, 0.7 + sizeRoll * 0.9);
            else if (roll < 0.16 * d && flatN < 0.93) push(VEG.ROCK, 0.5 + sizeRoll * 1.3);
          } else if (_s.salt < 0.2) {
            if (h > 320 && flatN < 0.8 && roll < 0.012) push(VEG.ROCK, 0.7 + sizeRoll * 1.6);
            else if (h < 380 && roll < 0.0018) push(VEG.BROAD, 0.8 + sizeRoll * 0.6);
            else if (h < 900 && roll < 0.012 && flatN > 0.88) push(VEG.SCRUB, 0.6 + sizeRoll * 0.6);
          }
        }
      }
    }
    return { cx, cz, boxes: [], cyls: [], lamps: [], trees: [], signals: [], veg };
  }
}
