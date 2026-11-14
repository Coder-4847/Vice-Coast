import * as THREE from 'three';
import type { Game } from '../Game';
import { GROUP } from '../physics/Physics';
import { terrainHeight } from '../world/Terrain';
import type { Collider } from '@dimforge/rapier3d-compat';
import type { Vehicle } from '../vehicles/Vehicle';

interface Rocket { pos: THREE.Vector3; vel: THREE.Vector3; mesh: THREE.Group; life: number; smokeT: number; exclude?: Collider }
interface Beam { mesh: THREE.Mesh; life: number }
interface Thrown { kind: 'frag' | 'fire' | 'sticky'; pos: THREE.Vector3; vel: THREE.Vector3; mesh: THREE.Mesh; fuse: number; stuck: boolean; on: Vehicle | null; local: THREE.Vector3; bounces: number }
interface Fire { pos: THREE.Vector3; t: number; r: number; flames: THREE.Mesh[]; tickT: number; smokeT: number }

const _d = new THREE.Vector3();
const _n = new THREE.Vector3();

/**
 * Rockets from the RPG (a slow projectile with a smoke trail that explodes on contact) and the laser rifle's beam.
 */
export class Ordnance {
  private readonly rockets: Rocket[] = [];
  private readonly beams: Beam[] = [];
  private readonly beamMat = new THREE.MeshBasicMaterial({ color: 0xff3a6a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  private readonly coreMat = new THREE.MeshBasicMaterial({ color: 0xffe0ea, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  private readonly beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  private readonly bodyMat = new THREE.MeshStandardMaterial({ color: 0x4f5a3a, roughness: 0.6 });
  private readonly flameMat = new THREE.MeshBasicMaterial({ color: 0xffb040, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  private readonly bodyGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.6, 10).rotateX(Math.PI / 2);
  private readonly tipGeo = new THREE.ConeGeometry(0.05, 0.2, 10).rotateX(-Math.PI / 2);
  private readonly flameGeo = new THREE.ConeGeometry(0.06, 0.5, 8).rotateX(Math.PI / 2);

  private readonly thrown: Thrown[] = [];
  private readonly fires: Fire[] = [];
  private readonly throwGeo = {
    frag: new THREE.SphereGeometry(0.045, 10, 8).scale(1, 1.25, 1),
    fire: new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10),
    sticky: new THREE.BoxGeometry(0.08, 0.04, 0.11),
  };
  private readonly throwMat = {
    frag: new THREE.MeshStandardMaterial({ color: 0x4a5238, roughness: 0.6 }),
    fire: new THREE.MeshStandardMaterial({ color: 0x2f6a3a, roughness: 0.1, emissive: 0x401800 }),
    sticky: new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 0.85, emissive: 0x300000 }),
  };
  private readonly fireGeo = new THREE.ConeGeometry(0.45, 1.6, 7, 1, true).translate(0, 0.8, 0);
  private readonly fireMats = [0xff9a2a, 0xffc040, 0xff6a1a].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));

  constructor(private readonly g: Game) {}

  /** A grenade, molotov or sticky charge leaves the hand. */
  toss(kind: Thrown['kind'], from: THREE.Vector3, vel: THREE.Vector3): void {
    const mesh = new THREE.Mesh(this.throwGeo[kind], this.throwMat[kind]);
    mesh.position.copy(from);
    this.g.world.scene.add(mesh);
    this.thrown.push({ kind, pos: from.clone(), vel: vel.clone(), mesh, fuse: kind === 'frag' ? 2.8 : 30, stuck: false, on: null, local: new THREE.Vector3(), bounces: 0 });
  }

