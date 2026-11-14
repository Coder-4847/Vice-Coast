import { h } from '../../ui/dom';
import { money } from '../../economy/Economy';
import { ATTACHMENTS, PROPERTY_BY_ID, SHOP_WEAPONS, SUPPLIES } from '../../economy/catalog';
import { dropLabel } from '../../economy/Deliveries';
import type { CartLine, DropKind } from '../../economy/types';
import { WEAPONS, type WeaponId } from '../../player/Weapons';
import type { Site, WebCtx } from '../Browser';
import { button, div, gunArt } from '../ui';
import { card, frame, kv, p, pick, rnd, section } from './common';

/** Only the black market sells these. */
const RESTRICTED = new Set<WeaponId>(['rpg', 'laser', 'sticky']);
const CATS: [string, string][] = [['pistol', 'Pistols'], ['smg', 'SMGs'], ['shotgun', 'Shotguns'], ['rifle', 'Rifles'], ['heavy', 'Heavy'], ['melee', 'Melee'], ['thrown', 'Throwables']];
const FEES: Record<DropKind, number> = { courier: 150, air: 750, home: 0, dead: 0 };

const carts: Record<string, CartLine[]> = {};
const choice: Record<string, { kind?: DropKind; home?: string; qty?: Record<string, number> }> = {};
const cartOf = (host: string): CartLine[] => (carts[host] ??= []);

function addLine(ctx: WebCtx, line: CartLine): void {
  const cart = cartOf(ctx.host);
  const same = cart.find((l) => l.kind === line.kind && l.id === line.id && l.key === line.key);
  if (same) { if (line.kind === 'ammo' || line.kind === 'supply') same.qty += line.qty; }
  else cart.push(line);
  ctx.g.audio.uiBlip('ok');
  ctx.toast(`Added to cart: ${line.label}`);
  ctx.refresh();
}

const total = (cart: CartLine[]): number => cart.reduce((a, l) => a + l.price * l.qty, 0);

/** Weapon stats as bars. */
function statBars(id: WeaponId): HTMLElement[] {
  const d = WEAPONS[id];
  const rows: [string, number][] = d.melee ? [['Damage', d.damage / 150], ['Speed', Math.min(1, 0.4 / d.interval)]]
    : [['Damage', Math.min(1, Math.log1p(d.damage * d.pellets) / Math.log1p(400))], ['Fire rate', Math.min(1, 0.055 / d.interval)], ['Range', Math.min(1, d.range / 700)], ['Magazine', Math.min(1, d.mag / 100)]];
  return rows.map(([label, v]) => { const f = div('w-fill'); f.style.width = `${Math.max(4, v * 100)}%`; return div('w-stat', h('span', '', label), div('w-bar', f), h('b', '', `${Math.round(v * 10)}/10`)); });
}

/** The items a store sells, with the black market's markup and today's hot deals. */
function stock(black: boolean, day: number): { id: WeaponId; price: number; ammoPrice: number; ammoPack: number; deal?: boolean }[] {
  const deals = new Set([0, 1, 2].map((k) => pick(SHOP_WEAPONS.filter((s) => s.price > 0 && !RESTRICTED.has(s.id)).map((s) => s.id), day, k * 13 + 5)));
  return SHOP_WEAPONS.filter((s) => s.id !== 'fists' && (black ? RESTRICTED.has(s.id) || deals.has(s.id) : !RESTRICTED.has(s.id))).map((s) => {
    if (!black) return { ...s };
    if (RESTRICTED.has(s.id)) return { ...s, price: Math.round(s.price * 1.2), ammoPrice: Math.round(s.ammoPrice * 1.2) };
    return { ...s, price: Math.round(s.price * 0.65), deal: true };
  });
}

