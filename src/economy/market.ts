import type { Story } from '../story/Story';

/**
 * The Verano Exchange (VEX): fictional companies, many of them businesses you can see in the world. Daily closing prices
 * are a seeded random walk with a little drift, pushed around by the day's news, by the story, and by what you do (rob
 * a chain's stores and its share price notices). During the day the price wanders from yesterday's close to today's, so
 * the ticker moves while you play.
 */
export interface Ticker { id: string; name: string; sector: string; base: number; vol: number; drift: number; blurb: string }

export const TICKERS: Ticker[] = [
  { id: 'MRDN', name: 'Meridian Holdings', sector: 'Property', base: 142, vol: 0.035, drift: 0.0006, blurb: 'Harbor cranes and downtown towers. Owns half the skyline.' },
  { id: 'VSAV', name: 'Valeria Savings', sector: 'Finance', base: 58, vol: 0.022, drift: 0.0004, blurb: 'The bank on Marlowe Row, and probably the one you use.' },
  { id: 'RDLN', name: 'Redline Customs', sector: 'Autos', base: 23, vol: 0.05, drift: 0.0008, blurb: 'Paint, parts and performance. Profits rise with car theft.' },
  { id: 'SWFT', name: 'Swiftline Couriers', sector: 'Logistics', base: 37, vol: 0.04, drift: 0.0005, blurb: 'Packages that cannot wait.' },
  { id: 'LUCK', name: 'Lucky Seven Resorts', sector: 'Leisure', base: 88, vol: 0.045, drift: 0.0003, blurb: 'Costa Merida\'s casino and its hotels.' },
  { id: 'AERO', name: 'Isla Aerolíneas', sector: 'Travel', base: 64, vol: 0.038, drift: 0.0002, blurb: 'Island hops and charter flights out of Valeria International.' },
  { id: 'DSKR', name: 'Dusk Harbor Shipping', sector: 'Logistics', base: 31, vol: 0.06, drift: 0.0004, blurb: 'Containers, cranes and questions nobody answers.' },
  { id: 'PTRL', name: 'Petrolia Energy', sector: 'Energy', base: 76, vol: 0.03, drift: 0.0005, blurb: 'Gas stations on every highway in San Verano.' },
  { id: 'FRSH', name: 'FreshMart Group', sector: 'Retail', base: 29, vol: 0.028, drift: 0.0004, blurb: 'Groceries, 24/7 stores and the Kwik Stop chain.' },
  { id: 'CLKN', name: 'Cluckin\' Kings', sector: 'Food', base: 17, vol: 0.055, drift: 0.0006, blurb: 'Fried chicken, open till four. Volatile, like the fryers.' },
  { id: 'MORS', name: 'Mors Mutual', sector: 'Insurance', base: 112, vol: 0.026, drift: 0.0005, blurb: 'Insures half the cars in the state. Hates explosions.' },
  { id: 'BRAS', name: 'Brass & Barrel Arms', sector: 'Retail', base: 44, vol: 0.042, drift: 0.0005, blurb: 'Gun stores. Sales go up when the streets get rough.' },
  { id: 'VMTR', name: 'Valeria Motors', sector: 'Autos', base: 53, vol: 0.036, drift: 0.0004, blurb: 'The dealership chain. Also sells online.' },
  { id: 'HLCN', name: 'Halcyon Pharma', sector: 'Health', base: 205, vol: 0.07, drift: 0.0007, blurb: 'One miracle drug in trials. Or one lawsuit away from zero.' },
];

export const TICKER_BY_ID: Record<string, Ticker> = Object.fromEntries(TICKERS.map((t) => [t.id, t]));

const hash = (a: number, b: number): number => {
  let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/** A day's headline for a company, with the price move it causes at the close. */
export interface NewsItem { day: number; id: string; text: string; shock: number }

const GOOD = [
  '{n} beats quarterly earnings forecasts',
  '{n} lands a big contract with the city',
  'Analysts upgrade {n} to "buy"',
  '{n} announces a share buyback',
  '{n} opens a new flagship location',
  'Rumours of a takeover bid for {n}',
];
const BAD = [
  '{n} misses earnings; shares slide',
  'Regulators open an inquiry into {n}',
  '{n} chief executive resigns suddenly',
  'Strike at {n} halts operations',
  '{n} recalls a product line',
  'Short sellers circle {n}',
];

/** Seeded company news for a day (at most a few items). */
export function newsOn(day: number): NewsItem[] {
  const out: NewsItem[] = [];
  TICKERS.forEach((t, i) => {
    const r = hash(i * 131 + 17, day * 7 + 3);
    if (r > 0.09) return;
    const good = hash(i * 31 + 5, day) < 0.52;
    const list = good ? GOOD : BAD;
    const text = list[Math.floor(hash(i, day * 13) * list.length) % list.length]!.replace('{n}', t.name);
    const size = 0.04 + hash(i * 7, day * 5) * (t.sector === 'Health' ? 0.22 : 0.1);
    out.push({ day, id: t.id, text, shock: good ? size : -size });
  });
  return out;
}

/** Story beats move the market (the day after a mission is done). */
function storyShocks(s: Story | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!s) return out;
  const day = (id: string): number | undefined => s.st.missions[id]?.day;
  const add = (mission: string, ticker: string, pct: number): void => { const d = day(mission); if (d !== undefined) out[`${ticker}:${d + 1}`] = (out[`${ticker}:${d + 1}`] ?? 0) + pct; };
  add('m30', 'MRDN', -0.18); add('m30', 'DSKR', 0.12);
  add('m33', 'MRDN', -0.25); add('m33', 'VSAV', -0.1);
  add('m36', 'MRDN', -0.3);
  add('m25', 'LUCK', -0.12);
  return out;
}

