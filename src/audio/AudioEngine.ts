import * as THREE from 'three';
import type { Surface } from '../physics/Physics';

type Node3 = { x: number; y: number; z: number };

/**
 * Procedural game audio (Web Audio). Every sound is synthesised, so there are no sample files to ship or
 * license. Voice files can later replace individual sounds without touching callers.
 *
 * The context is created lazily on the first user gesture (browser autoplay policy).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private verbOpen!: ConvolverNode;
  private verbCanyon!: ConvolverNode;
  private wetOpen!: GainNode;
  private wetCanyon!: GainNode;
  private sendBus!: GainNode;
  volume = 0.8;
  private readonly fwd = new THREE.Vector3();

  /** Call from a user-gesture handler. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp).connect(ctx.destination);

    // 2 s of white noise, reused by every noise-based sound.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Two reverbs: a long dull open-air tail with sparse reflections, and a short dense street-canyon one.
    this.verbOpen = ctx.createConvolver();
    this.verbOpen.buffer = this.makeImpulse(1.8, 2.6, 0.35);
    this.verbCanyon = ctx.createConvolver();
    this.verbCanyon.buffer = this.makeImpulse(0.85, 3.2, 1);
    this.wetOpen = ctx.createGain();
    this.wetCanyon = ctx.createGain();
    this.sendBus = ctx.createGain();
    this.sendBus.connect(this.verbOpen).connect(this.wetOpen).connect(this.master);
    this.sendBus.connect(this.verbCanyon).connect(this.wetCanyon).connect(this.master);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setListener(camera: THREE.Camera): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    const p = camera.position;
    this.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
      l.forwardX.value = this.fwd.x; l.forwardY.value = this.fwd.y; l.forwardZ.value = this.fwd.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    }
  }

  suspend(): void {
    void this.ctx?.suspend();
  }
  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  // ------------------------------------------------------------------------ helpers

  private makeImpulse(seconds: number, decay: number, density: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const sparse = Math.random() < density * (1 - t * 0.6) ? 1 : 0.15;
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * sparse;
      }
    }
    return buf;
  }

  /** Create the continuous sound for a vehicle (null until the context exists). */
  createVehicleSound(): VehicleSound | null {
    if (!this.ctx) return null;
    return new VehicleSound(this.ctx, this.master, this.noise);
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Continuous sirens, city ambience and street music (null until the context exists). */
  createSiren(): SirenVoice | null {
    return this.ctx ? new SirenVoice(this.ctx, this.master) : null;
  }
  createAmbience(): AmbienceBed | null {
    return this.ctx ? new AmbienceBed(this.ctx, this.master, this.noise) : null;
  }
  createMusic(): StreetMusic | null {
    return this.ctx ? new StreetMusic(this.ctx, this.master) : null;
  }

  /** Seagull cry: two falling whistles with a breathy edge. */
  gull(pos: Node3): void {
    if (!this.ready()) return;
    const t = this.now();
    const o = this.out(pos, 25);
    const f0 = 1500 + Math.random() * 500;
    for (let k = 0; k < 2 + Math.floor(Math.random() * 2); k++) {
      const t0 = t + k * 0.28;
      this.tone(o, t0, { freq: f0 * 1.25, to: f0 * 0.7, peak: 0.07, decay: 0.24, type: 'triangle' });
      this.burst(o, t0, { type: 'bandpass', freq: f0, q: 2, peak: 0.05, decay: 0.2 });
    }
  }

  /** Output node for a sound, spatialised if a world position is given. */
  private out(pos?: Node3, refDistance = 6): AudioNode {
    const ctx = this.ctx!;
    if (!pos) return this.master;
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = refDistance;
    p.rolloffFactor = 1.1;
    p.maxDistance = 400;
    if (p.positionX) {
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    }
    p.connect(this.master);
    return p;
  }

  private env(g: GainNode, t0: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  /** Filtered noise burst. */
  private burst(dest: AudioNode, t0: number, o: { type?: BiquadFilterType; freq: number; q?: number; peak: number; attack?: number; decay: number; sweepTo?: number; send?: number }): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq, t0);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t0 + o.decay);
    f.Q.value = o.q ?? 0.8;
    const g = ctx.createGain();
    this.env(g, t0, o.peak, o.attack ?? 0.002, o.decay);
    src.connect(f).connect(g).connect(dest);
    if (o.send) {
      const s = ctx.createGain();
      s.gain.value = o.send;
      g.connect(s).connect(this.sendBus);
    }
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + (o.attack ?? 0.002) + o.decay + 0.05);
  }

  /** Decaying sine (tonal part of metallic and wooden sounds). */
  private tone(dest: AudioNode, t0: number, o: { freq: number; to?: number; peak: number; decay: number; type?: OscillatorType; send?: number }): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.decay);
    const g = ctx.createGain();
    this.env(g, t0, o.peak, 0.001, o.decay);
    osc.connect(g).connect(dest);
    if (o.send) {
      const s = ctx.createGain();
      s.gain.value = o.send;
      g.connect(s).connect(this.sendBus);
    }
    osc.start(t0);
    osc.stop(t0 + o.decay + 0.05);
  }

  private now(): number {
    return this.ctx!.currentTime;
  }

  private ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // -------------------------------------------------------------------------- sounds

  /** 9 mm pistol shot. `openness` 0 (canyon / indoors) … 1 (open field) picks the reverb tail. */
  gunshot(openness: number, pos?: Node3): void {
    if (!this.ready()) return;
    const t = this.now();
    const o = this.out(pos, 20);
    this.wetOpen.gain.setTargetAtTime(0.5 * openness, t, 0.01);
    this.wetCanyon.gain.setTargetAtTime(0.65 * (1 - openness) + 0.08, t, 0.01);
    this.burst(o, t, { type: 'highpass', freq: 1800, q: 0.7, peak: 0.9, decay: 0.07, send: 0.55 });          // crack
    this.burst(o, t, { type: 'bandpass', freq: 2600, sweepTo: 500, q: 0.6, peak: 1.0, attack: 0.001, decay: 0.16, send: 0.5 }); // body
    this.tone(o, t, { freq: 190, to: 48, peak: 1.0, decay: 0.16, send: 0.4 });                                  // thump
    this.burst(o, t + 0.012, { type: 'lowpass', freq: 700, q: 0.5, peak: 0.45, decay: 0.28, send: 0.3 });         // muzzle blast
    // slide cycling just after the shot
    this.burst(o, t + 0.045, { type: 'bandpass', freq: 3200, q: 3, peak: 0.12, decay: 0.03 });
  }

  /** Car horn: two detuned sawtooth voices (a minor third apart), slightly different per call. */
  honk(pos?: Node3, long = false): void {
    if (!this.ready()) return;
    const t = this.now();
    const o = this.out(pos, 14);
    const base = 380 + Math.random() * 90;
    const dur = long ? 0.9 : 0.32 + Math.random() * 0.12;
    for (const mult of [1, 1.26]) {
      const ctx = this.ctx!;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = base * mult;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1700;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.015);
      g.gain.setValueAtTime(0.16, t + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
      osc.connect(f).connect(g).connect(o);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    }
  }

  /** A startled shout: a voiced sawtooth through two vowel-like formants, rising and wavering. */
  scream(pos: Node3): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = this.now();
    const o = this.out(pos, 10);
    const base = 330 + Math.random() * 300;
    const dur = 0.55 + Math.random() * 0.4;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.linearRampToValueAtTime(base * 1.8, t + dur * 0.35);
    osc.frequency.linearRampToValueAtTime(base * 1.45, t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6.5 + Math.random() * 2;
    const lg = ctx.createGain();
    lg.gain.value = base * 0.035;
    lfo.connect(lg).connect(osc.frequency);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(0.14, t + 0.04);
    out.gain.setValueAtTime(0.14, t + dur * 0.6);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [f, q, g] of [[900, 6, 1], [2500, 8, 0.6]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f * 0.8, t);
      bp.frequency.linearRampToValueAtTime(f * 1.15, t + dur * 0.4);
      bp.Q.value = q;
      const pg = ctx.createGain();
      pg.gain.value = g;
      osc.connect(bp).connect(pg).connect(out);
    }
    out.connect(o);
    osc.start(t); lfo.start(t);
    osc.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  /** Explosion: a low thump, a wide noise burst and a long rumbling tail. `size` 1 ≈ a car. */
  explosion(pos: Node3, size = 1): void {
    if (!this.ready()) return;
    const t = this.now();
    const o = this.out(pos, 28 * size);
    this.wetOpen.gain.setTargetAtTime(0.6, t, 0.01);
    this.tone(o, t, { freq: 90, to: 28, peak: 1.0, decay: 0.55 * size, send: 0.5 });
    this.burst(o, t, { type: 'lowpass', freq: 1800, sweepTo: 120, q: 0.4, peak: 1.0, attack: 0.004, decay: 1.1 * size, send: 0.7 });
    this.burst(o, t, { type: 'highpass', freq: 2500, q: 0.6, peak: 0.55, decay: 0.2, send: 0.4 });
    this.burst(o, t + 0.12, { type: 'lowpass', freq: 400, q: 0.5, peak: 0.6, attack: 0.05, decay: 1.8 * size, send: 0.6 });
  }

  /** Metal-on-metal crash, `strength` 0–1. */
  crash(pos: Node3, strength: number): void {
    if (!this.ready()) return;
    const t = this.now();
    const o = this.out(pos, 18);
    this.burst(o, t, { type: 'bandpass', freq: 900, sweepTo: 200, q: 0.5, peak: 0.9 * (0.4 + strength), attack: 0.002, decay: 0.35, send: 0.4 });
    this.burst(o, t, { type: 'highpass', freq: 3000, q: 0.7, peak: 0.5 * (0.3 + strength), decay: 0.25, send: 0.3 });
    this.tone(o, t, { freq: 120, to: 40, peak: 0.8 * (0.3 + strength), decay: 0.3 });
    for (let k = 0; k < 4; k++) this.tone(o, t + 0.03 + k * 0.05 + Math.random() * 0.04, { freq: 1200 + Math.random() * 2400, peak: 0.08 * strength, decay: 0.12, type: 'triangle' });
  }

  dryClick(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.burst(this.master, t, { type: 'highpass', freq: 3500, peak: 0.35, decay: 0.012 });
    this.tone(this.master, t, { freq: 1700, to: 900, peak: 0.12, decay: 0.03 });
  }

  /** Mechanical handling sounds for the reload / draw sequence. */
  mech(kind: 'draw' | 'holster' | 'magOut' | 'magDrop' | 'magIn' | 'slide' | 'rack' | 'cloth' | 'inspect'): void {
    if (!this.ready()) return;
    const t = this.now();
    const m = this.master;
    switch (kind) {
      case 'draw':
        this.burst(m, t, { type: 'bandpass', freq: 2800, q: 1.5, peak: 0.2, decay: 0.09 });
        this.tone(m, t + 0.05, { freq: 1300, to: 800, peak: 0.1, decay: 0.05 });
        break;
      case 'holster':
        this.burst(m, t, { type: 'bandpass', freq: 1800, q: 1, peak: 0.2, decay: 0.12 });
        this.tone(m, t + 0.1, { freq: 420, to: 300, peak: 0.12, decay: 0.05 });
        break;
      case 'magOut':
        this.burst(m, t, { type: 'bandpass', freq: 3500, q: 4, peak: 0.28, decay: 0.025 });
        this.tone(m, t, { freq: 900, to: 600, peak: 0.12, decay: 0.04 });
        break;
      case 'magDrop':
        this.tone(m, t, { freq: 160, to: 70, peak: 0.45, decay: 0.07 });
        this.burst(m, t, { type: 'bandpass', freq: 900, q: 0.8, peak: 0.25, decay: 0.06 });
        break;
      case 'magIn':
        this.burst(m, t, { type: 'bandpass', freq: 1800, q: 1.2, peak: 0.3, decay: 0.05 });
        this.tone(m, t + 0.015, { freq: 700, to: 450, peak: 0.2, decay: 0.06 });
        this.burst(m, t + 0.07, { type: 'bandpass', freq: 3600, q: 5, peak: 0.28, decay: 0.02 });
        break;
      case 'slide':
        this.burst(m, t, { type: 'bandpass', freq: 3000, q: 3, peak: 0.34, decay: 0.03 });
        this.tone(m, t, { freq: 1000, to: 600, peak: 0.16, decay: 0.05 });
        break;
      case 'rack':
        this.burst(m, t, { type: 'bandpass', freq: 2200, q: 1.5, peak: 0.25, decay: 0.07 });
        this.burst(m, t + 0.11, { type: 'bandpass', freq: 3400, q: 3, peak: 0.3, decay: 0.03 });
        break;
      case 'cloth':
        this.burst(m, t, { type: 'bandpass', freq: 1400, q: 0.5, peak: 0.07, attack: 0.04, decay: 0.2 });
        break;
      case 'inspect':
        this.burst(m, t, { type: 'bandpass', freq: 2400, q: 2, peak: 0.12, decay: 0.05 });
        break;
    }
  }

  footstep(surface: Surface, intensity: number, pos?: Node3): void {
    if (!this.ready()) return;
    const t = this.now();
    const o = this.out(pos, 3);
    const v = Math.min(1, intensity);
    switch (surface) {
      case 'asphalt':
      case 'concrete':
        this.burst(o, t, { type: 'bandpass', freq: 1500, q: 0.9, peak: 0.32 * v, decay: 0.05 });
        this.tone(o, t, { freq: 110, to: 60, peak: 0.26 * v, decay: 0.07 });
        break;
      case 'sand':
        this.burst(o, t, { type: 'lowpass', freq: 1100, q: 0.4, peak: 0.22 * v, attack: 0.012, decay: 0.12 });
        break;
      case 'dirt':
        this.burst(o, t, { type: 'lowpass', freq: 650, q: 0.5, peak: 0.3 * v, attack: 0.006, decay: 0.09 });
        this.tone(o, t, { freq: 90, to: 55, peak: 0.18 * v, decay: 0.08 });
        break;
      case 'metal':
        this.burst(o, t, { type: 'bandpass', freq: 2200, q: 1.4, peak: 0.28 * v, decay: 0.05 });
        this.tone(o, t, { freq: 520, to: 480, peak: 0.1 * v, decay: 0.18 });
        break;
      case 'wood':
        this.burst(o, t, { type: 'bandpass', freq: 800, q: 1, peak: 0.3 * v, decay: 0.05 });
        this.tone(o, t, { freq: 180, to: 110, peak: 0.28 * v, decay: 0.08 });
        break;
      case 'water':
        this.burst(o, t, { type: 'bandpass', freq: 1100, q: 0.7, peak: 0.28 * v, attack: 0.02, decay: 0.22 });
        break;
      default:
        this.burst(o, t, { type: 'bandpass', freq: 1200, q: 0.9, peak: 0.25 * v, decay: 0.06 });
    }
  }

  land(intensity: number): void {
    if (!this.ready()) return;
    const t = this.now();
    const v = Math.min(1, 0.35 + intensity);
    this.tone(this.master, t, { freq: 100, to: 40, peak: 0.55 * v, decay: 0.16 });
    this.burst(this.master, t, { type: 'lowpass', freq: 900, q: 0.5, peak: 0.3 * v, decay: 0.12 });
  }

  splash(big = false, pos?: Node3): void {
    if (!this.ready()) return;
    const t = this.now();
    const o = this.out(pos, 5);
    this.burst(o, t, { type: 'bandpass', freq: big ? 700 : 1400, q: 0.5, peak: big ? 0.6 : 0.3, attack: 0.015, decay: big ? 0.55 : 0.25, sweepTo: 400 });
  }

  swim(): void {
    if (!this.ready()) return;
    this.burst(this.master, this.now(), { type: 'bandpass', freq: 900, q: 0.4, peak: 0.12, attack: 0.15, decay: 0.45 });
  }

  /** Bullet impact; metals ping, glass tinkles, dirt thuds. */
  impact(surface: Surface, pos: Node3): void {
    if (!this.ready()) return;
    const t = this.now();
    const o = this.out(pos, 4);
    switch (surface) {
      case 'metal':
        this.burst(o, t, { type: 'highpass', freq: 3000, peak: 0.5, decay: 0.03 });
        this.tone(o, t, { freq: 1900 + Math.random() * 900, peak: 0.28, decay: 0.35 });
        this.tone(o, t, { freq: 3100 + Math.random() * 900, peak: 0.14, decay: 0.2 });
        break;
      case 'wood':
        this.burst(o, t, { type: 'bandpass', freq: 700, q: 0.8, peak: 0.5, decay: 0.07 });
        this.tone(o, t, { freq: 230, to: 140, peak: 0.4, decay: 0.09 });
        break;
      case 'glass':
        this.burst(o, t, { type: 'highpass', freq: 4000, peak: 0.55, decay: 0.12 });
        for (let i = 0; i < 6; i++) this.tone(o, t + 0.01 + Math.random() * 0.12, { freq: 2800 + Math.random() * 4200, peak: 0.1, decay: 0.12 });
        break;
      case 'water':
        this.burst(o, t, { type: 'bandpass', freq: 1000, q: 0.5, peak: 0.3, attack: 0.01, decay: 0.2 });
        break;
      case 'dirt':
      case 'sand':
        this.burst(o, t, { type: 'lowpass', freq: 600, q: 0.5, peak: 0.45, decay: 0.1 });
        this.tone(o, t, { freq: 100, to: 50, peak: 0.25, decay: 0.09 });
        break;
      default: // concrete, asphalt
        this.burst(o, t, { type: 'bandpass', freq: 2200, q: 0.7, peak: 0.5, decay: 0.05 });
        this.burst(o, t, { type: 'lowpass', freq: 500, peak: 0.3, decay: 0.08 });
    }
  }

  /** Brass hitting the ground. */
  casing(surface: Surface, pos: Node3): void {
    if (!this.ready()) return;
    const t = this.now() + 0.05;
    const o = this.out(pos, 2);
    const hard = surface !== 'dirt' && surface !== 'sand';
    this.tone(o, t, { freq: (hard ? 4200 : 2600) + Math.random() * 800, peak: hard ? 0.12 : 0.04, decay: hard ? 0.09 : 0.03 });
    if (hard) this.tone(o, t + 0.12, { freq: 5200 + Math.random() * 700, peak: 0.06, decay: 0.07 });
  }
}

