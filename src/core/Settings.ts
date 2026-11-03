export type QualityName = 'auto' | 'low' | 'medium' | 'high' | 'ultra';

export interface SettingsData {
  quality: QualityName;
  resolutionScale: number;
  mouseSensitivity: number;
  showFps: boolean;
  reduceMotion: boolean;
}

const KEY = 'vicecoast.settings.v1';

const DEFAULTS: SettingsData = {
  quality: 'auto',
  resolutionScale: 1,
  mouseSensitivity: 1,
  showFps: false,
  reduceMotion: false,
};

type Listener = (s: SettingsData) => void;

/** Persisted user settings. Storage access is wrapped: it can throw or be empty. */
export class Settings {
  data: SettingsData = { ...DEFAULTS };
  private listeners = new Set<Listener>();

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      /* fall back to defaults */
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches && !this.hasStored()) {
      this.data.reduceMotion = true;
    }
  }

  private hasStored(): boolean {
    try {
      return localStorage.getItem(KEY) !== null;
    } catch {
      return false;
    }
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data[key] = value;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
    this.listeners.forEach((l) => l(this.data));
  }

  onChange(fn: Listener): void {
    this.listeners.add(fn);
  }
}
