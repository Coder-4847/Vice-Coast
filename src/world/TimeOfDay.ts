import * as THREE from 'three';
import { clamp } from '../core/math';

const DEG = Math.PI / 180;
/** San Verano sits at Californian latitude; the date is fixed at midsummer-ish for long golden hours. */
const LATITUDE = 34 * DEG;
const DECLINATION = 21 * DEG;

export interface Look {
  /** Pre-tonemap exposure multiplier (eye adaptation approximation). */
  exposure: number;
  /** Colour grade tint (linear multiply). */
  tint: THREE.Color;
  saturation: number;
  bloom: number;
  vignette: number;
  /** Hemisphere "fill" that keeps shadows from crushing to black, as colour × intensity. */
  fillSky: THREE.Color;
  fillGround: THREE.Color;
  fillIntensity: number;
  /** Image-based-lighting intensity. */
  envIntensity: number;
  /** 0 at noon … 1 in full darkness. */
  night: number;
  /** 1 near sunrise/sunset. */
  twilight: number;
}

interface Key {
  elev: number; // sun elevation, degrees
  exposure: number;
  tint: [number, number, number];
  sat: number;
  bloom: number;
  vignette: number;
  fillSky: [number, number, number];
  fillGround: [number, number, number];
  fill: number;
  env: number;
}

/**
 * Per-time-of-day look, keyed by sun elevation so dawn and dusk share one table.
 * Values are art-directed against the physical sky; tweak these to change the mood.
 */
const KEYS: Key[] = [
  { elev: -18, exposure: 2.6, tint: [0.80, 0.93, 1.22], sat: 0.80, bloom: 0.9, vignette: 0.38, fillSky: [0.10, 0.16, 0.34], fillGround: [0.03, 0.04, 0.08], fill: 0.55, env: 1.0 },
  { elev: -7, exposure: 1.9, tint: [0.92, 0.88, 1.12], sat: 0.95, bloom: 0.8, vignette: 0.34, fillSky: [0.20, 0.20, 0.42], fillGround: [0.06, 0.05, 0.09], fill: 0.55, env: 1.0 },
  { elev: -1.5, exposure: 1.35, tint: [1.12, 0.92, 0.92], sat: 1.12, bloom: 0.6, vignette: 0.32, fillSky: [0.45, 0.30, 0.45], fillGround: [0.15, 0.08, 0.08], fill: 0.4, env: 1.0 },
  { elev: 4, exposure: 1.05, tint: [1.10, 0.95, 0.86], sat: 1.18, bloom: 0.45, vignette: 0.30, fillSky: [0.55, 0.40, 0.42], fillGround: [0.22, 0.12, 0.10], fill: 0.25, env: 1.0 },
  { elev: 12, exposure: 0.95, tint: [1.05, 0.98, 0.92], sat: 1.12, bloom: 0.3, vignette: 0.26, fillSky: [0.60, 0.60, 0.70], fillGround: [0.25, 0.20, 0.18], fill: 0.12, env: 1.0 },
  { elev: 35, exposure: 0.90, tint: [1.0, 1.0, 1.0], sat: 1.05, bloom: 0.18, vignette: 0.22, fillSky: [0.60, 0.68, 0.85], fillGround: [0.28, 0.25, 0.22], fill: 0.06, env: 1.0 },
  { elev: 70, exposure: 0.88, tint: [1.0, 1.0, 1.0], sat: 1.04, bloom: 0.18, vignette: 0.2, fillSky: [0.60, 0.70, 0.90], fillGround: [0.30, 0.27, 0.24], fill: 0.05, env: 1.0 },
];

