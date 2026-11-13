import { HEAT } from '../../combat/Wanted';
import { GOLD, type Gen, type MissionDef, type MissionRun } from '../Missions';
import type { SiteCfg } from '../Sites';
import type { Place } from '../types';
import type { CrewFx } from '../../crew/Crew';

export type Approach = 'loud' | 'quiet' | 'smart';
export const APPROACHES: Approach[] = ['loud', 'quiet', 'smart'];

export interface PrepDef { id: string; title: string; blurb: string; approach: Approach }

export interface HeistDef {
  id: string;
  name: string;
  blurb: string;
  door: Place;
  site: SiteCfg;
  caseValue: number;
  bagValue: number;
  guards: number;
  /** Hours of day for each approach. */
  hour: Record<Approach, number>;
  intro: string;
  done: string;
  approachText: Record<Approach, string>;
  /** Prep mission ids per approach. */
  prep: Record<Approach, string[]>;
  par: Record<Approach, number>;
  /** 'convoy' jobs happen out on the road instead of inside a building. */
  kind?: 'site' | 'convoy';
}

const SALT = { x: 4020, z: 1180 };

export const HEISTS: HeistDef[] = [
  {
    id: 'h1', name: 'The Gilded Counter', blurb: 'Calloway & Daughters, Marlowe Row. Crane\'s diamonds sit in the back vault behind two display cases and a very expensive alarm.',
    door: 'marlowe',
    site: { id: 'jewel', name: 'Calloway & Daughters', w: 18, d: 14, vault: { w: 7, d: 4.5 }, cases: 3, cameras: 2, at: { x: SALT.x - 160, z: SALT.z }, tint: 0xb88a2e },
    caseValue: 15000, bagValue: 25000, guards: 3,
    hour: { loud: 14, quiet: 22.5, smart: 10.5 },
    intro: 'h1_board', done: 'h1_done',
    approachText: {
      loud: 'Go in hard in daylight. Take the guards out, smash the cases and drill the vault before the police arrive.',
      quiet: 'Go in after closing. Stay out of the cameras, pick the locks and use the manager\'s keycard.',
      smart: 'Hack the alarm firm first. With the cameras off, a terminal opens the vault from the front desk.',
    },
    prep: { loud: ['h1_van'], quiet: ['h1_uniforms'], smart: ['h1_codes'] },
    par: { loud: 330, quiet: 420, smart: 360 },
  },
  {
    id: 'h2', name: 'Valeria Savings, Central Branch', blurb: 'Meridian\'s slush fund sits in a vault under the teller line, on a ninety-second time lock.',
    door: 'bank',
    site: { id: 'bank', name: 'Valeria Savings', w: 30, d: 22, vault: { w: 11, d: 6 }, cases: 4, cameras: 4, at: { x: SALT.x + 40, z: SALT.z }, tint: 0x2a7a5a },
    caseValue: 8000, bagValue: 90000, guards: 6,
    hour: { loud: 11, quiet: 23, smart: 9.5 },
    intro: 'h2_board', done: 'h2_done',
    approachText: {
      loud: 'Blow the vault door with charges and hold the lobby against everything the bank has.',
      quiet: 'Forge a staff pass, scout the guards and walk in as one of them.',
      smart: 'Hack the branch network, learn the rotations, and open the vault from the manager\'s terminal.',
    },
    prep: { loud: ['h2_charges', 'h2_armour'], quiet: ['h2_pass', 'h2_scout'], smart: ['h2_hack', 'h2_scout'] },
    par: { loud: 420, quiet: 540, smart: 480 },
  },
  {
    id: 'h3', name: 'The Long Haul', kind: 'convoy', blurb: 'An armored truck and two escort cars carry Crane\'s cash to Cinder Flats every week on the East Highway. Stop the truck, open the back, load four bags.',
    door: 'convoy.ambush',
    site: { id: 'convoy', name: 'The convoy', w: 10, d: 10, vault: { w: 4, d: 3 }, cases: 0, cameras: 0, at: { x: SALT.x, z: SALT.z }, tint: 0x9aa3b5 },
    caseValue: 0, bagValue: 65000, guards: 0,
    hour: { loud: 10, quiet: 14, smart: 11 },
    intro: 'h3_board', done: 'h3_done',
    approachText: {
      loud: 'Ram the truck off the road and fight the escorts. Blow the rear doors and be gone before the helicopters arrive.',
      quiet: 'Lay a spike strip across the highway. The truck rolls to a stop; two drowsy guards stay behind it.',
      smart: 'Clone the convoy\'s tracker and send it down a dead-end road with one guard instead of three.',
    },
    prep: { loud: ['h3_ram'], quiet: ['h3_spikes'], smart: ['h3_tracker'] },
    par: { loud: 330, quiet: 360, smart: 360 },
  },
  {
    id: 'h4', name: 'Lucky Seven', blurb: 'The Meridian slush fund washes through the vault under the Lucky Seven casino in Costa Merida: nine guards, six cameras, a very large door.',
    door: 'casino',
    site: { id: 'casino', name: 'Lucky Seven Casino', w: 34, d: 24, vault: { w: 12, d: 7 }, cases: 6, cameras: 6, at: { x: SALT.x + 160, z: SALT.z }, tint: 0xb02a4a },
    caseValue: 9000, bagValue: 140000, guards: 9,
    hour: { loud: 15, quiet: 4, smart: 21 },
    intro: 'h4_board', done: 'h4_done',
    approachText: {
      loud: 'Walk in with charges and take the floor. Count on a hard fight and a harder vault.',
      quiet: 'Go in as night staff, keep the high rollers calm, and let the cameras see nothing.',
      smart: 'Tap the casino network, loop the floor and let the vault open itself.',
    },
    prep: { loud: ['h4_charges'], quiet: ['h4_staff'], smart: ['h4_hack'] },
    par: { loud: 480, quiet: 600, smart: 540 },
  },
  {
    id: 'h5', name: 'Night Freight', blurb: 'A Meridian freight train waits on the Cinder siding at night with an armoured container in the sixth car. The cars are long, narrow and guarded.',
    door: 'rail.siding',
    site: { id: 'train', name: 'Meridian freight', w: 8, d: 54, vault: { w: 6, d: 7 }, cases: 6, cameras: 1, at: { x: SALT.x - 10, z: SALT.z + 150 }, tint: 0x8a6a3a },
    caseValue: 11000, bagValue: 85000, guards: 5,
    hour: { loud: 2, quiet: 3, smart: 1 },
    intro: 'h5_board', done: 'h5_done',
    approachText: {
      loud: 'Breach the cars and fight down the length of the train before the signal crew radios in.',
      quiet: 'Cut the signal wire, slip onto the train and work down the cars in the dark.',
      smart: 'Copy the manifest, learn which car holds what, and walk straight to it.',
    },
    prep: { loud: ['h5_breacher'], quiet: ['h5_signal'], smart: ['h5_manifest'] },
    par: { loud: 420, quiet: 540, smart: 480 },
  },
  {
    id: 'h6', name: 'Aurelia', blurb: 'Crane\'s private yacht at the Dusk Harbor moorings: ten guards, five cameras, a vault in the stern and every ledger he has not burned yet.',
    door: 'harbor',
    site: { id: 'yacht', name: 'The Aurelia', w: 14, d: 44, vault: { w: 8, d: 7 }, cases: 5, cameras: 5, at: { x: SALT.x + 330, z: SALT.z }, tint: 0x3a6a9a },
    caseValue: 12000, bagValue: 200000, guards: 10,
    hour: { loud: 22, quiet: 1, smart: 20 },
    intro: 'h6_board', done: 'h6_done',
    approachText: {
      loud: 'Come alongside in the dark with charges and an assault crew. Take the decks, blow the stern vault, and leave before the harbor police wake up.',
      quiet: 'Go aboard as extra stewards. Stay in the galley corridors, keep the guests calm and let the cameras see only staff.',
      smart: 'Patch into the yacht\'s satellite link, learn the watch pattern and open the vault from the bridge terminal.',
    },
    prep: { loud: ['h6_charges'], quiet: ['h6_stewards'], smart: ['h6_uplink'] },
    par: { loud: 540, quiet: 660, smart: 600 },
  },
  {
    id: 'h7', name: 'The Pinecrest Score', blurb: 'Pinecrest Savings & Loan holds the payroll for every logging camp on the mountain, and the county sheriff has two deputies and a coffee habit. The money goes out on Friday.',
    door: 'pine.bank',
    site: { id: 'pinebank', name: 'Pinecrest Savings & Loan', w: 24, d: 18, vault: { w: 9, d: 5 }, cases: 2, cameras: 3, at: { x: SALT.x - 330, z: SALT.z }, tint: 0x6a4a2a },
    caseValue: 10000, bagValue: 120000, guards: 7,
    hour: { loud: 10.5, quiet: 23.5, smart: 9 },
    intro: 'h7_board', done: 'h7_done',
    approachText: {
      loud: 'Walk in with rifles and armour, empty the vault and fight through the sheriff, the state troopers and whatever comes up the valley after them.',
      quiet: 'Go in after midnight as the bank\'s own inspectors. Keep to the back rooms and let the night guard log you in.',
      smart: 'Case the branch, learn when the drawer counts happen and walk in for the vault while the tellers count.',
    },
    prep: { loud: ['h7_truck'], quiet: ['h7_suits'], smart: ['h7_scout'] },
    par: { loud: 420, quiet: 540, smart: 480 },
  },
  {
    id: 'h8', name: 'Halloran Armory', blurb: 'Fort Halloran keeps seized cartel gold in a bunker under its armory, waiting for a court date that keeps moving. Twelve soldiers, a guard rotation and a base full of very large guns.',
    door: 'fort.gate',
    site: { id: 'armory', name: 'Halloran Armory', w: 30, d: 26, vault: { w: 12, d: 7 }, cases: 5, cameras: 5, at: { x: SALT.x + 160, z: SALT.z + 150 }, tint: 0x4a5a3a },
    caseValue: 20000, bagValue: 250000, guards: 12,
    hour: { loud: 13, quiet: 2, smart: 22 },
    intro: 'h8_board', done: 'h8_done',
    approachText: {
      loud: 'Burn through the bunker door with thermite and hold the armory while the base wakes up. Then run: the Fort has helicopters.',
      quiet: 'Go in as a relief squad in army fatigues, on foot, at two in the morning, and never let a camera see your face.',
      smart: 'Spoof the base radio from the Kestrel relay so the guard rotation sends half the squad to the wrong end of the base.',
    },
    prep: { loud: ['h8_thermite'], quiet: ['h8_fatigues'], smart: ['h8_relay'] },
    par: { loud: 540, quiet: 660, smart: 600 },
  },
];

