import * as THREE from 'three';
import type { Story } from '../story/Story';
import { money } from '../economy/Economy';

/** Where you stand to shoot, and the lane the targets pop up in (the beach range by the spawn). */
export const RANGE = { x: 100, z: 0, lane: { x0: 112, x1: 144, z0: -9, z1: 9 } };
const TIME = 45;
export const RANGE_MEDALS = [{ name: 'Bronze', at: 14, pay: 150 }, { name: 'Silver', at: 24, pay: 400 }, { name: 'Gold', at: 34, pay: 900 }];

interface Target { x: number; y: number; z: number; mesh: THREE.Group; life: number; age: number; decoy: boolean; bull: boolean; dead: boolean; rangeTarget: true }

function face(decoy: boolean): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  if (decoy) {
    c.fillStyle = '#f2f4f6'; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill();
    c.fillStyle = '#2f7de0'; c.beginPath(); c.arc(64, 46, 22, 0, 7); c.fill();
    c.fillRect(30, 72, 68, 50);
    c.strokeStyle = '#2f7de0'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 59, 0, 7); c.stroke();
  } else {
    const rings = ['#f2efe6', '#1c1d20', '#f2efe6', '#d8352b', '#f2efe6', '#d8352b'];
    rings.forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(64, 64, 62 - i * 10, 0, 7); c.fill(); });
    c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(64, 64, 8, 0, 7); c.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Pop-up targets at the beach shooting range: 45 seconds, hit as many red targets as you can (bullseyes count
 * double), leave the blue civilians alone. Bronze, silver and gold pay out the first time you reach them.
 */
