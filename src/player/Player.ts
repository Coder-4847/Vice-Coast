import * as THREE from 'three';
import type { Collider, KinematicCharacterController, RigidBody } from '@dimforge/rapier3d-compat';
import type { AudioEngine } from '../audio/AudioEngine';
import { clamp, damp, easeInOutCubic, Spring } from '../core/math';
import type { InputManager } from '../input/InputManager';
import { GROUP, type Physics, type RayHit, type Surface } from '../physics/Physics';
import { terrainHeight } from '../world/Terrain';

const RADIUS = 0.3;
const STAND_H = 1.8;
const CROUCH_H = 1.15;
const EYE_STAND = 1.66;
const EYE_CROUCH = 1.06;
const GRAVITY = 16;
const JUMP_V = 5.3;
const MAX_PITCH = THREE.MathUtils.degToRad(88);
const SWIM_FEET_Y = -1.12;

const groups = (member: number, filter: number): number => ((member << 16) | filter) >>> 0;
const PLAYER_FILTER = groups(GROUP.PLAYER, GROUP.WORLD | GROUP.PROP);

export type MoveState = 'ground' | 'air' | 'swim' | 'vault' | 'climb';

export interface Ledge {
  kind: 'vault' | 'climb';
  /** Point on the ledge's top edge, nearest the player. */
  top: THREE.Vector3;
  /** Horizontal direction into the obstacle. */
  dir: THREE.Vector3;
  height: number;
  /** Landing point for vaults, or the standing point on top for climbs. */
  end: THREE.Vector3;
}

export interface MantleState {
  ledge: Ledge;
  /** 0 → 1 */
  t: number;
  duration: number;
  start: THREE.Vector3;
}

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _look = { x: 0, y: 0 };

/**
 * First-person character: Rapier kinematic controller + game-feel (acceleration, coyote time, jump buffer,
 * stamina sprint, crouch with ceiling check, swimming, vault/climb, head bob and landing impact).
 */
export class Player {
  readonly pos = new THREE.Vector3();
  private readonly prevPos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = -Math.PI / 2;
  pitch = 0;
  roll = 0;

  state: MoveState = 'ground';
  grounded = true;
  moving = false;
  speed2D = 0;
  sprinting = false;
  /** Smoothed 0–1 blends the viewmodel and camera read. */
  sprintBlend = 0;
  crouchBlend = 0;
  swimBlend = 0;
  stamina = 1;
  exhausted = false;
  /** Set by the weapon system: scales look sensitivity while aiming. */
  lookScale = 1;
  /** Set by the weapon system: aiming blocks sprint. */
  aiming = false;
  /** Set by the weapon system: some weapon states (reload from sprint etc.) allow sprint, others not. */
  sprintAllowed = true;
  noclip = false;

  mantle: MantleState | null = null;
  /** Ledge in front of the player this frame (for the on-screen prompt), if any. */
  ledgeHint: Ledge | null = null;

  /** Camera-space head offsets from bobbing, shared with the viewmodel. */
  readonly bob = new THREE.Vector3();
  /** Accumulated gait phase (radians). */
  gait = 0;
  /** Vertical landing dip (spring), metres. */
  private readonly dip = new Spring(0);
  /** Pending weapon recoil to recover from, radians. */
  recoilDebt = 0;

  /** Fired for the viewmodel/HUD. */
  onLand: ((speed: number) => void) | null = null;
  onMantleStart: ((m: MantleState) => void) | null = null;
  onMantleEnd: (() => void) | null = null;
  onJump: (() => void) | null = null;

  private readonly body: RigidBody;
  private readonly collider: Collider;
  private readonly kcc: KinematicCharacterController;
  private height = STAND_H;
  private eyeHeight = EYE_STAND;
  private coyote = 0;
  private jumpBuffer = 0;
  private staminaDelay = 0;
  private stepDist = 0;
  private stepCount = 0;
  private bobAmp = 0;
  private wasInWater = false;
  private swimTimer = 0;
  private readonly eye = new THREE.Vector3();

