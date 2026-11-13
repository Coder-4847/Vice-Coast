import * as THREE from 'three';
import { a11y } from '../core/a11y';
import type { AudioEngine, CraftEngine } from '../audio/AudioEngine';
import { clamp, damp, easeInOutCubic, Spring } from '../core/math';
import type { InputManager } from '../input/InputManager';
import type { Combat } from '../combat/Combat';
import type { Npcs } from '../npc/Npcs';
import { GROUP, type Physics } from '../physics/Physics';
import type { Player } from '../player/Player';
import type { Viewmodel } from '../player/Viewmodel';
import type { WeaponSystem } from '../player/WeaponSystem';
import type { CraftHud } from '../ui/CraftHud';
import type { Driving } from '../vehicles/Driving';
import type { Effects } from '../world/Effects';
import { terrainHeight, waterLevelAt } from '../world/Terrain';
import type { Craft } from './Craft';
import type { CraftManager } from './CraftManager';

export type PilotMode = 'foot' | 'entering' | 'flying' | 'exiting';
type CamMode = 'chase' | 'cockpit';

export interface PilotingDeps {
  input: InputManager;
  player: Player;
  crafts: CraftManager;
  driving: Driving;
  audio: AudioEngine;
  weapon: WeaponSystem;
  viewmodel: Viewmodel;
  camera: THREE.PerspectiveCamera;
  hud: CraftHud;
  baseFov: () => number;
  toast: (m: string) => void;
  physics: Physics;
  effects: Effects;
  combat: () => Combat | null;
  npcs: () => Npcs | null;
  /** Launch a rocket (armed aircraft). */
  rocket?: (from: THREE.Vector3, dir: THREE.Vector3, speed: number, exclude: import('@dimforge/rapier3d-compat').Collider) => void;
  /** The player jumped out of an aircraft in the air. */
  bail: (vx: number, vy: number, vz: number) => void;
}

const ENTER_TIME = 1.0;
const EXIT_TIME = 0.8;
const _f = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _look = { x: 0, y: 0 };
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();

/**
 * Boarding, flying and leaving boats, helicopters and planes: the same walk-up-and-get-in camera flow as cars, a chase
 * or cockpit camera, the control mapping, the instrument HUD and the engine sound.
 */
export class Piloting {
  mode: PilotMode = 'foot';
  craft: Craft | null = null;
  /** Scripted flying (cutscenes): replaces the player's stick and lift while set. */
  autopilot: { fwd: number; steer: number; lift: number } | null = null;
  hint: Craft | null = null;
  camMode: CamMode = 'chase';
  blend = 0;

  private t = 0;
  private enterFrom = new THREE.Vector3();
  private readonly px = new Spring();
  private readonly py = new Spring();
  private readonly pz = new Spring();
  private readonly yawS = new Spring();
  private userYaw = 0;
  private camYaw = 0;
  private readonly aimPoint = new THREE.Vector3();
  private userPitch = 0;
  private idle = 0;
  private fov = 75;
  private shake = 0;
  private rocketT = 0;
  private rocketSide = 1;
  private readonly chasePos = new THREE.Vector3();
  private readonly chaseQuat = new THREE.Quaternion();
  private chaseFov = 75;
  private engine: CraftEngine | null = null;
  /** Cannon reload remaining (s), for the HUD. */
  cooldownHud = 0;
  private exitSpot = new THREE.Vector3();

  constructor(private readonly d: PilotingDeps) {}

  get active(): boolean {
    return this.mode === 'flying';
  }
  get busy(): boolean {
    return this.mode !== 'foot';
  }

  // ----------------------------------------------------------------------------------------------- controls

  fixedUpdate(): void {
    const c = this.craft;
    if (!c) return;
    const { input } = this.d;
    const i = c.input;
    if (this.mode !== 'flying' || c.exploded) { i.fwd = i.steer = i.lift = i.brake = 0; return; }
    if (this.autopilot) { const a = this.autopilot; i.fwd = a.fwd; i.steer = a.steer; i.lift = a.lift; i.brake = 0; return; }
    i.fwd = clamp(input.move.y, -1, 1);
    i.steer = Math.sign(input.move.x) * Math.pow(Math.abs(input.move.x), 1.15);
    const fire = input.analog('fire'), aim = input.analog('aim');
    const up = (input.down('jump') ? 1 : 0) + fire, down = (input.down('crouch') ? 1 : 0);
    if (c.spec.kind === 'plane') { i.lift = clamp(up - down, -1, 1); i.brake = aim; }
    else if (c.spec.kind === 'ground') { i.lift = 0; i.brake = input.down('jump') ? 1 : 0; }
    else { i.lift = clamp(up - down - aim, -1, 1); i.brake = 0; }
  }

