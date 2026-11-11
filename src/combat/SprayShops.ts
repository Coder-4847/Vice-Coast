import type { Story } from '../story/Story';
import { money } from '../economy/Economy';
import { PAINTS } from '../economy/catalog';
import { MARKERS } from '../ui/mapData';
import { sign } from '../pastimes/Pastimes';

/** Body shops that respray a hot car while you wait. Lose the police first; they cannot spray a car they are watching. */
const SHOPS = [
  { name: 'Spray Shack · Redline', x: 812, z: 162 },
  { name: 'Spray Shack · Cinder Flats', x: 3480, z: 650 },
  { name: 'Spray Shack · Dusk Harbor', x: 560, z: 1700 },
  { name: 'Spray Shack · Costa Merida', x: 420, z: 3200 },
];
for (const s of SHOPS) MARKERS.push({ name: s.name, x: s.x, z: s.z, glyph: '✦', color: '#ff7ac8' });

export class SprayShops {
  private spots: { x: number; z: number }[] | null = null;
  private t = 0;
  private cool = 0;
  private warned = 0;

  constructor(private readonly s: Story) {
    const g = s.g;
    for (const sh of SHOPS) {
      const sp = sign(sh.name.split(' · ')[0]!, '✦', '#ff7ac8');
      sp.position.set(sh.x, g.world.heightAt(sh.x, sh.z) + 5, sh.z);
      sp.scale.multiplyScalar(1.4);
      g.world.scene.add(sp);
    }
  }

  update(dt: number): void {
    const g = this.s.g;
    this.t -= dt; this.cool -= dt; this.warned -= dt;
    if (this.t > 0) return;
    this.t = 0.25;
    const car = g.driving?.mode === 'driving' ? g.driving.vehicle : null;
    const w = g.wanted;
    if (!car || !w || w.stars === 0 || this.cool > 0 || this.s.mission) return;
    this.spots ??= SHOPS.map((sh) => this.s.snap(sh.x, sh.z, 3.2));
    const i = this.spots.findIndex((p) => Math.hypot(p.x - car.position.x, p.z - car.position.z) < 9);
    if (i < 0) return;
    if (w.seen) { if (this.warned <= 0) { g.ui.toast('The police are watching. Lose them, then come back for a respray.'); this.warned = 4; } return; }
    if (Math.abs(car.speedKmh) > 30) return;
    const price = 150 * w.stars;
    if (!g.commerce!.eco.spend(price, 'Respray')) { if (this.warned <= 0) { g.ui.toast(`A respray costs ${money(price)}.`); this.warned = 4; } return; }
    // a fresh coat in a colour the police are not looking for
    const cur = car.custom ?? g.commerce!.defaultCustomFor(car.spec.id);
    let pick = PAINTS[Math.floor(Math.random() * PAINTS.length)]!.value;
    if (pick === cur.color) pick = PAINTS[(PAINTS.findIndex((p) => p.value === pick) + 3) % PAINTS.length]!.value;
    g.vehicles?.recustom(car, { ...cur, color: pick });
    w.clear();
    this.cool = 20;
    this.s.hud.showBanner('Respray', 'New paint, new plates', `${SHOPS[i]!.name.split(' · ')[1]} · −${money(price)}`, 'good', 3);
    g.audio.sport('swish', 0.8);
  }
}
