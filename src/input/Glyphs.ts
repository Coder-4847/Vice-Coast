import { PAD, type Action, type Device, type PadLayout } from './Actions';

const PAD_LABELS: Record<PadLayout, Record<number, string>> = {
  xbox: {
    [PAD.A]: 'A', [PAD.B]: 'B', [PAD.X]: 'X', [PAD.Y]: 'Y', [PAD.LB]: 'LB', [PAD.RB]: 'RB',
    [PAD.LT]: 'LT', [PAD.RT]: 'RT', [PAD.BACK]: 'View', [PAD.START]: 'Menu', [PAD.L3]: 'LS', [PAD.R3]: 'RS',
    [PAD.UP]: 'D-pad ↑', [PAD.DOWN]: 'D-pad ↓', [PAD.LEFT]: 'D-pad ←', [PAD.RIGHT]: 'D-pad →', [PAD.HOME]: 'Home',
  },
  playstation: {
    [PAD.A]: '✕', [PAD.B]: '○', [PAD.X]: '□', [PAD.Y]: '△', [PAD.LB]: 'L1', [PAD.RB]: 'R1',
    [PAD.LT]: 'L2', [PAD.RT]: 'R2', [PAD.BACK]: 'Share', [PAD.START]: 'Options', [PAD.L3]: 'L3', [PAD.R3]: 'R3',
    [PAD.UP]: 'D-pad ↑', [PAD.DOWN]: 'D-pad ↓', [PAD.LEFT]: 'D-pad ←', [PAD.RIGHT]: 'D-pad →', [PAD.HOME]: 'PS',
  },
  generic: {},
};

export function padButtonLabel(index: number, layout: PadLayout): string {
  return PAD_LABELS[layout][index] ?? PAD_LABELS.xbox[index] ?? `Btn ${index}`;
}

export function keyLabel(code: string): string {
  if (code.startsWith('Mouse')) {
    const n = Number(code.slice(5));
    return ['LMB', 'MMB', 'RMB', 'Mouse 4', 'Mouse 5'][n] ?? code;
  }
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const map: Record<string, string> = {
    Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt', AltRight: 'R-Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
    CapsLock: 'Caps',
  };
  return map[code] ?? code;
}

export interface BindingSource {
  binding(action: Action): { kbm: string[]; pad: number[] };
  readonly padLayout: PadLayout;
}


/** Human-readable glyph text for an action on the given device. */
export function glyphFor(src: BindingSource, action: Action, device: Device): string {
  const b = src.binding(action);
  if (device === 'gamepad') return b.pad.length ? padButtonLabel(b.pad[0]!, src.padLayout) : '—';
  return b.kbm.length ? keyLabel(b.kbm[0]!) : '—';
}
