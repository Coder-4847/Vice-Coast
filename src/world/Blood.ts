import * as THREE from 'three';

/** A procedural splatter: a dense core, droplets thrown outward and a few drips. Several variants share an atlas. */
function splatterTexture(seed: number): THREE.CanvasTexture {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d')!;
  let s = seed * 9301 + 49297;
  const r = (): number => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  c.fillStyle = 'rgba(0,0,0,0)';
  c.fillRect(0, 0, S, S);
  const blob = (x: number, y: number, rad: number, a: number): void => {
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.7, `rgba(255,255,255,${a * 0.85})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
  };
  // core
  for (let i = 0; i < 7; i++) blob(S / 2 + (r() - 0.5) * 18, S / 2 + (r() - 0.5) * 18, 12 + r() * 14, 0.95);
  // spray in one dominant direction (like an exit wound)
  const dir = r() * Math.PI * 2;
  for (let i = 0; i < 46; i++) {
    const a = dir + (r() - 0.5) * 1.6, d = 18 + r() * 42;
    blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 1 + r() * 4.5 * (1 - d / 70), 0.9);
  }
  // a few streaks
  c.strokeStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 5; i++) {
    const a = dir + (r() - 0.5) * 1.2, d0 = 10 + r() * 10, d1 = d0 + 14 + r() * 26;
    c.lineWidth = 1 + r() * 2.5;
    c.beginPath(); c.moveTo(S / 2 + Math.cos(a) * d0, S / 2 + Math.sin(a) * d0); c.lineTo(S / 2 + Math.cos(a) * d1, S / 2 + Math.sin(a) * d1); c.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function poolTexture(): THREE.CanvasTexture {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d')!;
  for (let i = 0; i < 9; i++) {
    const x = S / 2 + Math.cos(i * 2.1) * 14 * (i % 3), y = S / 2 + Math.sin(i * 1.7) * 12 * (i % 3);
    const g = c.createRadialGradient(x, y, 0, x, y, 30 + (i % 4) * 6);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.82, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, 40, 0, Math.PI * 2); c.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Decal { mesh: THREE.Mesh; age: number; life: number; grow: number; size: number; key: unknown }

const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);

/**
 * Blood in the world: splatters on walls and floors behind people who are shot, and pools that spread under the fallen.
 * Everything is a handful of shared materials on small planes, recycled oldest-first.
 */
export class Blood {
  readonly group = new THREE.Group();
  private readonly splatMats: THREE.MeshStandardMaterial[];
  private readonly poolMat: THREE.MeshStandardMaterial;
  private readonly plane = new THREE.PlaneGeometry(1, 1);
  private readonly splats: Decal[] = [];
  private readonly pools: Decal[] = [];
  private static readonly MAX_SPLATS = 70;
  private static readonly MAX_POOLS = 28;

  constructor() {
    // wet but not mirror-like: a glossy finish would pick up the blue sky and turn the blood purple
    const mk = (map: THREE.Texture, color: number, rough: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({
      map, color, emissive: 0x1a0000, roughness: rough, metalness: 0, envMapIntensity: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.splatMats = [1, 2, 3, 4].map((i) => mk(splatterTexture(i), 0x8c0000, 0.8));
    this.poolMat = mk(poolTexture(), 0x5c0000, 0.75);
  }

  get materials(): THREE.Material[] { return [...this.splatMats, this.poolMat]; }

  /** A splatter on a surface at `p` facing along `normal`. */
  splat(p: THREE.Vector3, normal: THREE.Vector3, size = 0.6): void {
    let d: Decal;
    if (this.splats.length >= Blood.MAX_SPLATS) d = this.splats.shift()!;
    else {
      d = { mesh: new THREE.Mesh(this.plane, this.splatMats[0]), age: 0, life: 150, grow: 0, size, key: null };
      this.group.add(d.mesh);
    }
    d.mesh.material = this.splatMats[Math.floor(Math.random() * this.splatMats.length)]!;
    _n.copy(normal).normalize();
    d.mesh.position.copy(p).addScaledVector(_n, 0.015);
    d.mesh.quaternion.copy(_q.setFromUnitVectors(_z, _n));
    d.mesh.rotateZ(Math.random() * Math.PI * 2);
    d.size = size * (0.75 + Math.random() * 0.5);
    d.mesh.scale.setScalar(d.size);
    d.age = 0;
    d.mesh.visible = true;
    this.splats.push(d);
  }

  /** Start (or move) a pool under `key` (a fallen person); it spreads over several seconds. */
  pool(key: unknown, x: number, y: number, z: number, size = 1): void {
    let d = this.pools.find((q) => q.key === key);
    if (!d) {
      if (this.pools.length >= Blood.MAX_POOLS) d = this.pools.shift()!;
      else {
        d = { mesh: new THREE.Mesh(this.plane, this.poolMat), age: 0, life: 180, grow: 0, size, key };
        d.mesh.rotation.x = -Math.PI / 2;
        this.group.add(d.mesh);
      }
      d.key = key; d.age = 0; d.grow = 0; d.size = size * (0.9 + Math.random() * 0.5);
      d.mesh.rotation.z = Math.random() * Math.PI * 2;
      this.pools.push(d);
    }
    d.mesh.position.set(x, y + 0.02, z);
    d.mesh.visible = true;
  }

  update(dt: number): void {
    for (const d of this.pools) {
      d.age += dt;
      d.grow = Math.min(1, d.grow + dt / 9);
      const s = d.size * (0.15 + 0.85 * Math.sqrt(d.grow));
      d.mesh.scale.set(s, s, s);
      if (d.age > d.life) d.mesh.visible = false;
    }
    for (const d of this.splats) { d.age += dt; if (d.age > d.life) d.mesh.visible = false; }
  }
}