export const HEIST_BY_ID = Object.fromEntries(HEISTS.map((h) => [h.id, h])) as Record<string, HeistDef>;

const off = (m: MissionRun, p: Place, dx = 0, dz = 0): { x: number; z: number } => { const w = m.at(p); return { x: w.x + dx, z: w.z + dz }; };

// ------------------------------------------------------------------------------------------------ prep missions

const prep = (id: string, title: string, blurb: string, stages: MissionDef['stages'], gold: MissionDef['gold'] = [GOLD.time(240)]): MissionDef => ({
  id, title, char: 'any', act: 2, blurb, start: 'home.mack', hidden: true, reward: 1200, stages, gold,
});

export const PREPS: PrepDef[] = [
  { id: 'h1_van', title: 'Heavy van', blurb: 'Steal a reinforced van from the Industrial Depot and bring it to the flat. Armour for the job.', approach: 'loud' },
  { id: 'h1_uniforms', title: 'Staff uniforms', blurb: 'Lift two sets of cleaning-staff uniforms from the laundry behind the Sun.', approach: 'quiet' },
  { id: 'h1_codes', title: 'Alarm codes', blurb: 'Break into the alarm company\'s office and copy its codes, without being seen.', approach: 'smart' },
  { id: 'h2_charges', title: 'Breaching charges', blurb: 'Collect shaped charges from a contractor at the Industrial Depot.', approach: 'loud' },
  { id: 'h2_armour', title: 'Body armour', blurb: 'Pick up heavy armour from the Brass & Barrel back door.', approach: 'loud' },
  { id: 'h2_pass', title: 'Forged staff pass', blurb: 'Copy a manager\'s card at the print shop beside the Sun.', approach: 'quiet' },
  { id: 'h2_scout', title: 'Case the branch', blurb: 'Visit three vantage points around the bank and learn the guard rotation.', approach: 'quiet' },
  { id: 'h2_hack', title: 'Network breach', blurb: 'Tap the bank\'s fibre line in a junction cabinet downtown.', approach: 'smart' },
  { id: 'h3_ram', title: 'Ram truck', blurb: 'Steal a heavy truck from the Industrial Depot and bring it to the flat.', approach: 'loud' },
  { id: 'h3_spikes', title: 'Spike strips', blurb: 'Collect road spikes from a contractor at the depot.', approach: 'quiet' },
  { id: 'h3_tracker', title: 'Clone the tracker', blurb: 'Copy the convoy tracker\'s signature at the Industrial Depot.', approach: 'smart' },
  { id: 'h4_charges', title: 'Vault charges', blurb: 'Collect heavy breaching charges at the depot.', approach: 'loud' },
  { id: 'h4_staff', title: 'Staff credentials', blurb: 'Borrow night-staff uniforms from the laundry behind the Sun.', approach: 'quiet' },
  { id: 'h4_hack', title: 'Casino network', blurb: 'Tap the casino\'s network from Costa Merida.', approach: 'smart' },
  { id: 'h5_breacher', title: 'Breaching gear', blurb: 'Pick up heavy breaching gear at Brass & Barrel.', approach: 'loud' },
  { id: 'h5_signal', title: 'Cut the signal wire', blurb: 'Cut the trackside signal wire at the Cinder siding.', approach: 'quiet' },
  { id: 'h5_manifest', title: 'Freight manifest', blurb: 'Copy the manifest from the depot office.', approach: 'smart' },
  { id: 'h6_charges', title: 'Hull charges', blurb: 'Collect heavy hull charges from the contractor at the Industrial Depot.', approach: 'loud' },
  { id: 'h6_stewards', title: 'Steward uniforms', blurb: 'Lift steward uniforms from the laundry behind the Valeria Sun.', approach: 'quiet' },
  { id: 'h6_uplink', title: 'Satellite uplink', blurb: 'Tap the yacht\'s satellite link at the Dusk Harbor marina.', approach: 'smart' },
  { id: 'h7_truck', title: 'Getaway van', blurb: 'Steal a heavy Courier van from Dusk Harbor and bring it to the flat.', approach: 'loud' },
  { id: 'h7_suits', title: 'Inspector suits', blurb: 'Pick up three tailored suits from a tailor on Pinecrest Main Street.', approach: 'quiet' },
  { id: 'h7_scout', title: 'Case the branch', blurb: 'Watch the Pinecrest branch from three spots and learn when the drawers are counted.', approach: 'smart' },
  { id: 'h8_thermite', title: 'Thermite', blurb: 'Collect thermite charges from the contractor at the Industrial Depot.', approach: 'loud' },
  { id: 'h8_fatigues', title: 'Army fatigues', blurb: 'Buy a crate of fatigues off the back of Cinder Surplus.', approach: 'quiet' },
  { id: 'h8_relay', title: 'Kestrel relay', blurb: 'Clear the guards off the radio relay on Mount Kestrel and plant a spoofer.', approach: 'smart' },
];

