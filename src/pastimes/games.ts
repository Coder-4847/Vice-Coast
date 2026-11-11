import type { Story } from '../story/Story';
import type { Page } from '../ui/Modal';
import { arena, clamp, meter, rrect, type Arena, type Key } from './arena';
import { a11y } from '../core/a11y';

// ================================================================================================ bowling

/** Standard ten-pin scoring for a list of rolls (pins per roll). Returns the running total per completed frame. */
export function bowlScore(rolls: number[]): number[] {
  const out: number[] = [];
  let i = 0, total = 0;
  for (let f = 0; f < 10 && i < rolls.length; f++) {
    const a = rolls[i]!, b = rolls[i + 1], c = rolls[i + 2];
    if (a === 10) { if (b === undefined || c === undefined) break; total += 10 + b + c; i += 1; }
    else if (b === undefined) break;
    else if (a + b === 10) { if (c === undefined) break; total += 10 + c; i += 2; }
    else { total += a + b; i += 2; }
    out.push(total);
  }
  return out;
}

const L = 18.29, LW = 1.066, BR = 0.108, PR = 0.061;
interface Pin { x: number; y: number; vx: number; vy: number; down: boolean; gone: boolean; ang: number }

function rackPins(): Pin[] {
  const out: Pin[] = [];
  const head = L - 0.95;
  for (let row = 0; row < 4; row++) for (let k = 0; k <= row; k++) {
    out.push({ x: head + row * 0.264, y: (k - row / 2) * 0.3048, vx: 0, vy: 0, down: false, gone: false, ang: 0 });
  }
  return out;
}

