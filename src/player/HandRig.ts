import * as THREE from 'three';

/** Curl of one finger in radians, per joint (knuckle, middle, tip). Positive = toward the palm. */
export type Curl3 = readonly [number, number, number];

export interface HandPose {
  index: Curl3;
  middle: Curl3;
  ring: Curl3;
  pinky: Curl3;
  /** Thumb: [swing across the palm, base flex, tip flex]. */
  thumb: Curl3;
  /** Finger fan-out in radians (0 = together). */
  spread: number;
}

export const POSES = {
  relaxed: { index: [0.28, 0.38, 0.22], middle: [0.34, 0.46, 0.26], ring: [0.42, 0.5, 0.28], pinky: [0.5, 0.52, 0.3], thumb: [0.25, 0.2, 0.12], spread: 0.04 },
  fist: { index: [1.25, 1.5, 0.9], middle: [1.3, 1.55, 0.9], ring: [1.35, 1.55, 0.9], pinky: [1.4, 1.5, 0.85], thumb: [0.55, 0.5, 0.3], spread: 0 },
  /** Strong hand on a pistol grip with the trigger finger resting along the frame. */
  gripIndexOff: { index: [0.12, 0.1, 0.05], middle: [1.15, 1.35, 0.85], ring: [1.2, 1.35, 0.85], pinky: [1.2, 1.3, 0.8], thumb: [0.05, 0.12, 0.05], spread: 0 },
  /** Same, finger pressing the trigger. */
  gripTrigger: { index: [0.45, 0.65, 0.3], middle: [1.15, 1.35, 0.85], ring: [1.2, 1.35, 0.85], pinky: [1.2, 1.3, 0.8], thumb: [0.05, 0.12, 0.05], spread: 0 },
  /** Support hand cupping the front of the grip. */
  support: { index: [0.9, 1.25, 0.7], middle: [1.05, 1.35, 0.8], ring: [1.1, 1.35, 0.8], pinky: [1.1, 1.3, 0.75], thumb: [0.0, 0.05, 0.02], spread: 0 },
  /** Open palm (resting on a ledge, taking a magazine). */
  flat: { index: [0.05, 0.05, 0.03], middle: [0.05, 0.05, 0.03], ring: [0.06, 0.06, 0.03], pinky: [0.08, 0.06, 0.03], thumb: [0.15, 0.08, 0.04], spread: 0.16 },
  /** Fingers pinching a magazine. */
  pinch: { index: [0.7, 0.8, 0.5], middle: [0.8, 0.9, 0.5], ring: [0.9, 0.9, 0.5], pinky: [0.95, 0.9, 0.5], thumb: [0.35, 0.3, 0.2], spread: 0.02 },
  /** Gripping a ledge from above. */
  hook: { index: [0.55, 0.85, 0.5], middle: [0.6, 0.9, 0.5], ring: [0.65, 0.9, 0.5], pinky: [0.7, 0.9, 0.5], thumb: [0.3, 0.25, 0.1], spread: 0.05 },
} satisfies Record<string, HandPose>;

export type PoseName = keyof typeof POSES;

const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;
type Finger = (typeof FINGERS)[number];
const LENGTHS: Record<Finger, readonly [number, number, number]> = {
  index: [0.040, 0.024, 0.020],
  middle: [0.044, 0.027, 0.021],
  ring: [0.041, 0.025, 0.020],
  pinky: [0.033, 0.019, 0.017],
};
const RADII: Record<Finger, number> = { index: 0.0089, middle: 0.0093, ring: 0.0086, pinky: 0.0074 };
const KNUCKLE_X: Record<Finger, number> = { index: -0.0275, middle: -0.0095, ring: 0.0085, pinky: 0.0255 };
/** Knuckle line: the index and middle sit a little further forward than the ring and pinky. */
const KNUCKLE_Z: Record<Finger, number> = { index: -0.0935, middle: -0.095, ring: -0.0925, pinky: -0.0875 };
const THUMB_BASE = new THREE.Vector3(-0.034, -0.004, -0.032);
const THUMB_L = [0.040, 0.032, 0.026] as const;

