import type { Game } from '../Game';
import { BUSINESS_BY_ID } from '../economy/catalog';
import { money } from '../economy/Economy';
import { lookFor } from '../story/Figures';
import type { HostileOpts } from '../story/Hostiles';
import { GOLD, type Gen, type MissionDef, type MissionRun } from '../story/Missions';
import type { Place } from '../story/types';

/** Business jobs: police raids you defend, nightclub jobs and work for the cartel. Each is a repeatable mission. */

type XZ = { x: number; z: number };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
const dist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);

/** The business's door and the direction out into the street. */
function front(g: Game, id: string): { door: XZ; out: XZ; side: XZ } {
  const s = g.empire!.sites.get(id)!;
  const fx = s.door.x - s.x, fz = s.door.z - s.z, l = Math.hypot(fx, fz) || 1;
  return { door: { x: s.door.x, z: s.door.z }, out: { x: fx / l, z: fz / l }, side: { x: -fz / l, z: fx / l } };
}
/** A point `ahead` metres out of the door and `across` metres to the side. */
function outside(g: Game, id: string, ahead: number, across = 0): XZ {
  const f = front(g, id);
  return { x: f.door.x + f.out.x * ahead + f.side.x * across, z: f.door.z + f.out.z * ahead + f.side.z * across };
}
const dirty = (m: MissionRun, n: number, what: string): void => {
  const e = m.g.commerce!.eco;
  e.p.dirty += n;
  m.stats.extra.dirty = n;
  m.tip(`${what}: +${money(n)} in dirty money. Launder it through your legal businesses.`, 6);
};

// ================================================================================================ police raids

/** The police are about to raid one of your operations: drive them off, then lose the heat. */
export function raidMission(id: string): MissionDef {
  const d = BUSINESS_BY_ID[id]!;
  const men = d.type === 'cartel' ? 8 : d.type === 'lab' || d.type === 'print' ? 6 : 5;
  return {
    id: `biz_raid_${id}`, title: `Raid: ${d.name}`, char: 'any', act: 0, kicker: 'Business', hidden: true, activity: 'biz.raid',
    blurb: `The police are hitting ${d.name}. Fight them off and the stock is yours to keep.`,
    start: d.near, reward: 0,
    gold: [GOLD.flawless(60), GOLD.time(180), GOLD.noCivs()],
    onQuit: (s) => { s.g.empire?.applyRaid(id); },
    stages: [
      function* (m): Gen {
        const g = m.g;
        m.draw();
        m.vehicle('pc1', 'cruiser', outside(g, id, 16, -6), { color: '#f2f2f2', blip: false });
        m.vehicle('pc2', 'cruiser', outside(g, id, 18, 8), { color: '#f2f2f2', blip: false });
        const spawns: HostileOpts[] = [];
        for (let i = 0; i < men; i++) {
          const p = outside(g, id, 7 + (i % 3) * 4, (i - men / 2) * 2.6);
          spawns.push({ ...p, kind: i === 0 ? 'shotgun' : i % 3 === 1 ? 'smg' : d.type === 'cartel' && i % 2 ? 'rifle' : 'pistol', look: i % 2 ? 'officer' : 'guard', hp: 90, armour: d.type === 'cartel' ? 40 : 0 });
        }
        m.say('officer', `Police! Nobody move! We have a warrant for ${d.name}!`);
        yield* m.kill('raid', spawns, `Drive off the police raid on ${d.name}`);
      },
      function* (m): Gen {
        yield* m.escape(2, 'More units are on the way: lose the cops');
        m.g.empire?.raidDefended(id);
        m.stats.extra.win = 1;
      },
    ],
  };
}

// ================================================================================================ the nightclub

const VIPS: [string, string, string][] = [
  ['vip1', 'Jaxon Reign', 'Is this the ride? Nice. Do not drive like my last driver. He is in jail now.'],
  ['vip2', 'Sienna Cortez', 'If there are cameras, lose them. If there are no cameras, find some. I am kidding. Mostly.'],
  ['vip3', 'Ronnie Blaze', 'Three nights, three cities. Tonight better be the good one.'],
];
const PICKUPS: Place[] = ['airport.gate', 'tower', 'marlowe', 'harbor', 'gala', 'highway.east'];

