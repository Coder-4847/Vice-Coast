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

async function main(): Promise<void> {
  const gpu = probeGpu();
  if (!gpu) {
    fatal(
      'WebGL 2 unavailable',
      'Vice Coast needs a browser with WebGL 2 and hardware acceleration. Try a current Chrome, Edge, Firefox or Safari, and make sure hardware acceleration is enabled.',
    );
    return;
  }
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
