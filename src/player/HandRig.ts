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
const LENGTHS: Record<(typeof FINGERS)[number], readonly [number, number, number]> = {
  index: [0.040, 0.024, 0.020],
  middle: [0.044, 0.027, 0.021],
  ring: [0.041, 0.025, 0.020],
  pinky: [0.033, 0.019, 0.017],
};
const RADII = { index: 0.0088, middle: 0.0092, ring: 0.0085, pinky: 0.0075 };
const KNUCKLE_X = { index: -0.0275, middle: -0.0095, ring: 0.0085, pinky: 0.0255 };

const skin = (): THREE.MeshPhysicalMaterial => {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#bd835f'), roughness: 0.58, metalness: 0, sheen: 0.6, sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#ff9a7a'),
  });
  m.fog = false;
  return m;
};

/**
 * A right hand built from primitives with a proper bone hierarchy (palm → 3 joints per finger, 3 for the thumb).
 * Local frame: origin at the wrist, fingers extend along −Z, the back of the hand faces +Y, the thumb is at −X.
 * A left hand is the same rig mirrored by the owner.
 */
export class HandRig {
  readonly root = new THREE.Group();
  readonly material: THREE.MeshPhysicalMaterial;
  private readonly fingerJoints: Record<(typeof FINGERS)[number], THREE.Object3D[]> = { index: [], middle: [], ring: [], pinky: [] };
  private readonly fingerRoots: THREE.Object3D[] = [];
  private readonly thumbJoints: THREE.Object3D[] = [];
  private thumbRoot!: THREE.Object3D;
  readonly nailMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#d9a789'), roughness: 0.3, clearcoat: 0.6, fog: false });
  private readonly current: HandPose = structuredClone(POSES.relaxed) as HandPose;

  constructor(material?: THREE.MeshPhysicalMaterial) {
    this.material = material ?? skin();
    const m = this.material;
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0): THREE.Mesh => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const ellipsoid = (rx: number, ry: number, rz: number, x: number, y: number, z: number): void => {
      const g = new THREE.SphereGeometry(1, 16, 12);
      g.scale(rx, ry, rz);
      add(this.root, g, x, y, z);
    };

    // Palm, heel of the hand, thenar/hypothenar pads and knuckle ridge.
    ellipsoid(0.0455, 0.0155, 0.0505, 0, 0, -0.050);
    ellipsoid(0.028, 0.017, 0.028, -0.018, -0.004, -0.022);
    ellipsoid(0.019, 0.015, 0.034, 0.028, -0.003, -0.05);
    ellipsoid(0.044, 0.0125, 0.012, 0, 0.002, -0.094);
    // Fingers
    for (const name of FINGERS) {
      const [l1, l2, l3] = LENGTHS[name];
      const r = RADII[name];
      const base = new THREE.Object3D();
      base.position.set(KNUCKLE_X[name], 0.003, -0.094);
      this.root.add(base);
      this.fingerRoots.push(base);
      let parent: THREE.Object3D = base;
      [l1, l2, l3].forEach((len, i) => {
        const joint = i === 0 ? base : new THREE.Object3D();
        if (i > 0) {
          joint.position.set(0, 0, -[l1, l2][i - 1]!);
          parent.add(joint);
        }
        const rr = r * (1 - i * 0.11);
        const geo = new THREE.CapsuleGeometry(rr, len, 4, 10);
        geo.rotateX(Math.PI / 2);
        geo.scale(1, 0.92, 1); // slightly flattened, like a real finger
        add(joint, geo, 0, 0, -len / 2);
        if (i === 2) {
          // fingernail on the back of the fingertip
          const nail = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8).scale(rr * 0.78, rr * 0.22, len * 0.46), this.nailMat);
          nail.position.set(0, rr * 0.8, -len * 0.55);
          joint.add(nail);
        }
        this.fingerJoints[name].push(joint);
        parent = joint;
      });
    }

    // Thumb: base on the −X side of the palm, angled forward-outward.
    this.thumbRoot = new THREE.Object3D();
    this.thumbRoot.position.set(-0.034, -0.004, -0.032);
    this.root.add(this.thumbRoot);
    const tl = [0.040, 0.032, 0.026];
    let tp: THREE.Object3D = this.thumbRoot;
    tl.forEach((len, i) => {
      const joint = i === 0 ? this.thumbRoot : new THREE.Object3D();
      if (i > 0) {
        joint.position.set(0, 0, -tl[i - 1]!);
        tp.add(joint);
      }
      const geo = new THREE.CapsuleGeometry(0.0105 - i * 0.0008, len, 4, 10);
      geo.rotateX(Math.PI / 2);
      add(joint, geo, 0, 0, -len / 2);
      this.thumbJoints.push(joint);
      tp = joint;
    });

    for (const o of this.root.children) if (o instanceof THREE.Mesh) o.castShadow = false;
    this.apply(POSES.relaxed);
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
    this.thumbRoot.rotation.set(-t[1] * 0.6 + 0.05, 0.55 - t[0] * 0.9, -0.28 + t[0] * 0.4);
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
  private readonly L1 = 0.30;
  private readonly L2 = 0.27;
  private readonly _dir = new THREE.Vector3();
  private readonly _elbow = new THREE.Vector3();
  private readonly _perp = new THREE.Vector3();
  private readonly _z = new THREE.Vector3(0, 0, -1);

  constructor(sleeve: THREE.Material, skinMat: THREE.Material, cuffMat: THREE.Material) {
    const seg = (r0: number, r1: number, len: number, mat: THREE.Material): THREE.Mesh => {
      const g = new THREE.CylinderGeometry(r1, r0, len, 18, 1);
      g.rotateX(-Math.PI / 2); // axis along −Z, r0 at the start
      g.translate(0, 0, -len / 2);
      const m = new THREE.Mesh(g, mat);
      this.root.add(m);
      return m;
    };
    this.upper = seg(0.052, 0.046, this.L1, sleeve);
    this.fore = seg(0.046, 0.034, this.L2 - 0.03, sleeve);
    this.cuff = seg(0.034, 0.034, 0.04, cuffMat);
    this.forearmSkin = seg(0.0215, 0.0235, 0.075, skinMat);
    this.elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.047, 16, 12), sleeve);
    this.root.add(this.elbowBall);
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
    const skinStart = this._elbow.clone().addScaledVector(fdir, Math.max(0, flen - 0.078));
    this.place(this.forearmSkin, skinStart, skinStart.clone().add(fdir));
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
