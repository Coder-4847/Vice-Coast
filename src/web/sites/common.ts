import { h } from '../../ui/dom';
import type { WebCtx } from '../Browser';
import { button, div, type Kid } from '../ui';

/** A site's chrome: logo, navigation, the page, and a footer. */
export function frame(ctx: WebCtx, brand: { name: string; logo?: Kid; tagline?: string }, nav: [string, string][], ...main: Kid[]): HTMLElement {
  const logo = button(brand.logo ?? brand.name, () => ctx.go(ctx.host), 'w-logo');
  // the current page, with its tab (?tab=…) if it has one: the matching nav link lights up
  const here = `${ctx.host}${ctx.path ? '/' + ctx.path : ''}${ctx.query.tab ? `?tab=${ctx.query.tab}` : ''}`;
  const links = div('w-nav', ...nav.map(([label, u]) => { const to = u.includes('.') ? u : `${ctx.host}/${u}`; return button(label, () => ctx.go(to), `w-navlink${to.replace(/\/$/, '').replace('/?', '?') === here ? ' on' : ''}`); }));
  return div('w-site',
    div('w-head', logo, brand.tagline ? h('span', 'w-tagline', brand.tagline) : null, links),
    div('w-main', ...main),
    div('w-foot', h('span', '', `© ${2000 + 25} ${brand.name}. All rights reserved.`), h('span', '', 'Privacy · Terms · Cookies (we have plenty)')),
  );
}

export const section = (title: string, ...kids: Kid[]): HTMLElement => div('w-section', h('h2', '', title), ...kids);
export const card = (...kids: Kid[]): HTMLElement => div('w-card', ...kids);
export const kv = (k: string, v: Kid, cls = ''): HTMLElement => div(`w-kv ${cls}`, h('span', '', k), h('b', '', v));
export const p = (text: string, cls = ''): HTMLElement => h('p', cls, text);

/** Deterministic pseudo-random helpers for generated content. */
export const rnd = (a: number, b = 0): number => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };
export const pick = <T>(arr: readonly T[], a: number, b = 0): T => arr[Math.floor(rnd(a, b) * arr.length) % arr.length]!;

/** Where purchases are delivered: outside the building if you are in one. */
export function deliveryPoint(ctx: WebCtx): { x: number; z: number; yaw: number } {
  const g = ctx.g, pl = g.player!;
  const out = g.interiors?.outside();
  const x = out ? out.x : pl.pos.x, z = out ? out.z : pl.pos.z, yaw = out ? out.yaw : pl.yaw;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const s = ctx.c.points.find(x + fx * 14, z + fz * 14, 3.8, { walkOnly: false, maxR: 80 });
  return { x: s.x, z: s.z, yaw: yaw + Math.PI };
}

/** Fade out, move the player, fade in (charter flights). */
export function travel(ctx: WebCtx, x: number, z: number, hours: number, then: string): void {
  const g = ctx.g, pl = g.player!;
  const el = document.getElementById('ui')!.appendChild(h('div', 'fade-black'));
  requestAnimationFrame(() => el.classList.add('on'));
  setTimeout(() => {
    const s = ctx.c.points.find(x, z, 2.5, { walkOnly: false, maxR: 120 });
    pl.teleport(s.x, s.z, pl.yaw);
    g.world.setHour((g.world.tod.hour + hours) % 24);
    g.world.city.warm(s.x, s.z);
    el.classList.remove('on');
    setTimeout(() => el.remove(), 700);
    g.ui.toast(then);
  }, 700);
}
