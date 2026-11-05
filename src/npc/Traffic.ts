import * as THREE from 'three';
import type { Collider, RigidBody } from '@dimforge/rapier3d-compat';
import { GROUP, groups, type Physics } from '../physics/Physics';
import { CITY } from '../world/Terrain';
import { mulberry32 } from '../world/city/plan';
import { HEAD_DX, HEAD_DZ, RoadNet, type Heading, type LaneDef, type TurnPath } from './RoadNet';
import type { SignalClock } from './Signals';

const G = CITY.height;
const WORLD_GRAVITY = 16;

export type EmergencyKind = 'police' | 'ambulance';

export interface CarType {
  id: string;
  L: number; W: number;
  clear: number; bodyH: number; cabinH: number; cabinL: number; cabinX: number;
  wheelR: number;
  colors: number[];
  weight: number;
  hp?: number;
  emergency?: EmergencyKind;
  /** Only spawned in industrial parts of town. */
  industrial?: boolean;
}

export const CAR_TYPES: CarType[] = [
  { id: 'hatch', L: 3.9, W: 1.72, clear: 0.24, bodyH: 0.62, cabinH: 0.52, cabinL: 2.2, cabinX: -0.15, wheelR: 0.3, weight: 3.2, colors: [0xc8c8c4, 0x2f4b7a, 0x9b2d30, 0x1d1f23, 0x7f8a8f, 0xd2b24a, 0x3f6b4a, 0xe8e6df] },
  { id: 'sedan', L: 4.6, W: 1.82, clear: 0.24, bodyH: 0.62, cabinH: 0.52, cabinL: 2.35, cabinX: -0.25, wheelR: 0.32, weight: 4.2, colors: [0xd7d7d2, 0x1d1f23, 0x2a3446, 0x7d1f26, 0x8c9296, 0x4a5b6e, 0xb8a994, 0x0f2a24] },
  { id: 'taxi', L: 4.6, W: 1.82, clear: 0.24, bodyH: 0.62, cabinH: 0.52, cabinL: 2.35, cabinX: -0.25, wheelR: 0.32, weight: 1.3, colors: [0xf2b705] },
  { id: 'van', L: 5.2, W: 2.0, clear: 0.28, bodyH: 1.15, cabinH: 0.62, cabinL: 1.6, cabinX: 1.5, wheelR: 0.34, weight: 1.2, colors: [0xe8e8e4, 0xc8c8c4, 0x2f4b7a, 0x8a9296] },
  { id: 'pickup', L: 5.4, W: 2.0, clear: 0.34, bodyH: 0.72, cabinH: 0.62, cabinL: 1.9, cabinX: 0.6, wheelR: 0.38, weight: 1.1, colors: [0x2f4a2f, 0x9b2d30, 0xc8c8c4, 0x1d1f23, 0xb48a4a] },
  { id: 'truck', L: 7.6, W: 2.4, clear: 0.5, bodyH: 2.1, cabinH: 0.7, cabinL: 2.0, cabinX: 2.8, wheelR: 0.5, weight: 0.8, industrial: true, colors: [0xd0d0cc, 0xb3472f, 0x2f6b8a, 0xc9a227] },
  { id: 'police', L: 4.7, W: 1.86, clear: 0.24, bodyH: 0.62, cabinH: 0.54, cabinL: 2.35, cabinX: -0.25, wheelR: 0.33, weight: 0, emergency: 'police', colors: [0x1c2a4a] },
  { id: 'ambulance', L: 5.6, W: 2.1, clear: 0.3, bodyH: 1.4, cabinH: 0.6, cabinL: 1.5, cabinX: 1.9, wheelR: 0.36, weight: 0, emergency: 'ambulance', colors: [0xf2f2ee] },
];
const TYPE = Object.fromEntries(CAR_TYPES.map((t) => [t.id, t])) as Record<string, CarType>;

export type CarState = 'lane' | 'box' | 'park' | 'wreck';

export class TrafficCar {
  id = 0;
  active = false;
  type: CarType = CAR_TYPES[0]!;
  color = 0xffffff;
  state: CarState = 'lane';
  lane: LaneDef | null = null;
  next: LaneDef | null = null;
  path: TurnPath | null = null;
  u = 0;
  pu = 0;
  v = 0;
  v0f = 1;
  x = 0; z = 0; yaw = 0;
  px = 0; pz = 0; pyaw = 0;
  fx = 0; fz = 1;
  lat = 0;
  brake = 0;
  yieldT = 0;
  blockedT = 0;
  honkT = 0;
  hazard = false;
  siren = false;
  route: number[] | null = null;
  routeIdx = 0;
  parkT = 0;
  life = 0;
  dist = 1e9;
  leader: TrafficCar | null = null;
  body: RigidBody | null = null;
  collider: Collider | null = null;
  quat = new THREE.Quaternion();
  wreckAge = 0;
  /** Set when a car has been hit hard enough to turn into a wreck. */
  angry = false;
  hp = 100;
  /** Seconds until a burning wreck explodes (−1 = not burning). */
  fuse = -1;
}

