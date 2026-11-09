import * as THREE from 'three';
import type { Game } from '../Game';
import { Modal, type Page } from '../ui/Modal';
import type { Vehicle } from '../vehicles/Vehicle';
import { VEHICLES } from '../vehicles/specs';
import { WEAPONS, type WeaponId } from '../player/Weapons';
import { GROUP } from '../physics/Physics';
import { terrainHeight, waterLevelAt } from '../world/Terrain';
import { GEO } from '../world/heightfield';
import { MARKERS } from '../ui/mapData';
import { h } from '../ui/dom';
import { PROPERTY_BY_ID, defaultCustom, PROPERTIES, SHOPS } from './catalog';
import { Economy, money } from './Economy';
import { Points, type Point } from './Points';
import { buildShopFronts } from './ShopFronts';
import { KitSource } from '../world/towns/kit';
import { SaveStore } from './SaveStore';
import type { OwnedVehicle, SaveData, SlotInfo } from './types';
import * as screens from './screens';

const BASE_MAG: Record<WeaponId, number> = { vc9: WEAPONS.vc9.mag, smg: WEAPONS.smg.mag, shotgun: WEAPONS.shotgun.mag, rifle: WEAPONS.rifle.mag };
const AUTOSAVE_EVERY = 240;
const _v = new THREE.Vector3();

interface Orbit { target: () => THREE.Vector3 | null; r: number; yaw: number; pitch: number; spin: boolean; height: number }

/**
 * Money, saving, properties, shops, the garage and the phone's data: everything Phase 10 adds on top of the world.
 * Screens (see screens.ts) are built from the Economy and call back into the game through this class.
 */
export class Commerce {
  readonly eco = new Economy();
  readonly store = new SaveStore();
  readonly modal: Modal;
  points!: Points;
  /** Active save slot (1–3), or null for an unsaved session. */
  slot: number | null = null;
  /** The text shown by the interact prompt, if a point is in reach. */
  prompt: string | null = null;
  orbit: Orbit | null = null;
  /** A test drive in progress. */
  test: { vehicle: Vehicle; t: number; back: { x: number; z: number; yaw: number }; ref: string } | null = null;

  private near: Point | null = null;
  private lastHour = -1;
  private sinceSave = 0;
  private readonly moneyEl: HTMLElement;
  private readonly moneyNum: HTMLElement;
  private readonly deltaEl: HTMLElement;
  private shownCash = 0;
  private deltaT = 0;
  private wreckTimers = new Map<string, number>();
  private saving = false;
  private propCrafts = new Set<string>();
  /** Wired by Game: whether the title / pause machinery lets us open things. */
  onModalOpen: (() => void) | null = null;
  onModalClose: (() => void) | null = null;

  constructor(readonly game: Game) {
    this.modal = new Modal(document.getElementById('ui')!);
    this.modal.cash = () => this.eco.cash;
    this.modal.toastFn = (t) => this.game.ui.toast(t);
    this.modal.onEmpty = () => { this.orbit = null; this.onModalClose?.(); };
    this.moneyNum = h('b', '', '$0');
    this.deltaEl = h('span', 'money-delta');
    this.moneyEl = h('div', 'money-hud is-hidden', this.moneyNum, this.deltaEl);
    this.game.ui.hudRoot.append(this.moneyEl);
    this.eco.on('change', (e) => this.onChange(e.delta, e.reason));
    this.eco.on('message', (m) => this.game.ui.toast(`${m.from}: ${m.text.length > 70 ? m.text.slice(0, 68) + '…' : m.text}`));
  }

  /** Called once the world, vehicles, combat and NPCs exist. */
  /** How long placing the shops and properties took at start-up (ms). */
  initMs = 0;

