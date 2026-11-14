import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Detailed firearm models for the first-person view. Local frame: +X right, +Y up, −Z toward the muzzle, origin near
 * the trigger. Parts are rounded boxes and tubes merged into one mesh per material; moving parts (bolt, pump) go in
 * `bolt`. Every gun has real sights whose line of sight is exactly `sightPoint`'s height, with nothing solid on it:
 * aperture rings and hooded posts, a red dot in an open tube, a holographic window, or a bead on a shotgun rib.
 */

export interface GunMats {
  metal: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  poly: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  dot: THREE.MeshBasicMaterial;
}

export interface GunSpec {
  muzzle: THREE.Vector3;
  sightPoint: THREE.Vector3;
  /** Distance from the eye to `sightPoint` when aiming. */
  adsDist: number;
  magZ: number; magTop: number; magLength: number; rake: number;
  /** Curved rifle magazine, straight stick, or none (tube-fed / belt-fed). */
  mag: 'curved' | 'stick' | 'none';
  rightPos: THREE.Vector3; leftPos: THREE.Vector3; gripRake: number;
  boltTravel: number;
}

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Collects geometry per material and bakes it into one mesh each. */
export class Kit {
  private readonly bins = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    if (rx || ry || rz) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')));
    geo.translate(x, y, z);
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    let list = this.bins.get(m);
    if (!list) this.bins.set(m, (list = []));
    list.push(g);
  }

  /** A box with softened edges (`r` is the edge radius). */
  box(w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, r = 0.0025, rx = 0, ry = 0, rz = 0): void {
    const rr = Math.max(0.0002, Math.min(r, Math.min(w, h, d) / 2 - 0.0002));
    this.add(new RoundedBoxGeometry(w, h, d, 2, rr), m, x, y, z, rx, ry, rz);
  }

  /** A sharp box (small details where rounding is invisible). */
  sharp(w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, rx = 0, ry = 0, rz = 0): void {
    this.add(new THREE.BoxGeometry(w, h, d), m, x, y, z, rx, ry, rz);
  }

  /** A tube along Z (r2 = radius at the −Z end). */
  tube(r: number, len: number, x: number, y: number, z: number, m: THREE.Material, seg = 16, r2 = r, open = false): void {
    this.add(new THREE.CylinderGeometry(r2, r, len, seg, 1, open), m, x, y, z, Math.PI / 2);
  }

  /** A ring facing along Z. */
  ring(r: number, t: number, x: number, y: number, z: number, m: THREE.Material, seg = 20): void {
    this.add(new THREE.TorusGeometry(r, t, 6, seg), m, x, y, z);
  }

  /** A flat disc facing the shooter (+Z). */
  disc(r: number, x: number, y: number, z: number, m: THREE.Material): void {
    this.add(new THREE.CircleGeometry(r, 16), m, x, y, z);
  }

  bake(into: THREE.Object3D): void {
    for (const [m, list] of this.bins) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, m);
      mesh.frustumCulled = false;
      if ((m as THREE.Material).transparent) mesh.renderOrder = 2;
      into.add(mesh);
      for (const g of list) g.dispose();
    }
    this.bins.clear();
  }
}

// ================================================================================================ shared parts

/** A Picatinny rail: base with cross slots, top surface at `top`. */
function rail(k: Kit, M: GunMats, len: number, top: number, z: number): void {
  k.sharp(0.021, 0.004, len, 0, top - 0.002, z, M.dark);
  const n = Math.floor(len / 0.01);
  for (let i = 0; i < n; i++) k.sharp(0.022, 0.0035, 0.0052, 0, top - 0.0055, z - len / 2 + 0.005 + i * 0.01, M.dark);
  k.sharp(0.016, 0.004, len, 0, top - 0.006, z, M.dark);
}

/** Rear aperture (ghost ring) on a base from `base` up to the sight line `A`. */
function rearAperture(k: Kit, M: GunMats, A: number, base: number, z: number, r = 0.0048): void {
  const h = A - r - base;
  if (h > 0.001) k.box(0.014, h, 0.01, 0, base + h / 2, z, M.dark, 0.0015);
  k.ring(r, 0.0018, 0, A, z, M.dark, 18);
  for (const s of [-1, 1]) k.box(0.0032, A + r + 0.004 - base, 0.009, s * (r + 0.0046), base + (A + r + 0.004 - base) / 2, z, M.dark, 0.001);
}

