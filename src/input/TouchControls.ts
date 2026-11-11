import type { Settings } from '../core/Settings';
import { clamp } from '../core/math';
import type { Action } from './Actions';
import type { InputManager } from './InputManager';

type Anchor = 'bl' | 'br' | 'tc';

interface ButtonDef {
  id: string;
  action: Action;
  label: string;
  /** Default placement: px (at a 420 px-tall reference screen) from a corner, or from the top centre. */
  at: Anchor;
  dx: number; // bl: from the left · br: from the right · tc: offset from the centre line
  dy: number; // bl/br: from the bottom · tc: from the top
  size: number; // px
  /** Latches on tap instead of tracking the finger (sprint on touch is easier as a toggle). */
  latch?: boolean;
  /** Which control layout shows this button (default: on foot). */
  mode?: 'foot' | 'vehicle' | 'both';
  /** Small, secondary button style. */
  small?: boolean;
}

/**
 * Two thumb clusters and a slim top bar. Right thumb: fire with aim, jump, reload, crouch and use around it.
 * Left thumb: the floating move stick, with sprint, the special ability and crew just above it. Menus sit in a row
 * across the top. Driving swaps the right cluster for gas, brake, drift and exit and the left for horn and camera.
 */
const BUTTONS: ButtonDef[] = [
  // ---- on foot, right thumb
  { id: 'fire', action: 'fire', label: 'Fire', at: 'br', dx: 96, dy: 118, size: 86 },
  { id: 'aim', action: 'aim', label: 'Aim', at: 'br', dx: 200, dy: 150, size: 64 },
  { id: 'jump', action: 'jump', label: 'Jump', at: 'br', dx: 196, dy: 56, size: 58 },
  { id: 'reload', action: 'reload', label: 'Reload', at: 'br', dx: 44, dy: 194, size: 50 },
  { id: 'interact', action: 'interact', label: 'Use', at: 'br', dx: 128, dy: 210, size: 56 },
  { id: 'crouch', action: 'crouch', label: 'Crouch', at: 'br', dx: 290, dy: 52, size: 52, latch: true },
  // ---- on foot, left thumb (the stick floats wherever the thumb lands below these)
  { id: 'sprint', action: 'sprint', label: 'Sprint', at: 'bl', dx: 52, dy: 176, size: 58, latch: true },
  { id: 'ability', action: 'ability', label: 'Power', at: 'bl', dx: 52, dy: 250, size: 48, mode: 'both', small: true },
  { id: 'crew', action: 'crew', label: 'Crew', at: 'bl', dx: 118, dy: 214, size: 48, mode: 'foot', small: true },
  // ---- top bar
  { id: 'menu', action: 'pause', label: 'Menu', at: 'tc', dx: -160, dy: 30, size: 44, mode: 'both', small: true },
  { id: 'map', action: 'map', label: 'Map', at: 'tc', dx: -106, dy: 30, size: 44, small: true },
  { id: 'phone', action: 'phone', label: 'Phone', at: 'tc', dx: -52, dy: 30, size: 44, small: true },
  { id: 'weapons', action: 'weaponWheel', label: 'Arms', at: 'tc', dx: 2, dy: 30, size: 44, small: true },
  { id: 'switch', action: 'character', label: 'Switch', at: 'tc', dx: 56, dy: 30, size: 44, mode: 'both', small: true },
  // ---- driving: steer with the left stick, pedals under the right thumb
  { id: 'v-gas', action: 'fire', label: 'Gas', at: 'br', dx: 92, dy: 112, size: 96, mode: 'vehicle' },
  { id: 'v-brake', action: 'aim', label: 'Brake', at: 'br', dx: 206, dy: 70, size: 74, mode: 'vehicle' },
  { id: 'v-hand', action: 'jump', label: 'Drift', at: 'br', dx: 200, dy: 172, size: 58, mode: 'vehicle' },
  { id: 'v-exit', action: 'interact', label: 'Exit', at: 'br', dx: 50, dy: 206, size: 52, mode: 'vehicle' },
  { id: 'v-horn', action: 'horn', label: 'Horn', at: 'bl', dx: 52, dy: 176, size: 54, mode: 'vehicle' },
  { id: 'v-back', action: 'crouch', label: 'Look back', at: 'bl', dx: 118, dy: 214, size: 48, mode: 'vehicle', small: true },
  { id: 'v-cam', action: 'cameraMode', label: 'Cam', at: 'bl', dx: 184, dy: 250, size: 48, mode: 'vehicle', small: true },
  { id: 'v-map', action: 'map', label: 'Map', at: 'tc', dx: -106, dy: 30, size: 44, mode: 'vehicle', small: true },
  { id: 'v-radio', action: 'radioWheel', label: 'Radio', at: 'tc', dx: -52, dy: 30, size: 44, mode: 'vehicle', small: true },
  { id: 'v-phone', action: 'phone', label: 'Phone', at: 'tc', dx: 2, dy: 30, size: 44, mode: 'vehicle', small: true },
  { id: 'v-lights', action: 'headlights', label: 'Lights', at: 'tc', dx: 110, dy: 30, size: 44, mode: 'vehicle', small: true },
];

