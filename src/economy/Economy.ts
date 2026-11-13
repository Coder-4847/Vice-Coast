import { Emitter } from '../core/Emitter';
import { DEFAULT_KIT, DEFAULT_OUTFIT, INSURANCE_FEE, PROPERTY_BY_ID, REPAIR_COST, SELL_RATE, START_BANK, START_CASH } from './catalog';
import type { OwnedProperty, OwnedVehicle, Profile, SaveData, Stats, VehicleCustom } from './types';
import { WEAPONS, type WeaponId } from '../player/Weapons';
import { newStory } from '../story/types';

export const newProfile = (): Profile => ({
  cash: START_CASH,
  bank: START_BANK,
  day: 1,
  props: [],
  vehicles: [],
  outfit: { ...DEFAULT_OUTFIT },
  clothes: ['top-grey', 'gl-none', 'hs-short', 'hc-black', 'skin-2'],
  weapons: {
    vc9: { owned: true, ammo: WEAPONS.vc9.mag, reserve: 60 },
    smg: { owned: false, ammo: 0, reserve: 0 },
    shotgun: { owned: false, ammo: 0, reserve: 0 },
    rifle: { owned: false, ammo: 0, reserve: 0 },
    knife: { owned: true, ammo: 1, reserve: 0 },
    hatchet: { owned: false, ammo: 1, reserve: 0 },
    rpg: { owned: false, ammo: 0, reserve: 0 },
    laser: { owned: false, ammo: 0, reserve: 0 },
  },
  kits: { vc9: { ...DEFAULT_KIT }, smg: { ...DEFAULT_KIT }, shotgun: { ...DEFAULT_KIT }, rifle: { ...DEFAULT_KIT }, knife: { ...DEFAULT_KIT }, hatchet: { ...DEFAULT_KIT }, rpg: { ...DEFAULT_KIT }, laser: { ...DEFAULT_KIT } },
  messages: [{ id: 1, from: 'Valeria Savings', text: 'Welcome to Valeria Savings. Your account is open: use any ATM, or the Bank app on your phone.', day: 1, read: false }],
  stats: { spent: 0, earned: 0, playSeconds: 0, carsBought: 0, kills: 0 },
  seq: 2,
  home: null,
  story: newStory(),
  snacks: { bar: 2 },
});

/** Fill any fields a save from an older build is missing. */
export function migrate(p: Partial<Profile>): Profile {
  const base = newProfile();
  return {
    ...base,
    ...p,
    outfit: { ...base.outfit, ...(p.outfit ?? {}) },
    weapons: { ...base.weapons, ...(p.weapons ?? {}) },
    kits: { ...base.kits, ...(p.kits ?? {}) },
    stats: { ...base.stats, ...(p.stats ?? {}) } as Stats,
    snacks: { ...(p.snacks ?? base.snacks) },
    props: p.props ?? [],
    vehicles: p.vehicles ?? [],
    clothes: p.clothes ?? base.clothes,
    messages: p.messages ?? base.messages,
    story: { ...base.story, ...(p.story ?? {}), meter: { ...base.story.meter, ...(p.story?.meter ?? {}) }, missions: p.story?.missions ?? {}, heists: p.story?.heists ?? {}, flags: p.story?.flags ?? {}, chars: p.story?.chars ?? {}, unlocked: p.story?.unlocked ?? base.story.unlocked, crew: p.story?.crew ?? {}, rob: { ...base.story.rob, ...(p.story?.rob ?? {}), cooldown: p.story?.rob?.cooldown ?? {} }, collect: p.story?.collect ?? {}, acts: p.story?.acts ?? {}, claimed: p.story?.claimed ?? [] },
  };
}

export const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

interface EconomyEvents {
  change: { cash: number; bank: number; delta: number; reason: string };
  message: { from: string; text: string };
}

/** Cash, the bank account, properties and owned vehicles. Pure data: the UI and the world react to its events. */
export class Economy extends Emitter<EconomyEvents> {
  p: Profile = newProfile();