  constructor(private readonly physics: Physics, private readonly input: InputManager, private readonly audio: AudioEngine) {
    const R = physics.R;
    this.body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 10, 0));
    this.collider = physics.world.createCollider(
      R.ColliderDesc.capsule((STAND_H - 2 * RADIUS) / 2, RADIUS)
        .setTranslation(0, STAND_H / 2, 0)
        .setCollisionGroups(groups(GROUP.PLAYER, GROUP.WORLD | GROUP.PROP)),
      this.body,
    );
    this.kcc = physics.world.createCharacterController(0.02);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.enableAutostep(0.35, 0.18, false);
    this.kcc.enableSnapToGround(0.35);
    this.kcc.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(52));
    this.kcc.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(58));
    this.kcc.setApplyImpulsesToDynamicBodies(true);
    this.kcc.setCharacterMass(70);
  }

  teleport(x: number, z: number, yawRad: number): void {
    const y = Math.max(terrainHeight(x, z), 0) + 0.05;
    this.pos.set(x, y, z);
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.yaw = yawRad;
    this.pitch = 0;
    this.mantle = null;
    this.state = 'ground';
    this.body.setTranslation({ x, y, z }, true);
  }

  /** Eye position (world), valid after update(). */
  get eyePosition(): THREE.Vector3 {
    return this.eye;
  }

  /** Aim direction (unit, world), valid after update(). */
  lookDirection(out: THREE.Vector3): THREE.Vector3 {
    _e.set(this.pitch, this.yaw, 0, 'YXZ');
    return out.set(0, 0, -1).applyEuler(_e);
  }

  /** Weapon kick: raises the view and optionally yaws it; part of it recovers when firing stops. */
  addRecoil(pitchRad: number, yawRad: number): void {
    this.pitch = clamp(this.pitch + pitchRad, -MAX_PITCH, MAX_PITCH);
    this.yaw += yawRad;
    this.recoilDebt += pitchRad;
  }

  // ------------------------------------------------------------------ fixed step

  fixedUpdate(dt: number): void {
    this.prevPos.copy(this.pos);
    const inp = this.input;
    if (inp.pressed('jump')) this.jumpBuffer = 0.14;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    if (this.noclip) {
      this.flyStep(dt);
      return;
    }
    if (this.mantle) {
      this.advanceMantle(dt);
      return;
    }

    this.updateCrouch(dt);
    this.probeLedge();

    // --- water -------------------------------------------------------------------------
    const swimming = this.pos.y < SWIM_FEET_Y + 0.2 && terrainHeight(this.pos.x, this.pos.z) < -0.5 && this.pos.y < -0.85;
    if (swimming !== this.wasInWater) {
      this.audio.splash(Math.abs(this.vel.y) > 4);
      this.wasInWater = swimming;
      if (swimming) this.vel.y *= 0.2; // water absorbs the fall
    }

    // --- wish velocity -----------------------------------------------------------------
    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const mx = inp.move.x;
    const my = inp.move.y;
    const hasInput = Math.hypot(mx, my) > 0.05;

    const wantsSprint = inp.active('sprint') && my > 0.35 && this.crouchBlend < 0.4 && !this.aiming && this.sprintAllowed && !swimming;
    if (this.exhausted && this.stamina > 0.3) this.exhausted = false;
    this.sprinting = wantsSprint && !this.exhausted && this.stamina > 0.01 && hasInput && (this.grounded || this.state === 'air');
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - dt / 5.5);
      this.staminaDelay = 0.9;
      if (this.stamina <= 0) {
        this.exhausted = true;
        this.sprinting = false;
      }
    } else {
      this.staminaDelay = Math.max(0, this.staminaDelay - dt);
      if (this.staminaDelay <= 0) this.stamina = Math.min(1, this.stamina + dt / 3.4);
    }

    let speed = 4.2;
    if (this.sprinting) speed = 7.0;
    else if (this.crouchBlend > 0.5) speed = 1.9;
    else if (this.aiming) speed = 2.4;
    if (my < -0.1) speed *= 0.78;
    else if (Math.abs(mx) > 0.5 && my <= 0.1) speed *= 0.9;
    if (swimming) speed = this.sprinting || inp.active('sprint') ? 3.4 : 2.1;

    const wishX = (_fwd.x * my + _right.x * mx) * speed;
    const wishZ = (_fwd.z * my + _right.z * mx) * speed;

    if (swimming) {
      this.state = 'swim';
      // Swim toward the view direction; buoyancy holds the body at the surface.
      this.lookDirection(_tmp);
      const sx = hasInput ? (_tmp.x * my + _right.x * mx) * speed : 0;
      const sz = hasInput ? (_tmp.z * my + _right.z * mx) * speed : 0;
      this.vel.x = damp(this.vel.x, sx, 3.2, dt);
      this.vel.z = damp(this.vel.z, sz, 3.2, dt);
      let ty = SWIM_FEET_Y;
      if (inp.active('crouch')) ty = SWIM_FEET_Y - 1.6; // dive
      if (hasInput && my > 0.1) ty += -_tmp.y * 1.4;
      if (inp.down('jump')) ty = SWIM_FEET_Y + 0.5;
      this.vel.y = damp(this.vel.y, clamp((ty - this.pos.y) * 3, -2.6, 2.6), 9, dt);
      this.swimTimer -= dt;
      if (hasInput && this.swimTimer <= 0) {
        this.audio.swim();
        this.swimTimer = 1.1;
      }
    } else {
      // Ground: snappy acceleration. Air: keep momentum with weak steering.
      const onGround = this.grounded;
      const accel = onGround ? (hasInput ? 48 : 60) : 7;
      const vx = this.vel.x;
      const vz = this.vel.z;
      const dx = wishX - vx;
      const dz = wishZ - vz;
      const dl = Math.hypot(dx, dz);
      const maxStep = accel * dt;
      if (dl <= maxStep || dl < 1e-5) {
        this.vel.x = wishX;
        this.vel.z = wishZ;
      } else {
        this.vel.x += (dx / dl) * maxStep;
        this.vel.z += (dz / dl) * maxStep;
      }
      this.vel.y -= GRAVITY * dt;
      this.coyote = onGround ? 0.1 : Math.max(0, this.coyote - dt);

      if (this.jumpBuffer > 0 && this.coyote > 0 && !this.ledgeHint) {
        this.vel.y = JUMP_V * (this.crouchBlend > 0.5 ? 0.85 : 1);
        this.jumpBuffer = 0;
        this.coyote = 0;
        this.grounded = false;
        this.onJump?.();
      } else if (this.jumpBuffer > 0 && this.ledgeHint && this.grounded) {
        this.startMantle(this.ledgeHint);
        this.jumpBuffer = 0;
        return;
      }
    }

    // --- collide & move ------------------------------------------------------------------
    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    if (this.grounded && this.vel.y <= 0 && !swimming) desired.y = -0.06; // keep contact on slopes
    this.kcc.computeColliderMovement(this.collider, desired, undefined, PLAYER_FILTER);
    const mv = this.kcc.computedMovement();
    const wasGrounded = this.grounded;
    this.grounded = this.kcc.computedGrounded() && this.vel.y <= 0.01;

    const impactSpeed = -this.vel.y;
    this.pos.x += mv.x;
    this.pos.y += mv.y;
    this.pos.z += mv.z;
    // Walls and ceilings absorb velocity.
    if (dt > 0) {
      if (Math.abs(mv.x - desired.x) > 1e-4) this.vel.x = mv.x / dt;
      if (Math.abs(mv.z - desired.z) > 1e-4) this.vel.z = mv.z / dt;
      if (mv.y > desired.y + 1e-4 && this.vel.y < 0) this.vel.y = 0; // floor
      if (mv.y < desired.y - 1e-4 && this.vel.y > 0) this.vel.y = 0; // ceiling
    }
    if (this.grounded && !swimming) {
      if (!wasGrounded && impactSpeed > 3) this.land(impactSpeed);
      this.vel.y = Math.min(this.vel.y, 0);
      if (this.vel.y < -1) this.vel.y = -1;
    }
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z });

    this.speed2D = Math.hypot(this.vel.x, this.vel.z);
    this.moving = this.speed2D > 0.4 && hasInput;
    if (!swimming) this.state = this.grounded ? 'ground' : 'air';
    this.footsteps(dt, swimming);
  }

  private land(impactSpeed: number): void {
    const k = clamp((impactSpeed - 3) / 10, 0, 1);
    this.dip.velocity -= 1.2 + 3.2 * k;
    this.audio.land(k);
    this.onLand?.(impactSpeed);
  }

  private footsteps(dt: number, swimming: boolean): void {
    if (!this.grounded || swimming || !this.moving) return;
    const stride = this.sprinting ? 1.05 : this.crouchBlend > 0.5 ? 0.6 : 0.78;
    this.stepDist += this.speed2D * dt;
    if (this.stepDist >= stride) {
      this.stepDist -= stride;
      this.stepCount++;
      const vol = this.sprinting ? 1 : this.crouchBlend > 0.5 ? 0.35 : 0.65;
      this.audio.footstep(this.surfaceUnderfoot(), vol);
    }
  }

  private surfaceUnderfoot(): Surface {
    if (this.pos.y < 0.15 && terrainHeight(this.pos.x, this.pos.z) < 0.2) return 'water';
    _tmp.set(this.pos.x, this.pos.y + 0.3, this.pos.z);
    const hit = this.physics.raycast(_tmp, _right.set(0, -1, 0), 1.2);
    return hit?.surface ?? 'concrete';
  }

  private updateCrouch(dt: number): void {
    const want = this.input.active('crouch') && this.state !== 'swim';
    let target = want ? 1 : 0;
    if (!want && this.crouchBlend > 0.05) {
      // Stay crouched while something is overhead.
      _tmp.set(this.pos.x, this.pos.y + CROUCH_H - 0.1, this.pos.z);
      const up = this.physics.raycast(_tmp, _right.set(0, 1, 0), STAND_H - CROUCH_H + 0.25, this.collider, GROUP.WORLD | GROUP.PROP);
      if (up) target = 1;
    }
    this.crouchBlend = damp(this.crouchBlend, target, 12, dt);
    const h = STAND_H + (CROUCH_H - STAND_H) * this.crouchBlend;
    if (Math.abs(h - this.height) > 0.002) {
      this.height = h;
      this.collider.setHalfHeight(Math.max(0.01, (h - 2 * RADIUS) / 2));
      this.collider.setTranslationWrtParent({ x: 0, y: h / 2, z: 0 });
    }
    this.eyeHeight = EYE_STAND + (EYE_CROUCH - EYE_STAND) * this.crouchBlend;
  }

  // ----------------------------------------------------------------- vault / climb

  /** Look for a vaultable or climbable obstacle directly ahead. Runs every fixed step; ~6 ray casts. */
  private probeLedge(): void {
    this.ledgeHint = null;
    if (!this.grounded || this.state !== 'ground' || this.crouchBlend > 0.5) return;
    const ph = this.physics;
    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    let wall = null as RayHit | null;
    for (const h of [0.5, 0.95, 1.4, 1.85]) {
      _tmp.set(this.pos.x, this.pos.y + h, this.pos.z);
      const hit = ph.raycast(_tmp, _fwd, 1.3, this.collider, GROUP.WORLD | GROUP.PROP);
      if (hit && Math.abs(hit.normal.y) < 0.5 && (!wall || hit.distance < wall.distance)) wall = hit;
      if (wall) break;
    }
    if (!wall) return;
    const dir = new THREE.Vector3(-wall.normal.x, 0, -wall.normal.z);
    if (dir.lengthSq() < 0.01) return;
    dir.normalize();

    // top surface of the obstacle
    _tmp.set(wall.point.x + dir.x * 0.25, this.pos.y + 2.9, wall.point.z + dir.z * 0.25);
    const top = ph.raycast(_tmp, _right.set(0, -1, 0), 3.2, this.collider, GROUP.WORLD | GROUP.PROP);
    if (!top || top.distance < 0.05 || top.normal.y < 0.7) return;
    const height = top.point.y - this.pos.y;
    if (height < 0.5 || height > 2.35) return;

    // headroom above the ledge
    _tmp.set(top.point.x, top.point.y + 0.05, top.point.z);
    if (ph.raycast(_tmp, _right.set(0, 1, 0), 1.15, this.collider, GROUP.WORLD | GROUP.PROP)) return;

    // thickness beyond the lip → vault if thin and the ground continues beyond it
    let thickness = -1;
    let landY = 0;
    for (let d = 0.35; d <= 1.7; d += 0.3) {
      _tmp.set(wall.point.x + dir.x * d, top.point.y + 0.3, wall.point.z + dir.z * d);
      const g = ph.raycast(_tmp, _right.set(0, -1, 0), 4.2, this.collider, GROUP.WORLD | GROUP.PROP);
      if (!g || g.point.y < top.point.y - 0.5) {
        thickness = d;
        landY = g ? g.point.y : this.pos.y;
        break;
      }
    }
    const end = new THREE.Vector3();
    let kind: Ledge['kind'];
    if (height <= 1.3 && thickness > 0 && thickness <= 1.5 && landY > this.pos.y - 1.5) {
      kind = 'vault';
      end.set(wall.point.x + dir.x * (thickness + 0.45), landY + 0.02, wall.point.z + dir.z * (thickness + 0.45));
    } else {
      kind = 'climb';
      end.set(top.point.x + dir.x * 0.4, top.point.y + 0.02, top.point.z + dir.z * 0.4);
    }
    this.ledgeHint = { kind, top: new THREE.Vector3(wall.point.x, top.point.y, wall.point.z), dir, height, end };
  }

  private startMantle(ledge: Ledge): void {
    const duration = ledge.kind === 'vault' ? 0.6 : 1.0 + 0.2 * ledge.height;
    this.mantle = { ledge, t: 0, duration, start: this.pos.clone() };
    this.state = ledge.kind;
    this.vel.set(0, 0, 0);
    this.onMantleStart?.(this.mantle);
    this.audio.mech('cloth');
  }

  private advanceMantle(dt: number): void {
    const m = this.mantle!;
    m.t = Math.min(1, m.t + dt / m.duration);
    const u = m.t;
    const { ledge, start } = m;
    if (ledge.kind === 'vault') {
      const e = easeInOutCubic(u);
      this.pos.lerpVectors(start, ledge.end, e);
      const arc = Math.max(0, ledge.top.y + 0.28 - (start.y + ledge.end.y) / 2);
      this.pos.y += arc * Math.sin(Math.PI * u);
    } else {
      // Pull up the wall, then step forward onto the ledge.
      const split = 0.58;
      if (u < split) {
        const k = easeInOutCubic(u / split); // slow start: the hands have time to find the ledge
        this.pos.set(
          start.x + ledge.dir.x * 0.18 * k, start.y + (ledge.end.y - start.y) * k, start.z + ledge.dir.z * 0.18 * k,
        );
      } else {
        const k = easeInOutCubic((u - split) / (1 - split));
        const wx = start.x + ledge.dir.x * 0.18;
        const wz = start.z + ledge.dir.z * 0.18;
        this.pos.set(wx + (ledge.end.x - wx) * k, ledge.end.y, wz + (ledge.end.z - wz) * k);
      }
    }
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z });
    if (m.t >= 1) {
      this.mantle = null;
      this.state = 'ground';
      this.grounded = true;
      const carry = ledge.kind === 'vault' ? 3.2 : 0;
      this.vel.set(ledge.dir.x * carry, 0, ledge.dir.z * carry);
      this.dip.velocity -= ledge.kind === 'vault' ? 1.6 : 0.9;
      this.audio.footstep('concrete', 0.5);
      this.onMantleEnd?.();
    }
  }

  private flyStep(dt: number): void {
    this.lookDirection(_tmp);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const speed = this.input.active('sprint') ? 40 : 12;
    const up = (this.input.down('jump') ? 1 : 0) - (this.input.active('crouch') ? 1 : 0);
    this.vel.x = damp(this.vel.x, (_tmp.x * this.input.move.y + _right.x * this.input.move.x) * speed, 8, dt);
    this.vel.y = damp(this.vel.y, (_tmp.y * this.input.move.y + up) * speed, 8, dt);
    this.vel.z = damp(this.vel.z, (_tmp.z * this.input.move.y + _right.z * this.input.move.x) * speed, 8, dt);
    this.pos.addScaledVector(this.vel, dt);
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z });
    this.speed2D = Math.hypot(this.vel.x, this.vel.z);
    this.moving = false;
    this.state = 'air';
  }

  // ----------------------------------------------------------------------- render step

  /** Per rendered frame: apply look input and place the camera (interpolated). */
  update(dt: number, alpha: number, camera: THREE.PerspectiveCamera): void {
    const inp = this.input;
    inp.consumeLook(_look);
    this.yaw -= _look.x * this.lookScale;
    this.pitch = clamp(this.pitch - _look.y * this.lookScale, -MAX_PITCH, MAX_PITCH);

    // Recoil recovery: the view settles back toward where it was before firing.
    if (this.recoilDebt > 0) {
      const back = Math.min(this.recoilDebt, this.recoilDebt * (1 - Math.exp(-3.2 * dt)) + 0.0004);
      this.pitch -= back * 0.6;
      this.recoilDebt -= back;
    }

    this.sprintBlend = damp(this.sprintBlend, this.sprinting ? 1 : 0, 9, dt);
    this.swimBlend = damp(this.swimBlend, this.state === 'swim' ? 1 : 0, 6, dt);
    this.dip.update(0, 0.14, dt);

    // Head bob (phase advances with distance, amplitude with speed).
    const targetAmp = this.grounded && this.moving ? clamp(this.speed2D / 4.2, 0, 1.7) : 0;
    this.bobAmp = damp(this.bobAmp, targetAmp, 8, dt);
    const stride = this.sprinting ? 1.05 : this.crouchBlend > 0.5 ? 0.6 : 0.78;
    this.gait = (this.stepCount + this.stepDist / stride) * Math.PI;
    const s = Math.abs(Math.sin(this.gait));
    this.bob.set(
      Math.sin(this.gait) * 0.011 * this.bobAmp,
      (s - 1) * 0.02 * this.bobAmp + this.dip.value * 0.05,
      0,
    );
    // Idle breathing
    const t = performance.now() / 1000;
    this.bob.y += Math.sin(t * 1.6) * 0.0016 * (1 - this.bobAmp * 0.5);

    // Camera roll from strafing + sprint sway; sinks while swimming.
    const strafe = this.grounded ? -inp.move.x * this.speed2D * 0.0016 : 0;
    this.roll = damp(this.roll, strafe + Math.sin(this.gait) * 0.004 * this.bobAmp * (this.sprinting ? 1.8 : 0.6), 10, dt);

    _tmp.lerpVectors(this.prevPos, this.pos, this.mantle || this.noclip ? 1 : alpha);
    let mantlePitch = 0; // positive = look down
    let mantleDrop = 0;
    if (this.mantle) {
      const m = this.mantle;
      if (m.ledge.kind === 'climb') {
        // look up at the ledge while reaching, then down at the top as you mount it
        const up = Math.sin(Math.PI * clamp(m.t / 0.5, 0, 1)) * 0.3;
        const down = Math.sin(Math.PI * clamp((m.t - 0.4) / 0.6, 0, 1)) * 0.38;
        mantlePitch = down - up;
        mantleDrop = 0.08 * Math.sin(Math.PI * m.t);
      } else {
        mantlePitch = 0.12 * Math.sin(Math.PI * m.t);
        mantleDrop = 0.04 * Math.sin(Math.PI * m.t);
      }
    }
    const swimSink = this.swimBlend * 0.15;
    this.eye.set(_tmp.x + this.bob.x * Math.cos(this.yaw), _tmp.y + this.eyeHeight + this.bob.y - swimSink - mantleDrop, _tmp.z - this.bob.x * Math.sin(this.yaw));
    camera.position.copy(this.eye);
    _e.set(this.pitch - mantlePitch, this.yaw, this.roll, 'YXZ');
    camera.quaternion.setFromEuler(_e);
  }
}
