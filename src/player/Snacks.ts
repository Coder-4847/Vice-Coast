import type { Game } from '../Game';
import { SNACKS } from '../economy/catalog';

/**
 * Snacks in your pockets: press F (controller: B) to eat the smallest one that is worth eating. Bought at food
 * places and gun stores, ten at most. Eating takes a moment and does not work in a cutscene or while flying.
 */
export class Snacks {
  private cool = 0;

  constructor(private readonly g: Game) {}

  /** How many you carry. */
  count(): number {
    const bag = this.g.commerce?.eco.p.snacks;
    return bag ? Object.values(bag).reduce((a, b) => a + b, 0) : 0;
  }

  update(dt: number): void {
    const g = this.g;
    this.cool -= dt;
    if (g.state !== 'playing' || !g.input.pressed('snack') || this.cool > 0) return;
    if (g.story?.cutscenes.active || g.piloting?.busy) return;
    const vit = g.combat?.vitals;
    const bag = g.commerce?.eco.p.snacks;
    if (!vit || !bag || vit.dead) return;
    if (this.count() <= 0) { g.ui.toast('No snacks. Buy some at a food place or a gun store.'); this.cool = 1; return; }
    const missing = vit.maxHealth - vit.health;
    if (missing < 2) { g.ui.toast('You are not hungry.'); this.cool = 1; return; }
    // the smallest snack that fills the gap, otherwise the biggest one you have
    const have = SNACKS.filter((s) => (bag[s.id] ?? 0) > 0).sort((a, b) => a.heal - b.heal);
    const pick = have.find((s) => s.heal >= missing) ?? have[have.length - 1]!;
    bag[pick.id]! -= 1;
    if (bag[pick.id]! <= 0) delete bag[pick.id];
    vit.heal(pick.heal);
    g.audio.sport('bite', 1);
    g.audio.mech('cloth');
    g.ui.toast(`${pick.name} · +${pick.heal} health · ${this.count()} left`);
    this.cool = 1.2;
  }
}