export function bowlingPage(story: Story, onFinish: (score: number, rival: number) => void): Page {
  const g = story.g;
  let a: Arena | null = null;
  const page: Page = {
    title: 'Bowling', kicker: 'Starlite Lanes · ten frames', hideMoney: true,
    hints: '←/→ position · Space: aim, power, spin',
    onClose: () => a?.stop(),
    render: (host) => {
      const W = 640, H = 300;
      let pins = rackPins();
      const ball = { x: 0, y: 0, vx: 0, vy: 0, spin: 0, gutter: false };
      let startY = 0;
      type Ph = 'aim' | 'power' | 'spin' | 'roll' | 'wait' | 'over';
      let ph: Ph = 'aim';
      let osc = 0, angle = 0, power = 0, spin = 0, t0 = 0, rollT = 0;
      const rolls: number[] = [];
      let frameRoll = 0;
      let standingBefore = 10;
      let msg = '', msgT = 0;
      const rival: number[] = [];
      const R = Math.random;
      for (let f = 0; f < 10; f++) {
        const r1 = R() < 0.32 ? 10 : 6 + Math.floor(R() * 4);
        if (r1 === 10) { rival.push(10); if (f === 9) { rival.push(R() < 0.3 ? 10 : 8, R() < 0.5 ? 9 : 7); } continue; }
        const r2 = R() < 0.5 ? 10 - r1 : Math.floor(R() * (10 - r1));
        rival.push(r1, r2);
        if (f === 9 && r1 + r2 === 10) rival.push(7 + Math.floor(R() * 4));
      }
      const rivalTotal = bowlScore(rival).slice(-1)[0] ?? 0;
      const say = (t: string, s = 1.8): void => { msg = t; msgT = s; };
      const frameNo = (): number => {
        let f = 0, i = 0;
        while (i < rolls.length && f < 9) { if (rolls[i] === 10) i++; else i += 2; f++; }
        return f;
      };

      const press = (k: Key): void => {
        if (ph === 'aim' && k === 'act') { ph = 'power'; t0 = 0; }
        else if (ph === 'power' && k === 'act') { ph = 'spin'; t0 = 0; }
        else if (ph === 'spin' && k === 'act') {
          ph = 'roll'; rollT = 0;
          const v = 6.5 + power * 3.5;
          ball.x = 0; ball.y = startY; ball.vx = v * Math.cos(angle); ball.vy = v * Math.sin(angle); ball.spin = spin; ball.gutter = false;
          g.audio.sport('roll', 0.6);
        }
      };

      const settle = (): void => {
        // the lane only holds the pins that were standing before this ball
        const now = pins.filter((p) => p.down || p.gone).length;
        rolls.push(now);
        if (now === 10 && frameRoll === 0) { say('STRIKE!', 2.2); g.audio.sport('cheer', 0.9); }
        else if (frameRoll === 1 && standingBefore - now === 0 && standingBefore < 10) { say('Spare!', 2); g.audio.sport('cheer', 0.6); }
        else if (now === 0) say(ball.gutter ? 'Gutter ball.' : 'Missed them all.');
        else say(`${now} pin${now === 1 ? '' : 's'}.`, 1.2);
        ph = 'wait';
        setTimeout(nextRoll, 1500);
      };
      const isTenth = (): boolean => {
        let f = 0, i = 0;
        while (i < rolls.length && f < 9) { if (rolls[i] === 10) i++; else i += 2; f++; }
        return f >= 9;
      };
      const nextRoll = (): void => {
        if (!a?.running) return;
        if (isTenth()) {
          // tenth frame: up to three balls
          let i = 0, f = 0;
          while (f < 9) { if (rolls[i] === 10) i++; else i += 2; f++; }
          const t = rolls.slice(i);
          const done = t.length === 3 || (t.length === 2 && t[0]! + t[1]! < 10);
          if (done) { finish(); return; }
          const fresh = t.length === 0 || (t.length === 1 && t[0] === 10) || (t.length === 2 && (t[1] === 10 || t[0]! + t[1]! === 10));
          frameRoll = t.length;
          resetLane(fresh);
        } else {
          const last = rolls[rolls.length - 1]!;
          const freshFrame = frameRoll === 1 || last === 10;
          frameRoll = freshFrame ? 0 : 1;
          resetLane(freshFrame);
        }
      };
      const resetLane = (fresh: boolean): void => {
        if (fresh) pins = rackPins();
        else pins = pins.filter((p) => !p.down && !p.gone);
        for (const p of pins) { p.vx = p.vy = 0; }
        standingBefore = pins.length;
        ph = 'aim';
      };
      const finish = (): void => {
        ph = 'over';
        const me = bowlScore(rolls).slice(-1)[0] ?? 0;
        setTimeout(() => { if (!a?.running) return; a.stop(); host.back(); onFinish(me, rivalTotal); }, 900);
      };

      const physics = (dt: number): void => {
        if (ph !== 'roll') return;
        rollT += dt;
        if (!ball.gutter) {
          if (ball.x > L * 0.5) ball.vy += ball.spin * 1.7 * dt;
          if (Math.abs(ball.y) > LW / 2 - BR * 0.4) { ball.gutter = true; ball.y = Math.sign(ball.y) * (LW / 2 + 0.06); ball.vy = 0; }
        }
        ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        const all = pins.filter((p) => !p.gone);
        if (!ball.gutter) for (const p of all) {
          const dx = p.x - ball.x, dy = p.y - ball.y, d = Math.hypot(dx, dy);
          if (d < BR + PR && d > 1e-5) {
            const nx = dx / d, ny = dy / d;
            const rel = (ball.vx - p.vx) * nx + (ball.vy - p.vy) * ny;
            if (rel > 0) {
              const j = (1.7 * rel) / (1 / 7 + 1 / 1.5);
              p.vx += (j / 1.5) * nx; p.vy += (j / 1.5) * ny;
              ball.vx -= (j / 7) * nx; ball.vy -= (j / 7) * ny;
              if (!p.down) { p.down = true; g.audio.sport('pins', 0.8); }
            }
            p.x = ball.x + nx * (BR + PR); p.y = ball.y + ny * (BR + PR);
          }
        }
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
          const p = all[i]!, q = all[j]!;
          const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
          const rr = PR * (p.down || q.down ? 2.6 : 2);
          if (d < rr && d > 1e-5) {
            const nx = dx / d, ny = dy / d;
            const rel = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
            if (rel > 0.05) {
              const j2 = rel * 0.85;
              p.vx -= j2 * nx; p.vy -= j2 * ny; q.vx += j2 * nx; q.vy += j2 * ny;
              if (p.down && !q.down && rel > 0.4) q.down = true;
              if (q.down && !p.down && rel > 0.4) p.down = true;
            }
            const ov = (rr - d) / 2;
            p.x -= nx * ov; p.y -= ny * ov; q.x += nx * ov; q.y += ny * ov;
          }
        }
        for (const p of all) {
          const sp = Math.hypot(p.vx, p.vy);
          if (sp > 0) { const ns = Math.max(0, sp - 2.2 * dt); p.vx *= ns / sp; p.vy *= ns / sp; p.ang += sp * dt * 6; }
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (Math.abs(p.y) > LW / 2 + 0.05 || p.x > L + 0.6) { p.gone = true; p.down = true; }
        }
        const moving = all.some((p) => Math.hypot(p.vx, p.vy) > 0.05);
        if ((ball.x > L + 0.7 && !moving) || rollT > 6) settle();
      };

      const sx = (x: number): number => 24 + (x / (L + 0.9)) * (W - 48);
      const sy = (y: number): number => H * 0.42 + y * 150;
      const draw = (): void => {
        const c = a!.ctx;
        c.fillStyle = '#14161d'; c.fillRect(0, 0, W, H);
        // lane (wood) and gutters
        c.fillStyle = '#2a2d36'; c.fillRect(sx(0), sy(-LW / 2 - 0.12), sx(L + 0.9) - sx(0), (LW + 0.24) * 150);
        const wood = c.createLinearGradient(0, sy(-LW / 2), 0, sy(LW / 2));
        wood.addColorStop(0, '#c99a5b'); wood.addColorStop(0.5, '#e2bb7c'); wood.addColorStop(1, '#c99a5b');
        c.fillStyle = wood; c.fillRect(sx(0), sy(-LW / 2), sx(L) - sx(0), LW * 150);
        c.strokeStyle = 'rgba(120,80,40,0.25)'; c.lineWidth = 1;
        for (let k = 1; k < 12; k++) { const y = sy(-LW / 2 + (LW * k) / 12); c.beginPath(); c.moveTo(sx(0), y); c.lineTo(sx(L), y); c.stroke(); }
        // arrows and dots
        c.fillStyle = 'rgba(90,40,20,0.7)';
        for (let k = -3; k <= 3; k++) { const x = sx(4.6 + Math.abs(k) * 0.3), y = sy(k * 0.13); c.beginPath(); c.moveTo(x + 6, y); c.lineTo(x - 4, y - 4); c.lineTo(x - 4, y + 4); c.fill(); }
        c.fillStyle = '#d22'; c.fillRect(sx(0) - 2, sy(-LW / 2), 3, LW * 150);
        // pin deck
        c.fillStyle = '#ead2a0'; c.fillRect(sx(L - 1.2), sy(-LW / 2), sx(L) - sx(L - 1.2), LW * 150);
        c.fillStyle = '#0b0c10'; c.fillRect(sx(L), sy(-LW / 2 - 0.12), sx(L + 0.9) - sx(L), (LW + 0.24) * 150);
        for (const p of pins) {
          if (p.gone) continue;
          const x = sx(p.x), y = sy(p.y);
          c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.arc(x + 2, y + 2, PR * 150, 0, 7); c.fill();
          if (p.down) {
            c.save(); c.translate(x, y); c.rotate(p.ang);
            c.fillStyle = '#f4f4f0'; c.beginPath(); c.ellipse(0, 0, PR * 150 * 1.9, PR * 150 * 0.8, 0, 0, 7); c.fill();
            c.fillStyle = '#d22'; c.fillRect(-2, -PR * 120, 4, PR * 240);
            c.restore();
          } else {
            c.fillStyle = '#f8f8f4'; c.beginPath(); c.arc(x, y, PR * 150, 0, 7); c.fill();
            c.strokeStyle = '#d22'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, PR * 90, 0, 7); c.stroke();
          }
        }
        // ball
        const bx = ph === 'roll' || ph === 'wait' ? ball.x : 0, by = ph === 'roll' || ph === 'wait' ? ball.y : startY;
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(sx(bx) + 3, sy(by) + 3, BR * 150, 0, 7); c.fill();
        const bg = c.createRadialGradient(sx(bx) - 5, sy(by) - 5, 2, sx(bx), sy(by), BR * 150);
        bg.addColorStop(0, '#7fb2ff'); bg.addColorStop(1, '#1d3c8f');
        c.fillStyle = bg; c.beginPath(); c.arc(sx(bx), sy(by), BR * 150, 0, 7); c.fill();
        // aim line
        if (ph === 'aim' || ph === 'power' || ph === 'spin') {
          c.setLineDash([5, 6]); c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(sx(0), sy(startY)); c.lineTo(sx(9), sy(startY + Math.tan(angle) * 9)); c.stroke(); c.setLineDash([]);
        }
        // score sheet
        const my = bowlScore(rolls);
        c.font = '600 12px Inter, system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
        for (let f = 0; f < 10; f++) {
          const x = 24 + f * 59, y = H - 66;
          c.fillStyle = 'rgba(255,255,255,0.08)'; rrect(c, x, y, 55, 52, 6); c.fill();
          c.fillStyle = f === frameNo() && ph !== 'over' ? '#ffd166' : '#9aa4b8'; c.fillText(String(f + 1), x + 27, y + 9);
          c.fillStyle = '#fff'; c.fillText(my[f] !== undefined ? String(my[f]) : '', x + 27, y + 38);
        }
        c.textAlign = 'left'; c.fillStyle = '#9aa4b8'; c.font = '11px Inter, system-ui';
        c.fillText(`Rival: ${rivalTotal}`, 24, H - 76);
        // meters
        if (ph === 'power') meter(c, W - 230, 18, 200, 12, power, { label: 'Power' });
        if (ph === 'spin') meter(c, W - 230, 18, 200, 12, 0, { needle: 0.5 + spin / 2, zone: [0.4, 0.6], label: 'Hook ← → (centre = straight)' });
        if (ph === 'aim') { c.fillStyle = '#cfd6e4'; c.font = '12px Inter, system-ui'; c.fillText('Move ← →, press Bowl to lock the angle', W - 290, 24); }
        if (msgT > 0) {
          c.globalAlpha = Math.min(1, msgT * 2);
          c.fillStyle = 'rgba(8,10,16,0.8)'; rrect(c, W / 2 - 120, 40, 240, 40, 12); c.fill();
          c.fillStyle = '#fff'; c.font = '700 20px Inter, system-ui'; c.textAlign = 'center'; c.fillText(msg, W / 2, 61);
          c.globalAlpha = 1;
        }
      };

      a = arena(page, host, {
        w: W, h: H,
        buttons: [{ label: '◀', key: 'left' }, { label: '▶', key: 'right' }, { label: 'Bowl', key: 'act', cls: 'primary' }],
        press,
        frame: (dt) => {
          msgT = Math.max(0, msgT - dt);
          osc += dt;
          if (ph === 'aim') {
            startY = clamp(startY + a!.axisX() * dt * 0.5, -LW / 2 + 0.15, LW / 2 - 0.15);
            angle = Math.sin(osc * 2.2) * 0.035;
          } else if (ph === 'power') { t0 += dt; power = 0.5 - 0.5 * Math.cos(t0 * 3.4); }
          else if (ph === 'spin') { t0 += dt; spin = Math.sin(t0 * 3); }
          for (let i = 0; i < 4; i++) physics(dt / 4);
          draw();
          a!.score([['Frame', `${Math.min(10, frameNo() + 1)}/10`], ['You', String(bowlScore(rolls).slice(-1)[0] ?? 0)], ['Rival', String(rivalTotal)]]);
        },
      });
    },
  };
  return page;
}

