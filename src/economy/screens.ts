import * as THREE from 'three';
import { h } from '../ui/dom';
import { btn, row, section, stepper, swatches, type Page } from '../ui/Modal';
import { VEHICLES, type VehicleSpec } from '../vehicles/specs';
import type { Vehicle } from '../vehicles/Vehicle';
import { WEAPONS } from '../player/Weapons';
import { avatar } from './Avatar';
import {
  ARMOUR_PRICE, ATTACHMENTS, FINISHES, FOOD, GLOVES, HAIR_COLORS, HAIR_STYLES, NEONS, PAINTS, PERF_COST, PERF_NAMES, PROPERTY_BY_ID, RIMS,
  RUNFLAT_PRICE, SHOP_WEAPONS, SHOWROOM, SKINS, SPOILERS, SUPPLIES, TINTS, TOPS, WEAPON_TINTS, type ClothingItem, type PropertyDef,
} from './catalog';
import type { Commerce } from './Commerce';
import { money } from './Economy';
import type { Point } from './Points';
import type { OwnedVehicle, SaveData, VehicleCustom } from './types';

const ago = (t: number): string => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const clock = (s: number): string => `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;

const info = (text: string): HTMLElement => h('p', 'm-info', text);
const kv = (k: string, v: string): HTMLElement => h('div', 'm-kv', h('span', '', k), h('b', '', v));

// ============================================================================================================ ATM

export function atmPage(c: Commerce): Page {
  return {
    title: 'Valeria Savings',
    kicker: 'ATM',
    hints: 'Esc / B  close',
    render(host) {
      const e = c.eco;
      host.body.append(
        h('div', 'm-balance', kv('Cash on hand', money(e.cash)), kv('Account balance', money(e.bank))),
        section('Withdraw'),
        ...[100, 500, 1000, 5000].map((n) => row({ label: `Withdraw ${money(n)}`, disabled: e.bank < 1, right: e.bank < n ? 'Insufficient funds' : '', onClick: () => { if (e.bank >= n) { e.withdraw(n); host.refresh(); } } })),
        row({ label: 'Withdraw everything', disabled: e.bank < 1, onClick: () => { e.withdraw(e.bank); host.refresh(); } }),
        section('Deposit'),
        ...[100, 500, 1000, 5000].map((n) => row({ label: `Deposit ${money(n)}`, disabled: e.cash < n, onClick: () => { e.deposit(n); host.refresh(); } })),
        row({ label: 'Deposit all cash', disabled: e.cash < 1, onClick: () => { e.deposit(e.cash); host.refresh(); } }),
        info('Cash can be lost when you are Wasted or Busted. Money in the bank is safe, and pays for property upkeep.'),
      );
    },
  };
}

// ============================================================================================================ properties

function confirmPage(title: string, text: string, yes: string, onYes: () => void): Page {
  return {
    title,
    hideMoney: true,
    render(host) {
      host.body.append(info(text), row({ label: yes, onClick: () => { host.back(); onYes(); } }), row({ label: 'Cancel', onClick: () => host.back() }));
    },
  };
}

export function propertyPage(c: Commerce, def: PropertyDef, fromCar = false): Page {
  return {
    title: def.name,
    kicker: `${def.region} · ${def.kind}`,
    render(host) {
      const e = c.eco;
      const owned = e.owns(def.id);
      const b = host.body;
      b.append(info(def.blurb));
      if (!owned) {
        b.append(
          h('div', 'm-balance', kv('Price', money(def.price)), kv('Upkeep', `${money(def.upkeep)} / day`), kv('Garage', def.bays === 'car' ? `${def.slots} cars` : def.bays === 'plane' ? 'Hangar: a plane and a helicopter' : 'Berth: a speedboat'), kv('You have', money(e.worth))),
          row({
            label: 'Buy this property', sub: 'Paid from cash, then your bank account', right: money(def.price), disabled: e.worth < def.price,
            onClick: () => {
              if (!e.buyProperty(def.id)) return;
              c.spawnPropCrafts(def.id);
              c.refreshMarkers();
              host.toast(`${def.name} is yours`);
              void c.save(c.slot ?? 1, true);
              host.refresh();
            },
          }),
        );
        return;
      }
      b.append(h('div', 'm-balance', kv('Upkeep', `${money(def.upkeep)} / day`), kv('Status', owned.overdue > 0 ? `Overdue ${owned.overdue} day(s)` : 'Paid up'), kv('Home', e.p.home === def.id ? 'Yes — you respawn here' : 'No')));
      b.append(
        section('Rest and save'),
        row({ label: 'Save game', sub: c.slot ? `Slot ${c.slot}` : 'Pick a slot', onClick: () => (c.slot ? void c.save(c.slot).then(() => host.refresh()) : host.push(savePage(c))) }),
        row({ label: 'Choose save slot…', onClick: () => host.push(savePage(c)) }),
        row({
          label: 'Sleep until morning', sub: 'Restores health, starts a new day (06:00)',
          onClick: () => {
            c.game.combat?.vitals.heal(100);
            c.skipTo(6);
            host.toast('You slept well.');
            void c.save(c.slot ?? 1, true);
            host.close();
          },
        }),
        section('Home'),
        row({ label: 'Wardrobe', sub: 'Change into anything you own', onClick: () => host.push(outfitPage(c, 'wardrobe', 'Wardrobe')) }),
        def.bays === 'car'
          ? row({ label: 'Garage', sub: `${e.stored(def.id).length} / ${def.slots} stored`, onClick: () => host.push(garagePage(c, def, fromCar)) })
          : info(def.bays === 'plane' ? 'Your Skylark and Sparrow are parked on the apron outside.' : 'Your Marlin speedboat is moored near the boat house.'),
        row({ label: 'Make this my home', sub: 'You wake up here after being Wasted or Busted', disabled: e.p.home === def.id, onClick: () => { e.p.home = def.id; host.refresh(); } }),
        section('Ownership'),
        row({ label: 'Sell property', sub: `Get ${money(Math.floor(def.price * 0.7))} back`, onClick: () => host.push(confirmPage('Sell property', `Sell ${def.name} for ${money(Math.floor(def.price * 0.7))}? Cars parked there will be left outside.`, 'Sell it', () => { e.sellProperty(def.id); c.refreshMarkers(); host.close(); })) }),
      );
    },
  };
}

// ============================================================================================================ garage

export function garagePage(c: Commerce, def: PropertyDef, fromCar: boolean): Page {
  return {
    title: `${def.name} — Garage`,
    kicker: `${c.eco.stored(def.id).length} / ${def.slots} cars`,
    render(host) {
      const e = c.eco;
      const g = c.game;
      const list = e.stored(def.id);
      const here = g.driving?.mode === 'driving' ? g.driving.vehicle : null;
      if (here?.ownedUid && list.length < def.slots) {
        const o = e.vehicle(here.ownedUid);
        if (o) {
          const fee = e.repairCost(o, here.health);
          host.body.append(row({
            label: `Store ${VEHICLES[o.spec]!.name}`, sub: fee > 0 ? `Includes repairs: ${money(fee)}` : 'Fully repaired on storing', right: fee > 0 ? money(fee) : 'Free', disabled: !e.canAfford(fee) && e.worth < fee,
            onClick: () => {
              if (!e.charge(fee, 'Repairs')) return;
              c.sync();
              g.driving?.abort();
              g.vehicles?.remove(here);
              o.where = { kind: 'stored', prop: def.id };
              host.toast(`${VEHICLES[o.spec]!.name} stored`);
              void c.save(c.slot ?? 1, true);
              host.close();
            },
          }));
        }
      } else if (!here?.ownedUid && fromCar) host.body.append(info('This car is not registered to you: register it at Redline Customs to store it.'));
      if (!list.length) host.body.append(info('Nothing parked here. Buy a car at Valeria Motors and it is delivered to your garage.'));
      for (const o of list) {
        const sp = VEHICLES[o.spec]!;
        if (o.where.kind === 'destroyed') {
          const fee = e.insuranceFee(o);
          host.body.append(row({
            label: `${sp.name} · ${o.custom.plate}`, badge: 'Written off', sub: 'Insurance claim: delivered repaired', right: money(fee), disabled: e.worth < fee,
            onClick: () => { if (!e.charge(fee, 'Insurance excess')) return; o.where = { kind: 'stored', prop: def.id }; host.toast('Claim paid: your car is back in the garage'); host.refresh(); },
          }));
          continue;
        }
        host.body.append(
          row({
            label: `${sp.name} · ${o.custom.plate}`, swatch: o.custom.color, sub: `${o.custom.finish} · worth ${money(o.value)}`, right: 'Take out',
            onClick: () => {
              const s = c.garageSpot(def.id);
              c.spawnOwned(o, s.x, s.z, s.yaw);
              host.toast(`${sp.name} is waiting outside`);
              host.close();
            },
          }),
        );
      }
      if (list.length) host.body.append(section('Sell'), ...list.filter((o) => o.where.kind === 'stored').map((o) => row({
        label: `Sell ${VEHICLES[o.spec]!.name}`, sub: `${money(Math.floor(o.value * 0.55))} · at 55% of what you paid`,
        onClick: () => host.push(confirmPage('Sell vehicle', `Sell your ${VEHICLES[o.spec]!.name} for ${money(Math.floor(o.value * 0.55))}?`, 'Sell it', () => { e.sellVehicle(o.uid); host.refresh(); })),
      })));
    },
  };
}

// ============================================================================================================ outfits

type OutfitMode = 'wardrobe' | 'clothing' | 'barber';

export function outfitPage(c: Commerce, mode: OutfitMode, title: string): Page {
  return {
    title,
    kicker: mode === 'wardrobe' ? 'Everything you own' : mode === 'clothing' ? 'Try it on, buy it, wear it' : 'Pay per service',
    hints: 'Esc / B  done',
    render(host) {
      const e = c.eco;
      const o = e.p.outfit;
      const body = host.body;
      const left = h('div', 'm-col');
      const right = h('div', 'm-aside', avatar(o));
      body.classList.add('two');
      body.append(left, right);

      const items = <T,>(secTitle: string, list: ClothingItem<T>[], cur: () => boolean | ((it: ClothingItem<T>) => boolean), set: (it: ClothingItem<T>) => void, free = false): void => {
        left.append(section(secTitle));
        for (const it of list) {
          const have = free || e.p.clothes.includes(it.id) || it.price === 0;
          if (mode === 'wardrobe' && !have) continue;
          const isCur = typeof cur === 'function' ? (cur as (it: ClothingItem<T>) => boolean)(it) : false;
          const swatch = typeof it.value === 'string' && (it.value as string).startsWith('#') ? (it.value as string) : undefined;
          left.append(row({
            label: it.name, swatch, selected: isCur, badge: isCur ? 'Wearing' : have ? 'Owned' : '', right: have ? '' : money(it.price), disabled: !have && !e.canAfford(it.price),
            onClick: () => {
              if (!have) { if (!e.spend(it.price, `Bought ${it.name}`)) return; e.p.clothes.push(it.id); }
              set(it);
              c.applyOutfit();
              host.refresh();
            },
          }));
        }
      };

      if (mode !== 'barber') {
        items('Tops', TOPS, () => (it: ClothingItem) => o.top === it.value, (it) => { o.top = it.value; });
        items('Gloves', GLOVES, () => (it: ClothingItem<string>) => o.gloves === it.value, (it) => { o.gloves = it.value as typeof o.gloves; });
        left.append(section('Glasses'), row({
          label: o.glasses ? 'Take glasses off' : 'Put sunglasses on', right: e.p.clothes.includes('glasses') || mode === 'wardrobe' ? '' : money(85), disabled: mode === 'wardrobe' && !e.p.clothes.includes('glasses'),
          onClick: () => {
            if (!o.glasses && !e.p.clothes.includes('glasses')) { if (!e.spend(85, 'Sunglasses')) return; e.p.clothes.push('glasses'); }
            o.glasses = !o.glasses; c.applyOutfit(); host.refresh();
          },
        }));
      }
      if (mode !== 'clothing') {
        items('Hair style', HAIR_STYLES, () => (it: ClothingItem) => o.hairStyle === it.value, (it) => { o.hairStyle = it.value as typeof o.hairStyle; });
        items('Hair colour', HAIR_COLORS, () => (it: ClothingItem) => o.hair === it.value, (it) => { o.hair = it.value; });
      }
      if (mode === 'wardrobe') items('Skin tone', SKINS, () => (it: ClothingItem) => o.skin === it.value, (it) => { o.skin = it.value; }, true);
    },
    onClose: () => { void c.save(c.slot ?? 1, true); },
  };
}

export const clothingShop = (c: Commerce, name: string): Page => outfitPage(c, 'clothing', name);
export const barberShop = (c: Commerce, name: string): Page => outfitPage(c, 'barber', name);

// ============================================================================================================ weapons and food

export function weaponShop(c: Commerce, name: string): Page {
  return {
    title: name,
    kicker: 'Weapons and gear',
    render(host) {
      const e = c.eco;
      const w = c.game.weapon!;
      const b = host.body;
      b.append(section('Weapons'));
      for (const sw of SHOP_WEAPONS) {
        const def = WEAPONS[sw.id];
        const have = e.p.weapons[sw.id].owned;
        const st = e.p.weapons[sw.id];
        b.append(row({
          label: def.name, sub: def.blurb, badge: have ? 'Owned' : '', right: have ? '' : money(sw.price), disabled: !have && !e.canAfford(sw.price),
          onClick: () => {
            if (have) return;
            if (!e.spend(sw.price, `Bought ${def.name}`)) return;
            st.owned = true; st.ammo = def.mag; st.reserve = sw.ammoPack * 2;
            w.inv[sw.id].owned = true; w.inv[sw.id].ammo = st.ammo; w.inv[sw.id].reserve = st.reserve;
            host.refresh();
          },
        }));
        if (!have) continue;
        const cur = w.def.id === sw.id;
        const reserve = cur ? w.reserve : w.inv[sw.id].reserve;
        b.append(row({
          label: `${def.name} ammunition`, sub: `${reserve} / ${def.reserveMax} spare rounds`, right: `${sw.ammoPack} rounds · ${money(sw.ammoPrice)}`, disabled: reserve >= def.reserveMax || !e.canAfford(sw.ammoPrice),
          onClick: () => {
            if (!e.spend(sw.ammoPrice, 'Ammunition')) return;
            const add = Math.min(sw.ammoPack, def.reserveMax - reserve);
            if (cur) w.reserve += add; else w.inv[sw.id].reserve += add;
            st.reserve = (cur ? w.reserve : w.inv[sw.id].reserve);
            host.refresh();
          },
        }));
        const kit = e.p.kits[sw.id];
        for (const key of ['ext', 'supp', 'scope'] as const) {
          const price = ATTACHMENTS[key].price[sw.id];
          if (price <= 0) continue;
          b.append(row({
            label: `${def.name}: ${ATTACHMENTS[key].name}`, sub: ATTACHMENTS[key].blurb, badge: kit[key] ? 'Fitted' : '', right: kit[key] ? '' : money(price), disabled: !kit[key] && !e.canAfford(price),
            onClick: () => { if (kit[key]) return; if (!e.spend(price, ATTACHMENTS[key].name)) return; kit[key] = true; c.applyKits(); host.refresh(); },
          }));
        }
        b.append(h('div', 'm-sub-label', `${def.name} finish`), swatches(WEAPON_TINTS.map((t) => ({ name: t.name, value: t.value, price: t.price })), kit.tint, (i) => {
          const t = WEAPON_TINTS[i]!;
          const owned = e.p.clothes.includes(t.id) || t.price === 0;
          if (!owned) { if (!e.spend(t.price, `${t.name} finish`)) return; e.p.clothes.push(t.id); }
          kit.tint = t.value; c.applyKits(); host.refresh();
        }, (i) => e.p.clothes.includes(WEAPON_TINTS[i]!.id)));
      }
      b.append(section('Supplies'));
      for (const s of SUPPLIES) {
        b.append(row({
          label: s.name, sub: s.blurb, right: money(s.price), disabled: !e.canAfford(s.price),
          onClick: () => {
            if (!e.spend(s.price, s.name)) return;
            if (s.id === 'medkit') c.game.combat?.vitals.heal(100); else c.game.combat?.vitals.addArmour(100);
            host.toast(`${s.name} used`);
            host.refresh();
          },
        }));
      }
    },
    onClose: () => { void c.save(c.slot ?? 1, true); },
  };
}

export function foodShop(c: Commerce, name: string): Page {
  return {
    title: name,
    kicker: 'Eat in',
    render(host) {
      for (const f of FOOD) {
        host.body.append(row({
          label: f.name, sub: `Restores ${f.heal} health`, right: money(f.price), disabled: !c.eco.canAfford(f.price),
          onClick: () => { if (!c.eco.spend(f.price, f.name)) return; c.game.combat?.vitals.heal(f.heal); c.game.audio.mech('cloth'); host.toast(`Mmm. ${f.name}.`); host.refresh(); },
        }));
      }
    },
  };
}

// ============================================================================================================ showroom

const bar = (v: number): HTMLElement => { const i = h('i'); i.style.width = `${Math.round(Math.max(0.04, Math.min(1, v)) * 100)}%`; return h('div', 'm-bar', i); };

function statRows(sp: VehicleSpec): HTMLElement {
  const top = sp.engine.topSpeedKmh / 330;
  const power = (sp.engine.peakTorque / sp.mass) / 0.52;
  const brake = (sp.brake.force / sp.mass) / 16;
  const grip = (sp.grip.lat * sp.grip.stiffness) / 16.5;
  const mk = (l: string, v: number): HTMLElement => h('div', 'm-stat', h('span', '', l), bar(v));
  return h('div', 'm-stats', mk('Top speed', top), mk('Acceleration', power), mk('Braking', brake), mk('Handling', grip));
}

export function openShowroom(c: Commerce, pt: Point): void {
  const g = c.game;
  const vm = g.vehicles!;
  const stage = c.points.find(pt.x + 8, pt.z + 8, 4.4, { walkOnly: false, maxR: 60 });
  const dx = stage.x - pt.x, dz = stage.z - pt.z;
  const yaw = Math.atan2(-dx, -dz) + Math.PI * 0.75;
  let idx = 0;
  let color: string | null = null;
  let display: Vehicle | null = null;
  const show = (): void => {
    if (display) vm.remove(display);
    display = vm.spawn(SHOWROOM[idx]!, stage.x, stage.z, yaw, undefined);
    if (color) vm.visualOf(display)?.applyCustom?.({ ...c.defaultCustomFor(display.spec.id), color });
    else color = null;
  };
  show();
  c.setOrbit({ target: () => (display ? display.position : null), r: 7.2, yaw: 0.7, pitch: 0.18, spin: true, height: 0.5 });
  let started = false;
  const page: Page = {
    title: 'Valeria Motors',
    kicker: 'Showroom',
    layout: 'side',
    hints: '‹ › browse · Esc / B  leave',
    render(host) {
      const sp = display!.spec;
      const price = sp.price;
      const e = c.eco;
      host.body.append(
        stepper('Model', sp.name, money(price), () => { idx = (idx + SHOWROOM.length - 1) % SHOWROOM.length; color = null; show(); host.refresh(); }, () => { idx = (idx + 1) % SHOWROOM.length; color = null; show(); host.refresh(); }),
        statRows(sp),
        h('div', 'm-sub-label', 'Paint'),
        swatches(PAINTS.slice(0, 18), color ?? sp.body.color, (i) => { color = PAINTS[i]!.value; vm.visualOf(display!)?.applyCustom?.({ ...c.defaultCustomFor(sp.id), color: color! }); host.refresh(); }),
        row({
          label: `Buy ${sp.name}`, sub: 'Delivered to your garage, or to the curb outside if you have none', right: money(price), disabled: e.worth < price,
          onClick: () => {
            if (!e.charge(price, `Bought ${sp.name}`)) return;
            const custom = { ...c.defaultCustomFor(sp.id), color: color ?? sp.body.color };
            const home = e.p.props.map((p) => PROPERTY_BY_ID[p.id]!).find((d) => d.bays === 'car' && e.stored(d.id).length < d.slots);
            const o = e.addVehicle(sp.id, custom, price, home?.id ?? null, { x: stage.x, z: stage.z, yaw });
            if (display) { vm.remove(display); display = null; }
            if (home) host.toast(`${sp.name} delivered to ${home.name}`);
            else { c.spawnOwned(o, stage.x, stage.z, yaw); host.toast(`${sp.name} is yours: it's parked outside`); }
            started = true;
            void c.save(c.slot ?? 1, true);
            host.close();
          },
        }),
        row({
          label: 'Test drive', sub: 'Two minutes, return it to the showroom', onClick: () => {
            const v = display!;
            display = null;
            started = true;
            c.startTest(v, pt.ref, { x: pt.x, z: pt.z, yaw: 0 });
            host.close();
            g.driving?.forceEnter?.(v);
          },
        }),
      );
    },
    onClose: () => { if (!started && display) { vm.remove(display); display = null; } },
  };
  c.open(page);
}

