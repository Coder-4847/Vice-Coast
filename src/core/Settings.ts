import { Emitter } from './Emitter';
import type { PresetName } from './Quality';
import { ACTION_DEFS, type Action, type ActionBinding } from '../input/Actions';

export type HoldMode = 'hold' | 'toggle';
export type ColorBlindMode = 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export interface SettingsData {
  version: 1;
  graphics: {
    preset: PresetName | 'auto';
    resolutionScale: number;
    dynamicResolution: boolean;
    showFps: boolean;
    fov: number;
  };
  controls: {
    mouseSensitivity: number;
    invertY: boolean;
    padSensitivity: number;
    padDeadzone: number;
    padInvertY: boolean;
    rumble: boolean;
    gyro: boolean;
    gyroSensitivity: number;
    touchSensitivity: number;
    touchOpacity: number;
    sprintMode: HoldMode;
    crouchMode: HoldMode;
    aimMode: HoldMode;
    bindings: Record<Action, ActionBinding>;
    /** Touch button centres as viewport fractions, keyed by button id. */
    touchLayout: Record<string, { x: number; y: number }>;
  };
  audio: {
    master: number;
    /** Music: the car radio, the phone speaker and street musicians. */
    radio: number;
    sfx: number;
    /** Spoken dialogue (text-to-speech) and how far music ducks under it. */
    dialogue: number;
    ui: number;
    /** Fold everything to one channel (single-sided hearing, one earbud). */
    mono: boolean;
    /** 'wide' keeps the full punch; 'night' compresses loud sounds so quiet ones are easier to hear. */
    range: 'wide' | 'night';
  };
  accessibility: {
    reduceMotion: boolean;
    textScale: number;
    colorBlind: ColorBlindMode;
    /** Story dialogue: subtitles on screen, their size, and optional browser text-to-speech. */
    subtitles: boolean;
    subtitleScale: number;
    spokenDialogue: boolean;
    /** HUD size multiplier. */
    hudScale: number;
    /** Solid backgrounds and outlines behind HUD text. */
    highContrast: boolean;
    /** A plainer, wider-spaced font in place of the condensed display font. */
    readableFont: boolean;
    /** Camera shake, 0…1. */
    cameraShake: number;
    reduceFlashes: boolean;
    aimAssist: 'off' | 'light' | 'strong';
    holdToMash: boolean;
    /** Arrows that show where gunshots, explosions, horns and screams come from. */
    soundCues: boolean;
  };
}

export function defaultBindings(): Record<Action, ActionBinding> {
  const out = {} as Record<Action, ActionBinding>;
  for (const def of ACTION_DEFS) out[def.id] = { kbm: [...def.kbm], pad: [...def.pad] };
  return out;
}

export function defaultSettings(): SettingsData {
  return {
    version: 1,
    graphics: { preset: 'auto', resolutionScale: 1, dynamicResolution: true, showFps: false, fov: 75 },
    controls: {
      mouseSensitivity: 1,
      invertY: false,
      padSensitivity: 1,
      padDeadzone: 0.16,
      padInvertY: false,
      rumble: true,
      gyro: false,
      gyroSensitivity: 1,
      touchSensitivity: 1,
      touchOpacity: 0.8,
      sprintMode: 'hold',
      crouchMode: 'toggle',
      aimMode: 'hold',
      bindings: defaultBindings(),
      touchLayout: {},
    },
    audio: { master: 0.8, radio: 0.7, sfx: 0.9, dialogue: 1, ui: 0.7, mono: false, range: 'wide' },
    accessibility: {
      reduceMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, textScale: 1, colorBlind: 'off', subtitles: true, subtitleScale: 1, spokenDialogue: false,
      hudScale: 1, highContrast: false, readableFont: false, cameraShake: 1, reduceFlashes: false, aimAssist: 'light', holdToMash: false, soundCues: false,
    },
  };
}

const KEY = 'vicecoast.settings.v1';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Merge stored data onto defaults, keeping only keys (and value types) that exist in defaults. */
function merge<T>(base: T, incoming: unknown): T {
  if (!isObject(base) || !isObject(incoming)) {
    return typeof incoming === typeof base && incoming !== undefined ? (incoming as T) : base;
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(base)) {
    const b = (base as Record<string, unknown>)[k];
    const i = incoming[k];
    if (Array.isArray(b)) out[k] = Array.isArray(i) ? i : b;
    else if (isObject(b)) out[k] = merge(b, i);
    else out[k] = typeof i === typeof b && i !== undefined ? i : b;
  }
  return out as T;
}

export class Settings extends Emitter<{ change: SettingsData }> {
  data: SettingsData;
  private saveTimer = 0;

  constructor() {
    super();
    this.data = defaultSettings();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      this.data = this.sanitise(merge(defaultSettings(), parsed));
      // Free-form maps are not covered by the default-shaped merge above.
      const controls = isObject(parsed) && isObject(parsed.controls) ? parsed.controls : undefined;
      const layout = controls && isObject(controls.touchLayout) ? controls.touchLayout : undefined;
      if (layout) {
        for (const [id, p] of Object.entries(layout)) {
          if (isObject(p) && typeof p.x === 'number' && typeof p.y === 'number') {
            this.data.controls.touchLayout[id] = { x: p.x, y: p.y };
          }
        }
      }
    } catch {
      /* private mode / corrupt data: keep defaults */
    }
  }

  private sanitise(d: SettingsData): SettingsData {
    const c = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
    d.graphics.resolutionScale = c(d.graphics.resolutionScale, 0.5, 1.5);
    d.graphics.fov = c(d.graphics.fov, 50, 110);
    d.controls.padDeadzone = c(d.controls.padDeadzone, 0.05, 0.4);
    d.accessibility.textScale = c(d.accessibility.textScale, 0.85, 1.4);
    d.accessibility.subtitleScale = c(d.accessibility.subtitleScale, 0.8, 1.8);
    d.audio.master = c(d.audio.master, 0, 1);
    d.audio.radio = c(d.audio.radio, 0, 1);
    for (const k of ['sfx', 'dialogue', 'ui'] as const) d.audio[k] = c(d.audio[k], 0, 1);
    if (d.audio.range !== 'night') d.audio.range = 'wide';
    d.accessibility.hudScale = c(d.accessibility.hudScale, 0.75, 1.5);
    d.accessibility.cameraShake = c(d.accessibility.cameraShake, 0, 1);
    if (!['off', 'light', 'strong'].includes(d.accessibility.aimAssist)) d.accessibility.aimAssist = 'light';
    return d;
  }

  /** Apply a mutation, persist (debounced) and notify listeners. */
  update(mutate: (d: SettingsData) => void): void {
    mutate(this.data);
    this.sanitise(this.data);
    this.emit('change', this.data);
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.save(), 250);
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage full or blocked */
    }
  }

  resetControls(): void {
    this.update((d) => {
      d.controls = defaultSettings().controls;
    });
  }
}
