import * as THREE from 'three';
import { NOISE_GLSL } from './skyGlsl';
import { roadPaths, type RoadKind, type RoadPath } from './roads';
import { terrainHeight } from './Terrain';

const SECTION = 96; // cross-sections per mesh (≈ 384 m) so distant stretches can be frustum-culled

const STYLE: Record<RoadKind, number> = { highway: 0, road: 1, street: 2, dirt: 3, rail: 4, runway: 5 };

/**
 * Highways, mountain and county roads, town streets, dirt trails and rail, as ribbon meshes draped over the carved
 * road beds. Markings, wear and wet-weather sheen come from one shader; the bed itself is part of the terrain heightfield.
 */
export class Roads {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  readonly dirtMaterial: THREE.MeshStandardMaterial;
  /** Meshes drawn last frame (for the debug panel). */
  count = 0;

  constructor() {
    const mk = (transparent: boolean): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.88, metalness: 0, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, transparent, depthWrite: !transparent,
    });
    this.material = mk(false);
    this.dirtMaterial = mk(true);
    for (const p of roadPaths()) this.build(p);
  }

  private build(p: RoadPath): void {
    const def = p.def;
    const kind = STYLE[def.kind];
    const sh = def.kind === 'dirt' ? 1.6 : def.kind === 'rail' ? 2.2 : def.kind === 'street' ? 3.2 : def.kind === 'runway' ? 4 : 2.4;
    const lat = [-(def.hw + sh), -def.hw, def.hw, def.hw + sh];
    const lanes = def.lanes ?? 0;
    for (let a = 0; a < p.n - 1; a += SECTION) {
      const b = Math.min(p.n - 1, a + SECTION);
      const rows = b - a + 1;
      const pos = new Float32Array(rows * 4 * 3);
      const info = new Float32Array(rows * 4 * 4);
      const idx: number[] = [];
      for (let i = a; i <= b; i++) {
        // right-hand normal of travel direction (x right, z down): n = (−tz, tx) points to the right of travel
        const nx = -p.tz[i]!, nz = p.tx[i]!;
        for (let k = 0; k < 4; k++) {
          const o = ((i - a) * 4 + k);
          const lx = p.xs[i]! + nx * lat[k]!, lz = p.zs[i]! + nz * lat[k]!;
          const natural = def.kind === 'dirt';
          const y = (natural ? terrainHeight(lx, lz) : p.ys[i]! + (k === 0 || k === 3 ? -0.02 : 0)) + 0.05 + (def.lift ?? 0) + (p.idx % 7) * 0.003;
          pos[o * 3] = lx; pos[o * 3 + 1] = y; pos[o * 3 + 2] = lz;
          info[o * 4] = lat[k]!;
          info[o * 4 + 1] = p.s[i]!;
          info[o * 4 + 2] = def.hw;
          info[o * 4 + 3] = kind + lanes * 0.1;
        }
        if (i < b) {
          const r0 = (i - a) * 4, r1 = r0 + 4;
          for (let k = 0; k < 3; k++) idx.push(r0 + k, r1 + k, r0 + k + 1, r0 + k + 1, r1 + k, r1 + k + 1);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
      g.setIndex(idx);
      g.computeVertexNormals();
      const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
      for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, def.kind === 'dirt' ? this.dirtMaterial : this.material);
      m.receiveShadow = true;
      m.renderOrder = def.kind === 'dirt' ? 1 : 0;
      this.group.add(m);
    }
  }

  /** Wetness comes from the weather through the shared terrain uniform. */
  static patch = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aInfo;\nvarying vec4 vInfo;\nvarying vec3 vRW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInfo = aInfo;\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec4 vInfo;\nvarying vec3 vRW;\n${NOISE_GLSL}`)
      .replace('void main() {', 'float rPaint = 0.0;\nfloat rRough = 0.9;\nfloat rAlpha = 1.0;\nvoid main() {')
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  float lat = vInfo.x;
  float along = vInfo.y;
  float hw = vInfo.z;
  float style = floor(vInfo.w + 0.01);
  float lanes = round((vInfo.w - style) * 10.0);
  float al = abs(lat);
  float nA = n_noise(vRW.xz * 0.7);
  float nB = n_noise(vRW.xz * 4.0);
  #ifdef USE_FOG
    float cdist = length(vFogViewPos);
  #else
    float cdist = 0.0;
  #endif
  float mfade = 1.0 - smoothstep(90.0, 320.0, cdist);
  vec3 col;
  if (style < 2.5) {
    // asphalt with wear in the wheel paths, gravel verge outside the edge line
    vec3 asph = mix(vec3(0.07, 0.07, 0.075), vec3(0.12, 0.12, 0.125), nB) * (0.9 + 0.2 * nA);
    float wear = smoothstep(0.9, 0.0, abs(al - hw * 0.45)) * 0.35;
    asph *= 1.0 + wear * 0.6;
    vec3 verge = mix(vec3(0.20, 0.17, 0.13), vec3(0.28, 0.24, 0.18), nB);
    if (style > 1.5) verge = mix(vec3(0.42, 0.41, 0.39), vec3(0.52, 0.51, 0.49), nB) * (1.0 - 0.14 * smoothstep(0.485, 0.5, max(abs(fract(vRW.x / 2.0) - 0.5), abs(fract(vRW.z / 2.0) - 0.5))));
    float onRoad = 1.0 - smoothstep(hw - 0.05, hw + 0.15, al);
    col = mix(verge, asph, onRoad);
    // lane paint
    float dash = step(0.7, fract(along / 12.0));
    float dashS = step(0.5, fract(along / 9.0));
    float yl = 0.0;
    float wh = 0.0;
    if (style < 0.5) {
      yl = max(1.0 - smoothstep(0.07, 0.12, abs(al - 0.22)), 0.0);
      wh = (1.0 - smoothstep(0.07, 0.12, abs(al - hw * 0.5))) * (1.0 - dash);
      wh = max(wh, 1.0 - smoothstep(0.08, 0.13, abs(al - (hw - 0.55))));
    } else if (style < 1.5) {
      yl = (1.0 - smoothstep(0.07, 0.12, abs(al - 0.18)));
      wh = 1.0 - smoothstep(0.08, 0.13, abs(al - (hw - 0.45)));
    } else {
      yl = (1.0 - smoothstep(0.06, 0.10, al)) * (1.0 - dashS);
    }
    float paint = max(yl, wh) * mfade * onRoad * (0.85 + 0.15 * nB);
    col = mix(col, mix(vec3(0.78, 0.78, 0.76), vec3(0.80, 0.60, 0.10), step(wh, yl)), paint);
    rPaint = paint;
    rRough = mix(0.92, 0.82, onRoad);
    rAlpha = 1.0;
  } else if (style < 3.5) {
    // dirt trail: twin ruts, soft edges that melt into the ground
    vec3 dirt = mix(vec3(0.30, 0.22, 0.14), vec3(0.22, 0.16, 0.10), nA) * (0.9 + 0.2 * nB);
    float rut = smoothstep(0.5, 0.0, abs(al - hw * 0.42));
    dirt *= 1.0 - 0.3 * rut;
    col = dirt;
    float edge = 1.0 - smoothstep(hw * 0.7, hw + 1.4, al + (nB - 0.5) * 0.9);
    rAlpha = edge;
    rRough = 0.97;
  } else if (style < 4.5) {
    // railway: ballast, sleepers and two steel rails
    vec3 bal = mix(vec3(0.22, 0.21, 0.20), vec3(0.34, 0.32, 0.30), nB);
    float inBed = 1.0 - smoothstep(hw - 0.2, hw + 0.4, al);
    col = bal;
    float slp = step(0.30, fract(along / 0.66)) * (1.0 - step(1.45, al));
    vec3 wood = vec3(0.14, 0.10, 0.07) * (0.8 + 0.4 * n_noise(vec2(floor(along / 0.66) * 3.1, 7.0)));
    col = mix(col, wood, slp * 0.85 * inBed);
    float rail = 1.0 - smoothstep(0.04, 0.09, abs(al - 0.72));
    col = mix(col, vec3(0.42, 0.40, 0.39), rail);
    rRough = mix(0.95, 0.35, rail);
    rAlpha = 1.0;
  } else {
    // abandoned runway: sun-bleached asphalt, cracks, drifted sand, faded markings
    vec3 asph = mix(vec3(0.20, 0.19, 0.185), vec3(0.30, 0.285, 0.27), nB) * (0.85 + 0.3 * nA);
    float onRw = 1.0 - smoothstep(hw - 0.1, hw + 0.2, al);
    vec3 sandc = mix(vec3(0.48, 0.34, 0.2), vec3(0.40, 0.28, 0.16), nB);
    float crack = 1.0 - smoothstep(0.0, 0.05, abs(n_noise(vRW.xz * 0.9) - 0.5));
    asph *= 1.0 - 0.35 * crack * onRw;
    float drift = smoothstep(0.45, 0.8, n_noise(vRW.xz * 0.05 + 3.0) + (al / hw) * 0.35);
    col = mix(sandc, asph, onRw);
    col = mix(col, sandc, drift * 0.8);
    float dash = step(0.35, fract(along / 36.0));
    float centre = (1.0 - smoothstep(0.35, 0.5, al)) * dash;
    float edge = 1.0 - smoothstep(0.12, 0.2, abs(al - (hw - 1.3)));
    float paint = max(centre, edge) * onRw * (1.0 - drift) * 0.7 * mfade;
    col = mix(col, vec3(0.7, 0.7, 0.66), paint);
    rPaint = paint;
    rRough = 0.93;
    rAlpha = 1.0;
  }
  diffuseColor.rgb = col;
  diffuseColor.a = rAlpha;
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(rRough, 0.2, uWet * 0.7);\nroughnessFactor = mix(roughnessFactor, 0.55, rPaint * 0.5);');
  };

  dispose(): void {
    for (const m of this.group.children as THREE.Mesh[]) m.geometry.dispose();
    this.material.dispose();
    this.dirtMaterial.dispose();
  }
}
