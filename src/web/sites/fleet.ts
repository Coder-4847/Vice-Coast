import { h } from '../../ui/dom';
import { money } from '../../economy/Economy';
import { CRAFT_FOR_SALE, CRAFT_SHOP, PROPERTY_BY_ID, type CraftForSale } from '../../economy/catalog';
import { CRAFT } from '../../craft/specs';
import type { OwnedCraft } from '../../economy/types';
import type { Site, WebCtx } from '../Browser';
import { button, craftArt, div } from '../ui';
import { card, frame, kv, p, section } from './common';

/** Paint and berth picked on a listing, kept between refreshes. */
const pick: Record<string, { paint?: number; berth?: string }> = {};

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const kindLabel = (k: string): string => ({ boat: 'Boat', heli: 'Helicopter', plane: 'Plane', ground: 'Armour' } as Record<string, string>)[k] ?? k;
const DELIVERY = 2500;

/** Where a delivered armoured vehicle is left: open ground ahead of you (outside, if you are in a building). */
function groundDrop(ctx: WebCtx): { x: number; z: number; yaw: number } {
  const g = ctx.g, pl = g.player!;
  const out = g.interiors?.outside();
  const x = out ? out.x : pl.pos.x, z = out ? out.z : pl.pos.z, yaw = out ? out.yaw : pl.yaw;
  const s = ctx.c.points.find(x - Math.sin(yaw) * 18, z - Math.cos(yaw) * 18, 6.5, { walkOnly: false, maxR: 120 });
  return { x: s.x, z: s.z, yaw };
}

function buy(ctx: WebCtx, f: CraftForSale, paint: number, berth: string | null, seller: string): void {
  const c = ctx.c, e = c.eco, spec = CRAFT[f.id]!;
  const ground = spec.kind === 'ground';
  if (!ground && !berth) { ctx.toast('You need a free berth for it'); return; }
  if (!e.charge(f.price, `Bought ${spec.name}`)) { ctx.toast('Not enough money'); return; }
  const o: OwnedCraft = { uid: `c${e.p.seq++}`, spec: f.id, paint, berth: ground ? 'call' : berth!, value: f.price };
  e.p.crafts.push(o);
  if (ground) {
    const at = groundDrop(ctx);
    const craft = ctx.g.crafts?.spawn(f.id, at.x, at.z, at.yaw, { paint });
    if (craft) c.ownedCrafts.set(o.uid, craft);
    ctx.toast(`${spec.name} delivered: it's parked nearby`);
  } else {
    c.spawnOwnedCrafts();
    ctx.toast(`${spec.name} is waiting at ${PROPERTY_BY_ID[berth!]!.name}`);
  }
  e.message(seller, `Your ${spec.name} ${ground ? 'has been dropped off near you. Try not to park it on anyone.' : `is at ${PROPERTY_BY_ID[berth!]!.name}. Fuelled and ready.`}`);
  if (spec.kind === 'plane' || spec.kind === 'heli') ctx.s?.market.event('AERO', 0.005);
  ctx.g.audio.uiBlip('ok');
  void c.save(c.slot ?? 1, true);
  ctx.refresh();
}

function catalogue(ctx: WebCtx, shop: CraftForSale["shop"], host: string, filter: string): (HTMLElement | null)[] {
  const list = CRAFT_SHOP.filter((f) => f.shop === shop && (!filter || CRAFT[f.id]!.kind === filter));
  const kinds = [...new Set(CRAFT_SHOP.filter((f) => f.shop === shop).map((f) => CRAFT[f.id]!.kind))];
  return [
    kinds.length > 1 ? div('w-tabs', button('All', () => ctx.go(host), `w-tab${!filter ? ' on' : ''}`), ...kinds.map((k) => button(kindLabel(k) + 's', () => ctx.go(`${host}?kind=${k}`), `w-tab${filter === k ? ' on' : ''}`))) : null,
    div('w-cards', ...list.map((f) => {
      const sp = CRAFT[f.id]!;
      return button(div('w-carcard', craftArt(f.id, sp.kind, hex(f.paints?.[0] ?? sp.paints[0] ?? 0xe8e8e8)), h('b', '', sp.name), h('span', 'muted', `${kindLabel(sp.kind)} · ${f.speed} km/h · ${f.seats} seat${f.seats === 1 ? '' : 's'}`), h('span', 'w-price', money(f.price))), () => ctx.go(`${host}/item/${f.id}`), 'w-cardbtn');
    })),
  ];
}

