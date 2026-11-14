import { h } from '../../ui/dom';
import { money } from '../../economy/Economy';
import { BUSINESSES, PAINTS, PROPERTIES, PROPERTY_BY_ID, SHOWROOM } from '../../economy/catalog';
import { VEHICLES, type VehicleSpec } from '../../vehicles/specs';
import type { Site, WebCtx } from '../Browser';
import { button, carArt, div, homeArt } from '../ui';
import { deliveryPoint, frame, kv, p, pick, rnd, section } from './common';

/** The paint picked on a car page, kept between refreshes. */
const paintFor: Record<string, string> = {};

const classOf = (sp: VehicleSpec): string => sp.kind === 'bike' ? 'Motorcycle' : ({ hatch: 'Compact', sedan: 'Sedan', muscle: 'Muscle', super: 'Sports', suv: 'SUV', pickup: 'Off-road', van: 'Van' } as Record<string, string>)[sp.body.kind] ?? 'Car';

/** Buy a car: into a garage with space, or delivered to the kerb near you. */
function buyCar(ctx: WebCtx, spec: string, price: number, color: string, label: string): void {
  const c = ctx.c, e = c.eco, sp = VEHICLES[spec]!;
  if (!e.charge(price, `Bought ${sp.name}`)) { ctx.toast('Not enough money'); return; }
  const custom = { ...c.defaultCustomFor(spec), color };
  const home = e.p.props.map((x) => PROPERTY_BY_ID[x.id]!).find((d) => d.bays === 'car' && e.stored(d.id).length < d.slots);
  const at = deliveryPoint(ctx);
  const o = e.addVehicle(spec, custom, price, home?.id ?? null, at);
  if (home) ctx.toast(`${sp.name} delivered to ${home.name}`);
  else { c.spawnOwned(o, at.x, at.z, at.yaw); ctx.toast(`${sp.name} delivered: it's parked nearby`); }
  e.message(label, `Thank you for your purchase. Your ${sp.name} (${custom.plate}) ${home ? `is waiting at ${home.name}` : 'has been left at the kerb near you'}.`);
  ctx.s?.market.event('VMTR', 0.006);
  ctx.g.audio.uiBlip('ok');
  void c.save(c.slot ?? 1, true);
  ctx.refresh();
}

// ================================================================================================ Apex Autos (new)

function apexHome(ctx: WebCtx, cls: string): HTMLElement[] {
  const list = SHOWROOM.map((id) => VEHICLES[id]!).filter((sp) => !cls || classOf(sp) === cls).sort((a, b) => a.price - b.price);
  const classes = [...new Set(SHOWROOM.map((id) => classOf(VEHICLES[id]!)))];
  return [
    div('w-hero apex', div('', h('div', 'w-kicker', 'Delivered to your door'), h('h1', '', 'Drive something you deserve.'), p('Every model in stock. Order online and we deliver to your garage, or straight to the kerb.'))),
    div('w-tabs', button('All', () => ctx.go('apexautos.vc'), `w-tab${!cls ? ' on' : ''}`), ...classes.map((k) => button(k, () => ctx.go(`apexautos.vc?class=${encodeURIComponent(k)}`), `w-tab${cls === k ? ' on' : ''}`))),
    div('w-cards', ...list.map((sp) => button(div('w-carcard', carArt(sp.kind === 'bike' ? 'bike' : sp.body.kind, sp.body.color), h('b', '', sp.name), h('span', 'muted', `${classOf(sp)} · ${sp.engine.topSpeedKmh} km/h`), h('span', 'w-price', money(sp.price))), () => ctx.go(`apexautos.vc/car/${sp.id}`), 'w-cardbtn'))),
  ];
}