  load(p: Profile): void {
    this.p = migrate(p);
    this.emit('change', { cash: this.p.cash, bank: this.p.bank, delta: 0, reason: 'load' });
  }

  reset(): void {
    this.load(newProfile());
  }

  get cash(): number { return this.p.cash; }
  get bank(): number { return this.p.bank; }
  get worth(): number { return this.p.cash + this.p.bank; }

  canAfford(n: number): boolean { return this.p.cash >= n; }

  /** Cash plus the bank balance can cover it. */
  canAffordTotal(n: number): boolean { return this.p.cash + this.p.bank >= n; }

  /** Pay from cash only (shops, street prices). Returns false (and changes nothing) when short. */
  spend(n: number, reason: string): boolean {
    if (n <= 0) return true;
    if (this.p.cash < n) return false;
    this.p.cash -= n;
    this.p.stats.spent += n;
    this.emit('change', { cash: this.p.cash, bank: this.p.bank, delta: -n, reason });
    return true;
  }

  /** Pay from cash first, then the bank (cards, online shops, upkeep). */
  charge(n: number, reason: string): boolean {
    if (n <= 0) return true;
    if (this.p.cash + this.p.bank < n) return false;
    const fromCash = Math.min(this.p.cash, n);
    this.p.cash -= fromCash;
    this.p.bank -= n - fromCash;
    this.p.stats.spent += n;
    this.emit('change', { cash: this.p.cash, bank: this.p.bank, delta: -n, reason });
    return true;
  }

  earn(n: number, reason: string): void {
    if (n <= 0) return;
    this.p.cash += n;
    this.p.stats.earned += n;
    this.emit('change', { cash: this.p.cash, bank: this.p.bank, delta: n, reason });
  }

  deposit(n: number): boolean {
    n = Math.min(n, this.p.cash);
    if (n <= 0) return false;
    this.p.cash -= n; this.p.bank += n;
    this.emit('change', { cash: this.p.cash, bank: this.p.bank, delta: 0, reason: 'deposit' });
    return true;
  }

  withdraw(n: number): boolean {
    n = Math.min(n, this.p.bank);
    if (n <= 0) return false;
    this.p.bank -= n; this.p.cash += n;
    this.emit('change', { cash: this.p.cash, bank: this.p.bank, delta: 0, reason: 'withdraw' });
    return true;
  }

  /** Lose a share of the cash on hand (Wasted / Busted). Returns what was lost. */
  lose(share: number, reason: string): number {
    const n = Math.floor(this.p.cash * share);
    if (n > 0) { this.p.cash -= n; this.emit('change', { cash: this.p.cash, bank: this.p.bank, delta: -n, reason }); }
    return n;
  }

  // ------------------------------------------------------------------------------------------- messages

  message(from: string, text: string): void {
    this.p.messages.unshift({ id: this.p.seq++, from, text, day: this.p.day, read: false });
    if (this.p.messages.length > 60) this.p.messages.length = 60;
    this.emit('message', { from, text });
  }

  get unread(): number { return this.p.messages.filter((m) => !m.read).length; }

  // ------------------------------------------------------------------------------------------- properties

  owns(id: string): OwnedProperty | undefined { return this.p.props.find((x) => x.id === id); }

  buyProperty(id: string): boolean {
    const def = PROPERTY_BY_ID[id];
    if (!def || this.owns(id) || !this.charge(def.price, `Bought ${def.name}`)) return false;
    this.p.props.push({ id, boughtDay: this.p.day, overdue: 0 });
    this.p.home ??= id;
    this.message('Valeria Realty', `Congratulations on ${def.name}. The keys are yours; upkeep of ${money(def.upkeep)} a day comes out of your account.`);
    return true;
  }

  /** A protagonist's home: owned for free, no upkeep. */
  grantProperty(id: string): void {
    if (this.owns(id)) { this.owns(id)!.free = true; return; }
    this.p.props.push({ id, boughtDay: this.p.day, overdue: 0, free: true });
    this.p.home ??= id;
  }