function catalogue(ctx: WebCtx, black: boolean, cat: string): HTMLElement[] {
  const e = ctx.c.eco;
  const list = stock(black, e.p.day).filter((s) => !cat || WEAPONS[s.id].cat === cat);
  return [
    black ? null : div('w-tabs', button('All', () => ctx.go(ctx.host), `w-tab${!cat ? ' on' : ''}`), ...CATS.map(([k, label]) => button(label, () => ctx.go(`${ctx.host}?cat=${k}`), `w-tab${cat === k ? ' on' : ''}`)), button('Gear', () => ctx.go(`${ctx.host}/gear`), 'w-tab')),
    div('w-cards', ...list.map((s) => {
      const d = WEAPONS[s.id];
      const owned = e.p.weapons[s.id].owned;
      return button(div('w-carcard', gunArt(s.id, d.cat), h('b', '', d.name), h('span', 'muted', d.blurb), h('span', 'w-price', owned ? 'Owned · ammo & parts' : s.price ? money(s.price) : 'Free'), s.deal ? h('span', 'w-tag', 'Hot deal') : null), () => ctx.go(`${ctx.host}/p/${s.id}`), 'w-cardbtn');
    })),
  ].filter(Boolean) as HTMLElement[];
}

function product(ctx: WebCtx, id: WeaponId, black: boolean): HTMLElement[] {
  const s = stock(black, ctx.c.eco.p.day).find((x) => x.id === id);
  const d = WEAPONS[id];
  if (!s || !d) return [p(black ? 'Not in stock. Try again tomorrow.' : 'We do not sell that online.')];
  const e = ctx.c.eco;
  const owned = e.p.weapons[id].owned;
  const kit = e.p.kits[id];
  const st = (choice[ctx.host] ??= {});
  const q = (st.qty ??= {});
  const packs = q[id] ?? 1;
  const parts = (['ext', 'supp', 'scope'] as const).map((k) => ({ k, price: ATTACHMENTS[k].price[id] ?? 0 })).filter((a) => a.price > 0);
  return [
    button('‹ Back to the catalogue', () => ctx.go(ctx.host), 'w-link'),
    div('w-product',
      div('w-product-art', gunArt(id, d.cat, 480, 180)),
      div('w-product-info',
        h('div', 'w-kicker', CATS.find((c) => c[0] === d.cat)?.[1] ?? d.cat), h('h1', '', d.name), p(d.blurb),
        ...statBars(id),
        owned ? p('You already own this. Order ammunition and parts below.', 'muted small')
          : button(`Add to cart · ${s.price ? money(s.price) : 'free'}`, () => addLine(ctx, { kind: 'weapon', id, qty: 1, label: d.name, price: s.price }), 'w-btn primary big'),
        !d.melee && s.ammoPack > 0 ? card(h('h3', '', d.throwable ? 'More of them' : 'Ammunition'),
          div('w-qty', button('−', () => { q[id] = Math.max(1, packs - 1); ctx.refresh(); }, 'w-btn sm'), h('b', 'w-qty-n', `${packs} × ${s.ammoPack}`), button('+', () => { q[id] = Math.min(20, packs + 1); ctx.refresh(); }, 'w-btn sm')),
          button(`Add ${packs * s.ammoPack} ${d.throwable ? '' : 'rounds '}· ${money(packs * s.ammoPrice)}`, () => addLine(ctx, { kind: 'ammo', id, qty: packs, label: `${d.name} ${d.throwable ? 'refill' : 'ammo'}`, price: s.ammoPrice }), 'w-btn')) : null,
        parts.length ? card(h('h3', '', 'Parts'), ...parts.map((a) => div('w-kvrow', h('span', '', `${ATTACHMENTS[a.k].name} — ${ATTACHMENTS[a.k].blurb}`), kit[a.k] ? h('span', 'w-tag', 'Fitted') : button(`Add · ${money(a.price)}`, () => addLine(ctx, { kind: 'attach', id, key: a.k, qty: 1, label: `${d.name}: ${ATTACHMENTS[a.k].name}`, price: a.price }), 'w-btn sm')))) : null,
      ),
    ),
  ];
}

