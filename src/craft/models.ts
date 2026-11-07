import * as THREE from 'three';
import { Mesher, type Section } from './builder';
import type { Craft } from './Craft';
import type { CraftSpec } from './specs';

/** The materials every craft shares (so the world registers just three of them for the lighting rig). */
export const craftMaterials = {
  body: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0.3, side: THREE.DoubleSide }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1c2f40, roughness: 0.06, metalness: 0.5, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: true }),
  burnt: new THREE.MeshStandardMaterial({ color: 0x1d1b1a, vertexColors: true, roughness: 0.95, metalness: 0.1, side: THREE.DoubleSide }),
};

export interface CraftVisual {
  group: THREE.Group;
  update(c: Craft, dt: number): void;
  setNight(n: number): void;
}

const SKIN = 0xd9a47c;

function figure(shirt: number, y = 0, z = 0, lean = 0): Mesher {
  const m = new Mesher();
  m.box(0.5, 0.62, 0.28, shirt, { y: y + 0.55, z, rx: lean });
  m.sphere(0.17, SKIN, { y: y + 1.02, z: z - lean * 0.4 });
  m.box(0.16, 0.5, 0.16, 0x2a3040, { x: -0.13, y: y + 0.0, z: z - 0.2, rx: -1.2 });
  m.box(0.16, 0.5, 0.16, 0x2a3040, { x: 0.13, y: y + 0.0, z: z - 0.2, rx: -1.2 });
  m.box(0.12, 0.5, 0.12, shirt, { x: -0.33, y: y + 0.62, z: z - 0.25, rx: -1.1 });
  m.box(0.12, 0.5, 0.12, shirt, { x: 0.33, y: y + 0.62, z: z - 0.25, rx: -1.1 });
  return m;
}

type Parts = { body: Mesher; glass: Mesher; glow: Mesher; turret?: { mesh: Mesher; barrel: Mesher; at: [number, number, number] }; spin?: { mesh: Mesher; axis: 'y' | 'z'; at: [number, number, number]; speed: 'rotor' | 'tail' | 'prop' }[]; gear?: Mesher; pilot?: Mesher };