// ============================================================================================================ tuning

const sameCustom = (a: VehicleCustom, b: VehicleCustom): boolean => JSON.stringify(a) === JSON.stringify(b);

export function tuneCost(base: VehicleCustom, d: VehicleCustom, value: number): number {
  let n = 0;
  if (d.color !== base.color || d.accent !== base.accent) n += 250;
  if (d.finish !== base.finish) n += FINISHES.find((f) => f.id === d.finish)!.price;
  if (d.rim !== base.rim) n += RIMS.find((r) => r.value === d.rim)?.price ?? 400;
  if (d.tint !== base.tint) n += TINTS[d.tint]!.price;
  if (d.spoiler !== base.spoiler) n += SPOILERS[d.spoiler]!.price;
  if (d.neon !== base.neon) n += NEONS.find((x) => x.value === d.neon)?.price ?? 1200;
  if (d.plate !== base.plate) n += 180;
  for (const k of ['engine', 'brakes', 'suspension'] as const) {
    for (let t = base.perf[k] + 1; t <= d.perf[k]; t++) n += Math.max(500, Math.round(value * PERF_COST[k][t - 1]!));
  }
  if (d.perf.turbo && !base.perf.turbo) n += Math.max(900, Math.round(value * PERF_COST.turbo));
  if (d.runflat && !base.runflat) n += RUNFLAT_PRICE;
  if (d.armour && !base.armour) n += ARMOUR_PRICE;
  return n;
}

