import { h } from '../../ui/dom';
import { money } from '../../economy/Economy';
import { TICKERS, TICKER_BY_ID } from '../../economy/market';
import type { Site, WebCtx } from '../Browser';
import { button, chart, div, pct, sparkline, updown } from '../ui';
import { card, frame, kv, p, section } from './common';

/** Order size per ticker, kept between page refreshes. */
const qty: Record<string, number> = {};

const NAV: [string, string][] = [['Markets', 'vex.vc'], ['Portfolio', 'portfolio'], ['News', 'news'], ['Learn', 'learn']];

function overview(ctx: WebCtx): HTMLElement[] {
  const m = ctx.s!.market;
  const rows = TICKERS.map((t) => ({ t, price: m.price(t.id), ch: m.change(t.id) }));
  const movers = [...rows].sort((a, b) => b.ch - a.ch);
  // the index over the last month
  const idx: number[] = [];
  for (let d = m.day - 29; d <= m.day; d++) {
    let s = 0;
    for (const t of TICKERS) s += (d === m.day ? m.price(t.id) : m.close(t.id, d)) / t.base;
    idx.push((s / TICKERS.length) * 1000);
  }
  const value = m.portfolioValue();
  return [
    div('w-hero vex',
      div('', h('div', 'w-kicker', 'VEX 14 · Verano Exchange'), h('div', 'w-big', m.index().toFixed(2)), h('div', updown(m.indexChange()), `${pct(m.indexChange())} today · day ${m.day}, ${ctx.g.world.tod.clock}`)),
      div('w-hero-chart', chart(idx, ['30 days ago', 'Now'], 520, 150)),
    ),
    div('w-grid3',
      card(h('h3', '', 'Top gainers'), ...movers.slice(0, 3).map((r) => button(div('w-mover', h('b', '', r.t.id), h('span', '', money(r.price)), h('span', updown(r.ch), pct(r.ch))), () => ctx.go(`vex.vc/q/${r.t.id}`), 'w-row'))),
      card(h('h3', '', 'Top losers'), ...movers.slice(-3).reverse().map((r) => button(div('w-mover', h('b', '', r.t.id), h('span', '', money(r.price)), h('span', updown(r.ch), pct(r.ch))), () => ctx.go(`vex.vc/q/${r.t.id}`), 'w-row'))),
      card(h('h3', '', 'Your portfolio'), kv('Value', money(value)), kv('Positions', String(m.holdings().length)), kv('Cash + bank', money(ctx.c.eco.worth)), button('Open portfolio', () => ctx.go('vex.vc/portfolio'), 'w-btn primary')),
    ),
    section('All companies',
      div('w-table',
        div('w-tr w-th', h('span', '', 'Symbol'), h('span', '', 'Company'), h('span', '', 'Sector'), h('span', 'r', 'Price'), h('span', 'r', 'Change'), h('span', '', '30 days'), h('span', 'r', 'You hold')),
        ...rows.map((r) => button(div('w-tr',
          h('b', '', r.t.id), h('span', '', r.t.name), h('span', 'muted', r.t.sector), h('span', 'r', money2(r.price)), h('span', `r ${updown(r.ch)}`, pct(r.ch)),
          h('span', '', sparkline(m.history(r.t.id, 30), 110, 26)), h('span', 'r', String(m.holding(r.t.id).shares || '–')),
        ), () => ctx.go(`vex.vc/q/${r.t.id}`), 'w-row')),
      ),
    ),
    section('Market news', ...m.news(3).slice(0, 8).map((n) => newsRow(ctx, n.day, n.id, n.text))),
  ];
}

const money2 = (n: number): string => `$${n.toFixed(2)}`;

function newsRow(ctx: WebCtx, day: number, id: string, text: string): HTMLElement {
  return button(div('w-news', h('span', 'w-tag', id), h('span', '', text), h('span', 'muted', day === ctx.c.eco.p.day ? 'Today' : `${ctx.c.eco.p.day - day}d ago`)), () => ctx.go(`vex.vc/q/${id}`), 'w-row');
}

