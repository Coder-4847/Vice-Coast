import * as THREE from 'three';
import { NOISE_GLSL } from './skyGlsl';

/** The flat district where the placeholder city sits; streets in the terrain shader use the same numbers. */
export const CITY = { x: 980, z: 0, flat: 760, blend: 260, height: 4.5, cell: 64 } as const;
export const TERRAIN = { x0: -800, x1: 3000, z0: -1800, z1: 1800 } as const;

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

  const flat = 1 - smooth(CITY.flat, CITY.flat + CITY.blend, d);
  return h + (CITY.height - h) * flat * smooth(30, 170, x);
}

/** Procedural terrain: one mesh, material blends sand/grass/rock/snow by height + slope and draws the city's streets. */
export class Terrain {
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
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = transformed;\nvWN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;\nuniform vec4 uCity;\n${NOISE_GLSL}`)
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

  // City streets: asphalt grid, kerbs, lane dashes, pavement.
  float cityMask = 1.0 - smoothstep(uCity.z - 40.0, uCity.z + uCity.w * 0.7, length(vWPos.xz - uCity.xy));
  cityMask *= smoothstep(150.0, 200.0, vWPos.x) * (1.0 - smoothstep(0.0, 0.2, slope));
  float asphaltW = 0.0;
  float puddleW = 0.0;
  if (cityMask > 0.001) {
    vec2 g = vWPos.xz / ${CITY.cell.toFixed(1)};
    vec2 e = min(fract(g), 1.0 - fract(g)) * ${CITY.cell.toFixed(1)};
    float sd = min(e.x, e.y);
    asphaltW = 1.0 - smoothstep(6.7, 7.0, sd);
    float kerb = smoothstep(7.0, 7.2, sd) * (1.0 - smoothstep(7.5, 7.8, sd));
    vec3 asph = mix(vec3(0.075, 0.075, 0.082), vec3(0.12, 0.12, 0.13), nC) * (0.9 + 0.2 * nB);
    vec3 paving = mix(vec3(0.36, 0.35, 0.34), vec3(0.45, 0.44, 0.43), nC);
    vec3 city = mix(paving, asph, asphaltW);
    city = mix(city, vec3(0.62, 0.61, 0.60), kerb);
    float along = e.x < e.y ? vWPos.z : vWPos.x;
    float dash = step(0.5, fract(along / 7.0)) * (1.0 - smoothstep(0.1, 0.22, sd));
    city = mix(city, vec3(0.80, 0.62, 0.14), dash * asphaltW);
    col = mix(col, city, cityMask);
    rough = mix(rough, mix(0.92, 0.82, asphaltW), cityMask);
    float flatMask = smoothstep(0.985, 0.998, n.y);
    puddleW = smoothstep(0.52 - 0.18 * uWet, 0.64 - 0.18 * uWet, n_fbm(vWPos.xz * 0.09 + 3.0)) * flatMask * cityMask * uWet;
    asphaltW *= cityMask;
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
