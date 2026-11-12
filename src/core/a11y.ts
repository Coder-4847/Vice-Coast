/**
 * Live accessibility switches read by gameplay code every frame (camera shake, flashes, aim assist, tapping).
 * Kept as plain values so hot paths do not reach into the settings object. Updated from Settings on change.
 */
export const a11y = {
  /** Camera shake multiplier (0 = none). */
  shake: 1,
  /** Screen and sky flashes (lightning, hurt flash, explosions). */
  flashes: 1,
  /** Aim assist strength for controllers: 0 off, 0.5 light, 1 strong. */
  aimAssist: 0.5,
  /** Mini-games that need fast tapping accept holding the button instead. */
  holdToMash: false,
  /** On-screen arrows for gunshots, explosions, horns and screams. */
  soundCues: false,
};

export type A11y = typeof a11y;
