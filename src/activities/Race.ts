import type { Gen, GoldDef, MissionDef, MissionRun } from '../story/Missions';
import { terrainHeight } from '../world/Terrain';
import { money } from '../economy/Economy';

export type RaceMode = 'car' | 'bike' | 'boat' | 'air';

/** One race: where it starts, the points it goes through, what you drive and who you race. */
export interface RaceSrc {
  id: string;
  /** Activity id (`race.*`) it counts toward. */
  act: string;
  title: string;
  blurb: string;
  mode: RaceMode;
  /** Vehicle (car, bike) or craft (boat, plane) spec for the player. */
  spec: string;
  /** Rival car specs. Boats, bikes and planes are timed against `par` instead. */
  rivals?: string[];
  /** Cruising speed of the rivals (km/h). */
  kmh?: number;
  /** Rough route: the start, then every point to pass. Cars follow roads between them. */
  via: [number, number][];
  /** Aim the grid this way (radians, forward = (sin, cos)); defaults to along the first leg. */
  yaw?: number;
  laps?: number;
  /** Target time in seconds: the time-trial goal and the gold time. */
  par: number;
  /** Top prize. */
  reward: number;
  /** Air gates fly this far above the ground. */
  alt?: number;
  /** Gate radius override (m). */
  rad?: number;
}

const MODE_LABEL: Record<RaceMode, string> = { car: 'Street', bike: 'Bike', boat: 'Boat', air: 'Air' };
void MODE_LABEL;

export interface Course {
  /** Checkpoints, in order, for one lap. */
  pts: [number, number][];
  start: { x: number; z: number; yaw: number };
  length: number;
}

/** Turn a rough route into checkpoints: along the real roads for cars and bikes, straight lines for boats and planes. */
export function buildCourse(m: MissionRun, src: RaceSrc): Course {
  const via = src.via;
  const pts: [number, number][] = [];
  let length = 0;
  if (src.mode === 'car' || src.mode === 'bike') {
    const router = m.g.map.router;
    const poly: [number, number][] = [];
    for (let i = 0; i + 1 < via.length; i++) {
      const r = router.route(via[i]![0], via[i]![1], via[i + 1]![0], via[i + 1]![1]);
      for (const q of r.pts) {
        const last = poly[poly.length - 1];
        if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 1) poly.push(q);
      }
    }
    // one checkpoint every ~110 m along the polyline, and one at the very end
    const step = 110;
    let acc = 0;
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1]!, b = poly[i]!;
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      length += seg;
      acc += seg;
      if (acc >= step && i < poly.length - 1) { pts.push([b[0], b[1]]); acc = 0; }
    }
    const end = poly[poly.length - 1]!;
    pts.push([end[0], end[1]]);
    const a = poly[0]!, b = poly[Math.min(poly.length - 1, 2)]!;
    return { pts, start: { x: a[0], z: a[1], yaw: src.yaw ?? Math.atan2(b[0] - a[0], b[1] - a[1]) }, length };
  }
  for (let i = 1; i < via.length; i++) { pts.push([via[i]![0], via[i]![1]]); length += Math.hypot(via[i]![0] - via[i - 1]![0], via[i]![1] - via[i - 1]![1]); }
  const a = via[0]!, b = via[1]!;
  return { pts, start: { x: a[0], z: a[1], yaw: src.yaw ?? Math.atan2(b[0] - a[0], b[1] - a[1]) }, length };
}