// ================================================================================================ hoops

export function hoopsPage(story: Story, onFinish: (score: number, rival: number) => void): Page {
  const g = story.g;
  let a: Arena | null = null;
  const page: Page = {
    title: 'Hoops', kicker: 'Seaside courts · 60-second shootout', hideMoney: true,
    hints: 'Hold Space and release in the green',
    onClose: () => a?.stop(),
    render: (host) => {
      const W = 640, H = 360;
      const rival = 13 + Math.floor(Math.random() * 7);
      let time = 60, score = 0, rack = 0, inRack = 0;
      let charging = false, charge = 0;
      let shot: { t: number; err: number; made: boolean; money: boolean } | null = null;
      let msg = '', msgT = 0, over = false;
      const dist = (): number => 4.2 + rack * 0.75;
      const zone = (): [number, number] => { const w = 0.16 - rack * 0.018; return [0.72 - w / 2, 0.72 + w / 2]; };
      const press = (k: Key): void => { if (k === 'act' && !shot && !over && time > 0) { charging = true; charge = 0; } };
      const release = (): void => {
        charging = false;
        const [z0, z1] = zone();
        const mid = (z0 + z1) / 2;
        const err = (charge - mid) / ((z1 - z0) / 2);
        const made = Math.abs(err) < 1 || (Math.abs(err) < 1.5 && Math.random() < 0.35);
        shot = { t: 0, err, made, money: inRack === 4 };
      };
      const draw = (): void => {
        const c = a!.ctx;
        const bg = c.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#ff9a62'); bg.addColorStop(0.55, '#ffcf8a'); bg.addColorStop(0.56, '#3a3f4c'); bg.addColorStop(1, '#2a2e38');
        c.fillStyle = bg; c.fillRect(0, 0, W, H);
        c.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 9; i++) c.fillRect(i * 80, H * 0.56, 2, H);
        // backboard and hoop
        const hx = W - 120, hy = 120;
        c.fillStyle = '#555'; c.fillRect(W - 70, hy - 20, 8, H * 0.56 - hy + 20 + 40);
        c.fillStyle = 'rgba(240,240,250,0.9)'; c.fillRect(W - 82, hy - 62, 10, 86);
        c.strokeStyle = '#ff5a2a'; c.lineWidth = 4; c.beginPath(); c.moveTo(hx - 26, hy); c.lineTo(W - 82, hy); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.5;
        for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(hx - 24 + k * 12, hy); c.lineTo(hx - 18 + k * 8, hy + 26); c.stroke(); }
        // shooter
        const px = 120 - rack * 12, py = H * 0.56 + 30;
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(px, py + 38, 22, 6, 0, 0, 7); c.fill();
        c.fillStyle = '#20232b'; c.fillRect(px - 9, py, 8, 38); c.fillRect(px + 1, py, 8, 38);
        c.fillStyle = '#4aa3ff'; rrect(c, px - 14, py - 34, 28, 36, 6); c.fill();
        c.fillStyle = '#c99a72'; c.beginPath(); c.arc(px, py - 44, 9, 0, 7); c.fill();
        // ball
        let bx = px + 14, by = py - 50 - (charging ? charge * 10 : 0);
        if (shot) {
          const k = Math.min(1, shot.t / 0.85);
          const tx = hx - 13 + (shot.made ? 0 : shot.err * 22), ty = hy - 6;
          bx = px + 14 + (tx - px - 14) * k;
          by = (py - 50) + (ty - (py - 50)) * k - Math.sin(k * Math.PI) * (150 + dist() * 8);
          if (shot.t > 0.85) { const f = shot.t - 0.85; if (shot.made) { bx = tx; by = ty + f * 260; } else { bx = tx + (shot.err > 0 ? 1 : -1) * f * 180; by = ty + f * 200 - 80 * f; } }
        }
        c.fillStyle = '#e8792a'; c.beginPath(); c.arc(bx, by, 10, 0, 7); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(bx - 10, by); c.lineTo(bx + 10, by); c.moveTo(bx, by - 10); c.lineTo(bx, by + 10); c.stroke();
        // rack
        for (let i = 0; i < 5; i++) { c.fillStyle = i < inRack ? 'rgba(255,255,255,0.15)' : i === 4 ? '#ffd166' : '#e8792a'; c.beginPath(); c.arc(40 + i * 24, H - 24, 9, 0, 7); c.fill(); }
        c.fillStyle = '#fff'; c.font = '600 13px Inter, system-ui'; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText(`Rack ${Math.min(5, rack + 1)}/5 · ${dist().toFixed(1)} m`, 170, H - 24);
        // meter
        const [z0, z1] = zone();
        meter(c, 24, 24, 220, 14, charging ? charge : 0, { zone: [z0, z1], label: 'Release in the green' });
        c.fillStyle = time < 10 ? '#ff6a6a' : '#fff'; c.font = '700 30px Bebas Neue, Inter, system-ui'; c.textAlign = 'center';
        c.fillText(time.toFixed(1), W / 2, 34);
        if (msgT > 0) { c.globalAlpha = Math.min(1, msgT * 2); c.fillStyle = '#fff'; c.font = '700 22px Inter, system-ui'; c.fillText(msg, W / 2, 80); c.globalAlpha = 1; }
      };
      a = arena(page, host, {
        w: W, h: H, buttons: [{ label: 'Shoot (hold)', key: 'act', cls: 'primary' }], press,
        intro: `Five racks of five; the gold money ball counts double. Beat ${rival} points.`,
        frame: (dt) => {
          msgT = Math.max(0, msgT - dt);
          if (!over) time = Math.max(0, time - dt);
          if (charging) { charge = Math.min(1, charge + dt / 0.75); if (!a!.held('act') || charge >= 1) release(); }
          if (shot) {
            const before = shot.t;
            shot.t += dt;
            if (before < 0.85 && shot.t >= 0.85) {
              if (shot.made) { score += shot.money ? 2 : 1; g.audio.sport('swish', 0.7); msg = shot.money ? '+2' : '+1'; msgT = 0.8; }
              else g.audio.sport('rim', 0.5);
            }
            if (shot.t > 1.15) { shot = null; inRack++; if (inRack >= 5) { inRack = 0; rack++; } }
          }
          if (!over && (time <= 0 || rack >= 5) && !shot) {
            over = true;
            g.audio.sport('whistle', 0.4);
            setTimeout(() => { if (!a?.running) return; a.stop(); host.back(); onFinish(score, rival); }, 900);
          }
          draw();
          a!.score([['Score', String(score)], ['To beat', String(rival)]]);
        },
      });
    },
  };
  return page;
}

