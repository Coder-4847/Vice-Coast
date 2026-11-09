import * as THREE from 'three';
import type { Game } from '../Game';
import type { Look, Ped } from '../npc/Pedestrians';
import { GROUP } from '../physics/Physics';
import { terrainHeight } from '../world/Terrain';
import { CAST } from './chars';
import { lookFor } from './Figures';

export type GunKind = 'pistol' | 'smg' | 'shotgun' | 'rifle';

interface Spec { dmg: number; interval: number; range: number; spread: number; pellets: number; burst: number; pause: number; speed: number; sight: number; hp: number }
const SPECS: Record<GunKind, Spec> = {
  pistol: { dmg: 5, interval: 0.9, range: 34, spread: 0.05, pellets: 1, burst: 1, pause: 0.9, speed: 3.6, sight: 60, hp: 80 },
  smg: { dmg: 3.2, interval: 0.1, range: 30, spread: 0.07, pellets: 1, burst: 6, pause: 1.3, speed: 4.4, sight: 60, hp: 90 },
  shotgun: { dmg: 3.5, interval: 1.6, range: 20, spread: 0.08, pellets: 7, burst: 1, pause: 1.6, speed: 4.4, sight: 50, hp: 110 },
  rifle: { dmg: 4, interval: 0.17, range: 58, spread: 0.05, pellets: 1, burst: 3, pause: 1.4, speed: 3.9, sight: 90, hp: 110 },
};

export interface HostileOpts {
  x: number;
  z: number;
  kind?: GunKind;
  tag?: string;
  /** Standing guards stay put and turn to face you; hunters advance. */
  hold?: boolean;
  /** Starts unaware (heist guards): becomes hostile when it sees you, hears a shot or is alerted. */
  unaware?: boolean;
  /** Patrol points [x, z]. */
  patrol?: [number, number][];
  look?: Look | string;
  hp?: number;
  armour?: number;
  yaw?: number;
  /** Damage multiplier (mission difficulty). */
  power?: number;
}

interface Meta { kind: GunKind; tag: string; hold: boolean; unaware: boolean; alert: number; patrol: [number, number][]; pi: number; power: number; fireT: number; burst: number; home: { x: number; z: number }; seen: number }

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const gauss = (): number => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;

/**
 * Gang members and guards for missions. They are pedestrians with a small combat brain: spot you, close in, take cover
 * in the sense of stopping behind whatever is between you, and fire in bursts. Kills are reported to the mission.
 */
export class Hostiles {
  private readonly meta = new Map<Ped, Meta>();
  private shotsThisFrame = 0;
  onKilled: ((p: Ped, tag: string) => void) | null = null;
  /** A guard saw you or heard a shot (stealth medals read this). */
  onAlert: ((p: Ped) => void) | null = null;
  stats = { shots: 0, hitsOnPlayer: 0, alerts: 0 };
  /** Set while a cutscene plays: nobody shoots. */
  hold = false;

  constructor(private readonly g: Game) {}

  get list(): Ped[] { return [...this.meta.keys()]; }

  spawn(o: HostileOpts): Ped | null {
    const peds = this.g.npcs?.peds;
    if (!peds) return null;
    const kind = o.kind ?? 'pistol';
    const spec = SPECS[kind];
    const p = peds.place(o.x, o.z, 'walker', 'stand', o.yaw ?? 0);
    if (!p) return null;
    p.role = 'thug';
    p.keep = true;
    p.state = 'stand';
    p.edge = -1;
    p.speed = 0;
    p.sees = false;
    p.accessory = 0;
    p.aim = false;
    p.health = o.hp ?? spec.hp;
    p.armor = o.armour ?? 0;
    p.baseSpeed = spec.speed;
    if (typeof o.look === 'string') p.look = { ...lookFor({ cast: o.look }) };
    else if (o.look) p.look = { ...o.look };
    else p.look = { ...lookFor({ cast: 'thug' }), shirt: CAST.thug!.look.shirt + (Math.floor(Math.random() * 3) - 1) * 0x101010, h: 0.96 + Math.random() * 0.14 };
    p.look.sleeve = p.look.shirt;
    const m: Meta = {
      kind, tag: o.tag ?? 'x', hold: !!o.hold, unaware: !!o.unaware, alert: o.unaware ? 0 : 1, patrol: o.patrol ?? [], pi: 0, power: o.power ?? 1,
      fireT: 0.8 + Math.random() * 0.9, burst: 0, home: { x: o.x, z: o.z }, seen: 0,
    };
    this.meta.set(p, m);
    p.ai = (q, dt) => this.think(q, dt);
    return p;
  }

