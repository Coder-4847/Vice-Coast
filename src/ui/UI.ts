import type { WebGLInfo } from 'three';
import type { FrameStats } from '../core/GameLoop';
import type { GameRenderer } from '../core/GameRenderer';
import type { PresetName } from '../core/Quality';
import type { Settings } from '../core/Settings';
import type { Device } from '../input/Actions';
import type { InputManager } from '../input/InputManager';
import { h } from './dom';
import { SettingsMenu, type EnvControls } from './SettingsMenu';

/** Everything the in-game HUD shows about the player and weapon, polled once per frame. */
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export interface HudState {
  weaponName: string;
  ammo: number;
  reserve: number;
  /** Crosshair spread in degrees. */
  spread: number;
  ads: number;
  drawn: boolean;
  reloading: boolean;
  lowAmmo: boolean;
  /** Knife or hatchet: no ammunition to show. */
  melee?: boolean;
  hitMarker: number;
  stamina: number;
  /** Contextual prompt, e.g. "Vault" / "Climb". */
  prompt: { action: 'jump'; label: string } | null;
  fovDeg: number;
  viewportH: number;
  /** Set while driving. */
  vehicle: { name: string; speedKmh: number; gear: number; reversing: boolean; rpmFrac: number; headlights: boolean; health: number } | null;
  /** Prompt to enter a nearby vehicle. */
  enter: string | null;
}

export interface UIHooks {
  resume(): void;
  autoPreset(): PresetName;
  env: EnvControls;
  mountSaves?(host: HTMLElement): () => void;
  mountProgress?(host: HTMLElement): () => void;
}



const TIPS = [
  'Cars, bikes, boats and aircraft are always third person. On foot you see through your own eyes.',
  'Plug in a controller at any time — prompts switch glyphs automatically.',
  'Heat fades faster if you change cars, change clothes, or break line of sight.',
  'Hold the weapon or radio button for a wheel; tap the radio button to skip a station.',
  'Dynamic resolution keeps the game near 60 FPS on modest hardware.',
];

const DEVICE_NAMES: Record<Device, string> = { kbm: 'Keyboard & mouse', gamepad: 'Controller' };

/** Owns every DOM screen: loading, title, HUD, pause/settings menu, toasts and fatal overlays. */
export class UI {
  readonly menu: SettingsMenu;