export class RangeChallenge {
  active = false;
  private t = 0;
  private spawnT = 0;
  private score = 0;
  private hits = 0;
  private shots0 = 0;
  private readonly targets: Target[] = [];
  private readonly geo = new THREE.CircleGeometry(0.5, 28).rotateY(-Math.PI / 2).translate(-0.03, 0, 0);
  private readonly post = new THREE.BoxGeometry(0.05, 1.0, 0.05).translate(0, -0.5, 0);
  private readonly board = new THREE.BoxGeometry(0.04, 1.12, 1.12);
  private readonly mats: THREE.MeshBasicMaterial[];
  private readonly postMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });

  constructor(private readonly s: Story) {
    this.mats = [false, true].map((d) => new THREE.MeshBasicMaterial({ map: face(d), side: THREE.DoubleSide }));
  }

  start(): void {
    const g = this.s.g;
    const w = g.weapon;
    if (w && (w.def.melee || w.def.rocket)) w.select('vc9');
    g.player?.teleport(RANGE.x, RANGE.z, -Math.PI / 2);
    this.active = true; this.t = TIME; this.spawnT = 1.2; this.score = 0; this.hits = 0;
    this.shots0 = w?.shotsFired ?? 0;
    this.s.hud.showBanner('Shooting range', 'Pop-up targets', 'Red targets score, bullseyes double. Do not shoot the blue civilians.', 'neutral', 3);
  }

  private clearTargets(): void {
    for (const tg of this.targets) this.s.g.world.scene.remove(tg.mesh);
    this.targets.length = 0;
  }

  private spawn(): void {
    const L = RANGE.lane;
    const g = this.s.g;
    const x = L.x0 + Math.random() * (L.x1 - L.x0), z = L.z0 + Math.random() * (L.z1 - L.z0);
    const y = g.world.heightAt(x, z) + 1.0 + Math.random() * 0.9;
    const decoy = Math.random() < 0.2;
    const grp = new THREE.Group();
    const disc = new THREE.Mesh(this.geo, this.mats[decoy ? 1 : 0]!);
    const post = new THREE.Mesh(this.post, this.postMat);
    post.position.y = -0.5;
    grp.add(disc, post, new THREE.Mesh(this.board, this.postMat));
    grp.position.set(x, y, z);
    grp.scale.y = 0.01;
    g.world.scene.add(grp);
    // targets get quicker as the clock runs down
    const life = 2.6 - 1.1 * (1 - this.t / TIME);
    this.targets.push({ x, y, z, mesh: grp, life, age: 0, decoy, bull: false, dead: false, rangeTarget: true });
  }

  /** Bullets against the targets (they face the firing line, down −X). */
  rayHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): { t: number; target: unknown; head: boolean } | null {
    if (!this.active || dx <= 0.01) return null;
    let best: { t: number; target: unknown; head: boolean } | null = null;
    for (const tg of this.targets) {
      if (tg.dead || tg.age < 0.15) continue;
      const t = (tg.x - ox) / dx;
      if (t <= 0 || t > max || (best && t > best.t)) continue;
      const py = oy + dy * t - tg.y, pz = oz + dz * t - tg.z;
      const r = Math.hypot(py, pz);
      if (r < 0.5) { tg.bull = r < 0.1; best = { t, target: tg, head: tg.bull }; }
    }
    return best;
  }

  /** A bullet hit a target. */
  hurt(target: unknown): boolean {
    if (!target || typeof target !== 'object' || !('rangeTarget' in target)) return false;
    const tg = target as Target;
    if (tg.dead) return true;
    tg.dead = true; tg.life = Math.min(tg.life, tg.age + 0.25);
    const g = this.s.g;
    if (tg.decoy) { this.score = Math.max(0, this.score - 3); g.ui.toast('Civilian! −3'); g.audio.sport('groan', 0.8); }
    else { this.score += tg.bull ? 2 : 1; this.hits++; g.audio.sport(tg.bull ? 'rim' : 'snap', 1, new THREE.Vector3(tg.x, tg.y, tg.z)); }
    return true;
  }

  update(dt: number): void {
    if (!this.active) return;
    const s = this.s, g = s.g;
    const p = g.player?.pos;
    const away = !p || Math.hypot(p.x - RANGE.x, p.z - RANGE.z) > 30 || !!s.mission || g.driving?.mode !== 'foot' || (g.wanted?.stars ?? 0) > 0;
    this.t -= dt;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.t > 1) { this.spawn(); this.spawnT = 0.55 + Math.random() * 0.6 - 0.25 * (1 - this.t / TIME); }
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const tg = this.targets[i]!;
      tg.age += dt;
      const up = Math.min(1, tg.age / 0.15), down = Math.min(1, Math.max(0, (tg.life - tg.age) / 0.15));
      tg.mesh.scale.y = Math.max(0.01, Math.min(up, down));
      if (tg.dead) tg.mesh.rotation.z = Math.min(1.4, (tg.age - (tg.life - 0.25)) * 6);
      if (tg.age >= tg.life) { g.world.scene.remove(tg.mesh); this.targets.splice(i, 1); }
    }
    const fired = (g.weapon?.shotsFired ?? 0) - this.shots0;
    s.hud.setObjective('Shooting range', `Score ${this.score}`, `${Math.ceil(Math.max(0, this.t))} s · ${this.hits} hits · ${fired} shots · next medal ${RANGE_MEDALS.find((m) => m.at > this.score)?.at ?? '—'}`);
    if (away) { this.finish(true); return; }
    if (this.t <= 0) this.finish(false);
  }

  private finish(quit: boolean): void {
    const s = this.s, g = s.g;
    this.active = false;
    this.clearTargets();
    s.hud.setObjective(null, null);
    if (quit) { g.ui.toast('Range challenge abandoned.'); return; }
    const rec = (s.st.acts['sport.range'] ??= { plays: 0, wins: 0, best: 0, ext: {} });
    rec.plays++;
    const medal = [...RANGE_MEDALS].reverse().find((m) => this.score >= m.at);
    const prevBest = rec.best;
    rec.best = Math.max(rec.best, this.score);
    // each medal pays once, the first time you reach it
    let pay = 0;
    for (const m of RANGE_MEDALS) if (this.score >= m.at && prevBest < m.at) pay += m.pay;
    if (pay > 0) g.commerce?.eco.earn(pay, 'Range medal');
    if (medal) s.actWin('sport.range', 1);
    s.hud.showBanner('Shooting range', medal ? `${medal.name.toUpperCase()} MEDAL` : 'NO MEDAL', `Score ${this.score} · best ${rec.best}${pay ? ` · +${money(pay)}` : ''}`, medal ? 'good' : 'neutral', 4);
  }
}
