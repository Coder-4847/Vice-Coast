import type { Story } from '../story/Story';
import { money } from '../economy/Economy';
import { h } from '../ui/dom';
import { btn, row, type Page, type PageHost } from '../ui/Modal';

export function barPage(story: Story): Page {
  return {
    title: 'Iron Hound Bar',
    kicker: 'Games in the back room',
    hints: 'Esc / B  leave',
    render: (host) => {
      const n = (id: string): string => `${story.st.acts[id]?.wins ?? 0} won`;
      host.body.append(
        h('p', 'm-info', 'A twenty-five dollar buy-in, winner takes a hundred. The regulars are better than they look.'),
        row({ label: 'Darts', sub: 'First to 301 against the house. Three darts a turn.', right: n('bar.darts'), disabled: story.g.commerce!.eco.cash < 25, onClick: () => { if (story.g.commerce!.eco.spend(25, 'Darts buy-in')) host.push(dartsPage(story)); } }),
        row({ label: 'Pool', sub: 'Clear the table in twenty shots or fewer.', right: n('bar.pool'), disabled: story.g.commerce!.eco.cash < 25, onClick: () => { if (story.g.commerce!.eco.spend(25, 'Pool buy-in')) host.push(poolPage(story)); } }),
        btn('Leave', '', () => host.close()),
      );
    },
  };
}

// ------------------------------------------------------------------------------------------------ darts

/** Standard board order, clockwise from the top. */
const BOARD = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

/** Points for a dart landing at (x, y) on a board of radius 1 (y is down). */
export function dartScore(x: number, y: number): number {
  const r = Math.hypot(x, y);
  if (r < 0.04) return 50;
  if (r < 0.09) return 25;
  if (r > 1) return 0;
  let a = Math.atan2(x, -y);
  if (a < 0) a += Math.PI * 2;
  const n = BOARD[Math.floor(((a + Math.PI / 20) % (Math.PI * 2)) / (Math.PI / 10))]!;
  if (r > 0.93) return n * 2;
  if (r > 0.55 && r < 0.62) return n * 3;
  return n;
}

const gauss = (): number => { let s = 0; for (let i = 0; i < 6; i++) s += Math.random(); return (s - 3) / 1.5; };

