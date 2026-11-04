import { Emitter } from '../core/Emitter';
import { clamp } from '../core/math';
import type { Settings } from '../core/Settings';
import {
  ACTION_DEFS, PAD, detectPadLayout,
  type Action, type ActionBinding, type Device, type PadLayout,
} from './Actions';
import { glyphFor, type BindingSource } from './Glyphs';

export interface InputEvents {
  /** Active input device changed (drives glyph switching). */
  device: Device;
  /** Gamepad connected / disconnected. */
  gamepad: { connected: boolean; id: string; layout: PadLayout };
  /** Any key / click / tap / pad button, for "press any key" screens. */
  anyinput: Device;
}

const MOUSE_RAD_PER_PX = 0.0022;
const PAD_LOOK_RATE = 3.4; // rad/s at full deflection, sensitivity 1
const TRIGGER_THRESHOLD = 0.35;
const NAV_FIRST_DELAY = 0.38;
const NAV_REPEAT = 0.11;

type Holdable = 'sprint' | 'crouch' | 'aim';
const HOLDABLES: Holdable[] = ['sprint', 'crouch', 'aim'];

/**
 * Unifies keyboard + mouse, gamepad and touch behind one action API.
 * Call `beginFrame(dt)` once per rendered frame, before any consumer reads state.
 */
export class InputManager extends Emitter<InputEvents> implements BindingSource {
  activeDevice: Device = 'kbm';
  padLayout: PadLayout = 'xbox';
  padId = '';
  padConnected = false;
  padMapping = '';
  pointerLocked = false;

  private _gameplayEnabled = false;
  /** Keys held when gameplay switched on (e.g. the "press any key" press) are ignored until released. */
  private suppressed = new Set<string>();

  /** When false, gameplay actions read as released (menus, title, loading). */
  get gameplayEnabled(): boolean {
    return this._gameplayEnabled;
  }
  set gameplayEnabled(on: boolean) {
    if (on && !this._gameplayEnabled) this.suppressed = new Set(this.keys);
    this._gameplayEnabled = on;
  }

  /** Combined movement, x: +right, y: +forward, length ≤ 1. */
  readonly move = { x: 0, y: 0 };
  /** Menu navigation pulses for this frame (-1, 0, 1). Gamepad only. */
  readonly nav = { x: 0, y: 0, confirm: false, back: false, start: false };

  private keys = new Set<string>();
  /** Keys/buttons pressed since the last frame, and releases deferred until a frame has seen them down. */
  private keysUnseen = new Set<string>();
  private keysDeferred = new Set<string>();
  private cur = {} as Record<Action, boolean>;
  private prev = {} as Record<Action, boolean>;
  private toggled: Record<Holdable, boolean> = { sprint: false, crouch: false, aim: false };

  private pad: Gamepad | null = null;
  private padDown: boolean[] = new Array(17).fill(false);
  private padPrev: boolean[] = new Array(17).fill(false);
  private padAxes = [0, 0, 0, 0];
  private padMove = { x: 0, y: 0 };
  private padLook = { x: 0, y: 0 };
  private scratchL = { x: 0, y: 0 };
  private scratchR = { x: 0, y: 0 };

  private touchMove = { x: 0, y: 0 };
  private touchHeld = new Set<Action>();
  /** Touch presses not yet observed by a frame, and releases deferred until they are. */
  private touchUnseen = new Set<Action>();
  private touchDeferred = new Set<Action>();
  private touchPointers = 0;

  private lookX = 0;
  private lookY = 0;

  private captureDevice: Device | null = null;
  private captureResolve: ((v: string | number | null) => void) | null = null;

  private navKey = '';
  private navTimer = 0;

