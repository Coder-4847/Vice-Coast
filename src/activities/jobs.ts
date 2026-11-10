import type { Gen, MissionDef, MissionRun } from '../story/Missions';
import type { HostileOpts } from '../story/Hostiles';
import { GOLD } from '../story/Missions';
import { money } from '../economy/Economy';
import { lookFor } from '../story/Figures';
import type { RaceSrc } from './Race';
import { raceMission } from './Race';

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;

/** A random open spot 'rmin'–'rmax' metres from a point. */
function spot(m: MissionRun, from: { x: number; z: number }, rmin: number, rmax: number): { x: number; z: number } {
  const a = Math.random() * Math.PI * 2, r = rmin + Math.random() * (rmax - rmin);
  return m.s.snap(from.x + Math.cos(a) * r, from.z + Math.sin(a) * r, 2.2);
}


// ------------------------------------------------------------------------------------------------ taxi

const CHATTER: [string, string][] = [
  ['benny', 'Easy on the corners, my friend. I just ate.'],
  ['pilar', 'Third cab this week. The other two had no heater. No radio either.'],
  ['dex', 'Can you go faster? Is faster a thing? Faster is a thing.'],
  ['silas', 'You look like you have seen things. I will not ask.'],
  ['marisol', 'Do not tell my husband where we are going. Actually, there is nothing to tell.'],
  ['mamajo', 'In my day a cab driver talked. You talk? No? Good, I like quiet.'],
  ['tilly', 'Left. No, the other left. Okay, my left.'],
  ['wren', 'If anyone asks, you never picked me up. Thank you, driver.'],
];

const TAXI_FARES = 3;

function* fare(m: MissionRun, n: number): Gen {
  const s = m.s;
  const cab = m.veh('cab').position;
  const from = spot(m, { x: cab.x, z: cab.z }, 150, 360);
  const to = spot(m, from, 450, 950);
  const id = `fare${n}`;
  const [voice, line] = pick(CHATTER);
  const look = lookFor({ cast: voice });
  s.figures.spawn(id, look, from.x, from.z, 0);
  yield* m.goto(from, `Pick up fare ${n + 1} of ${TAXI_FARES}`, { vehicle: 'cab', r: 9, glyph: '◈', color: '#ffd166' });
  m.say(voice, 'Finally. Take me to the marked spot, please.');
  s.figures.remove(id);
  yield* m.wait(0.8);
  const d = dist(from, to);
  const secs = Math.round(d / 11 + 25);
  m.limit('Fare', secs, 'The passenger got out and walked.');
  m.say(voice, line);
  yield* m.goto(to, `Take them to the drop-off`, { vehicle: 'cab', r: 9, glyph: '◈', color: '#7be28f' });
  const left = m.timeLeft;
  m.clearLimit();
  const base = Math.round(30 + d * 0.07);
  const tip = Math.round(Math.max(0, left / secs) * base * 0.8);
  const damaged = m.veh('cab').health < 700 ? 0 : 1;
  m.stats.extra.payout = (m.stats.extra.payout ?? 0) + base + tip * damaged;
  m.stats.extra.count = (m.stats.extra.count ?? 0) + 1;
  m.tip(`Fare ${money(base)} + tip ${money(tip * damaged)}`, 4);
  yield* m.wait(0.6);
}

export const taxiMission = (): MissionDef => ({
  id: 'j_taxi', title: 'Marlow Cab: Shift', char: 'any', act: 0, blurb: 'Three fares in a Marlow taxi. Smooth driving earns tips.', start: 'job.cab',
  gold: [{ id: 'tips', label: 'Earn $150 or more', test: (s) => (s.extra.payout ?? 0) >= 150 }, GOLD.clean(), { id: 'cab', label: 'Return the cab unharmed', test: (s) => (s.extra.cabHp ?? 0) >= 800 }],
  reward: 0, activity: 'job.taxi',
  stages: [
    function* (m): Gen { m.vehicle('cab', 'marlow', 'job.cab'); yield* m.enter('cab', 'Take the cab out of the depot'); },
    function* (m): Gen { yield* fare(m, 0); },
    function* (m): Gen { yield* fare(m, 1); },
    function* (m): Gen { yield* fare(m, 2); m.stats.extra.cabHp = m.veh('cab').health; m.stats.extra.win = 1; },
  ],
});

// ------------------------------------------------------------------------------------------------ courier

const DROPS = 3;

function* drop(m: MissionRun, n: number): Gen {
  const here = m.playerPos();
  const a = n === 0 ? m.at('job.courier') : spot(m, here, 200, 500);
  const b = spot(m, a, 600, 1200);
  yield* m.goto(a, n === 0 ? 'Collect the first package' : `Collect package ${n + 1}`, { glyph: '▣', color: '#ffb347', r: 6 });
  const d = dist(a, b);
  const secs = Math.round(d / 13 + 30);
  m.limit('Delivery', secs, 'The package was late.');
  yield* m.goto(b, `Deliver package ${n + 1} of ${DROPS}`, { glyph: '▣', color: '#7be28f', r: 8 });
  const left = m.timeLeft;
  m.clearLimit();
  const pay = Math.round(300 + d * 0.5 + Math.max(0, left / secs) * 400);
  m.stats.extra.payout = (m.stats.extra.payout ?? 0) + pay;
  m.stats.extra.count = (m.stats.extra.count ?? 0) + 1;
  m.tip(`Delivered: +${money(pay)}`, 3);
  yield* m.wait(0.5);
}

