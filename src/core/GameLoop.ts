/**
 * Fixed-timestep simulation with render interpolation.
 * `update(step)` runs at a constant rate; `render(alpha, frameDt)` runs every
 * display frame so motion stays smooth at 60/120/144 Hz.
 */
export class GameLoop {
  private last = 0;
  private acc = 0;
  private running = false;
  private raf = 0;

  constructor(
    private update: (step: number) => void,
    private render: (alpha: number, frameDt: number) => void,
    private step = 1 / 60,
    private maxFrame = 0.1,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    const frameDt = Math.min((now - this.last) / 1000, this.maxFrame);
    this.last = now;
    this.acc += frameDt;
    while (this.acc >= this.step) {
      this.update(this.step);
      this.acc -= this.step;
    }
    this.render(this.acc / this.step, frameDt);
    this.raf = requestAnimationFrame(this.tick);
  };
}
