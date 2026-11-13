import { CHARS } from '../chars';
import { GOLD, type Gen, type MissionDef } from '../Missions';
import type { ActorDef, CutsceneDef, Line, Shot } from '../types';
import type { SiteCfg } from '../Sites';
import { GEO } from '../../world/heightfield';
import { HEAT } from '../../combat/Wanted';
import { chasers, squad } from './act2';

const lk = (id: string): ActorDef['look'] => (id in CHARS ? { char: id as 'mack' } : { cast: id });
const A = (id: string, at: [number, number], face?: number | string, aim = false): ActorDef => ({ id, look: lk(id), at, face, aim });
const L = (who: string, text: string): Line => ({ who, text });
const wide = (lines: Line[], o: Partial<Shot> = {}): Shot => ({ from: [0.4, 1.9, -7], to: [-0.2, 1.75, -5.6], look: [0, 1.4, 0], fov: 48, lines, ...o });
const close = (x: number, lines: Line[], o: Partial<Shot> = {}): Shot => ({ from: [x * 0.45 + 0.7, 1.62, -2.6], to: [x * 0.45 + 0.55, 1.64, -2.2], look: [x, 1.6, 0], fov: 32, lines, ...o });

/** The bank floor for the opening job: lobby, teller counter and a vault at the back. */
const BANK: SiteCfg = { id: 'pro_bank', name: 'Valeria Savings', w: 26, d: 20, vault: { w: 10, d: 6 }, cases: 0, cameras: 2, at: { x: GEO.salt.x - 170, z: GEO.salt.z + 90 }, tint: 0x2a6a8a };

/**
 * The opening of a new game: Valeria Savings, downtown, 2011. A daylight bank job with Ray and Benny that goes loud:
 * hold up the lobby, crack the vault, shoot your way past the first police on the street, outrun the cruisers with a
 * gun out of the window, and lift off from a rooftop-style helicopter pickup on the East Highway. It teaches walking,
 * shooting, driving, drive-by shooting and flying, and it can be skipped from the pause menu.
 */