const STICK_RADIUS = 58;

/**
 * On-screen controls: floating move stick (left), look-drag zone (right), context buttons,
 * optional gyro aim. Pure DOM + Pointer Events; multi-touch safe.
 */
export class TouchControls {
  readonly root: HTMLElement;
  private readonly leftZone: HTMLElement;
  private readonly lookZone: HTMLElement;
  private readonly stickBase: HTMLElement;
  private readonly stickKnob: HTMLElement;
  private readonly buttons = new Map<string, { def: ButtonDef; el: HTMLElement }>();

  private stickId = -1;
  private stickOrigin = { x: 0, y: 0 };
  private lookId = -1;
  private lookLast = { x: 0, y: 0 };
  private editing = false;
  private dragId = -1;
  private dragBtn: ButtonDef | null = null;
  private latched = new Set<string>();
  private gyroOn = false;
  private lastOrientation = 'landscape-primary';

  constructor(parent: HTMLElement, private readonly input: InputManager, private readonly settings: Settings) {
    this.root = document.createElement('div');
    this.root.className = 'touch';
    this.root.setAttribute('aria-hidden', 'true');

    this.leftZone = this.zone('touch-zone touch-left');
    this.lookZone = this.zone('touch-zone touch-look');
    this.stickBase = document.createElement('div');
    this.stickBase.className = 'touch-stick';
    this.stickKnob = document.createElement('div');
    this.stickKnob.className = 'touch-knob';
    this.stickBase.append(this.stickKnob);
    this.root.append(this.leftZone, this.lookZone, this.stickBase);

    for (const def of BUTTONS) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'touch-btn';
      const face = document.createElement('span');
      face.className = 'touch-face';
      face.textContent = def.label;
      el.append(face);
      el.dataset.id = def.id;
      el.tabIndex = -1;
      this.root.append(el);
      this.buttons.set(def.id, { def, el });
      this.wireButton(def, el);
    }
    parent.append(this.root);

    this.leftZone.addEventListener('pointerdown', (e) => this.stickDown(e));
    this.leftZone.addEventListener('pointermove', (e) => this.stickMove(e));
    this.leftZone.addEventListener('pointerup', (e) => this.stickUp(e));
    this.leftZone.addEventListener('pointercancel', (e) => this.stickUp(e));
    this.lookZone.addEventListener('pointerdown', (e) => this.lookDown(e));
    this.lookZone.addEventListener('pointermove', (e) => this.lookMove(e));
    this.lookZone.addEventListener('pointerup', (e) => this.lookUp(e));
    this.lookZone.addEventListener('pointercancel', (e) => this.lookUp(e));

