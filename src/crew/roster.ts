export type CrewRole = 'driver' | 'gunman' | 'hacker' | 'lockpicker' | 'pilot' | 'demolitions';

export interface CrewDef {
  id: string;
  name: string;
  role: CrewRole;
  /** 1–5 before experience. */
  skill: number;
  /** Share of every take. */
  cut: number;
  /** One-off recruiting fee (0 for the people the story hands you). */
  fee: number;
  blurb: string;
  /** Free once this story mission / heist is done. */
  story?: { mission?: string; heist?: string };
  /** Voice and look id in the cast table. */
  cast: string;
}

export const ROLE_LABEL: Record<CrewRole, string> = {
  driver: 'Driver', gunman: 'Gunman', hacker: 'Hacker', lockpicker: 'Lockpicker', pilot: 'Pilot', demolitions: 'Demolitions',
};

export const ROLE_EFFECT: Record<CrewRole, string> = {
  driver: 'Cuts the heat when you leave: fewer wanted stars.',
  gunman: 'Fights beside you in the field and answers the command wheel.',
  hacker: 'Loops cameras (they see less) and shortens vault and terminal times.',
  lockpicker: 'Opens display cases, locks and keycards faster.',
  pilot: 'Air pickup: one more star off when the job is over.',
  demolitions: 'Cuts drilling and breaching times, especially when loud.',
};

export const ROSTER: CrewDef[] = [
  { id: 'benny', name: 'Benny Okonkwo', role: 'driver', skill: 3, cut: 0.08, fee: 0, blurb: 'Redline mechanic. Knows every back road and every cop shift.', story: { mission: 'm02' }, cast: 'benny' },
  { id: 'tilly', name: 'Tilly Varga', role: 'driver', skill: 5, cut: 0.14, fee: 18000, blurb: 'Rally champion turned getaway artist. Never scratches the car.', cast: 'tilly' },
  { id: 'silas', name: 'Silas Quinn', role: 'hacker', skill: 4, cut: 0.1, fee: 0, blurb: 'Pruitt\'s trusted hacker. Talks to cameras like old friends.', story: { heist: 'h1' }, cast: 'silas' },
  { id: 'wren', name: 'Wren Alvarado', role: 'hacker', skill: 2, cut: 0.06, fee: 4000, blurb: 'Self-taught and cheap. Mostly reliable.', cast: 'wren' },
  { id: 'dex', name: 'Dex Quill', role: 'lockpicker', skill: 2, cut: 0.05, fee: 0, blurb: 'Teddy\'s cameraman. Learned locks to get better footage.', story: { mission: 'm09' }, cast: 'dex' },
  { id: 'jinx', name: 'Jinx Moreau', role: 'lockpicker', skill: 4, cut: 0.12, fee: 12000, blurb: 'Has never met a lock that stayed closed.', cast: 'jinx' },
  { id: 'tank', name: '"Tank" Mbeki', role: 'gunman', skill: 3, cut: 0.08, fee: 4500, blurb: 'Dockside muscle. Not clever, very hard to move.', cast: 'tank' },
  { id: 'marco', name: 'Marco Reyes', role: 'gunman', skill: 4, cut: 0.12, fee: 10000, blurb: 'Ex-private security. Calm under fire.', cast: 'marco' },
  { id: 'vera', name: 'Vera Kozlov', role: 'gunman', skill: 5, cut: 0.15, fee: 22000, blurb: 'Former mercenary. The best shot money can rent.', cast: 'vera' },
  { id: 'pilar', name: 'Pilar Reyes', role: 'pilot', skill: 4, cut: 0.1, fee: 0, blurb: 'Dispatcher by day, helicopter pilot by night.', story: { mission: 'm04' }, cast: 'pilar' },
  { id: 'fuse', name: 'Fuse Delacroix', role: 'demolitions', skill: 2, cut: 0.06, fee: 3500, blurb: 'Quarry blaster. Enthusiastic about dust.', cast: 'fuse' },
  { id: 'ox', name: '"Ox" Okafor', role: 'demolitions', skill: 4, cut: 0.12, fee: 14000, blurb: 'Does vault doors the way surgeons do hearts.', cast: 'ox' },
];

export const ROSTER_BY_ID = Object.fromEntries(ROSTER.map((c) => [c.id, c])) as Record<string, CrewDef>;