function boat(spec: CraftSpec, paint: number): Parts {
  const body = new Mesher(), glass = new Mesher(), glow = new Mesher();
  const L = spec.size.length, W = spec.size.width, cH = spec.comHeight;
  const y0 = -cH;
  const id = spec.id;
  const hullSections = (len: number, w: number, depth: number, bowRise: number): Section[] => {
    const h = len / 2;
    return [
      { z: -h, wTop: w * 0.08, wBot: w * 0.02, yTop: bowRise, yBot: depth * 0.45 },
      { z: -h * 0.7, wTop: w * 0.72, wBot: w * 0.26, yTop: bowRise * 0.9, yBot: 0 },
      { z: -h * 0.2, wTop: w, wBot: w * 0.55, yTop: bowRise * 0.78, yBot: 0 },
      { z: h * 0.6, wTop: w, wBot: w * 0.62, yTop: bowRise * 0.76, yBot: 0 },
      { z: h, wTop: w * 0.96, wBot: w * 0.6, yTop: bowRise * 0.76, yBot: depth * 0.08 },
    ];
  };
  if (id === 'marlin') {
    body.loft(hullSections(L, W, 0.5, 1.0), paint, { y: y0 });
    body.box(W * 0.96, 0.05, L * 0.72, 0xd9d6cc, { y: y0 + 0.78, z: 0.4 }); // deck
    body.box(W * 1.01, 0.12, L * 0.9, 0x1c2a44, { y: y0 + 0.42, z: 0.1 }); // stripe
    body.box(0.55, 0.5, 0.5, 0x2a2d32, { x: -0.55, y: y0 + 1.05, z: -0.5 }); // console
    body.box(0.7, 0.14, 0.62, 0x2a2d32, { x: -0.5, y: y0 + 0.9, z: 1.1 }); // seat
    body.box(1.2, 0.14, 0.62, 0x2a2d32, { y: y0 + 0.9, z: 2.0 }); // bench
    body.box(0.4, 0.5, 0.5, 0x15171a, { y: y0 + 0.9, z: L * 0.5 + 0.1 }); // outboard
    body.cyl(0.05, 0.05, 0.9, 0x15171a, { y: y0 + 0.35, z: L * 0.5 + 0.2 });
    glass.box(W * 0.8, 0.5, 0.05, 0xffffff, { y: y0 + 1.4, z: -1.0, rx: -0.5 });
    glow.box(0.12, 0.12, 0.12, 0xff3030, { x: -W * 0.45, y: y0 + 0.92, z: -L * 0.2 }).box(0.12, 0.12, 0.12, 0x30ff60, { x: W * 0.45, y: y0 + 0.92, z: -L * 0.2 });
    return { body, glass, glow, pilot: figure(0xe8e8e8, y0 + 0.9, -0.4, 0.2).box(0.02, 0.02, 0.02, 0, {}) };
  }
  if (id === 'zephyr') {
    body.loft(hullSections(L, W, 0.3, 0.55), paint, { y: y0 });
    body.box(W * 0.8, 0.12, L * 0.34, 0x1a1c20, { y: y0 + 0.62, z: 0.55 }); // seat
    body.box(W * 0.62, 0.28, L * 0.34, paint, { y: y0 + 0.55, z: -0.75 }); // cowl
    body.box(0.06, 0.5, 0.06, 0x2a2d32, { y: y0 + 0.82, z: -0.5 });
    body.box(0.7, 0.06, 0.06, 0x2a2d32, { y: y0 + 1.07, z: -0.45 });
    glass.box(0.5, 0.3, 0.04, 0xffffff, { y: y0 + 0.95, z: -0.95, rx: -0.7 });
    return { body, glass, glow, pilot: figure(paint, y0 + 0.72, 0.4, -0.35) };
  }
  if (id === 'gull') {
    body.loft(hullSections(L, W, 0.9, 1.5), paint, { y: y0 });
    body.box(W * 0.9, 0.06, L * 0.9, 0x8a7a60, { y: y0 + 1.2, z: 0.3 }); // deck
    body.box(W * 0.72, 1.9, 3.0, 0xe8e4da, { y: y0 + 2.15, z: -1.8 }); // wheelhouse
    body.box(W * 0.8, 0.14, 3.3, 0xc9c4b8, { y: y0 + 3.15, z: -1.8 });
    glass.box(W * 0.66, 0.7, 0.05, 0xffffff, { y: y0 + 2.5, z: -3.32 });
    glass.box(0.05, 0.7, 2.0, 0xffffff, { x: W * 0.37, y: y0 + 2.5, z: -1.9 }).box(0.05, 0.7, 2.0, 0xffffff, { x: -W * 0.37, y: y0 + 2.5, z: -1.9 });
    body.cyl(0.09, 0.07, 5.2, 0x3a3d42, { y: y0 + 3.6, z: 0.9 }); // mast
    body.box(0.08, 0.08, 4.0, 0x3a3d42, { y: y0 + 3.2, z: 3.0, rx: 0.35 }); // boom
    body.box(1.6, 0.9, 1.4, 0x6a6a60, { y: y0 + 1.7, z: 2.8 }); // winch
    body.box(W + 0.05, 0.16, L * 0.96, 0xc23a2a, { y: y0 + 0.5, z: 0.1 });
    glow.box(0.14, 0.14, 0.14, 0xffe0a0, { y: y0 + 5.3, z: 0.9 });
    return { body, glass, glow, pilot: figure(0xe0a020, y0 + 1.25, -2.6, 0) };
  }
  // yacht
  body.loft(hullSections(L, W, 1.0, 2.0), 0x1c2a44, { y: y0 });
  body.loft(hullSections(L * 0.97, W * 0.97, 0.2, 0.4), paint, { y: y0 + 1.5, z: 0.1, sy: 0.9 });
  body.box(W * 0.96, 0.08, L * 0.9, 0xb89a6a, { y: y0 + 2.2, z: 0.4 });
  body.box(W * 0.82, 1.4, L * 0.5, paint, { y: y0 + 2.95, z: 1.2 });
  body.box(W * 0.7, 0.14, L * 0.52, 0xe8e4da, { y: y0 + 3.7, z: 1.2 });
  body.box(W * 0.62, 1.0, L * 0.28, paint, { y: y0 + 4.3, z: 1.8 });
  body.box(W * 0.7, 0.1, L * 0.3, 0xe8e4da, { y: y0 + 4.85, z: 1.8 });
  body.cyl(0.06, 0.06, 2.6, 0xcfcfcf, { y: y0 + 6.1, z: 1.8 });
  body.box(1.0, 0.1, 0.1, 0xcfcfcf, { y: y0 + 6.4, z: 1.8 });
  body.box(W * 0.7, 0.3, 1.6, 0xe8e0d0, { y: y0 + 2.5, z: 6.6 }); // sun deck
  body.box(W * 0.9, 0.12, 1.4, 0x1c2a44, { y: y0 + 1.0, z: L * 0.5 + 0.7 }); // swim platform
  glass.box(W * 0.8, 0.6, L * 0.48, 0xffffff, { y: y0 + 3.0, z: 1.2 });
  glass.box(W * 0.6, 0.5, L * 0.26, 0xffffff, { y: y0 + 4.35, z: 1.8 });
  glow.box(0.16, 0.16, 0.16, 0xffffff, { y: y0 + 7.5, z: 1.8 });
  return { body, glass, glow, pilot: figure(0xf0f0f0, y0 + 4.3, -0.2, 0) };
}

