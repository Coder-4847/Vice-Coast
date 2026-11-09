import type { GameRenderer } from '../core/GameRenderer';
import { PRESETS, PRESET_ORDER, type PresetName } from '../core/Quality';
import type { ColorBlindMode, HoldMode, Settings, SettingsData } from '../core/Settings';
import { ACTION_BY_ID, ACTION_DEFS, PAD, type Action } from '../input/Actions';
import { keyLabel, padButtonLabel } from '../input/Glyphs';
import type { InputManager } from '../input/InputManager';
import type { WeatherType } from '../world/Weather';
import { WEATHER_TYPES } from '../world/Weather';
import { h } from './dom';
import { MenuNav } from './MenuNav';

/** Look-development controls for the Phase 2 world (time of day, weather). */
export interface EnvControls {
  hour(): number;
  setHour(h: number): void;
  clock(): string;
  speed(): number;
  setSpeed(v: number): void;
  weather(): WeatherType;
  setWeather(t: WeatherType): void;
  strike(): void;
}

interface MenuHooks {
  env: EnvControls;
  resume(): void;
  editTouchLayout(): void;
  resetTouchLayout(): void;
  setGyro(on: boolean): Promise<boolean>;
  autoPreset(): PresetName;
  notify(message: string): void;
  /** Fills the Saves tab; returns a function that re-reads the slots. */
  mountSaves?(host: HTMLElement): () => void;
}

type Sync = () => void;

const TABS = ['Graphics', 'Environment', 'Controls', 'Gamepad', 'Touch', 'Accessibility', 'Audio', 'Input test', 'Saves'] as const;
const SAVE_TAB = 8;
const ENV_TAB = 1;
const TEST_TAB = 7;

/** Pause menu + settings. Every control writes straight to Settings and re-syncs on change. */
export class SettingsMenu {
  readonly root: HTMLElement;
  readonly nav: MenuNav;
  private readonly syncs: Sync[] = [];
  private pages: HTMLElement[] = [];
  private readonly tabButtons: HTMLButtonElement[] = [];
  private current = 0;
  private tester!: { tick: () => void };
  private readonly envSyncs: Sync[] = [];

  constructor(
    parent: HTMLElement,
    private readonly settings: Settings,
    private readonly input: InputManager,
    private readonly gfx: GameRenderer,
    private readonly hooks: MenuHooks,
  ) {
    const title = h('h2', '', 'Paused');
    const head = h('div', 'panel-head', title, h('span', 'kicker', 'San Verano'));

    const tabs = h('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.dataset.navRow = '';
    TABS.forEach((name, i) => {
      const b = h('button', 'tab', name);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => this.selectTab(i));
      this.tabButtons.push(b);
      tabs.append(b);
    });

    const body = h('div', 'panel-body');
    this.pages = [this.graphics(), this.environment(), this.controls(), this.gamepad(), this.touch(), this.accessibility(), this.audioPage(), this.inputTest(), this.savesPage()];
    this.pages.forEach((p) => {
      p.classList.add('tabpage');
      p.setAttribute('role', 'tabpanel');
      body.append(p);
    });

    const resume = h('button', 'btn primary', 'Resume');
    resume.type = 'button';
    resume.addEventListener('click', () => hooks.resume());
    const foot = h('div', 'panel-foot', h('span', ''), resume);
    foot.dataset.navRow = '';
    this.footHint = foot.firstElementChild as HTMLElement;

    const panel = h('div', 'panel', head, tabs, body, foot);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Pause menu and settings');
    this.root = h('div', 'screen menu is-hidden', panel);
    parent.append(this.root);
    this.nav = new MenuNav(this.root);
    this.selectTab(0);

    settings.on('change', () => this.sync());
    input.on('gamepad', () => this.sync());
    input.on('device', () => this.updateFootHint());
    this.updateFootHint();
  }

  private footHint: HTMLElement;

  private updateFootHint(): void {
    const dev = this.input.activeDevice;
    const back = dev === 'gamepad' ? padButtonLabel(PAD.B, this.input.padLayout) : dev === 'touch' ? 'Menu' : 'Esc';
    this.footHint.textContent = dev === 'touch' ? '' : `${back} — resume`;
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('is-hidden');
  }

