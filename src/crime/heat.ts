import type { Game } from '../Game';
import { HEAT } from '../combat/Wanted';

/** One way to bring the police down on a crime: raise the level to at least `stars` and speed up the response. */
export function callPolice(g: Game, stars: number, x: number, z: number, fast = true): void {
  const w = g.wanted;
  if (!w || stars <= 0) return;
  if (w.stars < stars) w.report(HEAT[Math.min(6, stars)]! + 1, x, z, true);
  if (fast && w.response > 3) w.response = 3;
}