  sellProperty(id: string): number {
    const def = PROPERTY_BY_ID[id];
    if (!def || !this.owns(id)) return 0;
    const n = Math.floor(def.price * 0.7);
    this.p.props = this.p.props.filter((x) => x.id !== id);
    // anything parked there goes to the street outside the nearest remaining property, else the curb value is paid out
    for (const v of this.p.vehicles) if ((v.where.kind === 'stored' || v.where.kind === 'destroyed') && v.where.prop === id) v.where = { kind: 'world', x: def.near.x, z: def.near.z, yaw: 0 };
    if (this.p.home === id) this.p.home = this.p.props[0]?.id ?? null;
    this.earn(n, `Sold ${def.name}`);
    return n;
  }

  /** A new in-game day: bill every property. Properties that can't be paid for two days in a row are repossessed. */
  newDay(): string[] {
    this.p.day++;
    const notes: string[] = [];
    let total = 0;
    for (const o of [...this.p.props]) {
      const def = PROPERTY_BY_ID[o.id]!;
      if (o.free) { o.overdue = 0; continue; }
      if (this.charge(def.upkeep, `Upkeep: ${def.name}`)) { o.overdue = 0; total += def.upkeep; }
      else {
        o.overdue++;
        if (o.overdue >= 3) { this.sellProperty(o.id); this.p.cash -= Math.min(this.p.cash, Math.floor(def.price * 0.7)); notes.push(`${def.name} was repossessed.`); this.message('Valeria Realty', `${def.name} has been repossessed after three unpaid days.`); }
        else { notes.push(`Upkeep unpaid on ${def.name}.`); this.message('Valeria Realty', `We could not collect ${money(def.upkeep)} for ${def.name}. Keep funds in your bank account or it will be repossessed.`); }
      }
    }
    if (total > 0) { notes.unshift(`Upkeep paid: ${money(total)}`); this.message('Valeria Savings', `Property upkeep of ${money(total)} was taken from your account.`); }
    this.emit('change', { cash: this.p.cash, bank: this.p.bank, delta: 0, reason: 'day' });
    return notes;
  }

  // ------------------------------------------------------------------------------------------- vehicles

  vehicle(uid: string): OwnedVehicle | undefined { return this.p.vehicles.find((v) => v.uid === uid); }

  addVehicle(spec: string, custom: VehicleCustom, price: number, prop: string | null, at?: { x: number; z: number; yaw: number }): OwnedVehicle {
    const v: OwnedVehicle = { uid: `v${this.p.seq++}`, spec, custom, value: price, where: prop ? { kind: 'stored', prop } : { kind: 'world', x: at?.x ?? 0, z: at?.z ?? 0, yaw: at?.yaw ?? 0 } };
    this.p.vehicles.push(v);
    this.p.stats.carsBought++;
    return v;
  }

  sellVehicle(uid: string): number {
    const v = this.vehicle(uid);
    if (!v) return 0;
    const n = Math.floor(v.value * SELL_RATE);
    this.p.vehicles = this.p.vehicles.filter((x) => x.uid !== uid);
    this.earn(n, 'Sold vehicle');
    return n;
  }

  repairCost(v: OwnedVehicle, health: number): number {
    return Math.round(Math.max(0, 1000 - health) / 1000 * v.value * REPAIR_COST * 4);
  }

  insuranceFee(v: OwnedVehicle): number { return Math.round(v.value * INSURANCE_FEE); }

  /** Slots used / free at a property. */
  stored(prop: string): OwnedVehicle[] {
    return this.p.vehicles.filter((v) => (v.where.kind === 'stored' || v.where.kind === 'destroyed') && v.where.prop === prop);
  }

  // ------------------------------------------------------------------------------------------- weapons

  weaponOwned(id: WeaponId): boolean { return this.p.weapons[id].owned; }

  toSave(world: SaveData['world'], label: string): SaveData {
    return { version: 1, savedAt: Date.now(), label, profile: JSON.parse(JSON.stringify(this.p)) as Profile, world };
  }
}
