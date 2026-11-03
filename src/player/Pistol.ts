import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const RAKE = 0.28; // grip rake (radians)

function noiseTexture(size: number, strength: number, repeat = 3): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 255 * strength;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

/**
 * The VC-9 service pistol, modelled in metres. Local frame: +X right, +Y up, −Z toward the muzzle.
 * Origin sits at the top of the trigger-guard area; the slide moves along +Z when firing.
 */
export class Pistol {
  readonly group = new THREE.Group();
  readonly slide = new THREE.Group();
  readonly gripFrame = new THREE.Group();
  readonly magazine = new THREE.Group();
  readonly trigger = new THREE.Mesh();
  readonly materials: THREE.MeshStandardMaterial[] = [];

  /** Anchor matrices (relative to `group`) that the hands snap to. */
  readonly rightGrip = new THREE.Matrix4();
  readonly leftGrip = new THREE.Matrix4();
  /** Points of interest in gun space. */
  readonly muzzle = new THREE.Vector3(0, 0.040, -0.112);
  readonly eject = new THREE.Vector3(0.020, 0.046, 0.03);
  /** The point midway between the sights; ADS puts it on the view axis. */
  readonly sightPoint = new THREE.Vector3(0, 0.0585, -0.01);
  /** Magwell axis (pointing down out of the grip) and its base position, gun space. */
  readonly magAxis = new THREE.Vector3(0, -Math.cos(RAKE), Math.sin(RAKE));
  readonly magBase = new THREE.Vector3();
  readonly magLength = 0.098;

