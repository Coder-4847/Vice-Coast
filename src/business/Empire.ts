import * as THREE from 'three';
import type { Game } from '../Game';
import type { Vehicle } from '../vehicles/Vehicle';
import { BUSINESSES, BUSINESS_BY_ID, type BusinessDef } from '../economy/catalog';
import { money } from '../economy/Economy';
import type { BizState } from '../economy/types';
import { MARKERS } from '../ui/mapData';
import { terrainHeight } from '../world/Terrain';
import { callPolice } from '../crime/heat';
import type { MissionDef } from '../story/Missions';
import { raidMission } from './missions';

/** Upgrades for each kind of business. `cost` is a share of the business's price. */
export interface Upgrade { id: string; name: string; blurb: string; cost: number }
export const UPGRADES: Record<'front' | 'club' | 'motel' | 'op', Upgrade[]> = {
  front: [
    { id: 'staff', name: 'Better staff', blurb: 'Takings +25%', cost: 0.2 },
    { id: 'marketing', name: 'Marketing campaign', blurb: 'Takings +20%', cost: 0.18 },
    { id: 'books', name: 'Creative bookkeeping', blurb: 'Launders 50% more a day', cost: 0.25 },
  ],
  club: [
    { id: 'dj', name: 'Resident DJ', blurb: 'Popularity falls half as fast', cost: 0.12 },
    { id: 'decor', name: 'Full refit', blurb: 'Takings +25%', cost: 0.2 },
    { id: 'books', name: 'Creative bookkeeping', blurb: 'Launders 50% more a day', cost: 0.18 },
  ],
  motel: [
    { id: 'staff', name: 'Housekeeping staff', blurb: 'More rooms filled: takings +25%', cost: 0.2 },
    { id: 'pool', name: 'Pool and a new sign', blurb: 'Takings +20%', cost: 0.18 },
    { id: 'books', name: 'Creative bookkeeping', blurb: 'Launders 50% more a day', cost: 0.25 },
  ],
  op: [
    { id: 'equipment', name: 'Better equipment', blurb: 'Stock is worth 30% more', cost: 0.22 },
    { id: 'staff', name: 'More staff', blurb: 'Works through supplies 30% faster', cost: 0.18 },
    { id: 'security', name: 'Security', blurb: 'Police raids 60% less likely', cost: 0.2 },
  ],
};
export const upgradesFor = (d: BusinessDef): Upgrade[] => (!d.legal ? UPGRADES.op : d.type === 'club' ? UPGRADES.club : d.type === 'motel' ? UPGRADES.motel : UPGRADES.front);
export const upgradeCost = (d: BusinessDef, u: Upgrade): number => Math.round((d.price * u.cost) / 1000) * 1000;
const FENCE = 0.55;
const LAUNDER_FEE = 0.15;
const TAG = '⁢';

/** Drop points for sell runs (roadside spots around the state). */
const DROPS: [number, number, string][] = [
  [1420, -300, 'a loading bay downtown'], [200, 600, 'a beach car park'], [900, -720, 'a lay-by in the hills'], [1320, 720, 'the airport freight road'],
  [470, 1540, 'a container yard in Dusk Harbor'], [3320, 600, 'a truck stop in Cinder Flats'], [700, -2220, 'the Pinecrest sawmill road'], [480, 3260, 'a canal warehouse in Costa Merida'],
  [1560, 300, 'a body shop in Southside'], [1120, -1650, 'a cabin road on Mount Kestrel'], [2600, 1400, 'a desert crossroads'],
];

interface Site { def: BusinessDef; x: number; z: number; yaw: number; door: { x: number; z: number }; group: THREE.Group; marker: { name: string; x: number; z: number; glyph: string; color?: string } }
interface Job {
  kind: 'sell' | 'supply'; id: string; t: number; limit: number; dest: { x: number; z: number; label: string }; beacon: number; value: number;
  van?: Vehicle; crate?: THREE.Group; hostiles?: string; boarded?: boolean;
  /** Sell runs: seconds after boarding when a rival crew comes for the van (-1 = not this time), and their cars. */
  ambushAt?: number; rivals?: { v: Vehicle; out: boolean; still: number }[];
}
/** The police are on their way to an operation: get there and fight them off, pay them off, or lose the stock. */
interface Alert { id: string; left: number; beacon: number }

