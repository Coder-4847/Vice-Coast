import * as THREE from 'three';
import type { Collider, RigidBody } from '@dimforge/rapier3d-compat';
import { clamp, damp } from '../core/math';
import { GROUP, newProbe, type Physics, type Probe } from '../physics/Physics';
import { terrainHeight, waterLevelAt } from '../world/Terrain';
import type { CraftSpec } from './specs';

const G = 9.81;
const WORLD_GRAVITY = 16;
const groups = (member: number, filter: number): number => ((member << 16) | filter) >>> 0;

export interface CraftInput {
  /** −1 … 1 : stick forward (+) / back (−). Boats: throttle / reverse. Helicopters: forward flight. Planes: nose down (+) / up (−). */
  fwd: number;
  /** −1 (left) … +1 (right). */
  steer: number;
  /** −1 … 1 : helicopter collective, plane throttle lever rate. */
  lift: number;
  /** 0 … 1 : wheel brake / airbrake. */
  brake: number;
}

export interface Wheel {
  /** Local mount (x, z) relative to the centre of mass, and whether it is the steerable nose wheel. */
  x: number;
  z: number;
  nose: boolean;
  comp: number;
  prevComp: number;
  onGround: boolean;
  probe: Probe;
  spin: number;
  contact: THREE.Vector3;
}

const _pos = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _vel = new THREE.Vector3();
const _ang = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _p = new THREE.Vector3();
const _r = new THREE.Vector3();
const _vp = new THREE.Vector3();
const _vl = new THREE.Vector3();
const _t = new THREE.Vector3();
const _u = new THREE.Vector3();
const _w = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e = new THREE.Euler();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * A boat, helicopter or plane: one Rapier body with its own arcade force model.
 *  • Boats float on six buoyancy points, with thrust, a keel and rudder.
 *  • Helicopters hold an attitude commanded by the stick and trade collective for climb rate.
 *  • Planes have lift / drag / thrust from airspeed and angle of attack, damped and self-stabilising control surfaces,
 *    and spring-loaded landing gear on the ground.
 */
export class Craft {
  readonly body: RigidBody;
  readonly collider: Collider;
  readonly input: CraftInput = { fwd: 0, steer: 0, lift: 0, brake: 0 };
  readonly wheels: Wheel[] = [];
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  private readonly prevP = new THREE.Vector3();
  private readonly curP = new THREE.Vector3();
  private readonly prevQ = new THREE.Quaternion();
  private readonly curQ = new THREE.Quaternion();

  occupied = false;
  health = 1000;
  exploded = false;
  home: { x: number; y: number; z: number; yaw: number } | null = null;
  paint = 0xffffff;
  /** Simulated only while the player is in it or near it. */
  active = false;
  /** Visual-only door/hatch. */
  doorOpen = 0;

  // telemetry
  speed = 0;
  get speedKmh(): number {
    return Math.abs(this.speed) * 3.6;
  }
  /** Altitude above the ground / water below (m). */
  agl = 0;
  altitude = 0;
  vsi = 0;
  sub = 0;
  throttle = 0;
  /** 0 … 1 rotor / prop speed. */
  rotor = 0;
  rotorAngle = 0;
  propAngle = 0;
  /** 0 retracted … 1 extended. */
  gear = 1;
  gearCmd = 1;
  flaps = 0;
  stalled = false;
  grounded = false;
  impact = 0;
  headlights = false;
  roll = 0;
  pitch = 0;
  heading = 0;
  /** Engine load 0–1 for audio. */
  load = 0;
  burning = 0;
  /** Set when something in the world should be told of a crash. */
  crashed = false;
  /** Tanks / APCs: turret yaw relative to the hull, gun elevation, the pilot's wanted aim (world yaw / pitch) and weapon timers. */
  turretYaw = 0;
  gunPitch = 0;
  aimYaw = 0;
  aimPitch = 0;
  cannonT = 0;
  mgT = 0;
  gunKick = 0;

  private readonly iPitch: number;
  private readonly iYaw: number;
  private readonly iRoll: number;
  private readonly lastVel = new THREE.Vector3();
  private time = Math.random() * 100;
  private swellScale = 1;
  private readonly hook = (h: number): void => this.applyForces(h);

