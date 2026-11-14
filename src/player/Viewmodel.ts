import * as THREE from 'three';
import { clamp, damp, easeOutCubic, Spring } from '../core/math';
import { ArmRig, HandRig, POSES, type HandPose } from './HandRig';
import type { Player } from './Player';
import { Pistol } from './Pistol';
import { LongGun, type GunModel } from './LongGun';
import type { Outfit, WeaponKit } from '../economy/types';
import { WEAPONS, WEAPON_ORDER, type WeaponId } from './Weapons';
import { DRAW_TIME, HOLSTER_TIME, INSPECT_TIME, RELOAD, type WeaponSystem } from './WeaponSystem';

/** Layer used for everything the first-person camera draws on top of the world. */
export const VIEWMODEL_LAYER = 1;

const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number): number => t * t * (3 - 2 * t);
const easeOutBack = (t: number): number => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// scratch (no per-frame allocation)
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _mirror = new THREE.Vector3(-1, 1, 1);

interface Pose {
  p: THREE.Vector3;
  q: THREE.Quaternion;
}
const pose = (x: number, y: number, z: number, rx: number, ry: number, rz: number): Pose => ({
  p: new THREE.Vector3(x, y, z),
  q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
});
const lerpPose = (a: Pose, b: Pose, t: number, out: Pose): Pose => {
  out.p.lerpVectors(a.p, b.p, t);
  out.q.slerpQuaternions(a.q, b.q, t);
  return out;
};

export type ActKind = 'smash' | 'jack' | 'eat' | 'throw';
const ACT_DUR: Record<ActKind, number> = { smash: 0.75, jack: 0.9, eat: 1.25, throw: 0.6 };

const HIP = pose(0.15, -0.168, -0.45, 0.012, 0.05, 0);
const SPRINT = pose(0.12, -0.2, -0.38, -0.66, 0.44, 0.18);
const HOLSTER = pose(0.22, -0.66, -0.12, -1.15, 0.2, 0.2);
const SWIM = pose(0.12, -0.28, -0.36, -0.5, 0.3, 0.1);
const MANTLE = pose(0.19, -0.58, -0.14, -1.0, 0.35, 0.1);

/** Empty hands hang in a loose half-fist. */
const RESTING: HandPose = HandRig.mix(POSES.relaxed, POSES.fist, 0.55, HandRig.blank());

const SHOULDER_R = new THREE.Vector3(0.2, -0.2, 0.0);
const SHOULDER_L = new THREE.Vector3(-0.2, -0.2, 0.0);
const POLE_R = new THREE.Vector3(0.5, -1, 0.35);
const POLE_L = new THREE.Vector3(-0.5, -1, 0.35);
const REST_R = pose(0.2, -0.2, -0.43, 0.35, -0.2, 0.28);
const REST_L = pose(-0.2, -0.2, -0.43, 0.35, 0.2, -0.28);

/**
 * First-person presentation: arms with IK, the pistol, and all weapon animation.
 * Everything lives on its own render layer and is drawn in a second pass with a narrower field of view,
 * so the gun never clips into walls and keeps a stable look at any world FOV.
 */
export class Viewmodel {
  readonly group = new THREE.Group();
  readonly camera = new THREE.PerspectiveCamera(56, 16 / 9, 0.01, 6);
  readonly pistol = new Pistol();
  private model: GunModel = this.pistol;
  private sleeveMat!: THREE.MeshStandardMaterial;
  private cuffMat!: THREE.MeshStandardMaterial;
  private readonly longs = new Map<WeaponId, LongGun>();
  private currentId: WeaponId = 'vc9';
  private adsPose: Pose = pose(0, -0.0595, -0.40, 0, 0, 0);
  readonly materials: THREE.Material[] = [];

  private readonly gun = new THREE.Group();
  private readonly right = new HandRig();
  /** A scripted hand action (car break-ins, carjacks, eating) that takes over both hands for a moment. */
  private act: { kind: ActKind; t: number; dur: number } | null = null;
  private scopeHid = false;
  /** Something held in the right hand during an action (a snack). */
  private held: THREE.Object3D | null = null;
  private readonly left: HandRig;
  private readonly armR: ArmRig;
  private readonly armL: ArmRig;
  private readonly flash: THREE.Group;
  private flashT = 0;
  private readonly spareMag = new THREE.Group();

  // springs
  private readonly swayX = new Spring(0);
  private readonly swayY = new Spring(0);
  private readonly swayYaw = new Spring(0);
  private readonly swayPitch = new Spring(0);
  private readonly kickZ = new Spring(0);
  private readonly kickPitch = new Spring(0);
  private readonly kickRoll = new Spring(0);
  private readonly landDip = new Spring(0);
  /** Melee slash progress (seconds since the swing started; large when idle). */
  private swingT = 9;
  private swingSide = 1;

  private lastYaw = 0;
  private lastPitch = 0;
  private sprintB = 0;
  private swimB = 0;
  private mantleB = 0;
  private adsB = 0;
  private breathe = 0;
  private magDropped = false;
  private readonly rPose = HandRig.blank();
  private readonly lPose = HandRig.blank();

