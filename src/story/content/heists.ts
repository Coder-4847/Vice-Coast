import { HEAT } from '../../combat/Wanted';
import { GOLD, type Gen, type MissionDef, type MissionRun } from '../Missions';
import type { SiteCfg } from '../Sites';
import type { Place } from '../types';

export type Approach = 'loud' | 'quiet' | 'smart';
export const APPROACHES: Approach[] = ['loud', 'quiet', 'smart'];

export interface CrewDef {
  id: string;
  name: string;
  role: string;
  /** Share of the take. */
  cut: number;
  effect: string;
  /** Story flag or mission that unlocks them. */
  needs: { mission?: string; heist?: string };
}

export const CREW: CrewDef[] = [
  { id: 'benny', name: 'Benny Okonkwo', role: 'Driver', cut: 0.08, effect: 'Knows every back road: one fewer wanted star when you leave.', needs: { mission: 'm02' } },
  { id: 'dex', name: 'Dex Quill', role: 'Lookout', cut: 0.05, effect: 'Watches the floor: unaware guards notice you from 30% less distance.', needs: { mission: 'm09' } },
  { id: 'silas', name: 'Silas Quinn', role: 'Hacker', cut: 0.1, effect: 'Loops the cameras (they see 60% less) and cuts vault times by a third.', needs: { heist: 'h1' } },
];

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
];

export const HEIST_PREPS: MissionDef[] = [
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
];


// ------------------------------------------------------------------------------------------------ the heist itself

export interface ExecOpts { approach: Approach; crew: string[]; prepDone: string[] }

/** Build the mission for one heist run with the chosen approach, crew and finished prep. */
export function execMission(h: HeistDef, o: ExecOpts): MissionDef {
  const { approach, crew } = o;
  const has = (p: string): boolean => o.prepDone.includes(p);
  const hack = crew.includes('silas');
  const ctx = { alarm: false, pending: 0, take: 0, bags: 0, cases: 0, policeT: 0, spotted: 0 };
  const total = h.site.cases * h.caseValue + 3 * h.bagValue;
  const camScale = (has('h1_codes') || has('h2_hack') ? 0 : 1) * (hack ? 0.4 : 1);
  const vaultScale = (hack ? 0.67 : 1) * (approach === 'loud' && (has('h1_van') || has('h2_charges')) ? 0.6 : 1);
  const seeScale = (crew.includes('dex') ? 0.7 : 1) * ((has('h1_uniforms') || has('h2_pass') || has('h2_scout')) ? 0.6 : 1);
  const starsOff = crew.includes('benny') ? 1 : 0;

  return {
    id: `${h.id}_${approach}`, title: `${h.name}`, char: 'any', act: 2, giver: 'pruitt', start: 'home.mack', hidden: true,
    hour: h.hour[approach], reward: 0, noReward: true,
    blurb: h.blurb,
    gold: [
      GOLD.time(h.par[approach]),
      approach === 'loud' ? GOLD.flawless(70) : GOLD.stealth(),
      { id: 'all', label: 'Take everything', test: (s) => (s.extra.take ?? 0) >= total },
    ],
    unlock: (s) => s.heists.onDone(h, approach, crew),
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
          yield* m.hold({ x: c.x, z: c.z }, approach === 'loud' ? 'Smash the display case' : 'Pick the display case lock', approach === 'loud' ? 2.2 : 3.8, { key: 'case', glyph: '◆' });
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
          yield* m.hold(oo, 'Take the manager\'s keycard', 4, { key: 'card' });
          yield* m.hold(vv, 'Swipe the keycard at the vault', 3 * vaultScale, { key: 'vault' });
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
        // the split
        const cuts = crew.reduce((a, id) => a + (CREW.find((c) => c.id === id)?.cut ?? 0), 0);
        const perf = ctx.alarm ? 0.9 : 1.1;
        const net = Math.round(ctx.take * perf * (1 - cuts));
        m.stats.extra.payout = net;
        m.stats.extra.gross = ctx.take;
        m.stats.extra.cuts = Math.round(ctx.take * perf * cuts);
        m.s.heists.lastResult = { gross: ctx.take, perf, cuts: Math.round(ctx.take * perf * cuts), net, alarm: ctx.alarm };
        yield* m.cutscene(h.done);
      },
    ],
  };
}

export const HEIST_MISSIONS: MissionDef[] = [...HEIST_PREPS];
