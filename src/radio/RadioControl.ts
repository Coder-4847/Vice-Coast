import type { Game } from '../Game';
import { h } from '../ui/dom';
import { Radio, STATIONS } from './Radio';

/** Glue between the radio synth and the game: input, vehicles, subtitles and the little station strip. */
export class RadioControl {
  readonly radio: Radio;
  private readonly strip: HTMLElement;
  private readonly cards: HTMLButtonElement[] = [];
  private shown = 0;
  private wasIn = false;
  private lbT = 0;

  constructor(private readonly g: Game) {
    this.radio = new Radio(() => g.audio.context, () => g.audio.output);
    // the music bus applies the Music & radio level; the radio itself plays at unity
    this.radio.volume = 1;
    this.radio.onAir = (a) => {
      if (g.settings.data.accessibility.subtitles) g.story?.hud.say(`${a.station.name} · ${a.who}`, a.station.color, a.text, a.secs);
      g.story?.speech.say(a.voice, a.text);
    };
    this.radio.onTrack = (st, title, artist) => { if (this.radio.current === st && this.inVehicle()) g.ui.toast(`♪ ${st.name} · ${title} — ${artist}`); };
    this.strip = h('div', 'radio-strip');
    this.strip.setAttribute('aria-label', 'Radio stations');
    const off = this.card(-1, 'Off', '#6c7183', '—');
    this.cards.push(off);
    STATIONS.forEach((s, i) => this.cards.push(this.card(i, s.name, s.color, s.freq)));
    for (const c of this.cards) this.strip.append(c);
    document.getElementById('ui')!.append(this.strip);
    // the last station is remembered and comes back on the first time the player gets into a vehicle
    try { const v = Number(localStorage.getItem('vicecoast.radio')); if (Number.isFinite(v) && v >= -1 && v < STATIONS.length) this.saved = v; } catch { /* ignore */ }
  }

  private saved = 0;
  private touched = false;

  private card(i: number, name: string, color: string, freq: string): HTMLButtonElement {
    const b = h('button', 'rs-card', h('b', '', freq), h('span', '', name));
    b.type = 'button';
    b.style.setProperty('--c', color);
    b.addEventListener('click', () => this.set(i));
    return b;
  }

  private inVehicle(): boolean {
    const g = this.g;
    return g.driving?.mode === 'driving' || !!g.piloting?.active;
  }

  set(i: number): void {
    this.radio.tune(i);
    try { localStorage.setItem('vicecoast.radio', String(i)); } catch { /* ignore */ }
    this.paint();
    this.shown = 3.2;
    this.strip.classList.add('open');
    this.saved = i;
    this.g.audio.unlock();
    if (i >= 0) this.g.ui.toast(`♪ ${STATIONS[i]!.name} ${STATIONS[i]!.freq}`);
  }

  next(dir = 1): void {
    const i = this.radio.index + dir;
    this.set(i > STATIONS.length - 1 ? -1 : i < -1 ? STATIONS.length - 1 : i);
  }

  private paint(): void {
    this.cards.forEach((c, k) => c.classList.toggle('sel', k - 1 === this.radio.index));
  }

  update(dt: number): void {
    const g = this.g;
    const inV = this.inVehicle();
    if (inV && !this.wasIn) {
      // getting in switches the radio on to the last station the first time
      if (this.radio.index < 0 && this.saved >= 0 && !this.touched) { this.touched = true; this.radio.tune(this.saved); this.paint(); }
    }
    this.wasIn = inV;
    this.radio.setActive(inV && g.state !== 'paused');
    this.radio.pump(dt);
    if (inV && g.state === 'playing' && !g.story?.cutscenes.active) {
      const back = (g.input.down('sprint') || false);
      if (g.input.activeDevice === 'gamepad') {
        // LB is shared with drive-by aiming: a quick tap changes the station, holding it aims
        if (g.input.down('radioWheel')) this.lbT += dt;
        else if (this.lbT > 0) { if (this.lbT < 0.28 && !g.driveBy?.usedThisHold) this.next(back ? -1 : 1); this.lbT = 0; }
      } else if (g.input.pressed('radioWheel')) this.next(back ? -1 : 1);
    }
    if (this.shown > 0) { this.shown -= dt; if (this.shown <= 0 || !inV) this.strip.classList.remove('open'); }
  }

}
