import { h } from '../../ui/dom';
import { money } from '../../economy/Economy';
import { BUSINESSES, PROPERTY_BY_ID } from '../../economy/catalog';
import { TICKERS } from '../../economy/market';
import { VEHICLES } from '../../vehicles/specs';
import type { Site, WebCtx } from '../Browser';
import { avatar, button, div, pct, sparkline, updown } from '../ui';
import { card, frame, kv, p, pick, rnd, section, travel } from './common';

// ================================================================================================ Coastline Daily (news)

interface Story { head: string; body: string[]; tag: string }

function playerStories(ctx: WebCtx): Story[] {
  const out: Story[] = [];
  const s = ctx.s, e = ctx.c.eco;
  if (s) {
    const rob = s.st.rob;
    if (rob.count > 0) out.push({ tag: 'Crime', head: rob.count > 5 ? `Crime wave: ${rob.count} hold-ups and counting` : 'Armed robbery leaves store staff shaken', body: [`Police say a lone gunman is behind a string of robberies across San Verano, with an estimated ${money(rob.take)} taken so far.`, 'Store owners are calling for more patrols. The police are calling for patience. The gunman, as far as anyone knows, is calling nobody.'] });
    const theft = ctx.g.theft?.stats;
    if (theft && theft.stolen + theft.jacked > 2) out.push({ tag: 'Crime', head: 'Car thefts soar; drivers urged to lock up', body: [`${theft.stolen + theft.jacked} vehicles were reported stolen this month, many in broad daylight.`, 'Redline Customs declined to comment on its record quarter.'] });
    const missions = Object.keys(s.st.missions).length;
    if (missions > 8) out.push({ tag: 'City', head: 'Who is behind the chaos in Valeria?', body: ['Shootouts, car chases and a downtown heist the papers are still arguing about. Somebody in this city is very busy.', 'Our reporters have a theory. Our lawyers have asked us not to print it.'] });
    if (ctx.g.interiors && ctx.g.interiors.stats.burglaries > 0) out.push({ tag: 'Crime', head: 'Burglaries on the rise in quiet neighbourhoods', body: ['Residents report televisions, jewellery and laptops missing. One homeowner says she woke up to a stranger in her living room.', 'Police advise locking doors. Burglars advise otherwise.'] });
  }
  if (e.p.biz.length) out.push({ tag: 'Business', head: `Mystery buyer snaps up ${BUSINESSES.find((b) => b.id === e.p.biz[e.p.biz.length - 1])?.name ?? 'local business'}`, body: ['The sale went through in cash, according to sources. The new owner has not been seen, but the takings are up.'] });
  return out;
}

const LOCAL = [
  ['City', 'Seaside Pier reopens after seagull "incident"', 'Officials insist the birds have been spoken to.'],
  ['City', 'Mayor promises to fix Ocean Boulevard potholes "this decade"', 'A spokesperson clarified that "this decade" was a figure of speech.'],
  ['Weather', 'Heat advisory: drink water, avoid exertion, avoid Southside', 'Temperatures will stay in the high eighties all week.'],
  ['Culture', 'Valeria Arena announces a sold-out season', 'Tickets for the Coast Kings opener sold in four minutes.'],
  ['City', 'Traffic lights on Meridian Avenue "probably fixed"', 'Drivers report the lights now change colour, mostly in the right order.'],
  ['Crime', 'Police chase ends in fountain at Galleria Costa', 'No fish were harmed. Several shoppers were very wet.'],
  ['Tech', 'Local start-up promises an app that "disrupts disruption"', 'Investors are thrilled. Nobody can explain what it does.'],
  ['Travel', 'Isla Aerolíneas adds a second daily flight to Isla Rojo', 'Charter seats can now be booked online.'],
  ['City', 'Pinecrest lighthouse keeper celebrates 40 years on the job', 'He says the secret is "not talking to anyone".'],
  ['Culture', 'Costa Merida canal festival draws record crowds', 'Gondoliers report three proposals and one capsized wedding.'],
] as const;

const SPORTS = ['Coast Kings', 'Valeria Marlins', 'Harbor Hammers', 'Cinder Scorpions', 'Pinecrest Loggers', 'Costa Dorados'];

