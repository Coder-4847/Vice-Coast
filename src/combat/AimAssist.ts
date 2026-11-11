import type { Player } from '../player/Player';

export interface AssistTarget { x: number; y: number; z: number }

const wrap = (a: number): number => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/**
 * Controller / touch aim assist: while aiming down sights, the view eases toward the nearest valid target inside a
 * small cone, and snaps part of the way on the moment aiming starts. Strength 0 turns it off.
 */
export class AimAssist {
  private wasAiming = false;

  update(dt: number, player: Player, strength: number, targets: Iterable<AssistTarget>): void {
    const aiming = player.aiming;
    const started = aiming && !this.wasAiming;
    this.wasAiming = aiming;
    if (!aiming || strength <= 0) return;
    const eye = player.eyePosition;
    const cone = (strength >= 1 ? 11 : 6.5) * (Math.PI / 180);
    let best: { dy: number; dp: number; score: number } | null = null;
    for (const t of targets) {
      const dx = t.x - eye.x, dy = t.y - eye.y, dz = t.z - eye.z;
      const horiz = Math.hypot(dx, dz);
      if (horiz < 1 || horiz > 75) continue;
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(dy, horiz);
      const dyaw = wrap(yaw - player.yaw), dpitch = pitch - player.pitch;
      const ang = Math.hypot(dyaw, dpitch);
      // a wider cone up close, where a small angle is a big miss
      const allow = cone * (1 + Math.max(0, 12 - horiz) / 12);
      if (ang > allow) continue;
      const score = ang + horiz * 0.002;
      if (!best || score < best.score) best = { dy: dyaw, dp: dpitch, score };
    }
    if (!best) return;
    const k = started ? (strength >= 1 ? 0.75 : 0.45) : Math.min(1, dt * (strength >= 1 ? 7 : 3.5));
    player.yaw += best.dy * k;
    player.pitch += best.dp * k;
  }
}
