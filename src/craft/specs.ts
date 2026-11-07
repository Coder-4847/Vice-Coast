export type CraftKind = 'boat' | 'heli' | 'plane' | 'ground';

export interface BoatParams {
  /** Hull draft at rest (m). */
  draft: number;
  /** Top speed (m/s) and initial acceleration (m/s²). */
  vmax: number;
  accel: number;
  /** Max turn rate at speed (rad/s). */
  yawRate: number;
  /** Sideways water resistance (1/s). */
  keel: number;
}

export interface HeliParams {
  climb: number;
  descend: number;
  pitchMax: number;
  rollMax: number;
  yawRate: number;
  /** Quadratic body drag coefficient (per m). */
  drag: number;
  rotorRadius: number;
}

export interface PlaneParams {
  wingArea: number;
  cl0: number;
  clSlope: number;
  clMax: number;
  stallAlpha: number;
  cd0: number;
  kInduced: number;
  thrust: number;
  /** Speed at which prop thrust fades to zero; for jets thrust follows 1 − (v / vmaxThrust)². */
  vmaxThrust: number;
  jet: boolean;
  pitchPower: number;
  rollPower: number;
  yawPower: number;
  /** Speed (m/s) above which controls are fully effective. */
  ctrlSpeed: number;
  stallSpeed: number;
  /** Gear: wheel mounts (x, z) relative to the centre of mass, strut length, spring Hz. */
  gear: { nose: [number, number]; main: [number, number]; strut: number };
  propRadius: number;
  /** Automatic wing levelling when no roll input (0–1). */
  level: number;
}

export interface GroundParams {
  /** Top speed forward / reverse (m/s) and acceleration (m/s²). */
  vmax: number;
  vrev: number;
  accel: number;
  /** Yaw rate at full steer (rad/s). */
  turnRate: number;
  /** Track-contact mounts (x, z) relative to the centre of mass; strut length and static compression (m). */
  mounts: [number, number][];
  strut: number;
  rest: number;
  /** Turret ring position relative to the centre of mass, barrel length, slew rate (rad/s) and gun elevation limits. */
  turret: { x: number; y: number; z: number; muzzle: number; rate: number; pitchMin: number; pitchMax: number };
  /** Main gun (null for the APC) and the machine gun. */
  cannon: { reload: number; damage: number; radius: number } | null;
  mg: { interval: number; damage: number };
}

export interface CraftSpec {
  id: string;
  name: string;
  kind: CraftKind;
  mass: number;
  size: { length: number; width: number; height: number };
  /** Distance from the bottom of the hull / skids to the centre of mass (the body origin). */
  comHeight: number;
  /** Collider box (width, height, length) and its centre height above the bottom. */
  hull: { w: number; h: number; l: number; y: number };
  camera: { distance: number; height: number; lookHeight: number };
  /** Pilot's eye relative to the centre of mass. */
  seat: { x: number; y: number; z: number };
  /** Door side: +1 right, −1 left. */
  doorSide: number;
  boat?: BoatParams;
  heli?: HeliParams;
  plane?: PlaneParams;
  ground?: GroundParams;
  paints: number[];
  /** Min speed / altitude rules for exits are checked by the pilot controller; boats can always be left. */
  maxExitSpeed: number;
}

