export type PresetName = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityPreset {
  name: PresetName;
  label: string;
  /** Upper bound for devicePixelRatio (render resolution multiplier). */
  pixelRatioCap: number;
  /** Legacy default-framebuffer MSAA flag (the HDR pipeline uses `msaa`). */
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  /** World view distance in metres (city generation radius; fog is driven by weather). */
  drawDistance: number;
  /** Test-world building instances. Later phases swap this for chunk streaming budgets. */
  instanceBudget: number;
  /** Shadow cascades (0 = no shadows). */
  cascades: number;
  /** Shadow distance in metres. */
  shadowDistance: number;
  /** Samples for the HDR scene target (0 = none). Changes apply live. */
  msaa: number;
  ao: boolean;
  bloom: boolean;
  /** Bloom runs at 1/N resolution. */
  smaa: boolean;
  /** Film grain, vignette, lens flare. */
  cinematic: boolean;
  cloudOctaves: number;
  envSize: number;
  envInterval: number;
  terrainSegments: number;
  rain: number;
  snow: number;
  dust: number;
  /** Streetlights / light pools. */
  lamps: boolean;
}

export const PRESETS: Record<PresetName, QualityPreset> = {
  low: {
    name: 'low', label: 'Low', pixelRatioCap: 1, antialias: false,
    shadows: false, shadowMapSize: 512, drawDistance: 700, instanceBudget: 350,
    cascades: 0, shadowDistance: 0, msaa: 0, ao: false, bloom: false, smaa: false, cinematic: false,
    cloudOctaves: 3, envSize: 64, envInterval: 4, terrainSegments: 160, rain: 1800, snow: 1500, dust: 120, lamps: false,
  },
  medium: {
    name: 'medium', label: 'Medium', pixelRatioCap: 1.25, antialias: false,
    shadows: true, shadowMapSize: 1024, drawDistance: 1100, instanceBudget: 700,
    cascades: 2, shadowDistance: 260, msaa: 0, ao: false, bloom: true, smaa: true, cinematic: true,
    cloudOctaves: 4, envSize: 128, envInterval: 3, terrainSegments: 224, rain: 4500, snow: 3500, dust: 260, lamps: true,
  },
  high: {
    name: 'high', label: 'High', pixelRatioCap: 1.5, antialias: true,
    shadows: true, shadowMapSize: 2048, drawDistance: 1800, instanceBudget: 1100,
    cascades: 3, shadowDistance: 460, msaa: 4, ao: true, bloom: true, smaa: false, cinematic: true,
    cloudOctaves: 5, envSize: 256, envInterval: 2, terrainSegments: 300, rain: 8000, snow: 6000, dust: 420, lamps: true,
  },
  ultra: {
    name: 'ultra', label: 'Ultra', pixelRatioCap: 2, antialias: true,
    shadows: true, shadowMapSize: 2048, drawDistance: 2800, instanceBudget: 1300,
    cascades: 4, shadowDistance: 760, msaa: 4, ao: true, bloom: true, smaa: true, cinematic: true,
    cloudOctaves: 6, envSize: 256, envInterval: 1.2, terrainSegments: 400, rain: 14000, snow: 10000, dust: 700, lamps: true,
  },
};

export const PRESET_ORDER: PresetName[] = ['low', 'medium', 'high', 'ultra'];

export interface GpuInfo {
  renderer: string;
  vendor: string;
}

/** Reads the unmasked GPU name when the browser allows it. */
export function readGpuInfo(gl: WebGL2RenderingContext): GpuInfo {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const vendor = String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR));
  return { renderer, vendor };
}

/**
 * Heuristic preset pick. Deliberately conservative: the target is a steady 60 FPS on a
 * mid-range laptop, so integrated/mobile/software GPUs start on Low or Medium and
 * dynamic resolution handles the rest.
 */
export function detectPreset(gpu: GpuInfo): PresetName {
  const name = `${gpu.renderer} ${gpu.vendor}`.toLowerCase();
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const mobile = /android|iphone|ipad|mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && !/win|mac|linux x86/i.test(navigator.userAgent));

  if (/swiftshader|llvmpipe|software|basic render|microsoft basic/.test(name)) return 'low';
  if (mobile) return /apple gpu|adreno [6-9]|mali-g[7-9]/.test(name) ? 'medium' : 'low';
  if (/rtx (40|50)|rtx 30[7-9]0|rx 7[6-9]00|rx 6[7-9]00|radeon rx 9|apple m[2-9]/.test(name)) return cores >= 8 ? 'ultra' : 'high';
  if (/rtx|gtx 1[06]|gtx 16|rx [5-9]\d{2}|apple m1|radeon pro/.test(name)) return 'high';
  if (/intel|uhd|iris|hd graphics|vega [3-9]\b|radeon\(tm\) graphics|adreno|mali/.test(name)) return mem >= 8 && cores >= 8 ? 'medium' : 'low';
  return mem >= 8 ? 'medium' : 'low';
}

/** Reads GPU info from a throwaway context, so the preset can be chosen before the real renderer exists. */
export function probeGpu(): GpuInfo | null {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2', { powerPreference: 'high-performance' });
  if (!gl) return null;
  const info = readGpuInfo(gl);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return info;
}