function news(ctx: WebCtx): HTMLElement[] {
  const day = ctx.c.eco.p.day;
  const stories: Story[] = [...playerStories(ctx)];
  for (let k = 0; k < 4; k++) { const l = pick(LOCAL, day, k * 7); stories.push({ tag: l[0], head: l[1], body: [l[2]] }); }
  if (ctx.s) for (const n of ctx.s.market.news(2).slice(0, 3)) stories.push({ tag: 'Business', head: n.text, body: [`Shares in ${TICKERS.find((t) => t.id === n.id)?.name} moved on the news. Full coverage on the Verano Exchange.`] });
  const lead = stories[0]!;
  const games = [0, 1, 2].map((k) => { const a = pick(SPORTS, day, k * 3), b = pick(SPORTS, day, k * 3 + 1); return a === b ? null : `${a} ${Math.floor(rnd(day, k) * 6)} – ${Math.floor(rnd(day, k + 9) * 6)} ${b}`; }).filter(Boolean) as string[];
  return [
    div('w-paper-date', `${ctx.g.world.tod.clock} · Day ${day} · San Verano's paper of record since 1931`),
    div('w-lead', h('span', 'w-tag', lead.tag), h('h1', '', lead.head), ...lead.body.map((b) => p(b))),
    div('w-grid2 paper',
      div('', ...stories.slice(1).map((st) => div('w-article', h('span', 'w-tag', st.tag), h('h3', '', st.head), ...st.body.map((b) => p(b, 'small'))))),
      div('',
        card(h('h3', '', 'Weather'), p(weatherLine(ctx)), button('Full forecast ›', () => ctx.go('skywatch.vc'), 'w-link')),
        card(h('h3', '', 'Sports'), ...games.map((g) => p(g, 'small'))),
        ctx.s ? card(h('h3', '', 'Markets'), kv('VEX 14', `${ctx.s.market.index().toFixed(1)}`), h('span', updown(ctx.s.market.indexChange()), pct(ctx.s.market.indexChange())), button('Verano Exchange ›', () => ctx.go('vex.vc'), 'w-link')) : null,
        card(h('h3', '', 'Opinion'), p(pick(['"Why I moved to Cinder Flats and never looked back (or at anything)."', '"Our police helicopters are too loud. Also, why are there so many?"', '"In defence of the Ocean Boulevard pothole: a love letter."', '"The stock market is a casino. So is the casino."'], day), 'small')),
      ),
    ),
  ];
}

export const NEWS: Site = {
  host: 'coastlinedaily.vc', name: 'Coastline Daily', tagline: 'News', color: '#c43c3c', category: 'News',
  render(ctx, el) { el.append(frame(ctx, { name: 'Coastline Daily', logo: h('span', 'w-serif', 'The Coastline Daily'), tagline: 'All the news that fits' }, [['Front page', 'coastlinedaily.vc'], ['Markets', 'vex.vc'], ['Weather', 'skywatch.vc']], ...news(ctx))); },
};

// ================================================================================================ Skywatch (weather)

const WX = ['clear', 'cloudy', 'overcast', 'rain', 'storm', 'fog'] as const;
const WX_ICON: Record<string, string> = { clear: '☀', cloudy: '⛅', overcast: '☁', rain: '🌧', storm: '⛈', fog: '🌫', snow: '❄', dust: '🌪' };

function weatherLine(ctx: WebCtx): string {
  const t = ctx.g.world.weather.type;
  return `${WX_ICON[t] ?? '☀'} ${t[0]!.toUpperCase()}${t.slice(1)}, ${Math.round(24 + rnd(ctx.c.eco.p.day, 1) * 9)}°C in Port Valeria.`;
}