function dartsPage(story: Story): Page {
  let me = 301, ai = 301;
  let turn: 'me' | 'ai' = 'me';
  let darts = 0, hand: number[] = [];
  let startMe = 301, startAi = 301;
  let log = 'Your throw. Press Throw when the sight is where you want it.';
  let raf = 0, done = false;
  const flights: { x: number; y: number; who: 'me' | 'ai' }[] = [];
  let sight = { x: 0, y: 0 };
  return {
    title: 'Darts',
    kicker: '301',
    hints: 'Space / Enter  throw',
    onClose: () => cancelAnimationFrame(raf),
    render: (host) => {
      const cv = h('canvas', 'cg-canvas');
      cv.width = 360; cv.height = 360;
      const ctx = cv.getContext('2d')!;
      const status = h('p', 'cg-msg', log);
      const score = h('div', 'm-balance', h('div', 'm-kv', h('span', '', 'You'), h('b', '', String(me))), h('div', 'm-kv', h('span', '', 'House'), h('b', '', String(ai))));
      host.body.append(score, cv, status);
      const draw = (t: number): void => {
        ctx.clearRect(0, 0, 360, 360);
        ctx.save(); ctx.translate(180, 180);
        for (let i = 0; i < 20; i++) {
          const a0 = (i - 0.5) * (Math.PI / 10) - Math.PI / 2, a1 = a0 + Math.PI / 10;
          const dark = i % 2 === 0;
          for (const [r0, r1, c] of [[0.09, 0.55, dark ? '#1a1a1c' : '#e8dcb8'], [0.55, 0.62, dark ? '#c4202c' : '#1f8a4a'], [0.62, 0.93, dark ? '#1a1a1c' : '#e8dcb8'], [0.93, 1, dark ? '#c4202c' : '#1f8a4a']] as [number, number, string][]) {
            ctx.beginPath(); ctx.arc(0, 0, r1 * 170, a0, a1); ctx.arc(0, 0, r0 * 170, a1, a0, true); ctx.closePath(); ctx.fillStyle = c; ctx.fill();
          }
          ctx.fillStyle = '#d8d2c4'; ctx.font = '13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(BOARD[i]), Math.cos(a0 + Math.PI / 20) * 178 * 1.02, Math.sin(a0 + Math.PI / 20) * 178 * 1.02);
        }
        ctx.beginPath(); ctx.arc(0, 0, 0.09 * 170, 0, 7); ctx.fillStyle = '#1f8a4a'; ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, 0.04 * 170, 0, 7); ctx.fillStyle = '#c4202c'; ctx.fill();
        for (const f of flights) { ctx.beginPath(); ctx.arc(f.x * 170, f.y * 170, 3.4, 0, 7); ctx.fillStyle = f.who === 'me' ? '#ffd166' : '#6ab7ff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke(); }
        if (turn === 'me' && !done) {
          // the wobbling sight
          const s = t / 1000;
          sight = { x: 0.62 * Math.sin(s * 1.9) + 0.18 * Math.sin(s * 5.3), y: 0.62 * Math.sin(s * 2.4 + 1) + 0.18 * Math.cos(s * 4.1) };
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(sight.x * 170, sight.y * 170, 10, 0, 7); ctx.moveTo(sight.x * 170 - 15, sight.y * 170); ctx.lineTo(sight.x * 170 + 15, sight.y * 170); ctx.moveTo(sight.x * 170, sight.y * 170 - 15); ctx.lineTo(sight.x * 170, sight.y * 170 + 15); ctx.stroke();
        }
        ctx.restore();
        raf = requestAnimationFrame(draw);
      };
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);

      const endTurn = (who: 'me' | 'ai'): void => {
        const total = hand.reduce((a, b) => a + b, 0);
        const cur = who === 'me' ? me : ai;
        const left = cur - total;
        if (left < 0 || left === 1) { if (who === 'me') me = startMe; else ai = startAi; log = `${who === 'me' ? 'Bust' : 'The house busts'}.`; }
        else if (who === 'me') me = left; else ai = left;
        hand = []; darts = 0; flights.length = 0;
        turn = who === 'me' ? 'ai' : 'me';
        startMe = me; startAi = ai;
        if (turn === 'ai') setTimeout(() => aiTurn(), 500);
        host.refresh();
      };
      const finishMatch = (win: boolean): void => {
        done = true;
        cancelAnimationFrame(raf);
        if (win) { story.g.commerce!.eco.earn(100, 'Darts'); story.actWin('bar.darts'); }
        host.back();
        host.push({ title: win ? 'You win' : 'You lose', kicker: 'Darts', render: (hh) => { hh.body.append(h('p', 'cg-msg', win ? `Nice shooting. +${money(100)}` : 'The house takes it.'), btn('Done', 'primary', () => hh.back())); } });
      };
      const land = (x: number, y: number, who: 'me' | 'ai'): void => {
        flights.push({ x, y, who });
        const sc = dartScore(x, y);
        hand.push(sc);
        darts++;
        const cur = (who === 'me' ? me : ai) - hand.reduce((a, b) => a + b, 0);
        log = `${who === 'me' ? 'You hit' : 'House hits'} ${sc}${sc === 50 ? ' (bull)' : ''}.`;
        status.textContent = log;
        if (cur === 0) { finishMatch(who === 'me'); return; }
        if (darts >= 3 || cur < 0) { setTimeout(() => endTurn(who), 700); }
      };
      const aiTurn = (): void => {
        if (done) return;
        let k = 0;
        const next = (): void => {
          if (done || turn !== 'ai') return;
          // aims for the 20s early on and a number that finishes late
          const left = ai - hand.reduce((a, b) => a + b, 0);
          const aimX = left > 60 ? 0 : 0, aimY = left > 60 ? -0.58 : -0.35;
          land(aimX + gauss() * 0.2, aimY + gauss() * 0.2, 'ai');
          if (++k < 3 && !done && ai - hand.reduce((a, b) => a + b, 0) > 0) setTimeout(next, 650);
        };
        next();
      };
      host.body.append(btn('Throw', 'primary', () => {
        if (turn !== 'me' || done) return;
        land(sight.x + gauss() * 0.04, sight.y + gauss() * 0.04, 'me');
      }));
      (host.body.lastElementChild as HTMLElement).focus({ preventScroll: true });
      host.body.append(btn('Forfeit', '', () => { cancelAnimationFrame(raf); host.back(); }));
    },
  };
}