export function openTuning(c: Commerce, _pt: Point): void {
  const g = c.game;
  const v = g.driving?.mode === 'driving' ? g.driving.vehicle : null;
  if (!v) { g.ui.toast('Drive a car into the bay first'); return; }
  const e = c.eco;
  const vm = g.vehicles!;

  const start = (owned: OwnedVehicle): void => {
    const base: VehicleCustom = structuredClone(owned.custom);
    const draft: VehicleCustom = structuredClone(owned.custom);
    const vehicle = c.worldVehicle(owned.uid) ?? v;
    c.setOrbit({ target: () => vehicle.position, r: 6.8, yaw: 0.9, pitch: 0.16, spin: false, height: 0.55 });
    let committed = false;
    const preview = (): void => { vm.recustom(vehicle, draft); };
    const cost = (): number => tuneCost(base, draft, owned.value);
    const cat = (title: string, build: (host: import('../ui/Modal').PageHost) => void): Page => ({
      title, layout: 'side', hints: 'Esc / B  back', render: (host) => { build(host); host.body.append(h('div', 'm-total', `Changes: ${money(cost())}`)); },
    });
    const paint = cat('Paint', (host) => {
      host.body.append(
        h('div', 'm-sub-label', 'Body colour'), swatches(PAINTS, draft.color, (i) => { draft.color = PAINTS[i]!.value; preview(); host.refresh(); }),
        h('div', 'm-sub-label', 'Trim and accents'), swatches(PAINTS, draft.accent, (i) => { draft.accent = PAINTS[i]!.value; preview(); host.refresh(); }),
        section('Finish'),
        ...FINISHES.map((f) => row({ label: f.name, selected: draft.finish === f.id, right: f.price && base.finish !== f.id ? money(f.price) : '', onClick: () => { draft.finish = f.id; preview(); host.refresh(); } })),
      );
    });
    const wheels = cat('Wheels', (host) => {
      host.body.append(h('div', 'm-sub-label', 'Rim colour'), swatches(RIMS.map((r) => ({ name: r.name, value: r.value, price: r.price })), draft.rim, (i) => { draft.rim = RIMS[i]!.value; preview(); host.refresh(); }));
    });
    const glass = cat('Glass', (host) => {
      host.body.append(...TINTS.map((t, i) => row({ label: t.name, selected: draft.tint === i, right: t.price && base.tint !== i ? money(t.price) : '', onClick: () => { draft.tint = i; preview(); host.refresh(); } })));
    });
    const body = cat('Body', (host) => {
      host.body.append(section('Spoiler'), ...SPOILERS.map((s, i) => row({ label: s.name, selected: draft.spoiler === i, right: s.price && base.spoiler !== i ? money(s.price) : '', onClick: () => { draft.spoiler = i as 0 | 1 | 2; preview(); host.refresh(); } })),
        section('Underglow'), ...NEONS.map((n) => row({ label: n.name, swatch: n.value ?? undefined, selected: draft.neon === n.value, right: n.price && base.neon !== n.value ? money(n.price) : '', onClick: () => { draft.neon = n.value; preview(); host.refresh(); } })));
    });
    const plates = cat('Plates', (host) => {
      const input = h('input', 'm-input');
      input.type = 'text'; input.maxLength = 7; input.value = draft.plate; input.spellcheck = false;
      input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ''); draft.plate = input.value || base.plate; preview(); });
      input.addEventListener('keydown', (ev) => ev.stopPropagation());
      host.body.append(info('Up to seven characters. Fitting new plates costs $180.'), input);
    });
    const perf = cat('Performance', (host) => {
      for (const k of ['engine', 'brakes', 'suspension'] as const) {
        host.body.append(section(k === 'engine' ? 'Engine' : k === 'brakes' ? 'Brakes' : 'Suspension'));
        for (let t = 0; t <= 3; t++) {
          const p = t > base.perf[k] ? Math.max(500, Math.round(owned.value * PERF_COST[k][t - 1]!)) : 0;
          host.body.append(row({ label: PERF_NAMES[k][t]!, selected: draft.perf[k] === t, right: p ? money(p) : '', disabled: t < base.perf[k], onClick: () => { draft.perf[k] = t; host.refresh(); } }));
        }
      }
      host.body.append(section('Turbo'), row({ label: draft.perf.turbo ? 'Turbocharger fitted' : 'Fit turbocharger', selected: draft.perf.turbo, right: base.perf.turbo ? '' : money(Math.max(900, Math.round(owned.value * PERF_COST.turbo))), disabled: base.perf.turbo, onClick: () => { draft.perf.turbo = !draft.perf.turbo; host.refresh(); } }),
        info('Performance parts are fitted when you pay: the car is rebuilt and left outside the bay.'));
    });
    const protect = cat('Protection', (host) => {
      host.body.append(
        row({ label: 'Run-flat tyres', sub: 'Immune to spike strips', selected: draft.runflat, right: base.runflat ? '' : money(RUNFLAT_PRICE), disabled: base.runflat, onClick: () => { draft.runflat = !draft.runflat; host.refresh(); } }),
        row({ label: 'Bulletproof plating', sub: 'Bullets do far less damage to the car and you', selected: draft.armour, right: base.armour ? '' : money(ARMOUR_PRICE), disabled: base.armour, onClick: () => { draft.armour = !draft.armour; host.refresh(); } }),
      );
    });
    const root: Page = {
      title: VEHICLES[owned.spec]!.name, kicker: `Redline Customs · ${owned.custom.plate}`, layout: 'side', hints: 'Esc / B  cancel',
      render(host) {
        const b = host.body;
        b.append(
          row({ label: 'Paint and finish', onClick: () => host.push(paint) }), row({ label: 'Wheels', onClick: () => host.push(wheels) }), row({ label: 'Glass', onClick: () => host.push(glass) }),
          row({ label: 'Body and lights', onClick: () => host.push(body) }), row({ label: 'Plates', onClick: () => host.push(plates) }), row({ label: 'Performance', onClick: () => host.push(perf) }), row({ label: 'Protection', onClick: () => host.push(protect) }),
          h('div', 'm-total', cost() > 0 ? `Total: ${money(cost())}` : 'No changes'),
          row({
            label: cost() > 0 ? `Pay ${money(cost())} and apply` : 'Apply', disabled: sameCustom(base, draft) || e.worth < cost(),
            onClick: () => {
              if (!e.charge(cost(), 'Vehicle work')) return;
              const perfChanged = JSON.stringify(base.perf) !== JSON.stringify(draft.perf);
              owned.custom = structuredClone(draft);
              owned.value += Math.round(cost() * 0.5);
              committed = true;
              if (perfChanged) {
                const f = new THREE.Vector3(0, 0, -1).applyQuaternion(vehicle.quaternion);
                const x = vehicle.position.x, z = vehicle.position.z, yaw = Math.atan2(-f.x, -f.z);
                g.driving?.abort();
                vm.remove(vehicle);
                c.spawnOwned(owned, x, z, yaw);
                host.toast('Work done: your car is waiting outside the bay');
              } else host.toast('Work done');
              void c.save(c.slot ?? 1, true);
              host.close();
            },
          }),
          row({ label: 'Cancel', onClick: () => host.close() }),
        );
      },
      onClose: () => { if (!committed) vm.recustom(vehicle, base); },
    };
    c.open(root);
  };

  if (v.ownedUid) { const o = e.vehicle(v.ownedUid); if (o) { start(o); return; } }
  // a car off the street: register it first
  const fee = Math.round(v.spec.price * 0.25);
  c.open({
    title: v.spec.name, kicker: 'Redline Customs', layout: 'side',
    render(host) {
      host.body.append(
        info('Only cars registered to you can be modified or stored. We can put this one in your name: new title, plates and paperwork.'),
        row({
          label: `Register to me`, right: money(fee), disabled: e.worth < fee,
          onClick: () => {
            if (!e.charge(fee, 'Registration')) return;
            const f = new THREE.Vector3(0, 0, -1).applyQuaternion(v.quaternion);
            const o = e.addVehicle(v.spec.id, c.defaultCustomFor(v.spec.id), Math.round(v.spec.price * 0.6), null, { x: v.position.x, z: v.position.z, yaw: Math.atan2(-f.x, -f.z) });
            v.ownedUid = o.uid; v.custom = o.custom;
            host.back();
            start(o);
          },
        }),
        row({ label: 'Not now', onClick: () => host.close() }),
      );
    },
  });
}

