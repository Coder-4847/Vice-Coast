import type { Story } from '../story/Story';
import { money } from '../economy/Economy';
import { h } from '../ui/dom';
import { btn, row, section, type Page, type PageHost } from '../ui/Modal';

interface Level { name: string; pay: number }

const LEVELS: Level[] = [{ name: 'Easy', pay: 1 }, { name: 'Medium', pay: 1.8 }, { name: 'Hard', pay: 3 }];

const rnd = (n: number): number => Math.floor(Math.random() * n);

/** The toolkit's front page. */
export function toolkitPage(story: Story): Page {
  return {
    title: 'Toolkit',
    kicker: 'Break-in practice',
    hints: 'Esc / B  back',
    render: (host) => {
      const st = story.st.acts;
      const n = (id: string): string => `${st[id]?.wins ?? 0} done`;
      host.body.append(
        h('p', 'm-info', 'Practice rigs a crew pays for: pick the lock, beat the firewall, crack the safe. Harder rigs pay more.'),
        row({ label: 'Lockpicking', sub: 'Set each pin when the pick is in the green.', right: n('mini.lockpick'), onClick: () => host.push(levelPage(story, 'Lockpicking', (lv) => lockpickPage(story, lv))) }),
        row({ label: 'Hacking', sub: 'Memorise the code, then key it in before the trace finishes.', right: n('mini.hack'), onClick: () => host.push(levelPage(story, 'Hacking', (lv) => hackPage(story, lv))) }),
        row({ label: 'Safe-cracking', sub: 'Turn the dial and listen. Three numbers.', right: n('mini.safe'), onClick: () => host.push(levelPage(story, 'Safe-cracking', (lv) => safePage(story, lv))) }),
        btn('Close', '', () => host.close()),
      );
    },
  };
}

function levelPage(story: Story, title: string, make: (lv: number) => Page): Page {
  void story;
  return {
    title,
    kicker: 'Choose a rig',
    render: (host) => {
      for (let i = 0; i < LEVELS.length; i++) host.body.append(row({ label: LEVELS[i]!.name, sub: `Pays up to ${money(payFor(title, i))}`, onClick: () => host.push(make(i)) }));
      host.body.append(btn('Back', '', () => host.back()));
    },
  };
}

const BASE: Record<string, number> = { Lockpicking: 150, Hacking: 200, 'Safe-cracking': 300 };
const payFor = (title: string, lv: number): number => Math.round((BASE[title] ?? 100) * LEVELS[lv]!.pay);

function finish(story: Story, host: PageHost, act: string, title: string, lv: number, ok: boolean, again: () => Page): void {
  const eco = story.g.commerce!.eco;
  const pay = ok ? payFor(title, lv) : 0;
  if (ok) { eco.earn(pay, title); story.actWin(act); }
  host.back();
  host.push({
    title: ok ? 'Done' : 'Failed',
    kicker: title,
    render: (hh) => {
      hh.body.append(h('p', 'cg-msg', ok ? `Clean job. +${money(pay)}` : 'It jammed. Try again.'), row({ label: 'Go again', onClick: () => { hh.back(); hh.push(again()); } }), btn('Done', '', () => hh.back()));
    },
  });
}

// ------------------------------------------------------------------------------------------------ lockpicking

function lockpickPage(story: Story, lv: number): Page {
  const pins = 4 + lv;
  const zone = [0.22, 0.17, 0.12][lv]!;
  const speed = [0.9, 1.25, 1.7][lv]!;
  let raf = 0;
  const target = Array.from({ length: pins }, () => 0.15 + Math.random() * 0.7);
  let pin = 0, picks = 3;
  let t0 = performance.now();
  return {
    title: 'Lockpicking',
    kicker: LEVELS[lv]!.name,
    hints: 'Space / Enter  set the pin',
    onClose: () => cancelAnimationFrame(raf),
    render: (host) => {
      const b = host.body;
      const lanes: HTMLElement[] = [], marks: HTMLElement[] = [];
      const board = h('div', 'cg-pins');
      for (let i = 0; i < pins; i++) {
        const mark = h('i', 'cg-mark');
        const lane = h('div', `cg-lane${i < pin ? ' set' : i === pin ? ' cur' : ''}`, h('b', 'cg-zone'), mark);
        (lane.firstChild as HTMLElement).style.left = `${(target[i]! - zone / 2) * 100}%`;
        (lane.firstChild as HTMLElement).style.width = `${zone * 100}%`;
        lanes.push(lane); marks.push(mark);
        board.append(lane);
      }
      b.append(h('p', 'm-info', `Picks left: ${'●'.repeat(picks)}${'○'.repeat(3 - picks)}`), board);
      const setBtn = btn('Set pin', 'primary', () => {
        const x = pos();
        if (Math.abs(x - target[pin]!) <= zone / 2) {
          pin++;
          if (pin >= pins) { cancelAnimationFrame(raf); finish(story, host, 'mini.lockpick', 'Lockpicking', lv, true, () => lockpickPage(story, lv)); return; }
          host.refresh();
        } else {
          picks--; pin = Math.max(0, pin - 1);
          if (picks <= 0) { cancelAnimationFrame(raf); finish(story, host, 'mini.lockpick', 'Lockpicking', lv, false, () => lockpickPage(story, lv)); return; }
          host.refresh();
        }
      });
      b.append(setBtn);
      const pos = (): number => { const s = ((performance.now() - t0) / 1000) * speed; const k = s % 2; return k < 1 ? k : 2 - k; };
      cancelAnimationFrame(raf);
      const loop = (): void => { marks[pin]!.style.left = `${pos() * 100}%`; raf = requestAnimationFrame(loop); };
      t0 = performance.now();
      loop();
      setBtn.focus({ preventScroll: true });
    },
  };
}

