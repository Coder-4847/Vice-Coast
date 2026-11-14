import { GOLD, type Gen, type MissionDef, type MissionRun } from '../Missions';
import { row, type Page } from '../../ui/Modal';
import { chasers, dist, gm, heistDone, send, squad, TF, type Gun } from './act2';
import { HEAT } from '../../combat/Wanted';
import { rollCredits } from '../../ui/Credits';
import { money } from '../../economy/Economy';

const ENDINGS = [
  { name: 'Clean Slate', tag: 'Mack walked into the courthouse with the ledgers and did not walk out. Carmen and Lola sat in the third row every day of the trial.' },
  { name: 'Clear Skies', tag: 'Imani took the money and the airstrip and never filed another flight plan. Somewhere over the Pacific, the radio is always off.' },
  { name: 'Big Finish', tag: 'Teddy flew farther than anyone ever has, on forty million screens. Dex still has the footage. Nobody has let him jump again.' },
  { name: 'All In', tag: 'They finished it together. Crane went to trial, Brandt went down on the tarmac, and three people who did not trust each other bought a bar.' },
];

/** The roll at the very end: the ending, the player's numbers and how many endings they have seen. */
function* credits(m: MissionRun, e: number): Gen {
  const s = m.s, st = s.st;
  st.flags[`ending${e}`] = true;
  const seen = [1, 2, 3, 4].filter((n) => st.flags[`ending${n}`]).length;
  const recs = Object.values(st.missions);
  const done = recs.filter((r) => r.done).length;
  const medals = recs.reduce((a, r) => a + (r.medals?.length ?? 0), 0);
  const heists = Object.values(st.heists).filter((h) => h.done).length;
  const ps = s.g.commerce!.eco.p.stats;
  const hrs = Math.floor(ps.playSeconds / 3600), mins = Math.floor((ps.playSeconds % 3600) / 60);
  const end = ENDINGS[e - 1]!;
  const g = s.g;
  if (g.player) g.player.frozen = true;
  let finished = false;
  void rollCredits({
    ending: end.name, tagline: end.tag, endingsSeen: seen, endingsTotal: 4,
    stats: [['Missions completed', String(done)], ['Gold medals', String(medals)], ['Heists pulled', String(heists)], ['Money earned', money(ps.earned)], ['People taken down', String(ps.kills)], ['Time on the coast', `${hrs} h ${mins} min`]],
  }).then(() => { finished = true; });
  m.onCleanup(() => { if (g.player) g.player.frozen = false; });
  while (!finished) yield;
  if (g.player) g.player.frozen = false;
}

/** Texts from the people left behind, after each ending. */
function epilogue(m: MissionRun, e: number): void {
  const s = m.s;
  if (e === 1) { send(s, 'Lola', 'Third row, like Mom said. The judge laughed at your joke. I think that is good?'); send(s, 'Imani', 'You did the thing none of us could. I will fly over the prison on your birthday. Look up.'); }
  else if (e === 2) { send(s, 'Pilar', 'Nobody has asked where you went. I tell them the weather took you.'); send(s, 'Mack', 'Clear skies, Cole. Send a postcard with no return address.'); }
  else if (e === 3) { send(s, 'Dex', 'Two hundred million views and the hospital says the bones will knit. You are an idiot. My idiot.'); send(s, 'Mama Jo', 'Your table is ready when you can walk to it.'); }
  else { send(s, 'Pruitt', 'Crane pleads on Monday. Brandt is dead. I am told the three of you bought a bar. Try not to rob it.'); send(s, 'Teddy', 'Bar is called THE SWITCH. Mack picked it. First round is on Imani.'); }
}

const act2Done = (s: import('../Story').Story): boolean => s.done('m27');

/** The three endings: the player's choice is saved in `stats.extra.end`. */
const choicePage = (m: MissionRun): Page => ({
  title: 'Three Ways Out',
  kicker: 'Choose how it ends',
  hideMoney: true,
  hints: 'Choose one',
  render: (host) => {
    const opt = (n: number, label: string, sub: string): void => {
      host.body.append(row({ label, sub, onClick: () => { m.stats.extra.end = n; host.close(); } }));
    };
    host.body.append();
    opt(1, 'Clean Slate', 'Mack takes the ledgers to the court and testifies. He loses his freedom and keeps his family.');
    opt(2, 'Clear Skies', 'Imani takes the money and the airstrip and leaves. She loses her friends and keeps her life.');
    opt(3, 'Big Finish', 'Teddy rides it down in a stunt nobody will forget. He loses everything and becomes a legend.');
    opt(4, 'All In', 'Brandt springs Crane from custody. The three of them go after him together: a car, a tank and a gunship. Nobody walks away clean, and nobody walks away alone.');
  },
});

