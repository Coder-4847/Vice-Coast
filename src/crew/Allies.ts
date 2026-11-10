import * as THREE from 'three';
import type { Game } from '../Game';
import type { Ped } from '../npc/Pedestrians';
import { GROUP } from '../physics/Physics';
import { lookFor } from '../story/Figures';
import type { Hostiles } from '../story/Hostiles';
import { terrainHeight } from '../world/Terrain';
import type { Crew } from './Crew';
import type { CrewDef } from './roster';

export type Command = 'follow' | 'hold' | 'attack' | 'breach';
export const COMMANDS: { id: Command; label: string; hint: string }[] = [
  { id: 'follow', label: 'Follow', hint: 'Stay close and cover you' },
  { id: 'hold', label: 'Hold', hint: 'Stay put and only return fire' },
  { id: 'attack', label: 'Attack', hint: 'Hunt down everyone in sight' },
  { id: 'breach', label: 'Breach', hint: 'Rush the nearest enemy at close range' },
];

interface Ally { def: CrewDef; ped: Ped; fireT: number; goal: { x: number; z: number }; slot: number; downed: boolean; skill: number }

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();

/**
 * Crew members who fight beside you. They are pedestrians with a small combat brain that obeys the command wheel: follow,
 * hold, attack or breach. Enemies shoot at them as well as at you, and anyone who goes down is hurt (or worse) afterwards.
 */
export class Allies {
  readonly list: Ally[] = [];
  mode: Command = 'follow';
  onDowned: ((def: CrewDef) => void) | null = null;
  onCommand: ((c: Command) => void) | null = null;
  private shots = 0;

  constructor(private readonly g: Game, private readonly hostiles: Hostiles, private readonly crew: Crew) {
    hostiles.allies = () => this.peds();
    hostiles.onHitAlly = (p, dmg) => this.hurt(p, dmg);
  }

  get active(): boolean { return this.list.some((a) => !a.downed); }
  peds(): Ped[] { return this.list.filter((a) => !a.downed).map((a) => a.ped); }

  spawn(def: CrewDef, x: number, z: number): Ped | null {
    const peds = this.g.npcs?.peds;
    if (!peds) return null;
    const p = peds.place(x, z, 'walker', 'stand', 0);
    if (!p) return null;
    p.role = 'actor';
    p.keep = true;
    p.look = { ...lookFor({ cast: def.cast }) };
    p.state = 'stand';
    p.speed = 0;
    p.edge = -1;
    p.armed = true;
    p.accessory = 0;
    const skill = this.crew.skill(def.id);
    p.health = 90 + skill * 14;
    p.armor = skill * 8;
    p.baseSpeed = 3.6;
    const a: Ally = { def, ped: p, fireT: 0.6, goal: { x, z }, slot: this.list.length, downed: false, skill };
    p.ai = (q, dt) => this.think(a, q, dt);
    this.list.push(a);
    return p;
  }

  clear(): void {
    for (const a of this.list) { a.ped.ai = null; a.ped.aim = false; a.ped.armed = false; a.ped.keep = false; a.ped.role = 'civ'; a.ped.active = false; }
    this.list.length = 0;
  }

  command(c: Command): void {
    this.mode = c;
    this.onCommand?.(c);
    this.g.story?.say(this.list[0]?.def.cast ?? 'marco', `${COMMANDS.find((x) => x.id === c)!.label}.`, 1.2);
  }

  hurt(p: Ped, dmg: number): void {
    const a = this.list.find((q) => q.ped === p);
    if (!a || a.downed) return;
    this.g.npcs?.peds.knockDown(p, 0, 0, dmg, false);
  }