  init(): void {
    const t0 = performance.now();
    const g = this.game;
    const plan = g.world.city.plan;
    this.points = new Points({
      sources: g.world.city.sources,
      inCity: (x, z) => plan.inCity(x, z),
      walkable: (x, z) => !plan.inCity(x, z) || plan.roadAt(x, z).kind === 'sidewalk',
    });
    g.world.scene.add(this.points.group);
    g.world.city.addSource(new KitSource('shop-fronts', buildShopFronts(this.points.list, (x, z) => plan.inCity(x, z))));
    for (const m of this.points.materials) g.world.rig.register(m);
    g.world.city.reload(g.player!.pos.x, g.player!.pos.z);
    this.refreshMarkers();
    // pedestrians and officers drop a little cash
    const hooks = g.npcs?.peds.hooks;
    if (hooks) {
      const prev = hooks.killed;
      hooks.killed = (p, byPlayer) => {
        prev?.(p, byPlayer);
        if (!byPlayer) return;
        this.eco.p.stats.kills++;
        const amt = p.role === 'civ' ? 12 + Math.floor(Math.random() * 70) : 40 + Math.floor(Math.random() * 160);
        this.eco.earn(amt, 'Dropped wallet');
      };
    }
    // being Wasted or Busted costs money
    const combat = g.combat;
    if (combat) {
      const prev = combat.onRespawn;
      combat.onRespawn = (kind) => {
        prev?.(kind);
        const lost = this.eco.lose(kind === 'busted' ? 0.25 : 0.1, kind === 'busted' ? 'Bail and fines' : 'Hospital bill');
        if (lost > 0) g.ui.toast(`${kind === 'busted' ? 'Fined' : 'Hospital bill'}: ${money(lost)}`);
        const home = this.eco.p.home ? this.points.byRef(this.eco.p.home) : null;
        if (home && g.player) g.player.teleport(home.x, home.z + 4, 0);
      };
    }
    this.eco.reset();
    this.applyProfile(false);
    this.initMs = performance.now() - t0;
  }

  // ------------------------------------------------------------------------------------------- HUD

  private onChange(delta: number, reason: string): void {
    this.modal.setCash(this.eco.cash);
    if (delta !== 0 && reason !== 'load') {
      this.deltaEl.textContent = `${delta > 0 ? '+' : '−'}${money(Math.abs(delta))}`;
      this.deltaEl.className = `money-delta ${delta > 0 ? 'up' : 'down'} show`;
      this.deltaT = 2.4;
    }
    this.moneyEl.classList.remove('is-hidden');
  }

  private updateHud(dt: number): void {
    const d = this.eco.cash - this.shownCash;
    this.shownCash = Math.abs(d) < 1 ? this.eco.cash : this.shownCash + d * Math.min(1, dt * 7);
    this.moneyNum.textContent = money(this.shownCash);
    if (this.deltaT > 0) { this.deltaT -= dt; if (this.deltaT <= 0) this.deltaEl.classList.remove('show'); }
  }

  // ------------------------------------------------------------------------------------------- map markers

  refreshMarkers(): void {
    const owned = (id: string): boolean => !!this.eco.owns(id);
    for (let i = MARKERS.length - 1; i >= 0; i--) if (MARKERS[i]!.name.startsWith('​')) MARKERS.splice(i, 1);
    for (const m of this.points.mapMarkers(owned)) {
      if (m.glyph === '$') continue; // ATMs are listed on the phone, not drawn on the map
      MARKERS.push({ ...m, name: '​' + m.name });
    }
    this.points.setOwned(owned);
  }

  // ------------------------------------------------------------------------------------------- save / load

  worldSnapshot(): SaveData['world'] {
    const g = this.game;
    const p = g.player!;
    const v = g.combat!.vitals;
    return { x: p.pos.x, z: p.pos.z, yaw: p.yaw, hour: g.world.tod.hour, health: v.health, armour: v.armour };
  }