export const ACT3: MissionDef[] = [
  // ================================================================================================ ACT III
  {
    id: 'm28', title: 'Crane for Governor', char: 'mack', act: 3, giver: 'pruitt', after: ['m27'], gate: act2Done, start: 'mack.door', hour: 11, reward: 6000,
    blurb: 'Crane\'s campaign motorcade leaves the plaza. Mack follows it, and plants a tracker where the cameras do not look.',
    gold: [GOLD.time(420), GOLD.stealth(), GOLD.clean()],
    unlock: (s) => send(s, 'Pruitt', 'The tracker puts his private dock at Dusk Harbor. Imani, Tomas wants to show you something in Cinder Flats.'),
    stages: [
      function* (m): Gen { yield* m.cutscene('m28_rally'); },
      function* (m): Gen {
        const g = m.at('tower.top');
        m.vehicle('suv', 'ridgeback', { x: g.x + 12, z: g.z + 10 }, { color: '#15171b', blip: false });
        m.vehicle('tail', 'pico', { x: g.x - 14, z: g.z + 14 }, { color: '#2d6a9f' });
        yield* m.enter('tail', 'Take the Pico and follow the motorcade');
        const suv = m.veh('suv');
        const drv = m.drive('suv', () => m.at('harbor'), { kmh: 66, arrive: 16 });
        m.tip('Stay 20 to 90 metres behind the Ridgeback.', 7);
        let far = 0, close = 0;
        while (!drv.arrived) {
          const d = dist(m.playerPos(), suv.position);
          far = d > 170 ? far + m.dt : 0;
          close = d < 9 && suv.speed > 3 ? close + m.dt : 0;
          if (far > 7) m.abort('You lost the motorcade.');
          if (close > 4) m.abort('Crane\'s driver spotted you.');
          m.objective('Follow the motorcade', d > 110 ? 'You are falling behind' : d < 18 ? 'Too close: ease off' : 'Good: hold that distance');
          yield;
        }
      },
      function* (m): Gen {
        const suv = m.veh('suv');
        yield* m.goto({ x: suv.position.x + 14, z: suv.position.z + 8 }, 'Get out of sight near the limo', { vehicle: 'tail', r: 20 });
        m.objective('Leave the car and approach the Ridgeback');
        while (m.playerIn('tail')) yield;
        yield* m.hold({ x: suv.position.x + 2, z: suv.position.z + 2 }, 'Plant the tracker', 6, { r: 4 });
        m.say('pruitt', 'Got it. Leave. Quietly.');
        m.s.drivers.clear();
        yield* m.escape(0, 'Walk away before the guards notice');
      },
    ],
  },
  {
    id: 'm29', title: 'Tomas', char: 'imani', act: 3, giver: 'pruitt', after: ['m28'], start: 'imani.door', hour: 18, reward: 6000,
    blurb: 'Tomas Lazaro has his father\'s real books in a Cinder Flats safe house. Crane\'s men found it first.',
    gold: [GOLD.time(480), GOLD.accuracy(0.45), GOLD.flawless(60)],
    stages: [
      function* (m): Gen {
        m.vehicle('jeep', 'ridgeback', 'imani.door', { color: '#3a4a3a' });
        yield* m.enter('jeep', 'Take the Ridgeback to Cinder Flats');
        yield* m.goto('stash', 'Meet Tomas at the safe house', { vehicle: 'jeep', r: 30 });
      },
      function* (m): Gen { yield* m.cutscene('m29_tomas'); },
      function* (m): Gen {
        m.draw();
        m.give('rifle', 140);
        yield* squad(m, 'mer1', 'stash', [[-22, 14, 'smg'], [20, 16, 'smg'], [0, 28, 'rifle'], [-12, -18, 'pistol']], 'Crane\'s men are here: hold the yard', { look: 'thug' });
        m.say('tomas', 'Another truck! More of them! Imani, cover me!');
        yield* squad(m, 'mer2', 'stash', [[-30, 6, 'rifle'], [28, 10, 'rifle'], [8, 32, 'shotgun'], [-16, 26, 'smg']], 'Second wave', { look: 'thug' });
      },
      function* (m): Gen {
        const d = m.at('stash');
        yield* m.hold({ x: d.x + 3, z: d.z - 3 }, 'Open the safe', 8, { r: 4 });
        m.say('tomas', 'The books. All forty years. Now we drive.');
        chasers(m, ['c1'], { x: d.x - 40, z: d.z + 30 }, 'barrage', 108);
        m.limit('Escape', 120, 'Crane\'s chasers caught you.');
        yield* m.goto('taqueria', 'Take Tomas and the books to Mama Jo\'s', { vehicle: 'jeep', r: 20 });
        m.clearLimit();
        m.s.drivers.clear();
      },
    ],
  },
  {
    id: 'm30', title: 'Grease Fire', char: 'teddy', act: 3, giver: 'dex', after: ['m29'], start: 'teddy.door', hour: 22, reward: 6500,
    blurb: 'Crane\'s fleet runs on four tankers parked at the Industrial Depot. Teddy has a truck, and no patience.',
    gold: [GOLD.time(360), GOLD.flawless(90), GOLD.lowStars(5)],
    stages: [
      function* (m): Gen { yield* m.cutscene('m30_dex'); },
      function* (m): Gen {
        const t = m.at('home.teddy');
        m.vehicle('truck', 'ridgeback', { x: t.x + 9, z: t.z + 7 }, { color: '#7a1f1f' });
        yield* m.enter('truck', 'Take the red truck');
        const d = m.at('depot');
        for (let i = 0; i < 4; i++) m.vehicle(`tank${i}`, 'ridgeback', { x: d.x - 24 + i * 16, z: d.z + 16 }, { color: '#d9743a', blip: true, glyph: '▣' });
        yield* m.goto('depot', 'Drive to the Industrial Depot', { vehicle: 'truck', r: 70 });
      },
      function* (m): Gen {
        m.say('dex', 'Hit them hard. Hit them in order. The fourth one will go up like a Fourth of July.');
        for (let i = 0; i < 4; i++) yield* m.destroy(`tank${i}`, `Wreck the tankers (${4 - i} left)`);
        m.s.g.wanted?.report(18, m.playerPos().x, m.playerPos().z, true);
      },
      function* (m): Gen { yield* m.escape(4, 'The whole Task Force is on you: lose them'); },
    ],
  },
  {
    id: 'm31', title: 'Last Flight', char: 'imani', act: 3, giver: 'pilar', after: ['m30'], start: 'imani.door', hour: 6, reward: 7000,
    blurb: 'A witness with Crane\'s accounts needs to get off the mainland. Task Force snipers want the runway.',
    gold: [GOLD.time(600), GOLD.flawless(40), GOLD.accuracy(0.45)],
    stages: [
      function* (m): Gen {
        m.draw();
        m.give('rifle', 140);
        yield* m.goto('airport.apron', 'Get to the apron at Valeria International', { r: 60 });
        m.say('pilar', 'There are riflemen on the hangar roofs. Take them out before you taxi, Imani.');
        yield* squad(m, 'snp', 'airport.apron', [[-30, 20, 'rifle'], [30, 24, 'rifle'], [0, 38, 'rifle'], [-16, -20, 'smg'], [20, -16, 'smg']], 'Clear the snipers off the roofs', TF);
      },
      function* (m): Gen {
        const plane = m.craft('plane', 'skylark', 'airport.strip', { yaw: -Math.PI / 2 });
        m.failIf('plane', () => plane.exploded, 'The Skylark was destroyed.');
        m.objective('Board the Skylark');
        m.route('airport.strip');
        while (!m.playerFlying('plane')) yield;
        m.unblip('craft:plane');
        m.clearRoute();
        m.say('pilar', 'Your passenger is in the back. Do not stop for anyone.');
        yield* m.land('plane', 'island.strip', 'Fly to Isla Rojo and land', 320);
      },
    ],
  },
  {
    id: 'm32', title: 'Wild West', char: 'teddy', act: 3, giver: 'dex', after: ['m31'], start: 'cinder', hour: 15, reward: 7000,
    blurb: 'Crane hires mercenaries to flush Teddy out of the desert. Teddy flushes them back.',
    gold: [GOLD.time(420), GOLD.flawless(90), GOLD.accuracy(0.35)],
    stages: [
      function* (m): Gen {
        const t = m.at('home.teddy');
        m.vehicle('truck', 'ridgeback', { x: t.x + 9, z: t.z + 7 }, { color: '#1f8a8a' });
        yield* m.enter('truck', 'Take the Ridgeback');
        m.draw();
        m.give('shotgun', 50);
        m.give('smg', 150);
        yield* m.goto('cinder', 'Meet Dex at the Flats', { vehicle: 'truck', r: 40 });
        yield* squad(m, 'ww1', 'cinder', [[-30, 12, 'smg'], [28, 16, 'rifle'], [0, 32, 'shotgun'], [-18, -22, 'smg']], 'Mercenaries are coming over the dunes', { look: 'thug' });
      },
      function* (m): Gen {
        m.say('dex', 'Cars! Three of them! They are going for the rail siding, Teddy!');
        chasers(m, ['c1', 'c2', 'c3'], { x: m.at('cinder').x - 80, z: m.at('cinder').z + 60 }, 'ridgeback', 100);
        m.limit('Reach the siding', 130, 'The mercenaries caught you.');
        yield* m.goto('rail.siding', 'Make for the rail siding', { vehicle: 'truck', r: 20 });
        m.clearLimit();
        m.s.drivers.clear();
        yield* squad(m, 'ww2', 'rail.siding', [[-20, 8, 'rifle'], [20, 8, 'rifle'], [0, 20, 'smg']], 'Finish the mercenaries', { look: 'thug' });
      },
    ],
  },
  {
    id: 'm33', title: 'Debate Night', char: 'mack', act: 3, giver: 'marisol', after: ['m32'], start: 'mack.door', hour: 19.5, reward: 7000,
    blurb: 'Crane\'s televised debate. Mack swaps the script and keeps the building out of the way.',
    gold: [GOLD.time(480), GOLD.stealth(), GOLD.lowStars(3)],
    stages: [
      function* (m): Gen {
        yield* m.goto('newsroom', 'Get to the studio on foot', { onFoot: true, r: 60 });
        m.give('vc9', 40);
        const n = m.at('newsroom');
        for (const [dx, dz] of [[-16, 8], [14, 10], [0, 20], [-20, 22], [18, 24]] as [number, number][]) {
          const w = m.s.snap(n.x + dx, n.z + dz, 1.5);
          m.s.hostiles.spawn({ x: w.x, z: w.z, kind: 'pistol', tag: 'dbg', unaware: true, hold: true, look: 'guard' });
        }
        m.tags.add('dbg');
        m.say('marisol', 'The teleprompter is behind the control room. Do not be seen.');
        yield* m.hold({ x: n.x + 6, z: n.z - 6 }, 'Swap the teleprompter script', 10, { r: 4 });
      },
      function* (m): Gen { yield* m.cutscene('m33_debate'); },
      function* (m): Gen {
        m.s.hostiles.alertAll('dbg');
        m.say('marisol', 'It went out live. They know. Go, Marcus! Go!');
        yield* m.escape(3, 'The studio guards have the exits: lose them');
      },
    ],
  },
  {
    id: 'm34', title: 'Lola', char: 'mack', act: 3, giver: 'carmen', after: ['m33'], start: 'costa.cafe', hour: 22.5, reward: 8000,
    blurb: 'Lola\'s first real gig is at a Costa Merida night market. Crane\'s men are in the crowd.',
    gold: [GOLD.time(420), GOLD.flawless(60), GOLD.accuracy(0.4)],
    stages: [
      function* (m): Gen { yield* m.cutscene('m34_lola'); },
      function* (m): Gen {
        m.draw();
        m.give('smg', 150);
        yield* squad(m, 'lo1', 'costa.cafe', [[-16, 14, 'smg'], [18, 12, 'smg'], [0, 26, 'pistol'], [-8, -18, 'pistol']], 'Stop the men taking Lola', { look: 'thug' });
      },
      function* (m): Gen {
        const c = m.at('costa.cafe');
        m.vehicle('van', 'barrage', { x: c.x - 30, z: c.z + 40 }, { color: '#2a2a30', glyph: '!' });
        m.vehicle('car', 'veloce', { x: c.x + 10, z: c.z - 14 }, { color: '#1d2a44' });
        yield* m.enter('car', 'Get into the Veloce');
        const drv = m.drive('van', () => m.at('harbor'), { kmh: 118, arrive: 20 });
        m.failIf('gone', () => drv.arrived, 'The van got away with Lola.');
        m.say('mack', 'Hold on, Lola. I am coming.');
        yield* m.destroy('van', 'Run the van off the road');
        m.clearFails();
      },
      function* (m): Gen { yield* m.cutscene('m34_after'); },
    ],
  },
  {
    id: 'm35', title: 'The Crown, Part I', char: 'any', act: 3, giver: 'pruitt', after: ['m34'], start: 'mack.door', hour: 4, reward: 9000,
    blurb: 'Crane\'s tower: his offices, his lift to the harbor, everything he built. Three of them, one plaza.',
    gold: [GOLD.time(720), GOLD.flawless(120), GOLD.lowStars(5)],
    stages: [
      function* (m): Gen { yield* m.cutscene('m35_crown'); },
      function* (m): Gen {
        m.noSwitch = false;
        const n = m.at('tower.top');
        const P = m.s.protagonists;
        P.put('teddy', n.x - 60, n.z + 60, 0);
        P.put('imani', n.x + 70, n.z + 40, 0);
        P.put('mack', n.x + 6, n.z + 90, 0);
        const ram = m.vehicle('ram', 'ridgeback', { x: n.x - 66, z: n.z + 68 }, { color: '#7a1f1f' });
        const gate = m.vehicle('gate', 'marlow', { x: n.x - 4, z: n.z + 26 }, { color: '#2a2a30', blip: false });
        m.failIf('ram', () => ram.exploded, 'The truck was destroyed.');
        yield* m.asChar('teddy', 'Ram the plaza gate', 'Teddy has the red truck');
        yield* m.enter('ram', 'Get in the truck');
        m.objective('Smash through the gate');
        while (gate.health > 500 && !gate.exploded) yield;
      },
      function* (m): Gen {
        m.noSwitch = false;
        yield* m.asChar('imani', 'Clear the plaza with the rifle', 'Imani has the high ground');
        m.give('rifle', 160);
        yield* squad(m, 'cr1', 'tower.top', [[-26, 18, 'rifle'], [28, 20, 'rifle'], [0, 34, 'rifle'], [-14, 40, 'smg'], [16, 44, 'smg']], 'Pick off the guards on the plaza', TF);
      },
      function* (m): Gen {
        m.noSwitch = false;
        yield* m.asChar('mack', 'Go through the lobby', 'Mack is on foot at the doors');
        m.draw();
        m.give('smg', 160);
        yield* squad(m, 'cr2', 'tower.top', [[-10, 8, 'smg'], [10, 10, 'smg'], [0, 18, 'shotgun'], [-18, 20, 'rifle'], [18, 22, 'rifle']], 'Fight through the lobby', TF);
        m.s.hostiles.spawn({ ...gm(m, 'tower.top', 0, 30, 'rifle', { hp: 360, tag: 'brandt', look: 'brandt' }) });
        m.say('brandt', 'You are not leaving this building, Marcus.');
        yield* m.until(() => m.s.hostiles.alive('brandt') === 0);
      },
    ],
  },
  {
    id: 'm36', title: 'The Crown, Part II', char: 'any', act: 3, giver: 'pruitt', after: ['m35'], start: 'tower.top', hour: 5.5, reward: 9000,
    blurb: 'Crane runs for the Aurelia. Wherever he goes, the three of them go after him.',
    gold: [GOLD.time(480), GOLD.flawless(80), GOLD.lowStars(5)],
    unlock: (s) => { send(s, 'Pruitt', 'He is aboard. The Aurelia is at the Dusk Harbor moorings. Open the board at the Boardwalk Studio.'); s.heists.unlock('h6'); },
    stages: [
      function* (m): Gen {
        const t = m.at('tower.top');
        m.vehicle('car', 'barrage', { x: t.x + 14, z: t.z + 8 }, { color: '#101216' });
        m.vehicle('limo', 'ridgeback', { x: t.x - 20, z: t.z + 30 }, { color: '#15171b', blip: false });
        yield* m.enter('car', 'Take the Barrage and go after Crane');
        const limo = m.veh('limo');
        const drv = m.drive('limo', () => m.at('harbor'), { kmh: 120, arrive: 22 });
        m.failIf('gone', () => drv.arrived, 'Crane reached the Aurelia.');
        m.say('pruitt', 'He is running for the harbor. Stop him before he reaches the moorings.');
        yield* m.destroy('limo', 'Stop Crane\'s limo');
        m.clearFails();
        void limo;
      },
      function* (m): Gen {
        m.draw();
        m.give('smg', 150);
        const p = m.playerPos();
        yield* squad(m, 'cr3', p, [[-14, 12, 'smg'], [14, 14, 'smg'], [0, 24, 'rifle']], 'The limo\'s guards are out: finish them', TF);
      },
      function* (m): Gen { yield* m.cutscene('m36_crane'); },
    ],
  },
  {
    id: 'm38', title: 'Three Ways Out', char: 'any', act: 3, giver: 'pruitt', after: ['m36'], gate: heistDone('h6'), start: 'mack.door', hour: 21, reward: 15000,
    blurb: 'The ledgers are in. Crane is done, or nearly. Each of them has one more thing to do: alone, or all together.',
    gold: [GOLD.time(900)],
    unlock: (s) => {
      s.st.flags.freeroam = true;
      send(s, 'Pruitt', 'It is over. The city is yours: every job, every road, every flag on the map. Take your time.');
      s.hud.showBanner('Free roam', 'THE CITY IS YOURS', 'Every mission can be replayed from the phone', 'good', 6);
    },
    stages: [
      function* (m): Gen { yield* m.cutscene('m38_choice'); },
      function* (m): Gen {
        while (!m.stats.extra.end) {
          m.objective('Choose how it ends');
          m.s.g.commerce!.open(choicePage(m));
          yield;
          yield* m.until(() => !m.s.g.commerce!.modal.active);
        }
        m.s.st.flags.ending = m.stats.extra.end;
      },
      function* (m): Gen {
        const e = m.stats.extra.end ?? 1;
        if (e === 1) {
          yield* m.switchTo('mack');
          m.give('vc9', 30);
          m.vehicle('car', 'veloce', 'mack.door', { color: '#1d2a44' });
          yield* m.enter('car', 'Take the ledgers to the court');
          // Brandt's last loyal men try to stop the ledgers reaching a judge
          chasers(m, ['tf1', 'tf2'], 'mack.door', 'cruiser', 118);
          m.say('pruitt', 'Brandt knows where you are going. Two cars behind you, and more at the steps.');
          yield* m.goto('court', 'Drive to Valeria Courthouse', { vehicle: 'car', r: 16 });
          m.s.drivers.clear();
          m.say('mack', 'Welcoming committee. Of course.');
          yield* squad(m, 'steps', 'court', [[-10, 12, 'smg'], [10, 14, 'smg'], [-4, 22, 'rifle'], [6, 24, 'shotgun']], 'Clear Brandt\'s men off the courthouse steps', TF);
          m.objective('Leave the car and walk in');
          while (m.playerIn('car')) yield;
          yield* m.cutscene('m38_end1');
        } else if (e === 2) {
          yield* m.switchTo('imani');
          const plane = m.craft('plane', 'skylark', 'airport.strip', { yaw: -Math.PI / 2 });
          m.failIf('plane', () => plane.exploded, 'The Skylark was destroyed.');
          m.give('rifle', 120);
          m.say('pilar', 'Imani, there are Task Force trucks on the runway. They know which plane is yours.');
          yield* squad(m, 'rwy', 'airport.strip', [[-30, 14, 'rifle'], [-12, -16, 'smg'], [16, 18, 'smg'], [34, -10, 'rifle']], 'Clear the Task Force off the runway', TF);
          const pp = m.playerPos();
          m.g.wanted?.report(HEAT[3]! + 4, pp.x, pp.z, true);
          m.say('imani', 'Three stars and a runway. I have had worse mornings.');
          m.objective('Board the Skylark');
          m.route('airport.strip');
          while (!m.playerFlying('plane')) yield;
          m.unblip('craft:plane');
          m.clearRoute();
          yield* m.land('plane', 'island.strip', 'Fly to Isla Rojo and land', 320);
          m.objective('Climb out of the Skylark');
          while (m.g.piloting?.active) yield;
          yield* m.cutscene('m38_end2');
        } else if (e === 3) {
          yield* m.switchTo('teddy');
          const t = m.at('home.teddy');
          const car = m.vehicle('stunt', 'barrage', { x: t.x + 9, z: t.z + 7 }, { color: '#c4202c' });
          m.failIf('car', () => car.exploded, 'The stunt car blew up.');
          yield* m.enter('stunt', 'Take the red Barrage');
          const rp = m.at('ramp');
          m.onCleanup(m.s.ramp(rp.x, rp.z, Math.PI / 2, 22, 11, 6));
          yield* m.goto({ x: rp.x - 110, z: rp.z }, 'Line up at the start of the run', { vehicle: 'stunt', r: 14 });
          m.say('dex', 'Three, two, one, Teddy! Go! GO!');
          m.objective('The Big Finish', 'Get airborne off the ramp and land 45 m or more away');
          let air = false;
          let from = { x: 0, z: 0 };
          let best = 0;
          while (best < 45) {
            const v = m.veh('stunt');
            const up = v.wheels.every((w) => !w.onGround);
            if (up && !air && v.position.x > rp.x + 2 && v.position.x < rp.x + 14) { air = true; from = { x: v.position.x, z: v.position.z }; }
            if (!up && air) {
              air = false;
              const d = dist(v.position, from);
              best = Math.max(best, d);
              if (d < 45) m.say('dex', `${Math.round(d)} metres. That is not a legend. Go again!`);
            }
            if (v.position.x > rp.x + 160) v.teleport(rp.x - 105, Math.max(m.ground(rp.x - 105, rp.z), 0), rp.z, -Math.PI / 2);
            yield;
          }
          m.say('dex', `${Math.round(best)} metres! They will name a tyre after you!`);
          yield* m.wait(2);
          yield* m.cutscene('m38_end3');
        } else {
          yield* allIn(m);
        }
      },
      function* (m): Gen {
        const e = m.stats.extra.end ?? 1;
        yield* m.cutscene('m38_credits');
        epilogue(m, e);
        yield* credits(m, e);
      },
    ],
  },
];

