import * as THREE from 'three';
import { a11y } from '../core/a11y';
import type { AudioEngine } from '../audio/AudioEngine';
import { clamp, damp, easeInOutCubic, Spring } from '../core/math';
import type { InputManager } from '../input/InputManager';
import { GROUP, type Physics } from '../physics/Physics';
import type { Player } from '../player/Player';
import type { Viewmodel } from '../player/Viewmodel';
import type { WeaponSystem } from '../player/WeaponSystem';
import { terrainHeight } from '../world/Terrain';
import type { Vehicle } from './Vehicle';
import type { VehicleManager } from './VehicleManager';

export type DriveMode = 'foot' | 'entering' | 'driving' | 'exiting';
export type CameraMode = 'chase' | 'close' | 'hood' | 'cinematic';
const CAMERA_MODES: CameraMode[] = ['chase', 'close', 'hood', 'cinematic'];

const ENTER_TIME = 1.55;
const EXIT_TIME = 1.1;

export interface DrivingDeps {
  input: InputManager;
  player: Player;
  vehicles: VehicleManager;
  physics: Physics;
  audio: AudioEngine;
  weapon: WeaponSystem;
  viewmodel: Viewmodel;
  camera: THREE.PerspectiveCamera;
  baseFov: () => number;
  night: () => number;
  toast: (msg: string) => void;
}

const angleDiff = (a: number, b: number): number => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _look = { x: 0, y: 0 };
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4();

/**
 * On-foot ↔ vehicle state machine, vehicle controls, and the third-person chase camera.
 *
 * Enter: walk to the door (door opens) → slide into the seat while the camera flows from the player's eyes to the
 * chase view → door closes. Exit does the reverse. The camera is always a continuous move, never a cut.
 */
export class Driving {
  mode: DriveMode = 'foot';
  vehicle: Vehicle | null = null;
  /** A vehicle close enough to enter (for the on-screen prompt). */
  hint: Vehicle | null = null;
  camMode: CameraMode = 'chase';
  /** 0 = first-person camera … 1 = chase camera. */
  blend = 0;

  private t = 0;
  private steer = 0;
  private readonly px = new Spring();
  private readonly py = new Spring();
  private readonly pz = new Spring();
  private readonly yawSpring = new Spring();
  private yaw = 0;
  private userYaw = 0;
  private userPitch = 0;
  private idleLook = 0;
  private behind = 0;
  private shake = 0;
  /** Drive-by aiming: the camera stays where you point it instead of drifting back behind the car. */
  holdLook = false;
  private fov = 75;
  private clock = 0;
  private enterFrom = new THREE.Vector3();
  private exitSpot = new THREE.Vector3();
  private exitYaw = 0;
  private enterYaw = 0;
  private readonly chaseQuat = new THREE.Quaternion();
  private readonly chasePos = new THREE.Vector3();
  private chaseFov = 75;
  private parkBrake = false;
  hornOn = false;
  /** Pressing E at a locked vehicle (the car-theft system breaks in). */
  onLocked: ((v: Vehicle) => void) | null = null;

  constructor(private readonly d: DrivingDeps) {}

  get active(): boolean {
    return this.mode !== 'foot';
  }

  // --------------------------------------------------------------------------------------- fixed step

  /** Turns input into throttle / brake / steer for the driven vehicle. */
  fixedUpdate(dt: number): void {
    const { input } = this.d;
    const v = this.vehicle;
    if (this.mode === 'driving' && v) {
      const raw = Math.sign(input.move.x) * Math.pow(Math.abs(input.move.x), 1.25);
      const speed = Math.abs(v.speed);
      const k = clamp(speed / 35, 0, 1);
      const rate = (Math.abs(raw) >= Math.abs(this.steer) ? 5.2 - 3 * k : 8 - 3.5 * k) * dt;
      this.steer += clamp(raw - this.steer, -rate, rate);
      v.input.steer = this.steer;
      // triggers drive on a controller; the mouse buttons are for shooting out of the window
      const pad = input.activeDevice === 'gamepad';
      v.input.throttle = Math.max(pad ? input.analog('fire') : 0, Math.max(0, input.move.y));
      // a hotwired car will not start until the wires are crossed
      if (v.hotwireT > 0) { v.hotwireT = Math.max(0, v.hotwireT - dt); v.input.throttle = 0; }
      v.input.brake = Math.max(pad ? input.analog('aim') : 0, Math.max(0, -input.move.y));
      v.input.handbrake = input.down('jump');
      this.hornOn = input.down('horn');
    } else if (v && (this.mode === 'entering' || this.mode === 'exiting' || this.parkBrake)) {
      // an unattended vehicle rolls to a stop
      v.input.throttle = 0;
      v.input.steer = 0;
      v.input.brake = Math.abs(v.speed) > 0.5 ? 0.6 : 0;
      v.input.handbrake = true;
      this.hornOn = false;
      if (this.mode === 'foot' && Math.abs(v.speed) < 0.3) this.parkBrake = false;
    }
  }

