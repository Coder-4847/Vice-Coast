import type { Story } from '../story/Story';
import { money } from '../economy/Economy';
import { h } from '../ui/dom';
import { btn, row, section, type Page, type PageHost } from '../ui/Modal';

const BETS = [50, 100, 250, 500, 1000];

const chips = (host: PageHost, cur: number, set: (n: number) => void, cash: number): HTMLElement => {
  const wrap = h('div', 'cg-chips');
  wrap.dataset.navRow = '';
  for (const b of BETS) {
    const c = h('button', `cg-chip${b === cur ? ' on' : ''}${b > cash ? ' off' : ''}`, `$${b}`);
    c.type = 'button';
    c.addEventListener('click', () => { if (b <= cash) { set(b); host.refresh(); } });
    wrap.append(c);
  }
  return wrap;
};

const rnd = (n: number): number => Math.floor(Math.random() * n);

// ------------------------------------------------------------------------------------------------ the lobby

export function casinoPage(story: Story): Page {
  return {
    title: 'Lucky Seven Casino',
    kicker: 'Gaming floor',
    hints: 'Esc / B  leave',
    render: (host) => {
      const st = story.st.acts;
      const n = (id: string): string => `${st[id]?.wins ?? 0} won`;
      host.body.append(
        h('p', 'm-info', 'The house always wins a little more than you do. Bet cash only.'),
        row({ label: 'Blackjack', sub: 'Beat the dealer to 21. Blackjack pays 3 to 2.', right: n('casino.blackjack'), onClick: () => host.push(blackjackPage(story)) }),
        row({ label: 'Roulette', sub: 'Single zero. Colours, numbers, dozens.', right: n('casino.roulette'), onClick: () => host.push(roulettePage(story)) }),
        row({ label: 'Slots', sub: 'Three reels. Sevens pay fifty.', right: n('casino.slots'), onClick: () => host.push(slotsPage(story)) }),
        btn('Leave', '', () => host.close()),
      );
    },
  };
}

// ------------------------------------------------------------------------------------------------ blackjack

type Card = { r: string; s: string; v: number };
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const draw = (): Card => { const i = rnd(13); return { r: RANKS[i]!, s: SUITS[rnd(4)]!, v: i === 0 ? 11 : Math.min(10, i + 1) }; };
export function handValue(cards: Card[]): number {
  let t = cards.reduce((n, c) => n + c.v, 0), aces = cards.filter((c) => c.r === 'A').length;
  while (t > 21 && aces > 0) { t -= 10; aces--; }
  return t;
}
const cardEl = (c: Card | null): HTMLElement => {
  if (!c) return h('span', 'cg-card back', '');
  return h('span', `cg-card${c.s === '♥' || c.s === '♦' ? ' red' : ''}`, `${c.r}${c.s}`);
};

