import type { Game } from '../Game';
import type { Ped } from '../npc/Pedestrians';
import type { Story } from '../story/Story';
import { lookFor } from '../story/Figures';
import { money } from '../economy/Economy';
import { callPolice } from './heat';
import { Stores, storeStyle, type Store } from './Stores';

type Clerk = 'meek' | 'alarm' | 'armed';
const MIX: Record<string, [number, number]> = { gas: [0.5, 0.8], grocery: [0.6, 0.85], liquor: [0.4, 0.65], jewel: [0.2, 0.6] };

interface Active { store: Store; t: number; dur: number; take: number; kind: Clerk; away: number; alarmed: boolean; stars: number; done: boolean }
interface AtmJob { id: string; x: number; z: number; t: number; alarmed: boolean }

const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };

/**
 * Instant robberies: walk up to a kiosk with a gun out, cover the clerk and keep them covered while the bag fills. The longer
 * you stay the faster the police come; some clerks trip a silent alarm, some reach for a hidden gun. ATMs can be smashed open.
 */
export class Robberies {
  readonly stores: Stores;
  private active: Active | null = null;
  private atm: AtmJob | null = null;
  private readonly clerkFlags = new Map<Ped, { hands: boolean; t: number }>();
  private nearT = 0;

  constructor(private readonly g: Game, private readonly s: Story) {
    this.stores = new Stores(g);
  }

  get busy(): boolean { return !!this.active || !!this.atm; }

  private get rob() { return this.s.st.rob; }
  private get day(): number { return this.g.commerce!.eco.p.day; }

  /** What kind of clerk is on shift today. */
  clerkType(st: Store): Clerk {
    const r = hash(`${st.def.id}:${this.day}`);
    const [a, b] = MIX[st.def.kind]!;
    return r < a ? 'meek' : r < b ? 'alarm' : 'armed';
  }

  available(st: Store): boolean {
    return (this.rob.cooldown[st.def.id] ?? 0) <= this.day;
  }

  onNewDay(): void { /* cooldowns are compared with the day number */ }

  // ------------------------------------------------------------------------------------------------ clerks

  private spawnClerk(st: Store): void {
    const peds = this.g.npcs?.peds;
    if (!peds) return;
    const c = this.stores.clerkSpot(st);
    const yaw = st.room ? st.room.yaw : st.yaw;
    const p = peds.place(c.x, c.z, 'walker', 'stand', yaw);
    if (!p) return;
    p.role = 'clerk';
    p.keep = true;
    p.state = 'stand';
    p.speed = 0;
    p.edge = -1;
    p.armed = false;
    p.look = { ...lookFor({ cast: 'clerk' }) };
    p.look.shirt = [0xe8e8e4, 0xc4202c, 0x2f8a8c, 0xd0a23a][Math.floor(hash(st.def.id) * 4)]!;
    p.look.sleeve = p.look.shirt;
    p.health = 70;
    p.yaw = yaw;
    this.clerkFlags.set(p, { hands: false, t: 0 });
    p.ai = (q, dt) => this.clerkAI(st, q, dt);
    st.clerk = p;
  }

  /** The interior is going away: send the clerk home (unless a robbery is running there). */
  releaseClerk(st: Store): void {
    if (this.active?.store === st) this.end(this.active, false);
    this.removeClerk(st);
  }

  private removeClerk(st: Store): void {
    const p = st.clerk;
    if (!p) return;
    p.ai = null; p.aim = false; p.armed = false; p.keep = false; p.role = 'civ'; p.active = false;
    this.clerkFlags.delete(p);
    st.clerk = null;
  }

  private clerkAI(st: Store, p: Ped, dt: number): void {
    const f = this.clerkFlags.get(p);
    if (!f) return;
    p.x = this.stores.clerkSpot(st).x; p.z = this.stores.clerkSpot(st).z;
    p.speed = 0;
    const pl = this.g.player!;
    const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
    f.t -= dt;
    p.aim = f.hands;
    if (d < 14) p.yaw = turn(p.yaw, Math.atan2(pl.pos.x - p.x, pl.pos.z - p.z), dt * 6);
    else p.yaw = turn(p.yaw, st.room ? st.room.yaw : st.yaw, dt * 3);
  }

  // ------------------------------------------------------------------------------------------------ prompts

