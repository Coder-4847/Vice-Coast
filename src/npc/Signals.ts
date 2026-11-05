/**
 * Shared traffic-signal clock. Axis 0 = traffic moving along z (the N–S roads), axis 1 = along x (E–W roads).
 * The signal heads in the city, the traffic AI and pedestrians crossing all read the same clock, so what you see is
 * what the cars obey. One full cycle is 32 s: 12 s green, 2.5 s amber, 1.5 s all-red, then the other axis.
 */
export const SIGNAL = { green: 12, amber: 2.5, clear: 1.5 } as const;
const HALF = SIGNAL.green + SIGNAL.amber + SIGNAL.clear;
const CYCLE = HALF * 2;

export type Light = 0 | 1 | 2; // green, amber, red

export class SignalClock {
  time = 0;

  update(dt: number): void {
    this.time += dt;
  }

  /** Seconds into this axis's own cycle (0 = start of its green). */
  private phase(axis: 0 | 1): number {
    return (this.time + (axis === 1 ? HALF : 0)) % CYCLE;
  }

  light(axis: 0 | 1): Light {
    const t = this.phase(axis);
    if (t < SIGNAL.green) return 0;
    if (t < SIGNAL.green + SIGNAL.amber) return 1;
    return 2;
  }

  /** Seconds since this axis turned red (0 while it is not red). */
  redElapsed(axis: 0 | 1): number {
    const t = this.phase(axis);
    return t < SIGNAL.green + SIGNAL.amber ? 0 : t - (SIGNAL.green + SIGNAL.amber);
  }

  /** Seconds left of amber (for “can I make it?” decisions). */
  amberLeft(axis: 0 | 1): number {
    const t = this.phase(axis);
    return t >= SIGNAL.green && t < SIGNAL.green + SIGNAL.amber ? SIGNAL.green + SIGNAL.amber - t : 0;
  }

  /** May a pedestrian start crossing a road whose traffic runs along `axis`? (Early in that axis's red.) */
  walk(axis: 0 | 1): boolean {
    const e = this.redElapsed(axis);
    return e > 1.0 && e < 4.5;
  }
}
