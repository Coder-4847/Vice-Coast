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
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();

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

  /** A snack rises from the bottom of the screen to the mouth, gets bitten twice and is gone. */
  private show(id: string): void {
    const g = this.g;
    if (this.held) g.world.scene.remove(this.held.mesh);
    const look = SNACK_LOOK[id] ?? SNACK_LOOK.bar!;
    const grp = new THREE.Group();
    const [w, h, d] = look.size;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.6 }));
    const band = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, h * 1.02, d * 0.3), new THREE.MeshStandardMaterial({ color: look.accent, roughness: 0.5 }));
    band.position.z = d * 0.25;
    grp.add(body, band);
    grp.traverse((o) => { o.frustumCulled = false; o.renderOrder = 10; });
    g.world.scene.add(grp);
    this.held = { mesh: grp, t: 0 };
    // the gun dips out of the way
    g.viewmodel?.bump(1.2);
  }

  private animate(dt: number): void {
    const h = this.held;
    if (!h) return;
    const g = this.g;
    h.t += dt;
    const T = 1.25;
    const u = Math.min(1, h.t / T);
    // in from bottom right, up to the mouth, two bites (shrinks), then away
    const rise = u < 0.35 ? u / 0.35 : u < 0.8 ? 1 : 1 - (u - 0.8) / 0.2;
    const e = rise * rise * (3 - 2 * rise);
    _p.set(0.16 - 0.15 * e, -0.3 + 0.21 * e, -0.42 + 0.14 * e);
    const bites = u < 0.5 ? 1 : u < 0.65 ? 0.7 : 0.4;
    h.mesh.scale.setScalar(bites);
    const cam = g.camera;
    _q.copy(cam.quaternion);
    h.mesh.position.copy(_p.applyQuaternion(_q).add(cam.position));
    h.mesh.quaternion.copy(_q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5 - 0.4 * e, -0.6 + 0.5 * e, 0.3)));
    if (u >= 0.5 && u - dt / T < 0.5) g.audio.sport('bite', 1);
    if (u >= 1) {
      g.world.scene.remove(h.mesh);
      h.mesh.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
      this.held = null;
    }
  }
}
