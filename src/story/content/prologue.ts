import { CHARS } from '../chars';
import { GOLD, type Gen, type MissionDef, type MissionRun } from '../Missions';
import type { ActorDef, CutsceneDef, Line, Shot } from '../types';
import { chasers, squad } from './act2';

const lk = (id: string): ActorDef['look'] => (id in CHARS ? { char: id as 'mack' } : { cast: id });
const A = (id: string, at: [number, number], face?: number | string, aim = false): ActorDef => ({ id, look: lk(id), at, face, aim });
const L = (who: string, text: string): Line => ({ who, text });
const wide = (lines: Line[], o: Partial<Shot> = {}): Shot => ({ from: [0.4, 1.9, -7], to: [-0.2, 1.75, -5.6], look: [0, 1.4, 0], fov: 48, lines, ...o });
const close = (x: number, lines: Line[], o: Partial<Shot> = {}): Shot => ({ from: [x * 0.45 + 0.7, 1.62, -2.6], to: [x * 0.45 + 0.55, 1.64, -2.2], look: [x, 1.6, 0], fov: 32, lines, ...o });

/** Snow, and no real police: the prologue is scripted from start to finish. Re-applied at every checkpoint. */
function winter(m: MissionRun): void {
  const g = m.s.g;
  g.world.setWeather('snow', true);
  if (g.wanted) g.wanted.muted = true;
  m.onCleanup(() => { g.world.setWeather('clear', true); if (g.wanted) g.wanted.muted = false; });
}

/**
 * The opening of a new game: Pinecrest Bay, the winter of 2011. A sawmill payroll, a silent alarm, and the night that
 * gave Captain Brandt her hold over Mack. It teaches walking, shooting and driving, and it can be skipped.
 */
export const PROLOGUE: MissionDef = {
  id: 'm00', title: 'Pinecrest, 2011', kicker: 'Prologue', char: 'mack', act: 0, giver: 'ray', start: 'pro.mill', hour: 17.25, reward: 0,
  hidden: true, noSummary: true,
  blurb: 'Nine years ago: a sawmill payroll, a snowstorm, and the last job Mack ever drove.',
  gold: [GOLD.time(420), GOLD.accuracy(0.4), GOLD.flawless(60)],
  unlock: (s) => s.afterPrologue(),
  onQuit: (s) => s.afterPrologue(),
  stages: [
    function* (m): Gen {
      winter(m);
      yield* m.cutscene('p00_open');
    },
    function* (m): Gen {
      winter(m);
      m.tip('Move with W A S D and look with the mouse. Hold Shift to run.', 10);
      yield* m.goto('pro.office', 'Follow Ray to the payroll office', { onFoot: true, r: 5 });
      m.say('ray', 'Benny, the dial. Mack, the door. Ninety seconds and we are ghosts.');
      yield* m.hold('pro.office', 'Watch the yard while Benny works the safe', 6, { r: 6 });
    },
    function* (m): Gen {
      winter(m);
      m.give('vc9', 84);
      m.say('benny', 'Open! Two hundred and ten thousand, and... that is an alarm. That is definitely an alarm.');
      m.tip('Hold the right mouse button to aim, left to fire. R reloads.', 10);
      yield* squad(m, 'pg1', 'pro.office', [[-14, 12, 'pistol'], [12, 14, 'pistol'], [0, 24, 'pistol']], 'Mill guards: put them down', { look: 'guard', hp: 70 });
      m.say('ray', 'Sheriff\'s boys, out by the cars! Mack, clear us a way out!');
      yield* squad(m, 'pg2', 'pro.mill', [[-12, 10, 'pistol'], [12, 12, 'shotgun'], [0, 20, 'pistol']], 'Deputies at the cars: clear a path', { look: 'guard2', hp: 80 });
    },
    function* (m): Gen {
      winter(m);
      const car = m.vehicle('car', 'barrage', 'pro.mill', { color: '#20242c' });
      m.failIf('car', () => car.exploded, 'The getaway car was destroyed.');
      m.say('ray', 'I am hit. Mack. Drive. Do not talk, drive.');
      yield* m.enter('car', 'Get everyone into the Barrage');
      m.tip('W accelerates, S brakes, Space is the handbrake. X slows time while you drive.', 12);
      chasers(m, ['dep1', 'dep2'], 'pro.mill', 'ridgeback', 102);
      m.limit('Reach the coast road', 190, 'The deputies ran you off the road.');
      yield* m.goto('pro.light', 'Take the lighthouse road out of town', { vehicle: 'car', r: 24 });
      m.clearLimit();
      m.s.drivers.clear();
    },
    function* (m): Gen {
      winter(m);
      yield* m.cutscene('p00_end');
    },
  ],
};

export const PROLOGUE_SCENES: Record<string, CutsceneDef> = {
  p00_open: {
    id: 'p00_open', anchor: 'pro.mill', heading: 0, hour: 17.25,
    actors: [A('mack', [-1.6, 0], 'ray'), A('ray', [0.4, 0.4], 'mack'), A('benny', [2.4, 0.2], 'ray')],
    shots: [
      { from: [6, 5, -16], to: [3, 3.2, -11], look: [0, 1.5, 0], fov: 44, lines: [L('mack', 'Pinecrest Bay. The winter of 2011. I was thirty-one and I thought snow was the worst thing that could happen to a getaway.')] },
      wide([L('ray', 'Sawmill pays the whole season in cash, tonight, out of one safe. Benny opens it. I carry it. Mack drives.'), L('benny', 'And nobody gets clever.')]),
      close(-1.6, [L('mack', 'Engine stays warm. Two minutes, Ray. After that I am a man sitting alone in a car.'), L('ray', 'You have never left anybody in your life, Marcus. That is why I hired you.')]),
    ],
  },
  p00_end: {
    id: 'p00_end', anchor: 'pro.light', heading: 180, hour: 17.9,
    actors: [A('officer', [0, 3.2], 'mack', true), A('mack', [-1.2, 0], 'officer'), A('benny', [1.4, -0.4], 'officer'), A('ray', [2.8, -1.2], 'officer')],
    shots: [
      { from: [5, 2.2, -8], to: [3.6, 1.9, -6], look: [0, 1.5, 2], fov: 40, lines: [L('officer', 'Engine off. Hands on the wheel. All of you.'), L('mack', 'Officer. My friend is bleeding.')] },
      close(0, [L('officer', 'Your friend robbed a sawmill. How much is in the bag?'), L('benny', 'Two hundred and ten.')], { look: [0, 1.6, 3.2], from: [-1.4, 1.62, 0.4], to: [-1.1, 1.64, 0.9] }),
      close(0, [L('officer', 'Leave the bag on the road. Take him to a vet, not a hospital. I never saw a car tonight.'), L('mack', 'Why would you do that?')], { look: [0, 1.6, 3.2], from: [1.2, 1.62, 0.2], to: [0.9, 1.64, 0.8] }),
      close(-1.2, [L('officer', 'Because one day I am going to need a driver. And you are going to remember who let you go.')]),
      { from: [0, 3.2, -9], to: [0, 6.4, -15], look: [0, 1.5, 4], fov: 50, lines: [L('mack', 'Ray did not make it to the vet. Benny bought a garage. I learned to park cars.'), L('mack', 'And for nine years, nobody came for me.')] },
    ],
  },
};
