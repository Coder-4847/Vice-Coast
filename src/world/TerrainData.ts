import { HM_CELL, TERRAIN, terrainHeight as analyticHeight, type Surface4 } from './heightfield';
import { bakeBand, HM_H, HM_W, SF_H, SF_W, SURF_STEP, type BakeBand } from './terrainBake';

/**
 * The baked world: heights on a 4 m grid, packed normals, and biome weights on an 8 m grid. Computed once at start-up
 * (spread over a few workers behind the loading screen) and then used for rendering, physics and every ground query.
 */
export class TerrainData {
  /** The baked world, once ready. Until then queries fall back to the analytic function. */
  static current: TerrainData | null = null;

  readonly heights = new Float32Array(HM_W * HM_H);
  readonly normals = new Uint8Array(HM_W * HM_H * 4);
  readonly surf = new Uint8Array(SF_W * SF_H * 4);
  readonly cols = HM_W;
  readonly rows = HM_H;

  /** Height at (x, z): bilinear on the baked grid. */
  sample(x: number, z: number): number {
    let u = (x - TERRAIN.x0) / HM_CELL;
    let v = (z - TERRAIN.z0) / HM_CELL;
    u = u < 0 ? 0 : u > HM_W - 1.001 ? HM_W - 1.001 : u;
    v = v < 0 ? 0 : v > HM_H - 1.001 ? HM_H - 1.001 : v;
    const i = u | 0;
    const j = v | 0;
    const fx = u - i;
    const fz = v - j;
    const o = j * HM_W + i;
    const h = this.heights;
    const a = h[o]!;
    const b = h[o + 1]!;
    const c = h[o + HM_W]!;
    const d = h[o + HM_W + 1]!;
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }

  /** Up-facing normal component at (x, z), 0…1 (1 = flat). */
  flatness(x: number, z: number): number {
    const i = Math.min(HM_W - 1, Math.max(0, Math.round((x - TERRAIN.x0) / HM_CELL)));
    const j = Math.min(HM_H - 1, Math.max(0, Math.round((z - TERRAIN.z0) / HM_CELL)));
    const o = (j * HM_W + i) * 4;
    const nx = this.normals[o]! / 127.5 - 1;
    const nz = this.normals[o + 1]! / 127.5 - 1;
    return Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
  }

  /** Biome weights (0…1) at (x, z), nearest sample. */
  surface(x: number, z: number, out: Surface4): Surface4 {
    const i = Math.min(SF_W - 1, Math.max(0, Math.round((x - TERRAIN.x0) / (HM_CELL * SURF_STEP))));
    const j = Math.min(SF_H - 1, Math.max(0, Math.round((z - TERRAIN.z0) / (HM_CELL * SURF_STEP))));
    const o = (j * SF_W + i) * 4;
    out.desert = this.surf[o]! / 255;
    out.forest = this.surf[o + 1]! / 255;
    out.salt = this.surf[o + 2]! / 255;
    out.dirt = this.surf[o + 3]! / 255;
    return out;
  }

  private accept(b: BakeBand): void {
    this.heights.set(b.heights, b.r0 * HM_W);
    this.normals.set(b.normals, b.r0 * HM_W * 4);
    this.surf.set(b.surf, b.sfRow0 * SF_W * 4);
  }

  /** Bake the whole world. Uses up to `workers` Web Workers; falls back to time-sliced main-thread work. */
  static async bake(onProgress?: (f: number) => void, workers = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))): Promise<TerrainData> {
    const data = new TerrainData();
    const bands: { r0: number; r1: number }[] = [];
    const BAND = 64;
    for (let r = 0; r < HM_H; r += BAND) bands.push({ r0: r, r1: Math.min(HM_H, r + BAND) });
    let done = 0;
    const finish = (b: BakeBand): void => {
      data.accept(b);
      onProgress?.(++done / bands.length);
    };
    let pool: Worker[] = [];
    try {
      pool = Array.from({ length: workers }, () => new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' }));
    } catch {
      pool = [];
    }
    if (pool.length) {
      try {
        await new Promise<void>((resolve, reject) => {
          let next = 0;
          const feed = (w: Worker): void => {
            if (next >= bands.length) {
              if (done >= bands.length) resolve();
              return;
            }
            w.postMessage(bands[next++]);
          };
          for (const w of pool) {
            w.onmessage = (e: MessageEvent<BakeBand>) => {
              finish(e.data);
              if (done >= bands.length) resolve();
              else feed(w);
            };
            w.onerror = (e) => reject(new Error(e.message || 'terrain bake worker failed'));
            feed(w);
          }
        });
      } catch {
        // fall through to main-thread baking for whatever is missing
        done = 0;
        data.heights.fill(0);
      } finally {
        pool.forEach((w) => w.terminate());
      }
    }
    if (done < bands.length) {
      done = 0;
      for (const b of bands) {
        finish(bakeBand(b.r0, b.r1));
        if (done % 3 === 0) await new Promise((r) => setTimeout(r, 0));
      }
    }
    TerrainData.current = data;
    return data;
  }
}

/** Ground height: baked once available, analytic before. */
export function groundY(x: number, z: number): number {
  const t = TerrainData.current;
  return t ? t.sample(x, z) : analyticHeight(x, z);
}