/** What the engine sound needs to know each frame. */
export interface EngineSoundState {
  rpm: number;
  idleRpm: number;
  redlineRpm: number;
  /** 0–1 */
  load: number;
  cylinders: number;
  turbo: boolean;
  speedKmh: number;
  /** 0–1 tyre slip */
  skid: number;
  airborne: boolean;
  braking: boolean;
  shifted: boolean;
  impact: number;
  horn: boolean;
  /** 0 off, 1 on (parked/unoccupied vehicles are silent). */
  active: boolean;
}

/**
 * Continuous vehicle sound: engine (sawtooth pair + sub, distorted, filtered by load), intake/exhaust noise,
 * tyre squeal, wind, turbo whistle and horn. All parameters are smoothed with `setTargetAtTime`, so RPM sweeps
 * are free of zipper noise. Created from the audio engine's context.
 */
export class VehicleSound {
  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly osc1: OscillatorNode;
  private readonly osc2: OscillatorNode;
  private readonly sub: OscillatorNode;
  private readonly engFilter: BiquadFilterNode;
  private readonly engGain: GainNode;
  private readonly noiseGain: GainNode;
  private readonly noiseFilter: BiquadFilterNode;
  private readonly squealGain: GainNode;
  private readonly squealFilter: BiquadFilterNode;
  private readonly windGain: GainNode;
  private readonly windFilter: BiquadFilterNode;
  private readonly turboOsc: OscillatorNode;
  private readonly turboGain: GainNode;
  private readonly hornGain: GainNode;
  private readonly hornA: OscillatorNode;
  private readonly hornB: OscillatorNode;
  private noiseSrc: AudioBufferSourceNode[] = [];
  private running = false;
  private lastImpact = 0;

