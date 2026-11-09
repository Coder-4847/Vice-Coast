import { money } from '../economy/Economy';
import { h } from './dom';
import { MenuNav } from './MenuNav';

export interface RowSpec {
  label: string;
  sub?: string;
  right?: string;
  /** A colour chip shown before the label. */
  swatch?: string;
  badge?: string;
  disabled?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

export interface Page {
  title: string;
  kicker?: string;
  /** 'full' = centred panel on a dimmed backdrop; 'side' = a narrow panel that leaves the world visible. */
  layout?: 'full' | 'side';
  /** Shown top-right instead of the money counter. */
  hideMoney?: boolean;
  /** Builds the page content. Call `refresh()` after changing state. */
  render(host: PageHost): void;
  /** Footer hints. */
  hints?: string;
  onClose?: () => void;
}

export interface PageHost {
  body: HTMLElement;
  refresh(): void;
  push(page: Page): void;
  back(): void;
  close(): void;
  toast(text: string): void;
}

export const btn = (label: string, cls = '', onClick?: () => void): HTMLButtonElement => {
  const b = h('button', `btn ${cls}`.trim(), label);
  b.type = 'button';
  b.dataset.navRow = '';
  if (onClick) b.addEventListener('click', onClick);
  return b;
};

export const row = (r: RowSpec): HTMLButtonElement => {
  const e = h('button', `m-row${r.selected ? ' on' : ''}${r.disabled ? ' off' : ''}`);
  e.type = 'button';
  e.dataset.navRow = '';
  if (r.swatch) e.append(h('i', 'm-chip')), (e.firstChild as HTMLElement).style.background = r.swatch;
  const main = h('span', 'm-main', h('span', 'm-label', r.label), r.sub ? h('span', 'm-sub', r.sub) : null);
  e.append(main);
  if (r.badge) e.append(h('span', 'm-badge', r.badge));
  if (r.right) e.append(h('span', 'm-right', r.right));
  if (r.disabled) e.setAttribute('aria-disabled', 'true');
  e.addEventListener('click', () => { if (!r.disabled) r.onClick?.(); });
  return e;
};

export const section = (title: string): HTMLElement => h('div', 'm-section', title);

/** A row of colour chips (paint, rims, hair…). */
export const swatches = (items: { name: string; value: string; price?: number }[], current: string | null, pick: (i: number) => void, owned?: (i: number) => boolean): HTMLElement => {
  const g = h('div', 'm-swatches');
  g.dataset.navRow = '';
  items.forEach((it, i) => {
    const b = h('button', `m-sw${current === it.value ? ' on' : ''}${owned && !owned(i) && (it.price ?? 0) > 0 ? ' locked' : ''}`);
    b.type = 'button';
    b.title = it.price ? `${it.name} · ${money(it.price)}` : it.name;
    b.setAttribute('aria-label', b.title);
    b.style.background = it.value;
    b.addEventListener('click', () => pick(i));
    g.append(b);
  });
  return g;
};

/** A "‹ value ›" selector in one nav row. */
export const stepper = (label: string, value: string, price: string | null, prev: () => void, next: () => void): HTMLElement => {
  const l = btn('‹', 'icon', prev), r = btn('›', 'icon', next);
  l.dataset.navRow = ''; r.dataset.navRow = '';
  const wrap = h('div', 'm-step', h('span', 'm-step-label', label), l, h('span', 'm-step-val', value), r, price ? h('span', 'm-step-price', price) : null);
  wrap.dataset.navRow = '';
  return wrap;
};

/**
 * The shared shell for shops, banks, the garage and the phone's full-screen apps: a page stack with a money counter,
 * keyboard / pad navigation, and "side" pages that leave the 3D scene visible for the customisation views.
 */
export class Modal {
  readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly head: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly kickerEl: HTMLElement;
  private readonly moneyEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly footEl: HTMLElement;
  private readonly nav: MenuNav;
  private readonly stack: Page[] = [];
  private shown = 0;
  private target = 0;
  private raf = 0;
  onEmpty: (() => void) | null = null;
  /** Current cash for the counter (set by the owner). */
  cash: () => number = () => 0;

