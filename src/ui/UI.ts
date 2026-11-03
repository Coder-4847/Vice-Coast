import type { WebGLInfo } from 'three';
import type { FrameStats } from '../core/GameLoop';
import type { GameRenderer } from '../core/GameRenderer';
import type { PresetName } from '../core/Quality';
import type { Settings } from '../core/Settings';
import type { Device } from '../input/Actions';
import type { InputManager } from '../input/InputManager';
import { h } from './dom';
import { SettingsMenu } from './SettingsMenu';

export interface UIHooks {
  resume(): void;
  editTouchLayout(): void;
  resetTouchLayout(): void;
  finishTouchLayout(): void;
  setGyro(on: boolean): Promise<boolean>;
  autoPreset(): PresetName;
}



const TIPS = [
  'Cars, bikes, boats and aircraft are always third person. On foot you see through your own eyes.',
  'Plug in a controller at any time — prompts switch glyphs automatically.',
  'Heat fades faster if you change cars, change clothes, or break line of sight.',
  'Every touch button can be dragged: Settings → Touch → Edit layout.',
  'Dynamic resolution keeps the game near 60 FPS on modest hardware.',
];

const DEVICE_NAMES: Record<Device, string> = { kbm: 'Keyboard & mouse', gamepad: 'Controller', touch: 'Touch' };

/** Owns every DOM screen: loading, title, HUD, pause/settings menu, toasts and fatal overlays. */
export class UI {
  readonly menu: SettingsMenu;

