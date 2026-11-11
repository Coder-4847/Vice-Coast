import type { Story } from '../story/Story';
import type { Page } from '../ui/Modal';
import { arena, meter, rng, rrect, type Arena, type Key } from './arena';

// ------------------------------------------------------------------------------------------------ course

type Surf = 'tee' | 'fairway' | 'rough' | 'sand' | 'water' | 'green' | 'trees' | 'oob';
interface Circle { x: number; y: number; r: number }
interface Ellipse { x: number; y: number; rx: number; ry: number }
export interface Hole {
  n: number; par: number; len: number;
  /** Fairway centre line (tee → control → green), metres. */
  ctrl: { x: number; y: number }; green: { x: number; y: number; r: number }; cup: { x: number; y: number };
  fw: number; bunkers: Circle[]; water: Ellipse[]; trees: Circle[];
  /** Green slope (m/s² of break). */
  slope: { x: number; y: number };
  halfW: number;
}

const bez = (h: Hole, t: number): { x: number; y: number } => {
  const u = 1 - t;
  return { x: 2 * u * t * h.ctrl.x + t * t * h.green.x, y: 2 * u * t * h.ctrl.y + t * t * h.green.y };
};

/** Nine holes, the same every visit. Exported for tests. */
export function buildCourse(): Hole[] {
  const pars = [4, 3, 5, 4, 4, 3, 4, 5, 4];
  return pars.map((par, i) => {
    const r = rng(9001 + i * 77);
    const len = par === 3 ? 125 + r() * 60 : par === 4 ? 300 + r() * 90 : 440 + r() * 60;
    const bend = (r() - 0.5) * (par === 3 ? 20 : 120);
    const green = { x: bend * 0.6 + (r() - 0.5) * 20, y: len, r: 12 + r() * 4 };
    const hole: Hole = {
      n: i + 1, par, len, ctrl: { x: bend, y: len * 0.55 }, green,
      cup: { x: green.x + (r() - 0.5) * green.r * 0.9, y: green.y + (r() - 0.5) * green.r * 0.9 },
      fw: par === 3 ? 0 : 15 + r() * 5, bunkers: [], water: [], trees: [],
      slope: { x: (r() - 0.5) * 0.9, y: (r() - 0.5) * 0.9 }, halfW: 0,
    };
    hole.halfW = Math.max(70, Math.abs(bend) + 60);
    // green-side bunkers
    for (let k = 0; k < 2; k++) {
      const a = r() * Math.PI * 2;
      hole.bunkers.push({ x: green.x + Math.cos(a) * (green.r + 6), y: green.y + Math.sin(a) * (green.r + 6) * 0.8 - 4, r: 5 + r() * 3 });
    }
    // landing-zone bunkers
    if (par > 3) for (let k = 0; k < 2; k++) { const p = bez(hole, 0.5 + r() * 0.25); hole.bunkers.push({ x: p.x + (r() < 0.5 ? -1 : 1) * (hole.fw + 4), y: p.y, r: 6 + r() * 4 }); }
    // water on some holes
    if (r() < 0.45) {
      const p = bez(hole, par === 3 ? 0.7 : 0.35 + r() * 0.3);
      hole.water.push(par === 3 || r() < 0.5 ? { x: p.x, y: p.y, rx: 26 + r() * 20, ry: 10 + r() * 8 } : { x: p.x + (r() < 0.5 ? -1 : 1) * (hole.fw + 22), y: p.y, rx: 14, ry: 40 + r() * 30 });
    }
    // tree lines
    for (let k = 0; k < 26; k++) {
      const t = r();
      const p = bez(hole, t);
      const side = r() < 0.5 ? -1 : 1;
      const off = Math.max(hole.fw, 12) + 14 + r() * 26;
      if (p.y < 12) continue;
      hole.trees.push({ x: p.x + side * off, y: p.y, r: 4 + r() * 3 });
    }
    return hole;
  });
}

/** Nearest distance from a point to the fairway centre line. */
function fairwayDist(h: Hole, x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i <= 24; i++) { const p = bez(h, i / 24); best = Math.min(best, Math.hypot(p.x - x, p.y - y)); }
  return best;
}

