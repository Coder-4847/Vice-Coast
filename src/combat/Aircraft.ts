import * as THREE from 'three';
import type { AirVoice, AudioEngine } from '../audio/AudioEngine';
import { terrainHeight } from '../world/Terrain';

export type HeliKind = 'police' | 'gunship' | 'attack';

const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};

/** A helicopter model built from boxes: fuselage, cockpit, tail boom, skids, spinning main and tail rotors. */
class HeliModel {
  readonly group = new THREE.Group();
  readonly mats: THREE.MeshStandardMaterial[] = [];
  private readonly main = new THREE.Group();
  private readonly tail = new THREE.Group();

  constructor(kind: HeliKind) {
    const body = new THREE.MeshStandardMaterial({ color: kind === 'police' ? 0x1b2a4a : kind === 'gunship' ? 0x16181b : 0x4a5238, roughness: 0.5, metalness: 0.4 });
    const accent = new THREE.MeshStandardMaterial({ color: kind === 'police' ? 0xe8e8e8 : 0x23262b, roughness: 0.5, metalness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0c1218, roughness: 0.1, metalness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.7 });
    this.mats.push(body, accent, glass, dark);
    const g = this.group;
    g.add(box(1.9, 1.8, 4.6, 0, 0, 0, body));
    g.add(box(1.6, 1.0, 1.7, 0, 0.2, 2.6, glass));
    g.add(box(1.6, 0.35, 2.5, 0, 0.78, -0.2, accent));
    g.add(box(0.5, 0.5, 5.4, 0, 0.35, -4.4, body));
    g.add(box(0.14, 1.4, 1.0, 0, 1.0, -6.7, accent));
    for (const s of [-1, 1]) {
      g.add(box(0.12, 0.12, 4.0, s * 1.05, -1.25, 0.3, dark));
      g.add(box(0.1, 0.5, 0.1, s * 1.0, -0.95, 1.2, dark));
      g.add(box(0.1, 0.5, 0.1, s * 1.0, -0.95, -0.7, dark));
    }
    if (kind !== 'police') {
      for (const s of [-1, 1]) g.add(box(0.3, 0.3, 1.8, s * 1.35, -0.3, 0.6, dark));
    }
    // rotors
    g.add(box(0.25, 0.5, 0.25, 0, 1.15, 0, dark));
    this.main.position.y = 1.45;
    this.main.add(box(9.6, 0.05, 0.28, 0, 0, 0, dark), box(0.28, 0.05, 9.6, 0, 0, 0, dark));
    g.add(this.main);
    this.tail.position.set(0.15, 1.0, -6.7);
    this.tail.add(box(0.05, 1.8, 0.2, 0, 0, 0, dark));
    g.add(this.tail);
  }

  spin(a: number): void {
    this.main.rotation.y = a;
    this.tail.rotation.x = a * 2;
  }
}

/**
 * A police / federal / military helicopter. It orbits the target at a set radius and altitude, banks into the turn, and
 * (police only) sweeps a searchlight onto the target. Shooting and missiles are driven by the police director.
 */
export class Heli {
  readonly group = new THREE.Group();
  readonly kind: HeliKind;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  hp: number;
  fireT = 2;
  burstLeft = 0;
  active = true;
  private readonly model: HeliModel;
  private readonly light: THREE.Mesh;
  private readonly pool: THREE.Mesh;
  private readonly lightMat: THREE.MeshBasicMaterial;
  private angle: number;
  private rotor = 0;
  private voice: AirVoice | null = null;
  readonly orbit: { r: number; alt: number; speed: number };
  /** World point the searchlight lands on. */
  readonly spot = new THREE.Vector3();