  // ------------------------------------------------------------------------------------------ frame

  /**
   * Call every frame AFTER `player.update` (which leaves the first-person camera pose on `camera`).
   * Handles prompts, enter/exit sequencing, controls that aren't continuous, and the final camera pose.
   */
  update(dt: number): void {
    const { input, player, vehicles } = this.d;
    this.clock += dt;
    const v = this.vehicle;

    if (this.mode === 'foot') {
      this.hint = !player.mantle && player.state === 'ground' && !player.noclip ? vehicles.nearestEnterable(player.pos) : null;
      if (this.hint && input.pressed('interact')) {
        if (this.hint.locked && this.onLocked) this.onLocked(this.hint);
        else this.beginEnter(this.hint);
      }
      return;
    }
    this.hint = null;
    if (!v) return;

    this.t += dt;
    this.updateChaseCamera(dt, v);

    if (this.mode === 'entering') this.stepEnter(dt, v);
    else if (this.mode === 'exiting') this.stepExit(dt, v);
    else this.stepDriving(v);

    // camera: blend between the first-person pose already on the camera and the chase pose
    const cam = this.d.camera;
    const e = easeInOutCubic(clamp(this.blend, 0, 1));
    if (this.blend >= 0.999) {
      cam.position.copy(this.chasePos);
      cam.quaternion.copy(this.chaseQuat);
      cam.fov = this.chaseFov;
    } else if (this.blend > 0) {
      cam.position.lerp(this.chasePos, e);
      cam.quaternion.slerp(this.chaseQuat, e);
      cam.fov += (this.chaseFov - cam.fov) * e;
    }
    cam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------------------------- enter / exit

  /** Put the player in a vehicle wherever they are (test drives, deliveries): they appear beside the door and climb in. */
  forceEnter(v: Vehicle): void {
    const { player, vehicles } = this.d;
    const door = vehicles.doorWorld(v, _a);
    const side = _b.set(v.spec.doorSide, 0, 0).applyQuaternion(v.quaternion).setY(0).normalize();
    player.teleport(door.x + side.x * 0.8, door.z + side.z * 0.8, 0);
    this.beginEnter(v);
  }

  /** Climb into a vehicle from where the player stands (after a break-in or a carjack). */
  enter(v: Vehicle): void { if (this.mode === 'foot') this.beginEnter(v); }

  private beginEnter(v: Vehicle): void {
    const { player, weapon, viewmodel, vehicles } = this.d;
    this.mode = 'entering';
    this.vehicle = v;
    this.t = 0;
    this.parkBrake = false;
    player.frozen = true;
    this.enterFrom.copy(player.pos);
    // face the door
    const door = vehicles.doorWorld(v, _a);
    this.enterYaw = Math.atan2(-(door.x - player.pos.x), -(door.z - player.pos.z));
    weapon.state = weapon.isDrawn ? 'holstered' : weapon.state;
    viewmodel.group.visible = true; // hands remain until the camera has left the head
    this.initChase(v);
    this.d.audio.mech('cloth');
  }

  private stepEnter(dt: number, v: Vehicle): void {
    const { player, vehicles } = this.d;
    const t = this.t;
    const door = vehicles.doorWorld(v, _a);
    // outward direction from the car at the door
    _r.set(1, 0, 0).applyQuaternion(v.quaternion);
    const out = _b.copy(_r).multiplyScalar(v.spec.doorSide);
    out.y = 0;
    out.normalize();
    const stand = _f.copy(door).addScaledVector(out, 0.55);
    stand.y = Math.max(terrainHeight(stand.x, stand.z), 0.0) + 0.02;

    // 1) walk to the door (0 – 0.55 s), turning to face the car; the door swings open
    const walk = easeInOutCubic(clamp(t / 0.55, 0, 1));
    // 2) slide into the seat (0.5 – 1.25 s)
    const seatT = easeInOutCubic(clamp((t - 0.5) / 0.75, 0, 1));
    const seat = this.seatWorld(v, _a);
    const hx = this.enterFrom.x + (stand.x - this.enterFrom.x) * walk;
    const hz = this.enterFrom.z + (stand.z - this.enterFrom.z) * walk;
    const hy = this.enterFrom.y + (stand.y - this.enterFrom.y) * walk;
    player.placeAt(hx + (seat.x - stand.x) * seatT, hy + (seat.y - 1.0 - hy) * seatT + Math.sin(seatT * Math.PI) * 0.15, hz + (seat.z - stand.z) * seatT);
    player.yaw += clamp(angleDiff(this.enterYaw, player.yaw) * Math.min(1, dt * 6), -4 * dt, 4 * dt);
    player.pitch += (-0.1 - player.pitch) * Math.min(1, dt * 5);

    v.doorOpen = damp(v.doorOpen, t < 1.1 ? 1 : 0, 9, dt);
    // the driver appears as the player disappears
    if (t >= 0.95 && !v.occupied) {
      v.occupied = true;
      player.setCollisionEnabled(false);
      v.headlights = this.d.night() > 0.45;
      this.d.audio.mech('draw');
    }
    if (t >= 1.15 && this.d.viewmodel.group.visible) this.d.viewmodel.group.visible = false;
    this.blend = clamp((t - 0.35) / (ENTER_TIME - 0.35), 0, 1);
    if (t >= ENTER_TIME) {
      this.mode = 'driving';
      this.blend = 1;
      this.steer = 0;
      v.doorOpen = 0;
      this.d.toast(`${v.spec.name}`);
    }
  }

  private seatWorld(v: Vehicle, out: THREE.Vector3): THREE.Vector3 {
    out.set(v.spec.seat.x, v.spec.seat.y + 0.6, v.spec.seat.z);
    return out.applyQuaternion(v.quaternion).add(v.position);
  }

  /** Leave the vehicle at once, wherever it is and however fast it is going (death, arrest, explosion). */
  abort(): void {
    const v = this.vehicle;
    if (!v || this.mode === 'foot') return;
    const { player, vehicles, viewmodel } = this.d;
    vehicles.doorWorld(v, _a);
    _r.set(1, 0, 0).applyQuaternion(v.quaternion);
    _b.copy(_r).multiplyScalar(v.spec.doorSide);
    _b.y = 0;
    _b.normalize();
    const x = _a.x + _b.x * 0.9, z = _a.z + _b.z * 0.9;
    player.setCollisionEnabled(true);
    player.placeAt(x, Math.max(terrainHeight(x, z), 0) + 0.02, z);
    player.frozen = false;
    viewmodel.group.visible = true;
    v.occupied = false;
    v.input.throttle = 0;
    v.input.steer = 0;
    this.mode = 'foot';
    this.blend = 0;
    this.parkBrake = true;
    this.vehicle = null;
  }

  /** Try to leave the vehicle (called when the interact key is pressed while driving). */
  tryExit(): void {
    const v = this.vehicle;
    if (this.mode !== 'driving' || !v) return;
    if (v.speedKmh > 42) {
      this.d.toast('Slow down to get out');
      return;
    }
    const { player, vehicles, viewmodel } = this.d;
    this.mode = 'exiting';
    this.t = 0;
    // spot beside the door at ground level
    vehicles.doorWorld(v, _a);
    _r.set(1, 0, 0).applyQuaternion(v.quaternion);
    _b.copy(_r).multiplyScalar(v.spec.doorSide);
    _b.y = 0;
    _b.normalize();
    this.exitSpot.copy(_a).addScaledVector(_b, 0.75);
    this.exitSpot.y = Math.max(terrainHeight(this.exitSpot.x, this.exitSpot.z), 0) + 0.02;
    this.exitYaw = Math.atan2(-_b.x, -_b.z) + 0.0; // facing away from the car
    player.setCollisionEnabled(true);
    player.placeAt(this.seatWorld(v, _a).x, this.exitSpot.y, this.seatWorld(v, _a).z);
    this.enterFrom.copy(player.pos);
    player.yaw = this.exitYaw;
    player.pitch = -0.05;
    viewmodel.group.visible = false;
    v.input.throttle = 0;
    v.input.steer = 0;
    this.d.audio.mech('cloth');
  }

  private stepExit(dt: number, v: Vehicle): void {
    const { player, viewmodel } = this.d;
    const t = this.t;
    const k = easeInOutCubic(clamp(t / 0.7, 0, 1));
    player.placeAt(
      this.enterFrom.x + (this.exitSpot.x - this.enterFrom.x) * k,
      this.exitSpot.y + Math.sin(k * Math.PI) * 0.12,
      this.enterFrom.z + (this.exitSpot.z - this.enterFrom.z) * k,
    );
    v.doorOpen = damp(v.doorOpen, t < 0.7 ? 1 : 0, 9, dt);
    if (t >= 0.25 && v.occupied) v.occupied = false;
    this.blend = 1 - clamp((t - 0.1) / (EXIT_TIME - 0.1), 0, 1);
    if (t >= 0.7 && !viewmodel.group.visible) viewmodel.group.visible = true;
    if (t >= EXIT_TIME) {
      this.mode = 'foot';
      this.blend = 0;
      player.frozen = false;
      v.doorOpen = 0;
      this.parkBrake = true;
      this.vehicle = null;
      v.input.handbrake = true;
    }
  }

  private stepDriving(v: Vehicle): void {
    const { input } = this.d;
    if (input.pressed('interact')) this.tryExit();
    if (input.pressed('headlights')) {
      v.headlights = !v.headlights;
      this.d.toast(v.headlights ? 'Headlights on' : 'Headlights off');
    }
    if (input.pressed('cameraMode')) {
      this.camMode = CAMERA_MODES[(CAMERA_MODES.indexOf(this.camMode) + 1) % CAMERA_MODES.length]!;
      this.d.toast(`Camera: ${this.camMode}`);
    }
    // keep the player's body glued to the seat so exits start from the right place
    const seat = this.seatWorld(v, _a);
    this.d.player.placeAt(seat.x, seat.y - 1.0, seat.z);
    v.occupied = true;
  }

  // ----------------------------------------------------------------------------------------- camera

  /** Start the chase springs directly behind the vehicle so there is no swing when the blend arrives. */
  private initChase(v: Vehicle): void {
    _f.set(0, 0, -1).applyQuaternion(v.quaternion);
    this.yaw = Math.atan2(-_f.x, -_f.z);
    this.yawSpring.value = this.yaw;
    this.yawSpring.velocity = 0;
    this.userYaw = this.userPitch = this.behind = 0;
    this.px.value = this.chasePos.x;
    this.updateChaseCamera(0.016, v, true);
    this.px.value = this.chasePos.x;
    this.py.value = this.chasePos.y;
    this.pz.value = this.chasePos.z;
    this.px.velocity = this.py.velocity = this.pz.velocity = 0;
    this.fov = this.d.baseFov();
  }

  private updateChaseCamera(dt: number, v: Vehicle, snap = false): void {
    const { input, physics, camera } = this.d;
    const spec = v.spec;
    const speed = v.speed;
    const kmh = v.speedKmh;

    // ---- user look (mouse / right stick) orbits the camera, recentering after a pause -------------------------
    if (this.mode === 'driving') {
      input.consumeLook(_look);
      if (Math.abs(_look.x) + Math.abs(_look.y) > 0.0005) {
        this.userYaw -= _look.x * 1.2;
        this.userPitch = clamp(this.userPitch - _look.y * 1.2, -0.5, 0.7);
        this.idleLook = 0;
      } else {
        this.idleLook += dt;
      }
      if (this.holdLook) this.idleLook = 0;
      if (this.idleLook > 1.4) {
        this.userYaw = damp(this.userYaw, 0, 2.2, dt);
        this.userPitch = damp(this.userPitch, 0, 2.2, dt);
      }
      this.behind = damp(this.behind, input.down('crouch') ? Math.PI : 0, 9, dt);
    }

    // ---- heading: between the car's nose and its direction of travel (so slides stay readable) ---------------------
    _f.set(0, 0, -1).applyQuaternion(v.quaternion);
    const carYaw = Math.atan2(-_f.x, -_f.z);
    let want = carYaw;
    if (Math.abs(speed) > 3) {
      const lv = v.body.linvel();
      const velYaw = Math.atan2(-lv.x, -lv.z);
      const diff = angleDiff(velYaw, carYaw);
      const useVel = speed > 0 ? clamp(Math.abs(speed) / 14, 0, 1) * 0.5 : 0;
      want = carYaw + clamp(diff, -0.9, 0.9) * useVel;
    }
    const target = this.camMode === 'cinematic' ? carYaw + 2.35 + Math.sin(this.clock * 0.22) * 0.55 : want + this.userYaw + this.behind;
    if (snap) {
      this.yawSpring.value = target;
      this.yawSpring.velocity = 0;
    } else {
      // critically damped spring on the unwrapped angle, so the camera swings behind the car without snapping
      const cur = this.yawSpring.value;
      this.yawSpring.update(cur + angleDiff(target, cur), this.camMode === 'cinematic' ? 0.9 : 0.32, dt);
    }
    this.yaw = this.yawSpring.value;

    // ---- desired position ----------------------------------------------------------------------------------------------
    const dist0 = spec.camera.distance;
    let dist = dist0 + clamp(kmh / 220, 0, 1) * 2.2;
    let height = spec.camera.height;
    let pitchBias = 0;
    let fov = this.d.baseFov() + clamp(kmh / 260, 0, 1) * 16 + clamp(v.gLong, 0, 0.8) * 3.5;
    const lookH = spec.camera.lookHeight - spec.comHeight;
    const target3 = _a.copy(v.position);
    target3.y += lookH;
    // look slightly ahead of the car at speed
    _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));

