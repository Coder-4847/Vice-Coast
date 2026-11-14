import type { Game } from '../Game';
import type { Commerce } from '../economy/Commerce';
import type { Story } from '../story/Story';
import type { Page, PageHost } from '../ui/Modal';
import { h } from '../ui/dom';
import { button, div } from './ui';
import { SITES } from './sites/index';

/** What a site's renderer gets: the game, the current address and a way to move on. */
export interface WebCtx {
  g: Game;
  c: Commerce;
  s: Story | null;
  host: string;
  path: string;
  query: Record<string, string>;
  go(url: string): void;
  refresh(): void;
  toast(text: string): void;
}

export interface Site {
  host: string;
  name: string;
  tagline: string;
  /** Brand colour (accent). */
  color: string;
  dark?: boolean;
  /** In the portal's directory. */
  category: string;
  render(ctx: WebCtx, el: HTMLElement): void;
}

export const HOME = 'wave.vc';
const BOOKMARKS: [string, string][] = [
  ['Wave', 'wave.vc'], ['VEX', 'vex.vc'], ['Apex Autos', 'apexautos.vc'], ['Road Kings', 'roadkings.vc'], ['Skyline', 'skylineaviation.vc'], ['Bluewater', 'bluewatermarine.vc'], ['Keystone Realty', 'keystone.vc'],
  ['Coastline Daily', 'coastlinedaily.vc'], ['Valeria Savings', 'valeriasavings.vc'], ['Friendr', 'friendr.vc'],
];

/** Normalise what was typed: strip the scheme and www, turn plain words into a search. */
export function normalise(input: string): string {
  let u = input.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (!u) return HOME;
  if (!/^[a-z0-9-]+\.[a-z]{2,}/i.test(u)) return `${HOME}/search?q=${encodeURIComponent(u)}`;
  u = u.replace(/\/+$/, '');
  return u.replace(/^[^/?]+/, (m) => m.toLowerCase());
}

function parse(url: string): { host: string; path: string; query: Record<string, string> } {
  const [base, qs = ''] = url.split('?');
  const slash = base!.indexOf('/');
  const host = slash < 0 ? base! : base!.slice(0, slash);
  const path = slash < 0 ? '' : base!.slice(slash + 1);
  const query: Record<string, string> = {};
  for (const kv of qs.split('&')) { if (!kv) continue; const [k, v = ''] = kv.split('='); query[decodeURIComponent(k!)] = decodeURIComponent(v.replace(/\+/g, ' ')); }
  return { host, path, query };
}

/**
 * The in-game web browser: a page in the shared modal with a toolbar (back, forward, reload, home), an address bar you
 * can type into, a bookmarks bar, and the sites themselves. Opened from the phone's Web app and from computers in homes
 * and offices.
 */
export function browserPage(c: Commerce, start = HOME): Page {
  const history: string[] = [normalise(start)];
  let at = 0;
  let keepScroll = 0;
  let viewport: HTMLElement | null = null;
  const g = c.game;
  return {
    title: 'Browser',
    layout: 'web',
    hints: 'Esc / B  close · type an address and press Enter',
    render(host: PageHost) {
      const url = history[at]!;
      const { host: hostName, path, query } = parse(url);
      const site = SITES.find((s) => s.host === hostName);
      const go = (next: string): void => {
        const n = normalise(next);
        history.splice(at + 1);
        history.push(n);
        at = history.length - 1;
        keepScroll = 0;
        g.audio.uiBlip('move');
        host.refresh();
      };
      // ---- chrome
      const addr = h('input', 'w-addr');
      addr.value = url;
      addr.spellcheck = false;
      addr.setAttribute('aria-label', 'Address');
      addr.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') return;
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); go(addr.value); }
      });
      addr.addEventListener('keyup', (e) => e.stopPropagation());
      addr.addEventListener('focus', () => addr.select());
      const tb = div('w-toolbar',
        button('‹', () => { if (at > 0) { at--; keepScroll = 0; host.refresh(); } }, 'w-tool', at === 0),
        button('›', () => { if (at < history.length - 1) { at++; keepScroll = 0; host.refresh(); } }, 'w-tool', at >= history.length - 1),
        button('⟳', () => { keepScroll = viewport?.scrollTop ?? 0; host.refresh(); }, 'w-tool'),
        button('⌂', () => go(HOME), 'w-tool'),
        div('w-addr-wrap', h('span', 'w-lock', '🔒'), addr),
        button('Go', () => go(addr.value), 'w-tool w-go'),
      );
      const bm = div('w-bookmarks', ...BOOKMARKS.map(([label, u]) => button(label, () => go(u), `w-bm${u === hostName ? ' on' : ''}`)));
      // ---- the page
      const view = div(`w-view ${site?.dark ? 'w-dark' : 'w-light'}`);
      view.style.setProperty('--w-accent', site?.color ?? '#4a7cff');
      const ctx: WebCtx = {
        g, c, s: g.story, host: hostName, path, query,
        go,
        refresh: () => { keepScroll = viewport?.scrollTop ?? 0; host.refresh(); },
        toast: (t) => host.toast(t),
      };
      if (site) {
        try { site.render(ctx, view); } catch (err) { view.append(div('w-error', h('h1', '', 'Something went wrong'), h('p', '', String(err)))); }
      } else {
        view.append(div('w-404',
          h('h1', '', 'This site can’t be reached'),
          h('p', '', `${hostName} could not be found. Check the address, or search for it on Wave.`),
          button(`Search Wave for “${hostName}”`, () => go(`${HOME}/search?q=${encodeURIComponent(hostName)}`), 'w-btn primary'),
        ));
      }
      host.body.classList.add('w-body');
      host.body.append(tb, bm, view);
      viewport = view;
      view.scrollTop = keepScroll;
      // the panel title shows the page
      const titleEl = host.body.closest('.m-panel')?.querySelector('h2');
      if (titleEl) titleEl.textContent = site ? `${site.name} — ${url}` : url;
    },
  };
}