/** Front post whose tip sits exactly on the sight line, inside a hood or between wings. */
function frontPost(k: Kit, M: GunMats, A: number, base: number, z: number, hood = true): void {
  const h = A - base;
  k.box(0.0026, h, 0.004, 0, base + h / 2, z, M.dark, 0.0006);
  if (hood) k.ring(0.0095, 0.0016, 0, A + 0.001, z, M.dark, 18);
  else for (const s of [-1, 1]) k.box(0.0025, h + 0.006, 0.008, s * 0.0085, base + (h + 0.006) / 2, z, M.dark, 0.0008);
  k.box(0.016, 0.006, 0.012, 0, base + 0.003, z, M.dark, 0.0015);
}

/** A tube red dot on a riser: open both ends, tinted lens at the front, a lit dot on the axis. */
function redDot(k: Kit, M: GunMats, A: number, railTop: number, z: number): void {
  const R = 0.0175;
  k.box(0.02, A - R - railTop + 0.002, 0.034, 0, railTop + (A - R - railTop) / 2, z, M.dark, 0.002);
  k.tube(R, 0.04, 0, A, z, M.dark, 24, R, true);
  k.ring(R, 0.0022, 0, A, z + 0.02, M.dark, 24);
  k.ring(R + 0.001, 0.0026, 0, A, z - 0.02, M.dark, 24);
  k.box(0.008, 0.007, 0.01, R + 0.002, A, z + 0.004, M.dark, 0.0015); // windage turret
  k.box(0.007, 0.008, 0.01, 0, A + R + 0.002, z + 0.004, M.dark, 0.0015); // elevation turret
  k.disc(R - 0.0006, 0, A, z - 0.018, M.glass);
  k.disc(0.00075, 0, A, z - 0.0172, M.dot);
}

/** A holographic sight: a square window in a hood, a reticle ring and dot floating on the glass. */
function holo(k: Kit, M: GunMats, A: number, railTop: number, z: number): void {
  const w = 0.036, hh = 0.028, base = A - hh / 2 - 0.004;
  k.box(0.04, base - railTop, 0.07, 0, railTop + (base - railTop) / 2, z, M.dark, 0.003);
  k.box(0.034, 0.008, 0.026, 0, railTop + 0.004 + (base - railTop) / 2, z + 0.03, M.dark, 0.002); // battery housing
  // the window frame: two sides and a hood over the top
  for (const s of [-1, 1]) k.box(0.004, hh + 0.008, 0.044, s * (w / 2 + 0.002), A, z - 0.008, M.dark, 0.0015);
  k.box(w + 0.008, 0.004, 0.05, 0, A + hh / 2 + 0.002, z - 0.008, M.dark, 0.0015);
  k.add(new THREE.PlaneGeometry(w, hh), M.glass, 0, A, z - 0.026);
  k.ring(0.0034, 0.00026, 0, A, z - 0.025, M.dot, 28);
  k.disc(0.00055, 0, A, z - 0.025, M.dot);
}

function pistolGrip(k: Kit, m: THREE.Material, z: number, rake = 0.28, h = 0.088): void {
  k.box(0.03, h, 0.042, 0, -0.012 - h / 2 + 0.006, z, m, 0.007, rake);
  for (let i = 0; i < 3; i++) k.box(0.031, 0.004, 0.006, 0, -0.03 - i * 0.02, z - 0.02 - i * 0.005, m, 0.0015, rake);
}

function triggerGuard(k: Kit, M: GunMats, zFront: number, zBack: number, y = -0.034): void {
  k.box(0.01, 0.004, zBack - zFront, 0, y, (zFront + zBack) / 2, M.dark, 0.0015);
  k.box(0.01, Math.abs(y) - 0.012, 0.004, 0, (y - 0.012) / 2, zFront, M.dark, 0.0015);
}

/** Muzzle device: a flash hider with prongs (`brake` = a squat brake with side ports instead). */
function muzzle(k: Kit, M: GunMats, y: number, z: number, r: number, brake = false): void {
  if (brake) {
    k.tube(r * 1.55, 0.05, 0, y, z - 0.025, M.dark, 16);
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) k.sharp(0.002, r * 1.6, 0.008, s * r * 1.56, y, z - 0.014 - i * 0.016, M.poly);
  } else {
    k.tube(r * 1.35, 0.045, 0, y, z - 0.0225, M.dark, 16);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; k.sharp(0.002, 0.002, 0.03, Math.cos(a) * r * 1.38, y + Math.sin(a) * r * 1.38, z - 0.03, M.poly); }
  }
}