export const SKYWATCH: Site = {
  host: 'skywatch.vc', name: 'Skywatch', tagline: 'Weather', color: '#3aa0e8', category: 'News',
  render(ctx, el) {
    const day = ctx.c.eco.p.day;
    const now = ctx.g.world.weather.type;
    const days = [0, 1, 2, 3, 4].map((k) => { const w = k === 0 ? now : pick(WX, day + k, 3); const hi = Math.round(24 + rnd(day + k, 1) * 9); return { k, w, hi, lo: hi - 6 - Math.round(rnd(day + k, 2) * 4) }; });
    el.append(frame(ctx, { name: 'Skywatch', logo: h('span', '', '◐ ', h('b', '', 'SKYWATCH')), tagline: 'San Verano weather' }, [['Forecast', 'skywatch.vc']],
      div('w-hero sky', div('', h('div', 'w-kicker', `Port Valeria · ${ctx.g.world.tod.clock}`), h('div', 'w-big', `${WX_ICON[now] ?? '☀'} ${days[0]!.hi}°C`), p(`${now[0]!.toUpperCase()}${now.slice(1)}. Wind light. ${now === 'storm' ? 'Lightning likely: stay off the pier.' : now === 'rain' ? 'Roads slippery: brake early.' : 'Good day to go for a drive.'}`))),
      div('w-grid5', ...days.map((d) => card(h('b', '', d.k === 0 ? 'Today' : `Day ${day + d.k}`), div('w-wxicon', WX_ICON[d.w] ?? '☀'), p(d.w), p(`${d.hi}° / ${d.lo}°`, 'muted')))),
      section('Regional', kv('Mount Kestrel', 'Snow above 500 m'), kv('Cinder Flats', 'Dust in the afternoons'), kv('Isla Rojo', 'Sunny, 31°C'), kv('Pinecrest Bay', 'Sea mist in the mornings')),
    ));
  },
};

// ================================================================================================ Valeria Savings (bank)

export const BANK: Site = {
  host: 'valeriasavings.vc', name: 'Valeria Savings', tagline: 'Online banking', color: '#1f6fd6', category: 'Money',
  render(ctx, el) {
    const e = ctx.c.eco;
    const move = (n: number, toBank: boolean): HTMLElement => button(`${toBank ? 'Deposit' : 'Withdraw'} ${n === Infinity ? 'all' : money(n)}`, () => { if (toBank) e.deposit(n === Infinity ? e.cash : n); else e.withdraw(n === Infinity ? e.bank : n); ctx.g.audio.uiBlip('ok'); ctx.refresh(); }, 'w-btn', toBank ? e.cash <= 0 : e.bank <= 0);
    const upkeep = e.p.props.reduce((a, o) => a + (o.free ? 0 : PROPERTY_BY_ID[o.id]?.upkeep ?? 0), 0);
    const income = e.p.biz.reduce((a, id) => a + (BUSINESSES.find((b) => b.id === id)?.income ?? 0), 0);
    el.append(frame(ctx, { name: 'Valeria Savings', logo: h('span', '', h('b', '', 'VALERIA'), ' SAVINGS'), tagline: 'Banking since 1902' }, [['Accounts', 'valeriasavings.vc'], ['Invest', 'vex.vc']],
      div('w-grid3',
        card(h('div', 'w-kicker', 'Current account'), h('div', 'w-big', money(e.bank)), p('Safe from muggers and the police.', 'muted small')),
        card(h('div', 'w-kicker', 'Cash on you'), h('div', 'w-big', money(e.cash)), p('You lose some when Wasted or Busted.', 'muted small')),
        card(h('div', 'w-kicker', 'Daily'), kv('Property upkeep', `−${money(upkeep)}`), kv('Business takings', `+${money(income)}`), ctx.s ? kv('Shares', money(ctx.s.market.portfolioValue())) : null),
      ),
      section('Transfer', div('w-actions', move(1000, true), move(10000, true), move(Infinity, true)), div('w-actions', move(1000, false), move(10000, false), move(Infinity, false))),
      section('Recent transactions', ...(e.log.length ? e.log.slice(0, 25).map((t) => div('w-tr w-tx', h('span', 'muted', `Day ${t.day}`), h('span', '', t.reason), h('span', `r ${t.delta >= 0 ? 'w-up' : 'w-down'}`, `${t.delta >= 0 ? '+' : '−'}${money(Math.abs(t.delta))}`))) : [p('Nothing since you logged in.', 'muted')])),
    ));
  },
};

// ================================================================================================ Friendr (social)