  // ----------------------------------------------------------------------------------------------- per frame

  update(dt: number): void {
    const { input, player, crafts, driving } = this.d;
    if (this.mode === 'foot') {
      this.hint = null;
      if (driving.mode === 'foot' && !driving.hint && !player.mantle && !player.noclip && (player.state === 'ground' || player.state === 'air' || player.state === 'swim') && player.pos.y < 4000) {
        this.hint = crafts.nearestEnterable(player.pos);
        if (this.hint && player.state === 'swim' && this.hint.spec.kind !== 'boat') this.hint = null;
        if (this.hint && input.pressed('interact')) this.begin(this.hint);
      }
      this.d.hud.update(null, '');
      return;
    }
    const c = this.craft;
    if (!c) return;
    this.t += dt;
    this.updateCamera(dt, c);
    if (this.mode === 'entering') this.stepEnter(dt, c);
    else if (this.mode === 'exiting') this.stepExit(dt, c);
    else this.stepFlying(dt, c);

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
    this.d.hud.update(this.mode === 'flying' || this.mode === 'exiting' ? c : null, this.camMode);
    this.updateAudio(c);
  }

  // ------------------------------------------------------------------------------------------ enter / exit

  private begin(c: Craft): void {
    const { player, weapon, viewmodel, crafts } = this.d;
    this.mode = 'entering';
    this.craft = c;
    this.t = 0;
    player.frozen = true;
    this.enterFrom.copy(player.pos);
    weapon.state = weapon.isDrawn ? 'holstered' : weapon.state;
    viewmodel.group.visible = true;
    crafts.doorWorld(c, _a);
    this.initChase(c);
    this.d.audio.mech('cloth');
    this.camYaw = Math.atan2(-_f.set(0, 0, -1).applyQuaternion(c.quaternion).x, -_f.z);
    if (c.spec.ground) { c.aimYaw = this.camYaw; c.aimPitch = 0; c.turretYaw = 0; c.gunPitch = 0; }
    this.d.hud.setHint(c.spec.kind === 'ground' ? 'W/S drive · A/D turn · mouse aims the turret · LMB fire · RMB machine gun · Space brake · E exit' : c.spec.kind === 'plane' ? `W/S pitch · A/D roll · Space/C throttle · RMB brake · G gear${c.spec.weapons ? ' · R missiles' : ''} · E exit` : c.spec.kind === 'heli' ? `W/S fly · A/D turn · Space climb · C descend${c.spec.weapons ? ' · R rockets' : ''} · E exit` : 'W/S throttle · A/D steer · E exit');
  }

  private seat(c: Craft, out: THREE.Vector3): THREE.Vector3 {
    out.set(c.spec.seat.x, c.spec.seat.y, c.spec.seat.z);
    return out.applyQuaternion(c.quaternion).add(c.position);
  }

  private stepEnter(dt: number, c: Craft): void {
    const { player, viewmodel } = this.d;
    const t = this.t;
    const k = easeInOutCubic(clamp(t / 0.7, 0, 1));
    const seat = this.seat(c, _a);
    player.placeAt(
      this.enterFrom.x + (seat.x - this.enterFrom.x) * k,
      this.enterFrom.y + (seat.y - 0.9 - this.enterFrom.y) * k + Math.sin(k * Math.PI) * 0.2,
      this.enterFrom.z + (seat.z - this.enterFrom.z) * k,
    );
    c.doorOpen = damp(c.doorOpen, t < 0.8 ? 1 : 0, 8, dt);
    if (t >= 0.55 && !c.occupied) {
      c.occupied = true;
      c.setActive(true);
      player.setCollisionEnabled(false);
      this.startEngine(c);
    }
    if (t >= 0.8 && viewmodel.group.visible) viewmodel.group.visible = false;
    this.blend = clamp((t - 0.25) / (ENTER_TIME - 0.25), 0, 1);
    if (t >= ENTER_TIME) {
      this.mode = 'flying';
      this.blend = 1;
      this.d.toast(c.spec.name);
    }
  }

