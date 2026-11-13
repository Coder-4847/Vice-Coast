import * as THREE from 'three';
import type { Game } from '../Game';
import { GROUP } from '../physics/Physics';
import { terrainHeight } from '../world/Terrain';

interface Rocket { pos: THREE.Vector3; vel: THREE.Vector3; mesh: THREE.Group; life: number; smokeT: number }
interface Beam { mesh: THREE.Mesh; life: number }

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

  constructor(private readonly g: Game) {}

  /** Launch a rocket from `from` along `dir` (normalised). */
  rocket(from: THREE.Vector3, dir: THREE.Vector3): void {
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
    this.rockets.push({ pos: from.clone(), vel: dir.clone().multiplyScalar(62), mesh: grp, life: 6, smokeT: 0 });
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
      const hit = g.physics?.raycast(r.pos, _d, step + 0.3, undefined, GROUP.WORLD | GROUP.PROP) ?? null;
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
}
