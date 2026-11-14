export type WeaponId = 'vc9' | 'smg' | 'shotgun' | 'rifle' | 'knife' | 'hatchet' | 'rpg' | 'laser' | 'revolver' | 'micro' | 'combat' | 'sniper' | 'carbine' | 'lmg' | 'bat' | 'grenade' | 'molotov' | 'sticky' | 'fists';

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
  /** Bolt-action precision rifle: aiming looks through a magnified scope. */
  sniper?: boolean;
  /** Thrown, not fired: frag grenades, molotovs, sticky charges (R detonates). */
  throwable?: 'frag' | 'fire' | 'sticky';
  /** Quick-select group (number keys 2–9 cycle within one). */
  cat: WeaponCat;
}

export type WeaponCat = 'melee' | 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'heavy' | 'launcher' | 'thrown';
/** Number keys 2–9, in order. */
export const CATS: WeaponCat[] = ['melee', 'pistol', 'smg', 'shotgun', 'rifle', 'heavy', 'launcher', 'thrown'];

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  vc9: { id: 'vc9', name: 'VC-9', pistol: true, auto: false, interval: 0.105, mag: 12, reserveMax: 120, damage: 40, pellets: 1, spreadMul: 1, pelletSpread: 0, recoil: 1, kick: 1, range: 120, sound: 'pistol', blurb: 'Service pistol', cat: 'pistol' },
  smg: { id: 'smg', name: 'WASP-9', pistol: false, auto: true, interval: 0.07, mag: 30, reserveMax: 240, damage: 24, pellets: 1, spreadMul: 1.5, pelletSpread: 0, recoil: 0.7, kick: 0.75, range: 90, sound: 'smg', blurb: 'Machine pistol, very fast', cat: 'smg' },
  shotgun: { id: 'shotgun', name: 'HAMMER-12', pistol: false, auto: false, interval: 0.85, mag: 6, reserveMax: 48, damage: 16, pellets: 8, spreadMul: 0.6, pelletSpread: 3.6, recoil: 3.4, kick: 2.6, range: 40, sound: 'shotgun', blurb: 'Pump shotgun, devastating close up', cat: 'shotgun' },
  rifle: { id: 'rifle', name: 'FALCON AR-7', pistol: false, auto: true, interval: 0.095, mag: 30, reserveMax: 300, damage: 34, pellets: 1, spreadMul: 0.8, pelletSpread: 0, recoil: 1.15, kick: 1.1, range: 300, sound: 'rifle', blurb: 'Assault rifle, accurate at range', cat: 'rifle' },
  knife: { id: 'knife', name: 'Switchblade', pistol: false, auto: false, interval: 0.42, mag: 1, reserveMax: 0, damage: 70, pellets: 1, spreadMul: 0, pelletSpread: 0, recoil: 0.3, kick: 0.6, range: 2.3, sound: 'pistol', blurb: 'Quiet, fast, personal', melee: true, cat: 'melee' },
  hatchet: { id: 'hatchet', name: 'Hatchet', pistol: false, auto: false, interval: 0.75, mag: 1, reserveMax: 0, damage: 130, pellets: 1, spreadMul: 0, pelletSpread: 0, recoil: 0.6, kick: 1.1, range: 2.6, sound: 'pistol', blurb: 'One swing is usually enough', melee: true, cat: 'melee' },
  rpg: { id: 'rpg', name: 'RPG-7V', pistol: false, auto: false, interval: 1.4, mag: 1, reserveMax: 10, damage: 400, pellets: 1, spreadMul: 0.4, pelletSpread: 0, recoil: 4, kick: 3, range: 300, sound: 'shotgun', blurb: 'Rocket launcher. Stand well back', rocket: true, cat: 'launcher' },
  laser: { id: 'laser', name: 'Helios LX', pistol: false, auto: true, interval: 0.13, mag: 40, reserveMax: 200, damage: 48, pellets: 1, spreadMul: 0.35, pelletSpread: 0, recoil: 0.35, kick: 0.5, range: 400, sound: 'rifle', blurb: 'Experimental laser rifle: no drop, no casings', beam: true, cat: 'launcher' },
  // ---- inspired by real guns, under the coast's own names --------------------------------------------------------
  revolver: { id: 'revolver', name: 'Ranger .44', pistol: false, auto: false, interval: 0.55, mag: 6, reserveMax: 60, damage: 95, pellets: 1, spreadMul: 0.8, pelletSpread: 0, recoil: 2.6, kick: 2.1, range: 140, sound: 'pistol', blurb: 'Six rounds of .44 Magnum. Hits like a truck', cat: 'pistol' },
  micro: { id: 'micro', name: 'Viper MP', pistol: false, auto: true, interval: 0.055, mag: 25, reserveMax: 250, damage: 20, pellets: 1, spreadMul: 1.9, pelletSpread: 0, recoil: 0.6, kick: 0.6, range: 70, sound: 'smg', blurb: 'Compact machine pistol; empties itself in a blink', cat: 'smg' },
  combat: { id: 'combat', name: 'Breacher S12', pistol: false, auto: false, interval: 0.3, mag: 8, reserveMax: 64, damage: 14, pellets: 8, spreadMul: 0.6, pelletSpread: 3.1, recoil: 2.5, kick: 2.0, range: 35, sound: 'shotgun', blurb: 'Semi-automatic combat shotgun', cat: 'shotgun' },
  carbine: { id: 'carbine', name: 'Sentinel C4', pistol: false, auto: true, interval: 0.085, mag: 30, reserveMax: 300, damage: 30, pellets: 1, spreadMul: 0.7, pelletSpread: 0, recoil: 0.95, kick: 0.95, range: 260, sound: 'rifle', blurb: 'Short-barrel carbine, steady on full auto', cat: 'rifle' },
  lmg: { id: 'lmg', name: 'Hammerhead M60', pistol: false, auto: true, interval: 0.1, mag: 100, reserveMax: 400, damage: 32, pellets: 1, spreadMul: 1.3, pelletSpread: 0, recoil: 1.3, kick: 1.2, range: 250, sound: 'rifle', blurb: 'Belt-fed machine gun. A hundred rounds per box', cat: 'heavy' },
  sniper: { id: 'sniper', name: 'Longbow M338', pistol: false, auto: false, interval: 1.25, mag: 5, reserveMax: 40, damage: 170, pellets: 1, spreadMul: 0.05, pelletSpread: 0, recoil: 4, kick: 3, range: 700, sound: 'rifle', blurb: 'Bolt-action .338 with an 8x scope', sniper: true, cat: 'heavy' },
  fists: { id: 'fists', name: 'Fists', pistol: false, auto: false, interval: 0.36, mag: 1, reserveMax: 0, damage: 26, pellets: 1, spreadMul: 0, pelletSpread: 0, recoil: 0.3, kick: 0.6, range: 2.0, sound: 'pistol', blurb: 'Left, right. Knocks people down', melee: true, cat: 'melee' },
  bat: { id: 'bat', name: 'Slugger bat', pistol: false, auto: false, interval: 0.6, mag: 1, reserveMax: 0, damage: 85, pellets: 1, spreadMul: 0, pelletSpread: 0, recoil: 0.5, kick: 1.0, range: 2.5, sound: 'pistol', blurb: 'Ash, thirty-three inches, very persuasive', melee: true, cat: 'melee' },
  grenade: { id: 'grenade', name: 'Frag grenade', pistol: false, auto: false, interval: 0.9, mag: 1, reserveMax: 10, damage: 300, pellets: 1, spreadMul: 0, pelletSpread: 0, recoil: 0, kick: 0.6, range: 40, sound: 'pistol', blurb: 'Bounces, then three seconds later it does not', throwable: 'frag', cat: 'thrown' },
  molotov: { id: 'molotov', name: 'Molotov', pistol: false, auto: false, interval: 0.9, mag: 1, reserveMax: 10, damage: 0, pellets: 1, spreadMul: 0, pelletSpread: 0, recoil: 0, kick: 0.6, range: 35, sound: 'pistol', blurb: 'Bursts into a sheet of fire where it lands', throwable: 'fire', cat: 'thrown' },
  sticky: { id: 'sticky', name: 'Sticky charge', pistol: false, auto: false, interval: 0.7, mag: 1, reserveMax: 10, damage: 350, pellets: 1, spreadMul: 0, pelletSpread: 0, recoil: 0, kick: 0.5, range: 30, sound: 'pistol', blurb: 'Sticks to anything, cars included. R sets them all off', throwable: 'sticky', cat: 'thrown' },
};

export const WEAPON_ORDER: WeaponId[] = ['fists', 'knife', 'bat', 'hatchet', 'vc9', 'revolver', 'micro', 'smg', 'shotgun', 'combat', 'carbine', 'rifle', 'lmg', 'sniper', 'rpg', 'laser', 'grenade', 'molotov', 'sticky'];

/** A value for every weapon (inventories, kits). */
export const perWeapon = <T>(f: (id: WeaponId) => T): Record<WeaponId, T> => Object.fromEntries(WEAPON_ORDER.map((id) => [id, f(id)])) as Record<WeaponId, T>;