function apexCar(ctx: WebCtx, id: string): HTMLElement[] {
  const sp = VEHICLES[id];
  if (!sp || !SHOWROOM.includes(id)) return [p('That model is not in our catalogue.')];
  const color = paintFor[id] ?? sp.body.color;
  const e = ctx.c.eco;
  const garage = e.p.props.map((x) => PROPERTY_BY_ID[x.id]!).find((d) => d.bays === 'car' && e.stored(d.id).length < d.slots);
  const speed = Math.round(sp.engine.topSpeedKmh);
  const bar = (label: string, v: number): HTMLElement => div('w-stat', h('span', '', label), div('w-bar', div('w-fill')), h('b', '', `${Math.round(v * 10)}/10`));
  const stats = [bar('Top speed', speed / 300), bar('Acceleration', Math.min(1, sp.engine.peakTorque / sp.mass / 0.32)), bar('Handling', sp.kind === 'bike' ? 0.8 : sp.body.kind === 'super' ? 0.9 : sp.body.kind === 'van' ? 0.35 : 0.6), bar('Toughness', Math.min(1, sp.mass / 2400))];
  stats.forEach((s, i) => { const f = s.querySelector('.w-fill') as HTMLElement; f.style.width = `${[speed / 300, Math.min(1, sp.engine.peakTorque / sp.mass / 0.32), sp.kind === 'bike' ? 0.8 : sp.body.kind === 'super' ? 0.9 : sp.body.kind === 'van' ? 0.35 : 0.6, Math.min(1, sp.mass / 2400)][i]! * 100}%`; });
  return [
    button('‹ All models', () => ctx.go('apexautos.vc'), 'w-link'),
    div('w-product',
      div('w-product-art', carArt(sp.kind === 'bike' ? 'bike' : sp.body.kind, color, 480, 220)),
      div('w-product-info',
        h('div', 'w-kicker', classOf(sp)), h('h1', '', sp.name), h('div', 'w-big', money(sp.price)),
        ...stats,
        kv('Engine', `${sp.engine.cylinders} cylinders · ${sp.engine.gears.length} gears`), kv('Weight', `${sp.mass} kg`),
        h('div', 'w-sub-label', 'Paint'),
        div('w-swatches', ...PAINTS.slice(0, 14).map((pt) => { const b = button('', () => { paintFor[id] = pt.value; ctx.refresh(); }, `w-swatch${pt.value === color ? ' on' : ''}`); b.style.background = pt.value; b.title = pt.name; return b; })),
        p(garage ? `Delivered to ${garage.name}.` : 'No free garage space: we will park it at the kerb near you.', 'muted small'),
        button(`Buy now · ${money(sp.price)}`, () => buyCar(ctx, id, sp.price, color, 'Apex Autos'), 'w-btn primary big', e.worth < sp.price),
      ),
    ),
  ];
}

export const APEX: Site = {
  host: 'apexautos.vc', name: 'Apex Autos', tagline: 'New cars, delivered', color: '#ff5a2a', category: 'Shopping',
  render(ctx, el) {
    const [a, b] = ctx.path.split('/');
    el.append(frame(ctx, { name: 'Apex Autos', logo: h('span', '', h('b', '', 'APEX'), ' AUTOS'), tagline: 'Order online · delivered today' }, [['Showroom', 'apexautos.vc'], ['Used cars', 'roadkings.vc'], ['Insurance', 'morsmutual.vc']], ...(a === 'car' && b ? apexCar(ctx, b) : apexHome(ctx, ctx.query.class ?? ''))));
  },
};

// ================================================================================================ Road Kings (used)

interface Listing { i: number; spec: string; price: number; color: string; miles: number; cond: string; seller: string; note: string }
const SELLERS = ['Dwayne from Southside', 'A retired dentist', 'Big Lou', 'A very motivated seller', 'Marisol (no lowballers)', 'Estate sale', 'Mike\'s Motors', 'Ex-rental, Isla Aerolíneas'];
const NOTES = ['Runs great. Minor scratches.', 'One careful owner. Mostly careful.', 'New tyres, old everything else.', 'Smells faintly of fries. Price reflects this.', 'Quick sale, moving to Costa Merida.', 'Clean title. Probably.', 'Garaged all winter. There is no winter.', 'Air con works if you believe in it.'];

function listings(day: number): Listing[] {
  const out: Listing[] = [];
  for (let i = 0; i < 9; i++) {
    const spec = pick(SHOWROOM, day, i * 3 + 1);
    const sp = VEHICLES[spec]!;
    const cond = rnd(day, i * 5 + 2);
    out.push({
      i, spec, color: pick(PAINTS.slice(0, 18), day, i * 7 + 3).value,
      price: Math.round((sp.price * (0.42 + cond * 0.36)) / 50) * 50,
      miles: Math.round(12000 + (1 - cond) * 160000 + rnd(day, i) * 8000),
      cond: cond > 0.66 ? 'Excellent' : cond > 0.33 ? 'Good' : 'Fair',
      seller: pick(SELLERS, day, i * 11), note: pick(NOTES, day, i * 13),
    });
  }
  return out;
}

