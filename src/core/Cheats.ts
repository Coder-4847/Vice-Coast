import type { Game } from '../Game';
import { HEAT } from '../combat/Wanted';
import { WEAPON_ORDER, WEAPONS } from '../player/Weapons';

interface Cheat { code: string; name: string; run: (g: Game) => string | void }

/**
 * Old-school cheat codes, typed into a little console (press ` while playing). Cheats are off during missions, and
 * using one marks the save.
 */
export const CHEATS: Cheat[] = [
  { code: 'TOOLUP', name: 'Every weapon, full ammunition', run: (g) => { for (const id of WEAPON_ORDER) g.weapon?.give(id, WEAPONS[id].reserveMax || 1); } },
  { code: 'PATCHUP', name: 'Full health and armour', run: (g) => { g.combat?.vitals.heal(100); g.combat?.vitals.addArmour(100); } },
  { code: 'CLEANSLATE', name: 'Wanted level cleared', run: (g) => { g.wanted?.clear(); } },
  { code: 'RAISEHELL', name: 'Two more stars', run: (g) => { const w = g.wanted, p = g.player; if (w && p) w.report(HEAT[Math.min(6, w.stars + 2)]! - w.heat + 1, p.pos.x, p.pos.z, true); } },
  { code: 'FASTLANE', name: 'Kaiser Comet delivered', run: (g) => spawnCar(g, 'comet') },
  { code: 'OFFROAD', name: 'Ridgeback 4x4 delivered', run: (g) => spawnCar(g, 'ridgeback') },
  { code: 'WHIRLYBIRD', name: 'Hornet gunship delivered', run: (g) => spawnCraft(g, 'hornet') },
  { code: 'SUNSHINE', name: 'Clear skies', run: (g) => { g.world.setWeather('clear'); } },
  { code: 'STORMFRONT', name: 'A storm rolls in', run: (g) => { g.world.setWeather('storm'); } },
  { code: 'PAYDAY', name: '$50,000 found down the back of the sofa', run: (g) => { g.commerce?.eco.earn(50000, 'Cheat'); } },
];

export class Cheats {
  used = 0;
  private readonly box: HTMLDivElement;
  private readonly field: HTMLInputElement;

  constructor(private readonly g: Game) {
    // a one-line console: ` opens it, type a code, Enter. Keys typed here never reach the game.
    this.field = document.createElement('input');
    this.field.className = 'cheat-input';
    this.field.placeholder = 'Enter a cheat code';
    this.field.maxLength = 20;
    this.field.spellcheck = false;
    this.box = document.createElement('div');
    this.box.className = 'cheat-box is-hidden';
    this.box.append(this.field);
    document.body.append(this.box);
    this.field.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { this.submit(this.field.value); this.close(); }
      else if (e.key === 'Escape' || e.code === 'Backquote') { e.preventDefault(); this.close(); }
    });
    this.field.addEventListener('keyup', (e) => e.stopPropagation());
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Backquote' || e.repeat || this.g.state !== 'playing') return;
      e.preventDefault();
      this.open();
    });
  }

  private open(): void {
    this.box.classList.remove('is-hidden');
    this.field.value = '';
    setTimeout(() => this.field.focus(), 0);
  }

  private close(): void {
    this.box.classList.add('is-hidden');
    this.field.blur();
  }

  private submit(text: string): void {
    const code = text.trim().toUpperCase().replace(/\s+/g, '');
    const hit = CHEATS.find((c) => c.code === code);
    if (hit) this.fire(hit); else if (code) this.g.ui.toast('Nothing happens.');
  }

  private fire(c: Cheat): void {
    const g = this.g;
    if (g.state !== 'playing') return;
    if (g.story?.mission) { g.ui.toast('Cheats are switched off during missions.'); return; }
    const msg = c.run(g);
    this.used++;
    if (g.story) g.story.st.flags.cheated = true;
    g.audio.uiBlip('ok');
    g.ui.toast(`Cheat activated: ${msg || c.name}`);
  }
}

function spawnCar(g: Game, spec: string): string | void {
  const p = g.player; if (!p || !g.vehicles) return;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  const v = g.vehicles.spawn(spec, p.pos.x + fx * 5, p.pos.z + fz * 5, p.yaw);
  v.ambient = true;
}

function spawnCraft(g: Game, spec: string): string | void {
  const p = g.player; if (!p || !g.crafts) return;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  g.crafts.spawn(spec, p.pos.x + fx * 14, p.pos.z + fz * 14, p.yaw);
}
