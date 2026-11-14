import { h } from './dom';

export interface CreditsInfo {
  ending: string;
  tagline: string;
  stats: [string, string][];
  endingsSeen: number;
  endingsTotal: number;
}

const ROLL: [string, string[]][] = [
  ['Starring', ['Marcus "Mack" Delgado', 'Imani Cole', 'Teddy Vance']],
  ['With', ['Desmond Crane', 'Capt. Ines Brandt', 'Agent Walter Pruitt', 'Rosa, Mateo and Tomas Lazaro']],
  ['And', ['Carmen and Lola Delgado', 'Benny Okonkwo', 'Pilar Reyes', 'Dex Quill', 'Mama Jo', 'Marisol Vega', 'Silas Quinn']],
  ['The city', ['Port Valeria', 'Southside', 'Dusk Harbor', 'Costa Merida', 'Cinder Flats', 'Pinecrest Bay', 'Mount Kestrel', 'Isla Rojo', 'Fort Halloran']],
  ['On the radio', ['Six stations, all of them synthesised live in your browser']],
  ['Built with', ['Three.js', 'Rapier physics', 'The Web Audio API', 'A great deal of procedural geometry']],
];

/**
 * The end credits: a full-screen roll over the darkened city with the ending's name, the player's numbers and the cast.
 * It runs on its own clock and resolves when it ends or is skipped (any key, click or controller button after a moment).
 */
export function rollCredits(info: CreditsInfo): Promise<void> {
  return new Promise((resolve) => {
    const roll = h('div', 'cr-roll');
    roll.append(
      h('div', 'cr-kicker', 'Vice Coast'),
      h('div', 'cr-ending', info.ending),
      h('div', 'cr-tag', info.tagline),
      h('div', 'cr-stats', ...info.stats.map(([k, v]) => h('div', 'cr-stat', h('span', '', k), h('b', '', v)))),
      h('div', 'cr-seen', `Endings seen: ${info.endingsSeen} of ${info.endingsTotal}${info.endingsSeen < info.endingsTotal ? ' · replay "Three Ways Out" from the phone to choose another' : ' · you have seen them all'}`),
    );
    for (const [head, names] of ROLL) roll.append(h('div', 'cr-head', head), ...names.map((n) => h('div', 'cr-name', n)));
    roll.append(h('div', 'cr-end', 'Thank you for playing.'), h('div', 'cr-sub', 'The whole coast is yours now: every job, every road. Go and find what is left.'));
    const skip = h('div', 'cr-skip', 'Press any key to skip');
    const root = h('div', 'credits', roll, skip);
    document.body.append(root);
    requestAnimationFrame(() => root.classList.add('show'));
    const t0 = performance.now();
    const dur = 46000;
    let done = false;
    let raf = 0;
    const finish = (): void => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      root.removeEventListener('pointerdown', onKey);
      root.classList.remove('show');
      setTimeout(() => { root.remove(); resolve(); }, 700);
    };
    const onKey = (e: Event): void => {
      if (performance.now() - t0 < 2500) return;
      e.preventDefault();
      e.stopPropagation();
      finish();
    };
    window.addEventListener('keydown', onKey, true);
    root.addEventListener('pointerdown', onKey);
    const tick = (now: number): void => {
      const t = (now - t0) / dur;
      const H = root.clientHeight, rh = roll.scrollHeight;
      // the roll starts below the screen and ends with the last line in the middle
      const y = H - t * (rh + H * 0.5);
      roll.style.transform = `translate(-50%, ${y.toFixed(1)}px)`;
      const pad = navigator.getGamepads?.().find((p) => p && p.connected);
      if (pad && now - t0 > 2500 && pad.buttons.some((b) => b.pressed)) { finish(); return; }
      if (t >= 1) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
