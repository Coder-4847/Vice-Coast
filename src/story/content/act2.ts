import { GEO } from '../../world/heightfield';
import { GOLD, type Gen, type MissionDef, type MissionRun } from '../Missions';
import type { HostileOpts } from '../Hostiles';
import type { Place } from '../types';

/** A point near a place. */
const off = (m: MissionRun, p: Place, dx = 0, dz = 0): { x: number; z: number } => { const w = m.at(p); return { x: w.x + dx, z: w.z + dz }; };
type Gun = HostileOpts['kind'];
const gm = (m: MissionRun, p: Place, dx: number, dz: number, kind: Gun = 'pistol', more: Partial<HostileOpts> = {}): HostileOpts => ({ ...off(m, p, dx, dz), kind, ...more });
const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);
const send = (s: import('../Story').Story, from: string, text: string): void => s.g.commerce!.eco.message(from, text);
const heistDone = (id: string) => (s: import('../Story').Story): boolean => !!s.st.heists[id]?.done;
const TF = { look: 'guard' } as const;

/** Spawn a squad around a place and wait until it is dead. */
function* squad(m: MissionRun, tag: string, at: Place, men: [number, number, Gun?][], text: string, more: Partial<HostileOpts> = {}): Gen {
  yield* m.kill(tag, men.map(([dx, dz, k]) => gm(m, at, dx, dz, k ?? 'pistol', more)), text);
}

/** Cars that chase the player until they are wrecked or the stage ends. */
function chasers(m: MissionRun, names: string[], at: Place, spec = 'barrage', kmh = 112): void {
  const w = m.at(at);
  names.forEach((n, i) => {
    m.vehicle(n, spec, { x: w.x + (i % 2 ? 14 : -14), z: w.z + 10 + i * 12 }, { color: '#2a2a30', blip: false });
    m.drive(n, () => m.playerPos(), { kmh, aggressive: true });
  });
}

const C = GEO.cinder;