// ================================================================================================ the guns

/** Assault rifle (FALCON AR-7) and carbine (Sentinel C4): flat-top upper, rail, collapsing stock. */
function ar(k: Kit, M: GunMats, bolt: Kit, short: boolean): GunSpec {
  const up = short ? M.metal : M.metal, fur = short ? M.accent : M.poly;
  // lower and upper receiver
  k.box(0.036, 0.032, 0.2, 0, -0.008, 0.012, up, 0.004);
  k.box(0.034, 0.042, 0.07, 0, -0.03, -0.06, up, 0.004); // magwell
  k.box(0.04, 0.04, 0.24, 0, 0.027, 0.0, up, 0.004);
  k.sharp(0.002, 0.014, 0.05, 0.0202, 0.028, 0.0, M.dark); // ejection port
  k.tube(0.006, 0.014, 0.024, 0.032, 0.07, up, 10); // forward assist
  k.box(0.006, 0.01, 0.016, -0.0205, 0.0, 0.035, M.dark, 0.001); // bolt release
  k.box(0.012, 0.004, 0.012, 0.019, 0.004, 0.06, M.dark, 0.001); // selector
  rail(k, M, 0.22, 0.051, 0.0);
  // charging handle
  k.box(0.012, 0.007, 0.05, 0, 0.044, 0.12, M.dark, 0.0015);
  k.box(0.04, 0.007, 0.012, 0, 0.044, 0.145, M.dark, 0.002);
  // handguard with M-LOK slots and a top rail
  const hgLen = short ? 0.2 : 0.3, hgZ = -0.12 - hgLen / 2;
  k.box(0.046, 0.046, hgLen, 0, 0.016, hgZ, fur, 0.008);
  for (const s of [-1, 1]) for (let i = 0; i < (short ? 3 : 5); i++) k.box(0.002, 0.008, 0.03, s * 0.0232, 0.012, hgZ + hgLen / 2 - 0.03 - i * 0.055, M.dark, 0.0008);
  for (let i = 0; i < (short ? 3 : 5); i++) k.box(0.008, 0.002, 0.03, 0, -0.0072, hgZ + hgLen / 2 - 0.03 - i * 0.055, M.dark, 0.0008);
  rail(k, M, hgLen - 0.02, 0.0435, hgZ);
  // barrel, gas block, muzzle
  const bEnd = short ? -0.47 : -0.6;
  const bStart = hgZ - hgLen / 2;
  k.tube(0.0085, bStart - bEnd, 0, 0.022, (bStart + bEnd) / 2, M.metal, 14);
  muzzle(k, M, 0.022, bEnd, 0.0085);
  // folded backup front sight (stays below the sight line)
  k.box(0.012, 0.008, 0.016, 0, 0.0475, hgZ - hgLen / 2 + 0.02, M.dark, 0.0015);
  // buffer tube, stock and buttpad
  k.tube(0.013, 0.17, 0, 0.026, 0.21, M.dark, 16);
  k.box(0.04, 0.06, 0.15, 0, 0.01, 0.3, fur, 0.008, -0.05);
  k.box(0.034, 0.012, 0.11, 0, 0.044, 0.29, fur, 0.004);
  k.box(0.042, 0.088, 0.016, 0, 0.002, 0.38, M.poly, 0.006);
  pistolGrip(k, fur, 0.075);
  triggerGuard(k, M, -0.035, 0.03);
  // optic: a holographic sight on the rifle, a red dot on the carbine
  const A = short ? 0.082 : 0.084;
  if (short) redDot(k, M, A, 0.051, -0.035); else holo(k, M, A, 0.051, -0.03);
  bolt.box(0.012, 0.016, 0.044, 0.0185, 0.03, 0.0, M.metal, 0.002);
  return {
    muzzle: V(0, 0.022, bEnd - 0.045), sightPoint: V(0, A, short ? -0.015 : -0.0), adsDist: short ? 0.25 : 0.26,
    magZ: -0.06, magTop: -0.03, magLength: 0.15, rake: 0.2, mag: 'curved',
    rightPos: V(0.027, -0.078, 0.07), leftPos: V(-0.06, -0.026, short ? -0.2 : -0.26), gripRake: 0.25, boltTravel: 0.04,
  };
}

