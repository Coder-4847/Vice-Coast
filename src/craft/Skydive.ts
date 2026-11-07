import * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import type { CraftEngine } from '../audio/AudioEngine';
import { clamp, damp } from '../core/math';
import type { InputManager } from '../input/InputManager';
import type { Player } from '../player/Player';
import type { Driving } from '../vehicles/Driving';
import { terrainHeight, waterLevelAt } from '../world/Terrain';
import type { Piloting } from './Piloting';

const TERMINAL = 52;
const DEPLOY_TIME = 0.9;
const AUTO_DEPLOY_AGL = 38;
const CHUTE_DESCENT = 5.6;

const PANELS = [0xe9e4d6, 0xc9503a, 0xe9e4d6, 0x2f6bb8, 0xe9e4d6, 0xc9503a, 0xe9e4d6, 0x2f6bb8, 0xe9e4d6, 0xc9503a, 0xe9e4d6, 0x2f6bb8];

const canopyGeometry = (): THREE.BufferGeometry => {
  const seg = PANELS.length;
  const g = new THREE.SphereGeometry(1, seg * 2, 7, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(3.6, 1.55, 3.6);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    const idx = Math.floor(((a / (Math.PI * 2) + 1) % 1) * seg) % seg;
    c.setHex(PANELS[idx]!);
    // darker toward the rim so it reads as a curved sheet
    const k = 0.78 + 0.22 * (pos.getY(i) / 1.55);
    col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};

type Mode = 'off' | 'free' | 'chute';

/**
 * Skydiving: jump from a plane / helicopter / cliff and fall at terminal velocity, steer in the air, and open a parachute
 * (Space, or automatically near the ground) to float down and land safely.
 */
export class Skydive {
  mode: Mode = 'off';
  agl = 0;
  readonly group = new THREE.Group();
  private readonly canopy: THREE.Mesh;
  private readonly lines: THREE.LineSegments;
  private readonly hud: HTMLElement;
  private readonly hudAlt: HTMLElement;
  private readonly hudSpd: HTMLElement;
  private readonly hudKey: HTMLElement;
  private wind: CraftEngine | null = null;
  private t = 0;
  private open = 0;
  private cooldown = 0;

  constructor(private readonly d: { input: InputManager; player: Player; driving: Driving; piloting: Piloting; audio: AudioEngine; hudRoot: HTMLElement; material: THREE.Material; toast(m: string): void }) {
    this.canopy = new THREE.Mesh(canopyGeometry(), d.material);
    this.canopy.castShadow = false;
    const pts: number[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      pts.push(Math.cos(a) * 3.5, 0.15, Math.sin(a) * 3.5, 0, -3.3, 0);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2a2d33 }));
    this.group.add(this.canopy, this.lines);
    this.group.visible = false;
    this.group.frustumCulled = false;
    this.canopy.frustumCulled = false;
    this.lines.frustumCulled = false;

    this.hud = document.createElement('div');
    this.hud.className = 'dive-hud is-hidden';
    this.hud.innerHTML = '<div><b class="dv-alt">0</b>m</div><div><b class="dv-spd">0</b>km/h</div><div class="dv-key"></div>';
    d.hudRoot.appendChild(this.hud);
    this.hudAlt = this.hud.querySelector('.dv-alt')!;
    this.hudSpd = this.hud.querySelector('.dv-spd')!;
    this.hudKey = this.hud.querySelector('.dv-key')!;
  }

  get active(): boolean {
    return this.mode !== 'off';
  }

  private end(): void {
    this.mode = 'off';
    this.d.player.externalFlight = false;
    this.group.visible = false;
    this.hud.classList.add('is-hidden');
    this.wind?.dispose();
    this.wind = null;
  }

  private begin(): void {
    this.mode = 'free';
    this.d.player.externalFlight = true;
    this.t = 0;
    this.open = 0;
    this.hud.classList.remove('is-hidden');
    this.wind?.dispose();
    this.wind = this.d.audio.createCraftEngine('wind');
    this.d.toast('Free-fall — Space to open the parachute');
  }

  private deploy(auto: boolean): void {
    if (this.mode !== 'free') return;
    this.mode = 'chute';
    this.t = 0;
    this.open = 0;
    this.group.visible = true;
    this.d.audio.mech('cloth');
    if (auto) this.d.toast('Parachute auto-deployed');
  }

  /** Before the player's own fixed step: shape its velocity. */
  fixedUpdate(dt: number): void {
    const { player: p, input, driving, piloting } = this.d;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const blocked = piloting.busy || driving.mode !== 'foot' || p.noclip || p.frozen || !!p.mantle;
    const gnd = Math.max(terrainHeight(p.pos.x, p.pos.z), waterLevelAt(p.pos.x, p.pos.z));
    this.agl = p.pos.y - gnd;
    if (blocked) { if (this.mode !== 'off') this.end(); return; }
    if (this.mode === 'off') {
      if (this.cooldown <= 0 && p.state === 'air' && !p.grounded && p.vel.y < -13 && this.agl > 34) this.begin();
      return;
    }
    if (p.state === 'ground' || p.state === 'swim' || p.grounded || (this.agl < 0.6 && p.vel.y > -1)) {
      this.cooldown = 1.2;
      this.end();
      return;
    }
    this.t += dt;
    const yaw = p.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const mx = input.move.x, my = input.move.y;
    if (this.mode === 'free') {
      p.vel.y -= 16 * dt;
      p.vel.y = Math.max(p.vel.y, -TERMINAL);
      // delta-wing dive: forward leans into a fast glide, back arches the body to slow the fall
      p.vel.y = Math.max(p.vel.y, -TERMINAL * (1 - 0.18 * Math.max(0, -my)));
      const tx = fx * my * 16 + rx * mx * 11;
      const tz = fz * my * 16 + rz * mx * 11;
      p.vel.x = damp(p.vel.x, tx, 0.9, dt);
      p.vel.z = damp(p.vel.z, tz, 0.9, dt);
      if (input.pressed('jump') && this.t > 0.5) this.deploy(false);
      else if (this.agl < AUTO_DEPLOY_AGL) this.deploy(true);
    } else {
      this.open = clamp(this.t / DEPLOY_TIME, 0, 1);
      // opening shock decelerates quickly, then a steady float
      const sink = CHUTE_DESCENT * (my > 0.3 ? 1.25 : my < -0.3 ? 0.7 : 1);
      const k = this.open < 1 ? 1.4 + this.open * 3 : 4;
      p.vel.y = damp(p.vel.y, -sink, k, dt);
      const spd = 6 + Math.max(0, my) * 5;
      const tx = fx * my * spd + rx * mx * 5 + fx * 2.2;
      const tz = fz * my * spd + rz * mx * 5 + fz * 2.2;
      p.vel.x = damp(p.vel.x, tx, 1.5, dt);
      p.vel.z = damp(p.vel.z, tz, 1.5, dt);
    }
  }

  /** Per rendered frame. */
  update(dt: number, camera: THREE.Camera): void {
    if (this.mode === 'off') return;
    const p = this.d.player;
    const x = camera.position.x, y = camera.position.y - 1.7, z = camera.position.z;
    if (this.mode === 'chute') {
      const e = this.open < 1 ? 1 - Math.pow(1 - this.open, 3) : 1;
      const s = 0.12 + 0.88 * e;
      this.group.position.set(x, y + 0.2 + 3.7 * s, z);
      this.group.rotation.y = p.yaw;
      this.canopy.scale.set(s, 0.55 + 0.45 * e, s);
      this.lines.scale.set(s, 1.15 - 0.15 * e, s);
      this.group.rotation.z = -this.d.input.move.x * 0.1;
      this.group.rotation.x = -this.d.input.move.y * 0.08;
    }
    const kmh = Math.round(Math.hypot(p.vel.x, p.vel.y, p.vel.z) * 3.6);
    this.hudAlt.textContent = String(Math.max(0, Math.round(this.agl)));
    this.hudSpd.textContent = String(kmh);
    this.hudKey.textContent = this.mode === 'free' ? 'SPACE · PARACHUTE' : this.open < 1 ? 'OPENING…' : 'W/S speed · A/D steer';
    this.hudKey.style.animation = this.mode === 'free' ? '' : 'none';
    this.wind?.update(1, 0, Math.min(1, Math.hypot(p.vel.x, p.vel.y, p.vel.z) / 60));
    void dt;
  }
}
