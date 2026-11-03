import * as THREE from 'three';
import { clamp } from '../core/math';
import { FOG_FRAGMENT, FOG_PARS_FRAGMENT, SKY_RADIANCE_GLSL, WORLD_UNIFORMS_GLSL } from './skyGlsl';
import { sunTransmittance, type TimeOfDay } from './TimeOfDay';
import type { Weather } from './Weather';

const DOME_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DOME_FRAGMENT = /* glsl */ `
${SKY_RADIANCE_GLSL}
uniform vec3 uMoonDir;
uniform vec3 uSunColor;
uniform float uCoverage;
uniform float uCloudDensity;
uniform float uCloudDark;
uniform vec2 uWind;
uniform float uOct;
uniform float uFlash;
uniform float uEnv;
uniform float uTime;
varying vec3 vDir;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash31(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, f = 0.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= uOct) break;
    f += a * vnoise(p);
    p = p * 2.03 + vec2(5.2, 1.3);
    a *= 0.5;
  }
  return f;
}

vec3 stars(vec3 d) {
  vec3 p = d * 230.0;
  vec3 id = floor(p);
  vec3 f = fract(p) - 0.5;
  float h = hash31(id);
  vec3 off = vec3(hash31(id + 3.1), hash31(id + 7.7), hash31(id + 11.3)) - 0.5;
  float dist = length(f - off * 0.55);
  float mag = pow(hash31(id + 19.0), 5.0);
  float s = smoothstep(0.17, 0.0, dist) * step(0.982, h) * (0.35 + 3.5 * mag);
  s *= 0.8 + 0.2 * sin(uTime * 3.0 + h * 60.0);
  vec3 tint = mix(vec3(0.65, 0.78, 1.0), vec3(1.0, 0.82, 0.62), hash31(id + 5.0));
  // faint Milky Way band
  float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.8, -0.45))) * 3.2, 2.0));
  float dust = band * (0.35 + 0.65 * vnoise(d.xz * 9.0 + d.y * 4.0)) * 0.022;
  return tint * s + vec3(0.55, 0.65, 1.0) * dust;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyRadiance(d);
  float up = smoothstep(-0.02, 0.03, d.y);

  // Ground bounce below the horizon (also feeds the lower hemisphere of the environment map).
  vec3 hor = skyRadiance(vec3(d.x, 0.0, d.z));
  // Below the horizon: the lit view shows distant haze/water; the environment capture shows darker ground bounce.
  col = mix(mix(hor * 0.92, hor * 0.22 + vec3(0.002), uEnv), col, up);

  float cosT = dot(d, uSunDir);
  // --- clouds ------------------------------------------------------------------------
  float alpha = 0.0;
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y * 0.85 + 0.14) * 0.5 + uWind;
    float f = fbm(uv);
    float th = mix(0.74, 0.26, uCoverage);
    float dens = smoothstep(th, th + 0.2, f);
    vec2 sunOff = normalize(uSunDir.xz + vec2(1e-4)) * 0.05;
    float dens2 = smoothstep(th, th + 0.2, fbm(uv + sunOff));
    float lit = exp(-dens2 * 2.4 * uCloudDensity) ;
    float sunUp = smoothstep(-0.06, 0.12, uSunDir.y);
    vec3 sunCol = uSunColor * 1.35 * sunUp * (1.0 - uCloudDark * 0.85);
    vec3 amb = skyRadiance(vec3(0.0, 1.0, 0.0)) * 1.1 + hor * 0.35;
    amb *= 1.0 - uCloudDark * 0.6;
    float silver = pow(max(cosT, 0.0), 6.0) * (1.0 - dens) * 0.9;
    vec3 cloud = amb * (0.5 + 0.5 * (1.0 - dens)) + sunCol * (lit * 0.8 + silver);
    cloud += uNight * vec3(0.010, 0.014, 0.028) * (0.6 + 0.4 * lit);
    cloud += vec3(0.7, 0.8, 1.0) * uFlash * 2.2 * (0.4 + 0.6 * dens);
    cloud = mix(cloud, hor, 1.0 - smoothstep(0.0, 0.4, d.y));
    alpha = clamp(dens * (0.45 + 0.65 * uCloudDensity), 0.0, 1.0) * smoothstep(0.0, 0.07, d.y);

    // thin high cirrus, lit strongly at sunrise and sunset
    float cir = 0.0;
    if (uOct >= 4.0) {
      vec2 uv2 = d.xz / (d.y + 0.3) * vec2(0.8, 2.2) + uWind * 0.35 + 7.0;
      cir = smoothstep(0.52, 0.9, fbm(uv2 * 1.7)) * 0.55 * (1.0 - uCoverage * 0.7) * smoothstep(0.02, 0.2, d.y);
      col += (sunCol * 0.55 + amb * 0.15) * cir * (1.0 - alpha);
    }
    col = mix(col, cloud, alpha);
    alpha = max(alpha, cir * 0.4);
  }

  float clear = (1.0 - alpha) * (1.0 - uEnv);
  // --- sun, moon, stars -------------------------------------------------------------------
  float disc = smoothstep(0.99995, 0.999975, cosT) * up;
  col += uSunColor * (disc * 28.0 + pow(max(cosT, 0.0), 2200.0) * 5.0 + pow(max(cosT, 0.0), 120.0) * 0.35) * clear * up;

  if (uNight > 0.02 && uEnv < 0.5) {
    float cm = dot(d, uMoonDir);
    if (cm > 0.0) {
      vec3 t1 = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
      vec3 t2 = cross(t1, uMoonDir);
      vec2 q = vec2(dot(d, t1), dot(d, t2)) / 0.021;
      float r2 = dot(q, q);
      float moonUp = smoothstep(-0.03, 0.04, d.y);
      if (r2 < 1.0) {
        vec3 n = vec3(q, sqrt(1.0 - r2));
        vec3 L = vec3(dot(uSunDir, t1), dot(uSunDir, t2), dot(uSunDir, -uMoonDir));
        float ph = smoothstep(-0.02, 0.2, dot(n, L));
        float maria = 0.62 + 0.38 * smoothstep(0.35, 0.65, fbm(q * 2.6 + 3.0));
        col = mix(col, vec3(0.95, 0.93, 0.85) * 1.9 * maria * ph + vec3(0.012, 0.014, 0.02), (1.0 - alpha * 0.9) * moonUp);
      }
      col += vec3(0.55, 0.65, 0.9) * (pow(cm, 600.0) * 0.5 + pow(cm, 40.0) * 0.045) * clear * moonUp * uNight;
    }
    col += stars(d) * uNight * up * (1.0 - alpha) * smoothstep(0.0, 0.12, d.y) * (1.0 - uOvercastAmt);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Uniform objects shared by the sky, the fog patch, the terrain/city materials and the environment capture. */
function makeShared() {
  return {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunE: { value: 1000 },
    uBetaR: { value: new THREE.Vector3() },
    uBetaM: { value: new THREE.Vector3() },
    uMieG: { value: 0.8 },
    uTwilight: { value: 0 },
    uNight: { value: 0 },
    uOvercast: { value: new THREE.Vector3(0.6, 0.63, 0.68) },
    uOvercastAmt: { value: 0 },
    uSkyScale: { value: 0.03 },
    uFogFalloff: { value: 0.0025 },
    uWet: { value: 0 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
  };
}
export type SharedUniforms = ReturnType<typeof makeShared>;

export const shared: SharedUniforms = makeShared();

/**
 * Gives a world material sky-coloured, height-aware fog (aerial perspective) and access to the shared
 * atmosphere uniforms. Chains any `onBeforeCompile` that is already installed (cascaded shadows),
 * so call it AFTER the shadow rig has set the material up.
 */
export function useAtmosphere(material: THREE.Material, extra?: (shader: THREE.WebGLProgramParametersWithUniforms) => void): void {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = shader.vertexShader
      .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\n#ifdef USE_FOG\nvarying vec3 vFogViewPos;\n#endif')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n#ifdef USE_FOG\nvFogViewPos = mvPosition.xyz;\n#endif');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <fog_pars_fragment>', SKY_RADIANCE_GLSL + WORLD_UNIFORMS_GLSL + FOG_PARS_FRAGMENT)
      .replace('#include <fog_fragment>', FOG_FRAGMENT);
    extra?.(shader);
  };
  material.customProgramCacheKey = () => 'atmo' + (extra ? extra.toString().length : 0) + material.uuid;
}

export interface AtmosphereQuality {
  cloudOctaves: number;
  envSize: number;
  envInterval: number;
}

/**
 * Owns the sky dome, the shared atmosphere uniforms, fog and the dynamic environment map
 * (image-based lighting captured from the live sky).
 */
export class Atmosphere {
  readonly group = new THREE.Group();
  readonly sunColor = new THREE.Color();
  readonly moonColor = new THREE.Color(0.55, 0.65, 0.95);
  /** Mean sky brightness, used to dim precipitation at night. */
  skyLuma = 0.5;

  private readonly dome: THREE.Mesh;
  private readonly domeMaterial: THREE.ShaderMaterial;
  private readonly envScene = new THREE.Scene();
  private readonly pmrem: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private envTimer = 0;
  private envDirty = true;
  private readonly windOffset = new THREE.Vector2();
  private readonly cloudUniforms = {
    uMoonDir: { value: new THREE.Vector3() },
    uSunColor: { value: new THREE.Color() },
    uCoverage: { value: 0.3 },
    uCloudDensity: { value: 0.5 },
    uCloudDark: { value: 0 },
    uWind: { value: this.windOffset },
    uOct: { value: 5 },
    uEnv: { value: 0 },
  };
  private quality: AtmosphereQuality;
  private readonly tmpColor = new THREE.Color();

  constructor(renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene, quality: AtmosphereQuality) {
    this.quality = quality;
    const geo = new THREE.SphereGeometry(1, 40, 20);
    this.domeMaterial = new THREE.ShaderMaterial({
      uniforms: { ...shared, ...this.cloudUniforms },
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(geo, this.domeMaterial);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    this.group.add(this.dome);

    // The environment capture uses its own material so sun disc / moon / stars can be switched off.
    const envMat = new THREE.ShaderMaterial({
      uniforms: { ...shared, ...this.cloudUniforms, uEnv: { value: 1 } },
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    const envDome = new THREE.Mesh(geo, envMat);
    envDome.scale.setScalar(50);
    envDome.frustumCulled = false;
    this.envScene.add(envDome);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.cloudUniforms.uOct.value = quality.cloudOctaves;
  }

  setQuality(q: AtmosphereQuality): void {
    this.quality = q;
    this.cloudUniforms.uOct.value = q.cloudOctaves;
    this.envDirty = true;
  }

  /** Force the next frame to recapture the environment (after big time/weather jumps). */
  markEnvDirty(): void {
    this.envDirty = true;
  }

  update(dt: number, camera: THREE.Camera, tod: TimeOfDay, weather: Weather, flash: number): void {
    const cur = weather.current;
    const look = tod.look;
    const sunY = tod.sunDir.y;

    // --- Preetham coefficients (same constants as the three.js Sky addon) -----------------------
    const turb = cur.turbidity;
    const sunfade = 1 - clamp(1 - Math.exp(sunY * 450000 / 450000), 0, 1);
    const rayleigh = 1.2 - (1 - sunfade) * 1.0;
    shared.uBetaR.value.set(5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5).multiplyScalar(rayleigh);
    const c = 0.2 * turb * 1e-17;
    shared.uBetaM.value.set(1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14).multiplyScalar(0.434 * c * 0.0055);
    const zenithCos = clamp(sunY, -1, 1);
    const cutoff = 1.6110731556870734;
    shared.uSunE.value = 1000 * Math.max(0, 1 - Math.exp(-((cutoff - Math.acos(zenithCos)) / 1.5)));
    shared.uSunDir.value.copy(tod.sunDir);
    shared.uMieG.value = 0.8;
    shared.uTwilight.value = look.twilight;
    shared.uNight.value = look.night;
    shared.uOvercast.value.set(cur.tint.r, cur.tint.g, cur.tint.b);
    shared.uOvercastAmt.value = cur.overcast;
    shared.uFogFalloff.value = cur.fogFalloff;
    shared.uWet.value = weather.wetness;
    shared.uTime.value += dt;
    shared.uFlash.value = flash;

    // --- direct light colours -------------------------------------------------------------------
    sunTransmittance(tod.sunElev, turb, this.sunColor);
    // Soften the pure Rayleigh extinction so sunsets read orange, not black-red, and keep it bright.
    this.sunColor.r = Math.pow(this.sunColor.r, 0.55);
    this.sunColor.g = Math.pow(this.sunColor.g, 0.7);
    this.sunColor.b = Math.pow(this.sunColor.b, 0.95);
    const cu = this.cloudUniforms;
    cu.uSunColor.value.copy(this.sunColor);
    cu.uMoonDir.value.copy(tod.moonDir);
    cu.uCoverage.value = cur.coverage;
    cu.uCloudDensity.value = cur.cloudDensity;
    cu.uCloudDark.value = cur.cloudDark;
    // Cloud drift follows the wind phase.
    const w = weather.windPhase * 0.004;
    this.windOffset.set(w, w * 0.35);

    // --- follow the camera ----------------------------------------------------------------------
    this.dome.position.copy(camera.position);
    const far = (camera as THREE.PerspectiveCamera).far ?? 1000;
    this.dome.scale.setScalar(far * 0.9);

    // --- fog density ---------------------------------------------------------------------------------
    if (!this.scene.fog) this.scene.fog = new THREE.FogExp2(0xffffff, cur.fog);
    (this.scene.fog as THREE.FogExp2).density = cur.fog;

    // Rough mean sky brightness for particle shading.
    this.skyLuma = clamp(0.08 + 0.9 * (1 - look.night) * (0.35 + 0.65 * clamp(sunY * 2.5, 0, 1)), 0.04, 1);

    // --- environment capture ---------------------------------------------------------------------
    this.envTimer += dt;
    if (this.envDirty || this.envTimer >= this.quality.envInterval) {
      this.captureEnv();
      this.envTimer = 0;
      this.envDirty = false;
    }
    this.scene.environmentIntensity = look.envIntensity * (1 - 0.15 * cur.overcast);
    void this.tmpColor;
  }

  private captureEnv(): void {
    const old = this.envTarget;
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 1, 200, { size: this.quality.envSize } as never);
    this.scene.environment = this.envTarget.texture;
    old?.dispose();
  }

  dispose(): void {
    this.envTarget?.dispose();
    this.pmrem.dispose();
  }
}