  /** Copy live state (weapons, owned cars out in the world) into the profile. */
  sync(): void {
    const g = this.game;
    const w = g.weapon;
    if (w) {
      w.inv[w.def.id].ammo = w.ammo;
      w.inv[w.def.id].reserve = w.reserve;
      for (const id of Object.keys(w.inv) as WeaponId[]) this.eco.p.weapons[id] = { owned: w.inv[id].owned, ammo: w.inv[id].ammo, reserve: w.inv[id].reserve };
    }
    for (const v of g.vehicles?.vehicles ?? []) {
      if (!v.ownedUid) continue;
      const o = this.eco.vehicle(v.ownedUid);
      if (!o) continue;
      const f = _v.set(0, 0, -1).applyQuaternion(v.quaternion);
      if (!v.exploded) o.where = { kind: 'world', x: v.position.x, z: v.position.z, yaw: Math.atan2(-f.x, -f.z) };
    }
    this.eco.p.stats.playSeconds = Math.floor(this.eco.p.stats.playSeconds);
  }

  labelNow(): string {
    const p = this.game.player!.pos;
    const prop = this.nearestOwned(p.x, p.z);
    const where = prop ? PROPERTY_BY_ID[prop.ref]!.region : 'San Verano';
    return `${where} · Day ${this.eco.p.day} · ${this.game.world.tod.clock}`;
  }

  async save(slot = this.slot ?? 1, quiet = false): Promise<boolean> {
    if (this.saving || !this.game.player || !this.game.combat) return false;
    if (this.game.story?.mission && !quiet) { this.game.ui.toast('You can\'t save in the middle of a mission'); return false; }
    if (this.game.story?.mission) return false;
    this.saving = true;
    try {
      this.sync();
      const ok = await this.store.write(slot, this.eco.toSave(this.worldSnapshot(), this.labelNow()));
      if (ok) { this.slot = slot; this.sinceSave = 0; if (!quiet) this.game.ui.toast(`Game saved · slot ${slot}`); }
      else this.game.ui.toast('Could not save: browser storage is unavailable');
      return ok;
    } finally { this.saving = false; }
  }

  autosave(): void {
    if (this.slot === null || this.game.state !== 'playing') return;
    if ((this.game.wanted?.stars ?? 0) > 0 || this.game.combat?.flow) return;
    void this.save(this.slot, true).then((ok) => { if (ok) this.game.ui.toast('Autosaved'); });
  }

  /** Start (or continue) from a slot. */
  begin(slot: number | null, data: SaveData | null): void {
    this.slot = slot;
    const g = this.game;
    if (data) {
      this.eco.load(data.profile);
      this.applyProfile(true);
      g.player?.teleport(data.world.x, data.world.z, data.world.yaw);
      g.world.setHour(data.world.hour);
      const v = g.combat!.vitals;
      v.health = Math.max(20, data.world.health);
      v.armour = data.world.armour;
    } else {
      this.eco.reset();
      this.applyProfile(false);
    }
    this.sinceSave = 0;
    this.lastHour = g.world.tod.hour;
    g.story?.onBegin(!data);
  }

  /** Make the world match the profile: outfit, weapon kits and ammo, owned cars, property beams and craft. */
  applyProfile(fromSave: boolean): void {
    const g = this.game;
    const p = this.eco.p;
    this.applyOutfit();
    const w = g.weapon;
    if (w) {
      for (const id of Object.keys(p.weapons) as WeaponId[]) {
        w.inv[id].owned = p.weapons[id].owned;
        w.inv[id].ammo = p.weapons[id].ammo;
        w.inv[id].reserve = p.weapons[id].reserve;
      }
      this.applyKits();
      const cur = w.inv[w.def.id];
      w.ammo = cur.ammo;
      w.reserve = cur.reserve;
    }
    // owned vehicles out in the world: replace any previous copies
    const vm = g.vehicles;
    if (vm) {
      for (const v of [...vm.vehicles]) if (v.ownedUid) { if (g.driving?.vehicle === v) g.driving.abort(); vm.remove(v); }
      for (const o of p.vehicles) if (o.where.kind === 'world') this.spawnOwned(o, o.where.x, o.where.z, o.where.yaw);
    }
    if (fromSave) for (const o of p.props) this.spawnPropCrafts(o.id);
    this.refreshMarkers();
    this.wreckTimers.clear();
  }