  constructor(private readonly physics: Physics, readonly spec: CraftSpec, x: number, y: number, z: number, yaw: number) {
    const R = physics.R;
    const { size, mass } = spec;
    this.iPitch = (mass / 12) * (size.height * size.height + size.length * size.length) * 0.9;
    this.iYaw = (mass / 12) * (size.width * size.width + size.length * size.length) * 0.9;
    this.iRoll = (mass / 12) * (size.width * size.width + size.height * size.height) * 0.9;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(x, y + spec.comHeight, z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setGravityScale(G / WORLD_GRAVITY)
      .setLinearDamping(0)
      .setAngularDamping(spec.kind === 'plane' ? 0 : 0.5)
      .setCcdEnabled(true)
      .setCanSleep(false)
      .setEnabled(false)
      .setAdditionalMassProperties(mass, { x: 0, y: 0, z: 0 }, { x: this.iPitch, y: this.iYaw, z: this.iRoll }, { x: 0, y: 0, z: 0, w: 1 });
    this.body = physics.world.createRigidBody(desc);
    const hull = spec.hull;
    this.collider = physics.world.createCollider(
      R.ColliderDesc.cuboid(hull.w / 2, hull.h / 2, hull.l / 2)
        .setTranslation(0, -spec.comHeight + hull.y, 0)
        .setDensity(0)
        .setFriction(spec.kind === 'boat' ? 0.15 : 0.45)
        .setRestitution(0.1)
        .setCollisionGroups(groups(GROUP.PROP | GROUP.VEHICLE, GROUP.WORLD | GROUP.PROP | GROUP.PLAYER | GROUP.VEHICLE)),
      this.body,
    );
    physics.tagSurface(this.collider, 'metal', this.body);
    if (spec.plane) {
      const g = spec.plane.gear;
      const mk = (wx: number, wz: number, nose: boolean): Wheel => ({ x: wx, z: wz, nose, comp: 0, prevComp: 0, onGround: false, probe: newProbe(), spin: 0, contact: new THREE.Vector3() });
      this.wheels.push(mk(g.nose[0], g.nose[1], true), mk(-g.main[0], g.main[1], false), mk(g.main[0], g.main[1], false));
    }
    if (spec.ground) {
      for (const [wx, wz] of spec.ground.mounts) this.wheels.push({ x: wx, z: wz, nose: false, comp: 0, prevComp: 0, onGround: false, probe: newProbe(), spin: 0, contact: new THREE.Vector3() });
    }
    this.curP.set(x, y + spec.comHeight, z);
    this.prevP.copy(this.curP);
    this.curQ.copy(q);
    this.prevQ.copy(q);
    this.position.copy(this.curP);
    this.quaternion.copy(q);
    this.paint = spec.paints[0]!;
    physics.substepHooks.push(this.hook);
  }

  dispose(): void {
    const i = this.physics.substepHooks.indexOf(this.hook);
    if (i >= 0) this.physics.substepHooks.splice(i, 1);
    this.physics.forget(this.collider);
    this.physics.world.removeRigidBody(this.body);
  }

  teleport(x: number, y: number, z: number, yaw: number): void {
    const q = _q.setFromEuler(_e.set(0, yaw, 0));
    this.body.setTranslation({ x, y: y + this.spec.comHeight, z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.curP.set(x, y + this.spec.comHeight, z);
    this.prevP.copy(this.curP);
    this.curQ.copy(q);
    this.prevQ.copy(q);
    this.position.copy(this.curP);
    this.quaternion.copy(q);
    this.lastVel.set(0, 0, 0);
    this.throttle = 0;
    this.rotor = 0;
    this.gear = this.gearCmd = 1;
    this.exploded = false;
    this.health = 1000;
    this.burning = 0;
    this.turretYaw = 0;
    this.gunPitch = 0;
    this.cannonT = 0;
  }

  setWeather(waves: number): void {
    this.swellScale = waves;
  }

  /** Wake or sleep the body as the player comes and goes. */
  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.body.setEnabled(on || this.occupied);
  }

  // ----------------------------------------------------------------------------------------------- per tick

  fixedUpdate(dt: number): void {
    if (!this.active && !this.occupied) return;
    const spec = this.spec;
    this.prevP.copy(this.curP);
    this.prevQ.copy(this.curQ);
    const t = this.body.translation();
    const rot = this.body.rotation();
    const lv = this.body.linvel();
    this.curP.set(t.x, t.y, t.z);
    this.curQ.set(rot.x, rot.y, rot.z, rot.w);
    _q.copy(this.curQ);
    _fwd.set(0, 0, -1).applyQuaternion(_q);
    _right.set(1, 0, 0).applyQuaternion(_q);
    _up.set(0, 1, 0).applyQuaternion(_q);
    _vel.set(lv.x, lv.y, lv.z);
    this.speed = _vel.dot(_fwd);
    this.vsi = lv.y;
    this.heading = Math.atan2(_fwd.x, -_fwd.z);
    this.pitch = Math.asin(clamp(_fwd.y, -1, 1));
    this.roll = Math.atan2(-_right.y, _up.y);
    const gnd = Math.max(terrainHeight(t.x, t.z), waterLevelAt(t.x, t.z));
    this.altitude = t.y - spec.comHeight;
    this.agl = this.altitude - gnd;
    this.time += dt;

    // crash detection: a velocity change the forces can't explain
    const dv = Math.hypot(lv.x - this.lastVel.x, lv.y - this.lastVel.y, lv.z - this.lastVel.z);
    const thresh = spec.kind === 'boat' ? 9 : spec.kind === 'ground' ? 16 : 10;
    this.impact = dv > thresh && this.agl < 400 ? dv : 0;
    if (this.impact > 0 && !this.exploded) {
      const wet = spec.kind === 'boat' ? 0.4 : spec.kind === 'ground' ? 0.3 : 1;
      this.health = Math.max(0, this.health - (this.impact - thresh * 0.6) * (this.impact - thresh * 0.6) * 1.1 * wet);
    }
    this.lastVel.copy(_vel);

    // pilot intent: lever, gear, flaps
    const inp = this.input;
    if (this.occupied && !this.exploded) {
      if (spec.kind === 'plane') {
        this.throttle = clamp(this.throttle + inp.lift * 0.5 * dt, 0, 1);
      } else {
        this.throttle = clamp(Math.max(inp.fwd, 0), 0, 1);
      }
      this.rotor = damp(this.rotor, 1, spec.kind === 'heli' ? 0.7 : 4, dt);
    } else {
      if (spec.kind === 'plane') this.throttle = damp(this.throttle, 0, 1.5, dt);
      this.rotor = damp(this.rotor, 0, spec.kind === 'heli' ? 0.35 : 2.5, dt);
    }
    if (this.exploded) this.rotor = damp(this.rotor, 0, 3, dt);
    if (spec.ground) this.updateTurret(dt);
    this.gear = damp(this.gear, this.gearCmd, 3.2, dt);
    const pl = spec.plane;
    if (pl) {
      this.flaps = damp(this.flaps, this.gearCmd > 0.5 && Math.abs(this.speed) < pl.stallSpeed * 1.5 ? 1 : 0, 2, dt);
      this.propAngle += (6 + this.throttle * 80 + this.rotor * 20) * (this.exploded ? 0 : this.occupied || this.throttle > 0.02 ? 1 : 0) * dt * (pl.jet ? 0 : 1);
    }
    if (spec.kind === 'heli') this.rotorAngle += this.rotor * 38 * dt;
    this.load = spec.kind === 'plane' ? this.throttle : spec.kind === 'heli' ? this.rotor * (0.5 + 0.5 * clamp(inp.lift, 0, 1)) : clamp(Math.abs(inp.fwd), 0, 1);
    if (this.exploded) this.burning = Math.min(1, this.burning + dt * 0.3);
  }

  interpolate(alpha: number): void {
    this.position.lerpVectors(this.prevP, this.curP, alpha);
    this.quaternion.slerpQuaternions(this.prevQ, this.curQ, alpha);
  }

  // ------------------------------------------------------------------------------------------- sub-step forces

  private applyForces(h: number): void {
    if (!this.active && !this.occupied) return;
    const body = this.body;
    const t = body.translation();
    const rot = body.rotation();
    const lv = body.linvel();
    const av = body.angvel();
    _pos.set(t.x, t.y, t.z);
    _q.set(rot.x, rot.y, rot.z, rot.w);
    _qi.copy(_q).invert();
    _vel.set(lv.x, lv.y, lv.z);
    _ang.set(av.x, av.y, av.z);
    _fwd.set(0, 0, -1).applyQuaternion(_q);
    _right.set(1, 0, 0).applyQuaternion(_q);
    _up.set(0, 1, 0).applyQuaternion(_q);
    _vl.copy(_vel).applyQuaternion(_qi);
    const k = this.spec.kind;
    if (k === 'boat') this.boatForces(h);
    else if (k === 'heli') this.heliForces(h);
    else if (k === 'ground') this.groundForces(h);
    else this.planeForces(h);
  }

  /** Surface height at (x, z): flat water with a gentle swell. */
  private waterY(x: number, z: number): number {
    const base = waterLevelAt(x, z);
    return base + this.swellScale * (0.16 * Math.sin(x * 0.21 + this.time * 0.9) + 0.11 * Math.sin(z * 0.17 - this.time * 0.7 + 1.3));
  }

  private boatForces(h: number): void {
    const spec = this.spec, b = spec.boat!, body = this.body;
    const m = spec.mass;
    const L = spec.hull.l, W = spec.hull.w;
    const pts: [number, number][] = [[0, -L * 0.42], [-W * 0.4, L * 0.4], [W * 0.4, L * 0.4], [-W * 0.42, 0], [W * 0.42, 0], [0, -L * 0.15]];
    const N = pts.length;
    const kPer = (m * G) / (N * b.draft);
    const cPer = 2 * 0.5 * Math.sqrt(kPer * (m / N));
    let sub = 0;
    for (const [px, pz] of pts) {
      _r.set(px, -spec.comHeight + 0.05, pz).applyQuaternion(_q);
      _p.copy(_pos).add(_r);
      _t.crossVectors(_ang, _r).add(_vel);
      const depth = this.waterY(_p.x, _p.z) - _p.y;
      if (depth <= -0.2) continue;
      const d = clamp(depth, 0, b.draft * 2.2 + 0.8);
      let f = kPer * d - cPer * _t.y * (depth > 0 ? 1 : 0.2);
      f = clamp(f, 0, (m * G * 3) / N);
      body.applyImpulseAtPoint({ x: 0, y: f * h, z: 0 }, { x: _p.x, y: _p.y, z: _p.z }, true);
      sub += clamp(depth / b.draft, 0, 1) / N;
    }
    this.sub = sub;
    const wet = clamp(sub * 1.4, 0, 1);
    const u = _vl.z * -1; // forward speed
    const s = _vl.x;
    const inp = this.input;
    const drive = this.occupied && !this.exploded;
    const thrCmd = drive ? clamp(inp.fwd, -1, 1) : 0;
    // thrust at the stern, drag along the hull
    const cd = (m * b.accel) / (b.vmax * b.vmax);
    let fx = 0;
    if (thrCmd > 0) fx = m * b.accel * thrCmd * (0.2 + 0.8 * wet);
    else if (thrCmd < 0) fx = m * b.accel * 0.4 * thrCmd * (0.2 + 0.8 * wet) * (u < -b.vmax * 0.3 ? 0 : 1);
    fx -= cd * u * Math.abs(u) * (0.3 + 0.7 * wet) + u * 18 * wet;
    _t.copy(_fwd).multiplyScalar(fx * h);
    const stern = _r.set(0, -spec.comHeight * 0.55, L * 0.45).applyQuaternion(_q).add(_pos);
    body.applyImpulseAtPoint({ x: _t.x, y: _t.y, z: _t.z }, { x: stern.x, y: stern.y, z: stern.z }, true);
    // keel: sideways resistance
    const fs = -(m * b.keel * s + m * 0.25 * s * Math.abs(s)) * wet;
    _t.copy(_right).multiplyScalar(fs * h);
    body.applyImpulse({ x: _t.x, y: 0, z: _t.z }, true);
    // rudder (yaw) with a little low-speed thrust vectoring, lean into turns
    const steer = drive ? inp.steer : 0;
    const dirn = u < -0.6 ? -1 : 1;
    const auth = clamp(Math.abs(u) / 7 + 0.35 * Math.abs(thrCmd), 0, 1) * (0.15 + 0.85 * wet);
    const wTarget = -steer * b.yawRate * auth * dirn;
    body.applyTorqueImpulse({ x: 0, y: this.iYaw * 4 * (wTarget - _ang.y) * h * wet, z: 0 }, true);
    // attitude: lean into the turn and plane slightly at speed; capsize recovery
    const lean = steer * clamp(Math.abs(u) / b.vmax, 0, 1) * 0.26 * dirn;
    _right.y = 0;
    _right.normalize();
    _u.copy(WORLD_UP).addScaledVector(_right, lean).addScaledVector(_fwd, 0).normalize();
    _w.crossVectors(_up, _u);
    const wTilt = _t.copy(_ang).addScaledVector(WORLD_UP, -_ang.y);
    const kp = _up.y < 0.25 ? 14 : 5.5;
    const I = (this.iPitch + this.iRoll) / 2;
    body.applyTorqueImpulse({ x: I * (kp * _w.x - 2.6 * wTilt.x) * h, y: 0, z: I * (kp * _w.z - 2.6 * wTilt.z) * h }, true);
    // bow rises with speed (planing trim)
    const trim = clamp(u / b.vmax, 0, 1) * 0.5 * this.iPitch * 0.9;
    _t.set(1, 0, 0).applyQuaternion(_q);
    body.applyTorqueImpulse({ x: _t.x * trim * h, y: _t.y * trim * h, z: _t.z * trim * h }, true);
  }

  private heliForces(h: number): void {
    const spec = this.spec, hp = spec.heli!, body = this.body;
    const m = spec.mass;
    const rotor = this.rotor;
    const power = rotor * rotor;
    const drive = this.occupied && !this.exploded && rotor > 0.7;
    const inp = this.input;
    const coll = drive ? clamp(inp.lift, -1, 1) : 0;
    const vyT = coll > 0 ? coll * hp.climb : coll * hp.descend;
    // collective: lift along the rotor axis, trading with climb rate (holds a hover with no input)
    let T = m * (G + 4.2 * ((drive ? vyT : -8) - _vel.y));
    if (!drive) T = rotor > 0.2 ? m * G * rotor * 0.9 : 0;
    T = clamp(T, 0, m * G * 2.1) * power;
    const tilt = Math.max(0.65, _up.y);
    _t.copy(_up).multiplyScalar((T / tilt) * h);
    body.applyImpulse({ x: _t.x, y: _t.y, z: _t.z }, true);
    // attitude: the stick tilts the rotor disc (forward flight, banking into turns)
    const pitchCmd = drive ? clamp(inp.fwd, -1, 1) : 0;
    const rollCmd = drive ? clamp(inp.steer, -1, 1) : 0;
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-4) _fwd.set(0, 0, -1).applyQuaternion(_q).setY(0);
    _fwd.normalize();
    _right.y = 0;
    _right.normalize();
    _u.copy(WORLD_UP).addScaledVector(_fwd, pitchCmd * Math.tan(hp.pitchMax)).addScaledVector(_right, rollCmd * Math.tan(hp.rollMax)).normalize();
    _w.crossVectors(_up, _u);
    const wTilt = _t.copy(_ang).addScaledVector(WORLD_UP, -_ang.y);
    const I = (this.iPitch + this.iRoll) / 2;
    const att = 0.25 + 0.75 * power;
    body.applyTorqueImpulse({ x: I * (9 * _w.x - 4.2 * wTilt.x) * h * att, y: 0, z: I * (9 * _w.z - 4.2 * wTilt.z) * h * att }, true);
    // yaw: pedals
    const yawT = drive ? -clamp(inp.steer, -1, 1) * hp.yawRate : 0;
    body.applyTorqueImpulse({ x: 0, y: this.iYaw * (5 * (yawT - _ang.y)) * h * (0.3 + 0.7 * power), z: 0 }, true);
    // drag
    const sp = _vel.length();
    _t.copy(_vel).multiplyScalar(-(hp.drag * sp + 0.05) * m * h);
    body.applyImpulse({ x: _t.x, y: _t.y * 0.4, z: _t.z }, true);
    this.grounded = this.agl < 1.2;
  }

  private planeForces(h: number): void {
    const spec = this.spec, pl = spec.plane!, body = this.body;
    const inp = this.input;
    const drive = this.occupied && !this.exploded;
    const u = -_vl.z;
    const speed = _vel.length();
    const rho = 1.2;
    const q = 0.5 * rho * speed * speed;
    // angle of attack and sideslip from the velocity in the body frame
    const alpha = speed > 2 ? Math.atan2(-_vl.y, Math.max(u, 1)) : 0;
    const beta = speed > 2 ? Math.atan2(_vl.x, Math.max(Math.abs(u), 1)) : 0;
    const absA = Math.abs(alpha);
    let CL = pl.cl0 + 0.35 * this.flaps + pl.clSlope * clamp(alpha, -pl.stallAlpha, pl.stallAlpha) * (1 - 0.1 * this.flaps);
    CL = clamp(CL, -pl.clMax, pl.clMax);
    this.stalled = speed > 12 && absA > pl.stallAlpha * 1.05;
    if (absA > pl.stallAlpha) CL *= clamp(1 - 2.6 * (absA - pl.stallAlpha), 0.35, 1);
    const CD = pl.cd0 + pl.kInduced * CL * CL + 0.012 * this.flaps + (this.gear > 0.5 ? 0.01 : 0) + (absA > pl.stallAlpha ? 0.4 * (absA - pl.stallAlpha) : 0);
    const eff = clamp(speed / pl.ctrlSpeed, 0.12, 1.25);
    const eff2 = clamp(speed / pl.ctrlSpeed, 0, 1.2) ** 2;
    // forces
    const lift = q * pl.wingArea * CL * (pl.level > 0.3 ? 1 / Math.max(Math.cos(clamp(this.roll, -1.2, 1.2)), 0.45) : 1); // arcade: banked turns hold altitude
    const drag = q * pl.wingArea * CD;
    let thrust = 0;
    if (drive || this.throttle > 0.01) {
      const rel = clamp(u / pl.vmaxThrust, 0, 1);
      thrust = pl.thrust * this.throttle * (pl.jet ? Math.max(0, 1 - rel * rel) : Math.max(0, 1 - rel)) * (this.exploded ? 0 : 1);
    }
    _t.copy(_up).multiplyScalar(lift);
    if (speed > 0.5) _t.addScaledVector(_vel, -drag / speed);
    _t.addScaledVector(_right, -q * pl.wingArea * 1.6 * beta);
    body.applyImpulse({ x: _t.x * h, y: _t.y * h, z: _t.z * h }, true);
    // On the ground the thrust is applied down at axle height so a hard throttle never tips the nose up; it blends back to the CoM in the air.
    const low = clamp(1 - this.agl / 1.5, 0, 1) * 0.85 * spec.comHeight;
    _p.copy(_pos).addScaledVector(_up, -low);
    body.applyImpulseAtPoint({ x: _fwd.x * thrust * h, y: _fwd.y * thrust * h, z: _fwd.z * thrust * h }, { x: _p.x, y: _p.y, z: _p.z }, true);

    // moments (angular accelerations in the body frame × inertia)
    let elev = drive ? -clamp(inp.fwd, -1, 1) : 0; // +1 = nose up
    // Arcade stall protection: the elevator fades out as the angle of attack nears the stall, so full back-stick holds the wing just under it.
    if (elev > 0 && alpha > pl.stallAlpha * 0.8) elev *= clamp((pl.stallAlpha * 1.05 - alpha) / (pl.stallAlpha * 0.25), 0, 1);
    else if (elev < 0 && alpha < -pl.stallAlpha * 0.8) elev *= clamp((pl.stallAlpha * 1.05 + alpha) / (pl.stallAlpha * 0.25), 0, 1);
    const roll = drive ? clamp(inp.steer, -1, 1) : 0;
    _w.copy(_ang).applyQuaternion(_qi); // body-frame angular velocity (x pitch, y yaw, z roll about +z)
    const ground = this.wheels.some((w) => w.onGround);
    // The stick commands a pitch RATE (so releasing it holds the attitude), the wing weathercocks into the airflow, and a gentle assist brings the nose back to the horizon.
    const sp = clamp(speed / pl.ctrlSpeed, 0, 1);
    const maxRate = pl.pitchPower * 0.2;
    if (pl.level > 0.3 && !ground) {
      // keep touring planes out of vertical dives and zoom-climbs
      if (elev > 0 && this.pitch > 0.95) elev *= clamp((1.25 - this.pitch) / 0.3, 0, 1);
      else if (elev < 0 && this.pitch < -0.85) elev *= clamp((1.15 + this.pitch) / 0.3, 0, 1);
    }
    let ax = (ground ? 4.6 : 3.4) * (elev * maxRate * Math.min(eff, 1) - _w.x) * (0.5 + 0.5 * eff) - (ground ? 0.8 : 3.0) * clamp(alpha, -0.5, 0.5) * eff2;
    // Touring planes command a bank ANGLE (stick right = bank right, release = wings level); the stunt plane commands a roll RATE.
    const easy = pl.level > 0.3;
    let az: number;
    if (easy && !ground) {
      const rateCmd = clamp((roll * 1.1 - this.roll) * 2.4, -1.4, 1.4) * Math.min(1, 0.35 + eff);
      az = -3.6 * (rateCmd + _w.z) * (0.5 + 0.5 * eff);
    } else {
      az = -(pl.rollPower * roll * eff) - 3.0 * _w.z * (0.5 + 0.5 * eff); // roll right = rotation about forward = −z
    }
    let ay = -2.5 * beta * eff2 - 1.8 * _w.y * (0.5 + 0.5 * eff) - pl.yawPower * roll * 0.35 * eff;
    if (easy && !ground) ax += 1.1 * Math.abs(Math.sin(this.roll)) * sp; // pull a little in a bank so the nose doesn't drop
    // stick released: settle onto level flight by trimming the flight-path angle (not the pitch, which a wing needs positive to carry its weight)
    if (!ground && Math.abs(elev) < 0.08) ax += pl.level * 6 * clamp(-_vel.y / Math.max(speed, 12), -0.5, 0.5) * Math.max(sp, 0.3) - pl.level * 0.4 * clamp(this.pitch, -1, 1);
    // wings level themselves when the stick is released (arcade assist), upright or inverted
    if (!easy && Math.abs(roll) < 0.05 && !ground) az += pl.level * 5 * Math.sin(this.roll) * Math.max(sp, 0.3);
    if (this.stalled) ax -= 1.8 * (absA - pl.stallAlpha) * 6;
    // nose-wheel steering on the ground
    if (ground) ay += -(drive ? inp.steer : 0) * 1.5 * clamp(Math.abs(u) / 8, 0.15, 1);
    _t.set(this.iPitch * ax, this.iYaw * ay, this.iRoll * az).applyQuaternion(_q);
    body.applyTorqueImpulse({ x: _t.x * h, y: _t.y * h, z: _t.z * h }, true);

    this.landingGear(h, drive);
  }

  // ---------------------------------------------------------------------------------- tanks and APCs

  private updateTurret(dt: number): void {
    const g = this.spec.ground!;
    this.cannonT = Math.max(0, this.cannonT - dt);
    this.mgT = Math.max(0, this.mgT - dt);
    this.gunKick = damp(this.gunKick, 0, 7, dt);
    if (!this.occupied || this.exploded) return;
    const hullYaw = -this.heading;
    const want = Math.atan2(Math.sin(this.aimYaw - hullYaw), Math.cos(this.aimYaw - hullYaw));
    const diff = Math.atan2(Math.sin(want - this.turretYaw), Math.cos(want - this.turretYaw));
    this.turretYaw += clamp(diff, -g.turret.rate * dt, g.turret.rate * dt);
    const wp = clamp(this.aimPitch - this.pitch * Math.cos(this.turretYaw), g.turret.pitchMin, g.turret.pitchMax);
    this.gunPitch += clamp(wp - this.gunPitch, -g.turret.rate * 0.7 * dt, g.turret.rate * 0.7 * dt);
  }

  /** Muzzle position and firing direction in world space (uses the interpolated render pose). */
  muzzle(outPos: THREE.Vector3, outDir: THREE.Vector3): void {
    const t = this.spec.ground!.turret;
    _e.set(this.gunPitch, this.turretYaw, 0, 'YXZ');
    _t.set(0, 0, -1).applyEuler(_e);
    outDir.copy(_t).applyQuaternion(this.quaternion);
    outPos.copy(_t).multiplyScalar(t.muzzle).add(_u.set(t.x, t.y, t.z)).applyQuaternion(this.quaternion).add(this.position);
  }

  /** Spring-damper track contacts, a velocity-controlled drive along the ground and a skid-steer yaw controller. */
  private groundForces(h: number): void {
    const spec = this.spec, g = spec.ground!, body = this.body, m = spec.mass, inp = this.input;
    const drive = this.occupied && !this.exploded;
    const n = this.wheels.length;
    const len = g.strut;
    const kS = (m * G) / (n * g.rest);
    const cS = 2 * 0.65 * Math.sqrt(kS * (m / n));
    const thr = drive ? clamp(inp.fwd, -1, 1) : 0;
    const steer = drive ? clamp(inp.steer, -1, 1) : 0;
    const brake = drive ? inp.brake : 0;
    let contacts = 0;
    for (const w of this.wheels) {
      _r.set(w.x, -spec.comHeight + (len - g.rest), w.z).applyQuaternion(_q);
      _p.copy(_pos).add(_r);
      _n.set(0, -1, 0).applyQuaternion(_q);
      this.physics.probe(_p.x, _p.y, _p.z, _n.x, _n.y, _n.z, len, this.collider, w.probe);
      if (!w.probe.hit) { w.onGround = false; w.comp = 0; continue; }
      w.onGround = true;
      contacts++;
      w.comp = len - w.probe.distance;
      w.contact.set(w.probe.px, w.probe.py, w.probe.pz);
      _vp.crossVectors(_ang, _t.copy(w.contact).sub(_pos)).add(_vel);
      _u.set(w.probe.nx, w.probe.ny, w.probe.nz);
      const vc = -_vp.dot(_u);
      const N = clamp(kS * w.comp + cS * vc, 0, ((m * G) / n) * 3.5);
      body.applyImpulseAtPoint({ x: _u.x * N * h, y: _u.y * N * h, z: _u.z * N * h }, { x: w.contact.x, y: w.contact.y, z: w.contact.z }, true);
      const fwdG = _t.copy(_fwd).addScaledVector(_u, -_fwd.dot(_u));
      if (fwdG.lengthSq() < 1e-6) continue;
      fwdG.normalize();
      const rightG = _w.crossVectors(fwdG, _u).multiplyScalar(-1);
      const vLong = _vel.dot(fwdG), vLat = _vel.dot(rightG);
      const mu = w.probe.surface === 'sand' || w.probe.surface === 'dirt' ? 0.85 : 1.05;
      const tv = brake > 0.1 ? 0 : thr >= 0 ? thr * g.vmax : thr * g.vrev;
      const dv = tv - vLong;
      const speedingUp = Math.abs(tv) > Math.abs(vLong) && tv * vLong >= 0;
      const aCap = speedingUp ? g.accel : g.accel * 1.5 + brake * 6;
      const F = clamp(clamp(dv * 3, -aCap, aCap) * (m / n), -mu * N, mu * N);
      const fLat = clamp(-vLat * (m / n) * 14, -mu * N * 1.25, mu * N * 1.25);
      body.applyImpulseAtPoint(
        { x: (fwdG.x * F + rightG.x * fLat) * h, y: (fwdG.y * F + rightG.y * fLat) * h, z: (fwdG.z * F + rightG.z * fLat) * h },
        { x: w.contact.x, y: w.contact.y + 0.15, z: w.contact.z },
        true,
      );
    }
    this.grounded = contacts > 0;
    if (contacts >= 2) {
      // skid steer: command a yaw rate (clockwise from above when steering right), softer at speed
      const wy = _ang.dot(_up);
      const cmd = -steer * g.turnRate * (1 - 0.35 * clamp(Math.abs(this.speed) / g.vmax, 0, 1)) * (this.speed < -1 ? -1 : 1);
      const tq = (cmd - wy) * this.iYaw * 7 * (contacts / n);
      body.applyTorqueImpulse({ x: _up.x * tq * h, y: _up.y * tq * h, z: _up.z * tq * h }, true);
    }
  }

  private landingGear(h: number, drive: boolean): void {
    const spec = this.spec, pl = spec.plane!, body = this.body;
    const m = spec.mass;
    const extended = this.gear > 0.85;
    const dropDist = 0.55;
    const len = dropDist + 0.25;
    const inp = this.input;
    let any = false;
    const kS = (m * G) / (3 * 0.14);
    const cS = 2 * 0.55 * Math.sqrt(kS * (m / 3));
    for (const w of this.wheels) {
      if (!extended) { w.onGround = false; w.comp = 0; continue; }
      _r.set(w.x, -spec.comHeight + (len - 0.14), w.z).applyQuaternion(_q);
      _p.copy(_pos).add(_r);
      _n.set(0, -1, 0).applyQuaternion(_q);
      this.physics.probe(_p.x, _p.y, _p.z, _n.x, _n.y, _n.z, len, this.collider, w.probe);
      w.prevComp = w.comp;
      if (!w.probe.hit) { w.onGround = false; w.comp = 0; continue; }
      w.onGround = true;
      any = true;
      w.comp = len - w.probe.distance;
      w.contact.set(w.probe.px, w.probe.py, w.probe.pz);
      _vp.crossVectors(_ang, _t.copy(w.contact).sub(_pos)).add(_vel);
      _u.set(w.probe.nx, w.probe.ny, w.probe.nz);
      const vc = -_vp.dot(_u);
      const N = clamp(kS * w.comp + cS * vc, 0, m * G * 2.2);
      body.applyImpulseAtPoint({ x: _u.x * N * h, y: _u.y * N * h, z: _u.z * N * h }, { x: w.contact.x, y: w.contact.y, z: w.contact.z }, true);
      // tyre friction in the ground plane
      const fwdG = _t.copy(_fwd).addScaledVector(_u, -_fwd.dot(_u));
      if (fwdG.lengthSq() < 1e-6) continue;
      fwdG.normalize();
      const rightG = _w.crossVectors(fwdG, _u).multiplyScalar(-1);
      const vLong = _vp.dot(fwdG), vLat = _vp.dot(rightG);
      const mu = w.probe.surface === 'dirt' || w.probe.surface === 'sand' ? 0.55 : 0.9;
      const brake = drive ? inp.brake : 0;
      let fLong = -Math.sign(vLong) * Math.min(Math.abs(vLong) * (m / 3) * (2 + brake * 12) / 1, mu * N * (0.03 + brake * 0.9));
      if (Math.abs(vLong) < 0.2) fLong = -vLong * (m / 3) * (brake > 0.1 ? 4 : 0.4);
      const fLat = clamp(-vLat * (m / 3) * 12, -mu * N * 1.1, mu * N * 1.1) * (w.nose ? 0.55 : 1);
      w.spin += (vLong / 0.3) * h;
      body.applyImpulseAtPoint(
        { x: (fwdG.x * fLong + rightG.x * fLat) * h, y: (fwdG.y * fLong + rightG.y * fLat) * h, z: (fwdG.z * fLong + rightG.z * fLat) * h },
        { x: w.contact.x, y: w.contact.y + 0.2, z: w.contact.z },
        true,
      );
    }
    this.grounded = any;
    void pl;
  }

  /** Damage from shots, explosions and crashes. Returns true on the hit that destroys it. */
  hurt(amount: number): boolean {
    if (this.exploded) return false;
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }
}
