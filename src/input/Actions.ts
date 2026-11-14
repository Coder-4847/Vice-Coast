export type Device = 'kbm' | 'gamepad';

export type Action =
  | 'moveForward' | 'moveBack' | 'moveLeft' | 'moveRight'
  | 'jump' | 'sprint' | 'crouch' | 'interact'
  | 'fire' | 'aim' | 'reload'
  | 'weaponWheel' | 'radioWheel' | 'phone' | 'map' | 'pause' | 'character' | 'ability' | 'crew'
  | 'holster' | 'inspect' | 'snack' | 'cover' | 'dog'
  | 'horn' | 'headlights' | 'cameraMode';

export interface ActionBinding {
  /** KeyboardEvent.code values, or `Mouse0`..`Mouse4`. */
  kbm: string[];
  /** Standard-mapping gamepad button indices. */
  pad: number[];
}

export interface ActionDef extends ActionBinding {
  id: Action;
  label: string;
  group: 'Movement' | 'Actions' | 'Combat' | 'Vehicle' | 'Menus';
  /** Whether the player may rebind it (movement axes stay on keys, pause stays reachable). */
  rebindable: boolean;
}

/** Standard gamepad button indices (W3C standard mapping). */
export const PAD = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
  BACK: 8, START: 9, L3: 10, R3: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16,
} as const;

export const ACTION_DEFS: ActionDef[] = [
  { id: 'moveForward', label: 'Move forward', group: 'Movement', kbm: ['KeyW', 'ArrowUp'], pad: [], rebindable: true },
  { id: 'moveBack', label: 'Move back', group: 'Movement', kbm: ['KeyS', 'ArrowDown'], pad: [], rebindable: true },
  { id: 'moveLeft', label: 'Move left', group: 'Movement', kbm: ['KeyA', 'ArrowLeft'], pad: [], rebindable: true },
  { id: 'moveRight', label: 'Move right', group: 'Movement', kbm: ['KeyD', 'ArrowRight'], pad: [], rebindable: true },
  { id: 'jump', label: 'Jump · vehicle handbrake', group: 'Movement', kbm: ['Space'], pad: [PAD.A], rebindable: true },
  { id: 'sprint', label: 'Sprint', group: 'Movement', kbm: ['ShiftLeft'], pad: [PAD.L3], rebindable: true },
  { id: 'crouch', label: 'Crouch · vehicle look behind', group: 'Movement', kbm: ['KeyC'], pad: [PAD.R3], rebindable: true },
  { id: 'interact', label: 'Interact · enter / exit vehicle', group: 'Actions', kbm: ['KeyE'], pad: [PAD.Y], rebindable: true },
  { id: 'reload', label: 'Reload', group: 'Combat', kbm: ['KeyR'], pad: [PAD.X], rebindable: true },
  { id: 'fire', label: 'Fire', group: 'Combat', kbm: ['Mouse0'], pad: [PAD.RT], rebindable: true },
  { id: 'aim', label: 'Aim', group: 'Combat', kbm: ['Mouse2'], pad: [PAD.LT], rebindable: true },
  { id: 'holster', label: 'Draw / holster weapon', group: 'Combat', kbm: ['Digit1'], pad: [PAD.DOWN], rebindable: true },
  { id: 'snack', label: 'Eat a snack', group: 'Actions', kbm: ['KeyF'], pad: [], rebindable: true },
  { id: 'cover', label: 'Take cover (controller: hold to eat a snack)', group: 'Combat', kbm: ['KeyQ'], pad: [PAD.B], rebindable: true },
  { id: 'dog', label: 'Dog: attack what you aim at / come here', group: 'Combat', kbm: ['KeyK'], pad: [], rebindable: true },
  { id: 'inspect', label: 'Inspect weapon', group: 'Combat', kbm: ['KeyG'], pad: [], rebindable: true },
  { id: 'horn', label: 'Vehicle horn', group: 'Vehicle', kbm: ['KeyH'], pad: [PAD.L3], rebindable: true },
  { id: 'headlights', label: 'Vehicle headlights', group: 'Vehicle', kbm: ['KeyL'], pad: [], rebindable: true },
  { id: 'cameraMode', label: 'Vehicle camera', group: 'Vehicle', kbm: ['KeyV'], pad: [PAD.RIGHT], rebindable: true },
  { id: 'weaponWheel', label: 'Weapon wheel', group: 'Menus', kbm: ['Tab'], pad: [PAD.LB], rebindable: true },
  { id: 'radioWheel', label: 'Radio: next station', group: 'Vehicle', kbm: ['KeyQ'], pad: [PAD.LB], rebindable: true },
  { id: 'character', label: 'Switch character', group: 'Menus', kbm: ['KeyZ'], pad: [PAD.LEFT], rebindable: true },
  { id: 'crew', label: 'Crew commands', group: 'Combat', kbm: ['KeyB'], pad: [PAD.RIGHT], rebindable: true },
  { id: 'ability', label: 'Special ability', group: 'Combat', kbm: ['KeyX'], pad: [PAD.RB], rebindable: true },
  { id: 'phone', label: 'Phone', group: 'Menus', kbm: ['KeyT'], pad: [PAD.UP], rebindable: true },
  { id: 'map', label: 'Map', group: 'Menus', kbm: ['KeyM'], pad: [PAD.BACK], rebindable: true },
  { id: 'pause', label: 'Pause', group: 'Menus', kbm: ['KeyP'], pad: [PAD.START], rebindable: false },
];

export const ACTION_BY_ID = Object.fromEntries(ACTION_DEFS.map((d) => [d.id, d])) as Record<Action, ActionDef>;

export type PadLayout = 'xbox' | 'playstation' | 'generic';

export function detectPadLayout(id: string): PadLayout {
  const s = id.toLowerCase();
  if (/054c|sony|dualshock|dualsense|playstation|ps[345]|wireless controller/.test(s)) return 'playstation';
  if (/xbox|xinput|045e|microsoft|standard gamepad/.test(s)) return 'xbox';
  return 'generic';
}
