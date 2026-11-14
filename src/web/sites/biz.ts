import { h } from '../../ui/dom';
import { money } from '../../economy/Economy';
import { BUSINESSES, type BusinessDef } from '../../economy/catalog';
import { upgradeCost, upgradesFor } from '../../business/Empire';
import type { Site, WebCtx } from '../Browser';
import { button, div } from '../ui';
import { card, frame, p, section } from './common';

const ICON: Record<string, string> = {
  food: '♨', shop: '◆', carwash: '≋', storage: '▤', laundromat: '◎', cab: '⊙', airstrip: '✈', club: '♫', motel: '★',
  grow: '❦', print: '$', lab: '⚗', docs: '✎', cartel: '⚓',
};
export const bizIcon = (d: BusinessDef): string => ICON[d.type] ?? d.kind[0]!;

const save = (ctx: WebCtx): void => { void ctx.c.save(ctx.c.slot ?? 1, true); };

function waypoint(ctx: WebCtx, d: BusinessDef): HTMLElement {
  return button('Show on map', () => {
    const s = ctx.g.empire?.sites.get(d.id);
    const at = s?.door ?? d.near;
    ctx.g.map.setWaypoint({ x: at.x, z: at.z });
    ctx.toast(`Waypoint set: ${d.name}`);
  }, 'w-btn');
}

/** The for-sale list: legal fronts on Keystone, illegal operations on ghostline. */
export function bizListings(ctx: WebCtx, legal: boolean): HTMLElement {
  const em = ctx.g.empire, e = ctx.c.eco;
  if (!em) return p('Listings are not available right now.', 'muted');
  const list = BUSINESSES.filter((b) => b.legal === legal);
  const intro = legal
    ? `Commercial listings. Every front pays clean takings into your bank each morning and quietly launders dirty money from your other ventures (15% cut). Walk in to run it from the office laptop. You launder ${money(em.launderCap())} a day.`
    : '> property. grow-ops, presses, labs and a cartel warehouse. buy supplies, they make stock, you move it for dirty money. launder it through a legal front. keep the heat down or the police kick the door in.';
  return div('',
    legal ? p(intro, 'muted') : div('w-terminal', p(intro)),
    div('w-list', ...list.map((b) => {
      const mine = em.owns(b.id);
      const stats = legal
        ? `≈ ${money(b.income)} / day · launders ${money(b.launder ?? 0)} / day`
        : `${money(b.value ?? 0)} of ${b.product} per ${b.cycle} h · supplies ${money(b.supplyCost ?? 0)}`;
      return div('w-listing',
        div('w-bizicon', bizIcon(b)),
        div('w-listing-info', h('b', '', b.name), h('span', 'muted', `${b.kind} · ${b.region}`), p(b.blurb, 'small'), h('span', 'muted small', stats)),
        div('w-listing-buy', h('div', 'w-price', mine ? 'Yours' : money(b.price)),
          mine
            ? div('w-actions', waypoint(ctx, b), button('Manage', () => ctx.go(`ledger.vc/${b.id}`), 'w-btn primary'))
            : button('Buy', () => {
              if (!em.buy(b.id)) { ctx.toast('Not enough money'); return; }
              ctx.toast(`${b.name} is yours`);
              ctx.g.audio.uiBlip('ok');
              save(ctx);
              ctx.refresh();
            }, 'w-btn primary', e.worth < b.price)),
      );
    })),
  );
}

// ================================================================================================ Ledger: your businesses

function overview(ctx: WebCtx): HTMLElement[] {
  const em = ctx.g.empire!, e = ctx.c.eco;
  const owned = em.owned();
  const takings = owned.reduce((a, d) => a + em.takings(d), 0);
  const stock = owned.filter((d) => !d.legal).reduce((a, d) => a + em.state(d.id).stock, 0);
  const out: HTMLElement[] = [
    div('w-grid3',
      card(h('div', 'w-kicker', 'Clean takings'), h('div', 'w-big', `${money(takings)}`), p('a day, paid into your bank at 06:00', 'muted small')),
      card(h('div', 'w-kicker', 'Dirty money'), h('div', 'w-big', money(e.p.dirty)), p(`You launder up to ${money(em.launderCap())} a day (15% fee). Half is seized if you are Busted.`, 'muted small')),
      card(h('div', 'w-kicker', 'Stock on hand'), h('div', 'w-big', money(Math.round(stock))), p(`${em.stats.sold} sell runs · ${em.stats.raids} raids`, 'muted small')),
    ),
  ];
  if (!owned.length) {
    out.push(card(h('h3', '', 'No businesses yet'), p('Buy a legal front on Keystone Realty. Illegal operations are only for sale somewhere less public.'), button('Browse businesses', () => ctx.go('keystone.vc?tab=biz'), 'w-btn primary')));
    return out;
  }
  out.push(section('Your businesses', div('w-list', ...owned.map((d) => {
    const st = em.state(d.id);
    const line = d.legal
      ? `${money(em.takings(d))} / day${d.type === 'club' ? ` · popularity ${Math.round(st.popularity)}%` : ''}`
      : `supplies ${Math.round(st.supplies)}% · stock ${money(Math.round(st.stock))} · heat ${Math.round(st.heat)}%`;
    return div('w-listing',
      div('w-bizicon', bizIcon(d)),
      div('w-listing-info', h('b', '', d.name), h('span', 'muted', `${d.kind} · ${d.region}`), h('span', 'small', line)),
      div('w-listing-buy', h('div', 'w-price', `earned ${money(st.earned)}`), button('Open', () => ctx.go(`ledger.vc/${d.id}`), 'w-btn primary')),
    );
  }))));
  if (em.job) out.push(card(h('h3', '', 'Job in progress'), p(em.job.kind === 'sell' ? `Sell run to ${em.job.dest.label}.` : 'Supply run: steal the crates from the stash.')));
  return out;
}

