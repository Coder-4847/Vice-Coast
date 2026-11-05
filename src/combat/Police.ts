import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AudioEngine } from '../audio/AudioEngine';
import { GROUP, type Physics } from '../physics/Physics';
import type { Npcs } from '../npc/Npcs';
import type { Ped, Role } from '../npc/Pedestrians';
import { CAR_TYPES, type CarType, type TrafficCar } from '../npc/Traffic';
import type { Player } from '../player/Player';
import type { CombatHud } from '../ui/CombatHud';
import type { Driving } from '../vehicles/Driving';
import type { VehicleManager } from '../vehicles/VehicleManager';
import type { Effects } from '../world/Effects';
import { CITY, terrainHeight } from '../world/Terrain';
import type { World } from '../world/World';
import { Heli, Jet, type HeliKind } from './Aircraft';
import type { Combat } from './Combat';
import { STAR_NAMES, type Wanted } from './Wanted';

const G: number = CITY.height;
const TYPE = Object.fromEntries(CAR_TYPES.map((t) => [t.id, t])) as Record<string, CarType>;

interface Tier {
  patrol: number; swat: number; armored: number; fed: number; apc: number; tank: number;
  heli: HeliKind[]; snipers: number; blocks: number; blockSize: number; strips: number; jets: boolean; footCap: number;
}
const T0: Tier = { patrol: 0, swat: 0, armored: 0, fed: 0, apc: 0, tank: 0, heli: [], snipers: 0, blocks: 0, blockSize: 0, strips: 0, jets: false, footCap: 0 };
const TIERS: Tier[] = [
  T0,
  { ...T0, patrol: 2, footCap: 6 },
  { ...T0, patrol: 4, blocks: 1, blockSize: 2, strips: 1, footCap: 8 },
  { ...T0, patrol: 4, swat: 1, heli: ['police'], blocks: 1, blockSize: 2, strips: 1, footCap: 10 },
  { ...T0, patrol: 5, swat: 2, armored: 1, heli: ['police'], snipers: 2, blocks: 2, blockSize: 3, strips: 1, footCap: 12 },
  { ...T0, patrol: 3, swat: 2, armored: 1, fed: 3, heli: ['gunship'], blocks: 2, blockSize: 4, strips: 2, footCap: 14 },
  { ...T0, swat: 2, fed: 2, apc: 2, tank: 2, heli: ['attack', 'attack', 'gunship'], snipers: 1, jets: true, footCap: 12 },
];

interface Spec { dmg: number; interval: number; range: number; spread: number; pellets: number; burst: number; speed: number; sight: number; pause?: number }
const PISTOL: Spec = { dmg: 5, interval: 1.0, range: 36, spread: 0.05, pellets: 1, burst: 1, speed: 4.4, sight: 70 };
const SHOTGUN: Spec = { dmg: 3.5, interval: 1.7, range: 22, spread: 0.08, pellets: 7, burst: 1, speed: 4.6, sight: 60 };
const RIFLE: Spec = { dmg: 4, interval: 0.17, range: 58, spread: 0.05, pellets: 1, burst: 3, pause: 1.4, speed: 4.2, sight: 90 };
const HEAVY: Spec = { dmg: 5, interval: 0.15, range: 66, spread: 0.045, pellets: 1, burst: 4, pause: 1.3, speed: 3.8, sight: 100 };
const FED: Spec = { dmg: 5.5, interval: 0.16, range: 76, spread: 0.035, pellets: 1, burst: 3, pause: 1.1, speed: 4.8, sight: 110 };

interface Strip { x: number; z: number; yaw: number; half: number; mesh: THREE.Mesh }
interface Sniper { ped: Ped; charge: number; laser: THREE.Mesh }
interface Pending { t: number; x: number; y: number; z: number; r: number; dmg: number }

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _a = new THREE.Vector3();
const gauss = (): number => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;

export interface PoliceDeps {
  world: World;
  physics: Physics;
  audio: AudioEngine;
  effects: Effects;
  player: Player;
  driving: Driving;
  vehicles: VehicleManager;
  npcs: Npcs;
  combat: Combat;
  wanted: Wanted;
  hud: CombatHud;
  camera: THREE.PerspectiveCamera;
}

/**
 * The police director. It reads the wanted level and keeps the right response on the streets: patrol cars that chase and
 * disgorge officers, roadblocks and spike strips ahead of you, SWAT vans, helicopters with searchlights, snipers on roofs,
 * armoured trucks that ram, federal agents, gunships, and finally tanks, APCs, attack helicopters and fighter-jet strikes.
 * Officers on foot are ordinary pedestrians with a combat AI; vehicles are traffic cars in pursuit mode.
 */
export class Police {
  readonly cars = new Set<TrafficCar>();
  readonly foot = new Set<Ped>();
  readonly helis: Heli[] = [];
  readonly jets: Jet[] = [];
  readonly snipers: Sniper[] = [];
  readonly strips: Strip[] = [];
  readonly blocks: TrafficCar[] = [];
  stats = { cars: 0, foot: 0, helis: 0, snipers: 0, blocks: 0, strips: 0, jets: 0, shots: 0, hitsOnPlayer: 0 };