export const courierMission = (): MissionDef => ({
  id: 'j_courier', title: 'Swiftline Couriers', char: 'any', act: 0, blurb: 'Three rush deliveries across the city, any vehicle you like. Speed pays.', start: 'job.courier',
  gold: [GOLD.time(420), GOLD.clean(), { id: 'cash', label: 'Earn $2,000', test: (s) => (s.extra.payout ?? 0) >= 2000 }],
  reward: 0, activity: 'job.courier',
  stages: [
    function* (m): Gen { yield* drop(m, 0); },
    function* (m): Gen { yield* drop(m, 1); },
    function* (m): Gen { yield* drop(m, 2); m.stats.extra.win = 1; },
  ],
});

// ------------------------------------------------------------------------------------------------ bounty

function bountyMission(id: string, title: string, blurb: string, at: string, men: number, pay: number, kind: HostileOpts['kind']): MissionDef {
  return {
    id, title, char: 'any', act: 0, blurb, start: 'job.bounty',
    gold: [GOLD.time(240), GOLD.accuracy(0.4), GOLD.flawless(60)], reward: 0, activity: 'job.bounty',
    stages: [
      function* (m): Gen {
        m.give('smg', 120);
        yield* m.goto(at, 'Find the skip\'s hideout', { r: 40, glyph: '✦', color: '#ff6a6a' });
      },
      function* (m): Gen {
        const w = m.at(at);
        const spawns: HostileOpts[] = [{ x: w.x, z: w.z, kind: 'smg', hp: 160, tag: 'skip' }];
        for (let i = 0; i < men; i++) spawns.push({ x: w.x + (i % 2 ? 9 : -9) + i * 2, z: w.z + 6 - i * 4, kind });
        yield* m.kill('skip', spawns, 'Take down the skip and his crew');
        m.stats.extra.payout = pay;
        m.stats.extra.win = 1;
        m.stats.extra.count = 1;
        m.tip(`Bounty collected: +${money(pay)}`, 4);
        yield* m.wait(1);
      },
    ],
  };
}

// ------------------------------------------------------------------------------------------------ repo

const repoMission = (): MissionDef => ({
  id: 'j_repo', title: 'Repo Man', char: 'any', act: 0, blurb: 'A Barrage GT with six missed payments sits outside a Marlowe Row restaurant. Drive it to Redline Customs before the owner calls the police.', start: 'job.repo',
  gold: [{ id: 'quick', label: 'Under 4:00', test: (s) => s.time <= 240 }, { id: 'hp', label: 'Deliver it undamaged', test: (s) => (s.extra.carHp ?? 0) >= 900 }, GOLD.lowStars(2)],
  reward: 0, activity: 'job.repo',
  stages: [
    function* (m): Gen {
      m.vehicle('target', 'barrage', 'marlowe', { color: '#7a1020' });
      m.failIf('t', () => m.veh('target').exploded, 'The car was destroyed.');
      yield* m.enter('target', 'Take the repo target (Barrage GT)');
      m.s.g.wanted?.report(10, m.veh('target').position.x, m.veh('target').position.z, true);
    },
    function* (m): Gen {
      m.failIf('t', () => m.veh('target').exploded, 'The car was destroyed.');
      yield* m.goto('redline.yard', 'Deliver the car to Redline Customs', { vehicle: 'target', r: 9, glyph: '⚙' });
      yield* m.escape(0, 'Lose the police');
      m.stats.extra.carHp = m.veh('target').health;
      m.stats.extra.payout = 1800 + Math.round(m.veh('target').health);
      m.stats.extra.win = 1;
      m.stats.extra.count = 1;
    },
  ],
});

// ------------------------------------------------------------------------------------------------ vigilante

function* wave(m: MissionRun, n: number): Gen {
  const here = m.playerPos();
  const w = spot(m, here, 250, 450);
  const count = 2 + n;
  const spawns: HostileOpts[] = [];
  for (let i = 0; i < count; i++) spawns.push({ x: w.x + (i - count / 2) * 3, z: w.z + (i % 2) * 4, kind: n >= 2 ? 'smg' : 'pistol' });
  m.limit('Crime in progress', 150, 'The criminals got away.');
  yield* m.goto(w, `Crime in progress (${n + 1} of 3)`, { r: 45, glyph: '★', color: '#6aa8ff' });
  yield* m.kill('vig', spawns, 'Stop the criminals');
  m.clearLimit();
  const pay = 500 + n * 250;
  m.stats.extra.payout = (m.stats.extra.payout ?? 0) + pay;
  m.tip(`Criminals stopped: +${money(pay)}`, 3);
}

