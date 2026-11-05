import * as THREE from 'three';
import type { WeaponId } from './Weapons';

/** The shared surface the viewmodel needs from any gun model (the pistol implements it too). */
export interface GunModel {
  readonly group: THREE.Group;
  readonly magazine: THREE.Group;
  readonly rightGrip: THREE.Matrix4;
  readonly leftGrip: THREE.Matrix4;
  readonly muzzle: THREE.Vector3;
  readonly eject: THREE.Vector3;
  readonly sightPoint: THREE.Vector3;
  readonly magAxis: THREE.Vector3;
  readonly magBase: THREE.Vector3;
  readonly magLength: number;
  readonly materials: THREE.Material[];
  setSlide(v: number): void;
  setTrigger(v: number): void;
}

const mat = (c: number, r: number, m: number): THREE.MeshStandardMaterial => {
  const x = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  x.fog = false;
  return x;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material): THREE.Mesh => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.frustumCulled = false;
  return o;
};
const cyl = (r: number, len: number, x: number, y: number, z: number, m: THREE.Material): THREE.Mesh => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), m);
  o.rotation.x = Math.PI / 2;
  o.position.set(x, y, z);
  o.frustumCulled = false;
  return o;
};

/**
 * Procedural SMG / shotgun / rifle. Local frame like the pistol: +X right, +Y up, −Z toward the muzzle. Each gun has a
 * moving part (bolt or pump) driven by `setSlide`, a trigger, a detachable magazine and hand anchors.
 */
export class LongGun implements GunModel {
  readonly group = new THREE.Group();
  readonly bolt = new THREE.Group();
  readonly magazine = new THREE.Group();
  readonly rightGrip = new THREE.Matrix4();
  readonly leftGrip = new THREE.Matrix4();
  readonly muzzle = new THREE.Vector3();
  readonly eject = new THREE.Vector3(0.028, 0.05, -0.02);
  readonly sightPoint = new THREE.Vector3(0, 0.1, -0.05);
  readonly magAxis = new THREE.Vector3(0, -1, 0);
  readonly magBase = new THREE.Vector3();
  magLength = 0.14;
  readonly materials: THREE.Material[] = [];
  private readonly trigger = new THREE.Mesh();
  private boltTravel = 0.04;