  // pooled poses
  private readonly gunPose: Pose = pose(0, 0, 0, 0, 0, 0);
  private readonly tmpPose: Pose = pose(0, 0, 0, 0, 0, 0);
  private readonly handR: Pose = pose(0, 0, 0, 0, 0, 0);
  private readonly handL: Pose = pose(0, 0, 0, 0, 0, 0);
  private readonly gunMatrix = new THREE.Matrix4();

  /** Debug overrides for look-development screenshots. */
  debug: { reloadT?: number; ads?: number; holster?: number; sprint?: number; inspectT?: number; pose?: string; cam?: { p: number[]; t: number[]; fov?: number } } = {};

  /** Sleeves, gloves and skin from what the player is wearing. */
  applyOutfit(o: Outfit): void {
    this.sleeveMat.color.set(o.top);
    const skin = this.right.material;
    const glove = o.gloves === 'leather' ? '#2c1d14' : o.gloves === 'tactical' ? '#1f231a' : o.gloves === 'white' ? '#e9e9e9' : null;
    if (glove) {
      skin.color.set(glove); skin.roughness = o.gloves === 'white' ? 0.7 : 0.62; skin.sheen = 0; this.cuffMat.color.set(glove);
      this.right.nailMat.color.set(glove); this.left.nailMat.color.set(glove);
    } else {
      skin.color.set(o.skin); skin.roughness = 0.58; skin.sheen = 0.6; this.cuffMat.color.set(o.cuff);
      const nail = new THREE.Color(o.skin).lerp(new THREE.Color('#ffd9c2'), 0.35);
      this.right.nailMat.color.copy(nail); this.left.nailMat.color.copy(nail);
    }
  }

  /** Cosmetic tint of a weapon's metal parts. */
  applyKit(id: WeaponId, kit: WeaponKit): void {
    const gun = id === 'vc9' ? this.pistol : this.longs.get(id);
    if (!gun) return;
    const mats = gun.materials as THREE.MeshStandardMaterial[];
    const metals = id === 'vc9' ? [mats[0]!, mats[1]!] : [mats[0]!];
    for (const m of metals) m.color.set(kit.tint);
  }

  /** Called when the empty magazine is released: world position + velocity for the falling prop. */
  onMagDrop: ((pos: THREE.Vector3, vel: THREE.Vector3) => void) | null = null;

