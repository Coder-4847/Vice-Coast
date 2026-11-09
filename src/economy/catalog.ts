import { GEO } from '../world/heightfield';
import type { GloveStyle, HairStyle, Finish, Outfit, VehicleCustom, WeaponKit } from './types';
import type { WeaponId } from '../player/Weapons';

// ------------------------------------------------------------------------------------------------ properties

export type PropertyKind = 'apartment' | 'house' | 'mansion' | 'penthouse' | 'trailer' | 'cabin' | 'garage' | 'hangar' | 'dock';

export interface PropertyDef {
  id: string;
  name: string;
  kind: PropertyKind;
  region: string;
  blurb: string;
  price: number;
  /** Charged to the bank every in-game day. */
  upkeep: number;
  /** Where to look for the entrance (the nearest open spot is used). */
  near: { x: number; z: number };
  /** Cars it can store. */
  slots: number;
  /** Only the craft that fit: 'car' garages hold cars, hangars aircraft, docks boats (stored as a convenience: spawns at its berth). */
  bays: 'car' | 'plane' | 'boat';
}

export const PROPERTIES: PropertyDef[] = [
  { id: 'boardwalk', name: 'Boardwalk Studio', kind: 'apartment', region: 'Port Valeria', blurb: 'A small flat over the beachfront arcade. Cheap, noisy, and you can hear the surf.', price: 18000, upkeep: 60, near: { x: 150, z: 70 }, slots: 1, bays: 'car' },
  { id: 'downtown', name: 'Meridian Tower Penthouse', kind: 'penthouse', region: 'Port Valeria', blurb: 'The top floor of the tallest building downtown, with a six-car garage under it.', price: 420000, upkeep: 900, near: { x: 1010, z: -50 }, slots: 6, bays: 'car' },
  { id: 'crestview', name: 'Crestview Villa', kind: 'mansion', region: 'Crestview Hills', blurb: 'White walls, a pool and the whole city laid out below the terrace.', price: 760000, upkeep: 1400, near: { x: 1060, z: -1000 }, slots: 8, bays: 'car' },
  { id: 'trailer', name: 'Cinder Flats Trailer', kind: 'trailer', region: 'Cinder Flats', blurb: 'A single-wide in the desert. Nobody asks questions out here.', price: 6500, upkeep: 20, near: { x: 3330, z: 610 }, slots: 2, bays: 'car' },
  { id: 'cabin', name: 'Kestrel Cabin', kind: 'cabin', region: 'Mount Kestrel', blurb: 'Pine logs, a wood stove and snow on the roof by November.', price: 95000, upkeep: 180, near: { x: 1110, z: -1680 }, slots: 2, bays: 'car' },
  { id: 'costa', name: 'Costa Merida Canal House', kind: 'house', region: 'Costa Merida', blurb: 'Three floors on the water with its own mooring and a roof terrace.', price: 240000, upkeep: 520, near: { x: 420, z: 3300 }, slots: 4, bays: 'car' },
  { id: 'hangar', name: 'Valeria Hangar 3', kind: 'hangar', region: 'Valeria International', blurb: 'A private hangar on the apron. Keep a plane or helicopter ready to go.', price: 180000, upkeep: 420, near: { x: 1260, z: 840 }, slots: 2, bays: 'plane' },
  { id: 'dock', name: 'Dusk Harbor Boat House', kind: 'dock', region: 'Dusk Harbor', blurb: 'A weathered boat shed on the finger piers with room for a boat and a workbench.', price: 70000, upkeep: 140, near: { x: 330, z: 1650 }, slots: 2, bays: 'boat' },
  { id: 'rojo', name: 'Isla Rojo Estate', kind: 'mansion', region: 'Isla Rojo', blurb: 'The island villa with its own airstrip and dock. The most expensive address in San Verano.', price: 2400000, upkeep: 3500, near: { x: -820, z: 1180 }, slots: 8, bays: 'car' },
];

export const PROPERTY_BY_ID = Object.fromEntries(PROPERTIES.map((p) => [p.id, p]));

// ------------------------------------------------------------------------------------------------ shops and ATMs

export type PointKind = 'atm' | 'property' | 'clothing' | 'barber' | 'weapons' | 'showroom' | 'tuning' | 'food';

export interface ShopDef {
  id: string;
  name: string;
  kind: Exclude<PointKind, 'property' | 'atm'>;
  near: { x: number; z: number };
  blurb: string;
}