const PEOPLE: [string, string, string][] = [
  ['Tiffani Ross', '@tiff_vc', '#ff6a9a'], ['Dale Kowalski', '@dalek_real', '#4a9aff'], ['Rosa M.', '@rosa.merida', '#ffb02e'], ['Coach Brandon', '@grindset', '#3ac48a'],
  ['Pastor Gene', '@gene_blesses', '#9a7aff'], ['Kyle', '@kyle_xtreme', '#ff7a3a'], ['Maria Delgado', '@mariasbakery', '#d8a03a'], ['Valeria PD', '@ValeriaPD', '#1f4f9a'],
  ['Brenda (Pinecrest)', '@brenda_bakes', '#c8784a'], ['Jaxon', '@jxn.music', '#7ad7e0'], ['Lucky Seven', '@LuckySevenResorts', '#e6b84a'], ['Isla Aerolíneas', '@IslaAero', '#2ab0c8'],
];
const POSTS = [
  'Just saw a guy steal a taxi WITH the driver still in it. Only in Valeria 🙃',
  'New sourdough recipe drops tomorrow. Come by the bakery! 🥖',
  'If you are not up at 4 AM doing cold plunges you are already losing. #grindset',
  'Reminder: lock your car. Lock your house. Lock your heart. 🔒',
  'Anyone else hear the helicopter at 3 AM?? Every night???',
  'My cousin says the stock market is rigged. My cousin also says birds are drones.',
  'Coast Kings tonight!!! Let\'s GOOO 🏈',
  'Back-flipped a dirt bike off the pier. Bike is fine. I am in the hospital. Worth it.',
  'PSA: Ocean Boulevard is closed again because someone drove a tank down it.',
  'Tried the Cluckin\' Kings spicy bucket. I can see through time now.',
  'Sunset from Crestview tonight was unreal 🌅',
  'Dropped my phone in the canal in Costa Merida. Posting this from my cousin\'s.',
  'Someone left a whole duffel bag of cash at the bus stop?? It was gone before I could look.',
  'Our new album is out! Link in bio (there is no bio).',
  'Big Sunday service! Everyone welcome, especially those with a lot to confess.',
  'Fly to Isla Rojo for less than a tank of gas. Book on islaaero.vc ✈️',
  'Jackpot of the week: $48,000 on Lucky Sevens! Could you be next? 🎰',
  'Today\'s mood: a stolen sports car doing 200 past a cop who is eating a donut.',
];

export const FRIENDR: Site = {
  host: 'friendr.vc', name: 'Friendr', tagline: 'Social', color: '#3b82f6', category: 'Social',
  render(ctx, el) {
    const day = ctx.c.eco.p.day, hour = Math.floor(ctx.g.world.tod.hour);
    const feed: HTMLElement[] = [];
    const s = ctx.s;
    if (s && s.st.rob.count > 0) feed.push(post(PEOPLE[7]!, 'Officers are investigating a series of armed robberies. If you have information call 911. Do NOT try to be a hero.', 'just now', 214));
    if (ctx.g.wanted && ctx.g.wanted.stars >= 3) feed.push(post(PEOPLE[5]!, 'THERE IS A CHASE GOING ON RIGHT NOW AND I CAN SEE IT FROM MY WINDOW', 'just now', 1203));
    for (let k = 0; k < 12; k++) {
      const who = pick(PEOPLE, day * 24 + hour, k * 3);
      feed.push(post(who, pick(POSTS, day * 24 + hour, k * 7 + 1), `${1 + Math.floor(rnd(day, k) * 59)}m`, Math.floor(rnd(hour, k) * 400)));
    }
    el.append(frame(ctx, { name: 'Friendr', logo: h('span', '', h('b', '', 'friendr')), tagline: 'What are your friends doing?' }, [['Feed', 'friendr.vc'], ['Classifieds', 'coastlist.vc']],
      div('w-feed', div('w-compose', avatar('You', '#888'), h('span', 'muted', 'What\'s on your mind? (You have nothing to post that would not incriminate you.)')), ...feed),
    ));
  },
};

function post(who: [string, string, string], text: string, ago: string, likes: number): HTMLElement {
  return div('w-post', avatar(who[0], who[2]), div('', div('w-post-head', h('b', '', who[0]), h('span', 'muted', `${who[1]} · ${ago}`)), p(text), h('span', 'muted small', `♥ ${likes}  ·  ↻ ${Math.floor(likes / 7)}  ·  Reply`)));
}

