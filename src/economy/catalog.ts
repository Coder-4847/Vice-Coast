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
  { id: 'boardwalk', name: 'Boardwalk Studio', kind: 'apartment', region: 'Port Valeria', blurb: 'A small flat over the beachfront arcade. Cheap, noisy, and you can hear the surf.', price: 18000, upkeep: 60, near: { x: 312, z: 62 }, slots: 1, bays: 'car' },
  { id: 'downtown', name: 'Meridian Tower Penthouse', kind: 'penthouse', region: 'Port Valeria', blurb: 'The top floor of the tallest building downtown, with a six-car garage under it.', price: 420000, upkeep: 900, near: { x: 1010, z: -50 }, slots: 6, bays: 'car' },
  { id: 'crestview', name: 'Crestview Villa', kind: 'mansion', region: 'Crestview Hills', blurb: 'White walls, a pool and the whole city laid out below the terrace.', price: 760000, upkeep: 1400, near: { x: 1060, z: -1000 }, slots: 8, bays: 'car' },
  { id: 'trailer', name: 'Cinder Flats Trailer', kind: 'trailer', region: 'Cinder Flats', blurb: 'A single-wide in the desert. Nobody asks questions out here.', price: 6500, upkeep: 20, near: { x: 3330, z: 610 }, slots: 2, bays: 'car' },
  { id: 'cabin', name: 'Kestrel Cabin', kind: 'cabin', region: 'Mount Kestrel', blurb: 'Pine logs, a wood stove and snow on the roof by November.', price: 95000, upkeep: 180, near: { x: 1110, z: -1680 }, slots: 2, bays: 'car' },
  { id: 'costa', name: 'Costa Merida Canal House', kind: 'house', region: 'Costa Merida', blurb: 'Three floors on the water with its own mooring and a roof terrace.', price: 240000, upkeep: 520, near: { x: 420, z: 3300 }, slots: 4, bays: 'car' },
  { id: 'hangar', name: 'Valeria Hangar 3', kind: 'hangar', region: 'Valeria International', blurb: 'A private hangar on the apron. Keep a plane or helicopter ready to go.', price: 180000, upkeep: 420, near: { x: 1260, z: 840 }, slots: 4, bays: 'plane' },
  { id: 'airfield', name: 'Cinder Flats Hangar', kind: 'hangar', region: 'Cinder Flats', blurb: 'A tin hangar beside the desert airstrip. Long runway, short memories.', price: 120000, upkeep: 260, near: { x: 3050, z: 1490 }, slots: 3, bays: 'plane' },
  { id: 'marina', name: 'Costa Merida Marina Berth', kind: 'dock', region: 'Costa Merida', blurb: 'Three berths on the marina, a fuel pump and a harbourmaster who waves.', price: 55000, upkeep: 120, near: { x: 70, z: 3390 }, slots: 3, bays: 'boat' },
  { id: 'dock', name: 'Dusk Harbor Boat House', kind: 'dock', region: 'Dusk Harbor', blurb: 'A weathered boat shed on the finger piers with room for a boat and a workbench.', price: 70000, upkeep: 140, near: { x: 330, z: 1650 }, slots: 2, bays: 'boat' },
  { id: 'loft', name: 'Marlow Street Loft', kind: 'apartment', region: 'Port Valeria', blurb: 'Exposed brick, tall windows and a freight elevator. Two parking spaces in the courtyard.', price: 145000, upkeep: 320, near: { x: 940, z: 130 }, slots: 2, bays: 'car' },
  { id: 'bungalow', name: 'Southside Bungalow', kind: 'house', region: 'Southside', blurb: 'One storey, a chain-link fence and neighbours who mind their own business.', price: 38000, upkeep: 90, near: { x: 1420, z: 470 }, slots: 2, bays: 'car' },
  { id: 'harborloft', name: 'Dockside Warehouse Loft', kind: 'apartment', region: 'Dusk Harbor', blurb: 'A converted net loft over the fish market. Smells of the sea, mostly.', price: 88000, upkeep: 210, near: { x: 500, z: 1760 }, slots: 3, bays: 'car' },
  { id: 'cottage', name: 'Pinecrest Cottage', kind: 'house', region: 'Pinecrest Bay', blurb: 'Clapboard, a porch swing and a view of the bay through the pines.', price: 62000, upkeep: 130, near: { x: 720, z: -2290 }, slots: 2, bays: 'car' },
  { id: 'condo', name: 'Bayview Condo', kind: 'penthouse', region: 'Port Valeria', blurb: 'Twentieth floor, floor-to-ceiling glass and a concierge who knows your name.', price: 265000, upkeep: 610, near: { x: 760, z: -120 }, slots: 3, bays: 'car' },
  { id: 'rojo', name: 'Isla Rojo Estate', kind: 'mansion', region: 'Isla Rojo', blurb: 'The island villa with its own airstrip and dock. The most expensive address in San Verano.', price: 2400000, upkeep: 3500, near: { x: -820, z: 1180 }, slots: 8, bays: 'car' },
];