// ================================================================================================ arm wrestling

export const ARM_RIVALS = [
  { name: 'Big Lou', power: 0.7, line: 'Lou works the docks. He has never lost to a tourist.' },
  { name: 'Marisa "Vise" Ortega', power: 0.9, line: 'Three-time boardwalk champion. Do not look at her biceps.' },
  { name: 'The Mountain', power: 1.12, line: 'Nobody knows his real name. Nobody asks.' },
];

export function armPage(story: Story, tier: number, onFinish: (win: boolean) => void): Page {
  const g = story.g;
  let a: Arena | null = null;
  const foe = ARM_RIVALS[tier]!;
  const page: Page = {
    title: 'Arm Wrestling', kicker: `Muscle Beach · vs ${foe.name}`, hideMoney: true,
    hints: 'Tap Space as fast as you can · alternate ← → for a burst',
    onClose: () => a?.stop(),
    render: (host) => {
      const W = 520, H = 320;
      let tug = 0, time = 0, go = -2.2, done = false, lastDir: Key | null = null, surge = 0;
      const press = (k: Key): void => {
        if (go < 0 || done) return;
        if (k === 'act') tug += 0.034;
        if ((k === 'left' || k === 'right') && k !== lastDir) { tug += 0.026; lastDir = k; }
        g.audio.sport('reel', 0.4);
      };
      const end = (win: boolean): void => {
        done = true;
        g.audio.sport(win ? 'cheer' : 'groan', 0.8);
        setTimeout(() => { if (!a?.running) return; a.stop(); host.back(); onFinish(win); }, 1100);
      };
      a = arena(page, host, {
        w: W, h: H,
        buttons: [{ label: '◀', key: 'left' }, { label: 'PUSH', key: 'act', cls: 'primary' }, { label: '▶', key: 'right' }],
        press, intro: foe.line,
        frame: (dt) => {
          if (!done) {
            go += dt;
            if (go > 0) {
              time += dt;
              // accessibility: holding the button pushes like steady tapping
              if (a11y.holdToMash && a!.held('act')) tug += dt * 0.034 * 6.5;
              surge -= dt;
              if (surge <= 0 && Math.random() < dt * 0.5) surge = 0.6 + Math.random() * 0.6;
              tug -= dt * foe.power * (0.32 + (surge > 0 ? 0.35 : 0) + time * 0.012);
              tug = clamp(tug, -1, 1);
              if (tug >= 1) end(true); else if (tug <= -1) end(false); else if (time > 25) end(tug > 0);
            }
          }
          const c = a!.ctx;
          c.fillStyle = '#1a1d26'; c.fillRect(0, 0, W, H);
          // table
          c.fillStyle = '#6b4a2e'; rrect(c, 60, H * 0.62, W - 120, 26, 6); c.fill();
          c.fillStyle = '#4c3420'; c.fillRect(90, H * 0.62 + 26, 16, 90); c.fillRect(W - 106, H * 0.62 + 26, 16, 90);
          // arms meet in the middle and lean with the tug
          const cx = W / 2, cy = H * 0.62 - 4, ang = -tug * 1.1 - Math.PI / 2;
          const hx = cx + Math.cos(ang) * 92, hy = cy + Math.sin(ang) * 92;
          c.lineCap = 'round';
          c.strokeStyle = '#c99a72'; c.lineWidth = 26; c.beginPath(); c.moveTo(cx - 110, cy); c.lineTo(cx - 6, cy); c.lineTo(hx - 4, hy); c.stroke();
          c.strokeStyle = '#8a5a3a'; c.lineWidth = 26; c.beginPath(); c.moveTo(cx + 110, cy); c.lineTo(cx + 6, cy); c.lineTo(hx + 4, hy); c.stroke();
          c.fillStyle = '#b8835e'; c.beginPath(); c.arc(hx, hy, 18, 0, 7); c.fill();
          c.font = '600 14px Inter, system-ui'; c.textAlign = 'left'; c.fillStyle = '#9fd0ff'; c.fillText('You', 24, 30);
          c.textAlign = 'right'; c.fillStyle = '#ff9a9a'; c.fillText(foe.name, W - 24, 30);
          meter(c, 24, 44, W - 48, 14, (tug + 1) / 2, { zone: [0.95, 1], color: '#4aa3ff' });
          c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = '700 34px Bebas Neue, Inter, system-ui';
          if (go < 0) c.fillText(go < -1.4 ? 'READY' : go < -0.6 ? 'SET' : 'GO!', W / 2, 120);
          if (surge > 0 && go > 0 && !done) { c.fillStyle = '#ff6a6a'; c.font = '600 14px Inter, system-ui'; c.fillText(`${foe.name.split(' ')[0]} surges!`, W / 2, 100); }
          a!.score([['Time', `${Math.max(0, 25 - time).toFixed(1)} s`]]);
        },
      });
    },
  };
  return page;
}