// ------------------------------------------------------------------------------------------------ pool

interface Ball { x: number; y: number; vx: number; vy: number; id: number; live: boolean }

const W = 640, H = 320, R = 9, POCKET = 17;
const POCKETS: [number, number][] = [[0, 0], [W / 2, -4], [W, 0], [0, H], [W / 2, H + 4], [W, H]];
const COLORS = ['#f5f5f0', '#f2c230', '#2a5bd7', '#d93a2b', '#6a2e8f', '#e6762b', '#1f8a4a', '#8a2b2b', '#111111'];

function rack(): Ball[] {
  const balls: Ball[] = [{ x: W * 0.25, y: H / 2, vx: 0, vy: 0, id: 0, live: true }];
  const order = [1, 2, 3, 8, 4, 5, 6, 7, 1];
  // a triangle of the eight object balls plus the eight ball in the middle
  const ids = [1, 2, 3, 4, 8, 5, 6, 7];
  void order;
  let k = 0;
  for (let col = 0; col < 4; col++) {
    for (let r = 0; r <= col && k < ids.length; r++) {
      balls.push({ x: W * 0.68 + col * (R * 2 - 1), y: H / 2 + (r - col / 2) * (R * 2 + 0.5), vx: 0, vy: 0, id: ids[k++]!, live: true });
    }
  }
  return balls;
}

/** One physics step for the pool table; returns the ids of balls potted this step. Exported for tests. */
export function poolStep(balls: Ball[], dt: number): number[] {
  const potted: number[] = [];
  for (const b of balls) {
    if (!b.live) continue;
    b.x += b.vx * dt; b.y += b.vy * dt;
    const f = Math.pow(0.45, dt);
    b.vx *= f; b.vy *= f;
    if (Math.hypot(b.vx, b.vy) < 4) { b.vx = 0; b.vy = 0; }
    if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx) * 0.9; } else if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx) * 0.9; }
    if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy) * 0.9; } else if (b.y > H - R) { b.y = H - R; b.vy = -Math.abs(b.vy) * 0.9; }
    for (const [px, py] of POCKETS) if (Math.hypot(b.x - px, b.y - py) < POCKET) { b.live = false; potted.push(b.id); break; }
  }
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i]!;
    if (!a.live) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j]!;
      if (!b.live) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= R * 2 || d < 1e-6) continue;
      const nx = dx / d, ny = dy / d, ov = R * 2 - d;
      a.x -= nx * ov / 2; a.y -= ny * ov / 2; b.x += nx * ov / 2; b.y += ny * ov / 2;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) { a.vx += nx * rel; a.vy += ny * rel; b.vx -= nx * rel; b.vy -= ny * rel; }
    }
  }
  return potted;
}

