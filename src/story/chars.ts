import type { CharDef, CharId, Voice } from './types';

export const CHARS: Record<CharId, CharDef> = {
  mack: {
    id: 'mack', name: 'Marcus "Mack" Delgado', nick: 'Mack', age: '40s', role: 'Retired getaway driver',
    blurb: 'Charming, tired, and trying to go straight. Family trouble. Still the best behind a wheel in San Verano.',
    color: '#ff9f43',
    outfit: { top: '#1f3354', cuff: '#14223a', gloves: 'none', skin: '#b9825a', hair: '#17120e', hairStyle: 'short', glasses: false },
    home: 'boardwalk',
    ability: { id: 'slipstream', name: 'Slipstream', blurb: 'While driving, time slows and the car holds every drift you ask of it.' },
    skills: { driving: 5, shooting: 2, flying: 1, strength: 2 },
    start: 'home.mack',
  },
  imani: {
    id: 'imani', name: 'Imani Cole', nick: 'Imani', age: '30s', role: 'Pilot and freelance operative',
    blurb: 'A former military pilot turned smuggler. Cold, funny and very hard to surprise.',
    color: '#4aa8ff',
    outfit: { top: '#4d5a3e', cuff: '#2f3826', gloves: 'tactical', skin: '#8a5a3c', hair: '#17120e', hairStyle: 'slick', glasses: true },
    home: 'hangar',
    ability: { id: 'overwatch', name: 'Overwatch', blurb: 'Time slows and your aim locks in: almost no spread, extra reach. Aircraft take far less damage.' },
    skills: { driving: 3, shooting: 5, flying: 5, strength: 2 },
    start: 'home.imani',
  },
  teddy: {
    id: 'teddy', name: 'Teddy Vance', nick: 'Teddy', age: '20s–30s', role: 'Stuntman and influencer',
    blurb: 'Unhinged, unfailingly cheerful and surprisingly lovable. A human wrecking ball from the desert.',
    color: '#5ad17a',
    outfit: { top: '#1f8a8a', cuff: '#165f5f', gloves: 'none', skin: '#e8b99a', hair: '#c9a45a', hairStyle: 'long', glasses: false },
    home: 'trailer',
    ability: { id: 'rampage', name: 'Rampage', blurb: 'Take a fraction of the damage, and blasts and rams hit like a truck.' },
    skills: { driving: 3, shooting: 3, flying: 2, strength: 5 },
    start: 'home.teddy',
  },
};

/** Look values for the figures in cutscenes (the playable three are drawn from their outfits). */
export interface CastLook { skin: number; hair: number; shirt: number; pants: number; shoe: number; h: number; w: number }

export interface CastDef { id: string; voice: Voice; look: CastLook }

const v = (name: string, color: string, pitch: number, rate: number, prefer: 'f' | 'm'): Voice => ({ name, color, pitch, rate, prefer });

export const VOICES: Record<string, Voice> = {
  mack: v('Mack', '#ff9f43', 0.78, 0.94, 'm'),
  imani: v('Imani', '#4aa8ff', 1.05, 1.02, 'f'),
  teddy: v('Teddy', '#5ad17a', 1.22, 1.14, 'm'),
  crane: v('Crane', '#d8d2c4', 0.9, 0.9, 'm'),
  brandt: v('Brandt', '#8fb3ff', 0.95, 1.0, 'f'),
  pruitt: v('Pruitt', '#c9c19a', 0.82, 0.92, 'm'),
  rosa: v('Rosa Lazaro', '#ff6a6a', 0.92, 0.9, 'f'),
  mateo: v('Mateo', '#ff8a6a', 0.7, 1.0, 'm'),
  benny: v('Benny', '#e0b25a', 1.0, 1.16, 'm'),
  pilar: v('Pilar', '#a58bff', 1.12, 1.08, 'f'),
  dex: v('Dex', '#7ad7e0', 1.08, 1.2, 'm'),
  mamajo: v('Mama Jo', '#ffb347', 0.88, 0.94, 'f'),
  marisol: v('Marisol', '#ff7ab0', 1.1, 1.06, 'f'),
  silas: v('Silas', '#8be0b2', 1.0, 1.1, 'm'),
  dispatch: v('Dispatch', '#9aa0ae', 1.0, 1.0, 'f'),
  guard: v('Guard', '#9aa0ae', 0.8, 1.0, 'm'),
  thug: v('Gunman', '#ff7a59', 0.75, 1.05, 'm'),
  narrator: v('', '#eceef3', 1.0, 1.0, 'm'),
};

const look = (skin: number, hair: number, shirt: number, pants: number, h = 1, w = 1): CastLook => ({ skin, hair, shirt, pants, shoe: 0x1a1a1c, h, w });

export const CAST: Record<string, CastDef> = {
  crane: { id: 'crane', voice: VOICES.crane!, look: look(0xe0ac86, 0x8d8d8a, 0x1b2230, 0x1b2230, 1.04, 1.0) },
  brandt: { id: 'brandt', voice: VOICES.brandt!, look: look(0xc68863, 0x16110d, 0x1f3358, 0x161c2a, 1.0, 0.95) },
  pruitt: { id: 'pruitt', voice: VOICES.pruitt!, look: look(0xf1c7a5, 0x6a5a46, 0x6b6a5e, 0x3b3f4a, 1.0, 1.0) },
  rosa: { id: 'rosa', voice: VOICES.rosa!, look: look(0xc68863, 0xa9aeb5, 0x7a1f2a, 0x1d1d22, 0.96, 0.95) },
  mateo: { id: 'mateo', voice: VOICES.mateo!, look: look(0xc68863, 0x16110d, 0x242424, 0x2b2b30, 1.08, 1.14) },
  benny: { id: 'benny', voice: VOICES.benny!, look: look(0x7a4a2b, 0x16110d, 0xd0a23a, 0x2b3a5a, 0.98, 1.08) },
  pilar: { id: 'pilar', voice: VOICES.pilar!, look: look(0xe0ac86, 0x2a1d14, 0xe8e8e4, 0x2b3a5a, 0.96, 0.95) },
  dex: { id: 'dex', voice: VOICES.dex!, look: look(0xe0ac86, 0x4b3322, 0xff6a3c, 0x4a4a4e, 1.0, 0.96) },
  mamajo: { id: 'mamajo', voice: VOICES.mamajo!, look: look(0xa8693f, 0x8d8d8a, 0xc9c9c4, 0x6b5a46, 0.94, 1.12) },
  marisol: { id: 'marisol', voice: VOICES.marisol!, look: look(0xc68863, 0x16110d, 0x8c3b3b, 0x1e2230, 0.98, 0.96) },
  silas: { id: 'silas', voice: VOICES.silas!, look: look(0xf1c7a5, 0x2a1d14, 0x2c2c2f, 0x1e2230, 1.02, 0.9) },
  guard: { id: 'guard', voice: VOICES.guard!, look: look(0xe0ac86, 0x2a1d14, 0x2a2d33, 0x1b1d20, 1.04, 1.06) },
  thug: { id: 'thug', voice: VOICES.thug!, look: look(0xc68863, 0x16110d, 0x8c2b2b, 0x1e2230, 1.02, 1.04) },
};