export const SHOPS: ShopDef[] = [
  { id: 'threadline', name: 'Threadline', kind: 'clothing', near: { x: 960, z: 60 }, blurb: 'Jackets, gloves and the rest.' },
  { id: 'threadline2', name: 'Costa Rags', kind: 'clothing', near: { x: 480, z: 3290 }, blurb: 'Market-stall fashion by the canals.' },
  { id: 'clip', name: 'The Clip Joint', kind: 'barber', near: { x: 1060, z: 40 }, blurb: 'Cuts, colour and a hot towel.' },
  { id: 'clip2', name: 'Pinecrest Barbers', kind: 'barber', near: { x: 700, z: -2260 }, blurb: 'Two chairs and a radio.' },
  { id: 'brass', name: 'Brass & Barrel', kind: 'weapons', near: { x: 1240, z: 90 }, blurb: 'Guns, ammo and gear for the discerning.' },
  { id: 'brass2', name: 'Cinder Surplus', kind: 'weapons', near: { x: 3380, z: 540 }, blurb: 'Army surplus and no paperwork.' },
  { id: 'motors', name: 'Valeria Motors', kind: 'showroom', near: { x: 880, z: -90 }, blurb: 'Everything on four wheels. Take one for a spin.' },
  { id: 'redline', name: 'Redline Customs', kind: 'tuning', near: { x: 830, z: 140 }, blurb: 'Paint, wheels, power. Drive in.' },
  { id: 'burger', name: 'Brass Monkey Burgers', kind: 'food', near: { x: 120, z: -60 }, blurb: 'Fast food by the beach.' },
  { id: 'taco', name: 'Cinder Taqueria', kind: 'food', near: { x: 3320, z: 600 }, blurb: 'Tacos al pastor, all day.' },
];

export const ATMS: { id: string; near: { x: number; z: number } }[] = [
  { id: 'atm-beach', near: { x: 135, z: -20 } },
  { id: 'atm-downtown', near: { x: 990, z: -10 } },
  { id: 'atm-mall', near: { x: 1180, z: 140 } },
  { id: 'atm-industrial', near: { x: 1380, z: -240 } },
  { id: 'atm-hills', near: { x: 1070, z: -900 } },
  { id: 'atm-cinder', near: { x: 3340, z: 560 } },
  { id: 'atm-harbor', near: { x: 430, z: 1720 } },
  { id: 'atm-costa', near: { x: 520, z: 3330 } },
  { id: 'atm-pinecrest', near: { x: 710, z: -2280 } },
  { id: 'atm-airport', near: { x: GEO.airport.x, z: GEO.airport.apronZ - 25 } },
  { id: 'atm-kestrel', near: { x: 1100, z: -1660 } },
];

// ------------------------------------------------------------------------------------------------ clothing

export interface ClothingItem<T = string> { id: string; name: string; price: number; value: T }

export const TOPS: ClothingItem[] = [
  { id: 'top-grey', name: 'Charcoal jacket', price: 0, value: '#3d4248' },
  { id: 'top-black', name: 'Black bomber', price: 140, value: '#17181b' },
  { id: 'top-olive', name: 'Olive field jacket', price: 160, value: '#4d5a3e' },
  { id: 'top-navy', name: 'Navy windbreaker', price: 120, value: '#1f3354' },
  { id: 'top-red', name: 'Red track jacket', price: 180, value: '#a3262a' },
  { id: 'top-cream', name: 'Cream linen shirt', price: 90, value: '#d8d0bc' },
  { id: 'top-teal', name: 'Teal Hawaiian', price: 110, value: '#1f8a8a' },
  { id: 'top-plum', name: 'Plum suit jacket', price: 480, value: '#4a2a4f' },
  { id: 'top-gold', name: 'Gold silk bomber', price: 900, value: '#b88a2e' },
];

export const GLOVES: ClothingItem<GloveStyle>[] = [
  { id: 'gl-none', name: 'Bare hands', price: 0, value: 'none' },
  { id: 'gl-leather', name: 'Leather driving gloves', price: 80, value: 'leather' },
  { id: 'gl-tactical', name: 'Tactical gloves', price: 120, value: 'tactical' },
  { id: 'gl-white', name: 'White dress gloves', price: 60, value: 'white' },
];