function gear(ctx: WebCtx): HTMLElement[] {
  return [section('Gear', div('w-list', ...SUPPLIES.map((s) => div('w-listing', div('w-bizicon', s.id === 'medkit' ? '+' : '◈'), div('w-listing-info', h('b', '', s.name), h('span', 'muted', `${s.blurb}. Used as soon as you open the package.`)), div('w-listing-buy', h('div', 'w-price', money(s.price)), button('Add to cart', () => addLine(ctx, { kind: 'supply', id: s.id, qty: 1, label: s.name, price: s.price }), 'w-btn primary'))))))];
}

function cartPage(ctx: WebCtx, black: boolean): HTMLElement[] {
  const g = ctx.g, e = ctx.c.eco;
  const cart = cartOf(ctx.host);
  const st = (choice[ctx.host] ??= {});
  const homes = e.p.props.map((o) => PROPERTY_BY_ID[o.id]!).filter((d) => d.bays === 'car');
  const kinds: DropKind[] = black ? ['dead'] : ['courier', 'air', ...(homes.length ? ['home' as const] : [])];
  const kind = kinds.includes(st.kind as DropKind) ? st.kind! : kinds[0]!;
  const home = homes.find((d) => d.id === st.home)?.id ?? homes[0]?.id;
  const sub = total(cart), fee = FEES[kind], sum = sub + fee;
  const wanted = (g.wanted?.stars ?? 0) > 0;
  if (!cart.length) return [section(black ? 'Basket' : 'Your cart', p('Your cart is empty.', 'muted'), button('Keep shopping', () => ctx.go(ctx.host), 'w-btn primary'))];
  const desc: Record<DropKind, string> = {
    courier: 'A courier leaves the package near you in about 40 seconds.',
    air: 'A plane drops it on a parachute near you in about 12 seconds. Watch for the orange smoke.',
    home: 'Left at the door of your safehouse; collect it whenever you like.',
    dead: 'Left somewhere out of the way, 200–400 m from you. Free. Come alone: sometimes the police are watching the spot.',
  };
  return [
    section(black ? 'Basket' : 'Your cart',
      div('w-table', ...cart.map((l, i) => div('w-tr w-cartrow', h('span', '', l.label), h('span', 'r', l.qty > 1 ? `×${l.qty}` : ''), h('span', 'r', money(l.price * l.qty)), button('Remove', () => { cart.splice(i, 1); ctx.refresh(); }, 'w-btn sm')))),
    ),
    section('Delivery', div('w-list', ...kinds.map((k) => button(div('w-deliv', h('b', '', `${dropLabel(k)}${FEES[k] ? ` · ${money(FEES[k])}` : ' · free'}`), h('span', 'muted small', desc[k])), () => { st.kind = k; ctx.refresh(); }, `w-row w-choice${k === kind ? ' on' : ''}`))),
      kind === 'home' && homes.length > 1 ? div('w-tabs', ...homes.map((d) => button(d.name, () => { st.home = d.id; ctx.refresh(); }, `w-tab${d.id === home ? ' on' : ''}`))) : null),
    card(kv('Items', money(sub)), kv('Delivery', fee ? money(fee) : 'Free'), kv('Total', money(sum), 'w-total'),
      wanted ? p(black ? 'Too hot right now. Lose the police and try again.' : 'Our couriers do not deliver to active police incidents. Lose the police first.', 'w-warn') : null,
      button(`Place order · ${money(sum)}`, () => {
        if (wanted) return;
        if (!e.charge(sum, black ? 'ghostline order' : 'Brass & Barrel online')) { ctx.toast('Not enough money'); return; }
        const d = g.deliveries!.order(cart.splice(0), kind, home);
        ctx.s?.market.event('BRAS', black ? 0 : 0.004);
        g.audio.uiBlip('ok');
        ctx.toast(`Order placed: ${dropLabel(d.kind)}`);
        ctx.go(`${ctx.host}/orders`);
      }, 'w-btn primary big', wanted || e.worth < sum)),
  ];
}