    if (this.camMode === 'close') {
      dist *= 0.62;
      height *= 0.78;
    } else if (this.camMode === 'cinematic') {
      dist = dist0 * 0.9;
      height = 0.9;
      fov = 42 + clamp(kmh / 300, 0, 1) * 8;
    }

    let px: number, py: number, pz: number;
    if (this.camMode === 'hood') {
      // on the bonnet, looking down the road
      _b.set(0, spec.size.height * 0.55 + spec.clearance - spec.comHeight + 0.12, -spec.size.length * 0.22).applyQuaternion(v.quaternion).add(v.position);
      px = _b.x; py = _b.y; pz = _b.z;
      fov = this.d.baseFov() + 10 + clamp(kmh / 260, 0, 1) * 14;
    } else {
      px = target3.x - _f.x * dist;
      pz = target3.z - _f.z * dist;
      py = target3.y + height - lookH;
      // keep out of walls: ray from the car to the camera
      _b.set(px - target3.x, py - target3.y, pz - target3.z);
      const len = _b.length();
      _b.multiplyScalar(1 / Math.max(len, 1e-4));
      const hit = physics.raycast(target3, _b, len + 0.4, undefined, GROUP.WORLD);
      if (hit && hit.distance < len + 0.3) {
        const dd = Math.max(1.6, hit.distance - 0.35);
        px = target3.x + _b.x * dd; py = target3.y + _b.y * dd; pz = target3.z + _b.z * dd;
      }
      py = Math.max(py, Math.max(terrainHeight(px, pz), 0) + 0.7);
    }
    pitchBias = this.userPitch;

