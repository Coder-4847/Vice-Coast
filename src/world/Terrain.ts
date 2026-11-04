import * as THREE from 'three';
import { NOISE_GLSL } from './skyGlsl';

/** The flat district where the placeholder city sits; streets in the terrain shader use the same numbers. */
export const CITY = { x: 980, z: 0, flat: 760, blend: 260, height: 4.5, cell: 64 } as const;
export const TERRAIN = { x0: -800, x1: 3000, z0: -1800, z1: 1800 } as const;
/** Crestview Hill, north of the city: a gentle rise carrying the villa road. */
export const HILL = { x: 1060, z: -1040, h: 64, s: 300 } as const;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (x: number, y: number): number => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const vnoise = (x: number, y: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm = (x: number, y: number, oct = 5): number => {
  let a = 0.5;
  let f = 0;
  for (let i = 0; i < oct; i++) {
    f += a * vnoise(x, y);
    x = x * 2.03 + 5.2;
    y = y * 2.03 + 1.3;
    a *= 0.5;
  }
  return f;
};

/** Ocean-floor/beach profile along x (west = sea). Also mirrored in the ocean shader. */
export const coastHeight = (x: number): number => -70 + 74 * smooth(-260, 40, x);

/** Ground height in metres at world (x, z). Pure function so gameplay can query it without the mesh. */
export function terrainHeight(x: number, z: number): number {
  let h = coastHeight(x);
  const dx = x - CITY.x;
  const dz = z - CITY.z;
  const d = Math.hypot(dx, dz);

  // Mountain ring around the valley plus a high eastern wall.
  const ring = smooth(1050, 1750, Math.hypot(dx * 0.7, dz * 1.0));
  const ridge = Math.pow(fbm(x * 0.0017, z * 0.0017, 5), 1.7);
  const wall = smooth(1500, 2600, x);
  h += ring * (40 + 330 * ridge) + wall * 170 * (0.5 + ridge);

  // Gentle rolling dunes/hills away from the flat district.
  const roll = (fbm(x * 0.006, z * 0.006, 4) - 0.35) * 22 * smooth(CITY.flat * 0.6, CITY.flat + 300, d) * smooth(20, 260, x);
  h += roll;

  const hx = x - HILL.x;
  const hz = z - HILL.z;
  h += HILL.h * Math.exp(-(hx * hx + hz * hz) / (2 * HILL.s * HILL.s));

  const flat = 1 - smooth(CITY.flat, CITY.flat + CITY.blend, d);
  return h + (CITY.height - h) * flat * smooth(30, 170, x);
}

/** Procedural terrain: one mesh, material blends sand/grass/rock/snow by height + slope and draws the city's streets. */
export interface CityTextures {
  /** 4096×2 half-float: row 0 = N–S road field along x, row 1 = E–W road field along z (R dist-to-edge, G offset, B half-width, A arterial). */
  road: THREE.Texture;
  /** RGBA8 zone mask: R grass, G plaza, B parking/yard, A boardwalk. */
  zone: THREE.Texture;
  roadBox: THREE.Vector4;
  zoneBox: THREE.Vector4;
  radius: number;
}

export class Terrain {
  /** Set by the city before the terrain material compiles. */
  static cityData: CityTextures | null = null;
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardMaterial;
  private segments = 0;

  constructor(segments: number) {
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.rebuild(segments);
  }

  rebuild(segments: number): void {
    if (segments === this.segments) return;
    this.segments = segments;
    const w = TERRAIN.x1 - TERRAIN.x0;
    const d = TERRAIN.z1 - TERRAIN.z0;
    const nx = segments;
    const nz = Math.round(segments * (d / w));
    const geo = new THREE.PlaneGeometry(w, d, nx, nz);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (TERRAIN.x0 + TERRAIN.x1) / 2;
      const z = pos.getZ(i) + (TERRAIN.z0 + TERRAIN.z1) / 2;
      pos.setXYZ(i, x, terrainHeight(x, z), z);
    }
    geo.computeVertexNormals();
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }

  /** Shader patch (installed through LightRig.register so it chains with shadows and fog). */
  static patch = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    shader.uniforms.uCity = { value: new THREE.Vector4(CITY.x, CITY.z, CITY.flat, CITY.blend) };
    const cd = Terrain.cityData;
    const dummy = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    dummy.needsUpdate = true;
    shader.uniforms.uRoadTex = { value: cd?.road ?? dummy };
    shader.uniforms.uZoneTex = { value: cd?.zone ?? dummy };
    shader.uniforms.uRoadBox = { value: cd?.roadBox ?? new THREE.Vector4(0, 0, 1, 1) };
    shader.uniforms.uZoneBox = { value: cd?.zoneBox ?? new THREE.Vector4(0, 0, 1, 1) };
    shader.uniforms.uCityR = { value: cd?.radius ?? CITY.flat };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = transformed;\nvWN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;\nuniform vec4 uCity;\nuniform sampler2D uRoadTex;\nuniform sampler2D uZoneTex;\nuniform vec4 uRoadBox;\nuniform vec4 uZoneBox;\nuniform float uCityR;\n${NOISE_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 n = normalize(vWN);
  float h = vWPos.y;
  float slope = 1.0 - n.y;
  float nA = n_fbm(vWPos.xz * 0.012);
  float nB = n_fbm(vWPos.xz * 0.35);
  float nC = n_noise(vWPos.xz * 3.1);

  vec3 sand = mix(vec3(0.74, 0.64, 0.45), vec3(0.62, 0.53, 0.38), nB);
  vec3 dry = vec3(0.36, 0.32, 0.17);
  vec3 lush = vec3(0.13, 0.23, 0.08);
  vec3 grass = mix(dry, lush, smoothstep(0.35, 0.65, nA)) * (0.85 + 0.3 * nB);
  vec3 rock = mix(vec3(0.30, 0.27, 0.25), vec3(0.46, 0.41, 0.36), nB);
  vec3 snow = vec3(0.90, 0.93, 0.98);

  float sandW = 1.0 - smoothstep(2.2, 9.0, h + nA * 5.0);
  float rockW = smoothstep(0.16, 0.42, slope + (nB - 0.5) * 0.16);
  float snowW = smoothstep(215.0, 255.0, h + nA * 40.0) * (1.0 - smoothstep(0.4, 0.7, slope));
  vec3 col = mix(grass, sand, sandW);
  col = mix(col, rock, rockW);
  col = mix(col, snow, snowW);
  float rough = mix(0.96, 0.85, sandW);
  rough = mix(rough, 0.8, rockW);
  rough = mix(rough, 0.55, snowW);

  // City ground: roads, sidewalks, markings and lot surfaces come from the plan's road-field and zone textures.
  float cityMask = (1.0 - smoothstep(uCityR - 35.0, uCityR + 25.0, length(vWPos.xz - uCity.xy))) * smoothstep(205.0, 216.0, vWPos.x) * (1.0 - smoothstep(0.0, 0.2, slope));
  vec4 rx = texture2D(uRoadTex, vec2((vWPos.x - uRoadBox.x) / uRoadBox.z, 0.25));
  vec4 rz = texture2D(uRoadTex, vec2((vWPos.z - uRoadBox.y) / uRoadBox.w, 0.75));
  vec2 zuv = (vWPos.xz - uZoneBox.xy) / uZoneBox.zw;
  vec4 zn = texture2D(uZoneTex, zuv) * step(0.0, zuv.x) * step(zuv.x, 1.0) * step(0.0, zuv.y) * step(zuv.y, 1.0);
  float inBox = step(uRoadBox.x, vWPos.x) * step(vWPos.x, uRoadBox.x + uRoadBox.z) * step(uRoadBox.y, vWPos.z) * step(vWPos.z, uRoadBox.y + uRoadBox.w);
  float asphaltW = 0.0;
  float puddleW = 0.0;
  float parkW = 0.0;
  if (cityMask > 0.001 || zn.a > 0.001) {
    float dX = rx.r;
    float dZ = rz.r;
    float dRoad = min(dX, dZ);
    asphaltW = (1.0 - smoothstep(-0.2, 0.2, dRoad)) * inBox;
    float sideW = smoothstep(-0.1, 0.1, dRoad) * (1.0 - smoothstep(3.45, 3.75, dRoad)) * inBox;
    float kerbW = smoothstep(-0.05, 0.1, dRoad) * (1.0 - smoothstep(0.25, 0.45, dRoad)) * inBox;

    vec3 conc = mix(vec3(0.30, 0.295, 0.285), vec3(0.40, 0.39, 0.375), nC) * (0.92 + 0.16 * nB);
    vec3 grassL = mix(vec3(0.10, 0.20, 0.07), vec3(0.17, 0.27, 0.09), nB) * (0.85 + 0.3 * nC);
    float chk = mod(floor(vWPos.x / 2.5) + floor(vWPos.z / 2.5), 2.0);
    vec3 tile = mix(vec3(0.60, 0.57, 0.52), vec3(0.50, 0.47, 0.43), chk) * (0.94 + 0.1 * nC);
    float stall = step(0.95, fract(vWPos.x / 2.8)) * step(0.35, fract(vWPos.z / 18.0));
    vec3 parking = mix(vec3(0.085, 0.085, 0.09), vec3(0.14, 0.14, 0.145), nC);
    parking = mix(parking, vec3(0.7), stall * 0.55);
    vec3 pave = mix(vec3(0.46, 0.45, 0.43), vec3(0.54, 0.53, 0.51), nC);
    float joint = smoothstep(0.485, 0.5, max(abs(fract(vWPos.x / 2.0) - 0.5), abs(fract(vWPos.z / 2.0) - 0.5)));
    pave *= 1.0 - 0.14 * joint;
    vec3 asph = mix(vec3(0.075, 0.075, 0.082), vec3(0.125, 0.125, 0.135), nC) * (0.9 + 0.2 * nB);

    #ifdef USE_FOG
      float cdist = length(vFogViewPos);
    #else
      float cdist = 0.0;
    #endif
    float mfade = 1.0 - smoothstep(110.0, 260.0, cdist);

    // lane paint
    float paintW = 0.0;
    vec3 paint = vec3(0.82, 0.82, 0.80);
    bool nsRoad = dX < 0.0 && dZ >= 0.0;
    bool ewRoad = dZ < 0.0 && dX >= 0.0;
    if (nsRoad || ewRoad) {
      vec4 rr = nsRoad ? rx : rz;
      float aoff = abs(rr.g);
      float hw = rr.b;
      float art = rr.a;
      float along = nsRoad ? vWPos.z : vWPos.x;
      float dash = step(0.42, fract(along / 9.0));
      float dbl = (1.0 - smoothstep(0.05, 0.09, abs(aoff - 0.24))) * art;
      float one = (1.0 - smoothstep(0.05, 0.09, aoff)) * dash * (1.0 - art);
      float lane = (1.0 - smoothstep(0.05, 0.09, abs(aoff - hw * 0.5))) * dash * art;
      float edge = 1.0 - smoothstep(0.05, 0.09, abs(aoff - (hw - 0.45)));
      float cd = nsRoad ? dZ : dX;
      float cw = step(0.9, cd) * step(cd, 4.4) * step(aoff, hw - 0.5) * step(0.5, fract(rr.g * 0.9));
      float stop = step(5.0, cd) * step(cd, 5.5) * step(0.4, aoff) * step(aoff, hw - 0.5) * 0.0;
      vec3 yellow = vec3(0.78, 0.58, 0.10);
      float ylw = max(dbl, one);
      float wht = max(max(lane, edge), max(cw, stop));
      paintW = max(ylw, wht) * mfade;
      paint = mix(paint, yellow, step(wht, ylw));
    }
    vec3 lot = conc;
    lot = mix(lot, grassL, zn.r);
    lot = mix(lot, tile, zn.g);
    lot = mix(lot, parking, zn.b);
    vec3 cityCol = lot;
    cityCol = mix(cityCol, pave, sideW);
    cityCol = mix(cityCol, vec3(0.62, 0.61, 0.60), kerbW);
    cityCol = mix(cityCol, asph, asphaltW);
    cityCol = mix(cityCol, paint * (0.92 + 0.12 * nC), paintW * asphaltW);
    col = mix(col, cityCol, cityMask);
    rough = mix(rough, mix(0.92, 0.8, asphaltW) , cityMask);
    rough = mix(rough, 0.6, paintW * asphaltW * cityMask);
    float flatMask = smoothstep(0.985, 0.998, n.y);
    parkW = zn.b * (1.0 - sideW);
    puddleW = smoothstep(0.52 - 0.18 * uWet, 0.64 - 0.18 * uWet, n_fbm(vWPos.xz * 0.09 + 3.0)) * flatMask * cityMask * uWet * max(asphaltW, parkW);
    asphaltW *= cityMask;

    // seaside boardwalk planks
    float bw = zn.a;
    if (bw > 0.001) {
      vec2 bc = vec2(floor(vWPos.x / 0.8), floor(vWPos.z / 5.0));
      float tone = n_hash21(bc);
      vec3 wood = mix(vec3(0.42, 0.29, 0.18), vec3(0.58, 0.42, 0.27), tone);
      float seam = smoothstep(0.0, 0.05, fract(vWPos.x / 0.8)) * (1.0 - smoothstep(0.94, 1.0, fract(vWPos.x / 0.8)));
      wood *= 0.55 + 0.45 * seam;
      col = mix(col, wood * (0.9 + 0.2 * nC), bw);
      rough = mix(rough, 0.82, bw);
    }
  }

  // Wet ground: darker, glossier, with standing puddles on flat paving.
  float wet = uWet * (1.0 - snowW);
  col *= 1.0 - 0.38 * wet * (1.0 - 0.5 * rockW);
  col *= 1.0 - 0.35 * puddleW;
  rough = mix(rough, 0.2, wet * 0.65);
  rough = mix(rough, 0.04, puddleW);
  diffuseColor.rgb = col;
  tRough = rough;
  tDetail = 1.0 - max(cityMask, snowW) * 0.8;
}`)
      .replace('void main() {', 'float tRough = 0.95;\nfloat tDetail = 1.0;\nvoid main() {')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = tRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  // Cheap bump from noise gradient, fading with distance to avoid shimmer.
  vec2 p = vWPos.xz * 0.9;
  float e = 0.25;
  float h0 = n_fbm(p);
  vec2 gr = vec2(n_fbm(p + vec2(e, 0.0)) - h0, n_fbm(p + vec2(0.0, e)) - h0) / e;
  #ifdef USE_FOG
    float dist = length(vFogViewPos);
  #else
    float dist = 0.0;
  #endif
  float amt = 0.18 * tDetail * (1.0 - smoothstep(30.0, 220.0, dist));
  vec3 gw = vec3(-gr.x, 0.0, -gr.y) * amt;
  normal = normalize(normal + (viewMatrix * vec4(gw, 0.0)).xyz);
}`);
  };

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
