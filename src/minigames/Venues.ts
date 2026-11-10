import type { Story } from '../story/Story';
import type { Page } from '../ui/Modal';
import { barPage } from './bar';
import { casinoPage } from './casino';

interface Venue { id: string; name: string; x: number; z: number; open: (s: Story) => Page }

const VENUES: Venue[] = [
  { id: 'casino', name: 'the Lucky Seven Casino', x: 640, z: 3305, open: casinoPage },
  { id: 'bar', name: 'the Iron Hound back room', x: 3450, z: 530, open: barPage },
];

/** Places on foot where a game opens: the casino floor and the bar's back room. */
export class Venues {
  private readonly spots = new Map<string, { x: number; z: number }>();
  constructor(private readonly s: Story) {}

  private spot(v: Venue): { x: number; z: number } {
    let p = this.spots.get(v.id);
    if (!p) { p = this.s.snap(v.x, v.z, 1.4); this.spots.set(v.id, p); }
    return p;
  }

  offer(): { text: string; go: () => void } | null {
    const g = this.s.g;
    if (g.driving?.mode !== 'foot' || this.s.mission) return null;
    const pos = g.player!.pos;
    for (const v of VENUES) {
      if (Math.abs(v.x - pos.x) > 60 || Math.abs(v.z - pos.z) > 60) continue;
      const p = this.spot(v);
      if (Math.hypot(p.x - pos.x, p.z - pos.z) < 3.2) return { text: `Play at ${v.name}`, go: () => g.commerce!.open(v.open(this.s)) };
    }
    return null;
  }

  /** Where a venue is (for tests and the map). */
  where(id: string): { x: number; z: number } | null { const v = VENUES.find((q) => q.id === id); return v ? this.spot(v) : null; }
}
