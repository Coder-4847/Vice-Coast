import * as THREE from 'three';
import { ArmRig, HandRig, POSES } from '../player/HandRig';
import { buildWheel } from './CarModel';
import type { Outfit, VehicleCustom } from '../economy/types';
import type { Vehicle } from './Vehicle';

/** Procedural sport bike with a rider whose arms use the same IK rig as the first-person hands. */
export class BikeModel {
  readonly group = new THREE.Group();
  readonly materials: THREE.Material[] = [];
  readonly bodyMat: THREE.MeshPhysicalMaterial;
  private jacketMat!: THREE.MeshStandardMaterial;
  private cuffMat!: THREE.MeshStandardMaterial;
  private readonly rimMats: THREE.MeshStandardMaterial[] = [];
  private readonly front = new THREE.Group();
  private readonly frontWheel = new THREE.Group();
  private readonly rearWheel = new THREE.Group();
  private readonly rearSpin = new THREE.Group();
  private readonly frontSpin = new THREE.Group();
  private readonly fork = new THREE.Group();
  private readonly rider = new THREE.Group();
  private readonly armR: ArmRig;
  private readonly armL: ArmRig;
  private readonly handR = new HandRig();
  private readonly handL: HandRig;
  private readonly headMat: THREE.MeshStandardMaterial;
  private readonly tailMat: THREE.MeshStandardMaterial;
  private readonly coneMat: THREE.MeshBasicMaterial;
  private readonly bars = new THREE.Vector3();
  private readonly shoulderR = new THREE.Vector3();
  private readonly shoulderL = new THREE.Vector3();
  private readonly _a = new THREE.Vector3();
  private readonly _b = new THREE.Vector3();
  private readonly _m = new THREE.Matrix4();
  private readonly shell = new THREE.Group();