  constructor(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);

    // engine: two detuned saws one octave apart + a sine sub, soft-clipped, then low-passed by load
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    shaper.curve = curve;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square';
    this.sub = ctx.createOscillator(); this.sub.type = 'sine';
    const g1 = ctx.createGain(); g1.gain.value = 0.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.22;
    const g3 = ctx.createGain(); g3.gain.value = 0.55;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.Q.value = 1.2;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.osc1.connect(g1).connect(shaper);
    this.osc2.connect(g2).connect(shaper);
    this.sub.connect(g3).connect(shaper);
    shaper.connect(this.engFilter).connect(this.engGain).connect(this.out);

    // noise layers (intake/exhaust rasp, tyre squeal, wind) share one looping noise buffer
    const mkNoise = (): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      this.noiseSrc.push(s);
      return s;
    };
    this.noiseFilter = ctx.createBiquadFilter(); this.noiseFilter.type = 'bandpass'; this.noiseFilter.Q.value = 0.8;
    this.noiseGain = ctx.createGain(); this.noiseGain.gain.value = 0;
    mkNoise().connect(this.noiseFilter).connect(this.noiseGain).connect(this.out);

    this.squealFilter = ctx.createBiquadFilter(); this.squealFilter.type = 'bandpass'; this.squealFilter.frequency.value = 2400; this.squealFilter.Q.value = 6;
    this.squealGain = ctx.createGain(); this.squealGain.gain.value = 0;
    mkNoise().connect(this.squealFilter).connect(this.squealGain).connect(this.out);

    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'lowpass'; this.windFilter.frequency.value = 500;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    mkNoise().connect(this.windFilter).connect(this.windGain).connect(this.out);

    this.turboOsc = ctx.createOscillator(); this.turboOsc.type = 'sine';
    this.turboGain = ctx.createGain(); this.turboGain.gain.value = 0;
    this.turboOsc.connect(this.turboGain).connect(this.out);

    this.hornA = ctx.createOscillator(); this.hornA.type = 'sawtooth'; this.hornA.frequency.value = 392;
    this.hornB = ctx.createOscillator(); this.hornB.type = 'sawtooth'; this.hornB.frequency.value = 494;
    this.hornGain = ctx.createGain(); this.hornGain.gain.value = 0;
    const hornFilter = ctx.createBiquadFilter(); hornFilter.type = 'lowpass'; hornFilter.frequency.value = 1800;
    this.hornA.connect(hornFilter); this.hornB.connect(hornFilter);
    hornFilter.connect(this.hornGain).connect(this.out);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    for (const o of [this.osc1, this.osc2, this.sub, this.turboOsc, this.hornA, this.hornB]) o.start();
    for (const n of this.noiseSrc) n.start(0, Math.random() * 1.5);
  }

  dispose(): void {
    if (!this.running) return;
    this.running = false;
    for (const o of [this.osc1, this.osc2, this.sub, this.turboOsc, this.hornA, this.hornB]) {
      try { o.stop(); } catch { /* already stopped */ }
    }
    for (const n of this.noiseSrc) {
      try { n.stop(); } catch { /* already stopped */ }
    }
    this.out.disconnect();
  }

  update(s: EngineSoundState): void {
    const t = this.ctx.currentTime;
    const k = 0.04;
    const level = s.active ? 1 : 0;
    this.out.gain.setTargetAtTime(level * 0.9, t, 0.12);
    const rpmF = Math.max(0, Math.min(1, (s.rpm - s.idleRpm) / (s.redlineRpm - s.idleRpm)));
    // firing frequency: a 4-stroke fires cylinders/2 times per revolution
    const fire = (s.rpm / 60) * (s.cylinders / 2);
    this.osc1.frequency.setTargetAtTime(fire, t, k);
    this.osc2.frequency.setTargetAtTime(fire * 2.005, t, k);
    this.sub.frequency.setTargetAtTime(fire * 0.5, t, k);
    this.engFilter.frequency.setTargetAtTime(280 + rpmF * 1500 + s.load * 2600, t, 0.06);
    this.engGain.gain.setTargetAtTime(0.16 + 0.14 * rpmF + 0.2 * s.load, t, 0.06);
    // rasp rises with load and revs
    this.noiseFilter.frequency.setTargetAtTime(500 + rpmF * 2400, t, 0.08);
    this.noiseGain.gain.setTargetAtTime(0.012 + 0.07 * s.load * (0.4 + rpmF), t, 0.08);
    // tyre squeal on slip
    const squeal = Math.max(0, s.skid - 0.55) * 1.8 * (s.airborne ? 0 : 1) * Math.min(1, s.speedKmh / 25);
    this.squealGain.gain.setTargetAtTime(Math.min(0.5, squeal * 0.4), t, 0.05);
    this.squealFilter.frequency.setTargetAtTime(2000 + s.skid * 900 + s.speedKmh * 4, t, 0.1);
    // wind
    const wind = Math.min(1, s.speedKmh / 220);
    this.windGain.gain.setTargetAtTime(wind * wind * 0.4, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(300 + wind * 1700, t, 0.2);
    // turbo whistle: spools with load and rpm, fluttering when the throttle is lifted
    if (s.turbo) {
      this.turboOsc.frequency.setTargetAtTime(1800 + rpmF * 4200, t, 0.1);
      this.turboGain.gain.setTargetAtTime(0.03 * s.load * rpmF, t, 0.1);
    } else {
      this.turboGain.gain.setTargetAtTime(0, t, 0.1);
    }
    // horn
    this.hornGain.gain.setTargetAtTime(s.horn ? 0.18 : 0, t, 0.015);
    // collisions and gear changes are one-shots
    if (s.impact > 0 && t - this.lastImpact > 0.12) {
      this.lastImpact = t;
      this.crash(Math.min(1, s.impact / 14));
    }
    if (s.shifted) this.shiftBlip();
    void s.braking;
  }

  private crash(v: number): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseSrc[0]!.buffer;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + v * 2200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.7 * v + 0.1, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28 + 0.3 * v);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random());
    src.stop(t + 0.7);
    const thud = ctx.createOscillator(); thud.type = 'sine';
    thud.frequency.setValueAtTime(130, t); thud.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t); tg.gain.linearRampToValueAtTime(0.8 * v + 0.1, t + 0.005); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    thud.connect(tg).connect(this.out);
    thud.start(t); thud.stop(t + 0.35);
  }

  private shiftBlip(): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseSrc[0]!.buffer;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random()); src.stop(t + 0.2);
  }
}


