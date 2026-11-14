import * as THREE from 'three';
import type { Game } from '../Game';
import type { Ped } from '../npc/Pedestrians';
import type { Door } from '../world/city/plan';
import type { Point } from '../economy/Points';
import type { Store } from '../crime/Stores';
import { GEO } from '../world/heightfield';
import { terrainHeight } from '../world/Terrain';
import { lookFor } from '../story/Figures';
import { callPolice } from '../crime/heat';
import { money } from '../economy/Economy';
import { PROPERTY_BY_ID } from '../economy/catalog';
import * as screens from '../economy/screens';
import { Builder, type Spot } from './Builder';
import { layout, venueName, type Ops, type Venue } from './layouts';

/** An entrance on the street. */
interface Entrance {
  x: number; z: number;
  /** The way out of the building (forward = (sin yaw, cos yaw)). */
  yaw: number;
  venue: Venue;
  locked: boolean;
  store?: Store;
  point?: Point;
}

interface Extra { p: Ped; x: number; z: number; yaw: number; cast: string; talk?: string[]; said: boolean }

const hash = (a: number, b: number): number => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };

const ENTER_R = 1.5;
const OPEN_ALL_HOURS = new Set(['store', 'hotel', 'motel', 'hospital', 'police', 'apartments', 'bar']);
const LOCKED = new Set(['house', 'mansion', 'cabin', 'trailer']);

const TALK: Record<string, string[]> = {
  clerk: ['Let me know if you need anything.', 'Hey there.', 'We close when I say we close.', 'Cash or card?'],
  staff: ['Be right with you.', 'Busy night.', 'Hi! Welcome in.'],
  patron: ['...', 'Do you mind?', 'This place is all right.', 'Have we met?'],
  resident: ['Can I help you?', 'Who let you in?'],
  guard: ['Sign in at the desk, please.', 'Keep moving.', 'Can I see some ID?'],
};

/**
 * Interiors: nearly every building has a door you can use. Walking through one fades out, builds the inside from the
 * building's kind and seed (a shop, a hotel lobby, an apartment hallway, a house) far out on the salt pan, and puts you in
 * it; the exit fades you back onto the street where you came in. Shops open their menus from the counter, hotels and
 * motels rent rooms you can sleep in, apartments and houses can be broken into (and someone may be home), and the
 * robbery stores are walk-in shops with the clerk behind the till.
 */
export class Interiors {
  inside = false;
  /** A transition is running. */
  busy = false;
  prompt: string | null = null;
  readonly origin = new THREE.Vector3();
  private door: Entrance | null = null;
  private venue: Venue | null = null;
  private group: THREE.Group | null = null;
  private mats: THREE.Material[] = [];
  private handles: number[] = [];
  private spots: Spot[] = [];
  private extras: Extra[] = [];
  private tempStore: Store | null = null;
  private doorList: Door[] = [];
  private scanT = 0;
  private hold = 0;
  private alarm: { t: number; who: Ped | null } | null = null;
  private brokeIn = false;
  private readonly rented = new Map<string, { day: number; v: Venue }>();
  readonly stats = { entered: 0, burglaries: 0, loot: 0, nights: 0, buildMs: 0 };

  constructor(private readonly g: Game) {
    const x = GEO.salt.x + 40, z = GEO.salt.z + 170;
    this.origin.set(x, terrainHeight(x, z), z);
  }

  /** Where the player really is (the street door while inside). */
  outside(): { x: number; z: number; yaw: number } | null {
    return this.inside && this.door ? { x: this.door.x, z: this.door.z, yaw: this.door.yaw + Math.PI } : null;
  }

  // ------------------------------------------------------------------------------------------------ per frame

  update(dt: number): void {
    const g = this.g, pl = g.player;
    this.prompt = null;
    if (!pl || g.state !== 'playing') return;
    if (this.inside) {
      // something took the player away (a mission, being wasted or busted, a cutscene teleport)
      if (g.combat?.flow || g.story?.mission || g.story?.heists.inside) {
        // back to the street only if nothing else has already moved the player somewhere
        const here = Math.hypot(pl.pos.x - this.origin.x, pl.pos.z - this.origin.z) < 80;
        this.teardown(here && !g.combat?.flow);
        return;
      }
      this.updateInside(dt);
      return;
    }
    if (this.busy) return;
    this.updateOutside(dt);
  }

