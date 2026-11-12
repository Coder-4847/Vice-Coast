import './ui/style.css';
import { Game } from './Game';
import { probeGpu } from './core/Quality';

function fatal(title: string, message: string): void {
  const ui = document.getElementById('ui')!;
  ui.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'screen overlay';
  const h = document.createElement('h3');
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = message;
  wrap.append(h, p);
  ui.append(wrap);
}

/** Phones and tablets are not supported: say so, and let people with a controller or keyboard carry on. */
function touchOnlyNotice(): Promise<void> {
  const touchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  if (!touchOnly) return Promise.resolve();
  return new Promise((resolve) => {
    const ui = document.getElementById('ui')!;
    const wrap = document.createElement('div');
    wrap.className = 'screen overlay';
    const h = document.createElement('h3');
    h.textContent = 'Keyboard & mouse or a controller needed';
    const p = document.createElement('p');
    p.textContent = 'Vice Coast is a desktop game: it has no on-screen touch controls. Play it on a computer, or connect a keyboard or a game controller to this device and continue.';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn primary';
    b.textContent = 'Continue anyway';
    b.addEventListener('click', () => { wrap.remove(); resolve(); });
    wrap.append(h, p, b);
    ui.append(wrap);
  });
}

async function main(): Promise<void> {
  const gpu = probeGpu();
  if (!gpu) {
    fatal(
      'WebGL 2 unavailable',
      'Vice Coast needs a browser with WebGL 2 and hardware acceleration. Try a current Chrome, Edge, Firefox or Safari, and make sure hardware acceleration is enabled.',
    );
    return;
  }
  await touchOnlyNotice();
  const game = new Game(gpu);
  if (import.meta.env.DEV || location.search.includes('debug')) {
    (window as unknown as { __vice: Game }).__vice = game;
  }
  await game.init();
}

main().catch((err) => {
  console.error(err);
  fatal('Something went wrong', 'The game failed to start. Reload the page; if it keeps happening, check the browser console.');
});
