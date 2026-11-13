import type { Story } from '../story/Story';
import { MARKERS } from '../ui/mapData';

/** Southside, home turf of the Southside Kings. */
export const TURF = { x: 1400, z: 480, r: 230, name: 'Southside Kings' };
MARKERS.push({ name: `${TURF.name} turf`, x: TURF.x, z: TURF.z, glyph: '♛', color: '#5ad17a' });

/**
 * Gangs on the street corners of Southside. Groups of three hang out on the sidewalks and leave you alone, unless you
 * shoot nearby, point a gun at one of them, or hurt one: then the whole block turns on you and more of them come
 * running. Leave the neighbourhood (or start a mission) and they go back to their corners.
 */
export class GangTurf {
  private t = 0;
  private war = 0;
  private reinforcements = 0;
  private warned = false;
  private aimT = 0;
  private rT = 0;

  constructor(private readonly s: Story) {}

  private inTurf(x: number, z: number, pad = 0): boolean { return Math.hypot(x - TURF.x, z - TURF.z) < TURF.r + pad; }

  private spawnGroup(px: number, pz: number): void {
    const s = this.s;
    for (let tries = 0; tries < 6; tries++) {
      const a = Math.random() * Math.PI * 2, d = 45 + Math.random() * 90;
      const cx = px + Math.cos(a) * d, cz = pz + Math.sin(a) * d;
      if (!this.inTurf(cx, cz)) continue;
      const c = s.snap(cx, cz, 1.2);
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        s.hostiles.spawn({ x: c.x + Math.cos(ang) * 1.3, z: c.z + Math.sin(ang) * 1.3, kind: Math.random() < 0.7 ? 'pistol' : 'smg', tag: 'gang', look: 'thug', hp: 70, unaware: true, neutral: true, hold: true, yaw: ang + Math.PI, power: 0.6 });
      }
      return;
    }
  }

  update(dt: number): void {
    const s = this.s, g = s.g;
    if (!g.player || s.mission || s.cutscenes.active) { this.war = 0; if (s.mission && s.hostiles.alive('gang') > 0) s.hostiles.clear('gang'); return; }
    const car = g.driving?.mode === 'driving' ? g.driving.vehicle : null;
    const p = car ? car.position : g.player.pos;
    const near = this.inTurf(p.x, p.z, 160);
    this.t -= dt;
    if (!near) {
      if (s.hostiles.alive('gang') > 0 && !this.inTurf(p.x, p.z, 300)) s.hostiles.clear('gang');
      this.war = 0; this.reinforcements = 0; this.warned = false;
      return;
    }
    if (!this.warned && this.inTurf(p.x, p.z)) {
      this.warned = true;
      s.hud.showTip(`Southside: ${TURF.name} territory. Keep your gun down and they will leave you alone.`, 6);
    }
    // keep a few groups on the corners near the player
    if (this.t <= 0) {
      this.t = 2;
      if (this.war <= 0 && s.hostiles.alive('gang') < 9) this.spawnGroup(p.x, p.z);
    }
    // pointing a gun at them (on foot, aiming, close, roughly at one of them) starts a fight
    if (this.war <= 0 && !car && g.player.aiming && g.weapon?.isDrawn) {
      this.aimT += dt;
      if (this.aimT > 0.6 && s.hostiles.alive('gang') > 0) {
        const yaw = g.player.yaw;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        for (const q of g.npcs?.peds.peds ?? []) {
          if (!q.active || q.role !== 'thug' || q.state === 'down') continue;
          const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
          if (d < 24 && (dx * fx + dz * fz) / Math.max(1, d) > 0.94) { this.startWar('You pulled a gun on the Kings.'); break; }
        }
      }
    } else this.aimT = 0;
    // a shot, a hit or a rammed member wakes them: that is a war too
    if (this.war <= 0) {
      for (const q of g.npcs?.peds.peds ?? []) {
        if (q.active && q.role === 'thug' && s.hostiles.awake(q) && this.inTurf(q.x, q.z, 40)) { this.startWar('The Kings are coming for you.'); break; }
      }
    }
    if (this.war > 0) {
      this.war -= dt;
      this.rT -= dt;
      // reinforcements run in while the fight lasts
      if (this.rT <= 0 && this.reinforcements < 8 && s.hostiles.alive('gang') < 7) {
        this.reinforcements++;
        this.rT = 4;
        const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 30;
        const c = s.snap(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 1.2);
        s.hostiles.spawn({ x: c.x, z: c.z, kind: Math.random() < 0.5 ? 'smg' : 'pistol', tag: 'gang', look: 'thug', hp: 70, power: 0.65 });
      }
      if (this.war <= 0) { this.reinforcements = 0; }
    }
  }

  private startWar(why: string): void {
    const s = this.s;
    this.war = 45;
    s.hostiles.alertAll('gang');
    s.hud.showBanner('Gang war', TURF.name.toUpperCase(), why, 'bad', 2.6);
  }
}