export const PROPERTY_BY_ID = Object.fromEntries(PROPERTIES.map((p) => [p.id, p]));

// ------------------------------------------------------------------------------------------------ businesses

/** What a business is: decides its building, its interior and how it makes money. */
export type BizType = 'food' | 'shop' | 'carwash' | 'storage' | 'laundromat' | 'cab' | 'airstrip' | 'club' | 'motel' | 'grow' | 'print' | 'lab' | 'docs' | 'cartel';

/**
 * Businesses. Legal fronts pay clean takings into the bank every morning and launder dirty money (up to `launder` a day);
 * illegal operations turn supplies into stock over `cycle` game hours (a full load of supplies, costing `supplyCost`, makes
 * `value` dollars of stock), which you sell for dirty money.
 */
export interface BusinessDef {
  id: string; name: string; kind: string; type: BizType; region: string; blurb: string; price: number;
  /** Clean takings per day (legal fronts). */
  income: number;
  legal: boolean;
  near: { x: number; z: number };
  /** Dirty money laundered per day (legal fronts). */
  launder?: number;
  /** Illegal operations: hours to work through a full load, cost of a full load, value of the stock it makes, heat per load. */
  cycle?: number; supplyCost?: number; value?: number; heat?: number;
  /** What the stock is called. */
  product?: string;
}