  private startEngine(c: Craft): void {
    this.engine?.dispose();
    const k = c.spec.kind;
    this.engine = this.d.audio.createCraftEngine(k === 'boat' || k === 'ground' ? 'boat' : k === 'heli' ? 'heli' : c.spec.plane!.jet ? 'jet' : 'prop');
  }

  private updateAudio(c: Craft): void {
    if (!this.engine) return;
    const k = c.spec.kind;
    const on = c.occupied && !c.exploded;
    let rpm = 0, speed = 0;
    if (k === 'boat') { rpm = on ? 0.25 + Math.abs(c.input.fwd) * 0.7 : 0; speed = Math.abs(c.speed) / c.spec.boat!.vmax; }
    else if (k === 'ground') { rpm = on ? 0.3 + Math.abs(c.input.fwd) * 0.5 + Math.abs(c.input.steer) * 0.2 : 0; speed = Math.abs(c.speed) / c.spec.ground!.vmax * 0.5; }
    else if (k === 'heli') { rpm = c.rotor; speed = Math.abs(c.speed) / 45; }
    else { rpm = on || c.throttle > 0.02 ? 0.2 + c.throttle * 0.8 : 0; speed = Math.abs(c.speed) / 90; }
    this.engine.update(rpm, c.load, speed);
  }

  private stepFlying(dt: number, c: Craft): void {
    const { input, player } = this.d;
    c.occupied = true;
    if (input.pressed('cameraMode')) {
      this.camMode = this.camMode === 'chase' ? 'cockpit' : 'chase';
      this.d.toast(`Camera: ${this.camMode}`);
    }
    if (input.pressed('inspect') && c.spec.kind === 'plane') {
      c.gearCmd = c.gearCmd > 0.5 ? 0 : 1;
      this.d.toast(c.gearCmd > 0.5 ? 'Landing gear down' : 'Landing gear up');
    }
    if (input.pressed('interact')) this.tryExit(c);
    if (c.spec.kind === 'ground') this.fireControl(c, dt);
    if (c.spec.weapons) this.fireRockets(c, dt);
    // keep the player's body with the craft so police, NPCs and sounds follow it
    const seat = this.seat(c, _a);
    player.placeAt(seat.x, seat.y - 0.9, seat.z);
    if (c.exploded) this.abort();
    void dt;
  }

  /** Leave at once, wherever the craft is (death, arrest, explosion). */
  abort(): void {
    const c = this.craft;
    if (!c || this.mode === 'foot') return;
    const { player, viewmodel } = this.d;
    player.setCollisionEnabled(true);
    player.frozen = false;
    viewmodel.group.visible = true;
    c.occupied = false;
    c.input.fwd = c.input.steer = c.input.lift = c.input.brake = 0;
    this.engine?.dispose();
    this.engine = null;
    this.mode = 'foot';
    this.blend = 0;
    this.craft = null;
    this.d.hud.update(null, '');
  }

  private tryExit(c: Craft): void {
    const { player, viewmodel, crafts } = this.d;
    const kind = c.spec.kind;
    const grounded = c.agl < 3.2;
    const slow = Math.abs(c.speed) < c.spec.maxExitSpeed;
    if (kind !== 'boat' && !grounded) {
      if (c.agl > 30) {
        const lv = c.body.linvel();
        player.setCollisionEnabled(true);
        player.frozen = false;
        viewmodel.group.visible = true;
        c.occupied = false;
        this.engine?.dispose();
        this.engine = null;
        this.mode = 'foot';
        this.blend = 0;
        this.craft = null;
        player.placeAt(c.position.x + 1.6, c.position.y - 0.4, c.position.z);
        this.d.hud.update(null, '');
        this.d.toast('Bailing out!');
        this.d.bail(lv.x, lv.y, lv.z);
        return;
      }
      this.d.toast('Too low to bail out');
      return;
    }
    if (!slow && kind !== 'boat') { this.d.toast('Slow down to get out'); return; }
    // spot beside the door
    crafts.doorWorld(c, _a);
    _b.set(1, 0, 0).applyQuaternion(c.quaternion).multiplyScalar(c.spec.doorSide).setY(0).normalize();
    this.exitSpot.copy(_a).addScaledVector(_b, 1.2);
    const gy = terrainHeight(this.exitSpot.x, this.exitSpot.z);
    const wl = waterLevelAt(this.exitSpot.x, this.exitSpot.z);
    this.exitSpot.y = Math.max(gy, wl) + 0.05;
    this.mode = 'exiting';
    this.t = 0;
    player.setCollisionEnabled(true);
    this.enterFrom.copy(player.pos);
    player.yaw = Math.atan2(-_b.x, -_b.z);
    player.pitch = -0.05;
    viewmodel.group.visible = false;
    c.input.fwd = c.input.steer = c.input.lift = c.input.brake = 0;
    if (kind === 'plane') c.input.brake = 1;
    this.d.audio.mech('cloth');
  }