  alive(tag?: string): number {
    let n = 0;
    for (const [p, m] of this.meta) if ((tag === undefined || m.tag === tag) && p.active && p.state !== 'down' && p.health > 0) n++;
    return n;
  }

  /** The nearest living hostile with this tag. */
  nearest(x: number, z: number, tag?: string): Ped | null {
    let best: Ped | null = null, bd = Infinity;
    for (const [p, m] of this.meta) {
      if ((tag !== undefined && m.tag !== tag) || !p.active || p.state === 'down') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /** Wake everyone with this tag (or everyone). */
  alertAll(tag?: string): void {
    for (const [p, m] of this.meta) if (tag === undefined || m.tag === tag) this.wake(p, m);
  }

  private wake(p: Ped, m: Meta): void {
    if (m.unaware && m.alert < 1) {
      m.unaware = false;
      m.alert = 1;
      this.stats.alerts++;
      this.onAlert?.(p);
    }
  }

  /** A loud noise: unaware guards within the radius come to life. */
  noise(x: number, z: number, radius: number): void {
    for (const [p, m] of this.meta) if (m.unaware && Math.hypot(p.x - x, p.z - z) < radius) this.wake(p, m);
  }

  clear(tag?: string): void {
    for (const [p, m] of [...this.meta]) {
      if (tag !== undefined && m.tag !== tag) continue;
      this.meta.delete(p);
      p.ai = null; p.aim = false; p.keep = false; p.role = 'civ'; p.active = false;
    }
  }

  update(): void {
    this.shotsThisFrame = 0;
    for (const [p, m] of [...this.meta]) {
      if (!p.active) { this.meta.delete(p); continue; }
      if (p.state === 'down' || p.health <= 0) {
        this.meta.delete(p);
        p.ai = null; p.aim = false; p.keep = false;
        this.onKilled?.(p, m.tag);
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ brain

  private think(p: Ped, dt: number): void {
    const m = this.meta.get(p);
    if (!m) return;
    const g = this.g;
    const pl = g.player!;
    const drv = g.driving;
    const car = drv && drv.mode === 'driving' ? drv.vehicle : null;
    const tx = car ? car.position.x : pl.pos.x, tz = car ? car.position.z : pl.pos.z;
    const ty = car ? car.position.y + 0.8 : pl.pos.y + 1.0;
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    const spec = SPECS[m.kind];
    m.fireT -= dt;
    p.stateT -= dt;
    if (p.stateT <= 0) {
      p.stateT = 0.2 + Math.random() * 0.15;
      p.sees = d < spec.sight && this.los(p.x, p.y + 1.55, p.z, tx, ty, tz);
      // an unaware guard spots you inside a short cone, closer if you are crouched
      if (m.unaware && p.sees) {
        const facing = Math.atan2(dx, dz) - p.yaw;
        const dang = Math.abs(Math.atan2(Math.sin(facing), Math.cos(facing)));
        const reach = pl.crouchBlend > 0.5 ? 9 : 17;
        if (d < reach && dang < 1.05 || d < 4) { m.seen += 0.35; if (m.seen >= 1) this.wake(p, m); } else m.seen = Math.max(0, m.seen - 0.15);
      }
    }
    if (g.combat?.flow || this.hold) { p.aim = false; p.speed = 0; return; }
    if (m.unaware) { this.idle(p, m, dt); return; }

    if (p.sees && d < spec.range) {
      p.aim = true;
      p.yaw = turn(p.yaw, Math.atan2(dx, dz), dt * 9);
      p.speed = !m.hold && d > spec.range * 0.55 ? 1.5 : 0;
      if (p.speed > 0) this.step(p, p.yaw, p.speed, dt);
      if (m.fireT <= 0) this.shoot(p, m, spec, d, tx, ty, tz, car !== null, car ? car.speedKmh / 3.6 : pl.vel.length());
      return;
    }
    p.aim = false;
    if (m.hold) {
      p.speed = 0;
      if (p.sees) p.yaw = turn(p.yaw, Math.atan2(dx, dz), dt * 6);
      return;
    }
    // close in, steering round whatever is in the way
    const base = Math.atan2(dx, dz);
    p.speed = spec.speed;
    for (const off of [0, 0.7, -0.7, 1.4, -1.4]) {
      const a = base + off;
      if (!this.blocked(p.x, p.y + 0.9, p.z, Math.sin(a), Math.cos(a), 1.7)) {
        p.yaw = turn(p.yaw, a, dt * 8);
        this.step(p, a, p.speed, dt);
        p.phase += p.speed * dt * 2.6;
        return;
      }
    }
    p.speed = 0;
  }

  private idle(p: Ped, m: Meta, dt: number): void {
    p.aim = false;
    if (!m.patrol.length) { p.speed = 0; return; }
    const t = m.patrol[m.pi]!;
    const dx = t[0] - p.x, dz = t[1] - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) { m.pi = (m.pi + 1) % m.patrol.length; p.speed = 0; return; }
    const a = Math.atan2(dx, dz);
    p.yaw = turn(p.yaw, a, dt * 5);
    p.speed = 1.25;
    this.step(p, a, p.speed, dt);
    p.phase += p.speed * dt * 2.6;
  }

  private step(p: Ped, ang: number, speed: number, dt: number): void {
    p.x += Math.sin(ang) * speed * dt;
    p.z += Math.cos(ang) * speed * dt;
    p.y = terrainHeight(p.x, p.z);
  }

  private los(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    _o.set(ax, ay, az);
    _d.set(bx - ax, by - ay, bz - az);
    const len = _d.length();
    if (len < 0.5) return true;
    _d.multiplyScalar(1 / len);
    return !this.g.physics!.raycast(_o, _d, len - 0.5, undefined, GROUP.WORLD);
  }

  private blocked(x: number, y: number, z: number, dx: number, dz: number, len: number): boolean {
    _o.set(x, y, z);
    _d.set(dx, 0, dz);
    return !!this.g.physics!.raycast(_o, _d, len, undefined, GROUP.WORLD);
  }

  private shoot(p: Ped, m: Meta, spec: Spec, d: number, tx: number, ty: number, tz: number, car: boolean, speed: number): void {
    m.burst++;
    if (m.burst >= spec.burst) { m.burst = 0; m.fireT = spec.pause * (0.8 + Math.random() * 0.5); } else m.fireT = spec.interval;
    this.stats.shots++;
    const g = this.g;
    const sigma = spec.spread + d * 0.0026;
    const reach = car ? 1.4 : 0.38;
    const evade = 1 + Math.min(2.2, speed * 0.1);
    let hits = 0;
    const mx = p.x + Math.sin(p.yaw) * 0.5, my = p.y + 1.4, mz = p.z + Math.cos(p.yaw) * 0.5;
    for (let k = 0; k < spec.pellets; k++) {
      const ex = gauss() * sigma * d * evade, ey = gauss() * sigma * d * 0.7;
      if (Math.abs(ex) < reach && Math.abs(ey) < (car ? 1.0 : 0.85)) hits++;
      if (k === 0 || Math.random() < 0.3) {
        const dir = _d.set(tx - mx, ty - my, tz - mz).normalize();
        const end = new THREE.Vector3(tx - dir.z * ex, ty + ey, tz + dir.x * ex);
        if (Math.abs(ex) >= reach) end.addScaledVector(dir, 6 + Math.random() * 20);
        g.effects?.tracer(_o.set(mx, my, mz), end);
      }
    }
    if (this.shotsThisFrame++ < 4) g.audio.gunshot(0.8, { x: mx, y: my, z: mz }, m.kind);
    if (hits > 0) {
      g.combat?.hurtPlayer(spec.dmg * hits * m.power, p.x, p.z);
      this.stats.hitsOnPlayer += hits;
    }
  }
}

function turn(cur: number, target: number, k: number): number {
  let d = target - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + d * Math.min(1, k);
}
