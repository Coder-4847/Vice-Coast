import * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import type { Physics } from '../physics/Physics';
import type { Npcs } from '../npc/Npcs';
import type { Player } from '../player/Player';
import type { WeaponSystem } from '../player/WeaponSystem';
import type { CombatHud } from '../ui/CombatHud';
import type { Driving } from '../vehicles/Driving';
import type { Vehicle } from '../vehicles/Vehicle';
import type { VehicleManager } from '../vehicles/VehicleManager';
import type { Effects } from '../world/Effects';
import type { World } from '../world/World';
import { Vitals } from './Vitals';

export interface CombatDeps {
  world: World;
  physics: Physics;
  audio: AudioEngine;
  effects: Effects;
  player: Player;
  driving: Driving;
  vehicles: VehicleManager;
  npcs: Npcs;
  weapon: WeaponSystem;
  hud: CombatHud;
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  toast(m: string): void;
}

type FlowKind = 'wasted' | 'busted';

const easeOut = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _axisZ = new THREE.Vector3(0, 0, 1);

/**
 * The combat layer: player vitals, explosions and their damage, burning vehicles, and the Wasted / Busted respawn
 * flows. The wanted level and the police live in Wanted.ts / Police.ts and report in here.
 */
export class Combat {
  readonly vitals = new Vitals();
  /** Active Wasted / Busted sequence. */
  flow: { kind: FlowKind; t: number } | null = null;
  /** Set by the wanted system so crimes can be reported from here. */
  crime: ((weight: number, x: number, z: number, opts?: { cop?: boolean }) => void) | null = null;
  /** Called when the respawn happens (clear wanted, police units, etc.). */
  onRespawn: ((kind: FlowKind) => void) | null = null;
  stats = { explosions: 0, burning: 0 };

  private readonly fuse = new Map<Vehicle, number>();
  private smokeT = 0;
  private shake = 0;

  constructor(private readonly d: CombatDeps) {
    this.vitals.onDeath = () => this.begin('wasted');
    d.player.onLand = (speed) => {
      // landing from more than ~4 m hurts
      if (speed > 13) this.vitals.hurt(Math.min(90, (speed - 13) * 9));
    };
  }

  /** Damage the player. Inside a vehicle, the shell soaks some of it. */
  hurtPlayer(amount: number, fromX?: number, fromZ?: number): void {
    const { player, driving } = this.d;
    if (this.flow) return;
    const inCar = driving.mode === 'driving' && driving.vehicle;
    if (inCar) {
      driving.vehicle!.health = Math.max(0, driving.vehicle!.health - amount * 3);
      amount *= 0.3;
    }
    this.vitals.hurt(amount, fromX, fromZ, player.pos.x, player.pos.z);
  }

  // ---------------------------------------------------------------------------------------- explosions

