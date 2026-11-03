import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import type { Pass } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { GameRenderer } from './GameRenderer';
import type { QualityPreset } from './Quality';

export interface PostParams {
  exposure: number;
  tint: THREE.Color;
  saturation: number;
  bloom: number;
  vignette: number;
  /** 0–1 lightning flash. */
  flash: number;
  time: number;
  /** Sun position in UV space, visibility 0–1 (occlusion + cloud cover), and colour. */
  sunUv: THREE.Vector2;
  sunVisibility: number;
  sunColor: THREE.Color;
}

/** Post-exposure luminance above which pixels contribute to bloom. */
const BLOOM_THRESHOLD = 3.2;

const FINAL_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uExposure: { value: 1 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uSat: { value: 1 },
    uVignette: { value: 0.25 },
    uGrain: { value: 0.03 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
    uSunVis: { value: 0 },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uAspect: { value: 1.7 },
    uFlare: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uExposure, uSat, uVignette, uGrain, uTime, uFlash, uSunVis, uAspect, uFlare;
    uniform vec3 uTint, uSunColor;
    uniform vec2 uSunUv;
    varying vec2 vUv;

    vec3 aces(vec3 x) {                         // Narkowicz ACES fit
      return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    }
    vec3 toSrgb(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;

      // Cinematic sun flare: glow, anamorphic streak and a few ghosts, only while the sun is visible.
      if (uSunVis > 0.001) {
        vec2 asp = vec2(uAspect, 1.0);
        vec2 dp = (vUv - uSunUv) * asp;
        float r = length(dp);
        vec2 toC = vec2(0.5) - uSunUv;
        float edge = 1.0 - smoothstep(0.35, 0.95, length((uSunUv - 0.5) * asp));
        vec3 fl = uSunColor * (0.05 / (r * r * 90.0 + 0.5));
        fl += uSunColor * vec3(1.0, 0.8, 0.65) * exp(-abs(dp.y) * 120.0) * exp(-abs(dp.x) * 2.6) * 0.35;
        for (int i = 1; i <= 4; i++) {
          float k = float(i);
          vec2 gp = uSunUv + toC * (k * 0.55 - 0.15);
          float gr = length((vUv - gp) * asp);
          float size = 0.025 + 0.012 * k;
          float ring = smoothstep(size, size * 0.75, gr) * (0.35 + 0.65 * smoothstep(size * 0.35, size, gr));
          vec3 tint = mix(vec3(1.0, 0.55, 0.3), vec3(0.4, 0.7, 1.0), fract(k * 0.37));
          fl += tint * ring * (0.05 / k) * uSunColor;
        }
        c += fl * uSunVis * edge * uFlare;
      }

      c *= uExposure * (1.0 + uFlash * 1.2);
      c += vec3(0.5, 0.55, 0.75) * uFlash * 0.05;
      c *= uTint;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);

      vec2 q = vUv - 0.5;
      c *= 1.0 - uVignette * pow(length(q * vec2(1.0, 0.9)) * 1.45, 2.4);

      c = aces(c);
      c = toSrgb(c);
      // Film grain, strongest in the mid-tones, animated at ~24 fps.
      float g = hash(vUv * vec2(1920.0, 1080.0) + floor(uTime * 24.0) * 17.0) - 0.5;
      float ld = dot(c, vec3(0.2126, 0.7152, 0.0722));   // display-space luma, in [0,1]
      c += g * uGrain * (1.0 - abs(ld - 0.5) * 1.2);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/**
 * HDR render pipeline: scene → (MSAA half-float target) → GTAO → bloom → grade/tone-map/flare → SMAA → screen.
 * Which stages run depends on the quality preset; changing preset rebuilds the chain live.
 */
export class RenderPipeline {
  private sceneRT!: THREE.WebGLRenderTarget;
  private rtA!: THREE.WebGLRenderTarget;
  private rtB!: THREE.WebGLRenderTarget;
  private ldr!: THREE.WebGLRenderTarget;
  private gtao: GTAOPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private smaa: SMAAPass | null = null;
  private final!: ShaderPass;
  private preset!: QualityPreset;
  private w = 1;
  private h = 1;
  /** Meshes (sky dome, ocean, light pools…) that must not appear in the ambient-occlusion depth pre-pass. */
  readonly hideForAO: THREE.Object3D[] = [];
  /** Optional second pass drawn over the world with its own camera (the first-person viewmodel). */
  overlayCamera: THREE.Camera | null = null;

  constructor(private readonly gfx: GameRenderer, private readonly scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera) {}

  /** (Re)build the pass chain for a preset. Safe to call at any time. */
  configure(preset: QualityPreset, width: number, height: number): void {
    this.preset = preset;
    this.dispose();
    this.w = Math.max(1, Math.round(width));
    this.h = Math.max(1, Math.round(height));
    const opts = { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false } as const;
    this.sceneRT = new THREE.WebGLRenderTarget(this.w, this.h, { ...opts, samples: preset.msaa });
    this.rtA = new THREE.WebGLRenderTarget(this.w, this.h, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtB = new THREE.WebGLRenderTarget(this.w, this.h, { type: THREE.HalfFloatType, depthBuffer: false });
    this.ldr = new THREE.WebGLRenderTarget(this.w, this.h, { type: THREE.UnsignedByteType, depthBuffer: false });

    if (preset.ao) {
      this.gtao = new GTAOPass(this.scene, this.camera, this.w, this.h);
      this.gtao.blendIntensity = 1;
      this.gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.3, thickness: 1.5, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 8 });
      const orig = this.gtao.render.bind(this.gtao);
      this.gtao.render = (r, wr, rd, dt, mask) => {
        const saved = this.hideForAO.map((o) => o.visible);
        this.hideForAO.forEach((o) => (o.visible = false));
        orig(r, wr, rd, dt, mask);
        this.hideForAO.forEach((o, i) => (o.visible = saved[i]!));
      };
    }
    if (preset.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(this.w, this.h), 0.3, 0.5, BLOOM_THRESHOLD);
    }
    this.final = new ShaderPass(FINAL_SHADER);
    if (preset.smaa) this.smaa = new SMAAPass();
    this.setSize(width, height);
  }

  setSize(width: number, height: number): void {
    this.w = Math.max(1, Math.round(width));
    this.h = Math.max(1, Math.round(height));
    this.sceneRT?.setSize(this.w, this.h);
    this.rtA?.setSize(this.w, this.h);
    this.rtB?.setSize(this.w, this.h);
    this.ldr?.setSize(this.w, this.h);
    this.gtao?.setSize(this.w, this.h);
    this.bloom?.setSize(this.w, this.h);
    this.smaa?.setSize(this.w, this.h);
    this.final?.setSize(this.w, this.h);
  }

  render(dt: number, p: PostParams): void {
    const r = this.gfx.renderer;
    // 1. Scene into the HDR target.
    r.setRenderTarget(this.sceneRT);
    r.shadowMap.needsUpdate = true; // shadow maps are rendered once per frame, here, and reused by later passes
    r.render(this.scene, this.camera);
    if (this.overlayCamera) {
      r.autoClear = false;
      r.clearDepth(); // the viewmodel never intersects the world
      r.render(this.scene, this.overlayCamera);
      r.autoClear = true;
    }

    // 2. Post chain.
    let read = this.sceneRT;
    let write = this.rtA;
    const run = (pass: Pass) => {
      pass.render(r, write, read, dt, false);
      if (pass.needsSwap) {
        const t = read === this.sceneRT ? this.rtB : read;
        read = write;
        write = t;
      }
    };
    if (this.gtao) run(this.gtao);
    if (this.bloom) {
      this.bloom.strength = p.bloom;
      // UnrealBloom forwards the *whole* pixel above the threshold, and it works before exposure, so the
      // threshold is expressed in post-exposure units: only the sun, lamps, lit windows and moon glow.
      this.bloom.threshold = BLOOM_THRESHOLD / Math.max(0.2, p.exposure);
      run(this.bloom);
    }

    // 3. Grade / tone map.
    const u = this.final.uniforms;
    u.uExposure!.value = p.exposure;
    u.uTint!.value.copy(p.tint);
    u.uSat!.value = p.saturation;
    u.uVignette!.value = this.preset.cinematic ? p.vignette : 0;
    u.uGrain!.value = this.preset.cinematic ? 0.035 : 0;
    u.uFlare!.value = this.preset.cinematic ? 1 : 0;
    u.uTime!.value = p.time;
    u.uFlash!.value = p.flash;
    u.uSunUv!.value.copy(p.sunUv);
    u.uSunVis!.value = p.sunVisibility;
    u.uSunColor!.value.copy(p.sunColor);
    u.uAspect!.value = this.w / this.h;

    if (this.smaa) {
      this.final.renderToScreen = false;
      this.final.render(r, this.ldr, read, dt, false);
      this.smaa.renderToScreen = true;
      this.smaa.render(r, write, this.ldr, dt, false);
    } else {
      this.final.renderToScreen = true;
      this.final.render(r, write, read, dt, false);
    }
  }

  dispose(): void {
    this.sceneRT?.dispose();
    this.rtA?.dispose();
    this.rtB?.dispose();
    this.ldr?.dispose();
    this.gtao?.dispose();
    this.bloom?.dispose();
    this.smaa?.dispose();
    this.final?.dispose();
    this.gtao = this.bloom = this.smaa = null;
  }
}