function poolPage(story: Story): Page {
  let balls = rack();
  let shots = 0;
  let angle = Math.PI, power = 0.6;
  let moving = false;
  let msg = 'Aim with the mouse or the buttons, set the power, shoot. Pot the eight ball last.';
  let raf = 0, done = false;
  const PAR = 20;
  return {
    title: 'Pool',
    kicker: `Clear the table in ${PAR} shots`,
    hints: 'Click the table to aim',
    onClose: () => cancelAnimationFrame(raf),
    render: (host) => {
      const cv = h('canvas', 'cg-canvas wide');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d')!;
      const status = h('p', 'cg-msg', msg);
      const shotsEl = h('div', 'm-kv', h('span', '', 'Shots'), h('b', '', `${shots} / ${PAR}`));
      host.body.append(shotsEl, cv, status);
      const cue = (): Ball => balls[0]!;
      cv.addEventListener('pointermove', (e) => { if (moving) return; const r = cv.getBoundingClientRect(); const mx = (e.clientX - r.left) * (W / r.width), my = (e.clientY - r.top) * (H / r.height); angle = Math.atan2(my - cue().y, mx - cue().x); });
      cv.addEventListener('click', (e) => { const r = cv.getBoundingClientRect(); const mx = (e.clientX - r.left) * (W / r.width), my = (e.clientY - r.top) * (H / r.height); if (!moving) angle = Math.atan2(my - cue().y, mx - cue().x); });
      let last = performance.now();
      const fail = (why: string): void => { done = true; cancelAnimationFrame(raf); host.back(); host.push({ title: 'Table lost', kicker: 'Pool', render: (hh) => { hh.body.append(h('p', 'cg-msg', why), btn('Done', 'primary', () => hh.back())); } }); };
      const loop = (now: number): void => {
        const dt = Math.min(0.03, (now - last) / 1000);
        last = now;
        if (moving) {
          for (let k = 0; k < 4; k++) {
            const pot = poolStep(balls, dt / 4);
            for (const id of pot) {
              if (id === 0) { shots += 2; msg = 'Scratch: two-shot penalty.'; const c = cue(); c.live = true; c.x = W * 0.25; c.y = H / 2; c.vx = c.vy = 0; }
              else if (id === 8 && balls.some((b) => b.live && b.id > 0 && b.id < 8)) { fail('You potted the eight ball too early.'); return; }
            }
          }
          if (balls.every((b) => b.vx === 0 && b.vy === 0)) {
            moving = false;
            if (!balls.some((b) => b.live && b.id > 0)) {
              done = true; cancelAnimationFrame(raf);
              const win = shots <= PAR;
              if (win) { story.g.commerce!.eco.earn(100, 'Pool'); story.actWin('bar.pool'); }
              host.back();
              host.push({ title: win ? 'Table cleared' : 'Too many shots', kicker: 'Pool', render: (hh) => { hh.body.append(h('p', 'cg-msg', win ? `Cleared in ${shots}. +${money(100)}` : `Cleared in ${shots}: the par was ${PAR}.`), btn('Done', 'primary', () => hh.back())); } });
              return;
            }
            status.textContent = msg; shotsEl.lastElementChild!.textContent = `${shots} / ${PAR}`;
          }
        }
        // draw
        ctx.fillStyle = '#4a2c14'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#16603c'; ctx.fillRect(6, 6, W - 12, H - 12);
        for (const [px, py] of POCKETS) { ctx.beginPath(); ctx.arc(px, py, POCKET, 0, 7); ctx.fillStyle = '#0b0b0b'; ctx.fill(); }
        for (const b of balls) {
          if (!b.live) continue;
          ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, 7); ctx.fillStyle = COLORS[b.id]!; ctx.fill();
          if (b.id > 0 && b.id < 8) { ctx.fillStyle = '#ffffffcc'; ctx.fillRect(b.x - R, b.y - 2, R * 2, 4); }
          ctx.strokeStyle = '#00000066'; ctx.stroke();
        }
        if (!moving) {
          const c = cue();
          ctx.strokeStyle = '#ffffff99'; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(angle) * 200, c.y + Math.sin(angle) * 200); ctx.stroke(); ctx.setLineDash([]);
          ctx.strokeStyle = '#d9b36a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(c.x - Math.cos(angle) * (R + 6 + power * 40), c.y - Math.sin(angle) * (R + 6 + power * 40)); ctx.lineTo(c.x - Math.cos(angle) * (R + 6 + power * 40 + 120), c.y - Math.sin(angle) * (R + 6 + power * 40 + 120)); ctx.stroke(); ctx.lineWidth = 1;
        }
        raf = requestAnimationFrame(loop);
      };
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
      const ctl = h('div', 'cg-grid');
      ctl.dataset.navRow = '';
      const mk = (label: string, fn: () => void): void => { const c = h('button', 'cg-cell', label); c.type = 'button'; c.addEventListener('click', fn); ctl.append(c); };
      mk('◀ Aim', () => { angle -= 0.06; });
      mk('Aim ▶', () => { angle += 0.06; });
      mk('Power −', () => { power = Math.max(0.15, power - 0.1); });
      mk('Power +', () => { power = Math.min(1, power + 0.1); });
      host.body.append(ctl);
      host.body.append(btn('Shoot', 'primary', () => {
        if (moving || done) return;
        const c = cue();
        const v = 90 + power * 620;
        c.vx = Math.cos(angle) * v; c.vy = Math.sin(angle) * v;
        moving = true; shots++; msg = '';
        shotsEl.lastElementChild!.textContent = `${shots} / ${PAR}`;
      }));
      host.body.append(btn('Forfeit', '', () => { cancelAnimationFrame(raf); host.back(); }));
    },
  };
}

void (null as unknown as PageHost);