/**
 * One emergency siren (police wail/yelp or ambulance hi-lo). Created once, then fed the vehicle's position and velocity
 * each frame; a cheap Doppler shift comes from the radial speed relative to the listener.
 */
export class SirenVoice {
  private readonly osc: OscillatorNode;
  private readonly gain: GainNode;
  private readonly panner: PannerNode;
  private t = 0;
  private started = false;

  constructor(private readonly ctx: AudioContext, dest: AudioNode) {
    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 0.7;
    const sh = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.tanh((i / 128 - 1) * 2.2);
    sh.curve = curve;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.panner = ctx.createPanner();
    this.panner.panningModel = 'equalpower';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 30;
    this.panner.rolloffFactor = 1.3;
    this.panner.maxDistance = 600;
    this.osc.connect(sh).connect(bp).connect(this.gain).connect(this.panner).connect(dest);
  }

  /** `kind`: 0 police wail, 1 police yelp, 2 ambulance hi-lo. `radial` is m/s towards (−) or away from (+) the listener. */
  update(dt: number, x: number, y: number, z: number, kind: 0 | 1 | 2, on: boolean, radial: number): void {
    if (!this.started) { this.osc.start(); this.started = true; }
    this.t += dt;
    const now = this.ctx.currentTime;
    let f: number;
    if (kind === 0) f = 650 + 520 * (0.5 - 0.5 * Math.cos((this.t / 3.6) * Math.PI * 2));
    else if (kind === 1) f = 700 + 480 * (0.5 - 0.5 * Math.cos((this.t / 0.34) * Math.PI * 2));
    else f = Math.floor(this.t / 0.52) % 2 === 0 ? 960 : 770;
    const doppler = 343 / (343 + Math.max(-60, Math.min(60, radial)));
    this.osc.frequency.setTargetAtTime(f * doppler, now, 0.02);
    this.gain.gain.setTargetAtTime(on ? 0.1 : 0, now, 0.08);
    if (this.panner.positionX) {
      this.panner.positionX.setTargetAtTime(x, now, 0.03);
      this.panner.positionY.setTargetAtTime(y, now, 0.03);
      this.panner.positionZ.setTargetAtTime(z, now, 0.03);
    }
  }