function orders(ctx: WebCtx): HTMLElement[] {
  const D = ctx.g.deliveries!;
  const list = ctx.c.eco.p.drops;
  if (!list.length) return [section('Orders', p('Nothing on the way.', 'muted'))];
  return [section('Orders', div('w-list', ...list.map((d) => div('w-listing',
    div('w-bizicon', d.kind === 'air' ? '✈' : d.kind === 'dead' ? '?' : '▣'),
    div('w-listing-info', h('b', '', dropLabel(d.kind)), h('span', 'muted', d.items.map((l) => (l.qty > 1 ? `${l.label} ×${l.qty}` : l.label)).join(', '))),
    div('w-listing-buy', h('b', '', d.landed ? 'Ready to collect' : `Arriving in ${Math.ceil(D.eta(d))} s`), button('Show on map', () => { ctx.g.map.setWaypoint({ x: d.x, z: d.z }); ctx.toast('Waypoint set'); }, 'w-btn sm', !d.landed && d.kind === 'dead')),
  ))), p('Packages wait where they were left. Walk up to the crate and press E to collect.', 'muted small'))];
}

function route(ctx: WebCtx, black: boolean): HTMLElement[] {
  const [a, b] = ctx.path.split('/');
  if (a === 'p' && b) return product(ctx, b as WeaponId, black);
  if (a === 'gear') return gear(ctx);
  if (a === 'cart') return cartPage(ctx, black);
  if (a === 'orders') return orders(ctx);
  return catalogue(ctx, black, ctx.query.cat ?? '');
}

export const BRASS: Site = {
  host: 'brassandbarrel.vc', name: 'Brass & Barrel', tagline: 'Guns & gear, delivered', color: '#d8642a', category: 'Shopping',
  render(ctx, el) {
    const n = cartOf(ctx.host).reduce((a, l) => a + l.qty, 0);
    el.append(frame(ctx, { name: 'Brass & Barrel', logo: h('span', '', '✦ ', h('b', '', 'BRASS & BARREL')), tagline: 'Licensed firearms dealer · online since 2009' },
      [['Shop', 'brassandbarrel.vc'], ['Gear', 'gear'], [`Cart${n ? ` (${n})` : ''}`, 'cart'], ['Orders', 'orders']],
      ctx.path ? null : div('w-hero guns', div('', h('div', 'w-kicker', 'Delivered by courier or air drop'), h('h1', '', 'Order it. We drop it.'), p('Every legal firearm in our stores, ammunition, parts and armour, left wherever you are. Rocket launchers and other exotics not sold online.'))),
      ...route(ctx, false)));
  },
};

export const GHOST: Site = {
  host: 'ghostline.onion', name: 'ghostline', tagline: 'No questions', color: '#9a4aff', dark: true, category: 'Hidden',
  render(ctx, el) {
    const n = cartOf(ctx.host).reduce((a, l) => a + l.qty, 0);
    const day = ctx.c.eco.p.day;
    el.append(frame(ctx, { name: 'ghostline', logo: h('span', 'w-mono', '> ghostline_'), tagline: `node ${Math.floor(rnd(day, 3) * 9000 + 1000)} · encrypted` },
      [['Market', 'ghostline.onion'], [`Basket${n ? ` (${n})` : ''}`, 'cart'], ['Drops', 'orders']],
      ctx.path ? null : div('w-terminal', p('> launchers, exotics and charges nobody else will sell you'), p('> three "found" items a day, cheap'), p('> dead drops only. pay, wait, collect. sometimes the cops are watching. that is the price.'), p(`> today's risk level: ${['low', 'moderate', 'elevated'][Math.floor(rnd(day, 9) * 3)]}`)),
      ...route(ctx, true)));
  },
};