function item(ctx: WebCtx, id: string, host: string, seller: string): HTMLElement[] {
  const f = CRAFT_FOR_SALE[id], sp = CRAFT[id];
  if (!f || !sp) return [p('Not in the catalogue.')];
  const c = ctx.c, e = c.eco;
  const ground = sp.kind === 'ground';
  const paints = f.paints ?? sp.paints;
  const st = (pick[id] ??= {});
  const paint = st.paint ?? paints[0]!;
  const berths = ground ? [] : c.berthsFor(sp.kind);
  const usable = berths.filter((b) => b.free > 0);
  const berth = usable.find((b) => b.id === st.berth)?.id ?? usable[0]?.id ?? null;
  const needs = sp.kind === 'boat' ? 'a boat berth (Dusk Harbor Boat House or Costa Merida Marina)' : 'a hangar (Valeria Hangar 3 or Cinder Flats Hangar)';
  return [
    button('‹ Back to the catalogue', () => ctx.go(host), 'w-link'),
    div('w-product',
      div('w-product-art', craftArt(id, sp.kind, hex(paint), 480, 220)),
      div('w-product-info',
        h('div', 'w-kicker', kindLabel(sp.kind)), h('h1', '', sp.name), h('div', 'w-big', money(f.price)),
        p(f.blurb),
        kv('Top speed', `${f.speed} km/h`), kv('Seats', String(f.seats)), kv('Weight', `${(sp.mass / 1000).toFixed(1)} t`),
        sp.weapons ? kv('Armament', sp.weapons.name) : sp.ground ? kv('Armament', sp.ground.cannon ? 'Cannon and machine gun' : 'Machine gun') : null,
        h('div', 'w-sub-label', 'Paint'),
        div('w-swatches', ...paints.map((n) => { const b = button('', () => { st.paint = n; ctx.refresh(); }, `w-swatch${n === paint ? ' on' : ''}`); b.style.background = hex(n); return b; })),
        ground ? p('Delivered by low-loader to open ground near you. Call it again any time from "My fleet" for a fee.', 'muted small')
          : berths.length ? div('', h('div', 'w-sub-label', 'Deliver to'), div('w-tabs', ...berths.map((b) => button(`${b.name} (${b.free} free)`, () => { st.berth = b.id; ctx.refresh(); }, `w-tab${b.id === berth ? ' on' : ''}`, b.free <= 0))))
            : p(`You need ${needs} to keep one. Buy one on Keystone Realty.`, 'w-warn'),
        !ground && !berths.length ? button('Find a berth at Keystone Realty ›', () => ctx.go('keystone.vc'), 'w-link') : null,
        button(`Buy now · ${money(f.price)}`, () => buy(ctx, f, paint, berth, seller), 'w-btn primary big', e.worth < f.price || (!ground && !berth)),
      ),
    ),
  ];
}