const gauss = (x: number): number => Math.exp(-x * x);
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const SKIN_GLSL = `
varying vec3 vSkinP;
varying float vCrease;
float sk_h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float sk_n(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sk_h(i), sk_h(i + vec3(1,0,0)), f.x), mix(sk_h(i + vec3(0,1,0)), sk_h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sk_h(i + vec3(0,0,1)), sk_h(i + vec3(1,0,1)), f.x), mix(sk_h(i + vec3(0,1,1)), sk_h(i + vec3(1,1,1)), f.x), f.y), f.z); }
/* veins on the back of the hand, in the hand's rest-pose space */
float sk_vein(vec3 p) {
  if (p.y < 0.006 || p.z < -0.086 || p.z > 0.04) return 0.0;
  float fade = smoothstep(-0.086, -0.06, p.z) * (1.0 - smoothstep(0.02, 0.04, p.z));
  float v = 0.0;
  for (int k = 0; k < 3; k++) {
    float x0 = -0.017 + float(k) * 0.0165;
    float cx = x0 + 0.0032 * sin(p.z * 75.0 + float(k) * 2.1) + 0.006 * (p.z + 0.03) * float(k - 1);
    float d = abs(p.x - cx); v = max(v, exp(-d * d / 0.0000052));
  }
  return v * fade;
}
float sk_height(vec3 p, float crease) {
  float pores = sk_n(p * 1150.0) - 0.5;
  float fine = sk_n(p * 360.0 + 7.0) - 0.5;
  float aa = clamp(1.0 - length(fwidth(p * 1150.0)) * 1.6, 0.0, 1.0);
  float h = pores * 0.5 * aa + fine * 0.45;
  /* wrinkles across the knuckles, a little wavy */
  float wr = sin(p.z * 1500.0 + sk_n(p * 160.0) * 4.0);
  h += crease * wr * 0.5 * clamp(1.0 - length(fwidth(p.z * 1500.0)) * 1.5, 0.0, 1.0);
  h += sk_vein(p) * 0.55;
  return h;
}
`;

/** Skin with pores, knuckle wrinkles, veins, tone variation and warm light under the surface. Shared with the forearms. */
export function skinMaterial(): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#bd835f'), roughness: 0.52, metalness: 0, sheen: 0.35, sheenRoughness: 0.45,
    sheenColor: new THREE.Color('#ff9a7a'), ior: 1.4, specularIntensity: 0.55, vertexColors: true,
  });
  m.fog = false;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkinP;\nvarying float vCrease;\nattribute float aCrease;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinP = position;\nvCrease = aCrease;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${SKIN_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float tone = 0.94 + 0.08 * sk_n(vSkinP * 70.0) + 0.04 * sk_n(vSkinP * 260.0);
  diffuseColor.rgb *= tone;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.82, 0.86, 1.0), sk_vein(vSkinP) * 0.32);
  /* freckles and tiny blemishes */
  float fr = smoothstep(0.82, 0.9, sk_n(vSkinP * 420.0 + 3.0));
  diffuseColor.rgb *= 1.0 - fr * 0.08;
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * (0.82 + 0.36 * sk_n(vSkinP * 240.0)) + vCrease * 0.08, 0.2, 0.95);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  /* derivative bump from the procedural skin height (Mikkelsen's surface gradient) */
  float hgt = sk_height(vSkinP, vCrease) * 0.00006;
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float dhx = dFdx(hgt), dhy = dFdy(hgt);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  normal = normalize(abs(det) * normal - grad);
}`)
      .replace('#include <opaque_fragment>', `{
  /* light scattered under the skin: warm fill in shadow and a red glow at grazing angles */
  float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float rim = pow(1.0 - facing, 3.0);
  outgoingLight += diffuseColor.rgb * vec3(0.62, 0.22, 0.14) * (0.12 + 0.22 * rim);
}
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'vc-skin-3';
  return m;
}

/** Collects one skinned mesh from lofted parts. */
class Mesher {
  pos: number[] = [];
  col: number[] = [];
  crease: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  idx: number[] = [];