const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export class TimeOfDay {
  /** Hours 0–24. */
  hour = 18.6;
  /** Game seconds per real second. 30 ≈ one 24 h day every 48 real minutes (GTA-like). */
  speed = 30;
  paused = false;

  readonly sunDir = new THREE.Vector3(0, 1, 0);
  readonly moonDir = new THREE.Vector3(0, -1, 0);
  /** Sun elevation in degrees. */
  sunElev = 45;
  readonly look: Look = {
    exposure: 1, tint: new THREE.Color(1, 1, 1), saturation: 1, bloom: 0.25, vignette: 0.25,
    fillSky: new THREE.Color(), fillGround: new THREE.Color(), fillIntensity: 0.1, envIntensity: 1,
    night: 0, twilight: 0,
  };

  constructor() {
    this.compute();
  }

  advance(realDt: number): void {
    if (this.paused) return;
    this.hour = (this.hour + (realDt * this.speed) / 3600) % 24;
    this.compute();
  }

  setHour(h: number): void {
    this.hour = ((h % 24) + 24) % 24;
    this.compute();
  }

  /** "6:30 PM" */
  get clock(): string {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    const ap = h >= 12 ? 'PM' : 'AM';
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`;
  }

  /** Direction to a body (x east, y up, z south) from its hour angle and declination. */
  private body(hourAngle: number, dec: number, out: THREE.Vector3): number {
    const sinEl = Math.sin(LATITUDE) * Math.sin(dec) + Math.cos(LATITUDE) * Math.cos(dec) * Math.cos(hourAngle);
    const el = Math.asin(clamp(sinEl, -1, 1));
    // Azimuth measured from south, positive toward the west.
    const A = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(LATITUDE) - Math.tan(dec) * Math.cos(LATITUDE));
    out.set(-Math.sin(A) * Math.cos(el), Math.sin(el), Math.cos(A) * Math.cos(el));
    return el;
  }

  private compute(): void {
    const H = (this.hour - 12) * 15 * DEG;
    const el = this.body(H, DECLINATION, this.sunDir);
    this.sunElev = el / DEG;
    this.body(H + (180 - 50) * DEG, 12 * DEG, this.moonDir);

    const e = this.sunElev;
    // Piecewise-linear interpolation of the key table.
    let i = 0;
    while (i < KEYS.length - 2 && e > KEYS[i + 1]!.elev) i++;
    const a = KEYS[i]!;
    const b = KEYS[i + 1]!;
    const t = clamp((e - a.elev) / (b.elev - a.elev), 0, 1);
    const L = this.look;
    const mix = (x: number, y: number) => x + (y - x) * t;
    L.exposure = mix(a.exposure, b.exposure);
    L.tint.setRGB(mix(a.tint[0], b.tint[0]), mix(a.tint[1], b.tint[1]), mix(a.tint[2], b.tint[2]));
    L.saturation = mix(a.sat, b.sat);
    L.bloom = mix(a.bloom, b.bloom);
    L.vignette = mix(a.vignette, b.vignette);
    L.fillSky.setRGB(mix(a.fillSky[0], b.fillSky[0]), mix(a.fillSky[1], b.fillSky[1]), mix(a.fillSky[2], b.fillSky[2]));
    L.fillGround.setRGB(mix(a.fillGround[0], b.fillGround[0]), mix(a.fillGround[1], b.fillGround[1]), mix(a.fillGround[2], b.fillGround[2]));
    L.fillIntensity = mix(a.fill, b.fill);
    L.envIntensity = mix(a.env, b.env);
    L.night = 1 - smooth(-14, 0, e);
    L.twilight = smooth(-16, -2, e) * (1 - smooth(-2, 14, e));
  }
}

/**
 * Transmittance of sunlight through the atmosphere at a given sun elevation (degrees), using the same
 * Rayleigh/Mie coefficients as the sky shader. Gives the physically-plausible orange of a low sun.
 */
export function sunTransmittance(elevDeg: number, turbidity: number, out: THREE.Color): THREE.Color {
  const zen = clamp(90 - elevDeg, 0, 91.5);
  const inv = 1 / (Math.cos(zen * DEG) + 0.15 * Math.pow(93.885 - zen, -1.253));
  const sR = 8.4e3 * inv;
  const sM = 1.25e3 * inv;
  const betaR = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
  const c = 0.2 * turbidity * 1e-17;
  const betaM = [0.434 * c * 1.8399918514433978e14, 0.434 * c * 2.7798023919660528e14, 0.434 * c * 4.0790479543861094e14];
  const mie = 0.005;
  return out.setRGB(
    Math.exp(-(betaR[0]! * sR + betaM[0]! * mie * sM)),
    Math.exp(-(betaR[1]! * sR + betaM[1]! * mie * sM)),
    Math.exp(-(betaR[2]! * sR + betaM[2]! * mie * sM)),
  );
}
