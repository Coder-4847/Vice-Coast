import type { ChunkData } from './plan';

/** Anything that fills the world with streamed scenery: Port Valeria's plan, other towns, the wilderness. */
export interface ChunkSource {
  readonly id: string;
  /** Inclusive chunk-index bounds this source can produce content for. */
  chunkRange(): { cx0: number; cx1: number; cz0: number; cz1: number };
  /** Pure function of (cx, cz): the same chunk is regenerated identically every time. */
  generateChunk(cx: number, cz: number): ChunkData;
}

/** Wild vegetation and loose rock. Rendered as instanced, merged-mesh props; colliders appear only near the player. */
export const VEG = { PINE: 0, BROAD: 1, SAGUARO: 2, DEAD: 3, SCRUB: 4, ROCK: 5, CACTUS: 6, JOSHUA: 7 } as const;
export type VegKind = (typeof VEG)[keyof typeof VEG];

export interface Veg {
  kind: VegKind;
  x: number;
  y: number;
  z: number;
  /** Uniform-ish scale. */
  s: number;
  yaw: number;
  /** Per-instance colour variation 0…1. */
  tint: number;
}

/** Merge several chunk results (sources whose areas overlap). */
export function mergeChunks(list: ChunkData[]): ChunkData {
  if (list.length === 1) return list[0]!;
  const out: ChunkData = { cx: list[0]!.cx, cz: list[0]!.cz, boxes: [], cyls: [], lamps: [], trees: [], signals: [], veg: [] };
  for (const d of list) {
    out.boxes.push(...d.boxes);
    out.cyls.push(...d.cyls);
    out.lamps.push(...d.lamps);
    out.trees.push(...d.trees);
    out.signals.push(...d.signals);
    if (d.veg) out.veg!.push(...d.veg);
  }
  return out;
}
