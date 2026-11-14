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
      rightPos = new THREE.Vector3(0.027, -0.075, 0.06); leftPos = new THREE.Vector3(-0.058, -0.026, -0.15);
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
      rightPos = new THREE.Vector3(0.027, -0.075, 0.075); leftPos = new THREE.Vector3(-0.062, -0.04, -0.27);
      g.add(box(0.034, 0.08, 0.04, 0, -0.05, 0.075, wood));
      gripRake = 0.18;
    } else if (this.id === 'knife') {
      // switchblade: a short grip and a long, thin blade pointing down-range
      const steel = mat(0xb9bec4, 0.32, 0.55);
      this.materials.push(steel);
      g.add(box(0.026, 0.034, 0.13, 0, -0.02, 0.06, poly));
      g.add(box(0.03, 0.01, 0.02, 0, -0.02, -0.01, metal));
      const blade = box(0.006, 0.03, 0.17, 0, -0.016, -0.1, steel);
      g.add(blade, box(0.006, 0.016, 0.03, 0, -0.008, -0.195, steel));
      this.muzzle.set(0, -0.016, -0.21);
      this.sightPoint.set(0, 0.06, -0.05);
      magZ = 0.0; this.magLength = 0.0001;
      rightPos = new THREE.Vector3(0.026, -0.07, 0.07); leftPos = new THREE.Vector3(-0.03, -0.075, 0.1);
      gripRake = 0.1;
    } else if (this.id === 'hatchet') {
      // hatchet: a hickory handle and a steel head with a bright edge
      const steel = mat(0x3e4247, 0.55, 0.25), edge = mat(0x9aa0a6, 0.35, 0.4);
      this.materials.push(steel, edge);
      g.add(box(0.028, 0.034, 0.42, 0, -0.02, -0.04, wood));
      g.add(box(0.022, 0.05, 0.05, 0, 0.0, -0.24, steel));
      g.add(box(0.016, 0.06, 0.06, 0, 0.05, -0.24, steel), box(0.01, 0.05, 0.075, 0, 0.09, -0.24, steel));
      g.add(box(0.012, 0.014, 0.08, 0, 0.12, -0.24, edge));
      this.muzzle.set(0, 0.11, -0.24);
      this.sightPoint.set(0, 0.08, -0.05);
      magZ = 0.0; this.magLength = 0.0001;
      rightPos = new THREE.Vector3(0.026, -0.07, 0.12); leftPos = new THREE.Vector3(-0.03, -0.075, 0.03);
      gripRake = 0.1;
    } else if (this.id === 'rpg') {
      // RPG: a long launch tube on the shoulder, grip and trigger under it, a finned warhead poking out the front
      const olive = mat(0x4f5a3a, 0.75, 0.15), tube = mat(0x2e3328, 0.6, 0.3);
      this.materials.push(olive, tube);
      g.add(cyl(0.032, 0.8, 0, 0.035, -0.2, tube));
      g.add(cyl(0.037, 0.18, 0, 0.035, -0.1, olive));
      g.add(cyl(0.04, 0.06, 0, 0.035, 0.18, dark));
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 14), olive);
      head.rotation.x = -Math.PI / 2; head.position.set(0, 0.035, -0.68); head.frustumCulled = false;
      g.add(head, cyl(0.02, 0.1, 0, 0.035, -0.6, olive), box(0.014, 0.04, 0.04, 0.04, 0.08, -0.16, dark));
      this.muzzle.set(0, 0.035, -0.78);
      this.sightPoint.set(0.04, 0.11, -0.16);
      magZ = 0.0; this.magLength = 0.0001;
      rightPos = new THREE.Vector3(0.027, -0.04, 0.04); leftPos = new THREE.Vector3(-0.06, 0.01, -0.3);
      g.add(box(0.032, 0.09, 0.04, 0, -0.01, 0.04, poly));
    } else if (this.id === 'laser') {
      // laser rifle: a white shell, a dark core and glowing emitter strips
      const shell = mat(0xe8ecef, 0.35, 0.2), glow = new THREE.MeshStandardMaterial({ color: 0xff2a5a, emissive: 0xff2a5a, emissiveIntensity: 2.2, roughness: 0.4 });
      glow.fog = false;
      this.materials.push(shell, glow);
      g.add(box(0.05, 0.08, 0.34, 0, 0.012, -0.06, shell));
      g.add(box(0.04, 0.05, 0.22, 0, 0.012, -0.32, dark));
      g.add(box(0.052, 0.012, 0.3, 0, 0.034, -0.08, glow), box(0.006, 0.02, 0.2, 0.026, 0.012, -0.3, glow), box(0.006, 0.02, 0.2, -0.026, 0.012, -0.3, glow));
      g.add(cyl(0.016, 0.1, 0, 0.012, -0.48, shell), cyl(0.01, 0.02, 0, 0.012, -0.535, glow));
      g.add(box(0.04, 0.07, 0.18, 0, 0.0, 0.2, shell));
      g.add(box(0.034, 0.03, 0.1, 0, 0.074, -0.05, dark));
      this.muzzle.set(0, 0.012, -0.55);
      this.sightPoint.set(0, 0.092, -0.05);
      magZ = -0.02; this.magLength = 0.1;
      rightPos = new THREE.Vector3(0.027, -0.075, 0.07); leftPos = new THREE.Vector3(-0.06, -0.022, -0.26);
      g.add(box(0.032, 0.09, 0.04, 0, -0.05, 0.075, shell));
    } else if (this.id === 'revolver') {
      // a heavy six-shooter: round cylinder, ventilated rib, wooden grip, held two-handed
      const blued = mat(0x1c1f24, 0.28, 0.95), grip = mat(0x5a3a22, 0.6, 0.05);
      this.materials.push(blued, grip);
      g.add(box(0.034, 0.05, 0.1, 0, 0.02, 0.0, blued));
      g.add(cyl(0.025, 0.05, 0, 0.022, -0.035, blued));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.add(cyl(0.006, 0.052, Math.cos(a) * 0.016, 0.022 + Math.sin(a) * 0.016, -0.035, dark)); }
      g.add(cyl(0.011, 0.18, 0, 0.034, -0.15, blued), box(0.016, 0.012, 0.17, 0, 0.05, -0.15, blued), box(0.004, 0.012, 0.012, 0, 0.06, -0.23, dark));
      g.add(box(0.012, 0.01, 0.012, 0, 0.058, 0.035, dark));
      const gripM = box(0.03, 0.1, 0.045, 0, -0.04, 0.055, grip); gripM.rotation.x = 0.35; g.add(gripM);
      this.muzzle.set(0, 0.034, -0.245);
      this.sightPoint.set(0, 0.066, -0.05);
      magZ = 0.0; this.magLength = 0.0001;
      rightPos = new THREE.Vector3(0.022, -0.06, 0.06); leftPos = new THREE.Vector3(-0.05, -0.065, 0.075);
      gripRake = 0.35;
    } else if (this.id === 'micro') {
      // a stubby machine pistol: boxy receiver, short barrel, pistol grip with the magazine in it, folding stock arm
      g.add(box(0.04, 0.06, 0.2, 0, 0.012, -0.02, poly), box(0.034, 0.03, 0.08, 0, 0.05, -0.03, metal));
      g.add(cyl(0.009, 0.06, 0, 0.02, -0.15, metal), cyl(0.014, 0.03, 0, 0.02, -0.18, dark));
      g.add(box(0.012, 0.012, 0.13, 0, 0.0, 0.12, dark));
      this.bolt.add(box(0.026, 0.024, 0.06, 0.022, 0.032, -0.04, metal));
      this.muzzle.set(0, 0.02, -0.2);
      this.sightPoint.set(0, 0.078, -0.06);
      magZ = 0.04; this.magLength = 0.17;
      rightPos = new THREE.Vector3(0.025, -0.07, 0.045); leftPos = new THREE.Vector3(-0.052, -0.03, -0.08);
      g.add(box(0.03, 0.09, 0.036, 0, -0.045, 0.045, poly));
    } else if (this.id === 'combat') {
      // semi-auto combat shotgun: long receiver, tube magazine under the barrel, ghost-ring sights, polymer furniture
      g.add(box(0.048, 0.072, 0.26, 0, 0.012, -0.02, dark));
      g.add(cyl(0.014, 0.56, 0, 0.036, -0.4, metal), cyl(0.014, 0.44, 0, 0.004, -0.34, dark));
      g.add(box(0.05, 0.05, 0.2, 0, -0.004, -0.27, poly));
      g.add(box(0.04, 0.09, 0.24, 0, -0.01, 0.24, poly), box(0.042, 0.11, 0.02, 0, -0.01, 0.37, dark));
      g.add(box(0.03, 0.02, 0.012, 0, 0.068, 0.02, dark), box(0.004, 0.02, 0.012, 0, 0.068, -0.64, dark));
      this.bolt.add(box(0.012, 0.022, 0.05, 0.026, 0.028, -0.02, metal));
      this.muzzle.set(0, 0.036, -0.69);
      this.sightPoint.set(0, 0.076, -0.05);
      magZ = 0.0; this.magLength = 0.0001;
      rightPos = new THREE.Vector3(0.027, -0.075, 0.07); leftPos = new THREE.Vector3(-0.062, -0.034, -0.27);
      g.add(box(0.032, 0.09, 0.04, 0, -0.05, 0.075, poly));
    } else if (this.id === 'carbine') {
      // a short carbine: flat-top upper, red-dot, M-LOK handguard, collapsing stock
      g.add(box(0.044, 0.07, 0.24, 0, 0.01, 0.0, metal), box(0.05, 0.05, 0.2, 0, 0.012, -0.21, poly));
      g.add(cyl(0.009, 0.14, 0, 0.022, -0.38, metal), cyl(0.013, 0.05, 0, 0.022, -0.47, dark));
      g.add(box(0.03, 0.06, 0.16, 0, -0.004, 0.2, poly), box(0.014, 0.014, 0.12, 0, 0.026, 0.13, dark));
      g.add(box(0.03, 0.012, 0.26, 0, 0.052, -0.1, dark));
      g.add(box(0.03, 0.036, 0.05, 0, 0.078, -0.04, dark), box(0.022, 0.022, 0.004, 0, 0.08, -0.066, glass));
      this.bolt.add(box(0.012, 0.022, 0.05, 0.025, 0.026, -0.02, metal));
      this.muzzle.set(0, 0.022, -0.5);
      this.sightPoint.set(0, 0.08, -0.04);
      magZ = -0.06; this.magLength = 0.15; rake = 0.2;
      rightPos = new THREE.Vector3(0.027, -0.078, 0.07); leftPos = new THREE.Vector3(-0.06, -0.022, -0.22);
      g.add(box(0.032, 0.09, 0.04, 0, -0.05, 0.075, poly));
    } else if (this.id === 'lmg') {
      // a belt-fed machine gun: big receiver, carry handle, a box of ammunition, bipod legs folded under the barrel
      const olive = mat(0x3c4232, 0.7, 0.15);
      this.materials.push(olive);
      g.add(box(0.06, 0.09, 0.34, 0, 0.012, -0.02, metal));
      g.add(cyl(0.013, 0.42, 0, 0.026, -0.45, metal), cyl(0.02, 0.06, 0, 0.026, -0.68, dark));
      g.add(box(0.05, 0.05, 0.26, 0, 0.014, -0.29, poly));
      g.add(box(0.012, 0.04, 0.16, 0, 0.09, -0.08, dark));
      g.add(box(0.046, 0.1, 0.24, 0, -0.012, 0.28, poly));
      for (const sx of [-1, 1]) g.add(box(0.008, 0.008, 0.22, sx * 0.016, -0.004, -0.5, dark));
      g.add(box(0.07, 0.1, 0.1, -0.03, -0.07, -0.02, olive)); // ammo box
      g.add(box(0.03, 0.008, 0.06, 0.02, 0.05, -0.04, dark)); // belt
      this.bolt.add(box(0.012, 0.026, 0.06, 0.032, 0.03, -0.02, metal));
      this.muzzle.set(0, 0.026, -0.72);
      this.sightPoint.set(0, 0.094, -0.06);
      magZ = 0.0; this.magLength = 0.0001;
      rightPos = new THREE.Vector3(0.03, -0.08, 0.09); leftPos = new THREE.Vector3(-0.07, -0.025, -0.3);
      g.add(box(0.034, 0.095, 0.042, 0, -0.055, 0.09, poly));
    } else if (this.id === 'sniper') {
      // a bolt-action precision rifle: long free-floated barrel, big scope, thumbhole stock, a bolt handle on the right
      const tan = mat(0x8a7a5a, 0.75, 0.05);
      this.materials.push(tan);
      g.add(box(0.046, 0.065, 0.3, 0, 0.012, -0.02, metal));
      g.add(cyl(0.012, 0.62, 0, 0.022, -0.48, metal), cyl(0.02, 0.07, 0, 0.022, -0.82, dark));
      g.add(box(0.05, 0.06, 0.36, 0, -0.006, -0.22, tan), box(0.044, 0.1, 0.28, 0, -0.012, 0.26, tan));
      g.add(cyl(0.026, 0.3, 0, 0.09, -0.06, dark), cyl(0.032, 0.06, 0, 0.09, -0.22, dark), cyl(0.03, 0.05, 0, 0.09, 0.11, dark));
      g.add(box(0.012, 0.03, 0.02, 0, 0.06, -0.14, dark), box(0.012, 0.03, 0.02, 0, 0.06, 0.02, dark));
      g.add(cyl(0.028, 0.004, 0, 0.09, -0.252, glass));
      this.bolt.add(box(0.05, 0.012, 0.012, 0.04, 0.03, 0.04, metal), box(0.018, 0.018, 0.018, 0.068, 0.03, 0.04, metal));
      this.boltTravel = 0.06;
      this.muzzle.set(0, 0.022, -0.86);
      this.sightPoint.set(0, 0.09, 0.13);
      magZ = -0.02; this.magLength = 0.06;
      rightPos = new THREE.Vector3(0.027, -0.08, 0.08); leftPos = new THREE.Vector3(-0.06, -0.035, -0.28);
      g.add(box(0.032, 0.09, 0.04, 0, -0.05, 0.08, tan));
    } else if (this.id === 'bat') {
      // an ash baseball bat: taper from the knob to a fat barrel, held with both hands, end pointing up and out
      const ash = mat(0xc8a070, 0.55, 0.0), tape = mat(0x15161a, 0.9, 0.0);
      this.materials.push(ash, tape);
      const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.013, 0.84, 14), ash);
      bat.rotation.x = Math.PI / 2; bat.position.set(0, 0.0, -0.32); bat.frustumCulled = false;
      g.add(bat, cyl(0.016, 0.16, 0, 0, 0.02, tape), cyl(0.022, 0.012, 0, 0, 0.1, ash));
      this.muzzle.set(0, 0, -0.74);
      this.sightPoint.set(0, 0.08, -0.05);
      magZ = 0.0; this.magLength = 0.0001;
      rightPos = new THREE.Vector3(0.0, -0.065, 0.06); leftPos = new THREE.Vector3(-0.005, -0.065, -0.02);
      gripRake = 0.05;
    } else if (this.id === 'grenade' || this.id === 'molotov' || this.id === 'sticky') {
      // something to throw, held in the right hand
      if (this.id === 'grenade') {
        const od = mat(0x4a5238, 0.6, 0.2);
        this.materials.push(od);
        const egg = new THREE.Mesh(new THREE.SphereGeometry(0.034, 14, 10).scale(1, 1.25, 1), od);
        egg.frustumCulled = false;
        g.add(egg, box(0.014, 0.022, 0.018, 0, 0.048, 0, metal), box(0.008, 0.05, 0.012, 0.016, 0.02, 0.0, metal));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 6, 14), metal); ring.position.set(-0.014, 0.06, 0); ring.frustumCulled = false; g.add(ring);
      } else if (this.id === 'molotov') {
        const bottle = mat(0x2f6a3a, 0.08, 0.1), rag = mat(0xd8cbb0, 0.95, 0.0);
        this.materials.push(bottle, rag);
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.14, 14), bottle); b.position.y = 0.0; b.frustumCulled = false;
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.026, 0.07, 12), bottle); neck.position.y = 0.105; neck.frustumCulled = false;
        g.add(b, neck, box(0.018, 0.05, 0.018, 0.004, 0.155, 0, rag));
      } else {
        const putty = mat(0x9a8a6a, 0.85, 0.0), led = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2020, emissiveIntensity: 2 });
        this.materials.push(putty, led);
        g.add(box(0.06, 0.03, 0.09, 0, 0, 0, putty), box(0.03, 0.012, 0.03, 0, 0.02, 0.0, dark), box(0.006, 0.006, 0.006, 0.008, 0.028, 0.0, led));
      }
      this.muzzle.set(0, 0.04, -0.05);
      this.sightPoint.set(0, 0.1, -0.05);
      magZ = 0.0; this.magLength = 0.0001;
      rightPos = new THREE.Vector3(0.0, -0.04, 0.02); leftPos = new THREE.Vector3(-0.09, -0.12, 0.12);
      gripRake = 0.0;
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
      rightPos = new THREE.Vector3(0.027, -0.078, 0.07); leftPos = new THREE.Vector3(-0.06, -0.022, -0.26);
      g.add(box(0.032, 0.09, 0.04, 0, -0.05, 0.075, poly));
    }
    g.add(this.bolt);

    // magazine hangs from a raked frame so the viewmodel's reload choreography (written for the pistol) works unchanged
    const magFrame = new THREE.Group();
    magFrame.position.set(0, magTop, magZ);
    magFrame.rotation.x = rake;
    if (!['shotgun', 'knife', 'hatchet', 'rpg', 'revolver', 'combat', 'lmg', 'bat', 'grenade', 'molotov', 'sticky'].includes(this.id)) {
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
    // support hand under the handguard: palm up, fingers wrapping up the far side, thumb along the near side
    // (a reflection of the right-hand rig: fingers −Z → +X, back of hand +Y → −Y, thumb −X → muzzle)
    const left = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(leftPos);
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