  /** Set off every sticky charge that has landed. */
  detonate(): void {
    let any = false;
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const t = this.thrown[i]!;
      if (t.kind !== 'sticky' || !t.stuck) continue;
      any = true;
      this.g.combat?.boom(t.pos.x, t.pos.y, t.pos.z, 8, 350, true);
      this.g.npcs?.alarm(t.pos.x, t.pos.z);
      this.remove(i);
    }
    if (any) this.g.audio.mech('rack');
  }

  /** How many sticky charges are waiting (HUD hint). */
  get stickies(): number { return this.thrown.filter((t) => t.kind === 'sticky' && t.stuck).length; }

  private remove(i: number): void {
    this.g.world.scene.remove(this.thrown[i]!.mesh);
    this.thrown.splice(i, 1);
  }

  /** A sheet of burning fuel: hurts anyone standing in it and sets cars alight. */
  private ignite(p: THREE.Vector3): void {
    const flames: THREE.Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(this.fireGeo, this.fireMats[i % 3]);
      const a = Math.random() * Math.PI * 2, d = Math.random() * 2.2;
      m.position.set(p.x + Math.cos(a) * d, terrainHeight(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d), p.z + Math.sin(a) * d);
      m.position.y = Math.max(m.position.y, p.y - 0.2);
      m.frustumCulled = false;
      this.g.world.scene.add(m);
      flames.push(m);
    }
    this.fires.push({ pos: p.clone(), t: 8, r: 3.2, flames, tickT: 0, smokeT: 0 });
    this.g.audio.sport('snap', 1.2, p);
    this.g.npcs?.alarm(p.x, p.z);
  }

  /** Launch a rocket from `from` along `dir` (normalised). */
  rocket(from: THREE.Vector3, dir: THREE.Vector3, speed = 62, exclude?: Collider): void {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    const tip = new THREE.Mesh(this.tipGeo, this.bodyMat);
    tip.position.z = -0.4;
    const flame = new THREE.Mesh(this.flameGeo, this.flameMat);
    flame.position.z = 0.55;
    grp.add(body, tip, flame);
    grp.position.copy(from);
    grp.lookAt(_d.copy(from).add(dir));
    grp.rotateY(Math.PI);
    this.g.world.scene.add(grp);
    this.rockets.push({ pos: from.clone(), vel: dir.clone().multiplyScalar(speed), mesh: grp, life: 6, smokeT: 0, exclude });
    this.g.audio.sport('thwack', 1.2, from);
  }

  /** Draw a laser beam from muzzle to the hit point. */
  beam(from: THREE.Vector3, to: THREE.Vector3): void {
    _d.subVectors(to, from);
    const len = _d.length();
    if (len < 0.3) return;
    const outer = new THREE.Mesh(this.beamGeo, this.beamMat);
    const core = new THREE.Mesh(this.beamGeo, this.coreMat);
    for (const [m, r] of [[outer, 0.035], [core, 0.012]] as const) {
      m.position.copy(from);
      m.lookAt(to);
      m.scale.set(r, r, len);
      m.frustumCulled = false;
      this.g.world.scene.add(m);
    }
    this.beams.push({ mesh: outer, life: 0.09 }, { mesh: core, life: 0.07 });
  }

  update(dt: number): void {
    const g = this.g;
    this.updateThrown(dt);
    this.updateFires(dt);
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i]!;
      b.life -= dt;
      b.mesh.scale.x *= 0.9; b.mesh.scale.y *= 0.9;
      if (b.life <= 0) { g.world.scene.remove(b.mesh); this.beams.splice(i, 1); }
    }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]!;
      r.life -= dt;
      r.vel.y -= 1.2 * dt;
      const step = r.vel.length() * dt;
      _d.copy(r.vel).normalize();
      const hit = g.physics?.raycast(r.pos, _d, step + 0.3, r.exclude, GROUP.WORLD | GROUP.PROP) ?? null;
      const npc = g.npcs?.rayHit(r.pos.x, r.pos.y, r.pos.z, _d.x, _d.y, _d.z, hit ? hit.distance : step + 0.3) ?? null;
      let boom: THREE.Vector3 | null = null;
      if (npc) boom = r.pos.clone().addScaledVector(_d, npc.t);
      else if (hit) boom = hit.point.clone().addScaledVector(_d, -0.2);
      else {
        r.pos.addScaledVector(_d, step);
        if (r.pos.y < terrainHeight(r.pos.x, r.pos.z) + 0.1 || r.life <= 0) boom = r.pos.clone();
      }
      // vehicles the player can hit are physics bodies, already covered by the ray above
      if (boom) {
        g.combat?.boom(boom.x, boom.y, boom.z, 9, 320, true);
        g.npcs?.alarm(boom.x, boom.z);
        g.world.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
        continue;
      }
      r.mesh.position.copy(r.pos);
      r.smokeT -= dt;
      if (r.smokeT <= 0) { r.smokeT = 0.04; g.effects?.smoke(_n.copy(r.pos).addScaledVector(_d, -0.6), false); }
    }
  }

  private updateThrown(dt: number): void {
    const g = this.g;
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const t = this.thrown[i]!;
      t.fuse -= dt;
      if (t.stuck) {
        // stuck to a car: ride along with it
        if (t.on) { t.pos.copy(t.local).applyQuaternion(t.on.quaternion).add(t.on.position); if (t.on.exploded) { this.remove(i); continue; } }
        t.mesh.position.copy(t.pos);
        if (t.fuse <= 0 && t.kind === 'sticky') this.remove(i);
        continue;
      }
      t.vel.y -= 9.8 * dt;
      const step = t.vel.length() * dt;
      _d.copy(t.vel).normalize();
      const hit = g.physics?.raycast(t.pos, _d, step + 0.06, undefined, GROUP.WORLD | GROUP.PROP) ?? null;
      const npc = t.kind !== 'frag' ? g.npcs?.rayHit(t.pos.x, t.pos.y, t.pos.z, _d.x, _d.y, _d.z, hit ? hit.distance : step + 0.06) ?? null : null;
      const ground = terrainHeight(t.pos.x, t.pos.z);
      let impact: THREE.Vector3 | null = null, normal = _n.set(0, 1, 0);
      if (npc) impact = t.pos.clone().addScaledVector(_d, npc.t);
      else if (hit) { impact = hit.point.clone(); normal = _n.copy(hit.normal); }
      else if (t.pos.y + t.vel.y * dt < ground + 0.04) impact = new THREE.Vector3(t.pos.x, ground + 0.04, t.pos.z);
      if (impact) {
        if (t.kind === 'fire') { g.audio.sport('snap', 1.4, impact); this.ignite(impact); this.remove(i); continue; }
        if (t.kind === 'sticky') {
          t.stuck = true;
          t.pos.copy(impact).addScaledVector(normal, 0.02);
          // a car? stick to it
          const handle = hit?.collider?.handle;
          const v = handle !== undefined ? g.vehicles?.vehicles.find((q) => q.collider.handle === handle) ?? null : null;
          if (v) { t.on = v; t.local.copy(t.pos).sub(v.position).applyQuaternion(v.quaternion.clone().invert()); }
          g.audio.mech('magIn');
          t.mesh.position.copy(t.pos);
          continue;
        }
        // a frag bounces and rolls
        t.pos.copy(impact).addScaledVector(normal, 0.05);
        const vn = t.vel.dot(normal);
        t.vel.addScaledVector(normal, -1.6 * vn).multiplyScalar(0.45);
        if (t.bounces++ < 3) g.audio.sport('bounce', 0.6, t.pos);
      } else t.pos.addScaledVector(_d, step);
      t.mesh.position.copy(t.pos);
      t.mesh.rotation.x += dt * 9; t.mesh.rotation.z += dt * 6;
      if (t.kind === 'frag' && t.fuse <= 0) {
        g.combat?.boom(t.pos.x, t.pos.y, t.pos.z, 8, 300, true);
        g.npcs?.alarm(t.pos.x, t.pos.z);
        this.remove(i);
      } else if (t.fuse <= 0) this.remove(i);
    }
  }

  private updateFires(dt: number): void {
    const g = this.g;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i]!;
      f.t -= dt;
      const k = Math.min(1, f.t / 1.5);
      for (const [j, m] of f.flames.entries()) {
        const fl = 0.75 + Math.sin(performance.now() * 0.012 + j * 1.7) * 0.2 + Math.random() * 0.1;
        m.scale.set(fl * k, (0.8 + Math.random() * 0.5) * k, fl * k);
        m.rotation.y += dt * 2;
      }
      f.smokeT -= dt;
      if (f.smokeT <= 0) { f.smokeT = 0.15; g.effects?.smoke(f.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0.5, (Math.random() - 0.5) * 3)), true); }
      f.tickT -= dt;
      if (f.tickT <= 0) {
        f.tickT = 0.3;
        // people in the flames burn and run; the player too; cars catch
        for (const p of g.npcs?.peds.peds ?? []) {
          if (!p.active || Math.hypot(p.x - f.pos.x, p.z - f.pos.z) > f.r) continue;
          g.npcs!.peds.knockDown(p, p.x - f.pos.x, p.z - f.pos.z, 14, true);
        }
        const pl = g.player;
        if (pl && Math.hypot(pl.pos.x - f.pos.x, pl.pos.z - f.pos.z) < f.r && Math.abs(pl.pos.y - f.pos.y) < 2.5 && g.driving?.mode === 'foot') g.combat?.vitals.hurt(9, f.pos.x, f.pos.z, pl.pos.x, pl.pos.z);
        for (const v of g.vehicles?.vehicles ?? []) if (v.position.distanceTo(f.pos) < f.r + 1.5) v.health -= 22;
      }
      if (f.t <= 0) { for (const m of f.flames) g.world.scene.remove(m); this.fires.splice(i, 1); }
    }
  }
}
