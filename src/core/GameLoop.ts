export interface FrameStats {
  /** Smoothed frames per second. */
  fps: number;
  /** Smoothed frame time in ms. */
  frameMs: number;
  /** Average of the slowest 1% of recent frames, as FPS. */
  low1: number;
  /** Worst frame in the recent window, ms. */
  worstMs: number;
}

export interface LoopHandlers {
  /** Start of every rendered frame, before fixed steps (poll input here). */
  begin?(dt: number): void;
  /** Fixed-rate simulation step (physics, AI, gameplay). */
  fixedUpdate(dt: number): void;
  /** Once per rendered frame with the interpolation factor between the last two fixed states. */
  update(dt: number, alpha: number): void;
  /** Draw. */
  render(): void;
}

const WINDOW = 240;

/**
 * Fixed-timestep loop with render interpolation, so simulation behaves identically at
 * 30/60/120/144 Hz and motion stays smooth. Also collects frame-time statistics.
 */
export class GameLoop {
  readonly step: number;
  paused = false;
  timeScale = 1;

  private running = false;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private readonly maxSteps = 5;

  private readonly times = new Float32Array(WINDOW);
  private readonly sorted = new Float32Array(WINDOW);
  private count = 0;
  private head = 0;
  private smoothMs = 16.7;
  readonly stats: FrameStats = { fps: 60, frameMs: 16.7, low1: 60, worstMs: 16.7 };
  private statsTimer = 0;

  constructor(private readonly handlers: LoopHandlers, hz = 60) {
    this.step = 1 / hz;
    document.addEventListener('visibilitychange', () => {
      this.last = 0; // avoid a huge dt on tab return
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    if (this.last === 0) {
      this.last = now;
      return;
    }
    // Clamp: after a stall we'd rather slow down than spiral.
    const raw = Math.min(0.25, (now - this.last) / 1000);
    const frameMs = now - this.last;
    this.last = now;
    this.record(frameMs, raw);

    this.handlers.begin?.(raw);
    if (!this.paused) {
      this.acc += raw * this.timeScale;
      let steps = 0;
      while (this.acc >= this.step && steps < this.maxSteps) {
        this.handlers.fixedUpdate(this.step);
        this.acc -= this.step;
        steps++;
      }
      if (steps === this.maxSteps) this.acc = 0; // drop backlog rather than death-spiral
    }
    this.handlers.update(raw, this.paused ? 1 : this.acc / this.step);
    this.handlers.render();
  };

  private record(ms: number, dt: number): void {
    this.times[this.head] = ms;
    this.head = (this.head + 1) % WINDOW;
    if (this.count < WINDOW) this.count++;
    this.smoothMs += (ms - this.smoothMs) * Math.min(1, dt * 4);
    this.statsTimer += dt;
    if (this.statsTimer >= 0.5) {
      this.statsTimer = 0;
      this.computeStats();
    }
  }

  private computeStats(): void {
    const n = this.count;
    this.sorted.set(this.times.subarray(0, n));
    const view = this.sorted.subarray(0, n).sort();
    const worst = view[n - 1] ?? 16.7;
    const k = Math.max(1, Math.ceil(n * 0.01));
    let sum = 0;
    for (let i = n - k; i < n; i++) sum += view[i]!;
    this.stats.frameMs = this.smoothMs;
    this.stats.fps = 1000 / Math.max(0.1, this.smoothMs);
    this.stats.low1 = 1000 / Math.max(0.1, sum / k);
    this.stats.worstMs = worst;
  }

  /** Mean frame time (ms) over the last `frames` frames, for the resolution governor. */
  recentAverage(frames: number): number {
    const n = Math.min(frames, this.count);
    if (n === 0) return 16.7;
    let sum = 0;
    for (let i = 1; i <= n; i++) sum += this.times[(this.head - i + WINDOW) % WINDOW]!;
    return sum / n;
  }

  get sampleCount(): number {
    return this.count;
  }
}