  constructor(readonly id: Exclude<WeaponId, 'vc9'>) {
    const metal = mat(0x23262b, 0.35, 0.9);
    const dark = mat(0x111214, 0.6, 0.5);
    const poly = mat(0x17191c, 0.8, 0.05);
    const wood = mat(0x6b4a2e, 0.65, 0.05);
    const glass = mat(0x66aaff, 0.1, 0.4);
    this.materials.push(metal, dark, poly, wood, glass);
    const g = this.group;

    const trig = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.026, 0.012), dark);
    trig.position.set(0, -0.012, 0);
    trig.frustumCulled = false;
    this.trigger.add(trig);
    this.trigger.position.set(0, -0.012, -0.01);
    g.add(this.trigger);

    let magZ = 0, magTop = -0.02, rake = 0;
    let rightPos: THREE.Vector3, leftPos: THREE.Vector3;
    let gripRake = 0.25;
    if (this.id === 'smg') {
      g.add(box(0.044, 0.062, 0.3, 0, 0.012, -0.03, poly));
      g.add(box(0.036, 0.036, 0.1, 0, 0.056, -0.04, metal));
      g.add(cyl(0.011, 0.14, 0, 0.018, -0.26, metal), cyl(0.016, 0.05, 0, 0.018, -0.33, dark));
      g.add(box(0.02, 0.04, 0.12, 0, 0.0, 0.2, dark), box(0.02, 0.006, 0.1, 0, 0.026, 0.2, dark));
      g.add(box(0.014, 0.012, 0.06, 0, 0.1, -0.1, dark));
      this.bolt.add(box(0.03, 0.03, 0.08, 0.025, 0.03, -0.05, metal));
      this.muzzle.set(0, 0.018, -0.36);
      this.sightPoint.set(0, 0.092, -0.1);
      magZ = -0.02; this.magLength = 0.16;
      rightPos = new THREE.Vector3(0.027, -0.075, 0.06); leftPos = new THREE.Vector3(-0.025, -0.04, -0.15);
      g.add(box(0.032, 0.09, 0.04, 0, -0.05, 0.06, poly)); // grip
    } else if (this.id === 'shotgun') {
      g.add(box(0.046, 0.075, 0.22, 0, 0.012, -0.0, metal));
      g.add(cyl(0.0145, 0.62, 0, 0.034, -0.4, metal), cyl(0.012, 0.5, 0, 0.002, -0.34, dark));
      g.add(box(0.044, 0.1, 0.2, 0, -0.012, 0.2, wood));
      g.add(box(0.03, 0.022, 0.2, 0, 0.0, 0.34, wood));
      g.add(cyl(0.005, 0.012, 0, 0.056, -0.68, dark));
      g.add(box(0.016, 0.012, 0.02, 0, 0.058, -0.64, dark));
      // pump forend slides
      this.bolt.add(box(0.05, 0.048, 0.17, 0, -0.012, -0.26, wood));
      this.boltTravel = 0.1;
      this.muzzle.set(0, 0.034, -0.72);
      this.sightPoint.set(0, 0.064, -0.4);
      magZ = 0.0; this.magLength = 0.0001;
      rightPos = new THREE.Vector3(0.027, -0.075, 0.075); leftPos = new THREE.Vector3(-0.03, -0.012, -0.26);
      g.add(box(0.034, 0.08, 0.04, 0, -0.05, 0.075, wood));
      gripRake = 0.18;
    } else {
      g.add(box(0.046, 0.075, 0.26, 0, 0.01, 0.0, metal));
      g.add(box(0.05, 0.052, 0.24, 0, 0.012, -0.24, poly));
      g.add(cyl(0.0095, 0.2, 0, 0.022, -0.5, metal), cyl(0.014, 0.05, 0, 0.022, -0.62, dark));
      g.add(box(0.04, 0.08, 0.2, 0, -0.004, 0.23, poly));
      g.add(box(0.03, 0.026, 0.16, 0, 0.056, 0.0, dark)); // rail / carry handle
      const optic = box(0.036, 0.04, 0.12, 0, 0.1, -0.05, dark);
      g.add(optic, box(0.026, 0.026, 0.004, 0, 0.1, -0.113, glass));
      this.bolt.add(box(0.012, 0.022, 0.05, 0.025, 0.026, -0.02, metal));
      this.muzzle.set(0, 0.022, -0.65);
      this.sightPoint.set(0, 0.1, -0.05);
      magZ = -0.06; this.magLength = 0.15; rake = 0.2;
      rightPos = new THREE.Vector3(0.027, -0.078, 0.07); leftPos = new THREE.Vector3(-0.028, -0.04, -0.27);
      g.add(box(0.032, 0.09, 0.04, 0, -0.05, 0.075, poly));
    }
    g.add(this.bolt);

    // magazine hangs from a raked frame so the viewmodel's reload choreography (written for the pistol) works unchanged
    const magFrame = new THREE.Group();
    magFrame.position.set(0, magTop, magZ);
    magFrame.rotation.x = rake;
    if (this.id !== 'shotgun') {
      const body = box(0.026, this.magLength, 0.04, 0, -this.magLength / 2, 0, dark);
      const base = box(0.03, 0.01, 0.046, 0, -this.magLength - 0.002, 0, poly);
      this.magazine.add(body, base);
    } else {
      // pump gun: a few shells visible at the loading port
      this.magazine.add(box(0.014, 0.004, 0.03, 0, -0.01, 0, dark));
    }
    this.magazine.position.set(0, -0.006, 0);
    magFrame.add(this.magazine);
    g.add(magFrame);
    magFrame.updateMatrix();
    this.magAxis.set(0, -Math.cos(rake), -Math.sin(rake));
    this.magBase.set(0, -0.006 - this.magLength, 0).applyMatrix4(magFrame.matrix);

    // anchors: same basis as the pistol's hands, un-raked grips
    const gf = new THREE.Matrix4().makeRotationX(-gripRake * 0.2);
    const right = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)).setPosition(rightPos);
    this.rightGrip.multiplyMatrices(gf, right);
    const left = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1)).setPosition(leftPos);
    this.leftGrip.copy(left);
    g.traverse((o) => { if (o instanceof THREE.Mesh) o.frustumCulled = false; });
  }

  setSlide(v: number): void {
    this.bolt.position.z = v * this.boltTravel;
  }

  setTrigger(v: number): void {
    this.trigger.rotation.x = v * 0.22;
  }
}