/** Everything you own that floats, flies or has tracks, with services. */
function fleet(ctx: WebCtx, shop: CraftForSale['shop'] | null): HTMLElement[] {
  const c = ctx.c, e = c.eco;
  const mine = e.p.crafts.filter((o) => !shop || CRAFT_FOR_SALE[o.spec]?.shop === shop);
  if (!mine.length) return [p('You do not own anything from this dealer yet.', 'muted')];
  return [div('w-list', ...mine.map((o) => {
    const sp = CRAFT[o.spec]!;
    const craft = c.ownedCrafts.get(o.uid) ?? null;
    const wrecked = !!craft?.exploded;
    const where = o.berth === 'call' ? (craft ? 'Out in the world' : 'In storage') : PROPERTY_BY_ID[o.berth]?.name ?? 'Unknown';
    const fee = Math.round(Math.max(800, o.value * 0.02));
    const sell = Math.round(o.value * 0.6);
    return div('w-listing',
      craftArt(o.spec, sp.kind, hex(o.paint), 170, 80),
      div('w-listing-info', h('b', '', sp.name), h('span', 'muted', `${where}${wrecked ? ' · wrecked' : craft?.occupied ? ' · in use' : ''}`)),
      div('w-listing-buy',
        craft ? button('Show on map', () => { ctx.g.map.setWaypoint({ x: craft.position.x, z: craft.position.z }); ctx.toast('Waypoint set'); }, 'w-btn sm') : null,
        o.berth === 'call'
          ? button(`Deliver to me · ${money(DELIVERY)}`, () => {
            if (craft?.occupied) { ctx.toast('You are using it'); return; }
            if (!e.charge(DELIVERY, `Delivery: ${sp.name}`)) { ctx.toast('Not enough money'); return; }
            const at = groundDrop(ctx);
            if (craft) craft.teleport(at.x, ctx.g.world.heightAt(at.x, at.z), at.z, at.yaw);
            else { const k = ctx.g.crafts?.spawn(o.spec, at.x, at.z, at.yaw, { paint: o.paint }); if (k) c.ownedCrafts.set(o.uid, k); }
            ctx.toast(`${sp.name} delivered nearby`);
            ctx.refresh();
          }, 'w-btn sm primary', e.worth < DELIVERY)
          : button(`${wrecked ? 'Repair & return' : 'Return to berth'} · ${money(fee)}`, () => {
            if (!craft || !craft.home) return;
            if (craft.occupied) { ctx.toast('You are using it'); return; }
            if (!e.charge(fee, `Recovery: ${sp.name}`)) { ctx.toast('Not enough money'); return; }
            craft.teleport(craft.home.x, craft.home.y, craft.home.z, craft.home.yaw);
            ctx.toast(`${sp.name} is back at ${where}${wrecked ? ', repaired' : ''}`);
            ctx.refresh();
          }, 'w-btn sm', !craft || e.worth < fee),
        button(`Sell · ${money(sell)}`, () => {
          if (craft?.occupied) { ctx.toast('Get out first'); return; }
          if (craft) { ctx.g.crafts?.remove(craft); c.ownedCrafts.delete(o.uid); }
          e.p.crafts = e.p.crafts.filter((x) => x.uid !== o.uid);
          e.earn(sell, `Sold ${sp.name}`);
          e.deposit(sell);
          ctx.toast(`Sold ${sp.name}`);
          void c.save(c.slot ?? 1, true);
          ctx.refresh();
        }, 'w-btn sm danger'),
      ),
    );
  }))];
}

function makeSite(o: { host: string; name: string; logo: Node; tagline: string; color: string; dark?: boolean; shop: CraftForSale['shop']; hero: [string, string, string]; heroCls: string }): Site {
  return {
    host: o.host, name: o.name, tagline: o.tagline, color: o.color, dark: o.dark, category: 'Shopping',
    render(ctx, el) {
      const [a, b] = ctx.path.split('/');
      const main = a === 'item' && b ? item(ctx, b, o.host, o.name) : a === 'fleet' ? [section('My fleet', ...fleet(ctx, null))]
        : [div(`w-hero ${o.heroCls}`, div('', h('div', 'w-kicker', o.hero[0]), h('h1', '', o.hero[1]), p(o.hero[2]))), ...catalogue(ctx, o.shop, o.host, ctx.query.kind ?? ''),
          card(h('h3', '', 'Your fleet'), ...fleet(ctx, o.shop).slice(0, 1), button('Manage everything you own ›', () => ctx.go(`${o.host}/fleet`), 'w-link'))];
      el.append(frame(ctx, { name: o.name, logo: o.logo, tagline: o.tagline }, [['Catalogue', o.host], ['My fleet', 'fleet']], ...main));
    },
  };
}

export const SKYLINE = makeSite({
  host: 'skylineaviation.vc', name: 'Skyline Aviation', logo: h('span', '', '✈ ', h('b', '', 'SKYLINE'), ' Aviation'), tagline: 'Planes & helicopters', color: '#2a7ad8', shop: 'air',
  hero: ['New and pre-owned aircraft', 'Your own wings.', 'Prop planes, helicopters and private jets, delivered fuelled to your hangar.'], heroCls: 'sky',
});
export const BLUEWATER = makeSite({
  host: 'bluewatermarine.vc', name: 'Bluewater Marine', logo: h('span', '', '⚓ ', h('b', '', 'BLUEWATER'), ' Marine'), tagline: 'Boats & yachts', color: '#1a9ab0', shop: 'sea',
  hero: ['Boats for every budget', 'Get out on the water.', 'From a jet ski to a seventeen-metre yacht, delivered to your berth.'], heroCls: 'sea',
});
export const SURPLUS = makeSite({
  host: 'halloransurplus.vc', name: 'Halloran Surplus', logo: h('span', '', '★ ', h('b', '', 'HALLORAN'), ' SURPLUS'), tagline: 'Decommissioned military hardware', color: '#7a8a4a', dark: true, shop: 'mil',
  hero: ['Ex-military · sold as seen', 'Peace dividend, priced to move.', 'Attack helicopters, a fighter jet and armour. Fully working. Paperwork, regrettably, lost.'], heroCls: 'mil',
});