export interface ClubJob { id: string; title: string; blurb: string; make: (clubId: string) => MissionDef }

function vipMission(clubId: string): MissionDef {
  const [voice, name, line] = pick(VIPS);
  return {
    id: 'biz_club_vip', title: `VIP: ${name}`, char: 'any', act: 0, kicker: 'The Velvet Room', hidden: true, activity: 'biz.club',
    blurb: `${name} wants to party at your club tonight. Pick them up in the club's Huntley and lose the photographers.`,
    start: BUSINESS_BY_ID[clubId]!.near, reward: 0,
    gold: [{ id: 'limo', label: 'Bring the Huntley back almost unscratched', test: (s) => (s.extra.hp ?? 0) >= 850 }, GOLD.clean(), GOLD.time(300)],
    stages: [
      function* (m): Gen {
        m.vehicle('limo', 'huntley', outside(m.g, clubId, 9, 4), { color: '#0d0d10' });
        m.say('nadia', `${name} is in town and wants a table. Take the Huntley, pick them up, and drive like you are carrying eggs.`);
        yield* m.enter('limo', 'Take the club\'s Huntley');
      },
      function* (m): Gen {
        const here = m.playerPos();
        const far = PICKUPS.map((p) => ({ p, w: m.at(p) })).filter((x) => dist(x.w, here) > 350 && dist(x.w, here) < 2200);
        const at = (far.length ? pick(far) : { p: PICKUPS[0]!, w: m.at(PICKUPS[0]!) }).w;
        m.s.figures.spawn('vip', lookFor({ cast: voice }), at.x, at.z, 0);
        m.failIf('limo', () => m.veh('limo').exploded || m.veh('limo').health < 250, `${name} refused to get into a wreck.`);
        yield* m.goto(at, `Pick up ${name}`, { vehicle: 'limo', r: 10, glyph: '★', color: '#ffd166' });
        m.s.figures.remove('vip');
        m.say(voice, line);
        yield* m.wait(0.6);
      },
      function* (m): Gen {
        const club = outside(m.g, clubId, 8);
        const secs = Math.round(dist(m.playerPos(), club) / 10 + 45);
        m.limit('Party', secs, `${name} got bored and went to another club.`);
        // the photographers
        const p = m.playerPos();
        ['pap1', 'pap2'].forEach((n, i) => {
          m.vehicle(n, i ? 'vandal' : 'pico', { x: p.x - 25 - i * 10, z: p.z - 20 }, { color: i ? '#d83a2a' : '#f2f2f2', blip: false });
          m.drive(n, () => m.playerPos(), { kmh: 105 });
        });
        m.tip('Paparazzi! Shake them off on the way: stay ahead and do not wreck the car.', 5);
        yield* m.goto(club, 'Take them to The Velvet Room', { vehicle: 'limo', r: 10, glyph: '♫', color: '#ff4a9a' });
        const left = m.timeLeft;
        m.clearLimit();
        const hp = m.veh('limo').health;
        m.stats.extra.hp = hp;
        const tip = Math.round(Math.max(0, left / secs) * 2500 * (hp / 1000));
        m.stats.extra.payout = 3000 + tip;
        m.g.empire?.boost(clubId, 15);
        m.say(voice, 'Now that is an entrance. I will tell everyone.');
        m.tip(`${name} is inside: popularity +15. Fee ${money(3000)} + tip ${money(tip)}.`, 5);
        m.stats.extra.win = 1;
        yield* m.wait(1);
      },
    ],
  };
}