export interface Holding { id: string; shares: number; cost: number }

/** The exchange was trading long before the story starts: this many days of history exist before day 0. */
const PAST = 90;

/** Market state and trading. Holdings live in the save (story activity record "stocks"). */
export class Market {
  private closes = new Map<string, number[]>();
  private keyCache = '';

  constructor(private readonly s: Story) {}

  private get rec() { return (this.s.st.acts['stocks'] ??= { plays: 0, wins: 0, best: 0, ext: {} }); }
  get day(): number { return this.s.g.commerce!.eco.p.day; }
  get hour(): number { return this.s.g.world.tod.hour; }

  /** Everything that moves a close: story beats, news, and the player's own doings (stored per day). */
  private shocks(): Record<string, number> {
    const out = storyShocks(this.s);
    for (const [k, v] of Object.entries(this.rec.ext)) if (k.startsWith('s:')) { const key = k.slice(2); out[key] = (out[key] ?? 0) + v / 1000; }
    return out;
  }

  /** Daily closes from day 0 to today (cached until something changes). */
  private series(id: string): number[] {
    const day = this.day;
    const sh = this.shocks();
    const key = `${day}|${JSON.stringify(sh)}`;
    if (key !== this.keyCache) { this.closes.clear(); this.keyCache = key; }
    let c = this.closes.get(id);
    if (c && c.length > day + PAST) return c;
    const t = TICKER_BY_ID[id]!;
    const i = TICKERS.indexOf(t);
    const news = new Map<string, number>();
    // c[k] is the close of day k - PAST; the walk starts near the base price a season before the story
    c = [t.base * (0.85 + hash(i, 999) * 0.3)];
    for (let k = 1; k <= day + PAST; k++) {
      const d = k - PAST;
      if (!news.has(`${d}`)) for (const n of newsOn(d)) news.set(`${n.id}:${d}`, n.shock), news.set(`${d}`, 1);
      const r = (hash(i * 97 + 13, d) + hash(i * 31 + 7, d * 3) - 1) * t.vol * 1.7;
      // gently pulled back toward a slowly rising fair value so nothing wanders off forever
      const fair = t.base * Math.pow(1 + t.drift, d);
      const pull = Math.log(fair / c[k - 1]!) * 0.04;
      let p = c[k - 1]! * (1 + r + pull + (sh[`${id}:${d}`] ?? 0) + (news.get(`${id}:${d}`) ?? 0));
      p = Math.max(0.5, p);
      c.push(Math.round(p * 100) / 100);
    }
    this.closes.set(id, c);
    return c;
  }

  close(id: string, day: number): number { const c = this.series(id); return c[Math.max(0, Math.min(day + PAST, c.length - 1))]!; }

  /** The live price: yesterday's close wandering to today's as the hours pass (markets trade 6 AM to 6 AM). */
  price(id: string): number {
    const day = this.day;
    const open = this.close(id, day - 1), close = this.close(id, day);
    let t = ((this.hour - 6 + 24) % 24) / 24;
    t = Math.min(1, Math.max(0, t));
    const i = TICKERS.findIndex((x) => x.id === id);
    const vol = TICKER_BY_ID[id]!.vol;
    // a wiggle that is zero at the open and at the close
    const w = Math.sin(t * Math.PI) * vol * 0.5 * (Math.sin(t * 17 + i * 3.1 + day) * 0.6 + Math.sin(t * 41 + i * 7.3 + day * 2) * 0.4);
    const p = (open + (close - open) * (t * t * (3 - 2 * t))) * (1 + w);
    return Math.round(Math.max(0.5, p) * 100) / 100;
  }

  /** Change since yesterday's close, in percent. */
  change(id: string): number { const o = this.close(id, this.day - 1); return ((this.price(id) - o) / o) * 100; }

  /** The last `n` daily closes ending with today's live price. */
  history(id: string, n = 30): number[] {
    const day = this.day;
    const out: number[] = [];
    for (let d = day - n + 1; d < day; d++) out.push(this.close(id, d));
    out.push(this.price(id));
    return out;
  }