    window.addEventListener('resize', () => this.layout());
    screen.orientation?.addEventListener?.('change', () => (this.lastOrientation = screen.orientation.type));
    this.lastOrientation = screen.orientation?.type ?? 'landscape-primary';
    settings.on('change', () => this.layout());
    this.layout();
    this.setGyro(settings.data.controls.gyro);
  }

  private zone(cls: string): HTMLElement {
    const el = document.createElement('div');
    el.className = cls;
    return el;
  }

  /** Called when the game is in a state where on-screen controls should be interactive. */
  setActive(active: boolean): void {
    this.root.classList.toggle('active', active);
    if (!active) this.releaseAll();
  }

  get gyroActive(): boolean {
    return this.gyroOn;
  }

  get isEditing(): boolean {
    return this.editing;
  }

  setEditing(on: boolean): void {
    this.editing = on;
    this.root.classList.toggle('editing', on);
    if (on) this.releaseAll();
  }

  resetLayout(): void {
    this.settings.update((d) => {
      d.controls.touchLayout = {};
    });
  }

  // ------------------------------------------------------------------ layout

  private vehicleMode = false;

  /** Swap between the on-foot and driving button sets. */
  setMode(mode: 'foot' | 'vehicle'): void {
    const vehicle = mode === 'vehicle';
    if (vehicle === this.vehicleMode) return;
    this.vehicleMode = vehicle;
    this.latched.clear();
    for (const { def, el } of this.buttons.values()) {
      el.classList.remove('down', 'on');
      this.input.setTouchAction(def.action, false);
    }
    this.layout();
  }

  private shows(def: ButtonDef): boolean {
    const m = def.mode ?? 'foot';
    return m === 'both' || (m === 'vehicle') === this.vehicleMode;
  }

  /** Default centre of a button in px for the current screen. */
  private defaultPos(def: ButtonDef, w: number, h: number, scale: number): { x: number; y: number } {
    switch (def.at) {
      case 'bl': return { x: def.dx * scale, y: h - def.dy * scale };
      case 'br': return { x: w - def.dx * scale, y: h - def.dy * scale };
      case 'tc': return { x: w / 2 + def.dx * scale, y: def.dy * scale };
    }
  }

  private layout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const lay = this.settings.data.controls.touchLayout;
    // phones in landscape are ~360-430 px tall; tablets get bigger buttons, tiny screens slightly smaller ones
    const scale = clamp(Math.min(w, h) / 420, 0.78, 1.35);
    this.root.style.setProperty('--touch-opacity', String(this.settings.data.controls.touchOpacity));
    for (const { def, el } of this.buttons.values()) {
      const saved = lay[def.id];
      const p = saved ? { x: saved.x * w, y: saved.y * h } : this.defaultPos(def, w, h, scale);
      const size = def.size * scale;
      el.style.display = this.shows(def) ? '' : 'none';
      el.style.width = el.style.height = `${size}px`;
      el.style.transform = `translate(${p.x - size / 2}px, ${p.y - size / 2}px)`;
      el.classList.toggle('small', !!def.small);
      el.classList.toggle('primary', def.id === 'fire' || def.id === 'v-gas');
    }
  }

  private saveButtonPos(def: ButtonDef, cx: number, cy: number): void {
    const x = clamp(cx / window.innerWidth, 0.04, 0.96);
    const y = clamp(cy / window.innerHeight, 0.06, 0.94);
    this.settings.update((d) => {
      d.controls.touchLayout[def.id] = { x, y };
    });
  }

  // ----------------------------------------------------------------- buttons

  private wireButton(def: ButtonDef, el: HTMLElement): void {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      if (this.editing) {
        this.dragId = e.pointerId;
        this.dragBtn = def;
        return;
      }
      if (this.isLatch(def)) {
        // Tap once to hold, tap again to release.
        const on = !this.latched.has(def.id);
        if (on) this.latched.add(def.id);
        else this.latched.delete(def.id);
        el.classList.toggle('on', on);
        this.input.setTouchAction(def.action, on);
      } else {
        el.classList.add('down');
        this.input.setTouchAction(def.action, true);
      }
      this.input.rumble(0.15, 0.05, 12);
    });
    el.addEventListener('pointermove', (e) => {
      if (this.editing && this.dragId === e.pointerId && this.dragBtn === def) {
        this.saveButtonPos(def, e.clientX, e.clientY);
      }
    });
    const up = (e: PointerEvent) => {
      if (this.editing) {
        if (this.dragId === e.pointerId) this.dragId = -1;
        return;
      }
      if (!this.isLatch(def)) {
        el.classList.remove('down');
        this.input.setTouchAction(def.action, false);
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * Sprint/crouch buttons latch when the player's mode is "hold" (a thumb is busy elsewhere).
   * In "toggle" mode they are plain taps and the input manager does the toggling.
   */
  private isLatch(def: ButtonDef): boolean {
    if (!def.latch) return false;
    const c = this.settings.data.controls;
    const mode = def.action === 'sprint' ? c.sprintMode : def.action === 'crouch' ? c.crouchMode : 'hold';
    return mode === 'hold';
  }

  private releaseAll(): void {
    this.stickId = -1;
    this.lookId = -1;
    this.input.setTouchMove(0, 0);
    this.stickBase.classList.remove('show');
    this.latched.clear();
    for (const { def, el } of this.buttons.values()) {
      el.classList.remove('down', 'on');
      this.input.setTouchAction(def.action, false);
    }
    this.input.setTouchPointers(0);
  }

  // ------------------------------------------------------------------- stick

  private stickDown(e: PointerEvent): void {
    if (this.editing || this.stickId !== -1) return;
    e.preventDefault();
    this.leftZone.setPointerCapture(e.pointerId);
    this.stickId = e.pointerId;
    this.stickOrigin.x = e.clientX;
    this.stickOrigin.y = e.clientY;
    this.stickBase.style.transform = `translate(${e.clientX - STICK_RADIUS}px, ${e.clientY - STICK_RADIUS}px)`;
    this.stickKnob.style.transform = 'translate(0px, 0px)';
    this.stickBase.classList.add('show');
    this.countPointers();
  }

  private stickMove(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    let dx = e.clientX - this.stickOrigin.x;
    let dy = e.clientY - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      // The base drags along with the finger so direction changes stay responsive.
      const k = STICK_RADIUS / len;
      this.stickOrigin.x = e.clientX - dx * k;
      this.stickOrigin.y = e.clientY - dy * k;
      this.stickBase.style.transform = `translate(${this.stickOrigin.x - STICK_RADIUS}px, ${this.stickOrigin.y - STICK_RADIUS}px)`;
      dx *= k;
      dy *= k;
    }
    this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dead = 0.12;
    let nx = dx / STICK_RADIUS;
    let ny = -dy / STICK_RADIUS;
    const m = Math.hypot(nx, ny);
    if (m < dead) nx = ny = 0;
    else {
      const s = (m - dead) / (1 - dead) / m;
      nx *= s;
      ny *= s;
    }
    this.input.setTouchMove(nx, ny);
  }

  private stickUp(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    this.stickId = -1;
    this.input.setTouchMove(0, 0);
    this.stickBase.classList.remove('show');
    this.countPointers();
  }

  // -------------------------------------------------------------------- look

  private lookDown(e: PointerEvent): void {
    if (this.editing || this.lookId !== -1) return;
    e.preventDefault();
    this.lookZone.setPointerCapture(e.pointerId);
    this.lookId = e.pointerId;
    this.lookLast.x = e.clientX;
    this.lookLast.y = e.clientY;
    this.countPointers();
  }

  private lookMove(e: PointerEvent): void {
    if (e.pointerId !== this.lookId) return;
    // Coalesced events keep fast swipes smooth on high-polling-rate screens.
    const events = e.getCoalescedEvents?.() ?? [];
    const list = events.length ? events : [e];
    for (const ev of list) {
      this.input.addTouchLook(ev.clientX - this.lookLast.x, ev.clientY - this.lookLast.y);
      this.lookLast.x = ev.clientX;
      this.lookLast.y = ev.clientY;
    }
  }

  private lookUp(e: PointerEvent): void {
    if (e.pointerId !== this.lookId) return;
    this.lookId = -1;
    this.countPointers();
  }

  private countPointers(): void {
    this.input.setTouchPointers((this.stickId !== -1 ? 1 : 0) + (this.lookId !== -1 ? 1 : 0));
  }

  // -------------------------------------------------------------------- gyro

  /** Enable gyro aim. iOS requires a permission prompt from a user gesture. */
  async setGyro(on: boolean): Promise<boolean> {
    if (!on) {
      this.gyroOn = false;
      this.lastMotionT = 0;
      window.removeEventListener('devicemotion', this.onMotion);
      return false;
    }
    if (this.gyroOn) return true;
    if (typeof DeviceMotionEvent === 'undefined') return false;
    const req = (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    if (typeof req === 'function') {
      try {
        if ((await req.call(DeviceMotionEvent)) !== 'granted') return false;
      } catch {
        return false;
      }
    }
    this.gyroOn = true;
    window.addEventListener('devicemotion', this.onMotion);
    return true;
  }

  /**
   * Converts device rotation rate (deg/s about device axes) into look rotation for the current
   * screen orientation. NOTE: signs follow the W3C axis definitions but have not yet been
   * verified on physical hardware.
   */
  private lastMotionT = 0;
  private onMotion = (e: DeviceMotionEvent): void => {
    const r = e.rotationRate;
    const now = e.timeStamp;
    const dt = this.lastMotionT ? Math.min(0.05, (now - this.lastMotionT) / 1000) : 0;
    this.lastMotionT = now;
    if (!r || r.beta == null || r.gamma == null || dt <= 0) return;
    const rad = Math.PI / 180;
    const beta = r.beta * rad; // about device X
    const gamma = r.gamma * rad; // about device Y
    let yawLeft: number; // positive = turn left (CCW from above)
    let pitchUp: number;
    switch (this.lastOrientation) {
      case 'landscape-primary':
        yawLeft = beta;
        pitchUp = -gamma;
        break;
      case 'landscape-secondary':
        yawLeft = -beta;
        pitchUp = gamma;
        break;
      case 'portrait-secondary':
        yawLeft = -gamma;
        pitchUp = -beta;
        break;
      default:
        yawLeft = gamma;
        pitchUp = beta;
    }
    this.input.addGyro(-yawLeft * dt, -pitchUp * dt);
  };
}