  constructor(private readonly settings: Settings, private readonly target: HTMLElement) {
    super();
    for (const d of ACTION_DEFS) {
      this.cur[d.id] = false;
      this.prev[d.id] = false;
    }
    this.bind();
    // If touch is the only pointer on this device, start in touch mode.
    if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) this.activeDevice = 'touch';
  }

  // ---------------------------------------------------------------- bindings

  binding(action: Action): ActionBinding {
    return this.settings.data.controls.bindings[action];
  }

  glyph(action: Action, device: Device = this.activeDevice): string {
    return glyphFor(this, action, device);
  }

  /** Rebind one slot. Removes the same input from every other action on that device. */
  rebind(action: Action, device: 'kbm' | 'pad', slot: number, value: string | number): Action[] {
    const orphaned: Action[] = [];
    this.settings.update((d) => {
      const all = d.controls.bindings;
      const own = all[action];
      const ownList = (device === 'kbm' ? own.kbm : own.pad) as (string | number)[];
      const replaced = ownList[slot];
      for (const def of ACTION_DEFS) {
        const b = all[def.id];
        const had = (device === 'kbm' ? b.kbm : b.pad).length;
        if (device === 'kbm') b.kbm = b.kbm.filter((k) => k !== value);
        else b.pad = b.pad.filter((k) => k !== value);
        const now = (device === 'kbm' ? b.kbm : b.pad).length;
        if (def.id !== action && had > 0 && now === 0) orphaned.push(def.id);
      }
      const list = (device === 'kbm' ? own.kbm : own.pad) as (string | number)[];
      const at = replaced === undefined ? -1 : list.indexOf(replaced);
      if (at >= 0) list[at] = value;
      else list.push(value);
      // at most two keyboard alternatives and one pad button per action
      if (device === 'kbm') own.kbm = own.kbm.slice(0, 2);
      else own.pad = own.pad.slice(0, 1);
    });
    return orphaned;
  }

  clearBinding(action: Action, device: 'kbm' | 'pad', slot: number): void {
    this.settings.update((d) => {
      const b = d.controls.bindings[action];
      if (device === 'kbm') b.kbm.splice(slot, 1);
      else b.pad.splice(slot, 1);
    });
  }

  /** Resolves with the next key/mouse button (kbm) or pad button index (pad); null if cancelled. */
  capture(device: 'kbm' | 'pad'): Promise<string | number | null> {
    this.cancelCapture();
    this.captureDevice = device === 'kbm' ? 'kbm' : 'gamepad';
    return new Promise((resolve) => (this.captureResolve = resolve));
  }

  cancelCapture(): void {
    this.captureResolve?.(null);
    this.captureResolve = null;
    this.captureDevice = null;
  }

  get capturing(): boolean {
    return this.captureDevice !== null;
  }

  private finishCapture(v: string | number | null): void {
    const r = this.captureResolve;
    this.captureResolve = null;
    this.captureDevice = null;
    r?.(v);
  }

  // ------------------------------------------------------------- frame state

  /** True while the action is held (raw, device-combined). */
  down(action: Action): boolean {
    return this.cur[action];
  }
  /**
   * 0–1 analogue value for an action: gamepad triggers report how far they are pulled (pedals), everything
   * else is 0 or 1. Honours the same gameplay gating as `down`.
   */
  analog(action: Action): number {
    if (!this._gameplayEnabled) return 0;
    let v = 0;
    const b = this.binding(action);
    for (const k of b.kbm) if (this.keys.has(k) && !this.suppressed.has(k)) return 1;
    if (this.touchHeld.has(action)) return 1;
    if (this.pad) {
      for (const i of b.pad) {
        const btn = this.pad.buttons[i];
        if (btn) v = Math.max(v, btn.value > 0.02 ? btn.value : btn.pressed ? 1 : 0);
      }
    }
    return v;
  }

  pressed(action: Action): boolean {
    return this.cur[action] && !this.prev[action];
  }
  released(action: Action): boolean {
    return !this.cur[action] && this.prev[action];
  }

  /** Hold/toggle-aware state for sprint, crouch and aim, per the player's settings. */
  active(action: Holdable): boolean {
    const mode = this.settings.data.controls[`${action}Mode` as const];
    return mode === 'toggle' ? this.toggled[action] : this.cur[action];
  }

  /** Returns and clears look rotation accumulated since the last call (radians; +x right, +y down). */
  consumeLook(out: { x: number; y: number }): void {
    out.x = this.lookX;
    out.y = this.lookY;
    this.lookX = 0;
    this.lookY = 0;
  }

  beginFrame(dt: number): void {
    this.pollPad(dt);
    const enabled = this.gameplayEnabled;

    for (const def of ACTION_DEFS) {
      const id = def.id;
      this.prev[id] = this.cur[id];
      let down = false;
      if (enabled) {
        const b = this.binding(id);
        for (const k of b.kbm) if (this.keys.has(k) && !this.suppressed.has(k)) { down = true; break; }
        if (!down && this.pad) for (const i of b.pad) if (this.padDown[i]) { down = true; break; }
        if (!down && this.touchHeld.has(id)) down = true;
      }
      this.cur[id] = down;
    }
    for (const k of this.suppressed) if (!this.keys.has(k)) this.suppressed.delete(k);
    this.keysUnseen.clear();
    for (const k of this.keysDeferred) this.keys.delete(k);
    this.keysDeferred.clear();
    this.touchUnseen.clear();
    for (const a of this.touchDeferred) this.touchHeld.delete(a);
    this.touchDeferred.clear();
    for (const h of HOLDABLES) if (this.pressed(h)) this.toggled[h] = !this.toggled[h];
    if (!enabled) {
      this.toggled.sprint = this.toggled.crouch = this.toggled.aim = false;
    }

    // Movement: keyboard digital + pad stick + touch stick, clamped to the unit circle.
    let mx = 0;
    let my = 0;
    if (enabled) {
      mx = (this.cur.moveRight ? 1 : 0) - (this.cur.moveLeft ? 1 : 0);
      my = (this.cur.moveForward ? 1 : 0) - (this.cur.moveBack ? 1 : 0);
      mx += this.padMove.x + this.touchMove.x;
      my += this.padMove.y + this.touchMove.y;
      const len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }
    }
    this.move.x = mx;
    this.move.y = my;

    if (enabled) {
      const c = this.settings.data.controls;
      const invert = c.padInvertY ? -1 : 1;
      this.lookX += this.padLook.x * PAD_LOOK_RATE * c.padSensitivity * dt;
      this.lookY += this.padLook.y * PAD_LOOK_RATE * c.padSensitivity * dt * invert;
    }
  }

  // -------------------------------------------------------------- touch sink

  setTouchMove(x: number, y: number): void {
    this.touchMove.x = x;
    this.touchMove.y = y;
  }
  setTouchAction(action: Action, down: boolean): void {
    if (down) {
      this.touchHeld.add(action);
      this.touchUnseen.add(action);
      this.touchDeferred.delete(action);
    } else if (this.touchUnseen.has(action)) {
      // Tap shorter than a frame: keep it down until one frame has seen it.
      this.touchDeferred.add(action);
    } else {
      this.touchHeld.delete(action);
    }
  }
  addTouchLook(dxPx: number, dyPx: number): void {
    if (!this.gameplayEnabled) return;
    const c = this.settings.data.controls;
    this.lookX += dxPx * 0.0042 * c.touchSensitivity;
    this.lookY += dyPx * 0.0042 * c.touchSensitivity * (c.invertY ? -1 : 1);
  }
  setTouchPointers(n: number): void {
    this.touchPointers = n;
  }
  /** Gyro rotation already integrated to radians in game convention (+x right, +y down). */
  addGyro(dx: number, dy: number): void {
    if (!this.gameplayEnabled) return;
    const c = this.settings.data.controls;
    this.lookX += dx * c.gyroSensitivity;
    this.lookY += dy * c.gyroSensitivity * (c.invertY ? -1 : 1);
  }

  // ----------------------------------------------------------------- haptics

  rumble(strong: number, weak: number, ms: number): void {
    if (!this.settings.data.controls.rumble) return;
    if (this.activeDevice === 'touch') {
      navigator.vibrate?.(Math.min(40, ms));
      return;
    }
    const act = this.pad?.vibrationActuator as
      | { playEffect?: (t: string, p: object) => Promise<unknown> }
      | undefined;
    act?.playEffect?.('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak })?.catch(() => {});
  }

  // -------------------------------------------------------------- debug view

  debugState() {
    return {
      device: this.activeDevice,
      padId: this.padId,
      padMapping: this.padMapping,
      padLayout: this.padLayout,
      padAxes: this.padAxes,
      padButtons: this.padDown,
      keys: [...this.keys],
      touchPointers: this.touchPointers,
      move: this.move,
      locked: this.pointerLocked,
    };
  }

  // ----------------------------------------------------------------- private

  private pressKey(code: string): void {
    this.keys.add(code);
    this.keysUnseen.add(code);
    this.keysDeferred.delete(code);
  }

  /** A tap shorter than one frame stays "down" until a frame has seen it, so quick presses are never lost. */
  private releaseKey(code: string): void {
    if (this.keysUnseen.has(code)) this.keysDeferred.add(code);
    else this.keys.delete(code);
  }

  private setDevice(d: Device): void {
    if (this.activeDevice === d) return;
    this.activeDevice = d;
    this.emit('device', d);
  }

  private isBoundKey(code: string): boolean {
    for (const def of ACTION_DEFS) if (this.binding(def.id).kbm.includes(code)) return true;
    return false;
  }

  private bind(): void {
    const w = window;

    // Capture phase + stopPropagation: while rebinding, no other handler (menu navigation,
    // Esc-to-resume) may see the key that is being assigned or cancelled.
    w.addEventListener('keydown', (e) => {
      if (this.captureDevice !== 'kbm') return;
      e.preventDefault();
      e.stopPropagation();
      this.finishCapture(e.code === 'Escape' ? null : e.code);
    }, true);
    w.addEventListener('keydown', (e) => {
      this.setDevice('kbm');
      this.pressKey(e.code);
      if (!e.repeat) this.emit('anyinput', 'kbm');
      if (this.gameplayEnabled && !e.ctrlKey && !e.metaKey && !e.altKey && this.isBoundKey(e.code)) e.preventDefault();
    });
    w.addEventListener('keyup', (e) => {
      this.releaseKey(e.code);
    });
    w.addEventListener('blur', () => {
      this.keys.clear();
      this.touchHeld.clear();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.keys.clear();
    });

    // Device detection and button capture use Pointer Events, which report the true
    // pointer type (touch taps do not masquerade as mouse movement).
    w.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        if (this.captureDevice === 'kbm') {
          e.preventDefault();
          e.stopPropagation();
          this.finishCapture('Mouse' + e.button);
          return;
        }
        this.setDevice('kbm');
        this.emit('anyinput', 'kbm');
      } else {
        this.setDevice('touch');
        this.emit('anyinput', 'touch');
      }
    }, true);
    w.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && (Math.abs(e.movementX) + Math.abs(e.movementY) > 2)) this.setDevice('kbm');
    }, { passive: true });

    // Mouse buttons and look are only live while the pointer is captured, so the
    // click that captures the pointer never fires a weapon.
    w.addEventListener('mousedown', (e) => {
      if (this.pointerLocked) this.pressKey('Mouse' + e.button);
    });
    w.addEventListener('mouseup', (e) => {
      this.releaseKey('Mouse' + e.button);
    });
    w.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked || !this.gameplayEnabled) return;
      const c = this.settings.data.controls;
      // Ignore the occasional huge spike some browsers emit when the lock engages.
      const dx = clamp(e.movementX, -400, 400);
      const dy = clamp(e.movementY, -400, 400);
      this.lookX += dx * MOUSE_RAD_PER_PX * c.mouseSensitivity;
      this.lookY += dy * MOUSE_RAD_PER_PX * c.mouseSensitivity * (c.invertY ? -1 : 1);
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.target;
      if (!this.pointerLocked) {
        for (const k of [...this.keys]) if (k.startsWith('Mouse')) this.keys.delete(k);
      }
    });
    w.addEventListener('contextmenu', (e) => {
      if (this.gameplayEnabled) e.preventDefault();
    });

    w.addEventListener('gamepadconnected', (e) => {
      this.padLayout = detectPadLayout(e.gamepad.id);
      this.padId = e.gamepad.id;
      this.padConnected = true;
      this.emit('gamepad', { connected: true, id: e.gamepad.id, layout: this.padLayout });
    });
    w.addEventListener('gamepaddisconnected', (e) => {
      if (this.pad && this.pad.index === e.gamepad.index) this.pad = null;
      this.padConnected = !!this.findPad();
      this.emit('gamepad', { connected: false, id: e.gamepad.id, layout: this.padLayout });
      if (!this.padConnected && this.activeDevice === 'gamepad') this.setDevice('kbm');
    });
  }

  private findPad(): Gamepad | null {
    const list = navigator.getGamepads?.() ?? [];
    let fallback: Gamepad | null = null;
    for (const p of list) {
      if (!p || !p.connected) continue;
      if (p.mapping === 'standard') return p;
      fallback ??= p;
    }
    return fallback;
  }

  private stick(x: number, y: number, dz: number, out: { x: number; y: number }): number {
    const m = Math.hypot(x, y);
    if (m <= dz) {
      out.x = out.y = 0;
      return 0;
    }
    const s = Math.min(1, (m - dz) / (1 - dz));
    out.x = (x / m) * s;
    out.y = (y / m) * s;
    return s;
  }

  private pollPad(dt: number): void {
    const pad = this.findPad();
    this.nav.x = this.nav.y = 0;
    this.nav.confirm = this.nav.back = this.nav.start = false;

    if (!pad) {
      this.pad = null;
      this.padMove.x = this.padMove.y = this.padLook.x = this.padLook.y = 0;
      this.padDown.fill(false);
      this.padPrev.fill(false);
      return;
    }
    if (!this.padConnected || pad.id !== this.padId) {
      this.padConnected = true;
      this.padId = pad.id;
      this.padLayout = detectPadLayout(pad.id);
      this.emit('gamepad', { connected: true, id: pad.id, layout: this.padLayout });
    }
    this.pad = pad;
    this.padMapping = pad.mapping || 'non-standard';

    const buttons = pad.buttons;
    let edge = false;
    for (let i = 0; i < this.padDown.length; i++) {
      this.padPrev[i] = this.padDown[i]!;
      const b = buttons[i];
      const threshold = i === PAD.LT || i === PAD.RT ? TRIGGER_THRESHOLD : 0.5;
      const down = !!b && (b.pressed || b.value > threshold);
      this.padDown[i] = down;
      if (down && !this.padPrev[i]) edge = true;
    }

    const ax = pad.axes;
    this.padAxes[0] = ax[0] ?? 0;
    this.padAxes[1] = ax[1] ?? 0;
    this.padAxes[2] = ax[2] ?? 0;
    this.padAxes[3] = ax[3] ?? 0;

    const dz = this.settings.data.controls.padDeadzone;
    const lm = this.scratchL;
    this.stick(this.padAxes[0]!, this.padAxes[1]!, dz, lm);
    this.padMove.x = lm.x;
    this.padMove.y = -lm.y;
    const rm = this.scratchR;
    const rmag = this.stick(this.padAxes[2]!, this.padAxes[3]!, dz, rm);
    // Response curve: fine control near the centre, full speed at the rim.
    const curve = rmag > 0 ? Math.pow(rmag, 1.8) / rmag : 0;
    this.padLook.x = rm.x * curve;
    this.padLook.y = rm.y * curve;

    if (edge || Math.hypot(this.padAxes[0]!, this.padAxes[1]!) > 0.5 || Math.hypot(this.padAxes[2]!, this.padAxes[3]!) > 0.5) {
      this.setDevice('gamepad');
    }
    if (edge) {
      if (this.captureDevice === 'gamepad') {
        for (let i = 0; i < this.padDown.length; i++) {
          if (this.padDown[i] && !this.padPrev[i]) {
            this.finishCapture(i === PAD.START ? null : i);
            break;
          }
        }
      } else {
        this.emit('anyinput', 'gamepad');
      }
    }

    // Menu navigation: d-pad or left stick with initial delay + repeat.
    const dx = (this.padDown[PAD.RIGHT] ? 1 : 0) - (this.padDown[PAD.LEFT] ? 1 : 0) || (this.padAxes[0]! > 0.6 ? 1 : this.padAxes[0]! < -0.6 ? -1 : 0);
    const dy = (this.padDown[PAD.DOWN] ? 1 : 0) - (this.padDown[PAD.UP] ? 1 : 0) || (this.padAxes[1]! > 0.6 ? 1 : this.padAxes[1]! < -0.6 ? -1 : 0);
    const key = `${dx},${dy}`;
    if (key === '0,0') {
      this.navKey = key;
    } else if (key !== this.navKey) {
      this.navKey = key;
      this.navTimer = NAV_FIRST_DELAY;
      this.nav.x = dx;
      this.nav.y = dy;
    } else {
      this.navTimer -= dt;
      if (this.navTimer <= 0) {
        this.navTimer = NAV_REPEAT;
        this.nav.x = dx;
        this.nav.y = dy;
      }
    }
    this.nav.confirm = this.padDown[PAD.A]! && !this.padPrev[PAD.A];
    this.nav.back = this.padDown[PAD.B]! && !this.padPrev[PAD.B];
    this.nav.start = this.padDown[PAD.START]! && !this.padPrev[PAD.START];
  }
}
