import * as THREE from 'three';
import type { Collider, RigidBody } from '@dimforge/rapier3d-compat';
import { clamp, damp } from '../core/math';
import { GROUP, newProbe, type Physics, type Probe, type Surface } from '../physics/Physics';
import type { VehicleSpec } from './specs';

/** Vehicles use closer-to-real gravity than the snappy on-foot world gravity (16 m/s²). */
const G = 9.81;
const WORLD_GRAVITY = 16;
const groups = (member: number, filter: number): number => ((member << 16) | filter) >>> 0;

export interface VehicleInput {
  /** 0–1 */
  throttle: number;
  /** 0–1 (brake, or reverse from standstill) */
  brake: number;
  /** −1 (left) … +1 (right) */
  steer: number;
  handbrake: boolean;
}

export interface WheelState {
  /** Tyre shot out / burst on a spike strip: much less grip. */
  popped: boolean;
  /** Local mount position (x, z). */
  x: number;
  z: number;
  /** Local Y of the suspension mount. */
  mountY: number;
  front: boolean;
  driven: boolean;
  stiffness: number;
  damping: number;
  comp: number;
  prevComp: number;
  steer: number;
  /** Accumulated rotation (radians) for the visual. */
  spin: number;
  onGround: boolean;
  /** Was the wheel on the ground in the previous sub-step? (Damper velocity is only valid if so.) */
  wasOnGround: boolean;
  load: number;
  /** Tyre slip magnitude 0–1+ (1 = at the limit). */
  slip: number;
  sliding: boolean;
  surface: Surface;
  vLong: number;
  probe: Probe;
  /** Visual suspension compression, metres (smoothed). */
  visualComp: number;
  contact: THREE.Vector3;
}

const SURFACE_MU: Record<Surface, number> = {
  asphalt: 1, concrete: 0.95, dirt: 0.7, sand: 0.6, metal: 0.9, wood: 0.85, glass: 0.5, water: 0.45, flesh: 0.6,
};

// scratch
const _pos = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _ang = new THREE.Vector3();
const _r = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _wf = new THREE.Vector3();
const _wr = new THREE.Vector3();
const _v = new THREE.Vector3();
const _e = new THREE.Euler();

/**
 * A raycast vehicle with its own tyre model, built on a Rapier rigid body.
 *
 * Suspension: spring-damper along each wheel ray with bump-stops and anti-roll bars.
 * Tyres: slip-angle lateral force (Pacejka-style) inside a friction circle shared with the longitudinal force —
 * so spinning the wheels costs cornering grip (power oversteer) and the handbrake can break the rears loose.
 * Drivetrain: torque curve, automatic gearbox with shift cut, engine braking, rev limiter.
 */
export class Vehicle {
  readonly body: RigidBody;
  readonly collider: Collider;
  readonly input: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  readonly wheels: WheelState[] = [];

  // interpolated render transform
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  private readonly prevP = new THREE.Vector3();
  private readonly curP = new THREE.Vector3();
  private readonly prevQ = new THREE.Quaternion();
  private readonly curQ = new THREE.Quaternion();

  // telemetry
  /** Signed forward speed, m/s. */
  speed = 0;
  get speedKmh(): number {
    return Math.abs(this.speed) * 3.6;
  }
  /** Lateral (sideways) speed, m/s, and body slip angle in radians. */
  sideSpeed = 0;
  slipAngle = 0;
  yawRate = 0;
  rpm = 0;
  gear = 1;
  reversing = false;
  steerAngle = 0;
  /** Longitudinal / lateral acceleration in g, smoothed (for camera/audio effects). */
  gLong = 0;
  gLat = 0;
  /** Highest tyre slip this frame 0–1 (drives squeal and skid marks). */
  skid = 0;
  airborne = false;
  /** Impact strength of the last collision (0 if none this frame). */
  impact = 0;
  /** 0–1 engine load for audio. */
  load = 0;
  /** Set on a gear change this frame. */
  shifted = false;
  braking = false;
  headlights = false;
  /** Visual-only: door open amount (0–1) and driver present. */
  doorOpen = 0;
  occupied = false;
  health = 1000;
  /** Burnt-out wreck (cannot be driven or entered). */
  exploded = false;
  /** World spawn slot, used when the lot is reset after wasted/busted. */
  home: { x: number; z: number; yaw: number } | null = null;
  /** Set for vehicles the player owns (garage / customisation). */
  ownedUid: string | null = null;
  custom: import('../economy/types').VehicleCustom | null = null;

