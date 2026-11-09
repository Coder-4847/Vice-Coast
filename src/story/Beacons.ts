import * as THREE from 'three';
import { terrainHeight } from '../world/Terrain';
import { MARKERS, type Marker } from '../ui/mapData';

interface B { id: number; x: number; z: number; color: number; r: number; tall: number; map: Marker | null; hidden: boolean }

const MAX = 40;
const TAG = '‌';

/** Dynamic world markers: a light beam and a ground ring (instanced, so any number of objectives cost nothing) plus a map blip. */
export class Beacons {
  readonly group = new THREE.Group();
  private readonly beams: THREE.InstancedMesh;
  private readonly rings: THREE.InstancedMesh;
  readonly mat: THREE.MeshBasicMaterial;
  readonly ringMat: THREE.MeshBasicMaterial;
  private readonly list: B[] = [];
  private seq = 1;
  private t = 0;
  private dirty = true;
  private readonly m4 = new THREE.Matrix4();
  private readonly col = new THREE.Color();
  private static readonly ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor() {
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.beams = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.55, 1, 14, 1, true), this.mat, MAX);
    this.rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.9, 1.15, 28).rotateX(-Math.PI / 2), this.ringMat, MAX);
    this.beams.count = 0; this.rings.count = 0;
    this.beams.frustumCulled = false; this.rings.frustumCulled = false;
    this.group.add(this.beams, this.rings);
  }

  get materials(): THREE.Material[] { return [this.mat, this.ringMat]; }

  /** Add a marker. `glyph` puts it on the map as well. */
  add(x: number, z: number, o: { color?: string; r?: number; tall?: number; glyph?: string; name?: string } = {}): number {
    if (this.list.length >= MAX) return -1;
    const color = parseInt((o.color ?? '#ffd166').replace('#', ''), 16);
    const b: B = { id: this.seq++, x, z, color, r: o.r ?? 2.4, tall: o.tall ?? 9, map: null, hidden: false };
    if (o.glyph) {
      b.map = { name: TAG + (o.name ?? 'Objective'), x, z, glyph: o.glyph, color: o.color ?? '#ffd166' };
      MARKERS.push(b.map);
    }
    this.list.push(b);
    this.dirty = true;
    return b.id;
  }

  move(id: number, x: number, z: number): void {
    const b = this.list.find((q) => q.id === id);
    if (!b) return;
    b.x = x; b.z = z;
    if (b.map) { b.map.x = x; b.map.z = z; }
    this.dirty = true;
  }

  remove(id: number): void {
    const i = this.list.findIndex((q) => q.id === id);
    if (i < 0) return;
    const b = this.list[i]!;
    if (b.map) { const k = MARKERS.indexOf(b.map); if (k >= 0) MARKERS.splice(k, 1); }
    this.list.splice(i, 1);
    this.dirty = true;
  }

  clear(): void { for (const b of [...this.list]) this.remove(b.id); }

  update(dt: number, px: number, pz: number): void {
    this.t += dt;
    this.mat.opacity = 0.34 + 0.12 * Math.sin(this.t * 2.2);
    for (const b of this.list) {
      const inside = Math.hypot(b.x - px, b.z - pz) < Math.max(2.4, b.r * 0.9);
      if (inside !== b.hidden) { b.hidden = inside; this.dirty = true; }
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.list.forEach((b, i) => {
      const y = terrainHeight(b.x, b.z);
      this.m4.compose(new THREE.Vector3(b.x, y + b.tall / 2, b.z), new THREE.Quaternion(), new THREE.Vector3(b.r * 0.42, b.tall, b.r * 0.42));
      this.beams.setMatrixAt(i, b.hidden ? Beacons.ZERO : this.m4);
      this.m4.compose(new THREE.Vector3(b.x, y + 0.1, b.z), new THREE.Quaternion(), new THREE.Vector3(b.r * 0.75, 1, b.r * 0.75));
      this.rings.setMatrixAt(i, this.m4);
      this.col.setHex(b.color);
      this.beams.setColorAt(i, this.col);
      this.rings.setColorAt(i, this.col);
    });
    this.beams.count = this.rings.count = this.list.length;
    this.beams.instanceMatrix.needsUpdate = this.rings.instanceMatrix.needsUpdate = true;
    if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
  }
}
