import { HM_CELL, HM_COLS, HM_ROWS, TERRAIN, surfaceWeights, terrainHeight, type Surface4 } from './heightfield';
import { installRoads } from './roads';

/** Surface mask resolution: every 2nd height sample (8 m). */
export const SURF_STEP = 2;
export const HM_W = HM_COLS + 1;
export const HM_H = HM_ROWS + 1;
export const SF_W = Math.floor(HM_COLS / SURF_STEP) + 1;
export const SF_H = Math.floor(HM_ROWS / SURF_STEP) + 1;

export interface BakeBand {
  r0: number;
  r1: number;
  /** Height rows r0 … r1−1, row-major (HM_W wide). */
  heights: Float32Array;
  /** Normals as RGBA8 for the same rows: R,G = (nx, nz) · 0.5 + 0.5. */
  normals: Uint8Array;
  /** Surface mask rows for the SURF_STEP-decimated grid whose row index j satisfies r0 ≤ j·SURF_STEP < r1. */
  surf: Uint8Array;
  sfRow0: number;
  sfRows: number;
}

/** Bake terrain rows [r0, r1): heights, normals and biome weights. Pure, so it runs in a worker or on the main thread. */
export function bakeBand(r0: number, r1: number): BakeBand {
  installRoads();
  const a = Math.max(0, r0 - 1);
  const b = Math.min(HM_H - 1, r1);
  const ext = new Float32Array((b - a + 1) * HM_W);
  for (let j = a; j <= b; j++) {
    const z = TERRAIN.z0 + j * HM_CELL;
    const o = (j - a) * HM_W;
    for (let i = 0; i < HM_W; i++) ext[o + i] = terrainHeight(TERRAIN.x0 + i * HM_CELL, z);
  }
  const rows = r1 - r0;
  const heights = new Float32Array(rows * HM_W);
  const normals = new Uint8Array(rows * HM_W * 4);
  const hAt = (i: number, j: number): number => ext[(j - a) * HM_W + Math.min(HM_W - 1, Math.max(0, i))]!;
  for (let j = r0; j < r1; j++) {
    const ja = Math.max(a, j - 1);
    const jb = Math.min(b, j + 1);
    for (let i = 0; i < HM_W; i++) {
      const h = hAt(i, j);
      heights[(j - r0) * HM_W + i] = h;
      const dx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * HM_CELL);
      const dz = (hAt(i, jb) - hAt(i, ja)) / ((jb - ja) * HM_CELL);
      const il = 1 / Math.hypot(dx, 1, dz);
      const o = ((j - r0) * HM_W + i) * 4;
      normals[o] = Math.round((-dx * il * 0.5 + 0.5) * 255);
      normals[o + 1] = Math.round((-dz * il * 0.5 + 0.5) * 255);
      normals[o + 2] = 0;
      normals[o + 3] = 255;
    }
  }
  // Biome weights on the coarser grid.
  const sfRow0 = Math.ceil(r0 / SURF_STEP);
  const sfEnd = Math.ceil(r1 / SURF_STEP);
  const sfRows = sfEnd - sfRow0;
  const surf = new Uint8Array(Math.max(0, sfRows) * SF_W * 4);
  const s4: Surface4 = { desert: 0, forest: 0, salt: 0, dirt: 0 };
  for (let sj = sfRow0; sj < sfEnd; sj++) {
    const j = sj * SURF_STEP;
    if (j >= HM_H) break;
    const z = TERRAIN.z0 + j * HM_CELL;
    for (let si = 0; si < SF_W; si++) {
      const i = si * SURF_STEP;
      const h = hAt(i, j);
      const o = ((sj - sfRow0) * SF_W + si) * 4;
      if (h < -0.5) continue;
      const dx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * HM_CELL);
      const dz = (hAt(i, Math.min(b, j + 1)) - hAt(i, Math.max(a, j - 1))) / ((Math.min(b, j + 1) - Math.max(a, j - 1)) * HM_CELL);
      const slope = 1 - 1 / Math.hypot(dx, 1, dz);
      surfaceWeights(TERRAIN.x0 + i * HM_CELL, z, h, slope, s4);
      surf[o] = Math.round(s4.desert * 255);
      surf[o + 1] = Math.round(s4.forest * 255);
      surf[o + 2] = Math.round(s4.salt * 255);
      surf[o + 3] = Math.round(s4.dirt * 255);
    }
  }
  return { r0, r1, heights, normals, surf, sfRow0, sfRows: Math.max(0, sfRows) };
}
