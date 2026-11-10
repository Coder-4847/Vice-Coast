import type { CKind } from './defs';

const PAL = [
  ['#ff4f7b', '#ffd166', '#06d6a0', '#118ab2', '#2b2d42'],
  ['#f72585', '#7209b7', '#3a0ca3', '#4cc9f0', '#fefae0'],
  ['#ff9f1c', '#ffbf69', '#2ec4b6', '#cbf3f0', '#1b1b3a'],
  ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#1d3557'],
  ['#8ac926', '#ffca3a', '#ff595e', '#1982c4', '#6a4c93'],
];

const rnd = (seed: number): (() => number) => {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return (s >>> 8) / 16777216; };
};

/**
 * Paints a wall. `graffiti`: blank primed concrete at progress 0, a bold tag revealed left to right as `prog` goes to 1.
 * `art`: a finished mural in one of several styles.
 */
export function drawArt(ctx: CanvasRenderingContext2D, w: number, h: number, kind: CKind, design: number, prog: number, words: string[]): void {
  const r = rnd(design);
  const pal = PAL[design % PAL.length]!;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  // primed wall
  ctx.fillStyle = '#9a978f';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${0.02 + r() * 0.04})`; ctx.fillRect(r() * w, r() * h, 2 + r() * 14, 2 + r() * 8); }
  if (kind === 'graffiti') {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    ctx.strokeRect(16, 16, w - 32, h - 32);
    ctx.setLineDash([]);
    if (prog > 0) {
      ctx.beginPath();
      ctx.rect(0, 0, w * prog, h);
      ctx.clip();
      tag(ctx, w, h, design, pal, words, r);
      // the spray cloud at the leading edge
      ctx.restore(); ctx.save();
      const g = ctx.createRadialGradient(w * prog, h * 0.5, 4, w * prog, h * 0.5, 60);
      g.addColorStop(0, `${pal[0]}aa`); g.addColorStop(1, `${pal[0]}00`);
      if (prog < 1) { ctx.fillStyle = g; ctx.fillRect(w * prog - 60, 0, 120, h); }
    }
    ctx.restore();
    return;
  }
  mural(ctx, w, h, design, pal, r);
  ctx.restore();
}

function tag(ctx: CanvasRenderingContext2D, w: number, h: number, design: number, pal: string[], words: string[], r: () => number): void {
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, pal[4]!); bg.addColorStop(1, pal[2]!);
  ctx.fillStyle = bg;
  ctx.fillRect(10, 10, w - 20, h - 20);
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = pal[(i + 1) % 4]! + '66';
    ctx.beginPath(); ctx.arc(r() * w, r() * h, 20 + r() * 70, 0, 7); ctx.fill();
  }
  const word = words[design % words.length]!;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const size = Math.min(h * 0.62, (w * 0.8) / (word.length * 0.62));
  ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.06 + r() * 0.1);
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#000000aa'; ctx.fillText(word, 8, 10);
  ctx.lineWidth = size * 0.14; ctx.strokeStyle = pal[4]!; ctx.strokeText(word, 0, 0);
  ctx.lineWidth = size * 0.07; ctx.strokeStyle = pal[3]!; ctx.strokeText(word, 0, 0);
  const t = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
  t.addColorStop(0, pal[1]!); t.addColorStop(1, pal[0]!);
  ctx.fillStyle = t; ctx.fillText(word, 0, 0);
  ctx.restore();
  // drips
  for (let i = 0; i < 8; i++) {
    const x = w * 0.15 + r() * w * 0.7, y = h * 0.62, len = 18 + r() * 50;
    ctx.fillStyle = pal[0]!; ctx.fillRect(x, y, 4, len);
    ctx.beginPath(); ctx.arc(x + 2, y + len, 4, 0, 7); ctx.fill();
  }
}

function mural(ctx: CanvasRenderingContext2D, w: number, h: number, design: number, pal: string[], r: () => number): void {
  const style = design % 4;
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, pal[0]!); bg.addColorStop(0.6, pal[1]!); bg.addColorStop(1, pal[4]!);
  ctx.fillStyle = bg;
  ctx.fillRect(8, 8, w - 16, h - 16);
  ctx.save();
  ctx.beginPath(); ctx.rect(8, 8, w - 16, h - 16); ctx.clip();
  if (style === 0) {
    // sunset over a skyline
    ctx.fillStyle = pal[3]!; ctx.beginPath(); ctx.arc(w * 0.62, h * 0.5, h * 0.3, 0, 7); ctx.fill();
    for (let i = 0; i < 14; i++) { const bw = w / 14, bh = h * (0.18 + r() * 0.4); ctx.fillStyle = i % 2 ? pal[4]! : '#101420'; ctx.fillRect(i * bw, h - bh, bw - 3, bh); }
  } else if (style === 1) {
    // concentric waves
    for (let i = 12; i > 0; i--) { ctx.fillStyle = pal[i % 5]!; ctx.beginPath(); ctx.ellipse(w / 2, h * 0.95, w * 0.05 * i, h * 0.09 * i, 0, Math.PI, 0); ctx.fill(); }
  } else if (style === 2) {
    // an eye
    ctx.fillStyle = '#f4f1e8'; ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w * 0.3, h * 0.28, 0, 0, 7); ctx.fill();
    ctx.fillStyle = pal[3]!; ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.24, 0, 7); ctx.fill();
    ctx.fillStyle = '#0a0a0e'; ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.11, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(w / 2 + h * 0.06, h / 2 - h * 0.07, h * 0.04, 0, 7); ctx.fill();
  } else {
    // tessellated triangles
    const n = 9;
    for (let i = 0; i < n * 3; i++) {
      const cx = (i % n) * (w / n) + (Math.floor(i / n) % 2) * (w / n / 2), cy = Math.floor(i / n) * (h / 3);
      ctx.fillStyle = pal[(i * 7 + design) % 5]!;
      ctx.beginPath(); ctx.moveTo(cx, cy + h / 3); ctx.lineTo(cx + w / n / 2, cy); ctx.lineTo(cx + w / n, cy + h / 3); ctx.fill();
    }
  }
  ctx.restore();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, w - 16, h - 16);
}