  /** Something to rob in reach? Returns the prompt and starts it on `go`. */
  offer(): { text: string; go: () => void } | null {
    const g = this.g;
    if (this.active || this.atm || this.s.mission || this.s.heists.inside || this.s.cutscenes.active || this.g.interiors?.busy) return null;
    const pl = g.player!;
    if (!g.weapon?.isDrawn || g.driving?.mode !== 'foot' || g.piloting?.busy || pl.state !== 'ground') return null;
    if ((g.wanted?.stars ?? 0) >= 3) return null;
    // a clerk covered by your gun
    for (const st of this.stores.list) {
      if (!st.clerk || st.clerk.state === 'down' || !this.available(st)) continue;
      const dx = st.clerk.x - pl.pos.x, dz = st.clerk.z - pl.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 7.5) continue;
      const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
      if ((dx * fx + dz * fz) / (d || 1) < 0.8) continue;
      return { text: st.def.kind === 'jewel' ? 'Hold up the jeweller' : 'Hold up the clerk', go: () => this.start(st) };
    }
    // an ATM you can smash
    for (const pt of g.commerce!.points.list) {
      if (pt.kind !== 'atm' || (this.rob.cooldown[pt.id] ?? 0) > this.day) continue;
      if (Math.hypot(pt.x - pl.pos.x, pt.z - pl.pos.z) < 2.2) return { text: 'Smash the ATM (hold)', go: () => { this.atm = { id: pt.id, x: pt.x, z: pt.z, t: 0, alarmed: false }; } };
    }
    return null;
  }

  // ------------------------------------------------------------------------------------------------ a hold-up

  private start(st: Store): void {
    const style = storeStyle(st.def.kind);
    const [lo, hi] = style.take;
    const kind = this.clerkType(st);
    this.active = { store: st, t: 0, dur: style.secs, take: Math.round(lo + hash(st.def.id + this.day + 'take') * (hi - lo)), kind, away: 0, alarmed: false, stars: 0, done: false };
    const f = this.clerkFlags.get(st.clerk!);
    if (f) { f.hands = true; }
    this.s.say('clerk', kind === 'armed' ? 'Okay, okay. Take it. Just... take it.' : 'Please don\'t shoot! The money\'s right here!', 3);
    callPolice(this.g, 0, st.x, st.z);
  }

  private end(a: Active, completed: boolean): void {
    const g = this.g;
    const frac = completed ? 1 : Math.min(1, a.t / a.dur);
    const loot = Math.round(a.take * frac);
    this.active = null;
    this.s.hud.setObjective(null, null);
    const f = a.store.clerk ? this.clerkFlags.get(a.store.clerk) : null;
    if (f) { f.hands = false; }
    if (loot > 0) {
      g.commerce!.eco.earn(loot, `Robbery: ${a.store.def.name}`);
      this.rob.count++;
      this.rob.take += loot;
      g.ui.toast(`Robbed ${a.store.def.name}: ${money(loot)}`);
      // the chain's share price notices
      const nm = a.store.def.name;
      if (/Petrolia/.test(nm)) this.s.market.event('PTRL', -0.03);
      else if (/FreshMart|Kwik Stop|24\/7|Grocer|Basket/.test(nm)) this.s.market.event('FRSH', -0.02);
    }
    this.rob.cooldown[a.store.def.id] = this.day + 2;
  }

  private tickRobbery(a: Active, dt: number): void {
    const g = this.g;
    const pl = g.player!;
    const clerk = a.store.clerk;
    if (!clerk || clerk.state === 'down' || g.combat?.flow) { this.end(a, false); return; }
    const dx = clerk.x - pl.pos.x, dz = clerk.z - pl.pos.z;
    const d = Math.hypot(dx, dz);
    const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
    const aimed = !!g.weapon?.isDrawn && (dx * fx + dz * fz) / (d || 1) > 0.65;
    if (d > 12) { this.end(a, false); return; }
    if (aimed) a.t += dt; else a.away += dt;
    if (aimed) a.away = Math.max(0, a.away - dt);
    // the police come faster the longer you stay
    const want = a.t >= 13 ? 3 : a.t >= 7 ? 2 : a.t >= 1.5 ? 1 : 0;
    if (want > a.stars) { a.stars = want; callPolice(g, want, a.store.x, a.store.z); }
    if (a.kind === 'alarm' && !a.alarmed && a.t >= 3) {
      a.alarmed = true;
      callPolice(g, 2, a.store.x, a.store.z);
      this.s.hud.showTip('Silent alarm! The police are on their way', 4);
    }
    // an armed clerk reaches under the counter when you stop covering them
    if (a.kind === 'armed' && a.away > 2.2) {
      this.s.say('clerk', 'You\'re not walking out of here!', 2);
      const c = this.stores.clerkSpot(a.store);
      const cy = a.store.room ? a.store.room.yaw : a.store.yaw;
      this.s.hostiles.spawn({ x: c.x - Math.sin(cy) * 0.2, z: c.z - Math.cos(cy) * 0.2, kind: 'pistol', hold: true, tag: 'clerk', look: 'clerk', hp: 60 });
      this.rob.shootouts++;
      this.removeClerk(a.store);
      this.active = null;
      this.s.hud.setObjective(null, null);
      this.rob.cooldown[a.store.def.id] = this.day + 2;
      return;
    }
    const got = Math.round(a.take * Math.min(1, a.t / a.dur));
    this.s.hud.setObjective('Robbery', aimed ? 'Keep the clerk covered' : 'Cover the clerk!', `${money(got)} in the bag · ${Math.max(0, Math.ceil(a.dur - a.t))} s`);
    if (a.t >= a.dur) this.end(a, true);
  }

  // ------------------------------------------------------------------------------------------------ ATMs

  private tickAtm(a: AtmJob, dt: number): void {
    const g = this.g;
    const pl = g.player!;
    const near = Math.hypot(a.x - pl.pos.x, a.z - pl.pos.z) < 2.6 && !!g.weapon?.isDrawn && g.driving?.mode === 'foot';
    if (!near) { this.atm = null; this.s.hud.setObjective(null, null); return; }
    if (g.input.down('interact')) a.t += dt; else a.t = Math.max(0, a.t - dt * 0.6);
    if (!a.alarmed && a.t > 1.5) { a.alarmed = true; g.combat?.crime?.(45, a.x, a.z); }
    this.s.hud.setObjective('ATM', 'Hold the interact key to force it open', `${Math.round((a.t / 5) * 100)}%`);
    if (a.t >= 5) {
      const take = Math.round(300 + hash(a.id + this.day) * 900);
      g.commerce!.eco.earn(take, 'ATM smash-and-grab');
      this.rob.count++;
      this.rob.take += take;
      this.rob.cooldown[a.id] = this.day + 1;
      g.ui.toast(`Cracked the ATM: ${money(take)}`);
      callPolice(g, 1, a.x, a.z);
      this.atm = null;
      this.s.hud.setObjective(null, null);
    }
  }

  // ------------------------------------------------------------------------------------------------ per frame

  update(dt: number): void {
    const g = this.g;
    const pl = g.player;
    if (!pl) return;
    this.nearT -= dt;
    if (this.nearT <= 0) {
      this.nearT = 0.5;
      for (const st of this.stores.list) {
        const an = this.stores.anchor(st);
        const d = Math.hypot(an.x - pl.pos.x, an.z - pl.pos.z);
        // walk-in shops staff the counter only while you are inside
        if (st.door && !st.room) { if (st.clerk && this.active?.store !== st) this.removeClerk(st); continue; }
        if (d < 70 && !st.clerk) this.spawnClerk(st);
        else if (d > 130 && st.clerk && this.active?.store !== st) this.removeClerk(st);
        else if (st.clerk && (st.clerk.state === 'down' || !st.clerk.active)) {
          // a clerk who was shot: a new one takes the shift tomorrow
          if (st.clerk.state === 'down' && d > 40) { this.removeClerk(st); this.rob.cooldown[st.def.id] = this.day + 1; }
        }
      }
    }
    if (this.s.mission || this.s.cutscenes.active) { if (this.active) this.end(this.active, false); this.atm = null; return; }
    if (this.active) this.tickRobbery(this.active, dt);
    else if (this.atm) this.tickAtm(this.atm, dt);
  }
}

function turn(cur: number, target: number, k: number): number {
  let d = target - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + d * Math.min(1, k);
}