export const HEIST_PREPS: MissionDef[] = [
  prep('h7_truck', 'Getaway van', 'Steal a Courier van and bring it home.', [
    function* (m): Gen {
      const h = m.at('harbor');
      const van = m.vehicle('van', 'courier', { x: h.x + 14, z: h.z + 10 }, { color: '#2a2d32' });
      m.failIf('van', () => van.exploded, 'The van was destroyed.');
      yield* m.enter('van', 'Steal the Courier van at Dusk Harbor');
      yield* m.goto('home.mack', 'Drive the van to the Boardwalk Studio', { vehicle: 'van', r: 20 });
    },
  ], [GOLD.time(300), GOLD.clean()]),
  prep('h7_suits', 'Inspector suits', 'Pick up the suits.', [
    function* (m): Gen {
      yield* m.goto('pine.tailor', 'Go to the tailor on Pinecrest Main Street', { onFoot: true, r: 4 });
      yield* m.hold(off(m, 'pine.tailor', 2, 2), 'Collect the suits', 4);
      m.say('mack', 'Three suits, one tie each. Teddy will lose his by lunch.');
    },
  ], [GOLD.time(400), GOLD.clean()]),
  prep('h7_scout', 'Case the branch', 'Learn when the drawers are counted.', [
    function* (m): Gen {
      const b = m.at('pine.bank');
      const spots: { x: number; z: number }[] = [{ x: b.x + 20, z: b.z + 12 }, { x: b.x - 18, z: b.z + 10 }, { x: b.x + 6, z: b.z - 22 }];
      for (let i = 0; i < spots.length; i++) {
        yield* m.goto(spots[i]!, `Vantage point ${i + 1} of 3`, { onFoot: true, r: 4, key: 'v' + i });
        yield* m.hold(spots[i]!, 'Watch the branch', 3, { key: 'w' + i, glyph: '◉' });
      }
      m.say('imani', 'Drawer count at nine sharp. The vault stays open for the whole count.');
    },
  ], [GOLD.time(400), GOLD.clean()]),
  prep('h8_thermite', 'Thermite', 'Collect thermite charges.', [
    function* (m): Gen {
      const d = m.at('depot');
      yield* m.goto({ x: d.x - 18, z: d.z + 14 }, 'Meet the contractor at the Industrial Depot', { r: 6 });
      yield* m.hold({ x: d.x - 18, z: d.z + 14 }, 'Load the thermite', 4);
      m.say('teddy', 'Thermite. You light it, it burns through anything. Including Teddy, so do not drop it.');
    },
  ]),
  prep('h8_fatigues', 'Army fatigues', 'Buy fatigues off the back of a surplus store.', [
    function* (m): Gen {
      yield* m.goto('surplus', 'Go round the back of Cinder Surplus', { onFoot: true, r: 5 });
      yield* m.hold(off(m, 'surplus', -4, 6), 'Take the crate of fatigues', 4);
    },
  ], [GOLD.time(400), GOLD.clean()]),
  prep('h8_relay', 'Kestrel relay', 'Plant a radio spoofer on the mountain relay.', [
    function* (m): Gen {
      const r = m.at('kestrel.relay');
      yield* m.goto('kestrel.relay', 'Drive up to the radio relay on Mount Kestrel', { r: 30 });
      yield* m.kill('relay', [[8, 4], [-6, 10], [12, -8], [-10, -6]].map(([dx, dz]) => ({ ...m.s.snap(r.x + dx!, r.z + dz!), kind: 'smg' as const, look: 'soldier', hp: 80 })), 'Clear the soldiers guarding the relay');
      yield* m.hold(r, 'Plant the spoofer on the mast', 8);
      m.say('imani', 'Spoofer is live. When we go in, half the base will be chasing a ghost.');
    },
  ], [GOLD.time(360), GOLD.flawless(50)]),
  prep('h1_van', 'Heavy van', 'Steal a reinforced van and bring it home.', [
    function* (m): Gen {
      const d = m.at('depot');
      const van = m.vehicle('van', 'ridgeback', { x: d.x + 8, z: d.z + 6 }, { color: '#34383f' });
      m.failIf('van', () => van.exploded, 'The van was destroyed.');
      yield* m.enter('van', 'Steal the heavy van at the Industrial Depot');
      yield* m.goto('home.mack', 'Drive the van to the Boardwalk Studio', { vehicle: 'van', r: 20 });
    },
  ], [GOLD.time(240), GOLD.clean()]),
  prep('h1_uniforms', 'Staff uniforms', 'Lift two sets of uniforms.', [
    function* (m): Gen {
      yield* m.goto('newsroom', 'Go to the laundry behind the Valeria Sun', { onFoot: true, r: 4 });
      yield* m.hold(off(m, 'newsroom', 3, 2), 'Take the uniforms from the rack', 5);
      m.say('mack', 'Two sets. One is a little too small for Teddy.');
    },
  ], [GOLD.time(150), GOLD.clean()]),
  prep('h1_codes', 'Alarm codes', 'Copy the alarm company\'s codes.', [
    function* (m): Gen {
      const b = m.at('bank');
      yield* m.goto({ x: b.x + 40, z: b.z - 20 }, 'Reach the alarm company\'s office', { onFoot: true, r: 5 });
      const spots: [number, number][] = [[b.x + 40, b.z - 6], [b.x + 52, b.z - 34]];
      const pats: [number, number][][] = [[[b.x + 40, b.z - 6], [b.x + 52, b.z - 6]], [[b.x + 52, b.z - 34], [b.x + 40, b.z - 34]]];
      spots.forEach((sp, i) => { const w = m.s.snap(sp[0], sp[1]); m.s.hostiles.spawn({ x: w.x, z: w.z, kind: 'pistol', unaware: true, patrol: pats[i]!, tag: 'sec', look: 'guard' }); });
      m.tip('Two guards patrol the yard. Stay out of sight: crouch with C.', 8);
      yield* m.hold({ x: b.x + 40, z: b.z - 24 }, 'Copy the alarm codes from the server', 8);
      m.s.hostiles.clear('sec');
    },
  ], [GOLD.time(240), GOLD.stealth()]),
  prep('h2_charges', 'Breaching charges', 'Collect shaped charges.', [
    function* (m): Gen {
      const d = m.at('depot');
      yield* m.goto({ x: d.x - 20, z: d.z + 12 }, 'Meet the contractor at the Industrial Depot', { r: 6 });
      yield* m.hold({ x: d.x - 20, z: d.z + 12 }, 'Collect the charges', 4);
    },
  ]),
  prep('h2_armour', 'Body armour', 'Pick up heavy armour.', [
    function* (m): Gen {
      yield* m.goto('motors', 'Go to the back door of Brass & Barrel', { onFoot: true, r: 4 });
      yield* m.hold(off(m, 'motors', 4, 3), 'Take the armour crate', 3);
    },
  ]),
  prep('h2_pass', 'Forged staff pass', 'Copy a manager\'s card.', [
    function* (m): Gen {
      yield* m.goto('newsroom', 'Go to the print shop beside the Sun', { onFoot: true, r: 4 });
      yield* m.hold(off(m, 'newsroom', 6, -3), 'Run the card through the copier', 6);
    },
  ], [GOLD.time(150), GOLD.clean()]),
  prep('h2_scout', 'Case the branch', 'Learn the guard rotation.', [
    function* (m): Gen {
      const b = m.at('bank');
      const spots: { x: number; z: number }[] = [{ x: b.x + 18, z: b.z + 14 }, { x: b.x - 22, z: b.z + 8 }, { x: b.x - 4, z: b.z - 24 }];
      for (let i = 0; i < spots.length; i++) {
        yield* m.goto(spots[i]!, `Vantage point ${i + 1} of 3`, { onFoot: true, r: 4, key: 'v' + i });
        yield* m.hold(spots[i]!, 'Watch the guards', 3, { key: 'w' + i, glyph: '◉' });
      }
    },
  ]),
  prep('h2_hack', 'Network breach', 'Tap the fibre line.', [
    function* (m): Gen {
      const b = m.at('bank');
      yield* m.goto({ x: b.x + 12, z: b.z + 22 }, 'Find the fibre junction cabinet downtown', { onFoot: true, r: 5 });
      yield* m.hold({ x: b.x + 12, z: b.z + 22 }, 'Tap the line', 8);
    },
  ], [GOLD.time(180), GOLD.clean()]),
  prep('h3_ram', 'Ram truck', 'Steal a heavy truck.', [
    function* (m): Gen {
      const d = m.at('depot');
      const van = m.vehicle('ram', 'ridgeback', { x: d.x - 10, z: d.z + 14 }, { color: '#4a4f58' });
      m.failIf('v', () => van.exploded, 'The truck was destroyed.');
      yield* m.enter('ram', 'Steal the heavy truck at the Industrial Depot');
      yield* m.goto('home.mack', 'Drive the truck to the Boardwalk Studio', { vehicle: 'ram', r: 20 });
    },
  ], [GOLD.time(240), GOLD.clean()]),
  prep('h3_spikes', 'Spike strips', 'Collect spike strips.', [
    function* (m): Gen {
      const d = m.at('depot');
      yield* m.goto({ x: d.x + 24, z: d.z + 10 }, 'Meet the contractor at the Industrial Depot', { r: 6 });
      yield* m.hold({ x: d.x + 24, z: d.z + 10 }, 'Collect the spike strips', 4);
    },
  ]),
  prep('h3_tracker', 'Clone the tracker', 'Copy the tracker signature.', [
    function* (m): Gen {
      const d = m.at('depot');
      yield* m.goto({ x: d.x - 26, z: d.z - 8 }, 'Reach the depot office', { onFoot: true, r: 5 });
      yield* m.hold({ x: d.x - 26, z: d.z - 8 }, 'Clone the convoy tracker', 8);
    },
  ], [GOLD.time(180), GOLD.clean()]),
  prep('h4_charges', 'Vault charges', 'Collect charges.', [
    function* (m): Gen {
      const d = m.at('depot');
      yield* m.goto({ x: d.x - 20, z: d.z + 12 }, 'Meet the contractor at the Industrial Depot', { r: 6 });
      yield* m.hold({ x: d.x - 20, z: d.z + 12 }, 'Collect the heavy charges', 5);
    },
  ]),
  prep('h4_staff', 'Staff credentials', 'Borrow uniforms.', [
    function* (m): Gen {
      yield* m.goto('newsroom', 'Go to the laundry behind the Valeria Sun', { onFoot: true, r: 4 });
      yield* m.hold(off(m, 'newsroom', 4, 3), 'Take the night-staff uniforms', 5);
    },
  ], [GOLD.time(150), GOLD.clean()]),
  prep('h4_hack', 'Casino network', 'Tap the network.', [
    function* (m): Gen {
      const c = m.at('casino');
      yield* m.goto({ x: c.x + 30, z: c.z + 14 }, 'Travel to Costa Merida and find the network cabinet', { onFoot: true, r: 5 });
      yield* m.hold({ x: c.x + 30, z: c.z + 14 }, 'Tap the casino network', 8);
    },
  ], [GOLD.time(420), GOLD.clean()]),
  prep('h5_breacher', 'Breaching gear', 'Pick up gear.', [
    function* (m): Gen {
      yield* m.goto('motors', 'Go to the back door of Brass & Barrel', { onFoot: true, r: 4 });
      yield* m.hold(off(m, 'motors', 4, 3), 'Take the breaching crate', 4);
    },
  ]),
  prep('h5_signal', 'Cut the signal wire', 'Cut the wire.', [
    function* (m): Gen {
      const r = m.at('rail.siding');
      yield* m.goto({ x: r.x + 14, z: r.z + 10 }, 'Reach the Cinder siding', { onFoot: true, r: 5 });
      yield* m.hold({ x: r.x + 14, z: r.z + 10 }, 'Cut the trackside signal wire', 6);
    },
  ], [GOLD.time(400), GOLD.clean()]),
  prep('h6_charges', 'Hull charges', 'Collect heavy hull charges.', [
    function* (m): Gen {
      const d = m.at('depot');
      yield* m.goto({ x: d.x - 24, z: d.z + 14 }, 'Meet the contractor at the Industrial Depot', { r: 6 });
      yield* m.hold({ x: d.x - 24, z: d.z + 14 }, 'Collect the hull charges', 5);
    },
  ]),
  prep('h6_stewards', 'Steward uniforms', 'Lift two sets of steward uniforms.', [
    function* (m): Gen {
      yield* m.goto('newsroom', 'Go to the laundry behind the Valeria Sun', { onFoot: true, r: 4 });
      yield* m.hold(off(m, 'newsroom', -3, 4), 'Take the steward uniforms', 6);
    },
  ], [GOLD.time(150), GOLD.clean()]),
  prep('h6_uplink', 'Satellite uplink', 'Tap the yacht\'s satellite link.', [
    function* (m): Gen {
      const h = m.at('harbor');
      yield* m.goto({ x: h.x - 30, z: h.z - 14 }, 'Reach the marina junction box', { onFoot: true, r: 5 });
      yield* m.hold({ x: h.x - 30, z: h.z - 14 }, 'Tap the satellite link', 9);
    },
  ], [GOLD.time(240), GOLD.stealth()]),
  prep('h5_manifest', 'Freight manifest', 'Copy the manifest.', [
    function* (m): Gen {
      const d = m.at('depot');
      yield* m.goto({ x: d.x - 30, z: d.z - 14 }, 'Reach the depot office', { onFoot: true, r: 5 });
      yield* m.hold({ x: d.x - 30, z: d.z - 14 }, 'Copy the freight manifest', 6);
    },
  ], [GOLD.time(180), GOLD.clean()]),
];