/**
 * The fourth ending. Brandt hits the prison transport and Crane runs for his jet at Valeria International. Mack drives in
 * with the Task Force on his tail, Teddy smashes the roadblock on the airport road in a tank, Imani hunts the convoy down
 * the coast road in a gunship, and the three of them finish Brandt on the tarmac.
 */
function* allIn(m: MissionRun): Gen {
  const P = m.s.protagonists;
  const A = m.at('airport.gate'), C = m.at('allin.convoy');
  yield* m.cutscene('m38_allin');
  m.noSwitch = false;
  // where everyone starts
  const tp = m.s.snap(A.x - 60, A.z - 30, 3), ip = m.s.snap(A.x + 90, A.z + 170, 3);
  P.put('teddy', tp.x, tp.z, 0);
  P.put('imani', ip.x, ip.z, 0);
  // ---- Mack: get to the airport road ------------------------------------------------------------------------
  yield* m.switchTo('mack');
  m.give('smg', 180);
  m.vehicle('car', 'comet', 'mack.door', { color: '#101216' });
  yield* m.enter('car', 'Get in the Comet');
  chasers(m, ['tf1', 'tf2'], 'mack.door', 'cruiser', 120);
  m.say('pruitt', 'Crane is out. Brandt hit the transport on the East Highway. They are running for his jet at Valeria International.');
  m.say('mack', 'Then we close the airport.');
  yield* m.goto('airport.gate', 'Race to the airport road', { vehicle: 'car', r: 40, sub: 'Two Task Force cruisers are on you' });
  m.s.drivers.clear();
  // ---- Teddy: the roadblock -----------------------------------------------------------------------------------
  const tank = m.craft('tank', 'bulwark', { x: tp.x + 8, z: tp.z }, { yaw: Math.PI });
  m.failIf('tank', () => tank.exploded, 'The tank was destroyed.');
  for (let i = 0; i < 3; i++) m.vehicle(`rb${i}`, 'cruiser', m.s.snap(A.x - 20 + i * 7, A.z + 40, 2.6), { yaw: Math.PI / 2 });
  for (const [dx, dz] of [[-24, 50], [-6, 54], [12, 50], [24, 46]] as [number, number][]) m.s.hostiles.spawn({ ...gm(m, 'airport.gate', dx, dz, 'rifle', { tag: 'rb', ...TF, hold: true }) });
  m.tags.add('rb');
  m.say('teddy', 'Mack! Look what I borrowed from Fort Halloran!');
  yield* m.asChar('teddy', 'Take the tank', 'Teddy is on the airport road');
  m.objective('Get in the tank', 'Walk up to it and press E');
  while (!m.playerFlying('tank')) yield;
  m.unblip('craft:tank');
  m.tip('Mouse aims the turret, left button fires the cannon, right button the machine gun.', 8);
  for (let i = 0; i < 3; i++) yield* m.destroy(`rb${i}`, `Smash the roadblock (${3 - i} cruisers left)`);
  yield* m.kill('rb', [], 'Finish the Task Force on the road');
  // Teddy climbs out so the switch to Imani is free (nobody can switch from inside a craft)
  m.say('teddy', 'Road is open! Imani, they are all yours!');
  m.g.piloting?.abort();
  // ---- Imani: the convoy --------------------------------------------------------------------------------------
  const heli = m.craft('gunship', 'hornet', { x: ip.x + 10, z: ip.z }, { yaw: -Math.PI / 2 });
  m.failIf('heli', () => heli.exploded, 'The Hornet was destroyed.');
  m.say('pilar', 'Imani, the gunship is fuelled and armed. Crane\'s convoy is on the coast road, heading for the apron.');
  yield* m.asChar('imani', 'Get in the Hornet', 'Imani is on the apron');
  m.objective('Get in the Hornet');
  while (!m.playerFlying('gunship')) yield;
  m.unblip('craft:gunship');
  const convoy = ['esc0', 'limo', 'esc1'];
  convoy.forEach((n, i) => {
    m.vehicle(n, n === 'limo' ? 'huntley' : 'cruiser', m.s.snap(C.x + i * 14, C.z + (i % 2) * 6, 2.6), { yaw: Math.PI / 2, color: n === 'limo' ? '#0b0c0e' : undefined, blip: n === 'limo' });
  });
  const lead = m.drive('limo', () => m.at('airport.apron'), { kmh: 62, arrive: 40 });
  m.drive('esc0', () => m.veh('limo').position, { kmh: 70 });
  m.drive('esc1', () => m.veh('limo').position, { kmh: 70 });
  m.failIf('jet', () => lead.arrived, 'Crane reached his jet.');
  m.tip('Climb with Space and fly with W / A / S / D. Hold R to fire rockets along the nose.', 10);
  m.say('imani', 'I see them. Three cars, one with the expensive windows.');
  yield* m.destroy('limo', 'Stop Crane\'s limo before it reaches the apron');
  m.clearFails();
  m.s.drivers.clear();
  m.say('crane', 'Ines! Get me out of this car!');
  // ---- all three: Brandt's last stand on the tarmac ---------------------------------------------------------------
  const wreck = m.veh('limo').position.clone();
  P.put('mack', wreck.x - 40, wreck.z - 30, 0);
  P.put('teddy', wreck.x + 40, wreck.z - 30, 0);
  m.say('brandt', 'You should have stayed a valet, Delgado.');
  m.say('mack', 'I am right behind the wreck, Imani. Teddy is on the other side. Land, or light them up.');
  yield* m.kill('brandt', [
    { ...m.s.snap(wreck.x + 6, wreck.z + 8), kind: 'rifle', hp: 320, look: 'brandt', tag: 'brandt' },
    { ...m.s.snap(wreck.x - 10, wreck.z + 4), kind: 'smg', look: 'guard', tag: 'brandt' },
    { ...m.s.snap(wreck.x + 14, wreck.z - 6), kind: 'smg', look: 'guard', tag: 'brandt' },
    { ...m.s.snap(wreck.x - 4, wreck.z + 16), kind: 'shotgun', look: 'guard', tag: 'brandt' },
  ], 'Take down Brandt and her last men', { sub: 'From the gunship, or land and switch to Mack or Teddy to flank them' });
  m.g.wanted?.clear();
  yield* m.cutscene('m38_end4');
}

void (null as unknown as Gun);