  constructor(parent: HTMLElement) {
    this.titleEl = h('h2', '');
    this.kickerEl = h('span', 'kicker');
    this.moneyEl = h('span', 'm-money', '$0');
    this.head = h('div', 'panel-head', h('div', 'm-titles', this.titleEl, this.kickerEl), this.moneyEl);
    this.bodyEl = h('div', 'm-body');
    this.footEl = h('div', 'm-foot');
    this.panel = h('div', 'panel-glass m-panel', this.head, this.bodyEl, this.footEl);
    this.root = h('div', 'modal is-hidden', this.panel);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    parent.append(this.root);
    this.nav = new MenuNav(this.root);
  }

  get active(): boolean { return this.stack.length > 0; }
  get top(): Page | null { return this.stack[this.stack.length - 1] ?? null; }

  open(page: Page): void {
    this.stack.length = 0;
    this.stack.push(page);
    this.root.classList.remove('is-hidden');
    this.shown = this.cash();
    this.render(true);
  }

  push(page: Page): void {
    this.stack.push(page);
    this.render(true);
  }

  back(): void {
    const p = this.stack.pop();
    p?.onClose?.();
    if (!this.stack.length) { this.finish(); return; }
    this.render(true);
  }

  close(): void {
    while (this.stack.length) this.stack.pop()?.onClose?.();
    this.finish();
  }

  private finish(): void {
    this.root.classList.add('is-hidden');
    cancelAnimationFrame(this.raf);
    this.onEmpty?.();
  }

  refresh(): void { this.render(false); }

  navigate(dx: number, dy: number): void { this.nav.move(dx, dy); }
  confirm(): void { this.nav.confirm(); }

  /** Called whenever cash changes; counts the number up or down. */
  setCash(n: number): void {
    this.target = n;
    if (!this.raf && this.active) this.tick();
  }

  private tick = (): void => {
    const d = this.target - this.shown;
    this.shown = Math.abs(d) < 1 ? this.target : this.shown + d * 0.2;
    this.moneyEl.textContent = money(this.shown);
    this.raf = Math.abs(this.target - this.shown) >= 1 ? requestAnimationFrame(this.tick) : 0;
  };

  private render(focus: boolean): void {
    const page = this.top;
    if (!page) return;
    const scroll = this.bodyEl.scrollTop;
    this.panel.dataset.layout = page.layout ?? 'full';
    this.root.dataset.layout = page.layout ?? 'full';
    this.titleEl.textContent = page.title;
    this.kickerEl.textContent = page.kicker ?? '';
    this.moneyEl.classList.toggle('is-hidden', !!page.hideMoney);
    this.target = this.cash();
    this.shown = this.target;
    this.moneyEl.textContent = money(this.target);
    this.footEl.textContent = '';
    this.footEl.append(h('span', 'm-hint', page.hints ?? 'Esc / B  back'));
    const focusedIdx = [...this.bodyEl.querySelectorAll('[data-nav-row]')].findIndex((e) => e === document.activeElement || e.contains(document.activeElement));
    this.bodyEl.textContent = '';
    this.bodyEl.className = 'm-body';
    page.render({
      body: this.bodyEl,
      refresh: () => this.refresh(),
      push: (p) => this.push(p),
      back: () => this.back(),
      close: () => this.close(),
      toast: (t) => this.toastFn?.(t),
    });
    if (focus) this.nav.focusFirst();
    else {
      const rows = [...this.bodyEl.querySelectorAll<HTMLElement>('[data-nav-row]')];
      const next = rows[Math.min(Math.max(0, focusedIdx), rows.length - 1)];
      (next?.matches('button') ? next : next?.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true });
      this.bodyEl.scrollTop = scroll;
    }
  }

  toastFn: ((t: string) => void) | null = null;
}