// ------------------------------------------------------------------------------------------------ the heist itself

export interface ExecOpts { approach: Approach; crew: string[]; prepDone: string[]; fx: CrewFx }

/** Build the mission for one heist run with the chosen approach, crew and finished prep. */
export function execMission(h: HeistDef, o: ExecOpts): MissionDef {
  if (h.kind === 'convoy') return convoyMission(h, o);
  const { approach, crew } = o;
  const has = (p: string): boolean => o.prepDone.includes(p);
  const fx = o.fx;
  const ctx = { alarm: false, pending: 0, take: 0, bags: 0, cases: 0, policeT: 0, spotted: 0, downed: new Set<string>() };
  const total = h.site.cases * h.caseValue + 3 * h.bagValue;
  const smartPrep = h.prep.smart.some(has);
  const camScale = (smartPrep ? 0 : 1) * fx.camScale;
  const vaultScale = fx.vaultScale * (approach === 'loud' && h.prep.loud.some(has) ? 0.6 : 1);
  const lockScale = fx.lockScale;
  const seeScale = h.prep.quiet.some(has) ? 0.6 : 1;
  const starsOff = fx.starsOff;

  return {
    id: `${h.id}_${approach}`, title: `${h.name}`, char: 'any', act: 2, giver: 'pruitt', start: 'home.mack', hidden: true,
    hour: h.hour[approach], reward: 0, noReward: true,
    blurb: h.blurb,
    gold: [
      GOLD.time(h.par[approach]),
      approach === 'loud' ? GOLD.flawless(70) : GOLD.stealth(),
      { id: 'all', label: 'Take everything', test: (s) => (s.extra.take ?? 0) >= total },
    ],
    stages: [
      function* (m): Gen { yield* m.cutscene(h.intro); },
      // ---- travel ---------------------------------------------------------------------------------------------
      function* (m): Gen {
        const door = m.at(h.door);
        const spot = m.s.snap(door.x + 12, door.z + 10, 3.2);
        m.vehicle('getaway', 'veloce', spot, { color: '#1a1d24' });
        yield* m.enter('getaway', 'Take the getaway car');
        if (approach === 'loud' && (has('h1_van') || has('h2_armour'))) { m.g.combat!.vitals.addArmour(100); m.give('smg', 160); }
        m.give('vc9', 40);
        yield* m.goto(h.door, `Drive to ${h.site.name}`, { vehicle: 'getaway', r: 14, key: 'job' });
        yield* m.goto(h.door, `Go inside ${h.site.name}`, { onFoot: true, r: 2.8, key: 'door' });
      },
      // ---- inside ---------------------------------------------------------------------------------------------
      function* (m): Gen {
        const H = m.s.heists;
        const site = H.enter(h.site);
        m.onCleanup(() => H.dispose());
        while (H.transitioning) yield;
        const s = m.s;
        s.hostiles.stealthScale = seeScale;
        for (const c of site.cams) c.range = 15 * (camScale > 0 ? 1 : 0.0001);
        ctx.alarm = false; ctx.pending = 0; ctx.take = 0; ctx.bags = 0; ctx.cases = 0; ctx.policeT = 0;
        m.stats.extra.take = 0;
        const hw = h.site.w / 2, hd = h.site.d / 2, vd = h.site.vault.d;
        const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
        const guardSpots: [number, number][] = [];
        for (let i = 0; i < h.guards; i++) guardSpots.push([rnd(-hw + 4, hw - 4), rnd(-hd + 5, hd - vd - 3)]);
        const raise = (why: string): void => {
          if (ctx.alarm) return;
          ctx.alarm = true;
          ctx.pending = approach === 'loud' ? 3 : 2;
          ctx.policeT = (approach === 'loud' ? 150 : 110) + (starsOff ? 25 : 0);
          s.hostiles.alertAll('guards');
          s.hud.showBanner('Alarm', why, 'The police are on their way', 'bad', 3);
        };
        m.each(() => {
          const p = m.g.player!.pos;
          const seen = site.updateCams(m.dt, p.x, p.y + 1.2, p.z, m.g.player!.crouchBlend > 0.5) * (camScale > 0 ? 1 : 0);
          if (seen >= 1) raise('Spotted by a camera');
          if (m.stats.alerts > 0) raise('A guard raised the alarm');
          if (ctx.alarm) {
            ctx.policeT -= m.dt;
            s.hud.setTimer('Police arrive', ctx.policeT, ctx.policeT < 30);
            if (ctx.policeT <= 0) { ctx.pending = Math.max(ctx.pending, 4); s.hud.setTimer(null); }
          }
        });
        // crew gunmen come in with you
        const A = s.allies;
        A.clear();
        A.mode = approach === 'loud' ? 'follow' : 'hold';
        A.onDowned = (def) => { ctx.downed.add(def.id); s.hud.showTip(`${def.name} is down!`, 4); };
        fx.gunmen.forEach((def, i) => { const pt = site.at(site.spots.door[0] + (i - (fx.gunmen.length - 1) / 2) * 1.6, site.spots.door[1] + 2.2); A.spawn(def, pt.x, pt.z); });
        m.onCleanup(() => A.clear());
        if (A.active) s.hud.showTip(`Crew gunmen with you: press ${s.g.input.activeDevice === 'gamepad' ? 'D-pad →' : 'B'} to give orders`, 7);
        if (approach === 'loud') {
          raise('Armed robbery');
          m.say('guard', 'Everybody down! Hit the alarm!');
          yield* m.kill('guards', guardSpots.map(([x, z]) => ({ ...site.at(x, z), kind: 'smg' as const, hold: false, look: 'guard' })), 'Take down the guards');
        } else {
          for (const [x, z] of guardSpots) {
            const a = site.at(x, z), b = site.at(rnd(-hw + 4, hw - 4), rnd(-hd + 5, hd - vd - 3));
            s.hostiles.spawn({ x: a.x, z: a.z, kind: 'pistol', unaware: true, patrol: [[a.x, a.z], [b.x, b.z]], tag: 'guards', look: 'guard' });
          }
          m.tip(camScale > 0 ? 'Guards patrol the floor and the cameras sweep it. Crouch (C) to stay hidden.' : 'The cameras are looped. Just keep away from the guards. Crouch (C) helps.', 9);
        }
        // display cases
        for (let i = 0; i < site.cases.length; i++) {
          const c = site.cases[i]!;
          yield* m.hold({ x: c.x, z: c.z }, approach === 'loud' ? 'Smash the display case' : 'Pick the display case lock', (approach === 'loud' ? 2.2 : 3.8) * lockScale, { key: 'case', glyph: '◆' });
          site.takeCase(i);
          ctx.take += h.caseValue; ctx.cases++;
          m.stats.extra.take = ctx.take;
          if (approach === 'loud') raise('Glass breaking');
          s.hud.showTip(`Case emptied · $${ctx.take.toLocaleString('en-US')} so far`, 3);
        }
        // the vault
        const sv = site.spots.vault, vv = site.at(sv[0], sv[1]);
        if (approach === 'loud') {
          yield* m.hold(vv, 'Drill the vault door', 26 * vaultScale, { key: 'vault' });
        } else if (approach === 'quiet') {
          const o = site.spots.office, oo = site.at(o[0], o[1]);
          yield* m.hold(oo, 'Take the manager\'s keycard', 4 * lockScale, { key: 'card' });
          yield* m.hold(vv, 'Swipe the keycard at the vault', 3 * vaultScale * lockScale, { key: 'vault' });
        } else {
          const pn = site.spots.panel, pp = site.at(pn[0], pn[1]);
          yield* m.hold(pp, 'Hack the security terminal', 7 * vaultScale, { key: 'term', glyph: '▣' });
          for (const c of site.cams) c.off = true;
        }
        site.openVault();
        m.say(approach === 'loud' ? 'mack' : 'imani', 'Vault is open. Bags. Quickly.');
        for (let i = 0; i < site.spots.bags.length; i++) {
          const b = site.spots.bags[i]!, bp = site.at(b[0], b[1]);
          yield* m.hold(bp, 'Grab the cash bag', 1.6, { key: 'bag', glyph: '$' });
          ctx.take += h.bagValue; ctx.bags++;
          m.stats.extra.take = ctx.take;
          m.stats.extra.bags = ctx.bags;
          s.hud.showTip(`Bag secured · $${ctx.take.toLocaleString('en-US')} so far`, 3);
        }
      },
      // ---- out -----------------------------------------------------------------------------------------------
      function* (m): Gen {
        const H = m.s.heists;
        const site = H.site;
        if (site) {
          const d = site.spots.door;
          m.each(() => {
            if (ctx.alarm) {
              ctx.policeT -= m.dt;
              m.s.hud.setTimer('Police arrive', ctx.policeT, ctx.policeT < 30);
              if (ctx.policeT <= 0) ctx.pending = Math.max(ctx.pending, 4);
            }
          });
          yield* m.goto(site.at(d[0], d[1]), 'Get out with the money', { onFoot: true, r: 2.2, key: 'exit' });
        }
        H.leave();
        while (H.transitioning) yield;
        m.s.hud.setTimer(null);
        m.s.hostiles.clear();
        m.s.hostiles.stealthScale = 1;
        const stars = Math.max(0, Math.min(5, ctx.pending - starsOff));
        const p = m.playerPos();
        if (stars > 0) m.g.wanted?.report(HEAT[stars]! + 2, p.x, p.z, true);
        m.say('pruitt', stars > 0 ? 'You are out. Police on the street, so move!' : 'You are out, and nobody noticed. Very tidy.');
      },
      function* (m): Gen {
        if ((m.g.wanted?.stars ?? 0) > 0) yield* m.escape(0, 'Lose the police');
        const getaway = m.hasVeh('getaway') ? m.veh('getaway') : null;
        if (getaway && !m.playerIn('getaway')) yield* m.enter('getaway', 'Get back into the getaway car');
        yield* m.goto('home.mack', 'Take the money to the Boardwalk Studio', { r: 25 });
        // the split: crew cuts, anyone who is skimming, then what happened to them
        const cuts = fx.cuts + m.s.crew.skim(crew);
        const perf = ctx.alarm ? 0.9 : 1.1;
        const gross = ctx.take;
        const net = Math.round(gross * perf * (1 - cuts));
        m.stats.extra.payout = net;
        m.stats.extra.gross = gross;
        m.stats.extra.cuts = Math.round(gross * perf * cuts);
        const notes = m.s.crew.settle(crew, { approach, alarm: ctx.alarm, success: true, downed: ctx.downed });
        m.s.heists.lastResult = { gross, perf, cuts: Math.round(gross * perf * cuts), net, alarm: ctx.alarm, notes };
        m.s.heists.finishJob(h, approach, net);
        m.s.allies.clear();
        yield* m.cutscene(h.done);
      },
    ],
  };
}

