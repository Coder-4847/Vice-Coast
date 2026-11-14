import { CITY } from '../world/Terrain';
import { Townsfolk } from './Townsfolk';
import * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import type { QualityPreset } from '../core/Quality';
import type { Physics } from '../physics/Physics';
import type { Vehicle } from '../vehicles/Vehicle';
import { radialTexture } from '../world/City';
import { World } from '../world/World';
import { Traffic, TrafficRenderer } from './Traffic';
import { Ambient } from './Ambient';
import { Blood } from '../world/Blood';
import { GROUP } from '../physics/Physics';
import { PedRenderer, Pedestrians, pedDensity, type Ped, type VehicleHit } from './Pedestrians';

/** Relative traffic volume through the day: rush hours at ~8 and ~17:30, quiet from midnight to 5. */
export function trafficDensity(hour: number): number {
  const bump = (c: number, w: number) => Math.exp(-(((hour - c) / w) ** 2));
  return Math.min(1, 0.45 + 0.45 * bump(8.2, 1.8) + 0.55 * bump(17.6, 2.2) + 0.28 * bump(13, 3.5));
}

export interface NpcContext {
  /** Player's eye / body position. */
  pos: THREE.Vector3;
  /** The vehicle being driven, if any. */
  driving: Vehicle | null;
  /** Every vehicle in the world (parked ones count as obstacles). */
  vehicles: readonly Vehicle[];
  camera: THREE.PerspectiveCamera;
}

/** Everything that populates the streets: traffic now, pedestrians and ambient events alongside. */
export class Npcs {
  readonly traffic: Traffic;
  readonly trafficView: TrafficRenderer;
  readonly peds: Pedestrians;
  readonly pedView: PedRenderer;
  readonly ambient: Ambient;
  readonly townsfolk = new Townsfolk();
  private readonly hits: VehicleHit[] = [];
  private preset: QualityPreset;
  private readonly pv = new THREE.Matrix4();
  ctx: NpcContext | null = null;
  /** Extra shootable things (helicopters) and gunshot notifications, installed by the combat layer. */
  extraRay: ((ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number) => { t: number; target: unknown } | null) | null = null;
  extraHurt: ((target: unknown, damage: number) => boolean) | null = null;
  onGunshot: ((x: number, z: number) => void) | null = null;

  readonly blood = new Blood();
  private readonly phys: Physics;
  private bloodT = 0;

  constructor(private readonly world: World, physics: Physics, private readonly audio: AudioEngine, preset: QualityPreset) {
    this.preset = preset;
    this.phys = physics;
    world.scene.add(this.blood.group);
    // blood is left out of the atmosphere rig on purpose: its sky tint turns dark red purple
    this.traffic = new Traffic(world.city.plan, world.signals, 180);
    this.traffic.attachPhysics(physics);
    this.trafficView = new TrafficRenderer(96, radialTexture());
    for (const m of this.trafficView.materials) world.rig.register(m);
    world.rig.register(this.trafficView.lightMat, World.glow);
    world.scene.add(this.trafficView.group);
    world.pipeline.hideForAO.push(this.trafficView.poolMesh);
    this.peds = new Pedestrians(world.city.plan, world.signals, 360);
    this.pedView = new PedRenderer(210);
    for (const m of this.pedView.materials) world.rig.register(m);
    world.scene.add(this.pedView.group);
    this.ambient = new Ambient(this.traffic, this.peds, world.city.plan, audio);
    world.rig.register(this.ambient.flock.mat);
    world.scene.add(this.ambient.flock.group);
    this.traffic.hooks = {
      honk: (x, z) => this.audio.honk(new THREE.Vector3(x, 5.5, z)),
      crash: (x, z, s) => {
        this.audio.crash(new THREE.Vector3(x, 5.5, z), s);
        this.peds.alarm(x, z, 'crash');
      },
    };
    this.peds.hooks = { scream: (x, z) => this.audio.scream(new THREE.Vector3(x, 6.2, z)) };
  }

  setQuality(p: QualityPreset): void {
    this.preset = p;
  }

  /** Physics-rate step: feed the AI its obstacles, then move the cars. */
  fixedUpdate(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = this.traffic;
    t.clearObstacles();
    const drv = ctx.driving;
    for (const v of ctx.vehicles) {
      const lv = v.body.linvel();
      // cars parked at the kerb are thin obstacles, so traffic slips past them in its lane
      const kerb = v.ambient && !v.occupied && Math.abs(lv.x) + Math.abs(lv.z) < 0.5;
      t.addObstacle(v.position.x, v.position.z, v === drv ? 2.3 : kerb ? 0.6 : 2.1, lv.x, lv.z, 'player');
    }
    if (!drv) t.addObstacle(ctx.pos.x, ctx.pos.z, 0.55, 0, 0, 'player');
    for (const p of this.peds.peds) if (p.active && (p.onRoad || p.state === 'down') && p.dist < 130) t.addObstacle(p.x, p.z, 0.5, 0, 0, 'ped');
    t.focus.copy(drv ? drv.position : ctx.pos);
    // the vehicle that can wreck traffic: the driven one, or any other that is moving fast (a shoved or abandoned car)
    let mover: Vehicle | null = drv;
    let top = drv ? Math.hypot(drv.body.linvel().x, drv.body.linvel().z) : 3;
    for (const v of ctx.vehicles) {
      if (v === drv) continue;
      const lv = v.body.linvel();
      const sp = Math.hypot(lv.x, lv.z);
      if (sp > top) { top = sp; mover = v; }
    }
    t.playerBody = mover ? { collider: mover.collider, body: mover.body } : null;
    t.target = Math.round(this.preset.traffic * trafficDensity(this.world.tod.hour));
    const outside = Math.hypot(t.focus.x - CITY.x, t.focus.z - CITY.z) > 900;
    t.hwTarget = outside ? Math.round(Math.max(6, this.preset.traffic * 0.45) * (0.5 + 0.5 * trafficDensity(this.world.tod.hour))) : 0;
    t.night = this.world.tod.look.night;
    t.fixedUpdate(dt);
  }