/** WASP-9: a roller-locked 9 mm SMG with a drum rear sight, a hooded front post and a retractable stock. */
function smg(k: Kit, M: GunMats, bolt: Kit): GunSpec {
  const A = 0.074;
  k.box(0.042, 0.052, 0.27, 0, 0.022, -0.035, M.metal, 0.008); // receiver
  k.box(0.036, 0.024, 0.18, 0, -0.012, 0.0, M.poly, 0.004); // trigger group
  k.box(0.034, 0.04, 0.05, 0, -0.035, -0.04, M.metal, 0.004); // magwell
  k.box(0.046, 0.042, 0.14, 0, 0.004, -0.17, M.poly, 0.012); // handguard
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) k.box(0.002, 0.006, 0.018, s * 0.0232, 0.004, -0.12 - i * 0.03, M.dark, 0.0008);
  k.tube(0.0065, 0.15, -0.012, 0.047, -0.11, M.metal, 10); // cocking tube
  k.sharp(0.002, 0.012, 0.04, 0.0212, 0.03, -0.02, M.dark); // ejection port
  k.tube(0.009, 0.05, 0, 0.02, -0.255, M.metal, 14);
  for (let i = 0; i < 3; i++) k.tube(0.0115, 0.004, 0, 0.02, -0.235 - i * 0.012, M.dark, 14); // barrel lugs
  // sights: drum rear aperture, hooded front post
  rearAperture(k, M, A, 0.048, 0.07, 0.0045);
  k.tube(0.009, 0.012, 0, A - 0.0135, 0.07, M.dark, 14);
  frontPost(k, M, A, 0.048, -0.19, true);
  k.box(0.012, A - 0.048, 0.01, 0, 0.048 + (A - 0.048) / 2 - 0.004, -0.19, M.dark, 0.002);
  // retractable stock: two struts and a buttplate
  for (const s of [-1, 1]) k.box(0.006, 0.008, 0.17, s * 0.017, 0.028, 0.18, M.dark, 0.002);
  k.box(0.05, 0.075, 0.014, 0, 0.012, 0.27, M.poly, 0.005);
  pistolGrip(k, M.poly, 0.06, 0.25, 0.085);
  triggerGuard(k, M, -0.032, 0.03);
  bolt.box(0.012, 0.014, 0.02, -0.012, 0.058, -0.15, M.dark, 0.003); // cocking handle
  return {
    muzzle: V(0, 0.02, -0.29), sightPoint: V(0, A, 0.07), adsDist: 0.2,
    magZ: -0.04, magTop: -0.05, magLength: 0.16, rake: 0.15, mag: 'curved',
    rightPos: V(0.027, -0.075, 0.06), leftPos: V(-0.058, -0.028, -0.16), gripRake: 0.25, boltTravel: 0.03,
  };
}

/** Viper MP: a stubby machine pistol with the magazine in the grip. */
function micro(k: Kit, M: GunMats, bolt: Kit): GunSpec {
  const A = 0.064;
  k.box(0.04, 0.052, 0.2, 0, 0.016, -0.02, M.metal, 0.006);
  k.box(0.042, 0.008, 0.18, 0, 0.044, -0.025, M.dark, 0.003); // top cover
  k.sharp(0.002, 0.012, 0.035, 0.0202, 0.024, -0.02, M.dark);
  k.tube(0.0085, 0.05, 0, 0.018, -0.145, M.metal, 14);
  k.tube(0.011, 0.012, 0, 0.018, -0.175, M.dark, 14);
  rearAperture(k, M, A, 0.048, 0.06, 0.004);
  frontPost(k, M, A, 0.048, -0.105, false);
  k.box(0.034, 0.1, 0.04, 0, -0.05, 0.045, M.poly, 0.008, 0.08); // grip with the magazine inside
  triggerGuard(k, M, -0.025, 0.02);
  for (const s of [-1, 1]) k.box(0.005, 0.005, 0.12, s * 0.014, 0.0, 0.14, M.dark, 0.002); // folded stock arms
  k.box(0.034, 0.008, 0.012, 0, 0.0, 0.2, M.dark, 0.003);
  bolt.box(0.016, 0.01, 0.02, 0, 0.052, 0.02, M.dark, 0.003);
  return {
    muzzle: V(0, 0.018, -0.19), sightPoint: V(0, A, 0.06), adsDist: 0.22,
    magZ: 0.04, magTop: -0.02, magLength: 0.17, rake: 0.08, mag: 'stick',
    rightPos: V(0.025, -0.07, 0.045), leftPos: V(-0.052, -0.03, -0.08), gripRake: 0.1, boltTravel: 0.03,
  };
}

