export type Device = 'keyboard' | 'gamepad' | 'touch';

/** Logical actions. Game code reads these, never raw keys. */
export interface InputState {
  moveX: number; // -1 left .. 1 right
  moveY: number; // -1 back .. 1 forward
  lookX: number; // accumulated this frame (radians-ish, sensitivity applied by caller)
  lookY: number;
  sprint: boolean;
  jump: boolean;
}

const KEY_MAP: Record<string, keyof Pick<InputState, 'sprint' | 'jump'> | 'fwd' | 'back' | 'left' | 'right'> = {
  KeyW: 'fwd',
  ArrowUp: 'fwd',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  Space: 'jump',
};

const DEADZONE = 0.15;

function dead(v: number): number {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  return Math.sign(v) * ((a - DEADZONE) / (1 - DEADZONE));
}

/**
 * Unified input. Tracks which device was used last so the UI can switch glyphs.
 * Keyboard + mouse, Gamepad API, and touch (virtual sticks) all feed one InputState.
 */
export class InputManager {
  device: Device = 'keyboard';
  readonly state: InputState = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, sprint: false, jump: false };
  onDeviceChange: (d: Device) => void = () => {};

  private keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private touchMove = { x: 0, y: 0 };
  private touchLook = { x: 0, y: 0 };
  private touchJump = false;
  private padActive = false;

  constructor(canvas: HTMLCanvasElement, private touchRoot: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.code in KEY_MAP) e.preventDefault();
      this.keys.add(e.code);
      this.setDevice('keyboard');
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (this.device !== 'touch' && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
        this.setDevice('keyboard');
      }
    });

    addEventListener('gamepadconnected', () => (this.padActive = true));
    addEventListener('gamepaddisconnected', () => (this.padActive = navigator.getGamepads().some(Boolean)));

    this.bindTouch();
  }

  private setDevice(d: Device): void {
    if (this.device === d) return;
    this.device = d;
    this.touchRoot.hidden = d !== 'touch';
    this.onDeviceChange(d);
  }

  private bindTouch(): void {
    const bindStick = (id: string, out: { x: number; y: number }) => {
      const el = document.getElementById(id)!;
      const knob = el.querySelector<HTMLElement>('.knob')!;
      let pid = -1;
      let cx = 0;
      let cy = 0;
      const radius = 48;
      const move = (e: PointerEvent) => {
        let dx = e.clientX - cx;
        let dy = e.clientY - cy;
        const len = Math.hypot(dx, dy);
        if (len > radius) {
          dx = (dx / len) * radius;
          dy = (dy / len) * radius;
        }
        out.x = dx / radius;
        out.y = dy / radius;
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      };
      el.addEventListener('pointerdown', (e) => {
        pid = e.pointerId;
        el.setPointerCapture(pid);
        const r = el.getBoundingClientRect();
        cx = r.left + r.width / 2;
        cy = r.top + r.height / 2;
        move(e);
      });
      el.addEventListener('pointermove', (e) => e.pointerId === pid && move(e));
      const end = (e: PointerEvent) => {
        if (e.pointerId !== pid) return;
        pid = -1;
        out.x = 0;
        out.y = 0;
        knob.style.transform = '';
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    };
    bindStick('stick-move', this.touchMove);
    bindStick('stick-look', this.touchLook);

    const jump = document.getElementById('tbtn-jump')!;
    jump.addEventListener('pointerdown', () => (this.touchJump = true));
    jump.addEventListener('pointerup', () => (this.touchJump = false));
    jump.addEventListener('pointercancel', () => (this.touchJump = false));

    // First touch anywhere switches to touch mode.
    addEventListener(
      'touchstart',
      () => {
        this.setDevice('touch');
      },
      { passive: true },
    );
  }

  /** Call once per rendered frame. */
  poll(dt: number): InputState {
    const s = this.state;
    const k = this.keys;

    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let my = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let lx = this.mouseDX * 0.0022;
    let ly = this.mouseDY * 0.0022;
    let sprint = k.has('ShiftLeft');
    let jump = k.has('Space');
    this.mouseDX = 0;
    this.mouseDY = 0;

    if (this.padActive) {
      const pad = Array.from(navigator.getGamepads()).find((p): p is Gamepad => !!p);
      if (pad) {
        const gx = dead(pad.axes[0] ?? 0);
        const gy = dead(pad.axes[1] ?? 0);
        const rx = dead(pad.axes[2] ?? 0);
        const ry = dead(pad.axes[3] ?? 0);
        const pressed = pad.buttons.some((b) => b.pressed);
        if (gx || gy || rx || ry || pressed) this.setDevice('gamepad');
        if (this.device === 'gamepad') {
          mx = gx;
          my = -gy;
          lx += rx * 2.6 * dt;
          ly += ry * 2.6 * dt;
          sprint = !!pad.buttons[10]?.pressed; // L3
          jump = !!pad.buttons[0]?.pressed; // A / Cross
        }
      }
    }

    if (this.device === 'touch') {
      mx = this.touchMove.x;
      my = -this.touchMove.y;
      lx += this.touchLook.x * 2.2 * dt;
      ly += this.touchLook.y * 2.2 * dt;
      jump = this.touchJump;
      sprint = Math.hypot(this.touchMove.x, this.touchMove.y) > 0.95;
    }

    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    s.moveX = mx;
    s.moveY = my;
    s.lookX = lx;
    s.lookY = ly;
    s.sprint = sprint;
    s.jump = jump;
    return s;
  }
}
