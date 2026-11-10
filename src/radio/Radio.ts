/**
 * The car radio: six stations whose music is generated live with Web Audio (drum machines, bass lines, chord pads,
 * plucks and arpeggios in each genre's key and tempo), with fictional DJs, ads and news read between songs.
 * Nothing is sampled; no files are downloaded.
 */

export interface StationDef {
  id: string;
  name: string;
  freq: string;
  genre: string;
  color: string;
  /** Voice id (see story/chars VOICES) used for the DJ line. */
  voice: string;
  dj: string;
  /** Music stations play songs; the talk station only speaks. */
  music: boolean;
}

export const STATIONS: StationDef[] = [
  { id: 'rock', name: 'Valeria Rock', freq: '101.3', genre: 'Rock', color: '#ff5a4a', voice: 'rdj1', dj: 'Rex Hollis', music: true },
  { id: 'hiphop', name: 'Coast FM', freq: '94.7', genre: 'Hip-hop', color: '#ffb02e', voice: 'rdj2', dj: 'DJ Marlowe', music: true },
  { id: 'electro', name: 'Neon Pulse', freq: '128.0', genre: 'Electronic', color: '#6ae0ff', voice: 'rdj3', dj: 'Kiko Vale', music: true },
  { id: 'latin', name: 'Radio Merida', freq: '88.1', genre: 'Latin', color: '#ff7ab0', voice: 'rdj4', dj: 'Lupe Santos', music: true },
  { id: 'jazz', name: 'Velvet Lounge', freq: '99.2', genre: 'Jazz & lounge', color: '#b49aff', voice: 'rdj5', dj: 'Miles Ardent', music: true },
  { id: 'talk', name: 'Valeria Talk', freq: '880 AM', genre: 'Talk & news', color: '#9aa3b5', voice: 'rdj6', dj: 'Dana Cho', music: false },
];

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

// ------------------------------------------------------------------------------------------------ words

const WORDS_A = ['Midnight', 'Concrete', 'Neon', 'Golden', 'Broken', 'Electric', 'Velvet', 'Lost', 'Burning', 'Salt', 'Silver', 'Hollow', 'Coastal', 'Paper', 'Static', 'Last'];
const WORDS_B = ['Highway', 'Heart', 'Summer', 'Skyline', 'Rain', 'Engine', 'Promise', 'Echo', 'Harbor', 'Fever', 'Mirror', 'Dream', 'Avenue', 'Fire', 'Tide', 'Signal'];
const ARTISTS = ['The Undertows', 'Ana Lucero', 'Gridlock', 'Saint Valera', 'Mono Rose', 'Fast Lanes', 'Dr. Halcyon', 'Paloma', 'The Pier Kids', 'Velour', 'Cadence 9', 'Los Faros'];
const ADS = [
  ['Meridian Group', 'Meridian Group. Building the coast you deserve. Ask about The Crown: residences from just four million.'],
  ['Valeria Motors', 'Valeria Motors on Harbor Road: every car, every colour, and a two-minute test drive. No questions about the last driver.'],
  ['Redline Customs', 'Redline Customs. Paint, power and plates. If it is not fast, it is not finished.'],
  ['Brass Monkey Burgers', 'Brass Monkey Burgers. Fresh on the beach, hot on the grill, and absolutely legal.'],
  ['Mors Mutual', 'Mors Mutual Insurance. Because nobody plans to explode, and everybody should have a claim form.'],
  ['Cinder Taqueria', 'Cinder Taqueria, Cinder Flats. Mama Jo\'s tacos: drive out. You will not regret it.'],
  ['Valeria Savings', 'Valeria Savings: your money, safe with us. Mostly. Terms apply.'],
  ['Petrolia Gas', 'Petrolia Gas. Fill up, buy a snack, and please do not point anything at our staff.'],
  ['Crane for Governor', 'Desmond Crane for Governor. A cleaner harbor. A safer coast. Paid for by the Committee to Elect Desmond Crane.'],
  ['Lucky Seven', 'The Lucky Seven Casino, Costa Merida. Seven reasons to stay, and one very large vault. Please gamble responsibly.'],
];
const NEWS = [
  'Harbor Task Force Captain Ines Brandt says crime in the Dusk Harbor district is at a record low, a figure disputed by every resident of Dusk Harbor.',
  'Candidate Desmond Crane unveiled a model of The Crown today, a glass tower he says will "lift the whole coast". Residents of Costa Merida asked who will pay for the lifting.',
  'Police are investigating a string of robberies at gas stations across San Verano. Clerks describe a calm, polite and heavily armed customer.',
  'An armored truck on the East Highway made headlines this week for reasons the company declines to explain. A spokesman said "no comment" four times.',
  'Weather: warm and clear along the coast, fog in the Pinecrest valley, and a dust storm warning for Cinder Flats. Drive carefully, or do not.',
  'Traffic: a stalled truck on the Port Road, a parade downtown, and a man on a stolen horse near the pier. All lanes are open except the ones that are not.',
  'The Bureau of Investigation confirmed it is "aware of" allegations about the Meridian Group. The Meridian Group confirmed it is "aware of" the Bureau.',
  'Valeria International reports a record month for flights and a record week for lost luggage.',
];
const TALK = [
  'Caller on line three says the stunt driver in the desert is a hero. Caller on line four says he owes him a fence. Line five just wants to talk about tacos.',
  'I keep getting messages about the hooded man at the Valeria Savings. Folks, the hood is a fashion choice. Probably.',
  'Today\'s topic: should the harbor be saved or developed? Phones are open, and so is my patience, briefly.',
  'A listener writes that the police helicopters woke the whole of Crestview last night. The Task Force says that was a "training exercise". Training for what, exactly?',
  'Next up, a retired pilot says the best landing strip on the coast is on Isla Rojo. Sir, that is private property. Also, that is correct.',
];
const DJ_LINES: Record<string, string[]> = {
  rock: ['You are locked to Valeria Rock, one-oh-one point three. Turn it up, the neighbours are asleep.', 'Rex Hollis here. No talking, no apologies, more guitars.', 'If your engine is louder than this song, go and see Redline.'],
  hiphop: ['Coast FM, nine-four-seven. DJ Marlowe on the one and twos, all night.', 'Shout out to everybody on the Port Road doing ninety. Slow down. Actually, don\'t.', 'This one is for the harbor. Keep the harbor.'],
  electro: ['Neon Pulse, a hundred and twenty-eight beats a minute, no breaks. Kiko Vale, you are welcome.', 'The city never sleeps, so neither do the synthesisers.', 'Pull over, close your eyes, no, do not close your eyes. Drive.'],
  latin: ['Radio Merida, ochenta y ocho punto uno. Lupe Santos, y la noche es nuestra.', 'Para los que manejan por el canal: cuidado con el agua, amigos.', 'Un poco de salsa para el camino, y un poco de calor tambien.'],
  jazz: ['Velvet Lounge, ninety-nine point two. Miles Ardent. Take your time, the road will wait.', 'A little piano, a little rain on the glass, and nowhere you have to be.', 'This one is for the late shift, wherever you are working.'],
};