// ============================================================================================================ saves

export function savePage(c: Commerce): Page {
  return {
    title: 'Save game',
    hideMoney: true,
    render(host) {
      const wrap = h('div', 'slots');
      host.body.append(wrap);
      const refresh = mountSlots(c, wrap, undefined, () => host.back());
      refresh();
    },
  };
}

/** The three slot cards: Play / New on the title screen; Save / Load in the pause menu. */
export function mountSlots(c: Commerce, host: HTMLElement, onStart?: (slot: number, data: SaveData | null) => void, done?: () => void): () => void {
  const wrap = h('div', 'slots');
  host.append(wrap);
  const file = h('input');
  file.type = 'file'; file.accept = 'application/json,.json'; file.hidden = true;
  host.append(file);
  let importSlot = 1;
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    const data = await c.store.parseFile(f);
    if (!data) { c.game.ui.toast('That is not a Vice Coast save file'); return; }
    await c.store.write(importSlot, data);
    c.game.ui.toast(`Imported into slot ${importSlot}`);
    void refresh();
  });

  const refresh = async (): Promise<void> => {
    const list = await c.slots();
    wrap.textContent = '';
    for (const s of list) {
      const title = h('div', 'slot-head', h('b', '', `Slot ${s.slot}`), s.empty ? h('span', 'muted', 'Empty') : h('span', 'muted', `${ago(s.savedAt)}`));
      const detail = s.empty
        ? h('div', 'slot-body muted', 'No game saved here yet.')
        : h('div', 'slot-body', h('div', '', s.label), h('div', 'muted', `${money(s.cash)} cash · ${money(s.bank)} bank · ${s.props} properties · ${s.cars} cars · ${clock(s.playSeconds)} played`));
      const actions = h('div', 'slot-actions');
      const play = onStart
        ? btn(s.empty ? 'New game' : 'Continue', 'primary', async () => { const d = s.empty ? null : await c.store.read(s.slot); onStart(s.slot, d); })
        : btn('Save here', 'primary', async () => { if (await c.save(s.slot)) { await refresh(); done?.(); } });
      actions.append(play);
      if (!onStart && !s.empty) actions.append(btn('Load', '', async () => { const d = await c.store.read(s.slot); if (d) { c.begin(s.slot, d); c.game.resume(); c.game.ui.toast(`Loaded slot ${s.slot}`); } }));
      if (onStart && !s.empty) actions.append(btn('New game', '', () => { void c.store.remove(s.slot).then(() => onStart(s.slot, null)); }));
      if (!s.empty) {
        actions.append(btn('Export', '', async () => { const d = await c.store.read(s.slot); if (d) c.store.export(d, s.slot); }));
        actions.append(btn('Delete', 'danger', async () => { await c.store.remove(s.slot); await refresh(); }));
      }
      actions.append(btn('Import', '', () => { importSlot = s.slot; file.click(); }));
      wrap.append(h('div', 'slot-card', title, detail, actions));
    }
    const first = wrap.querySelector<HTMLElement>('.btn');
    if (first && !host.contains(document.activeElement) && host.isConnected && host.offsetParent !== null) first.focus({ preventScroll: true });
  };
  void refresh();
  return () => { void refresh(); };
}