function heli(spec: CraftSpec, paint: number): Parts {
  const body = new Mesher(), glass = new Mesher(), glow = new Mesher();
  const y0 = -spec.comHeight;
  const news = spec.id === 'newsbird';
  const s = news ? 1.2 : 1;
  const stripe = news ? 0xc23a2a : 0xf0ede6;
  // cabin: egg-shaped, nose to −z
  body.loft([
    { z: -1.9 * s, wTop: 0.3, wBot: 0.2, yTop: 1.0, yBot: 0.35 },
    { z: -1.2 * s, wTop: 1.5, wBot: 0.9, yTop: 1.9, yBot: 0.05 },
    { z: 0.2 * s, wTop: 1.9, wBot: 1.2, yTop: 2.0, yBot: 0.0 },
    { z: 1.3 * s, wTop: 1.3, wBot: 0.8, yTop: 1.8, yBot: 0.2 },
    { z: 2.0 * s, wTop: 0.5, wBot: 0.4, yTop: 1.4, yBot: 0.5 },
  ], paint, { y: y0 + 0.1 });
  body.loft([
    { z: 1.6 * s, wTop: 0.5, wBot: 0.4, yTop: 1.5, yBot: 1.0 },
    { z: 3.6 * s, wTop: 0.28, wBot: 0.24, yTop: 1.35, yBot: 1.05 },
    { z: 5.2 * s, wTop: 0.16, wBot: 0.14, yTop: 1.4, yBot: 1.15 },
  ], paint, { y: y0 + 0.1 });
  body.box(0.08, 1.2 * s, 0.9 * s, paint, { y: y0 + 2.2, z: 4.9 * s }); // fin
  body.box(1.6 * s, 0.06, 0.5, paint, { y: y0 + 1.3, z: 4.4 * s }); // stabiliser
  body.box(1.5 * s, 0.8, 1.6 * s, 0x2a2d32, { y: y0 + 2.2, z: 0.3 * s }); // engine cowl
  body.box(1.95 * s, 0.12, 4.0 * s, stripe, { y: y0 + 1.2, z: 0.0 });
  body.cyl(0.12, 0.12, 0.7, 0x2a2d32, { y: y0 + 2.8, z: 0.2 * s });
  for (const sx of [-1, 1]) {
    body.cyl(0.06, 0.06, 4.0 * s, 0x2a2d32, { x: sx * 1.0, y: y0 + 0.05, z: 0, rx: Math.PI / 2 }); // skids
    body.cyl(0.05, 0.05, 0.9, 0x2a2d32, { x: sx * 0.9, y: y0 + 0.45, z: -0.9 * s, rz: -sx * 0.25 });
    body.cyl(0.05, 0.05, 0.9, 0x2a2d32, { x: sx * 0.9, y: y0 + 0.45, z: 0.9 * s, rz: -sx * 0.25 });
  }
  glass.loft([
    { z: -1.85 * s, wTop: 0.28, wBot: 0.2, yTop: 0.98, yBot: 0.4 },
    { z: -1.15 * s, wTop: 1.46, wBot: 0.88, yTop: 1.78, yBot: 0.55 },
    { z: -0.3 * s, wTop: 1.6, wBot: 1.0, yTop: 1.85, yBot: 0.6 },
  ], 0xffffff, { y: y0 + 0.12 });
  if (news) {
    body.sphere(0.34, 0x1a1c20, { y: y0 + 0.5, z: -1.7 * s });
    body.box(0.9, 0.5, 0.06, 0x2f6bb8, { x: 1.0, y: y0 + 1.1, z: 0.1 * s });
    glow.box(0.18, 0.1, 0.18, 0xfff2c0, { x: -0.7, y: y0 + 0.1, z: -1.2 * s });
  }
  glow.box(0.12, 0.12, 0.12, 0xff3030, { y: y0 + 2.95, z: 5.2 * s }).box(0.1, 0.1, 0.1, 0xffffff, { y: y0 + 3.0, z: 0.2 * s });
  const rotor = new Mesher();
  const R = spec.heli!.rotorRadius;
  for (let i = 0; i < 2; i++) rotor.box(R * 2, 0.04, 0.32, i ? 0x15171a : 0x15171a, { y: 0, ry: (i * Math.PI) / 2 + 0.0 });
  rotor.box(R * 2, 0.04, 0.3, 0x15171a, { ry: 0 }).cyl(0.18, 0.18, 0.2, 0x2a2d32);
  const tail = new Mesher();
  tail.box(1.5, 0.05, 0.14, 0x15171a).box(0.05, 1.5, 0.14, 0x15171a);
  return { body, glass, glow, spin: [{ mesh: rotor, axis: 'y', at: [0, y0 + 3.2, 0.2 * s], speed: 'rotor' }, { mesh: tail, axis: 'z', at: [0.2, y0 + 2.3, 5.1 * s], speed: 'tail' }], pilot: figure(0xe8e8e8, y0 + 0.55, -0.6 * s, 0.1) };
}