  private readonly loading: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly title: HTMLElement;
  private readonly press: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly stats: HTMLElement;
  private hints: HTMLElement;
  private readonly capture: HTMLElement;
  private readonly deviceChip: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly editBar: HTMLElement;
  private statEls!: Record<'fps' | 'ms' | 'low' | 'scale' | 'calls' | 'tris' | 'gpu', HTMLElement>;
  private statTimer = 0;
  private hintTimer = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly settings: Settings,
    private readonly input: InputManager,
    gfx: GameRenderer,
    hooks: UIHooks,
  ) {
    // Loading
    this.bar = h('i');
    this.tip = h('div', 'tip', TIPS[Math.floor(Math.random() * TIPS.length)]);
    this.loading = h('div', 'screen loading', h('h1', 'wordmark', 'Vice Coast'), h('div', 'progress', this.bar), this.tip);

    // Title
    this.press = h('div', 'press');
    this.title = h(
      'div', 'screen title is-hidden',
      h('div', 'center', h('h1', 'wordmark', 'Vice Coast'), h('div', 'kicker', 'San Verano')),
      this.press,
      h('div', 'build', 'Phase 1 · Foundation'),
    );

    // HUD
    this.stats = this.buildStats();
    this.hints = h('dl', 'hints panel-glass is-hidden');
    this.capture = h('div', 'capture-hint panel-glass is-hidden', 'Click to capture the mouse');
    this.deviceChip = h('div', 'device panel-glass');
    this.hud = h('div', 'hud is-hidden', h('div', 'crosshair'), this.stats, this.hints, this.capture, this.deviceChip);

    this.toasts = h('div', 'toasts');
    this.editBar = h('div', 'edit-bar panel-glass is-hidden');
    const done = h('button', 'btn primary', 'Done');
    const reset = h('button', 'btn', 'Reset');
    done.type = reset.type = 'button';
    done.addEventListener('click', () => hooks.finishTouchLayout());
    reset.addEventListener('click', () => hooks.resetTouchLayout());
    this.editBar.append(h('span', '', 'Drag buttons to reposition'), reset, done);

    root.append(this.loading, this.hud);
    this.menu = new SettingsMenu(root, settings, input, gfx, { ...hooks, notify: (m) => this.toast(m) });
    root.append(this.title, this.toasts, this.editBar);

    settings.on('change', (d) => this.applyAccessibility(d.accessibility));
    this.applyAccessibility(settings.data.accessibility);
    settings.on('change', () => this.applyStatsVisibility());
    this.applyStatsVisibility();

    input.on('device', (d) => this.onDevice(d));
    input.on('gamepad', (e) => {
      this.toast(e.connected ? 'Controller connected' : 'Controller disconnected');
      this.refreshDevice();
    });
    this.refreshDevice();
    this.refreshPrompts();
  }

  // ----------------------------------------------------------------- loading

  setProgress(p: number, tip?: string): void {
    this.bar.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
    if (tip) this.tip.textContent = tip;
  }

  hideLoading(): void {
    this.loading.classList.add('is-hidden');
  }

  // ------------------------------------------------------------------- title

  showTitle(): void {
    this.title.classList.remove('is-hidden');
  }
  hideTitle(): void {
    this.title.classList.add('is-hidden');
  }

  // --------------------------------------------------------------------- hud

  showHud(): void {
    this.hud.classList.remove('is-hidden');
    this.hints.classList.remove('is-hidden');
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hints.classList.add('is-hidden'), 12000);
  }
  hideHud(): void {
    this.hud.classList.add('is-hidden');
  }
  dismissHints(): void {
    this.hints.classList.add('is-hidden');
  }

  setCaptureHint(visible: boolean): void {
    this.capture.classList.toggle('is-hidden', !visible);
  }

  setEditBar(visible: boolean): void {
    this.editBar.classList.toggle('is-hidden', !visible);
  }

  private buildStats(): HTMLElement {
    const mk = (k: string, v = '—') => {
      const b = h('b', '', v);
      return { row: h('div', 'srow', h('span', '', k), b), el: b };
    };
    const fps = h('b', 'big', '60');
    const head = h('div', 'shead', fps, h('span', '', 'FPS'));
    const ms = mk('frame'), low = mk('1% low'), scale = mk('render'), calls = mk('draws'), tris = mk('tris'), gpu = mk('gpu');
    this.statEls = { fps, ms: ms.el, low: low.el, scale: scale.el, calls: calls.el, tris: tris.el, gpu: gpu.el };
    return h('div', 'stats panel-glass is-hidden', head, ms.row, low.row, scale.row, calls.row, tris.row, gpu.row);
  }

  private applyStatsVisibility(): void {
    this.stats.classList.toggle('is-hidden', !this.settings.data.graphics.showFps);
  }

  /** Refresh the FPS panel (≈2×/s to avoid layout churn). */
  updateStats(dt: number, s: FrameStats, gfx: GameRenderer, info: WebGLInfo['render']): void {
    if (!this.settings.data.graphics.showFps) return;
    this.statTimer += dt;
    if (this.statTimer < 0.5) return;
    this.statTimer = 0;
    const e = this.statEls;
    e.fps.textContent = String(Math.round(s.fps));
    e.fps.className = 'big ' + (s.fps >= 55 ? 'good' : s.fps >= 40 ? 'warn' : 'bad');
    e.ms.textContent = `${s.frameMs.toFixed(1)} ms`;
    e.low.textContent = `${Math.round(s.low1)} fps`;
    e.scale.textContent = `${Math.round(gfx.pixelRatio * 100)}% px · ${gfx.preset.label}`;
    e.calls.textContent = String(info.calls);
    e.tris.textContent = info.triangles > 1e5 ? `${(info.triangles / 1e3).toFixed(0)}k` : String(info.triangles);
    e.gpu.textContent = gfx.gpu.renderer.replace(/ANGLE \(|\)/g, '').slice(0, 24);
  }

  // ----------------------------------------------------------- device & glyphs

  private onDevice(d: Device): void {
    document.documentElement.dataset.device = d;
    this.refreshDevice();
    this.refreshPrompts();
  }

  private refreshDevice(): void {
    const d = this.input.activeDevice;
    document.documentElement.dataset.device = d;
    let name = DEVICE_NAMES[d];
    if (d === 'gamepad') name = this.input.padLayout === 'playstation' ? 'PlayStation controller' : this.input.padLayout === 'xbox' ? 'Xbox controller' : 'Controller';
    this.deviceChip.textContent = name;
  }

  /** Rebuilds every prompt that shows button glyphs for the active device. */
  refreshPrompts(): void {
    const d = this.input.activeDevice;
    const g = (a: Parameters<InputManager['glyph']>[0]) => this.input.glyph(a, d);
    const key = (t: string) => h('kbd', '', t);

    this.press.textContent = d === 'touch' ? 'Tap to start' : d === 'gamepad' ? 'Press any button' : 'Press any key';

    const rows: [string, Node[]][] =
      d === 'kbm'
        ? [
            ['Move', ['moveForward', 'moveLeft', 'moveBack', 'moveRight'].map((a) => key(g(a as 'moveForward')))],
            ['Look', [key('Mouse')]],
            ['Fly up / down', [key(g('jump')), key(g('crouch'))]],
            ['Sprint', [key(g('sprint'))]],
            ['Menu', [key('Esc')]],
          ]
        : d === 'gamepad'
          ? [
              ['Move', [key('Left stick')]],
              ['Look', [key('Right stick')]],
              ['Fly up / down', [key(g('jump')), key(g('crouch'))]],
              ['Sprint', [key(g('sprint'))]],
              ['Menu', [key(g('pause'))]],
            ]
          : [
              ['Move', [key('Left thumb')]],
              ['Look', [key('Drag right side')]],
              ['Menu', [key('Menu')]],
            ];
    const dl = h('dl', 'hints panel-glass');
    for (const [label, keys] of rows) dl.append(h('dt', '', label), h('dd', '', ...keys));
    dl.className = this.hints.className;
    this.hints.replaceWith(dl);
    this.hints = dl;
    this.capture.textContent = 'Click to capture the mouse';
  }

  // ----------------------------------------------------------------- toasts

  toast(text: string): void {
    const t = h('div', 'toast panel-glass', text);
    while (this.toasts.children.length > 2) this.toasts.firstElementChild?.remove();
    this.toasts.append(t);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('in')));
    window.setTimeout(() => {
      t.classList.remove('in');
      window.setTimeout(() => t.remove(), 260);
    }, 2200);
  }

  // ------------------------------------------------------------- overlays

  showOverlay(titleText: string, message: string, id = 'overlay'): HTMLElement {
    document.getElementById(id)?.remove();
    const o = h('div', 'screen overlay', h('h3', '', titleText), h('p', '', message));
    o.id = id;
    this.root.append(o);
    return o;
  }

  hideOverlay(id = 'overlay'): void {
    const o = document.getElementById(id);
    if (!o) return;
    o.classList.add('is-hidden');
    window.setTimeout(() => o.remove(), 400);
  }

  private applyAccessibility(a: { reduceMotion: boolean; textScale: number; colorBlind: string }): void {
    const html = document.documentElement;
    html.dataset.reduceMotion = String(a.reduceMotion);
    html.dataset.cb = a.colorBlind;
    html.style.setProperty('--text-scale', String(a.textScale));
  }
}
