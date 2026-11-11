import * as THREE from 'three';
import { h } from './dom';

const LABEL = { gunshot: 'Gunshot', explosion: 'Explosion', horn: 'Horn', scream: 'Scream' } as const;
const COLOR = { gunshot: '#ff5a4a', explosion: '#ffb347', horn: '#8fd3ff', scream: '#ffd166' } as const;
type Kind = keyof typeof LABEL;

const _v = new THREE.Vector3();

/** Accessibility: arrows around the crosshair pointing at loud sounds (gunshots, explosions, horns, screams). */
export class SoundCues {
  private readonly root: HTMLElement;
  private readonly live: { el: HTMLElement; t: number; kind: Kind; x: number; y: number; z: number }[] = [];

  constructor(hud: HTMLElement, private readonly camera: THREE.Camera) {
    this.root = h('div', 'sound-cues');
    this.root.setAttribute('aria-hidden', 'true');
    hud.append(this.root);
  }

  cue(kind: Kind, pos: { x: number; y: number; z: number }): void {
    const cam = this.camera.position;
    const d = Math.hypot(pos.x - cam.x, pos.z - cam.z);
    if (d < 2.5 || d > 140) return;
    // one arrow per kind and direction: refresh an existing one nearby instead of stacking
    for (const c of this.live) if (c.kind === kind && Math.hypot(c.x - pos.x, c.z - pos.z) < 12) { c.t = 0; c.x = pos.x; c.z = pos.z; return; }
    if (this.live.length >= 8) this.live.shift()!.el.remove();
    const el = h('div', 'sc-cue', h('i', ''), h('span', '', LABEL[kind]));
    el.style.setProperty('--c', COLOR[kind]);
    el.style.setProperty('--s', String(d < 30 ? 1 : d < 70 ? 0.8 : 0.62));
    this.root.append(el);
    this.live.push({ el, t: 0, kind, x: pos.x, y: pos.y, z: pos.z });
  }

  update(dt: number, enabled: boolean): void {
    if (!enabled) { if (this.live.length) { for (const c of this.live) c.el.remove(); this.live.length = 0; } return; }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const c = this.live[i]!;
      c.t += dt;
      if (c.t > 1.8) { c.el.remove(); this.live.splice(i, 1); continue; }
      _v.set(c.x, c.y, c.z).applyMatrix4(this.camera.matrixWorldInverse);
      const ang = Math.atan2(_v.x, -_v.z);
      c.el.style.transform = `rotate(${ang}rad)`;
      c.el.style.opacity = String(Math.min(1, (1.8 - c.t) * 2));
    }
  }
}