function blackjackPage(story: Story): Page {
  const eco = story.g.commerce!.eco;
  let bet = 100;
  let phase: 'bet' | 'play' | 'done' = 'bet';
  let player: Card[] = [], dealer: Card[] = [];
  let stake = 0;
  let msg = '';
  const settle = (mult: number, text: string, win: boolean): void => {
    phase = 'done';
    if (mult > 0) eco.earn(Math.round(stake * mult), 'Blackjack');
    msg = text;
    if (win) story.actWin('casino.blackjack');
    else story.st.acts['casino.blackjack'] = story.st.acts['casino.blackjack'] ?? { plays: 0, wins: 0, best: 0, ext: {} };
  };
  const dealerPlay = (): void => {
    while (handValue(dealer) < 17) dealer.push(draw());
    const p = handValue(player), d = handValue(dealer);
    if (d > 21) settle(2, `Dealer busts with ${d}. You win ${money(stake)}.`, true);
    else if (p > d) settle(2, `${p} beats ${d}. You win ${money(stake)}.`, true);
    else if (p === d) settle(1, `Push at ${p}. Your bet is returned.`, false);
    else settle(0, `Dealer has ${d}. You lose ${money(stake)}.`, false);
  };
  return {
    title: 'Blackjack',
    kicker: 'Lucky Seven Casino',
    hints: 'Esc / B  back',
    render: (host) => {
      const b = host.body;
      if (phase === 'bet' || phase === 'done') {
        if (msg) b.append(h('p', 'cg-msg', msg));
        if (phase === 'done') {
          b.append(h('div', 'cg-table', h('div', 'cg-hand', h('span', 'cg-lab', `Dealer ${handValue(dealer)}`), ...dealer.map(cardEl)), h('div', 'cg-hand', h('span', 'cg-lab', `You ${handValue(player)}`), ...player.map(cardEl))));
        }
        b.append(section('Place your bet'), chips(host, bet, (n) => { bet = n; }, eco.cash));
        b.append(row({
          label: `Deal  ${money(bet)}`, disabled: eco.cash < bet,
          onClick: () => {
            if (!eco.spend(bet, 'Blackjack')) return;
            stake = bet; msg = ''; phase = 'play';
            player = [draw(), draw()]; dealer = [draw(), draw()];
            if (handValue(player) === 21) { if (handValue(dealer) === 21) settle(1, 'Both have blackjack: push.', false); else settle(2.5, `Blackjack! You win ${money(Math.round(stake * 1.5))}.`, true); }
            host.refresh();
          },
        }));
        b.append(btn('Back', '', () => host.back()));
        return;
      }
      b.append(
        h('div', 'cg-table', h('div', 'cg-hand', h('span', 'cg-lab', 'Dealer'), cardEl(dealer[0]!), cardEl(null)), h('div', 'cg-hand', h('span', 'cg-lab', `You ${handValue(player)}`), ...player.map(cardEl))),
        row({ label: 'Hit', onClick: () => { player.push(draw()); if (handValue(player) > 21) settle(0, `Bust with ${handValue(player)}. You lose ${money(stake)}.`, false); else if (handValue(player) === 21) dealerPlay(); host.refresh(); } }),
        row({ label: 'Stand', onClick: () => { dealerPlay(); host.refresh(); } }),
        row({ label: `Double down  ${money(stake)}`, disabled: player.length !== 2 || eco.cash < stake, onClick: () => { if (!eco.spend(stake, 'Blackjack double')) return; stake *= 2; player.push(draw()); if (handValue(player) > 21) settle(0, `Bust with ${handValue(player)}. You lose ${money(stake)}.`, false); else dealerPlay(); host.refresh(); } }),
      );
    },
  };
}

// ------------------------------------------------------------------------------------------------ roulette

const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const rouletteColour = (n: number): 'red' | 'black' | 'green' => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');

interface RBet { label: string; pays: number; wins: (n: number) => boolean }
const OUTSIDE: RBet[] = [
  { label: 'Red', pays: 1, wins: (n) => rouletteColour(n) === 'red' },
  { label: 'Black', pays: 1, wins: (n) => rouletteColour(n) === 'black' },
  { label: 'Odd', pays: 1, wins: (n) => n > 0 && n % 2 === 1 },
  { label: 'Even', pays: 1, wins: (n) => n > 0 && n % 2 === 0 },
  { label: '1–18', pays: 1, wins: (n) => n >= 1 && n <= 18 },
  { label: '19–36', pays: 1, wins: (n) => n >= 19 },
  { label: '1st dozen', pays: 2, wins: (n) => n >= 1 && n <= 12 },
  { label: '2nd dozen', pays: 2, wins: (n) => n >= 13 && n <= 24 },
  { label: '3rd dozen', pays: 2, wins: (n) => n >= 25 },
];

