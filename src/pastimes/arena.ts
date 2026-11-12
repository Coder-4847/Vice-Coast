import { h } from '../ui/dom';
import { btn, type Page, type PageHost } from '../ui/Modal';

/** Logical buttons every sports mini-game understands. */
export type Key = 'left' | 'right' | 'up' | 'down' | 'act' | 'alt';

const CODES: Record<string, Key> = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'act', Enter: 'act', NumpadEnter: 'act', ShiftLeft: 'alt', ShiftRight: 'alt', KeyX: 'alt',
};

export interface ArenaButton { label: string; key: Key; cls?: string }

export interface Arena {
  readonly cv: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly w: number;
  readonly h: number;
  /** True while a key, on-screen button, stick or d-pad is held. */
  held(k: Key): boolean;
  /** -1 … 1 from left/right keys, buttons and the left stick. */
  axisX(): number;
  status(text: string): void;
  score(cells: [string, string][]): void;
  stop(): void;
  readonly running: boolean;
}

/**
 * A canvas game inside a modal page: keyboard (captured so the menu does not move), gamepad (through the page's
 * `pad` hooks plus held-stick polling) and on-screen buttons under the canvas (clickable with the mouse). `frame` runs every animation frame.
 */
export function arena(page: Page, host: PageHost, o: { w: number; h: number; buttons: ArenaButton[]; press(k: Key): void; frame(dt: number, t: number): void; intro?: string }): Arena {
  const cv = h('canvas', 'cg-canvas sport');
  cv.width = o.w; cv.height = o.h;
  const ctx = cv.getContext('2d')!;
  const scoreEl = h('div', 'm-balance sport-score');
  const statusEl = h('p', 'cg-msg', o.intro ?? '');
  const held = new Set<Key>();
  let running = true;
  let raf = 0;
  let last = performance.now();

  const press = (k: Key): void => { if (running) o.press(k); };
  const onDown = (e: KeyboardEvent): void => {
    const k = CODES[e.code];
    if (!k || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    held.add(k);
    if (!e.repeat) press(k);
  };
  const onUp = (e: KeyboardEvent): void => { const k = CODES[e.code]; if (k) held.delete(k); };
  window.addEventListener('keydown', onDown, true);
  window.addEventListener('keyup', onUp, true);

  const pads = (): Gamepad | null => {
    for (const g of navigator.getGamepads?.() ?? []) if (g && g.connected) return g;
    return null;
  };
  const padHeld = (k: Key): boolean => {
    const g = pads();
    if (!g) return false;
    const ax = g.axes[0] ?? 0, ay = g.axes[1] ?? 0;
    const b = (i: number): boolean => !!g.buttons[i]?.pressed;
    switch (k) {
      case 'left': return ax < -0.4 || b(14);
      case 'right': return ax > 0.4 || b(15);
      case 'up': return ay < -0.4 || b(12);
      case 'down': return ay > 0.4 || b(13);
      case 'act': return b(0) || b(7);
      case 'alt': return b(2) || b(6);
    }
  };

  const pad = h('div', 'sport-pad');
  for (const b of o.buttons) {
    const e = btn(b.label, `sport-btn ${b.cls ?? ''}`.trim());
    e.removeAttribute('data-nav-row');
    e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); held.add(b.key); press(b.key); });
    const up = (): void => { held.delete(b.key); };
    e.addEventListener('pointerup', up);
    e.addEventListener('pointerleave', up);
    e.addEventListener('pointercancel', up);
    // a mouse click on the button already fired on pointerdown; keyboard "click" should not double up
    e.addEventListener('click', (ev) => ev.preventDefault());
    pad.append(e);
  }
  const leave = btn('Leave', 'sport-leave', () => host.back());
  host.body.append(scoreEl, cv, statusEl, pad, leave);
  page.pad = {
    move: (dx, dy) => press(dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down'),
    confirm: () => press('act'),
  };

  const loop = (now: number): void => {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    o.frame(dt, now / 1000);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const a: Arena = {
    cv, ctx, w: o.w, h: o.h,
    held: (k) => held.has(k) || padHeld(k),
    axisX: () => {
      const g = pads();
      const stick = g && Math.abs(g.axes[0] ?? 0) > 0.2 ? g.axes[0]! : 0;
      return Math.max(-1, Math.min(1, (a.held('right') ? 1 : 0) - (a.held('left') ? 1 : 0) + stick));
    },
    status: (t) => { if (statusEl.textContent !== t) statusEl.textContent = t; },
    score: (cells) => {
      const sig = cells.map((c) => c.join(':')).join('|');
      if (scoreEl.dataset.sig === sig) return;
      scoreEl.dataset.sig = sig;
      scoreEl.textContent = '';
      for (const [k, v] of cells) scoreEl.append(h('div', 'm-kv', h('span', '', k), h('b', '', v)));
    },
    stop: () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      page.pad = undefined;
    },
    get running() { return running; },
  };
  return a;
}

/** Seeded random numbers (mulberry32), so a course or a lane is the same every visit. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** A rounded rectangle path. */
export function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + hh, r);
  c.arcTo(x + w, y + hh, x, y + hh, r);
  c.arcTo(x, y + hh, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** A horizontal meter with an optional target zone and a needle (0…1). */
export function meter(c: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, fill: number, opts: { zone?: [number, number]; needle?: number; color?: string; label?: string } = {}): void {
  c.save();
  rrect(c, x, y, w, hh, hh / 2);
  c.fillStyle = 'rgba(8,10,16,0.72)';
  c.fill();
  c.clip();
  if (opts.zone) { c.fillStyle = 'rgba(80,220,140,0.55)'; c.fillRect(x + w * opts.zone[0], y, w * (opts.zone[1] - opts.zone[0]), hh); }
  const g = c.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, opts.color ?? '#ffd166');
  g.addColorStop(1, '#ff6a3d');
  c.fillStyle = g;
  c.globalAlpha = 0.9;
  c.fillRect(x, y, w * clamp(fill, 0, 1), hh);
  c.globalAlpha = 1;
  c.restore();
  if (opts.needle !== undefined) {
    c.fillStyle = '#fff';
    c.fillRect(x + w * clamp(opts.needle, 0, 1) - 1.5, y - 3, 3, hh + 6);
  }
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 1;
  rrect(c, x, y, w, hh, hh / 2);
  c.stroke();
  if (opts.label) { c.fillStyle = '#e8ecf4'; c.font = '600 11px Inter, system-ui'; c.textAlign = 'left'; c.textBaseline = 'bottom'; c.fillText(opts.label, x, y - 4); }
}

/** A result card: pays out on a win and records it. */
export function resultPage(title: string, kicker: string, lines: string[], done: () => void): Page {
  return {
    title, kicker,
    render: (host) => {
      for (const l of lines) host.body.append(h('p', 'cg-msg', l));
      const b = btn('Done', 'primary', () => { host.back(); done(); });
      host.body.append(b);
    },
  };
}