export const PROLOGUE: MissionDef = {
  id: 'm00', title: 'Valeria Savings, 2011', kicker: 'Prologue', char: 'mack', act: 0, giver: 'ray', start: 'pro.van', hour: 15.5, reward: 0,
  hidden: true, noSummary: true,
  blurb: 'Nine years ago: a downtown bank, a helicopter on the highway, and the last job Mack ever drove.',
  gold: [GOLD.time(540), GOLD.accuracy(0.35), GOLD.flawless(70)],
  unlock: (s) => s.afterPrologue(),
  onQuit: (s) => { s.g.piloting && (s.g.piloting.autopilot = null); s.hud.setBars(false); s.afterPrologue(); },
  stages: [
    function* (m): Gen {
      yield* m.cutscene('p00_open');
    },
    // ---- into the bank ------------------------------------------------------------------------------------------
    function* (m): Gen {
      m.give('vc9', 60);
      m.give('smg', 180);
      m.g.combat?.vitals.addArmour(100);
      m.tip('Move with W A S D, look with the mouse, hold Shift to run. Follow the yellow marker.', 9);
      m.say('ray', 'Masks on. Mack, you are on the door, then the floor. Benny goes straight for the vault.');
      yield* m.goto('bank', 'Walk into Valeria Savings', { onFoot: true, r: 3.2, key: 'door' });
    },
    function* (m): Gen {
      const H = m.s.heists;
      const site = H.enter(BANK);
      m.onCleanup(() => H.dispose());
      while (H.transitioning) yield;
      const s = m.s;
      const hd = BANK.d / 2;
      m.tip('Hold the right mouse button to aim and the left to fire. R reloads, 1 holsters.', 9);
      m.say('mack', 'Everybody down! Nobody is a hero today!');
      yield* m.hold(site.at(0, -hd + 6), 'Hold up the lobby', 3, { r: 4, key: 'lobby', glyph: '!' });
      m.say('benny', 'Security, behind the counter! Two of them!');
      yield* m.kill('guards', [site.at(-6, 2), site.at(6, 3), site.at(0, 6)].map((p, i) => ({ ...p, kind: i === 2 ? 'pistol' as const : 'smg' as const, look: 'guard', hp: 70 })), 'Take down the bank security');
      s.hud.showBanner('Alarm', 'Silent alarm tripped', 'The police are on their way', 'bad', 3);
      m.say('ray', 'That was the silent alarm. Benny, how long?');
      m.say('benny', 'Forty seconds on the drill. Keep them off me.');
      const sv = site.spots.vault, vv = site.at(sv[0], sv[1]);
      // a second wave pushes in while the drill runs
      let wave = false, waveT = 0;
      m.each(() => {
        waveT += m.dt;
        if (!wave && waveT > 6) {
          wave = true;
          m.say('ray', 'Guards from the back office! Left side!');
          for (const [x, z] of [[-9, -2], [-8, 4], [9, -1]] as [number, number][]) s.hostiles.spawn({ ...site.at(x, z), kind: 'pistol', tag: 'wave', look: 'guard2', hp: 60 });
        }
      });
      yield* m.hold(vv, 'Cover Benny while he drills the vault', 14, { r: 7, key: 'vault' });
      site.openVault();
      m.say('benny', 'We are in! Grab the bags!');
      for (let i = 0; i < 2; i++) {
        const b = site.spots.bags[i]!, bp = site.at(b[0], b[1]);
        yield* m.hold(bp, 'Grab a cash bag', 1.4, { key: 'bag', glyph: '$' });
        m.stats.extra.take = (m.stats.extra.take ?? 0) + 105000;
      }
      const d = site.spots.door;
      m.say('ray', 'Two hundred and ten. Out the front, now!');
      yield* m.goto(site.at(d[0], d[1]), 'Get out of the bank', { onFoot: true, r: 2.2, key: 'exit' });
      H.leave();
      while (H.transitioning) yield;
      s.hostiles.clear();
    },
    // ---- the street -------------------------------------------------------------------------------------------
    function* (m): Gen {
      m.say('mack', 'Cruisers on the street! Get behind the cars!');
      m.tip('Crouch (C) behind cover. Shoot the officers to clear a path to the car.', 8);
      yield* squad(m, 'cops', 'bank', [[-12, 14, 'pistol'], [12, 15, 'pistol'], [-4, 22, 'shotgun'], [6, 24, 'pistol'], [-16, 26, 'smg'], [16, 27, 'pistol']], 'Fight off the police outside the bank', { look: 'officer', hp: 70 });
    },
    // ---- the getaway --------------------------------------------------------------------------------------------
    function* (m): Gen {
      const car = m.vehicle('car', 'veloce', 'pro.car', { color: '#14161c' });
      m.failIf('car', () => car.exploded, 'The getaway car was destroyed.');
      m.say('benny', 'The Veloce is round the corner! Go, go!');
      yield* m.enter('car', 'Get in the getaway car');
      const p = m.playerPos();
      m.g.wanted?.report(HEAT[3]! + 4, p.x, p.z, true);
      chasers(m, ['c1', 'c2'], 'pro.car', 'marlow', 118);
      m.say('ray', 'There is a helicopter waiting on the East Highway. Get us there in one piece.');
      m.tip('W / S drive, Space is the handbrake. Hold the RIGHT mouse button to lean out and aim, LEFT to shoot. Controller: hold LB to aim, RB to fire.', 14);
      yield* m.goto('pro.heli', 'Outrun the police to the helicopter', { vehicle: 'car', r: 30, sub: 'Shoot back at the cruisers' });
    },
    // ---- the lift-off ----------------------------------------------------------------------------------------------
    function* (m): Gen {
      const g = m.g;
      const heli = m.craft('heli', 'sparrow', m.at('pro.heli'), { blip: true });
      m.say('ray', 'Out of the car and into the bird! Mack, you can fly, right?');
      m.say('mack', 'I can fly. I cannot land.');
      m.objective('Get in the helicopter', 'Walk up to it and press E');
      g.map.setWaypoint({ x: heli.position.x, z: heli.position.z });
      while (!(g.piloting?.active && g.piloting.craft === heli)) yield;
      g.map.setWaypoint(null);
      // up and away: the police lose sight of a helicopter over the river
      g.wanted?.clear();
      m.s.drivers.clear();
      m.s.hud.setBars(true);
      m.objective('', '');
      const pilot = g.piloting!;
      pilot.autopilot = { fwd: 0, steer: 0, lift: 1 };
      m.onCleanup(() => { pilot.autopilot = null; m.s.hud.setBars(false); });
      m.say('benny', 'Ha! Look at them! Look at all of them!');
      yield* m.wait(3.2);
      pilot.autopilot = { fwd: 0.85, steer: 0.18, lift: 0.35 };
      m.say('ray', 'Mack. I am hit. It is... it is fine. Just fly.');
      yield* m.wait(4.5);
      pilot.autopilot = { fwd: 1, steer: 0, lift: 0.2 };
      m.say('mack', 'Hold on, Ray. We are nearly out.');
      yield* m.wait(3.5);
      // fade out over the river; the next thing Mack sees is the lighthouse field
      let landed = false;
      m.s.fadeThrough(() => {
        const L = m.at('pro.land');
        pilot.autopilot = null;
        heli.teleport(L.x + 9, m.ground(L.x + 9, L.z), L.z, 0);
        pilot.abort();
        g.player!.teleport(L.x, L.z, 0);
        m.s.hud.setBars(false);
        landed = true;
      }, 500);
      while (!landed) yield;
    },
    function* (m): Gen {
      yield* m.cutscene('p00_end');
    },
  ],
};