  open(): void {
    this.root.classList.remove('is-hidden');
    this.sync();
    if (this.input.activeDevice !== 'touch' && this.input.activeDevice !== 'kbm') this.nav.focusFirst();
    else (this.tabButtons[this.current] as HTMLElement).focus({ preventScroll: true });
  }

  close(): void {
    this.input.cancelCapture();
    this.root.classList.add('is-hidden');
    (document.activeElement as HTMLElement | null)?.blur();
  }

  /** Called every frame while open (live input tester). */
  tick(): void {
    if (this.current === TEST_TAB) this.tester.tick();
    if (this.current === ENV_TAB) for (const f of this.envSyncs) f();
  }

  private selectTab(i: number): void {
    this.current = i;
    this.tabButtons.forEach((b, n) => {
      b.setAttribute('aria-selected', String(n === i));
      b.tabIndex = n === i ? 0 : -1;
    });
    this.pages.forEach((p, n) => p.classList.toggle('on', n === i));
    this.input.cancelCapture();
    this.sync();
    if (i === SAVE_TAB) {
      if (this.refreshSaves) this.refreshSaves();
      else this.refreshSaves = this.hooks.mountSaves?.(this.savesHost) ?? null;
    }
  }

  private refreshSaves: (() => void) | null = null;
  private savesHost!: HTMLElement;

  private savesPage(): HTMLElement {
    const page = h('div', 'saves-host');
    this.savesHost = page;
    return page;
  }

  private sync(): void {
    for (const s of this.syncs) s();
  }

  // --------------------------------------------------------------- builders

  private group(text: string): HTMLElement {
    return h('div', 'group', text);
  }

  private row(label: string, ctl: HTMLElement, hint?: string): HTMLElement {
    const lab = h('div', 'label', label, hint ? h('small', '', hint) : null);
    const r = h('div', 'row', lab, ctl);
    r.dataset.navRow = '';
    return r;
  }

  private slider(
    label: string, min: number, max: number, step: number,
    get: () => number, set: (v: number) => void, fmt: (v: number) => string, hint?: string, bucket: Sync[] = this.syncs,
  ): HTMLElement {
    const input = h('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.setAttribute('aria-label', label);
    const out = h('output');
    const paint = () => {
      const v = Number(input.value);
      input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
      out.textContent = fmt(v);
    };
    input.addEventListener('input', () => {
      set(Number(input.value));
      paint();
    });
    bucket.push(() => {
      if (document.activeElement !== input || bucket === this.syncs) input.value = String(get());
      paint();
    });
    return this.row(label, h('div', 'ctl', input, out), hint);
  }

  private toggle(label: string, get: () => boolean, set: (v: boolean) => void, hint?: string): HTMLElement {
    const b = h('button', 'switch');
    b.type = 'button';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-label', label);
    b.addEventListener('click', () => set(!get()));
    this.syncs.push(() => b.setAttribute('aria-checked', String(get())));
    return this.row(label, b, hint);
  }

  private segmented<T extends string>(
    label: string, options: [T, string][], get: () => T, set: (v: T) => void, hint?: string, bucket: Sync[] = this.syncs,
  ): HTMLElement {
    const wrap = h('div', 'seg');
    wrap.setAttribute('role', 'radiogroup');
    const buttons = options.map(([value, text]) => {
      const b = h('button', '', text);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => set(value));
      wrap.append(b);
      return [value, b] as const;
    });
    bucket.push(() => {
      for (const [value, b] of buttons) b.setAttribute('aria-checked', String(get() === value));
    });
    return this.row(label, wrap, hint);
  }

  private button(label: string, text: string, onClick: () => void, hint?: string): HTMLElement {
    const b = h('button', 'btn', text);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    return this.row(label, b, hint);
  }

  private update(fn: (d: SettingsData) => void): void {
    this.settings.update(fn);
  }

  // ------------------------------------------------------------------ pages