  /** Today's intraday path so far (hourly samples). */
  intraday(id: string): number[] {
    const day = this.day;
    const open = this.close(id, day - 1), close = this.close(id, day);
    const i = TICKERS.findIndex((x) => x.id === id);
    const vol = TICKER_BY_ID[id]!.vol;
    const now = ((this.hour - 6 + 24) % 24) / 24;
    const out: number[] = [];
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      if (t > now + 1e-6) break;
      const w = Math.sin(t * Math.PI) * vol * 0.5 * (Math.sin(t * 17 + i * 3.1 + day) * 0.6 + Math.sin(t * 41 + i * 7.3 + day * 2) * 0.4);
      out.push((open + (close - open) * (t * t * (3 - 2 * t))) * (1 + w));
    }
    out.push(this.price(id));
    return out;
  }

  /** The VEX 14 index: the average move of every company since day 0, scaled to 1,000. */
  index(): number {
    let s = 0;
    for (const t of TICKERS) s += this.price(t.id) / t.base;
    return (s / TICKERS.length) * 1000;
  }

  indexChange(): number {
    let a = 0, b = 0;
    for (const t of TICKERS) { a += this.price(t.id) / t.base; b += this.close(t.id, this.day - 1) / t.base; }
    return ((a - b) / b) * 100;
  }

  /** Recent company news, newest first. */
  news(days = 7): NewsItem[] {
    const out: NewsItem[] = [];
    for (let d = this.day; d >= this.day - days; d--) out.push(...newsOn(d).filter(() => d < this.day || this.hour >= 9));
    for (const [k, v] of Object.entries(this.rec.ext)) {
      if (!k.startsWith('n:')) continue;
      const [, id, d] = k.split(':');
      const day = Number(d);
      if (day >= this.day - days) out.push({ day, id: id!, text: PLAYER_NEWS[id!]?.(v) ?? `${TICKER_BY_ID[id!]?.name} under pressure`, shock: 0 });
    }
    return out.sort((a, b) => b.day - a.day);
  }

  // ------------------------------------------------------------------------------------------------ the player

  holding(id: string): Holding {
    const e = this.rec.ext;
    return { id, shares: e['h:' + id] ?? 0, cost: e['c:' + id] ?? (e['h:' + id] ?? 0) * TICKER_BY_ID[id]!.base };
  }

  holdings(): Holding[] { return TICKERS.map((t) => this.holding(t.id)).filter((h) => h.shares > 0); }

  portfolioValue(): number { let v = 0; for (const h of this.holdings()) v += h.shares * this.price(h.id); return v; }

  readonly FEE = 5;

  /** Buy `n` shares (paid from cash, then the bank). */
  buy(id: string, n: number): boolean {
    const eco = this.s.g.commerce!.eco;
    if (n <= 0) return false;
    const cost = Math.round(n * this.price(id) * 100) / 100 + this.FEE;
    if (!eco.charge(Math.round(cost), `Bought ${n} ${id}`)) return false;
    const e = this.rec.ext;
    e['h:' + id] = (e['h:' + id] ?? 0) + n;
    e['c:' + id] = (e['c:' + id] ?? 0) + cost;
    this.rec.plays++;
    return true;
  }

  /** Sell `n` shares; the proceeds go to the bank account. Returns profit on those shares. */
  sell(id: string, n: number): number {
    const eco = this.s.g.commerce!.eco;
    const h = this.holding(id);
    n = Math.min(n, h.shares);
    if (n <= 0) return 0;
    const proceeds = Math.round(n * this.price(id)) - this.FEE;
    const basis = h.shares ? (h.cost / h.shares) * n : 0;
    eco.earn(proceeds, `Sold ${n} ${id}`);
    eco.deposit(proceeds);
    const e = this.rec.ext;
    e['h:' + id] = h.shares - n;
    e['c:' + id] = Math.max(0, h.cost - basis);
    const profit = proceeds - basis;
    if (profit > 0) this.rec.wins++;
    this.rec.best = Math.max(this.rec.best, Math.round(profit));
    return profit;
  }

  /** Something the player did hits a company's share price at tomorrow's close. */
  event(id: string, pct: number): void {
    if (!TICKER_BY_ID[id]) return;
    const d = this.day + 1;
    const e = this.rec.ext;
    e[`s:${id}:${d}`] = (e[`s:${id}:${d}`] ?? 0) + Math.round(pct * 1000);
    e[`n:${id}:${this.day}`] = (e[`n:${id}:${this.day}`] ?? 0) + 1;
    // keep the save small: forget player events older than two months
    for (const k of Object.keys(e)) {
      if (!k.startsWith('s:') && !k.startsWith('n:')) continue;
      const day = Number(k.split(':')[2]);
      if (day < this.day - 60) delete e[k];
    }
  }
}

/** Headlines for the things you did. */
const PLAYER_NEWS: Record<string, (n: number) => string> = {
  PTRL: (n) => `${n > 1 ? `${n} Petrolia stations` : 'A Petrolia station'} held up at gunpoint; investors nervous`,
  FRSH: (n) => `${n > 1 ? 'A string of' : 'Another'} robberies at FreshMart stores`,
  MORS: (n) => `${n > 3 ? 'Dozens of' : 'More'} cars destroyed in police chases; Mors Mutual braces for claims`,
  BRAS: () => 'Shootings in Valeria drive a rush on gun stores',
  VMTR: () => 'Valeria Motors reports brisk sales',
  RDLN: () => 'Car thefts up; Redline Customs busier than ever',
};