function plane(spec: CraftSpec, paint: number): Parts {
  const body = new Mesher(), glass = new Mesher(), glow = new Mesher();
  const y0 = -spec.comHeight;
  const id = spec.id;
  const gear = new Mesher();
  const mkGear = (nose: [number, number], main: [number, number], wheelR: number): void => {
    for (const [x, z, n] of [[nose[0], nose[1], true], [-main[0], main[1], false], [main[0], main[1], false]] as const) {
      gear.cyl(wheelR, wheelR, n ? 0.16 : 0.2, 0x15171a, { x, y: y0 - 0.0 + wheelR, z, rz: Math.PI / 2 }, 12);
      gear.cyl(0.04, 0.04, 0.8, 0x6a6e72, { x, y: y0 + wheelR + 0.4, z });
    }
  };
  if (id === 'skylark') {
    body.loft([
      { z: -3.0, wTop: 0.7, wBot: 0.6, yTop: 1.5, yBot: 0.5 },
      { z: -1.8, wTop: 1.15, wBot: 0.95, yTop: 2.1, yBot: 0.35 },
      { z: 0.3, wTop: 1.1, wBot: 0.9, yTop: 2.15, yBot: 0.3 },
      { z: 2.4, wTop: 0.5, wBot: 0.35, yTop: 1.7, yBot: 0.7 },
      { z: 4.1, wTop: 0.14, wBot: 0.12, yTop: 1.6, yBot: 1.0 },
    ], paint, { y: y0 });
    body.box(10.8, 0.14, 1.7, 0xf0ede6, { y: y0 + 2.25, z: -0.3 }); // wing
    body.box(10.8, 0.15, 0.4, 0xc23a2a, { y: y0 + 2.26, z: -1.2 });
    for (const sx of [-1, 1]) body.cyl(0.04, 0.04, 1.5, 0x6a6e72, { x: sx * 1.8, y: y0 + 1.45, z: -0.3, rz: sx * 0.6 }); // struts
    body.box(0.1, 1.5, 1.2, paint, { y: y0 + 2.4, z: 3.8 }); // fin
    body.box(3.4, 0.1, 1.0, paint, { y: y0 + 1.7, z: 3.7 }); // tailplane
    body.cyl(0.55, 0.5, 1.0, 0x2a2d32, { y: y0 + 1.15, z: -3.4, rx: Math.PI / 2 });
    body.box(1.1, 0.12, 6.2, 0x2f6bb8, { y: y0 + 1.5, z: -0.2 });
    glass.box(1.0, 0.55, 1.6, 0xffffff, { y: y0 + 2.2, z: -0.7 });
    glow.box(0.12, 0.12, 0.12, 0xff3030, { x: -5.4, y: y0 + 2.3, z: -0.3 }).box(0.12, 0.12, 0.12, 0x30ff60, { x: 5.4, y: y0 + 2.3, z: -0.3 });
    mkGear([0, -2.2], [1.35, 0.35], 0.28);
    const prop = new Mesher().box(0.12, 1.95, 0.06, 0x15171a).box(0.12, 0.06, 0.06, 0x15171a).sphere(0.18, 0xc23a2a);
    return { body, glass, glow, gear, spin: [{ mesh: prop, axis: 'z', at: [0, y0 + 1.15, -3.95], speed: 'prop' }], pilot: figure(0xe8e8e8, y0 + 0.9, -0.4, 0.05) };
  }
  if (id === 'rook') {
    body.loft([
      { z: -2.4, wTop: 0.7, wBot: 0.6, yTop: 1.3, yBot: 0.35 },
      { z: -1.4, wTop: 1.0, wBot: 0.8, yTop: 1.85, yBot: 0.25 },
      { z: 0.2, wTop: 0.9, wBot: 0.7, yTop: 1.8, yBot: 0.25 },
      { z: 1.9, wTop: 0.4, wBot: 0.3, yTop: 1.45, yBot: 0.55 },
      { z: 3.1, wTop: 0.12, wBot: 0.1, yTop: 1.35, yBot: 0.8 },
    ], paint, { y: y0 });
    body.box(7.4, 0.12, 1.5, paint, { y: y0 + 1.0, z: -0.4 });
    body.box(7.4, 0.13, 0.5, 0x2a2d32, { y: y0 + 1.0, z: -0.95 });
    body.box(7.4, 0.13, 0.28, 0xe8c050, { y: y0 + 1.02, z: 0.0 });
    body.box(0.1, 1.3, 1.1, paint, { y: y0 + 1.9, z: 2.9 });
    body.box(2.8, 0.1, 0.8, paint, { y: y0 + 1.35, z: 2.8 });
    body.cyl(0.52, 0.46, 0.8, 0x2a2d32, { y: y0 + 0.95, z: -2.7, rx: Math.PI / 2 });
    body.box(1.0, 0.1, 5.0, 0xe8c050, { y: y0 + 1.82, z: -0.2 });
    glass.sphere(0.5, 0xffffff, { y: y0 + 1.75, z: -0.4, sy: 0.8, sz: 1.5 });
    glow.box(0.1, 0.1, 0.1, 0xff3030, { x: -3.6, y: y0 + 1.05, z: -0.4 }).box(0.1, 0.1, 0.1, 0x30ff60, { x: 3.6, y: y0 + 1.05, z: -0.4 });
    mkGear([0, -1.9], [1.1, 0.3], 0.24);
    const prop = new Mesher().box(0.11, 1.7, 0.06, 0x15171a).box(0.11, 0.06, 0.06, 0x15171a).sphere(0.16, 0xe8c050);
    return { body, glass, glow, gear, spin: [{ mesh: prop, axis: 'z', at: [0, y0 + 0.95, -3.1], speed: 'prop' }], pilot: figure(0x2a2d32, y0 + 0.8, -0.3, 0.05) };
  }
  // meridian jet
  body.loft([
    { z: -7.4, wTop: 0.15, wBot: 0.12, yTop: 1.2, yBot: 1.0 },
    { z: -5.8, wTop: 1.2, wBot: 1.0, yTop: 2.1, yBot: 0.5 },
    { z: -2.0, wTop: 2.0, wBot: 1.7, yTop: 2.8, yBot: 0.35 },
    { z: 3.5, wTop: 1.9, wBot: 1.6, yTop: 2.7, yBot: 0.4 },
    { z: 6.2, wTop: 0.8, wBot: 0.6, yTop: 2.3, yBot: 1.0 },
    { z: 7.6, wTop: 0.3, wBot: 0.25, yTop: 2.2, yBot: 1.4 },
  ], paint, { y: y0 });
  for (const sx of [-1, 1]) {
    body.box(6.4, 0.16, 2.6, paint, { x: sx * 3.9, y: y0 + 0.95, z: 0.9, ry: -sx * 0.45 }); // swept wings
    body.box(0.12, 0.9, 0.9, 0x1c2a44, { x: sx * 7.2, y: y0 + 1.4, z: 2.6 }); // winglets
    body.cyl(0.55, 0.5, 2.6, 0xcfd2d6, { x: sx * 1.5, y: y0 + 2.1, z: 4.9, rx: Math.PI / 2 }); // engines
    body.cyl(0.35, 0.35, 0.3, 0x15171a, { x: sx * 1.5, y: y0 + 2.1, z: 6.3, rx: Math.PI / 2 });
  }
  body.box(0.14, 2.6, 1.8, paint, { y: y0 + 3.5, z: 7.0 });
  body.box(4.2, 0.12, 1.2, paint, { y: y0 + 4.8, z: 7.2 });
  body.box(2.02, 0.16, 12.5, 0x1c2a44, { y: y0 + 1.5, z: -0.2 });
  glass.box(1.5, 0.5, 1.2, 0xffffff, { y: y0 + 2.4, z: -5.2, rx: -0.5 });
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) glass.box(0.04, 0.3, 0.4, 0xffffff, { x: sx * 1.01, y: y0 + 2.2, z: -3.0 + i * 1.1 });
  glow.box(0.14, 0.14, 0.14, 0xff3030, { x: -7.3, y: y0 + 1.1, z: 2.6 }).box(0.14, 0.14, 0.14, 0x30ff60, { x: 7.3, y: y0 + 1.1, z: 2.6 }).box(0.14, 0.14, 0.14, 0xffffff, { y: y0 + 6.1, z: 7.2 });
  mkGear([0, -5.2], [1.8, 0.8], 0.36);
  return { body, glass, glow, gear, pilot: figure(0x1c2a44, y0 + 1.3, -4.6, 0) };
}


