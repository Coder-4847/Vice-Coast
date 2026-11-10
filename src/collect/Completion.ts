import type { Story } from '../story/Story';
import { MISSIONS } from '../story/content/missions';
import { HEISTS } from '../story/content/heists';
import { ACTS, ACT_GROUPS } from '../activities/defs';
import { CKINDS, KINDS } from './defs';
import { money } from '../economy/Economy';
import { h } from '../ui/dom';

export interface Category {
  id: string;
  name: string;
  /** Share of the overall percentage. */
  weight: number;
  done: number;
  total: number;
  detail: string;
}

export const MILESTONES: { pct: number; pay: number }[] = [
  { pct: 10, pay: 5000 }, { pct: 25, pay: 15000 }, { pct: 50, pay: 40000 }, { pct: 75, pay: 100000 }, { pct: 100, pay: 250000 },
];

/** The completion tracker: story, gold medals, heists, robberies, activities and collectibles rolled into one percentage. */
export class Completion {
  private t = 0;
  constructor(private readonly s: Story) {}

  categories(): Category[] {
    const s = this.s, st = s.st;
    const missions = MISSIONS.filter((m) => !m.hidden);
    const golds = missions.filter((m) => m.gold.length);
    const goldDone = golds.filter((m) => { const r = st.missions[m.id]; return !!r && m.gold.every((g) => r.medals.includes(g.id)); }).length;
    const mDone = missions.filter((m) => s.done(m.id)).length;
    const hDone = HEISTS.filter((x) => st.heists[x.id]?.done).length;
    const robGoal = 12;
    let actDone = 0, actGoal = 0;
    for (const a of ACTS) { actGoal += a.goal; actDone += Math.min(a.goal, st.acts[a.id]?.wins ?? 0); }
    const colDone = s.collect.foundAll, colTotal = s.collect.totalAll;
    return [
      { id: 'story', name: 'Story missions', weight: 30, done: mDone, total: missions.length, detail: `${mDone} of ${missions.length} missions` },
      { id: 'gold', name: 'Gold medals', weight: 5, done: goldDone, total: golds.length, detail: `${goldDone} of ${golds.length} gold` },
      { id: 'heists', name: 'Heists', weight: 15, done: hDone, total: HEISTS.length, detail: `${hDone} of ${HEISTS.length} heists` },
      { id: 'rob', name: 'Robberies', weight: 5, done: Math.min(robGoal, st.rob.count), total: robGoal, detail: `${Math.min(robGoal, st.rob.count)} of ${robGoal} robberies` },
      { id: 'act', name: 'Side activities', weight: 25, done: actDone, total: actGoal, detail: `${actDone} of ${actGoal} goals` },
      { id: 'collect', name: 'Collectibles', weight: 20, done: colDone, total: colTotal, detail: `${colDone} of ${colTotal} found` },
    ];
  }

  /** 0–100, one decimal. */
  percent(cats = this.categories()): number {
    let p = 0;
    for (const c of cats) p += c.weight * (c.total ? c.done / c.total : 0);
    return Math.round(p * 10) / 10;
  }

  /** Pay out milestones that were reached. Safe to call often. */
  check(): void {
    const s = this.s;
    const pct = this.percent();
    for (const m of MILESTONES) {
      const key = `pct.${m.pct}`;
      if (pct + 1e-6 < m.pct || s.st.claimed.includes(key)) continue;
      s.st.claimed.push(key);
      s.g.commerce!.eco.earn(m.pay, `${m.pct}% complete`);
      s.g.ui.toast(`${m.pct}% complete: +${money(m.pay)}`);
      s.hud.showBanner('Completion milestone', `${m.pct}% COMPLETE`, `+${money(m.pay)}`, 'good', 4);
    }
  }

  update(dt: number): void {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 5;
    this.check();
  }

  /** Builds the tracker into `el` (the pause menu's Progress tab and the phone app). */
  render(el: HTMLElement, opts: { onMark?: (kind: string) => void } = {}): void {
    const cats = this.categories();
    const pct = this.percent(cats);
    el.textContent = '';
    const big = h('div', 'cp-big', h('b', '', `${pct.toFixed(1)}%`), h('span', '', 'Overall completion'));
    const bar = h('div', 'cp-bar big', h('i', ''));
    (bar.firstChild as HTMLElement).style.width = `${pct}%`;
    el.append(big, bar);
    const next = MILESTONES.find((m) => !this.s.st.claimed.includes(`pct.${m.pct}`));
    el.append(h('p', 'm-info', next ? `Next reward: ${money(next.pay)} at ${next.pct}%.` : 'Every milestone reward has been paid.'));
    el.append(h('div', 'm-section', 'Progress'));
    for (const c of cats) el.append(this.bar(c.name, c.total ? c.done / c.total : 0, c.detail, `${Math.round((c.total ? c.done / c.total : 0) * c.weight * 10) / 10} / ${c.weight}%`));
    el.append(h('div', 'm-section', 'Collectibles'));
    const col = this.s.collect;
    for (const k of CKINDS) {
      const info = KINDS[k];
      const n = col.count(k), t = col.total(k);
      const b = this.bar(`${info.glyph}  ${info.plural}`, t ? n / t : 0, `${n} / ${t}`, n >= t ? `Bonus ${money(info.set)} paid` : `${money(info.pay)} each · set bonus ${money(info.set)}`);
      b.title = info.how;
      if (opts.onMark && n < t) { b.classList.add('act'); b.addEventListener('click', () => opts.onMark?.(k)); b.tabIndex = 0; b.dataset.navRow = ''; }
      el.append(b);
    }
    el.append(h('div', 'm-section', 'Side activities'));
    for (const g of ACT_GROUPS) {
      const list = ACTS.filter((a) => a.group === g);
      const done = list.reduce((n, a) => n + Math.min(a.goal, this.s.st.acts[a.id]?.wins ?? 0), 0), tot = list.reduce((n, a) => n + a.goal, 0);
      el.append(this.bar(g, tot ? done / tot : 0, `${done} / ${tot}`, list.map((a) => `${a.name} ${Math.min(a.goal, this.s.st.acts[a.id]?.wins ?? 0)}/${a.goal}`).join(' · ')));
    }
  }

  private bar(label: string, frac: number, right: string, sub: string): HTMLElement {
    const fill = h('i', '');
    fill.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
    return h('div', 'cp-row', h('div', 'cp-head', h('span', '', label), h('b', '', right)), h('div', 'cp-bar', fill), h('small', '', sub));
  }
}