export interface Obstacle { x: number; z: number; r: number; vx: number; vz: number; kind: 'player' | 'ped' | 'wreck' }

export interface TrafficHooks {
  honk(x: number, z: number): void;
  crash(x: number, z: number, strength: number): void;
}

const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _pt = { x: 0, z: 0 };

/**
 * Lane-following traffic. Cars follow the plan's lanes with an intelligent-driver-model controller, stop at the shared
 * signals, take turns through the junctions (left turns yield to oncoming cars), queue behind each other, stop for the
 * player's vehicle, wrecks and pedestrians, and give way to sirens. Only cars near the player get a kinematic physics
 * body, so the player can bump them — a hard hit turns the car into a dynamic wreck.
 */
export class Traffic {
  readonly net: RoadNet;
  readonly cars: TrafficCar[] = [];
  private readonly obs: Obstacle[] = Array.from({ length: 400 }, () => ({ x: 0, z: 0, r: 0, vx: 0, vz: 0, kind: 'ped' as const }));
  private nObs = 0;
  hooks: TrafficHooks | null = null;
  /** Target number of ambient cars (set from the time of day and quality preset). */
  target = 30;
  private physics: Physics | null = null;
  private readonly rnd = mulberry32(Date.now() & 0xffff);
  private laneCars: TrafficCar[][] = [];
  private boxCars = new Map<number, TrafficCar[]>();
  private spawnT = 0;
  private nextId = 1;
  frustum = new THREE.Frustum();
  focus = new THREE.Vector3();
  /** Night factor 0–1 and the player vehicle, set by the owner each frame. */
  night = 0;
  playerBody: { collider: Collider; body: RigidBody } | null = null;
  stats = { active: 0, wrecks: 0, bodies: 0, stopped: 0 };

  constructor(readonly plan: import('../world/city/plan').CityPlan, private readonly signals: SignalClock, readonly capacity = 90) {
    this.net = new RoadNet(plan);
    this.laneCars = this.net.lanes.map(() => []);
    for (let i = 0; i < capacity; i++) this.cars.push(new TrafficCar());
  }

  attachPhysics(p: Physics): void {
    this.physics = p;
  }

  /** Obstacles for this tick (player vehicle, parked vehicles, pedestrians on the road); wrecks are added internally. */
  clearObstacles(): void {
    this.nObs = 0;
  }

  addObstacle(x: number, z: number, r: number, vx: number, vz: number, kind: Obstacle['kind']): void {
    if (this.nObs >= this.obs.length) return;
    const o = this.obs[this.nObs++]!;
    o.x = x; o.z = z; o.r = r; o.vx = vx; o.vz = vz; o.kind = kind;
  }

  // ------------------------------------------------------------------------------------------ spawning

  private pickType(industrial: boolean): CarType {
    let total = 0;
    for (const t of CAR_TYPES) total += t.industrial && !industrial ? 0 : t.weight;
    let r = this.rnd() * total;
    for (const t of CAR_TYPES) {
      const w = t.industrial && !industrial ? 0 : t.weight;
      if ((r -= w) <= 0 && w > 0) return t;
    }
    return CAR_TYPES[1]!;
  }

  private free(): TrafficCar | null {
    for (const c of this.cars) if (!c.active) return c;
    return null;
  }

  /** Put `c` on `lane` at `u`. */
  private place(c: TrafficCar, lane: LaneDef, u: number, v: number): void {
    c.state = 'lane';
    c.lane = lane;
    c.u = u;
    c.v = v;
    c.path = null;
    c.lat = 0;
    c.brake = 0;
    c.yieldT = c.blockedT = c.honkT = 0;
    c.angry = false;
    c.hazard = false;
    c.next = c.route ? this.routed(c, lane) : this.net.choose(lane, this.rnd);
    this.pose(c);
    c.px = c.x; c.pz = c.z; c.pyaw = c.yaw;
  }

  private routed(c: TrafficCar, lane: LaneDef): LaneDef | null {
    if (!c.route) return this.net.choose(lane, this.rnd);
    // advance the route cursor to this lane's end node
    const i = c.route.indexOf(lane.b, Math.max(0, c.routeIdx - 1));
    if (i >= 0) c.routeIdx = i;
    const nextNode = c.route[c.routeIdx + 1];
    if (nextNode === undefined) return null;
    return this.net.laneToward(lane.b, nextNode, lane.laneIdx);
  }