  private canEnter(): boolean {
    const g = this.g, pl = g.player!;
    const st = g.story;
    if (st && (st.mission || st.cutscenes.active || st.heists.inside || st.protagonists.busy || st.pastimes.busy)) return false;
    if (g.driving?.mode !== 'foot' || g.piloting?.busy || g.skydive?.active || g.combat?.flow) return false;
    if (pl.state !== 'ground' || pl.mantle || g.commerce?.prompt || st?.prompt || g.close?.prompt) return false;
    return true;
  }

  private updateOutside(dt: number): void {
    const g = this.g, pl = g.player!;
    if (!this.canEnter()) { this.hold = 0; return; }
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.25; g.world.city.doorsNear(pl.pos.x, pl.pos.z, this.doorList); }
    let best: Entrance | null = null, bd = ENTER_R;
    for (const d of this.doorList) {
      const dist = Math.hypot(d.x - pl.pos.x, d.z - pl.pos.z);
      if (dist >= bd) continue;
      bd = dist;
      best = this.fromDoor(d);
    }
    const rob = g.story?.robberies;
    if (rob) for (const s of rob.stores.list) {
      if (!s.door) continue;
      const dist = Math.hypot(s.door.x - pl.pos.x, s.door.z - pl.pos.z);
      if (dist < bd) { bd = dist; best = { x: s.door.x, z: s.door.z, yaw: s.door.yaw, locked: false, store: s, venue: { kind: 'store', level: 'shop', seed: hashStr(s.def.id), name: s.def.name, floors: 1, sub: s.def.kind } }; }
    }
    if (!best) { this.hold = 0; return; }
    const v = best.venue;
    const hr = g.world.tod.hour;
    const closed = !OPEN_ALL_HOURS.has(v.kind) && (hr >= 23 || hr < 6) && !best.locked;
    if ((g.wanted?.stars ?? 0) > 0 && !best.locked) { this.prompt = `${v.name} · lose the police first`; return; }
    if (closed) { this.prompt = `${v.name} · closed until 6 AM`; return; }
    if (best.locked) {
      const pct = Math.round((this.hold / 2) * 100);
      this.prompt = this.hold > 0 ? `Breaking in… ${pct}%` : `Break into the ${v.kind === 'mansion' ? 'villa' : v.kind} (hold)`;
      if (g.input.down('interact')) {
        this.hold += dt;
        if (this.hold - dt <= 0) g.audio.mech('cloth');
        if (this.hold >= 2) { this.hold = 0; this.burgle(best); }
      } else this.hold = Math.max(0, this.hold - dt * 2);
      return;
    }
    this.prompt = `Enter ${v.name}`;
    if (g.input.pressed('interact')) { g.input.swallow('interact'); this.enter(best, v); }
  }

  private fromDoor(d: Door): Entrance {
    const name = venueName(d.kind, d.seed);
    const kind = d.kind;
    return { x: d.x, z: d.z, yaw: d.yaw, locked: LOCKED.has(kind), venue: { kind, level: kind === 'apartments' || kind === 'hotel' || kind === 'office' ? 'lobby' : kind === 'motel' ? 'office' : 'main', seed: d.seed, name, floors: Math.max(1, d.floors), sub: kind === 'store' ? (d.seed % 3 === 0 ? 'liquor' : 'gas') : undefined } };
  }

  /** Commerce hands over shop and home entrances here. */
  enterPoint(pt: Point): void {
    const pl = this.g.player!;
    let v: Venue;
    if (pt.kind === 'property') {
      const def = PROPERTY_BY_ID[pt.ref]!;
      const kind = def.kind === 'apartment' ? 'apartments' : def.kind;
      v = { kind, level: kind === 'apartments' ? 'unit' : 'main', seed: hashStr(def.id), name: def.name, floors: 2, sub: def.id };
    } else {
      v = { kind: pt.kind, level: 'main', seed: hashStr(pt.id), name: pt.name, floors: 1, sub: pt.ref };
    }
    this.enter({ x: pl.pos.x, z: pl.pos.z, yaw: Math.atan2(Math.sin(pl.yaw), Math.cos(pl.yaw)), locked: false, point: pt, venue: v }, v);
  }

  /** Does this commerce point have an interior? */
  static hasInterior(pt: Point, owned: boolean): boolean {
    if (pt.kind === 'clothing' || pt.kind === 'barber' || pt.kind === 'weapons' || pt.kind === 'food') return true;
    if (pt.kind === 'property' && owned) { const k = PROPERTY_BY_ID[pt.ref]?.kind; return k !== 'hangar' && k !== 'dock'; }
    return false;
  }

  private burgle(e: Entrance): void {
    const g = this.g, pl = g.player!;
    // anyone watching calls it in
    const peds = g.npcs?.peds.peds ?? [];
    const seen = peds.some((p) => p.active && p.state !== 'down' && p.role === 'civ' && Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z) < 14);
    if (seen) { callPolice(g, 1, e.x, e.z, false); g.ui.toast('Someone saw you break in.'); }
    g.audio.sport('thwack', 0.4, new THREE.Vector3(e.x, pl.pos.y + 1, e.z));
    this.stats.burglaries++;
    this.brokeIn = true;
    this.enter(e, e.venue);
  }

  // ------------------------------------------------------------------------------------------------ transitions

  private fade(mid: () => void): void {
    const st = this.g.story;
    this.busy = true;
    if (st) st.fadeThrough(() => { mid(); this.busy = false; }, 260);
    else { mid(); this.busy = false; }
  }

  private enter(e: Entrance, v: Venue): void {
    this.fade(() => {
      this.door = e;
      this.build(v);
      this.inside = true;
      this.stats.entered++;
      this.setIndoor(true);
    });
  }

  /** Move to another part of the same building (elevator, hallway, a room). */
  private go(v: Venue): void {
    this.fade(() => { this.clearSet(); this.build(v); });
  }

  private exit(): void {
    this.fade(() => this.teardown(true));
  }

  /** Remove the set; `toStreet` puts the player back outside the door. */
  private teardown(toStreet: boolean): void {
    const g = this.g, pl = g.player;
    const d = this.door;
    this.clearSet();
    this.inside = false;
    this.setIndoor(false);
    if (toStreet && d && pl) {
      pl.teleport(d.x, d.z, d.yaw + Math.PI);
      g.world.city.warm(d.x, d.z);
      const dog = g.animals?.buddy;
      if (dog) { dog.x = d.x + 0.8; dog.z = d.z + 0.6; }
    }
    // a burglary you walked away from: the resident calls anyway once you are out
    if (this.alarm && this.alarm.t > 0 && d) callPolice(g, 2, d.x, d.z);
    this.alarm = null;
    this.brokeIn = false;
    this.door = null;
    this.busy = false;
  }

  private setIndoor(on: boolean): void {
    const g = this.g;
    g.world.indoor = on;
    if (g.police) g.police.proxy = on && this.door ? { x: this.door.x, y: terrainHeight(this.door.x, this.door.z) + 1.1, z: this.door.z } : null;
  }

  // ------------------------------------------------------------------------------------------------ building a set

  private ops(): Ops {
    const g = this.g;
    const cm = g.commerce!;
    const eco = cm.eco;
    const v = (): Venue => this.venue!;
    const pay = (n: number, what: string): boolean => {
      if (!eco.spend(n, what)) { g.ui.toast(`You need ${money(n)}.`); g.audio.uiBlip('back'); return false; }
      return true;
    };
    const shopName = (): string => this.door?.point?.name ?? v().name;
    return {
      exit: () => this.exit(),
      go: (nv) => this.go(nv),
      shop: (kind) => {
        const pt = this.door?.point;
        if (pt && pt.kind !== 'property') { cm.openFor(pt); return; }
        if (v().sub === 'jewel') { this.say('Everything in these cases is way out of your league. Unless...'); return; }
        const name = shopName();
        if (kind === 'clothing') cm.open(screens.clothingShop(cm, v().kind === 'mall' ? 'Threadline' : name));
        else if (kind === 'barber') cm.open(screens.barberShop(cm, name));
        else if (kind === 'weapons') cm.open(screens.weaponShop(cm, name));
        else cm.open(screens.foodShop(cm, name));
      },
      property: () => { const id = v().sub; const def = id ? PROPERTY_BY_ID[id] : null; if (def) cm.open(screens.propertyPage(cm, def)); },
      wardrobe: () => cm.open(screens.outfitPage(cm, 'wardrobe', 'Wardrobe')),
      sleep: () => {
        g.combat?.vitals.heal(100);
        cm.skipTo(6);
        this.stats.nights++;
        g.ui.toast('You slept until morning.');
        void cm.save(cm.slot ?? 1, true);
        // rebuild so the windows show the morning
        if (this.venue) this.go(this.venue);
      },
      rent: (price, nv) => {
        if (!pay(price, `Room at ${v().name}`)) return;
        this.rented.set(`${v().seed}`, { day: eco.p.day, v: nv });
        g.ui.toast(`Room ${nv.unit ?? ''} is yours for the night.`);
        this.go(nv);
      },
      heal: (price) => {
        const vit = g.combat?.vitals;
        if (vit && vit.health >= 99) { this.say('You look fine to me. Next!'); return; }
        if (!pay(price, 'Doctor')) return;
        vit?.heal(100);
        g.ui.toast('Patched up.');
      },
      drink: (price) => { if (!pay(price, 'Drink')) return; g.combat?.vitals.heal(5); g.audio.uiBlip('ok'); g.ui.toast(this.pickLine(['Cheers.', 'That hit the spot.', 'Another?'])); },
      workout: () => { g.world.tod.setHour((g.world.tod.hour + 1) % 24); g.combat?.vitals.heal(15); g.ui.toast('An hour on the weights. You feel stronger.'); },
      breakIn: (nv) => {
        this.go(nv);
        this.brokeIn = true;
        this.stats.burglaries++;
      },
      loot: (amount, what) => {
        eco.earn(amount, 'Burglary');
        this.stats.loot += amount;
        g.ui.toast(`Took ${what}: ${money(amount)}`);
        g.audio.uiBlip('ok');
        // a sleeper may wake up
        const sl = this.extras.find((e) => e.cast === 'sleeper');
        if (sl && hash(this.venue!.seed, this.stats.loot) < 0.3) this.wake(sl);
      },
      knock: () => this.say(this.pickLine(['Who is it?', 'Go away!', '...', 'Not today, thanks.', 'Room service? We didn\'t order anything.'])),
      atm: () => cm.open(screens.atmPage(cm)),
      say: (t) => this.say(t),
      occupied: (seed) => {
        const hr = g.world.tod.hour;
        const r = hash(seed, eco.p.day);
        if (hr >= 23 || hr < 6) return r < 0.7 ? 'asleep' : 'away';
        return r < 0.35 ? 'awake' : 'away';
      },
      key: (bv) => { const k = this.rented.get(`${bv.seed}`); return k && k.day === eco.p.day ? k.v : null; },
      hour: g.world.tod.hour,
      owned: !!(this.door?.point?.kind === 'property'),
    };
  }

  private pickLine(a: string[]): string { return a[Math.floor(Math.random() * a.length)]!; }

  private say(text: string): void {
    const g = this.g;
    const near = this.extras.filter((e) => e.p.active && e.p.state !== 'down').sort((a, b) => Math.hypot(a.p.x - g.player!.pos.x, a.p.z - g.player!.pos.z) - Math.hypot(b.p.x - g.player!.pos.x, b.p.z - g.player!.pos.z))[0];
    if (near && g.street) g.street.speech.say(near.p, text, 3);
    else g.ui.toast(text);
  }

  private build(v: Venue): void {
    const g = this.g;
    this.venue = v;
    const t0 = performance.now();
    const b = new Builder(v.seed ^ hashStr(v.level) ^ ((v.unit ?? 0) * 7919));
    const hr = g.world.tod.hour;
    b.day = Math.max(0, Math.min(1, (hr - 6) / 1.5)) * Math.max(0, Math.min(1, (19.5 - hr) / 1.5));
    layout(b, v, this.ops());
    const grp = b.finish();
    grp.position.copy(this.origin);
    grp.updateMatrixWorld(true);
    for (const c of grp.children) { c.matrixAutoUpdate = false; c.updateMatrix(); c.matrixWorld.multiplyMatrices(grp.matrixWorld, c.matrix); }
    g.world.scene.add(grp);
    this.group = grp;
    this.mats = [...b.mats.values()];
    const o = this.origin;
    this.handles = g.physics!.addBuildings(b.solids.map((s) => ({ ...s, cx: s.cx + o.x, cy: s.cy + o.y, cz: s.cz + o.z })));
    this.spots = b.spots.map((s) => ({ ...s, x: s.x + o.x, z: s.z + o.z }));
    // keep "used" in sync with the copies
    for (let i = 0; i < b.spots.length; i++) { const src = b.spots[i]!, dst = this.spots[i]!; const act = src.act; dst.act = () => { act(); dst.used = src.used || dst.used; }; }
    g.world.city.warm(o.x, o.z);
    const pl = g.player!;
    pl.teleport(o.x + b.entry.x, o.z + b.entry.z, b.entry.yaw);
    const dog = g.animals?.buddy;
    if (dog) { dog.x = o.x + b.entry.x + 0.6; dog.z = o.z + b.entry.z + 0.4; }
    this.spawnExtras(b, v);
    this.stats.buildMs = performance.now() - t0;
  }

  private spawnExtras(b: Builder, v: Venue): void {
    const g = this.g, peds = g.npcs?.peds;
    if (!peds) return;
    const o = this.origin;
    const store = this.door?.store ?? null;
    for (const e of b.extras) {
      const x = o.x + e.x, z = o.z + e.z;
      // the robbery stores' clerk is the robbery system's own ped
      if (e.cast === 'clerk' && v.kind === 'store') {
        const s = store ?? this.makeTempStore(v);
        s.room = { x, z, yaw: e.yaw };
        continue;
      }
      const p = peds.place(x, z, 'walker', e.cast === 'sleeper' ? 'lie' : 'stand', e.yaw);
      if (!p) continue;
      p.keep = true; p.speed = 0; p.edge = -1; p.armed = false; p.health = 60;
      if (e.cast === 'clerk' || e.cast === 'guard') p.look = { ...lookFor({ cast: e.cast }) };
      if (e.cast === 'guard') p.role = 'clerk';
      p.pose = e.pose === 'sit' ? 'sit' : '';
      p.state = e.cast === 'sleeper' ? 'lie' : 'stand';
      p.stateT = 1e6;
      const ex: Extra = { p, x, z, yaw: e.yaw, cast: e.cast, talk: e.talk, said: false };
      p.ai = (q) => this.extraAI(ex, q);
      this.extras.push(ex);
    }
    // a resident who is up when you break in
    if (this.brokeIn) {
      const awake = this.extras.find((e) => e.cast === 'resident');
      if (awake) setTimeout(() => { if (this.inside && awake.p.active) this.wake(awake); }, 900);
    }
  }

  private makeTempStore(v: Venue): Store {
    const rob = this.g.story!.robberies;
    const d = this.door!;
    const s: Store = {
      def: { id: `door-${v.seed}`, kind: (v.sub as Store['def']['kind']) ?? 'liquor', name: v.name, near: { x: d.x, z: d.z } },
      x: d.x, z: d.z, yaw: 0, clerk: null, group: new THREE.Group(), marker: { name: v.name, x: d.x, z: d.z, glyph: '' }, room: null, door: null,
    };
    rob.stores.list.push(s);
    this.tempStore = s;
    return s;
  }

  private wake(e: Extra): void {
    if (e.cast === 'sleeper') { e.p.state = 'stand'; e.cast = 'resident'; }
    e.p.pose = 'hands';
    this.say(this.pickLine(['Hey! Get out of my house!', 'Who are you?! I\'m calling the cops!', 'Help! Somebody help!', 'Take whatever you want, just go!']));
    if (!this.alarm) this.alarm = { t: 6, who: e.p };
  }

  private extraAI(e: Extra, p: Ped): void {
    const pl = this.g.player!;
    p.x = e.x; p.z = e.z; p.speed = 0;
    if (p.state === 'lie') return;
    const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
    if (d < 5 && p.pose !== 'sit') p.yaw = turn(p.yaw, Math.atan2(pl.pos.x - p.x, pl.pos.z - p.z), 0.12);
    else p.yaw = turn(p.yaw, e.yaw, 0.05);
    if (!e.said && d < 2.6 && e.cast !== 'sleeper' && !this.alarm) {
      e.said = true;
      const lines = e.talk ?? TALK[e.cast] ?? TALK.patron!;
      if (Math.random() < 0.7) this.g.street?.speech.say(p, lines[Math.floor(Math.random() * lines.length)]!, 2.6);
    }
  }

  private clearSet(): void {
    const g = this.g;
    if (this.group) {
      g.world.scene.remove(this.group);
      this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
      // surface textures are shared and cached; sign and picture textures are one-offs
      this.group.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (m && !m.vertexColors && m.map) m.map.dispose(); });
      for (const m of this.mats) m.dispose();
      this.group = null;
    }
    this.mats = [];
    if (this.handles.length) g.physics?.removeBuildings(this.handles);
    this.handles = [];
    for (const e of this.extras) { const p = e.p; p.ai = null; p.keep = false; p.pose = ''; p.active = false; }
    this.extras = [];
    this.spots = [];
    const rob = g.story?.robberies;
    if (this.door?.store) { rob?.releaseClerk(this.door.store); this.door.store.room = null; }
    if (this.tempStore && rob) {
      rob.releaseClerk(this.tempStore);
      const i = rob.stores.list.indexOf(this.tempStore);
      if (i >= 0) rob.stores.list.splice(i, 1);
      this.tempStore = null;
    }
  }

  // ------------------------------------------------------------------------------------------------ inside

  private updateInside(dt: number): void {
    const g = this.g, pl = g.player!;
    if (this.busy) return;
    // the resident on the phone
    if (this.alarm) {
      this.alarm.t -= dt;
      if (this.alarm.t <= 0 && this.alarm.t > -dt * 2 && this.door) {
        callPolice(g, 2, this.door.x, this.door.z);
        g.ui.toast('The resident called the police.');
        this.alarm.t = -1;
      }
      if (this.alarm.who && this.alarm.who.state === 'down') this.alarm.t = -1;
    }
    if (g.combat?.flow || g.driving?.mode !== 'foot') return;
    // the robbery system's prompt wins while a gun is out at the counter
    if (g.story?.prompt) return;
    let best: Spot | null = null, bd = Infinity;
    for (const s of this.spots) {
      if (s.used) continue;
      const d = Math.hypot(s.x - pl.pos.x, s.z - pl.pos.z);
      if (d < s.r && d < bd) { bd = d; best = s; }
    }
    if (!best) { this.hold = 0; return; }
    if (best.hold) {
      this.prompt = this.hold > 0 ? `${best.label.replace(/^Take /, 'Taking ')}… ${Math.round((this.hold / best.hold) * 100)}%` : `${best.label} (hold)`;
      if (g.input.down('interact')) {
        this.hold += dt;
        if (this.hold >= best.hold) { this.hold = 0; best.used = true; best.act(); }
      } else this.hold = Math.max(0, this.hold - dt * 2);
      return;
    }
    this.prompt = best.label;
    if (g.input.pressed('interact')) { g.input.swallow('interact'); best.act(); }
  }
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function turn(cur: number, target: number, k: number): number {
  let d = target - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + d * Math.min(1, k);
}

