import type { Piloting } from '../craft/Piloting';
import type { Player } from '../player/Player';
import { GEO } from '../world/heightfield';
import type { CombatHud } from '../ui/CombatHud';
import type { Wanted } from './Wanted';

const WARN_TIME = 6;

/**
 * Fort Halloran is a military reservation. Crossing the outer boundary starts a warning countdown; ignoring it (or going
 * straight to the inner compound, or climbing into the army's armour) brings the heavy response down on the player.
 */
export class Restricted {
  /** 0 = outside, 1 = warned, 2 = inner compound. */
  zone = 0;
  private warn = 0;
  private escalated = 0;
  private readonly banner: HTMLElement;

  constructor(private readonly d: { wanted: Wanted; player: Player; piloting: Piloting; hud: CombatHud; hudRoot: HTMLElement; toast(m: string): void }) {
    this.banner = document.createElement('div');
    this.banner.className = 'restricted-warn is-hidden';
    d.hudRoot.appendChild(this.banner);
  }

  /** Zone the player is in: 0 outside, 1 inside the boundary, 2 inside the compound. Aircraft above the ceiling don't count. */
  zoneAt(x: number, z: number, y: number): number {
    const F = GEO.fort;
    const d = Math.hypot(x - F.x, z - F.z);
    const ceiling = 900;
    if (d > F.restricted || y > ceiling) return 0;
    return d < F.r * 0.62 ? 2 : 1;
  }

  update(dt: number): void {
    const { wanted, player: p, piloting, hud } = this.d;
    const z = this.zoneAt(p.pos.x, p.pos.z, p.pos.y);
    if (z === 0) {
      if (this.zone !== 0) this.banner.classList.add('is-hidden');
      this.zone = 0; this.warn = 0; this.escalated = 0;
      return;
    }
    const armour = piloting.active && piloting.craft?.spec.kind === 'ground';
    if (this.zone === 0) hud.say('RESTRICTED AREA — Fort Halloran. Leave immediately.', 5);
    this.zone = z;
    // the military doesn't ask twice: the compound, or armour, is an instant escalation
    const want = armour ? 3 : z === 2 ? 2 : 1;
    if (want > this.escalated) {
      if (want === 1) {
        this.warn += dt;
        const left = Math.max(0, Math.ceil(WARN_TIME - this.warn));
        this.banner.textContent = `RESTRICTED AREA — LEAVE NOW · ${left}`;
        this.banner.classList.remove('is-hidden');
        if (this.warn < WARN_TIME) return;
      }
      const weight = want === 3 ? 460 : want === 2 ? 300 : 190;
      wanted.report(weight, p.pos.x, p.pos.z, true);
      this.escalated = want;
      this.banner.classList.add('is-hidden');
      hud.say(want === 3 ? 'Armour stolen from a military base!' : 'Trespassing on military property.', 4);
    } else if (this.escalated >= 1 && wanted.stars > 0) {
      // staying in the compound keeps the search alive
      wanted.report(0.5 * dt * 6, p.pos.x, p.pos.z, true);
    }
  }

  reset(): void {
    this.zone = 0; this.warn = 0; this.escalated = 0;
    this.banner.classList.add('is-hidden');
  }
}