const vigilanteMission = (): MissionDef => ({
  id: 'j_vig', title: 'Vigilante', char: 'any', act: 0, blurb: 'Three crimes in progress on the scanner. You are the nearest unit, in every sense that matters.', start: 'job.vig',
  gold: [GOLD.time(420), GOLD.accuracy(0.4), GOLD.flawless(80)], reward: 0, activity: 'job.vigilante',
  stages: [
    function* (m): Gen { m.give('smg', 150); yield* wave(m, 0); },
    function* (m): Gen { yield* wave(m, 1); },
    function* (m): Gen { yield* wave(m, 2); m.stats.extra.win = 1; m.stats.extra.count = 1; },
  ],
});

// ------------------------------------------------------------------------------------------------ flight school and stunt course

const A_X = 1160, A_Z = 985;
const SCHOOL: RaceSrc[] = [
  { id: 'school1', act: 'school.flight', title: 'Lesson 1: Take-off', blurb: 'Get the Rook off the ground and through the first three gates.', mode: 'air', spec: 'rook', via: [[A_X - 300, A_Z], [A_X - 700, A_Z - 20], [A_X - 1100, A_Z - 40], [A_X - 1500, A_Z - 40]], par: 80, reward: 1500, alt: 90 },
  { id: 'school2', act: 'school.flight', title: 'Lesson 2: Turns', blurb: 'Bank left, bank right, hold your altitude.', mode: 'air', spec: 'rook', via: [[A_X - 300, A_Z], [A_X - 700, A_Z - 200], [A_X - 1000, A_Z + 100], [A_X - 1300, A_Z - 200], [A_X - 1600, A_Z + 100]], par: 100, reward: 1800, alt: 100 },
  { id: 'school3', act: 'school.flight', title: 'Lesson 3: Low flying', blurb: 'Thirty metres off the deck. Do not touch the ground.', mode: 'air', spec: 'rook', via: [[A_X - 300, A_Z], [A_X - 800, A_Z + 40], [A_X - 1300, A_Z + 60], [A_X - 1800, A_Z + 40]], par: 85, reward: 2000, alt: 30, rad: 45 },
  { id: 'school4', act: 'school.flight', title: 'Lesson 4: Over the city', blurb: 'Fly the skyline gates at the pace of a commuter jet.', mode: 'air', spec: 'skylark', via: [[A_X - 300, A_Z], [1000, 500], [980, 100], [900, -300], [1150, -300]], par: 140, reward: 2200, alt: 140 },
  { id: 'school5', act: 'school.flight', title: 'Lesson 5: Night flight', blurb: 'The same circuit after dark. Trust your instruments.', mode: 'air', spec: 'skylark', via: [[A_X - 300, A_Z], [1000, 600], [980, 200], [980, -200], [1200, -100]], par: 150, reward: 2500, alt: 120 },
  { id: 'stunt1', act: 'school.stunt', title: 'Stunt Course: Slalom', blurb: 'Weave the pylons over the airfield.', mode: 'air', spec: 'rook', via: [[A_X - 300, A_Z], [A_X - 500, A_Z - 60], [A_X - 700, A_Z + 60], [A_X - 900, A_Z - 60], [A_X - 1100, A_Z + 60]], par: 60, reward: 2500, alt: 35, rad: 38 },
  { id: 'stunt2', act: 'school.stunt', title: 'Stunt Course: Low and fast', blurb: 'A straight run at head-height.', mode: 'air', spec: 'rook', via: [[A_X - 300, A_Z], [A_X - 800, A_Z], [A_X - 1400, A_Z], [A_X - 2000, A_Z]], par: 55, reward: 3000, alt: 22, rad: 35 },
  { id: 'stunt3', act: 'school.stunt', title: 'Stunt Course: The Gauntlet', blurb: 'Around the terminal and back through the hangars.', mode: 'air', spec: 'rook', via: [[A_X - 300, A_Z], [A_X, A_Z - 100], [A_X + 400, A_Z - 180], [A_X + 400, A_Z + 120], [A_X, A_Z + 60], [A_X - 600, A_Z]], par: 75, reward: 3500, alt: 40, rad: 40 },
];
SCHOOL[4] = { ...SCHOOL[4]!, hour: 23 } as RaceSrc;

export const JOB_MISSIONS: MissionDef[] = [
  taxiMission(),
  courierMission(),
  bountyMission('j_bounty1', 'Bounty: Dusty Ray', 'Dusty Ray skipped bail and is holed up near the Cinder Flats stash house with two friends.', 'stash', 2, 2500, 'pistol'),
  bountyMission('j_bounty2', 'Bounty: The Costa Brothers', 'Three brothers with a long list of warrants are playing cards behind Dead Man\'s Gap.', 'ramp', 3, 3500, 'smg'),
  repoMission(),
  vigilanteMission(),
  ...SCHOOL.map(raceMission),
];