export const CRAFT: Record<string, CraftSpec> = {
  marlin: {
    id: 'marlin', name: 'Marlin speedboat', kind: 'boat', mass: 1500, size: { length: 7.2, width: 2.5, height: 1.6 }, comHeight: 0.62,
    hull: { w: 2.3, h: 1.1, l: 6.8, y: 0.55 }, camera: { distance: 9, height: 3.2, lookHeight: 1 }, seat: { x: -0.4, y: 0.9, z: -0.4 }, doorSide: -1,
    boat: { draft: 0.5, vmax: 23.5, accel: 7, yawRate: 1.15, keel: 3.2 }, paints: [0xf2f0ea, 0x1f5fa8, 0xc23a2a, 0x2c9a8a], maxExitSpeed: 99,
  },
  zephyr: {
    id: 'zephyr', name: 'Zephyr jet ski', kind: 'boat', mass: 380, size: { length: 3.2, width: 1.2, height: 1.1 }, comHeight: 0.4,
    hull: { w: 1.0, h: 0.6, l: 3.0, y: 0.3 }, camera: { distance: 6, height: 2.4, lookHeight: 0.9 }, seat: { x: 0, y: 0.8, z: 0.3 }, doorSide: -1,
    boat: { draft: 0.28, vmax: 29, accel: 11, yawRate: 1.9, keel: 5 }, paints: [0xf0a020, 0x2a9bc9, 0xe8e8e8, 0xc23a2a], maxExitSpeed: 99,
  },
  gull: {
    id: 'gull', name: 'Gull fishing boat', kind: 'boat', mass: 5200, size: { length: 10.5, width: 3.4, height: 4.6 }, comHeight: 0.9,
    hull: { w: 3.0, h: 1.6, l: 10, y: 0.8 }, camera: { distance: 14, height: 5, lookHeight: 1.6 }, seat: { x: 0, y: 2.4, z: 0.6 }, doorSide: -1,
    boat: { draft: 0.8, vmax: 9, accel: 1.7, yawRate: 0.5, keel: 2.6 }, paints: [0x2a5a7a, 0x8a2a2a, 0x3a6a4a, 0xc9a227], maxExitSpeed: 99,
  },
  aurelia: {
    id: 'aurelia', name: 'Aurelia yacht', kind: 'boat', mass: 24000, size: { length: 17, width: 4.8, height: 6 }, comHeight: 1.2,
    hull: { w: 4.4, h: 2.2, l: 16.4, y: 1.1 }, camera: { distance: 21, height: 7, lookHeight: 2.4 }, seat: { x: 0, y: 3.9, z: -2 }, doorSide: -1,
    boat: { draft: 1.0, vmax: 14, accel: 1.3, yawRate: 0.34, keel: 2.2 }, paints: [0xf4f2ec, 0x1c2a44, 0xe8e0d0], maxExitSpeed: 99,
  },
  sparrow: {
    id: 'sparrow', name: 'Sparrow helicopter', kind: 'heli', mass: 1100, size: { length: 9.2, width: 2.4, height: 3.1 }, comHeight: 0.8,
    hull: { w: 1.9, h: 1.3, l: 4.6, y: 0.75 }, camera: { distance: 13, height: 4.5, lookHeight: 1.2 }, seat: { x: 0.45, y: 0.55, z: -1.2 }, doorSide: 1,
    heli: { climb: 9, descend: 8, pitchMax: 0.42, rollMax: 0.38, yawRate: 1.5, drag: 0.012, rotorRadius: 4.6 }, paints: [0xc23a2a, 0x2f6bb8, 0xf0ede6, 0x3c4a3a], maxExitSpeed: 99,
  },
  newsbird: {
    id: 'newsbird', name: 'Newsbird chopper', kind: 'heli', mass: 1900, size: { length: 11.2, width: 2.8, height: 3.4 }, comHeight: 0.85,
    hull: { w: 2.2, h: 1.5, l: 5.4, y: 0.85 }, camera: { distance: 15, height: 5, lookHeight: 1.4 }, seat: { x: 0.55, y: 0.6, z: -1.5 }, doorSide: 1,
    heli: { climb: 8, descend: 7, pitchMax: 0.38, rollMax: 0.34, yawRate: 1.25, drag: 0.012, rotorRadius: 5.4 }, paints: [0xf0ede6], maxExitSpeed: 99,
  },
  skylark: {
    id: 'skylark', name: 'Skylark prop plane', kind: 'plane', mass: 1100, size: { length: 8.3, width: 10.8, height: 2.7 }, comHeight: 1.15,
    hull: { w: 1.3, h: 1.4, l: 6.2, y: 1.05 }, camera: { distance: 14, height: 4, lookHeight: 1.2 }, seat: { x: -0.45, y: 0.55, z: -0.4 }, doorSide: -1,
    plane: {
      wingArea: 22, cl0: 0.28, clSlope: 5.0, clMax: 1.6, stallAlpha: 0.27, cd0: 0.034, kInduced: 0.05, thrust: 6200, vmaxThrust: 82, jet: false,
      pitchPower: 5.2, rollPower: 5.2, yawPower: 2.2, ctrlSpeed: 30, stallSpeed: 23, gear: { nose: [0, -2.2], main: [1.35, 0.35], strut: 0.9 }, propRadius: 0.95, level: 0.6,
    },
    paints: [0xf0ede6, 0xe8c050, 0x2f6bb8, 0xc23a2a], maxExitSpeed: 6,
  },
  rook: {
    id: 'rook', name: 'Rook stunt plane', kind: 'plane', mass: 720, size: { length: 6.4, width: 7.4, height: 2.3 }, comHeight: 1.0,
    hull: { w: 1.1, h: 1.2, l: 5.0, y: 0.95 }, camera: { distance: 12, height: 3.4, lookHeight: 1.0 }, seat: { x: 0, y: 0.5, z: -0.2 }, doorSide: -1,
    plane: {
      wingArea: 10, cl0: 0.1, clSlope: 4.6, clMax: 1.45, stallAlpha: 0.3, cd0: 0.03, kInduced: 0.06, thrust: 5600, vmaxThrust: 100, jet: false,
      pitchPower: 8, rollPower: 9, yawPower: 3.4, ctrlSpeed: 28, stallSpeed: 25, gear: { nose: [0, -1.9], main: [1.1, 0.3], strut: 0.8 }, propRadius: 0.85, level: 0.15,
    },
    paints: [0xc23a2a, 0xe8c050, 0x2a2d32, 0xf0ede6], maxExitSpeed: 6,
  },
  meridian: {
    id: 'meridian', name: 'Meridian private jet', kind: 'plane', mass: 6500, size: { length: 15.2, width: 14.6, height: 4.4 }, comHeight: 1.7,
    hull: { w: 2.0, h: 2.1, l: 12.5, y: 1.4 }, camera: { distance: 24, height: 6, lookHeight: 1.6 }, seat: { x: -0.4, y: 0.9, z: -4.6 }, doorSide: -1,
    plane: {
      wingArea: 30, cl0: 0.22, clSlope: 5.1, clMax: 1.55, stallAlpha: 0.26, cd0: 0.028, kInduced: 0.05, thrust: 21500, vmaxThrust: 235, jet: true,
      pitchPower: 3.4, rollPower: 3.0, yawPower: 1.4, ctrlSpeed: 52, stallSpeed: 46, gear: { nose: [0, -5.2], main: [1.8, 0.8], strut: 1.1 }, propRadius: 0, level: 0.7,
    },
    paints: [0xf4f2ec, 0x1c2a44], maxExitSpeed: 6,
  },
  bulwark: {
    id: 'bulwark', name: 'Bulwark battle tank', kind: 'ground', mass: 26000, size: { length: 8.2, width: 3.5, height: 2.9 }, comHeight: 1.0,
    hull: { w: 3.2, h: 1.1, l: 7.6, y: 0.95 }, camera: { distance: 15, height: 4.6, lookHeight: 2.0 }, seat: { x: 0, y: 1.9, z: 0.3 }, doorSide: 1,
    ground: {
      vmax: 17, vrev: 7, accel: 6.5, turnRate: 0.95,
      mounts: [[-1.35, -2.5], [1.35, -2.5], [-1.35, 2.5], [1.35, 2.5], [-1.35, 0], [1.35, 0]], strut: 0.7, rest: 0.22,
      turret: { x: 0, y: 1.55, z: 0.2, muzzle: 4.6, rate: 1.1, pitchMin: -0.14, pitchMax: 0.42 },
      cannon: { reload: 3.4, damage: 170, radius: 9.5 }, mg: { interval: 0.085, damage: 26 },
    },
    paints: [0x4d5a3e, 0x6b6a4a, 0x3c4a3a], maxExitSpeed: 4,
  },
  warden: {
    id: 'warden', name: 'Warden APC', kind: 'ground', mass: 11000, size: { length: 6.8, width: 3.0, height: 2.7 }, comHeight: 0.95,
    hull: { w: 2.8, h: 1.5, l: 6.4, y: 1.1 }, camera: { distance: 13, height: 4.2, lookHeight: 1.9 }, seat: { x: 0, y: 1.8, z: -0.6 }, doorSide: 1,
    ground: {
      vmax: 24, vrev: 9, accel: 8, turnRate: 1.25,
      mounts: [[-1.25, -2.2], [1.25, -2.2], [-1.25, 2.2], [1.25, 2.2]], strut: 0.65, rest: 0.2,
      turret: { x: 0, y: 1.95, z: 0.6, muzzle: 2.3, rate: 1.6, pitchMin: -0.12, pitchMax: 0.55 },
      cannon: null, mg: { interval: 0.07, damage: 34 },
    },
    paints: [0x4d5a3e, 0x6b6a4a, 0x3c4a3a], maxExitSpeed: 4,
  },
};