// ================================================================================================ CoastList (classifieds)

const ADS: [string, string, string][] = [
  ['For sale', 'Slightly used jet ski', 'Runs on land too (does not). $1,200 or best offer.'],
  ['For sale', 'Tiger-print sofa', 'Comes with the tiger smell. Pick up only, Southside.'],
  ['For sale', 'Wedding dress, never worn', 'Long story. Very long. $300.'],
  ['Jobs', 'Drivers wanted', 'Must have own car, clean licence, and no questions. Cash daily. Ask for Teddy.'],
  ['Jobs', 'Security guard, nights', 'Galleria Costa. Must stay awake. Must not "borrow" from the jewellery store.'],
  ['Jobs', 'Taxi drivers', 'Marlow Cab Co. is hiring. Hop in any yellow sedan and start earning.'],
  ['Housing', 'Room for rent, Midtown', 'Share with two musicians and a ferret. $400/month.'],
  ['Housing', 'Luxury homes', 'See every listing in the state at keystone.vc.'],
  ['Services', 'Lessons: flying, beginner', 'Valeria International flight school. Crash less, pay more.'],
  ['Services', 'Car paint, no questions', 'Redline Customs. Drive in. You know the rest.'],
  ['Missed connections', 'You: red sports car, 190 km/h. Me: the cop you passed', 'Pull over next time. We should talk.'],
  ['Missed connections', 'Bowling alley, Tuesday', 'You bowled a strike, I spilled a soda on you. Coffee?'],
  ['Pets', 'Rufus needs a home', 'Big golden boy at Pound & Paws. Adopt online.'],
  ['For sale', 'Metal detector', 'Found three bottle caps and a suspicious amount of shell casings. $80.'],
];

export const COASTLIST: Site = {
  host: 'coastlist.vc', name: 'CoastList', tagline: 'Classifieds', color: '#7a3ad8', category: 'Social',
  render(ctx, el) {
    const cat = ctx.query.cat ?? '';
    const cats = [...new Set(ADS.map((a) => a[0]))];
    const links: Record<string, string> = { 'Luxury homes': 'keystone.vc', 'Rufus needs a home': 'poundandpaws.vc', 'Lessons: flying, beginner': 'islaaero.vc' };
    el.append(frame(ctx, { name: 'CoastList', logo: h('span', '', h('b', '', 'coastlist')), tagline: 'Buy, sell, regret' }, [['All', 'coastlist.vc'], ['Used cars', 'roadkings.vc']],
      div('w-tabs', button('All', () => ctx.go('coastlist.vc'), `w-tab${!cat ? ' on' : ''}`), ...cats.map((k) => button(k, () => ctx.go(`coastlist.vc?cat=${encodeURIComponent(k)}`), `w-tab${cat === k ? ' on' : ''}`))),
      div('w-list', ...ADS.filter((a) => !cat || a[0] === cat).map((a) => {
        const go = links[a[1]];
        return div('w-ad', h('span', 'w-tag', a[0]), h('b', '', a[1]), p(a[2], 'small'), go ? button('Open ›', () => ctx.go(go), 'w-link') : null);
      })),
    ));
  },
};

// ================================================================================================ Lucky Seven (casino) — a tiny online slot

let lastSpin: { reels: string[]; win: number } | null = null;
const REEL = ['🍒', '🍋', '🔔', '⭐', '7', '💎'];