function detail(ctx: WebCtx, id: string): HTMLElement[] {
  const em = ctx.g.empire!, e = ctx.c.eco;
  const d = BUSINESSES.find((b) => b.id === id);
  if (!d || !em.owns(id)) return [p('You do not own that business.'), button('Back', () => ctx.go('ledger.vc'), 'w-btn')];
  const st = em.state(id);
  const act = (fn: () => boolean, ok: string): void => { if (fn()) { ctx.toast(ok); ctx.g.audio.uiBlip('ok'); save(ctx); } else ctx.toast('Not enough money'); ctx.refresh(); };
  const out: HTMLElement[] = [
    div('w-listing', div('w-bizicon', bizIcon(d)), div('w-listing-info', h('b', '', d.name), h('span', 'muted', `${d.kind} · ${d.region}`), p(d.blurb, 'small')), div('w-listing-buy', waypoint(ctx, d))),
  ];
  if (d.legal) {
    out.push(div('w-grid3',
      card(h('div', 'w-kicker', 'Takings'), h('div', 'w-big', money(em.takings(d))), p('a day', 'muted small')),
      card(h('div', 'w-kicker', 'Launders'), h('div', 'w-big', money(Math.round((d.launder ?? 0) * (em.has(id, 'books') ? 1.5 : 1)))), p('a day', 'muted small')),
      card(h('div', 'w-kicker', 'Earned'), h('div', 'w-big', money(st.earned)), p('since you bought it', 'muted small')),
    ));
    if (d.type === 'club') {
      out.push(section('Popularity',
        div('w-meter', div('w-meter-fill')),
        p(`${Math.round(st.popularity)}%. Takings follow popularity. It drops every day; promotions and turning up yourself at night (20:00–04:00) bring the crowd back.`, 'muted'),
        button(`Run a promotion · ${money(5000)}`, () => act(() => em.promote(id), 'The word is out.'), 'w-btn primary', st.popularity >= 100 || e.worth < 5000)));
      const fill = out[out.length - 1]!.querySelector('.w-meter-fill') as HTMLElement;
      fill.style.width = `${Math.round(st.popularity)}%`;
    }
  } else {
    const refill = Math.round(((d.supplyCost ?? 0) * (100 - st.supplies)) / 100);
    out.push(div('w-grid3',
      card(h('div', 'w-kicker', 'Supplies'), h('div', 'w-big', `${Math.round(st.supplies)}%`), p(st.supplies > 0 ? `${Math.ceil(em.hoursLeft(d))} game hours left` : 'Empty: production has stopped', 'muted small')),
      card(h('div', 'w-kicker', 'Stock'), h('div', 'w-big', money(Math.round(st.stock))), p(`of ${money(Math.round(em.stockCap(d)))} it can hold`, 'muted small')),
      card(h('div', 'w-kicker', 'Heat'), h('div', 'w-big', `${Math.round(st.heat)}%`), p(st.heat > 55 ? 'High: a raid could come any morning' : 'Falls a little every day', 'muted small')),
    ));
    out.push(section('Operations',
      div('w-actions',
        button(refill > 0 ? `Order supplies · ${money(refill)}` : 'Supplies full', () => act(() => em.buySupplies(id), 'Supplies delivered.'), 'w-btn primary', refill <= 0 || e.worth < refill),
        button(`Call a fence · ${money(Math.round(st.stock * 0.55))}`, () => { const got = em.fence(id); ctx.toast(got ? `The fence paid ${money(got)} (dirty).` : 'Nothing to sell.'); save(ctx); ctx.refresh(); }, 'w-btn', st.stock < 1),
      ),
      p('Sell runs (full value) and stealing supplies (free) start from the laptop inside the building.', 'muted small')));
  }
  out.push(section('Upgrades', div('w-list', ...upgradesFor(d).map((u) => {
    const has = st.upgrades.includes(u.id), cost = upgradeCost(d, u);
    return div('w-listing', div('w-bizicon', has ? '✓' : '+'), div('w-listing-info', h('b', '', u.name), h('span', 'muted', u.blurb)),
      div('w-listing-buy', h('div', 'w-price', has ? 'Installed' : money(cost)), has ? null : button('Buy', () => act(() => em.upgrade(id, u), `${u.name}: done.`), 'w-btn primary', e.worth < cost)));
  }))));
  out.push(button('← All businesses', () => ctx.go('ledger.vc'), 'w-btn'));
  return out;
}

export const LEDGER: Site = {
  host: 'ledger.vc', name: 'Ledger', tagline: 'Run your businesses', color: '#2ab87a', category: 'Money',
  render(ctx, el) {
    if (!ctx.g.empire) { el.append(p('Ledger is offline.')); return; }
    el.append(frame(ctx, { name: 'Ledger', logo: h('span', '', '▦ ', h('b', '', 'LEDGER')), tagline: 'Small business accounts · no questions about the big ones' }, [['Overview', 'ledger.vc'], ['Buy a business', 'keystone.vc?tab=biz']],
      ...(ctx.path ? detail(ctx, ctx.path) : overview(ctx))));
  },
};