/** HAMMER-12 pump shotgun: wooden furniture, a ventilated rib and a brass bead. */
function pump(k: Kit, M: GunMats, bolt: Kit): GunSpec {
  const A = 0.0565;
  k.box(0.044, 0.068, 0.21, 0, 0.012, 0.0, M.metal, 0.008);
  k.sharp(0.002, 0.016, 0.06, 0.0222, 0.022, -0.01, M.dark); // ejection port
  k.box(0.03, 0.006, 0.05, 0, -0.022, -0.02, M.dark, 0.002); // loading port
  k.tube(0.0145, 0.6, 0, 0.034, -0.4, M.metal, 18);
  k.tube(0.012, 0.48, 0, 0.002, -0.34, M.dark, 16); // magazine tube
  k.tube(0.0135, 0.014, 0, 0.002, -0.585, M.metal, 16); // magazine cap
  // ventilated rib with posts, and the bead on the sight line
  k.box(0.008, 0.003, 0.58, 0, 0.052, -0.39, M.dark, 0.001);
  for (let i = 0; i < 10; i++) k.sharp(0.004, 0.004, 0.004, 0, 0.0495, -0.12 - i * 0.058, M.dark);
  k.add(new THREE.SphereGeometry(0.0028, 10, 8), M.brass, 0, A - 0.0004, -0.685);
  // the receiver top has a groove to line the bead up in
  for (const s of [-1, 1]) k.box(0.006, A + 0.004 - 0.046, 0.04, s * 0.008, (A + 0.004 + 0.046) / 2, 0.07, M.metal, 0.0015);
  // wooden stock and grip
  k.box(0.036, 0.06, 0.14, 0, -0.012, 0.16, M.wood, 0.01, -0.12);
  k.box(0.044, 0.105, 0.2, 0, -0.03, 0.29, M.wood, 0.014, -0.08);
  k.box(0.046, 0.11, 0.018, 0, -0.035, 0.395, M.poly, 0.006, -0.08);
  pistolGrip(k, M.wood, 0.075, 0.2, 0.08);
  triggerGuard(k, M, -0.03, 0.03, -0.03);
  // pump forend with grip grooves
  bolt.box(0.052, 0.05, 0.17, 0, -0.008, -0.26, M.wood, 0.012);
  for (let i = 0; i < 7; i++) bolt.box(0.053, 0.004, 0.006, 0, -0.008 - 0.02, -0.2 - i * 0.02, M.dark, 0.0015);
  return {
    muzzle: V(0, 0.034, -0.705), sightPoint: V(0, A, 0.07), adsDist: 0.2,
    magZ: 0, magTop: -0.02, magLength: 0.0001, rake: 0, mag: 'none',
    rightPos: V(0.027, -0.075, 0.075), leftPos: V(-0.062, -0.04, -0.27), gripRake: 0.18, boltTravel: 0.1,
  };
}

/** Breacher S12 semi-auto: ghost-ring sights, a side saddle of shells, polymer furniture. */
function combat(k: Kit, M: GunMats, bolt: Kit): GunSpec {
  const A = 0.078;
  k.box(0.048, 0.07, 0.26, 0, 0.012, -0.02, M.dark, 0.008);
  k.sharp(0.002, 0.016, 0.06, 0.0242, 0.022, -0.03, M.metal);
  rail(k, M, 0.16, 0.051, -0.02);
  k.tube(0.0145, 0.52, 0, 0.034, -0.41, M.metal, 18);
  k.tube(0.0135, 0.42, 0, 0.002, -0.36, M.dark, 16);
  k.box(0.052, 0.05, 0.2, 0, -0.002, -0.27, M.poly, 0.01);
  muzzle(k, M, 0.034, -0.67, 0.0145, true);
  rearAperture(k, M, A, 0.051, 0.04, 0.0052);
  frontPost(k, M, A, 0.0485, -0.64, false);
  // side saddle: six shells on the left
  k.box(0.006, 0.03, 0.09, -0.027, 0.012, -0.02, M.poly, 0.002);
  for (let i = 0; i < 6; i++) { k.tube(0.0055, 0.016, -0.031, 0.012, -0.055 + i * 0.014, M.accent, 10); k.tube(0.0058, 0.004, -0.031, 0.012, -0.055 + i * 0.014 + 0.009, M.brass, 10); }
  k.add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.03, 10), M.accent, -0.03, 0.012, -0.02, 0, 0, Math.PI / 2);
  // stock
  k.box(0.04, 0.08, 0.24, 0, -0.012, 0.24, M.poly, 0.012, -0.06);
  k.box(0.044, 0.1, 0.02, 0, -0.02, 0.37, M.dark, 0.006);
  pistolGrip(k, M.poly, 0.075);
  triggerGuard(k, M, -0.035, 0.03, -0.032);
  bolt.box(0.012, 0.018, 0.04, 0.026, 0.028, -0.02, M.metal, 0.003);
  return {
    muzzle: V(0, 0.034, -0.72), sightPoint: V(0, A, 0.04), adsDist: 0.2,
    magZ: 0, magTop: -0.02, magLength: 0.0001, rake: 0, mag: 'none',
    rightPos: V(0.027, -0.075, 0.07), leftPos: V(-0.062, -0.034, -0.27), gripRake: 0.25, boltTravel: 0.04,
  };
}