function quote(ctx: WebCtx, id: string): HTMLElement[] {
  const m = ctx.s!.market;
  const t = TICKER_BY_ID[id];
  if (!t) return [p('Unknown symbol.')];
  const price = m.price(id), ch = m.change(id);
  const range = ctx.query.range ?? '30d';
  const series = range === '1d' ? m.intraday(id) : m.history(id, range === '90d' ? 90 : 30);
  const hist30 = m.history(id, 30);
  const hold = m.holding(id);
  const eco = ctx.c.eco;
  const maxBuy = Math.max(0, Math.floor((eco.worth - m.FEE) / price));
  const n = Math.max(1, Math.min(qty[id] ?? 10, Math.max(1, maxBuy, hold.shares)));
  qty[id] = n;
  const setQ = (v: number): void => { qty[id] = Math.max(1, Math.round(v)); ctx.refresh(); };
  const pl = hold.shares * price - hold.cost;
  return [
    div('w-quote',
      div('', h('div', 'w-kicker', `${t.sector} · VEX: ${t.id}`), h('h1', '', t.name), p(t.blurb, 'muted')),
      div('r', h('div', 'w-big', money2(price)), h('div', updown(ch), `${ch >= 0 ? '▲' : '▼'} ${money2(Math.abs(price - m.close(id, m.day - 1)))} (${pct(ch)})`)),
    ),
    div('w-tabs', ...(['1d', '30d', '90d'] as const).map((r) => button(r === '1d' ? 'Today' : r === '30d' ? '1 month' : '3 months', () => ctx.go(`vex.vc/q/${id}?range=${r}`), `w-tab${r === range ? ' on' : ''}`))),
    card(chart(series, range === '1d' ? ['6 AM', 'Now'] : [range === '90d' ? '3 months ago' : '1 month ago', 'Now'])),
    div('w-grid2',
      card(h('h3', '', 'Key figures'),
        kv('Previous close', money2(m.close(id, m.day - 1))),
        kv('30-day high', money2(Math.max(...hist30))), kv('30-day low', money2(Math.min(...hist30))),
        kv('Volatility', t.vol > 0.05 ? 'High' : t.vol > 0.035 ? 'Medium' : 'Low'),
        kv('Market cap', `$${((price * (40 + (t.base % 17) * 9)) / 10).toFixed(1)}B`),
      ),
      card(h('h3', '', 'Trade'),
        kv('You hold', `${hold.shares} share${hold.shares === 1 ? '' : 's'}`),
        hold.shares ? kv('Average cost', money2(hold.cost / hold.shares)) : null,
        hold.shares ? kv('Profit / loss', h('span', updown(pl), `${pl >= 0 ? '+' : '−'}${money(Math.abs(pl))}`)) : null,
        div('w-qty',
          button('−10', () => setQ(n - 10), 'w-btn sm'), button('−1', () => setQ(n - 1), 'w-btn sm'),
          h('b', 'w-qty-n', `${n} share${n === 1 ? '' : 's'}`),
          button('+1', () => setQ(n + 1), 'w-btn sm'), button('+10', () => setQ(n + 10), 'w-btn sm'),
          button('Max', () => setQ(Math.max(maxBuy, hold.shares, 1)), 'w-btn sm'),
        ),
        p(`Order value ${money(n * price)} · fee ${money(m.FEE)}. Paid from cash, then your bank account. Sales go to the bank.`, 'muted small'),
        div('w-actions',
          button(`Buy ${n}`, () => { if (m.buy(id, n)) { ctx.toast(`Bought ${n} ${id} at ${money2(price)}`); ctx.g.audio.uiBlip('ok'); ctx.refresh(); } else ctx.toast('Not enough money'); }, 'w-btn primary', n > maxBuy),
          button(`Sell ${Math.min(n, hold.shares) || ''}`.trim(), () => { const k = Math.min(n, hold.shares); const prof = m.sell(id, k); ctx.toast(`Sold ${k} ${id}: ${prof >= 0 ? 'profit' : 'loss'} ${money(Math.abs(prof))}`); ctx.g.audio.uiBlip('ok'); ctx.refresh(); }, 'w-btn danger', hold.shares <= 0),
          button('Sell all', () => { const prof = m.sell(id, hold.shares); ctx.toast(`Sold all ${id}: ${prof >= 0 ? 'profit' : 'loss'} ${money(Math.abs(prof))}`); ctx.refresh(); }, 'w-btn', hold.shares <= 0),
        ),
      ),
    ),
    section(`${t.name} in the news`, ...(() => { const list = m.news(30).filter((x) => x.id === id).slice(0, 6); return list.length ? list.map((x) => div('w-news', h('span', 'muted', x.day === m.day ? 'Today' : `${m.day - x.day}d ago`), h('span', '', x.text))) : [p('No recent news.', 'muted')]; })()),
  ];
}