  private stepExit(dt: number, c: Craft): void {
    const { player, viewmodel } = this.d;
    const t = this.t;
    const k = easeInOutCubic(clamp(t / 0.6, 0, 1));
    player.placeAt(
      this.enterFrom.x + (this.exitSpot.x - this.enterFrom.x) * k,
      this.enterFrom.y + (this.exitSpot.y - this.enterFrom.y) * k + Math.sin(k * Math.PI) * 0.2,
      this.enterFrom.z + (this.exitSpot.z - this.enterFrom.z) * k,
    );
    c.doorOpen = damp(c.doorOpen, t < 0.6 ? 1 : 0, 8, dt);
    if (t >= 0.2 && c.occupied) { c.occupied = false; this.engine?.dispose(); this.engine = null; }
    this.blend = 1 - clamp((t - 0.1) / (EXIT_TIME - 0.1), 0, 1);
    if (t >= 0.6 && !viewmodel.group.visible) viewmodel.group.visible = true;
    if (t >= EXIT_TIME) {
      this.mode = 'foot';
      this.blend = 0;
      player.frozen = false;
      this.craft = null;
    }
  }

  // ----------------------------------------------------------------------------------------------- camera


  // ------------------------------------------------------------------------------------------ tank weapons

  /** Aim the turret at whatever the camera is looking at, and fire the cannon / machine gun. */
  private fireControl(c: Craft, dt: number): void {
    const { input, physics } = this.d;
    const g = c.spec.ground!;
    // the point under the screen centre
    _a.copy(this.chasePos);
    _b.set(0, 0, -1).applyQuaternion(this.chaseQuat);
    const hit = physics.raycast(_a, _b, 700, c.collider, GROUP.WORLD | GROUP.PROP);
    if (hit) this.aimPoint.copy(hit.point); else this.aimPoint.copy(_a).addScaledVector(_b, 700);
    _f.set(g.turret.x, g.turret.y, g.turret.z).applyQuaternion(c.quaternion).add(c.position);
    const dx = this.aimPoint.x - _f.x, dy = this.aimPoint.y - _f.y, dz = this.aimPoint.z - _f.z;
    c.aimYaw = Math.atan2(-dx, -dz);
    c.aimPitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.cooldownHud = c.cannonT;
    if (c.exploded) return;
    const fire = input.analog('fire') > 0.5, aim = input.analog('aim') > 0.5;
    const aligned = Math.abs(Math.atan2(Math.sin(c.aimYaw - (-c.heading) - c.turretYaw), Math.cos(c.aimYaw - (-c.heading) - c.turretYaw))) < 0.35;
    if (g.cannon) {
      if (fire && c.cannonT <= 0 && aligned) this.fireCannon(c);
      if (aim && c.mgT <= 0 && aligned) this.fireMg(c);
    } else if ((fire || aim) && c.mgT <= 0 && aligned) this.fireMg(c);
    void dt;
  }

  /** Where a shot from the muzzle ends: the first solid hit, or a pedestrian / vehicle on the way. */
  private traceShot(c: Craft, range: number, spread: number, out: THREE.Vector3): { npc: ReturnType<Npcs['rayHit']>; collider: number | null; dir: THREE.Vector3; hit: boolean; normal: THREE.Vector3; surface: string } {
    const { physics } = this.d;
    c.muzzle(_a, _b);
    if (spread > 0) {
      _b.x += (Math.random() - 0.5) * spread; _b.y += (Math.random() - 0.5) * spread; _b.z += (Math.random() - 0.5) * spread;
      _b.normalize();
    }
    const dir = _b.clone();
    const h = physics.raycast(_a, dir, range, c.collider, GROUP.WORLD | GROUP.PROP);
    const npc = this.d.npcs()?.rayHit(_a.x, _a.y, _a.z, dir.x, dir.y, dir.z, h ? h.distance : range) ?? null;
    let normal = new THREE.Vector3(0, 1, 0);
    if (npc) out.copy(_a).addScaledVector(dir, npc.t);
    else if (h) { out.copy(h.point); normal = h.normal.clone(); }
    else out.copy(_a).addScaledVector(dir, range * 0.6);
    return { npc, collider: !npc && h?.collider ? h.collider.handle : null, dir, hit: !!h || !!npc, normal, surface: h?.surface ?? 'concrete' };
  }

