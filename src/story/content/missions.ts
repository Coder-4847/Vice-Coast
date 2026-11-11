import { GOLD, type Gen, type MissionDef, type MissionRun } from '../Missions';
import type { HostileOpts } from '../Hostiles';
import type { Place } from '../types';
import { ACT2 } from './act2';
import { ACT3 } from './act3';
import { PROLOGUE } from './prologue';

/** A point near a place. */
const off = (m: MissionRun, p: Place, dx = 0, dz = 0): { x: number; z: number } => { const w = m.at(p); return { x: w.x + dx, z: w.z + dz }; };
type Gun = HostileOpts['kind'];
const gm = (m: MissionRun, p: Place, dx: number, dz: number, kind: Gun = 'pistol', more: Partial<HostileOpts> = {}): HostileOpts => ({ ...off(m, p, dx, dz), kind, ...more });
const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);
const send = (s: import('../Story').Story, from: string, text: string): void => s.g.commerce!.eco.message(from, text);

const ACT1: MissionDef[] = [
  // ================================================================================================ ACT I: MACK
  {
    id: 'm01', title: 'Valet', char: 'mack', act: 1, giver: 'pruitt', start: 'gala', hour: 19.5, reward: 1500,
    blurb: 'Mack parks cars at the Meridian Tower gala until a state investigator makes him an offer.',
    gold: [GOLD.time(360), { id: 'carcare', label: 'Deliver the Ridgeback undamaged', test: (s) => (s.extra.carHealth ?? 0) >= 950 }, GOLD.clean()],
    unlock: (s) => send(s, 'Pruitt', 'Good eyes tonight, Mr. Delgado. Stay reachable. I will have more for you.'),
    stages: [
      function* (m): Gen { yield* m.cutscene('m01_gala'); },
      function* (m): Gen {
        const suv = m.vehicle('suv', 'ridgeback', 'motors', { color: '#15171b' });
        m.failIf('suv', () => suv.exploded, 'Crane\'s Ridgeback was destroyed.');
        yield* m.enter('suv', 'Take Crane\'s Ridgeback from the Motors lot');
        yield* m.goto('gala', 'Bring the Ridgeback back to the gala', { vehicle: 'suv', r: 9 });
        m.stats.extra.carHealth = suv.health;
      },
      function* (m): Gen { yield* m.cutscene('m01_dropoff'); },
      function* (m): Gen {
        const suv = m.veh('suv');
        const g = m.at('gala');
        m.vehicle('tail', 'pico', { x: g.x + 9, z: g.z + 8 }, { color: '#2d6a9f' });
        yield* m.enter('tail', 'Take the Pico and follow Crane');
        const drv = m.drive('suv', () => m.at('harbor'), { kmh: 62, arrive: 16 });
        m.tip('Stay 20 to 90 metres behind the Ridgeback. Closer and his driver will spot you.', 8);
        let far = 0, close = 0;
        while (!drv.arrived) {
          const q = m.playerPos();
          const d = dist(q, suv.position);
          far = d > 170 ? far + m.dt : 0;
          close = d < 9 && suv.speed > 3 ? close + m.dt : 0;
          if (far > 7) m.abort('You lost Crane.');
          if (close > 4) m.abort('Crane\'s driver spotted you.');
          m.objective('Follow the Ridgeback', d > 110 ? 'You are falling behind' : d < 18 ? 'Too close: ease off' : 'Good: hold that distance');
          yield;
        }
        m.dispose('suv');
        yield* m.goto('harbor', 'Get eyes on the meeting', { vehicle: 'tail', r: 90 });
        yield* m.cutscene('m01_harbor');
      },
    ],
  },
  {
    id: 'm02', title: 'Old Debts', char: 'mack', act: 1, giver: 'benny', after: ['m01'], start: 'redline.yard', hour: 21.5, reward: 2200,
    blurb: 'Lazaro collectors lean on Benny at Redline Customs. Mack steps in.',
    gold: [GOLD.accuracy(0.45), GOLD.flawless(50), GOLD.time(330)],
    unlock: (s) => send(s, 'Benny', 'Marcus. Thank you. I mean it. Come by when your hands stop shaking.'),
    stages: [
      function* (m): Gen { yield* m.cutscene('m02_redline'); },
      function* (m): Gen {
        m.draw();
        m.tip('Aim with the right mouse button, fire with the left. Reload with R.', 8);
        yield* m.kill('w1', [gm(m, 'redline', 10, 9), gm(m, 'redline', -10, 11), gm(m, 'redline', 2, 17, 'smg')], 'Take down Mateo\'s men');
      },
      function* (m): Gen {
        m.say('mateo', 'You\'ll pay for that, old man! Get them! All of them!');
        yield* m.wait(1.5);
        yield* m.kill('w2', [gm(m, 'redline', 14, -8, 'shotgun'), gm(m, 'redline', -14, -6, 'smg'), gm(m, 'redline', 6, 20, 'smg'), gm(m, 'redline', -6, 22, 'pistol')], 'Finish them off');
      },
      function* (m): Gen { yield* m.escape(2, 'Someone called the police: lose them'); },
      function* (m): Gen { yield* m.cutscene('m02_after'); },
    ],
  },
  {
    id: 'm03', title: 'Slipstream', char: 'mack', act: 1, giver: 'benny', after: ['m02'], start: 'redline.yard', hour: 22.5, reward: 3000,
    blurb: 'Catch the Lazaro courier and take the ledger case, using everything Mack has behind the wheel.',
    gold: [GOLD.time(300), GOLD.flawless(60), GOLD.clean()],
    unlock: (s) => {
      send(s, 'Pruitt', 'You have something I want, and somebody else wants it more. Keep it safe.');
      s.unlockChar('imani');
      send(s, 'Pilar', 'New charter pilot looking for work at Valeria International. Her name is Imani. Be nice.');
    },
    stages: [
      function* (m): Gen {
        const r = m.at('redline');
        m.vehicle('car', 'veloce', { x: r.x + 11, z: r.z + 5 }, { color: '#1d2a44' });
        yield* m.enter('car', 'Take Benny\'s Veloce');
        m.tip('Slipstream (X): time slows while you drive and the car holds every drift. It recharges on its own.', 10);
        yield* m.goto('depot', 'Get to the Industrial Depot before the courier leaves', { vehicle: 'car', r: 130 });
      },
      function* (m): Gen {
        m.vehicle('courier', 'barrage', 'depot', { color: '#101216', glyph: '!' });
        const drv = m.drive('courier', () => m.at('harbor'), { kmh: 118, arrive: 25 });
        m.failIf('gone', () => drv.arrived, 'The courier got away.');
        m.say('benny', 'That\'s him! Black Barrage GT. Do not let him reach the harbor!');
        yield* m.destroy('courier', 'Wreck the courier\'s car');
        m.clearFails();
      },
      function* (m): Gen {
        const c = m.veh('courier');
        const spot = { x: c.position.x, z: c.position.z };
        yield* m.goto(spot, 'Grab the case from the wreck', { onFoot: true, r: 5 });
        yield* m.cutscene('m03_case');
      },
    ],
  },

  // ================================================================================================ ACT I: IMANI
  {
    id: 'm04', title: 'Charter', char: 'imani', act: 1, giver: 'pilar', after: ['m03'], start: 'imani.door', hour: 17.5, reward: 3500,
    blurb: 'Fly a sealed case from Valeria International to Isla Rojo. No questions.',
    gold: [GOLD.time(480), GOLD.flawless(0), GOLD.clean()],
    stages: [
      function* (m): Gen { yield* m.cutscene('m04_pilar'); },
      function* (m): Gen {
        const plane = m.craft('plane', 'skylark', 'airport.strip', { yaw: -Math.PI / 2 });
        m.failIf('plane', () => plane.exploded, 'The Skylark was destroyed.');
        m.objective('Board the Skylark at the end of the runway');
        m.route('airport.strip');
        while (!m.playerFlying('plane')) yield;
        m.unblip('craft:plane');
        m.clearRoute();
        m.tip('Throttle up, roll for speed, then ease the nose up to take off.', 9);
        yield* m.land('plane', 'island.strip', 'Fly to Isla Rojo and land on the airstrip', 320);
      },
      function* (m): Gen {
        m.objective('Climb out of the Skylark');
        while (m.g.piloting?.active) yield;
        yield* m.cutscene('m04_arrive');
      },
    ],
  },
  {
    id: 'm05', title: 'Overwatch', char: 'imani', act: 1, giver: 'imani', after: ['m04'], start: 'island.strip', hour: 18.3, reward: 3500,
    blurb: 'The buyer on Isla Rojo has a firing line instead of a payment. Imani takes the high ground.',
    gold: [GOLD.accuracy(0.5), GOLD.flawless(40), GOLD.time(420)],
    stages: [
      function* (m): Gen { yield* m.cutscene('m05_buyer'); },
      function* (m): Gen {
        m.give('rifle', 120);
        m.tip('Overwatch (X) slows time and locks your aim: perfect for long shots.', 10);
        yield* m.goto('island.ridge', 'Climb to the ridge', { onFoot: true, r: 7 });
      },
      function* (m): Gen {
        yield* m.kill('amb1', [gm(m, 'island.strip', -50, -30, 'rifle'), gm(m, 'island.strip', -20, 10, 'rifle'), gm(m, 'island.strip', 20, -10, 'smg'), gm(m, 'island.strip', 55, 20, 'smg'), gm(m, 'island.strip', 0, 40, 'rifle')], 'Take out the ambush from the ridge');
      },
      function* (m): Gen {
        m.say('mateo', 'Flush her out! Somebody get up that ridge!');
        const r = m.at('island.ridge');
        yield* m.kill('amb2', [gm(m, 'island.ridge', 40, 40, 'smg'), gm(m, 'island.ridge', 55, 10, 'smg'), gm(m, 'island.ridge', 30, 65, 'shotgun')].map((o) => ({ ...o })), 'Hold the ridge');
        void r;
      },
      function* (m): Gen {
        const plane = m.craft('plane2', 'skylark', 'island.strip', { yaw: -Math.PI / 2 });
        m.failIf('plane', () => plane.exploded, 'The Skylark was destroyed.');
        m.objective('Get to the Skylark on the airstrip');
        m.route('island.strip');
        while (!m.playerFlying('plane2')) yield;
        m.unblip('craft:plane2');
        m.clearRoute();
        yield* m.goto('airport.strip', 'Take off and get out of range', { r: 700 });
        yield* m.land('plane2', 'airport.strip', 'Land back at Valeria International', 320);
      },
      function* (m): Gen {
        m.objective('Climb out of the Skylark');
        while (m.g.piloting?.active) yield;
        yield* m.cutscene('m05_after');
      },
    ],
  },
  {
    id: 'm06', title: 'Dead Drop', char: 'imani', act: 1, giver: 'pilar', after: ['m05'], start: 'imani.door', hour: 11, reward: 3800,
    blurb: 'Get the binder to Marisol Vega at the Valeria Sun, with the Task Force on the road.',
    gold: [GOLD.time(300), GOLD.flawless(50), GOLD.lowStars(2)],
    unlock: (s) => {
      s.unlockChar('teddy');
      send(s, 'Marisol', 'I am reading all night. Whoever you are, thank you. Be careful who you tell.');
    },
    stages: [
      function* (m): Gen {
        const h = m.at('home.imani');
        m.vehicle('car', 'barrage', { x: h.x - 10, z: h.z - 8 }, { color: '#2a2d33' });
        yield* m.enter('car', 'Take the loaner Barrage');
        m.say('pilar', 'Two Task Force cars just pulled up outside. Go, go!');
        const t1 = m.vehicle('tf1', 'pico', { x: h.x + 50, z: h.z - 20 }, { color: '#142348', blip: false });
        const t2 = m.vehicle('tf2', 'pico', { x: h.x + 70, z: h.z + 30 }, { color: '#142348', blip: false });
        void t1; void t2;
        m.drive('tf1', () => m.playerPos(), { kmh: 120, aggressive: true });
        m.drive('tf2', () => m.playerPos(), { kmh: 120, aggressive: true });
        m.failIf('car', () => m.veh('car').exploded, 'Your car was destroyed.');
        yield* m.goto('newsroom', 'Deliver the binder to the Valeria Sun', { vehicle: 'car', r: 14 });
      },
      function* (m): Gen {
        m.s.drivers.clear();
        yield* m.cutscene('m06_marisol');
      },
      function* (m): Gen { yield* m.escape(3, 'The Task Force found you: lose them'); },
    ],
  },

  // ================================================================================================ ACT I: TEDDY
  {
    id: 'm07', title: 'Followers', char: 'teddy', act: 1, giver: 'dex', after: ['m06'], start: 'teddy.door', hour: 15.5, reward: 3000,
    blurb: 'A live stunt in the desert: one car, one ramp, one very long way down.',
    gold: [GOLD.time(240), { id: 'jump', label: 'Jump 55 metres or more', test: (s) => (s.extra.jump ?? 0) >= 55 }, GOLD.flawless(0)],
    stages: [
      function* (m): Gen { yield* m.cutscene('m07_teddy'); },
      function* (m): Gen {
        const t = m.at('home.teddy');
        const car = m.vehicle('stunt', 'barrage', { x: t.x + 9, z: t.z + 7 }, { color: '#c4202c' });
        m.failIf('car', () => car.exploded, 'The stunt car blew up.');
        yield* m.enter('stunt', 'Take the red Barrage');
        const rp = m.at('ramp');
        m.onCleanup(m.s.ramp(rp.x, rp.z, Math.PI / 2));
        yield* m.goto({ x: rp.x - 90, z: rp.z }, 'Line up at the start of the run', { vehicle: 'stunt', r: 14 });
        m.say('dex', 'The ramp is right ahead! Floor it, Teddy!');
        m.tip('Hold the throttle all the way down the run and hit the ramp straight on.', 10);
        m.objective('Jump Dead Man\'s Gap', 'Get airborne off the ramp and land 35 m or more away');
        let air = false;
        let from = { x: 0, z: 0 };
        let best = 0;
        while (best < 35) {
          const v = m.veh('stunt');
          const up = v.wheels.every((w) => !w.onGround);
          if (up && !air && v.position.x > rp.x + 2 && v.position.x < rp.x + 12) { air = true; from = { x: v.position.x, z: v.position.z }; }
          if (!up && air) {
            air = false;
            const d = dist(v.position, from);
            m.stats.extra.jump = Math.max(m.stats.extra.jump ?? 0, d);
            best = Math.max(best, d);
            if (d < 35) m.say('dex', `${Math.round(d)} metres. My nan jumps further. Go again!`);
          }
          // wrecked or far from the run: bring the car back round
          if (v.position.x > rp.x + 140) { v.teleport(rp.x - 85, Math.max(m.ground(rp.x - 85, rp.z), 0), rp.z, -Math.PI / 2); m.say('dex', 'Back to the start line!'); }
          yield;
        }
        m.say('dex', `${Math.round(best)} metres! You absolute lunatic!`);
        yield* m.wait(2);
      },
      function* (m): Gen { yield* m.cutscene('m07_jump'); },
    ],
  },
  {
    id: 'm08', title: 'Stash House', char: 'teddy', act: 1, giver: 'dex', after: ['m07'], start: 'cinder', hour: 17, reward: 3500,
    blurb: 'Dex\'s drone caught a Lazaro stash house. Teddy decides to say hello with fire.',
    gold: [GOLD.time(360), GOLD.flawless(80), GOLD.accuracy(0.35)],
    stages: [
      function* (m): Gen {
        const c = m.at('cinder');
        m.vehicle('truck', 'ridgeback', { x: c.x + 10, z: c.z + 6 }, { color: '#4a3a2a' });
        yield* m.enter('truck', 'Take Teddy\'s truck');
        m.draw();
        yield* m.goto('stash', 'Drive to the Lazaro stash house', { vehicle: 'truck', r: 110 });
      },
      function* (m): Gen {
        m.tip('Rampage (X): you take a fraction of the damage and blasts hit much harder.', 10);
        yield* m.kill('stash', [gm(m, 'stash', 10, 8, 'smg'), gm(m, 'stash', -9, 6, 'shotgun'), gm(m, 'stash', 18, -4, 'pistol'), gm(m, 'stash', -16, -8, 'smg'), gm(m, 'stash', 4, -18, 'rifle'), gm(m, 'stash', 25, 12, 'pistol'), gm(m, 'stash', -4, 22, 'smg')], 'Clear the stash house');
      },
      function* (m): Gen {
        m.vehicle('van1', 'ridgeback', off(m, 'stash', 6, -3), { color: '#e8e8e8', glyph: '✹' });
        m.vehicle('van2', 'ridgeback', off(m, 'stash', -6, -6), { color: '#e8e8e8', glyph: '✹' });
        m.objective('Blow up the stash vans', 'Shoot them until they burn');
        while (!(m.veh('van1').exploded && m.veh('van2').exploded)) yield;
        yield* m.wait(1.2);
      },
      function* (m): Gen { yield* m.cutscene('m08_boom'); },
    ],
  },
  {
    id: 'm09', title: 'Dust Up', char: 'teddy', act: 1, giver: 'dex', after: ['m08'], start: 'stash', hour: 18.2, reward: 3800,
    blurb: 'A Lazaro convoy follows the footage across the desert. Get Dex to Mama Jo\'s alive.',
    gold: [GOLD.time(130), GOLD.flawless(70), { id: 'truck', label: 'Keep the truck above half health', test: (s) => (s.extra.truckMin ?? 1000) >= 500 }],
    unlock: (s) => {
      s.unlockChar('teddy');
      send(s, 'Pruitt', 'Mr. Delgado, Ms. Cole, Mr. Vance: you have all been noticed. Meet me at the Boardwalk Studio. Come alone, and together.');
    },
    stages: [
      function* (m): Gen {
        const t = m.at('stash');
        const truck = m.vehicle('truck', 'ridgeback', { x: t.x + 12, z: t.z + 4 }, { color: '#4a3a2a' });
        m.stats.extra.truckMin = 1000;
        m.failIf('truck', () => truck.exploded || truck.health <= 0, 'The truck was destroyed.');
        yield* m.enter('truck', 'Get in the truck: Dex is waiting');
        m.say('dex', 'Teddy, there are three cars behind us! Three!');
        for (let i = 0; i < 3; i++) {
          m.vehicle(`ch${i}`, i === 0 ? 'barrage' : 'pico', { x: t.x - 80 - i * 22, z: t.z - 30 + i * 18 }, { color: i === 0 ? '#101216' : '#6a1f2a', blip: false });
          m.drive(`ch${i}`, () => m.playerPos(), { kmh: 125, aggressive: true });
        }
        m.limit('Reach Mama Jo\'s', 150, 'They caught you before you reached Mama Jo\'s.');
        const watch = (): void => { m.stats.extra.truckMin = Math.min(m.stats.extra.truckMin ?? 1000, truck.health); };
        const goto = m.goto('taqueria', 'Lose the convoy and reach Mama Jo\'s', { vehicle: 'truck', r: 16 });
        for (let r = goto.next(); !r.done; r = goto.next()) { watch(); yield; }
        m.clearLimit();
      },
      function* (m): Gen {
        m.s.drivers.clear();
        yield* m.cutscene('m09_mamajo');
      },
    ],
  },

  // ================================================================================================ ACT I: TOGETHER
  {
    id: 'm10', title: 'Three Roads', char: 'any', act: 1, giver: 'pruitt', after: ['m09'], start: 'mack.door', hour: 20, reward: 2000,
    blurb: 'Pruitt gathers all three at Mack\'s flat. Nobody trusts him; everybody takes the job.',
    gold: [GOLD.time(120)],
    stages: [
      function* (m): Gen {
        // everyone converges on the flat for the scene
        yield* m.cutscene('m10_meeting');
      },
    ],
    unlock: (s) => send(s, 'Pruitt', 'Midnight. The Industrial Depot. A Task Force evidence van. I will tell you what is in it afterwards.'),
  },
  {
    id: 'm11', title: 'Switch', char: 'any', act: 1, giver: 'pruitt', after: ['m10'], start: 'depot', hour: 23.4, reward: 4500,
    blurb: 'A Task Force evidence van: Teddy rams it, Imani covers from the ground, Mack drives it away. Swap with Z.',
    gold: [GOLD.time(480), GOLD.flawless(80), GOLD.lowStars(4)],
    stages: [
      function* (m): Gen { yield* m.cutscene('m11_plan'); },
      function* (m): Gen {
        m.noSwitch = false;
        const d = m.at('depot');
        const P = m.s.protagonists;
        P.put('teddy', d.x - 12, d.z + 8, 0);
        P.put('imani', d.x - 16, d.z + 12, 0);
        P.put('mack', d.x - 8, d.z + 12, 0);
        const truck = m.vehicle('truck', 'ridgeback', { x: d.x - 14, z: d.z + 18 }, { color: '#7a1f1f' });
        const van = m.vehicle('van', 'ridgeback', { x: d.x + 8, z: d.z - 14 }, { color: '#e4e6ea', blip: false });
        m.failIf('truck', () => truck.exploded, 'The ramming truck was destroyed.');
        m.failIf('van', () => van.exploded, 'The evidence van was destroyed.');
        yield* m.asChar('teddy', 'Take the red truck and ram the evidence van', 'Teddy is on the ground near the depot');
        yield* m.enter('truck', 'Get in the truck');
        m.drive('van', () => m.at('beach'), { kmh: 50, arrive: 18 });
        m.say('pruitt', 'There goes the van. Teddy, hit it hard and keep hitting it.');
        m.objective('Ram the van until it stops');
        while (van.health > 560) yield;
        m.s.drivers.stop(van);
        van.input.brake = 1;
      },
      function* (m): Gen {
        const van = m.veh('van');
        const vp = { x: van.position.x, z: van.position.z };
        const P = m.s.protagonists;
        const spot = m.s.snap(vp.x + 60, vp.z + 40, 1.5);
        P.put('imani', spot.x, spot.z, 0);
        yield* m.asChar('imani', 'Cover the team: pick off the escort', 'Imani has the rifle');
        m.give('rifle', 120);
        yield* m.kill('escort', [gm(m, vp, 7, 6, 'smg'), gm(m, vp, -7, 8, 'smg'), gm(m, vp, 10, -6, 'rifle'), gm(m, vp, -9, -7, 'rifle'), gm(m, vp, 0, 14, 'shotgun')], 'Shoot the escort');
      },
      function* (m): Gen {
        const van = m.veh('van');
        const mp = m.s.snap(van.position.x - 14, van.position.z + 10, 1.5);
        m.s.protagonists.put('mack', mp.x, mp.z, 0);
        yield* m.asChar('mack', 'Take the evidence van and drive it away', 'Mack is on foot beside the van');
        yield* m.enter('van', 'Get in the evidence van');
        m.say('pruitt', 'The Task Force is going to hear about this in about ten seconds. Drive!');
      },
    ],
  },
  {
    id: 'm12', title: 'Dead Ringers', char: 'mack', act: 1, giver: 'pruitt', after: ['m11'], start: 'depot', hour: 0.3, reward: 4500,
    blurb: 'Burn the van, shake the Task Force, and start planning the jeweller.',
    gold: [GOLD.time(420), GOLD.lowStars(4), GOLD.flawless(60)],
    unlock: (s) => {
      send(s, 'Pruitt', 'Calloway & Daughters on Marlowe Row. Open the heist board at the Boardwalk Studio when you are ready.');
      s.heists.unlock('h1');
    },
    stages: [
      function* (m): Gen {
        const d = m.at('depot');
        const van = m.vehicle('van', 'ridgeback', { x: d.x + 6, z: d.z - 10 }, { color: '#e4e6ea' });
        m.failIf('van', () => van.health <= 0 && !van.exploded, 'The van was wrecked before you reached the burn site.');
        yield* m.enter('van', 'Get in the evidence van');
        m.say('pruitt', 'Burn it somewhere nobody looks. The beach lot will do.');
        yield* m.escape(3, 'The Task Force is on you: lose them');
      },
      function* (m): Gen {
        yield* m.goto('lot', 'Drive the van to the beach lot', { vehicle: 'van', r: 18 });
        m.objective('Get out and burn the van', 'Shoot it until it explodes');
        while (m.playerIn('van')) yield;
        yield* m.destroy('van', 'Burn the van: shoot it');
        yield* m.wait(1.5);
      },
      function* (m): Gen { yield* m.cutscene('m12_end'); },
    ],
  },
];

export const MISSIONS: MissionDef[] = [PROLOGUE, ...ACT1, ...ACT2, ...ACT3];
