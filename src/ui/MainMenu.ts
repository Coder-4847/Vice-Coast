import type { SaveData, SlotInfo } from '../economy/types';
import { money } from '../economy/Economy';
import { h } from './dom';
import { MenuNav } from './MenuNav';

export interface MainMenuHooks {
  slots(): Promise<SlotInfo[]>;
  read(slot: number): Promise<SaveData | null>;
  remove(slot: number): Promise<void>;
  /** Start playing: a fresh game in `slot` (data null) or a loaded one. */
  start(slot: number, data: SaveData | null): void;
  settings(): void;
  /** The full slot manager (import / export / delete). */
  manage(): void;
  /** UI sounds. */
  blip(kind: 'move' | 'ok' | 'back'): void;
}

type Panel = 'home' | 'new' | 'load' | 'howto' | 'credits';

const ago = (t: number): string => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 * 2) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};
const played = (sec: number): string => { const m = Math.floor(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };

const CONTROLS: [string, string, string][] = [
  ['Move · look', 'W A S D · mouse', 'Left stick · right stick'],
  ['Sprint · crouch · jump', 'Shift · C · Space', 'L3 · R3 · A'],
  ['Aim · fire · reload', 'Right · left mouse · R', 'LT · RT · X'],
  ['Weapon wheel', 'Tab (hold)', 'LB (hold)'],
  ['Enter / exit vehicle · interact', 'E', 'Y'],
  ['Drive · brake · handbrake', 'W · S · Space', 'RT · LT · A'],
  ['Shoot from a vehicle', 'Hold right mouse, left mouse fires', 'Hold LB, RB fires'],
  ['Phone', 'T', 'D-pad ↑'],
  ['Map', 'M', 'View'],
  ['Switch character · ability', 'Z · X', 'D-pad ← · RB'],
  ['Radio (in a vehicle)', 'Q', 'LB (tap)'],
  ['Pause', 'Esc', 'Start'],
];

/**
 * The main menu over the coastal fly-by: Continue, New Game, Load Game, Settings, How to Play, Credits.
 * Keyboard, mouse and gamepad (via `nav`) all work; the right-hand panel swaps per item.
 */
export class MainMenu {
  readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly nav: MenuNav;
  private readonly hint: HTMLElement;
  private slotsCache: SlotInfo[] = [];
  private view: Panel = 'home';
  private busy = false;

  constructor(parent: HTMLElement, private readonly hooks: MainMenuHooks) {
    const logo = h('div', 'mm-brand',
      h('div', 'mm-kicker', 'San Verano'),
      h('h1', 'mm-logo', h('span', 'mm-vice', 'Vice'), h('span', 'mm-coast', 'Coast')),
      h('div', 'mm-rule'),
    );
    this.list = h('nav', 'mm-list');
    this.list.setAttribute('aria-label', 'Main menu');
    this.panel = h('section', 'mm-panel');
    this.hint = h('div', 'mm-hint', '');
    const foot = h('footer', 'mm-foot', this.hint, h('span', 'mm-ver', 'v1.0 · Made in the browser'));
    this.root = h('div', 'screen mainmenu is-hidden', h('div', 'mm-shade'), h('div', 'mm-left', logo, this.list), this.panel, foot);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Vice Coast main menu');
    parent.append(this.root);
    this.nav = new MenuNav(this.root);
    this.root.addEventListener('focusin', (e) => {
      const t = e.target as HTMLElement;
      if (t.classList.contains('mm-item')) {
        for (const b of this.list.querySelectorAll('.mm-item.sel')) b.classList.remove('sel');
        t.classList.add('sel');
        this.hooks.blip('move');
        this.preview(t.dataset.id as Panel | 'continue' | 'settings');
      }
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); this.back(); }
    });
  }

  get isOpen(): boolean { return !this.root.classList.contains('is-hidden'); }

  async show(): Promise<void> {
    this.root.classList.remove('is-hidden');
    await this.refresh();
    (this.list.querySelector<HTMLElement>('.mm-item') ?? this.list).focus({ preventScroll: true });
  }

  hide(): void {
    this.root.classList.add('is-hidden');
    (document.activeElement as HTMLElement | null)?.blur();
  }

  setDevice(d: 'kbm' | 'gamepad'): void {
    this.hint.textContent = d === 'gamepad' ? 'D-pad  select   ·   A  confirm   ·   B  back' : '↑ ↓  select   ·   Enter  confirm   ·   Esc  back';
  }

  /** Gamepad / keyboard from the game loop. */
  navigate(dx: number, dy: number): void { this.nav.move(dx, dy); }
  confirm(): void { this.nav.confirm(); }
  back(): void {
    if (this.view !== 'home') { this.hooks.blip('back'); this.view = 'home'; this.renderPanel(); this.focusItem(); }
  }

  private latest(): SlotInfo | null {
    return this.slotsCache.filter((s) => !s.empty).sort((a, b) => b.savedAt - a.savedAt)[0] ?? null;
  }

  private async refresh(): Promise<void> {
    try { this.slotsCache = await this.hooks.slots(); } catch { this.slotsCache = []; }
    this.list.textContent = '';
    const last = this.latest();
    const item = (id: string, label: string, sub: string, act: () => void): void => {
      const b = h('button', 'mm-item', h('span', 'mm-label', label), h('span', 'mm-sub', sub));
      b.type = 'button';
      b.dataset.navRow = '';
      b.dataset.id = id;
      b.addEventListener('click', () => { if (this.busy) return; this.hooks.blip('ok'); act(); });
      b.addEventListener('pointerenter', () => b.focus({ preventScroll: true }));
      this.list.append(b);
    };
    if (last) item('continue', 'Continue', `Slot ${last.slot} · ${last.label}`, () => void this.load(last.slot));
    item('new', 'New Game', 'Begin in Pinecrest, nine years ago', () => this.open('new'));
    item('load', 'Load Game', `${this.slotsCache.filter((s) => !s.empty).length} of 3 slots in use`, () => this.open('load'));
    item('settings', 'Settings', 'Graphics, controls, audio, accessibility', () => this.hooks.settings());
    item('howto', 'How to Play', 'Controls and the basics', () => this.open('howto'));
    item('credits', 'Credits', 'Who and what made this', () => this.open('credits'));
    this.view = 'home';
    this.lastItem = this.list.querySelector<HTMLElement>('.mm-item')?.dataset.id ?? 'new';
    this.list.querySelector('.mm-item')?.classList.add('sel');
    this.renderPanel();
  }

  private focusItem(): void {
    const cur = this.list.querySelector<HTMLElement>(`.mm-item[data-id="${this.lastItem}"]`) ?? this.list.querySelector<HTMLElement>('.mm-item');
    cur?.focus({ preventScroll: true });
  }

  private lastItem = 'continue';

  private preview(id: Panel | 'continue' | 'settings'): void {
    this.lastItem = id;
    if (this.view !== 'home') return;
    this.renderPanel(id);
  }

  private open(p: Panel): void {
    this.view = p;
    this.renderPanel();
    const first = this.panel.querySelector<HTMLElement>('[data-nav-row] button, button[data-nav-row]');
    first?.focus({ preventScroll: true });
  }

  private async load(slot: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const data = await this.hooks.read(slot);
      if (data) this.hooks.start(slot, data);
    } finally { this.busy = false; }
  }

  private renderPanel(preview?: string): void {
    const p = this.panel;
    p.textContent = '';
    p.dataset.view = this.view;
    const card = (title: string, ...kids: (Node | string | null)[]): HTMLElement => h('div', 'mm-card', h('h2', '', title), ...kids);
    const back = (): HTMLElement => { const b = h('button', 'mm-back', '‹  Back'); b.type = 'button'; b.dataset.navRow = ''; b.addEventListener('click', () => this.back()); return b; };

    if (this.view === 'home') {
      const id = preview ?? this.lastItem;
      const last = this.latest();
      if (id === 'continue' && last) {
        p.append(card('Continue', h('p', 'mm-big', last.label), h('div', 'mm-stats',
          stat('Cash', money(last.cash)), stat('Bank', money(last.bank)), stat('Properties', String(last.props)), stat('Cars', String(last.cars)), stat('Played', played(last.playSeconds)), stat('Saved', ago(last.savedAt)))));
      } else if (id === 'new') {
        p.append(card('A new story', h('p', '', 'Winter, 2011. Three men, a sawmill payroll in Pinecrest Bay and a snowstorm. Nine years later, Marcus "Mack" Delgado parks cars for a living — until somebody remembers his name.'), h('p', 'mm-muted', 'Three playable characters · 38 missions · 6 heists · a whole coast to steal from.')));
      } else if (id === 'load') {
        p.append(card('Saved games', ...this.slotsCache.map((s) => h('div', `mm-slotline${s.empty ? ' empty' : ''}`, h('b', '', `Slot ${s.slot}`), h('span', '', s.empty ? 'Empty' : `${s.label} · ${ago(s.savedAt)}`)))));
      } else if (id === 'settings') {
        p.append(card('Settings', h('p', '', 'Quality presets, resolution scale, field of view, mouse and stick sensitivity, key and button bindings, subtitles, colour-blind modes, motion and volume.')));
      } else if (id === 'howto') {
        p.append(card('How to play', h('p', '', 'Follow the yellow beam to your next job, or ignore it and drive. Press M for the map and pick a waypoint; the GPS line follows the roads.')));
      } else {
        p.append(card('Credits', h('p', '', 'Built with three.js, Rapier and Vite. Every model, texture, song and sound effect is generated in code.')));
      }
      return;
    }

    if (this.view === 'new' || this.view === 'load') {
      const isNew = this.view === 'new';
      const rows = this.slotsCache.map((s) => {
        const b = h('button', `mm-slot${s.empty ? ' empty' : ''}`,
          h('div', 'mm-slot-top', h('b', '', `Slot ${s.slot}`), h('span', 'mm-muted', s.empty ? 'Empty' : ago(s.savedAt))),
          h('div', 'mm-slot-label', s.empty ? (isNew ? 'Start a new game here' : 'No save') : s.label),
          s.empty ? null : h('div', 'mm-slot-meta', `${money(s.cash + s.bank)} · ${s.props} properties · ${s.cars} cars · ${played(s.playSeconds)}`),
          !s.empty && isNew ? h('div', 'mm-warn', 'Starting here replaces this save') : null,
        );
        b.type = 'button';
        b.dataset.navRow = '';
        b.disabled = !isNew && s.empty;
        b.addEventListener('click', async () => {
          if (this.busy) return;
          this.hooks.blip('ok');
          if (isNew) {
            if (!s.empty && !b.classList.contains('confirm')) { b.classList.add('confirm'); b.querySelector('.mm-warn')!.textContent = 'Press again to overwrite this save'; return; }
            this.busy = true;
            if (!s.empty) await this.hooks.remove(s.slot);
            this.busy = false;
            this.hooks.start(s.slot, null);
          } else void this.load(s.slot);
        });
        return b;
      });
      const manage = h('button', 'mm-link', 'Import, export or delete saves…');
      manage.type = 'button';
      manage.dataset.navRow = '';
      manage.addEventListener('click', () => this.hooks.manage());
      p.append(h('div', 'mm-card', h('h2', '', isNew ? 'Choose a slot' : 'Load a game'), h('div', 'mm-slots', ...rows), h('div', 'mm-cardfoot', manage, back())));
      return;
    }

    if (this.view === 'howto') {
      const table = h('div', 'mm-keys', h('div', 'mm-keyhead', h('span', '', ''), h('span', '', 'Keyboard & mouse'), h('span', '', 'Controller')),
        ...CONTROLS.map(([a, k, g]) => h('div', 'mm-keyrow', h('span', '', a), h('kbd', '', k), h('kbd', '', g))));
      p.append(h('div', 'mm-card wide', h('h2', '', 'How to play'),
        h('p', '', 'Missions are the coloured beams on the map: walk into one and press E. Side jobs are flags, heists are planned on the board in Mack\'s flat. Switch between Mack, Imani and Teddy with Z once you have met them.'),
        h('p', 'mm-muted', 'Everything can be rebound in Settings → Controls. The game saves automatically at safehouses and after missions.'),
        table, back()));
      return;
    }

    p.append(h('div', 'mm-card', h('h2', '', 'Credits'),
      h('p', '', 'Vice Coast — an open-world crime game for the web.'),
      h('div', 'mm-credits',
        h('div', '', h('b', '', 'Engine'), h('span', '', 'three.js (MIT) · Rapier physics (Apache-2.0) · Vite + TypeScript')),
        h('div', '', h('b', '', 'Art'), h('span', '', 'Every model and texture is procedural: buildings, cars, aircraft, people, the sky and the sea.')),
        h('div', '', h('b', '', 'Sound & music'), h('span', '', 'All audio is synthesised live with Web Audio, including the six radio stations.')),
        h('div', '', h('b', '', 'Voices'), h('span', '', 'Your browser\'s text-to-speech, if you switch spoken dialogue on.')),
      ),
      back()));
  }
}

function stat(k: string, v: string): HTMLElement { return h('div', 'mm-stat', h('span', '', k), h('b', '', v)); }