  private readonly loading: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly title: HTMLElement;
  private readonly press: HTMLElement;
  private readonly hud: HTMLElement;
  /** The HUD container, for widgets that live in it (minimap). */
  get hudRoot(): HTMLElement {
    return this.hud;
  }
  private readonly stats: HTMLElement;
  private hints: HTMLElement;
  private readonly capture: HTMLElement;
  private readonly deviceChip: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly ammoEl: HTMLElement;
  private readonly ammoNum: HTMLElement;
  private readonly ammoRes: HTMLElement;
  private readonly ammoName: HTMLElement;
  private readonly reloadPrompt: HTMLElement;
  private readonly crossEl: HTMLElement;
  private readonly hitEl: HTMLElement;
  private readonly staminaEl: HTMLElement;
  private readonly staminaBar: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly speedoEl: HTMLElement;
  private readonly speedNum: HTMLElement;
  private readonly speedGear: HTMLElement;
  private readonly speedName: HTMLElement;
  private readonly rpmBar: HTMLElement;
  private readonly speedFlags: HTMLElement;
  private shownSpeed = -1;
  private shownAmmo = -1;
  private ammoAnim = 0;
  private ammoTarget = 0;
  private ammoShown = 0;
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
      h('div', 'build', 'Phase 11 · Story and heists'),
    );

    // HUD
    this.stats = this.buildStats();
    this.hints = h('dl', 'hints panel-glass is-hidden');
    this.capture = h('div', 'capture-hint panel-glass is-hidden', 'Click to capture the mouse');
    this.deviceChip = h('div', 'device panel-glass');
    this.crossEl = h('div', 'cross', ...['t', 'b', 'l', 'r'].map((k) => h('i', `c-${k}`)), h('i', 'c-dot'));
    this.hitEl = h('div', 'hitmarker', ...[0, 1, 2, 3].map((i) => h('i', `h${i}`)));
    this.ammoNum = h('b', 'ammo-num', '13');
    this.ammoRes = h('span', 'ammo-res', '/ 60');
    this.ammoName = h('span', 'ammo-name', 'VC-9');
    this.ammoEl = h('div', 'ammo panel-glass', h('div', 'ammo-row', this.ammoNum, this.ammoRes), this.ammoName);
    this.reloadPrompt = h('div', 'reload-prompt', '');
    this.staminaBar = h('i');
    this.staminaEl = h('div', 'stamina', this.staminaBar);
    this.promptEl = h('div', 'prompt panel-glass is-hidden', '');
    this.speedNum = h('b', 'speed-num', '0');
    this.speedGear = h('span', 'speed-gear', 'N');
    this.speedName = h('span', 'speed-name', '');
    this.rpmBar = h('i');
    this.speedFlags = h('span', 'speed-flags', '');
    this.speedoEl = h('div', 'speedo panel-glass is-hidden', h('div', 'speed-row', this.speedNum, h('span', 'speed-unit', 'km/h'), this.speedGear), h('div', 'rpm', this.rpmBar), h('div', 'speed-foot', this.speedName, this.speedFlags));
    this.hud = h('div', 'hud is-hidden', this.crossEl, this.hitEl, this.stats, this.hints, this.capture, this.deviceChip, this.ammoEl, this.reloadPrompt, this.staminaEl, this.promptEl, this.speedoEl);

    this.toasts = h('div', 'toasts');

    root.append(this.loading, this.hud);
    this.menu = new SettingsMenu(root, settings, input, gfx, { ...hooks, notify: (m) => this.toast(m) });
    root.append(this.title, this.toasts);

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
    this.hintTimer = window.setTimeout(() => this.hints.classList.add('is-hidden'), 16000);
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

  /** Per-frame HUD update. Only touches the DOM when a value actually changed. */
  updateHud(dt: number, st: HudState): void {
    // ammo counter rolls smoothly toward the real value
    this.ammoTarget = st.ammo;
    if (this.ammoShown !== this.ammoTarget) {
      this.ammoAnim += dt;
      if (this.ammoAnim > 0.035) {
        this.ammoAnim = 0;
        this.ammoShown += Math.sign(this.ammoTarget - this.ammoShown);
      }
    }
    if (st.melee) { this.shownAmmo = -1; this.ammoNum.textContent = '—'; }
    else if (this.shownAmmo !== this.ammoShown) {
      this.shownAmmo = this.ammoShown;
      this.ammoNum.textContent = String(this.ammoShown);
    }
    const res = st.melee ? 'melee' : `/ ${st.reserve}`;
    if (this.ammoRes.textContent !== res) this.ammoRes.textContent = res;
    this.ammoName.textContent = st.weaponName;
    this.ammoEl.classList.toggle('is-hidden', !st.drawn);
    this.ammoNum.classList.toggle('low', st.lowAmmo);

    // crosshair: gap follows the real spread (degrees → pixels), hidden while aiming through sights
    const px = (st.spread * Math.PI / 180) / (st.fovDeg * Math.PI / 180) * st.viewportH * 0.5 * 2;
    this.crossEl.style.setProperty('--gap', `${Math.max(3, Math.min(90, px)).toFixed(1)}px`);
    this.crossEl.style.opacity = st.drawn ? String(1 - st.ads) : '0.55';
    this.hitEl.style.opacity = String(Math.min(1, st.hitMarker / 0.12));

    // reload prompt
    const want = st.drawn && !st.melee && !st.reloading && st.lowAmmo && st.reserve > 0;
    this.reloadPrompt.classList.toggle('on', want);
    if (want) this.reloadPrompt.innerHTML = `<kbd>${this.input.glyph('reload')}</kbd> Reload`;

    // stamina (only visible when not full)
    this.staminaBar.style.transform = `scaleX(${st.stamina.toFixed(3)})`;
    this.staminaEl.classList.toggle('on', st.stamina < 0.995);

    // vehicle gauges
    const veh = st.vehicle;
    this.speedoEl.classList.toggle('is-hidden', !veh);
    if (veh) {
      const sp = Math.round(veh.speedKmh);
      if (sp !== this.shownSpeed) {
        this.shownSpeed = sp;
        this.speedNum.textContent = String(sp);
      }
      this.speedGear.textContent = veh.reversing ? 'R' : String(veh.gear);
      this.rpmBar.style.transform = `scaleX(${clamp01(veh.rpmFrac).toFixed(3)})`;
      this.rpmBar.classList.toggle('hot', veh.rpmFrac > 0.92);
      if (this.speedName.textContent !== veh.name) this.speedName.textContent = veh.name;
      this.speedFlags.textContent = (veh.headlights ? '◐ ' : '') + (veh.health < 400 ? '⚠ damaged' : '');
    }

    // contextual prompt
    if (st.enter && !veh) {
      const html = `<kbd>${this.input.glyph('interact')}</kbd> ${st.enter}`;
      if (this.promptEl.innerHTML !== html) this.promptEl.innerHTML = html;
      this.promptEl.classList.remove('is-hidden');
    } else if (st.prompt) {
      const html = `<kbd>${this.input.glyph(st.prompt.action)}</kbd> ${st.prompt.label}`;
      if (this.promptEl.innerHTML !== html) this.promptEl.innerHTML = html;
      this.promptEl.classList.remove('is-hidden');
    } else {
      this.promptEl.classList.add('is-hidden');
    }
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
    // the device chip shows for a few seconds when the input device changes, then gets out of the way
    this.deviceChip.classList.add('flash');
    window.clearTimeout(this.chipT);
    this.chipT = window.setTimeout(() => this.deviceChip.classList.remove('flash'), 3500);
  }

  private chipT = 0;

  /** Rebuilds every prompt that shows button glyphs for the active device. */
  refreshPrompts(): void {
    const d = this.input.activeDevice;
    const g = (a: Parameters<InputManager['glyph']>[0]) => this.input.glyph(a, d);
    const key = (t: string) => h('kbd', '', t);

    this.press.textContent = d === 'gamepad' ? 'Press any button' : 'Press any key';

    const rows: [string, Node[]][] =
      d === 'kbm'
        ? [
            ['Move', ['moveForward', 'moveLeft', 'moveBack', 'moveRight'].map((a) => key(g(a as 'moveForward')))],
            ['Look / fire / aim', [key('Mouse'), key(g('fire')), key(g('aim'))]],
            ['Jump · vault · climb', [key(g('jump'))]],
            ['Sprint · crouch', [key(g('sprint')), key(g('crouch'))]],
            ['Reload · holster', [key(g('reload')), key(g('holster'))]],
            ['Menu', [key('Esc')]],
          ]
        : d === 'gamepad'
          ? [
              ['Move · look', [key('Left stick'), key('Right stick')]],
              ['Fire · aim', [key(g('fire')), key(g('aim'))]],
              ['Jump · vault · climb', [key(g('jump'))]],
              ['Sprint · crouch', [key(g('sprint')), key(g('crouch'))]],
              ['Reload · holster', [key(g('reload')), key(g('holster'))]],
              ['Menu', [key(g('pause'))]],
            ]
          : [
              ['Move', [key('Left thumb')]],
              ['Look', [key('Drag right side')]],
              ['Fire · aim · reload', [key('Fire'), key('Aim'), key('Reload')]],
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

  private applyAccessibility(a: { reduceMotion: boolean; textScale: number; colorBlind: string; hudScale: number; highContrast: boolean; readableFont: boolean }): void {
    const html = document.documentElement;
    html.dataset.reduceMotion = String(a.reduceMotion);
    html.dataset.cb = a.colorBlind;
    html.style.setProperty('--text-scale', String(a.textScale));
    html.style.setProperty('--hud-scale', String(a.hudScale));
    html.dataset.contrast = a.highContrast ? 'high' : 'normal';
    html.dataset.font = a.readableFont ? 'readable' : 'display';
  }
}
