/**
 * Data-driven vehicle definitions. Everything that distinguishes one vehicle from another lives here:
 * physics (mass, grip, engine, gearing, suspension), handling assists, and the parameters for the procedural
 * model. Adding a car means adding an entry — no code changes.
 *
 * Vehicle-local axes: +X right, +Y up, −Z forward (same as the camera). Units are SI (metres, kilograms, newtons).
 */

export type DriveType = 'fwd' | 'rwd' | 'awd';

export interface EngineSpec {
  idleRpm: number;
  redlineRpm: number;
  peakTorque: number;
  peakTorqueRpm: number;
  /** Relative gear ratios, first … top. The final drive is derived from `topSpeedKmh`. */
  gears: number[];
  reverseRatio: number;
  topSpeedKmh: number;
  /** Cylinders, for the engine sound's firing frequency. */
  cylinders: number;
  turbo?: boolean;
}

export interface BodyStyle {
  /** Side-silhouette of the lower body, front → back, in (z-from-front, height) metres; see CarModel. */
  kind: 'hatch' | 'sedan' | 'muscle' | 'super' | 'pickup' | 'bike';
  color: string;
  /** Secondary colour (roof, stripes, trim). */
  accent: string;
  /** Livery text drawn on the doors, if any. */
  livery?: string;
  glassTint: string;
  metallic: number;
  roughness: number;
  /** Convertible roof etc. may be added later. */
}

export interface VehicleSpec {
  id: string;
  name: string;
  kind: 'car' | 'bike';
  mass: number;
  /** Chassis collision box (full extents). */
  size: { length: number; width: number; height: number };
  wheelbase: number;
  track: number;
  wheelRadius: number;
  wheelWidth: number;
  /** Ground clearance under the chassis box, metres. */
  clearance: number;
  /** Height of the centre of mass above the ground at rest, metres. */
  comHeight: number;
  drive: DriveType;
  engine: EngineSpec;
  suspension: {
    rest: number;
    travel: number;
    /** Ride frequency (Hz) front/rear; stiffness is derived from the static load. */
    frontHz: number;
    rearHz: number;
    dampingRatio: number;
    antiRoll: number;
  };
  brake: { force: number; frontBias: number };
  grip: {
    /** Friction coefficients on dry asphalt. */
    long: number;
    lat: number;
    /** Pacejka-ish stiffness: higher = snappier turn-in. */
    stiffness: number;
    /** How much off-road surfaces hurt grip (1 = full penalty, 0 = none). */
    offroad: number;
    /** Front lateral grip multiplier: >1 = stable/understeer, <1 = loose/oversteer. */
    balance: number;
  };
  steer: { maxDeg: number; highSpeedDeg: number; rate: number; centering: number };
  aero: { drag: number; downforce: number };
  handbrake: { rearLatMul: number };
  assist: { counterSteer: number; yawDamp: number };
  body: BodyStyle;
  /** Seat / camera anchors (vehicle-local). */
  seat: { x: number; y: number; z: number };
  /** Driver door hinge side: −1 left, +1 right (cars are left-hand drive on the right-hand lane). */
  doorSide: -1 | 1;
  camera: { distance: number; height: number; lookHeight: number };
  /** Rated cost / label for later phases. */
  price: number;
}