function roulettePage(story: Story): Page {
  const eco = story.g.commerce!.eco;
  let bet = 100;
  let pick: RBet = OUTSIDE[0]!;
  let spinning = false;
  let last: number | null = null;
  let msg = '';
  const history: number[] = [];
  const straight = (n: number): RBet => ({ label: `Number ${n}`, pays: 35, wins: (x) => x === n });
  return {
    title: 'Roulette',
    kicker: 'Lucky Seven Casino',
    hints: 'Esc / B  back',
    render: (host) => {
      const b = host.body;
      if (last !== null) b.append(h('div', `cg-ball ${rouletteColour(last)}`, String(last)));
      if (msg) b.append(h('p', 'cg-msg', msg));
      if (history.length) b.append(h('p', 'm-info', `Recent: ${history.slice(-10).reverse().join('  ')}`));
      b.append(section('Bet'), chips(host, bet, (n) => { bet = n; }, eco.cash));
      b.append(section(`Betting on: ${pick.label} (pays ${pick.pays} to 1)`));
      const outside = h('div', 'cg-grid');
      outside.dataset.navRow = '';
      for (const o of OUTSIDE) {
        const c = h('button', `cg-cell${o === pick ? ' on' : ''}`, o.label);
        c.type = 'button';
        c.addEventListener('click', () => { pick = o; host.refresh(); });
        outside.append(c);
      }
      b.append(outside);
      const nums = h('div', 'cg-grid nums');
      nums.dataset.navRow = '';
      for (let n = 0; n <= 36; n++) {
        const c = h('button', `cg-cell ${rouletteColour(n)}${pick.label === `Number ${n}` ? ' on' : ''}`, String(n));
        c.type = 'button';
        c.addEventListener('click', () => { pick = straight(n); host.refresh(); });
        nums.append(c);
      }
      b.append(nums);
      b.append(row({
        label: spinning ? 'The wheel is spinning…' : `Spin  ${money(bet)}`, disabled: spinning || eco.cash < bet,
        onClick: () => {
          if (spinning || !eco.spend(bet, 'Roulette')) return;
          spinning = true; msg = '';
          const result = rnd(37);
          let k = 0;
          const tick = (): void => {
            last = rnd(37);
            k++;
            if (k < 14) { host.refresh(); setTimeout(tick, 70 + k * 12); return; }
            last = result;
            spinning = false;
            history.push(result);
            if (pick.wins(result)) {
              const win = bet * (pick.pays + 1);
              eco.earn(win, 'Roulette');
              msg = `${result} ${rouletteColour(result)}. You win ${money(bet * pick.pays)}.`;
              story.actWin('casino.roulette');
            } else msg = `${result} ${rouletteColour(result)}. You lose ${money(bet)}.`;
            host.refresh();
          };
          tick();
        },
      }));
      b.append(btn('Back', '', () => host.back()));
    },
  };
}

// ------------------------------------------------------------------------------------------------ slots

const REELS = ['7', '★', '♦', '♥', '♣', '♠', '♠', '♣', '♥', '♦'];

/** Payout multiplier for three symbols (exported for tests). */
export function slotPay(a: string, b: string, c: string): number {
  if (a === b && b === c) return a === '7' ? 50 : a === '★' ? 20 : a === '♦' ? 10 : 5;
  const sevens = [a, b, c].filter((s) => s === '7').length;
  if (sevens === 2) return 2;
  if (a === b || b === c || a === c) return 1;
  return 0;
}

function slotsPage(story: Story): Page {
  const eco = story.g.commerce!.eco;
  let bet = 100;
  let reels = ['7', '★', '♦'];
  let spinning = false;
  let msg = '';
  return {
    title: 'Slots',
    kicker: 'Lucky Seven Casino',
    hints: 'Esc / B  back',
    render: (host) => {
      const b = host.body;
      b.append(h('div', 'cg-reels', ...reels.map((r) => h('span', `cg-reel${r === '7' ? ' seven' : ''}`, r))));
      if (msg) b.append(h('p', 'cg-msg', msg));
      b.append(section('Bet'), chips(host, bet, (n) => { bet = n; }, eco.cash));
      b.append(h('p', 'm-info', 'Three 7s pay 50×, three ★ 20×, three ♦ 10×, any other three 5×. Two 7s pay 2×, any pair pays your bet back.'));
      b.append(row({
        label: spinning ? 'Spinning…' : `Pull  ${money(bet)}`, disabled: spinning || eco.cash < bet,
        onClick: () => {
          if (spinning || !eco.spend(bet, 'Slots')) return;
          spinning = true; msg = '';
          const final = [REELS[rnd(REELS.length)]!, REELS[rnd(REELS.length)]!, REELS[rnd(REELS.length)]!];
          let k = 0;
          const tick = (): void => {
            k++;
            reels = reels.map((_, i) => (k > 8 + i * 4 ? final[i]! : REELS[rnd(REELS.length)]!));
            host.refresh();
            if (k < 20) { setTimeout(tick, 60 + k * 4); return; }
            spinning = false;
            const mult = slotPay(final[0]!, final[1]!, final[2]!);
            if (mult > 0) {
              eco.earn(bet * mult, 'Slots');
              msg = mult > 1 ? `Winner! ${final.join(' ')}  pays ${mult}× — ${money(bet * mult)}` : `A pair: your bet is returned.`;
              if (mult >= 10) story.actWin('casino.slots');
            } else msg = 'No luck.';
            host.refresh();
          };
          tick();
        },
      }));
      b.append(btn('Back', '', () => host.back()));
    },
  };
}