export const ROADKINGS: Site = {
  host: 'roadkings.vc', name: 'Road Kings Used Cars', tagline: 'Pre-loved wheels', color: '#ffb02e', category: 'Shopping',
  render(ctx, el) {
    const day = ctx.c.eco.p.day;
    const rec = ctx.s ? (ctx.s.st.acts['web'] ??= { plays: 0, wins: 0, best: 0, ext: {} }) : null;
    const sold = (i: number): boolean => !!rec?.ext[`sold:${day}:${i}`];
    const list = listings(day);
    el.append(frame(ctx, { name: 'Road Kings', logo: h('span', '', '♛ ', h('b', '', 'ROAD KINGS')), tagline: 'New stock every morning' }, [['Today\'s stock', 'roadkings.vc'], ['New cars', 'apexautos.vc']],
      p(`Day ${day}: ${list.filter((l) => !sold(l.i)).length} cars on the lot. Prices are firm. Sold as seen.`, 'muted'),
      div('w-list', ...list.map((l) => {
        const sp = VEHICLES[l.spec]!;
        return div(`w-listing${sold(l.i) ? ' is-sold' : ''}`,
          carArt(sp.kind === 'bike' ? 'bike' : sp.body.kind, l.color, 200, 92),
          div('w-listing-info', h('b', '', `${sp.name}`), h('span', 'muted', `${l.miles.toLocaleString('en-US')} miles · ${l.cond} condition · ${l.seller}`), p(`“${l.note}”`, 'small')),
          div('w-listing-buy', h('div', 'w-price', money(l.price)), h('span', 'muted small', `new: ${money(sp.price)}`),
            sold(l.i) ? h('span', 'w-tag', 'SOLD') : button('Buy', () => { if (ctx.c.eco.worth < l.price) { ctx.toast('Not enough money'); return; } buyCar(ctx, l.spec, l.price, l.color, 'Road Kings'); if (rec) rec.ext[`sold:${day}:${l.i}`] = 1; ctx.refresh(); }, 'w-btn primary', ctx.c.eco.worth < l.price)),
        );
      })),
    ));
  },
};

// ================================================================================================ Keystone Realty

function keystoneHome(ctx: WebCtx, tab: string): HTMLElement[] {
  const e = ctx.c.eco;
  const homes = PROPERTIES.filter((d) => tab === 'owned' ? e.owns(d.id) : tab === 'sale' ? !e.owns(d.id) : true);
  return [
    div('w-hero keystone', div('', h('div', 'w-kicker', 'San Verano\'s property people'), h('h1', '', 'Find your place.'), p('From a desert single-wide to a private island. Buy online; the keys are waiting for you.'))),
    div('w-tabs', ...([['all', 'All homes'], ['sale', 'For sale'], ['owned', 'Yours'], ['biz', 'Businesses']] as const).map(([k, label]) => button(label, () => ctx.go(`keystone.vc?tab=${k}`), `w-tab${tab === k ? ' on' : ''}`))),
    tab === 'biz' ? businesses(ctx) : div('w-cards wide', ...homes.map((d) => button(div('w-homecard', homeArt(d.kind, d.id.length * 31 + d.price % 97), div('w-homecard-info', h('b', '', d.name), h('span', 'muted', `${d.region} · ${d.kind}`), h('span', 'w-price', e.owns(d.id) ? 'Owned' : money(d.price)))), () => ctx.go(`keystone.vc/home/${d.id}`), 'w-cardbtn'))),
  ];
}

function keystoneListing(ctx: WebCtx, id: string): HTMLElement[] {
  const d = PROPERTY_BY_ID[id];
  if (!d) return [p('Listing not found.')];
  const c = ctx.c, e = c.eco;
  const own = e.owns(id);
  const garage = d.bays === 'car' ? `${d.slots} car${d.slots === 1 ? '' : 's'}` : d.bays === 'plane' ? `${d.slots} aircraft bought online` : `${d.slots} boats bought online`;
  return [
    button('‹ All listings', () => ctx.go('keystone.vc'), 'w-link'),
    div('w-product',
      div('w-product-art', homeArt(d.kind, d.id.length * 31 + d.price % 97, 520, 280)),
      div('w-product-info',
        h('div', 'w-kicker', `${d.region} · ${d.kind}`), h('h1', '', d.name), h('div', 'w-big', own ? 'Yours' : money(d.price)),
        p(d.blurb),
        kv('Upkeep', `${money(d.upkeep)} a day`), kv(d.bays === 'car' ? 'Garage' : 'Capacity', garage), kv('Includes', d.bays === 'plane' ? 'Hangar space: buy aircraft at skylineaviation.vc' : d.bays === 'boat' ? 'Moorings: buy boats at bluewatermarine.vc' : 'Bed (save and sleep), wardrobe, garage'),
        own ? p('You own this property. Visit it to sleep, save, change clothes and manage the garage.', 'muted') : p('Paid from cash, then your bank account. Upkeep comes out of the bank every morning.', 'muted small'),
        own ? null : button(`Buy now · ${money(d.price)}`, () => {
          if (!e.buyProperty(id)) { ctx.toast('Not enough money'); return; }
          c.spawnPropCrafts(id);
          c.refreshMarkers();
          ctx.s?.market.event('MRDN', 0.004);
          ctx.toast(`${d.name} is yours`);
          ctx.g.audio.uiBlip('ok');
          void c.save(c.slot ?? 1, true);
          ctx.refresh();
        }, 'w-btn primary big', e.worth < d.price),
        button('Show on my map', () => { const pt = c.points.byRef(id); if (pt) { ctx.g.map.setWaypoint({ x: pt.x, z: pt.z }); ctx.toast(`Waypoint set: ${d.name}`); } }, 'w-btn'),
      ),
    ),
  ];
}