const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;

export interface OnAir { station: StationDef; who: string; text: string; secs: number; voice: string }

/**
 * Scheduler + synth. `pump()` is called every frame; notes are scheduled slightly ahead on the audio clock.
 */
export class Radio {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private duck!: GainNode;
  private noise!: AudioBuffer;
  private idx = -1;
  private stepDur = 0.15;
  private nextT = 0;
  private step = 0;
  private bar = 0;
  private segT = 40;
  private level = 0;
  private want = 0;
  private songLeft = 0;
  title = '';
  artist = '';
  onAir: ((a: OnAir) => void) | null = null;
  onTrack: ((station: StationDef, title: string, artist: string) => void) | null = null;
  /** 0–1 user volume. */
  volume = 0.7;

  constructor(private readonly getCtx: () => AudioContext | null, private readonly getOut: () => AudioNode | null) {}

  get current(): StationDef | null { return this.idx >= 0 ? STATIONS[this.idx]! : null; }
  get index(): number { return this.idx; }

  private init(): boolean {
    if (this.ctx) return true;
    const ctx = this.getCtx(), dest = this.getOut();
    if (!ctx || !dest) return false;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.duck = ctx.createGain();
    this.duck.gain.value = 1;
    this.duck.connect(this.out);
    this.out.connect(dest);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  /** Tune to a station (−1 = off). */
  tune(i: number): void {
    this.idx = i;
    if (i < 0) { this.want = 0; return; }
    if (!this.init()) return;
    const st = STATIONS[i]!;
    this.step = 0; this.bar = 0;
    this.nextT = this.ctx!.currentTime + 0.1;
    this.songLeft = 0;
    this.segT = 25 + Math.random() * 40;
    this.newSong();
    if (!st.music) this.segT = 4;
  }

  /** Is the radio audible (in a vehicle)? */
  setActive(on: boolean): void {
    this.want = on && this.idx >= 0 ? this.volume : 0;
  }

  private newSong(): void {
    const st = this.current;
    if (!st) return;
    this.title = `${pick(WORDS_A)} ${pick(WORDS_B)}`;
    this.artist = pick(ARTISTS);
    this.songLeft = 36 + Math.floor(Math.random() * 20); // bars
    if (st.music) this.onTrack?.(st, this.title, this.artist);
  }

  pump(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.level += (this.want - this.level) * Math.min(1, dt * 2.5);
    this.out.gain.value = this.level;
    const st = this.current;
    if (!st || this.level < 0.003) return;
    // segments between songs
    this.segT -= dt;
    if (this.segT <= 0) this.segment(st);
    if (!st.music) return;
    const tempo = this.tempo(st);
    this.stepDur = 60 / tempo / 4;
    const now = ctx.currentTime;
    if (this.nextT < now - 0.5) this.nextT = now + 0.05; // after a pause
    while (this.nextT < now + 0.28) {
      this.play(st, this.step, this.nextT);
      this.nextT += this.stepDur * (st.id === 'hiphop' || st.id === 'jazz' ? (this.step % 2 === 0 ? 1.18 : 0.82) : 1);
      this.step++;
      if (this.step % 16 === 0) { this.bar++; this.songLeft--; if (this.songLeft <= 0) this.newSong(); }
    }
  }

  private tempo(st: StationDef): number { return { rock: 122, hiphop: 88, electro: 126, latin: 104, jazz: 96, talk: 90 }[st.id] ?? 100; }

  // ------------------------------------------------------------------------------------------------ talk

  private say(st: StationDef, who: string, text: string): void {
    const secs = Math.max(2.4, 1 + text.length * 0.055);
    this.onAir?.({ station: st, who, text, secs, voice: st.voice });
    // the music ducks under the voice
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.duck.gain.cancelScheduledValues(t);
      this.duck.gain.setTargetAtTime(0.35, t, 0.15);
      this.duck.gain.setTargetAtTime(1, t + secs, 0.4);
    }
  }