  constructor(readonly vehicle: Vehicle) {
    const spec = vehicle.spec;
    const st = spec.body;
    const wb = spec.wheelbase;
    this.group.add(this.shell);
    this.shell.position.y = -spec.comHeight;

    this.bodyMat = new THREE.MeshPhysicalMaterial({ color: st.color, metalness: st.metallic, roughness: st.roughness, clearcoat: 1, clearcoatRoughness: 0.08 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x7c8087, roughness: 0.35, metalness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.7, metalness: 0.4 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.9 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x20303c, roughness: 0.05, transparent: true, opacity: 0.6, clearcoat: 1 });
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xdfe7ee, emissive: new THREE.Color(1, 0.95, 0.8), emissiveIntensity: 0.15, roughness: 0.1 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0a0c, emissive: new THREE.Color(1, 0.05, 0.04), emissiveIntensity: 0.4, roughness: 0.3 });
    this.materials.push(this.bodyMat, metal, dark, seatMat, glass, this.headMat, this.tailMat);
    for (const m of this.materials) (m as THREE.MeshStandardMaterial).fog = false;
    this.bodyMat.fog = true;

    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      parent.add(m);
      return m;
    };
    const sph = (r: number) => new THREE.SphereGeometry(r, 18, 14);
    const cyl = (r0: number, r1: number, l: number) => new THREE.CylinderGeometry(r0, r1, l, 14);
    // z: forward is −Z; wheel axes at ±wb/2
    const zF = -wb / 2;
    const zR = wb / 2;

    // --- frame, engine, tank, seat, tail ------------------------------------------------------------------------
    add(this.shell, new THREE.BoxGeometry(0.28, 0.32, 0.45), dark, 0, 0.5, 0.0);                    // engine block
    add(this.shell, new THREE.CylinderGeometry(0.07, 0.07, 0.3, 12).rotateZ(Math.PI / 2), metal, 0, 0.46, 0.2); // gearbox
    const tank = add(this.shell, sph(0.2), this.bodyMat, 0, 0.86, -0.22, 0.95, 0.82, 1.45);
    tank.castShadow = true;
    add(this.shell, new THREE.BoxGeometry(0.2, 0.09, 0.62), seatMat, 0, 0.82, 0.38);                  // seat
    const tail = add(this.shell, new THREE.BoxGeometry(0.22, 0.12, 0.55), this.bodyMat, 0, 0.86, 0.8, 1, 1, 1);
    tail.rotation.x = -0.18;
    add(this.shell, new THREE.BoxGeometry(0.18, 0.06, 0.06), this.tailMat, 0, 0.88, 1.08);          // tail light
    // fairing: a pair of swept side panels and a nose
    for (const sx of [-1, 1]) {
      const panel = add(this.shell, new THREE.BoxGeometry(0.03, 0.4, 0.8), this.bodyMat, sx * 0.14, 0.62, -0.28);
      panel.rotation.z = sx * -0.12;
      panel.rotation.x = 0.06;
    }
    const nose = add(this.shell, sph(0.2), this.bodyMat, 0, 0.78, zF + 0.22, 0.95, 0.9, 1.4);
    nose.castShadow = true;
    add(this.shell, new THREE.BoxGeometry(0.2, 0.2, 0.02), glass, 0, 1.02, zF + 0.34).rotation.x = -0.9; // screen
    add(this.shell, new THREE.BoxGeometry(0.14, 0.1, 0.1), this.headMat, 0, 0.8, zF + 0.04);          // headlight
    // exhaust
    const exhaust = add(this.shell, new THREE.CylinderGeometry(0.045, 0.06, 0.9, 12).rotateX(Math.PI / 2), metal, 0.2, 0.4, 0.55);
    exhaust.rotation.y = 0.04;
    add(this.shell, cyl(0.06, 0.06, 0.12).rotateX(Math.PI / 2), dark, 0.2, 0.42, 1.0);
    // swingarm
    add(this.shell, new THREE.BoxGeometry(0.1, 0.07, wb * 0.55), metal, 0, 0.32, zR - wb * 0.27);
    // radiator / belly
    add(this.shell, new THREE.BoxGeometry(0.24, 0.26, 0.16), dark, 0, 0.5, -0.36);

    // --- front end: fork + bars pivot together with the steering ---------------------------------------------------
    this.front.position.set(0, 0.95, zF + 0.25);
    this.shell.add(this.front);
    this.fork.rotation.x = 0.32; // rake
    this.front.add(this.fork);
    for (const sx of [-1, 1]) add(this.fork, cyl(0.026, 0.022, 0.78), metal, sx * 0.09, -0.4, -0.0);
    add(this.front, new THREE.CylinderGeometry(0.018, 0.018, 0.74, 10).rotateZ(Math.PI / 2), metal, 0, 0.08, 0.04); // handlebars
    for (const sx of [-1, 1]) add(this.front, cyl(0.022, 0.022, 0.12).rotateZ(Math.PI / 2), dark, sx * 0.36, 0.08, 0.04); // grips
    this.bars.set(0.34, 0.08, 0.04);

    // --- wheels ------------------------------------------------------------------------------------------------------------
    const fw = buildWheel(spec.wheelRadius, spec.wheelWidth, '#bfc3c9', 1);
    const rw = buildWheel(spec.wheelRadius, spec.wheelWidth + 0.05, '#bfc3c9', 1);
    this.rimMats.push(fw.userData.rimMat as THREE.MeshStandardMaterial, rw.userData.rimMat as THREE.MeshStandardMaterial);
    this.frontSpin.add(fw);
    this.frontWheel.add(this.frontSpin);
    this.rearSpin.add(rw);
    this.rearWheel.add(this.rearSpin);
    this.group.add(this.frontWheel, this.rearWheel);

    // --- rider ------------------------------------------------------------------------------------------------------------------
    const jacket = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.8 });
    const accent = new THREE.MeshStandardMaterial({ color: st.color, roughness: 0.5 });
    const skin = this.handR.material;
    const cuff = new THREE.MeshStandardMaterial({ color: 0x25272b, roughness: 0.95 });
    const helmet = new THREE.MeshPhysicalMaterial({ color: 0xe9e9ea, roughness: 0.25, clearcoat: 1 });
    const visor = new THREE.MeshPhysicalMaterial({ color: 0x101820, roughness: 0.05, clearcoat: 1 });
    this.jacketMat = jacket;
    this.cuffMat = cuff;
    this.materials.push(jacket, accent, cuff, helmet, visor);
    this.armR = new ArmRig(jacket, skin, cuff);
    this.armL = new ArmRig(jacket, skin, cuff);
    this.handL = new HandRig(skin);
    const torso = add(this.rider, new THREE.CapsuleGeometry(0.17, 0.36, 6, 14), jacket, 0, 0.3, 0.0, 1.05, 1, 0.8);
    torso.rotation.x = 0.75;
    add(this.rider, new THREE.BoxGeometry(0.2, 0.06, 0.2), accent, 0, 0.36, 0.1).rotation.x = 0.75; // back panel
    const head = add(this.rider, sph(0.135), helmet, 0, 0.66, -0.2);
    add(this.rider, new THREE.SphereGeometry(0.138, 16, 10, 0, Math.PI, 0.9, 0.75), visor, 0, 0.66, -0.2).rotation.y = Math.PI;
    head.castShadow = true;
    for (const sx of [-1, 1]) {
      const thigh = add(this.rider, new THREE.CapsuleGeometry(0.09, 0.3, 4, 10), jacket, sx * 0.17, -0.02, -0.12);
      thigh.rotation.x = 1.15;
      const shin = add(this.rider, new THREE.CapsuleGeometry(0.075, 0.34, 4, 10), jacket, sx * 0.2, -0.14, -0.38);
      shin.rotation.x = -0.35;
    }
    this.rider.position.set(0, 0.86, 0.34);
    this.shell.add(this.rider);
    this.shell.add(this.armR.root, this.armL.root, this.handR.root, this.handL.root);
    this.handR.root.matrixAutoUpdate = false;
    this.handL.root.matrixAutoUpdate = false;
    this.shoulderR.set(0.2, 1.25, 0.12);
    this.shoulderL.set(-0.2, 1.25, 0.12);
    this.rider.visible = false;
    this.armR.root.visible = this.armL.root.visible = this.handR.root.visible = this.handL.root.visible = false;

    // headlight beam
    this.coneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.92, 0.7), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.0, 13, 18, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -6.5), this.coneMat);
    cone.position.set(0, 0.8 - spec.comHeight, zF);
    cone.renderOrder = 6;
    this.group.add(cone);
    this.materials.push(this.coneMat);

    this.group.traverse((o) => {
      o.frustumCulled = false;
      if (o instanceof THREE.Mesh && o.material !== this.coneMat) { o.castShadow = true; o.receiveShadow = true; }
    });
    cone.castShadow = false;
    cone.receiveShadow = false;
  }

  applyOutfit(o: Outfit): void {
    this.jacketMat.color.set(o.top);
    this.cuffMat.color.set(o.gloves === 'none' ? o.cuff : o.gloves === 'leather' ? '#2a1c14' : o.gloves === 'tactical' ? '#1d2118' : '#ececec');
    (this.handR.material as THREE.MeshPhysicalMaterial).color.set(o.skin);
  }

  applyCustom(c: VehicleCustom): void {
    const m = this.bodyMat;
    m.color.set(c.color);
    switch (c.finish) {
      case 'matte': m.metalness = 0.1; m.roughness = 0.82; m.clearcoat = 0; m.iridescence = 0; break;
      case 'metallic': m.metalness = 0.85; m.roughness = 0.22; m.clearcoat = 1; m.iridescence = 0; break;
      case 'pearl': m.metalness = 0.5; m.roughness = 0.2; m.clearcoat = 1; m.iridescence = 1; m.iridescenceIOR = 1.6; m.iridescenceThicknessRange = [200, 520]; break;
      case 'chrome': m.color.set('#dfe3e8'); m.metalness = 1; m.roughness = 0.04; m.clearcoat = 0; m.iridescence = 0; break;
      default: m.metalness = this.vehicle.spec.body.metallic; m.roughness = this.vehicle.spec.body.roughness; m.clearcoat = 1; m.iridescence = 0;
    }
    m.needsUpdate = true;
    for (const r of this.rimMats) r.color.set(c.rim);
  }

  setLights(headlights: boolean, braking: boolean, reversing: boolean, night: number): void {
    this.headMat.emissiveIntensity = headlights ? 3.2 : 0.15;
    this.tailMat.emissiveIntensity = braking ? 5 : headlights ? 1.6 : 0.35;
    void reversing;
    this.coneMat.opacity = headlights ? 0.05 + 0.1 * night : 0;
  }

  update(): void {
    const v = this.vehicle;
    const spec = v.spec;
    const fwv = v.wheels[0]!;
    const rwv = v.wheels[1]!;
    this.frontWheel.position.set(0, fwv.mountY - (spec.suspension.rest - fwv.visualComp), fwv.z);
    this.rearWheel.position.set(0, rwv.mountY - (spec.suspension.rest - rwv.visualComp), rwv.z);
    this.frontSpin.rotation.x = fwv.spin;
    this.rearSpin.rotation.x = rwv.spin;
    this.frontWheel.rotation.y = -v.steerAngle;
    this.front.rotation.y = -v.steerAngle;
    this.rider.visible = v.occupied;
    this.armR.root.visible = this.armL.root.visible = this.handR.root.visible = this.handL.root.visible = v.occupied;
    if (!v.occupied) return;
    // arms: shoulders → grips on the handlebars (which turn with the steering)
    this.front.updateMatrix();
    const frontM = this.front.matrix;
    for (const side of [1, -1]) {
      this._a.set(side * this.bars.x, this.bars.y, this.bars.z).applyMatrix4(frontM);
      const arm = side > 0 ? this.armR : this.armL;
      const hand = side > 0 ? this.handR : this.handL;
      const shoulder = side > 0 ? this.shoulderR : this.shoulderL;
      this._b.set(side * 0.7, -0.4, 0.2);
      arm.solve(shoulder, this._a, this._b);
      hand.apply(POSES.gripIndexOff);
      this._m.makeRotationFromEuler(new THREE.Euler(0.2, v.steerAngle * -1, side * 1.2));
      this._m.setPosition(this._a);
      if (side < 0) this._m.scale(new THREE.Vector3(-1, 1, 1));
      hand.root.matrix.copy(this._m);
    }
  }
}
