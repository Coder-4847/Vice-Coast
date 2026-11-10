import type { Game } from '../Game';
import type { Look, Ped } from '../npc/Pedestrians';
import type { Outfit } from '../economy/types';
import { terrainHeight } from '../world/Terrain';
import { CAST } from './chars';
import { CHARS } from './chars';
import type { ActorLook } from './types';

const hex = (s: string): number => parseInt(s.replace('#', ''), 16);

/** A pedestrian-drawn figure for a protagonist (from the outfit) or a cast member. */
export function lookFromOutfit(o: Outfit): Look {
  return { skin: hex(o.skin), hair: hex(o.hair), shirt: hex(o.top), sleeve: hex(o.top), pants: 0x23262c, shoe: 0x101114, h: 1.02, w: 1.0 };
}

export function lookFor(l: ActorLook, outfit?: Outfit): Look {
  if ('char' in l) return lookFromOutfit(outfit ?? CHARS[l.char].outfit);
  const c = CAST[l.cast];
  if (!c) return { skin: 0xe0ac86, hair: 0x2a1d14, shirt: 0x555555, sleeve: 0x555555, pants: 0x333333, shoe: 0x111111, h: 1, w: 1 };
  return { skin: c.look.skin, hair: c.look.hair, shirt: c.look.shirt, sleeve: c.look.shirt, pants: c.look.pants, shoe: c.look.shoe, h: c.look.h, w: c.look.w };
}

interface Walk { x: number; z: number; speed: number; done?: () => void }

/**
 * Pedestrians used as actors: cutscene figures and the protagonists you are not playing. They are ordinary instanced
 * peds (so they cost nothing extra) with a tiny script instead of the crowd's behaviour.
 */
export class Figures {
  private readonly map = new Map<string, Ped>();
  private readonly walks = new Map<Ped, Walk>();

  constructor(private readonly g: Game) {}

  get(id: string): Ped | undefined { return this.map.get(id); }
  has(id: string): boolean { return this.map.has(id); }

  spawn(id: string, look: Look, x: number, z: number, yaw: number, aim = false): Ped | null {
    this.remove(id);
    const peds = this.g.npcs?.peds;
    if (!peds) return null;
    const p = peds.place(x, z, 'walker', 'stand', yaw);
    if (!p) return null;
    p.role = 'actor';
    p.keep = true;
    p.look = { ...look };
    p.accessory = 0;
    p.state = 'stand';
    p.speed = 0;
    p.edge = -1;
    p.health = 100;
    p.aim = aim;
    p.armed = aim;
    p.ai = (q, dt) => this.tick(q, dt);
    this.map.set(id, p);
    return p;
  }

  face(id: string, yaw: number): void {
    const p = this.map.get(id);
    if (p) p.yaw = yaw;
  }

  setAim(id: string, aim: boolean): void {
    const p = this.map.get(id);
    if (p) { p.aim = aim; p.armed = aim; }
  }

  walkTo(id: string, x: number, z: number, speed = 1.5, done?: () => void): void {
    const p = this.map.get(id);
    if (p) this.walks.set(p, { x, z, speed, done });
  }

  /** Teleport a figure (idle protagonists follow the player's last position). */
  put(id: string, x: number, z: number, yaw?: number): void {
    const p = this.map.get(id);
    if (!p) return;
    p.x = x; p.z = z;
    if (yaw !== undefined) p.yaw = yaw;
  }

  remove(id: string): void {
    const p = this.map.get(id);
    if (!p) return;
    this.map.delete(id);
    this.walks.delete(p);
    p.ai = null; p.aim = false; p.keep = false; p.role = 'civ';
    p.active = false;
  }

  clear(prefix = ''): void {
    for (const id of [...this.map.keys()]) if (id.startsWith(prefix)) this.remove(id);
  }

  private tick(p: Ped, dt: number): void {
    const w = this.walks.get(p);
    if (!w) { p.speed = 0; return; }
    const dx = w.x - p.x, dz = w.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) { p.speed = 0; this.walks.delete(p); w.done?.(); return; }
    const a = Math.atan2(dx, dz);
    let da = a - p.yaw;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    p.yaw += da * Math.min(1, dt * 8);
    p.speed = w.speed;
    p.x += Math.sin(a) * w.speed * dt;
    p.z += Math.cos(a) * w.speed * dt;
    p.phase += w.speed * dt * 2.6;
    p.y = terrainHeight(p.x, p.z);
  }
}