  /** Armed aircraft: rockets (or missiles) from alternating sides along the nose while R is held. */
  private fireRockets(c: Craft, dt: number): void {
    this.rocketT -= dt;
    if (this.mode !== 'flying' || this.autopilot || !this.d.input.down('reload') || this.rocketT > 0 || !this.d.rocket) return;
    this.rocketT = c.spec.weapons!.interval;
    this.rocketSide = -this.rocketSide;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(c.quaternion);
    const heli = c.spec.kind === 'heli';
    const from = c.position.clone().addScaledVector(fwd, heli ? 1.0 : c.spec.hull.l / 2 - 1).addScaledVector(right, this.rocketSide * (heli ? 1.75 : 2.6));
    from.y -= heli ? 0.1 : 0.4;
    // helicopters aim a touch below the nose, where the gunner's sight looks
    if (heli) fwd.y -= 0.12;
    fwd.normalize();
    this.d.rocket(from, fwd, Math.max(75, Math.abs(c.speed) + 70), c.collider);
    this.shake = Math.min(1, this.shake + 0.15);
    this.d.npcs()?.alarm(from.x, from.z);
  }

  private fireCannon(c: Craft): void {
    const g = c.spec.ground!;
    const gun = g.cannon!;
    const end = new THREE.Vector3();
    const r = this.traceShot(c, 700, 0, end);
    c.cannonT = gun.reload;
    c.gunKick = 1;
    const m = _a.clone();
    this.d.effects.explosion(m, 0.28);
    this.d.effects.tracer(m, end);
    this.d.audio.explosion(m, 0.6);
    const combat = this.d.combat();
    if (r.hit) {
      if (r.collider !== null) combat?.hitCollider(r.collider, gun.damage * 0.5);
      combat?.boom(end.x, end.y, end.z, gun.radius, gun.damage, true);
    }
    const imp = c.spec.mass * 1.4;
    c.body.applyImpulse({ x: -r.dir.x * imp * 0.05, y: 0, z: -r.dir.z * imp * 0.05 }, true);
    this.shake = Math.min(1, this.shake + 0.5);
    this.d.npcs()?.alarm(m.x, m.z);
  }

  private fireMg(c: Craft): void {
    const g = c.spec.ground!;
    const end = new THREE.Vector3();
    const r = this.traceShot(c, 380, 0.012, end);
    c.mgT = g.mg.interval;
    const m = _a.clone();
    this.d.effects.tracer(m, end);
    this.d.audio.gunshot(0.8, m, 'rifle');
    if (r.npc) {
      this.d.effects.impact(end, r.dir.clone().negate(), 'flesh', false);
      this.d.npcs()?.hurt(r.npc.target, r.dir.x, r.dir.z, g.mg.damage, r.npc.head);
    } else if (r.hit) {
      const combat = this.d.combat();
      if (r.collider !== null && combat?.hitCollider(r.collider, g.mg.damage * 0.55)) this.d.effects.impact(end, r.normal, 'metal', false);
      else this.d.effects.impact(end, r.normal, r.surface as Parameters<Effects['impact']>[2], true);
    }
    this.d.npcs()?.alarm(m.x, m.z);
  }

  private initChase(c: Craft): void {
    _f.set(0, 0, -1).applyQuaternion(c.quaternion);
    this.yawS.value = Math.atan2(-_f.x, -_f.z);
    this.yawS.velocity = 0;
    this.userYaw = this.userPitch = 0;
    this.updateCamera(0.016, c, true);
    this.px.velocity = this.py.velocity = this.pz.velocity = 0;
    this.fov = this.d.baseFov();
  }