    if (snap) {
      this.px.value = px; this.py.value = py; this.pz.value = pz;
    } else {
      const st = this.camMode === 'hood' ? 0.03 : this.camMode === 'cinematic' ? 0.25 : 0.1 + clamp(1 - Math.abs(speed) / 30, 0, 1) * 0.08;
      this.px.update(px, st, dt);
      this.py.update(py, st * 1.1, dt);
      this.pz.update(pz, st, dt);
    }
    this.chasePos.set(this.px.value, this.py.value, this.pz.value);

    // ---- orientation: look at the car (chase) or down the road (hood) ----------------------------------------------------------
    if (this.camMode === 'hood') {
      this.chasePos.set(px, py, pz);
      this.chaseQuat.setFromEuler(_e.set(-0.04 - this.userPitch * 0.5, this.yaw, 0));
    } else {
      _m.lookAt(this.chasePos, _b.copy(target3).addScaledVector(_f, clamp(speed * 0.06, -1, 4)).add(_r.set(0, -pitchBias * 3, 0)), _r.set(0, 1, 0));
      this.chaseQuat.setFromRotationMatrix(_m);
    }

    // ---- shake from impacts and speed ---------------------------------------------------------------------------------------
    this.shake = Math.max(0, this.shake - dt * 2.2);
    if (v.impact > 0) this.shake = Math.min(1, this.shake + v.impact * 0.045);
    const amp = (this.shake * 0.12 + clamp((kmh - 130) / 600, 0, 0.12) * 0.01) * a11y.shake;
    if (amp > 0.0005) {
      this.chasePos.x += (Math.random() - 0.5) * amp;
      this.chasePos.y += (Math.random() - 0.5) * amp;
      this.chasePos.z += (Math.random() - 0.5) * amp;
    }
    // smooth FOV
    this.fov = damp(this.fov, fov, 4, dt);
    this.chaseFov = snap ? fov : this.fov;
    void camera;
  }
}
