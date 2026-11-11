import { h } from '../ui/dom';
import { row } from '../ui/Modal';
import { money } from './Economy';
import type { Story } from '../story/Story';

/** The Verano Exchange (VEX): fictional companies whose prices move once a day. */
export const TICKERS = [
  { id: 'MRDN', name: 'Meridian Holdings', base: 142, vol: 0.035, blurb: 'Crane\'s harbor and tower empire.' },
  { id: 'VSAV', name: 'Valeria Savings', base: 58, vol: 0.022, blurb: 'The bank on Marlowe Row.' },
  { id: 'RDLN', name: 'Redline Customs', base: 23, vol: 0.05, blurb: 'Paint, parts and performance.' },
  { id: 'SWFT', name: 'Swiftline Couriers', base: 37, vol: 0.04, blurb: 'Packages that cannot wait.' },
  { id: 'LUCK', name: 'Lucky Seven Resorts', base: 88, vol: 0.045, blurb: 'Costa Merida\'s casino.' },
  { id: 'AERO', name: 'Isla Aerolíneas', base: 64, vol: 0.038, blurb: 'Island hops and charter flights.' },
  { id: 'DSKR', name: 'Dusk Harbor Shipping', base: 31, vol: 0.06, blurb: 'Containers, cranes and questions.' },
] as const;

const hash = (a: number, b: number): number => {
  let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/** Price of a ticker on a given in-game day (a seeded random walk), with story events pushing it around. Exported for tests. */
export function priceOn(i: number, day: number, shocks: Record<string, number> = {}): number {
  const t = TICKERS[i]!;
  let p: number = t.base;
  for (let d = 1; d <= day; d++) {
    const r = (hash(i * 97 + 13, d) + hash(i * 31 + 7, d * 3) - 1) * t.vol * 1.7;
    p *= 1 + r + (shocks[`${t.id}:${d}`] ?? 0);
    p = Math.max(1, p);
  }
  return Math.round(p * 100) / 100;
}

/** Story beats move the market (the day after a mission is done). */
function shocks(s: Story): Record<string, number> {
  const out: Record<string, number> = {};
  const day = (id: string): number | undefined => s.st.missions[id]?.day;
  const add = (mission: string, ticker: string, pct: number): void => { const d = day(mission); if (d !== undefined) out[`${ticker}:${d + 1}`] = (out[`${ticker}:${d + 1}`] ?? 0) + pct; };
  add('m30', 'MRDN', -0.18); add('m30', 'DSKR', 0.12);
  add('m33', 'MRDN', -0.25); add('m33', 'VSAV', -0.1);
  add('m36', 'MRDN', -0.3);
  add('m25', 'LUCK', -0.12);
  return out;
}

/** The phone's Stocks app. */
export function stocksApp(s: Story, el: HTMLElement, refresh: () => void): void {
  const eco = s.g.commerce!.eco;
  const day = eco.p.day;
  const rec = (s.st.acts['stocks'] ??= { plays: 0, wins: 0, best: 0, ext: {} });
  const sh = shocks(s);
  let worth = 0;
  el.append(h('p', 'm-info', `Verano Exchange · day ${day}. Prices move overnight; the news moves them more.`));
  TICKERS.forEach((t, i) => {
    const now = priceOn(i, day, sh), prev = priceOn(i, Math.max(0, day - 1), sh);
    const ch = ((now - prev) / prev) * 100;
    const held = rec.ext['h:' + t.id] ?? 0;
    worth += held * now;
    const lot = Math.max(1, Math.floor(1000 / now));
    el.append(row({
      label: `${t.id} · ${t.name}`, sub: `${t.blurb}${held ? ` · you hold ${held}` : ''}`,
      right: `${money(now)} ${ch >= 0 ? '▲' : '▼'}${Math.abs(ch).toFixed(1)}%`,
      onClick: () => {
        el.textContent = '';
        el.append(h('p', 'm-info', `${t.name} at ${money(now)}. You hold ${held} share${held === 1 ? '' : 's'} (worth ${money(held * now)}).`));
        el.append(row({ label: `Buy ${lot}`, right: money(lot * now), disabled: eco.cash < lot * now, onClick: () => { if (eco.spend(Math.round(lot * now), `Bought ${t.id}`)) { rec.ext['h:' + t.id] = held + lot; refresh(); } } }));
        el.append(row({ label: `Sell ${Math.min(held, lot)}`, right: money(Math.min(held, lot) * now), disabled: held <= 0, onClick: () => { const n = Math.min(held, lot); eco.earn(Math.round(n * now), `Sold ${t.id}`); rec.ext['h:' + t.id] = held - n; refresh(); } }));
        el.append(row({ label: 'Sell all', right: money(held * now), disabled: held <= 0, onClick: () => { eco.earn(Math.round(held * now), `Sold ${t.id}`); rec.ext['h:' + t.id] = 0; refresh(); } }));
        el.append(row({ label: 'Back to the market', onClick: refresh }));
      },
    }));
  });
  el.append(h('div', 'ph-foot', `Portfolio ${money(worth)}`));
}