  private updateCamera(dt: number, c: Craft, snap = false): void {
    const { input } = this.d;
    const spec = c.spec;
    const tank = spec.kind === 'ground';
    if (this.mode === 'flying' && tank) {
      input.consumeLook(_look);
      this.camYaw -= _look.x * 1.2;
      this.userPitch = clamp(this.userPitch - _look.y * 1.2, -0.45, 0.8);
      this.userYaw = 0;
    } else if (this.mode === 'flying') {
      input.consumeLook(_look);
      if (Math.abs(_look.x) + Math.abs(_look.y) > 0.0005) {
        this.userYaw -= _look.x * 1.2;
        this.userPitch = clamp(this.userPitch - _look.y * 1.2, -0.6, 0.8);
        this.idle = 0;
      } else this.idle += dt;
      if (this.idle > 1.6) { this.userYaw = damp(this.userYaw, 0, 2, dt); this.userPitch = damp(this.userPitch, 0, 2, dt); }
    }
    const kmh = c.speedKmh;
    // heading: nose, drifting towards the direction of travel at speed
    _f.set(0, 0, -1).applyQuaternion(c.quaternion);
    let want = Math.atan2(-_f.x, -_f.z);
    if (c.speed > 8 && spec.kind !== 'heli') {
      const lv = c.body.linvel();
      const vy = Math.atan2(-lv.x, -lv.z);
      let df = vy - want;
      df = Math.atan2(Math.sin(df), Math.cos(df));
      want += clamp(df, -0.8, 0.8) * clamp(c.speed / 25, 0, 1) * 0.45;
    }
    const hullYaw = want;
    if (tank) want = this.camYaw;
    const target = want + this.userYaw;
    if (snap) { this.yawS.value = target; this.yawS.velocity = 0; }
    else {
      const cur = this.yawS.value;
      this.yawS.update(cur + Math.atan2(Math.sin(target - cur), Math.cos(target - cur)), 0.3, dt);
    }
    const yaw = this.yawS.value;
    let fov = this.d.baseFov() + clamp(kmh / 400, 0, 1) * 14;

    if (this.camMode === 'cockpit') {
      this.seat(c, _a);
      _a.y += 0.5;
      this.chasePos.copy(_a);
      _e.set(this.userPitch * 0.8, tank ? Math.atan2(Math.sin(this.camYaw - hullYaw), Math.cos(this.camYaw - hullYaw)) : this.userYaw * 0.8, 0);
      _q.setFromEuler(_e);
      this.chaseQuat.copy(c.quaternion).multiply(_q);
      fov += 8;
    } else {
      const flat = _f.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      const nose = _b.set(0, 0, -1).applyQuaternion(c.quaternion);
      const mix = spec.kind === 'plane' ? 0.45 : spec.kind === 'heli' ? 0.2 : 0;
      const dir = _a.copy(flat).multiplyScalar(1 - mix).addScaledVector(nose, mix).normalize();
      const dist = spec.camera.distance + clamp(kmh / 300, 0, 1) * (spec.kind === 'plane' ? 5 : 2);
      const tgt = _b.copy(c.position);
      tgt.y += spec.camera.lookHeight - spec.comHeight * 0.4;
      let px = tgt.x - dir.x * dist, py = tgt.y - dir.y * dist + spec.camera.height + this.userPitch * dist * 0.5, pz = tgt.z - dir.z * dist;
      py = Math.max(py, Math.max(terrainHeight(px, pz), waterLevelAt(px, pz)) + 1.2);
      if (snap) { this.px.value = px; this.py.value = py; this.pz.value = pz; }
      else {
        const st = 0.14;
        px = this.px.update(px, st, dt); py = this.py.update(py, st, dt); pz = this.pz.update(pz, st, dt);
      }
      this.chasePos.set(px, py, pz);
      _m.lookAt(this.chasePos, tgt, _f.set(0, 1, 0));
      this.chaseQuat.setFromRotationMatrix(_m);
    }
    this.shake = Math.max(0, this.shake - dt * 2);
    if (c.impact > 0) this.shake = Math.min(1, this.shake + c.impact * 0.05);
    if (this.shake > 0.01) {
      const a = this.shake * 0.25 * a11y.shake;
      this.chasePos.x += (Math.random() - 0.5) * a; this.chasePos.y += (Math.random() - 0.5) * a; this.chasePos.z += (Math.random() - 0.5) * a;
    }
    this.fov = damp(this.fov, fov, 4, dt);
    this.chaseFov = snap ? fov : this.fov;
  }
}