  dispose(): void {
    try { this.osc.stop(); } catch { /* not started */ }
    this.panner.disconnect();
  }
}

/** Distant traffic rumble and crowd murmur; levels (0–1) are set each frame from what is near the player. */
export class AmbienceBed {
  private readonly trafficGain: GainNode;
  private readonly crowdGain: GainNode;
  private readonly trafficFilter: BiquadFilterNode;
  private readonly srcs: AudioBufferSourceNode[] = [];

  constructor(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer) {
    const mk = (type: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(dest);
      src.start(0, Math.random() * 1.5);
      this.srcs.push(src);
      return { f, g };
    };
    const t = mk('lowpass', 260, 0.6);
    this.trafficGain = t.g;
    this.trafficFilter = t.f;
    const c = mk('bandpass', 700, 0.5);
    this.crowdGain = c.g;
    // slow wobble so the murmur breathes
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.23;
    const lg = ctx.createGain();
    lg.gain.value = 220;
    lfo.connect(lg).connect(c.f.frequency);
    lfo.start();
  }

  update(traffic: number, crowd: number, ctx: AudioContext): void {
    const t = ctx.currentTime;
    this.trafficGain.gain.setTargetAtTime(Math.min(1, traffic) * 0.16, t, 0.6);
    this.trafficFilter.frequency.setTargetAtTime(200 + traffic * 260, t, 0.6);
    this.crowdGain.gain.setTargetAtTime(Math.min(1, crowd) * 0.12, t, 0.6);
  }

