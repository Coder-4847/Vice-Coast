import * as THREE from 'three';
import type { QualityPreset } from '../core/Quality';
import { Sky } from './Sky';

const CELL = 64; // one city block incl. street
const STREET = 14;

/** Deterministic PRNG so the test world is identical on every run. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGroundTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(7);
  // Sidewalk/block
  g.fillStyle = '#7b7a7e';
  g.fillRect(0, 0, size, size);
  // Asphalt streets on the cell borders
  const band = Math.round((STREET / CELL) * size);
  g.fillStyle = '#24252b';
  g.fillRect(0, 0, size, band / 2 + 6);
  g.fillRect(0, size - band / 2 - 6, size, band / 2 + 6);
  g.fillRect(0, 0, band / 2 + 6, size);
  g.fillRect(size - band / 2 - 6, 0, band / 2 + 6, size);
  // Kerb highlight
  g.fillStyle = '#9a999d';
  g.fillRect(0, band / 2 + 6, size, 3);
  g.fillRect(0, size - band / 2 - 9, size, 3);
  g.fillRect(band / 2 + 6, 0, 3, size);
  g.fillRect(size - band / 2 - 9, 0, 3, size);
  // Dashed centre lines
  g.fillStyle = '#d9b44a';
  for (let x = 8; x < size; x += 56) {
    g.fillRect(x, -2, 28, 4);
    g.fillRect(x, size - 2, 28, 4);
  }
  for (let y = 8; y < size; y += 56) {
    g.fillRect(-2, y, 4, 28);
    g.fillRect(size - 2, y, 4, 28);
  }
  // Grain
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 16;
    img.data[i]! += n;
    img.data[i + 1]! += n;
    img.data[i + 2]! += n;
  }
  g.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/**
 * A procedural city grid used to exercise the foundation (loop, input, quality, streaming
 * budgets). Real districts arrive in Phase 5.
 */
export class TestWorld {
  readonly scene = new THREE.Scene();
  readonly sky = new Sky();
  readonly sun = new THREE.DirectionalLight('#ffb780', 3.4);
  private readonly hemi = new THREE.HemisphereLight('#93a4d6', '#7a5650', 1.7);
  private readonly ground: THREE.Mesh;
  private buildings: THREE.InstancedMesh | null = null;
  private readonly boxGeo = new THREE.BoxGeometry(1, 1, 1);
  private readonly boxMat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.05 });
  private readonly shadowTarget = new THREE.Object3D();
  private readonly sunOffset = new THREE.Vector3();
  private drawDistance = 1000;
  private builtFor = '';

  /** Number of building instances currently in the scene. */
  instanceCount = 0;

  constructor(preset: QualityPreset) {
    this.sky.setSun(11, 235);
    this.sunOffset.copy(this.sky.sunDirection).multiplyScalar(320);

    this.scene.background = this.sky.horizon.clone();
    this.scene.add(this.sky.mesh, this.hemi, this.sun, this.shadowTarget);
    this.sun.target = this.shadowTarget;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -130;
    cam.right = cam.top = 130;
    cam.near = 1;
    cam.far = 700;

    const tex = makeGroundTexture();
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CELL * 80, CELL * 80),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 }),
    );
    // Tile one texture per cell across the plane.
    tex.repeat.set(80, 80);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.applyQuality(preset);
  }

  applyQuality(preset: QualityPreset): void {
    this.drawDistance = preset.drawDistance;
    this.scene.fog = new THREE.Fog(this.sky.horizon.clone(), preset.drawDistance * 0.3, preset.drawDistance * 0.95);

    this.sun.castShadow = preset.shadows;
    const s = this.sun.shadow;
    if (s.mapSize.x !== preset.shadowMapSize) {
      s.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      s.map?.dispose();
      s.map = null;
    }
    this.buildCity(preset.instanceBudget);
  }

  private buildCity(budget: number): void {
    const key = String(budget);
    if (key === this.builtFor) return;
    this.builtFor = key;
    if (this.buildings) {
      this.scene.remove(this.buildings);
      this.buildings.dispose();
    }

    const rnd = mulberry32(1987);
    const palette = ['#b9b2a6', '#c9a98a', '#8c97a6', '#a35f55', '#6f7b86', '#d7cfc0', '#4d5a6b', '#9a8f7a'].map((c) => new THREE.Color(c));
    const mesh = new THREE.InstancedMesh(this.boxGeo, this.boxMat, budget);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Spiral outward from the centre so a smaller budget still yields a compact, dense downtown.
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    let n = 0;
    const cells: [number, number][] = [];
    const R = 40;
    for (let cx = -R; cx <= R; cx++) for (let cz = -R; cz <= R; cz++) cells.push([cx, cz]);
    const d2 = (c: [number, number]) => (c[0] + 0.5) ** 2 + (c[1] + 0.5) ** 2;
    cells.sort((a, b) => d2(a) - d2(b));

    for (const [cx, cz] of cells) {
      if (n >= budget) break;
      const dist = Math.hypot(cx + 0.5, cz + 0.5);
      const lot = CELL - STREET - 4;
      const splits = rnd() < 0.5 ? 1 : 2;
      for (let i = 0; i < splits && n < budget; i++) {
        const w = (splits === 1 ? lot : lot / 2 - 2) * (0.7 + rnd() * 0.3);
        const d = lot * (0.55 + rnd() * 0.4);
        // Taller downtown: height falls off with distance from the centre.
        const core = Math.max(0, 1 - dist / 14);
        const h = 8 + Math.pow(rnd(), 2.2) * (30 + core * 190) + core * 20;
        const ox = splits === 1 ? 0 : (i === 0 ? -1 : 1) * (lot / 4 + 1);
        p.set((cx + 0.5) * CELL + ox, h / 2, (cz + 0.5) * CELL);
        sc.set(w, h, d);
        m.compose(p, q, sc);
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, palette[Math.floor(rnd() * palette.length)]!);
        n++;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.instanceCount = n;
    this.buildings = mesh;
    this.scene.add(mesh);
  }

  /** Keep sky/ground centred on the viewer and the shadow frustum snapped to its texels. */
  update(camera: THREE.PerspectiveCamera): void {
    camera.far = this.drawDistance * 1.2;
    camera.updateProjectionMatrix();
    this.sky.follow(camera, this.drawDistance * 1.1);

    // Slide the ground so the infinite-looking texture grid stays world-aligned.
    this.ground.position.set(
      Math.round(camera.position.x / CELL) * CELL,
      0,
      Math.round(camera.position.z / CELL) * CELL,
    );

    // Texel-snapped shadow target prevents shimmering while the camera moves.
    const shadowCam = this.sun.shadow.camera;
    const texel = (shadowCam.right - shadowCam.left) / this.sun.shadow.mapSize.x;
    const sx = Math.round(camera.position.x / texel) * texel;
    const sz = Math.round(camera.position.z / texel) * texel;
    this.shadowTarget.position.set(sx, 0, sz);
    this.sun.position.set(sx + this.sunOffset.x, this.sunOffset.y, sz + this.sunOffset.z);
    this.shadowTarget.updateMatrixWorld();
  }
}