  /** Add a vertex: position, tone, crease, up to four (bone, weight) pairs. */
  v(x: number, y: number, z: number, tone: [number, number, number], crease: number, bw: [number, number][]): number {
    this.pos.push(x, y, z);
    this.col.push(tone[0], tone[1], tone[2]);
    this.crease.push(crease);
    const list = bw.filter((p) => p[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sum = 0;
    for (const p of list) sum += p[1];
    for (let k = 0; k < 4; k++) { const p = list[k]; this.si.push(p ? p[0] : 0); this.sw.push(p ? p[1] / sum : 0); }
    return this.pos.length / 3 - 1;
  }

  /** Stitch rings of `n` vertices each (closed around); `first` is the index of the first vertex of the first ring. */
  grid(first: number, rings: number, n: number): void {
    for (let r = 0; r < rings - 1; r++) for (let k = 0; k < n; k++) {
      const a = first + r * n + k, b = first + r * n + ((k + 1) % n), c = a + n, d = b + n;
      this.idx.push(a, c, b, b, c, d);
    }
  }

  /** Close the last ring with a fan to an apex vertex. */
  fan(ringFirst: number, n: number, apex: number): void {
    for (let k = 0; k < n; k++) this.idx.push(ringFirst + k, apex, ringFirst + ((k + 1) % n));
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aCrease', new THREE.Float32BufferAttribute(this.crease, 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

/** Rounded cross-section: half-width a, top b1, bottom b2, superellipse exponent e. Returns [x, y] for angle t. */
function section(t: number, a: number, b1: number, b2: number, e: number): [number, number] {
  const c = Math.cos(t), s = Math.sin(t);
  const k = 2 / e;
  const x = a * Math.sign(c) * Math.pow(Math.abs(c), k);
  const y = (s >= 0 ? b1 : b2) * Math.sign(s) * Math.pow(Math.abs(s), k);
  return [x, y];
}

const SKIN_BACK: [number, number, number] = [0.97, 0.95, 0.95];
const SKIN_PALM: [number, number, number] = [1.07, 0.97, 0.93];
const SKIN_KNUCKLE: [number, number, number] = [0.96, 0.86, 0.85];
const SKIN_TIP: [number, number, number] = [1.04, 0.9, 0.88];
const mixTone = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Profile of a finger at distance s from its knuckle: half-width, top and bottom, and the centre's drop. */
interface Profile { w: number; top: number; bot: number; dy: number; tip: number }
function fingerProfile(s: number, r: number, J: readonly number[], L: number): Profile {
  // taper toward the tip, bulges at the joints, slimmer between them
  let w = r * (1.0 - 0.16 * Math.max(0, s) / L);
  for (const j of J) w += r * 0.075 * gauss((s - j) / (0.55 * r));
  const mids = [J[0]! / 2, (J[0]! + J[1]!) / 2, (J[1]! + L) / 2];
  for (const m of mids.slice(0, 2)) w -= r * 0.035 * gauss((s - m) / (1.2 * r));
  let top = w * 0.9, bot = w * 0.93;
  // knuckle bumps on the back, pads and joint creases on the palm side
  for (const j of J) { top += r * 0.12 * gauss((s - j) / (0.5 * r)); bot -= r * 0.07 * gauss((s - j) / (0.32 * r)); }
  for (const m of mids) bot += r * 0.085 * gauss((s - m) / (0.9 * r));
  // the rounded fingertip, with the pad hanging a little lower than the nail side
  const rt = w * 1.05;
  let tip = 0, dy = 0;
  if (s > L - rt) {
    const q = Math.min(1, (s - (L - rt)) / rt);
    tip = q;
    const k = Math.sqrt(Math.max(0, 1 - q * q));
    w *= k; top *= k; bot *= Math.sqrt(Math.max(0, 1 - Math.pow(q, 2.4)));
    dy = -0.3 * r * q * q;
  }
  return { w, top, bot, dy, tip };
}

/**
 * A right hand as one skinned mesh over a bone hierarchy (palm → three bones per finger, three for the thumb). The palm,
 * fingers and thumb are lofted cross-sections with knuckles, pads, joint creases and rounded fingertips; nails are thin
 * curved plates riding on the fingertip bones. Local frame: origin at the wrist, fingers extend along −Z, the back of the
 * hand faces +Y, the thumb is at −X. A left hand is the same rig mirrored by the owner.
 */
export class HandRig {
  readonly root = new THREE.Group();
  readonly material: THREE.MeshPhysicalMaterial;
  readonly nailMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#e3b49a'), roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.25, vertexColors: true, fog: false });
  private readonly palm = new THREE.Bone();
  private readonly fingerJoints: Record<Finger, THREE.Bone[]> = { index: [], middle: [], ring: [], pinky: [] };
  private readonly thumbJoints: THREE.Bone[] = [];
  private readonly nails: THREE.Mesh[] = [];
  private readonly mesh: THREE.SkinnedMesh;
  private readonly current: HandPose = structuredClone(POSES.relaxed) as HandPose;

  constructor(material?: THREE.MeshPhysicalMaterial) {
    this.material = material ?? skinMaterial();
    // ---- bones (rest pose: everything straight along −Z)
    const bones: THREE.Bone[] = [this.palm];
    this.root.add(this.palm);
    for (const name of FINGERS) {
      const [l1, l2] = LENGTHS[name];
      const b0 = new THREE.Bone(), b1 = new THREE.Bone(), b2 = new THREE.Bone();
      b0.position.set(KNUCKLE_X[name], 0.003, KNUCKLE_Z[name]);
      b1.position.set(0, 0, -l1);
      b2.position.set(0, 0, -l2);
      this.palm.add(b0); b0.add(b1); b1.add(b2);
      this.fingerJoints[name].push(b0, b1, b2);
      bones.push(b0, b1, b2);
    }
    const t0 = new THREE.Bone(), t1 = new THREE.Bone(), t2 = new THREE.Bone();
    t0.position.copy(THUMB_BASE);
    t1.position.set(0, 0, -THUMB_L[0]);
    t2.position.set(0, 0, -THUMB_L[1]);
    this.palm.add(t0); t0.add(t1); t1.add(t2);
    this.thumbJoints.push(t0, t1, t2);
    bones.push(t0, t1, t2);
    const boneIndex = (b: THREE.Bone): number => bones.indexOf(b);

    // ---- geometry
    const M = new Mesher();
    this.buildPalm(M, boneIndex);
    for (const name of FINGERS) this.buildFinger(M, name, boneIndex);
    this.buildThumb(M, boneIndex);
    const geo = M.build();
    this.mesh = new THREE.SkinnedMesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.root.add(this.mesh);
    this.root.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(bones));

    // ---- nails ride on the fingertip bones
    for (const name of FINGERS) {
      const [l1, l2, l3] = LENGTHS[name];
      const J = [l1, l1 + l2];
      this.addNail(this.fingerJoints[name][2]!, (s) => fingerProfile(s, RADII[name], J, l1 + l2 + l3), l1 + l2, l3, RADII[name], 0);
    }
    const tr = 0.0102;
    const TJ = [THUMB_L[0], THUMB_L[0] + THUMB_L[1]];
    const TL = THUMB_L[0] + THUMB_L[1] + THUMB_L[2];
    this.addNail(this.thumbJoints[2]!, (s) => thumbProfile(s, tr, TJ, TL), TJ[1]!, THUMB_L[2], tr, THUMB_ROLL);
    this.apply(POSES.relaxed);
  }

  // ------------------------------------------------------------------------------------------------ geometry

  private buildPalm(M: Mesher, bi: (b: THREE.Bone) => number): void {
    const N = 32;
    const z0 = 0.026, z1 = -0.097;
    const rings = 30;
    const first = M.pos.length / 3;
    const palm = bi(this.palm);
    const thumb0 = bi(this.thumbJoints[0]!);
    for (let r = 0; r < rings; r++) {
      const z = z0 + (z1 - z0) * (r / (rings - 1));
      // width, back and palm-side depth along the hand (wrist → knuckles)
      const W = interp(z, [[0.026, 0.012], [0.016, 0.022], [0.0, 0.0285], [-0.02, 0.036], [-0.05, 0.0412], [-0.08, 0.0442], [-0.097, 0.0432]]);
      const T = interp(z, [[0.026, 0.009], [0.016, 0.0158], [0.0, 0.0172], [-0.03, 0.0158], [-0.06, 0.0138], [-0.085, 0.0122], [-0.097, 0.0098]]);
      const B = interp(z, [[0.026, 0.009], [0.016, 0.0158], [0.0, 0.0178], [-0.02, 0.0205], [-0.05, 0.0172], [-0.08, 0.0128], [-0.097, 0.0098]]);
      const cx = interp(z, [[0.026, 0.0], [0.0, -0.001], [-0.04, -0.001], [-0.097, 0.0]]);
      const e = interp(z, [[0.026, 2.0], [0.0, 2.3], [-0.04, 2.8], [-0.097, 3.0]]);
      for (let k = 0; k < N; k++) {
        const t = (k / N) * Math.PI * 2;
        let [x, y] = section(t, W, T, B, e);
        x += cx;
        // back of the hand: metacarpal ridges and the knuckle bumps
        if (y > 0) {
          const ridge = 0.0009 * Math.cos((x + 0.0275) * Math.PI * 2 / 0.0185) * smooth(-0.02, -0.05, z) * smooth(0.0, 0.03, y / (T + 1e-4) * 0.03);
          let knuck = 0;
          for (const f of FINGERS) knuck += 0.0042 * gauss((x - KNUCKLE_X[f]) / 0.0065) * gauss((z - KNUCKLE_Z[f] - 0.004) / 0.0075);
          y += (ridge + knuck) * Math.pow(y / T, 2);
        } else {
          // palm side: the thenar pad under the thumb, the hypothenar along the pinky edge, a hollow in the middle
          const thenar = 0.0072 * gauss((x + 0.022) / 0.014) * gauss((z + 0.03) / 0.025);
          const hypo = 0.0042 * gauss((x - 0.03) / 0.011) * gauss((z + 0.045) / 0.03);
          const pads = 0.0025 * gauss((z + 0.088) / 0.006);
          const hollow = -0.003 * gauss(x / 0.014) * gauss((z + 0.055) / 0.02);
          y -= (thenar + hypo + pads + hollow) * Math.pow(-y / B, 1.5);
        }
        const palmSide = y < 0 ? Math.min(1, -y / B) : 0;
        let tone = mixTone(SKIN_BACK, SKIN_PALM, smooth(0.0, 0.7, palmSide));
        let crease = 0;
        if (y > 0) {
          let kn = 0;
          for (const f of FINGERS) kn = Math.max(kn, gauss((x - KNUCKLE_X[f]) / 0.007) * gauss((z - KNUCKLE_Z[f] - 0.004) / 0.008));
          tone = mixTone(tone, SKIN_KNUCKLE, kn * 0.8);
          crease = kn * 0.7;
        } else crease = 0.25 * gauss((z + 0.01) / 0.006) + 0.3 * gauss((z + 0.07 + x * 0.25) / 0.003) + 0.25 * gauss((z + 0.052 - x * 0.35) / 0.003);
        // weights: the palm, the knuckle rows lean on the fingers, the thenar follows the thumb
        const bw: [number, number][] = [[palm, 1]];
        if (z < -0.078) {
          let best: Finger = 'index', bd = Infinity;
          for (const f of FINGERS) { const d = Math.abs(x - KNUCKLE_X[f]); if (d < bd) { bd = d; best = f; } }
          bw.push([bi(this.fingerJoints[best][0]!), 0.55 * smooth(-0.078, -0.097, z)]);
        }
        const dT = Math.hypot(x - THUMB_BASE.x, y - THUMB_BASE.y, z - THUMB_BASE.z);
        if (x < -0.012 && y < 0.004) bw.push([thumb0, 0.22 * gauss(dT / 0.018) * smooth(-0.012, -0.03, x) * smooth(0.004, -0.004, y)]);
        bw[0]![1] = Math.max(0.05, 1 - bw.slice(1).reduce((a, p) => a + p[1], 0));
        M.v(x, y, z, tone, crease, bw);
      }
    }
    M.grid(first, rings, N);
    // close the wrist end (inside the sleeve) and the knuckle end (inside the fingers)
    const a0 = M.v(0, 0, z0 + 0.002, SKIN_BACK, 0, [[palm, 1]]);
    for (let k = 0; k < N; k++) M.idx.push(first + ((k + 1) % N), a0, first + k);
    const lastFirst = first + (rings - 1) * N;
    const a1 = M.v(0, 0, z1 - 0.002, SKIN_BACK, 0, [[palm, 1]]);
    M.fan(lastFirst, N, a1);
  }

  private buildFinger(M: Mesher, name: Finger, bi: (b: THREE.Bone) => number): void {
    const [l1, l2, l3] = LENGTHS[name];
    const L = l1 + l2 + l3, J = [l1, l1 + l2] as const;
    const r = RADII[name];
    const j = this.fingerJoints[name].map(bi);
    const palm = bi(this.palm);
    const kx = KNUCKLE_X[name], kz = KNUCKLE_Z[name];
    this.tube(M, -0.008, L, 34, 24, (s) => fingerProfile(s, r, J, L), (s) => {
      // weights along the finger: the palm inside the knuckle, then each bone with soft blends at the joints
      const b = 0.5 * r;
      if (s < 0.002) { const t = smooth(-0.008, 0.003, s); return [[palm, 1 - t], [j[0]!, t]]; }
      if (s < (J[0] + J[1]) / 2) { const t = smooth(J[0] - b, J[0] + b, s); return [[j[0]!, 1 - t], [j[1]!, t]]; }
      const t = smooth(J[1] - b, J[1] + b, s);
      return [[j[1]!, 1 - t], [j[2]!, t]];
    }, (s, y, prof) => {
      let tone = mixTone(SKIN_BACK, SKIN_PALM, y < 0 ? Math.min(1, -y / Math.max(1e-4, prof.bot)) * 0.8 : 0);
      let crease = 0;
      for (const jj of J) {
        const near = gauss((s - jj) / (0.55 * r));
        if (y > 0) { tone = mixTone(tone, SKIN_KNUCKLE, near * 0.75); crease = Math.max(crease, near); }
        else crease = Math.max(crease, gauss((s - jj) / (0.18 * r)) * 0.8);
      }
      tone = mixTone(tone, SKIN_TIP, smooth(L - 2.2 * r, L, s) * 0.8);
      return { tone, crease };
    }, kx, 0.003, kz, 0);
  }

  private buildThumb(M: Mesher, bi: (b: THREE.Bone) => number): void {
    const r = 0.0102;
    const TJ = [THUMB_L[0], THUMB_L[0] + THUMB_L[1]] as const;
    const TL = THUMB_L[0] + THUMB_L[1] + THUMB_L[2];
    const j = this.thumbJoints.map(bi);
    this.tube(M, -0.005, TL, 36, 24, (s) => thumbProfile(s, r, TJ, TL), (s) => {
      const b = 0.55 * r;
      // the thumb's root moves with the thumb: blending it with the palm shears it into a flap when the thumb swings
      if (s < 0.004) return [[j[0]!, 1]];
      if (s < (TJ[0] + TJ[1]) / 2) { const t = smooth(TJ[0] - b, TJ[0] + b, s); return [[j[0]!, 1 - t], [j[1]!, t]]; }
      const t = smooth(TJ[1] - b, TJ[1] + b, s);
      return [[j[1]!, 1 - t], [j[2]!, t]];
    }, (s, y, prof) => {
      let tone = mixTone(SKIN_BACK, SKIN_PALM, y < 0 ? Math.min(1, -y / Math.max(1e-4, prof.bot)) * 0.7 : 0);
      let crease = 0;
      for (const jj of TJ) { const near = gauss((s - jj) / (0.6 * r)); if (y > 0) { tone = mixTone(tone, SKIN_KNUCKLE, near * 0.6); crease = Math.max(crease, near); } }
      tone = mixTone(tone, SKIN_TIP, smooth(TL - 2.2 * r, TL, s) * 0.7);
      return { tone, crease };
    }, THUMB_BASE.x, THUMB_BASE.y, THUMB_BASE.z, THUMB_ROLL);
  }

  /** Loft a tube along −Z from (ox, oy, oz), rolled by `roll` about its axis. */
  private tube(M: Mesher, s0: number, L: number, rings: number, N: number, prof: (s: number) => Profile, weights: (s: number) => [number, number][], shade: (s: number, y: number, p: Profile) => { tone: [number, number, number]; crease: number }, ox: number, oy: number, oz: number, roll: number): void {
    const first = M.pos.length / 3;
    const cr = Math.cos(roll), sr = Math.sin(roll);
    let last = 0;
    for (let i = 0; i < rings; i++) {
      // stations bunch up toward the fingertip so the round end stays smooth
      const u = i / (rings - 1);
      const s = s0 + (L - s0) * (1 - Math.pow(1 - u, 1.6)) * 0.999;
      const p = prof(s);
      const bw = weights(s);
      for (let k = 0; k < N; k++) {
        const t = (k / N) * Math.PI * 2;
        const [lx, ly0] = section(t, Math.max(p.w, 1e-5), Math.max(p.top, 1e-5), Math.max(p.bot, 1e-5), 2.25);
        const ly = ly0 + p.dy;
        const { tone, crease } = shade(s, ly0, p);
        // roll the section about the tube axis
        const x = lx * cr - ly * sr, y = lx * sr + ly * cr;
        M.v(ox + x, oy + y, oz - s, tone, crease, bw);
      }
      last = s;
    }
    M.grid(first, rings, N);
    // round the open base off with a short cone back along the tube, so it never shows as a hole or a sheet
    const p0 = prof(s0);
    const back = M.v(ox - p0.dy * sr, oy + p0.dy * cr, oz - s0 + Math.max(p0.w, p0.top) * 0.7, SKIN_BACK, 0, weights(s0));
    for (let k = 0; k < N; k++) M.idx.push(first + ((k + 1) % N), back, first + k);
    const tipProf = prof(L);
    const apex = M.v(ox - tipProf.dy * sr, oy + tipProf.dy * cr, oz - L - 0.0004, SKIN_TIP, 0, weights(L));
    M.fan(first + (rings - 1) * N, N, apex);
    void last;
  }

  /** A nail plate on the back of a fingertip bone: curved across, following the fingertip, with lunula and free edge. */
  private addNail(bone: THREE.Bone, prof: (s: number) => Profile, sBone: number, len: number, r: number, roll: number): void {
    const cols = 9, rows = 9;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const s0 = sBone + len * 0.36, s1 = sBone + len * 1.02;
    const cr = Math.cos(roll), sr = Math.sin(roll);
    for (let i = 0; i < rows; i++) {
      const v = i / (rows - 1);
      const s = s0 + (s1 - s0) * v;
      const p = prof(Math.min(s, sBone + len - 0.0006));
      const over = s > sBone + len * 0.9 ? (s - (sBone + len * 0.9)) / (len * 0.12) : 0;
      // the plate narrows a touch at the cuticle and at the free edge
      const half = r * 0.72 * (0.86 + 0.14 * Math.sin(v * Math.PI)) * (1 - 0.15 * over);
      for (let k = 0; k < cols; k++) {
        const a = (k / (cols - 1) - 0.5) * 2;
        const ang = a * 1.05;
        const ry = Math.max(p.top, r * 0.35) + 0.00035 + 0.0003 * (1 - Math.abs(a));
        let x = Math.sin(ang) * Math.min(half, Math.max(p.w, r * 0.3) * 0.95);
        let y = Math.cos(ang) * ry * 0.98 + p.dy * 0.4 - over * 0.0008;
        const zz = -(s - sBone);
        [x, y] = [x * cr - y * sr, x * sr + y * cr];
        pos.push(x, y, zz);
        // pink bed, pale lunula at the base, white free edge past the fingertip
        const lun = (1 - smooth(0.0, 0.25, v)) * (1 - Math.abs(a) * 0.6);
        const edge = smooth(0.84, 0.94, v);
        const c = mixTone(mixTone([1.0, 0.84, 0.82], [1.02, 0.95, 0.92], lun * 0.7), [1.02, 0.97, 0.92], edge * 0.8);
        const side = 1 - 0.12 * Math.abs(a);
        col.push(c[0] * side, c[1] * side, c[2] * side);
      }
    }
    for (let i = 0; i < rows - 1; i++) for (let k = 0; k < cols - 1; k++) {
      const q = i * cols + k;
      idx.push(q, q + cols, q + 1, q + 1, q + cols, q + cols + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.nailMat);
    m.castShadow = false;
    m.frustumCulled = false;
    bone.add(m);
    this.nails.push(m);
  }

  /** Hide the nails (gloves). */
  showNails(on: boolean): void {
    for (const n of this.nails) n.visible = on;
  }

  /** Write finger/thumb joint rotations for a pose. */
  apply(p: HandPose): void {
    Object.assign(this.current, p);
    FINGERS.forEach((name, fi) => {
      const c = p[name];
      const j = this.fingerJoints[name];
      for (let i = 0; i < 3; i++) j[i]!.rotation.x = -c[i]!;
      // fan out around Y
      j[0]!.rotation.y = (fi - 1.5) * p.spread * -0.7;
    });
    const t = p.thumb;
    this.thumbJoints[0]!.rotation.set(-t[1] * 0.6 + 0.05, 0.55 - t[0] * 0.9, -0.28 + t[0] * 0.4);
    this.thumbJoints[1]!.rotation.x = -t[1] * 0.8;
    this.thumbJoints[2]!.rotation.x = -t[2] * 0.9;
  }

  /** Blend two poses into `out` (allocation-free). */
  static mix(a: HandPose, b: HandPose, t: number, out: HandPose): HandPose {
    const lerp3 = (x: Curl3, y: Curl3, dst: [number, number, number]) => {
      dst[0] = x[0] + (y[0] - x[0]) * t;
      dst[1] = x[1] + (y[1] - x[1]) * t;
      dst[2] = x[2] + (y[2] - x[2]) * t;
    };
    for (const k of ['index', 'middle', 'ring', 'pinky', 'thumb'] as const) lerp3(a[k], b[k], out[k] as unknown as [number, number, number]);
    out.spread = a.spread + (b.spread - a.spread) * t;
    return out;
  }

  /** Writable pose scratch object. */
  static blank(): HandPose {
    return structuredClone(POSES.relaxed) as HandPose;
  }
}

/** The thumb's nail faces up and out: its sections are rolled about the thumb's own axis. */
const THUMB_ROLL = -0.55;

function thumbProfile(s: number, r: number, J: readonly number[], L: number): Profile {
  // the metacarpal is thick (it is buried in the thenar), then the two phalanges
  const p = fingerProfile(s, r, J, L);
  const meta = 1 + 0.32 * (1 - smooth(0.0, J[0]!, s));
  p.w *= meta * 1.04; p.top *= meta * 0.95; p.bot *= meta * 1.06;
  return p;
}

/** Piecewise-linear interpolation over [x, y] knots sorted by decreasing x. */
function interp(x: number, knots: [number, number][]): number {
  if (x >= knots[0]![0]) return knots[0]![1];
  for (let i = 1; i < knots.length; i++) {
    const [x0, y0] = knots[i - 1]!, [x1, y1] = knots[i]!;
    if (x >= x1) { const t = (x - x0) / (x1 - x0); const u = t * t * (3 - 2 * t); return y0 + (y1 - y0) * u; }
  }
  return knots[knots.length - 1]![1];
}

/**
 * Sleeved arm with analytic two-bone IK: the shoulder is fixed in view space, the wrist follows the hand target
 * and the elbow is placed by a pole direction.
 */
export class ArmRig {
  readonly root = new THREE.Group();
  readonly upper: THREE.Mesh;
  readonly fore: THREE.Mesh;
  readonly cuff: THREE.Mesh;
  readonly forearmSkin: THREE.Mesh;
  readonly elbowBall: THREE.Mesh;
  readonly wristBall: THREE.Mesh;
  private readonly L1 = 0.30;
  private readonly L2 = 0.27;
  private readonly _dir = new THREE.Vector3();
  private readonly _elbow = new THREE.Vector3();
  private readonly _perp = new THREE.Vector3();
  private readonly _z = new THREE.Vector3(0, 0, -1);

  constructor(sleeve: THREE.Material, skinMat: THREE.Material, cuffMat: THREE.Material) {
    const seg = (r0: number, r1: number, len: number, mat: THREE.Material): THREE.Mesh => {
      const g = new THREE.CylinderGeometry(r1, r0, len, 20, 4);
      g.rotateX(-Math.PI / 2); // axis along −Z, r0 at the start
      g.translate(0, 0, -len / 2);
      // the skin shader reads vertex colours and a crease value: plain white / none
      const n = g.getAttribute('position').count;
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(1), 3));
      g.setAttribute('aCrease', new THREE.Float32BufferAttribute(new Array(n).fill(0), 1));
      const m = new THREE.Mesh(g, mat);
      this.root.add(m);
      return m;
    };
    this.upper = seg(0.052, 0.046, this.L1, sleeve);
    this.fore = seg(0.046, 0.034, this.L2 - 0.03, sleeve);
    this.cuff = seg(0.034, 0.034, 0.04, cuffMat);
    this.forearmSkin = seg(0.0262, 0.0205, 0.078, skinMat);
    this.elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.047, 16, 12), sleeve);
    this.root.add(this.elbowBall);
    const wb = new THREE.SphereGeometry(0.0212, 20, 14);
    const wn = wb.getAttribute('position').count;
    wb.setAttribute('color', new THREE.Float32BufferAttribute(new Array(wn * 3).fill(1), 3));
    wb.setAttribute('aCrease', new THREE.Float32BufferAttribute(new Array(wn).fill(0), 1));
    this.wristBall = new THREE.Mesh(wb, skinMat);
    this.root.add(this.wristBall);
    this.root.traverse((o) => { o.frustumCulled = false; });
  }