  dispose(): void {
    for (const s of this.srcs) { try { s.stop(); } catch { /* done */ } }
  }
}

/** A street musician's guitar: a lazy pentatonic arpeggio of plucked notes, positioned in the world. */
export class StreetMusic {
  private readonly panner: PannerNode;
  private t = 0;
  private step = 0;
  private note = 0;
  private readonly scale = [0, 3, 5, 7, 10, 12, 15];
  private root = 164.81; // E3

  constructor(private readonly ctx: AudioContext, dest: AudioNode) {
    this.panner = ctx.createPanner();
    this.panner.panningModel = 'equalpower';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 8;
    this.panner.rolloffFactor = 1.4;
    this.panner.maxDistance = 120;
    this.panner.connect(dest);
  }

  update(dt: number, x: number, y: number, z: number, listenerDist: number): void {
    if (listenerDist > 70) return;
    if (this.panner.positionX) { this.panner.positionX.value = x; this.panner.positionY.value = y; this.panner.positionZ.value = z; }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.3 + (this.step % 4 === 3 ? 0.18 : 0);
    this.step++;
    // random walk on the scale
    this.note = Math.max(0, Math.min(this.scale.length - 1, this.note + (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.3 ? 2 : 1)));
    if (this.step % 16 === 0) this.root *= Math.random() < 0.5 ? 1.122 : 0.891;
    if (this.root > 260) this.root *= 0.5; else if (this.root < 120) this.root *= 2;
    const f = this.root * Math.pow(2, this.scale[this.note]! / 12);
    const now = this.ctx.currentTime;
    for (const [mult, peak] of [[1, 0.22], [2, 0.08], [3, 0.03]] as const) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f * mult;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9 / mult + 0.2);
      o.connect(g).connect(this.panner);
      o.start(now);
      o.stop(now + 1.2);
    }
  }

  dispose(): void {
    this.panner.disconnect();
  }
}
