import type { QualityName } from './Settings';

export interface QualityPreset {
  name: Exclude<QualityName, 'auto'>;
  /** Upper bound for devicePixelRatio. */
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  antialias: boolean;
  /** Draw distance in metres. */
  viewDistance: number;
}

export const PRESETS: Record<Exclude<QualityName, 'auto'>, QualityPreset> = {
  low: { name: 'low', maxPixelRatio: 1, shadows: false, shadowMapSize: 512, antialias: false, viewDistance: 300 },
  medium: { name: 'medium', maxPixelRatio: 1.25, shadows: true, shadowMapSize: 1024, antialias: false, viewDistance: 600 },
  high: { name: 'high', maxPixelRatio: 1.5, shadows: true, shadowMapSize: 2048, antialias: true, viewDistance: 1000 },
  ultra: { name: 'ultra', maxPixelRatio: 2, shadows: true, shadowMapSize: 4096, antialias: true, viewDistance: 1600 },
};

/** Pick a starting preset from coarse hardware hints. */
export function detectQuality(gl: WebGLRenderingContext | WebGL2RenderingContext): Exclude<QualityName, 'auto'> {
  const cores = navigator.hardwareConcurrency ?? 4;
  const touch = matchMedia('(pointer: coarse)').matches;
  let renderer = '';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).toLowerCase();

  const software = /swiftshader|llvmpipe|software/.test(renderer);
  if (software || touch) return 'low';
  const integrated = /intel|uhd|iris|apple m1|adreno|mali/.test(renderer);
  if (integrated || cores <= 4) return 'medium';
  return 'high';
}

/**
 * Dynamic resolution: nudges a scale factor down when frame time is high
 * and back up when there is headroom. Uses a slow window to avoid flapping.
 */
export class DynamicResolution {
  scale = 1;
  private acc = 0;
  private frames = 0;

  constructor(private min = 0.6, private targetMs = 1000 / 58) {}

  /** Returns true when the scale changed. */
  update(dtMs: number): boolean {
    this.acc += dtMs;
    this.frames++;
    if (this.acc < 1500) return false;
    const avg = this.acc / this.frames;
    this.acc = 0;
    this.frames = 0;
    const prev = this.scale;
    if (avg > this.targetMs * 1.15) this.scale = Math.max(this.min, this.scale - 0.1);
    else if (avg < this.targetMs * 0.8) this.scale = Math.min(1, this.scale + 0.05);
    return this.scale !== prev;
  }
}