function troubleMission(clubId: string): MissionDef {
  return {
    id: 'biz_club_trouble', title: 'Trouble at the Door', char: 'any', act: 0, kicker: 'The Velvet Room', hidden: true, activity: 'biz.club',
    blurb: 'A Southside crew is shaking down your queue and scaring off the customers. Make them leave.',
    start: BUSINESS_BY_ID[clubId]!.near, reward: 0,
    gold: [GOLD.flawless(40), GOLD.accuracy(0.4), GOLD.noCivs()],
    stages: [
      function* (m): Gen {
        m.say('nadia', 'There is a crew outside taking money off my queue. The bouncers will not touch them. You will.');
        m.draw();
        const g = m.g;
        const spawns: HostileOpts[] = [0, 1, 2, 3, 4].map((i) => ({ ...outside(g, clubId, 10 + (i % 2) * 5, (i - 2) * 3.4), kind: i === 2 ? 'shotgun' : i % 2 ? 'smg' : 'pistol', look: 'thug', hp: 80 }));
        m.vehicle('ride', 'stallion', outside(g, clubId, 19, -5), { color: '#5a1a1a', blip: false });
        yield* m.kill('trouble', spawns, 'Get rid of the crew outside the club');
        g.empire?.boost(clubId, 10);
        m.stats.extra.payout = 1500;
        m.stats.extra.win = 1;
        m.say('nadia', 'The queue is back. Drinks are on the house. Not for you, for them.');
        yield* m.wait(1);
      },
    ],
  };
}

export const CLUB_JOBS: ClubJob[] = [
  { id: 'vip', title: 'VIP pickup', blurb: 'Collect a celebrity in the club\'s Huntley and get them to the door in style. Popularity +15, $3,000 and a tip.', make: vipMission },
  { id: 'trouble', title: 'Trouble at the door', blurb: 'A crew is shaking down your queue. Clear them out. Popularity +10, $1,500.', make: troubleMission },
];

// ================================================================================================ the cartel

export interface CartelJob { id: string; title: string; blurb: string; pay: number; make: (id: string) => MissionDef }

function haulMission(id: string): MissionDef {
  const pay = 60000;
  return {
    id: 'biz_cartel_haul', title: 'Inland Run', char: 'any', act: 0, kicker: 'Coastline Import', hidden: true, activity: 'biz.cartel', giver: 'calderon',
    blurb: 'A van full of product has to reach the Lazaro stash house in Cinder Flats before the buyers lose patience.',
    start: BUSINESS_BY_ID[id]!.near, reward: 0,
    gold: [GOLD.time(330), { id: 'van', label: 'Deliver the van with over 60% health', test: (s) => (s.extra.hp ?? 0) >= 600 }, GOLD.lowStars(2)],
    stages: [
      function* (m): Gen {
        m.vehicle('van', 'courier', outside(m.g, id, 10, 5), { color: '#3a3f46' });
        m.say('calderon', 'The van is loaded. Cinder Flats, the stash house past the tracks. Nobody stops you, nobody opens the back.');
        yield* m.enter('van', 'Get in the loaded van');
      },
      function* (m): Gen {
        const to = m.at('stash');
        const secs = Math.round(dist(m.playerPos(), to) / 12 + 60);
        m.limit('Delivery', secs, 'The buyers left. The deal is off.');
        m.failIf('van', () => m.veh('van').exploded, 'The van went up in flames, and the product with it.');
        let chased = false;
        m.each(() => {
          if (chased || m.timeLeft > secs - 40) return;
          chased = true;
          const p = m.playerPos();
          ['r1', 'r2'].forEach((n, i) => {
            m.vehicle(n, i ? 'barrage' : 'stallion', { x: p.x - 40 - i * 14, z: p.z - 30 }, { color: '#2a2a30', blip: false });
            m.drive(n, () => m.playerPos(), { kmh: 118, aggressive: true });
          });
          m.say('calderon', 'You have company. The Lazaros know about the van. Do not let them stop you.');
        });
        yield* m.goto(to, 'Drive the van to the Cinder Flats stash house', { vehicle: 'van', r: 12, glyph: '▣', color: '#e8b84a' });
        m.clearLimit();
        m.stats.extra.hp = m.veh('van').health;
        dirty(m, pay, 'Delivered');
        m.stats.extra.win = 1;
        yield* m.wait(1);
      },
    ],
  };
}