/** Tracked armour: a tank (turret + long gun) or an APC (box hull, small remote turret). */
function ground(spec: CraftSpec, paint: number): Parts {
  const body = new Mesher(), glass = new Mesher(), glow = new Mesher();
  const y0 = -spec.comHeight;
  const apc = spec.id === 'warden';
  const g = spec.ground!;
  const L = spec.size.length;
  const dark = 0x25272a, rubber = 0x1b1c1d;
  const hw = apc ? 1.25 : 1.35;
  const tl = apc ? 5.9 : 7.0;
  // tracks: skirt, running gear and sprockets
  for (const sx of [-1, 1]) {
    body.box(0.8, 0.95, tl, rubber, { x: sx * hw, y: y0 + 0.55 });
    body.box(0.1, apc ? 0.7 : 0.8, tl - 0.4, paint, { x: sx * (hw + 0.45), y: y0 + 0.95 });
    const n = apc ? 5 : 7;
    for (let i = 0; i < n; i++) {
      const z = -tl / 2 + 0.55 + (i * (tl - 1.1)) / (n - 1);
      body.cyl(0.42, 0.42, 0.85, dark, { x: sx * hw, y: y0 + 0.5, z, rz: Math.PI / 2 }, 10);
    }
    body.cyl(0.52, 0.52, 0.85, dark, { x: sx * hw, y: y0 + 0.62, z: tl / 2 - 0.2, rz: Math.PI / 2 }, 10);
    body.cyl(0.5, 0.5, 0.85, dark, { x: sx * hw, y: y0 + 0.62, z: -tl / 2 + 0.2, rz: Math.PI / 2 }, 10);
    body.box(0.9, 0.12, tl + 0.3, dark, { x: sx * hw, y: y0 + 1.05 });
  }
  // hull
  if (apc) {
    body.loft([
      { z: -L / 2, wTop: 1.6, wBot: 2.3, yTop: 1.45, yBot: 0.55 },
      { z: -L / 2 + 1.0, wTop: 2.5, wBot: 2.6, yTop: 2.0, yBot: 0.5 },
      { z: L / 2 - 0.3, wTop: 2.5, wBot: 2.6, yTop: 2.0, yBot: 0.5 },
      { z: L / 2, wTop: 2.4, wBot: 2.5, yTop: 1.9, yBot: 0.6 },
    ], paint, { y: y0 });
    body.box(1.8, 0.1, 2.6, 0x3a3f33, { y: y0 + 2.07, z: 1.2 });
    glass.box(0.9, 0.3, 0.06, 0xffffff, { x: 0.5, y: y0 + 1.75, z: -L / 2 + 1.05 });
    glow.box(0.18, 0.12, 0.06, 0xfff2c0, { x: -0.9, y: y0 + 1.35, z: -L / 2 - 0.02 }).box(0.18, 0.12, 0.06, 0xfff2c0, { x: 0.9, y: y0 + 1.35, z: -L / 2 - 0.02 });
    body.box(1.9, 0.9, 0.12, paint, { y: y0 + 1.3, z: L / 2 + 0.06, rx: -0.15 }); // rear ramp
    body.cyl(0.25, 0.25, 0.4, dark, { x: -0.9, y: y0 + 2.15, z: 2.1 }, 8);
  } else {
    body.loft([
      { z: -L / 2, wTop: 1.6, wBot: 2.5, yTop: 1.2, yBot: 0.62 },
      { z: -L / 2 + 1.4, wTop: 2.7, wBot: 2.8, yTop: 1.55, yBot: 0.55 },
      { z: L / 2 - 1.2, wTop: 2.7, wBot: 2.8, yTop: 1.55, yBot: 0.55 },
      { z: L / 2, wTop: 2.3, wBot: 2.6, yTop: 1.35, yBot: 0.6 },
    ], paint, { y: y0 });
    // engine deck, grilles, spare tracks, stowage
    body.box(2.2, 0.12, 1.8, 0x3a3f33, { y: y0 + 1.61, z: 2.5 });
    body.box(2.4, 0.3, 0.5, dark, { y: y0 + 1.32, z: L / 2 - 0.1 });
    for (const sx of [-1, 1]) body.box(0.5, 0.35, 1.1, 0x5a4e36, { x: sx * 1.3, y: y0 + 1.7, z: 1.0 });
    glow.box(0.2, 0.12, 0.06, 0xfff2c0, { x: -1.0, y: y0 + 1.05, z: -L / 2 - 0.02 }).box(0.2, 0.12, 0.06, 0xfff2c0, { x: 1.0, y: y0 + 1.05, z: -L / 2 - 0.02 });
    glass.box(0.5, 0.18, 0.05, 0xffffff, { y: y0 + 1.3, z: -L / 2 + 0.6, rx: 0.4 });
  }
  glow.box(0.12, 0.12, 0.06, 0xff3030, { x: -0.9, y: y0 + 1.2, z: L / 2 + 0.02 }).box(0.12, 0.12, 0.06, 0xff3030, { x: 0.9, y: y0 + 1.2, z: L / 2 + 0.02 });
  // turret (own mesh, pivots at the turret ring) and gun (own mesh, pitches)
  const t = g.turret;
  const tm = new Mesher();
  if (apc) {
    tm.box(1.3, 0.55, 1.5, paint, { y: 0.15 });
    tm.box(1.1, 0.45, 0.1, 0x2a2d32, { y: 0.25, z: -0.8, rx: 0.3 });
    tm.cyl(0.18, 0.18, 0.3, dark, { x: 0.45, y: 0.55, z: 0.2 }, 8);
    tm.cyl(0.02, 0.02, 1.3, dark, { x: -0.5, y: 1.0, z: 0.6 }, 4);
  } else {
    tm.loft([
      { z: -1.7, wTop: 1.1, wBot: 1.7, yTop: 0.62, yBot: -0.35 },
      { z: -0.5, wTop: 1.9, wBot: 2.3, yTop: 0.82, yBot: -0.35 },
      { z: 1.4, wTop: 2.0, wBot: 2.3, yTop: 0.8, yBot: -0.35 },
      { z: 2.1, wTop: 1.5, wBot: 1.9, yTop: 0.6, yBot: -0.35 },
    ], paint, { y: 0.0 });
    tm.box(1.4, 0.4, 0.5, paint, { y: 0.15, z: -1.85 }); // mantlet
    tm.cyl(0.3, 0.34, 0.28, dark, { x: 0.55, y: 0.95, z: 0.5 }, 8); // commander cupola
    tm.cyl(0.26, 0.26, 0.1, 0x3a3f33, { x: -0.5, y: 0.87, z: 0.6 }, 8); // loader hatch
    tm.box(0.22, 0.22, 0.4, dark, { x: 0.55, y: 1.25, z: 0.3 }); // MG
    tm.cyl(0.015, 0.015, 2.2, dark, { x: -0.85, y: 1.55, z: 1.7 }, 4); // whip aerial
    tm.box(0.9, 0.5, 0.7, 0x4a4f3f, { y: 0.4, z: 2.2 }); // bustle stowage
  }
  const barrel = new Mesher();
  if (apc) {
    barrel.cyl(0.07, 0.07, 1.6, dark, { z: -1.15, rx: Math.PI / 2 }, 8);
    barrel.cyl(0.11, 0.11, 0.4, dark, { z: -0.5, rx: Math.PI / 2 }, 8);
  } else {
    const gl = t.muzzle - 1.2;
    barrel.cyl(0.14, 0.14, gl, dark, { z: -1.2 - gl / 2, rx: Math.PI / 2 }, 10);
    barrel.cyl(0.19, 0.19, 0.7, dark, { z: -2.9, rx: Math.PI / 2 }, 10); // bore evacuator
    barrel.cyl(0.2, 0.2, 0.36, 0x1a1b1d, { z: -t.muzzle + 0.12, rx: Math.PI / 2 }, 10); // muzzle brake
  }
  return { body, glass, glow, turret: { mesh: tm, barrel, at: [t.x, y0 + t.y, t.z] } };
}