// ------------------------------------------------------------------------------------------------ hacking

const GLYPHS = ['◆', '▲', '●', '■', '✦', '☰', '⌬', '✚'];

function hackPage(story: Story, lv: number): Page {
  const len = 4 + lv * 2;
  const secs = [14, 13, 12][lv]!;
  const code = Array.from({ length: len }, () => rnd(GLYPHS.length));
  let entered: number[] = [];
  let stage: 'show' | 'input' = 'show';
  let timer = 0, tEnd = 0, raf = 0;
  return {
    title: 'Hacking',
    kicker: LEVELS[lv]!.name,
    hints: 'Click the symbols in order',
    onClose: () => { clearTimeout(timer); cancelAnimationFrame(raf); },
    render: (host) => {
      const b = host.body;
      if (stage === 'show') {
        b.append(h('p', 'm-info', 'Memorise the access code…'), h('div', 'cg-code', ...code.map((c) => h('span', '', GLYPHS[c]!))));
        clearTimeout(timer);
        timer = window.setTimeout(() => { stage = 'input'; tEnd = performance.now() + secs * 1000; host.refresh(); }, 1400 + len * 450);
        return;
      }
      const trace = h('div', 'cp-bar big', h('i', ''));
      b.append(h('p', 'm-info', 'Trace in progress — key in the code.'), trace, h('div', 'cg-code', ...code.map((_, i) => h('span', i < entered.length ? 'on' : '', i < entered.length ? GLYPHS[entered[i]!]! : '·'))));
      const pad = h('div', 'cg-grid');
      pad.dataset.navRow = '';
      GLYPHS.forEach((g, gi) => {
        const c = h('button', 'cg-cell', g);
        c.type = 'button';
        c.addEventListener('click', () => {
          if (code[entered.length] === gi) { entered.push(gi); if (entered.length >= len) { cancelAnimationFrame(raf); finish(story, host, 'mini.hack', 'Hacking', lv, true, () => hackPage(story, lv)); return; } host.refresh(); } else { cancelAnimationFrame(raf); finish(story, host, 'mini.hack', 'Hacking', lv, false, () => hackPage(story, lv)); }
        });
        pad.append(c);
      });
      b.append(pad);
      const fill = trace.firstChild as HTMLElement;
      cancelAnimationFrame(raf);
      const loop = (): void => {
        const left = Math.max(0, (tEnd - performance.now()) / (secs * 1000));
        fill.style.width = `${left * 100}%`;
        if (left <= 0) { finish(story, host, 'mini.hack', 'Hacking', lv, false, () => hackPage(story, lv)); return; }
        raf = requestAnimationFrame(loop);
      };
      loop();
    },
  };
}

// ------------------------------------------------------------------------------------------------ safe-cracking

function safePage(story: Story, lv: number): Page {
  const nums = [rnd(100), rnd(100), rnd(100)];
  const tol = [2, 1, 0][lv]!;
  let dial = 50, step = 0;
  let msg = '';
  const heat = (): string => {
    const d = Math.min(Math.abs(dial - nums[step]!), 100 - Math.abs(dial - nums[step]!));
    return d <= tol ? 'CLICK' : d < 5 ? 'Hot' : d < 15 ? 'Warm' : d < 30 ? 'Cool' : 'Cold';
  };
  return {
    title: 'Safe-cracking',
    kicker: LEVELS[lv]!.name,
    hints: 'Turn the dial, lock each number in',
    render: (host) => {
      const b = host.body;
      const turn = (n: number): void => { dial = ((dial + n) % 100 + 100) % 100; msg = ''; host.refresh(); };
      b.append(
        h('div', 'cg-dial', h('b', '', String(dial).padStart(2, '0')), h('span', heat() === 'CLICK' ? 'on' : '', heat())),
        h('p', 'm-info', `Number ${step + 1} of 3 ${'●'.repeat(step)}${'○'.repeat(3 - step)}`),
      );
      if (msg) b.append(h('p', 'cg-msg', msg));
      const ctl = h('div', 'cg-grid');
      ctl.dataset.navRow = '';
      for (const [l, n] of [['−10', -10], ['−1', -1], ['+1', 1], ['+10', 10]] as [string, number][]) { const c = h('button', 'cg-cell', l); c.type = 'button'; c.addEventListener('click', () => turn(n)); ctl.append(c); }
      b.append(ctl);
      b.append(row({
        label: 'Lock in', onClick: () => {
          const d = Math.min(Math.abs(dial - nums[step]!), 100 - Math.abs(dial - nums[step]!));
          if (d <= tol) {
            step++;
            if (step >= 3) { finish(story, host, 'mini.safe', 'Safe-cracking', lv, true, () => safePage(story, lv)); return; }
            msg = 'Click. One down.';
          } else { step = 0; msg = 'Wrong. The tumblers reset.'; }
          host.refresh();
        },
      }));
      b.append(section(''));
    },
  };
}