export const SKINS: ClothingItem[] = [
  { id: 'skin-1', name: 'Fair', price: 0, value: '#e8b99a' },
  { id: 'skin-2', name: 'Olive', price: 0, value: '#d9a47c' },
  { id: 'skin-3', name: 'Tan', price: 0, value: '#b9825a' },
  { id: 'skin-4', name: 'Brown', price: 0, value: '#8a5a3c' },
  { id: 'skin-5', name: 'Deep', price: 0, value: '#5a3a28' },
];

export const HAIR_STYLES: ClothingItem<HairStyle>[] = [
  { id: 'hs-short', name: 'Short crop', price: 30, value: 'short' },
  { id: 'hs-buzz', name: 'Buzz cut', price: 20, value: 'buzz' },
  { id: 'hs-slick', name: 'Slicked back', price: 45, value: 'slick' },
  { id: 'hs-long', name: 'Long and loose', price: 55, value: 'long' },
  { id: 'hs-bald', name: 'Shaved', price: 25, value: 'bald' },
];

export const HAIR_COLORS: ClothingItem[] = [
  { id: 'hc-black', name: 'Black', price: 0, value: '#17120e' },
  { id: 'hc-brown', name: 'Brown', price: 40, value: '#4a3222' },
  { id: 'hc-blond', name: 'Blond', price: 70, value: '#c9a45a' },
  { id: 'hc-ginger', name: 'Ginger', price: 70, value: '#a4512a' },
  { id: 'hc-grey', name: 'Silver', price: 90, value: '#a9aeb5' },
  { id: 'hc-blue', name: 'Electric blue', price: 120, value: '#2a7bdc' },
  { id: 'hc-pink', name: 'Hot pink', price: 120, value: '#e0488a' },
];

export const DEFAULT_OUTFIT: Outfit = { top: '#3d4248', cuff: '#2a2d31', gloves: 'none', skin: '#d9a47c', hair: '#241a14', hairStyle: 'short', glasses: false };

// ------------------------------------------------------------------------------------------------ weapons

export interface ShopWeapon { id: WeaponId; price: number; ammoPrice: number; ammoPack: number }

export const SHOP_WEAPONS: ShopWeapon[] = [
  { id: 'vc9', price: 0, ammoPrice: 60, ammoPack: 24 },
  { id: 'smg', price: 1500, ammoPrice: 90, ammoPack: 60 },
  { id: 'shotgun', price: 1900, ammoPrice: 110, ammoPack: 16 },
  { id: 'rifle', price: 3600, ammoPrice: 150, ammoPack: 60 },
];

export const ATTACHMENTS = {
  ext: { name: 'Extended magazine', blurb: '+50% magazine capacity', price: { vc9: 300, smg: 450, shotgun: 400, rifle: 600 } as Record<WeaponId, number> },
  supp: { name: 'Suppressor', blurb: 'Much quieter: nobody hears, nobody calls it in', price: { vc9: 500, smg: 650, shotgun: 0, rifle: 900 } as Record<WeaponId, number> },
  scope: { name: 'Optic', blurb: 'Tighter aim-down-sights zoom', price: { vc9: 0, smg: 500, shotgun: 0, rifle: 800 } as Record<WeaponId, number> },
} as const;

export const WEAPON_TINTS: ClothingItem[] = [
  { id: 'wt-stock', name: 'Gunmetal', price: 0, value: '#2b2e33' },
  { id: 'wt-black', name: 'Matte black', price: 80, value: '#0e0f11' },
  { id: 'wt-fde', name: 'Desert sand', price: 100, value: '#9a8559' },
  { id: 'wt-od', name: 'Olive drab', price: 100, value: '#4a5238' },
  { id: 'wt-gold', name: 'Gold plated', price: 600, value: '#b8912f' },
  { id: 'wt-pink', name: 'Hot pink', price: 150, value: '#d6407f' },
];

export const DEFAULT_KIT: WeaponKit = { ext: false, supp: false, scope: false, tint: '#2b2e33' };

export const SUPPLIES = [
  { id: 'medkit', name: 'Medkit', price: 120, blurb: 'Restores health' },
  { id: 'armour', name: 'Body armour', price: 450, blurb: 'Full armour vest' },
] as const;

export const FOOD = [
  { id: 'burger', name: 'Double cheeseburger', price: 12, heal: 25 },
  { id: 'fries', name: 'Large fries', price: 6, heal: 10 },
  { id: 'taco', name: 'Taco trio', price: 9, heal: 18 },
  { id: 'soda', name: 'Soda', price: 3, heal: 4 },
  { id: 'coffee', name: 'Coffee', price: 4, heal: 6 },
] as const;

// ------------------------------------------------------------------------------------------------ vehicle customisation