function businesses(ctx: WebCtx): HTMLElement {
  const e = ctx.c.eco;
  const owned = e.p.biz;
  const daily = owned.reduce((a, id) => a + (BUSINESSES.find((b) => b.id === id)?.income ?? 0), 0);
  return div('',
    p(`Commercial listings. Businesses pay their takings into your bank every morning${owned.length ? `: you earn about ${money(daily)} a day` : ''}.`, 'muted'),
    div('w-list', ...BUSINESSES.map((b) => {
      const mine = owned.includes(b.id);
      return div('w-listing',
        div('w-bizicon', b.kind[0]!),
        div('w-listing-info', h('b', '', b.name), h('span', 'muted', `${b.kind} · ${b.region}`), p(b.blurb, 'small')),
        div('w-listing-buy', h('div', 'w-price', money(b.price)), h('span', 'muted small', `≈ ${money(b.income)} / day · pays back in ${Math.round(b.price / b.income)} days`),
          mine ? button('Sell (70%)', () => { e.p.biz = e.p.biz.filter((x) => x !== b.id); e.earn(Math.round(b.price * 0.7), `Sold ${b.name}`); e.deposit(Math.round(b.price * 0.7)); ctx.toast(`Sold ${b.name}`); void ctx.c.save(ctx.c.slot ?? 1, true); ctx.refresh(); }, 'w-btn')
            : button('Buy', () => { if (!e.charge(b.price, `Bought ${b.name}`)) { ctx.toast('Not enough money'); return; } e.p.biz.push(b.id); e.message('Keystone Realty', `${b.name} is yours. The manager will pay the takings into your account every morning.`); ctx.toast(`${b.name} is yours`); ctx.g.audio.uiBlip('ok'); void ctx.c.save(ctx.c.slot ?? 1, true); ctx.refresh(); }, 'w-btn primary', e.worth < b.price)),
      );
    })),
  );
}

export const KEYSTONE: Site = {
  host: 'keystone.vc', name: 'Keystone Realty', tagline: 'Homes and businesses', color: '#7a5cff', category: 'Shopping',
  render(ctx, el) {
    const [a, b] = ctx.path.split('/');
    el.append(frame(ctx, { name: 'Keystone Realty', logo: h('span', '', '⌂ ', h('b', '', 'KEYSTONE'), ' Realty'), tagline: `${PROPERTIES.length} homes · ${BUSINESSES.length} businesses` }, [['Homes', 'keystone.vc'], ['Businesses', 'keystone.vc?tab=biz'], ['Your properties', 'keystone.vc?tab=owned']],
      ...(a === 'home' && b ? keystoneListing(ctx, b) : keystoneHome(ctx, ctx.query.tab ?? 'all'))));
  },
};

// ================================================================================================ Mors Mutual (insurance)

export const MORS: Site = {
  host: 'morsmutual.vc', name: 'Mors Mutual', tagline: 'Insurance', color: '#d83a3a', category: 'Money',
  render(ctx, el) {
    const c = ctx.c, e = c.eco;
    const wrecks = e.p.vehicles.filter((v) => v.where.kind === 'destroyed');
    const covered = e.p.vehicles.filter((v) => v.where.kind !== 'destroyed');
    el.append(frame(ctx, { name: 'Mors Mutual', logo: h('span', '', h('b', '', 'MORS'), ' MUTUAL'), tagline: 'Because accidents happen. A lot. To you specifically.' }, [['Claims', 'morsmutual.vc'], ['Buy a car', 'apexautos.vc']],
      section('Open claims', ...(wrecks.length ? wrecks.map((o) => div('w-listing', carArt(VEHICLES[o.spec]!.kind === 'bike' ? 'bike' : VEHICLES[o.spec]!.body.kind, o.custom.color, 160, 74), div('w-listing-info', h('b', '', VEHICLES[o.spec]!.name), h('span', 'muted', `Plate ${o.custom.plate} · written off`)), div('w-listing-buy', h('div', 'w-price', money(e.insuranceFee(o))), h('span', 'muted small', 'excess to pay'), button('Claim', () => { if (c.claimInsurance(o)) ctx.refresh(); }, 'w-btn primary', e.worth < e.insuranceFee(o))))) : [p('No open claims. Your cars are, against all odds, intact.', 'muted')])),
      section('Covered vehicles', ...(covered.length ? covered.map((o) => kv(`${VEHICLES[o.spec]!.name} · ${o.custom.plate}`, o.where.kind === 'stored' ? 'In a garage' : 'Out in the city')) : [p('You have no vehicles on cover. Every car you buy is insured automatically.', 'muted')])),
    ));
  },
};
