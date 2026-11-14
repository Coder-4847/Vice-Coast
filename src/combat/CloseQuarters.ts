import * as THREE from 'three';
import type { Game } from '../Game';
import type { Ped } from '../npc/Pedestrians';
import { GROUP } from '../physics/Physics';

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();

/**
 * Cover and stealth.
 *
 * - **Cover** (Q, controller B): press near a wall, a car or a crate and you press up against it. Behind something low you
 *   stay crouched until you aim, then pop up over it; behind something tall you hug it. Press again, sprint, or walk away
 *   to leave. On a controller, holding B eats a snack instead.
 * - **Takedowns**: sneak up behind a guard who has not noticed you and press E to put them down without a sound.
 */
export class CloseQuarters {
  inCover = false;
  private low = false;
  private nx = 0;
  private nz = 0;
  /** "Takedown" while a guard's back is in reach. */
  prompt: string | null = null;
  private target: Ped | null = null;
  private strike: { p: Ped; t: number } | null = null;
  private padHold = 0;
  stats = { covers: 0, takedowns: 0 };

  constructor(private readonly g: Game) {}

  update(dt: number): void {
    const g = this.g, pl = g.player, inp = g.input;
    if (!pl || g.state !== 'playing') return;
    const onFoot = g.driving?.mode === 'foot' && !g.piloting?.busy && pl.state === 'ground';
    if (!onFoot && this.inCover) this.leave();

    // ---- the cover button: a tap toggles cover; on a controller a long hold eats a snack
    const pad = inp.activeDevice === 'gamepad';
    let toggle = false;
    if (pad) {
      if (inp.down('cover')) {
        this.padHold += dt;
        if (this.padHold > 0.45 && this.padHold - dt <= 0.45) g.snacks.eat();
      } else {
        if (this.padHold > 0 && this.padHold <= 0.45) toggle = true;
        this.padHold = 0;
      }
    } else toggle = inp.pressed('cover');
    if (toggle && onFoot) { if (this.inCover) this.leave(); else this.enter(); }

    if (this.inCover) {
      // still against it? (walked away, or the car drove off)
      _o.set(pl.pos.x, pl.pos.y + 0.6, pl.pos.z);
      _d.set(-this.nx, 0, -this.nz);
      const still = g.physics?.raycast(_o, _d, 0.95, pl.collider, GROUP.WORLD | GROUP.PROP | GROUP.VEHICLE);
      if (!still || pl.sprinting) this.leave();
      // behind something low: crouched, except while aiming over it
      pl.forceCrouch = this.low && !pl.aiming;
    }

    this.takedowns(dt);
  }

  private enter(): void {
    const g = this.g, pl = g.player!;
    const yaw = pl.yaw;
    let best: { d: number; nx: number; nz: number; px: number; pz: number } | null = null;
    // look ahead first, then a little either side, then all around
    for (const off of [0, 0.5, -0.5, 1.0, -1.0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const a = yaw + off;
      _d.set(-Math.sin(a), 0, -Math.cos(a));
      _o.set(pl.pos.x, pl.pos.y + 0.6, pl.pos.z);
      const hit = g.physics?.raycast(_o, _d, 1.8, pl.collider, GROUP.WORLD | GROUP.PROP | GROUP.VEHICLE);
      if (!hit) continue;
      const n = new THREE.Vector3(hit.normal.x, 0, hit.normal.z);
      if (n.lengthSq() < 0.3) continue;
      n.normalize();
      if (!best || hit.distance < best.d) best = { d: hit.distance, nx: n.x, nz: n.z, px: hit.point.x, pz: hit.point.z };
      if (off === 0) break;
    }
    if (!best) { g.ui.toast('Nothing to take cover behind here.'); return; }
    // tall or low? another ray at head height decides
    _o.set(pl.pos.x, pl.pos.y + 1.45, pl.pos.z);
    _d.set(-best.nx, 0, -best.nz);
    const high = g.physics?.raycast(_o, _d, best.d + 0.4, pl.collider, GROUP.WORLD | GROUP.PROP | GROUP.VEHICLE);
    this.low = !high;
    this.nx = best.nx; this.nz = best.nz;
    this.inCover = true;
    pl.cover = { nx: this.nx, nz: this.nz };
    // press up against it, facing out over it
    pl.teleport(best.px + best.nx * 0.42, best.pz + best.nz * 0.42, Math.atan2(best.nx, best.nz) + Math.PI);
    g.audio.mech('cloth');
    this.stats.covers++;
    g.story?.hud.showTip(this.low ? 'In cover. Aim to pop up and shoot; Q to leave.' : 'In cover against a wall. Step out to shoot; Q to leave.', 3);
  }

  private leave(): void {
    const pl = this.g.player;
    this.inCover = false;
    if (pl) { pl.forceCrouch = false; pl.cover = null; }
  }

  // ------------------------------------------------------------------------------------------------ stealth takedowns

  private takedowns(dt: number): void {
    const g = this.g, pl = g.player!;
    this.prompt = null;
    this.target = null;
    if (this.strike) {
      this.strike.t -= dt;
      if (this.strike.t <= 0) {
        const p = this.strike.p;
        this.strike = null;
        // silent: straight to the ground, nobody hears it
        if (p.active && p.state !== 'down') { g.npcs?.peds.knockDown(p, -Math.sin(pl.yaw) * 2, -Math.cos(pl.yaw) * 2, 999, true, false); p.dying = 0; }
        g.audio.sport('thwack', 0.5, new THREE.Vector3(p.x, p.y + 1.2, p.z));
        g.input.rumble(0.6, 0.4, 120);
        this.stats.takedowns++;
      }
      return;
    }
    if (g.driving?.mode !== 'foot' || !g.story || g.driving.hint) return;
    const H = g.story.hostiles;
    for (const p of H.list) {
      if (!p.active || p.state === 'down' || H.awake(p)) continue;
      const dx = pl.pos.x - p.x, dz = pl.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > 1.8) continue;
      // behind them: we are on the far side of where they face
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      if ((dx * fx + dz * fz) / d > -0.25) continue;
      this.target = p;
      this.prompt = 'Takedown';
      break;
    }
    if (this.target && g.input.pressed('interact')) {
      const p = this.target;
      pl.yaw = Math.atan2(-(p.x - pl.pos.x), -(p.z - pl.pos.z));
      g.viewmodel?.play('takedown');
      this.strike = { p, t: 0.55 };
      this.prompt = null;
    }
  }
}