export const FINISHES: { id: Finish; name: string; price: number }[] = [
  { id: 'gloss', name: 'Gloss', price: 0 },
  { id: 'matte', name: 'Matte', price: 400 },
  { id: 'metallic', name: 'Metallic', price: 600 },
  { id: 'pearl', name: 'Pearlescent', price: 1200 },
  { id: 'chrome', name: 'Chrome', price: 4500 },
];

export const PAINTS: { name: string; value: string }[] = [
  { name: 'Signal red', value: '#d94b2b' }, { name: 'Crimson', value: '#a3162a' }, { name: 'Sunset orange', value: '#e8762b' },
  { name: 'Taxi yellow', value: '#f2c230' }, { name: 'Lime', value: '#8ac43a' }, { name: 'Racing green', value: '#1f5a3a' },
  { name: 'Teal', value: '#0e7c86' }, { name: 'Sky blue', value: '#4a8fd6' }, { name: 'Royal blue', value: '#1f4fa8' },
  { name: 'Midnight', value: '#14213d' }, { name: 'Violet', value: '#6a3fb0' }, { name: 'Hot pink', value: '#e0488a' },
  { name: 'Pearl white', value: '#e8e9ec' }, { name: 'Silver', value: '#b4b8c0' }, { name: 'Graphite', value: '#3a3d44' },
  { name: 'Jet black', value: '#0f1013' }, { name: 'Bronze', value: '#8a5a2a' }, { name: 'Sand', value: '#c9b48a' },
];

export const RIMS: { name: string; value: string; price: number }[] = [
  { name: 'Steel', value: '#c9ccd2', price: 0 }, { name: 'Gunmetal', value: '#6a6d73', price: 350 }, { name: 'Black', value: '#17181b', price: 400 },
  { name: 'Gold', value: '#c8a23a', price: 900 }, { name: 'Bronze', value: '#8a5a2a', price: 600 }, { name: 'Red', value: '#b3202a', price: 500 },
  { name: 'Blue', value: '#2a5fc0', price: 500 }, { name: 'White', value: '#f0f0f0', price: 450 },
];

export const NEONS: { name: string; value: string | null; price: number }[] = [
  { name: 'None', value: null, price: 0 }, { name: 'Ice blue', value: '#4ac8ff', price: 1200 }, { name: 'Magenta', value: '#ff2fb3', price: 1200 },
  { name: 'Acid green', value: '#7aff3a', price: 1200 }, { name: 'Red', value: '#ff2a2a', price: 1200 }, { name: 'Violet', value: '#9a4aff', price: 1200 },
];

export const TINTS = [
  { name: 'Clear glass', price: 0 }, { name: 'Light tint', price: 250 }, { name: 'Dark tint', price: 400 }, { name: 'Limo black', price: 600 },
];

export const SPOILERS = [{ name: 'None', price: 0 }, { name: 'Lip spoiler', price: 700 }, { name: 'Race wing', price: 1800 }];

/** Tiers 1–3 for each performance part, as a fraction of the vehicle's price (plus a floor). */
export const PERF_COST = { engine: [0.04, 0.09, 0.16], brakes: [0.02, 0.05, 0.09], suspension: [0.02, 0.05, 0.08], turbo: 0.12 };
export const PERF_NAMES = {
  engine: ['Stock engine', 'Street tune', 'Sport build', 'Race build'],
  brakes: ['Stock brakes', 'Sport pads', 'Big brake kit', 'Carbon-ceramic'],
  suspension: ['Stock suspension', 'Lowered springs', 'Coilovers', 'Race suspension'],
};
export const RUNFLAT_PRICE = 1800;
export const ARMOUR_PRICE = 6500;

export function defaultCustom(color: string, accent: string, plate: string): VehicleCustom {
  return { color, accent, finish: 'gloss', tint: 0, rim: '#c9ccd2', plate, spoiler: 0, neon: null, perf: { engine: 0, brakes: 0, suspension: 0, turbo: false }, runflat: false, armour: false };
}

/** Dealer stock (ids of VEHICLES) and what the dealership marks them up by. */
export const SHOWROOM = ['pico', 'marlow', 'barrage', 'ridgeback', 'sparrow', 'veloce'];
export const FOOD_HEAL_CAP = 100;

export const START_CASH = 5000;
export const START_BANK = 2500;
export const REPAIR_COST = 0.02;
export const INSURANCE_FEE = 0.06;
export const SELL_RATE = 0.55;
