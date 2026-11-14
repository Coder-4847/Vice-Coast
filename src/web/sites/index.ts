import { h } from '../../ui/dom';
import type { Site, WebCtx } from '../Browser';
import { button, div } from '../ui';
import { card, frame, p, section } from './common';
import { VEX } from './vex';
import { APEX, KEYSTONE, MORS, ROADKINGS } from './shops';
import { BLUEWATER, SKYLINE, SURPLUS } from './fleet';
import { BRASS, GHOST } from './guns';
import { AERO, BANK, COASTLIST, FRIENDR, GOV, LUCKY, NEWS, PAWS, SKYWATCH, tickerStrip } from './life';

/** Extra words people might search for, per site. */
const KEYWORDS: Record<string, string> = {
  'vex.vc': 'stocks shares market invest trading exchange portfolio',
  'apexautos.vc': 'cars buy car vehicle dealer new sports bike motorcycle',
  'roadkings.vc': 'used cars cheap car second hand',
  'keystone.vc': 'house home property real estate apartment buy business nightclub',
  'coastlinedaily.vc': 'news headlines paper',
  'skywatch.vc': 'weather forecast rain',
  'valeriasavings.vc': 'bank money account transfer deposit',
  'morsmutual.vc': 'insurance claim wrecked car',
  'friendr.vc': 'social friends posts',
  'coastlist.vc': 'classifieds jobs ads sell',
  'luckyseven.vc': 'casino slots gamble hotel',
  'islaaero.vc': 'flights fly plane travel airport island',
  'poundandpaws.vc': 'dog pet adopt rufus',
  'sanverano.gov': 'government dmv police wanted tax',
  'brassandbarrel.vc': 'guns gun weapons ammo ammunition rifle pistol shotgun armour buy delivery',
  'ghostline.onion': 'black market rocket launcher rpg laser explosives sticky illegal dark web onion',
  'skylineaviation.vc': 'plane planes aircraft helicopter heli jet buy private',
  'bluewatermarine.vc': 'boat boats yacht jet ski speedboat buy',
  'halloransurplus.vc': 'military tank jet fighter attack helicopter apc army surplus',
};

function portal(ctx: WebCtx, sites: Site[]): HTMLElement {
  const box = h('input', 'w-search');
  box.placeholder = 'Search the web';
  box.value = ctx.query.q ?? '';
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') return; e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); ctx.go(`wave.vc/search?q=${encodeURIComponent(box.value)}`); } });
  box.addEventListener('keyup', (e) => e.stopPropagation());
  const searchRow = div('w-searchrow', box, button('Search', () => ctx.go(`wave.vc/search?q=${encodeURIComponent(box.value)}`), 'w-btn primary'));
  const others = sites.filter((s) => s.host !== 'wave.vc' && s.category !== 'Hidden');
  if (ctx.path === 'search') {
    const q = (ctx.query.q ?? '').toLowerCase().trim();
    const words = q.split(/\s+/).filter(Boolean);
    // hidden sites are not in the directory, but a search for the right words still turns them up
    const hits = sites.filter((s) => s.host !== 'wave.vc').map((s) => {
      const hay = `${s.name} ${s.tagline} ${s.category} ${s.host} ${KEYWORDS[s.host] ?? ''}`.toLowerCase();
      return { s, score: words.reduce((a, w) => a + (hay.includes(w) ? 1 : 0), 0) };
    }).filter((x) => x.score > (x.s.category === 'Hidden' ? 1 : 0)).sort((a, b) => b.score - a.score);
    return frame(ctx, { name: 'Wave', logo: h('span', 'w-wave', 'wave'), tagline: 'Search' }, [],
      searchRow,
      p(`${hits.length} result${hits.length === 1 ? '' : 's'} for “${ctx.query.q ?? ''}”`, 'muted'),
      ...(hits.length ? hits.map(({ s }) => button(div('w-result', h('span', 'w-result-url', s.host), h('b', '', `${s.name} — ${s.tagline}`), p(KEYWORDS[s.host] ? `Everything about ${KEYWORDS[s.host]!.split(' ').slice(0, 4).join(', ')} and more.` : s.tagline, 'small muted')), () => ctx.go(s.host), 'w-row')) : [p('Nothing found. Try "cars", "stocks", "house" or "flights".')]),
    );
  }
  const cats = [...new Set(others.map((s) => s.category))];
  return div('w-portal',
    div('w-portal-top', h('div', 'w-wave big', 'wave'), p('The front page of San Verano', 'muted'), searchRow),
    tickerStrip(ctx),
    div('w-dir', ...cats.map((c) => card(h('h3', '', c), ...others.filter((s) => s.category === c).map((s) => { const b = button(div('w-dir-item', h('i', 'w-dot'), h('b', '', s.name), h('span', 'muted small', s.tagline)), () => ctx.go(s.host), 'w-row'); (b.querySelector('.w-dot') as HTMLElement).style.background = s.color; return b; })))),
    section('Popular right now', div('w-tiles',
      button(div('w-tile t1', h('b', '', 'Buy a car today'), h('span', '', 'Apex Autos delivers')), () => ctx.go('apexautos.vc'), 'w-tilebtn'),
      button(div('w-tile t2', h('b', '', 'Own a nightclub'), h('span', '', 'Businesses at Keystone')), () => ctx.go('keystone.vc?tab=biz'), 'w-tilebtn'),
      button(div('w-tile t3', h('b', '', 'Markets today'), h('span', '', 'Verano Exchange')), () => ctx.go('vex.vc'), 'w-tilebtn'),
      button(div('w-tile t4', h('b', '', 'Your own jet'), h('span', '', 'Skyline Aviation')), () => ctx.go('skylineaviation.vc'), 'w-tilebtn'),
    )),
  );
}

const WAVE: Site = {
  host: 'wave.vc', name: 'Wave', tagline: 'Search & directory', color: '#2a7aff', category: 'Portal',
  render(ctx, el) { el.append(portal(ctx, SITES)); },
};

export const SITES: Site[] = [WAVE, VEX, APEX, ROADKINGS, BRASS, GHOST, SKYLINE, BLUEWATER, SURPLUS, KEYSTONE, MORS, NEWS, SKYWATCH, BANK, FRIENDR, COASTLIST, LUCKY, AERO, PAWS, GOV];
