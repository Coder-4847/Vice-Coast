export type WeaponId = 'vc9' | 'smg' | 'shotgun' | 'rifle' | 'knife' | 'hatchet' | 'rpg' | 'laser';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Pistol-style chamber (+1 round) and slide lock; false for the long guns. */
  pistol: boolean;
  auto: boolean;
  /** Seconds between shots. */
  interval: number;
  mag: number;
  reserveMax: number;
  /** Damage per bullet / pellet to people. */
  damage: number;
  pellets: number;
  /** Multiplier on the crosshair spread cone (degrees). */
  spreadMul: number;
  /** Extra per-pellet cone for shotguns (degrees). */
  pelletSpread: number;
  recoil: number;
  kick: number;
  /** How far the weapon is effective, metres. */
  range: number;
  sound: 'pistol' | 'smg' | 'shotgun' | 'rifle';
  blurb: string;
  /** Close-range swing: no ammunition, a short reach. */
  melee?: boolean;
  /** Fires a slow rocket that explodes on contact. */
  rocket?: boolean;
  /** A hitscan beam instead of a bullet (no casings, a bright beam). */
  beam?: boolean;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  vc9: { id: 'vc9', name: 'VC-9', pistol: true, auto: false, interval: 0.105, mag: 12, reserveMax: 120, damage: 40, pellets: 1, spreadMul: 1, pelletSpread: 0, recoil: 1, kick: 1, range: 120, sound: 'pistol', blurb: 'Service pistol' },
  smg: { id: 'smg', name: 'WASP-9', pistol: false, auto: true, interval: 0.07, mag: 30, reserveMax: 240, damage: 24, pellets: 1, spreadMul: 1.5, pelletSpread: 0, recoil: 0.7, kick: 0.75, range: 90, sound: 'smg', blurb: 'Machine pistol, very fast' },
  shotgun: { id: 'shotgun', name: 'HAMMER-12', pistol: false, auto: false, interval: 0.85, mag: 6, reserveMax: 48, damage: 16, pellets: 8, spreadMul: 0.6, pelletSpread: 3.6, recoil: 3.4, kick: 2.6, range: 40, sound: 'shotgun', blurb: 'Pump shotgun, devastating close up' },
  rifle: { id: 'rifle', name: 'FALCON AR-7', pistol: false, auto: true, interval: 0.095, mag: 30, reserveMax: 300, damage: 34, pellets: 1, spreadMul: 0.8, pelletSpread: 0, recoil: 1.15, kick: 1.1, range: 300, sound: 'rifle', blurb: 'Assault rifle, accurate at range' },
  knife: { id: 'knife', name: 'Switchblade', pistol: false, auto: false, interval: 0.42, mag: 1, reserveMax: 0, damage: 70, pellets: 1, spreadMul: 0, pelletSpread: 0, recoil: 0.3, kick: 0.6, range: 2.3, sound: 'pistol', blurb: 'Quiet, fast, personal', melee: true },
  hatchet: { id: 'hatchet', name: 'Hatchet', pistol: false, auto: false, interval: 0.75, mag: 1, reserveMax: 0, damage: 130, pellets: 1, spreadMul: 0, pelletSpread: 0, recoil: 0.6, kick: 1.1, range: 2.6, sound: 'pistol', blurb: 'One swing is usually enough', melee: true },
  rpg: { id: 'rpg', name: 'RPG-7V', pistol: false, auto: false, interval: 1.4, mag: 1, reserveMax: 10, damage: 400, pellets: 1, spreadMul: 0.4, pelletSpread: 0, recoil: 4, kick: 3, range: 300, sound: 'shotgun', blurb: 'Rocket launcher. Stand well back', rocket: true },
  laser: { id: 'laser', name: 'Helios LX', pistol: false, auto: true, interval: 0.13, mag: 40, reserveMax: 200, damage: 48, pellets: 1, spreadMul: 0.35, pelletSpread: 0, recoil: 0.35, kick: 0.5, range: 400, sound: 'rifle', blurb: 'Experimental laser rifle: no drop, no casings', beam: true },
};

export const WEAPON_ORDER: WeaponId[] = ['knife', 'hatchet', 'vc9', 'smg', 'shotgun', 'rifle', 'rpg', 'laser'];
