import * as THREE from 'three';
import { CITY } from './Terrain';
import { NOISE_GLSL } from './skyGlsl';

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function radialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Placeholder downtown: instanced towers with procedural facades (reflective glass by day, lit windows at
 * night) and a grid of streetlights with light pools. Real Port Valeria districts replace this in Phase 5.
 */
export class City {
  readonly group = new THREE.Group();
  readonly buildingMaterial = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.04 });
  readonly poleMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.6, metalness: 0.6 });
  readonly headMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(1, 0.72, 0.42), emissiveIntensity: 0 });
  readonly poolMaterial: THREE.MeshBasicMaterial;
  readonly pools = new THREE.Group();
  buildings: THREE.InstancedMesh | null = null;
  instanceCount = 0;
  private lamps: THREE.Object3D[] = [];
  private builtKey = '';
  private readonly boxGeo = new THREE.BoxGeometry(1, 1, 1);
  private readonly poolTex = radialTexture();
  /** Callback so the owner can register new materials/meshes. */
  constructor() {
    this.poolMaterial = new THREE.MeshBasicMaterial({
      map: this.poolTex, color: new THREE.Color(1.0, 0.62, 0.3), transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.group.add(this.pools);
  }

  build(budget: number, lamps: boolean): void {
    const key = `${budget}|${lamps}`;
    if (key === this.builtKey) return;
    this.builtKey = key;

    if (this.buildings) {
      this.group.remove(this.buildings);
      this.buildings.dispose();
    }
    for (const l of this.lamps) {
      this.group.remove(l);
      (l as THREE.InstancedMesh).dispose?.();
    }
    this.lamps = [];
    this.pools.clear();

    const rnd = mulberry32(1987);
    const palette = ['#b9b2a6', '#c9a98a', '#8c97a6', '#a35f55', '#6f7b86', '#d7cfc0', '#4d5a6b', '#9a8f7a', '#7f8c93'].map((c) => new THREE.Color(c));
    const mesh = new THREE.InstancedMesh(this.boxGeo, this.buildingMaterial, budget);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const C = CITY.cell;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const R = Math.ceil((CITY.flat - 40) / C);
    const cells: [number, number][] = [];
    const cx0 = Math.round(CITY.x / C);
    const cz0 = Math.round(CITY.z / C);
    for (let cx = cx0 - R; cx <= cx0 + R; cx++) {
      for (let cz = cz0 - R; cz <= cz0 + R; cz++) {
        const wx = (cx + 0.5) * C;
        const wz = (cz + 0.5) * C;
        if (Math.hypot(wx - CITY.x, wz - CITY.z) < CITY.flat - 40) cells.push([cx, cz]);
      }
    }
    const dist = (c: [number, number]) => Math.hypot((c[0] + 0.5) * C - CITY.x, (c[1] + 0.5) * C - CITY.z);
    cells.sort((a, b) => dist(a) - dist(b));

    let n = 0;
    for (const cell of cells) {
      if (n >= budget) break;
      const d = dist(cell);
      const lot = C - 14 - 4;
      const splits = rnd() < 0.45 ? 1 : 2;
      for (let i = 0; i < splits && n < budget; i++) {
        const w = (splits === 1 ? lot : lot / 2 - 2) * (0.72 + rnd() * 0.28);
        const dp = lot * (0.55 + rnd() * 0.4);
        const core = Math.max(0, 1 - d / 330);
        const h = 9 + Math.pow(rnd(), 2.0) * (26 + core * 170) + core * 22;
        const ox = splits === 1 ? 0 : (i === 0 ? -1 : 1) * (lot / 4 + 1);
        p.set((cell[0] + 0.5) * C + ox, CITY.height + h / 2, (cell[1] + 0.5) * C);
        sc.set(w, h, dp);
        m.compose(p, q, sc);
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, palette[Math.floor(rnd() * palette.length)]!);
        n++;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.instanceCount = n;
    this.buildings = mesh;
    this.group.add(mesh);

    if (!lamps) return;
    // Streetlights at street intersections inside the dense part of the city.
    const spots: THREE.Vector2[] = [];
    for (const [cx, cz] of cells) {
      const x = cx * C;
      const z = cz * C;
      if (Math.hypot(x - CITY.x, z - CITY.z) < Math.min(CITY.flat - 80, 20 * C)) spots.push(new THREE.Vector2(x, z));
    }
    const count = spots.length;
    const poles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 9, 0.28).translate(0, 4.5, 0), this.poleMaterial, count * 2);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.22, 0.6).translate(0.8, 9.05, 0), this.headMaterial, count * 2);
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(26, 26).rotateX(-Math.PI / 2), this.poolMaterial, count * 2);
    pools.renderOrder = 5;
    pools.frustumCulled = false;
    const rot = new THREE.Quaternion();
    let k = 0;
    for (const s of spots) {
      // two lamps per intersection on opposite diagonal corners
      for (const sign of [1, -1]) {
        const x = s.x + 8.5 * sign;
        const z = s.y + 8.5 * sign;
        rot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sign > 0 ? Math.PI * 0.75 : -Math.PI * 0.25);
        m.compose(new THREE.Vector3(x, CITY.height, z), rot, new THREE.Vector3(1, 1, 1));
        poles.setMatrixAt(k, m);
        heads.setMatrixAt(k, m);
        // pool centre sits under the lamp head (arm points along local +x)
        const ang = sign > 0 ? Math.PI * 0.75 : -Math.PI * 0.25;
        m.compose(new THREE.Vector3(x + 0.8 * Math.cos(ang), CITY.height + 0.06, z - 0.8 * Math.sin(ang)), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        pools.setMatrixAt(k, m);
        k++;
      }
    }
    poles.count = heads.count = pools.count = k;
    for (const o of [poles, heads, pools]) o.instanceMatrix.needsUpdate = true;
    this.lamps = [poles, heads];
    this.group.add(poles, heads);
    this.pools.add(pools);
  }

  /** Night lighting: lamp emission and pool opacity follow how dark it is (and dim under heavy rain/fog). */
  setNight(night: number, wet: number): void {
    this.headMaterial.emissiveIntensity = night * 9;
    this.poolMaterial.opacity = night * (0.42 + 0.3 * wet);
  }

  /** Window/facade shader patch (installed through LightRig.register). */
  static patch = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLoc;\nvarying vec3 vNrm;\nvarying vec3 vSize;\nvarying float vSeed;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 bsz = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
