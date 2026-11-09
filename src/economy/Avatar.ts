import type { Outfit } from './types';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag: string, attrs: Record<string, string | number>): SVGElement => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/** A small front-view figure that shows the outfit in the shops and the wardrobe. */
export function avatar(o: Outfit): SVGElement {
  const svg = el('svg', { viewBox: '0 0 160 220', class: 'avatar', role: 'img', 'aria-label': 'Outfit preview' });
  const glove = o.gloves === 'leather' ? '#2c1d14' : o.gloves === 'tactical' ? '#1f231a' : o.gloves === 'white' ? '#ececec' : o.skin;
  // legs
  svg.append(el('rect', { x: 52, y: 128, width: 24, height: 78, rx: 8, fill: '#23262c' }), el('rect', { x: 84, y: 128, width: 24, height: 78, rx: 8, fill: '#23262c' }));
  svg.append(el('rect', { x: 48, y: 198, width: 30, height: 12, rx: 5, fill: '#101114' }), el('rect', { x: 82, y: 198, width: 30, height: 12, rx: 5, fill: '#101114' }));
  // arms (sleeve then cuff then hand)
  for (const sx of [-1, 1]) {
    const x = 80 + sx * 44;
    svg.append(el('rect', { x: x - 11, y: 70, width: 22, height: 62, rx: 10, fill: o.top }));
    svg.append(el('rect', { x: x - 11, y: 120, width: 22, height: 9, rx: 3, fill: o.gloves === 'none' ? o.cuff : glove }));
    svg.append(el('circle', { cx: x, cy: 138, r: 10, fill: glove }));
  }
  // torso
  svg.append(el('rect', { x: 50, y: 66, width: 60, height: 70, rx: 14, fill: o.top }));
  svg.append(el('path', { d: 'M72 66 L80 84 L88 66', fill: 'none', stroke: 'rgba(0,0,0,0.25)', 'stroke-width': 2 }));
  // neck + head
  svg.append(el('rect', { x: 73, y: 52, width: 14, height: 18, rx: 5, fill: o.skin }));
  svg.append(el('ellipse', { cx: 80, cy: 38, rx: 22, ry: 25, fill: o.skin }));
  // hair
  const hair = o.hair;
  switch (o.hairStyle) {
    case 'short': svg.append(el('path', { d: 'M57 36 C56 14 104 14 103 36 C98 26 62 26 57 36 Z', fill: hair })); break;
    case 'buzz': svg.append(el('path', { d: 'M58 33 C58 18 102 18 102 33 C96 27 64 27 58 33 Z', fill: hair, opacity: 0.8 })); break;
    case 'slick': svg.append(el('path', { d: 'M57 38 C54 10 108 8 104 38 C100 22 70 18 57 38 Z', fill: hair })); break;
    case 'long': svg.append(el('path', { d: 'M55 40 C50 6 110 6 105 40 L108 78 L98 70 L98 34 C88 24 72 24 62 34 L62 70 L52 78 Z', fill: hair })); break;
    default: break;
  }
  // face
  svg.append(el('circle', { cx: 71, cy: 41, r: 2.4, fill: '#1b1b1d' }), el('circle', { cx: 89, cy: 41, r: 2.4, fill: '#1b1b1d' }));
  svg.append(el('path', { d: 'M73 52 Q80 57 87 52', fill: 'none', stroke: '#6a3b2a', 'stroke-width': 2, 'stroke-linecap': 'round' }));
  if (o.glasses) svg.append(el('rect', { x: 62, y: 36, width: 17, height: 10, rx: 4, fill: 'rgba(10,12,14,0.8)' }), el('rect', { x: 81, y: 36, width: 17, height: 10, rx: 4, fill: 'rgba(10,12,14,0.8)' }), el('rect', { x: 78, y: 40, width: 4, height: 2, fill: '#0b0c0e' }));
  return svg;
}
