import type { Outfit } from '../economy/types';

export type CharId = 'mack' | 'imani' | 'teddy';
export const CHAR_IDS: CharId[] = ['mack', 'imani', 'teddy'];

/** A place: a named spot (see places.ts) or plain world coordinates. */
export type Place = string | { x: number; z: number };

export type Hand = 'slipstream' | 'overwatch' | 'rampage';

export interface CharDef {
  id: CharId;
  name: string;
  nick: string;
  age: string;
  role: string;
  blurb: string;
  color: string;
  outfit: Outfit;
  /** Property id of the character's free home (save point, wardrobe and garage). */
  home: string;
  ability: { id: Hand; name: string; blurb: string };
  /** 0–5 stars shown on the switch wheel. */
  skills: { driving: number; shooting: number; flying: number; strength: number };
  /** Where the character first appears. */
  start: Place;
}

/** Voice parameters for browser text-to-speech and the colour of the subtitle name. */
export interface Voice { name: string; color: string; pitch: number; rate: number; prefer: 'f' | 'm' }

export interface CharState { x: number; z: number; yaw: number; health: number; armour: number; outfit: Outfit }

export interface MissionRecord {
  done: boolean;
  /** In-game day it was first completed (moves the stock market). */
  day?: number;
  skipped: boolean;
  /** Ids of the gold objectives completed on the best run(s). */
  medals: string[];
  /** Best time in seconds. */
  best: number;
  fails: number;
  plays: number;
}

export interface HeistRecord {
  done: boolean;
  approach: 'loud' | 'quiet' | 'smart' | null;
  /** Prep missions finished for the chosen approach. */
  prep: string[];
  crew: string[];
  /** Best payout. */
  take: number;
  plays: number;
}

export type CrewStatus = 'ok' | 'hurt' | 'dead' | 'quit';

/** What the player has done with one crew member. */
export interface CrewRec {
  hired: boolean;
  /** 0–100. Low loyalty means skimming, then walking away. */
  loyalty: number;
  status: CrewStatus;
  /** Day the member is fit again (status 'hurt'). */
  healDay: number;
  jobs: number;
  /** Skill gained through experience (added to the roster skill, up to 5). */
  xp: number;
}

export interface RobberyStats {
  count: number;
  take: number;
  /** Store / ATM id → the day it can be robbed again. */
  cooldown: Record<string, number>;
  /** Clerks shot, alarms tripped (for the summary). */
  shootouts: number;
}

/** What the player has done in one side activity (a race course, a job type, a game). */
export interface ActRecord {
  plays: number;
  /** Wins / completions: the number the completion tracker counts. */
  wins: number;
  /** Best time (s) or score; 0 when none. */
  best: number;
  /** Anything else an activity wants to remember (course ids won, streaks, level). */
  ext: Record<string, number>;
}

export interface StoryState {
  active: CharId;
  unlocked: CharId[];
  chars: Partial<Record<CharId, CharState>>;
  missions: Record<string, MissionRecord>;
  heists: Record<string, HeistRecord>;
  flags: Record<string, number | string | boolean>;
  introSeen: boolean;
  /** Special-ability meters (0–1). */
  meter: Record<CharId, number>;
  crew: Record<string, CrewRec>;
  rob: RobberyStats;
  /** Collectible kind → ids found. */
  collect: Record<string, string[]>;
  /** Side-activity id → record. */
  acts: Record<string, ActRecord>;
  /** Completion milestones and collectible set bonuses already paid. */
  claimed: string[];
}

export const newStory = (): StoryState => ({
  active: 'mack',
  unlocked: ['mack'],
  chars: {},
  missions: {},
  heists: {},
  flags: {},
  introSeen: false,
  meter: { mack: 1, imani: 1, teddy: 1 },
  crew: {},
  rob: { count: 0, take: 0, cooldown: {}, shootouts: 0 },
  collect: {},
  acts: {},
  claimed: [],
});

// ------------------------------------------------------------------------------------------------ cutscenes

export type V3 = [number, number, number];

export interface Line { who: string; text: string }

export type ActorLook =
  | { char: CharId }
  | { cast: string };

export interface ActorDef {
  id: string;
  look: ActorLook;
  /** Position relative to the scene anchor: [right, forward]. */
  at: [number, number];
  /** Facing: degrees relative to the scene heading, or another actor's id, or 'cam'. */
  face?: number | string;
  aim?: boolean;
}

export interface Shot {
  /** Camera start, end (optional dolly) in scene space [right, up, forward]. */
  from: V3;
  to?: V3;
  /** Look-at point, and an optional end point. */
  look: V3;
  lookTo?: V3;
  fov?: number;
  /** Seconds. Defaults to however long the lines take to read. */
  dur?: number;
  lines?: Line[];
  /** Actor changes when the shot starts. */
  act?: { id: string; walkTo?: [number, number]; face?: number | string; aim?: boolean; remove?: boolean }[];
}

export interface CutsceneDef {
  id: string;
  /** Scene anchor: a place, or the player's position. */
  anchor: Place | 'player';
  /** Scene heading in degrees (forward = (sin h, cos h)). */
  heading?: number;
  /** Optionally set the hour of day. */
  hour?: number;
  actors: ActorDef[];
  shots: Shot[];
}
