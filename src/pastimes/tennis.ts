import type { Story } from '../story/Story';
import type { Page } from '../ui/Modal';
import { arena, clamp, meter, rrect, type Arena, type Key } from './arena';

const NZ = 11.885, BASE = 23.77, HW = 4.115, DW = 5.485, SVC = 6.4, NET = 0.914;
const G = 9.8;
type Side = 'me' | 'ai';
const gauss = (): number => { let s = 0; for (let i = 0; i < 4; i++) s += Math.random(); return (s - 2) / 0.58; };

/** Ball velocity that lands at (tx, tz) after T seconds and clears the net. Exported for tests. */
export function shotVelocity(p: { x: number; y: number; z: number }, tx: number, tz: number, T: number): { x: number; y: number; z: number } {
  for (let k = 0; k < 6; k++) {
    const v = { x: (tx - p.x) / T, y: (0 - p.y + 0.5 * G * T * T) / T, z: (tz - p.z) / T };
    const tn = (NZ - p.z) / v.z;
    if (tn <= 0 || tn >= T) return v;
    const yn = p.y + v.y * tn - 0.5 * G * tn * tn;
    if (yn > NET + 0.25) return v;
    T += 0.12;
  }
  return { x: (tx - p.x) / T, y: (0 - p.y + 0.5 * G * T * T) / T, z: (tz - p.z) / T };
}

const CALL = ['0', '15', '30', '40'];