vSize = bsz;
vLoc = (position + 0.5) * bsz;
vNrm = normal;
vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLoc;\nvarying vec3 vNrm;\nvarying vec3 vSize;\nvarying float vSeed;\n${NOISE_GLSL}`)
      .replace('void main() {', 'float wMask = 0.0;\nfloat wLit = 0.0;\nvec3 wCol = vec3(0.0);\nvoid main() {')
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 an = abs(vNrm);
  if (an.y < 0.5) {
    vec2 fc = an.x > an.z ? vec2(vLoc.z, vLoc.y) : vec2(vLoc.x, vLoc.y);
    vec2 cs = vec2(3.4, 3.8);
    vec2 cell = floor(fc / cs);
    vec2 f = fract(fc / cs);
    float ground = step(4.5, vLoc.y) * step(vLoc.y, vSize.y - 1.2);
    wMask = step(0.16, f.x) * step(f.x, 0.84) * step(0.2, f.y) * step(f.y, 0.82) * ground;
    float hh = n_hash21(cell + vSeed * 91.0 + an.x * 7.0);
    float fraction = 0.06 + 0.5 * smoothstep(0.05, 0.8, uNight);
    wLit = step(hh, fraction);
    wCol = mix(vec3(1.0, 0.70, 0.40), vec3(0.72, 0.86, 1.0), step(0.86, n_hash21(cell * 1.7 + vSeed)));
    wCol *= 0.6 + 0.9 * n_hash21(cell + 4.0);
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.05, 0.075), wMask);
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor * (1.0 - 0.3 * uWet), 0.05, wMask);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.15, wMask);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += wCol * wMask * wLit * uNight * 2.4;');
  };
}
