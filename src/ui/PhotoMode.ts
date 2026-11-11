import * as THREE from 'three';
import { h } from './dom';
import { MenuNav } from './MenuNav';

export type PhotoFilter = 'none' | 'noir' | 'vintage' | 'vivid' | 'cool';

export interface PhotoHooks {
  camera: THREE.PerspectiveCamera;
  /** Look delta since last frame (radians) and move axes. */
  look(out: { x: number; y: number }): void;
  move(): { x: number; y: number; up: number; fast: boolean };
  ground(x: number, z: number): number;
  hour(): number;
  setHour(hr: number): void;
  setFilter(f: PhotoFilter): void;
  setHud(visible: boolean): void;
  shoot(): void;
  exit(): void;
}

const FILTERS: { id: PhotoFilter; label: string }[] = [
  { id: 'none', label: 'Natural' }, { id: 'vivid', label: 'Vivid' }, { id: 'vintage', label: 'Vintage' }, { id: 'cool', label: 'Cool' }, { id: 'noir', label: 'Noir' },
];

/**
 * Photo mode: the world freezes and a free camera flies within 60 m of where you stopped.
 * WASD / left stick move, mouse / right stick look, Space / C up and down, Shift fast.
 * The side panel sets field of view, roll, time of day and a filter, hides the panel, and saves a PNG.
 */
export class PhotoMode {
  readonly root: HTMLElement;
  private readonly nav: MenuNav;
  active = false;
  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  private fov = 60;
  private filter: PhotoFilter = 'none';
  private readonly origin = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private saved = { fov: 60, hour: 12 };
  private panelHidden = false;
  private readonly look = { x: 0, y: 0 };
  private readonly fovOut: HTMLElement;
  private readonly rollOut: HTMLElement;
  private readonly hourOut: HTMLElement;
  private readonly fovIn: HTMLInputElement;
  private readonly rollIn: HTMLInputElement;
  private readonly hourIn: HTMLInputElement;
  private readonly filterRow: HTMLElement;