export const ACT2: MissionDef[] = [
  // ================================================================================================ ACT II: MACK
  {
    id: 'm13', title: 'Brandt\'s Law', char: 'mack', act: 2, giver: 'pruitt', after: ['m12'], gate: heistDone('h1'), start: 'redline.yard', hour: 16.5, reward: 4000,
    blurb: 'Captain Brandt comes to Redline Customs with a search warrant and a long memory.',
    gold: [GOLD.time(330), GOLD.flawless(60), GOLD.lowStars(4)],
    unlock: (s) => send(s, 'Pruitt', 'Brandt now knows a driver was involved. Keep Mack\'s family somewhere she does not look. And do not go home.'),
    stages: [
      function* (m): Gen { yield* m.cutscene('m13_brandt'); },
      function* (m): Gen {
        m.draw();
        yield* squad(m, 'tf1', 'redline', [[10, 9, 'smg'], [-10, 11, 'pistol'], [3, 17, 'smg'], [-4, 18, 'pistol']], 'Fight your way out of the yard', TF);
      },
      function* (m): Gen {
        m.say('benny', 'Marcus, go! Take the Veloce round the back! I will hold the shop!');
        yield* m.escape(3, 'Brandt has called it in: lose the Task Force');
      },
    ],
  },
  {
    id: 'm14', title: 'Family Dinner', char: 'mack', act: 2, giver: 'carmen', after: ['m13'], start: 'mack.door', hour: 19.5, reward: 3500,
    blurb: 'Mack cooks for Carmen and Lola. Lazaro gunmen arrive before dessert.',
    gold: [GOLD.time(360), GOLD.flawless(40), GOLD.accuracy(0.4)],
    unlock: (s) => { send(s, 'Carmen', 'Dinner was good. Until it was not. We are at the garage. Do not make me regret it.'); send(s, 'Pruitt', 'A friend of mine, Silas Quinn, would like to meet. Marlowe Row. He can open any door the Task Force has.'); },
    stages: [
      function* (m): Gen { yield* m.cutscene('m14_dinner'); },
      function* (m): Gen {
        m.draw();
        m.give('smg', 120);
        yield* squad(m, 'dn1', 'home.mack', [[-14, 12, 'smg'], [14, 10, 'pistol'], [0, 20, 'smg'], [-6, 24, 'pistol'], [8, 26, 'shotgun']], 'Hold the flat against the Lazaro crew');
      },
      function* (m): Gen {
        const h = m.at('mack.door');
        m.vehicle('car', 'veloce', { x: h.x + 10, z: h.z + 8 }, { color: '#1d2a44' });
        m.say('carmen', 'Marcus! The car! Now!');
        yield* m.enter('car', 'Get Carmen and Lola into the Veloce');
        chasers(m, ['c1', 'c2'], { x: h.x - 60, z: h.z + 40 });
        m.limit('Get them to safety', 160, 'The Lazaro cars caught you.');
        yield* m.goto('redline', 'Take them to Redline Customs', { vehicle: 'car', r: 16 });
        m.clearLimit();
        m.s.drivers.clear();
      },
      function* (m): Gen { yield* m.cutscene('m14_safe'); },
    ],
  },
  {
    id: 'm15', title: 'Silas', char: 'mack', act: 2, giver: 'pruitt', after: ['m14'], start: 'marlowe', hour: 14, reward: 4000,
    blurb: 'Plug Silas Quinn\'s cable into the Task Force server and walk out unseen.',
    gold: [GOLD.time(420), GOLD.stealth(), GOLD.lowStars(3)],
    unlock: (s) => send(s, 'Silas', 'You carry the cable beautifully. I am putting you down as "reliable". That has happened twice in my life.'),
    stages: [
      function* (m): Gen { yield* m.cutscene('m15_silas'); },
      function* (m): Gen {
        yield* m.goto('depot', 'Reach the Task Force depot', { r: 80 });
        m.give('vc9', 40);
        const d = m.at('depot');
        for (const [dx, dz] of [[-12, 8], [10, 10], [0, 20], [-16, 22]] as [number, number][]) {
          const w = m.s.snap(d.x + dx, d.z + dz, 1.5);
          m.s.hostiles.spawn({ x: w.x, z: w.z, kind: 'pistol', tag: 'sg', unaware: true, hold: true, look: 'guard' });
        }
        m.tags.add('sg');
        m.say('silas', 'Four guards on the yard. If they see you, the server locks. Quiet, Marcus.');
        yield* m.until(() => m.s.hostiles.alive('sg') === 0 || m.near('depot', 10));
      },
      function* (m): Gen {
        const d = m.at('depot');
        yield* m.hold({ x: d.x + 6, z: d.z + 4 }, 'Plug in Silas\'s cable', 10, { r: 3 });
        m.say('silas', 'I am in. I am so in. Take the copy of the case files and go.');
        yield* m.escape(2, 'The server tripped an alarm: lose the guards');
      },
    ],
  },

  // ================================================================================================ ACT II: IMANI
  {
    id: 'm16', title: 'Press Pass', char: 'imani', act: 2, giver: 'marisol', after: ['m15'], start: 'newsroom', hour: 11, reward: 5000,
    blurb: 'Fly to Isla Rojo, photograph Crane with the men who pay him, and fly home.',
    gold: [GOLD.time(720), GOLD.stealth(), GOLD.flawless(40)],
    stages: [
      function* (m): Gen { yield* m.cutscene('m16_marisol'); },
      function* (m): Gen {
        const plane = m.craft('plane', 'skylark', 'airport.strip', { yaw: -Math.PI / 2 });
        m.failIf('plane', () => plane.exploded, 'The Skylark was destroyed.');
        m.objective('Board the Skylark at the end of the runway');
        m.route('airport.strip');
        while (!m.playerFlying('plane')) yield;
        m.unblip('craft:plane');
        m.clearRoute();
        yield* m.land('plane', 'island.strip', 'Fly to Isla Rojo and land on the airstrip', 320);
        m.objective('Climb out of the Skylark');
        while (m.g.piloting?.active) yield;
      },
      function* (m): Gen {
        m.give('vc9', 30);
        yield* m.goto('island.villa', 'Creep up to the villa', { onFoot: true, r: 55 });
        const v = m.at('island.villa');
        for (const [dx, dz] of [[-14, 10], [12, 12], [0, 22], [-18, -6]] as [number, number][]) {
          const w = m.s.snap(v.x + dx, v.z + dz, 1.5);
          m.s.hostiles.spawn({ x: w.x, z: w.z, kind: 'smg', tag: 'vg', unaware: true, hold: true, look: 'guard' });
        }
        m.tags.add('vg');
        yield* m.hold({ x: v.x + 4, z: v.z - 8 }, 'Photograph the meeting', 8, { r: 28 });
        yield* m.cutscene('m16_villa');
        m.objective('Clear the grounds or slip away');
        yield* m.until(() => m.s.hostiles.alive('vg') === 0 || dist(m.playerPos(), v) > 130);
        m.s.hostiles.clear('vg');
      },
      function* (m): Gen {
        yield* m.goto('island.strip', 'Get back to the Skylark', { onFoot: true, r: 25 });
        const plane = m.craftOf('plane');
        m.failIf('plane', () => plane.exploded, 'The Skylark was destroyed.');
        yield* m.until(() => m.playerFlying('plane'));
        yield* m.land('plane', 'airport.strip', 'Fly the photographs home', 320);
        m.say('marisol', 'These are extraordinary. Come to the newsroom. Come now.');
      },
    ],
  },

  // ================================================================================================ ACT II: TEDDY
  {
    id: 'm17', title: 'Hot Lap', char: 'teddy', act: 2, giver: 'dex', after: ['m16'], start: 'teddy.door', hour: 16, reward: 3500,
    blurb: 'Dex wants a ninety-second lap of Cinder Flats for a sponsor. Teddy wants a sponsor.',
    gold: [GOLD.time(180), GOLD.flawless(0), { id: 'lap', label: 'Lap in under 90 seconds', test: (s) => (s.extra.lap ?? 999) <= 90 }],
    stages: [
      function* (m): Gen { yield* m.cutscene('m17_dex'); },
      function* (m): Gen {
        const t = m.at('home.teddy');
        const car = m.vehicle('car', 'ridgeback', { x: t.x + 9, z: t.z + 7 }, { color: '#1f8a8a' });
        m.failIf('car', () => car.exploded, 'The Ridgeback blew up.');
        yield* m.enter('car', 'Take the Ridgeback to the start line');
        yield* m.goto('cinder', 'Roll up to the start line', { vehicle: 'car', r: 24 });
        m.say('dex', 'Cameras are live. Three, two, one!');
        yield* m.wait(1.5);
        const t0 = m.stats.time;
        m.limit('Hot lap', 150, 'You missed the sponsor\'s window.');
        for (const [dx, dz, label] of [[120, 40, 'Dune one'], [220, 150, 'The ridge'], [120, 260, 'The gully'], [-80, 200, 'Back straight'], [-120, 60, 'Last bend'], [0, 0, 'The line']] as [number, number, string][]) {
          yield* m.goto({ x: C.x + dx, z: C.z + dz }, label, { vehicle: 'car', r: 28, key: 'lap' });
        }
        m.clearLimit();
        m.stats.extra.lap = m.stats.time - t0;
        m.say('dex', `${Math.round(m.stats.extra.lap)} seconds! The sponsor is already on the phone!`);
        yield* m.wait(2);
      },
    ],
  },
  {
    id: 'm18', title: 'Viral', char: 'teddy', act: 2, giver: 'dex', after: ['m17'], start: 'teddy.door', hour: 19, reward: 4000,
    blurb: 'Four cars, one ramp, and a Lazaro crew who saw the footage.',
    gold: [GOLD.time(360), GOLD.flawless(0), { id: 'far', label: 'Jump 45 metres or more', test: (s) => (s.extra.jump ?? 0) >= 45 }],
    stages: [
      function* (m): Gen {
        const t = m.at('home.teddy');
        const car = m.vehicle('stunt', 'barrage', { x: t.x + 9, z: t.z + 7 }, { color: '#c4202c' });
        m.failIf('car', () => car.exploded, 'The stunt car blew up.');
        yield* m.enter('stunt', 'Take the red Barrage');
        const rp = m.at('ramp');
        m.onCleanup(m.s.ramp(rp.x, rp.z, Math.PI / 2));
        for (let i = 0; i < 4; i++) m.vehicle(`row${i}`, 'pico', { x: rp.x + 24 + i * 5, z: rp.z + (i % 2 ? 2 : -2) }, { yaw: 0, blip: false, color: ['#c9a227', '#2a5bd7', '#7a1f1f', '#e4e6ea'][i] });
        yield* m.goto({ x: rp.x - 90, z: rp.z }, 'Line up for the jump', { vehicle: 'stunt', r: 14 });
        m.say('dex', 'Four cars! Four! Do it for the algorithm!');
        m.objective('Jump the row of cars', 'Get airborne off the ramp and land 45 m or more away');
        let air = false;
        let from = { x: 0, z: 0 };
        let best = 0;
        while (best < 40) {
          const v = m.veh('stunt');
          const up = v.wheels.every((w) => !w.onGround);
          if (up && !air && v.position.x > rp.x + 2 && v.position.x < rp.x + 12) { air = true; from = { x: v.position.x, z: v.position.z }; }
          if (!up && air) {
            air = false;
            const d = dist(v.position, from);
            m.stats.extra.jump = Math.max(m.stats.extra.jump ?? 0, d);
            best = Math.max(best, d);
            if (d < 40) m.say('dex', `${Math.round(d)} metres. You clipped them. Go again!`);
          }
          if (v.position.x > rp.x + 160) { v.teleport(rp.x - 85, Math.max(m.ground(rp.x - 85, rp.z), 0), rp.z, -Math.PI / 2); }
          yield;
        }
        for (let i = 0; i < 4; i++) m.dispose(`row${i}`);
        m.say('dex', 'Cleared! Teddy, you are going to be famous.');
        yield* m.wait(2);
      },
      function* (m): Gen {
        m.draw();
        m.give('shotgun', 40);
        m.say('dex', 'Uh. Teddy. The Lazaro crew just watched that. In four-K. They are coming.');
        yield* squad(m, 'lz', 'ramp', [[-30, 12, 'smg'], [-24, -14, 'pistol'], [-40, 0, 'shotgun'], [-34, 20, 'smg']], 'Deal with the Lazaro crew');
      },
      function* (m): Gen { yield* m.cutscene('m18_viral'); },
    ],
  },

  // ================================================================================================ ACT II: SPLIT
  {
    id: 'm19', title: 'Halloran', char: 'imani', act: 2, giver: 'pruitt', after: ['m18'], gate: heistDone('h2'), start: 'imani.door', hour: 21, reward: 6000,
    blurb: 'Fort Halloran holds the only copy of Crane\'s army contract. Imani walks in, and flies out.',
    gold: [GOLD.time(720), GOLD.stealth(), GOLD.lowStars(4)],
    unlock: (s) => send(s, 'Pruitt', 'The contract confirms it. Crane is selling the harbor to the people who run it. Keep Rosa Lazaro\'s offer in mind.'),
    stages: [
      function* (m): Gen { yield* m.cutscene('m19_brief'); },
      function* (m): Gen {
        m.vehicle('jeep', 'ridgeback', 'airport.apron', { color: '#3a4a3a' });
        yield* m.enter('jeep', 'Take the Ridgeback to Fort Halloran');
        yield* m.goto('fort.gate', 'Drive to the fort\'s perimeter and leave the car', { vehicle: 'jeep', r: 40 });
        m.objective('Leave the car and go in on foot');
        while (m.playerIn('jeep')) yield;
        m.give('vc9', 40);
      },
      function* (m): Gen {
        const mp = m.at('fort');
        for (const [dx, dz, k] of [[-18, 10, 'rifle'], [14, 12, 'rifle'], [0, 26, 'rifle'], [-22, -12, 'smg'], [20, -14, 'smg']] as [number, number, Gun][]) {
          const w = m.s.snap(mp.x + dx, mp.z + dz, 1.5);
          m.s.hostiles.spawn({ x: w.x, z: w.z, kind: k, tag: 'sol', unaware: true, hold: true, look: 'guard2' });
        }
        m.tags.add('sol');
        m.say('pruitt', 'Terminal is in the motor pool office. Do not trip the base alarm if you can avoid it.');
        yield* m.goto('fort', 'Reach the motor pool', { onFoot: true, r: 38 });
        yield* m.hold({ x: mp.x + 3, z: mp.z - 3 }, 'Copy the contract', 9, { r: 4 });
        m.say('imani', 'Got it. Now to find a way out.');
      },
      function* (m): Gen {
        const mp = m.at('fort');
        const heli = m.craft('heli', 'newsbird', { x: mp.x + 14, z: mp.z + 6 }, { yaw: 0 });
        m.failIf('heli', () => heli.exploded, 'The Newsbird was destroyed.');
        m.objective('Steal the Newsbird from the motor pool');
        while (!m.playerFlying('heli')) yield;
        m.unblip('craft:heli');
        yield* m.land('heli', 'airport.apron', 'Fly the contract home', 140);
      },
    ],
  },
  {
    id: 'm20', title: 'Cheap Seats', char: 'teddy', act: 2, giver: 'dex', after: ['m19'], start: 'teddy.door', hour: 17.5, reward: 4500,
    blurb: 'Crane\'s campaign vans are parked on the plaza. Teddy has a use for them.',
    gold: [GOLD.time(360), GOLD.flawless(80), GOLD.lowStars(5)],
    stages: [
      function* (m): Gen { yield* m.cutscene('m20_seats'); },
      function* (m): Gen {
        const t = m.at('home.teddy');
        m.vehicle('truck', 'ridgeback', { x: t.x + 9, z: t.z + 7 }, { color: '#7a1f1f' });
        yield* m.enter('truck', 'Take the red truck to the plaza');
        const p = m.at('tower.top');
        for (let i = 0; i < 3; i++) m.vehicle(`van${i}`, 'marlow', { x: p.x + (i - 1) * 16, z: p.z + 24 }, { color: '#e4e6ea', blip: true, glyph: '★' });
        yield* m.goto('tower.top', 'Drive to the Meridian Tower plaza', { vehicle: 'truck', r: 90 });
      },
      function* (m): Gen {
        m.say('dex', 'Three vans. Hit them hard, Teddy. Make them regret the balloons.');
        for (let i = 0; i < 3; i++) { yield* m.destroy(`van${i}`, `Wreck the campaign vans (${3 - i} left)`); }
        m.s.g.wanted?.report(14, m.playerPos().x, m.playerPos().z, true);
      },
      function* (m): Gen { yield* m.escape(3, 'The Task Force is on you: lose them'); },
    ],
  },

  // ================================================================================================ ACT II: ROSA
  {
    id: 'm21', title: 'Rosa', char: 'mack', act: 2, giver: 'pruitt', after: ['m20'], gate: heistDone('h3'), start: 'mack.door', hour: 13, reward: 5500,
    blurb: 'Rosa Lazaro wants to talk over coffee. Her son Mateo wants something else.',
    gold: [GOLD.time(480), GOLD.flawless(60), GOLD.accuracy(0.4)],
    unlock: (s) => send(s, 'Rosa', 'Bring Tomas home, Marcus. I will remember who brought him.'),
    stages: [
      function* (m): Gen {
        m.vehicle('car', 'veloce', 'mack.door', { color: '#1d2a44' });
        yield* m.enter('car', 'Take the Veloce to Costa Merida');
        yield* m.goto('costa.cafe', 'Drive to Rosa\'s cafe in Costa Merida', { vehicle: 'car', r: 28 });
      },
      function* (m): Gen { yield* m.cutscene('m21_rosa'); },
      function* (m): Gen {
        m.draw();
        m.give('smg', 120);
        yield* squad(m, 'mat', 'costa.cafe', [[-18, 14, 'smg'], [16, 12, 'smg'], [0, 24, 'shotgun'], [-12, -14, 'pistol'], [14, -16, 'pistol']], 'Mateo\'s men have followed you: fight', { look: 'thug' });
      },
      function* (m): Gen {
        m.s.hostiles.spawn({ ...gm(m, 'costa.cafe', 0, 30, 'rifle', { hp: 320, tag: 'mateo', look: 'mateo' }) });
        m.say('mateo', 'You do not get to take my brother!');
        yield* m.until(() => m.s.hostiles.alive('mateo') === 0);
        m.say('rosa', 'Go. Bring Tomas to Mama Jo\'s. Quickly.');
        yield* m.escape(2, 'The street heard the shooting: lose the police');
      },
    ],
  },
  {
    id: 'm22', title: 'Two Deals', char: 'imani', act: 2, giver: 'pilar', after: ['m21'], start: 'imani.door', hour: 19, reward: 5000,
    blurb: 'Crane offers Imani an airline. Tomas Lazaro needs a pilot and a way out. She picks.',
    gold: [GOLD.time(540), GOLD.flawless(60), GOLD.lowStars(3)],
    stages: [
      function* (m): Gen { yield* m.goto('tower.top', 'Meet Crane at the Meridian Tower plaza', { r: 20 }); },
      function* (m): Gen { yield* m.cutscene('m22_deals'); },
      function* (m): Gen {
        m.vehicle('car', 'barrage', 'tower.top', { color: '#101216' });
        yield* m.enter('car', 'Take the Barrage to Dusk Harbor');
        yield* m.goto('harbor', 'Meet Tomas at Dusk Harbor', { vehicle: 'car', r: 30 });
        m.draw();
        m.give('smg', 90);
        m.say('tomas', 'They followed me. Of course they followed me. Imani, behind the crates!');
        yield* squad(m, 'tf2', 'harbor', [[-20, 12, 'smg'], [18, 14, 'smg'], [0, 26, 'pistol'], [-10, -18, 'pistol'], [12, -20, 'rifle']], 'Protect Tomas', TF);
      },
      function* (m): Gen {
        m.say('tomas', 'The coffee shop. My mother said the coffee shop. Drive.');
        chasers(m, ['c1'], 'harbor', 'barrage', 105);
        m.limit('Get Tomas out', 150, 'The chase caught you.');
        yield* m.goto('taqueria', 'Drive Tomas to Mama Jo\'s', { vehicle: 'car', r: 18 });
        m.clearLimit();
        m.s.drivers.clear();
      },
      function* (m): Gen { yield* m.cutscene('m22_tomas'); },
    ],
  },
  {
    id: 'm23', title: 'The Trade', char: 'any', act: 2, giver: 'pruitt', after: ['m22'], start: 'depot', hour: 23, reward: 7000,
    blurb: 'Mateo wants his brother back. The three of them make the trade, and the crew makes the plan.',
    gold: [GOLD.time(600), GOLD.flawless(90), GOLD.lowStars(4)],
    unlock: (s) => send(s, 'Rosa', 'Mateo is gone, and so is my son\'s fear. Thank you. Whatever Crane does next, I stand behind you.'),
    stages: [
      function* (m): Gen { yield* m.cutscene('m23_trade'); },
      function* (m): Gen {
        m.noSwitch = false;
        const d = m.at('depot');
        const P = m.s.protagonists;
        P.put('teddy', d.x - 24, d.z + 14, 0);
        P.put('imani', d.x + 28, d.z + 30, 0);
        P.put('mack', d.x - 6, d.z + 36, 0);
        const truck = m.vehicle('truck', 'ridgeback', { x: d.x - 26, z: d.z + 20 }, { color: '#7a1f1f' });
        m.failIf('truck', () => truck.exploded, 'The ramming truck was destroyed.');
        yield* m.asChar('imani', 'Take the rooftop and cover the depot', 'Imani has the rifle');
        m.give('rifle', 140);
        m.say('pruitt', 'Mateo has eight men on the yard. Thin them out, Imani.');
        yield* squad(m, 'ms1', 'depot', [[-10, 4, 'rifle'], [10, 6, 'smg'], [0, 14, 'smg'], [-16, 16, 'pistol'], [16, 14, 'pistol'], [4, -10, 'rifle']], 'Pick off Mateo\'s men from the rooftop', { look: 'thug' });
      },
      function* (m): Gen {
        m.noSwitch = false;
        yield* m.asChar('teddy', 'Ram the blockade with the red truck', 'Teddy is by the gate');
        yield* m.enter('truck', 'Get in the truck');
        const d = m.at('depot');
        const gate = m.vehicle('gate', 'marlow', { x: d.x + 8, z: d.z - 14 }, { color: '#2a2a30', blip: false });
        m.objective('Smash the blockade');
        while (gate.health > 500 && !gate.exploded) yield;
      },
      function* (m): Gen {
        m.noSwitch = false;
        yield* m.asChar('mack', 'Take Tomas out of the depot', 'Mack has the getaway car');
        const d = m.at('depot');
        m.vehicle('car', 'veloce', { x: d.x + 4, z: d.z + 40 }, { color: '#1d2a44' });
        yield* m.enter('car', 'Get in the Veloce');
        m.say('tomas', 'My brother is not going to stop.');
        yield* m.escape(3, 'Mateo\'s men and the Task Force are on you: lose them');
        m.s.hostiles.spawn({ ...gm(m, m.playerPos(), 30, 20, 'rifle', { hp: 280, tag: 'mateo2', look: 'mateo' }) });
        yield* m.until(() => m.s.hostiles.alive('mateo2') === 0);
      },
    ],
  },
  {
    id: 'm24', title: 'Smoke Signals', char: 'imani', act: 2, giver: 'pruitt', after: ['m23'], start: 'imani.door', hour: 20, reward: 6000,
    blurb: 'Task Force fuel trucks keep Brandt\'s helicopters in the air. Imani grounds them.',
    gold: [GOLD.time(540), GOLD.accuracy(0.45), GOLD.flawless(60)],
    stages: [
      function* (m): Gen {
        const d = m.at('depot');
        m.vehicle('jeep', 'ridgeback', 'imani.door', { color: '#3a4a3a' });
        yield* m.enter('jeep', 'Take the Ridgeback to the depot');
        yield* m.goto({ x: d.x - 110, z: d.z + 60 }, 'Get to the ridge above the depot', { vehicle: 'jeep', r: 34 });
        for (let i = 0; i < 3; i++) m.vehicle(`fuel${i}`, 'ridgeback', { x: d.x + (i - 1) * 14, z: d.z + 10 }, { color: '#d9743a', blip: false });
        for (const [dx, dz] of [[-12, 4], [12, 6], [0, 20]] as [number, number][]) m.s.hostiles.spawn({ ...gm(m, 'depot', dx, dz, 'rifle', { tag: 'tfg', look: 'guard', hold: true }) });
        m.tags.add('tfg');
      },
      function* (m): Gen {
        m.give('rifle', 160);
        for (let i = 0; i < 3; i++) yield* m.destroy(`fuel${i}`, `Shoot the fuel trucks (${3 - i} left)`);
        m.say('pruitt', 'That is a very large fire. Leave. Now.');
        yield* m.kill('tfg', [], 'Finish the guards');
      },
      function* (m): Gen {
        const d = m.at('depot');
        const heli = m.craft('heli', 'sparrow', { x: d.x - 60, z: d.z + 70 }, { yaw: 0 });
        m.failIf('heli', () => heli.exploded, 'The Sparrow was destroyed.');
        m.objective('Take the Sparrow and get out');
        while (!m.playerFlying('heli')) yield;
        m.unblip('craft:heli');
        yield* m.land('heli', 'airport.apron', 'Fly to Valeria International and land', 140);
      },
    ],
  },
  {
    id: 'm25', title: 'High Water', char: 'mack', act: 2, giver: 'benny', after: ['m24'], start: 'mack.door', hour: 3, reward: 6000,
    blurb: 'A storm, the harbor, and Benny, stuck on the wrong side of the Task Force.',
    gold: [GOLD.time(480), GOLD.flawless(70), GOLD.lowStars(4)],
    stages: [
      function* (m): Gen {
        m.s.g.world.setWeather('storm');
        m.vehicle('car', 'veloce', 'mack.door', { color: '#1d2a44' });
        yield* m.enter('car', 'Take the Veloce to Dusk Harbor');
        yield* m.goto('harbor', 'Get to Dusk Harbor', { vehicle: 'car', r: 40 });
      },
      function* (m): Gen {
        m.draw();
        m.give('smg', 120);
        m.say('benny', 'They are sinking the pier to make it a crime scene. Marcus, please!');
        yield* squad(m, 'dk1', 'harbor', [[-16, 14, 'smg'], [18, 12, 'smg'], [0, 24, 'rifle'], [-12, -16, 'pistol'], [12, -18, 'pistol'], [26, 4, 'shotgun']], 'Clear the Task Force from the dock', TF);
      },
      function* (m): Gen { yield* m.cutscene('m25_benny'); },
      function* (m): Gen {
        chasers(m, ['c1', 'c2'], 'harbor', 'barrage', 108);
        m.limit('Get Benny out', 140, 'The Task Force cars caught you.');
        yield* m.goto('redline', 'Take Benny to Redline Customs', { vehicle: 'car', r: 18 });
        m.clearLimit();
        m.s.drivers.clear();
      },
    ],
  },
  {
    id: 'm26', title: 'Mama Jo', char: 'teddy', act: 2, giver: 'dex', after: ['m25'], start: 'taqueria', hour: 1, reward: 6000,
    blurb: 'Brandt\'s men come for the taqueria. Teddy has been fed here for a year.',
    gold: [GOLD.time(300), GOLD.flawless(60), GOLD.accuracy(0.4)],
    unlock: (s) => send(s, 'Dex', 'The bullet is still in the menu. She framed it. Teddy, she FRAMED it.'),
    stages: [
      function* (m): Gen { yield* m.cutscene('m26_mamajo'); },
      function* (m): Gen {
        m.draw();
        m.give('shotgun', 40);
        m.give('smg', 120);
        yield* squad(m, 'tj1', 'taqueria', [[-18, 14, 'smg'], [16, 12, 'pistol'], [0, 22, 'smg']], 'Hold the taqueria: wave one', TF);
      },
      function* (m): Gen {
        m.say('dex', 'More! More at the back! Teddy, behind you!');
        yield* squad(m, 'tj2', 'taqueria', [[-24, 4, 'shotgun'], [22, 8, 'smg'], [6, 26, 'rifle'], [-8, 28, 'pistol']], 'Wave two', TF);
      },
      function* (m): Gen { yield* m.cutscene('m26_after'); },
    ],
  },
  {
    id: 'm27', title: 'The Reveal', char: 'any', act: 2, giver: 'marisol', after: ['m26'], start: 'newsroom', hour: 6.5, reward: 9000,
    blurb: 'Marisol will broadcast the story. The Task Force has twenty minutes to stop her. So does Crane.',
    gold: [GOLD.time(720), GOLD.flawless(100), GOLD.lowStars(5)],
    unlock: (s) => { send(s, 'Pruitt', 'It aired. The city has questions, and Crane has an answer. Rest. The next part is the worst part.'); s.st.flags.act2 = true; },
    stages: [
      function* (m): Gen { yield* m.cutscene('m27_reveal'); },
      function* (m): Gen {
        m.noSwitch = false;
        const n = m.at('newsroom');
        const P = m.s.protagonists;
        P.put('imani', n.x + 40, n.z + 70, 0);
        P.put('teddy', n.x - 50, n.z + 30, 0);
        P.put('mack', n.x + 4, n.z + 8, 0);
        const ram = m.vehicle('ram', 'ridgeback', { x: n.x - 54, z: n.z + 42 }, { color: '#7a1f1f' });
        m.failIf('ram', () => ram.exploded, 'The truck was destroyed.');
        yield* m.asChar('teddy', 'Block the street with the red truck', 'Teddy is on the corner');
        yield* m.enter('ram', 'Get in the truck');
        yield* m.goto({ x: n.x + 8, z: n.z + 44 }, 'Park across the street to block the Task Force', { vehicle: 'ram', r: 12 });
        m.draw();
        yield* squad(m, 'rv1', 'newsroom', [[-6, 50, 'smg'], [8, 54, 'smg'], [0, 62, 'rifle']], 'Hold the door', TF);
      },
      function* (m): Gen {
        m.noSwitch = false;
        yield* m.asChar('imani', 'Cover the broadcast from the roof', 'Imani has the rifle');
        m.give('rifle', 160);
        yield* squad(m, 'rv2', 'newsroom', [[-30, 40, 'rifle'], [34, 44, 'rifle'], [0, 70, 'rifle'], [-18, 62, 'smg'], [20, 60, 'smg']], 'Take out the snipers and the second wave', TF);
      },
      function* (m): Gen {
        m.noSwitch = false;
        yield* m.asChar('mack', 'Stay with Marisol until she is on air', 'Mack is inside the studio');
        yield* m.hold('newsroom', 'Guard the broadcast', 14, { r: 12 });
      },
      function* (m): Gen { yield* m.cutscene('m27_end'); },
    ],
  },
];