  constructor() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.34, metalness: 0.9 });
    const slideMat = new THREE.MeshStandardMaterial({ color: 0x1d2025, roughness: 0.3, metalness: 0.92 });
    const polymer = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.78, metalness: 0.05, bumpMap: noiseTexture(128, 0.9, 5), bumpScale: 1.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.9, metalness: 0.2 });
    const dotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.9, roughness: 0.4 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.3, metalness: 1 });
    this.materials.push(metal, slideMat, polymer, dark, dotMat, brass);
    for (const m of this.materials) m.fog = false;

    // --- slide: extruded side profile -------------------------------------------------------------
    const prof = new THREE.Shape();
    prof.moveTo(-0.082, 0.022); // x here is "length toward the muzzle" in negative z after rotation
    prof.lineTo(-0.082, 0.047);
    prof.lineTo(-0.077, 0.0535);
    prof.lineTo(0.094, 0.0535);
    prof.lineTo(0.103, 0.0455);
    prof.lineTo(0.103, 0.022);
    prof.closePath();
    const slideGeo = new THREE.ExtrudeGeometry(prof, { depth: 0.027, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0016, bevelSegments: 2, curveSegments: 4 });
    slideGeo.translate(0, 0, -0.0135);
    slideGeo.rotateY(Math.PI / 2); // length axis → −Z (muzzle), thickness → X
    slideGeo.scale(1, 1, -1); // keep muzzle at −Z
    const slideMesh = new THREE.Mesh(slideGeo, slideMat);
    this.slide.add(slideMesh);

    // serrations (merged into one mesh)
    const ser: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      for (const side of [-1, 1]) {
        const g = new THREE.BoxGeometry(0.0022, 0.022, 0.0024);
        g.translate(side * 0.0145, 0.037, 0.050 + i * 0.0062);
        ser.push(g);
      }
    }
    for (let i = 0; i < 3; i++) {
      for (const side of [-1, 1]) {
        const g = new THREE.BoxGeometry(0.0022, 0.02, 0.0024);
        g.translate(side * 0.0145, 0.037, -0.083 - i * 0.0062);
        ser.push(g);
      }
    }
    // ejection port (dark inset on the right)
    const port = new THREE.BoxGeometry(0.0022, 0.013, 0.036);
    port.translate(0.0146, 0.044, 0.002);
    ser.push(port);
    this.slide.add(new THREE.Mesh(mergeGeometries(ser)!, dark));

    // sights
    for (const side of [-1, 1]) {
      const rs = new THREE.Mesh(new THREE.BoxGeometry(0.0058, 0.0085, 0.008), slideMat);
      rs.position.set(side * 0.0046, 0.0578, 0.072);
      this.slide.add(rs);
    }
    const fs = new THREE.Mesh(new THREE.BoxGeometry(0.0034, 0.0085, 0.0075), slideMat);
    fs.position.set(0, 0.0583, -0.094);
    this.slide.add(fs);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.00125, 8, 6), dotMat);
    dot.position.set(0, 0.0618, -0.0974);
    this.slide.add(dot);
    // muzzle opening
    const muzzleHole = new THREE.Mesh(new THREE.CylinderGeometry(0.0046, 0.0046, 0.004, 14), dark);
    muzzleHole.rotateX(Math.PI / 2);
    muzzleHole.position.set(0, 0.036, -0.1052);
    this.slide.add(muzzleHole);

    // --- frame ---------------------------------------------------------------------------------------
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.0255, 0.021, 0.176), polymer);
    frame.position.set(0, 0.0125, -0.003);
    this.group.add(frame);
    const railTop = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.004, 0.14), metal);
    railTop.position.set(0, 0.0235, -0.01);
    this.group.add(railTop);
    // trigger guard (open loop built from boxes)
    const tg = new THREE.Group();
    const bar = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), polymer);
      m.position.set(x, y, z);
      tg.add(m);
    };
    bar(0.0225, 0.0085, 0.052, 0, -0.0165, -0.032);
    bar(0.0225, 0.026, 0.0085, 0, -0.0085, -0.0575);
    this.group.add(tg);
    // trigger
    this.trigger.geometry = new THREE.BoxGeometry(0.0055, 0.025, 0.0085);
    this.trigger.material = metal;
    this.trigger.geometry.translate(0, -0.0105, 0);
    this.trigger.position.set(0, 0.0005, -0.016);
    this.group.add(this.trigger);

    // --- grip (raked) ----------------------------------------------------------------------------------
    this.gripFrame.position.set(0, 0.003, 0.058);
    this.gripFrame.rotation.x = -RAKE;
    const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.0315, 0.104, 0.047), polymer);
    gripMesh.position.set(0, -0.052, 0);
    this.gripFrame.add(gripMesh);
    const backstrap = new THREE.Mesh(new THREE.BoxGeometry(0.0265, 0.098, 0.006), metal);
    backstrap.position.set(0, -0.052, 0.0255);
    this.gripFrame.add(backstrap);
    this.group.add(this.gripFrame);

    // --- magazine: origin at the top, extends down the grip axis --------------------------------------
    const magBody = new THREE.Mesh(new THREE.BoxGeometry(0.0255, this.magLength, 0.0385), metal);
    magBody.position.set(0, -this.magLength / 2, 0);
    const magBase = new THREE.Mesh(new THREE.BoxGeometry(0.029, 0.009, 0.043), polymer);
    magBase.position.set(0, -this.magLength - 0.002, 0.0015);
    const rounds = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.006, 0.026), brass);
    rounds.position.set(0, 0.002, 0);
    this.magazine.add(magBody, magBase, rounds);
    this.magazine.position.set(0, -0.006, 0);
    this.gripFrame.add(this.magazine);

    this.group.add(this.slide);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.frustumCulled = false;
    });

    // --- anchors ---------------------------------------------------------------------------------------
    this.gripFrame.updateMatrix();
    const gf = this.gripFrame.matrix;
    // Right hand: palm on the right side of the grip, fingers wrapping the front.
    const right = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1))
      .setPosition(0.0262, -0.034, 0.066);
    this.rightGrip.multiplyMatrices(gf, right);
    // Left (support) hand: the mirrored basis (a reflection, so the shared right-hand rig renders as a left hand).
    const left = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1))
      .setPosition(-0.0262, -0.066, 0.058);
    this.leftGrip.multiplyMatrices(gf, left);
    this.magBase.set(0, -0.006 - this.magLength, 0).applyMatrix4(gf);
  }

  /** 0 = slide forward, 1 = fully back. */
  setSlide(v: number): void {
    this.slide.position.z = v * 0.034;
  }

  /** 0 = released, 1 = pressed. */
  setTrigger(v: number): void {
    this.trigger.rotation.x = v * 0.22;
    this.trigger.position.z = -0.016 + v * 0.004;
  }
}