  constructor(parent: HTMLElement, private readonly hooks: PhotoHooks) {
    const slider = (label: string, min: number, max: number, step: number, on: (v: number) => void): [HTMLElement, HTMLInputElement, HTMLElement] => {
      const input = h('input');
      input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step);
      input.setAttribute('aria-label', label);
      const out = h('output', '', '');
      input.addEventListener('input', () => on(Number(input.value)));
      const row = h('div', 'pm-row', h('div', 'pm-rowtop', h('span', 'pm-k', label), out), input);
      row.dataset.navRow = '';
      return [row, input, out];
    };
    const [fovRow, fovIn, fovOut] = slider('Field of view', 15, 100, 1, (v) => { this.fov = v; this.paint(); });
    const [rollRow, rollIn, rollOut] = slider('Roll', -45, 45, 1, (v) => { this.roll = v; this.paint(); });
    const [hourRow, hourIn, hourOut] = slider('Time of day', 0, 23.75, 0.25, (v) => { this.hooks.setHour(v); this.paint(); });
    this.fovIn = fovIn; this.fovOut = fovOut; this.rollIn = rollIn; this.rollOut = rollOut; this.hourIn = hourIn; this.hourOut = hourOut;
    this.filterRow = h('div', 'pm-filters');
    this.filterRow.dataset.navRow = '';
    for (const f of FILTERS) {
      const b = h('button', 'pm-chip', f.label);
      b.type = 'button';
      b.dataset.f = f.id;
      b.addEventListener('click', () => { this.filter = f.id; this.hooks.setFilter(f.id); this.paint(); });
      this.filterRow.append(b);
    }
    const shoot = h('button', 'btn primary', 'Take photo');
    shoot.type = 'button';
    shoot.addEventListener('click', () => this.take());
    const hide = h('button', 'btn', 'Hide panel (H)');
    hide.type = 'button';
    hide.addEventListener('click', () => this.togglePanel());
    const exit = h('button', 'btn', 'Exit (Esc)');
    exit.type = 'button';
    exit.addEventListener('click', () => this.hooks.exit());
    const acts = h('div', 'pm-acts', shoot, hide, exit);
    acts.dataset.navRow = '';
    this.root = h('div', 'photomode is-hidden',
      h('div', 'pm-panel panel-glass',
        h('div', 'pm-head', h('b', '', 'Photo mode'), h('span', '', 'WASD move · mouse look · Space / C up / down · Shift fast')),
        fovRow, rollRow, hourRow,
        h('div', 'pm-k pm-sec', 'Filter'), this.filterRow,
        acts),
      h('div', 'pm-grid'),
    );
    parent.append(this.root);
    this.nav = new MenuNav(this.root);
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'KeyH') { e.preventDefault(); this.togglePanel(); }
      else if (e.code === 'Enter' && (document.activeElement === document.body || !this.root.contains(document.activeElement))) { e.preventDefault(); this.take(); }
    });
  }

  enter(): void {
    const cam = this.hooks.camera;
    this.active = true;
    this.origin.copy(cam.position);
    this.pos.copy(cam.position);
    const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
    this.yaw = e.y; this.pitch = e.x; this.roll = 0;
    this.saved = { fov: cam.fov, hour: this.hooks.hour() };
    this.fov = Math.round(cam.fov);
    this.filter = 'none';
    this.hooks.setFilter('none');
    this.hooks.setHud(false);
    this.panelHidden = false;
    this.root.classList.remove('is-hidden', 'bare');
    this.paint();
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    const cam = this.hooks.camera;
    cam.fov = this.saved.fov;
    cam.updateProjectionMatrix();
    this.hooks.setHour(this.saved.hour);
    this.hooks.setFilter('none');
    this.hooks.setHud(true);
    this.root.classList.add('is-hidden');
    (document.activeElement as HTMLElement | null)?.blur();
  }

  private togglePanel(): void {
    this.panelHidden = !this.panelHidden;
    this.root.classList.toggle('bare', this.panelHidden);
  }

  private take(): void {
    const wasHidden = this.panelHidden;
    this.root.classList.add('bare');
    requestAnimationFrame(() => {
      this.hooks.shoot();
      setTimeout(() => this.root.classList.toggle('bare', wasHidden), 250);
    });
  }

  private paint(): void {
    this.fovIn.value = String(this.fov); this.fovOut.textContent = `${this.fov}°`;
    this.rollIn.value = String(this.roll); this.rollOut.textContent = `${this.roll}°`;
    const hr = this.hooks.hour();
    this.hourIn.value = String(hr);
    this.hourOut.textContent = `${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.round((hr % 1) * 60) % 60).padStart(2, '0')}`;
    for (const b of this.filterRow.querySelectorAll<HTMLElement>('.pm-chip')) b.classList.toggle('on', b.dataset.f === this.filter);
  }

  navigate(dx: number, dy: number): void { this.nav.move(dx, dy); }

  update(dt: number): void {
    if (!this.active) return;
    const cam = this.hooks.camera;
    this.hooks.look(this.look);
    this.yaw -= this.look.x;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - this.look.y));
    const mv = this.hooks.move();
    const sp = (mv.fast ? 22 : 7) * dt;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.pos.addScaledVector(fwd, mv.y * sp).addScaledVector(right, mv.x * sp);
    this.pos.y += mv.up * sp;
    // stay within 60 m of where photo mode began, and above the ground
    const off = this.pos.clone().sub(this.origin);
    if (off.length() > 60) this.pos.copy(this.origin).addScaledVector(off.normalize(), 60);
    this.pos.y = Math.max(this.pos.y, this.hooks.ground(this.pos.x, this.pos.z) + 0.4);
    cam.position.copy(this.pos);
    cam.rotation.set(this.pitch, this.yaw, THREE.MathUtils.degToRad(this.roll), 'YXZ');
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }
}