export const LUCKY: Site = {
  host: 'luckyseven.vc', name: 'Lucky Seven Resorts', tagline: 'Casino & hotel', color: '#e6b84a', dark: true, category: 'Leisure',
  render(ctx, el) {
    const e = ctx.c.eco;
    const spin = (bet: number): void => {
      if (!e.spend(bet, 'Online slots')) { ctx.toast('Not enough cash'); return; }
      const reels = [0, 1, 2].map(() => REEL[Math.floor(Math.random() * REEL.length)]!);
      const same = reels[0] === reels[1] && reels[1] === reels[2];
      const pair = reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2];
      // fair reels: three of a kind 2.8%, a pair (stake back) 42%; the house keeps about 9%
      const mult = same ? (reels[0] === '💎' ? 50 : reels[0] === '7' ? 25 : 8) : pair ? 1 : 0;
      const win = Math.round(bet * mult);
      if (win) e.earn(win, 'Online slots');
      lastSpin = { reels, win };
      ctx.g.audio.uiBlip(win ? 'ok' : 'move');
      ctx.refresh();
    };
    el.append(frame(ctx, { name: 'Lucky Seven Resorts', logo: h('span', '', '7 ', h('b', '', 'LUCKY SEVEN')), tagline: 'Costa Merida' }, [['Play online', 'luckyseven.vc'], ['Shares: LUCK', 'vex.vc/q/LUCK']],
      div('w-hero lucky', div('', h('div', 'w-kicker', 'Online slots'), div('w-reels', ...(lastSpin?.reels ?? ['7', '7', '7']).map((r) => div('w-reel', r))), p(lastSpin ? (lastSpin.win ? `You win ${money(lastSpin.win)}!` : 'No luck. Again?') : 'Three of a kind pays up to 50×. A pair gets your stake back.'))),
      div('w-actions', button('Spin $10', () => spin(10), 'w-btn primary', e.cash < 10), button('Spin $100', () => spin(100), 'w-btn primary', e.cash < 100), button('Spin $1,000', () => spin(1000), 'w-btn primary', e.cash < 1000)),
      p('Play with cash only. The real tables are at the resort in Costa Merida. Gamble responsibly; or at least entertainingly.', 'muted small'),
    ));
  },
};

// ================================================================================================ Isla Aerolíneas (charter flights)

const ROUTES: { name: string; x: number; z: number; fare: number; hours: number }[] = [
  { name: 'Valeria International', x: 1160, z: 870, fare: 180, hours: 1 },
  { name: 'Isla Rojo airstrip', x: -760, z: 1180, fare: 450, hours: 1 },
  { name: 'Cinder Flats', x: 3330, z: 560, fare: 320, hours: 1 },
  { name: 'Pinecrest Bay', x: 700, z: -2260, fare: 280, hours: 1 },
  { name: 'Costa Merida', x: 520, z: 3300, fare: 260, hours: 1 },
];

export const AERO: Site = {
  host: 'islaaero.vc', name: 'Isla Aerolíneas', tagline: 'Charter flights', color: '#2ab0c8', category: 'Travel',
  render(ctx, el) {
    const g = ctx.g;
    const blocked = (g.wanted?.stars ?? 0) > 0 ? 'We do not fly passengers the police are looking for.' : g.story?.mission ? 'Finish what you are doing first.' : g.interiors?.inside ? 'Head outside first: the shuttle picks up from the street.' : g.driving?.mode !== 'foot' ? 'Leave your vehicle first.' : '';
    el.append(frame(ctx, { name: 'Isla Aerolíneas', logo: h('span', '', '✈ ', h('b', '', 'ISLA'), ' AEROLÍNEAS'), tagline: 'Island hops & charters' }, [['Book', 'islaaero.vc'], ['Shares: AERO', 'vex.vc/q/AERO']],
      div('w-hero aero', div('', h('div', 'w-kicker', 'Charter flights'), h('h1', '', 'Anywhere in San Verano in an hour.'), p('A shuttle picks you up, we fly you over, a cab drops you at the gate.'))),
      blocked ? p(blocked, 'w-warn') : null,
      div('w-list', ...ROUTES.map((r) => div('w-listing', div('w-bizicon', '✈'), div('w-listing-info', h('b', '', r.name), h('span', 'muted', `About ${r.hours} hour`)), div('w-listing-buy', h('div', 'w-price', money(r.fare)), button('Book & fly', () => {
        if (blocked) { ctx.toast(blocked); return; }
        if (!ctx.c.eco.charge(r.fare, `Flight to ${r.name}`)) { ctx.toast('Not enough money'); return; }
        g.commerce?.closeAll();
        travel(ctx, r.x, r.z, r.hours, `Welcome to ${r.name}`);
      }, 'w-btn primary', !!blocked || ctx.c.eco.worth < r.fare))))),
    ));
  },
};

// ================================================================================================ Pound & Paws