  /** Pose the arm so its wrist sits at `wrist`. `shoulder` and `pole` are in the same space as the root. */
  solve(shoulder: THREE.Vector3, wrist: THREE.Vector3, pole: THREE.Vector3): void {
    const d = this._dir.subVectors(wrist, shoulder);
    let dist = d.length();
    // long guns put the support hand beyond a real arm's reach from this camera-space shoulder: stretch the arm
    // (up to 45 %) rather than leave the hand floating in front of a short forearm
    const k = THREE.MathUtils.clamp(dist / (this.L1 + this.L2 - 0.004), 1, 1.45);
    const L1 = this.L1 * k, L2 = this.L2 * k;
    const maxReach = L1 + L2 - 0.004;
    const minReach = Math.abs(L1 - L2) + 0.01;
    d.multiplyScalar(1 / Math.max(dist, 1e-5));
    dist = THREE.MathUtils.clamp(dist, minReach, maxReach);
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    // pole component perpendicular to the shoulder→wrist axis
    this._perp.copy(pole).addScaledVector(d, -pole.dot(d));
    if (this._perp.lengthSq() < 1e-6) this._perp.set(0, -1, 0);
    this._perp.normalize();
    this._elbow.copy(shoulder).addScaledVector(d, a).addScaledVector(this._perp, h);
    const wristClamped = shoulder.clone().addScaledVector(d, dist);

    this.place(this.upper, shoulder, this._elbow);
    this.upper.scale.z = k;
    this.elbowBall.position.copy(this._elbow);
    // forearm: sleeve from the elbow, cuff and a little skin before the wrist
    const fdir = wristClamped.clone().sub(this._elbow);
    const flen = fdir.length();
    fdir.multiplyScalar(1 / Math.max(flen, 1e-5));
    this.place(this.fore, this._elbow, this._elbow.clone().add(fdir));
    this.fore.scale.set(1, 1, Math.max(0.2, (flen - 0.075) / (this.L2 - 0.03)));
    const cuffStart = this._elbow.clone().addScaledVector(fdir, Math.max(0, flen - 0.105));
    this.place(this.cuff, cuffStart, cuffStart.clone().add(fdir));
    const skinStart = this._elbow.clone().addScaledVector(fdir, Math.max(0, flen - 0.08));
    this.place(this.forearmSkin, skinStart, skinStart.clone().add(fdir));
    this.wristBall.position.copy(wristClamped).addScaledVector(fdir, -0.004);
  }

  private place(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): void {
    mesh.position.copy(from);
    this._dir.subVectors(to, from).normalize();
    mesh.quaternion.setFromUnitVectors(this._z, this._dir);
    mesh.scale.set(1, 1, 1);
    if (mesh === this.upper) {
      mesh.scale.z = from.distanceTo(to) / this.L1;
    }
  }
}