  /**
   * An explosion: fireball + sound, then damage to everything within `radius` falling off with distance. `byPlayer`
   * makes it a crime. Returns nothing; effects are fire-and-forget.
   */
  boom(x: number, y: number, z: number, radius: number, damage: number, byPlayer = false): void {
    const { effects, audio, player, vehicles, npcs, driving } = this.d;
    this.stats.explosions++;
    const size = Math.min(2.6, radius / 8);
    _v.set(x, y, z);
    effects.explosion(_v, size);
    audio.explosion(_v, size);
    this.shake = Math.max(this.shake, Math.min(1, (radius * 2.2) / Math.max(8, Math.hypot(player.pos.x - x, player.pos.z - z))));

    const fall = (d: number): number => Math.pow(Math.max(0, 1 - d / radius), 1.2);
    // the player
    const dp = Math.hypot(player.pos.x - x, player.pos.y - y, player.pos.z - z);
    if (dp < radius) this.hurtPlayer(damage * fall(dp) * (driving.mode === 'driving' ? 0.7 : 1), x, z);
    // vehicles
    for (const v of vehicles.vehicles) {
      const d = Math.hypot(v.position.x - x, v.position.y - y, v.position.z - z);
      if (d > radius * 1.3) continue;
      const k = fall(d / 1.3);
      v.health = Math.max(0, v.health - damage * 5 * k);
      const dx = v.position.x - x, dz = v.position.z - z, l = Math.hypot(dx, dz) || 1;
      const imp = 1600 * Math.min(1, damage / 60) * k;
      v.body.applyImpulse({ x: (dx / l) * imp, y: 900 * k, z: (dz / l) * imp }, true);
    }
    // pedestrians, police on foot
    for (const p of npcs.peds.peds) {
      if (!p.active || p.state === 'down') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > radius) continue;
      const dx = p.x - x, dz = p.z - z, l = Math.hypot(dx, dz) || 1;
      npcs.peds.knockDown(p, (dx / l) * 9 * fall(d), (dz / l) * 9 * fall(d), damage * 1.4 * fall(d), byPlayer);
    }
    // traffic cars
    for (const c of npcs.traffic.cars) {
      if (!c.active) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d > radius) continue;
      const dx = c.x - x, dz = c.z - z, l = Math.hypot(dx, dz) || 1;
      const k = fall(d);
      c.hp -= damage * 4 * k;
      if (c.state !== 'wreck' && c.hp < 60) npcs.traffic.wreckCar(c, (dx / l) * 14 * k, (dz / l) * 14 * k);
    }
    if (byPlayer) this.crime?.(35, x, z);
    npcs.peds.alarm(x, z, 'crash');
  }

  // ------------------------------------------------------------------------------------ bullets on cars

  /** A bullet hit a vehicle collider (driven/parked vehicle or traffic car). */
  hitCollider(handle: number, damage: number): boolean {
    const { vehicles, npcs } = this.d;
    for (const v of vehicles.vehicles) {
      if (v.collider.handle === handle) { v.health = Math.max(0, v.health - damage * 2.2); return true; }
    }
    for (const c of npcs.traffic.cars) {
      if (c.active && c.collider && c.collider.handle === handle) {
        c.hp -= damage * 2;
        if (c.hp <= 0 && c.state !== 'wreck') npcs.traffic.wreckCar(c, 0, 0);
        return true;
      }
    }
    return false;
  }

  // ----------------------------------------------------------------------------------------- per frame

  update(dt: number): void {
    const { vehicles, npcs, effects, driving, player } = this.d;
    this.vitals.update(dt);
    this.shake = Math.max(0, this.shake - dt * 1.8);

    // burning and exploding vehicles (driven/parked ones)
    this.smokeT -= dt;
    const puff = this.smokeT <= 0;
    if (puff) this.smokeT = 0.13;
    let burning = 0;
    for (const v of vehicles.vehicles) {
      if (v.exploded) {
        if (puff && Math.random() < 0.35) { _v.copy(v.position); _v.y += 1.0; effects.smoke(_v, false); }
        continue;
      }
      if (v.health >= 260) continue;
      burning++;
      if (puff) {
        _f.set(0, 0, -v.spec.size.length * 0.32).applyQuaternion(v.quaternion);
        _v.copy(v.position).add(_f);
        _v.y += 0.8;
        effects.smoke(_v, v.health <= 0);
      }
      if (v.health <= 0) {
        const f = (this.fuse.get(v) ?? 5.2) - dt;
        this.fuse.set(v, f);
        // sitting in a burning car hurts
        if (f < 3 && driving.vehicle === v && driving.mode === 'driving') this.vitals.hurt(dt * 9);
        if (f <= 0) this.explodeVehicle(v);
      }
    }
    // burning traffic wrecks: smoke, then a fireball once the fuse runs out
    for (const c of npcs.traffic.cars) {
      if (!c.active || c.state !== 'wreck') continue;
      if (c.hp < 45 && puff) { _v.set(c.x, 5.9, c.z); effects.smoke(_v, c.hp <= 0); }
      if (c.hp <= 0) {
        if (c.fuse < 0) c.fuse = 4.5;
        else {
          c.fuse -= dt;
          if (c.fuse <= 0) {
            this.boom(c.x, 5.6, c.z, 8, 100, this.byPlayerRecently);
            npcs.traffic.remove(c);
          }
        }
      }
    }
    this.stats.burning = burning;
    void player;

    // flows
    if (this.flow) {
      this.flow.t += dt;
      if (this.flow.t > (this.flow.kind === 'wasted' ? 4.8 : 4.2)) this.respawn(this.flow.kind);
    }
  }

  private explodeVehicle(v: Vehicle): void {
    const { driving, effects } = this.d;
    this.fuse.delete(v);
    v.exploded = true;
    this.boom(v.position.x, v.position.y + 0.8, v.position.z, 10, 130, driving.vehicle === v || this.byPlayerRecently);
    if (driving.vehicle === v && driving.mode !== 'foot') driving.abort();
    v.occupied = false;
    v.body.applyImpulse({ x: (Math.random() - 0.5) * 900, y: 3200, z: (Math.random() - 0.5) * 900 }, true);
    const m = this.d.vehicles.visualOf(v);
    if (m) {
      for (const mat of m.materials) {
        const c = (mat as THREE.MeshStandardMaterial).color;
        if (c && !mat.userData.burnt) { c.multiplyScalar(0.25); mat.userData.burnt = true; }
      }
    }
    void effects;
  }

  /** True shortly after the player did something violent (so a chain-reaction counts as their crime). */
  byPlayerRecently = false;

  /** Camera offsets while dead / shaking by explosions. Call after the camera has its final transform. */
  cameraEffect(camera: THREE.PerspectiveCamera): void {
    if (this.flow && this.flow.kind === 'wasted') {
      const t = easeOut(this.flow.t / 0.8);
      camera.position.y -= 1.2 * t;
      _q.setFromAxisAngle(_axisZ, 1.25 * t);
      camera.quaternion.multiply(_q);
    } else if (this.shake > 0.01) {
      const s = this.shake * this.shake * 0.35;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      camera.position.z += (Math.random() - 0.5) * s;
    }
  }

  // ------------------------------------------------------------------------------------ wasted / busted

  begin(kind: FlowKind): void {
    if (this.flow) return;
    const { hud, canvas, driving, player, weapon } = this.d;
    this.flow = { kind, t: 0 };
    if (driving.mode !== 'foot') driving.abort();
    player.frozen = true;
    if (weapon.isDrawn) weapon.toggleHolster();
    canvas.style.filter = kind === 'wasted' ? 'grayscale(1) contrast(1.08) brightness(0.9)' : 'grayscale(0.85) contrast(1.05) hue-rotate(185deg)';
    canvas.style.transition = 'filter 700ms ease';
    hud.showFlow(kind === 'wasted' ? 'Wasted' : 'Busted', kind === 'wasted' ? 'Taken to St. Aurelia Medical Center' : 'Booked at Valeria PD Headquarters', kind);
  }

  private respawn(kind: FlowKind): void {
    const { world, player, vehicles, hud, canvas, weapon } = this.d;
    const plan = world.city.plan;
    let x = 740, z = 300, yaw = 0;
    if (kind === 'wasted' && plan.hospitalBlock) {
      const b = plan.hospitalBlock;
      x = b.cx; z = b.z1 + 6; yaw = 0; // facing north, at the hospital entrance
    } else if (plan.policeBlock) {
      const b = plan.policeBlock;
      x = b.cx; z = b.z0 - 6; yaw = Math.PI; // facing south, at the HQ steps
    }
    this.vitals.reset();
    player.frozen = false;
    player.teleport(x, z, yaw);
    // arrests cost you most of your spare ammunition; hospital bills a little
    weapon.reserve = Math.floor(weapon.reserve * (kind === 'busted' ? 0.35 : 0.7));
    vehicles.resetAll();
    this.flow = null;
    this.fuse.clear();
    canvas.style.filter = '';
    hud.hideFlow();
    this.onRespawn?.(kind);
    this.d.toast(kind === 'busted' ? 'Released. Your weapons were confiscated.' : 'Discharged. Take it easy out there.');
  }
}