export const BUSINESSES: BusinessDef[] = [
  { id: 'tacotruck', name: 'Canal Taco Truck', kind: 'Food truck', type: 'food', legal: true, region: 'Costa Merida', blurb: 'One truck, one cook, a line round the block at lunchtime.', price: 15000, income: 190, launder: 2000, near: { x: 600, z: 3380 } },
  { id: 'bait', name: 'Pinecrest Bait & Tackle', kind: 'Shop', type: 'shop', legal: true, region: 'Pinecrest Bay', blurb: 'Worms, hooks and gossip.', price: 28000, income: 330, launder: 4000, near: { x: 690, z: -2310 } },
  { id: 'burger', name: 'Bayside Burger Shack', kind: 'Burger joint', type: 'food', legal: true, region: 'Port Valeria', blurb: 'Smash burgers and milkshakes by the boardwalk.', price: 45000, income: 600, launder: 6000, near: { x: 260, z: 140 } },
  { id: 'carwash', name: 'Sunwash Car Wash', kind: 'Car wash', type: 'carwash', legal: true, region: 'Port Valeria', blurb: 'Hand wash, wax and a cash register that is very hard to audit.', price: 65000, income: 880, launder: 12000, near: { x: 880, z: 220 } },
  { id: 'diner', name: 'Route 9 Diner', kind: 'Diner', type: 'food', legal: true, region: 'Cinder Flats', blurb: 'Pie, coffee and truckers who have seen things.', price: 75000, income: 950, launder: 9000, near: { x: 3360, z: 520 } },
  { id: 'storage', name: 'Harbor Storage Units', kind: 'Storage', type: 'storage', legal: true, region: 'Dusk Harbor', blurb: 'Two hundred lockers. Nobody asks what is in them.', price: 95000, income: 1250, launder: 14000, near: { x: 420, z: 1700 } },
  { id: 'laundromat', name: 'Spin City Laundromat', kind: 'Laundromat', type: 'laundromat', legal: true, region: 'Southside', blurb: 'Coin machines that turn dirty money clean. Officially, clothes.', price: 120000, income: 1600, launder: 30000, near: { x: 1450, z: 420 } },
  { id: 'motel2', name: 'Sea Breeze Motel', kind: 'Motel', type: 'motel', legal: true, region: 'Port Valeria', blurb: 'Twenty rooms, a pool with water in it most days, and no questions.', price: 160000, income: 2000, launder: 20000, near: { x: 300, z: 300 } },
  { id: 'cabco', name: 'Marlow Cab Co.', kind: 'Taxi firm', type: 'cab', legal: true, region: 'Port Valeria', blurb: 'A fleet of yellow sedans and a dispatcher called Dolores.', price: 180000, income: 2350, launder: 22000, near: { x: 1050, z: 150 } },
  { id: 'motel', name: 'Starlite Motel', kind: 'Motel', type: 'motel', legal: true, region: 'Cinder Flats', blurb: 'Neon, ice machines and long-haul truckers. Rooms by the night or by the hour.', price: 210000, income: 2600, launder: 30000, near: { x: 3290, z: 640 } },
  { id: 'airfield', name: 'Cinder Flats Airfield', kind: 'Airstrip', type: 'airstrip', legal: true, region: 'Cinder Flats', blurb: 'A dirt strip, a fuel tank and charter pilots who do not file flight plans.', price: 260000, income: 3300, launder: 35000, near: { x: 2950, z: 1500 } },
  { id: 'club', name: 'The Velvet Room', kind: 'Nightclub', type: 'club', legal: true, region: 'Port Valeria', blurb: 'Velvet ropes, a VIP floor and a bass you feel in your teeth. Takings follow its popularity.', price: 420000, income: 5200, launder: 60000, near: { x: 330, z: -60 } },
  // ---- illegal operations: sold on ghostline.onion
  { id: 'docs', name: 'Marlow Copy Centre', kind: 'Forgery shop', type: 'docs', legal: false, region: 'Port Valeria', blurb: 'Passports, licences and diplomas, behind a copy shop that also makes copies.', price: 150000, income: 0, near: { x: 980, z: 260 }, cycle: 20, supplyCost: 8000, value: 32000, heat: 12, product: 'documents' },
  { id: 'grow', name: 'Pine Hollow Grow-op', kind: 'Grow-op', type: 'grow', legal: false, region: 'Mount Kestrel', blurb: 'A barn in the pines with very good lighting and very blacked-out windows.', price: 220000, income: 0, near: { x: 980, z: -1500 }, cycle: 24, supplyCost: 12000, value: 45000, heat: 14, product: 'green' },
  { id: 'print', name: 'Southside Print Shop', kind: 'Counterfeit cash', type: 'print', legal: false, region: 'Southside', blurb: 'Business cards out front. Fifties out back.', price: 300000, income: 0, near: { x: 1500, z: 500 }, cycle: 30, supplyCost: 18000, value: 70000, heat: 18, product: 'cash' },
  { id: 'lab', name: 'Dry Creek Lab', kind: 'Lab', type: 'lab', legal: false, region: 'Cinder Flats', blurb: 'A trailer in the desert with its own generator and a very bad smell.', price: 380000, income: 0, near: { x: 3600, z: 900 }, cycle: 36, supplyCost: 25000, value: 110000, heat: 26, product: 'product' },
  { id: 'cartel', name: 'Coastline Import Warehouse', kind: 'Cartel', type: 'cartel', legal: false, region: 'Dusk Harbor', blurb: 'The cartel\'s warehouse on the docks. Shipments come in by sea; you move them inland.', price: 1200000, income: 0, near: { x: 560, z: 1820 }, cycle: 48, supplyCost: 120000, value: 420000, heat: 35, product: 'cargo' },
];
export const BUSINESS_BY_ID = Object.fromEntries(BUSINESSES.map((b) => [b.id, b]));

// ------------------------------------------------------------------------------------------------ boats and aircraft for sale

/** Boats, aircraft and military hardware sold online. `shop`: which website sells it. */
export interface CraftForSale { id: string; price: number; shop: 'air' | 'sea' | 'mil'; blurb: string; speed: number; seats: number; paints?: number[] }