export const VEHICLES: Record<string, VehicleSpec> = {
  pico: {
    id: 'pico', name: 'Ardent Pico', kind: 'car', mass: 1050,
    size: { length: 3.75, width: 1.68, height: 1.27 }, wheelbase: 2.45, track: 1.44, wheelRadius: 0.29, wheelWidth: 0.19,
    clearance: 0.18, comHeight: 0.52, drive: 'fwd',
    engine: { idleRpm: 900, redlineRpm: 6600, peakTorque: 205, peakTorqueRpm: 3900, gears: [3.6, 2.15, 1.45, 1.05, 0.82], reverseRatio: 3.4, topSpeedKmh: 172, cylinders: 4 },
    suspension: { rest: 0.22, travel: 0.2, frontHz: 1.5, rearHz: 1.6, dampingRatio: 0.62, antiRoll: 5200 },
    brake: { force: 11500, frontBias: 0.62 },
    grip: { long: 1.05, lat: 1.0, stiffness: 9.5, offroad: 0.6, balance: 1.05 },
    steer: { maxDeg: 34, highSpeedDeg: 8, rate: 3.6, centering: 5 },
    aero: { drag: 0.34, downforce: 0 }, handbrake: { rearLatMul: 0.42 }, assist: { counterSteer: 0.55, yawDamp: 0.25 },
    body: { kind: 'hatch', color: '#d94b2b', accent: '#1d1f24', glassTint: '#0b1219', metallic: 0.55, roughness: 0.32 },
    seat: { x: -0.36, y: 0.12, z: 0.05 }, doorSide: -1, camera: { distance: 6.2, height: 2.0, lookHeight: 0.9 }, price: 14000,
  },
  marlow: {
    id: 'marlow', name: 'Marlow Taxi', kind: 'car', mass: 1520,
    size: { length: 4.7, width: 1.82, height: 1.25 }, wheelbase: 2.82, track: 1.56, wheelRadius: 0.33, wheelWidth: 0.22,
    clearance: 0.17, comHeight: 0.55, drive: 'rwd',
    engine: { idleRpm: 800, redlineRpm: 6300, peakTorque: 360, peakTorqueRpm: 3600, gears: [3.4, 2.1, 1.45, 1.05, 0.82, 0.68], reverseRatio: 3.3, topSpeedKmh: 205, cylinders: 6 },
    suspension: { rest: 0.24, travel: 0.22, frontHz: 1.25, rearHz: 1.35, dampingRatio: 0.7, antiRoll: 6500 },
    brake: { force: 15500, frontBias: 0.6 },
    grip: { long: 1.05, lat: 1.0, stiffness: 9, offroad: 0.6, balance: 1.05 },
    steer: { maxDeg: 33, highSpeedDeg: 7, rate: 3.3, centering: 4.5 },
    aero: { drag: 0.3, downforce: 0 }, handbrake: { rearLatMul: 0.45 }, assist: { counterSteer: 0.5, yawDamp: 0.3 },
    body: { kind: 'sedan', color: '#f2c230', accent: '#15171b', livery: 'TAXI', glassTint: '#0b1118', metallic: 0.4, roughness: 0.34 },
    seat: { x: -0.4, y: 0.16, z: 0.2 }, doorSide: -1, camera: { distance: 6.8, height: 2.1, lookHeight: 0.95 }, price: 28000,
  },
  barrage: {
    id: 'barrage', name: 'Barrage GT', kind: 'car', mass: 1750,
    size: { length: 4.9, width: 1.9, height: 1.15 }, wheelbase: 2.78, track: 1.6, wheelRadius: 0.345, wheelWidth: 0.28,
    clearance: 0.15, comHeight: 0.5, drive: 'rwd',
    engine: { idleRpm: 750, redlineRpm: 6200, peakTorque: 690, peakTorqueRpm: 4300, gears: [3.1, 2.05, 1.45, 1.05, 0.8, 0.65], reverseRatio: 3.2, topSpeedKmh: 245, cylinders: 8 },
    suspension: { rest: 0.22, travel: 0.2, frontHz: 1.35, rearHz: 1.5, dampingRatio: 0.65, antiRoll: 7800 },
    brake: { force: 18500, frontBias: 0.62 },
    grip: { long: 1.08, lat: 0.98, stiffness: 8.2, offroad: 0.6, balance: 1.05 },
    steer: { maxDeg: 30, highSpeedDeg: 6, rate: 3.1, centering: 4 },
    aero: { drag: 0.36, downforce: 0.15 }, handbrake: { rearLatMul: 0.4 }, assist: { counterSteer: 0.42, yawDamp: 0.18 },
    body: { kind: 'muscle', color: '#1f4fa8', accent: '#f1efe8', glassTint: '#0a1016', metallic: 0.6, roughness: 0.28 },
    seat: { x: -0.4, y: 0.1, z: 0.3 }, doorSide: -1, camera: { distance: 7.0, height: 2.0, lookHeight: 0.85 }, price: 54000,
  },
  veloce: {
    id: 'veloce', name: 'Veloce SR', kind: 'car', mass: 1380,
    size: { length: 4.55, width: 1.95, height: 1.0 }, wheelbase: 2.65, track: 1.66, wheelRadius: 0.34, wheelWidth: 0.3,
    clearance: 0.11, comHeight: 0.44, drive: 'rwd',
    engine: { idleRpm: 1000, redlineRpm: 8600, peakTorque: 640, peakTorqueRpm: 5600, gears: [3.2, 2.2, 1.65, 1.3, 1.05, 0.88, 0.74], reverseRatio: 3.0, topSpeedKmh: 325, cylinders: 10, turbo: false },
    suspension: { rest: 0.18, travel: 0.16, frontHz: 1.9, rearHz: 2.0, dampingRatio: 0.72, antiRoll: 9500 },
    brake: { force: 24000, frontBias: 0.58 },
    grip: { long: 1.45, lat: 1.5, stiffness: 11, offroad: 0.7, balance: 1.12 },
    steer: { maxDeg: 28, highSpeedDeg: 5, rate: 3.8, centering: 5.5 },
    aero: { drag: 0.3, downforce: 0.9 }, handbrake: { rearLatMul: 0.3 }, assist: { counterSteer: 0.7, yawDamp: 0.35 },
    body: { kind: 'super', color: '#e8e9ec', accent: '#c4202c', glassTint: '#080d12', metallic: 0.8, roughness: 0.2 },
    seat: { x: -0.4, y: 0.06, z: 0.0 }, doorSide: -1, camera: { distance: 6.4, height: 1.8, lookHeight: 0.7 }, price: 240000,
  },
  ridgeback: {
    id: 'ridgeback', name: 'Ridgeback 4x4', kind: 'car', mass: 2150,
    size: { length: 5.2, width: 2.0, height: 1.5 }, wheelbase: 3.1, track: 1.7, wheelRadius: 0.4, wheelWidth: 0.28,
    clearance: 0.3, comHeight: 0.82, drive: 'awd',
    engine: { idleRpm: 800, redlineRpm: 5800, peakTorque: 560, peakTorqueRpm: 3200, gears: [3.9, 2.3, 1.5, 1.05, 0.8, 0.65], reverseRatio: 3.6, topSpeedKmh: 185, cylinders: 6 },
    suspension: { rest: 0.34, travel: 0.32, frontHz: 1.15, rearHz: 1.2, dampingRatio: 0.7, antiRoll: 7000 },
    brake: { force: 21000, frontBias: 0.6 },
    grip: { long: 1.0, lat: 0.95, stiffness: 8, offroad: 0.15, balance: 1.05 },
    steer: { maxDeg: 33, highSpeedDeg: 8, rate: 3.2, centering: 4 },
    aero: { drag: 0.42, downforce: 0 }, handbrake: { rearLatMul: 0.5 }, assist: { counterSteer: 0.6, yawDamp: 0.4 },
    body: { kind: 'pickup', color: '#3d5a3a', accent: '#1b1d1f', glassTint: '#0a1117', metallic: 0.35, roughness: 0.45 },
    seat: { x: -0.42, y: 0.4, z: 0.45 }, doorSide: -1, camera: { distance: 7.6, height: 2.6, lookHeight: 1.2 }, price: 46000,
  },
  sparrow: {
    id: 'sparrow', name: 'Sparrow 600', kind: 'bike', mass: 215,
    size: { length: 2.0, width: 0.62, height: 0.9 }, wheelbase: 1.42, track: 0, wheelRadius: 0.31, wheelWidth: 0.16,
    clearance: 0.2, comHeight: 0.58, drive: 'rwd',
    engine: { idleRpm: 1300, redlineRpm: 13000, peakTorque: 68, peakTorqueRpm: 9500, gears: [3.0, 2.15, 1.7, 1.4, 1.2, 1.05], reverseRatio: 0, topSpeedKmh: 250, cylinders: 4 },
    suspension: { rest: 0.16, travel: 0.14, frontHz: 2.0, rearHz: 2.1, dampingRatio: 0.6, antiRoll: 0 },
    brake: { force: 4200, frontBias: 0.68 },
    grip: { long: 1.25, lat: 1.3, stiffness: 11, offroad: 0.5, balance: 1.05 },
    steer: { maxDeg: 30, highSpeedDeg: 4, rate: 4.2, centering: 5 },
    aero: { drag: 0.5, downforce: 0 }, handbrake: { rearLatMul: 0.5 }, assist: { counterSteer: 0.4, yawDamp: 0.5 },
    body: { kind: 'bike', color: '#0e7c86', accent: '#16181c', glassTint: '#0b1219', metallic: 0.6, roughness: 0.3 },
    seat: { x: 0, y: 0.32, z: 0.15 }, doorSide: -1, camera: { distance: 4.6, height: 1.6, lookHeight: 0.9 }, price: 9500,
  },
};

export const VEHICLE_IDS = Object.keys(VEHICLES);
