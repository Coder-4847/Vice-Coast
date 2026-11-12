import { h } from './dom';
import { MenuNav } from './MenuNav';

export interface PauseStatus {
  who: string;
  color: string;
  role: string;
  cash: string;
  bank: string;
  place: string;
  clock: string;
  day: number;
  completion: number;
  mission: string | null;
}

export interface PauseHooks {
  resume(): void;
  map(): void;
  progress(): void;
  settings(): void;
  save(): void;
  photo(): void;
  quit(): void;
  blip(kind: 'move' | 'ok' | 'back'): void;
}

/** The landing page of the pause menu: big choices on the left, a status card on the right. */
export class PauseHome {
  readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly status: HTMLElement;
  private readonly nav: MenuNav;
  private readonly hint: HTMLElement;
  private confirmQuit = false;

  constructor(parent: HTMLElement, private readonly hooks: PauseHooks) {
    this.list = h('nav', 'ph-list');
    this.status = h('aside', 'pz-status');
    this.hint = h('div', 'mm-hint', '');
    this.root = h('div', 'screen pausehome is-hidden',
      h('div', 'pz-shade'),
      h('div', 'pz-left', h('div', 'pz-title', h('span', '', 'Paused')), this.list),
      this.status,
      h('footer', 'mm-foot', this.hint, h('span', 'mm-ver', 'Vice Coast')),
    );
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Pause menu');
    parent.append(this.root);
    this.nav = new MenuNav(this.root);
    this.root.addEventListener('focusin', (e) => {
      const t = e.target as HTMLElement;
      if (!t.classList.contains('mm-item')) return;
      for (const b of this.list.querySelectorAll('.mm-item.sel')) b.classList.remove('sel');
      t.classList.add('sel');
      hooks.blip('move');
    });
  }

  get isOpen(): boolean { return !this.root.classList.contains('is-hidden'); }

  open(st: PauseStatus, canSave: boolean): void {
    this.confirmQuit = false;
    this.list.textContent = '';
    const item = (label: string, sub: string, act: () => void, cls = '', disabled = false): HTMLButtonElement => {
      const b = h('button', `mm-item ${cls}`.trim(), h('span', 'mm-label', label), h('span', 'mm-sub', sub));
      b.type = 'button';
      b.dataset.navRow = '';
      b.disabled = disabled;
      b.addEventListener('click', () => { this.hooks.blip('ok'); act(); });
      b.addEventListener('pointerenter', () => { if (!b.disabled) b.focus({ preventScroll: true }); });
      this.list.append(b);
      return b;
    };
    item('Resume', 'Back to the city', () => this.hooks.resume());
    item('Map', 'Waypoints, places and blips', () => this.hooks.map());
    item('Progress', `${st.completion.toFixed(1)}% complete`, () => this.hooks.progress());
    item('Save Game', canSave ? 'Choose a slot' : 'Not during a mission or a chase', () => this.hooks.save(), '', !canSave);
    item('Photo Mode', 'Free camera, filters, screenshots', () => this.hooks.photo());
    item('Settings', 'Graphics, controls, audio, accessibility', () => this.hooks.settings());
    const q = item('Quit to Main Menu', 'Unsaved progress since the last save is lost', () => {
      if (!this.confirmQuit) { this.confirmQuit = true; q.querySelector('.mm-sub')!.textContent = 'Select again to quit'; q.classList.add('danger'); return; }
      this.hooks.quit();
    });

    const pct = Math.max(0, Math.min(100, st.completion));
    const bar = h('div', 'pz-bar', h('i', ''));
    (bar.firstChild as HTMLElement).style.width = `${pct}%`;
    this.status.textContent = '';
    this.status.style.setProperty('--who', st.color);
    this.status.append(
      h('div', 'pz-who', h('b', '', st.who), h('span', '', st.role)),
      h('div', 'pz-money', h('div', '', h('span', '', 'Cash'), h('b', '', st.cash)), h('div', '', h('span', '', 'Bank'), h('b', '', st.bank))),
      h('div', 'pz-where', h('span', '', st.place), h('span', '', `Day ${st.day} · ${st.clock}`)),
      ...(st.mission ? [h('div', 'pz-mission', h('span', '', 'On a mission'), h('b', '', st.mission))] : []),
      h('div', 'pz-comp', h('div', 'pz-comp-top', h('span', '', 'Completion'), h('b', '', `${pct.toFixed(1)}%`)), bar),
    );
    this.root.classList.remove('is-hidden');
    this.list.querySelector('.mm-item')?.classList.add('sel');
    this.list.querySelector<HTMLElement>('.mm-item')?.focus({ preventScroll: true });
  }

  close(): void {
    this.root.classList.add('is-hidden');
    (document.activeElement as HTMLElement | null)?.blur();
  }

  setDevice(d: 'kbm' | 'gamepad'): void {
    this.hint.textContent = d === 'gamepad' ? 'D-pad  select   ·   A  confirm   ·   B  resume' : '↑ ↓  select   ·   Enter  confirm   ·   Esc  resume';
  }

  navigate(dx: number, dy: number): void { this.nav.move(dx, dy); }
  confirm(): void { this.nav.confirm(); }
  refocus(): void { this.list.querySelector<HTMLElement>('.mm-item')?.focus({ preventScroll: true }); }
}