export const CRAFT_SHOP: CraftForSale[] = [
  { id: 'zephyr', price: 12000, shop: 'sea', speed: 95, seats: 2, blurb: 'A jet ski. Fast, loud and very wet.', paints: [0xe8402a, 0x1f8ad8, 0xf2c230, 0x1a1a1a, 0xf4f4f0] },
  { id: 'marlin', price: 65000, shop: 'sea', speed: 110, seats: 4, blurb: 'A twin-engine speedboat with a sun deck. The coast guard\'s least favourite boat.', paints: [0xf4f4f0, 0x1f3a6a, 0xc42a2a, 0x1a1a1a, 0x2a8a7a] },
  { id: 'gull', price: 140000, shop: 'sea', speed: 45, seats: 6, blurb: 'A steel fishing boat with a wheelhouse. Smells of bait forever.', paints: [0x2a5a8a, 0xc43a2a, 0x3a6a3a, 0xe8e4dc] },
  { id: 'aurelia', price: 1400000, shop: 'sea', speed: 60, seats: 12, blurb: 'Seventeen metres of yacht: three cabins, a flybridge and a hot tub.', paints: [0xf4f4f0, 0x1c2a44, 0x2a2a2a] },
  { id: 'sparrow', price: 280000, shop: 'air', speed: 230, seats: 4, blurb: 'A light helicopter. Lands on a car park, a beach or a rooftop.', paints: [0xd83a2a, 0x1f6fd6, 0xf2c230, 0x1a1a1a, 0xf4f4f0] },
  { id: 'newsbird', price: 520000, shop: 'air', speed: 255, seats: 6, blurb: 'A twin-turbine chopper with a camera ball. Make your own news.', paints: [0x1f3a6a, 0xf4f4f0, 0xc42a2a, 0x2a2d33] },
  { id: 'skylark', price: 190000, shop: 'air', speed: 260, seats: 4, blurb: 'A high-wing prop plane. Forgiving, frugal, and lands almost anywhere.', paints: [0xf4f4f0, 0xd83a2a, 0x1f6fd6, 0xf2c230] },
  { id: 'rook', price: 360000, shop: 'air', speed: 330, seats: 1, blurb: 'An aerobatic stunt plane. Loops, rolls, and very little luggage space.', paints: [0xe8c050, 0xd83a2a, 0x1a1a1a, 0x1f6fd6] },
  { id: 'meridian', price: 2200000, shop: 'air', speed: 780, seats: 8, blurb: 'A private jet with leather seats and a bar. The fastest way to leave town.', paints: [0xf4f4f0, 0x1c2a44, 0x2a2a2a, 0xc8a24a] },
  { id: 'hornet', price: 3800000, shop: 'mil', speed: 290, seats: 2, blurb: 'Attack helicopter with rocket pods. Ex-National Guard. Paperwork lost.', paints: [0x3c4a3a, 0x2a2d33, 0x5a5a4a] },
  { id: 'lancer', price: 6500000, shop: 'mil', speed: 1400, seats: 1, blurb: 'A fighter jet with missiles. Decommissioned, allegedly.', paints: [0x5d6670, 0x2a2d33, 0x3c4a3a] },
  { id: 'warden', price: 1200000, shop: 'mil', speed: 90, seats: 8, blurb: 'Armoured personnel carrier with a roof gun. Parks wherever it likes.', paints: [0x5a5a4a, 0x3c4a3a, 0x2a2d33] },
  { id: 'bulwark', price: 4500000, shop: 'mil', speed: 65, seats: 3, blurb: 'A main battle tank. The traffic will move.', paints: [0x5a5a4a, 0x3c4a3a, 0x8a7a5a] },
];
export const CRAFT_FOR_SALE = Object.fromEntries(CRAFT_SHOP.map((c) => [c.id, c]));

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
  { id: 'brass3', name: 'Kings Pawn & Arms', kind: 'weapons', near: { x: 1380, z: 430 }, blurb: 'Southside pawn shop. Do not ask where it came from.' },
  { id: 'brass4', name: 'Dockside Arms', kind: 'weapons', near: { x: 540, z: 1700 }, blurb: 'Off the boat and onto the shelf.' },
  { id: 'brass5', name: 'Armeria Merida', kind: 'weapons', near: { x: 640, z: 3240 }, blurb: 'Fine firearms by the canals.' },
  { id: 'brass6', name: 'Pinecrest Outfitters', kind: 'weapons', near: { x: 650, z: -2250 }, blurb: 'Hunting, fishing, and the other kind of hunting.' },
  { id: 'chicken', name: 'Cluckin\' Kings', kind: 'food', near: { x: 1460, z: 520 }, blurb: 'Southside fried chicken. Open till four.' },
  { id: 'coffee', name: 'Grindhouse Coffee', kind: 'food', near: { x: 1010, z: -70 }, blurb: 'Downtown espresso and sandwiches.' },
  { id: 'diner', name: 'Dock Diner', kind: 'food', near: { x: 430, z: 1740 }, blurb: 'Eggs, coffee and longshoremen.' },
  { id: 'diner2', name: 'Bayside Diner', kind: 'food', near: { x: 740, z: -2320 }, blurb: 'Pie of the day, every day.' },
  { id: 'cantina', name: 'Canal Cantina', kind: 'food', near: { x: 560, z: 3300 }, blurb: 'Street food on the water.' },
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
  { id: 'knife', price: 0, ammoPrice: 0, ammoPack: 0 },
  { id: 'hatchet', price: 350, ammoPrice: 0, ammoPack: 0 },
  { id: 'vc9', price: 0, ammoPrice: 60, ammoPack: 24 },
  { id: 'smg', price: 1500, ammoPrice: 90, ammoPack: 60 },
  { id: 'shotgun', price: 1900, ammoPrice: 110, ammoPack: 16 },
  { id: 'rifle', price: 3600, ammoPrice: 150, ammoPack: 60 },
  { id: 'bat', price: 120, ammoPrice: 0, ammoPack: 0 },
  { id: 'revolver', price: 2400, ammoPrice: 120, ammoPack: 12 },
  { id: 'micro', price: 1300, ammoPrice: 90, ammoPack: 50 },
  { id: 'combat', price: 3200, ammoPrice: 140, ammoPack: 16 },
  { id: 'carbine', price: 4200, ammoPrice: 160, ammoPack: 60 },
  { id: 'lmg', price: 9500, ammoPrice: 400, ammoPack: 100 },
  { id: 'sniper', price: 11000, ammoPrice: 300, ammoPack: 10 },
  { id: 'grenade', price: 800, ammoPrice: 500, ammoPack: 2 },
  { id: 'molotov', price: 450, ammoPrice: 300, ammoPack: 2 },
  { id: 'sticky', price: 1100, ammoPrice: 600, ammoPack: 2 },
  { id: 'rpg', price: 14000, ammoPrice: 1200, ammoPack: 2 },
  { id: 'laser', price: 26000, ammoPrice: 400, ammoPack: 40 },
];