  constructor() {
    const skin = this.right.material;
    this.left = new HandRig(skin);
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x3d4248, roughness: 0.92, metalness: 0 });
    const cuff = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.95, metalness: 0 });
    this.armR = new ArmRig(sleeve, skin, cuff);
    this.armL = new ArmRig(sleeve, skin, cuff);
    this.sleeveMat = sleeve;
    this.cuffMat = cuff;
    this.materials.push(skin, sleeve, cuff, ...this.pistol.materials);

    this.gun.add(this.pistol.group);
    for (const id of WEAPON_ORDER.filter((w): w is Exclude<WeaponId, 'vc9'> => w !== 'vc9')) {
      const lg = new LongGun(id);
      lg.group.visible = false;
      this.longs.set(id, lg);
      this.gun.add(lg.group);
      this.materials.push(...lg.materials);
    }
    // muzzle flash: two crossed additive quads
    this.flash = new THREE.Group();
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,220,140,0.95)'); grd.addColorStop(0.5, 'rgba(255,140,40,0.35)'); grd.addColorStop(1, 'rgba(255,80,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,230,160,0.9)'; g.lineWidth = 3;
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); g.stroke(); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const fmat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(5, 3.6, 1.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    const q1 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fmat);
    const q2 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fmat);
    q2.rotation.y = Math.PI / 2;
    this.flash.add(q1, q2);
    this.flash.position.copy(this.pistol.muzzle);
    this.flash.visible = false;
    this.gun.add(this.flash);

    // spare magazine used during reloads
    this.spareMag.add(...this.cloneMagazine());
    this.spareMag.visible = false;

    this.group.add(this.gun, this.armR.root, this.armL.root, this.right.root, this.left.root, this.spareMag);
    this.right.root.matrixAutoUpdate = false;
    this.left.root.matrixAutoUpdate = false;
    this.group.traverse((o) => {
      o.layers.set(VIEWMODEL_LAYER);
      o.frustumCulled = false;
      // the viewmodel lives in its own camera space near the origin: world shadow lookups there are garbage
      if (o instanceof THREE.Mesh) { o.receiveShadow = false; o.castShadow = false; }
    });
    this.camera.layers.set(VIEWMODEL_LAYER);
  }

  private cloneMagazine(): THREE.Object3D[] {
    return this.model.magazine.children.map((c) => c.clone());
  }

  /** Swap the gun model in the hands (called when the selected weapon changes). */
  private setWeapon(id: WeaponId): void {
    this.currentId = id;
    this.pistol.group.visible = id === 'vc9';
    for (const [k, g] of this.longs) g.group.visible = k === id;
    this.model = id === 'vc9' ? this.pistol : this.longs.get(id)!;
    this.flash.position.copy(this.model.muzzle);
    this.spareMag.clear();
    this.spareMag.add(...this.cloneMagazine());
    const sp = this.model.sightPoint;
    this.adsPose = pose(-sp.x, -(sp.y + 0.001), -0.40 - sp.z, 0, 0, 0);
    this.magDropped = false;
  }

  // ------------------------------------------------------------------------------------ events

  /** Weapon fired: kick, flash. */
  kick(strength: number): void {
    if (WEAPONS[this.currentId].melee) { this.swingT = 0; this.swingSide = -this.swingSide; return; }
    this.kickZ.velocity += 1.25 * strength;
    this.kickPitch.velocity += 5.2 * strength;
    this.kickRoll.velocity += (Math.random() - 0.5) * 3.2;
    this.swayX.velocity += (Math.random() - 0.5) * 0.5;
    this.flashT = 0.05;
    this.flash.visible = true;
    const s = 0.065 + Math.random() * 0.04;
    this.flash.scale.set(s, s, s);
    this.flash.rotation.z = Math.random() * 6.28;
  }

  /** Play a hand action: the gun is lowered out of sight while both hands do the work. */
  play(kind: ActKind, item: THREE.Object3D | null = null): void {
    this.act = { kind, t: 0, dur: ACT_DUR[kind] };
    if (this.held) this.right.root.remove(this.held);
    this.held = item;
    if (item) { item.traverse((o) => { o.frustumCulled = false; }); this.right.root.add(item); }
  }

  get acting(): boolean { return !!this.act; }

  /** Hard landing / vault impact nudges the gun down. */
  bump(amount: number): void {
    this.landDip.velocity -= amount;
  }

  /** Gun-space → world helper for effects (muzzle, ejection port). */
  gunPoint(local: THREE.Vector3, camera: THREE.Camera, out: THREE.Vector3): THREE.Vector3 {
    out.copy(local).applyMatrix4(this.gunMatrix);
    return out.applyMatrix4(camera.matrixWorld);
  }

  // -------------------------------------------------------------------------------------- update

  update(dt: number, p: Player, w: WeaponSystem, cam: THREE.PerspectiveCamera, aspect: number): void {
    const dbg = this.debug;
    if (w.def.id !== this.currentId) this.setWeapon(w.def.id);
    // looking through a sniper scope: no gun or hands in the way
    const scoped = !!w.def.sniper && w.ads > 0.85;
    if (scoped && this.group.visible) { this.group.visible = false; this.scopeHid = true; }
    else if (!scoped && this.scopeHid) { this.group.visible = true; this.scopeHid = false; }
    // follow the main camera exactly; only the FOV differs
    this.group.position.copy(cam.position);
    this.group.quaternion.copy(cam.quaternion);
    this.group.updateMatrixWorld(true);
    cam.updateMatrixWorld();
    this.cameraRef = cam;
    this.camera.position.copy(cam.position);
    this.camera.quaternion.copy(cam.quaternion);
    this.camera.aspect = aspect;
    this.adsB = dbg.ads ?? w.ads;
    this.camera.fov = 52 - 6 * this.adsB;
    if (dbg.cam) {
      // look-dev camera: positions are in view space (x right, y up, −z forward)
      this.camera.position.set(dbg.cam.p[0]!, dbg.cam.p[1]!, dbg.cam.p[2]!).applyQuaternion(cam.quaternion).add(cam.position);
      _v.set(dbg.cam.t[0]!, dbg.cam.t[1]!, dbg.cam.t[2]!).applyQuaternion(cam.quaternion).add(cam.position);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(_v);
      if (dbg.cam.fov) this.camera.fov = dbg.cam.fov;
    }
    this.camera.updateProjectionMatrix();

    // --- blend parameters ----------------------------------------------------------------------
    let H: number;
    switch (w.state) {
      case 'holstered': H = 1; break;
      case 'drawing': H = 1 - easeOutBack(clamp(w.stateT / DRAW_TIME, 0, 1)); break;
      case 'holstering': H = easeInOut(clamp(w.stateT / HOLSTER_TIME, 0, 1)); break;
      default: H = 0;
    }
    if (dbg.holster !== undefined) H = dbg.holster;
    this.sprintB = dbg.sprint ?? p.sprintBlend;
    this.swimB = damp(this.swimB, p.state === 'swim' ? 1 : 0, 7, dt);
    this.mantleB = damp(this.mantleB, p.mantle ? 1 : 0, p.mantle ? 14 : 8, dt);
    this.breathe += dt;

    // --- sway from look motion ------------------------------------------------------------------
    const dy = (p.yaw - this.lastYaw) / Math.max(dt, 1e-3);
    const dp = (p.pitch - this.lastPitch) / Math.max(dt, 1e-3);
    this.lastYaw = p.yaw;
    this.lastPitch = p.pitch;
    const swayAmt = 1 - 0.7 * this.adsB;
    this.swayYaw.update(clamp(dy * 0.018, -0.12, 0.12) * swayAmt, 0.11, dt);
    this.swayPitch.update(clamp(-dp * 0.015, -0.1, 0.1) * swayAmt, 0.11, dt);
    this.swayX.update(clamp(-dy * 0.004, -0.03, 0.03) * swayAmt, 0.13, dt);
    this.swayY.update(clamp(dp * 0.003, -0.025, 0.025) * swayAmt, 0.13, dt);
    this.kickZ.update(0, 0.085, dt);
    this.kickPitch.update(0, 0.1, dt);
    this.kickRoll.update(0, 0.1, dt);
    this.landDip.update(0, 0.12, dt);

    // --- base gun pose ---------------------------------------------------------------------------
    const gp = this.gunPose;
    lerpPose(HIP, this.adsPose, easeInOut(this.adsB) * (1 - this.sprintB), gp);
    lerpPose(gp, SPRINT, this.sprintB, gp);
    lerpPose(gp, SWIM, this.swimB, gp);
    lerpPose(gp, MANTLE, this.mantleB, gp);
    lerpPose(gp, HOLSTER, H, gp);

    // additive: bob, breathing, sway, recoil, strafe lean
    const bobK = 1.8 * (1 - 0.75 * this.adsB) * (1 + 0.5 * this.sprintB);
    const gait = p.gait;
    gp.p.x += p.bob.x * bobK * 1.3 + Math.sin(gait * 0.5 + 1.2) * 0.004 * p.speed2D * 0.12 * (1 - this.adsB * 0.8);
    gp.p.y += p.bob.y * bobK * 1.4 - Math.abs(Math.sin(gait)) * 0.004 * this.sprintB;
    const br = Math.sin(this.breathe * 1.5) * (0.0012 + 0.0009 * this.adsB);
    gp.p.y += br + Math.sin(this.breathe * 0.9 + 2) * 0.0007;
    gp.p.x += this.swayX.value;
    gp.p.y += this.swayY.value + this.landDip.value * 0.02;
    gp.p.z += this.kickZ.value * 0.05;
    // melee: a fast diagonal slash across the screen, alternating sides, then a slower recovery
    this.swingT += dt;
    let sx = 0, sy = 0, sz = 0, sYaw = 0, sRoll = 0, sPitch = 0;
    const SW = 0.34;
    if (this.swingT < SW) {
      const u = this.swingT / SW;
      const cut = u < 0.4 ? Math.sin((u / 0.4) * Math.PI * 0.5) : 1 - (u - 0.4) / 0.6;
      const arc = u < 0.4 ? u / 0.4 : 1;
      const side = this.swingSide;
      sx = side * (0.1 - 0.26 * arc) * cut;
      sy = (0.05 - 0.1 * arc) * cut;
      sz = -0.12 * Math.sin(Math.min(1, u / 0.4) * Math.PI) * cut;
      sYaw = side * (0.5 - 1.1 * arc) * cut;
      sRoll = side * 0.9 * cut;
      sPitch = -0.5 * Math.sin(Math.min(1, u / 0.4) * Math.PI) * cut;
    }
    gp.p.x += sx; gp.p.y += sy; gp.p.z += sz;
    const lean = clamp(-p.roll * 6, -0.1, 0.1);
    _e.set(
      this.kickPitch.value * 0.1 + this.swayPitch.value + Math.sin(this.breathe * 1.5 + 0.7) * 0.0035 + sPitch,
      this.swayYaw.value + sYaw,
      this.kickRoll.value * 0.05 + lean + p.roll * 1.2 + sRoll,
      'YXZ',
    );
    _q.setFromEuler(_e);
    gp.q.multiply(_q);

    // --- scripted: reload & inspect --------------------------------------------------------------
    const reloading = w.state === 'reloading' || dbg.reloadT !== undefined;
    const rt = dbg.reloadT ?? w.reloadTime;
    const rDone = w.tactical ? RELOAD.doneTactical : RELOAD.doneEmpty;
    let reloadEnv = 0;
    if (reloading) {
      reloadEnv = smooth(0, 0.3, rt) * (1 - smooth(rDone - 0.42, rDone, rt));
      _e.set(0.16 * reloadEnv, 0.28 * reloadEnv, 0.62 * reloadEnv, 'YXZ');
      _q.setFromEuler(_e);
      gp.q.multiply(_q);
      gp.p.x -= 0.035 * reloadEnv;
      gp.p.y += 0.02 * reloadEnv;
      gp.p.z += 0.03 * reloadEnv;
    }
    const inspecting = w.state === 'inspecting' || dbg.inspectT !== undefined;
    if (inspecting) {
      const it = dbg.inspectT ?? w.stateT;
      const up = smooth(0, 0.45, it) * (1 - smooth(INSPECT_TIME - 0.5, INSPECT_TIME, it));
      const turn = smooth(0.45, 1.3, it) * (1 - smooth(1.7, 2.3, it));
      gp.p.x += -0.1 * up;
      gp.p.y += 0.07 * up;
      gp.p.z += 0.04 * up;
      _e.set(0.1 * up, 0.55 * up + 0.5 * turn, 0.35 * up - 1.25 * turn, 'YXZ');
      _q.setFromEuler(_e);
      gp.q.multiply(_q);
    }

    this.gun.position.copy(gp.p);
    this.gun.quaternion.copy(gp.q);
    this.gun.updateMatrix();
    this.gunMatrix.copy(this.gun.matrix);

    // --- gun internals --------------------------------------------------------------------------
    this.model.setSlide(w.slide);
    this.model.setTrigger(w.trigger);
    this.updateMagazine(rt, reloading);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.visible = false;
    }

    // --- hands -----------------------------------------------------------------------------------
    this.computeHands(dt, p, w, cam, rt, reloading, rDone, H);
    this.right.root.updateMatrixWorld(true);
    this.left.root.updateMatrixWorld(true);

    // effects want the muzzle and ejection port in world space
    this.gunPoint(this.model.muzzle, cam, w.muzzleWorld);
    this.gunPoint(this.model.eject, cam, w.ejectWorld);
  }

  // magazine visibility, positions and the held spare
  private updateMagazine(rt: number, reloading: boolean): void {
    const mag = this.model.magazine;
    mag.visible = true;
    mag.position.set(0, -0.006, 0);
    if (!reloading) {
      this.magDropped = false;
      this.spareMag.visible = false;
      return;
    }
    if (rt >= RELOAD.magOut && rt < RELOAD.magDrop) {
      // the magazine slides out along the grip axis
      mag.position.y = -0.006 - 0.12 * easeInOut((rt - RELOAD.magOut) / (RELOAD.magDrop - RELOAD.magOut));
    } else if (rt >= RELOAD.magDrop && rt < RELOAD.insert) {
      mag.visible = false;
      if (!this.magDropped && this.cameraRef) {
        this.magDropped = true;
        // hand it to the world as a falling prop
        const pos = this.gunPoint(_v.set(0, -0.17, 0.075), this.cameraRef, new THREE.Vector3());
        this.onMagDrop?.(pos, new THREE.Vector3(0.1, -0.4, 0.15));
      }
    }
  }

  private cameraRef: THREE.PerspectiveCamera | null = null;

  /** Decide where each hand goes, blend finger poses, drive IK and write the hand transforms. */
  private computeHands(
    dt: number, p: Player, w: WeaponSystem, cam: THREE.PerspectiveCamera, rt: number, reloading: boolean, rDone: number, H: number,
  ): void {
    const grab = smooth(0.25, 0.7, 1 - H);
    const mt = this.mantleB;

    // --- right hand: on the grip (or resting / on the ledge) --------------------------------------
    _m.multiplyMatrices(this.gunMatrix, this.model.rightGrip);
    _m.decompose(this.handR.p, this.handR.q, _s);
    lerpPose(REST_R, this.handR, grab * (1 - mt), this.tmpPose);
    this.handR.p.copy(this.tmpPose.p);
    this.handR.q.copy(this.tmpPose.q);

    // --- left hand: support grip, reload choreography, or resting ----------------------------------
    _m.multiplyMatrices(this.gunMatrix, this.model.leftGrip);
    _m.decompose(this.handL.p, this.handL.q, _s);
    let leftPose: HandPose = POSES.support;
    let leftBlend = 0;
    let leftPoseB: HandPose = POSES.support;
    if (reloading) {
      const r = this.reloadLeft(rt, rDone);
      this.handL.p.copy(r.pos);
      this.handL.q.copy(r.quat);
      leftPose = r.a;
      leftPoseB = r.b;
      leftBlend = r.t;
    }
    // idle weapon-less, sprinting, etc.
    lerpPose(REST_L, this.handL, grab * (1 - mt), this.tmpPose);
    this.handL.p.copy(this.tmpPose.p);
    this.handL.q.copy(this.tmpPose.q);

    // --- mantle overrides --------------------------------------------------------------------------
    if (p.mantle && mt > 0.01) this.mantleHands(p, cam, mt);

    // --- scripted hand actions ---------------------------------------------------------------------
    let actW = 0;
    if (this.act) {
      const a = this.act;
      a.t += dt;
      const u = Math.min(1, a.t / a.dur);
      actW = smooth(0, 0.12, u) * (1 - smooth(0.85, 1, u));
      this.actHands(a.kind, u, actW);
      this.model.group.visible = actW < 0.5;
      if (u >= 1) {
        this.act = null;
        this.model.group.visible = true;
        if (this.held) { this.right.root.remove(this.held); this.held = null; }
      }
    }

    // --- finger poses --------------------------------------------------------------------------------
    const trig = w.trigger;
    HandRig.mix(POSES.gripIndexOff, POSES.gripTrigger, trig, this.rPose);
    HandRig.mix(RESTING, this.rPose, grab * (1 - mt), this.rPose);
    HandRig.mix(this.rPose, p.mantle ? POSES.hook : this.rPose, mt, this.rPose);
    HandRig.mix(leftPose, leftPoseB, leftBlend, this.lPose);
    HandRig.mix(RESTING, this.lPose, grab * (1 - mt), this.lPose);
    HandRig.mix(this.lPose, p.mantle ? POSES.hook : this.lPose, mt, this.lPose);
    if (actW > 0) { HandRig.mix(this.rPose, this.actR, actW, this.rPose); HandRig.mix(this.lPose, this.actL, actW, this.lPose); }
    if (this.debug.pose === 'fist') { this.right.apply(POSES.fist); this.left.apply(POSES.fist); }
    else if (this.debug.pose === 'flat') { this.right.apply(POSES.flat); this.left.apply(POSES.flat); }
    else { this.right.apply(this.rPose); this.left.apply(this.lPose); }

    // --- IK + hand matrices ---------------------------------------------------------------------------
    this.armR.solve(SHOULDER_R, this.handR.p, POLE_R);
    this.armL.solve(SHOULDER_L, this.handL.p, POLE_L);
    this.right.root.matrix.compose(this.handR.p, this.handR.q, _one);
    this.left.root.matrix.compose(this.handL.p, this.handL.q, _mirror);
    void dt;
  }

  private readonly actR: HandPose = HandRig.blank();
  private readonly actL: HandPose = HandRig.blank();

  /** View-space keyframes for both hands during an action, blended in by `w`. */
  private actHands(kind: ActKind, u: number, w: number): void {
    const key = (frames: [number, number, number, number, number, number, number][], t: number, out: Pose): Pose => {
      let i = 0;
      while (i < frames.length - 2 && t > frames[i + 1]![0]) i++;
      const a = frames[i]!, b = frames[i + 1]!;
      const k = easeInOut(clamp((t - a[0]) / Math.max(1e-4, b[0] - a[0]), 0, 1));
      out.p.set(a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k);
      out.q.setFromEuler(new THREE.Euler(a[4] + (b[4] - a[4]) * k, a[5] + (b[5] - a[5]) * k, a[6] + (b[6] - a[6]) * k, 'YXZ'));
      return out;
    };
    let R: [number, number, number, number, number, number, number][], L: typeof R;
    let pr: HandPose = POSES.fist, pl: HandPose = POSES.flat;
    if (kind === 'smash') {
      // left palm on the door, right elbow cocks back and drives through the glass
      R = [[0, 0.2, -0.3, -0.4, 0.3, -0.2, 0.3], [0.35, 0.32, -0.08, -0.16, 0.9, 0.6, 1.1], [0.5, 0.06, -0.16, -0.56, 0.1, 0.3, 0.5], [0.62, 0.07, -0.17, -0.54, 0.1, 0.3, 0.5], [1, 0.2, -0.3, -0.4, 0.3, -0.2, 0.3]];
      L = [[0, -0.2, -0.3, -0.4, 0.3, 0.2, -0.3], [0.3, -0.26, -0.16, -0.5, 0.1, 0.4, -1.2], [1, -0.26, -0.16, -0.5, 0.1, 0.4, -1.2]];
    } else if (kind === 'jack') {
      // both hands shoot forward, hook the driver and yank him out
      R = [[0, 0.2, -0.3, -0.4, 0.3, -0.2, 0.3], [0.3, 0.12, -0.08, -0.7, 0.4, 0, 0.6], [0.45, 0.12, -0.1, -0.68, 0.4, 0, 0.6], [0.8, 0.26, -0.24, -0.26, 0.2, -0.4, 0.4], [1, 0.2, -0.3, -0.4, 0.3, -0.2, 0.3]];
      L = [[0, -0.2, -0.3, -0.4, 0.3, 0.2, -0.3], [0.3, -0.1, -0.06, -0.7, 0.4, 0, -0.6], [0.45, -0.1, -0.08, -0.68, 0.4, 0, -0.6], [0.8, -0.26, -0.22, -0.26, 0.2, 0.4, -0.4], [1, -0.2, -0.3, -0.4, 0.3, 0.2, -0.3]];
      pr = u < 0.3 ? POSES.flat : POSES.hook; pl = pr;
    } else if (kind === 'throw') {
      // wind up behind the shoulder, whip forward and release, follow through low
      R = [[0, 0.2, -0.3, -0.4, 0.3, -0.2, 0.3], [0.3, 0.3, 0.08, -0.05, -0.6, -0.3, 0.4], [0.55, 0.05, 0.02, -0.6, 0.5, 0.1, 0.1], [0.75, -0.02, -0.2, -0.55, 0.8, 0.2, 0], [1, 0.2, -0.3, -0.4, 0.3, -0.2, 0.3]];
      L = [[0, -0.2, -0.3, -0.43, 0.35, 0.2, -0.28], [0.3, -0.2, -0.05, -0.6, 0.2, 0.3, -0.6], [0.7, -0.24, -0.3, -0.35, 0.3, 0.2, -0.3], [1, -0.2, -0.3, -0.43, 0.35, 0.2, -0.28]];
      pr = u < 0.5 ? POSES.fist : POSES.flat; pl = POSES.flat;
    } else {
      // eat: the right hand brings the snack up to the mouth, two bites, and away
      R = [[0, 0.2, -0.36, -0.36, 0.4, -0.3, 0.3], [0.3, 0.05, -0.1, -0.2, 1.1, -0.5, 0.6], [0.45, 0.04, -0.07, -0.17, 1.15, -0.5, 0.6], [0.55, 0.05, -0.1, -0.2, 1.1, -0.5, 0.6], [0.65, 0.04, -0.07, -0.17, 1.15, -0.5, 0.6], [1, 0.2, -0.36, -0.36, 0.4, -0.3, 0.3]];
      L = [[0, -0.2, -0.3, -0.43, 0.35, 0.2, -0.28], [1, -0.2, -0.3, -0.43, 0.35, 0.2, -0.28]];
      pr = POSES.pinch; pl = RESTING;
    }
    const r = key(R, u, this.tmpPose);
    this.handR.p.lerp(r.p, w); this.handR.q.slerp(r.q, w);
    const l = key(L, u, this.tmpPose);
    this.handL.p.lerp(l.p, w); this.handL.q.slerp(l.q, w);
    HandRig.mix(pr, pr, 0, this.actR);
    HandRig.mix(pl, pl, 0, this.actL);
  }

  /** Left-hand choreography during a reload, in view space. Returns pose + finger pose blend. */
  private reloadLeft(t: number, done: number): { pos: THREE.Vector3; quat: THREE.Quaternion; a: HandPose; b: HandPose; t: number } {
    const P = this.model;
    const out = this._reloadOut;
    // gun-space key positions
    const magAxis = P.magAxis;
    const cupP = _v.copy(P.magBase).addScaledVector(magAxis, 0.012).add(_v2.set(0, -0.018, 0.012));
    const cup = new THREE.Vector3().copy(cupP);
    const pull = new THREE.Vector3().copy(P.magBase).addScaledVector(magAxis, 0.13).add(_v2.set(0, -0.018, 0.012));
    const prep = new THREE.Vector3().copy(P.magBase).addScaledVector(magAxis, 0.11).add(_v2.set(0, -0.018, 0.012));
    const seat = new THREE.Vector3().copy(P.magBase).addScaledVector(magAxis, 0.026).add(_v2.set(0, -0.018, 0.012));
    const slidePos = new THREE.Vector3(-0.022, 0.05, 0.072);
    const supP = new THREE.Vector3();
    const supQ = new THREE.Quaternion();
    _m.copy(P.leftGrip).decompose(supP, supQ, _s);
    // palm-up cup orientation: rotate the support orientation about gun X so the palm faces up under the grip
    const cupQ = _q2.copy(supQ).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.0, 0.0, 1.35)));
    const belt = new THREE.Vector3(-0.16, -0.4, -0.12); // view space

    const toView = (v: THREE.Vector3, o: THREE.Vector3): THREE.Vector3 => o.copy(v).applyMatrix4(this.gunMatrix);
    const A = new THREE.Vector3();
    const B = new THREE.Vector3();
    let a: HandPose = POSES.support;
    let b: HandPose = POSES.support;
    let k = 0;
    const q = new THREE.Quaternion();
    const setSeg = (p0: THREE.Vector3, p1: THREE.Vector3, u: number, view0 = false, view1 = false) => {
      (view0 ? A.copy(p0) : toView(p0, A));
      (view1 ? B.copy(p1) : toView(p1, B));
      out.pos.lerpVectors(A, B, easeInOut(clamp(u, 0, 1)));
    };
    const qOf = (qa: THREE.Quaternion, qb: THREE.Quaternion, u: number) => out.quat.slerpQuaternions(qa, qb, easeInOut(clamp(u, 0, 1)));
    // convert gun-space orientation to view space
    const gq = _q.setFromRotationMatrix(this.gunMatrix);
    const view = (qq: THREE.Quaternion) => new THREE.Quaternion().copy(gq).multiply(qq);
    const supV = view(supQ);
    const cupV = view(cupQ);

    if (t < 0.18) { // reach under the magazine
      setSeg(supP, cup, t / 0.18); qOf(supV, cupV, t / 0.18);
      a = POSES.support; b = POSES.flat; k = t / 0.18;
    } else if (t < RELOAD.magOut) { // cup it
      setSeg(cup, cup, 0); out.quat.copy(cupV);
      a = POSES.flat; b = POSES.pinch; k = (t - 0.18) / (RELOAD.magOut - 0.18);
    } else if (t < RELOAD.magDrop) { // pull it out
      setSeg(cup, pull, (t - RELOAD.magOut) / (RELOAD.magDrop - RELOAD.magOut)); out.quat.copy(cupV);
      a = POSES.pinch; b = POSES.pinch;
    } else if (t < RELOAD.grab) { // drop it, go to the belt
      const u = (t - RELOAD.magDrop) / (RELOAD.grab - RELOAD.magDrop);
      setSeg(pull, belt, u, false, true); out.quat.copy(cupV);
      a = POSES.pinch; b = POSES.flat; k = smooth(0, 0.4, u);
    } else if (t < 0.76) { // grab a fresh one
      setSeg(belt, belt, 0, true, true); out.quat.copy(cupV);
      a = POSES.flat; b = POSES.pinch; k = (t - RELOAD.grab) / (0.76 - RELOAD.grab);
    } else if (t < 0.9) { // bring it up under the grip
      setSeg(belt, prep, (t - 0.76) / 0.14, true, false); out.quat.copy(cupV);
      a = POSES.pinch; b = POSES.pinch;
    } else if (t < RELOAD.insert) { // seat it
      setSeg(prep, seat, (t - 0.9) / (RELOAD.insert - 0.9)); out.quat.copy(cupV);
      a = POSES.pinch; b = POSES.flat; k = smooth(0.7, 1, (t - 0.9) / (RELOAD.insert - 0.9));
    } else if (!w_tactical(done)) { // empty: sweep to the slide
      if (t < RELOAD.slideStart) { setSeg(seat, slidePos, (t - RELOAD.insert) / (RELOAD.slideStart - RELOAD.insert)); qOf(cupV, supV, (t - RELOAD.insert) / (RELOAD.slideStart - RELOAD.insert)); a = POSES.flat; b = POSES.pinch; k = 0.5; }
      else if (t < RELOAD.slideRelease + 0.04) { setSeg(slidePos, slidePos, 0); out.quat.copy(supV); a = POSES.pinch; b = POSES.pinch; }
      else { const u = (t - RELOAD.slideRelease - 0.04) / 0.26; setSeg(slidePos, supP, u); qOf(supV, supV, u); a = POSES.pinch; b = POSES.support; k = smooth(0, 1, u); }
    } else { // tactical: straight back to the support grip
      const u = (t - RELOAD.insert) / (done - RELOAD.insert - 0.1);
      setSeg(seat, supP, u); qOf(cupV, supV, u); a = POSES.flat; b = POSES.support; k = smooth(0, 1, u);
    }
    void q;
    out.a = a; out.b = b; out.t = clamp(k, 0, 1);

    // spare magazine rides in the hand between the belt grab and the seat
    const held = t >= RELOAD.grab && t < RELOAD.insert;
    this.spareMag.visible = held;
    if (held) {
      const seatedQ = view(new THREE.Quaternion().setFromRotationMatrix(this.pistol.gripFrame.matrix));
      _v3.copy(out.pos).addScaledVector(_v2.copy(magAxis).transformDirection(this.gunMatrix), -0.075);
      this.spareMag.position.copy(_v3);
      this.spareMag.quaternion.copy(seatedQ);
    }
    return out;
  }

  private readonly _reloadOut = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), a: POSES.support as HandPose, b: POSES.support as HandPose, t: 0 };

  /** Reach for the ledge: both hands plant on the lip, then push off as the body rises. */
  private mantleHands(p: Player, cam: THREE.PerspectiveCamera, mt: number): void {
    const m = p.mantle!;
    const L = m.ledge;
    const reach = smooth(0.04, 0.3, m.t) * (1 - smooth(0.6, 0.85, m.t));
    const lateral = _v.set(L.dir.z, 0, -L.dir.x).multiplyScalar(0.0); // keep for clarity
    void lateral;
    const side = new THREE.Vector3().crossVectors(L.dir, new THREE.Vector3(0, 1, 0)).normalize(); // player's right
    const apply = (hand: Pose, sign: number) => {
      const worldP = _v.copy(L.top).addScaledVector(L.dir, L.kind === 'climb' ? 0.08 : 0.2).addScaledVector(side, sign * 0.2);
      worldP.y += 0.015;
      const viewP = worldP.applyMatrix4(cam.matrixWorldInverse);
      // palms flat on the lip: fingers along the climb direction, back of the hand up
      const zH = _v2.copy(L.dir).negate();
      const yH = _v3.set(0, 1, 0);
      const xH = new THREE.Vector3().crossVectors(yH, zH);
      _m2.makeBasis(xH, yH, zH);
      const wq = new THREE.Quaternion().setFromRotationMatrix(_m2);
      const camQ = _q.copy(cam.quaternion).invert();
      wq.premultiply(camQ);
      const target = this.tmpPose;
      target.p.copy(viewP);
      target.q.copy(wq);
      // The arm only reaches ~0.56 m from the shoulder: clamp to that, and let the hand drop away
      // smoothly once the ledge is out of reach (e.g. when it is down at your feet as you mount).
      const shoulder = sign > 0 ? SHOULDER_R : SHOULDER_L;
      const toLedge = _v.subVectors(target.p, shoulder);
      const dist = toLedge.length();
      if (dist > 0.54) target.p.copy(shoulder).addScaledVector(toLedge, 0.54 / dist);
      const k = reach * mt * (1 - smooth(0.62, 0.95, dist));
      hand.p.lerp(target.p, k);
      hand.q.slerp(target.q, k);
    };
    apply(this.handR, 1);
    apply(this.handL, -1);
  }
}

function w_tactical(done: number): boolean {
  return done === RELOAD.doneTactical;
}

export { easeOutCubic };