function sign(text: string, color: string, bg = '#101218'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, 512, 96);
  g.fillStyle = color;
  let size = 60;
  g.font = `800 ${size}px system-ui, sans-serif`;
  while (g.measureText(text).width > 480 && size > 18) { size -= 4; g.font = `800 ${size}px system-ui, sans-serif`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Building size and look per business type: width, depth, height, wall, accent. */
const LOOK: Record<string, [number, number, number, number, number]> = {
  food: [8, 7, 4, 0xf2e6d0, 0xd83a2a], shop: [8, 6, 4, 0x8a6a48, 0x2a7a8a], carwash: [12, 8, 4.6, 0xe8e8e4, 0x2a8ad8], storage: [16, 10, 5, 0xc8c4bc, 0xe8a82a],
  laundromat: [10, 8, 4.2, 0xd8e4ec, 0x3ab8e8], cab: [14, 10, 5, 0xe8e4dc, 0xf2c230], airstrip: [18, 12, 7, 0xc8ccd0, 0xd85a2a], club: [18, 14, 7.5, 0x1a1420, 0xff2e88],
  motel: [22, 8, 4.2, 0xf2dca4, 0x2ad8c4], grow: [14, 10, 6.5, 0x7a3228, 0x3a6a3a], print: [10, 8, 5, 0xb8b0a4, 0x5a5a5a], lab: [10, 3.6, 3, 0xd8d6cc, 0x7a7a6a],
  docs: [9, 7, 4.5, 0xe8e0d0, 0x1f6fd6], cartel: [24, 16, 9, 0x8a7a68, 0x5a6a7a],
};

/**
 * Your businesses. Every business in the catalogue has a building with a door; owned ones can be walked into (their
 * interiors have an office laptop for running them). Legal fronts pay clean takings and launder dirty money every morning;
 * illegal operations work through supplies into stock as the hours pass, and stock is sold on a van run (or to a fence)
 * for dirty money. Heat builds with every load and every run; enough of it and the police raid the place.
 */
export class Empire {
  readonly sites = new Map<string, Site>();
  prompt: string | null = null;
  job: Job | null = null;
  alert: Alert | null = null;
  /** A business mission chosen on the laptop: starts once you are back outside. */
  private pending: MissionDef | null = null;
  private alertCool = 0;
  private lastAbs = -1;
  private tickT = 0;
  private readonly group = new THREE.Group();
  readonly stats: { sold: number; supplyRuns: number; raids: number; laundered: number; defended?: number; ambushes?: number } = { sold: 0, supplyRuns: 0, raids: 0, laundered: 0 };

  constructor(private readonly g: Game) {
    this.build();
    g.world.scene.add(this.group);
    // Busted: the police take half of your dirty money
    const combat = g.combat;
    if (combat) {
      const prev = combat.onRespawn;
      combat.onRespawn = (kind) => {
        prev?.(kind);
        const e = g.commerce?.eco;
        if (kind === 'busted' && e && e.p.dirty > 0) { const lost = Math.floor(e.p.dirty / 2); e.p.dirty -= lost; g.ui.toast(`The police seized ${money(lost)} of dirty money`); }
        if (this.job) this.fail('You were taken out of the job.');
      };
    }
  }

  private get eco() { return this.g.commerce!.eco; }
  owns(id: string): boolean { return this.eco.p.biz.includes(id); }
  owned(): BusinessDef[] { return this.eco.p.biz.map((id) => BUSINESS_BY_ID[id]!).filter(Boolean); }

  state(id: string): BizState {
    const em = this.eco.p.empire;
    return (em[id] ??= { upgrades: [], supplies: 0, stock: 0, heat: 0, popularity: 50, visited: -1, earned: 0 });
  }
  has(id: string, up: string): boolean { return this.state(id).upgrades.includes(up); }

  /** Business jobs are once a day each. */
  jobReady(id: string, job: string): boolean { return (this.state(id).jobs?.[job] ?? -1) !== this.eco.p.day; }

  /** Start a business mission from the laptop: walk out, then it begins. */
  startJob(id: string, job: string, def: MissionDef): string | null {
    const g = this.g;
    if (this.job) return 'Finish the job you are on first.';
    if (g.story?.mission) return 'You are already on a job.';
    if ((g.wanted?.stars ?? 0) > 0) return 'Lose the police first.';
    if (!this.jobReady(id, job)) return 'That job is done for today. Come back tomorrow.';
    (this.state(id).jobs ??= {})[job] = this.eco.p.day;
    this.pending = def;
    if (g.interiors?.inside) g.interiors.leave();
    return null;
  }

  /** Club popularity from jobs and promotions. */
  boost(id: string, n: number): void { const st = this.state(id); st.popularity = Math.min(100, st.popularity + n); }

  /** The police got in: most of the stock and half the supplies are gone. */
  applyRaid(id: string): void {
    const d = BUSINESS_BY_ID[id];
    if (!d || !this.owns(id)) return;
    const st = this.state(id);
    st.stock = Math.round(st.stock * 0.4);
    st.supplies = Math.round(st.supplies * 0.5);
    st.heat = Math.max(0, st.heat - 35);
    this.stats.raids++;
    this.eco.message('ghostline', `The police raided ${d.name}. They took most of the ${d.product} and half the supplies. Keep the heat down: fewer loads, fewer runs, better security.`);
    this.g.ui.toast(`${d.name} was raided`);
  }

  raidDefended(id: string): void {
    const st = this.state(id);
    st.heat = Math.max(0, st.heat - 40);
    this.stats.defended = (this.stats.defended ?? 0) + 1;
    this.eco.message('ghostline', `You held ${BUSINESS_BY_ID[id]!.name}. The stock is safe and the heat is off for now.`);
  }

  /** What the precinct wants to look the other way. */
  bribeCost(id: string): number { return Math.round(5000 + this.state(id).stock * 0.2); }

  bribe(id: string): boolean {
    if (this.alert?.id !== id || !this.eco.charge(this.bribeCost(id), 'Consulting fee (precinct)')) return false;
    const st = this.state(id);
    st.heat = Math.max(0, st.heat - 30);
    this.endAlert();
    this.eco.message('ghostline', `Money changed hands. The raid on ${BUSINESS_BY_ID[id]!.name} has been "postponed".`);
    return true;
  }

  private endAlert(): void {
    if (!this.alert) return;
    this.g.story?.beacons.remove(this.alert.beacon);
    this.alert = null;
  }

  /** Each game hour an operation running hot may draw a raid. */
  private maybeAlert(hours: number): void {
    const g = this.g;
    if (this.alert || this.job || this.alertCool > 0 || g.story?.mission || g.story?.cutscenes.active) return;
    for (const d of this.owned()) {
      if (d.legal) continue;
      const st = this.state(d.id);
      if (st.heat <= 55) continue;
      const chance = ((st.heat - 45) / 400) * (this.has(d.id, 'security') ? 0.4 : 1) * hours;
      if (Math.random() >= chance) continue;
      const s = this.sites.get(d.id)!;
      const left = 150 + Math.min(150, Math.hypot(s.x - g.player!.pos.x, s.z - g.player!.pos.z) / 12);
      const beacon = g.story!.beacons.add(s.door.x, s.door.z, { color: '#ff3a3a', glyph: '!', name: `Raid: ${d.name}` });
      this.alert = { id: d.id, left, beacon };
      g.audio.uiBlip('back');
      g.story?.hud.showBanner('Business', 'Police raid', `${d.name} is about to be raided. Get there, or pay them off on ledger.vc (${money(this.bribeCost(d.id))}).`, 'bad', 5);
      this.eco.message('ghostline', `Heads up: the police are moving on ${d.name}. You have about ${Math.round(left / 60)} minutes. Be there, or pay the precinct on ledger.vc.`);
      return;
    }
  }

  private tickAlert(dt: number): void {
    const a = this.alert!, g = this.g;
    a.left -= dt;
    const s = this.sites.get(a.id)!, pl = g.player!.pos;
    const near = Math.hypot(s.door.x - pl.x, s.door.z - pl.z) < 70;
    if (!g.story?.mission && !g.interiors?.inside) {
      g.story?.hud.setObjective('Police raid', near ? 'Fight off the raid' : `Get to ${s.def.name}`, `${Math.floor(Math.max(0, a.left) / 60)}:${String(Math.floor(Math.max(0, a.left) % 60)).padStart(2, '0')} · or bribe them on ledger.vc`);
    }
    if (near && !g.story?.mission && (g.wanted?.stars ?? 0) === 0 && !g.interiors?.inside) {
      const id = a.id;
      this.endAlert();
      g.story?.hud.setObjective(null, null);
      if (!g.story?.startMission(raidMission(id))) this.applyRaid(id);
      return;
    }
    if (a.left <= 0) {
      const id = a.id;
      this.endAlert();
      g.story?.hud.setObjective(null, null);
      this.applyRaid(id);
      this.alertCool = 600;
    }
  }

  // ------------------------------------------------------------------------------------------------ buildings

  private build(): void {
    const cm = this.g.commerce!;
    for (const def of BUSINESSES) {
      const [W, D, H, wallCol, accentCol] = LOOK[def.type] ?? LOOK.shop!;
      const spot = cm.points.find(def.near.x, def.near.z, Math.max(W, D) * 0.6, { walkOnly: false, maxR: 160 });
      // face the most open side
      let yaw = 0, best = -1;
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        let open = 0;
        for (const r of [D / 2 + 3, D / 2 + 6, D / 2 + 9]) if (cm.points.free(spot.x + Math.sin(a) * r, spot.z + Math.cos(a) * r, 1.6)) open++;
        if (open > best) { best = open; yaw = a; }
      }
      const y = terrainHeight(spot.x, spot.z);
      const grp = new THREE.Group();
      grp.position.set(spot.x, y, spot.z);
      grp.rotation.y = yaw;
      const mat = (c: number, emis = 0.12): THREE.MeshStandardMaterial => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, emissive: c, emissiveIntensity: emis }); this.g.world.rig.register(m); return m; };
      const add = (sx: number, sy: number, sz: number, x: number, yy: number, z: number, m: THREE.Material): void => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); mesh.position.set(x, yy, z); grp.add(mesh); };
      const wall = mat(wallCol), accent = mat(accentCol, def.type === 'club' ? 0.9 : 0.4), dark = mat(0x22252b, 0.05);
      add(W, H, D, 0, H / 2, 0, wall);
      add(W + 0.4, 0.35, D + 0.4, 0, H + 0.17, 0, dark);
      add(W * 0.8, 0.5, 0.12, 0, H - 0.6, D / 2 + 0.08, new THREE.MeshBasicMaterial({ map: sign(def.name.toUpperCase(), '#' + accentCol.toString(16).padStart(6, '0')) }));
      const glow = new THREE.MeshStandardMaterial({ color: 0x1a2430, emissive: 0xffe0b0, emissiveIntensity: 0.6 });
      this.g.world.rig.register(glow);
      add(1.6, 2.4, 0.08, 0, 1.2, D / 2 + 0.05, glow);
      add(2.0, 2.6, 0.06, 0, 1.3, D / 2 + 0.02, dark);
      if (def.type === 'club') { for (const s of [-1, 1]) add(0.25, H - 1, 0.25, s * (W / 2 - 0.3), (H - 1) / 2 + 0.3, D / 2 + 0.15, accent); add(W, 0.18, 0.18, 0, 0.2, D / 2 + 0.6, mat(0xd8b048, 0.4)); }
      if (def.type === 'motel') for (let i = 0; i < 6; i++) add(1.0, 2.1, 0.06, -W / 2 + 2.5 + i * 3.4, 1.05, D / 2 + 0.04, accent);
      if (def.type === 'carwash') add(5, 3.6, 0.1, -W / 4, 1.8, D / 2 + 0.06, mat(0x3a3d42));
      if (def.type === 'grow') for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.2, D / 2 + 1.2), dark); r.position.set(0, H + 1.4, s * D / 4); r.rotation.x = s * 0.5; grp.add(r); }
      this.group.add(grp);
      // a solid box for the building (local → world with the yaw)
      this.g.physics!.addBuildings([{ cx: spot.x, cy: y + H / 2, cz: spot.z, hx: W / 2, hy: H / 2, hz: D / 2, ry: yaw }]);
      const door = { x: spot.x + Math.sin(yaw) * (D / 2 + 1.1), z: spot.z + Math.cos(yaw) * (D / 2 + 1.1) };
      const marker = { name: `${TAG}${def.name}`, x: door.x, z: door.z, glyph: def.legal ? '$' : '☠', color: '#7a8090' };
      MARKERS.push(marker);
      this.sites.set(def.id, { def, x: spot.x, z: spot.z, yaw, door, group: grp, marker });
    }
    this.refreshMarkers();
  }

  /** Owned businesses show in colour on the map; illegal ones you do not own stay off it. */
  refreshMarkers(): void {
    for (const s of this.sites.values()) {
      const own = this.g.commerce ? this.owns(s.def.id) : false;
      s.marker.color = own ? (s.def.legal ? '#3ad87a' : '#b04aff') : '#7a8090';
      s.marker.glyph = !s.def.legal && !own ? '' : s.def.legal ? '$' : '☠';
      const i = MARKERS.indexOf(s.marker);
      if (!s.def.legal && !own) { if (i >= 0) MARKERS.splice(i, 1); }
      else if (i < 0) MARKERS.push(s.marker);
    }
  }

  // ------------------------------------------------------------------------------------------------ buying and selling

  buy(id: string): boolean {
    const d = BUSINESS_BY_ID[id];
    if (!d || this.owns(id) || !this.eco.charge(d.price, `Bought ${d.name}`)) return false;
    this.eco.p.biz.push(id);
    const st = this.state(id);
    if (!d.legal) st.supplies = 25;
    this.eco.message(d.legal ? 'Keystone Realty' : 'ghostline', d.legal ? `${d.name} is yours. Visit it to run it from the office laptop.` : `${d.name} is yours. It is marked on your map. There are some supplies to get you started.`);
    this.refreshMarkers();
    return true;
  }

  sell(id: string): number {
    const d = BUSINESS_BY_ID[id];
    if (!d || !this.owns(id)) return 0;
    const back = Math.round(d.price * 0.7);
    this.eco.p.biz = this.eco.p.biz.filter((x) => x !== id);
    delete this.eco.p.empire[id];
    this.eco.bankIn(back, `Sold ${d.name}`);
    this.refreshMarkers();
    return back;
  }

  /** Clean takings per day for a front (before the day's luck). */
  takings(d: BusinessDef): number {
    if (!d.legal) return 0;
    const st = this.state(d.id);
    let k = 1;
    for (const u of st.upgrades) k += u === 'staff' || u === 'decor' ? 0.25 : u === 'marketing' || u === 'pool' ? 0.2 : 0;
    if (d.type === 'club') k *= 0.25 + (st.popularity / 100) * 1.25;
    return Math.round(d.income * k);
  }

  launderCap(): number {
    return this.owned().filter((d) => d.legal).reduce((a, d) => a + (d.launder ?? 0) * (this.has(d.id, 'books') ? 1.5 : 1), 0);
  }

  /** Hours to work through what is left of an operation's supplies. */
  hoursLeft(d: BusinessDef): number {
    const st = this.state(d.id);
    return (st.supplies / 100) * (d.cycle ?? 24) / (this.has(d.id, 'staff') ? 1.3 : 1);
  }

  stockCap(d: BusinessDef): number { return (d.value ?? 0) * 2 * (this.has(d.id, 'equipment') ? 1.3 : 1); }

  buySupplies(id: string): boolean {
    const d = BUSINESS_BY_ID[id]!, st = this.state(id);
    const cost = Math.round(((d.supplyCost ?? 0) * (100 - st.supplies)) / 100);
    if (cost <= 0 || !this.eco.charge(cost, `Supplies: ${d.name}`)) return false;
    st.supplies = 100;
    return true;
  }

  fence(id: string): number {
    const st = this.state(id);
    const got = Math.round(st.stock * FENCE);
    if (got <= 0) return 0;
    st.stock = 0;
    this.eco.p.dirty += got;
    st.earned += got;
    return got;
  }

  promote(id: string): boolean {
    const st = this.state(id);
    if (st.popularity >= 100 || !this.eco.charge(5000, 'Club promotion')) return false;
    st.popularity = Math.min(100, st.popularity + 25);
    return true;
  }

  upgrade(id: string, up: Upgrade): boolean {
    const d = BUSINESS_BY_ID[id]!, st = this.state(id);
    if (st.upgrades.includes(up.id) || !this.eco.charge(upgradeCost(d, up), `${up.name}: ${d.name}`)) return false;
    st.upgrades.push(up.id);
    return true;
  }

  // ------------------------------------------------------------------------------------------------ time

  /** Operations work through their supplies as game hours pass. */
  private produce(): void {
    const tod = this.g.world.tod;
    // hours since the last tick, wrapping at midnight (sleeping skips the clock forward, never back)
    if (this.lastAbs < 0) { this.lastAbs = tod.hour; return; }
    const dh = (tod.hour - this.lastAbs + 24) % 24;
    this.lastAbs = tod.hour;
    if (dh <= 0) return;
    if (dh < 6) this.maybeAlert(dh);
    for (const d of this.owned()) {
      if (d.legal) continue;
      const st = this.state(d.id);
      if (st.supplies <= 0) continue;
      const rate = (100 / (d.cycle ?? 24)) * (this.has(d.id, 'staff') ? 1.3 : 1);
      const used = Math.min(st.supplies, rate * dh);
      st.supplies -= used;
      st.stock = Math.min(this.stockCap(d), st.stock + (used / 100) * (d.value ?? 0) * (this.has(d.id, 'equipment') ? 1.3 : 1));
      st.heat = Math.min(100, st.heat + (used / 100) * (d.heat ?? 10));
    }
  }

  /** Every morning: takings, laundering, popularity, heat and raids. */
  newDay(): string[] {
    const e = this.eco, notes: string[] = [];
    let takings = 0;
    for (const d of this.owned()) {
      const st = this.state(d.id);
      if (d.legal) {
        let t = this.takings(d) * (0.85 + Math.random() * 0.3);
        if (d.type === 'motel') t *= 0.75 + Math.random() * 0.4;
        t = Math.round(t);
        takings += t;
        st.earned += t;
        if (d.type === 'club') st.popularity = Math.max(0, st.popularity - (this.has(d.id, 'dj') ? 5 : 10));
      } else {
        // heat cools overnight; raids come during the day as alerts (see maybeAlert)
        st.heat = Math.max(0, st.heat - 10);
      }
    }
    if (takings > 0) { e.bankIn(takings, 'Business takings'); notes.push(`Business takings: ${money(takings)}`); }
    const cap = this.launderCap();
    const amount = Math.min(e.p.dirty, cap);
    if (amount > 0) {
      e.p.dirty -= amount;
      const clean = Math.round(amount * (1 - LAUNDER_FEE));
      e.bankIn(clean, 'Laundered through your businesses');
      this.stats.laundered += amount;
      notes.push(`Laundered ${money(amount)}`);
    }
    if (takings > 0 || amount > 0) e.message('Valeria Savings', `Your businesses paid ${money(takings)} into your account${amount > 0 ? `, and ${money(Math.round(amount * (1 - LAUNDER_FEE)))} came through clean from ${money(amount)} of "consulting fees"` : ''}.`);
    else if (e.p.dirty > 0 && !cap) notes.push('Dirty money waiting: buy a legal front to launder it');
    return notes;
  }

  // ------------------------------------------------------------------------------------------------ per frame

  update(dt: number): void {
    const g = this.g;
    this.prompt = null;
    if (!g.commerce || !g.player || g.state !== 'playing') return;
    this.tickT -= dt;
    if (this.tickT <= 0) { this.tickT = 1; this.produce(); }
    if (this.alertCool > 0) this.alertCool -= dt;
    if (this.job) this.tickJob(dt);
    if (this.alert) this.tickAlert(dt);
    if (this.pending && !g.interiors?.inside && !g.interiors?.busy) {
      const def = this.pending;
      this.pending = null;
      if (!g.story?.startMission(def)) g.ui.toast('The job could not start right now.');
    }
    // doors
    const st = g.story;
    if (g.driving?.mode !== 'foot' || g.interiors?.inside || g.interiors?.busy || st?.mission || st?.cutscenes.active || g.combat?.flow) return;
    const pl = g.player.pos;
    for (const s of this.sites.values()) {
      if (Math.hypot(s.door.x - pl.x, s.door.z - pl.z) > 1.6) continue;
      const own = this.owns(s.def.id);
      if (!own) {
        if (!s.def.legal) continue;
        this.prompt = `${s.def.name} · for sale ${money(s.def.price)} on keystone.vc`;
        if (g.input.pressed('interact')) { g.input.swallow('interact'); g.commerce.openWeb('keystone.vc?tab=biz'); }
        return;
      }
      if ((g.wanted?.stars ?? 0) > 0) { this.prompt = `${s.def.name} · lose the police first`; return; }
      this.prompt = `Enter ${s.def.name}`;
      if (g.input.pressed('interact')) { g.input.swallow('interact'); this.enter(s); }
      return;
    }
  }

  private enter(s: Site): void {
    const g = this.g;
    const hr = g.world.tod.hour;
    // the club gets a boost when the owner turns up at night
    if (s.def.type === 'club' && (hr >= 20 || hr < 4)) {
      const st = this.state(s.def.id);
      if (st.visited !== this.eco.p.day) { st.visited = this.eco.p.day; st.popularity = Math.min(100, st.popularity + 8); g.ui.toast('The owner is in the house: popularity +8'); }
    }
    const night = hr >= 20 || hr < 4;
    const crowd = s.def.type === 'club' ? (this.state(s.def.id).popularity / 100) * (night ? 1 : 0.25) : 0.5;
    g.interiors?.enterVenue({ x: s.door.x, z: s.door.z, yaw: s.yaw, venue: { kind: 'biz', level: 'main', seed: hashStr(s.def.id), name: s.def.name, floors: 1, sub: s.def.type, biz: s.def.id, crowd } });
  }

  // ------------------------------------------------------------------------------------------------ jobs

  /** Load the stock into a van outside and drive it to a drop. */
  startSell(id: string): string | null {
    const g = this.g, d = BUSINESS_BY_ID[id]!, st = this.state(id), s = this.sites.get(id)!;
    if (this.job) return 'Finish the job you are on first.';
    if (st.stock < (d.value ?? 0) * 0.1) return 'Not enough stock to be worth the trip.';
    const far = DROPS.map(([x, z, label]) => ({ x, z, label, d: Math.hypot(x - s.x, z - s.z) })).filter((p) => p.d > 600 && p.d < 2600);
    const pick = far[Math.floor(Math.random() * far.length)] ?? { x: DROPS[0]![0], z: DROPS[0]![1], label: DROPS[0]![2], d: 1000 };
    const dest = g.commerce!.points.find(pick.x, pick.z, 4, { walkOnly: false, maxR: 80 });
    const at = g.commerce!.points.find(s.door.x + Math.sin(s.yaw) * 6, s.door.z + Math.cos(s.yaw) * 6, 3.8, { walkOnly: false, maxR: 60 });
    const van = g.vehicles!.spawn('courier', at.x, at.z, s.yaw + Math.PI / 2, '#2a2d33');
    const value = Math.round(st.stock);
    st.stock = 0;
    st.heat = Math.min(100, st.heat + 8);
    const beacon = g.story!.beacons.add(dest.x, dest.z, { color: '#3ae86a', glyph: '$', name: 'Drop' });
    const ambushAt = Math.random() < 0.35 + st.heat / 300 ? 20 + Math.random() * 40 : -1;
    this.job = { kind: 'sell', id, t: 0, limit: Math.round(pick.d / 13 + 90), dest: { x: dest.x, z: dest.z, label: pick.label }, beacon, value, van, ambushAt, rivals: [] };
    g.map.setWaypoint({ x: dest.x, z: dest.z });
    // somebody talks: the police may already be waiting
    if (Math.random() < 0.3 + st.heat / 250) setTimeout(() => { if (this.job?.kind === 'sell') { callPolice(g, 2, this.job.van!.position.x, this.job.van!.position.z); g.ui.toast('Somebody tipped off the police!'); } }, 25000);
    return null;
  }

  /** Steal a load of supplies from a rival's stash. */
  startSupply(id: string): string | null {
    const g = this.g, s = this.sites.get(id)!;
    if (this.job) return 'Finish the job you are on first.';
    const ang = Math.random() * Math.PI * 2, r = 450 + Math.random() * 600;
    const p = g.commerce!.points.find(s.x + Math.cos(ang) * r, s.z + Math.sin(ang) * r, 3, { walkOnly: false, maxR: 160 });
    const crate = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.85 });
    g.world.rig.register(m);
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.8), m); b.position.set((i - 1) * 1.15, 0.35, 0); crate.add(b); }
    crate.position.set(p.x, terrainHeight(p.x, p.z), p.z);
    g.world.scene.add(crate);
    const tag = `supply-${Date.now()}`;
    const H = g.story!.hostiles;
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; H.spawn({ x: p.x + Math.cos(a) * 6, z: p.z + Math.sin(a) * 6, kind: i % 2 ? 'smg' : 'pistol', tag, unaware: true, hp: 70 }); }
    const beacon = g.story!.beacons.add(p.x, p.z, { color: '#ffb02e', glyph: '▣', name: 'Supplies' });
    this.job = { kind: 'supply', id, t: 0, limit: 480, dest: { x: p.x, z: p.z, label: 'the stash' }, beacon, value: 0, crate, hostiles: tag };
    g.map.setWaypoint({ x: p.x, z: p.z });
    return null;
  }

  private tickJob(dt: number): void {
    const g = this.g, j = this.job!, s = g.story!;
    j.t += dt;
    const left = Math.max(0, Math.ceil(j.limit - j.t));
    const d = BUSINESS_BY_ID[j.id]!;
    if (j.t > j.limit) { this.fail(j.kind === 'sell' ? 'The buyer gave up waiting. The load is lost.' : 'The supplies were moved before you got there.'); return; }
    if (s.mission) { this.fail('Job abandoned.'); return; }
    if (j.kind === 'sell') {
      const v = j.van!;
      if (v.exploded || v.health <= 0) { this.fail('The van was destroyed, and the load with it.'); return; }
      const inVan = g.driving?.mode === 'driving' && g.driving.vehicle === v;
      if (inVan) j.boarded = true;
      if (j.boarded) this.ambush(j, dt);
      const dist = Math.hypot(v.position.x - j.dest.x, v.position.z - j.dest.z);
      s.hud.setObjective('Sell run', inVan || j.boarded ? `Take the van to ${j.dest.label}` : 'Get in the van outside', `${money(j.value)} of ${d.product} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} · ${Math.round(dist)} m`);
      if (dist < 9 && Math.abs(v.speedKmh) < 15) {
        this.eco.p.dirty += j.value;
        this.state(j.id).earned += j.value;
        this.stats.sold++;
        g.story?.market.event('VSAV', -0.002);
        this.finish(`Delivered: ${money(j.value)} in dirty money. Launder it through your legal businesses.`);
      }
    } else {
      const pl = g.player!.pos;
      const dist = Math.hypot(pl.x - j.dest.x, pl.z - j.dest.z);
      s.hud.setObjective('Supply run', dist > 30 ? 'Steal the supplies from the stash' : 'Grab the crates (E)', `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
      if (dist < 3 && g.driving?.mode === 'foot') {
        this.prompt = 'Grab the supplies';
        if (g.input.pressed('interact')) {
          g.input.swallow('interact');
          this.state(j.id).supplies = 100;
          this.stats.supplyRuns++;
          this.finish(`Supplies taken: ${d.name} is fully stocked.`);
        }
      }
    }
  }

  /** A rival crew comes after the van: two cars that ram it, and gunmen who jump out when it stops. */
  private ambush(j: Job, dt: number): void {
    const g = this.g, v = j.van!, st = g.story!;
    if ((j.ambushAt ?? -1) >= 0) {
      j.ambushAt! -= dt;
      if (j.ambushAt! < 0) {
        j.ambushAt = -1;
        // vehicles face −Z: come up from behind the van, pointing the same way
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(v.quaternion);
        const yaw = Math.atan2(-fwd.x, -fwd.z), fx = fwd.x, fz = fwd.z;
        for (let i = 0; i < 2; i++) {
          const p = g.commerce!.points.find(v.position.x - fx * (45 + i * 15) + (i ? 6 : -6), v.position.z - fz * (45 + i * 15), 3.4, { walkOnly: false, maxR: 60 });
          const r = g.vehicles!.spawn(i ? 'barrage' : 'stallion', p.x, p.z, yaw, '#2a2a30');
          st.drivers.drive(r, { target: () => ({ x: v.position.x, z: v.position.z }), kmh: 120, aggressive: true });
          j.rivals!.push({ v: r, out: false, still: 0 });
        }
        this.stats.ambushes = (this.stats.ambushes ?? 0) + 1;
        g.audio.uiBlip('back');
        g.ui.toast('A rival crew is coming for the van!');
        st.say('thug', 'That is the van! Run it off the road!');
      }
    }
    for (const r of j.rivals ?? []) {
      if (r.out || r.v.exploded) continue;
      const d = Math.hypot(r.v.position.x - v.position.x, r.v.position.z - v.position.z);
      // up close for a few seconds (pinned, or ramming): the crew bails out
      r.still = d < 15 ? r.still + dt : d > 25 ? 0 : r.still;
      if (r.still > 2.5) {
        // the crew bails out and comes on foot
        r.out = true;
        st.drivers.stop(r.v);
        for (let k = 0; k < 2; k++) st.hostiles.spawn({ x: r.v.position.x + (k ? 2.2 : -2.2), z: r.v.position.z + 1.5, kind: k ? 'smg' : 'pistol', tag: `ambush-${j.id}`, hp: 75 });
      }
    }
  }

  private cleanup(): void {
    const g = this.g, j = this.job;
    if (!j) return;
    if (j.rivals?.length) {
      const rv = j.rivals.map((r) => r.v);
      for (const r of rv) g.story?.drivers.stop(r);
      setTimeout(() => { for (const r of rv) if (g.driving?.vehicle !== r) g.vehicles?.remove(r); g.story?.hostiles.clear(`ambush-${j.id}`); }, 20000);
    }
    g.story?.beacons.remove(j.beacon);
    g.story?.hud.setObjective(null, null);
    if (j.hostiles) { const tag = j.hostiles; setTimeout(() => g.story?.hostiles.clear(tag), 15000); }
    if (j.crate) { g.world.scene.remove(j.crate); j.crate.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); }
    if (j.van && !j.van.exploded) {
      // the van goes back to the yard once you are out of it
      const v = j.van;
      setTimeout(() => { if (g.driving?.vehicle !== v) g.vehicles?.remove(v); }, 20000);
    }
    if (g.map.waypoint && Math.hypot(g.map.waypoint.x - j.dest.x, g.map.waypoint.z - j.dest.z) < 5) g.map.setWaypoint(null);
    this.job = null;
  }

  /** A different save was loaded: drop any job in progress and redraw the map markers. */
  reset(): void {
    if (this.job) { const j = this.job; if (j.van && this.g.driving?.vehicle !== j.van) this.g.vehicles?.remove(j.van); j.van = undefined; this.cleanup(); }
    this.endAlert();
    this.pending = null;
    this.lastAbs = -1;
    this.refreshMarkers();
  }

  private finish(text: string): void {
    this.g.audio.uiBlip('ok');
    this.g.story?.hud.showBanner('Business', 'Job done', text, 'good');
    this.g.ui.toast(text);
    this.cleanup();
    void this.g.commerce!.save(this.g.commerce!.slot ?? 1, true);
  }

  fail(text: string): void {
    this.g.ui.toast(text);
    this.g.story?.hud.showBanner('Business', 'Job failed', text, 'bad');
    this.cleanup();
  }
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
