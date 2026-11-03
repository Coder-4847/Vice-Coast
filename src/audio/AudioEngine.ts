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