export function surfaceAt(h: Hole, x: number, y: number): Surf {
  if (Math.abs(x) > h.halfW || y < -25 || y > h.len + 45) return 'oob';
  for (const w of h.water) if (((x - w.x) / w.rx) ** 2 + ((y - w.y) / w.ry) ** 2 < 1) return 'water';
  if (Math.hypot(x - h.green.x, y - h.green.y) < h.green.r) return 'green';
  for (const b of h.bunkers) if (Math.hypot(x - b.x, y - b.y) < b.r) return 'sand';
  for (const t of h.trees) if (Math.hypot(x - t.x, y - t.y) < t.r) return 'trees';
  if (Math.hypot(x, y) < 6) return 'tee';
  if (h.fw > 0 && fairwayDist(h, x, y) < h.fw) return 'fairway';
  if (h.fw === 0 && Math.hypot(x - h.green.x, y - h.green.y) < h.green.r + 7) return 'fairway';
  return 'rough';
}

const CLUBS = [
  { id: 'Driver', d: 235 }, { id: '3 Wood', d: 210 }, { id: '5 Iron', d: 175 }, { id: '7 Iron', d: 150 },
  { id: '9 Iron', d: 125 }, { id: 'Wedge', d: 95 }, { id: 'Sand Wedge', d: 65 }, { id: 'Putter', d: 0 },
];
const LIE: Record<Surf, number> = { tee: 1, fairway: 1, green: 1, rough: 0.82, sand: 0.6, trees: 0.55, water: 1, oob: 1 };
const ROLL: Record<Surf, number> = { tee: 0.1, fairway: 0.14, rough: 0.04, sand: 0, green: 0.22, trees: 0, water: 0, oob: 0 };

// ------------------------------------------------------------------------------------------------ page

