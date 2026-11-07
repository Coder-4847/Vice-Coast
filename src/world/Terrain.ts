import * as THREE from 'three';
import { NOISE_GLSL } from './skyGlsl';
import { CITY, TERRAIN, HM_CELL, HILL, coastHeight, lakeLevel, waterLevelAt, terrainHeight as analyticHeight } from './heightfield';
import { TerrainData, groundY } from './TerrainData';
import { HM_H, HM_W, SF_H, SF_W } from './terrainBake';
import { installRoads } from './roads';

// The road beds are part of the ground: install them before anything samples the terrain.
installRoads();

export { CITY, TERRAIN, HILL, coastHeight, HM_CELL, lakeLevel, waterLevelAt };
/** Ground height in metres at world (x, z): the baked grid once the world is ready, the analytic function before. */
export const terrainHeight = groundY;
export { analyticHeight };

/** Procedural terrain: a geometry clipmap drawn in one instanced call. Heights, normals and biome weights come from the bake. */
export interface CityTextures {
  /** 4096×2 half-float: row 0 = N–S road field along x, row 1 = E–W road field along z (R dist-to-edge, G offset, B half-width, A arterial). */
  road: THREE.Texture;
  /** RGBA8 zone mask: R grass, G plaza, B parking/yard, A boardwalk. */
  zone: THREE.Texture;
  roadBox: THREE.Vector4;
  zoneBox: THREE.Vector4;
  radius: number;
}

const LEVELS = 6;
const PATCH_N = 32;
const MAX_PATCHES = 16 * LEVELS;

function patchGeometry(): THREE.InstancedBufferGeometry {
  const n = PATCH_N;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pos.push(i / n, 0, j / n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + 1;
      const c = a + n + 1;
      const d = c + 1;
      // alternate the diagonal so slopes don't show a directional bias
      if ((i + j) & 1) idx.push(a, c, b, b, c, d);
      else idx.push(a, c, d, a, d, b);
    }
  }
  // skirts: a copy of each border vertex pulled down by the shader (y = 1 marks it)
  const ring: number[] = [];
  const edge = (get: (k: number) => number): void => {
    const start = pos.length / 3;
    for (let k = 0; k <= n; k++) {
      const v = get(k);
      pos.push(pos[v * 3]!, 1, pos[v * 3 + 2]!);
    }
    for (let k = 0; k < n; k++) {
      const v0 = get(k);
      const v1 = get(k + 1);
      ring.push(v0, start + k, v1, v1, start + k, start + k + 1);
    }
  };
  edge((k) => k); // north edge (j = 0)
  edge((k) => n * (n + 1) + k); // south
  edge((k) => k * (n + 1)); // west
  edge((k) => k * (n + 1) + n); // east
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex([...idx, ...ring, ...ring.slice().reverse()]);
  g.instanceCount = 0;
  return g;
}

export class Terrain {
  /** Set by the city before the terrain material compiles. */
  static cityData: CityTextures | null = null;
  /** Shared uniform objects: textures are swapped in once the bake finishes. */
  static readonly uniforms = {
    uHeightTex: { value: null as THREE.Texture | null },
    uNormTex: { value: null as THREE.Texture | null },
    uSurfTex: { value: null as THREE.Texture | null },
    uHM: { value: new THREE.Vector4(TERRAIN.x0, TERRAIN.z0, 1 / HM_CELL, 0) },
    uHMSize: { value: new THREE.Vector4(HM_W, HM_H, SF_W, SF_H) },
  };

  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardMaterial;
  private readonly geo = patchGeometry();
  private readonly patches = new Float32Array(MAX_PATCHES * 4);
  private readonly attr: THREE.InstancedBufferAttribute;
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly inv = new THREE.Matrix4();
  private readonly box = new THREE.Box3();
  /** Number of terrain patches drawn last frame. */
  drawn = 0;

