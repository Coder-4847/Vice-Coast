import type { Game } from '../Game';
import { BUSINESS_BY_ID } from '../economy/catalog';
import { money } from '../economy/Economy';
import { confirmPage } from '../economy/screens';
import { row, section, type Page, type PageHost } from '../ui/Modal';
import { h } from '../ui/dom';
import { upgradeCost, upgradesFor } from './Empire';

const info = (text: string): HTMLElement => h('p', 'm-info', text);
const kv = (k: string, v: string): HTMLElement => h('div', 'm-kv', h('span', '', k), h('b', '', v));

/** The office laptop in a business you own: its numbers, upgrades and (for operations) supplies, stock and jobs. */
export function managePage(g: Game, id: string): Page {
  const d = BUSINESS_BY_ID[id]!;
  return {
    title: d.name,
    kicker: `${d.region} · ${d.kind}`,
    render(host: PageHost) {
      const em = g.empire!, eco = g.commerce!.eco, b = host.body;
      if (!em.owns(id)) { b.append(info('You no longer own this business.')); return; }
      const st = em.state(id);
      const save = (): void => { void g.commerce!.save(g.commerce!.slot ?? 1, true); };
      b.append(info(d.blurb));
      b.append(h('div', 'm-balance', kv('Dirty money', money(eco.p.dirty)), kv('Laundered a day', money(em.launderCap())), kv('Earned here', money(st.earned))));

      if (d.legal) {
        b.append(h('div', 'm-balance', kv('Takings', `${money(em.takings(d))} / day`), kv('Launders', `${money(Math.round((d.launder ?? 0) * (em.has(id, 'books') ? 1.5 : 1)))} / day`), ...(d.type === 'club' ? [kv('Popularity', `${Math.round(st.popularity)}%`)] : [])));
        b.append(info('Takings are paid into your bank every morning at 06:00. Dirty money from your operations is laundered through your fronts at the same time, for a 15% cut.'));
        if (d.type === 'club') {
          b.append(section('The club'), row({
            label: 'Run a promotion', sub: 'Flyers, influencers and a guest list: popularity +25. It falls a little every day; turning up at night helps too.', right: money(5000), disabled: st.popularity >= 100 || eco.worth < 5000,
            onClick: () => { if (em.promote(id)) { host.toast('The word is out.'); save(); host.refresh(); } },
          }));
        }
      } else {
        const left = em.hoursLeft(d), cap = em.stockCap(d);
        const refill = Math.round(((d.supplyCost ?? 0) * (100 - st.supplies)) / 100);
        b.append(h('div', 'm-balance', kv('Supplies', `${Math.round(st.supplies)}%`), kv('Stock', `${money(Math.round(st.stock))} / ${money(Math.round(cap))}`), kv('Heat', `${Math.round(st.heat)}%`), kv('Runs out in', st.supplies > 0 ? `${Math.ceil(left)} h` : 'Empty')));
        b.append(info(`A full load of supplies makes about ${money(Math.round((d.value ?? 0) * (em.has(id, 'equipment') ? 1.3 : 1)))} of ${d.product ?? 'stock'} in ${Math.round((d.cycle ?? 24) / (em.has(id, 'staff') ? 1.3 : 1))} game hours. Stock sells for dirty money, which your legal businesses launder. Heat rises with every load and every run; let it get high and the police raid the place.`));
        b.append(
          section('Supplies'),
          row({
            label: 'Buy supplies', sub: 'Fill up to 100%. Paid from cash, then bank.', right: refill > 0 ? money(refill) : 'Full', disabled: refill <= 0 || eco.worth < refill,
            onClick: () => { if (em.buySupplies(id)) { host.toast('Supplies delivered.'); save(); host.refresh(); } },
          }),
          row({
            label: 'Steal supplies', sub: 'Hit a rival stash nearby and bring the crates back. Free, but they are guarded.', disabled: !!em.job || st.supplies >= 100,
            onClick: () => { const err = em.startSupply(id); if (err) { host.toast(err); return; } host.close(); g.interiors?.leave(); },
          }),
          section('Sell'),
          row({
            label: 'Sell stock: van run', sub: 'Drive the stock to a buyer for its full value. Do not wreck the van.', right: money(Math.round(st.stock)), disabled: !!em.job || st.stock < (d.value ?? 0) * 0.1,
            onClick: () => { const err = em.startSell(id); if (err) { host.toast(err); return; } host.close(); g.interiors?.leave(); },
          }),
          row({
            label: 'Sell to a fence', sub: 'No risk, no driving, 55% of the value.', right: money(Math.round(st.stock * 0.55)), disabled: st.stock < 1,
            onClick: () => { const got = em.fence(id); if (got) { host.toast(`The fence paid ${money(got)} (dirty).`); save(); host.refresh(); } },
          }),
        );
        if (em.job) b.append(info('You are already on a job. Finish it first.'));
      }

      b.append(section('Upgrades'));
      for (const u of upgradesFor(d)) {
        const owned = st.upgrades.includes(u.id), cost = upgradeCost(d, u);
        b.append(row({
          label: u.name, sub: u.blurb, right: owned ? 'Owned' : money(cost), selected: owned, disabled: owned || eco.worth < cost,
          onClick: () => { if (em.upgrade(id, u)) { host.toast(`${u.name}: done.`); save(); host.refresh(); } },
        }));
      }

      const back = Math.round(d.price * 0.7);
      b.append(section('Ownership'), row({
        label: 'Sell the business', sub: `Get ${money(back)} back into your bank`,
        onClick: () => host.push(confirmPage('Sell the business', `Sell ${d.name} for ${money(back)}? Upgrades and stock go with it.`, 'Sell it', () => { em.sell(id); save(); host.close(); g.interiors?.leave(); })),
      }));
    },
  };
}