export function golfPage(story: Story, holes: number, onFinish: (strokes: number, par: number, rival: number) => void): Page {
  const course = buildCourse().slice(0, holes);
  const g = story.g;
  let a: Arena | null = null;
  const page: Page = {
    title: 'Golf', kicker: `Vista Verde Links · ${holes} holes`, hideMoney: true,
    hints: '←/→ aim · ↑/↓ club · Space swing · Esc leave',
    onClose: () => a?.stop(),
    render: (host) => {
      const R = rng(Date.now() & 0xffff);
      let hi = 0;
      let hole = course[0]!;
      let ball = { x: 0, y: 0 };
      let prev = { x: 0, y: 0 };
      let strokes = 0;
      const cards: number[] = [];
      const rivals = course.map((c) => c.par + [-1, 0, 0, 0, 0, 1, 1, 1, 2][Math.floor(R() * 9)]!);
      let aim = 0;
      let club = 0;
      let wind = { x: 0, y: 0 };
      type Phase = 'aim' | 'power' | 'acc' | 'fly' | 'roll' | 'putt' | 'wait' | 'over';
      let phase: Phase = 'aim';
      let power = 0, pdir = 1, acc = 0, lockedPower = 0;
      let fly = { t: 0, dur: 1, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, apex: 20 };
      let roll = { vx: 0, vy: 0 };
      let msg = '';
      let msgT = 0;

      const lie = (): Surf => surfaceAt(hole, ball.x, ball.y);
      const onGreen = (): boolean => lie() === 'green';
      const distPin = (): number => Math.hypot(hole.cup.x - ball.x, hole.cup.y - ball.y);
      const pickClub = (): void => {
        if (onGreen()) { club = 7; return; }
        const d = distPin() / LIE[lie()];
        club = 6;
        for (let i = 0; i < 7; i++) if (CLUBS[i]!.d <= d * 1.04) { club = i; break; }
        if (hole.par > 3 && ball.y < 5 && club > 0 && d > 240) club = 0;
      };
      const aimAtPin = (): void => { aim = Math.atan2(hole.cup.x - ball.x, hole.cup.y - ball.y); };
      const startHole = (): void => {
        hole = course[hi]!;
        ball = { x: 0, y: 0 }; prev = { ...ball }; strokes = 0;
        const wa = R() * Math.PI * 2, ws = R() * 7;
        wind = { x: Math.sin(wa) * ws, y: Math.cos(wa) * ws };
        aimAtPin(); pickClub();
        phase = 'aim';
        say(`Hole ${hole.n} · Par ${hole.par} · ${Math.round(hole.len)} m`);
      };
      const say = (t: string, secs = 2.6): void => { msg = t; msgT = secs; };

      const swing = (): void => {
        strokes++;
        prev = { ...ball };
        const c = CLUBS[club]!;
        const s = lie();
        if (club === 7) {
          // putter: roll straight at the aim with speed for the chosen distance
          const want = lockedPower * Math.max(5, distPin() * 2);
          const v = Math.sqrt(2 * 1.7 * want);
          roll = { vx: Math.sin(aim) * v, vy: Math.cos(aim) * v };
          phase = 'roll';
          g.audio.sport('hit', 0.5);
          return;
        }
        const lieMul = s === 'sand' && club === 6 ? 0.92 : LIE[s];
        const carry = c.d * lockedPower * lieMul * (0.97 + R() * 0.06);
        const dir = aim + acc * 0.16 + (R() - 0.5) * 0.02;
        const tf = carry / 120;
        const to = { x: ball.x + Math.sin(dir) * carry + wind.x * tf * 2.2, y: ball.y + Math.cos(dir) * carry + wind.y * tf * 2.2 };
        fly = { t: 0, dur: 0.9 + carry / 140, from: { ...ball }, to, apex: 6 + carry * 0.12 };
        phase = 'fly';
        g.audio.sport('thwack', 0.4 + lockedPower * 0.6);
        if (Math.abs(acc) > 0.6) say(acc > 0 ? 'Sliced it.' : 'Hooked it.');
      };
      const landed = (): void => {
        const s = lie();
        if (s === 'water' || s === 'oob') {
          strokes++;
          say(s === 'water' ? 'In the water. One stroke penalty.' : 'Out of bounds. One stroke penalty.');
          g.audio.sport(s === 'water' ? 'plop' : 'groan', 0.6);
          ball = { ...prev };
          afterShot();
          return;
        }
        if (s === 'trees') { say('Into the trees.'); afterShot(); return; }
        const dx = fly.to.x - fly.from.x, dy = fly.to.y - fly.from.y, d = Math.hypot(dx, dy) || 1;
        const r = d * ROLL[s] * (0.7 + R() * 0.5);
        const v = Math.sqrt(2 * 1.7 * r);
        roll = { vx: (dx / d) * v, vy: (dy / d) * v };
        g.audio.sport('bounce', 0.4);
        phase = 'roll';
      };
      const afterShot = (): void => {
        if (strokes >= hole.par + 5) { say('Picked up.'); holeDone(); return; }
        aimAtPin(); pickClub();
        phase = onGreen() ? 'putt' : 'aim';
        power = 0; acc = 0;
      };
      const holeDone = (): void => {
        cards.push(strokes);
        const d = strokes - hole.par;
        const names: Record<string, string> = { '-3': 'Albatross!', '-2': 'Eagle!', '-1': 'Birdie!', '0': 'Par.', '1': 'Bogey.', '2': 'Double bogey.' };
        say(strokes === 1 ? 'Hole in one!' : names[String(d)] ?? `${d > 0 ? '+' : ''}${d}`, 3);
        if (d < 0 || strokes === 1) g.audio.sport('cheer', 0.8);
        phase = 'wait';
        setTimeout(() => {
          if (!a?.running) return;
          hi++;
          if (hi >= course.length) { phase = 'over'; end(); } else startHole();
        }, 2600);
      };
      const end = (): void => {
        const total = cards.reduce((x, y) => x + y, 0);
        const par = course.reduce((x, c) => x + c.par, 0);
        const rival = rivals.reduce((x, y) => x + y, 0);
        a?.stop();
        host.back();
        onFinish(total, par, rival);
      };

      const press = (k: Key): void => {
        if (phase === 'aim' || phase === 'putt') {
          if (k === 'up' && phase === 'aim') club = Math.max(0, club - 1);
          else if (k === 'down' && phase === 'aim') club = Math.min(6, club + 1);
          else if (k === 'act') { phase = 'power'; power = 0; pdir = 1; }
        } else if (phase === 'power' && k === 'act') {
          lockedPower = power;
          if (club === 7) swing(); else { phase = 'acc'; acc = 1; }
        } else if (phase === 'acc' && k === 'act') {
          swing();
        }
      };

      // --------------------------------------------------------------------------------- drawing
      const W = 640, H = 420;
      const view = { cx: 0, cy: 0, s: 1 };
      const fit = (): void => {
        if (onGreen() && (phase === 'putt' || phase === 'power' || phase === 'roll' || phase === 'wait')) {
          view.s = 150 / (hole.green.r + 2); view.cx = hole.green.x; view.cy = hole.green.y;
        } else if (distPin() < 70 && phase !== 'fly') {
          view.s = 170 / Math.max(30, distPin()); view.cx = (ball.x + hole.cup.x) / 2; view.cy = (ball.y + hole.cup.y) / 2;
        } else {
          view.s = (H - 50) / (hole.len + 40);
          view.cx = hole.ctrl.x * 0.4; view.cy = hole.len / 2 + 8;
        }
      };
      const sx = (x: number): number => W / 2 + (x - view.cx) * view.s;
      const sy = (y: number): number => H / 2 - (y - view.cy) * view.s;

      const draw = (t: number): void => {
        const c = a!.ctx;
        fit();
        // rough
        c.fillStyle = '#2f5d2a';
        c.fillRect(0, 0, W, H);
        c.globalAlpha = 0.18;
        for (let i = 0; i < 18; i++) { c.fillStyle = i % 2 ? '#3b6e33' : '#284f24'; c.fillRect(0, i * (H / 18), W, H / 36); }
        c.globalAlpha = 1;
        // fairway
        if (hole.fw > 0) {
          c.strokeStyle = '#5fa04a'; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = hole.fw * 2 * view.s;
          c.beginPath();
          for (let i = 0; i <= 30; i++) { const p = bez(hole, Math.max(0.08, i / 30)); if (i === 0) c.moveTo(sx(p.x), sy(p.y)); else c.lineTo(sx(p.x), sy(p.y)); }
          c.stroke();
          // mowing stripes
          c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = hole.fw * view.s;
          c.stroke();
        }
        // tee box
        c.fillStyle = '#6cb556'; rrect(c, sx(-5), sy(4), 10 * view.s, 8 * view.s, 3); c.fill();
        // water
        for (const w of hole.water) {
          const gr = c.createRadialGradient(sx(w.x), sy(w.y), 2, sx(w.x), sy(w.y), Math.max(w.rx, w.ry) * view.s);
          gr.addColorStop(0, '#2a7fc0'); gr.addColorStop(1, '#1b5a8f');
          c.fillStyle = gr; c.beginPath(); c.ellipse(sx(w.x), sy(w.y), w.rx * view.s, w.ry * view.s, 0, 0, 7); c.fill();
          c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1.5; c.stroke();
        }
        // green
        c.fillStyle = '#7cc95e'; c.beginPath(); c.arc(sx(hole.green.x), sy(hole.green.y), hole.green.r * view.s, 0, 7); c.fill();
        c.strokeStyle = '#a6e07f'; c.lineWidth = 2; c.stroke();
        // bunkers
        for (const b of hole.bunkers) { c.fillStyle = '#e6d39a'; c.beginPath(); c.arc(sx(b.x), sy(b.y), b.r * view.s, 0, 7); c.fill(); c.strokeStyle = '#c4ae6e'; c.lineWidth = 1; c.stroke(); }
        // trees (shadow then canopy)
        for (const tr of hole.trees) {
          c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.arc(sx(tr.x) + 3, sy(tr.y) + 3, tr.r * view.s, 0, 7); c.fill();
          c.fillStyle = '#1f4a1f'; c.beginPath(); c.arc(sx(tr.x), sy(tr.y), tr.r * view.s, 0, 7); c.fill();
          c.fillStyle = '#2d6a2a'; c.beginPath(); c.arc(sx(tr.x) - tr.r * view.s * 0.25, sy(tr.y) - tr.r * view.s * 0.25, tr.r * view.s * 0.6, 0, 7); c.fill();
        }
        // green slope arrows when zoomed
        if (view.s > 3) {
          c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 1.5;
          const m = Math.hypot(hole.slope.x, hole.slope.y) || 1;
          for (let gx = -2; gx <= 2; gx++) for (let gy = -2; gy <= 2; gy++) {
            const px = hole.green.x + gx * hole.green.r * 0.38, py = hole.green.y + gy * hole.green.r * 0.38;
            if (Math.hypot(px - hole.green.x, py - hole.green.y) > hole.green.r * 0.9) continue;
            const ox = (hole.slope.x / m) * 1.6, oy = (hole.slope.y / m) * 1.6;
            const ph = ((t * 0.8) % 1) * 1.2;
            c.beginPath(); c.moveTo(sx(px - ox + ox * ph), sy(py - oy + oy * ph)); c.lineTo(sx(px + ox * ph), sy(py + oy * ph)); c.stroke();
          }
        }
        // pin and cup
        c.fillStyle = '#111'; c.beginPath(); c.arc(sx(hole.cup.x), sy(hole.cup.y), Math.max(2.5, 0.25 * view.s), 0, 7); c.fill();
        c.strokeStyle = '#eee'; c.lineWidth = 2; c.beginPath(); c.moveTo(sx(hole.cup.x), sy(hole.cup.y)); c.lineTo(sx(hole.cup.x), sy(hole.cup.y) - 26); c.stroke();
        c.fillStyle = '#ff4a4a'; c.beginPath(); c.moveTo(sx(hole.cup.x), sy(hole.cup.y) - 26); c.lineTo(sx(hole.cup.x) + 14 + Math.sin(t * 6) * 2, sy(hole.cup.y) - 21); c.lineTo(sx(hole.cup.x), sy(hole.cup.y) - 16); c.fill();
        // aim line + landing ring
        if (phase === 'aim' || phase === 'power' || phase === 'acc' || phase === 'putt') {
          const d = club === 7 ? Math.max(5, distPin() * 2) * (phase === 'power' ? power : 0.5) : CLUBS[club]!.d * LIE[lie()] * (phase === 'aim' ? 1 : phase === 'power' ? power : lockedPower);
          const ex = ball.x + Math.sin(aim) * d, ey = ball.y + Math.cos(aim) * d;
          c.setLineDash([6, 6]); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(sx(ball.x), sy(ball.y)); c.lineTo(sx(ex), sy(ey)); c.stroke(); c.setLineDash([]);
          if (club !== 7) { c.strokeStyle = 'rgba(255,230,120,0.9)'; c.beginPath(); c.arc(sx(ex), sy(ey), Math.max(5, d * 0.07 * view.s), 0, 7); c.stroke(); }
        }
        // ball (with shadow, lifted while flying)
        let bx = ball.x, by = ball.y, lift = 0;
        if (phase === 'fly') {
          const k = fly.t / fly.dur;
          bx = fly.from.x + (fly.to.x - fly.from.x) * k; by = fly.from.y + (fly.to.y - fly.from.y) * k;
          lift = Math.sin(k * Math.PI) * fly.apex;
        }
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(sx(bx) + lift * 0.3, sy(by) + lift * 0.15, 3, 0, 7); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(sx(bx), sy(by) - lift * 0.9, 3.4 + lift * 0.04, 0, 7); c.fill();

        // ---- HUD
        c.fillStyle = 'rgba(8,10,16,0.66)'; rrect(c, 10, 10, 170, 74, 10); c.fill();
        c.fillStyle = '#fff'; c.font = '600 15px Inter, system-ui'; c.textAlign = 'left'; c.textBaseline = 'top';
        c.fillText(`Hole ${hole.n}  ·  Par ${hole.par}`, 20, 18);
        c.font = '12px Inter, system-ui'; c.fillStyle = '#cfd6e4';
        c.fillText(`Stroke ${strokes + 1}  ·  ${Math.round(distPin())} m to pin`, 20, 40);
        c.fillText(`Lie: ${lie()}`, 20, 58);
        // wind
        c.fillStyle = 'rgba(8,10,16,0.66)'; rrect(c, W - 96, 10, 86, 74, 10); c.fill();
        const ws = Math.hypot(wind.x, wind.y);
        c.save(); c.translate(W - 53, 44); c.rotate(Math.atan2(wind.x, wind.y)); c.strokeStyle = '#8fd3ff'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(0, 14); c.lineTo(0, -14); c.lineTo(-6, -6); c.moveTo(0, -14); c.lineTo(6, -6); c.stroke(); c.restore();
        c.fillStyle = '#cfd6e4'; c.font = '11px Inter, system-ui'; c.textAlign = 'center'; c.fillText(`Wind ${ws.toFixed(1)} m/s`, W - 53, 66);
        // club & meters
        c.fillStyle = 'rgba(8,10,16,0.66)'; rrect(c, 10, H - 64, W - 20, 54, 10); c.fill();
        c.fillStyle = '#ffd166'; c.font = '600 14px Inter, system-ui'; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText(CLUBS[club]!.id + (club < 7 ? `  ${CLUBS[club]!.d} m` : ''), 22, H - 37);
        const mx = 190, mw = W - 220;
        if (phase === 'power' || phase === 'acc') meter(c, mx, H - 46, mw, 12, phase === 'power' ? power : lockedPower, { label: 'Power', needle: phase === 'acc' ? undefined : power });
        if (phase === 'acc') meter(c, mx, H - 24, mw, 8, 0, { zone: [0.44, 0.56], needle: 0.5 + acc * 0.5 });
        if (phase === 'aim' || phase === 'putt') { c.fillStyle = '#cfd6e4'; c.font = '12px Inter, system-ui'; c.fillText(phase === 'putt' ? 'Aim the putt, then press Swing and stop the meter.' : 'Aim, pick a club, then Swing: power, then accuracy.', mx, H - 37); }
        // message
        if (msgT > 0) {
          c.globalAlpha = Math.min(1, msgT * 2);
          c.fillStyle = 'rgba(8,10,16,0.8)'; rrect(c, W / 2 - 150, 96, 300, 40, 12); c.fill();
          c.fillStyle = '#fff'; c.font = '600 18px Inter, system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(msg, W / 2, 116);
          c.globalAlpha = 1;
        }
      };

      a = arena(page, host, {
        w: W, h: H,
        buttons: [{ label: '◀ Aim', key: 'left' }, { label: 'Aim ▶', key: 'right' }, { label: 'Club +', key: 'up' }, { label: 'Club −', key: 'down' }, { label: 'Swing', key: 'act', cls: 'primary' }],
        press,
        frame: (dt, t) => {
          msgT = Math.max(0, msgT - dt);
          const ax = a!.axisX();
          if ((phase === 'aim' || phase === 'putt') && ax) aim += ax * dt * (phase === 'putt' ? 0.35 : 0.6);
          if (phase === 'power') {
            power += pdir * dt / (club === 7 ? 1.4 : 1.05);
            if (power >= 1) { power = 1; pdir = -1; }
            if (power <= 0 && pdir < 0) { power = 0; phase = club === 7 ? 'putt' : 'aim'; }
          } else if (phase === 'acc') {
            acc -= dt * 2.4;
            if (acc < -1) { acc = -1; swing(); }
          } else if (phase === 'fly') {
            fly.t += dt;
            if (fly.t >= fly.dur) { ball = { ...fly.to }; landed(); }
          } else if (phase === 'roll') {
            const sp = Math.hypot(roll.vx, roll.vy);
            const s = lie();
            const fr = s === 'green' ? 1.7 : s === 'fairway' || s === 'tee' ? 3.5 : 9;
            if (s === 'green') { roll.vx += hole.slope.x * dt; roll.vy += hole.slope.y * dt; }
            ball.x += roll.vx * dt; ball.y += roll.vy * dt;
            const dc = Math.hypot(ball.x - hole.cup.x, ball.y - hole.cup.y);
            if (dc < 0.3 && sp < 4.5) {
              ball = { ...hole.cup };
              g.audio.sport('rim', 0.4);
              holeDone();
              return;
            }
            const ns = Math.max(0, sp - fr * dt);
            if (sp > 0) { roll.vx *= ns / sp; roll.vy *= ns / sp; }
            const now = lie();
            if (now === 'water' || now === 'oob') { landed(); return; }
            if (ns <= 0.05) { roll = { vx: 0, vy: 0 }; afterShot(); }
          }
          draw(t);
          const tot = cards.reduce((x, y) => x + y, 0);
          const parSoFar = course.slice(0, cards.length).reduce((x, c) => x + c.par, 0);
          const rv = rivals.slice(0, cards.length).reduce((x, y) => x + y, 0);
          const rel = (n: number): string => (n === 0 ? 'E' : n > 0 ? `+${n}` : String(n));
          a!.score([['Hole', `${Math.min(hi + 1, course.length)}/${course.length}`], ['You', rel(tot - parSoFar)], ['Rival', rel(rv - parSoFar)]]);
        },
      });
      startHole();
    },
  };
  return page;
}
