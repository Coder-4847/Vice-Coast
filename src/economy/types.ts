import type { WeaponId } from '../player/Weapons';
import type { StoryState } from '../story/types';

export type Finish = 'gloss' | 'matte' | 'metallic' | 'pearl' | 'chrome';
export type GloveStyle = 'none' | 'leather' | 'tactical' | 'white';
export type HairStyle = 'short' | 'buzz' | 'long' | 'slick' | 'bald';

/** What the player is wearing. In first person you see the sleeves, cuffs, gloves and skin; in vehicles the whole figure. */
export interface Outfit {
  top: string;
  cuff: string;
  gloves: GloveStyle;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  glasses: boolean;
}

export interface PerfMods {
  engine: number;
  brakes: number;
  suspension: number;
  turbo: boolean;
}

/** Everything about a car that the player can change. */
export interface VehicleCustom {
  color: string;
  accent: string;
  finish: Finish;
  /** 0 clear … 3 limo. */
  tint: number;
  rim: string;
  plate: string;
  spoiler: 0 | 1 | 2;
  neon: string | null;
  perf: PerfMods;
  runflat: boolean;
  armour: boolean;
}

export type VehicleWhere =
  | { kind: 'stored'; prop: string }
  | { kind: 'world'; x: number; z: number; yaw: number }
  | { kind: 'destroyed'; prop: string };

export interface OwnedVehicle {
  uid: string;
  spec: string;
  custom: VehicleCustom;
  where: VehicleWhere;
  /** What was paid for it (resale is a share of this plus the mods). */
  value: number;
}

export interface OwnedProperty {
  id: string;
  boughtDay: number;
  overdue: number;
  /** A protagonist's home: no upkeep, never repossessed. */
  free?: boolean;
}

export interface WeaponKit {
  ext: boolean;
  supp: boolean;
  scope: boolean;
  tint: string;
}

export interface Message {
  id: number;
  from: string;
  text: string;
  day: number;
  read: boolean;
}

export interface Stats {
  spent: number;
  earned: number;
  playSeconds: number;
  carsBought: number;
  kills: number;
}

export interface Profile {
  cash: number;
  bank: number;
  day: number;
  props: OwnedProperty[];
  vehicles: OwnedVehicle[];
  outfit: Outfit;
  clothes: string[];
  weapons: Record<WeaponId, { owned: boolean; ammo: number; reserve: number }>;
  kits: Record<WeaponId, WeaponKit>;
  messages: Message[];
  stats: Stats;
  /** Next message / vehicle ids. */
  seq: number;
  /** The property last used as a spawn point after Wasted / Busted. */
  home: string | null;
  /** Missions, heists and the three protagonists. */
  story: StoryState;
  /** Snacks in your pockets, by id (see SNACKS). */
  snacks: Record<string, number>;
  /** Businesses owned (bought online): ids from BUSINESSES. */
  biz: string[];
}

export interface SaveData {
  version: 1;
  savedAt: number;
  label: string;
  profile: Profile;
  world: { x: number; z: number; yaw: number; hour: number; health: number; armour: number };
}

export interface SlotInfo {
  slot: number;
  empty: boolean;
  label: string;
  savedAt: number;
  playSeconds: number;
  cash: number;
  bank: number;
  props: number;
  cars: number;
}
