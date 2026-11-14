import { h } from './dom';
import { a11y } from '../core/a11y';

export interface CombatHudState {
  health: number;
  armour: number;
  hurt: number;
  stars: number;
  /** Police have eyes on the player. */
  seen: boolean;
  /** 0–1 progress of the search countdown (1 = just lost them). */
  search: number;
  /** Big status text under the stars. */
  status: string;
}

/** Health + armour bars, the wanted stars, damage vignette, Wasted/Busted overlay and dispatch subtitles. */
/** Splatter around the edges of the screen (made once, as an image). */
function screenBlood(): string {
  const W = 512, H = 288;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  let seed = 7;
  const r = (): number => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const blob = (x: number, y: number, rad: number, a: number): void => {
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(120,0,0,${a})`);
    g.addColorStop(0.75, `rgba(90,0,0,${a * 0.8})`);
    g.addColorStop(1, 'rgba(60,0,0,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
  };
  // clusters hugging the edges and corners, with spray drifting inward
  for (let k = 0; k < 9; k++) {
    const edge = Math.floor(r() * 4);
    const t = r();
    const x = edge === 0 ? 0 : edge === 1 ? W : t * W, y = edge === 2 ? 0 : edge === 3 ? H : t * H;
    for (let i = 0; i < 6; i++) blob(x + (r() - 0.5) * 50, y + (r() - 0.5) * 50, 18 + r() * 34, 0.75);
    for (let i = 0; i < 22; i++) {
      const ang = r() * Math.PI * 2, d = 30 + r() * 70;
      blob(x + Math.cos(ang) * d, y + Math.sin(ang) * d, 1.5 + r() * 5, 0.8);
    }
  }
  return cv.toDataURL();
}

export class CombatHud {
  private readonly vitals: HTMLElement;
  private readonly hp: HTMLElement;
  private readonly ap: HTMLElement;
  private readonly stars: HTMLElement;
  private readonly starEls: HTMLElement[] = [];
  private readonly status: HTMLElement;
  private readonly searchBar: HTMLElement;
  private readonly hurt: HTMLElement;
  private readonly flow: HTMLElement;
  private readonly flowTitle: HTMLElement;
  private readonly flowSub: HTMLElement;
  private readonly dispatch: HTMLElement;
  private dispatchT = 0;
  private lastStars = -1;
  private lastStatus = '';

  constructor(root: HTMLElement, hud: HTMLElement) {
    this.hp = h('i');
    this.ap = h('i');
    this.vitals = h('div', 'vitals', h('div', 'vbar armour is-hidden', this.ap), h('div', 'vbar health', this.hp));
    for (let i = 0; i < 6; i++) this.starEls.push(h('span', 'star', '★'));
    this.searchBar = h('i');
    this.status = h('div', 'wanted-status', '');
    this.stars = h('div', 'wanted is-hidden', h('div', 'stars', ...this.starEls), h('div', 'wanted-search', this.searchBar), this.status);
    this.hurt = h('div', 'hurt-vignette');
    this.blood = h('div', 'screen-blood');
    this.blood.style.backgroundImage = `url(${screenBlood()})`;
    this.dispatch = h('div', 'dispatch is-hidden', '');
    hud.append(this.vitals, this.stars, this.blood, this.hurt, this.dispatch);
    this.flowTitle = h('h2', 'flow-title', '');
    this.flowSub = h('p', 'flow-sub', '');
    this.flow = h('div', 'flow is-hidden', this.flowTitle, this.flowSub);
    root.append(this.flow);
  }

  private readonly blood: HTMLElement;
  private bloodLevel = 0;

  update(dt: number, s: CombatHudState): void {
    this.hp.style.transform = `scaleX(${Math.max(0, s.health / 100).toFixed(3)})`;
    this.hp.parentElement!.classList.toggle('low', s.health < 30);
    this.ap.style.transform = `scaleX(${Math.max(0, s.armour / 100).toFixed(3)})`;
    this.ap.parentElement!.classList.toggle('is-hidden', s.armour <= 0.5);
    this.hurt.style.opacity = String(Math.min(0.9, s.hurt * 0.9 * a11y.flashes + (s.health < 25 ? 0.18 : 0)));
    // blood at the screen edges: splashes on each hit, and stays while you are badly hurt
    this.bloodLevel = Math.max(this.bloodLevel - dt * 0.35, Math.min(1, s.hurt * 1.4), s.health < 35 ? (35 - s.health) / 35 * 0.75 : 0);
    const bo = (this.bloodLevel * a11y.flashes).toFixed(2);
    if (this.blood.style.opacity !== bo) this.blood.style.opacity = bo;
    if (s.stars !== this.lastStars) {
      this.lastStars = s.stars;
      this.starEls.forEach((e, i) => e.classList.toggle('on', i < s.stars));
      this.stars.classList.toggle('is-hidden', s.stars === 0);
    }
    this.stars.classList.toggle('seen', s.seen);
    this.stars.classList.toggle('searching', s.stars > 0 && !s.seen);
    this.searchBar.style.transform = `scaleX(${s.search.toFixed(3)})`;
    if (s.status !== this.lastStatus) {
      this.lastStatus = s.status;
      this.status.textContent = s.status;
    }
    if (this.dispatchT > 0) {
      this.dispatchT -= dt;
      if (this.dispatchT <= 0) this.dispatch.classList.add('is-hidden');
    }
  }

  say(text: string, secs = 4.5): void {
    this.dispatch.textContent = text;
    this.dispatch.classList.remove('is-hidden');
    this.dispatchT = secs;
  }

  showFlow(title: string, sub: string, tone: 'wasted' | 'busted'): void {
    this.flowTitle.textContent = title;
    this.flowSub.textContent = sub;
    this.flow.className = `flow ${tone}`;
    requestAnimationFrame(() => this.flow.classList.add('in'));
  }

  hideFlow(): void {
    this.flow.classList.remove('in');
    window.setTimeout(() => this.flow.classList.add('is-hidden'), 600);
  }

  setHudVisible(on: boolean): void {
    this.vitals.classList.toggle('is-hidden', !on);
  }
}
