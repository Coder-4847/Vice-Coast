import * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import { clamp, damp } from '../core/math';
import type { InputManager } from '../input/InputManager';
import { GROUP, type Physics, type RayHit } from '../physics/Physics';
import type { Effects } from '../world/Effects';
import type { Props } from '../world/Props';
import type { Player } from './Player';

export type WeaponState = 'holstered' | 'drawing' | 'ready' | 'reloading' | 'holstering' | 'inspecting';

/** Reload timeline (seconds). The viewmodel animates against the same keyframes. */
export const RELOAD = {
  magOut: 0.26,
  magDrop: 0.44,
  grab: 0.66,
  insert: 0.96,
  slideStart: 1.16,
  slideRelease: 1.38,
  doneEmpty: 1.92,
  doneTactical: 1.5,
} as const;

export const DRAW_TIME = 0.6;
export const HOLSTER_TIME = 0.45;
export const INSPECT_TIME = 2.8;

const FIRE_INTERVAL = 0.105;
const MAG_SIZE = 12;

const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _origin = new THREE.Vector3();

export interface HitEvent {
  hit: RayHit;
  /** True if it struck a registered dynamic prop (a "target"). */
  target: boolean;
}

/**
 * Pistol logic: ammo, reload timeline, semi-auto fire with recoil pattern + spread bloom, ADS, hitscan against
 * the physics world with per-material impact effects. Presentation lives in the Viewmodel.
 */