export const PROLOGUE_SCENES: Record<string, CutsceneDef> = {
  p00_open: {
    id: 'p00_open', anchor: 'pro.van', heading: 0, hour: 15.5,
    actors: [A('mack', [-1.6, 0], 'ray'), A('ray', [0.4, 0.4], 'mack'), A('benny', [2.4, 0.2], 'ray')],
    shots: [
      { from: [6, 5, -16], to: [3, 3.2, -11], look: [0, 1.5, 0], fov: 44, lines: [L('mack', 'Valeria. The spring of 2011. I was thirty-one, and I thought I was the best getaway driver on the coast.')] },
      wide([L('ray', 'Valeria Savings moves the armoured-truck cash on Thursdays. Two hundred grand sitting in one vault for one hour.'), L('benny', 'Forty seconds on the drill. I timed it twice.')]),
      close(-1.6, [L('mack', 'And the way out?'), L('ray', 'A friend of mine left a helicopter on the East Highway. You drive us there, you fly us out. Nobody follows a helicopter.')]),
      close(0.4, [L('ray', 'In, vault, out. Nobody gets clever.'), L('benny', 'Nobody ever gets clever, Ray.')]),
    ],
  },
  p00_end: {
    id: 'p00_end', anchor: 'pro.land', heading: 180, hour: 20.5,
    actors: [A('officer', [0, 3.2], 'mack', true), A('mack', [-1.2, 0], 'officer'), A('benny', [1.4, -0.4], 'officer'), A('ray', [2.8, -1.2], 'officer')],
    shots: [
      { from: [5, 2.2, -8], to: [3.6, 1.9, -6], look: [0, 1.5, 2], fov: 40, lines: [L('mack', 'I set it down in a field by the lighthouse. Ray was grey. Benny was still laughing.'), L('officer', 'Hands where I can see them. All of you.')] },
      close(0, [L('officer', 'One trooper, one helicopter, one bank. How much is in the bags?'), L('benny', 'Two hundred and ten.')], { look: [0, 1.6, 3.2], from: [-1.4, 1.62, 0.4], to: [-1.1, 1.64, 0.9] }),
      close(0, [L('officer', 'Leave the bags. Take him to a vet, not a hospital. I never saw a helicopter tonight.'), L('mack', 'Why would you do that?')], { look: [0, 1.6, 3.2], from: [1.2, 1.62, 0.2], to: [0.9, 1.64, 0.8] }),
      close(-1.2, [L('officer', 'Because one day I am going to need a driver. And you are going to remember who let you go.')]),
      { from: [0, 3.2, -9], to: [0, 6.4, -15], look: [0, 1.5, 4], fov: 50, lines: [L('mack', 'Ray did not make it to the vet. Benny bought a garage. I learned to park cars.'), L('mack', 'And for nine years, nobody came for me.')] },
    ],
  },
};