  private readonly spec = new WeakMap<Ped, Spec>();
  private readonly pending: Pending[] = [];
  private readonly group = new THREE.Group();
  private readonly stripMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5, metalness: 0.8 });
  private readonly stripGeo: THREE.BufferGeometry;
  private readonly laserMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.15, 0.1), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  private spawnT = 0;
  private routeT = 0;
  private seenT = 0;
  private arrestT = 0;
  private jetT = 14;
  private shotsThisFrame = 0;
  private lastSeen = false;
  private blockT = 6;
  private stripT = 8;
  private sniperT = 5;
  private nodeCache = 0;
  private readonly roofCache = new Map<string, { x: number; y: number; z: number }[]>();
  private tgt = { x: 0, y: 0, z: 0, vx: 0, vz: 0, car: false, speed: 0 };
  private unlocked = 0;

  constructor(private readonly d: PoliceDeps) {
    // spike strip: a flat bar with a row of teeth
    const parts: THREE.BufferGeometry[] = [new THREE.BoxGeometry(1, 0.05, 0.5).translate(0, 0.025, 0)];
    for (let i = 0; i < 18; i++) parts.push(new THREE.ConeGeometry(0.025, 0.13, 4).translate((i / 17 - 0.5) * 0.96, 0.11, 0));
    this.stripGeo = mergeGeometries(parts)!;
    d.world.scene.add(this.group);
    d.world.rig.register(this.stripMat);
    d.wanted.onChange = (s, prev) => this.onStars(s, prev);
    d.combat.crime = (w, x, z, o) => this.crime(w, x, z, o);
    d.combat.onRespawn = () => { d.wanted.clear(); this.release(true); };
    const hooks = d.npcs.peds.hooks!;
    const prevHooks = { ...hooks };
    hooks.hit = (p, byPlayer) => {
      if (!byPlayer) return;
      this.crime(p.role === 'civ' ? 7 : 10, p.x, p.z, { cop: p.role !== 'civ' });
    };
    hooks.killed = (p, byPlayer) => {
      if (!byPlayer) return;
      this.crime(p.role === 'civ' ? 28 : 85, p.x, p.z, { cop: p.role !== 'civ' });
    };
    void prevHooks;
    // vehicle crashes into traffic caused by the player
    const tc = d.npcs.traffic.hooks!;
    const oldCrash = tc.crash;
    tc.crash = (x, z, s) => {
      oldCrash(x, z, s);
      this.crime(5 + s * 12, x, z);
    };
  }

  // ----------------------------------------------------------------------------------------- crimes

  /** A crime happened at (x, z). Witnesses (nearby pedestrians, officers) decide whether it counts in full. */
  crime(weight: number, x: number, z: number, o?: { cop?: boolean }): void {
    const { npcs, wanted } = this.d;
    let witnessed = !!o?.cop;
    if (!witnessed) {
      for (const p of npcs.peds.peds) {
        if (!p.active || p.state === 'down') continue;
        if (p.role !== 'civ') { if (Math.hypot(p.x - x, p.z - z) < 90) { witnessed = true; break; } continue; }
        if (Math.hypot(p.x - x, p.z - z) < 32) { witnessed = true; break; }
      }
      if (!witnessed && this.helis.length) witnessed = true;
    }
    this.d.combat.byPlayerRecently = true;
    window.setTimeout(() => { this.d.combat.byPlayerRecently = false; }, 4000);
    wanted.report(weight, x, z, witnessed);
  }

  private onStars(s: number, prev: number): void {
    const { hud, world, audio } = this.d;
    audio.radioChirp();
    if (s > prev) {
      const t = this.tgt;
      const street = world.city.plan.streetAt(t.x, t.z);
      const where = street ? ` near ${street}` : '';
      const lines = [
        '',
        `All units: suspect wanted for criminal activity${where}.`,
        `Requesting roadblocks and spike strips${where}. Suspect is hostile.`,
        'Dispatch to all units: SWAT and air support are authorised.',
        'Heavy response authorised. Snipers to the rooftops. Suspect is armed and dangerous.',
        'Federal task force is taking over. All units: shoot on sight.',
        'Military assets are deployed. This is a state of emergency.',
      ];
      this.speak(lines[s] ?? '');
      hud.say(lines[s] ?? '', 6);
    } else if (s === 0) {
      this.speak('Suspect lost. All units resume patrol.');
      hud.say('Suspect lost. All units resume patrol.', 5);
      this.release(false);
    } else {
      hud.say(`Wanted level reduced: ${STAR_NAMES[s]}.`, 3.5);
    }
  }

  private speak(text: string): void {
    try {
      const ss = (window as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
      if (!ss || !text) return;
      ss.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.18; u.pitch = 0.7; u.volume = 0.5;
      ss.speak(u);
    } catch { /* speech is a nicety */ }
  }

  // --------------------------------------------------------------------------------------- targeting

  private refreshTarget(): void {
    const { player, driving } = this.d;
    const t = this.tgt;
    const v = driving.mode === 'driving' || driving.mode === 'entering' ? driving.vehicle : null;
    if (v) {
      const lv = v.body.linvel();
      t.x = v.position.x; t.y = v.position.y + 0.9; t.z = v.position.z; t.vx = lv.x; t.vz = lv.z; t.car = true;
    } else {
      t.x = player.pos.x; t.y = player.pos.y + 1.15; t.z = player.pos.z; t.vx = 0; t.vz = 0; t.car = false;
    }
    t.speed = Math.hypot(t.vx, t.vz);
  }

  /** Clear straight line between two points? (buildings and terrain block it; cars and people do not). */
  private los(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    _v.set(ax, ay, az);
    _w.set(bx - ax, by - ay, bz - az);
    const len = _w.length();
    if (len < 0.5) return true;
    _w.multiplyScalar(1 / len);
    return !this.d.physics.raycast(_v, _w, len - 0.5, undefined, GROUP.WORLD);
  }

  private blocked(x: number, y: number, z: number, dx: number, dz: number, len: number): boolean {
    _v.set(x, y, z);
    _w.set(dx, 0, dz);
    return !!this.d.physics.raycast(_v, _w, len, undefined, GROUP.WORLD);
  }

  // ----------------------------------------------------------------------------------------- per frame

  update(dt: number): void {
    const { wanted, npcs, hud, camera } = this.d;
    this.refreshTarget();
    this.shotsThisFrame = 0;
    const stars = wanted.stars;
    const tier = TIERS[stars]!;

    // line of sight: who can see the player?
    this.seenT -= dt;
    if (this.seenT <= 0) {
      this.seenT = 0.3;
      let seen = false;
      const t = this.tgt;
      if (stars > 0) {
        for (const p of this.foot) {
          if (p.state === 'down') continue;
          const d = Math.hypot(p.x - t.x, p.z - t.z);
          if (d < 85 && this.los(p.x, p.y + 1.5, p.z, t.x, t.y, t.z)) { seen = true; break; }
        }
        if (!seen) for (const c of this.cars) {
          if (c.state === 'wreck') continue;
          const d = Math.hypot(c.x - t.x, c.z - t.z);
          if (d < 70 && this.los(c.x, 6.2, c.z, t.x, t.y, t.z)) { seen = true; break; }
        }
        if (!seen) for (const h of this.helis) {
          const d = Math.hypot(h.pos.x - t.x, h.pos.z - t.z);
          if (d < 190 && this.los(h.pos.x, h.pos.y - 2, h.pos.z, t.x, t.y, t.z)) { seen = true; break; }
        }
        if (!seen) for (const s of this.snipers) if (s.ped.sees) { seen = true; break; }
      }
      this.lastSeen = seen;
    }
    const hiding = this.d.player.state === 'swim';
    wanted.update(dt, this.lastSeen, this.tgt.x, this.tgt.z, hiding);
    if (this.lastSeen && wanted.stars > 0 && !this.wasSeen) hud.say('Eyes on the suspect.', 2.5);
    this.wasSeen = this.lastSeen;

    if (stars === 0) {
      this.stats.cars = this.stats.foot = 0;
      this.updateAircraftOnly(dt);
      this.updatePending(dt);
      this.updateStrips();
      return;
    }

    // keep the response up to strength (after the dispatch delay)
    this.spawnT -= dt;
    if (wanted.response <= 0 && this.spawnT <= 0) {
      this.spawnT = 1.1;
      this.topUp(tier);
    }
    // re-route chasing vehicles to where the player is (or was last seen)
    this.routeT -= dt;
    if (this.routeT <= 0) {
      this.routeT = 2.2;
      const tx = this.lastSeen ? this.tgt.x : wanted.lastX, tz = this.lastSeen ? this.tgt.z : wanted.lastZ;
      const node = npcs.traffic.nearestNode(tx, tz);
      this.nodeCache = node;
      for (const c of this.cars) if (c.state === 'lane' || c.state === 'box') npcs.traffic.reroute(c, node);
    }
    this.updateCars(dt);
    this.updateFoot(dt);
    this.updateHelis(dt, tier);
    this.updateSnipers(dt, tier);
    this.updateBlocks(dt, tier);
    this.updateStrips();
    this.updateJets(dt, tier);
    this.updatePending(dt);
    this.arrest(dt, stars);
    this.cleanup();
    this.stats.cars = this.cars.size;
    this.stats.foot = this.foot.size;
    this.stats.helis = this.helis.length;
    this.stats.snipers = this.snipers.length;
    this.stats.blocks = this.blocks.length;
    this.stats.strips = this.strips.length;
    this.stats.jets = this.jets.length;
    void camera;
  }

  private wasSeen = false;

  // ------------------------------------------------------------------------------------------ spawning

  private count(unit: string): number {
    let n = 0;
    for (const c of this.cars) if (c.unit === unit && c.state !== 'wreck') n++;
    return n;
  }

  private topUp(tier: Tier): void {
    const { npcs, wanted } = this.d;
    const t = this.tgt;
    const want: [string, string, number][] = [
      ['patrol', 'police', tier.patrol], ['swat', 'swatvan', tier.swat], ['armored', 'armored', tier.armored],
      ['fed', 'fedsuv', tier.fed], ['apc', 'apc', tier.apc], ['tank', 'tank', tier.tank],
    ];
    const cx = this.lastSeen ? t.x : wanted.lastX, cz = this.lastSeen ? t.z : wanted.lastZ;
    for (const [unit, type, n] of want) {
      if (this.count(unit) >= n) continue;
      const c = npcs.traffic.spawnUnit(TYPE[type]!, cx, cz, unit, unit === 'tank' || unit === 'apc' ? 160 : 130, 270);
      if (c) {
        c.ram = wanted.stars >= 4 && unit !== 'tank' && unit !== 'apc';
        if (unit === 'tank') c.v0f = 0.7;
        if (unit === 'apc') c.v0f = 1.0;
        this.cars.add(c);
        npcs.traffic.reroute(c, this.nodeCache || npcs.traffic.nearestNode(cx, cz));
        return; // one per tick keeps the arrival staggered
      }
    }
  }

  private updateCars(dt: number): void {
    const t = this.tgt;
    const { traffic } = this.d.npcs;
    for (const c of [...this.cars]) {
      if (!c.active) { this.cars.delete(c); continue; }
      if (c.state === 'wreck') { if (c.siren) c.siren = false; continue; }
      const d = Math.hypot(c.x - t.x, c.z - t.z);
      c.fireT -= dt;
      // arrive and deploy
      if (!c.deployed && c.unit !== 'tank' && c.unit !== 'apc' && c.state !== 'park' && (c.state === 'lane' || c.state === 'box')) {
        const slowPlayer = t.speed < 8;
        const stuck = c.v < 0.4 && c.blockedT > 2.5;
        if ((d < 34 && (slowPlayer || d < 16)) || (d < 60 && stuck) || (d < 22 && c.unit === 'swat')) this.deploy(c);
      }
      // heavy weapons on vehicles
      if (c.unit === 'tank' || c.unit === 'apc') this.vehicleGun(c, d, dt);
      // far away units that cannot find a route eventually give up
      if (d > 520) { traffic.remove(c); this.cars.delete(c); }
    }
  }

  /** Stop the car and spill its crew. */
  private deploy(c: TrafficCar): void {
    const { npcs, wanted } = this.d;
    c.deployed = true;
    c.state = 'park';
    c.parkT = 9999;
    c.v = 0;
    const role: Role = c.unit === 'swat' ? 'swat' : c.unit === 'fed' ? 'fed' : 'cop';
    const n = c.unit === 'swat' ? 4 : c.unit === 'armored' ? 2 : c.unit === 'fed' ? 2 : 2;
    const type = c.unit === 'armored' ? 'swat' : role;
    const rx = -c.fz, rz = c.fx;
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const px = c.x + rx * side * (c.type.W / 2 + 1.2) + c.fx * (i - n / 2) * 1.2;
      const pz = c.z + rz * side * (c.type.W / 2 + 1.2) + c.fz * (i - n / 2) * 1.2;
      const p = npcs.peds.place(px, pz, type === 'swat' ? 'swat' : type === 'fed' ? 'fed' : 'cop', 'stand', Math.atan2(this.tgt.x - px, this.tgt.z - pz), 'downtown');
      if (p) this.arm(p, role === 'cop' && c.unit === 'armored' ? 'swat' : role, wanted.stars);
    }
  }

  private arm(p: Ped, role: Role, stars: number): void {
    p.role = role;
    p.keep = true;
    p.state = 'stand';
    p.edge = -1;
    p.speed = 0;
    p.sees = false;
    let spec = PISTOL;
    if (role === 'cop') {
      spec = stars >= 3 ? RIFLE : stars === 2 && Math.random() < 0.55 ? SHOTGUN : PISTOL;
      p.health = 100; p.armor = stars >= 3 ? 25 : 0;
      p.accessory = 0;
    } else if (role === 'swat') {
      spec = HEAVY; p.health = 140; p.armor = 70;
    } else if (role === 'fed') {
      spec = FED; p.health = 120; p.armor = 45;
    } else if (role === 'soldier') {
      spec = HEAVY; p.health = 150; p.armor = 80;
    }
    p.baseSpeed = spec.speed;
    p.fireT = 0.6 + Math.random() * 0.8;
    this.spec.set(p, spec);
    p.ai = (q, dt) => this.footAI(q, dt);
    this.foot.add(p);
  }

  // ----------------------------------------------------------------------------------------- foot AI

  private updateFoot(dt: number): void {
    void dt;
    for (const p of [...this.foot]) {
      if (!p.active || p.state === 'down') { if (p.state === 'down' || !p.active) this.foot.delete(p); continue; }
      if (p.dist > 460) { p.active = false; this.foot.delete(p); }
    }
  }

  private footAI(p: Ped, dt: number): void {
    const t = this.tgt;
    const spec = this.spec.get(p) ?? PISTOL;
    const dx = t.x - p.x, dz = t.z - p.z;
    const d = Math.hypot(dx, dz);
    p.fireT -= dt;
    p.stateT -= dt;
    if (p.stateT <= 0) {
      p.stateT = 0.22 + Math.random() * 0.18;
      p.sees = d < spec.sight && this.los(p.x, p.y + 1.5, p.z, t.x, t.y, t.z);
      p.onRoad = this.d.world.city.plan.roadAt(p.x, p.z).kind === 'road';
    }
    if (p.sees && d < spec.range) {
      // stand and shoot; advance a little if far
      p.aim = true;
      p.yaw = this.turn(p.yaw, Math.atan2(dx, dz), dt * 9);
      p.speed = d > spec.range * 0.6 ? 1.4 : 0;
      if (p.speed > 0) this.step(p, p.yaw, p.speed, dt);
      if (p.fireT <= 0) this.shoot(p, spec, d);
    } else {
      p.aim = false;
      const tx = p.sees ? t.x : this.d.wanted.lastX, tz = p.sees ? t.z : this.d.wanted.lastZ;
      const base = Math.atan2(tx - p.x, tz - p.z);
      p.speed = spec.speed;
      for (const off of [0, 0.75, -0.75, 1.5, -1.5]) {
        const a = base + off;
        if (!this.blocked(p.x, p.y + 0.9, p.z, Math.sin(a), Math.cos(a), 1.7)) {
          p.yaw = this.turn(p.yaw, a, dt * 8);
          this.step(p, a, p.speed, dt);
          p.phase += p.speed * dt * 2.6;
          return;
        }
      }
      p.speed = 0;
    }
  }

  private step(p: Ped, ang: number, speed: number, dt: number): void {
    p.x += Math.sin(ang) * speed * dt;
    p.z += Math.cos(ang) * speed * dt;
    if (p.x < 215) p.y = terrainHeight(p.x, p.z);
    else p.y = G;
  }

  private turn(cur: number, target: number, k: number): number {
    let d = target - cur;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return cur + d * Math.min(1, k);
  }

  /** Fire a burst/shot/shotgun blast at the player from `p`. */
  private shoot(p: Ped, spec: Spec, d: number): void {
    p.burstN++;
    if (p.burstN >= spec.burst) { p.burstN = 0; p.fireT = (spec.pause ?? spec.interval) * (0.8 + Math.random() * 0.5); }
    else p.fireT = spec.interval;
    this.fireAt(p.x + Math.sin(p.yaw) * 0.5, p.y + 1.4, p.z + Math.cos(p.yaw) * 0.5, spec, d, p.x, p.z);
  }

  private fireAt(mx: number, my: number, mz: number, spec: Spec, d: number, fromX: number, fromZ: number): void {
    const { effects, audio, combat } = this.d;
    const t = this.tgt;
    this.stats.shots++;
    const sigma = spec.spread + d * 0.0026;
    let hits = 0;
    const reach = t.car ? 1.4 : 0.38;
    // moving targets are harder to hit
    const evade = 1 + Math.min(2.2, t.speed * 0.1);
    for (let k = 0; k < spec.pellets; k++) {
      const ex = gauss() * sigma * d * evade, ey = gauss() * sigma * d * 0.7;
      if (Math.abs(ex) < reach && Math.abs(ey) < (t.car ? 1.0 : 0.85)) hits++;
      if (k === 0 || Math.random() < 0.3) {
        _a.set(mx, my, mz);
        const dir = _v.set(t.x - mx, t.y - my, t.z - mz).normalize();
        const side = _w.set(-dir.z, 0, dir.x);
        _w.multiplyScalar(ex);
        const end = new THREE.Vector3(t.x + _w.x, t.y + ey, t.z + _w.z);
        if (Math.abs(ex) >= reach) end.addScaledVector(dir, 6 + Math.random() * 20);
        effects.tracer(_a, end);
        void side;
      }
    }
    if (this.shotsThisFrame++ < 4) {
      _a.set(mx, my, mz);
      audio.gunshot(0.8, { x: _a.x, y: _a.y, z: _a.z });
    }
    if (hits > 0) {
      combat.hurtPlayer(spec.dmg * hits, fromX, fromZ);
      this.stats.hitsOnPlayer += hits;
    }
  }

  // --------------------------------------------------------------------------------- tanks and APCs

  private vehicleGun(c: TrafficCar, d: number, dt: number): void {
    const t = this.tgt;
    const tank = c.unit === 'tank';
    const range = tank ? 170 : 100;
    const sees = d < range && this.los(c.x, 3.2, c.z, t.x, t.y, t.z);
    const want = Math.atan2(t.x - c.x, t.z - c.z);
    let dy = want - c.turretYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    c.turretYaw += Math.max(-1, Math.min(1, dy)) * dt * (tank ? 1.4 : 2.2);
    if (!sees) return;
    if (c.fireT > 0) return;
    if (tank && Math.abs(dy) < 0.1) {
      c.fireT = 5.5;
      // shell: instant tracer, impact a beat later at a slightly led point
      const lead = 0.5 + d / 220;
      const ix = t.x + t.vx * lead + gauss() * 2.5, iz = t.z + t.vz * lead + gauss() * 2.5;
      _a.set(c.x + Math.sin(c.turretYaw) * 4.2, 3.4, c.z + Math.cos(c.turretYaw) * 4.2);
      this.d.effects.tracer(_a, _v.set(ix, Math.max(1, t.y - 0.6), iz));
      this.d.audio.explosion({ x: _a.x, y: _a.y, z: _a.z }, 0.5);
      this.pending.push({ t: lead, x: ix, y: Math.max(1, t.y - 0.8), z: iz, r: 9, dmg: 60 });
    } else if (!tank && Math.abs(dy) < 0.3) {
      c.fireT = 0.1;
      if (Math.random() < 0.12) c.fireT = 2.0; // pause between bursts
      this.fireAt(c.x + Math.sin(c.turretYaw) * 2, 3.3, c.z + Math.cos(c.turretYaw) * 2, { dmg: 4, interval: 0, range: 100, spread: 0.045, pellets: 1, burst: 1, speed: 0, sight: 100 }, d, c.x, c.z);
    }
  }

  // --------------------------------------------------------------------------------------- aircraft

  private updateHelis(dt: number, tier: Tier): void {
    const { world, audio, camera, npcs } = this.d;
    const t = this.tgt;
    const cx = this.lastSeen ? t.x : this.d.wanted.lastX, cz = this.lastSeen ? t.z : this.d.wanted.lastZ;
    // spawn up to the tier's list
    const have: Record<string, number> = {};
    for (const h of this.helis) if (h.active) have[h.kind] = (have[h.kind] ?? 0) + 1;
    const need: Record<string, number> = {};
    for (const k of tier.heli) need[k] = (need[k] ?? 0) + 1;
    for (const k of Object.keys(need)) {
      if ((have[k] ?? 0) < need[k]! && this.d.wanted.response <= 0 && this.helis.length < 4 && Math.random() < dt * 0.4) {
        const a = Math.random() * 6.28;
        const h = new Heli(k as HeliKind, cx + Math.cos(a) * 420, cz + Math.sin(a) * 420, audio);
        this.addHeli(h);
      }
    }
    const night = world.tod.look.night;
    for (const h of [...this.helis]) {
      if (!h.active) {
        h.update(dt, cx, cz, night, camera.position);
        if (h.pos.y > 320 || Math.hypot(h.pos.x - t.x, h.pos.z - t.z) > 900) this.removeHeli(h);
        continue;
      }
      // surplus helicopters leave when the level drops
      if ((have[h.kind] ?? 0) > (need[h.kind] ?? 0)) { h.active = false; continue; }
      h.update(dt, cx, cz, night, camera.position);
      const d = Math.hypot(h.pos.x - t.x, h.pos.z - t.z);
      h.fireT -= dt;
      if (h.kind === 'gunship' && d < 170 && h.fireT <= 0 && this.lastSeen && this.los(h.pos.x, h.pos.y - 1.5, h.pos.z, t.x, t.y, t.z)) {
        // a burst of automatic fire, spread over the next few frames via burstLeft
        if (h.burstLeft <= 0) { h.burstLeft = 7; }
      }
      if (h.burstLeft > 0 && h.fireT <= 0) {
        h.burstLeft--;
        h.fireT = h.burstLeft > 0 ? 0.11 : 3.4;
        this.fireAt(h.pos.x, h.pos.y - 1.4, h.pos.z, { dmg: 5, interval: 0, range: 200, spread: 0.05, pellets: 1, burst: 1, speed: 0, sight: 200 }, Math.hypot(h.pos.x - t.x, h.pos.y - t.y, h.pos.z - t.z), h.pos.x, h.pos.z);
      }
      if (h.kind === 'attack' && d < 260 && h.fireT <= 0 && this.lastSeen) {
        h.fireT = 6.5;
        const flight = Math.hypot(h.pos.x - t.x, h.pos.y - t.y, h.pos.z - t.z) / 75;
        const ix = t.x + t.vx * flight + gauss() * 3, iz = t.z + t.vz * flight + gauss() * 3;
        _a.set(h.pos.x, h.pos.y - 1.5, h.pos.z);
        this.d.effects.tracer(_a, _v.set(ix, Math.max(1, t.y - 0.7), iz));
        this.pending.push({ t: flight, x: ix, y: Math.max(1, t.y - 0.8), z: iz, r: 9, dmg: 45 });
        this.d.audio.radioChirp();
      }
    }
    void npcs;
  }

  private addHeli(h: Heli): void {
    for (const m of h.materials) this.d.world.rig.register(m);
    this.group.add(h.group, ...h.worldObjects);
    this.helis.push(h);
  }

  private removeHeli(h: Heli): void {
    h.dispose();
    this.group.remove(h.group, ...h.worldObjects);
    const i = this.helis.indexOf(h);
    if (i >= 0) this.helis.splice(i, 1);
  }

  private updateAircraftOnly(dt: number): void {
    // after the level drops to zero the aircraft fly off
    const t = this.tgt;
    for (const h of [...this.helis]) {
      h.active = false;
      h.update(dt, t.x, t.z, this.d.world.tod.look.night, this.d.camera.position);
      if (h.pos.y > 300) this.removeHeli(h);
    }
    for (const j of [...this.jets]) this.stepJet(j, dt);
  }

  private updateJets(dt: number, tier: Tier): void {
    const t = this.tgt;
    if (tier.jets) {
      this.jetT -= dt;
      if (this.jetT <= 0 && this.jets.length < 2) {
        this.jetT = 22 + Math.random() * 8;
        const a = Math.random() * 6.28;
        const fx = t.x + Math.cos(a) * 1500, fz = t.z + Math.sin(a) * 1500;
        const jet = new Jet(fx, fz, t.x, t.z, 150, this.d.audio);
        for (const m of jet.mats) this.d.world.rig.register(m);
        this.group.add(jet.group);
        this.jets.push(jet);
        this.d.hud.say('Warning: air strike inbound.', 4);
      }
    }
    for (const j of [...this.jets]) this.stepJet(j, dt);
  }

  private stepJet(j: Jet, dt: number): void {
    const t = this.tgt;
    j.update(dt, this.d.camera.position);
    const dist = Math.hypot(j.pos.x - t.x, j.pos.z - t.z);
    if (!j.fired && dist < 700) {
      j.fired = true;
      // the missile lands where the player is heading
      const flight = 2.2;
      const ix = t.x + t.vx * flight + gauss() * 4, iz = t.z + t.vz * flight + gauss() * 4;
      _a.set(j.pos.x, j.pos.y - 1, j.pos.z);
      this.d.effects.tracer(_a, _v.set(ix, 1.2, iz));
      this.pending.push({ t: flight, x: ix, y: 1.2, z: iz, r: 12, dmg: 80 });
    }
    if (!j.active) {
      j.dispose();
      this.group.remove(j.group);
      this.jets.splice(this.jets.indexOf(j), 1);
    }
  }

  private updatePending(dt: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i]!;
      p.t -= dt;
      if (p.t <= 0) {
        this.d.combat.boom(p.x, p.y, p.z, p.r, p.dmg, false);
        this.pending.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------------------------------- snipers

  private roofs(cx: number, cz: number): { x: number; y: number; z: number }[] {
    const key = `${cx},${cz}`;
    let list = this.roofCache.get(key);
    if (!list) {
      list = [];
      const data = this.d.world.city.plan.generateChunk(cx, cz);
      for (const b of data.boxes) {
        if (!b.solid || b.ry) continue;
        const top = b.y + b.sy / 2;
        if (top > G + 20 && b.sx > 9 && b.sz > 9 && b.sy > 14) list.push({ x: b.x, y: top, z: b.z });
      }
      this.roofCache.set(key, list);
    }
    return list;
  }

  private updateSnipers(dt: number, tier: Tier): void {
    const t = this.tgt;
    this.sniperT -= dt;
    if (this.snipers.length < tier.snipers && this.sniperT <= 0 && this.d.wanted.response <= 0) {
      this.sniperT = 4;
      const cx0 = Math.floor(t.x / 256), cz0 = Math.floor(t.z / 256);
      const cand: { x: number; y: number; z: number }[] = [];
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const r of this.roofs(cx0 + i, cz0 + j)) {
        const d = Math.hypot(r.x - t.x, r.z - t.z);
        if (d > 60 && d < 240) cand.push(r);
      }
      for (let a = 0; a < 45 && cand.length; a++) {
        const r = cand[Math.floor(Math.random() * cand.length)]!;
        const px = r.x + (Math.random() - 0.5) * 4, pz = r.z + (Math.random() - 0.5) * 4;
        if (!this.los(px, r.y + 1.6, pz, t.x, t.y, t.z)) continue;
        const p = this.d.npcs.peds.place(px, pz, 'swat', 'stand', Math.atan2(t.x - px, t.z - pz), 'downtown');
        if (!p) break;
        p.y = r.y;
        this.arm(p, 'swat', 4);
        this.foot.delete(p); // snipers are managed here, not by the foot-patrol logic
        p.health = 90; p.armor = 20;
        p.ai = (q, dd) => this.sniperAI(q, dd);
        const laser = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1), this.laserMat);
        laser.frustumCulled = false;
        laser.visible = false;
        laser.renderOrder = 6;
        this.group.add(laser);
        this.snipers.push({ ped: p, charge: -1, laser });
        break;
      }
    }
    for (const s of [...this.snipers]) {
      if (!s.ped.active || s.ped.state === 'down') { this.removeSniper(s); }
    }
  }

  private removeSniper(s: Sniper): void {
    this.group.remove(s.laser);
    const i = this.snipers.indexOf(s);
    if (i >= 0) this.snipers.splice(i, 1);
  }

  private sniperAI(p: Ped, dt: number): void {
    const t = this.tgt;
    const s = this.snipers.find((q) => q.ped === p);
    if (!s) return;
    const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
    p.stateT -= dt;
    if (p.stateT <= 0) {
      p.stateT = 0.3;
      p.sees = d < 260 && this.los(p.x, p.y + 1.6, p.z, t.x, t.y, t.z);
    }
    p.speed = 0;
    p.aim = p.sees;
    p.yaw = this.turn(p.yaw, Math.atan2(dx, dz), dt * 5);
    if (p.sees) {
      s.charge += dt;
      const lit = s.charge > 0;
      s.laser.visible = lit;
      if (lit) {
        _v.set(p.x, p.y + 1.5, p.z);
        _w.set(t.x, t.y, t.z);
        const len = _v.distanceTo(_w);
        s.laser.position.copy(_v).lerp(_w, 0.5);
        s.laser.scale.set(1, 1, len);
        s.laser.lookAt(_w);
      }
      if (s.charge > 1.7) {
        s.charge = -2.2;
        s.laser.visible = false;
        this.fireAt(p.x, p.y + 1.5, p.z, { dmg: 38, interval: 0, range: 260, spread: 0.004, pellets: 1, burst: 1, speed: 0, sight: 260 }, d, p.x, p.z);
      }
    } else {
      s.charge = Math.min(s.charge, -0.5);
      s.laser.visible = false;
    }
  }

  // -------------------------------------------------------------------- roadblocks and spike strips

  private updateBlocks(dt: number, tier: Tier): void {
    const t = this.tgt;
    for (const c of [...this.blocks]) {
      if (!c.active) this.blocks.splice(this.blocks.indexOf(c), 1);
    }
    this.blockT -= dt;
    const nBlockers = this.blocks.filter((c) => c.blocker).length;
    if (tier.blocks > 0 && nBlockers < tier.blocks * tier.blockSize && this.blockT <= 0 && this.d.wanted.response <= 0) {
      this.blockT = 7;
      const { traffic } = this.d.npcs;
      const nodes = traffic.net.nodes;
      const hx = t.speed > 4 ? t.vx / t.speed : 0, hz = t.speed > 4 ? t.vz / t.speed : 0;
      let best = -1, bs = -1e9;
      for (let k = 0; k < nodes.length; k++) {
        const n = nodes[k]!;
        if (!n.ok) continue;
        const dx = n.x - t.x, dz = n.z - t.z, d = Math.hypot(dx, dz);
        if (d < 140 || d > 250) continue;
        const dot = t.speed > 4 ? (dx * hx + dz * hz) / d : 0.3;
        const score = dot * 100 - Math.abs(d - 190) * 0.3 + Math.random() * 30;
        if (score > bs) { bs = score; best = k; }
      }
      if (best < 0) return;
      const n = nodes[best]!;
      // block across the approach: the road the player is most likely to use runs along the larger component
      const dxp = n.x - t.x, dzp = n.z - t.z;
      const alongX = Math.abs(dxp) > Math.abs(dzp);
      const yaw = alongX ? 0 : Math.PI / 2; // cars broadside to the approach
      const sizes = tier.blockSize === 2 ? [-6, 6] : tier.blockSize === 3 ? [-12, 0, 12] : [-15, -5, 5, 15];
      const stars = this.d.wanted.stars;
      for (const off of sizes) {
        const x = n.x + (alongX ? 0 : off), z = n.z + (alongX ? off : 0);
        const car = traffic.spawnBlocker(TYPE.police!, x, z, yaw + (off > 0 ? 0.25 : -0.25));
        if (car) {
          this.blocks.push(car);
          // two officers crouch behind the line
          if (Math.abs(off) < 10) {
            const bx = x + (alongX ? (dxp > 0 ? 4 : -4) : 0) * 1, bz = z + (alongX ? 0 : (dzp > 0 ? 4 : -4));
            const p = this.d.npcs.peds.place(bx, bz, 'cop', 'stand', Math.atan2(t.x - bx, t.z - bz), 'downtown');
            if (p) this.arm(p, stars >= 5 ? 'fed' : 'cop', stars);
          }
        }
      }
    }
    // roadblocks far behind are removed
    for (const c of [...this.blocks]) {
      if (Math.hypot(c.x - t.x, c.z - t.z) > 380) { this.d.npcs.traffic.remove(c); this.blocks.splice(this.blocks.indexOf(c), 1); }
    }
  }

  private updateStrips(): void {
    const t = this.tgt;
    const tier = TIERS[this.d.wanted.stars]!;
    this.stripT -= 1 / 60;
    if (this.strips.length < tier.strips && this.stripT <= 0 && this.d.wanted.stars > 0 && this.d.wanted.response <= 0 && t.speed > 6) {
      this.stripT = 9;
      const { traffic } = this.d.npcs;
      const hx = t.vx / t.speed, hz = t.vz / t.speed;
      let best: { x: number; z: number; half: number; yaw: number; score: number } | null = null;
      for (const l of traffic.net.lanes) {
        if (l.laneIdx !== 0) continue;
        const mx = l.axis === 0 ? l.off : (l.sA + l.sB) / 2, mz = l.axis === 0 ? (l.sA + l.sB) / 2 : l.off;
        const dx = mx - t.x, dz = mz - t.z, d = Math.hypot(dx, dz);
        if (d < 90 || d > 190) continue;
        const dot = (dx * hx + dz * hz) / d;
        if (dot < 0.8) continue;
        // only roads the player is travelling along (lane heading roughly with the player)
        const hd = l.axis === 0 ? l.dir * hz : l.dir * hx;
        if (hd < 0.5) continue;
        const score = dot * 50 - Math.abs(d - 130) * 0.2 + Math.random() * 20;
        if (!best || score > best.score) {
          const lanes = l.laneCount;
          // centre of this direction's lanes
          const roadC = l.road.pos;
          const cx = l.axis === 0 ? roadC - l.dir * (lanes === 2 ? 6.1 : 3.75) : mx;
          const cz = l.axis === 1 ? roadC + l.dir * (lanes === 2 ? 6.1 : 3.75) : mz;
          best = { x: cx, z: cz, half: lanes === 2 ? 6.6 : 4.3, yaw: l.axis === 0 ? 0 : Math.PI / 2, score };
        }
      }
      if (best) {
        const mesh = new THREE.Mesh(this.stripGeo, this.stripMat);
        mesh.scale.set(best.half * 2, 1, 1);
        mesh.position.set(best.x, G + 0.02, best.z);
        mesh.rotation.y = best.yaw;
        mesh.frustumCulled = false;
        this.group.add(mesh);
        this.strips.push({ x: best.x, z: best.z, yaw: best.yaw, half: best.half, mesh });
      }
    }
    // pop tyres of any vehicle rolling over a strip; retire strips that are well behind
    for (let i = this.strips.length - 1; i >= 0; i--) {
      const s = this.strips[i]!;
      const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
      for (const v of this.d.vehicles.vehicles) {
        for (const w of v.wheels) {
          if (!w.onGround || w.popped) continue;
          const px = w.contact.x - s.x, pz = w.contact.z - s.z;
          const across = px * c - pz * sn;
          const along = px * sn + pz * c;
          if (Math.abs(across) < s.half && Math.abs(along) < 0.8) {
            w.popped = true;
            this.d.effects.smoke(_v.copy(w.contact), false);
            this.d.audio.impact('metal', { x: w.contact.x, y: w.contact.y, z: w.contact.z });
            if (v.occupied) this.d.hud.say('Tyre blown on the spike strip!', 2.5);
          }
        }
      }
      if (Math.hypot(s.x - t.x, s.z - t.z) > 300) { this.group.remove(s.mesh); this.strips.splice(i, 1); }
    }
  }

  // -------------------------------------------------------------------------------------- arrest

  private arrest(dt: number, stars: number): void {
    const { combat } = this.d;
    const t = this.tgt;
    if (combat.flow || stars > 3) { this.arrestT = 0; return; }
    let near = 0;
    for (const p of this.foot) if (p.state !== 'down' && Math.hypot(p.x - t.x, p.z - t.z) < 2.6) near++;
    if (near >= 1 && t.speed < 3.2) this.arrestT += dt * (1 + near * 0.5);
    else this.arrestT = Math.max(0, this.arrestT - dt * 1.5);
    if (this.arrestT > 2.6) {
      this.arrestT = 0;
      combat.begin('busted');
    }
  }

  get arresting(): number {
    return Math.min(1, this.arrestT / 2.6);
  }

  // ---------------------------------------------------------------------------------------- cleanup

  /** The wanted level fell to zero (or the player respawned): stand units down. */
  release(hard: boolean): void {
    const { npcs } = this.d;
    for (const c of this.cars) {
      c.pursuit = false; c.siren = false; c.route = null; c.ram = false; c.unit = c.unit === 'blocker' ? c.unit : null;
      if (c.state === 'park' && c.lane) c.parkT = 6;
      if (hard || c.state === 'wreck') { if (hard) npcs.traffic.remove(c); }
    }
    this.cars.clear();
    for (const p of this.foot) { p.ai = null; p.aim = false; p.keep = false; p.role = 'civ'; if (hard) p.active = false; else npcs.peds.resume(p); }
    this.foot.clear();
    for (const s of [...this.snipers]) { s.ped.ai = null; s.ped.aim = false; s.ped.keep = false; s.ped.role = 'civ'; if (hard) s.ped.active = false; else npcs.peds.resume(s.ped); this.removeSniper(s); }
    for (const b of this.blocks) { b.siren = false; if (hard) npcs.traffic.remove(b); }
    this.blocks.length = 0;
    for (const s of this.strips) this.group.remove(s.mesh);
    this.strips.length = 0;
    for (const h of this.helis) h.active = false;
    if (hard) { for (const h of [...this.helis]) this.removeHeli(h); for (const j of [...this.jets]) { j.dispose(); this.group.remove(j.group); } this.jets.length = 0; this.pending.length = 0; }
    this.arrestT = 0;
  }

  private cleanup(): void {
    for (const c of [...this.cars]) if (!c.active) this.cars.delete(c);
    void this.unlocked;
  }

  // ------------------------------------------------------------------------------- helicopter hits

  /** Ray test against helicopters (for the player's bullets); returns distance or null. */
  rayHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): { t: number; heli: Heli } | null {
    let best: { t: number; heli: Heli } | null = null;
    for (const h of this.helis) {
      const fx = h.pos.x - ox, fy = h.pos.y - oy, fz = h.pos.z - oz;
      const proj = fx * dx + fy * dy + fz * dz;
      if (proj < 0 || proj > max) continue;
      const cx = fx - dx * proj, cy = fy - dy * proj, cz = fz - dz * proj;
      if (cx * cx + cy * cy + cz * cz < 3.4 * 3.4 && (!best || proj < best.t)) best = { t: proj, heli: h };
    }
    return best;
  }

  hurtHeli(h: Heli, damage: number): void {
    h.hp -= damage * 0.6;
    if (h.hp <= 0 && h.active) {
      this.d.combat.boom(h.pos.x, h.pos.y, h.pos.z, 14, 50, true);
      this.crime(80, h.pos.x, h.pos.z, { cop: true });
      this.removeHeli(h);
    }
  }
}