  update(): void {
    this.shots = 0;
    for (const a of this.list) {
      if (!a.downed && (a.ped.state === 'down' || a.ped.health <= 0 || !a.ped.active)) {
        a.downed = true;
        a.ped.aim = false;
        this.onDowned?.(a.def);
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ brain

  private think(a: Ally, p: Ped, dt: number): void {
    const g = this.g;
    if (a.downed || g.combat?.flow || g.story?.hostiles.hold) { p.aim = false; p.speed = 0; return; }
    const pl = g.player!;
    const mode = this.mode;
    // nearest enemy we may engage
    let tgt: Ped | null = null, td = Infinity;
    const aggressive = mode === 'attack' || mode === 'breach';
    for (const h of this.hostiles.list) {
      if (!h.active || h.state === 'down') continue;
      if (!aggressive && !this.hostiles.awake(h)) continue;
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d < td && d < (aggressive ? 34 : 22) && this.los(p.x, p.y + 1.5, p.z, h.x, h.y + 1.2, h.z)) { td = d; tgt = h; }
    }
    a.fireT -= dt;
    const close = mode === 'breach';
    const rng = close ? 9 : 20;
    if (tgt && td < rng) {
      p.aim = true;
      p.yaw = turn(p.yaw, Math.atan2(tgt.x - p.x, tgt.z - p.z), dt * 10);
      p.speed = 0;
      if (a.fireT <= 0) this.fire(a, p, tgt, td, close);
      // breaching crew keep pressing in; others hold their ground
      if (mode !== 'breach' || td < 4.5) return;
    } else p.aim = false;

    // where to stand
    let gx = p.x, gz = p.z, speed = 3.2;
    if (mode === 'follow') {
      const ang = pl.yaw + Math.PI + (a.slot - (this.list.length - 1) / 2) * 0.9;
      gx = pl.pos.x - Math.sin(ang + Math.PI) * 0 + Math.sin(ang) * 2.6;
      gz = pl.pos.z + Math.cos(ang) * 2.6;
      if (Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) > 12) speed = 4.6;
    } else if (mode === 'hold') { gx = a.goal.x; gz = a.goal.z; }
    else if (tgt) { gx = tgt.x; gz = tgt.z; speed = mode === 'breach' ? 4.8 : 3.6; }
    else { gx = pl.pos.x + Math.sin(a.slot * 2) * 4; gz = pl.pos.z + Math.cos(a.slot * 2) * 4; }
    const dx = gx - p.x, dz = gz - p.z;
    const d = Math.hypot(dx, dz);
    if (mode === 'hold' && d < 0.6) { p.speed = 0; return; }
    if (d < (mode === 'follow' ? 1.6 : 2.4)) { p.speed = 0; return; }
    const base = Math.atan2(dx, dz);
    for (const off of [0, 0.7, -0.7, 1.4, -1.4]) {
      const ang = base + off;
      if (!this.blocked(p.x, p.y + 0.9, p.z, Math.sin(ang), Math.cos(ang), 1.5)) {
        p.yaw = turn(p.yaw, ang, dt * 8);
        p.speed = speed;
        p.x += Math.sin(ang) * speed * dt;
        p.z += Math.cos(ang) * speed * dt;
        p.y = terrainHeight(p.x, p.z);
        p.phase += speed * dt * 2.6;
        return;
      }
    }
    p.speed = 0;
  }

  private fire(a: Ally, p: Ped, t: Ped, d: number, close: boolean): void {
    const g = this.g;
    a.fireT = Math.max(0.16, 0.5 - a.skill * 0.07) * (close ? 1.6 : 1);
    const chance = Math.min(0.92, 0.32 + a.skill * 0.1 - d * 0.01 + (close ? 0.15 : 0));
    const mx = p.x + Math.sin(p.yaw) * 0.5, my = p.y + 1.4, mz = p.z + Math.cos(p.yaw) * 0.5;
    const hit = Math.random() < chance;
    g.effects?.tracer(_o.set(mx, my, mz), _d.set(t.x + (hit ? 0 : (Math.random() - 0.5) * 3), t.y + 1.2, t.z + (hit ? 0 : (Math.random() - 0.5) * 3)));
    if (this.shots++ < 3) g.audio.gunshot(0.8, { x: mx, y: my, z: mz }, close ? 'shotgun' : 'smg');
    this.hostiles.noise(p.x, p.z, 30);
    if (hit) {
      const dmg = (13 + a.skill * 4) * (close ? 2 : 1);
      const dl = Math.hypot(t.x - p.x, t.z - p.z) || 1;
      g.npcs?.hurt(t, (t.x - p.x) / dl, (t.z - p.z) / dl, dmg, false);
    }
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
}

function turn(cur: number, target: number, k: number): number {
  let d = target - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + d * Math.min(1, k);
}
