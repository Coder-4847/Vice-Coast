import * as THREE from 'three';
import { clamp } from './math';
import { readGpuInfo, type GpuInfo, type QualityPreset } from './Quality';

export interface RendererHooks {
  onContextLost(): void;
  onContextRestored(): void;
}

const MIN_DYN = 0.55;

/**
 * Owns the WebGLRenderer: sizing (resolution scale × device pixel ratio × dynamic scale),
 * quality application, GPU info, and WebGL context loss handling.
 */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly gpu: GpuInfo;
  /** Multiplier applied by the dynamic-resolution governor (1 = off). */
  dynamicScale = 1;
  /** Player-facing resolution scale slider. */
  userScale = 1;
  preset: QualityPreset;
  contextLost = false;

  private cooldown = 0;
  private upCooldown = 0;
  private stableFor = 0;
  private lastW = 0;
  private lastH = 0;
  private lastPR = 0;

  constructor(readonly canvas: HTMLCanvasElement, preset: QualityPreset, hooks: RendererHooks) {
    this.preset = preset;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: preset.antialias,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gpu = readGpuInfo(this.renderer.getContext() as WebGL2RenderingContext);

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // allows the browser to restore the context
      this.contextLost = true;
      hooks.onContextLost();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.lastW = 0; // force a resize/state refresh
      this.applyQuality(this.preset);
      hooks.onContextRestored();
    });

    this.applyQuality(preset);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  applyQuality(preset: QualityPreset): void {
    this.preset = preset;
    this.renderer.shadowMap.enabled = preset.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    this.resize(true);
  }

  get pixelRatio(): number {
    const dpr = window.devicePixelRatio || 1;
    return clamp(Math.min(dpr, this.preset.pixelRatioCap) * this.userScale * this.dynamicScale, 0.35, 3);
  }

  resize(force = false): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const pr = this.pixelRatio;
    if (!force && w === this.lastW && h === this.lastH && Math.abs(pr - this.lastPR) < 0.001) return;
    this.lastW = w;
    this.lastH = h;
    this.lastPR = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false); // CSS size is set by stylesheet
  }

  /**
   * Dynamic resolution governor. Drops the render scale quickly when the recent average
   * frame time misses the 60 FPS budget, and creeps back up slowly with exponential backoff
   * after each drop so it never oscillates visibly.
   */
  govern(avgMs: number, dt: number, enabled: boolean, samples: number): void {
    if (!enabled) {
      if (this.dynamicScale !== 1) {
        this.dynamicScale = 1;
        this.resize();
      }
      return;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.upCooldown = Math.max(0, this.upCooldown - dt);
    if (samples < 90) return; // wait for a meaningful window
    // Below ~25 FPS the page is likely backgrounded/throttled, not GPU bound.
    if (avgMs > 40) return;

    if (avgMs > 19.5 && this.cooldown <= 0 && this.dynamicScale > MIN_DYN) {
      this.dynamicScale = Math.max(MIN_DYN, this.dynamicScale - (avgMs > 28 ? 0.12 : 0.06));
      this.cooldown = 0.75;
      this.upCooldown = Math.min(30, 5 * Math.pow(1.6, this.stableFor));
      this.stableFor = Math.min(this.stableFor + 1, 6);
      this.resize();
    } else if (avgMs < 15.5 && this.upCooldown <= 0 && this.dynamicScale < 1) {
      this.dynamicScale = Math.min(1, this.dynamicScale + 0.04);
      this.upCooldown = 2.5;
      this.resize();
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.contextLost) return;
    this.renderer.render(scene, camera);
  }
}