  spawnAmbient(): boolean {
    const c = this.free();
    if (!c) return false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const { lane, u } = this.net.random(this.rnd);
      this.net.point(lane, u, _pt);
      const d = Math.hypot(_pt.x - this.focus.x, _pt.z - this.focus.z);
      if (d < 110 || d > 330) continue;
      _p.set(_pt.x, G + 1, _pt.z);
      if (d < 240 && this.frustum.containsPoint(_p)) continue;
      if (!this.clearAt(lane, u, 16)) continue;
      const industrial = this.plan.districtAt(_pt.x, _pt.z) === 'industrial';
      this.activate(c, this.pickType(industrial), lane, u, lane.speed * (0.55 + this.rnd() * 0.3));
      return true;
    }
    return false;
  }

  private clearAt(lane: LaneDef, u: number, gap: number): boolean {
    for (const o of this.laneCars[lane.id]!) if (Math.abs(o.u - u) < gap) return false;
    // cars in the box ahead / on other lanes at the same place
    this.net.point(lane, u, _pt);
    for (const o of this.cars) {
      if (!o.active) continue;
      if (Math.hypot(o.x - _pt.x, o.z - _pt.z) < gap * 0.7) return false;
    }
    return true;
  }

  private activate(c: TrafficCar, type: CarType, lane: LaneDef, u: number, v: number): void {
    c.active = true;
    c.id = this.nextId++;
    c.type = type;
    c.color = type.colors[Math.floor(this.rnd() * type.colors.length)]!;
    c.v0f = 0.88 + this.rnd() * 0.26;
    c.route = null;
    c.routeIdx = 0;
    c.siren = false;
    c.parkT = 0;
    c.life = 0;
    c.hp = type.hp ?? 100;
    c.fuse = -1;
    this.place(c, lane, u, v);
  }

  /** Send an emergency vehicle to the junction nearest (x, z). Returns the car, or null if none could be placed. */
  dispatch(kind: EmergencyKind, x: number, z: number): TrafficCar | null {
    const c = this.free();
    if (!c) return null;
    // destination node: the closest valid junction
    let best = -1, bd = Infinity;
    this.net.nodes.forEach((n, k) => {
      if (!n.ok) return;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) { bd = d; best = k; }
    });
    if (best < 0) return null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const { lane, u } = this.net.random(this.rnd);
      this.net.point(lane, u, _pt);
      const d = Math.hypot(_pt.x - x, _pt.z - z);
      if (d < 230 || d > 520) continue;
      if (!this.clearAt(lane, u, 14)) continue;
      const route = this.net.route(lane.b, best);
      if (!route) continue;
      const type = kind === 'police' ? TYPE.police! : TYPE.ambulance!;
      c.route = route;
      c.routeIdx = 0;
      this.activate(c, type, lane, u, lane.speed);
      c.route = route;
      c.routeIdx = 0;
      c.next = this.routed(c, lane);
      c.siren = true;
      c.parkT = 0;
      return c;
    }
    return null;
  }

  /** Wreck a car right now (explosions, shooting). */
  wreckCar(c: TrafficCar, ivx: number, ivz: number): void {
    if (c.state === 'wreck' || !c.active) return;
    if (c.siren) c.siren = false;
    this.makeWreck(c, ivx, ivz);
  }

  /** Remove a car from the world immediately. */
  remove(c: TrafficCar): void {
    this.dropBody(c);
    c.active = false;
  }

  /** A crashed car left standing (a dynamic body), used by accident scenes. */
  spawnWreck(x: number, z: number, yaw: number, type: CarType = TYPE.sedan!, color?: number): TrafficCar | null {
    const c = this.free();
    if (!c || !this.physics) return null;
    c.active = true;
    c.id = this.nextId++;
    c.type = type;
    c.color = color ?? type.colors[Math.floor(this.rnd() * type.colors.length)]!;
    c.lane = null;
    c.next = null;
    c.route = null;
    c.siren = false;
    c.v = 0;
    c.hp = 60; c.fuse = -1;
    c.x = c.px = x; c.z = c.pz = z; c.yaw = c.pyaw = yaw;
    c.fx = Math.sin(yaw); c.fz = Math.cos(yaw);
    this.makeWreck(c, 0, 0);
    c.hazard = true;
    return c;
  }

  // ------------------------------------------------------------------------------------------- physics

  private ensureBody(c: TrafficCar): void {
    if (c.body || !this.physics) return;
    const R = this.physics.R;
    const t = c.type;
    const h = t.clear + t.bodyH + t.cabinH * 0.7;
    const q = _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, c.yaw);
    const body = this.physics.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(c.x, G + h / 2, c.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
    );
    c.body = body;
    c.collider = this.physics.world.createCollider(
      R.ColliderDesc.cuboid(t.W / 2, h / 2, t.L / 2).setFriction(0.3).setRestitution(0.1)
        .setCollisionGroups(groups(GROUP.PROP | GROUP.VEHICLE, GROUP.WORLD | GROUP.PROP | GROUP.PLAYER | GROUP.VEHICLE)),
      body,
    );
    this.physics.tagSurface(c.collider, 'metal', body);
  }

  private dropBody(c: TrafficCar): void {
    if (!c.body || !this.physics) return;
    if (c.collider) this.physics.forget(c.collider);
    this.physics.world.removeRigidBody(c.body);
    c.body = null;
    c.collider = null;
  }

  /** Turn a car into a dynamic wreck that inherits some of the impactor's momentum. */
  private makeWreck(c: TrafficCar, ivx: number, ivz: number): void {
    if (!this.physics) return;
    c.state = 'wreck';
    c.hazard = true;
    c.wreckAge = 0;
    c.lane = null;
    c.next = null;
    const vx = c.fx * c.v + ivx, vz = c.fz * c.v + ivz;
    if (!c.body) this.ensureBody(c);
    const b = c.body!;
    b.setBodyType(this.physics.R.RigidBodyType.Dynamic, true);
    b.setGravityScale(9.81 / WORLD_GRAVITY, true);
    b.setLinearDamping(0.35);
    b.setAngularDamping(0.9);
    c.collider!.setMass(1300);
    b.setLinvel({ x: vx, y: 0, z: vz }, true);
    b.setAngvel({ x: 0, y: (this.rnd() - 0.5) * 3, z: 0 }, true);
    c.v = 0;
  }

  /** Called every physics tick before the world steps: kinematic cars follow their lane paths. */
  fixedUpdate(dt: number): void {
    this.buildIndex();
    for (const w of this.cars) if (w.active && w.state === 'wreck') this.addObstacle(w.x, w.z, w.type.L * 0.45, 0, 0, 'wreck');
    this.stats.active = 0;
    this.stats.stopped = 0;
    this.stats.wrecks = 0;
    this.stats.bodies = 0;
    const cars = this.cars;
    for (let k = 0; k < cars.length; k++) {
      const c = cars[k]!;
      if (!c.active) continue;
      this.stats.active++;
      c.dist = Math.hypot(c.x - this.focus.x, c.z - this.focus.z);
      if (c.state === 'wreck') { this.updateWreck(c, dt); this.stats.wrecks++; continue; }
      this.drive(c, dt);
      if (c.v < 0.3) this.stats.stopped++;
      // physics body only for cars near the player
      if (c.dist < 60) this.ensureBody(c);
      else if (c.dist > 85) this.dropBody(c);
      if (c.body) {
        this.stats.bodies++;
        const t = c.type;
        const h = t.clear + t.bodyH + t.cabinH * 0.7;
        _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, c.yaw);
        c.body.setNextKinematicTranslation({ x: c.x, y: G + h / 2, z: c.z });
        c.body.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
        // a hard hit from the player's vehicle wrecks the car
        const pb = this.playerBody;
        if (pb && c.collider && c.dist < 14 && c.state !== 'park') {
          const ct = c.collider.contactCollider(pb.collider, 0.06);
          if (ct) {
            const lv = pb.body.linvel();
            const rel = Math.hypot(lv.x - c.fx * c.v, lv.z - c.fz * c.v);
            if (rel > 3.2) {
              this.makeWreck(c, lv.x * 0.55, lv.z * 0.55);
              this.hooks?.crash(c.x, c.z, Math.min(1, rel / 18));
            }
          }
        }
      }
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.35;
      let ambient = 0;
      for (const c of cars) if (c.active && !c.type.emergency && c.state !== 'wreck') ambient++;
      if (ambient < this.target) this.spawnAmbient();
    }
  }

  private updateWreck(c: TrafficCar, dt: number): void {
    const b = c.body;
    if (!b) { c.active = false; return; }
    const t = b.translation(), r = b.rotation();
    c.px = c.x; c.pz = c.z;
    c.x = t.x; c.z = t.z;
    c.quat.set(r.x, r.y, r.z, r.w);
    c.wreckAge += dt;
    c.dist = Math.hypot(c.x - this.focus.x, c.z - this.focus.z);
    // settle: once slow, stop simulating and eventually clear the wreck
    if (c.wreckAge > 150 || c.dist > 320 || t.y < -5) {
      this.dropBody(c);
      c.active = false;
    }
  }

  // ----------------------------------------------------------------------------------------- AI core

  private buildIndex(): void {
    for (const l of this.laneCars) l.length = 0;
    this.boxCars.clear();
    for (const c of this.cars) {
      if (!c.active) continue;
      if ((c.state === 'lane' || c.state === 'park') && c.lane) this.laneCars[c.lane.id]!.push(c);
      else if (c.state === 'box' && c.lane) {
        let l = this.boxCars.get(c.lane.b);
        if (!l) this.boxCars.set(c.lane.b, (l = []));
        l.push(c);
      }
    }
    for (const l of this.laneCars) {
      if (l.length > 1) l.sort((a, b) => a.u - b.u);
      for (let i = 0; i < l.length; i++) l[i]!.leader = l[i + 1] ?? null;
      if (l.length === 1) l[0]!.leader = null;
    }
  }

  private drive(c: TrafficCar, dt: number): void {
    const lane = c.lane!;
    const T = c.type;
    const net = this.net;
    let gap = 1e9;
    let lv = 0;
    const consider = (g: number, vl: number) => {
      if (g < gap) { gap = g; lv = vl; }
    };

    // --- leaders ---------------------------------------------------------------------------------------
    let toEnd: number;
    let nextLane = c.next;
    if (c.state === 'lane' || c.state === 'park') {
      toEnd = lane.len - c.u;
      if (c.leader) consider(c.leader.u - c.u - (c.leader.type.L + T.L) / 2, c.leader.v);
    } else {
      toEnd = c.path!.len - c.pu;
    }
    if (nextLane && toEnd < 55) {
      const nl = this.laneCars[nextLane.id]![0];
      if (nl) {
        const turnLen = c.state === 'lane' ? net.turn(lane, nextLane).len : 0;
        const dEnd = c.state === 'lane' ? toEnd + turnLen : toEnd;
        consider(dEnd + nl.u - (nl.type.L + T.L) / 2, nl.v);
      }
    }

    // --- signals and junction conflicts (only before entering the box) -----------------------------------
    let v0 = lane.speed * c.v0f * (T.emergency ? 1.25 : 1);
    if (c.state === 'lane' || c.state === 'park') {
      const dStop = lane.stopU - (c.u + T.L / 2);
      if (c.state === 'park') {
        consider(Math.max(0.05, lane.len - c.u - T.L / 2 - 2), 0);
      } else if (!T.emergency) {
        const lt = this.signals.light(lane.axis);
        if (lt === 2 && dStop > -1.2) consider(Math.max(0.05, dStop + 0.3), 0);
        else if (lt === 1 && dStop > 0 && dStop > (c.v * c.v) / (2 * 3.6) * 0.8) consider(Math.max(0.05, dStop + 0.3), 0);
      }
      const toBox = lane.len - (c.u + T.L / 2);
      if (toBox < 14 && nextLane) {
        const here = this.boxCars.get(lane.b);
        let blocked = false;
        if (here) for (const o of here) if (o.lane && o.lane.axis !== lane.axis && o.v > 0.2) blocked = true;
        // left turns give way to oncoming traffic
        const leftTurn = nextLane.heading === ((lane.heading + 3) % 4);
        if (!blocked && leftTurn && toBox < 22) {
          for (const l of net.lanesInto(lane.b, ((lane.heading + 2) % 4) as Heading)) {
            for (const o of this.laneCars[l.id]!) {
              const tt = (l.len - o.u) / Math.max(o.v, 2.5);
              if (tt < 3.6 && (o.v > 1.5 || this.signals.light(l.axis) === 0)) blocked = true;
            }
          }
        }
        if (blocked && toBox > -2) consider(Math.max(0.05, toBox - 0.5), 0);
        // slow for turns
        if (nextLane.heading !== lane.heading && toEnd < 32) v0 = Math.min(v0, 6.8);
      }
    } else if (c.path && !c.path.straight) {
      v0 = Math.min(v0, 6.2);
    }

    // --- external obstacles (player's vehicle, wrecks, pedestrians) ----------------------------------------
    const fx = c.fx, fz = c.fz;
    let blockedBy: Obstacle | null = null;
    for (let oi = 0; oi < this.nObs; oi++) {
      const o = this.obs[oi]!;
      const dx = o.x - c.x, dz = o.z - c.z;
      const d = dx * fx + dz * fz;
      if (d < -0.5 || d > 36) continue;
      const l = Math.abs(-dx * fz + dz * fx);
      if (l > T.W / 2 + o.r + 0.55 + c.v * 0.025) continue;
      const g = d - o.r - T.L / 2;
      const vo = Math.max(0, o.vx * fx + o.vz * fz);
      if (g < gap) { consider(g, vo); blockedBy = o; }
    }

    // --- yielding to a siren -------------------------------------------------------------------------------
    if (c.yieldT > 0) {
      c.yieldT -= dt;
      consider(Math.max(0.05, 6 - c.v * 0.5), 0);
      c.lat += (1.7 - c.lat) * Math.min(1, dt * 1.5);
    } else if (c.lat !== 0) {
      c.lat += (0 - c.lat) * Math.min(1, dt * 1.2);
      if (Math.abs(c.lat) < 0.01) c.lat = 0;
    }

    // --- intelligent driver model ---------------------------------------------------------------------------
    const a = 2.3, b = 3.4, s0 = 2.2, Th = T.emergency ? 0.9 : 1.3;
    let acc = a * (1 - Math.pow(c.v / Math.max(0.5, v0), 4));
    if (gap < 1e8) {
      const dv = c.v - lv;
      const sStar = s0 + Math.max(0, c.v * Th + (c.v * dv) / (2 * Math.sqrt(a * b)));
      acc = a * (1 - Math.pow(c.v / Math.max(0.5, v0), 4) - Math.pow(sStar / Math.max(0.1, gap), 2));
    }
    acc = Math.max(-8, Math.min(a, acc));
    c.v = Math.max(0, c.v + acc * dt);
    if (gap < 0.5 && c.v > lv) c.v = Math.max(lv, c.v - 12 * dt);
    c.brake += ((acc < -1.1 || c.v < 0.15 ? 1 : 0) - c.brake) * Math.min(1, dt * 12);

    // blocked by the player / a pedestrian: be impatient
    if (c.v < 0.3 && blockedBy && blockedBy.kind !== 'wreck' && gap < 7) {
      c.blockedT += dt;
      c.honkT -= dt;
      if (c.blockedT > 2.5 && c.honkT <= 0) {
        c.honkT = 3 + this.rnd() * 2.5;
        this.hooks?.honk(c.x, c.z);
      }
    } else {
      c.blockedT = Math.max(0, c.blockedT - dt * 2);
    }

    // --- advance ---------------------------------------------------------------------------------------------
    c.px = c.x; c.pz = c.z; c.pyaw = c.yaw;
    if (c.state === 'park') {
      c.u += c.v * dt;
      c.parkT -= dt;
      if (c.parkT < 20 && c.siren) c.siren = false;
      if (c.parkT <= 0) { c.state = 'lane'; c.route = null; c.next = net.choose(lane, this.rnd); }
    } else if (c.state === 'lane') {
      c.u += c.v * dt;
      // emergency arrival: stop at the end of the lane that reaches the destination
      if (c.route && c.siren && c.next === null && c.u > lane.len - T.L / 2 - 3.5) {
        c.state = 'park';
        c.parkT = 45;
      } else if (c.u >= lane.len) {
        if (!c.next) { c.active = false; this.dropBody(c); return; }
        c.path = net.turn(lane, c.next);
        c.pu = c.u - lane.len;
        c.state = 'box';
      }
    } else {
      c.pu += c.v * dt;
      if (c.pu >= c.path!.len) {
        const nl = c.next!;
        c.lane = nl;
        c.u = c.pu - c.path!.len;
        c.state = 'lane';
        c.path = null;
        c.next = c.route ? this.routed(c, nl) : net.choose(nl, this.rnd);
        if (c.route && !c.next && !this.arrived(c, nl)) c.next = net.choose(nl, this.rnd);
      }
    }
    this.pose(c);
  }

  private arrived(c: TrafficCar, lane: LaneDef): boolean {
    return !!c.route && lane.b === c.route[c.route.length - 1];
  }

  /** Position, heading and forward vector from lane / path state. */
  private pose(c: TrafficCar): void {
    if (c.state === 'box' && c.path) {
      const p = c.path;
      const t = Math.min(1, c.pu / p.len), w = 1 - t;
      c.x = w * w * p.x0 + 2 * w * t * p.x1 + t * t * p.x2;
      c.z = w * w * p.z0 + 2 * w * t * p.z1 + t * t * p.z2;
      let tx = 2 * w * (p.x1 - p.x0) + 2 * t * (p.x2 - p.x1);
      let tz = 2 * w * (p.z1 - p.z0) + 2 * t * (p.z2 - p.z1);
      const l = Math.hypot(tx, tz) || 1;
      tx /= l; tz /= l;
      c.fx = tx; c.fz = tz;
    } else if (c.lane) {
      this.net.point(c.lane, c.u, _pt);
      c.x = _pt.x; c.z = _pt.z;
      c.fx = HEAD_DX[c.lane.heading]; c.fz = HEAD_DZ[c.lane.heading];
    }
    if (c.lat !== 0) { c.x += -c.fz * c.lat; c.z += c.fx * c.lat; }
    c.yaw = Math.atan2(c.fx, c.fz);
  }

  // ------------------------------------------------------------------------------- emergency yielding

  /** Cars near a siren pull over; call once per frame with the active sirens' positions. */
  applySirens(sirens: { x: number; z: number; fx: number; fz: number }[]): void {
    for (const s of sirens) {
      for (const c of this.cars) {
        if (!c.active || c.state === 'wreck' || c.type.emergency) continue;
        const dx = c.x - s.x, dz = c.z - s.z;
        const d = Math.hypot(dx, dz);
        if (d > 48) continue;
        // only cars ahead of the siren (or just behind it) need to move aside
        const ahead = dx * s.fx + dz * s.fz;
        if (ahead > -10 && c.state === 'lane') c.yieldT = Math.max(c.yieldT, 1.2);
      }
    }
  }

  /** Re-seed the distance cache for the player's car so the AI can see it. */
  clear(): void {
    for (const c of this.cars) { this.dropBody(c); c.active = false; }
  }
}