  private graphics(): HTMLElement {
    const page = h('div');
    const autoLabel = () => `Auto (${PRESETS[this.hooks.autoPreset()].label})`;
    const presetRow = this.segmented<PresetName | 'auto'>(
      'Quality preset',
      [['auto', 'Auto'], ...PRESET_ORDER.map((p) => [p, PRESETS[p].label] as [PresetName, string])],
      () => this.settings.data.graphics.preset,
      (v) => this.update((d) => (d.graphics.preset = v)),
    );
    const note = h('small', '');
    presetRow.firstElementChild!.append(note);
    this.syncs.push(() => {
      note.textContent = this.settings.data.graphics.preset === 'auto' ? `${autoLabel()} · ${this.gfx.gpu.renderer.slice(0, 48)}` : '';
    });
    page.append(
      this.group('Quality'),
      presetRow,
      this.slider('Resolution scale', 0.5, 1.5, 0.05, () => this.settings.data.graphics.resolutionScale, (v) => this.update((d) => (d.graphics.resolutionScale = v)), (v) => `${Math.round(v * 100)}%`),
      this.toggle('Dynamic resolution', () => this.settings.data.graphics.dynamicResolution, (v) => this.update((d) => (d.graphics.dynamicResolution = v)), 'Lowers render scale automatically to hold 60 FPS.'),
      this.group('Display'),
      this.slider('Field of view', 50, 110, 1, () => this.settings.data.graphics.fov, (v) => this.update((d) => (d.graphics.fov = v)), (v) => `${v}°`),
      this.toggle('FPS counter', () => this.settings.data.graphics.showFps, (v) => this.update((d) => (d.graphics.showFps = v))),
    );
    return page;
  }

