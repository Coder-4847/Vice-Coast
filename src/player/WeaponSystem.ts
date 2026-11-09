import * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import { clamp, damp } from '../core/math';
import type { InputManager } from '../input/InputManager';
import { GROUP, type Physics, type RayHit } from '../physics/Physics';
import type { Effects } from '../world/Effects';
import type { Props } from '../world/Props';
import type { Player } from './Player';
import { WEAPONS, type WeaponDef, type WeaponId } from './Weapons';

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


const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _aim = new THREE.Vector3();

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
  /** The weapon currently in hand, and what you carry. */
  def: WeaponDef = WEAPONS.vc9;
  readonly inv: Record<WeaponId, { ammo: number; reserve: number; owned: boolean }> = {
    vc9: { ammo: 13, reserve: 60, owned: true },
    smg: { ammo: 0, reserve: 0, owned: false },
    shotgun: { ammo: 0, reserve: 0, owned: false },
    rifle: { ammo: 0, reserve: 0, owned: false },
  };
  private pendingId: WeaponId | null = null;
  /** Called when the held weapon changes (HUD, audio). */
  onSwap: ((def: WeaponDef) => void) | null = null;

  get name(): string {
    return this.def.name;
  }

  /** Largest ammo count the gun can hold (pistols carry one in the chamber). */
  get maxAmmo(): number {
    return this.def.mag + (this.def.pistol ? 1 : 0);
  }

  /** Give a weapon (and ammunition). Returns true if it was new. */
  give(id: WeaponId, rounds: number): boolean {
    const slot = this.inv[id];
    const fresh = !slot.owned;
    slot.owned = true;
    const def = WEAPONS[id];
    if (id === this.def.id) {
      this.reserve = Math.min(def.reserveMax, this.reserve + rounds);
    } else {
      if (fresh) slot.ammo = def.mag;
      slot.reserve = Math.min(def.reserveMax, slot.reserve + rounds);
    }
    return fresh;
  }

  /** Switch weapons (holsters the current one first). */
  select(id: WeaponId): void {
    if (!this.inv[id].owned || (id === this.def.id && this.pendingId === null)) return;
    if (this.state === 'reloading') return;
    if (this.state === 'holstered') {
      this.swap(id);
      this.toggleHolster();
      return;
    }
    this.pendingId = id;
    if (this.state !== 'holstering') {
      this.setState('holstering');
      this.audio.mech('holster');
    }
  }

  private swap(id: WeaponId): void {
    this.inv[this.def.id].ammo = this.ammo;
    this.inv[this.def.id].reserve = this.reserve;
    this.def = WEAPONS[id];
    this.ammo = this.inv[id].ammo;
    this.reserve = this.inv[id].reserve;
    this.slideLocked = this.def.pistol && this.ammo === 0;
    this.slide = this.slideLocked ? 1 : 0;
    this.shotsInBurst = 0;
    this.onSwap?.(this.def);
  }
  state: WeaponState = 'drawing';
  stateT = 0;
  /** Rounds in the gun, chamber included (max 13). */
  ammo = 13;
  reserve = 60;
  /** 0 hip … 1 fully aimed. */
  ads = 0;
  /** Attachments bought in the weapon shop. */
  readonly suppressed: Record<WeaponId, boolean> = { vc9: false, smg: false, shotgun: false, rifle: false };
  readonly scoped: Record<WeaponId, boolean> = { vc9: false, smg: false, shotgun: false, rifle: false };
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
    if (this.state !== 'ready' || this.reserve <= 0 || this.ammo >= this.maxAmmo) return;
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

    // The holster button draws / holsters; the weapon wheel (Game) picks the weapon.
    if (inp.pressed('holster')) {
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
        if (this.stateT >= HOLSTER_TIME) {
          if (this.pendingId) {
            const id = this.pendingId;
            this.pendingId = null;
            this.setState('holstered');
            this.swap(id);
            this.toggleHolster();
          } else this.setState('holstered');
        }
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
    if ((this.fireBuffer > 0 || (this.def.auto && fireDown)) && canFire && this.cooldown <= 0) {
      this.fireBuffer = 0;
      if (this.ammo > 0) this.shoot();
      else if (firePressed || this.def.auto) this.dryFire();
    }

    // Slide returns after firing unless locked back on an empty gun.
    const slideTarget = this.slideLocked ? 1 : 0;
    this.slide = damp(this.slide, slideTarget, this.slideLocked ? 40 : 28, dt);
    // pump-action gun: the forend works back and forth after each shot
    if (this.def.id === 'shotgun' && this.sinceShot < 0.55 && this.sinceShot > 0.12) this.slide = Math.sin(((this.sinceShot - 0.12) / 0.43) * Math.PI);

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
            const need = this.def.mag - (this.tactical ? this.ammo - (this.def.pistol ? 1 : 0) : 0);
            const take = Math.min(need, this.reserve);
            this.reserve -= take;
            this.ammo = (this.tactical ? this.ammo : 0) + take;
            break;
          }
          case 'slideRelease':
            if (!this.tactical && this.def.pistol) {
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
    const def = this.def;
    this.ammo--;
    this.shotsFired++;
    this.firedThisFrame = true;
    this.cooldown = def.interval;
    this.sinceShot = 0;
    this.shotsInBurst++;
    if (this.ammo === 0 && def.pistol) this.slideLocked = true;
    this.slide = 1; // slide / bolt snaps back, then returns via damping

    p.lookDirection(_aim);
    _right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    _up.crossVectors(_right, _aim).normalize();
    _origin.copy(p.eyePosition);
    const quiet = this.suppressed[def.id];
    if (!quiet) this.npc?.alarm(_origin.x, _origin.z);

    // --- one ray per pellet: eye → aim direction with a random point inside the spread cone --------------------
    for (let k = 0; k < def.pellets; k++) {
      const deg = this.spread * def.spreadMul + (def.pellets > 1 ? def.pelletSpread : 0);
      const cone = THREE.MathUtils.degToRad(deg) * 0.5;
      const r = Math.sqrt(Math.random()) * cone;
      const a = Math.random() * Math.PI * 2;
      _dir.copy(_aim).addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();

      const hit = this.physics.raycast(_origin, _dir, def.range * 2.5, undefined, GROUP.WORLD | GROUP.PROP);
      // pedestrians (and aircraft) are not physics bodies: test them separately and keep whichever is nearer
      const npcHit = this.npc?.rayHit(_origin.x, _origin.y, _origin.z, _dir.x, _dir.y, _dir.z, hit ? hit.distance : def.range * 2.5) ?? null;
      const end = npcHit ? new THREE.Vector3().copy(_origin).addScaledVector(_dir, npcHit.t) : hit ? hit.point : new THREE.Vector3().copy(_origin).addScaledVector(_dir, 120);
      if (k < 3) this.effects.tracer(this.muzzleWorld, end);
      if (npcHit) {
        const n = new THREE.Vector3().copy(_dir).negate();
        this.effects.impact(end, n, 'flesh', false);
        // damage falls off past the gun's effective range
        const fall = npcHit.t > def.range ? Math.max(0.35, 1 - (npcHit.t - def.range) / (def.range * 1.5)) : 1;
        this.npc?.hurt(npcHit.target, _dir.x, _dir.z, def.damage * fall, npcHit.head);
        this.hitMarker = 0.18;
        this.hitThisFrame = this.lastHit = { hit: { point: end, normal: n, distance: npcHit.t, surface: 'flesh', collider: null, body: null }, target: true };
      } else if (hit && hit.collider && this.onColliderHit && this.onColliderHit(hit.collider.handle, def.damage * 0.55)) {
        this.effects.impact(hit.point, hit.normal, hit.surface, false);
        this.hitThisFrame = this.lastHit = { hit, target: false };
      } else if (hit) {
        const target = !!hit.body && !!this.props()?.hit(hit.body, hit.point, _dir, 22 * (def.damage / 40));
        if (k < 4 || !hit.body) this.effects.impact(hit.point, hit.normal, hit.surface, !hit.body);
        this.hitThisFrame = this.lastHit = { hit, target };
        if (target) this.hitMarker = 0.18;
      }
    }

    // --- brass ---------------------------------------------------------------------------------
    _right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    this.effects.casing(this.ejectWorld, _right, _up.set(0, 1, 0), _dir.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)).negate());

    // --- sound, haptics, recoil ----------------------------------------------------------------
    this.audio.gunshot(this.physics.openness(p.eyePosition), this.ejectWorld, def.sound, quiet ? 0.22 : 1);
    this.input.rumble(Math.min(1, 0.55 * def.kick), 0.35, 70);
    // Recoil pattern: a reliable climb with a gentle sideways drift that flips now and then.
    const n = Math.min(this.shotsInBurst, 7);
    const aimed = 1 - 0.3 * this.ads;
    const pitch = (0.0085 + n * 0.0011) * aimed * (1 - 0.25 * p.crouchBlend) * def.recoil;
    if (Math.random() < 0.18) this.yawDrift = -this.yawDrift;
    const yaw = this.yawDrift * (0.0012 + Math.random() * 0.0022) * aimed * def.recoil;
    p.addRecoil(pitch, yaw);
    this.bloom = Math.min(3.2, this.bloom + 0.55 * Math.min(1.6, def.recoil));
    this.onFire?.((1 + n * 0.06) * def.kick);
  }
}