// ================================================================================================= render

const carGeometry = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cabin(): THREE.BufferGeometry {
    // side-view trapezoid prism: z is forward (+z = front windscreen), x width, y height
    const v = [
      // bottom (y=0): x±0.5, z -0.5..0.5 ; top (y=1): z -0.32..0.26
      -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
      -0.46, 1, -0.32, 0.46, 1, -0.32, 0.46, 1, 0.26, -0.46, 1, 0.26,
    ];
    const idx = [
      0, 2, 1, 0, 3, 2, // bottom
      4, 5, 6, 4, 6, 7, // top
      0, 1, 5, 0, 5, 4, // rear
      3, 7, 6, 3, 6, 2, // front
      0, 4, 7, 0, 7, 3, // left
      1, 2, 6, 1, 6, 5, // right
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const ng = g.toNonIndexed();
    ng.computeVertexNormals();
    return ng;
  },
};

export class TrafficRenderer {
  readonly group = new THREE.Group();
  readonly bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.35 });
  readonly glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0.5 });
  readonly tyreMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 });
  readonly hubMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.4, metalness: 0.7 });
  readonly lightMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 1 });
  readonly poolMat: THREE.MeshBasicMaterial;
  private readonly body: THREE.InstancedMesh;
  private readonly cabin: THREE.InstancedMesh;
  private readonly wheels: THREE.InstancedMesh;
  private readonly hubs: THREE.InstancedMesh;
  private readonly lights: THREE.InstancedMesh;
  private readonly pools: THREE.InstancedMesh;
  private flash = 0;

  constructor(cap: number, poolTex: THREE.Texture) {
    const mk = (g: THREE.BufferGeometry, m: THREE.Material, n: number, shadow: boolean) => {
      const im = new THREE.InstancedMesh(g, m, n);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = shadow;
      im.count = 0;
      this.group.add(im);
      return im;
    };
    this.body = mk(carGeometry.box, this.bodyMat, cap, true);
    this.cabin = mk(carGeometry.cabin(), this.glassMat, cap, true);
    this.wheels = mk(new THREE.CylinderGeometry(1, 1, 1, 12).rotateZ(Math.PI / 2), this.tyreMat, cap * 4, false);
    this.hubs = mk(new THREE.CylinderGeometry(0.55, 0.55, 1.04, 8).rotateZ(Math.PI / 2), this.hubMat, cap * 4, false);
    this.lights = mk(carGeometry.box, this.lightMat, cap * 6, false);
    for (const m of [this.body, this.cabin]) m.receiveShadow = true;
    this.poolMat = new THREE.MeshBasicMaterial({
      map: poolTex, color: new THREE.Color(1.0, 0.9, 0.7), transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.poolMat, cap);
    this.pools.frustumCulled = false;
    this.pools.count = 0;
    this.pools.renderOrder = 5;
    this.pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.pools);
  }

  get materials(): THREE.Material[] {
    return [this.bodyMat, this.glassMat, this.tyreMat, this.hubMat];
  }

  get poolMesh(): THREE.Object3D {
    return this.pools;
  }

  private ys = 0;

  private put(mesh: THREE.InstancedMesh, i: number, q: THREE.Quaternion, ox: number, oy: number, oz: number, bx: number, by: number, bz: number, sx: number, sy: number, sz: number, color: number | THREE.Color, scratch: THREE.Color): void {
    _v.set(ox, oy + this.ys, oz).applyQuaternion(q);
    _p.set(bx + _v.x, by + _v.y, bz + _v.z);
    _m.compose(_p, q, _s.set(sx, sy, sz));
    mesh.setMatrixAt(i, _m);
    mesh.setColorAt(i, typeof color === 'number' ? scratch.setHex(color) : color);
  }

  sync(cars: TrafficCar[], alpha: number, night: number, dt: number): void {
    this.flash += dt;
    const blink = Math.floor(this.flash * 3.2) % 2 === 0;
    const siren = Math.floor(this.flash * 5) % 2 === 0;
    let nb = 0, nw = 0, nl = 0, np = 0;
    const col = new THREE.Color();
    const tmp = new THREE.Color();
    const yawQ = new THREE.Quaternion();
    for (const c of cars) {
      if (!c.active) continue;
      const t = c.type;
      let x: number, z: number;
      if (c.state === 'wreck') {
        yawQ.copy(c.quat);
        x = c.x; z = c.z;
      } else {
        x = c.px + (c.x - c.px) * alpha;
        z = c.pz + (c.z - c.pz) * alpha;
        let dy = c.yaw - c.pyaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        yawQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, c.pyaw + dy * alpha);
      }
      const wreck = c.state === 'wreck' && !!c.body;
      const baseY = wreck ? c.body!.translation().y : G;
      this.ys = wreck ? -(t.clear + t.bodyH + t.cabinH * 0.7) / 2 : 0;
      const dim = c.state === 'wreck' ? 0.55 : 1;
      col.setHex(c.color).multiplyScalar(dim);
      // body
      this.put(this.body, nb, yawQ, 0, t.clear + t.bodyH / 2, 0, x, baseY, z, t.W, t.bodyH, t.L, col, tmp);
      // cabin
      tmp.setHex(c.color).multiplyScalar(0.28 * dim).add(new THREE.Color(0.02, 0.03, 0.045));
      this.put(this.cabin, nb, yawQ, 0, t.clear + t.bodyH, t.cabinX, x, baseY, z, t.W * 0.9, t.cabinH, t.cabinL, tmp, col);
      nb++;
      // wheels
      const wz = t.L * 0.32;
      const wx = t.W / 2 - 0.1;
      for (let k = 0; k < 4; k++) {
        const sx = k & 1 ? 1 : -1, sz = k & 2 ? 1 : -1;
        this.put(this.wheels, nw, yawQ, sx * wx, t.wheelR, sz * wz, x, baseY, z, 0.24, t.wheelR, t.wheelR, 0x15171a, tmp);
        this.put(this.hubs, nw, yawQ, sx * wx, t.wheelR, sz * wz, x, baseY, z, 0.24, t.wheelR, t.wheelR, 0xb8bcc2, tmp);
        nw++;
      }
      // lights
      const ly = t.clear + t.bodyH * 0.62;
      const headI = c.state === 'wreck' ? (c.hazard && blink ? 0.0 : 0.1) : 0.25 + night * 0.9;
      const braking = c.brake > 0.5 || c.state === 'park';
      const tailI = braking ? 1.0 : 0.14 + night * 0.4;
      const amber = c.hazard && blink;
      for (const s of [-1, 1]) {
        if (amber) col.setRGB(1, 0.55, 0.05).multiplyScalar(1.4); else col.setRGB(1, 0.95, 0.8).multiplyScalar(headI);
        this.put(this.lights, nl++, yawQ, s * t.W * 0.34, ly, t.L / 2 + 0.01, x, baseY, z, 0.34, 0.14, 0.06, col, tmp);
        if (amber) col.setRGB(1, 0.55, 0.05).multiplyScalar(1.4); else col.setRGB(1, 0.05, 0.03).multiplyScalar(tailI);
        this.put(this.lights, nl++, yawQ, s * t.W * 0.34, ly, -t.L / 2 - 0.01, x, baseY, z, 0.38, 0.14, 0.06, col, tmp);
      }
      if (t.emergency) {
        const y = t.clear + t.bodyH + t.cabinH + 0.07;
        const lit = c.siren;
        col.setRGB(1, 0.05, 0.04).multiplyScalar(lit ? (siren ? 3 : 0.15) : 0.12);
        this.put(this.lights, nl++, yawQ, -t.W * 0.2, y, t.cabinX, x, baseY, z, t.W * 0.34, 0.12, 0.3, col, tmp);
        col.setRGB(0.1, 0.25, 1).multiplyScalar(lit ? (siren ? 0.15 : 3) : 0.12);
        this.put(this.lights, nl++, yawQ, t.W * 0.2, y, t.cabinX, x, baseY, z, t.W * 0.34, 0.12, 0.3, col, tmp);
      }
      // headlight glow on the road ahead
      if (night > 0.12 && c.state !== 'wreck') {
        _p.set(0, 0.05, t.L / 2 + 6.5).applyQuaternion(yawQ);
        _m.compose(_p.add(_v.set(x, G + 0.05, z)), yawQ, _s.set(7, 1, 13));
        this.pools.setMatrixAt(np++, _m);
      }
    }
    this.body.count = this.cabin.count = nb;
    this.wheels.count = this.hubs.count = nw;
    this.lights.count = nl;
    this.pools.count = np;
    this.poolMat.opacity = night * 0.5;
    for (const m of [this.body, this.cabin, this.wheels, this.hubs, this.lights, this.pools]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