/** Build the visual for one craft: merged body / glass / lights meshes, plus animated rotors, props and gear. */
export function createCraftVisual(spec: CraftSpec, paint: number): CraftVisual {
  const parts = spec.kind === 'boat' ? boat(spec, paint) : spec.kind === 'heli' ? heli(spec, paint) : spec.kind === 'ground' ? ground(spec, paint) : plane(spec, paint);
  const group = new THREE.Group();
  const bodyMesh = new THREE.Mesh(parts.body.build(), craftMaterials.body);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  const glassMesh = new THREE.Mesh(parts.glass.empty ? new THREE.BoxGeometry(0.01, 0.01, 0.01) : parts.glass.build(), craftMaterials.glass);
  glassMesh.renderOrder = 3;
  // a mesh with no vertices crashes some GPU back-ends, so an empty lights part becomes a single invisible speck
  const glowMesh = new THREE.Mesh(parts.glow.empty ? new THREE.BoxGeometry(0.01, 0.01, 0.01) : parts.glow.build(), craftMaterials.glow);
  if (parts.glow.empty) glowMesh.visible = false;
  group.add(bodyMesh, glassMesh, glowMesh);
  const meshes: THREE.Mesh[] = [bodyMesh];
  const spinners: { obj: THREE.Mesh; axis: 'y' | 'z'; speed: 'rotor' | 'tail' | 'prop' }[] = [];
  for (const s of parts.spin ?? []) {
    const m = new THREE.Mesh(s.mesh.build(), craftMaterials.body);
    m.position.set(...s.at);
    m.castShadow = false;
    group.add(m);
    spinners.push({ obj: m, axis: s.axis, speed: s.speed });
    meshes.push(m);
  }
  let turretGroup: THREE.Group | null = null;
  let barrelGroup: THREE.Group | null = null;
  if (parts.turret) {
    turretGroup = new THREE.Group();
    turretGroup.position.set(...parts.turret.at);
    const tmesh = new THREE.Mesh(parts.turret.mesh.build(), craftMaterials.body);
    tmesh.castShadow = true;
    barrelGroup = new THREE.Group();
    const bmesh = new THREE.Mesh(parts.turret.barrel.build(), craftMaterials.body);
    bmesh.castShadow = true;
    barrelGroup.add(bmesh);
    turretGroup.add(tmesh, barrelGroup);
    group.add(turretGroup);
    meshes.push(tmesh, bmesh);
  }
  let gearMesh: THREE.Mesh | null = null;
  if (parts.gear) {
    gearMesh = new THREE.Mesh(parts.gear.build(), craftMaterials.body);
    gearMesh.castShadow = false;
    group.add(gearMesh);
    meshes.push(gearMesh);
  }
  let pilotMesh: THREE.Mesh | null = null;
  if (parts.pilot) {
    pilotMesh = new THREE.Mesh(parts.pilot.build(), craftMaterials.body);
    pilotMesh.visible = false;
    group.add(pilotMesh);
  }
  let burnt = false;
  const glowBase = glowMesh;
  const hasGlow = !parts.glow.empty;
  return {
    group,
    update(c: Craft): void {
      if (pilotMesh) pilotMesh.visible = c.occupied && !c.exploded;
      if (turretGroup && barrelGroup) {
        turretGroup.rotation.y = c.turretYaw;
        barrelGroup.rotation.x = c.gunPitch;
        barrelGroup.position.z = c.gunKick * 0.45;
      }
      for (const s of spinners) {
        if (s.speed === 'rotor') s.obj.rotation.y = c.rotorAngle;
        else if (s.speed === 'tail') s.obj.rotation.z = c.rotorAngle * 1.6;
        else s.obj.rotation.z = c.propAngle;
        s.obj.visible = s.speed === 'prop' ? true : true;
      }
      if (gearMesh) {
        gearMesh.scale.y = Math.max(0.02, c.gear);
        gearMesh.position.y = (1 - c.gear) * 0.8 - (1 - c.gear) * 0.0;
        gearMesh.visible = c.gear > 0.04;
      }
      if (c.exploded && !burnt) {
        burnt = true;
        for (const m of meshes) m.material = craftMaterials.burnt;
        glowBase.visible = false;
        if (pilotMesh) pilotMesh.visible = false;
      } else if (!c.exploded && burnt) {
        burnt = false;
        for (const m of meshes) m.material = craftMaterials.body;
        glowBase.visible = hasGlow;
      }
    },
    setNight(): void { /* lights are always-on emissive-looking basics */ },
  };
}