/** Hammerhead M60: belt-fed, a finned barrel shroud, carry handle, ammunition box, bipod. */
function lmg(k: Kit, M: GunMats, bolt: Kit): GunSpec {
  const A = 0.1;
  k.box(0.06, 0.088, 0.34, 0, 0.012, -0.02, M.metal, 0.008);
  k.box(0.064, 0.016, 0.2, 0, 0.062, -0.04, M.dark, 0.004); // feed tray cover
  k.box(0.012, 0.012, 0.03, 0.034, 0.05, -0.01, M.dark, 0.003); // cover latch
  k.tube(0.022, 0.32, 0, 0.026, -0.36, M.dark, 18); // barrel shroud
  for (let i = 0; i < 6; i++) k.tube(0.0228, 0.006, 0, 0.026, -0.22 - i * 0.05, M.metal, 18);
  k.tube(0.012, 0.16, 0, 0.026, -0.6, M.metal, 14);
  muzzle(k, M, 0.026, -0.68, 0.012);
  // carry handle over the barrel, out of the line of sight
  k.box(0.008, 0.008, 0.12, 0.03, 0.06, -0.22, M.dark, 0.003);
  for (const z of [-0.17, -0.27]) k.box(0.008, 0.03, 0.008, 0.03, 0.046, z, M.dark, 0.002);
  // sights: folding leaf aperture and a front post on the barrel
  rearAperture(k, M, A, 0.07, 0.04, 0.0055);
  frontPost(k, M, A, 0.032, -0.62, false);
  k.box(0.014, 0.02, 0.014, 0, 0.042, -0.62, M.dark, 0.003);
  // stock, grip, belt and ammunition box
  k.box(0.05, 0.1, 0.24, 0, -0.008, 0.28, M.poly, 0.014, -0.05);
  k.box(0.052, 0.11, 0.018, 0, -0.012, 0.405, M.dark, 0.006);
  pistolGrip(k, M.poly, 0.09, 0.25, 0.095);
  triggerGuard(k, M, -0.025, 0.045, -0.04);
  k.box(0.07, 0.1, 0.11, -0.04, -0.07, -0.03, M.accent, 0.006);
  k.box(0.072, 0.008, 0.112, -0.04, -0.018, -0.03, M.dark, 0.003);
  for (let i = 0; i < 5; i++) { k.tube(0.0045, 0.03, -0.01 - i * 0.008, 0.034 - i * 0.012, -0.03, M.brass, 8, 0.0035); }
  // folded bipod legs under the shroud
  for (const s of [-1, 1]) k.box(0.006, 0.006, 0.22, s * 0.014, -0.004, -0.46, M.dark, 0.002);
  bolt.box(0.014, 0.026, 0.05, 0.034, 0.03, -0.02, M.metal, 0.003);
  return {
    muzzle: V(0, 0.026, -0.73), sightPoint: V(0, A, 0.04), adsDist: 0.22,
    magZ: 0, magTop: -0.02, magLength: 0.0001, rake: 0, mag: 'none',
    rightPos: V(0.03, -0.08, 0.09), leftPos: V(-0.07, -0.025, -0.3), gripRake: 0.25, boltTravel: 0.04,
  };
}