export const PAWS: Site = {
  host: 'poundandpaws.vc', name: 'Pound & Paws', tagline: 'Animal shelter', color: '#e8883a', category: 'Social',
  render(ctx, el) {
    const has = !!ctx.s?.st.flags.dog;
    el.append(frame(ctx, { name: 'Pound & Paws', logo: h('span', '', '🐾 ', h('b', '', 'Pound & Paws')), tagline: 'Every dog deserves a home' }, [['Adopt', 'poundandpaws.vc']],
      div('w-product', div('w-product-art w-dog', '🐕'), div('w-product-info', h('h1', '', 'Rufus'), p('Big, golden, three years old. Loves car rides, chasing pigeons and biting people who point guns at his owner.'), kv('Adoption fee', '$500'), kv('Good with', 'People, cars, explosions'),
        has ? p('Rufus has already found his home. With you. He says hi.', 'muted') : button('Adopt Rufus · $500', () => { ctx.g.animals?.adopt(); ctx.refresh(); }, 'w-btn primary big', ctx.c.eco.worth < 500))),
    ));
  },
};

// ================================================================================================ State of San Verano

export const GOV: Site = {
  host: 'sanverano.gov', name: 'State of San Verano', tagline: 'Government', color: '#2a4a7a', category: 'Government',
  render(ctx, el) {
    const e = ctx.c.eco, s = ctx.s;
    const crimes = (s?.st.rob.count ?? 0) + (ctx.g.theft ? ctx.g.theft.stats.stolen + ctx.g.theft.stats.jacked : 0) + (ctx.g.interiors?.stats.burglaries ?? 0);
    el.append(frame(ctx, { name: 'State of San Verano', logo: h('span', '', '★ ', h('b', '', 'SAN VERANO'), '.gov'), tagline: 'Official portal' }, [['Services', 'sanverano.gov'], ['Police', 'sanverano.gov/police']],
      ...(ctx.path === 'police' ? [
        section('Valeria PD · Most wanted',
          card(h('h3', '', 'Unknown suspect'), p('Wanted in connection with armed robberies, vehicle thefts, burglaries and "general mayhem".'), kv('Reported crimes', String(crimes)), kv('Stolen property', money(s?.st.rob.take ?? 0)), kv('Current wanted level', `${ctx.g.wanted?.stars ?? 0} star${(ctx.g.wanted?.stars ?? 0) === 1 ? '' : 's'}`), p('Do not approach. Seriously.', 'muted small')),
        ),
      ] : [
        div('w-grid3',
          card(h('h3', '', 'DMV'), p('Vehicles registered to you:'), ...(e.p.vehicles.length ? e.p.vehicles.map((v) => kv(VEHICLES[v.spec]!.name, v.custom.plate)) : [p('None.', 'muted')])),
          card(h('h3', '', 'Property register'), ...(e.p.props.length ? e.p.props.map((o) => kv(PROPERTY_BY_ID[o.id]!.name, o.free ? 'Family home' : `since day ${o.boughtDay}`)) : [p('No properties on record.', 'muted')]), ...e.p.biz.map((id) => kv(BUSINESSES.find((b) => b.id === id)!.name, 'Business'))),
          card(h('h3', '', 'Tax'), p('Your declared income this year: $0.'), p('Our records suggest otherwise. Expect a letter.', 'muted small')),
        ),
        section('Visiting San Verano', p('From the beaches of Port Valeria to the snow on Mount Kestrel, the canals of Costa Merida and the desert of Cinder Flats, San Verano has it all. Including a crime rate we prefer not to discuss.')),
      ]),
    ));
  },
};

/** The ticker strip used by the portal. */
export function tickerStrip(ctx: WebCtx): HTMLElement | null {
  const m = ctx.s?.market;
  if (!m) return null;
  return button(div('w-strip', h('b', '', `VEX 14 ${m.index().toFixed(1)}`), h('span', updown(m.indexChange()), pct(m.indexChange())),
    ...TICKERS.slice(0, 6).map((t) => h('span', '', `${t.id} `, h('span', updown(m.change(t.id)), pct(m.change(t.id))))),
    sparkline(m.history('MRDN', 20), 80, 20)), () => ctx.go('vex.vc'), 'w-row');
}