  constructor(kind: HeliKind, x: number, z: number, audio: AudioEngine) {
    this.kind = kind;
    this.hp = kind === 'police' ? 200 : kind === 'gunship' ? 320 : 460;
    this.model = new HeliModel(kind);
    this.group.add(this.model.group);
    this.angle = Math.random() * 6.28;
    this.orbit = { r: kind === 'police' ? 105 : 85, alt: kind === 'police' ? 85 : 70, speed: kind === 'police' ? 26 : 34 };
    this.pos.set(x, 110, z);
    this.lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.96, 0.82), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    this.light = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 9, 1, 18, 1, true), this.lightMat);
    this.light.frustumCulled = false;
    this.light.visible = kind === 'police' || kind === 'gunship';
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(9, 24).rotateX(-Math.PI / 2), this.lightMat);
    this.pool.frustumCulled = false;
    this.pool.renderOrder = 6;
    this.light.renderOrder = 6;
    this.group.add(this.light);
    this.voice = audio.createAirVoice(0);
  }

  get materials(): THREE.Material[] {
    return [...this.model.mats];
  }

  /** Extra objects that live in world space (light pool). */
  get worldObjects(): THREE.Object3D[] {
    return [this.pool];
  }

  update(dt: number, tx: number, tz: number, night: number, listener: THREE.Vector3): void {
    if (!this.active) {
      // stood down: climb away
      this.vel.y = Math.min(32, this.vel.y + dt * 12);
      this.vel.x += (Math.cos(this.angle) * 24 - this.vel.x) * Math.min(1, dt * 0.5);
      this.vel.z += (Math.sin(this.angle) * 24 - this.vel.z) * Math.min(1, dt * 0.5);
      this.pos.addScaledVector(this.vel, dt);
      this.group.position.copy(this.pos);
      this.rotor += dt * 40;
      this.model.spin(this.rotor);
      this.lightMat.opacity = 0;
      this.pool.visible = false;
      this.voice?.update(this.pos.x, this.pos.y, this.pos.z, 1, 0);
      return;
    }
    this.angle += (dt * this.orbit.speed) / this.orbit.r;
    const gx = tx + Math.cos(this.angle) * this.orbit.r, gz = tz + Math.sin(this.angle) * this.orbit.r;
    const ground = Math.max(terrainHeight(tx, tz), 4.5);
    const gy = ground + this.orbit.alt;
    // steer towards the orbit point
    const dx = gx - this.pos.x, dy = gy - this.pos.y, dz = gz - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const want = Math.min(this.orbit.speed * 1.6, d * 0.6 + 4);
    this.vel.x += ((dx / d) * want - this.vel.x) * Math.min(1, dt * 0.9);
    this.vel.z += ((dz / d) * want - this.vel.z) * Math.min(1, dt * 0.9);
    this.vel.y += (dy * 0.5 - this.vel.y) * Math.min(1, dt * 1.2);
    this.pos.addScaledVector(this.vel, dt);
    // nose towards the target, banked into the orbit
    const face = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    let dyaw = face - this.yaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    this.yaw += dyaw * Math.min(1, dt * 1.6);
    this.group.position.copy(this.pos);
    this.group.rotation.set(0.1, this.yaw, -0.18, 'YXZ');
    this.rotor += dt * 40;
    this.model.spin(this.rotor);

    // searchlight
    this.spot.set(tx, ground + 0.15, tz);
    const night01 = Math.min(1, night * 1.6);
    if (this.light.visible) {
      const from = this.pos;
      const dir = new THREE.Vector3().subVectors(this.spot, from);
      const len = dir.length();
      this.light.position.copy(from).addScaledVector(dir, 0.5).sub(this.group.position);
      // the cone lives in the heli's local space: undo the group rotation
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
      const gq = new THREE.Quaternion().setFromEuler(this.group.rotation).invert();
      this.light.quaternion.copy(gq.multiply(q));
      this.light.scale.set(1, len, 1);
      this.light.position.applyQuaternion(new THREE.Quaternion().setFromEuler(this.group.rotation).invert());
      this.lightMat.opacity = 0.035 + 0.1 * night01;
      this.pool.position.copy(this.spot);
      this.pool.visible = true;
    }
    const rad = (this.vel.x * (this.pos.x - listener.x) + this.vel.z * (this.pos.z - listener.z)) / (Math.hypot(this.pos.x - listener.x, this.pos.z - listener.z) || 1);
    this.voice?.update(this.pos.x, this.pos.y, this.pos.z, this.active ? 1 : 0, rad);
  }

  dispose(): void {
    this.voice?.dispose();
    this.voice = null;
  }
}

/** A fast low-flying jet: straight pass over the target. */
export class Jet {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly dir = new THREE.Vector3();
  readonly speed = 210;
  t = 0;
  fired = false;
  active = true;
  private voice: AirVoice | null;
  readonly mats: THREE.Material[] = [];

  constructor(fromX: number, fromZ: number, toX: number, toZ: number, alt: number, audio: AudioEngine) {
    const body = new THREE.MeshStandardMaterial({ color: 0x6b727a, roughness: 0.4, metalness: 0.6 });
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.1, 0.4), fog: false });
    this.mats.push(body);
    const g = this.group;
    g.add(box(1.3, 1.1, 14, 0, 0, 0, body));
    g.add(box(11, 0.14, 3.6, 0, -0.1, -2.2, body));
    g.add(box(4.2, 0.12, 1.8, 0, 0, -6.4, body));
    for (const s of [-1, 1]) g.add(box(0.14, 1.6, 1.6, s * 0.7, 0.9, -6.2, body));
    const flame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 2.4), glow);
    flame.position.set(0, 0, -8.2);
    g.add(flame);
    this.pos.set(fromX, alt, fromZ);
    this.dir.set(toX - fromX, 0, toZ - fromZ).normalize();
    this.group.position.copy(this.pos);
    this.group.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    this.voice = audio.createAirVoice(1);
  }

  update(dt: number, listener: THREE.Vector3): void {
    this.t += dt;
    this.pos.addScaledVector(this.dir, this.speed * dt);
    this.group.position.copy(this.pos);
    const d = Math.hypot(this.pos.x - listener.x, this.pos.z - listener.z);
    const rad = this.speed * ((this.pos.x - listener.x) * this.dir.x + (this.pos.z - listener.z) * this.dir.z) / (d || 1);
    this.voice?.update(this.pos.x, this.pos.y, this.pos.z, 1, rad);
    if (this.t > 14) this.active = false;
  }

  dispose(): void {
    this.voice?.dispose();
    this.voice = null;
  }
}