export const HEIST_MISSIONS: MissionDef[] = [...HEIST_PREPS];


// ------------------------------------------------------------------------------------------------ the convoy job

function convoyMission(h: HeistDef, o: ExecOpts): MissionDef {
  const { approach, crew, fx } = o;
  const has = (p: string): boolean => o.prepDone.includes(p);
  const ctx = { take: 0, alarm: false, pending: 0, downed: new Set<string>() };
  const total = 4 * h.bagValue;
  const vaultScale = fx.vaultScale * (approach === 'loud' && has('h3_ram') ? 0.7 : 1);
  const lockScale = fx.lockScale;
  const dxz = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

  return {
    id: `${h.id}_${approach}`, title: h.name, char: 'any', act: 3, giver: 'pruitt', start: 'home.mack', hidden: true,
    hour: h.hour[approach], reward: 0, noReward: true, blurb: h.blurb,
    gold: [
      GOLD.time(h.par[approach]),
      approach === 'loud' ? GOLD.flawless(70) : GOLD.stealth(),
      { id: 'all', label: 'Take every bag', test: (s) => (s.extra.take ?? 0) >= total },
    ],
    stages: [
      function* (m): Gen { yield* m.cutscene(h.intro); },
      function* (m): Gen {
        const a = m.at('convoy.ambush');
        const spot = m.s.snap(a.x + 16, a.z + 12, 3.2);
        m.vehicle('getaway', 'veloce', spot, { color: '#1a1d24' });
        yield* m.enter('getaway', 'Take the getaway car');
        if (approach === 'loud' && has('h3_ram')) { m.g.combat!.vitals.addArmour(100); m.give('smg', 160); }
        m.give('vc9', 40);
        yield* m.goto('convoy.ambush', 'Drive to the ambush point on the East Highway', { vehicle: 'getaway', r: 22, key: 'job' });
      },
      function* (m): Gen {
        const s = m.s;
        const A = m.at('convoy.ambush');
        const start = m.at('convoy.start');
        const truck = m.vehicle('truck', 'ridgeback', start, { color: '#d9dde2', blip: false });
        m.vehicle('esc1', 'pico', { x: start.x - 14, z: start.z }, { color: '#14161a', blip: false });
        m.vehicle('esc2', 'pico', { x: start.x - 30, z: start.z }, { color: '#14161a', blip: false });
        m.failIf('burn', () => truck.exploded, 'The truck burned with the money in it.');
        const dr = m.drive('truck', () => m.at('cinder'), { kmh: 58, arrive: 30 });
        m.drive('esc1', () => ({ x: truck.position.x, z: truck.position.z }), { kmh: 66 });
        m.drive('esc2', () => ({ x: truck.position.x, z: truck.position.z }), { kmh: 66 });
        // crew gunmen
        const AL = s.allies;
        AL.clear();
        AL.mode = approach === 'loud' ? 'follow' : 'hold';
        AL.onDowned = (def) => { ctx.downed.add(def.id); s.hud.showTip(`${def.name} is down!`, 4); };
        const p0 = m.playerPos();
        fx.gunmen.forEach((def, i) => { const w = s.snap(p0.x + 3 + i * 1.8, p0.z + 3, 1); AL.spawn(def, w.x, w.z); });
        m.onCleanup(() => AL.clear());
        s.hostiles.stealthScale = 1;
        m.say('pruitt', 'The convoy is rolling. Truck first, two escort cars behind it.');
        const stopConvoy = (): void => { s.drivers.stop(truck); s.drivers.stop(m.veh('esc1')); s.drivers.stop(m.veh('esc2')); };
        const tp = (): { x: number; z: number } => ({ x: truck.position.x, z: truck.position.z });
        const watchAlarm = (why: string): void => m.each(() => {
          if (m.stats.alerts > 0 && !ctx.alarm) { ctx.alarm = true; ctx.pending = 2; s.hostiles.alertAll('guards'); s.hud.showBanner('Alarm', why, 'Police on the way', 'bad', 3); }
        });
        if (approach === 'loud') {
          m.objective('Stop the armored truck', 'Ram it or shoot it until it stops');
          while (truck.health > 520 && !dr.arrived) yield;
          stopConvoy();
          ctx.alarm = true; ctx.pending = 3;
          const t = tp();
          yield* m.kill('esc', [0, 1, 2, 3].map((i) => ({ x: t.x + Math.cos(i * 1.6) * 12, z: t.z + Math.sin(i * 1.6) * 12, kind: 'smg' as const, look: 'guard' })), 'Take down the escorts');
        } else if (approach === 'quiet') {
          yield* m.hold(A, 'Lay the spike strip across the highway', 5 * lockScale, { key: 'spikes', glyph: '▲' });
          m.objective('Wait for the convoy to roll over the strip', 'Stay out of the road');
          m.say('imani', 'I have eyes on them. Thirty seconds.');
          while (dxz(tp(), A) > 15 && !dr.arrived) yield;
          truck.health = 480;
          stopConvoy();
          const t = tp();
          for (let i = 0; i < 2; i++) s.hostiles.spawn({ x: t.x + (i ? 6 : -6), z: t.z + 3, kind: 'pistol', unaware: true, tag: 'guards', look: 'guard' });
          watchAlarm('The convoy raised the alarm');
        } else {
          const q = m.at('convoy.quiet');
          yield* m.hold({ x: A.x + 8, z: A.z - 4 }, 'Spoof the convoy tracker', 6 * vaultScale, { key: 'track', glyph: '▣' });
          s.drivers.stop(truck);
          const dq = m.drive('truck', () => q, { kmh: 50, arrive: 14 });
          m.objective('The convoy is following the false route', 'Meet it at the dead-end road');
          m.route(q);
          while (!dq.arrived) yield;
          stopConvoy();
          const t = tp();
          s.hostiles.spawn({ x: t.x + 5, z: t.z + 3, kind: 'pistol', unaware: true, tag: 'guards', look: 'guard' });
          watchAlarm('The driver radioed it in');
        }
      },
      function* (m): Gen {
        const truck = m.veh('truck');
        // the rear of the truck: forward is (0,0,-1) rotated by its quaternion
        const rear = (): { x: number; z: number } => {
          const q = truck.quaternion;
          const fx2 = -2 * (q.x * q.z + q.w * q.y), fz2 = -(1 - 2 * (q.x * q.x + q.y * q.y));
          return { x: truck.position.x - fx2 * 3.6, z: truck.position.z - fz2 * 3.6 };
        };
        const loud = approach === 'loud';
        yield* m.hold(rear(), loud ? 'Blow the rear doors' : 'Cut the rear door locks', loud ? 8 * vaultScale : 11 * lockScale * vaultScale, { key: 'rear', glyph: '✹' });
        m.say(loud ? 'teddy' : 'mack', 'Doors are open. Four bags.');
        for (let i = 0; i < 4; i++) {
          yield* m.hold(rear(), 'Load a cash bag into the car', 1.8, { key: 'bag', glyph: '$' });
          ctx.take += h.bagValue;
          m.stats.extra.take = ctx.take;
          m.s.hud.showTip(`Bag loaded · $${ctx.take.toLocaleString('en-US')}`, 3);
        }
        m.s.hostiles.clear();
      },
      function* (m): Gen {
        const stars = Math.max(0, Math.min(5, ctx.pending - fx.starsOff));
        const p = m.playerPos();
        if (stars > 0) m.g.wanted?.report(HEAT[stars]! + 2, p.x, p.z, true);
        m.say('pruitt', stars > 0 ? 'The police found the truck. Get out of there!' : 'Nobody saw a thing. Bring it home.');
        if ((m.g.wanted?.stars ?? 0) > 0) yield* m.escape(0, 'Lose the police');
        if (!m.playerIn('getaway') && m.hasVeh('getaway')) yield* m.enter('getaway', 'Get back into the getaway car');
        yield* m.goto('home.mack', 'Take the money to the Boardwalk Studio', { r: 25 });
        const cuts = fx.cuts + m.s.crew.skim(crew);
        const perf = ctx.alarm ? 0.9 : 1.1;
        const net = Math.round(ctx.take * perf * (1 - cuts));
        m.stats.extra.payout = net;
        m.stats.extra.gross = ctx.take;
        m.stats.extra.cuts = Math.round(ctx.take * perf * cuts);
        const notes = m.s.crew.settle(crew, { approach, alarm: ctx.alarm, success: true, downed: ctx.downed });
        m.s.heists.lastResult = { gross: ctx.take, perf, cuts: Math.round(ctx.take * perf * cuts), net, alarm: ctx.alarm, notes };
        m.s.heists.finishJob(h, approach, net);
        m.s.allies.clear();
        yield* m.cutscene(h.done);
      },
    ],
  };
}