  private stinger(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    for (const [i, m] of [76, 83, 88].entries()) this.tone(t + i * 0.12, mtof(m), 0.35, 'triangle', 0.18, 3200);
  }

  private segment(st: StationDef): void {
    const r = Math.random();
    if (!st.music) {
      this.stinger();
      if (r < 0.4) this.say(st, st.dj, pick(NEWS));
      else if (r < 0.75) this.say(st, `${st.dj} · Caller`, pick(TALK));
      else { const [b, t] = pick(ADS)!; this.say(st, `${b} (advert)`, t); }
      this.segT = 18 + Math.random() * 16;
      return;
    }
    if (r < 0.5) this.say(st, st.dj, `${pick(DJ_LINES[st.id] ?? DJ_LINES.rock!)} Coming up: "${this.title}" by ${this.artist}.`);
    else if (r < 0.8) { this.stinger(); const [b, t] = pick(ADS)!; this.say(st, `${b} (advert)`, t); }
    else { this.stinger(); this.say(st, `${st.name} news`, pick(NEWS)); }
    this.segT = 70 + Math.random() * 60;
  }

  // ------------------------------------------------------------------------------------------------ voices

  private tone(t: number, f: number, dur: number, type: OscillatorType, gain: number, cutoff = 4000, attack = 0.005, slideTo = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(this.duck);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private hit(t: number, dur: number, gain: number, hp: number, bp = 0, q = 1): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = bp ? 'bandpass' : 'highpass';
    f.frequency.value = bp || hp;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.duck);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  private kick(t: number, gain = 0.9): void { this.tone(t, 150, 0.16, 'sine', gain, 600, 0.002, 42); }
  private snare(t: number, gain = 0.5): void { this.hit(t, 0.14, gain, 0, 1800, 0.8); this.tone(t, 190, 0.08, 'triangle', gain * 0.5, 1500); }
  private hat(t: number, open = false, gain = 0.14): void { this.hit(t, open ? 0.16 : 0.035, gain, 7000); }
  private clap(t: number, gain = 0.4): void { this.hit(t, 0.1, gain, 0, 1400, 0.6); this.hit(t + 0.012, 0.08, gain * 0.6, 0, 1400, 0.6); }

  private chord(t: number, notes: number[], dur: number, gain: number, type: OscillatorType, cutoff: number): void {
    for (const n of notes) {
      this.tone(t, mtof(n) * 0.997, dur, type, gain / notes.length, cutoff, 0.04);
      this.tone(t, mtof(n) * 1.003, dur, type, gain / notes.length, cutoff, 0.04);
    }
  }

  // ------------------------------------------------------------------------------------------------ the songs

