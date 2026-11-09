import { h } from './dom';

/** Letterbox, subtitles, the objective panel, timers, banners and the ability meter. All DOM, no game logic. */
export class StoryHud {
  readonly root: HTMLElement;
  private readonly barTop = h('div', 'cin-bar top');
  private readonly barBot = h('div', 'cin-bar bottom');
  private readonly sub = h('div', 'subtitle is-hidden');
  private readonly subWho = h('b', '');
  private readonly subText = h('span', '');
  private readonly obj = h('div', 'objective is-hidden');
  private readonly objKicker = h('span', 'obj-kicker');
  private readonly objText = h('span', 'obj-text');
  private readonly objSub = h('span', 'obj-sub');
  private readonly objGold = h('div', 'obj-gold');
  private readonly timer = h('div', 'obj-timer is-hidden');
  private readonly banner = h('div', 'story-banner');
  private readonly bannerK = h('span', 'sb-kicker');
  private readonly bannerT = h('b', 'sb-title');
  private readonly bannerS = h('span', 'sb-sub');
  private readonly meter = h('div', 'ability is-hidden');
  private readonly meterName = h('span', 'ab-name');
  private readonly meterBar = h('i', '');
  private readonly meterKey = h('span', 'ab-key');
  private readonly tip = h('div', 'story-tip is-hidden');
  private readonly skip = h('div', 'cin-skip is-hidden');
  private lastObj = '';
  private lastTimer = '';
  private lastMeter = '';
  private bannerT0 = 0;
  private subT = 0;
  private tipT = 0;
  private tipTimer = 0;

  constructor(parent: HTMLElement, hudRoot: HTMLElement) {
    this.sub.append(this.subWho, this.subText);
    this.obj.append(this.objKicker, this.objText, this.objSub, this.objGold);
    this.banner.append(this.bannerK, this.bannerT, this.bannerS);
    this.meter.append(this.meterName, h('span', 'ab-bar', this.meterBar), this.meterKey);
    this.root = h('div', 'story-layer', this.barTop, this.barBot, this.sub, this.banner, this.tip, this.skip);
    this.root.setAttribute('aria-live', 'polite');
    parent.append(this.root);
    hudRoot.append(this.obj, this.timer, this.meter);
  }

  // ----------------------------------------------------------------------------------------------- objective

  setObjective(kicker: string | null, text: string | null, sub = '', gold: { label: string; done: boolean }[] = []): void {
    const key = `${kicker}|${text}|${sub}|${gold.map((g) => (g.done ? 1 : 0) + g.label).join(',')}`;
    if (key === this.lastObj) return;
    this.lastObj = key;
    if (!text) { this.obj.classList.add('is-hidden'); return; }
    this.obj.classList.remove('is-hidden');
    this.objKicker.textContent = kicker ?? '';
    this.objText.textContent = text;
    this.objSub.textContent = sub;
    this.objSub.classList.toggle('is-hidden', !sub);
    this.objGold.textContent = '';
    for (const g of gold) this.objGold.append(h('span', `gold-chip${g.done ? ' done' : ''}`, (g.done ? '★ ' : '☆ ') + g.label));
  }

  setTimer(label: string | null, secs = 0, warn = false): void {
    const s = Math.max(0, Math.ceil(secs));
    const key = label === null ? '' : `${label}|${s}|${warn}`;
    if (key === this.lastTimer) return;
    this.lastTimer = key;
    if (label === null) { this.timer.classList.add('is-hidden'); return; }
    this.timer.classList.remove('is-hidden');
    this.timer.classList.toggle('warn', warn);
    this.timer.textContent = `${label}  ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // ----------------------------------------------------------------------------------------------- cinematic

  setBars(on: boolean): void {
    this.barTop.classList.toggle('on', on);
    this.barBot.classList.toggle('on', on);
    this.root.classList.toggle('cinematic', on);
  }

  setSkipHint(text: string | null): void {
    this.skip.classList.toggle('is-hidden', !text);
    if (text) this.skip.textContent = text;
  }

  /** Show a subtitle line for `secs` seconds. */
  say(who: string, color: string, text: string, secs: number): void {
    this.subWho.textContent = who ? who + ':' : '';
    this.subWho.style.color = color;
    this.subText.textContent = text;
    this.sub.classList.remove('is-hidden');
    this.subT = secs;
  }

  clearSay(): void {
    this.subT = 0;
    this.sub.classList.add('is-hidden');
  }

  // ----------------------------------------------------------------------------------------------- banner & tips

  showBanner(kicker: string, title: string, sub = '', tone: 'neutral' | 'good' | 'bad' = 'neutral', secs = 3): void {
    this.bannerK.textContent = kicker;
    this.bannerT.textContent = title;
    this.bannerS.textContent = sub;
    this.banner.dataset.tone = tone;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    this.bannerT0 = secs;
  }

  showTip(text: string, secs = 6): void {
    this.tip.textContent = text;
    this.tip.classList.remove('is-hidden');
    this.tipT = secs;
  }

  hideTip(): void {
    this.tipT = 0;
    this.tip.classList.add('is-hidden');
  }

  // ----------------------------------------------------------------------------------------------- ability meter

  setMeter(name: string | null, frac = 0, active = false, color = '#ff7a59', key = ''): void {
    const sig = name ? `${name}|${Math.round(frac * 100)}|${active}|${color}|${key}` : '';
    if (sig === this.lastMeter) return;
    this.lastMeter = sig;
    if (!name) { this.meter.classList.add('is-hidden'); return; }
    this.meter.classList.remove('is-hidden');
    this.meter.classList.toggle('active', active);
    this.meterName.textContent = name;
    this.meterBar.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
    this.meterBar.style.background = color;
    this.meterKey.textContent = key;
  }

  /** Hide the gameplay chrome (objective, timer, meter) during a cutscene. */
  setChromeHidden(hidden: boolean): void {
    for (const e of [this.obj, this.timer, this.meter]) e.classList.toggle('cin-hidden', hidden);
  }

  update(dt: number): void {
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.sub.classList.add('is-hidden'); }
    if (this.tipT > 0) { this.tipT -= dt; if (this.tipT <= 0) this.tip.classList.add('is-hidden'); }
    if (this.bannerT0 > 0) { this.bannerT0 -= dt; if (this.bannerT0 <= 0) this.banner.classList.remove('show'); }
    void this.tipTimer;
  }
}