  update(dt: number, alpha: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const cam = ctx.camera;
    this.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.traffic.frustum.setFromProjectionMatrix(this.pv);
    this.trafficView.sync(this.traffic.cars, alpha, this.world.tod.look.night, dt);
    // pools spread under the fallen (and follow the ones still crawling)
    this.blood.update(dt);
    this.bloodT -= dt;
    if (this.bloodT <= 0) {
      this.bloodT = 0.25;
      for (const p of this.peds.peds) {
        if (!p.active || p.state !== 'down' || p.fall < 0.9 || p.dist > 120 || p.health > 0) continue;
        this.blood.pool(p, p.x, p.y, p.z, p.dying > 0 ? 0.9 : 1.25);
      }
    }

    // pedestrians
    const hour = this.world.tod.hour;
    const p = this.peds;
    p.focus.copy(ctx.driving ? ctx.driving.position : ctx.pos);
    p.frustum.copy(this.traffic.frustum);
    p.hour = hour;
    p.target = Math.round(this.preset.peds * pedDensity(hour));
    this.hits.length = 0;
    for (const c of this.traffic.cars) {
      if (!c.active || c.state === 'park' || c.v < 1.8) continue;
      this.hits.push({ player: false, x: c.x, z: c.z, vx: c.fx * c.v, vz: c.fz * c.v, fx: c.fx, fz: c.fz, hl: c.type.L / 2, hw: c.type.W / 2 });
    }
    for (const v of ctx.vehicles) {
      const lv = v.body.linvel();
      const sp = Math.hypot(lv.x, lv.z);
      if (sp < 1.8) continue;
      this.hits.push({ player: true, x: v.position.x, z: v.position.z, vx: lv.x, vz: lv.z, fx: lv.x / sp, fz: lv.z / sp, hl: v.spec.size.length / 2, hw: v.spec.size.width / 2 });
    }
    p.update(Math.min(dt, 0.1), this.hits, ctx.pos);
    this.townsfolk.update(dt, p, p.focus.x, p.focus.z, hour);
    this.pedView.sync(p.peds);
    this.ambient.update(Math.min(dt, 0.1), { x: p.focus.x, z: p.focus.z, hour, frustum: this.traffic.frustum });
  }

  // ---- hooks for the weapon system -------------------------------------------------------------------------
  rayHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): { t: number; target: unknown; head: boolean } | null {
    const h = this.peds.rayHit(ox, oy, oz, dx, dy, dz, max);
    const e = this.extraRay?.(ox, oy, oz, dx, dy, dz, h ? Math.min(max, h.t) : max) ?? null;
    if (e && (!h || e.t < h.t)) return { t: e.t, target: e.target, head: false };
    return h ? { t: h.t, target: h.ped, head: h.head } : null;
  }
  /** A bullet or blade hit a person. Returns the result for the hit marker. */
  hurt(targetAny: unknown, dx: number, dz: number, damage: number, head = false): 'hit' | 'down' | 'kill' | null {
    if (this.extraHurt?.(targetAny, damage)) return 'hit';
    const target = targetAny as Ped;
    const res = this.peds.knockDown(target, dx * 1.2, dz * 1.2, damage, true, head);
    this.peds.alarm(target.x, target.z, 'crash');
    this.bleed(target, dx, dz, head, damage);
    return res;
  }

  /** Blood thrown behind the wound onto whatever is there: a wall, a car, the pavement. */
  private bleed(p: Ped, dx: number, dz: number, head: boolean, damage: number): void {
    const len = Math.hypot(dx, dz) || 1;
    const o = new THREE.Vector3(p.x, p.y + (p.state === 'down' ? 0.3 : head ? 1.6 : 1.15), p.z);
    const d = new THREE.Vector3(dx / len, -0.25, dz / len).normalize();
    o.addScaledVector(d, 0.3);
    const size = Math.min(1.3, 0.45 + damage / 120 + (head ? 0.3 : 0));
    const hit = this.phys.raycast(o, d, 3.5, undefined, GROUP.WORLD);
    if (hit) this.blood.splat(hit.point, hit.normal, size);
    // and drops on the ground under them
    const gx = p.x + d.x * 0.6, gz = p.z + d.z * 0.6;
    this.blood.splat(new THREE.Vector3(gx, this.world.heightAt(gx, gz) + 0.01, gz), new THREE.Vector3(0, 1, 0), size * 0.7);
  }
  alarm(x: number, z: number): void {
    this.peds.alarm(x, z, 'gunshot');
    this.onGunshot?.(x, z);
  }

  /** Test helper: advance the simulation without rendering. */
  get stats() {
    return this.traffic.stats;
  }
}