  private environment(): HTMLElement {
    const page = h('div');
    const env = this.hooks.env;
    const bucket = this.envSyncs;
    const speeds: [string, string][] = [['0', 'Paused'], ['6', 'Slow'], ['30', 'Normal'], ['120', 'Fast'], ['600', 'Very fast']];
    const clockFmt = (v: number) => {
      const hh = Math.floor(v);
      const mm = Math.floor((v - hh) * 60);
      return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh >= 12 && hh < 24 ? 'PM' : 'AM'}`;
    };
    const weatherRow = this.segmented<WeatherType>(
      'Weather',
      WEATHER_TYPES.map((w) => [w.id, w.label] as [WeatherType, string]),
      () => env.weather(),
      (v) => {
        env.setWeather(v);
        this.sync();
        for (const f of bucket) f();
      },
      undefined,
      bucket,
    );
    weatherRow.classList.add('stack');
    const speedRow = this.segmented<string>(
      'Time speed', speeds, () => String(env.speed()),
      (v) => { env.setSpeed(Number(v)); for (const f of bucket) f(); },
      '“Normal” is one game minute per two real seconds.', bucket,
    );
    speedRow.classList.add('stack');
    page.append(
      this.group('Time of day'),
      this.slider('Time', 0, 24, 0.05, () => env.hour(), (v) => env.setHour(v), clockFmt, undefined, bucket),
      speedRow,
      this.group('Weather'),
      weatherRow,
      this.button('Lightning', 'Strike', () => env.strike(), 'Fires a bolt; works in any weather.'),
    );
    return page;
  }

  private bindingRows(device: 'kbm' | 'pad'): HTMLElement {
    const wrap = h('div');
    let lastGroup = '';
    for (const def of ACTION_DEFS) {
      if (def.group !== lastGroup) {
        wrap.append(this.group(def.group));
        lastGroup = def.group;
      }
      const chips = h('div', 'chips');
      const slots = device === 'kbm' ? 2 : 1;
      const buttons: HTMLButtonElement[] = [];
      for (let slot = 0; slot < slots; slot++) {
        const chip = h('button', 'chip');
        chip.type = 'button';
        chip.addEventListener('click', () => this.beginRebind(def.id, device, slot, chip));
        buttons.push(chip);
        chips.append(chip);
      }
      this.syncs.push(() => {
        const b = this.settings.data.controls.bindings[def.id];
        buttons.forEach((chip, slot) => {
          if (chip.classList.contains('listening')) return;
          const v = device === 'kbm' ? b.kbm[slot] : b.pad[slot];
          chip.classList.toggle('empty', v === undefined);
          chip.textContent = v === undefined ? '—' : device === 'kbm' ? keyLabel(String(v)) : padButtonLabel(Number(v), this.input.padLayout);
          chip.disabled = !def.rebindable;
          chip.setAttribute('aria-label', `${def.label} ${device === 'kbm' ? 'key' : 'button'} ${slot + 1}: ${chip.textContent}`);
        });
      });
      wrap.append(this.row(def.label, chips));
    }
    return wrap;
  }

  private async beginRebind(action: Action, device: 'kbm' | 'pad', slot: number, chip: HTMLButtonElement): Promise<void> {
    if (chip.classList.contains('listening')) {
      this.input.cancelCapture();
      return;
    }
    chip.classList.add('listening');
    chip.textContent = device === 'kbm' ? 'Press a key…' : 'Press a button…';
    const result = await this.input.capture(device);
    chip.classList.remove('listening');
    if (result === 'Backspace' && device === 'kbm') this.input.clearBinding(action, device, slot);
    else if (result !== null) {
      const lost = this.input.rebind(action, device, slot, result);
      for (const id of lost) this.hooks.notify(`${ACTION_BY_ID[id].label} is now unbound`);
    }
    this.sync();
  }

  private controls(): HTMLElement {
    const page = h('div');
    const holdOpts: [HoldMode, string][] = [['hold', 'Hold'], ['toggle', 'Toggle']];
    page.append(
      this.group('Mouse'),
      this.slider('Mouse sensitivity', 0.2, 3, 0.05, () => this.settings.data.controls.mouseSensitivity, (v) => this.update((d) => (d.controls.mouseSensitivity = v)), (v) => v.toFixed(2)),
      this.toggle('Invert vertical look', () => this.settings.data.controls.invertY, (v) => this.update((d) => (d.controls.invertY = v)), 'Also applies to touch and gyro.'),
      this.group('Hold or toggle'),
      this.segmented('Sprint', holdOpts, () => this.settings.data.controls.sprintMode, (v) => this.update((d) => (d.controls.sprintMode = v))),
      this.segmented('Crouch', holdOpts, () => this.settings.data.controls.crouchMode, (v) => this.update((d) => (d.controls.crouchMode = v))),
      this.segmented('Aim', holdOpts, () => this.settings.data.controls.aimMode, (v) => this.update((d) => (d.controls.aimMode = v))),
      h('div', 'group', 'Key bindings — click a slot, press a key. Backspace clears, Esc cancels.'),
      this.bindingRows('kbm'),
      this.button('Reset all controls', 'Reset to defaults', () => this.settings.resetControls()),
    );
    return page;
  }

  private gamepad(): HTMLElement {
    const page = h('div');
    const status = h('small', '');
    const statusRow = this.row('Controller', h('span', 'label', ''));
    statusRow.firstElementChild!.append(status);
    this.syncs.push(() => {
      status.textContent = this.input.padConnected
        ? `${this.input.padLayout === 'playstation' ? 'PlayStation' : this.input.padLayout === 'xbox' ? 'Xbox' : 'Generic'} layout · ${this.input.padId.slice(0, 60)}`
        : 'None detected — connect a controller and press any button.';
    });
    page.append(
      this.group('Status'),
      statusRow,
      this.group('Sticks'),
      this.slider('Look sensitivity', 0.3, 3, 0.05, () => this.settings.data.controls.padSensitivity, (v) => this.update((d) => (d.controls.padSensitivity = v)), (v) => v.toFixed(2)),
      this.slider('Dead zone', 0.05, 0.4, 0.01, () => this.settings.data.controls.padDeadzone, (v) => this.update((d) => (d.controls.padDeadzone = v)), (v) => v.toFixed(2)),
      this.toggle('Invert vertical look', () => this.settings.data.controls.padInvertY, (v) => this.update((d) => (d.controls.padInvertY = v))),
      this.toggle('Vibration', () => this.settings.data.controls.rumble, (v) => {
        this.update((d) => (d.controls.rumble = v));
        if (v) this.input.rumble(0.6, 0.3, 140);
      }),
      h('div', 'group', 'Button bindings — Start cancels'),
      this.bindingRows('pad'),
    );
    return page;
  }

  private touch(): HTMLElement {
    const page = h('div');
    page.append(
      this.group('Look'),
      this.slider('Touch sensitivity', 0.3, 3, 0.05, () => this.settings.data.controls.touchSensitivity, (v) => this.update((d) => (d.controls.touchSensitivity = v)), (v) => v.toFixed(2)),
      this.toggle('Gyro aim', () => this.settings.data.controls.gyro, async (v) => {
        const ok = await this.hooks.setGyro(v);
        this.update((d) => (d.controls.gyro = v && ok));
      }, 'Tilt the device to aim. Needs a device with motion sensors.'),
      this.slider('Gyro sensitivity', 0.3, 3, 0.05, () => this.settings.data.controls.gyroSensitivity, (v) => this.update((d) => (d.controls.gyroSensitivity = v)), (v) => v.toFixed(2)),
      this.group('On-screen controls'),
      this.slider('Button opacity', 0.3, 1, 0.05, () => this.settings.data.controls.touchOpacity, (v) => this.update((d) => (d.controls.touchOpacity = v)), (v) => `${Math.round(v * 100)}%`),
      this.button('Button layout', 'Edit layout', () => this.hooks.editTouchLayout(), 'Drag any button to where your thumbs like it.'),
      this.button('Reset layout', 'Reset', () => this.hooks.resetTouchLayout()),
    );
    return page;
  }

  private accessibility(): HTMLElement {
    const page = h('div');
    const cb: [ColorBlindMode, string][] = [['off', 'Off'], ['protanopia', 'Protan'], ['deuteranopia', 'Deutan'], ['tritanopia', 'Tritan']];
    page.append(
      this.group('Motion & text'),
      this.toggle('Reduce motion', () => this.settings.data.accessibility.reduceMotion, (v) => this.update((d) => (d.accessibility.reduceMotion = v)), 'Removes UI animation. Camera effects follow this setting as they are added.'),
      this.slider('Text size', 0.85, 1.4, 0.05, () => this.settings.data.accessibility.textScale, (v) => this.update((d) => (d.accessibility.textScale = v)), (v) => `${Math.round(v * 100)}%`),
      this.group('Colour'),
      this.segmented('Colour-blind accent', cb, () => this.settings.data.accessibility.colorBlind, (v) => this.update((d) => (d.accessibility.colorBlind = v)), 'Swaps the UI accent for a colour-safe one. World colour filters arrive with post-processing.'),
    );
    return page;
  }

  private audioPage(): HTMLElement {
    const page = h('div');
    page.append(
      this.group('Volume'),
      this.slider('Master volume', 0, 1, 0.05, () => this.settings.data.audio.master, (v) => this.update((d) => (d.audio.master = v)), (v) => `${Math.round(v * 100)}%`,
        'All sound is synthesised in the browser: gunshots, footsteps, impacts and mechanics.'),
    );
    return page;
  }

  private inputTest(): HTMLElement {
    const page = h('div');
    const dev = h('p'); const pad = h('p'); const map = h('p'); const lock = h('p'); const touch = h('p'); const keys = h('p'); const mv = h('p');
    const mkStick = () => { const i = h('i'); return { box: h('div', 'stick-box', i), dot: i }; };
    const ls = mkStick(); const rs = mkStick();
    const grid = h('div', 'btn-grid');
    const cells = Array.from({ length: 17 }, (_, i) => {
      const c = h('span', '', String(i));
      grid.append(c);
      return c;
    });
    page.append(
      this.group('Live input'),
      h('div', 'tester',
        h('div', 'card', h('h4', '', 'Active device'), dev, mv, lock),
        h('div', 'card', h('h4', '', 'Gamepad'), pad, map, h('div', 'sticks', ls.box, rs.box), grid),
        h('div', 'card', h('h4', '', 'Keyboard & touch'), keys, touch),
      ),
    );
    const names = { kbm: 'Keyboard + mouse', gamepad: 'Gamepad', touch: 'Touch' } as const;
    this.tester = {
      tick: () => {
        const s = this.input.debugState();
        dev.textContent = names[s.device];
        mv.textContent = `Move  x ${s.move.x.toFixed(2)}  y ${s.move.y.toFixed(2)}`;
        lock.textContent = `Pointer ${s.locked ? 'captured' : 'free'}`;
        pad.textContent = this.input.padConnected ? s.padId.slice(0, 64) : 'No controller detected';
        map.textContent = this.input.padConnected ? `Mapping: ${s.padMapping} · ${s.padLayout}` : 'Press any controller button to wake it';
        const a = s.padAxes;
        ls.dot.style.transform = `translate(${a[0]! * 31}px, ${a[1]! * 31}px)`;
        rs.dot.style.transform = `translate(${a[2]! * 31}px, ${a[3]! * 31}px)`;
        cells.forEach((c, i) => c.classList.toggle('on', !!s.padButtons[i]));
        keys.textContent = s.keys.length ? `Held: ${s.keys.map(keyLabel).join(' + ')}` : 'Held: —';
        touch.textContent = `Touch pointers: ${s.touchPointers}`;
      },
    };
    return page;
  }
}
