import { GOLD, type Gen, type MissionDef, type MissionRun } from '../Missions';
import { row, type Page } from '../../ui/Modal';
import { chasers, dist, gm, heistDone, send, squad, TF, type Gun } from './act2';

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
    blurb: 'The ledgers are in. Crane is done. Each of them has one more thing to do, and only one of them gets to do it.',
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
          yield* m.goto('court', 'Drive to Valeria Courthouse', { vehicle: 'car', r: 16 });
          m.objective('Leave the car and walk in');
          while (m.playerIn('car')) yield;
          yield* m.cutscene('m38_end1');
        } else if (e === 2) {
          yield* m.switchTo('imani');
          const plane = m.craft('plane', 'skylark', 'airport.strip', { yaw: -Math.PI / 2 });
          m.failIf('plane', () => plane.exploded, 'The Skylark was destroyed.');
          m.objective('Board the Skylark');
          m.route('airport.strip');
          while (!m.playerFlying('plane')) yield;
          m.unblip('craft:plane');
          m.clearRoute();
          yield* m.land('plane', 'island.strip', 'Fly to Isla Rojo and land', 320);
          m.objective('Climb out of the Skylark');
          while (m.g.piloting?.active) yield;
          yield* m.cutscene('m38_end2');
        } else {
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
        }
      },
      function* (m): Gen { yield* m.cutscene('m38_credits'); },
    ],
  },
];

void (null as unknown as Gun);
