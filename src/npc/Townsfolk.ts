import { GEO } from '../world/heightfield';
import { CINDER_O, CINDER_YAW } from '../world/towns/layouts';
import { hash2, mulberry32 } from '../world/city/plan';
import type { Arch, Ped, Pedestrians } from './Pedestrians';

interface Spot { x: number; z: number; arch: Arch; yaw: number; beach?: boolean; night?: boolean; ped: Ped | null; id: number }

/**
 * The people who live in the towns outside Port Valeria, which have no sidewalk graph of their own: fixed spots (market
 * stalls, the seafront, a biker-bar patio, the marina) are filled with loiterers while the player is near, and emptied again
 * when they leave. Each loiterer reacts like any other pedestrian — flees, films, gets knocked down.
 */
export class Townsfolk {
  private readonly spots: Spot[] = [];
  private t = 0;

  constructor() {
    const r = mulberry32(hash2(5, 9, 2));
    const cluster = (cx: number, cz: number, rad: number, n: number, arches: Arch[], opts: { beach?: boolean; night?: boolean; face?: number } = {}): void => {
      for (let i = 0; i < n; i++) {
        const a = r() * 6.2832, d = Math.sqrt(r()) * rad;
        this.spots.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, arch: arches[Math.floor(r() * arches.length)]!, yaw: opts.face ?? r() * 6.2832, beach: opts.beach, night: opts.night, ped: null, id: -1 });
      }
    };
    // Costa Merida
    cluster(420, 3215, 26, 14, ['tourist', 'local', 'stroller', 'kid']);
    cluster(420, 3430, 20, 8, ['tourist', 'local', 'stroller']);
    for (const z of [3120, 3200, 3290, 3400, 3500, 3580]) cluster(122, z, 8, 3, ['tourist', 'jogger', 'stroller'], { beach: true });
    cluster(74, 3340, 40, 10, ['sunbather', 'tourist', 'kid'], { beach: true });
    cluster(630, 3330, 20, 8, ['party', 'tourist', 'local'], { night: true });
    cluster(215, 3340, 70, 8, ['stroller', 'local']);
    cluster(660, 3470, 80, 8, ['local', 'stroller', 'tourist']);
    // Pinecrest Bay
    cluster(700, -2260, 18, 10, ['local', 'kid', 'stroller']);
    cluster(556, -2320, 18, 7, ['worker', 'local']);
    cluster(650, -2330, 40, 8, ['local', 'stroller']);
    cluster(960, -2255, 24, 8, ['worker']);
    cluster(GEO.pinecrest.lighthouse.x + 22, GEO.pinecrest.lighthouse.z + 10, 8, 2, ['tourist']);
    // Cinder Flats
    const [ox, oz] = CINDER_O, y = CINDER_YAW;
    const L = (u: number, v: number): [number, number] => [ox + u * Math.cos(y) - v * Math.sin(y), oz + u * Math.sin(y) + v * Math.cos(y)];
    cluster(...L(96, -34), 9, 8, ['local', 'drunk', 'worker']);
    cluster(...L(-66, -34), 7, 5, ['local', 'tourist']);
    cluster(...L(-176, -30), 8, 4, ['local', 'worker']);
    cluster(...L(132, 82), 16, 6, ['worker', 'local']);
    cluster(...L(-90, 75), 40, 6, ['local', 'kid']);
    // Dusk Harbor
    cluster(640, 1760, 90, 12, ['worker']);
    cluster(430, 1700, 40, 6, ['worker']);
    // Mount Kestrel
    cluster(1090, -1670, 24, 8, ['tourist', 'kid', 'local']);
    cluster(GEO.kestrel.summit.x - 18, GEO.kestrel.summit.z + 30, 14, 8, ['tourist', 'tourist', 'kid']);
    cluster(GEO.lake.x + 150, GEO.lake.z + 60, 14, 5, ['tourist', 'local']);
  }

  update(dt: number, peds: Pedestrians, fx: number, fz: number, hour: number): void {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.6;
    const night = hour >= 20 || hour < 5;
    let placed = 0;
    for (const s of this.spots) {
      const d = Math.hypot(s.x - fx, s.z - fz);
      const mine = s.ped && s.ped.active && s.ped.id === s.id && s.ped.state !== 'down';
      if (mine) {
        if (d > 320) { s.ped!.active = false; s.ped = null; }
        continue;
      }
      if (s.ped && s.ped.id !== s.id) s.ped = null; // recycled or knocked down: spot is free again after a pause
      if (d > 200 || d < 14 || placed >= 3) continue;
      if (s.night === true && !night) continue;
      if (s.night === undefined && hour >= 22 && hash2(Math.round(s.x), Math.round(s.z), 1) % 3 !== 0) continue;
      const p = peds.place(s.x, s.z, s.arch, s.arch === 'sunbather' ? 'idle' : 'stand', s.yaw, s.beach ? 'beach' : 'boardwalk');
      if (p) { s.ped = p; s.id = p.id; placed++; }
    }
  }
}
