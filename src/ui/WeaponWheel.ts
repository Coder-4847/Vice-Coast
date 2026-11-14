import { WEAPONS, WEAPON_ORDER, type WeaponId } from '../player/Weapons';
import { h } from './dom';

/** Radial weapon picker: hold the wheel button, point with the mouse / right stick, release to equip. */
export class WeaponWheel {
  private readonly root: HTMLElement;
  private readonly slots = new Map<WeaponId, HTMLElement>();
  private readonly centre: HTMLElement;
  private x = 0;
  private y = 0;
  private selected: WeaponId | null = null;
  isOpen = false;
  private mouse = (e: MouseEvent) => { if (this.isOpen) { this.x += e.movementX; this.y += e.movementY; const l = Math.hypot(this.x, this.y); if (l > 140) { this.x *= 140 / l; this.y *= 140 / l; } } };

  constructor(root: HTMLElement, private readonly inv: () => Record<WeaponId, { ammo: number; reserve: number; owned: boolean }>, private readonly choose: (id: WeaponId) => void) {
    this.centre = h('div', 'wheel-centre', '');
    this.root = h('div', 'wheel is-hidden', this.centre);
    WEAPON_ORDER.forEach((id) => {
      const el = h('button', 'wslot', h('b', '', WEAPONS[id].name), h('span', '', ''));
      el.type = 'button';
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.selected = id; this.finish(); });
      this.slots.set(id, el);
      this.root.append(el);
    });
    root.append(this.root);
    window.addEventListener('mousemove', this.mouse);
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.x = this.y = 0;
    this.selected = null;
    this.root.classList.remove('is-hidden');
    this.refresh();
  }

  /** The owned weapons, in order, around the ring (the ring widens as the arsenal grows). */
  private shown: WeaponId[] = [];

  private refresh(): void {
    const inv = this.inv();
    this.shown = WEAPON_ORDER.filter((id) => inv[id].owned);
    const n = Math.max(1, this.shown.length);
    const R = 112 + Math.max(0, n - 8) * 10;
    for (const [id, el] of this.slots) {
      const i = this.shown.indexOf(id);
      el.style.display = i < 0 ? 'none' : '';
      if (i >= 0) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        el.style.left = `calc(50% + ${Math.cos(a) * R}px)`;
        el.style.top = `calc(50% + ${Math.sin(a) * R}px)`;
      }
    }
    for (const [id, el] of this.slots) {
      const s = inv[id];
      el.classList.toggle('locked', !s.owned);
      (el.lastElementChild as HTMLElement).textContent = s.owned ? (WEAPONS[id].melee ? 'melee' : WEAPONS[id].throwable ? `×${s.ammo + s.reserve}` : `${s.ammo} / ${s.reserve}`) : 'not owned';
    }
  }

  /** Per frame while open: pick by direction (mouse accumulator or gamepad right stick). */
  tick(): void {
    if (!this.isOpen) return;
    let dx = this.x, dy = this.y;
    const pad = (navigator.getGamepads?.() ?? []).find((p) => p && p.connected);
    if (pad) {
      const sx = pad.axes[2] ?? 0, sy = pad.axes[3] ?? 0;
      if (Math.hypot(sx, sy) > 0.4) { dx = sx * 100; dy = sy * 100; }
    }
    this.selected = null;
    if (Math.hypot(dx, dy) > 36) {
      let best = 0, bd = -2;
      const list = this.shown.length ? this.shown : WEAPON_ORDER;
      list.forEach((_id, i) => {
        const a = (i / list.length) * Math.PI * 2 - Math.PI / 2;
        const d = (Math.cos(a) * dx + Math.sin(a) * dy) / (Math.hypot(dx, dy) || 1);
        if (d > bd) { bd = d; best = i; }
      });
      this.selected = list[best]!;
    }
    for (const [id, el] of this.slots) el.classList.toggle('on', id === this.selected);
    this.centre.textContent = this.selected ? WEAPONS[this.selected].blurb : 'Move to choose';
  }

  /** Close the wheel and equip the highlighted weapon (if any). */
  finish(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('is-hidden');
    if (this.selected) this.choose(this.selected);
    this.selected = null;
  }
}
