import * as THREE from 'three';
import { WEAPONS, type WeaponId } from '../player/Weapons';
import { terrainHeight } from './Terrain';

export type PickupKind = WeaponId | 'armour' | 'medkit';

interface Item {
  kind: PickupKind;
  mesh: THREE.Group;
  x: number;
  z: number;
  /** Seconds until it reappears (0 = available). */
  respawn: number;
}

const COLORS: Partial<Record<PickupKind, number>> = { vc9: 0xffffff, smg: 0xffb02e, shotgun: 0xff5a3c, rifle: 0x4dff9a, armour: 0x6aa8ff, medkit: 0xff4f6a, knife: 0xdddddd, hatchet: 0xc08a50, rpg: 0x6a7a4a, laser: 0xff3a6a };

/** Weapon crates, body armour and medkits laid out on the beach next to the spawn point; they come back after a while. */
export class Pickups {
  readonly group = new THREE.Group();
  readonly materials: THREE.Material[] = [];
  private readonly items: Item[] = [];
  private t = 0;
  onPick: ((kind: PickupKind) => void) | null = null;

  constructor(layout: { kind: PickupKind; x: number; z: number }[]) {
    const crate = new THREE.MeshStandardMaterial({ color: 0x23282e, roughness: 0.7, metalness: 0.4 });
    this.materials.push(crate);
    for (const l of layout) {
      const g = new THREE.Group();
      const glow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(COLORS[l.kind] ?? 0xffffff), emissiveIntensity: 1.6, roughness: 0.4 });
      this.materials.push(glow);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.55), crate);
      base.position.y = 0.09;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.04, 0.57), glow);
      lid.position.y = 0.2;
      g.add(base, lid);
      if (l.kind === 'armour') {
        const vest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.2), glow);
        vest.position.y = 0.55;
        g.add(vest);
      } else if (l.kind === 'medkit') {
        const a = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.14), glow);
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.46, 0.14), glow);
        a.position.y = b.position.y = 0.55;
        g.add(a, b);
      } else {
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, l.kind === 'shotgun' ? 1.0 : l.kind === 'rifle' ? 0.9 : 0.55), glow);
        gun.position.y = 0.5;
        g.add(gun);
      }
      g.position.set(l.x, terrainHeight(l.x, l.z), l.z);
      g.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
      this.group.add(g);
      this.items.push({ kind: l.kind, mesh: g, x: l.x, z: l.z, respawn: 0 });
    }
  }

  update(dt: number, px: number, py: number, pz: number, canPick: boolean): void {
    this.t += dt;
    for (const it of this.items) {
      if (it.respawn > 0) {
        it.respawn -= dt;
        it.mesh.visible = it.respawn <= 0;
        continue;
      }
      // slow spin of the floating item
      it.mesh.rotation.y = this.t * 0.9 + it.x;
      const top = it.mesh.children[2];
      if (top) top.position.y = 0.55 + Math.sin(this.t * 2 + it.z) * 0.06;
      if (!canPick) continue;
      if (Math.hypot(px - it.x, pz - it.z) < 1.5 && Math.abs(py - it.mesh.position.y) < 2.5) {
        it.respawn = 75;
        it.mesh.visible = false;
        this.onPick?.(it.kind);
      }
    }
  }

  static label(kind: PickupKind): string {
    if (kind === 'armour') return 'Body armour';
    if (kind === 'medkit') return 'Medkit';
    return WEAPONS[kind].name;
  }
}