  applyOutfit(): void {
    const o = this.eco.p.outfit;
    this.game.viewmodel?.applyOutfit(o);
    this.game.vehicles?.setOutfit(o);
  }

  applyKits(): void {
    const g = this.game;
    const w = g.weapon;
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      const kit = this.eco.p.kits[id];
      WEAPONS[id].mag = Math.round(BASE_MAG[id] * (kit.ext ? 1.5 : 1));
      if (w) { w.suppressed[id] = kit.supp; w.scoped[id] = kit.scope; }
      g.viewmodel?.applyKit(id, kit);
    }
  }

  spawnOwned(o: OwnedVehicle, x: number, z: number, yaw: number): Vehicle {
    const v = this.game.vehicles!.spawnOwned(o, x, z, yaw);
    o.where = { kind: 'world', x, z, yaw };
    return v;
  }

  worldVehicle(uid: string): Vehicle | null {
    return this.game.vehicles?.vehicles.find((v) => v.ownedUid === uid) ?? null;
  }

  /** The hangar and the boat house come with a craft or two. */
  spawnPropCrafts(id: string): void {
    const c = this.game.crafts;
    if (!c || this.propCrafts.has(id)) return;
    const pt = this.points.byRef(id);
    if (!pt) return;
    if (id === 'hangar') {
      const a = GEO.airport;
      c.spawn('skylark', a.x + 130, a.apronZ + 95, -Math.PI / 2);
      c.spawn('sparrow', a.x + 170, a.apronZ + 95, -Math.PI / 2);
    } else if (id === 'dock') {
      const s = this.points.find(pt.x - 40, pt.z + 30, 7, { water: true, maxR: 120 });
      c.spawn('marlin', s.x, s.z, Math.PI / 2);
    } else return;
    this.propCrafts.add(id);
  }

  /** Where a vehicle taken out of a property's garage appears. */
  garageSpot(propId: string): { x: number; z: number; yaw: number } {
    const pt = this.points.byRef(propId)!;
    const s = this.points.find(pt.x + 6, pt.z + 6, 3.6, { walkOnly: false, maxR: 60 });
    const dx = s.x - pt.x, dz = s.z - pt.z;
    return { x: s.x, z: s.z, yaw: Math.atan2(-dx, -dz) };
  }

  nearestOwned(x: number, z: number): Point | null {
    let best: Point | null = null, bd = Infinity;
    for (const o of this.eco.p.props) {
      const pt = this.points.byRef(o.id);
      if (!pt) continue;
      const d = Math.hypot(pt.x - x, pt.z - z);
      if (d < bd) { best = pt; bd = d; }
    }
    return best;
  }

  // ------------------------------------------------------------------------------------------- modals

  open(page: Page): void {
    this.onModalOpen?.();
    this.modal.open(page);
  }

  closeAll(): void { this.modal.close(); }

  /** Open a screen by name (the wardrobe from anywhere, and for tests). */
  openScreen(name: 'wardrobe' | 'clothing' | 'barber' | 'weapons' | 'food' | 'atm'): void {
    switch (name) {
      case 'wardrobe': this.open(screens.outfitPage(this, 'wardrobe', 'Wardrobe')); break;
      case 'clothing': this.open(screens.clothingShop(this, 'Threadline')); break;
      case 'barber': this.open(screens.barberShop(this, 'The Clip Joint')); break;
      case 'weapons': this.open(screens.weaponShop(this, 'Brass & Barrel')); break;
      case 'food': this.open(screens.foodShop(this, 'Brass Monkey Burgers')); break;
      default: this.open(screens.atmPage(this));
    }
  }

  /** Orbit camera for the showroom / tuning views. */
  setOrbit(o: Orbit | null): void { this.orbit = o; }

  openFor(pt: Point): void {
    switch (pt.kind) {
      case 'atm': this.open(screens.atmPage(this)); break;
      case 'property': this.open(screens.propertyPage(this, PROPERTY_BY_ID[pt.ref]!)); break;
      case 'clothing': this.open(screens.clothingShop(this, SHOPS.find((s) => s.id === pt.ref)!.name)); break;
      case 'barber': this.open(screens.barberShop(this, SHOPS.find((s) => s.id === pt.ref)!.name)); break;
      case 'weapons': this.open(screens.weaponShop(this, SHOPS.find((s) => s.id === pt.ref)!.name)); break;
      case 'food': this.open(screens.foodShop(this, SHOPS.find((s) => s.id === pt.ref)!.name)); break;
      case 'showroom': screens.openShowroom(this, pt); break;
      case 'tuning': screens.openTuning(this, pt); break;
      default:
    }
  }

  // ------------------------------------------------------------------------------------------- per frame

  /** While a modal is open: the orbit camera and the money counter. */
  updateModal(dt: number): void {
    this.updateHud(dt);
    const o = this.orbit;
    if (!o) return;
    const t = o.target();
    if (!t) return;
    if (o.spin) o.yaw += dt * 0.28;
    const cam = this.game.camera;
    const cp = Math.cos(o.pitch);
    cam.position.set(t.x + Math.sin(o.yaw) * cp * o.r, t.y + o.height + Math.sin(o.pitch) * o.r, t.z + Math.cos(o.yaw) * cp * o.r);
    // keep scenery (sign posts, trees, walls) from sitting between the camera and the car
    const phys = this.game.physics;
    if (phys) {
      const from = _v.set(t.x, t.y + o.height * 0.7, t.z);
      const dir = new THREE.Vector3().subVectors(cam.position, from);
      const dist = dir.length();
      dir.divideScalar(dist || 1);
      const hit = phys.raycast(from, dir, dist, undefined, GROUP.WORLD | GROUP.PROP);
      if (hit && hit.distance < dist) cam.position.copy(from).addScaledVector(dir, Math.max(1.8, hit.distance - 0.4));
    }
    const gy = Math.max(terrainHeight(cam.position.x, cam.position.z), waterLevelAt(cam.position.x, cam.position.z)) + 0.4;
    if (cam.position.y < gy) cam.position.y = gy;
    cam.lookAt(t.x, t.y + o.height * 0.7, t.z);
    cam.fov = 42;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** While playing. Returns true when it consumed the interact key. */
  update(dt: number): void {
    const g = this.game;
    this.updateHud(dt);
    this.points.update(dt, g.player?.pos.x, g.player?.pos.z);
    const eco = this.eco;
    eco.p.stats.playSeconds += dt;
    this.sinceSave += dt;
    if (this.sinceSave > AUTOSAVE_EVERY) { this.sinceSave = 0; this.autosave(); }

    // a new day starts at 06:00
    const hr = g.world.tod.hour;
    if (this.lastHour >= 0 && this.lastHour < 6 && hr >= 6 || this.lastHour > hr + 12 && hr >= 6) this.newDay();
    this.lastHour = hr;

    this.trackWrecks(dt);
    this.updateTest(dt);

    // what is in reach?
    this.prompt = null;
    this.near = null;
    const p = g.player;
    if (!p || g.piloting?.busy || g.skydive?.active || g.combat?.flow || this.test && false) return;
    const drv = g.driving;
    const v = drv && drv.mode === 'driving' ? drv.vehicle : null;
    if (drv && (drv.mode === 'entering' || drv.mode === 'exiting')) return;
    const pos = v ? v.position : p.pos;
    const pt = this.points.near(pos.x, pos.z, v ? (v.spec.kind === 'car' ? 1 : 0) : 0);
    if (!pt) return;
    if (v) {
      // in a car: only the tuning shop (customise) and your own properties (garage) respond, and only when you've stopped
      const stopped = Math.abs(v.speedKmh) < 4;
      if (!stopped) return;
      if (pt.kind === 'tuning') { this.near = pt; this.prompt = 'Customize vehicle'; }
      else if (pt.kind === 'property' && this.eco.owns(pt.ref)) { this.near = pt; this.prompt = `Garage · ${PROPERTY_BY_ID[pt.ref]!.name}`; }
      else if (pt.kind === 'showroom' && this.test) { this.near = pt; this.prompt = 'End test drive'; }
    } else {
      if (p.state !== 'ground' || p.noclip || p.mantle) return;
      this.near = pt;
      this.prompt = pt.kind === 'atm' ? 'Use ATM'
        : pt.kind === 'property' ? (this.eco.owns(pt.ref) ? `Enter ${pt.name}` : `${pt.name} — for sale ${money(PROPERTY_BY_ID[pt.ref]!.price)}`)
        : pt.kind === 'showroom' ? 'Browse vehicles'
        : pt.kind === 'tuning' ? 'Redline Customs: drive in to customize'
        : pt.kind === 'food' ? 'Order food'
        : `Shop at ${pt.name}`;
      if (pt.kind === 'tuning') this.near = null; // on foot there is nothing to do at the tuning bay
    }
    if (this.near && g.input.pressed('interact')) {
      g.input.swallow('interact');
      if (this.near.kind === 'showroom' && this.test) this.endTest(true);
      else if (v && this.near.kind === 'property') this.open(screens.propertyPage(this, PROPERTY_BY_ID[this.near.ref]!, true));
      else this.openFor(this.near);
    }
  }

  private newDay(): void {
    const notes = this.eco.newDay();
    this.game.ui.toast(`Day ${this.eco.p.day}${notes.length ? ' · ' + notes[0] : ''}`);
    this.autosave();
  }

  /** Advance the clock (sleeping) and run any days that pass. */
  skipTo(hour: number): void {
    const tod = this.game.world.tod;
    const crosses = tod.hour >= 6 || tod.hour < 0 ? hour <= tod.hour || tod.hour < 6 : false;
    tod.setHour(hour);
    this.lastHour = hour;
    if (crosses || hour === 6) this.newDay();
  }

  /** Owned cars that blow up go to the insurer after a while. */
  private trackWrecks(dt: number): void {
    const vm = this.game.vehicles;
    if (!vm) return;
    for (const v of [...vm.vehicles]) {
      if (!v.ownedUid || !v.exploded) continue;
      const t = (this.wreckTimers.get(v.ownedUid) ?? 0) + dt;
      this.wreckTimers.set(v.ownedUid, t);
      if (t > 9 && this.game.driving?.vehicle !== v) {
        const o = this.eco.vehicle(v.ownedUid);
        this.wreckTimers.delete(v.ownedUid);
        vm.remove(v);
        if (o) {
          const prop = this.nearestOwned(v.position.x, v.position.z);
          o.where = { kind: 'destroyed', prop: prop?.ref ?? '' };
          this.eco.message('Mors Mutual', `Your ${VEHICLES[o.spec]?.name ?? 'vehicle'} was written off. File a claim on your phone (Insurance) or at your garage for ${money(this.eco.insuranceFee(o))}.`);
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------- test drives

  startTest(vehicle: Vehicle, ref: string, back: { x: number; z: number; yaw: number }): void {
    this.test = { vehicle, t: 120, back, ref };
    this.game.ui.toast('Test drive: 2 minutes. Stop at the showroom and press E to end it.');
  }

  private updateTest(dt: number): void {
    const t = this.test;
    if (!t) return;
    t.t -= dt;
    if (t.t <= 0) this.endTest(false);
  }

  endTest(manual: boolean): void {
    const t = this.test;
    if (!t) return;
    this.test = null;
    const g = this.game;
    if (g.driving?.vehicle === t.vehicle) g.driving.abort();
    g.vehicles?.remove(t.vehicle);
    g.player?.teleport(t.back.x, t.back.z, t.back.yaw);
    g.ui.toast(manual ? 'Test drive over' : 'Time is up: test drive over');
  }

  // ------------------------------------------------------------------------------------------- title / saves

  async slots(): Promise<SlotInfo[]> { return this.store.list(); }

  /** A new owned vehicle's default customisation from its factory paint. */
  defaultCustomFor(specId: string, plate?: string): ReturnType<typeof defaultCustom> {
    const b = VEHICLES[specId]!.body;
    return defaultCustom(b.color, b.accent, plate ?? `VC${Math.floor(1000 + Math.random() * 8999)}`);
  }

  /** Slot manager for the title screen and the pause menu's Saves tab. */
  mountSaves(host: HTMLElement, onStart?: (slot: number, data: SaveData | null) => void): () => void {
    return screens.mountSlots(this, host, onStart);
  }

  get properties(): typeof PROPERTIES { return PROPERTIES; }

  // ------------------------------------------------------------------------------------------- phone services

  /** Mechanic delivery: the car appears on open ground ahead of the player. */
  deliverVehicle(o: OwnedVehicle): boolean {
    const g = this.game;
    if (!this.eco.charge(150, 'Vehicle delivery')) { g.ui.toast('Not enough money'); return false; }
    const old = this.worldVehicle(o.uid);
    if (old) { if (g.driving?.vehicle === old) g.driving.abort(); g.vehicles?.remove(old); }
    const p = g.player!;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const s = this.points.find(p.pos.x + fx * 16, p.pos.z + fz * 16, 3.8, { walkOnly: false, maxR: 80 });
    this.spawnOwned(o, s.x, s.z, p.yaw + Math.PI);
    g.ui.toast(`${VEHICLES[o.spec]!.name} delivered`);
    return true;
  }

  claimInsurance(o: OwnedVehicle): boolean {
    const fee = this.eco.insuranceFee(o);
    if (!this.eco.charge(fee, 'Insurance excess')) { this.game.ui.toast('Not enough money'); return false; }
    const prop = this.eco.p.props.map((x) => PROPERTY_BY_ID[x.id]!).find((d) => d.bays === 'car' && this.eco.stored(d.id).length < d.slots);
    if (prop) { o.where = { kind: 'stored', prop: prop.id }; this.game.ui.toast(`Claim paid: ${VEHICLES[o.spec]!.name} is in ${prop.name}`); }
    else { o.where = { kind: 'world', x: 0, z: 0, yaw: 0 }; this.deliverVehicleFree(o); }
    return true;
  }

  private deliverVehicleFree(o: OwnedVehicle): void {
    const p = this.game.player!;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const s = this.points.find(p.pos.x + fx * 16, p.pos.z + fz * 16, 3.8, { walkOnly: false, maxR: 80 });
    this.spawnOwned(o, s.x, s.z, 0);
    this.game.ui.toast(`Claim paid: ${VEHICLES[o.spec]!.name} is waiting nearby`);
  }

  /** Taxi to the waypoint: a fare by distance, a short fade, and the clock moves on. */
  taxi(x: number, z: number): boolean {
    const g = this.game;
    const p = g.player!;
    const d = Math.hypot(x - p.pos.x, z - p.pos.z);
    const fare = Math.round(18 + d * 0.045);
    if (g.wanted && g.wanted.stars > 0) { g.ui.toast('The driver takes one look at the police and drives off'); return false; }
    if (!this.eco.charge(fare, 'Taxi')) { g.ui.toast(`The fare is ${money(fare)}`); return false; }
    const s = this.points.find(x, z, 2, { walkOnly: false, maxR: 90 });
    const el = document.getElementById('ui')!.appendChild(h('div', 'fade-black'));
    requestAnimationFrame(() => el.classList.add('on'));
    setTimeout(() => {
      p.teleport(s.x, s.z, p.yaw);
      g.world.setHour(g.world.tod.hour + d / 20 / 3600 * 60);
      this.lastHour = g.world.tod.hour;
      g.world.city.warm(s.x, s.z);
      el.classList.remove('on');
      setTimeout(() => el.remove(), 700);
      g.ui.toast(`Arrived · fare ${money(fare)}`);
    }, 700);
    return true;
  }

  /** Save the current frame as a PNG. */
  photo(): void {
    const g = this.game;
    g.renderNow();
    g.gfx.renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vice-coast-${Date.now()}.png`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
    const flash = document.getElementById('ui')!.appendChild(h('div', 'cam-flash'));
    setTimeout(() => flash.remove(), 400);
  }
}