  private play(st: StationDef, step: number, t: number): void {
    const s16 = step % 16, bar = this.bar;
    const prog = bar % 4;
    switch (st.id) {
      case 'rock': {
        const roots = [45, 41, 48, 43]; // A F C G
        const r = roots[prog]!;
        if ([0, 6, 8, 11].includes(s16)) this.kick(t, 0.9);
        if (s16 === 4 || s16 === 12) this.snare(t, 0.55);
        if (s16 % 2 === 0) this.hat(t, s16 % 8 === 6, 0.12);
        if (s16 % 2 === 0) this.tone(t, mtof(r), this.stepDur * 1.8, 'sawtooth', 0.22, 700);
        if (s16 === 0) this.chord(t, [r + 12, r + 19, r + 24], this.stepDur * 15, 0.22, 'sawtooth', 2200);
        if (s16 % 2 === 0) this.tone(t, mtof(r + 12), this.stepDur * 0.9, 'sawtooth', 0.12, 1500);
        if (bar % 8 >= 4 && [3, 7, 10, 14].includes(s16)) this.tone(t, mtof(r + 24 + [0, 3, 7, 10][(s16 >> 1) % 4]!), this.stepDur * 2, 'square', 0.1, 3000);
        break;
      }
      case 'hiphop': {
        const roots = [36, 32, 39, 34]; // Cm Ab Eb Bb
        const r = roots[prog]!;
        if ([0, 7, 10].includes(s16)) this.kick(t, 1);
        if (s16 === 4 || s16 === 12) this.snare(t, 0.5);
        this.hat(t, s16 === 14, s16 % 2 ? 0.07 : 0.12);
        if (s16 === 0 || s16 === 10) this.tone(t, mtof(r), this.stepDur * 6, 'sine', 0.55, 200, 0.01, mtof(r) * 0.97);
        if (s16 === 0) this.chord(t, [r + 24, r + 27, r + 31, r + 34], this.stepDur * 14, 0.2, 'triangle', 1800);
        if (s16 === 8 && bar % 2) this.tone(t, mtof(r + 31), this.stepDur * 3, 'sine', 0.16, 2400);
        if (Math.random() < 0.06) this.hit(t, 0.01, 0.12, 4000);
        break;
      }
      case 'electro': {
        const roots = [38, 34, 29, 36]; // Dm Bb F C
        const r = roots[prog]!;
        const arp = [0, 7, 12, 7, 15, 12, 7, 12][(s16 >> 1) % 8]!;
        if (s16 % 4 === 0) this.kick(t, 0.85);
        if (s16 % 4 === 2) this.hat(t, true, 0.12);
        if (s16 === 4 || s16 === 12) this.clap(t, 0.35);
        this.hat(t, false, 0.05);
        // pumping bass
        if (s16 % 4 !== 0) this.tone(t, mtof(r), this.stepDur * 0.9, 'sawtooth', 0.28, 500);
        this.tone(t, mtof(r + 24 + arp), this.stepDur * 0.8, 'sawtooth', 0.09, 1800 + (bar % 8) * 300);
        if (s16 === 0) this.chord(t, [r + 12, r + 15, r + 19], this.stepDur * 15, 0.12, 'sawtooth', 1200);
        break;
      }
      case 'latin': {
        const roots = [45, 38, 40, 45]; // Am Dm E Am
        const r = roots[prog]!;
        const clave = [0, 3, 6, 10, 12];
        if (clave.includes(s16)) this.tone(t, 1850, 0.05, 'triangle', 0.16, 4000);
        if ([2, 4, 7, 10, 12, 15].includes(s16)) this.tone(t, 200 + (s16 % 3) * 60, 0.09, 'sine', 0.2, 900, 0.002, 140);
        if (s16 % 4 === 0) this.kick(t, 0.5);
        if (s16 % 2 === 0) this.hat(t, false, 0.07);
        if ([0, 7, 10].includes(s16)) this.tone(t, mtof(r + (s16 === 10 ? 7 : 0)), this.stepDur * 3, 'triangle', 0.5, 600);
        if ([3, 6, 9, 11, 14].includes(s16)) this.tone(t, mtof(r + 24 + [0, 4, 7][(s16 + bar) % 3]!), this.stepDur * 1.5, 'triangle', 0.22, 3200);
        break;
      }
      case 'jazz': {
        const chords = [[50, 57, 60, 64], [43, 53, 59, 64], [48, 55, 59, 64], [45, 55, 61, 64]]; // Dm9 G13 Cmaj9 A7
        const c = chords[prog]!;
        if (s16 % 4 === 0 || s16 % 8 === 6) this.hit(t, 0.35, 0.06, 0, 6000, 1.2);
        if (s16 === 4 || s16 === 12) this.hit(t, 0.12, 0.06, 0, 3000, 0.8);
        if (s16 % 4 === 0) this.tone(t, mtof(c[0]! - 12 + [0, 2, 4, 5][(s16 >> 2) % 4]!), this.stepDur * 3.5, 'triangle', 0.42, 700);
        if (s16 === 0 || s16 === 7 || s16 === 11) this.chord(t, c.map((n) => n + 12), this.stepDur * 5, 0.2, 'sine', 2600);
        if (s16 === 14 && bar % 2) this.tone(t, mtof(c[3]! + 12 + [0, 2, -2][bar % 3]!), this.stepDur * 3, 'triangle', 0.18, 3000);
        break;
      }
      default:
    }
  }
}