/** Longbow M338: bolt-action with a big scope (aiming shows the scope view, not the model). */
function sniper(k: Kit, M: GunMats, bolt: Kit): GunSpec {
  const A = 0.092;
  k.box(0.046, 0.06, 0.3, 0, 0.014, -0.02, M.metal, 0.008);
  rail(k, M, 0.24, 0.05, -0.04);
  k.tube(0.012, 0.6, 0, 0.022, -0.47, M.metal, 16, 0.0105);
  muzzle(k, M, 0.022, -0.77, 0.0105, true);
  k.box(0.052, 0.06, 0.36, 0, -0.008, -0.22, M.accent, 0.014);
  k.box(0.046, 0.1, 0.3, 0, -0.016, 0.24, M.accent, 0.016, -0.04);
  k.box(0.02, 0.05, 0.06, 0, -0.03, 0.12, M.dark, 0.006); // thumbhole
  k.box(0.04, 0.03, 0.12, 0, 0.04, 0.23, M.accent, 0.008); // cheek riser
  k.box(0.048, 0.11, 0.018, 0, -0.022, 0.4, M.dark, 0.006);
  pistolGrip(k, M.accent, 0.08, 0.3);
  triggerGuard(k, M, -0.03, 0.03, -0.034);
  // the scope: tube, bells, turrets and rings
  k.tube(0.0155, 0.24, 0, A, -0.05, M.dark, 20);
  k.tube(0.026, 0.07, 0, A, -0.2, M.dark, 24, 0.028);
  k.tube(0.021, 0.06, 0, A, 0.1, M.dark, 22, 0.017);
  k.tube(0.0115, 0.022, 0.0, A + 0.022, -0.05, M.dark, 14);
  k.add(new THREE.CylinderGeometry(0.0115, 0.0115, 0.022, 14), M.dark, 0.022, A, -0.05, 0, 0, Math.PI / 2);
  for (const z of [-0.12, 0.03]) k.box(0.03, A - 0.05, 0.014, 0, 0.05 + (A - 0.05) / 2, z, M.metal, 0.003);
  k.disc(0.025, 0, A, -0.236, M.glass);
  bolt.box(0.05, 0.01, 0.01, 0.04, 0.03, 0.04, M.metal, 0.003);
  bolt.add(new THREE.SphereGeometry(0.009, 10, 8), M.metal, 0.068, 0.03, 0.04);
  return {
    muzzle: V(0, 0.022, -0.82), sightPoint: V(0, A, 0.13), adsDist: 0.3,
    magZ: -0.02, magTop: -0.02, magLength: 0.06, rake: 0, mag: 'stick',
    rightPos: V(0.027, -0.08, 0.08), leftPos: V(-0.06, -0.035, -0.28), gripRake: 0.25, boltTravel: 0.06,
  };
}

/** Ranger .44: a heavy double-action revolver with a full-length underlug and a rear notch in the topstrap. */
function revolver(k: Kit, M: GunMats, bolt: Kit): GunSpec {
  const A = 0.064;
  void bolt;
  k.box(0.032, 0.056, 0.1, 0, 0.02, 0.0, M.metal, 0.006); // frame
  k.box(0.024, 0.01, 0.07, 0, 0.051, -0.005, M.metal, 0.003); // topstrap
  for (const s of [-1, 1]) k.box(0.005, A + 0.004 - 0.056, 0.008, s * 0.0045, (A + 0.004 + 0.056) / 2, 0.045, M.dark, 0.001); // rear notch
  // cylinder with flutes
  k.tube(0.024, 0.052, 0, 0.022, -0.035, M.metal, 24);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.box(0.004, 0.004, 0.04, Math.cos(a) * 0.0235, 0.022 + Math.sin(a) * 0.0235, -0.035, M.dark, 0.0012); }
  // barrel, underlug, rib and front blade
  k.tube(0.0105, 0.17, 0, 0.032, -0.145, M.metal, 16);
  k.box(0.018, 0.022, 0.16, 0, 0.012, -0.145, M.metal, 0.004);
  k.box(0.012, 0.008, 0.17, 0, 0.046, -0.145, M.metal, 0.0025);
  k.box(0.003, A - 0.05, 0.016, 0, 0.05 + (A - 0.05) / 2, -0.215, M.accent, 0.0008);
  k.tube(0.005, 0.004, 0, 0.032, -0.231, M.dark, 12);
  // hammer, trigger guard, wooden grip
  k.box(0.008, 0.02, 0.016, 0, 0.052, 0.052, M.dark, 0.002, -0.4);
  triggerGuard(k, M, -0.02, 0.02, -0.03);
  k.box(0.032, 0.1, 0.045, 0, -0.04, 0.06, M.wood, 0.012, 0.35);
  return {
    muzzle: V(0, 0.032, -0.235), sightPoint: V(0, A, 0.045), adsDist: 0.27,
    magZ: 0, magTop: -0.02, magLength: 0.0001, rake: 0, mag: 'none',
    rightPos: V(0.022, -0.06, 0.06), leftPos: V(-0.05, -0.065, 0.075), gripRake: 0.35, boltTravel: 0.0,
  };
}

