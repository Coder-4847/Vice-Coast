import type { Craft } from '../craft/Craft';
import { h as el } from './dom';

/** Instruments for boats, helicopters and planes (speed, altitude, throttle, gear, horizon). */
export class CraftHud {
  private readonly root: HTMLElement;
  private readonly name: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly alt: HTMLElement;
  private readonly vsi: HTMLElement;
  private readonly hdg: HTMLElement;
  private readonly thr: HTMLElement;
  private readonly thrFill: HTMLElement;
  private readonly flags: HTMLElement;
  private readonly horizon: HTMLElement;
  private readonly horizonBall: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly warn: HTMLElement;
  private readonly reticle: HTMLElement;
  private shown = false;

  constructor(parent: HTMLElement) {
    this.name = el('div', 'ch-name', '');
    this.speed = el('b', '', '0');
    this.alt = el('b', '', '0');
    this.vsi = el('b', '', '0');
    this.hdg = el('b', '', '000');
    this.thrFill = el('i');
    this.thr = el('div', 'ch-bar', this.thrFill);
    this.flags = el('div', 'ch-flags', '');
    this.warn = el('div', 'ch-warn is-hidden', '');
    this.horizonBall = el('div', 'ch-ball');
    this.horizon = el('div', 'ch-horizon', this.horizonBall);
    this.hint = el('div', 'ch-hint', '');
    this.root = el(
      'div', 'craft-hud is-hidden', this.name,
      el('div', 'ch-row', el('span', '', 'SPD'), this.speed, el('em', '', 'km/h')),
      el('div', 'ch-row ch-air', el('span', '', 'ALT'), this.alt, el('em', '', 'm')),
      el('div', 'ch-row ch-air', el('span', '', 'V/S'), this.vsi, el('em', '', 'm/s')),
      el('div', 'ch-row ch-air', el('span', '', 'HDG'), this.hdg, el('em', '', '°')),
      this.thr, this.flags, this.horizon, this.warn, this.hint,
    );
    this.reticle = el('div', 'ch-reticle is-hidden', el('i'));
    parent.append(this.root, this.reticle);
  }

  setHint(text: string): void {
    this.hint.textContent = text;
  }

  update(c: Craft | null, camera: string): void {
    if (!c) {
      if (this.shown) { this.root.classList.add('is-hidden'); this.reticle.classList.add('is-hidden'); this.shown = false; }
      return;
    }
    if (!this.shown) { this.root.classList.remove('is-hidden'); this.shown = true; }
    const kind = c.spec.kind;
    this.root.dataset.kind = kind;
    this.name.textContent = c.spec.name;
    this.speed.textContent = String(Math.round(c.speedKmh));
    this.alt.textContent = String(Math.round(c.agl));
    this.vsi.textContent = (c.vsi >= 0 ? '+' : '') + c.vsi.toFixed(1);
    this.hdg.textContent = String(Math.round(((c.heading * 180) / Math.PI + 360) % 360)).padStart(3, '0');
    this.reticle.classList.toggle('is-hidden', kind !== 'ground');
    const gun = c.spec.ground?.cannon;
    const fill = kind === 'plane' ? c.throttle : kind === 'heli' ? c.rotor : kind === 'ground' ? (gun ? 1 - c.cannonT / gun.reload : Math.abs(c.load)) : Math.abs(c.load);
    this.thrFill.style.transform = `scaleX(${Math.max(0, Math.min(1, fill))})`;
    const f: string[] = [];
    if (kind === 'plane') { f.push(c.gear > 0.85 ? 'GEAR DOWN' : c.gear < 0.15 ? 'GEAR UP' : 'GEAR…'); if (c.flaps > 0.5) f.push('FLAPS'); }
    if (kind === 'heli') f.push(c.rotor < 0.9 ? 'ROTOR SPOOLING' : 'ROTOR');
    if (kind === 'ground') f.push(gun ? (c.cannonT > 0 ? 'CANNON RELOADING' : 'CANNON READY') : 'AUTOCANNON');
    f.push(`CAM ${camera.toUpperCase()}`);
    this.flags.textContent = f.join(' · ');
    const stall = kind === 'plane' && c.stalled;
    const low = kind === 'plane' && c.agl < 60 && c.vsi < -9 && c.gear < 0.5;
    this.warn.textContent = stall ? 'STALL' : low ? 'PULL UP' : c.health < 300 ? 'DAMAGE' : '';
    this.warn.classList.toggle('is-hidden', !(stall || low || c.health < 300));
    if (kind === 'plane' || kind === 'heli') {
      this.horizonBall.style.transform = `rotate(${(-c.roll).toFixed(3)}rad) translateY(${(c.pitch * 120).toFixed(1)}px)`;
    }
  }
}
