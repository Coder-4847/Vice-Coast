import { h } from '../ui/dom';

/** Building blocks for the in-game websites. Every clickable thing is a button with data-nav-row (keyboard and pad). */

export type Kid = Node | string | null | undefined | false;

export const div = (cls: string, ...kids: Kid[]): HTMLDivElement => h('div', cls, ...kids);

export function button(label: Kid, onClick: () => void, cls = 'w-btn', disabled = false): HTMLButtonElement {
  const b = h('button', `${cls}${disabled ? ' is-off' : ''}`, label);
  b.type = 'button';
  b.dataset.navRow = '';
  if (disabled) b.setAttribute('aria-disabled', 'true');
  b.addEventListener('click', (e) => { e.stopPropagation(); if (!disabled) onClick(); });
  return b;
}

const SVG = 'http://www.w3.org/2000/svg';
function svg(w: number, h: number): SVGSVGElement {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${h}`);
  s.setAttribute('width', String(w));
  s.setAttribute('height', String(h));
  return s;
}
function node(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** A small line chart with no axes; green when it ended higher than it began. */
export function sparkline(values: number[], w = 120, hgt = 32): SVGSVGElement {
  const s = svg(w, hgt);
  s.classList.add('w-spark');
  if (values.length < 2) return s;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 2) + 1).toFixed(1)},${(hgt - 2 - ((v - lo) / span) * (hgt - 4)).toFixed(1)}`).join(' ');
  const up = values[values.length - 1]! >= values[0]!;
  s.append(node('polyline', { points: pts, fill: 'none', stroke: up ? 'var(--w-up)' : 'var(--w-down)', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
  return s;
}

/** A price chart with gridlines, an area fill, min / max labels and a dot on the last value. */
export function chart(values: number[], labels: [string, string], w = 640, hgt = 220): SVGSVGElement {
  const s = svg(w, hgt);
  s.classList.add('w-chart');
  s.setAttribute('width', '100%');
  s.setAttribute('preserveAspectRatio', 'none');
  if (values.length < 2) return s;
  const pad = { l: 8, r: 56, t: 12, b: 22 };
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const X = (i: number): number => pad.l + (i / (values.length - 1)) * (w - pad.l - pad.r);
  const Y = (v: number): number => pad.t + (1 - (v - lo) / span) * (hgt - pad.t - pad.b);
  for (let g = 0; g <= 4; g++) {
    const y = pad.t + (g / 4) * (hgt - pad.t - pad.b);
    s.append(node('line', { x1: pad.l, x2: w - pad.r, y1: y, y2: y, stroke: 'var(--w-grid)', 'stroke-width': 1 }));
    const val = hi - (g / 4) * span;
    const t = node('text', { x: w - pad.r + 6, y: y + 4, fill: 'var(--w-muted)', 'font-size': 11 });
    t.textContent = val >= 100 ? val.toFixed(0) : val.toFixed(2);
    s.append(t);
  }
  const up = values[values.length - 1]! >= values[0]!;
  const col = up ? 'var(--w-up)' : 'var(--w-down)';
  const line = values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  s.append(node('polygon', { points: `${X(0)},${hgt - pad.b} ${line} ${X(values.length - 1)},${hgt - pad.b}`, fill: col, opacity: 0.12 }));
  s.append(node('polyline', { points: line, fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  s.append(node('circle', { cx: X(values.length - 1), cy: Y(values[values.length - 1]!), r: 3.5, fill: col }));
  for (const [i, lab] of labels.entries()) {
    const t = node('text', { x: i === 0 ? pad.l : w - pad.r, y: hgt - 6, fill: 'var(--w-muted)', 'font-size': 11, 'text-anchor': i === 0 ? 'start' : 'end' });
    t.textContent = lab;
    s.append(t);
  }
  return s;
}

/** Side view of a car (or bike) in its paint colour, for listings. */
export function carArt(kind: string, color: string, w = 240, hgt = 110): SVGSVGElement {
  const s = svg(w, hgt);
  s.classList.add('w-car');
  const glass = '#1d2a36';
  const ground = node('ellipse', { cx: w / 2, cy: hgt - 14, rx: w * 0.42, ry: 6, fill: 'rgba(0,0,0,0.25)' });
  s.append(ground);
  if (kind === 'bike') {
    for (const x of [62, 178]) { s.append(node('circle', { cx: x, cy: hgt - 30, r: 22, fill: '#16181c' })); s.append(node('circle', { cx: x, cy: hgt - 30, r: 9, fill: '#8a9098' })); }
    s.append(node('path', { d: `M62 ${hgt - 30} L104 ${hgt - 62} L150 ${hgt - 60} L178 ${hgt - 30}`, stroke: '#2a2d33', 'stroke-width': 6, fill: 'none' }));
    s.append(node('path', { d: `M96 ${hgt - 66} Q120 ${hgt - 84} 150 ${hgt - 66} L144 ${hgt - 56} L100 ${hgt - 56} Z`, fill: color }));
    s.append(node('path', { d: `M150 ${hgt - 62} L166 ${hgt - 82}`, stroke: '#2a2d33', 'stroke-width': 4 }));
    return s;
  }
  // body profiles: [roof start, roof end, roof height, body height, length scale]
  const P: Record<string, [number, number, number, number]> = {
    hatch: [0.32, 0.86, 54, 30], sedan: [0.3, 0.7, 50, 28], muscle: [0.36, 0.66, 44, 28], super: [0.38, 0.66, 38, 24],
    suv: [0.24, 0.88, 62, 36], pickup: [0.24, 0.52, 60, 34], van: [0.14, 0.92, 70, 40],
  };
  const [r0, r1, rh, bh] = P[kind] ?? P.sedan!;
  const x0 = 16, x1 = w - 16, base = hgt - 28;
  const L = x1 - x0;
  const body = `M${x0} ${base} L${x0 + 4} ${base - bh + 6} Q${x0 + 10} ${base - bh} ${x0 + L * 0.18} ${base - bh} L${x0 + L * r0} ${base - bh}
    L${x0 + L * (r0 + 0.07)} ${base - rh} L${x0 + L * (r1 - 0.06)} ${base - rh} L${x0 + L * r1} ${base - bh}
    L${x1 - 10} ${base - bh + 2} Q${x1} ${base - bh + 6} ${x1} ${base - 6} L${x1} ${base} Z`;
  s.append(node('path', { d: body, fill: color }));
  s.append(node('path', { d: `M${x0 + L * (r0 + 0.02)} ${base - bh} L${x0 + L * (r0 + 0.08)} ${base - rh + 5} L${x0 + L * (r1 - 0.07)} ${base - rh + 5} L${x0 + L * (r1 - 0.02)} ${base - bh} Z`, fill: glass }));
  s.append(node('path', { d: `M${x0 + 2} ${base - bh * 0.45} L${x1 - 2} ${base - bh * 0.45}`, stroke: 'rgba(255,255,255,0.22)', 'stroke-width': 2 }));
  for (const x of [x0 + L * 0.2, x0 + L * 0.8]) {
    s.append(node('circle', { cx: x, cy: base, r: 15, fill: '#16181c' }));
    s.append(node('circle', { cx: x, cy: base, r: 7, fill: '#9aa0a8' }));
  }
  s.append(node('rect', { x: x1 - 8, y: base - bh + 8, width: 6, height: 5, fill: '#ffe8a0' }));
  s.append(node('rect', { x: x0 + 2, y: base - bh + 9, width: 5, height: 5, fill: '#d83a2a' }));
  return s;
}

/** A painted "photo" of a home for property listings: sky, the building, a bit of garden. */
export function homeArt(kind: string, seed: number, w = 280, hgt = 150): SVGSVGElement {
  const s = svg(w, hgt);
  s.classList.add('w-home');
  s.setAttribute('width', '100%');
  s.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  const r = (k: number): number => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const defs = node('defs', {});
  const grad = node('linearGradient', { id: `sky${seed}`, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(node('stop', { offset: 0, 'stop-color': kind === 'cabin' ? '#7fa6c8' : '#4aa0e0' }), node('stop', { offset: 1, 'stop-color': '#cfe6f6' }));
  defs.append(grad);
  s.append(defs, node('rect', { x: 0, y: 0, width: w, height: hgt, fill: `url(#sky${seed})` }));
  const ground = kind === 'trailer' ? '#d8b98a' : kind === 'cabin' ? '#4a6a3a' : '#6a9a4a';
  s.append(node('rect', { x: 0, y: hgt - 34, width: w, height: 34, fill: ground }));
  const wall = ['#f2ece0', '#e8d8c0', '#d8e0e6', '#f0d8c8', '#c8d8c8'][Math.floor(r(1) * 5)]!;
  if (kind === 'penthouse' || kind === 'apartment') {
    const tw = kind === 'penthouse' ? 90 : 120, th = kind === 'penthouse' ? 140 : 96;
    s.append(node('rect', { x: (w - tw) / 2, y: hgt - 34 - th, width: tw, height: th, fill: kind === 'penthouse' ? '#9ab4c8' : wall }));
    for (let y = hgt - 34 - th + 8; y < hgt - 44; y += 14) for (let x = (w - tw) / 2 + 8; x < (w + tw) / 2 - 10; x += 16) s.append(node('rect', { x, y, width: 10, height: 8, fill: r(x + y) < 0.3 ? '#ffe8a8' : '#2a3a4a' }));
    s.append(node('rect', { x: 30, y: hgt - 34 - 60, width: 40, height: 60, fill: '#b8a898' }), node('rect', { x: w - 70, y: hgt - 34 - 80, width: 44, height: 80, fill: '#a8b0b8' }));
  } else if (kind === 'trailer') {
    s.append(node('rect', { x: 50, y: hgt - 34 - 34, width: 170, height: 34, rx: 6, fill: '#e8e4dc' }));
    s.append(node('rect', { x: 50, y: hgt - 34 - 20, width: 170, height: 4, fill: '#3a6a8a' }));
    s.append(node('rect', { x: 120, y: hgt - 34 - 28, width: 14, height: 26, fill: '#6a5a48' }));
  } else if (kind === 'hangar') {
    s.append(node('path', { d: `M30 ${hgt - 34} L30 ${hgt - 90} Q140 ${hgt - 140} 250 ${hgt - 90} L250 ${hgt - 34} Z`, fill: '#c8ccd0' }));
    s.append(node('rect', { x: 80, y: hgt - 84, width: 120, height: 50, fill: '#5a6068' }));
  } else if (kind === 'dock') {
    s.append(node('rect', { x: 0, y: hgt - 30, width: w, height: 30, fill: '#3a6a8a' }));
    s.append(node('path', { d: `M60 ${hgt - 30} L60 ${hgt - 80} L140 ${hgt - 110} L220 ${hgt - 80} L220 ${hgt - 30} Z`, fill: '#8a7a68' }));
  } else {
    const big = kind === 'mansion';
    const bw = big ? 200 : 130, bh2 = big ? 62 : 52;
    const x = (w - bw) / 2, y = hgt - 34 - bh2;
    s.append(node('rect', { x, y, width: bw, height: bh2, fill: kind === 'cabin' ? '#7a5a3a' : wall }));
    if (big) s.append(node('rect', { x: x + 30, y: y - 34, width: bw - 70, height: 34, fill: '#9ab8c8' }));
    else s.append(node('path', { d: `M${x - 8} ${y} L${x + bw / 2} ${y - 36} L${x + bw + 8} ${y} Z`, fill: ['#8a4b38', '#5a4a45', '#495a5a'][Math.floor(r(2) * 3)]! }));
    for (let k = 0; k < (big ? 6 : 3); k++) s.append(node('rect', { x: x + 14 + k * ((bw - 28) / (big ? 6 : 3)), y: y + 14, width: 16, height: 16, fill: '#2a3a4a' }));
    s.append(node('rect', { x: x + bw / 2 - 8, y: y + bh2 - 26, width: 16, height: 26, fill: '#5a3e28' }));
    if (big) s.append(node('rect', { x: 20, y: hgt - 22, width: 90, height: 12, fill: '#48b8e8' }));
  }
  for (let k = 0; k < 4; k++) s.append(node('circle', { cx: 12 + r(k + 10) * (w - 24), cy: hgt - 34 - 4, r: 9 + r(k + 20) * 8, fill: kind === 'trailer' ? '#8a9a5a' : '#3a6a32' }));
  return s;
}

/** A coloured disc with initials (social posts, logos). */
export function avatar(name: string, color: string): HTMLElement {
  const a = div('w-avatar', name.split(' ').map((p) => p[0]).join('').slice(0, 2));
  a.style.background = color;
  return a;
}

export const pct = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
export const updown = (n: number): string => (n >= 0 ? 'w-up' : 'w-down');