export class WeaponSystem {
  readonly name = 'VC-9';
  state: WeaponState = 'drawing';
  stateT = 0;
  /** Rounds in the gun, chamber included (max 13). */
  ammo = MAG_SIZE + 1;
  reserve = 60;
  /** 0 hip … 1 fully aimed. */
  ads = 0;
  /** Trigger pull 0–1 (visual). */
  trigger = 0;
  /** Slide position 0 forward … 1 back (visual, includes lock-back on empty). */
  slide = 0;
  slideLocked = false;
  tactical = false;
  /** Bloom added by recent shots, degrees. */
  bloom = 0;
  /** Current total spread, degrees (drives the crosshair). */
  spread = 1;
  /** Seconds since the last shot. */
  sinceShot = 9;
  /** Set true for one frame when a shot goes off / dry-fires / lands a hit; read by the HUD and viewmodel. */
  firedThisFrame = false;
  dryFiredThisFrame = false;
  hitThisFrame: HitEvent | null = null;
  /** The most recent hit, kept until the next one (HUD, tests, debugging). */
  lastHit: HitEvent | null = null;
  /** Pedestrian hit-testing and alarm hooks, installed by the NPC system. */
  npc: { rayHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): { t: number; target: unknown; head: boolean } | null; hurt(target: unknown, dx: number, dz: number, damage: number, head: boolean): void; alarm(x: number, z: number): void } | null = null;
  /** Bullets that hit a vehicle collider (installed by the combat system). */
  onColliderHit: ((handle: number, damage: number) => boolean) | null = null;
  /** Total shots fired this session. */
  shotsFired = 0;
  /** Hit marker timer for the HUD (seconds remaining). */
  hitMarker = 0;
  /** Muzzle world position for tracers (set by the viewmodel each frame). */
  readonly muzzleWorld = new THREE.Vector3();
  readonly ejectWorld = new THREE.Vector3();

  /** Viewmodel hooks. */
  onFire: ((strength: number) => void) | null = null;
  onReloadEvent: ((e: 'magOut' | 'magDrop' | 'grab' | 'insert' | 'slideRelease') => void) | null = null;
  onDraw: (() => void) | null = null;

  private cooldown = 0;
  private fireBuffer = 0;
  private shotsInBurst = 0;
  private yawDrift = 1;
  private reloadT = 0;
  private reloadFired = new Set<string>();
  private wasFire = false;

  constructor(
    private readonly input: InputManager,
    private readonly player: Player,
    private readonly physics: Physics,
    private readonly audio: AudioEngine,
    private readonly effects: Effects,
    private readonly props: () => Props | null,
  ) {}

  get reloadTime(): number {
    return this.reloadT;
  }
  get reloadDuration(): number {
    return this.tactical ? RELOAD.doneTactical : RELOAD.doneEmpty;
  }
  get isDrawn(): boolean {
    return this.state !== 'holstered' && this.state !== 'holstering';
  }

  private setState(s: WeaponState): void {
    this.state = s;
    this.stateT = 0;
  }

  /** Toggle between drawn and holstered. */
  toggleHolster(): void {
    if (this.state === 'holstered' || this.state === 'holstering') {
      this.setState('drawing');
      this.audio.mech('draw');
      this.onDraw?.();
    } else if (this.state === 'ready' || this.state === 'inspecting') {
      this.setState('holstering');
      this.audio.mech('holster');
    }
  }

  startReload(): void {
    if (this.state !== 'ready' || this.reserve <= 0 || this.ammo >= MAG_SIZE + 1) return;
    this.tactical = this.ammo > 0;
    this.reloadT = 0;
    this.reloadFired.clear();
    this.setState('reloading');
  }

  /** Per-frame logic. `canShoot` is false while sprinting, climbing or swimming. */
  update(dt: number): void {
    const inp = this.input;
    this.firedThisFrame = false;
    this.dryFiredThisFrame = false;
    this.hitThisFrame = null;
    this.stateT += dt;
    this.sinceShot += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.fireBuffer = Math.max(0, this.fireBuffer - dt);
    this.hitMarker = Math.max(0, this.hitMarker - dt);
    this.bloom = Math.max(0, this.bloom - dt * 5.5);

    const p = this.player;
    const busy = p.mantle !== null || p.state === 'swim' || p.noclip;
    const sprintBlocked = p.sprintBlend > 0.35;

    // Weapon wheel / holster button toggles draw (temporary until the Phase 7 wheel).
    if (inp.pressed('holster') || inp.pressed('weaponWheel')) {
      if (!busy) this.toggleHolster();
    }
    if (busy && this.state === 'ready' && p.mantle) {
      // Climbing doesn't holster, the viewmodel just lowers the gun.
    }

    // --- state timeline ------------------------------------------------------------------------
    switch (this.state) {
      case 'drawing':
        if (this.stateT >= DRAW_TIME) this.setState('ready');
        break;
      case 'holstering':
        if (this.stateT >= HOLSTER_TIME) this.setState('holstered');
        break;
      case 'inspecting':
        if (this.stateT >= INSPECT_TIME || inp.pressed('fire')) this.setState('ready');
        break;
      case 'reloading':
        this.advanceReload(dt);
        break;
      default:
    }

    if (this.state === 'ready' && inp.pressed('inspect') && !busy && !sprintBlocked) {
      this.setState('inspecting');
      this.audio.mech('inspect');
    }
    if (this.state === 'ready' && inp.pressed('reload') && !busy) this.startReload();

    // --- aiming -------------------------------------------------------------------------------
    const wantAim = inp.active('aim') && this.state === 'ready' && !busy && !sprintBlocked;
    const adsRate = wantAim ? 1 / 0.2 : 1 / 0.16;
    this.ads = clamp(this.ads + (wantAim ? 1 : -1) * adsRate * dt, 0, 1);
    p.aiming = this.ads > 0.35;
    p.lookScale = 1 - 0.42 * this.ads * this.ads;
    p.sprintAllowed = this.state !== 'reloading' && this.state !== 'inspecting' && this.ads < 0.3;

    // --- firing -------------------------------------------------------------------------------
    const fireDown = inp.down('fire');
    const firePressed = fireDown && !this.wasFire;
    this.wasFire = fireDown;
    if (firePressed) this.fireBuffer = 0.12;
    this.trigger = damp(this.trigger, fireDown && this.state === 'ready' ? 1 : 0, 40, dt);

    const canFire = this.state === 'ready' && !busy && !sprintBlocked;
    if (this.fireBuffer > 0 && canFire && this.cooldown <= 0) {
      this.fireBuffer = 0;
      if (this.ammo > 0) this.shoot();
      else this.dryFire();
    }

    // Slide returns after firing unless locked back on an empty gun.
    const slideTarget = this.slideLocked ? 1 : 0;
    this.slide = damp(this.slide, slideTarget, this.slideLocked ? 40 : 28, dt);

    if (this.sinceShot > 0.45) this.shotsInBurst = 0;
    this.updateSpread(dt);
  }

  private advanceReload(dt: number): void {
    const prev = this.reloadT;
    this.reloadT += dt;
    const t = this.reloadT;
    const hit = (name: 'magOut' | 'magDrop' | 'grab' | 'insert' | 'slideRelease', at: number) => {
      if (prev < at && t >= at && !this.reloadFired.has(name)) {
        this.reloadFired.add(name);
        this.onReloadEvent?.(name);
        switch (name) {
          case 'magOut': this.audio.mech('magOut'); break;
          case 'magDrop': this.audio.mech('cloth'); break;
          case 'grab': this.audio.mech('cloth'); break;
          case 'insert': {
            this.audio.mech('magIn');
            const need = MAG_SIZE - (this.tactical ? this.ammo - 1 : 0);
            const take = Math.min(need, this.reserve);
            this.reserve -= take;
            this.ammo = (this.tactical ? this.ammo : 0) + take;
            break;
          }
          case 'slideRelease':
            if (!this.tactical) {
              this.audio.mech('rack');
              this.slideLocked = false;
              if (this.ammo > 0) this.ammo = Math.max(this.ammo, 1);
            }
            break;
        }
      }
    };
    hit('magOut', RELOAD.magOut);
    hit('magDrop', RELOAD.magDrop);
    hit('grab', RELOAD.grab);
    hit('insert', RELOAD.insert);
    if (!this.tactical) hit('slideRelease', RELOAD.slideRelease);
    if (t >= this.reloadDuration) {
      this.slideLocked = false;
      this.setState('ready');
    }
  }

  private updateSpread(dt: number): void {
    const p = this.player;
    const hip = 1.0;
    const aimed = 0.12;
    let s = hip + (aimed - hip) * this.ads;
    s += clamp(p.speed2D / 7, 0, 1) * (p.sprinting ? 3 : 1.8) * (1 - 0.5 * this.ads);
    if (!p.grounded) s += 2.2;
    s *= 1 - 0.32 * p.crouchBlend;
    s += this.bloom;
    this.spread = damp(this.spread, s, 18, dt);
  }

  private dryFire(): void {
    this.dryFiredThisFrame = true;
    this.audio.dryClick();
    this.cooldown = 0.2;
    this.fireBuffer = 0;
    this.input.rumble(0.05, 0.1, 25);
    // pressing fire on an empty gun starts the reload, like most shooters
    if (this.reserve > 0) this.startReload();
  }

  private shoot(): void {
    const p = this.player;
    this.ammo--;
    this.shotsFired++;
    this.firedThisFrame = true;
    this.cooldown = FIRE_INTERVAL;
    this.sinceShot = 0;
    this.shotsInBurst++;
    if (this.ammo === 0) this.slideLocked = true;
    this.slide = 1; // slide snaps back, then returns via damping

    // --- ray: eye → aim direction with a random point inside the spread cone -----------------------
    p.lookDirection(_dir);
    _right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    _up.crossVectors(_right, _dir).normalize();
    const cone = THREE.MathUtils.degToRad(this.spread) * 0.5;
    const r = Math.sqrt(Math.random()) * cone;
    const a = Math.random() * Math.PI * 2;
    _dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
    _origin.copy(p.eyePosition);

    const hit = this.physics.raycast(_origin, _dir, 300, undefined, GROUP.WORLD | GROUP.PROP);
    // pedestrians are not physics bodies: test them separately and keep whichever is nearer
    const npcHit = this.npc?.rayHit(_origin.x, _origin.y, _origin.z, _dir.x, _dir.y, _dir.z, hit ? hit.distance : 300) ?? null;
    this.npc?.alarm(_origin.x, _origin.z);
    const end = npcHit ? new THREE.Vector3().copy(_origin).addScaledVector(_dir, npcHit.t) : hit ? hit.point : new THREE.Vector3().copy(_origin).addScaledVector(_dir, 120);
    // tracer starts at the muzzle (as seen in the world pass) and runs to the hit
    this.effects.tracer(this.muzzleWorld, end);
    if (npcHit) {
      const n = new THREE.Vector3().copy(_dir).negate();
      this.effects.impact(end, n, 'flesh', false);
      this.npc?.hurt(npcHit.target, _dir.x, _dir.z, 40, npcHit.head);
      this.hitMarker = 0.18;
      this.hitThisFrame = this.lastHit = { hit: { point: end, normal: n, distance: npcHit.t, surface: 'flesh', collider: null, body: null }, target: true };
    } else if (hit && hit.collider && this.onColliderHit && this.onColliderHit(hit.collider.handle, 22)) {
      this.effects.impact(hit.point, hit.normal, hit.surface, false);
      this.hitThisFrame = this.lastHit = { hit, target: false };
    } else if (hit) {
      const target = !!hit.body && !!this.props()?.hit(hit.body, hit.point, _dir, 22);
      this.effects.impact(hit.point, hit.normal, hit.surface, !hit.body);
      this.hitThisFrame = this.lastHit = { hit, target };
      if (target) this.hitMarker = 0.18;
    }

    // --- brass ---------------------------------------------------------------------------------
    _right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    this.effects.casing(this.ejectWorld, _right, _up.set(0, 1, 0), _dir.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)).negate());

    // --- sound, haptics, recoil ----------------------------------------------------------------
    this.audio.gunshot(this.physics.openness(p.eyePosition), this.ejectWorld);
    this.input.rumble(0.55, 0.35, 70);
    // Recoil pattern: a reliable climb with a gentle sideways drift that flips now and then.
    const n = Math.min(this.shotsInBurst, 7);
    const aimed = 1 - 0.3 * this.ads;
    const pitch = (0.0085 + n * 0.0011) * aimed * (1 - 0.25 * p.crouchBlend);
    if (Math.random() < 0.18) this.yawDrift = -this.yawDrift;
    const yaw = this.yawDrift * (0.0012 + Math.random() * 0.0022) * aimed;
    p.addRecoil(pitch, yaw);
    this.bloom = Math.min(3.2, this.bloom + 0.55);
    this.onFire?.(1 + n * 0.06);
  }
}