export const ATTACHMENTS = {
  ext: { name: 'Extended magazine', blurb: '+50% magazine capacity', price: { vc9: 300, smg: 450, shotgun: 400, rifle: 600, laser: 900, revolver: 0, micro: 400, combat: 500, carbine: 600, lmg: 800, sniper: 700 } as Partial<Record<WeaponId, number>> },
  supp: { name: 'Suppressor', blurb: 'Much quieter: nobody hears, nobody calls it in', price: { vc9: 500, smg: 650, rifle: 900, micro: 550, carbine: 900, sniper: 1200 } as Partial<Record<WeaponId, number>> },
  scope: { name: 'Optic', blurb: 'Tighter aim-down-sights zoom', price: { smg: 500, rifle: 800, laser: 700, carbine: 800, lmg: 900, micro: 450 } as Partial<Record<WeaponId, number>> },
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

/** Snacks you carry and eat anywhere with F (controller: B). */
export const SNACKS = [
  { id: 'bar', name: 'Choco bar', price: 4, heal: 15 },
  { id: 'chips', name: 'Bag of chips', price: 5, heal: 20 },
  { id: 'sandwich', name: 'Club sandwich', price: 11, heal: 40 },
  { id: 'energy', name: 'Energy drink', price: 8, heal: 25 },
] as const;
export const SNACK_LIMIT = 10;

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
export const SHOWROOM = ['pico', 'stanza', 'marlow', 'courier', 'stallion', 'barrage', 'ridgeback', 'huntley', 'vandal', 'sparrow', 'comet', 'veloce'];
export const FOOD_HEAL_CAP = 100;

export const START_CASH = 5000;
export const START_BANK = 2500;
export const REPAIR_COST = 0.02;
export const INSURANCE_FEE = 0.06;
export const SELL_RATE = 0.55;