/** Helios LX: a white shell with glowing emitters and a holographic window. */
function laser(k: Kit, M: GunMats, glow: THREE.Material): GunSpec {
  const A = 0.1;
  k.box(0.05, 0.08, 0.34, 0, 0.012, -0.06, M.accent, 0.014);
  k.box(0.04, 0.05, 0.22, 0, 0.012, -0.32, M.dark, 0.01);
  for (const sx of [-1, 1]) k.box(0.004, 0.006, 0.3, sx * 0.023, 0.05, -0.08, glow, 0.0015);
  for (const s of [-1, 1]) k.box(0.006, 0.02, 0.2, s * 0.026, 0.012, -0.3, glow, 0.002);
  k.tube(0.016, 0.1, 0, 0.012, -0.48, M.accent, 18);
  k.tube(0.01, 0.02, 0, 0.012, -0.535, glow, 14);
  k.box(0.04, 0.07, 0.18, 0, 0.0, 0.2, M.accent, 0.014);
  pistolGrip(k, M.accent, 0.075);
  holo(k, M, A, 0.061, -0.05);
  return {
    muzzle: V(0, 0.012, -0.55), sightPoint: V(0, A, -0.05), adsDist: 0.26,
    magZ: -0.02, magTop: -0.02, magLength: 0.1, rake: 0, mag: 'stick',
    rightPos: V(0.027, -0.075, 0.07), leftPos: V(-0.06, -0.022, -0.26), gripRake: 0.25, boltTravel: 0.04,
  };
}

/** Build a firearm into `group` (static parts) and `boltGroup` (moving part). Null for anything that is not a firearm. */
export function buildFirearm(id: string, M: GunMats, group: THREE.Group, boltGroup: THREE.Group, glow?: THREE.Material): GunSpec | null {
  const k = new Kit(), b = new Kit();
  let s: GunSpec | null;
  switch (id) {
    case 'rifle': s = ar(k, M, b, false); break;
    case 'carbine': s = ar(k, M, b, true); break;
    case 'smg': s = smg(k, M, b); break;
    case 'micro': s = micro(k, M, b); break;
    case 'shotgun': s = pump(k, M, b); break;
    case 'combat': s = combat(k, M, b); break;
    case 'lmg': s = lmg(k, M, b); break;
    case 'sniper': s = sniper(k, M, b); break;
    case 'revolver': s = revolver(k, M, b); break;
    case 'laser': s = glow ? laser(k, M, glow) : null; break;
    default: s = null;
  }
  if (!s) return null;
  k.bake(group);
  b.bake(boltGroup);
  return s;
}

/** A magazine body hanging down from y = 0: curved (rifle) or straight, with ribs and a base plate. */
export function buildMagazine(style: 'curved' | 'stick', len: number, M: GunMats, into: THREE.Group): void {
  const k = new Kit();
  const n = style === 'curved' ? 4 : 1;
  const seg = len / n;
  let y = 0, z = 0;
  for (let i = 0; i < n; i++) {
    const a = style === 'curved' ? 0.06 + i * 0.07 : 0;
    const cy = y - (seg / 2) * Math.cos(a), cz = z - (seg / 2) * Math.sin(a);
    k.box(0.026, seg + 0.004, 0.044, 0, cy, cz, M.dark, 0.003, a);
    if (style === 'curved') for (const s of [-1, 1]) k.box(0.002, seg * 0.7, 0.006, s * 0.0135, cy, cz + 0.012, M.poly, 0.0008, a);
    y -= seg * Math.cos(a); z -= seg * Math.sin(a);
  }
  const a = style === 'curved' ? 0.06 + (n - 1) * 0.07 : 0;
  k.box(0.031, 0.012, 0.05, 0, y - 0.004, z, M.poly, 0.003, a);
  k.add(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 8), M.brass, 0, -0.004, -0.005, 0, 0, Math.PI / 2); // top round
  k.bake(into);
}
