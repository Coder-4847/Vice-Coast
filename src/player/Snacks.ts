import * as THREE from 'three';
import type { Game } from '../Game';
import { SNACKS } from '../economy/catalog';

/**
 * Snacks in your pockets: press F (controller: B) to eat the smallest one that is worth eating. Bought at food
 * places and gun stores, ten at most. Eating takes a moment and does not work in a cutscene or while flying.
 */
const SNACK_LOOK: Record<string, { size: [number, number, number]; color: number; accent: number }> = {
  bar: { size: [0.035, 0.012, 0.11], color: 0x5a2a1a, accent: 0xd8b04a },
  chips: { size: [0.09, 0.03, 0.12], color: 0xd8342a, accent: 0xf2d24a },
  sandwich: { size: [0.1, 0.04, 0.1], color: 0xe8c890, accent: 0x6aa84a },
  energy: { size: [0.04, 0.12, 0.04], color: 0x2a6ad8, accent: 0xe8e8e8 },
};

export class Snacks {
  private cool = 0;
  /** The snack in your hand while eating (camera-relative animation). */
  private held: { mesh: THREE.Group; t: number } | null = null;

  constructor(private readonly g: Game) {}

  /** How many you carry. */
  count(): number {
    const bag = this.g.commerce?.eco.p.snacks;
    return bag ? Object.values(bag).reduce((a, b) => a + b, 0) : 0;
  }

  update(dt: number): void {
    const g = this.g;
    this.cool -= dt;
    this.animate(dt);
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
    this.show(pick.id);
    g.audio.sport('bite', 1);
    g.audio.mech('cloth');
    g.ui.toast(`${pick.name} · +${pick.heal} health · ${this.count()} left`);
    this.cool = 1.2;
  }

  /** The snack goes into the right hand, up to the mouth for two bites, and is gone. */
  private show(id: string): void {
    const g = this.g;
    const look = SNACK_LOOK[id] ?? SNACK_LOOK.bar!;
    const grp = new THREE.Group();
    const [w, h, d] = look.size;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.6 }));
    const band = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, h * 1.02, d * 0.3), new THREE.MeshStandardMaterial({ color: look.accent, roughness: 0.5 }));
    band.position.z = d * 0.25;
    grp.add(body, band);
    // held between thumb and fingers, poking out of the top of the fist
    grp.position.set(0, 0.02, -0.07);
    grp.rotation.set(-0.4, 0, 0);
    this.held = { mesh: grp, t: 0 };
    if (g.viewmodel) g.viewmodel.play('eat', grp);
  }

  private animate(dt: number): void {
    const h = this.held;
    if (!h) return;
    const g = this.g;
    const prev = h.t;
    h.t += dt;
    // two bites, timed to the hand reaching the mouth
    for (const at of [0.5, 0.75]) if (prev < at && h.t >= at) { g.audio.sport('bite', 1); h.mesh.scale.multiplyScalar(0.72); }
    if (h.t >= 1.3) {
      h.mesh.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
      this.held = null;
    }
  }
}