const GOLD_RACE = (src: RaceSrc): GoldDef[] => {
  const t = Math.round(src.par);
  const out: GoldDef[] = [];
  if (src.rivals?.length) out.push({ id: 'win', label: 'Win the race', test: (s) => s.extra.win === 1 });
  out.push({ id: 'par', label: `Finish under ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, test: (s) => (s.extra.raceTime ?? 1e9) <= t });
  out.push({ id: 'clean', label: 'No police attention', test: (s) => s.maxStars === 0 });
  return out;
};

interface Rival { name: string; idx: number; done: boolean; finish: number; speed: number }

/** The mission definition for a race. The prize is paid from `extra.payout`, so replays pay in full. */
export function raceMission(src: RaceSrc): MissionDef {
  return {
    id: `r_${src.id}`, title: src.title, char: 'any', act: 0, blurb: src.blurb, start: { x: src.via[0]![0], z: src.via[0]![1] },
    gold: GOLD_RACE(src), reward: 0, activity: src.act, meta: src,
    stages: [
      function* (m): Gen { yield* grid(m, src); },
      function* (m): Gen { yield* run(m, src); },
    ],
  };
}

const forward = (yaw: number): [number, number] => [Math.sin(yaw), Math.cos(yaw)];
const rightOf = (yaw: number): [number, number] => [Math.cos(yaw), -Math.sin(yaw)];

function* grid(m: MissionRun, src: RaceSrc): Gen {
  const c = buildCourse(m, src);
  m.stats.extra.length = c.length;
  const air = src.mode === 'air' || src.mode === 'boat';
  const pos = { x: c.start.x, z: c.start.z };
  if (src.mode === 'air') {
    const s = m.craft('race', src.spec, 'airport.strip', { yaw: -Math.PI / 2 });
    void s;
    yield* m.until(() => m.playerFlying('race') || (m.objective(`Climb into the ${src.spec === 'rook' ? 'Rook' : 'plane'}`), false));
  } else if (air) {
    m.craft('race', src.spec, pos, { yaw: c.start.yaw });
    yield* m.until(() => m.playerFlying('race') || (m.objective('Get in the boat'), false));
  } else {
    m.vehicle('race', src.spec, pos, { yaw: c.start.yaw + Math.PI });
    yield* m.enter('race', 'Get in the race car');
  }
  // rivals take the grid behind and beside the player
  const f = forward(c.start.yaw), r = rightOf(c.start.yaw);
  (src.rivals ?? []).forEach((spec, i) => {
    const back = 6.5 * (Math.floor(i / 2) + 1), side = (i % 2 ? 1 : -1) * 2.8;
    m.vehicle(`rival${i}`, spec, { x: pos.x - f[0] * back + r[0] * side, z: pos.z - f[1] * back + r[1] * side }, { yaw: c.start.yaw + Math.PI, blip: false });
  });
  yield* m.wait(0.5);
}

function* run(m: MissionRun, src: RaceSrc): Gen {
  const g = m.g, s = m.s;
  const c = buildCourse(m, src);
  const laps = src.laps ?? 1;
  const total = c.pts.length * laps;
  const cp = (i: number): [number, number] => c.pts[i % c.pts.length]!;
  const rad = src.rad ?? (src.mode === 'air' ? 60 : src.mode === 'boat' ? 30 : 17);
  const alt = src.alt ?? 90;
  const field = (src.rivals ?? []).length;

  // countdown with the player free to sit on the line
  m.objective('Get ready');
  for (const n of ['3', '2', '1']) { s.hud.showBanner(src.title, n, '', 'neutral', 0.9); yield* m.wait(1); }
  s.hud.showBanner(src.title, 'GO!', '', 'good', 1.2);

  const rivals: Rival[] = [];
  (src.rivals ?? []).forEach((_, i) => {
    const name = `rival${i}`;
    const rv: Rival = { name, idx: 0, done: false, finish: 0, speed: (src.kmh ?? 100) * (0.94 + 0.04 * i) };
    rivals.push(rv);
    m.drive(name, () => (rv.idx >= total ? null : { x: cp(rv.idx)[0], z: cp(rv.idx)[1] }), { kmh: rv.speed, aggressive: false });
  });

  let idx = 0;
  let t = 0;
  let place = 0;
  const playerPoint = (): { x: number; z: number; y: number } => {
    const crf = g.piloting?.active ? g.piloting.craft : null;
    if (crf) return { x: crf.position.x, z: crf.position.z, y: crf.position.y };
    const p = m.playerPos();
    return { x: p.x, z: p.z, y: 0 };
  };
  const showCp = (): void => {
    const [x, z] = cp(idx);
    const last = idx === total - 1;
    m.blip('cp', { x, z }, { color: last ? '#ffffff' : '#ffd166', glyph: last ? '⚑' : '◎', name: last ? 'Finish' : `Checkpoint ${idx + 1}`, r: rad / 4.5, tall: src.mode === 'air' ? 220 : 12 });
    if (idx + 1 < total) { const [nx, nz] = cp(idx + 1); m.blip('cp2', { x: nx, z: nz }, { color: '#9aa3b5', glyph: '·', name: 'Next', r: 1.4, tall: src.mode === 'air' ? 120 : 5 }); } else m.unblip('cp2');
    s.setWaypoint(x, z);
  };
  const progress = (px: number, pz: number, i: number): number => {
    if (i >= total) return total + 1;
    const [x, z] = cp(i);
    const [lx, lz] = i === 0 ? [c.start.x, c.start.z] : cp(i - 1);
    const leg = Math.max(30, Math.hypot(x - lx, z - lz));
    return i + 1 - Math.min(1, Math.hypot(x - px, z - pz) / leg);
  };
  showCp();

  m.failIf('wreck', () => (src.mode === 'car' || src.mode === 'bike' ? m.veh('race').exploded : (m.craftOf('race').exploded ?? false)), 'Your ride was wrecked.');
  m.limit('Time limit', Math.round(src.par * laps * 2.6) + 40, 'You took too long.');

  // rivals move on as they pass their checkpoints, and the pack is kept honest: whoever is far ahead of the player eases off
  m.each(() => {
    const me = playerPoint();
    const mine = progress(me.x, me.z, idx);
    for (const rv of rivals) {
      if (rv.done) continue;
      const v = m.veh(rv.name);
      if (rv.idx < total && Math.hypot(v.position.x - cp(rv.idx)[0], v.position.z - cp(rv.idx)[1]) < 24) rv.idx++;
      if (rv.idx >= total) { rv.done = true; rv.finish = t; s.drivers.stop(v); continue; }
      const gap = progress(v.position.x, v.position.z, rv.idx) - mine;
      const d = s.drivers.driverOf(v);
      if (d) d.o.kmh = Math.max(60, Math.min(rv.speed * 1.12, rv.speed * (1 - Math.max(-0.5, Math.min(0.4, gap * 0.045)))));
    }
  });

  while (idx < total) {
    t += 1 / 60;
    const me = playerPoint();
    const [x, z] = cp(idx);
    const dy = src.mode === 'air' ? Math.abs(me.y - (terrainHeight(x, z) + alt)) : 0;
    if (Math.hypot(me.x - x, me.z - z) < rad && dy < 70) {
      idx++;
      if (idx < total) { s.hud.showTip(`Checkpoint ${idx}/${total}`, 1); showCp(); }
    }
    const mine = progress(me.x, me.z, idx);
    let ahead = 0;
    for (const rv of rivals) if (rv.done || progress(m.veh(rv.name).position.x, m.veh(rv.name).position.z, rv.idx) > mine) ahead++;
    place = ahead + 1;
    const lap = Math.min(laps, Math.floor(idx / c.pts.length) + 1);
    m.objective(src.mode === 'air' ? 'Fly through the gates' : 'Race to the finish', `${laps > 1 ? `Lap ${lap}/${laps} · ` : ''}Checkpoint ${Math.min(idx + 1, total)}/${total}${field ? ` · Position ${place}/${field + 1}` : ''} · ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
    yield;
  }
  m.unblip('cp'); m.unblip('cp2');
  m.clearLimit();
  m.clearFails();

  // the result
  const finishedBefore = rivals.filter((r) => r.done).length;
  const final = field ? finishedBefore + 1 : 1;
  const win = field ? final === 1 : t <= src.par;
  const share = field ? [1, 0.5, 0.3, 0.15][Math.min(3, final - 1)]! : win ? 1 : 0.4;
  const bonus = t <= src.par ? 1.25 : 1;
  const payout = Math.round(src.reward * share * bonus * (src.laps ? 1 : 1));
  m.stats.extra.win = win ? 1 : 0;
  m.stats.extra.raceTime = t;
  m.stats.extra.score = t;
  m.stats.extra.payout = payout;
  if (field) { m.stats.extra.place = final; m.stats.extra.field = field + 1; }
  s.hud.showBanner(src.title, field ? (final === 1 ? 'YOU WIN' : `FINISHED ${final}${['st', 'nd', 'rd'][final - 1] ?? 'th'}`) : win ? 'PAR BEATEN' : 'FINISHED', `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · +${money(payout)}`, win ? 'good' : 'neutral', 4);
  yield* m.wait(1.5);
}