export function tennisPage(story: Story, gamesToWin: number, skill: number, onFinish: (win: boolean, games: [number, number]) => void): Page {
  const g = story.g;
  let a: Arena | null = null;
  const page: Page = {
    title: 'Tennis', kicker: `Costa Merida Tennis Club · first to ${gamesToWin} games`, hideMoney: true,
    hints: '←/→ move & aim · Space swing / serve · Shift power shot',
    onClose: () => a?.stop(),
    render: (host) => {
      const W = 640, H = 420;
      const me = { x: 0, z: -0.9, swing: 0, power: false };
      const ai = { x: 0, z: BASE + 0.9, swing: 0, tx: 0, react: 0 };
      const ball = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, live: false };
      let lastHit: Side = 'me';
      let bounces = 0;
      let serving: Side = 'me';
      let serveState: 'ready' | 'toss' | 'inplay' = 'ready';
      let isServe = true;
      let faults = 0;
      const pts: [number, number] = [0, 0];
      const games: [number, number] = [0, 0];
      let msg = '', msgT = 0, pause = 0;
      const trail: { x: number; y: number; z: number }[] = [];
      let over = false;

      const say = (t: string, s = 1.8): void => { msg = t; msgT = s; };
      const callScore = (): string => {
        const [m, o] = pts;
        if (m >= 3 && o >= 3) return m === o ? 'Deuce' : m > o ? 'Advantage you' : 'Advantage rival';
        return `${CALL[Math.min(3, m)]}–${CALL[Math.min(3, o)]}`;
      };
      const resetPoint = (): void => {
        ball.live = false; bounces = 0; isServe = true; serveState = 'ready'; trail.length = 0; over = false;
        me.x = serving === 'me' ? 1.2 : 0; ai.x = serving === 'ai' ? -1.2 : 0;
        if (serving === 'ai') { pause = Math.max(pause, 1.3); }
      };
      const point = (to: Side, why: string): void => {
        if (over) return;
        over = true;
        ball.live = false;
        const i = to === 'me' ? 0 : 1;
        pts[i]++;
        g.audio.sport(to === 'me' ? 'cheer' : 'groan', 0.5);
        const [m, o] = pts;
        if ((m >= 4 || o >= 4) && Math.abs(m - o) >= 2) {
          games[m > o ? 0 : 1]++;
          pts[0] = pts[1] = 0;
          serving = serving === 'me' ? 'ai' : 'me';
          faults = 0;
          if (games[0] >= gamesToWin || games[1] >= gamesToWin) {
            say(games[0] > games[1] ? 'Game, set and match!' : 'Match to your rival.', 3);
            setTimeout(() => { if (!a?.running) return; a.stop(); host.back(); onFinish(games[0] > games[1], [...games]); }, 2200);
            pause = 99;
            return;
          }
          say(`${why} Game ${m > o ? 'you' : 'rival'} · ${games[0]}–${games[1]}`, 2.4);
        } else say(`${why} ${callScore()}`, 2);
        faults = 0;
        pause = 1.6;
        setTimeout(resetPoint, 1500);
      };
      const fault = (who: Side): void => {
        ball.live = false;
        faults++;
        if (faults >= 2) { faults = 0; point(who === 'me' ? 'ai' : 'me', 'Double fault.'); return; }
        say('Fault.', 1.2);
        g.audio.sport('whistle', 0.3);
        pause = 1;
        setTimeout(() => { serveState = 'ready'; ball.live = false; trail.length = 0; if (serving === 'ai') pause = 1.1; }, 900);
      };

      const hit = (who: Side, tx: number, tz: number, T: number): void => {
        const v = shotVelocity(ball, tx, tz, T);
        ball.vx = v.x; ball.vy = v.y; ball.vz = v.z;
        lastHit = who; bounces = 0; ball.live = true;
        g.audio.sport('hit', 0.6 + (1.3 - T) * 0.5);
        if (who === 'me') ai.react = 0.18 + (1 - skill) * 0.2;
      };

      const tryMyHit = (): boolean => {
        if (!ball.live || over || lastHit === 'me') return false;
        const dx = ball.x - me.x, dz = ball.z - me.z;
        if (Math.abs(dx) > 1.6 || dz < -1.3 || dz > 1.8 || ball.y > 2.7) return false;
        if (bounces === 0 && ball.z > NZ - 1) return false;
        const timing = clamp((dz - 0.25) / 1.4, -1, 1);
        const q = 1 - Math.abs(timing);
        const steer = a!.axisX();
        const powerShot = a!.held('alt');
        let tx = steer * 3.2 - timing * 1.4 + gauss() * (0.25 + (1 - q) * 0.9) * (powerShot ? 1.5 : 1);
        let tz = NZ + 7.6 + q * 3.2 + gauss() * (1 - q) * 1.6;
        if (powerShot) tz += 0.6;
        tx = clamp(tx, -5.5, 5.5);
        tz = Math.min(tz, BASE + 2.2);
        const T = (powerShot ? 0.82 : 1.05) - q * 0.22;
        hit('me', tx, tz, Math.max(0.6, T));
        if (q > 0.85) say(powerShot ? 'Smash!' : 'Clean.', 0.7);
        return true;
      };

      const press = (k: Key): void => {
        if (pause > 0) return;
        if (k !== 'act' && k !== 'alt') return;
        if (serving === 'me' && serveState !== 'inplay' && !ball.live) {
          if (serveState === 'ready') { serveState = 'toss'; ball.x = me.x - 0.3; ball.z = me.z + 0.4; ball.y = 1.1; ball.vx = 0; ball.vz = 0; ball.vy = 5.9; me.swing = 0; return; }
          if (serveState === 'toss') {
            me.swing = 0.3;
            const apex = 1.1 + 5.9 * 5.9 / (2 * G);
            const q = 1 - clamp(Math.abs(ball.y - apex) / 1.2, 0, 1);
            const tx = clamp(a!.axisX() * 3 + gauss() * (1 - q) * 2.2, -5, 5);
            const tz = NZ + 3.8 + q * 2.2 + gauss() * (1 - q) * 2.4;
            serveState = 'inplay';
            hit('me', tx, tz, 0.85 - q * 0.15);
            isServe = true;
            return;
          }
        }
        me.swing = 0.32;
        me.power = k === 'alt';
      };

      const aiThink = (dt: number): void => {
        // move toward where the ball will cross the AI's baseline
        if (ball.live && lastHit === 'me' && ball.vz > 0) {
          ai.react -= dt;
          if (ai.react <= 0) {
            const t = (ai.z - ball.z) / ball.vz;
            ai.tx = clamp(ball.x + ball.vx * t * 0.9, -7, 7);
          }
        } else if (!ball.live) ai.tx = serving === 'ai' ? -1.2 : 0;
        else ai.tx = ai.tx * (1 - dt) + 0;
        const sp = 5.2 + skill * 1.6;
        ai.x += clamp(ai.tx - ai.x, -sp * dt, sp * dt);
        // swing
        if (ball.live && lastHit === 'me' && bounces === 1 && ball.z > ai.z - 1.2 && Math.abs(ball.x - ai.x) < 1.55 && ball.y < 2.8) {
          const pace = Math.hypot(ball.vx, ball.vz) / 26;
          const stretch = Math.abs(ball.x - ai.x) / 1.55;
          const err = 0.05 + pace * 0.22 + stretch * 0.25 - skill * 0.1;
          ai.swing = 0.3;
          if (Math.random() < err) {
            // a miss: into the net or long
            if (Math.random() < 0.5) hit('ai', (Math.random() - 0.5) * 6, NZ + 1.2, 0.6);
            else hit('ai', (Math.random() < 0.5 ? -1 : 1) * (HW + 0.6 + Math.random()), 2 + Math.random() * 4, 1.1);
          } else {
            const side = Math.random() < 0.5 ? -1 : 1;
            const tx = side * (1.2 + Math.random() * 2.4 * (0.6 + skill * 0.4));
            const tz = 1 + Math.random() * 5.5;
            hit('ai', tx, tz, 1.25 - skill * 0.2 + Math.random() * 0.25);
          }
        }
      };

      const step = (dt: number): void => {
        if (over && ball.live) ball.live = false;
        // my movement (with a gentle pull toward the ball when idle)
        const ax = a!.axisX();
        let tgt = me.x + ax * 7;
        if (!ax && ball.live && lastHit === 'ai' && ball.vz < 0) {
          const t = (me.z + 0.2 - ball.z) / ball.vz;
          tgt = me.x + (ball.x + ball.vx * t * 0.9 - 0.7 - me.x) * 0.45;
        }
        me.x = clamp(me.x + clamp(tgt - me.x, -6.6 * dt, 6.6 * dt), -7, 7);
        if (me.swing > 0) { if (tryMyHit()) me.swing = Math.min(me.swing, 0.12); me.swing -= dt; }
        if (ai.swing > 0) ai.swing -= dt;
        aiThink(dt);

        if (serveState === 'toss' && !ball.live) {
          ball.vy -= G * dt; ball.y += ball.vy * dt;
          if (ball.y < 0.9 && ball.vy < 0) { serveState = 'ready'; ball.y = 1; say('Toss it again.', 1); }
          return;
        }
        if (!ball.live) {
          if (serving === 'ai' && serveState === 'ready' && pause <= 0) {
            ball.x = ai.x + 0.3; ball.z = ai.z - 0.4; ball.y = 2.7;
            const q = Math.random();
            if (q < 0.1) hit('ai', (Math.random() - 0.5) * 9, NZ - 3 - Math.random() * 3, 0.8);
            else hit('ai', (Math.random() - 0.5) * 6.4, NZ - 1.4 - Math.random() * 4.6, 0.9 - skill * 0.1);
            ai.swing = 0.3; serveState = 'inplay'; isServe = true;
          }
          return;
        }
        const pz = ball.z;
        ball.vy -= G * dt;
        ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.z += ball.vz * dt;
        trail.push({ x: ball.x, y: ball.y, z: ball.z });
        if (trail.length > 10) trail.shift();
        // net
        if ((pz - NZ) * (ball.z - NZ) <= 0 && ball.y < NET && Math.abs(ball.x) < DW + 0.9) {
          ball.z = pz; ball.vz *= -0.15; ball.vx *= 0.2;
          g.audio.sport('bounce', 0.3);
          if (isServe) fault(lastHit); else point(lastHit === 'me' ? 'ai' : 'me', 'Into the net.');
          return;
        }
        if (ball.y <= 0) {
          ball.y = 0; ball.vy = -ball.vy * 0.68; ball.vx *= 0.9; ball.vz *= 0.86;
          bounces++;
          g.audio.sport('bounce', 0.35);
          const side: Side = ball.z < NZ ? 'me' : 'ai';
          if (bounces === 1) {
            const target: Side = lastHit === 'me' ? 'ai' : 'me';
            const inLong = target === 'ai' ? ball.z <= BASE + 0.05 && ball.z >= NZ : ball.z >= -0.05 && ball.z <= NZ;
            const inServe = target === 'ai' ? ball.z <= NZ + SVC + 0.05 : ball.z >= NZ - SVC - 0.05;
            const inWide = Math.abs(ball.x) <= HW + 0.04;
            if (side !== target || !inLong || !inWide || (isServe && !inServe)) {
              if (isServe) fault(lastHit); else point(target, 'Out.');
              return;
            }
            isServe = false;
          } else if (bounces >= 2) {
            point(lastHit, side === 'me' ? 'Winner from your rival.' : 'Winner!');
            return;
          }
        }
        if (ball.z < -9 || ball.z > BASE + 9 || Math.abs(ball.x) > 14) point(bounces ? lastHit : lastHit === 'me' ? 'ai' : 'me', bounces ? (lastHit === 'me' ? 'Winner!' : 'Past you.') : 'Long.');
      };

      // ------------------------------------------------------------------------------- drawing
      const camY = 6.4, camZ = -8.6, F = 410, HZ = 62;
      const P = (x: number, y: number, z: number): [number, number, number] => {
        const d = Math.max(0.5, z - camZ);
        return [W / 2 + (x * F) / d, HZ + ((camY - y) * F) / d, F / d];
      };
      const poly = (c: CanvasRenderingContext2D, pts: [number, number, number][], fill: string): void => {
        c.beginPath();
        pts.forEach((p, i) => { const [x, y] = P(p[0], p[1], p[2]); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
        c.closePath(); c.fillStyle = fill; c.fill();
      };
      const line = (c: CanvasRenderingContext2D, x0: number, z0: number, x1: number, z1: number): void => {
        const [a0, b0] = P(x0, 0, z0), [a1, b1] = P(x1, 0, z1);
        c.beginPath(); c.moveTo(a0, b0); c.lineTo(a1, b1); c.stroke();
      };
      const figure = (c: CanvasRenderingContext2D, x: number, z: number, shirt: string, swing: number, facing: 1 | -1): void => {
        const [px, py, s] = P(x, 0, z);
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(px, py, 0.45 * s, 0.12 * s, 0, 0, 7); c.fill();
        const top = P(x, 1.75, z)[1];
        const hgt = py - top;
        c.fillStyle = '#20232b'; c.fillRect(px - 0.16 * s, py - hgt * 0.48, 0.12 * s, hgt * 0.48); c.fillRect(px + 0.04 * s, py - hgt * 0.48, 0.12 * s, hgt * 0.48);
        c.fillStyle = shirt; rrect(c, px - 0.24 * s, py - hgt * 0.86, 0.48 * s, hgt * 0.42, 0.08 * s); c.fill();
        c.fillStyle = '#c99a72'; c.beginPath(); c.arc(px, py - hgt * 0.93, 0.12 * s, 0, 7); c.fill();
        // racket arm
        const ang = swing > 0 ? (-1.2 + (1 - swing / 0.32) * 2.6) * facing : 0.5 * facing;
        const sx0 = px + 0.22 * s, sy0 = py - hgt * 0.78;
        const ex = sx0 + Math.cos(ang - Math.PI / 2) * 0.55 * s * facing, ey = sy0 + Math.sin(ang - Math.PI / 2) * 0.55 * s;
        c.strokeStyle = '#c99a72'; c.lineWidth = Math.max(2, 0.08 * s); c.beginPath(); c.moveTo(sx0, sy0); c.lineTo(ex, ey); c.stroke();
        c.strokeStyle = '#ddd'; c.lineWidth = Math.max(1.5, 0.04 * s); c.beginPath(); c.ellipse(ex, ey - 0.12 * s, 0.11 * s, 0.15 * s, ang, 0, 7); c.stroke();
      };
      const drawBall = (c: CanvasRenderingContext2D): void => {
        if (!ball.live && serveState !== 'toss' && !(serving === 'ai' && pause <= 0)) return;
        const [sx0, sy0, s0] = P(ball.x, 0, ball.z);
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(sx0, sy0, 0.1 * s0, 0.04 * s0, 0, 0, 7); c.fill();
        c.strokeStyle = 'rgba(230,255,120,0.25)'; c.lineWidth = 2; c.beginPath();
        trail.forEach((t, i) => { const [x, y] = P(t.x, t.y, t.z); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
        c.stroke();
        const [bx, by, bs] = P(ball.x, ball.y, ball.z);
        c.fillStyle = '#e4ff4a'; c.beginPath(); c.arc(bx, by, Math.max(2.2, 0.07 * bs), 0, 7); c.fill();
      };

      const draw = (): void => {
        const c = a!.ctx;
        const sky = c.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#2b3348'); sky.addColorStop(0.3, '#3a4660'); sky.addColorStop(1, '#2f6b4a');
        c.fillStyle = sky; c.fillRect(0, 0, W, H);
        // stands with a crowd
        c.fillStyle = '#1b1f2b'; c.fillRect(0, 20, W, 50);
        for (let i = 0; i < 140; i++) { c.fillStyle = ['#d65a5a', '#e8c25a', '#5a8fd6', '#e8e8e8', '#4fae6b'][i % 5]!; c.fillRect((i * 37) % W, 26 + ((i * 13) % 38), 3, 4); }
        poly(c, [[-12, 0, -12], [12, 0, -12], [12, 0, BASE + 8], [-12, 0, BASE + 8]], '#3f7d5a');
        poly(c, [[-DW - 1.5, 0, -4], [DW + 1.5, 0, -4], [DW + 1.5, 0, BASE + 4], [-DW - 1.5, 0, BASE + 4]], '#355e8f');
        poly(c, [[-DW, 0, 0], [DW, 0, 0], [DW, 0, BASE], [-DW, 0, BASE]], '#2c5a96');
        c.strokeStyle = '#f2f4f8'; c.lineWidth = 2;
        line(c, -DW, 0, DW, 0); line(c, -DW, BASE, DW, BASE);
        line(c, -DW, 0, -DW, BASE); line(c, DW, 0, DW, BASE);
        line(c, -HW, 0, -HW, BASE); line(c, HW, 0, HW, BASE);
        line(c, -HW, NZ - SVC, HW, NZ - SVC); line(c, -HW, NZ + SVC, HW, NZ + SVC);
        line(c, 0, NZ - SVC, 0, NZ + SVC);
        line(c, 0, 0, 0, 0.3); line(c, 0, BASE, 0, BASE - 0.3);
        figure(c, ai.x, ai.z, '#e85d5d', ai.swing, -1);
        if (ball.z > NZ) drawBall(c);
        // net
        const [n0x, n0y] = P(-DW - 0.9, NET, NZ), [n1x] = P(DW + 0.9, NET, NZ), [, nby] = P(0, 0, NZ);
        c.fillStyle = 'rgba(20,20,24,0.55)'; c.fillRect(n0x, n0y, n1x - n0x, nby - n0y);
        c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1;
        for (let x = n0x; x < n1x; x += 6) { c.beginPath(); c.moveTo(x, n0y); c.lineTo(x, nby); c.stroke(); }
        c.fillStyle = '#f2f4f8'; c.fillRect(n0x, n0y - 2, n1x - n0x, 3);
        if (ball.z <= NZ) drawBall(c);
        figure(c, me.x, me.z, '#4aa3ff', me.swing, 1);
        // scoreboard
        c.fillStyle = 'rgba(8,10,16,0.75)'; rrect(c, 12, H - 74, 210, 62, 10); c.fill();
        c.font = '600 14px Inter, system-ui'; c.textAlign = 'left'; c.textBaseline = 'middle';
        const srv = (s: Side): string => (serving === s ? ' •' : '');
        c.fillStyle = '#9fd0ff'; c.fillText(`You${srv('me')}`, 24, H - 56); c.fillStyle = '#ff9a9a'; c.fillText(`Rival${srv('ai')}`, 24, H - 32);
        c.fillStyle = '#fff'; c.textAlign = 'right';
        c.fillText(String(games[0]), 150, H - 56); c.fillText(String(games[1]), 150, H - 32);
        const pc = (i: 0 | 1): string => { const [m, o] = pts; if (m >= 3 && o >= 3) return m === o ? '40' : (i === 0 ? m > o : o > m) ? 'AD' : ''; return CALL[Math.min(3, pts[i])]!; };
        c.fillStyle = '#ffd166'; c.fillText(pc(0), 205, H - 56); c.fillText(pc(1), 205, H - 32);
        if (serving === 'me' && !ball.live && pause <= 0) {
          const apex = 1.1 + 5.9 * 5.9 / (2 * G);
          if (serveState === 'toss') meter(c, W - 230, H - 40, 210, 12, ball.y / apex, { zone: [0.9, 1], label: 'Hit at the top of the toss' });
          else { c.fillStyle = '#cfd6e4'; c.font = '13px Inter, system-ui'; c.textAlign = 'right'; c.fillText('Your serve: press Swing to toss', W - 20, H - 34); }
        }
        if (msgT > 0) {
          c.globalAlpha = Math.min(1, msgT * 2);
          c.fillStyle = 'rgba(8,10,16,0.8)'; rrect(c, W / 2 - 170, 84, 340, 40, 12); c.fill();
          c.fillStyle = '#fff'; c.font = '600 18px Inter, system-ui'; c.textAlign = 'center'; c.fillText(msg, W / 2, 104);
          c.globalAlpha = 1;
        }
      };

      a = arena(page, host, {
        w: W, h: H,
        buttons: [{ label: '◀', key: 'left' }, { label: '▶', key: 'right' }, { label: 'Power', key: 'alt' }, { label: 'Swing', key: 'act', cls: 'primary' }],
        press,
        intro: 'Move with ← →. Swing as the ball reaches you: early pulls it, late pushes it, and holding a direction aims it.',
        frame: (dt) => {
          msgT = Math.max(0, msgT - dt);
          if (pause > 0) pause -= dt;
          // sub-steps keep fast balls from skipping the net
          for (let i = 0; i < 3; i++) step(dt / 3);
          draw();
          a!.score([['Games', `${games[0]}–${games[1]}`], ['Point', callScore()]]);
        },
      });
      resetPoint();
    },
  };
  return page;
}