  static wetness = 0;

  private readonly staticLoad: number;
  private lastVel = new THREE.Vector3();
  private shiftTimer = 0;
  private cutTimer = 0;
  private engineForce = 0;
  private brakeForce = 0;
  private holdBrake = 0;
  private readonly finalDrive: number;
  private readonly isBike: boolean;
  private readonly drivenCount: number;

  constructor(private readonly physics: Physics, readonly spec: VehicleSpec, x: number, y: number, z: number, yaw: number) {
    const R = physics.R;
    this.isBike = spec.kind === 'bike';
    const { size, mass } = spec;

    // Mass properties on the body (centre of mass at the origin, which sits `comHeight` above the ground).
    const iPitch = (mass / 12) * (size.height * size.height + size.length * size.length) * 0.9;
    const iYaw = (mass / 12) * (size.width * size.width + size.length * size.length) * 0.8;
    const iRoll = (mass / 12) * (size.width * size.width + size.height * size.height) * (this.isBike ? 0.55 : 1.0);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(x, y + spec.comHeight, z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setGravityScale(G / WORLD_GRAVITY)
      .setLinearDamping(0.02)
      .setAngularDamping(this.isBike ? 0.4 : 0.9)
      .setCcdEnabled(true)
      .setAdditionalMassProperties(mass, { x: 0, y: 0, z: 0 }, { x: iPitch, y: iYaw, z: iRoll }, { x: 0, y: 0, z: 0, w: 1 });
    this.body = physics.world.createRigidBody(desc);
    this.collider = physics.world.createCollider(
      R.ColliderDesc.cuboid(size.width / 2, size.height / 2, size.length / 2)
        .setTranslation(0, -spec.comHeight + spec.clearance + size.height / 2, 0)
        .setDensity(0)
        .setFriction(0.25)
        .setRestitution(0.15)
        .setCollisionGroups(groups(GROUP.PROP | GROUP.VEHICLE, GROUP.WORLD | GROUP.PROP | GROUP.PLAYER | GROUP.VEHICLE)),
      this.body,
    );
    physics.tagSurface(this.collider, 'metal', this.body);

    // --- wheels ------------------------------------------------------------------------------------------
    const layout: [number, number, boolean][] = this.isBike
      ? [[0, -spec.wheelbase / 2, true], [0, spec.wheelbase / 2, false]]
      : [
          [-spec.track / 2, -spec.wheelbase / 2, true], [spec.track / 2, -spec.wheelbase / 2, true],
          [-spec.track / 2, spec.wheelbase / 2, false], [spec.track / 2, spec.wheelbase / 2, false],
        ];
    const n = layout.length;
    this.staticLoad = (mass * G) / n;
    for (const [wx, wz, front] of layout) {
      const hz = front ? spec.suspension.frontHz : spec.suspension.rearHz;
      const cornerMass = mass / n;
      const k = Math.pow(2 * Math.PI * hz, 2) * cornerMass;
      const c = 2 * spec.suspension.dampingRatio * Math.sqrt(k * cornerMass);
      const x0 = this.staticLoad / k;
      const driven = spec.drive === 'awd' || (spec.drive === 'fwd' && front) || (spec.drive === 'rwd' && !front);
      this.wheels.push({
        x: wx, z: wz, mountY: -spec.comHeight + spec.wheelRadius + (spec.suspension.rest - x0), front, driven,
        stiffness: k, damping: c, comp: x0, prevComp: x0, steer: 0, spin: 0, onGround: false, wasOnGround: false, popped: false, load: 0, slip: 0,
        sliding: false, surface: 'asphalt', vLong: 0, probe: newProbe(), visualComp: x0, contact: new THREE.Vector3(),
      });
    }
    this.drivenCount = this.wheels.filter((w) => w.driven).length;

    // Final drive so that redline in top gear gives the rated top speed.
    const topRatio = spec.engine.gears[spec.engine.gears.length - 1]!;
    const vTop = spec.engine.topSpeedKmh / 3.6;
    this.finalDrive = ((spec.engine.redlineRpm * 2 * Math.PI) / 60) * spec.wheelRadius / (vTop * topRatio);

    this.rpm = spec.engine.idleRpm;
    this.curP.set(x, y + spec.comHeight, z);
    this.prevP.copy(this.curP);
    this.curQ.copy(q);
    this.prevQ.copy(q);
    this.position.copy(this.curP);
    this.quaternion.copy(q);
    physics.substepHooks.push(this.hook);
  }

  /** Remove from the physics world. */
  dispose(): void {
    const i = this.physics.substepHooks.indexOf(this.hook);
    if (i >= 0) this.physics.substepHooks.splice(i, 1);
    this.physics.forget(this.collider);
    this.physics.world.removeRigidBody(this.body);
  }

  private readonly hook = (h: number): void => this.applyForces(h);

  /** Place the vehicle upright at a spot (ground-level coordinates). */
  teleport(x: number, y: number, z: number, yaw: number): void {
    const q = _q.setFromEuler(_e.set(0, yaw, 0));
    this.body.setTranslation({ x, y: y + this.spec.comHeight + 0.03, z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.curP.set(x, y + this.spec.comHeight, z);
    this.prevP.copy(this.curP);
    this.curQ.copy(q);
    this.prevQ.copy(q);
  }

  // ------------------------------------------------------------------------------------ per-frame

  /** Called once per 1/60 s frame (before the physics sub-steps): drivetrain, steering, gearbox. */
  fixedUpdate(dt: number): void {
    const spec = this.spec;
    const eng = spec.engine;
    const inp = this.input;
    this.shifted = false;

    // --- state from the body -------------------------------------------------------------------------
    const rot = this.body.rotation();
    _q.set(rot.x, rot.y, rot.z, rot.w);
    _fwd.set(0, 0, -1).applyQuaternion(_q);
    _right.set(1, 0, 0).applyQuaternion(_q);
    const lv = this.body.linvel();
    _vel.set(lv.x, lv.y, lv.z);
    const av = this.body.angvel();
    this.speed = _vel.dot(_fwd);
    this.sideSpeed = _vel.dot(_right);
    this.yawRate = av.y;
    this.slipAngle = Math.abs(this.speed) > 2 ? Math.atan2(this.sideSpeed, Math.abs(this.speed)) : 0;

    // accelerations (g), smoothed
    const ax = (_vel.x - this.lastVel.x) / dt;
    const ay = (_vel.y - this.lastVel.y) / dt;
    const az = (_vel.z - this.lastVel.z) / dt;
    _v.set(ax, ay, az);
    this.gLong = damp(this.gLong, _v.dot(_fwd) / G, 6, dt);
    this.gLat = damp(this.gLat, _v.dot(_right) / G, 6, dt);
    // collision detection: a sudden velocity change that isn't from the tyres or gravity
    const dv = Math.hypot(_vel.x - this.lastVel.x, _vel.z - this.lastVel.z);
    this.impact = dv > 4.5 && !this.airborne ? dv : 0;
    if (this.impact > 0) this.health = Math.max(0, this.health - this.impact * this.impact * 0.9);
    this.lastVel.copy(_vel);

    // --- driver intent ----------------------------------------------------------------------------------
    const fs = this.speed;
    let throttle = 0;
    let brakeAmt = 0;
    let dir = 1;
    if (fs > 1.2) {
      throttle = inp.throttle; brakeAmt = inp.brake; dir = 1;
    } else if (fs < -1.2) {
      throttle = inp.brake; brakeAmt = inp.throttle; dir = -1;
    } else if (inp.throttle > 0.02 && inp.throttle >= inp.brake) {
      throttle = inp.throttle; dir = 1;
    } else if (inp.brake > 0.02 && eng.reverseRatio > 0) {
      throttle = inp.brake; dir = -1;
    } else if (inp.brake > 0.02) {
      brakeAmt = inp.brake;
    }
    this.reversing = dir < 0 && throttle > 0;
    this.braking = brakeAmt > 0.05;
    // gentle hold when stopped and idle so it doesn't creep on slopes
    this.holdBrake = Math.abs(fs) < 0.6 && throttle < 0.02 && !inp.handbrake ? 0.35 : 0;

    // --- gearbox & engine ---------------------------------------------------------------------------------
    let wheelSpeed = 0;
    let grounded = 0;
    for (const w of this.wheels) if (w.driven && w.onGround) { wheelSpeed += Math.abs(w.vLong); grounded++; }
    wheelSpeed = grounded ? wheelSpeed / grounded : Math.abs(fs);
    const wheelRpm = (wheelSpeed / spec.wheelRadius) * 60 / (2 * Math.PI);
    const gearIdx = clamp(this.gear, 1, eng.gears.length) - 1;
    const ratio = (this.reversing ? eng.reverseRatio : eng.gears[gearIdx]!) * this.finalDrive;
    let engineRpm = wheelRpm * ratio;
    // clutch slip at launch: the engine can rev above what the wheels demand
    const launch = eng.idleRpm + (eng.peakTorqueRpm * 0.75 - eng.idleRpm) * throttle;
    engineRpm = Math.max(engineRpm, launch * (wheelRpm * ratio < launch ? 1 : 0), eng.idleRpm);
    this.rpm = damp(this.rpm, Math.min(engineRpm, eng.redlineRpm * 1.02), 18, dt);

    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    this.cutTimer = Math.max(0, this.cutTimer - dt);
    if (!this.reversing) {
      if (this.shiftTimer <= 0) {
        if (this.rpm > eng.redlineRpm * 0.94 && this.gear < eng.gears.length && throttle > 0.1) { this.gear++; this.afterShift(); }
        else if (this.gear > 1 && (this.rpm < eng.redlineRpm * 0.38 || (throttle > 0.85 && this.rpm < eng.peakTorqueRpm * 0.72 && this.speed > 4 && wheelRpm * eng.gears[gearIdx - 1]! * this.finalDrive < eng.redlineRpm * 0.85))) { this.gear--; this.afterShift(); }
      }
      if (Math.abs(fs) < 1.5 && this.gear > 1) this.gear = 1;
    }

    // torque curve: parabola around the peak, falling off toward idle and redline
    const spread = (this.rpm - eng.peakTorqueRpm) / (this.rpm > eng.peakTorqueRpm ? eng.redlineRpm - eng.peakTorqueRpm : eng.peakTorqueRpm - eng.idleRpm);
    const curve = clamp(1 - 0.55 * spread * spread, 0.3, 1);
    let torque = eng.peakTorque * curve * throttle;
    if (this.cutTimer > 0) torque *= 0.1;
    if (this.rpm >= eng.redlineRpm) torque = 0; // rev limiter
    // engine braking when off the throttle
    const engineBrake = throttle < 0.05 ? 0.07 * eng.peakTorque * (this.rpm / eng.redlineRpm) : 0;
    const wheelForce = (torque * ratio * 0.9 - engineBrake * Math.abs(ratio) * Math.sign(fs || 1)) / spec.wheelRadius;
    this.engineForce = wheelForce * dir;
    this.load = clamp(throttle * (0.4 + 0.6 * curve), 0, 1);
    this.brakeForce = brakeAmt * spec.brake.force;

    // --- steering -----------------------------------------------------------------------------------------
    const vAbs = Math.abs(fs);
    const sp = spec.steer;
    const maxDeg = sp.maxDeg + (sp.highSpeedDeg - sp.maxDeg) * clamp(vAbs / 45, 0, 1) ** 0.7;
    let target = inp.steer * THREE.MathUtils.degToRad(maxDeg);
    // counter-steer assist: when the tail slides out, point the wheels where the car is actually going
    if (spec.assist.counterSteer > 0 && vAbs > 5 && !inp.handbrake) {
      const assist = clamp(this.slipAngle * spec.assist.counterSteer * (fs > 0 ? 1 : -1), -0.3, 0.3);
      target += assist * (1 - 0.6 * Math.abs(inp.steer));
    } else if (inp.handbrake && vAbs > 6) {
      // during a handbrake slide give a little extra lock so the drift can be steered
      target *= 1.15;
    }
    const rate = sp.rate * (Math.abs(inp.steer) < 0.02 ? sp.centering / sp.rate : 1);
    const d = target - this.steerAngle;
    this.steerAngle += clamp(d, -rate * dt, rate * dt);
    for (const w of this.wheels) if (w.front) w.steer = this.steerAngle;

    // --- airborne / history -----------------------------------------------------------------------------------
    let touching = 0;
    for (const w of this.wheels) if (w.onGround) touching++;
    this.airborne = touching === 0;

    // render interpolation snapshot
    this.prevP.copy(this.curP);
    this.prevQ.copy(this.curQ);
    const t = this.body.translation();
    this.curP.set(t.x, t.y, t.z);
    this.curQ.copy(_q);
  }

  private afterShift(): void {
    this.shiftTimer = 0.45;
    this.cutTimer = 0.12;
    this.shifted = true;
  }

  /** Render transform, interpolated between the last two fixed states. */
  interpolate(alpha: number): void {
    this.position.lerpVectors(this.prevP, this.curP, alpha);
    this.quaternion.slerpQuaternions(this.prevQ, this.curQ, alpha);
  }

  // ----------------------------------------------------------------------------------- sub-step forces

  private applyForces(h: number): void {
    const spec = this.spec;
    const body = this.body;
    const t = body.translation();
    const rot = body.rotation();
    const lv = body.linvel();
    const av = body.angvel();
    _pos.set(t.x, t.y, t.z);
    _q.set(rot.x, rot.y, rot.z, rot.w);
    _vel.set(lv.x, lv.y, lv.z);
    _ang.set(av.x, av.y, av.z);
    _up.set(0, 1, 0).applyQuaternion(_q);
    const wetness = Vehicle.wetness;
    const inp = this.input;
    const nW = this.wheels.length;

    // ---- pass 1: ray casts and suspension compression ----------------------------------------------------
    for (const w of this.wheels) {
      _p.set(w.x, w.mountY, w.z).applyQuaternion(_q).add(_pos);
      _n.set(0, -1, 0).applyQuaternion(_q);
      const len = spec.suspension.rest + spec.wheelRadius;
      const pr = this.physics.probe(_p.x, _p.y, _p.z, _n.x, _n.y, _n.z, len, this.collider, w.probe);
      w.prevComp = w.comp;
      w.wasOnGround = w.onGround;
      if (pr.hit) {
        const suspLen = pr.distance - spec.wheelRadius;
        w.comp = clamp(spec.suspension.rest - suspLen, 0, spec.suspension.rest);
        w.onGround = true;
        w.surface = pr.surface;
      } else {
        w.comp = 0;
        w.onGround = false;
      }
    }

    // ---- pass 2: forces -------------------------------------------------------------------------------------
    // anti-roll bars act on left/right pairs
    const arLoad = new Array<number>(nW).fill(0);
    if (!this.isBike && spec.suspension.antiRoll > 0) {
      for (const [a, b] of [[0, 1], [2, 3]] as const) {
        const diff = this.wheels[a]!.comp - this.wheels[b]!.comp;
        arLoad[a] = spec.suspension.antiRoll * diff;
        arLoad[b] = -spec.suspension.antiRoll * diff;
      }
    }

    let maxSlip = 0;
    this.wheels.forEach((w, i) => {
      const pr = w.probe;
      w.load = 0;
      w.slip = 0;
      w.sliding = false;
      w.visualComp = damp(w.visualComp, w.onGround ? w.comp : 0, 25, h);
      if (!w.onGround) {
        w.spin += (this.speed / spec.wheelRadius) * h * 0.9;
        return;
      }
      _n.set(pr.nx, pr.ny, pr.nz);
      // blend toward the body's up so steep facets don't kick the car sideways
      _n.lerp(_up, 0.35).normalize();

      // --- suspension (spring + asymmetric damper + bump stop) -------------------------------------------------
      // the first frame in contact has no valid previous compression: don't let the damper see a fake impact
      const compVel = w.wasOnGround ? (w.comp - w.prevComp) / h : 0;
      const damp_ = compVel > 0 ? w.damping : w.damping * 0.6; // bump stiffer than rebound
      let fs = w.stiffness * w.comp + damp_ * compVel + arLoad[i]!;
      if (w.comp > spec.suspension.travel) fs += (w.comp - spec.suspension.travel) * w.stiffness * 8;
      fs = clamp(fs, 0, this.staticLoad * 7); // a bound on the spring force keeps hard landings from launching the car
      w.load = fs;
      w.contact.set(pr.px, pr.py, pr.pz);

      // --- tyre frame -------------------------------------------------------------------------------------------
      const st = w.front ? w.steer : 0;
      _wf.set(Math.sin(st), 0, -Math.cos(st)).applyQuaternion(_q);
      _wf.addScaledVector(_n, -_wf.dot(_n)).normalize();
      _wr.crossVectors(_wf, _n).normalize();
      _r.subVectors(w.contact, _pos);
      _v.crossVectors(_ang, _r).add(_vel);
      const vLong = _v.dot(_wf);
      const vLat = _v.dot(_wr);
      w.vLong = vLong;

      // surface grip
      let mu = SURFACE_MU[w.surface] ?? 1;
      if (mu < 1) mu = 1 - (1 - mu) * spec.grip.offroad; // off-road capable vehicles lose less grip
      if (w.surface === 'asphalt' || w.surface === 'concrete') mu *= 1 - 0.32 * wetness;
      if (w.popped) mu *= 0.4;
      const muLong = spec.grip.long * mu;
      let muLat = spec.grip.lat * mu * (w.front ? spec.grip.balance : 1);
      const rear = !w.front;
      const hb = inp.handbrake && rear && !this.isBike;
      if (hb) muLat *= spec.handbrake.rearLatMul;
      const bikeHb = inp.handbrake && rear && this.isBike;
      if (bikeHb) muLat *= 0.6;

      const maxX = muLong * fs;
      const maxY = muLat * fs;

      // --- longitudinal force --------------------------------------------------------------------------------
      let fx = 0;
      if (w.driven && this.drivenCount > 0 && !hb) fx += this.engineForce / this.drivenCount;
      const axleShare = w.front ? spec.brake.frontBias : 1 - spec.brake.frontBias;
      const perWheelBrake = (this.brakeForce + this.holdBrake * spec.brake.force) * axleShare / (nW / 2);
      if (perWheelBrake > 0) fx -= Math.sign(vLong || 1) * Math.min(perWheelBrake, Math.abs(vLong) * fs * 0.8 + perWheelBrake * 0.15);
      if (hb || bikeHb) fx = -Math.sign(vLong) * Math.min(maxX * 0.55, Math.abs(vLong) * fs * 3);
      // rolling resistance
      fx -= Math.sign(vLong) * Math.min(0.014 * fs, Math.abs(vLong) * fs);

      // --- lateral force from slip angle ---------------------------------------------------------------------
      const vRef = Math.max(Math.abs(vLong), 1.2);
      const alpha = Math.atan2(vLat, vRef);
      const B = spec.grip.stiffness;
      const C = 1.45;
      let fy = -maxY * Math.sin(C * Math.atan(B * alpha));
      // near standstill use a viscous model so the car doesn't creep sideways
      const low = clamp(1 - Math.hypot(vLong, vLat) / 2.5, 0, 1);
      fy = fy * (1 - low) + clamp(-vLat * fs * 1.6, -maxY, maxY) * low;

      // --- friction circle ---------------------------------------------------------------------------------------
      const ux = fx / Math.max(maxX, 1);
      const uy = fy / Math.max(maxY, 1);
      const m = Math.hypot(ux, uy);
      if (m > 1) { fx /= m; fy /= m; }
      w.slip = clamp(m, 0, 1.6);
      w.sliding = m > 0.98 || (hb && Math.abs(vLat) > 1.5);
      maxSlip = Math.max(maxSlip, w.sliding ? Math.max(w.slip, 0.9) : w.slip * 0.6);

      // --- apply -------------------------------------------------------------------------------------------------------
      // suspension acts along the ground normal at the contact patch; tyre forces at a raised "roll centre"
      const k = h;
      body.applyImpulseAtPoint({ x: _n.x * fs * k, y: _n.y * fs * k, z: _n.z * fs * k }, { x: w.contact.x, y: w.contact.y, z: w.contact.z }, true);
      const raise = this.isBike ? 0.15 : 0.28;
      const fxk = fx * k;
      const fyk = fy * k;
      body.applyImpulseAtPoint(
        { x: _wf.x * fxk + _wr.x * fyk, y: _wf.y * fxk + _wr.y * fyk, z: _wf.z * fxk + _wr.z * fyk },
        { x: w.contact.x + _n.x * raise, y: w.contact.y + _n.y * raise, z: w.contact.z + _n.z * raise },
        true,
      );

      // wheel spin for visuals: rolling, plus slip when driven past grip or locked by the handbrake
      let omega = vLong / spec.wheelRadius;
      if (hb) omega = 0;
      else if (w.driven && Math.abs(this.engineForce) / Math.max(this.drivenCount, 1) > maxX * 1.02) omega += Math.sign(this.engineForce || 1) * 25;
      w.spin += omega * h;
    });
    this.skid = maxSlip;

    // ---- body forces: drag, downforce, yaw & roll control ------------------------------------------------------
    const speed = _vel.length();
    if (speed > 0.1) {
      const area = spec.size.width * spec.size.height * 0.8;
      const drag = 0.5 * 1.2 * spec.aero.drag * area * speed;
      body.applyImpulse({ x: -_vel.x * drag * h, y: -_vel.y * drag * 0.3 * h, z: -_vel.z * drag * h }, true);
    }
    if (spec.aero.downforce > 0 && speed > 5) {
      const df = spec.aero.downforce * speed * speed * h;
      body.applyImpulse({ x: -_up.x * df, y: -_up.y * df, z: -_up.z * df }, true);
    }

    // mild yaw damping stabilises the car at speed without killing intentional slides
    if (!inp.handbrake && Math.abs(this.slipAngle) < 0.14 && speed > 8) {
      const yd = -spec.assist.yawDamp * spec.mass * 1.2 * _ang.y * Math.min(1, speed / 25);
      body.applyTorqueImpulse({ x: 0, y: yd * h, z: 0 }, true);
    }

    if (this.isBike) this.stabiliseBike(h, _q, _vel, _ang);

    // keep the body awake while someone is driving
    if (this.occupied && body.isSleeping()) body.wakeUp();
  }

  /**
   * A motorbike can't balance on two contact points, so a PD controller leans it into turns and holds it
   * up otherwise. The body really rolls (and the rider with it); it just can't fall over.
   */
  private stabiliseBike(h: number, q: THREE.Quaternion, vel: THREE.Vector3, ang: THREE.Vector3): void {
    _fwd.set(0, 0, -1).applyQuaternion(q);
    _right.set(1, 0, 0).applyQuaternion(q);
    const speed = Math.abs(vel.dot(_fwd));
    // lateral acceleration → equilibrium lean (positive = leaning left)
    const aLat = ang.y * speed;
    const lean = clamp(Math.atan(aLat / G), -0.85, 0.85) * 0.92;
    const err = Math.sin(lean) - _right.y;
    const rollRate = ang.dot(_fwd);
    const I = (this.spec.mass / 12) * (this.spec.size.width ** 2 + this.spec.size.height ** 2) * 0.55;
    const kp = I * 420;
    const kd = I * 34;
    // sign: positive torque about the forward axis (−Z) tilts the bike's right side down, so use −err
    const tq = -(kp * err) - kd * rollRate;
    this.body.applyTorqueImpulse({ x: _fwd.x * tq * h, y: _fwd.y * tq * h, z: _fwd.z * tq * h }, true);
  }
}