function ripMission(id: string): MissionDef {
  const pay = 45000;
  return {
    id: 'biz_cartel_rip', title: 'Rip-off', char: 'any', act: 0, kicker: 'Coastline Import', hidden: true, activity: 'biz.cartel', giver: 'calderon',
    blurb: 'A rival crew is sitting on a shipment by the Cinder Flats rail siding. Take it from them.',
    start: BUSINESS_BY_ID[id]!.near, reward: 0,
    gold: [GOLD.flawless(80), GOLD.accuracy(0.45), GOLD.lowStars(3)],
    stages: [
      function* (m): Gen {
        m.say('calderon', 'The Lazaro crew keeps a shipment at the rail siding in Cinder Flats. It was ours first. Bring it home.');
        m.give('rifle', 120);
        yield* m.goto('rail.siding', 'Go to the rail siding in Cinder Flats', { r: 60, glyph: '✦', color: '#ff6a6a' });
      },
      function* (m): Gen {
        m.draw();
        const w = m.at('rail.siding');
        const spawns: HostileOpts[] = [[8, 6, 'rifle'], [-9, 4, 'smg'], [4, -10, 'pistol'], [-6, -8, 'shotgun'], [14, -2, 'smg'], [-14, 10, 'rifle']]
          .map(([dx, dz, k]) => ({ x: w.x + (dx as number), z: w.z + (dz as number), kind: k as HostileOpts['kind'], hp: 85 }));
        yield* m.kill('rip', spawns, 'Take out the Lazaro crew');
      },
      function* (m): Gen {
        yield* m.hold(m.at('rail.siding'), 'Load the shipment', 4);
        m.say('calderon', 'Good. Now get out of there before the sheriff wakes up.');
        yield* m.escape(2, 'Lose the sheriff');
        dirty(m, pay, 'Shipment recovered');
        m.stats.extra.win = 1;
      },
    ],
  };
}

function ratMission(id: string): MissionDef {
  const pay = 35000;
  return {
    id: 'biz_cartel_rat', title: 'Loose Lips', char: 'any', act: 0, kicker: 'Coastline Import', hidden: true, activity: 'biz.cartel', giver: 'calderon',
    blurb: 'One of the dock crew is driving to the police with a notebook. He does not get there.',
    start: BUSINESS_BY_ID[id]!.near, reward: 0,
    gold: [GOLD.time(150), GOLD.noCivs(), GOLD.lowStars(2)],
    stages: [
      function* (m): Gen {
        const here = m.playerPos();
        const start = m.s.snap(here.x + 160, here.z + 120, 3.4);
        const dest = m.at('marlowe');
        m.vehicle('rat', 'stanza', start, { color: '#8a8a7a', glyph: '✖' });
        m.say('calderon', 'Ruiz is on his way to the precinct with everything he knows written down. Stop the car. I do not care how.');
        const drv = m.drive('rat', () => dest, { kmh: 95, arrive: 18 });
        m.failIf('rat', () => drv.arrived, 'Ruiz made it to the police. The warehouse will be busy tomorrow.');
        m.draw();
        yield* m.destroy('rat', 'Stop Ruiz before he reaches the police');
        m.s.drivers.stop(m.veh('rat'));
        dirty(m, pay, 'Problem solved');
        m.stats.extra.win = 1;
        yield* m.wait(1);
      },
    ],
  };
}

export const CARTEL_JOBS: CartelJob[] = [
  { id: 'haul', title: 'Inland run', blurb: 'Drive a loaded van to Cinder Flats against the clock. Rivals will try to stop it.', pay: 60000, make: haulMission },
  { id: 'rip', title: 'Rip-off', blurb: 'Hit a rival crew at the rail siding and take their shipment.', pay: 45000, make: ripMission },
  { id: 'rat', title: 'Loose lips', blurb: 'An informant is driving to the police. Stop his car.', pay: 35000, make: ratMission },
];