function portfolio(ctx: WebCtx): HTMLElement[] {
  const m = ctx.s!.market;
  const hs = m.holdings();
  let value = 0, cost = 0;
  for (const x of hs) { value += x.shares * m.price(x.id); cost += x.cost; }
  const rec = ctx.s!.st.acts['stocks'];
  return [
    div('w-grid3',
      card(h('div', 'w-kicker', 'Portfolio value'), h('div', 'w-big', money(value))),
      card(h('div', 'w-kicker', 'Unrealised profit / loss'), h('div', `w-big ${updown(value - cost)}`, `${value - cost >= 0 ? '+' : '−'}${money(Math.abs(value - cost))}`)),
      card(h('div', 'w-kicker', 'Best single sale'), h('div', 'w-big', money(rec?.best ?? 0)), p(`${rec?.plays ?? 0} purchases · ${rec?.wins ?? 0} profitable sales`, 'muted small')),
    ),
    section('Positions', hs.length ? div('w-table',
      div('w-tr w-th', h('span', '', 'Symbol'), h('span', 'r', 'Shares'), h('span', 'r', 'Avg cost'), h('span', 'r', 'Price'), h('span', 'r', 'Value'), h('span', 'r', 'P / L'), h('span', '', '')),
      ...hs.map((x) => {
        const pr = m.price(x.id), v = x.shares * pr, pl = v - x.cost;
        return button(div('w-tr', h('b', '', x.id), h('span', 'r', String(x.shares)), h('span', 'r', money2(x.cost / x.shares)), h('span', 'r', money2(pr)), h('span', 'r', money(v)), h('span', `r ${updown(pl)}`, `${pl >= 0 ? '+' : '−'}${money(Math.abs(pl))} (${pct((pl / Math.max(1, x.cost)) * 100)})`), h('span', 'r', 'Trade ›')), () => ctx.go(`vex.vc/q/${x.id}`), 'w-row');
      }),
    ) : p('You do not own any shares yet. Pick a company on the Markets page.', 'muted')),
  ];
}

function news(ctx: WebCtx): HTMLElement[] {
  const m = ctx.s!.market;
  return [section('Market news (last two weeks)', ...m.news(14).map((n) => newsRow(ctx, n.day, n.id, n.text)))];
}

function learn(): HTMLElement[] {
  return [section('How the Verano Exchange works',
    p('Prices move every hour of the trading day (6 AM to 6 AM) and settle at a closing price each morning. The next close can be pushed by news: earnings, scandals, takeovers.'),
    p('Some companies are businesses you will recognise on the street. Rob enough Petrolia gas stations and investors get nervous; steal cars and Redline Customs does a roaring trade. Buy low, then go and make the news.'),
    p('Every trade costs a $5 fee. Shares are paid from your cash first, then your bank account; the proceeds of a sale go into the bank, safe from muggers.'),
    p('Nothing here is financial advice. Least of all the bit about robbing gas stations.', 'muted'),
  )];
}

export const VEX: Site = {
  host: 'vex.vc', name: 'Verano Exchange', tagline: 'Stocks, live', color: '#1fb87a', dark: true, category: 'Money',
  render(ctx, el) {
    if (!ctx.s) { el.append(p('The exchange is closed.')); return; }
    const [a, b] = ctx.path.split('/');
    const main = a === 'q' && b ? quote(ctx, b.toUpperCase()) : a === 'portfolio' ? portfolio(ctx) : a === 'news' ? news(ctx) : a === 'learn' ? learn() : overview(ctx);
    el.append(frame(ctx, { name: 'Verano Exchange', logo: h('span', '', h('b', '', 'VEX'), ' Verano Exchange'), tagline: `Day ${ctx.c.eco.p.day} · ${ctx.g.world.tod.clock}` }, NAV, ...main));
  },
};