  constructor(_segments = 0) {
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    this.attr = new THREE.InstancedBufferAttribute(this.patches, 4);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aPatch', this.attr);
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  /** Quality changes do not alter the clipmap. */
  rebuild(_segments: number): void {}

  /** Upload the baked world to the GPU. */
  attach(data: TerrainData): void {
    const u = Terrain.uniforms;
    const h = new THREE.DataTexture(data.heights, HM_W, HM_H, THREE.RedFormat, THREE.FloatType);
    h.minFilter = h.magFilter = THREE.NearestFilter;
    h.generateMipmaps = false;
    h.needsUpdate = true;
    const n = new THREE.DataTexture(data.normals, HM_W, HM_H, THREE.RGBAFormat, THREE.UnsignedByteType);
    n.minFilter = THREE.LinearMipmapLinearFilter;
    n.magFilter = THREE.LinearFilter;
    n.generateMipmaps = true;
    n.anisotropy = 4;
    n.needsUpdate = true;
    const s = new THREE.DataTexture(data.surf, SF_W, SF_H, THREE.RGBAFormat, THREE.UnsignedByteType);
    s.minFilter = THREE.LinearMipmapLinearFilter;
    s.magFilter = THREE.LinearFilter;
    s.generateMipmaps = true;
    s.needsUpdate = true;
    for (const t of [h, n, s]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    u.uHeightTex.value = h;
    u.uNormTex.value = n;
    u.uSurfTex.value = s;
  }

  /** Choose the visible patches around the camera (frustum-culled, nearest level wins). */
  update(camera: THREE.Camera): void {
    this.inv.copy(camera.matrixWorld).invert();
    this.pv.multiplyMatrices((camera as THREE.PerspectiveCamera).projectionMatrix, this.inv);
    this.frustum.setFromProjectionMatrix(this.pv);
    const cx = camera.position.x;
    const cz = camera.position.z;
    let n = 0;
    let prev = { x0: 0, x1: 0, z0: 0, z1: 0, on: false };
    for (let l = 0; l < LEVELS; l++) {
      const cell = HM_CELL * (1 << l);
      const size = PATCH_N * cell;
      const sx = Math.round(cx / size) * size;
      const sz = Math.round(cz / size) * size;
      const cur = { x0: sx - 2 * size, x1: sx + 2 * size, z0: sz - 2 * size, z1: sz + 2 * size, on: true };
      for (let a = 0; a < 4; a++) {
        for (let b = 0; b < 4; b++) {
          const x0 = sx + (a - 2) * size;
          const z0 = sz + (b - 2) * size;
          if (x0 + size < TERRAIN.x0 - 64 || x0 > TERRAIN.x1 + 64 || z0 + size < TERRAIN.z0 - 64 || z0 > TERRAIN.z1 + 64) continue;
          if (prev.on && x0 >= prev.x0 && x0 + size <= prev.x1 && z0 >= prev.z0 && z0 + size <= prev.z1) continue;
          this.box.min.set(x0, -90, z0);
          this.box.max.set(x0 + size, 1150, z0 + size);
          if (!this.frustum.intersectsBox(this.box)) continue;
          this.patches[n * 4] = x0;
          this.patches[n * 4 + 1] = z0;
          this.patches[n * 4 + 2] = size;
          this.patches[n * 4 + 3] = l;
          n++;
        }
      }
      prev = cur;
    }
    this.drawn = n;
    this.geo.instanceCount = n;
    this.attr.needsUpdate = true;
  }

  /** Shader patch (installed through LightRig.register so it chains with shadows and fog). */
  static patch = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    Object.assign(shader.uniforms, Terrain.uniforms);
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
      .replace('#include <common>', `#include <common>
attribute vec4 aPatch;
uniform highp sampler2D uHeightTex;
uniform vec4 uHM;
uniform vec4 uHMSize;
varying vec3 vWPos;
varying vec2 vNuv;
varying vec2 vSuv;`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', `
vec2 wxz = aPatch.xy + position.xz * aPatch.z;
vec2 hp = (wxz - uHM.xy) * uHM.z;
ivec2 ic = clamp(ivec2(floor(hp + 0.5)), ivec2(0), ivec2(uHMSize.xy) - 1);
float hh = texelFetch(uHeightTex, ic, 0).r;
hh -= aPatch.w * 0.22 + position.y * aPatch.z * 0.3 + 0.04;
vec3 transformed = vec3(wxz.x, hh, wxz.y);
vWPos = transformed;
vNuv = (hp + 0.5) / uHMSize.xy;
vSuv = (hp * 0.5 + 0.5) / uHMSize.zw;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nvarying vec2 vNuv;\nvarying vec2 vSuv;\nuniform sampler2D uNormTex;\nuniform sampler2D uSurfTex;\nuniform vec4 uCity;\nuniform sampler2D uRoadTex;\nuniform sampler2D uZoneTex;\nuniform vec4 uRoadBox;\nuniform vec4 uZoneBox;\nuniform float uCityR;\nvec3 tN = vec3(0.0, 1.0, 0.0);\n${NOISE_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec4 nt = texture2D(uNormTex, vNuv);
  tN = vec3(nt.r * 2.0 - 1.0, 0.0, nt.g * 2.0 - 1.0);
  tN.y = sqrt(max(0.0, 1.0 - dot(tN.xz, tN.xz)));
  vec3 n = tN;
  vec4 sf = texture2D(uSurfTex, vSuv);
  float h = vWPos.y;
  float slope = 1.0 - n.y;
  float nA = n_fbm(vWPos.xz * 0.012);
  float nB = n_fbm(vWPos.xz * 0.35);
  float nC = n_noise(vWPos.xz * 3.1);

  // Base ground: dry-to-lush grass, then the biome layers painted over it.
  vec3 sand = mix(vec3(0.74, 0.64, 0.45), vec3(0.62, 0.53, 0.38), nB);
  vec3 dry = vec3(0.27, 0.24, 0.12);
  vec3 lush = vec3(0.09, 0.18, 0.055);
  vec3 grass = mix(dry, lush, smoothstep(0.35, 0.65, nA)) * (0.85 + 0.3 * nB);
  vec3 rock = mix(vec3(0.22, 0.20, 0.19), vec3(0.34, 0.30, 0.27), nB);
  vec3 snow = vec3(0.72, 0.75, 0.80);
  // desert: warm sand over reddish dirt, wind ripples and patches of dark cinder gravel
  vec3 desertCol = vec3(0.45, 0.31, 0.18);
  vec3 desertRock = vec3(0.38, 0.2, 0.12);
  if (sf.r > 0.02) {
    float ripple = 0.5 + 0.5 * sin(dot(vWPos.xz, vec2(0.92, 0.38)) * 1.9 + nA * 14.0);
    vec3 dSand = mix(vec3(0.58, 0.36, 0.17), vec3(0.45, 0.26, 0.12), smoothstep(0.3, 0.7, nA));
    dSand *= 0.9 + 0.12 * ripple * smoothstep(0.55, 0.9, nB);
    float nL = n_fbm(vWPos.xz * 0.0031 + 17.0);
    float cinderW = smoothstep(0.56, 0.72, nL) * 0.85;
    vec3 cinder = mix(vec3(0.085, 0.065, 0.06), vec3(0.14, 0.10, 0.085), nB);
    desertCol = mix(dSand, cinder, cinderW) * (0.88 + 0.24 * nC);
    desertRock = mix(vec3(0.30, 0.15, 0.09), vec3(0.50, 0.28, 0.16), smoothstep(0.2, 0.8, fract(h * 0.045 + nA * 0.6)));
  }
  // forest floor: needle litter and moss
  vec3 forestCol = mix(vec3(0.19, 0.13, 0.07), vec3(0.08, 0.15, 0.06), smoothstep(0.3, 0.7, nA)) * (0.8 + 0.4 * nB);
  vec3 dirtCol = mix(vec3(0.27, 0.19, 0.12), vec3(0.20, 0.14, 0.09), nB) * (0.9 + 0.2 * nC);
  // dry salt pan: bright crust with polygonal cracks
  vec3 saltCol = vec3(0.62, 0.60, 0.55);
  if (sf.b > 0.02) {
    vec2 cp = vWPos.xz * 0.45;
    float crack = 1.0 - smoothstep(0.0, 0.07, abs(n_noise(cp) - 0.5)) * 0.9;
    crack = max(crack, 1.0 - smoothstep(0.0, 0.05, abs(n_noise(cp * 2.3 + 7.0) - 0.5)));
    saltCol = mix(vec3(0.66, 0.64, 0.59), vec3(0.55, 0.53, 0.48), nB) * (1.0 - 0.2 * crack);
  }

  float sandW = max((1.0 - smoothstep(2.2, 9.0, h + nA * 5.0)) * (1.0 - smoothstep(200.0, 240.0, vWPos.x)), 1.0 - smoothstep(1.2, 3.4, h + nA * 1.5));
  float rockW = smoothstep(0.18, 0.46, slope + (nB - 0.5) * 0.07);
  float snowLine = 545.0 + nA * 70.0 - slope * 120.0;
  float snowW = smoothstep(snowLine, snowLine + 55.0, h) * (1.0 - smoothstep(0.42, 0.7, slope));
  vec3 col = grass;
  col = mix(col, desertCol, sf.r);
  col = mix(col, forestCol, sf.g);
  col = mix(col, dirtCol, sf.a * 0.75 * (1.0 - sf.g * 0.6));
  col = mix(col, saltCol, sf.b);
  col = mix(col, sand, sandW);
  float paved = nt.b;
  rock = mix(rock, desertRock, sf.r);
  col = mix(col, rock, rockW);
  col = mix(col, snow, snowW);
  if (paved > 0.01) {
    float joint = smoothstep(0.485, 0.5, max(abs(fract(vWPos.x / 3.0) - 0.5), abs(fract(vWPos.z / 3.0) - 0.5)));
    vec3 pv = vWPos.z > 2900.0 ? mix(vec3(0.46, 0.43, 0.38), vec3(0.54, 0.50, 0.44), nC) : mix(vec3(0.20, 0.20, 0.21), vec3(0.28, 0.28, 0.29), nC);
    pv *= 1.0 - 0.16 * joint;
    col = mix(col, pv, paved);
    sandW = sandW * (1.0 - paved);
  }
  float rough = mix(0.96, 0.85, sandW);
  rough = mix(rough, 0.8, rockW);
  rough = mix(rough, 0.9, sf.b);
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
    lot = mix(lot, tile, zn.g);
    lot = mix(lot, grassL, zn.r);
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
      float tone = 0.3 + 0.7 * n_hash21(bc);
      vec3 wood = mix(vec3(0.50, 0.33, 0.19), vec3(0.64, 0.45, 0.26), tone);
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
}
`)
      .replace('void main() {', 'float tRough = 0.95;\nfloat tDetail = 1.0;\nvoid main() {')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = tRough;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize((viewMatrix * vec4(tN, 0.0)).xyz);')
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
    this.geo.dispose();
    this.material.dispose();
  }
}
