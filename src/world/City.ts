import * as THREE from 'three';
import type { BuildingBox, Physics } from '../physics/Physics';
import type { QualityPreset } from '../core/Quality';
import { CITY, Terrain } from './Terrain';
import { NOISE_GLSL } from './skyGlsl';
import { buildCityFields, type CityFields } from './city/fields';
import { CHUNK, CityPlan, MODE, type ChunkData, type Prim } from './city/plan';

const G = CITY.height;

function radialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------------------------- pools

/**
 * A fixed-capacity InstancedMesh whose instances are grouped by chunk id. Adding a chunk appends its instances;
 * removing one shifts the tail down (copyWithin), so the draw count is always exactly what is loaded.
 */
export class InstancePool {
  readonly mesh: THREE.InstancedMesh;
  count = 0;
  overflow = 0;
  private readonly ranges = new Map<string, { s: number; n: number }>();
  private readonly mat: Float32Array;
  private readonly col: Float32Array;
  private readonly par: Float32Array | null;
  private readonly parAttr: THREE.InstancedBufferAttribute | null;

  constructor(geo: THREE.BufferGeometry, material: THREE.Material, readonly capacity: number, withParam = false) {
    const g = geo.clone();
    this.par = withParam ? new Float32Array(capacity * 2) : null;
    this.parAttr = this.par ? new THREE.InstancedBufferAttribute(this.par, 2) : null;
    if (this.parAttr) {
      this.parAttr.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aParam', this.parAttr);
    }
    this.mesh = new THREE.InstancedMesh(g, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mat = this.mesh.instanceMatrix.array as Float32Array;
    this.col = this.mesh.instanceColor.array as Float32Array;
  }

  has(id: string): boolean {
    return this.ranges.has(id);
  }

  /** Append `n` instances for chunk `id`; `fill` writes matrix, colour and (optional) params. */
  add(id: string, n: number, fill: (i: number, m: THREE.Matrix4, c: THREE.Color, p: [number, number]) => void): void {
    if (n === 0 || this.ranges.has(id)) return;
    if (this.count + n > this.capacity) {
      this.overflow += n;
      return;
    }
    const s = this.count;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const p: [number, number] = [0, 0];
    for (let i = 0; i < n; i++) {
      p[0] = 0; p[1] = 0;
      fill(i, m, c, p);
      m.toArray(this.mat, (s + i) * 16);
      this.col[(s + i) * 3] = c.r; this.col[(s + i) * 3 + 1] = c.g; this.col[(s + i) * 3 + 2] = c.b;
      if (this.par) { this.par[(s + i) * 2] = p[0]; this.par[(s + i) * 2 + 1] = p[1]; }
    }
    this.ranges.set(id, { s, n });
    this.count += n;
    this.dirty();
  }

  remove(id: string): void {
    const r = this.ranges.get(id);
    if (!r) return;
    const end = r.s + r.n;
    if (end < this.count) {
      this.mat.copyWithin(r.s * 16, end * 16, this.count * 16);
      this.col.copyWithin(r.s * 3, end * 3, this.count * 3);
      this.par?.copyWithin(r.s * 2, end * 2, this.count * 2);
    }
    this.count -= r.n;
    this.ranges.delete(id);
    for (const o of this.ranges.values()) if (o.s > r.s) o.s -= r.n;
    this.dirty();
  }

  clear(): void {
    this.ranges.clear();
    this.count = 0;
    this.dirty();
  }

  dirty(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.parAttr) this.parAttr.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

// --------------------------------------------------------------------------------------------- geometry

function palmCrownGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const leaves = 9;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + (i % 2) * 0.2;
    const c = Math.cos(a), s = Math.sin(a);
    const base = pos.length / 3;
    const L = 2.9;
    const w = 0.5;
    // root, mid (widest, slightly raised), tip (drooping)
    const pts: [number, number, number, number][] = [
      [0, 0, 0, 0.08], [L * 0.45, 0.35, 0, w], [L, -0.7, 0, 0.05],
    ];
    for (const [d, y, , half] of pts) {
      pos.push(c * d - s * half, y, s * d + c * half);
      pos.push(c * d + s * half, y, s * d - c * half);
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4, base + 3, base + 5, base + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Port Valeria's instanced scenery. The plan (city/plan.ts) is a pure function of a seed; this class turns it into
 * GPU instances chunk by chunk as the player moves, keeping physics colliders in step, and keeps a cheap far skyline
 * of every building outside the streaming radius. Roads, sidewalks, markings and lot surfaces are painted by the
 * terrain shader from two small textures (see city/fields.ts), so they cost no geometry at any distance.
 */
export class City {
  readonly plan = new CityPlan();
  readonly group = new THREE.Group();
  readonly pools = new THREE.Group();
  readonly fields: CityFields;

  readonly buildingMaterial = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.04 });
  readonly poleMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.6, metalness: 0.6 });
  readonly headMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(1, 0.72, 0.42), emissiveIntensity: 0 });
  readonly signalMaterial = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 1.2, roughness: 0.5 });
  readonly trunkMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  readonly leafMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
  readonly poolMaterial: THREE.MeshBasicMaterial;
  private readonly poolTex = radialTexture();

  private pBox!: InstancePool;
  private pCyl!: InstancePool;
  private pFar!: InstancePool;
  private pPole!: InstancePool;
  private pHead!: InstancePool;
  private pPool!: InstancePool;
  private pTrunk!: InstancePool;
  private pBlob!: InstancePool;
  private pPalm!: InstancePool;
  private pSigPole!: InstancePool;
  private pSigHead!: InstancePool;
  private all: InstancePool[] = [];

  private readonly rec = new Map<string, { cx: number; cz: number; handles: number[]; pending: BuildingBox[] }>();
  private readonly farBoxes = new Map<string, Prim[]>();
  private physics: Physics | null = null;
  private readonly removeQueue: number[] = [];
  private radius = 700;
  private lamps = true;
  private builtKey = '';
  private sigState = -1;
  private time = 0;
  /** Streaming statistics for the debug panel. */
  stats = { chunks: 0, loadMs: 0, maxLoadMs: 0, colliders: 0, loads: 0 };

  constructor() {
    this.fields = buildCityFields(this.plan);
    Terrain.cityData = this.fields;
    this.poolMaterial = new THREE.MeshBasicMaterial({
      map: this.poolTex, color: new THREE.Color(1.0, 0.62, 0.3), transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.group.add(this.pools);
    // The far skyline is generated once for the whole plan.
    const rg = this.plan.chunkRange();
    for (let cx = rg.cx0; cx <= rg.cx1; cx++) {
      for (let cz = rg.cz0; cz <= rg.cz1; cz++) {
        const d = this.plan.generateChunk(cx, cz);
        const far = d.boxes.filter((b) => b.solid && (b.mode !== MODE.METAL || b.sy > 6)).map((b) => {
          const top = b.y + b.sy / 2;
          // tower tiers are extended to the ground so a distant skyline has no gaps under podium roofs
          if (top > G + 22 && b.y - b.sy / 2 > G + 0.5 && b.y - b.sy / 2 < G + 30) return { ...b, y: (top + G) / 2, sy: top - G };
          return b;
        });
        if (far.length) this.farBoxes.set(`${cx},${cz}`, far);
      }
    }
  }

  get instanceCount(): number {
    return this.pBox ? this.pBox.count + this.pFar.count + this.pCyl.count : 0;
  }
  get boxCount(): number {
    return this.pBox ? this.pBox.count : 0;
  }
  get farCount(): number {
    return this.pFar ? this.pFar.count : 0;
  }

  /** (Re)build pools for a quality preset and load everything around `centre`. */
  configure(preset: QualityPreset, cx: number, cz: number): void {
    const key = `${preset.streamRadius}|${preset.lamps}`;
    if (key === this.builtKey) return;
    this.builtKey = key;
    this.radius = preset.streamRadius;
    this.lamps = preset.lamps;
    for (const p of this.all) {
      this.group.remove(p.mesh);
      this.pools.remove(p.mesh);
      p.dispose();
    }
    this.releaseColliders();
    this.rec.clear();
    this.buildPools();
    this.warm(cx, cz);
  }

  private buildPools(): void {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cylG = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, param = false) => {
      const p = new InstancePool(geo, mat, cap, param);
      this.all.push(p);
      return p;
    };
    this.all = [];
    this.pBox = mk(box, this.buildingMaterial, 9000, true);
    this.pBox.mesh.castShadow = true;
    this.pBox.mesh.receiveShadow = true;
    this.pCyl = mk(cylG, this.buildingMaterial, 1500, true);
    this.pCyl.mesh.castShadow = true;
    this.pCyl.mesh.receiveShadow = true;
    this.pFar = mk(box, this.buildingMaterial, 6000, true);
    this.pFar.mesh.castShadow = false;
    this.pFar.mesh.receiveShadow = true;
    this.group.add(this.pBox.mesh, this.pCyl.mesh, this.pFar.mesh);

    this.pPole = mk(new THREE.BoxGeometry(0.28, 9, 0.28).translate(0, 4.5, 0), this.poleMaterial, 4000);
    this.pHead = mk(new THREE.BoxGeometry(1.8, 0.22, 0.6).translate(0.8, 9.05, 0), this.headMaterial, 4000);
    this.pPool = mk(new THREE.PlaneGeometry(26, 26).rotateX(-Math.PI / 2), this.poolMaterial, 4000);
    this.pPool.mesh.renderOrder = 5;
    this.pSigPole = mk(new THREE.BoxGeometry(0.22, 6.4, 0.22).translate(0, 3.2, 0), this.poleMaterial, 1800);
    this.pSigHead = mk(new THREE.BoxGeometry(0.55, 1.5, 0.45).translate(0, 5.9, 0), this.signalMaterial, 1800, true);
    this.pTrunk = mk(new THREE.CylinderGeometry(0.16, 0.26, 1, 6).translate(0, 0.5, 0), this.trunkMaterial, 9000);
    this.pBlob = mk(new THREE.IcosahedronGeometry(1, 1), this.leafMaterial, 8000);
    this.pPalm = mk(palmCrownGeometry(), this.leafMaterial, 4000);
    this.group.add(this.pPole.mesh, this.pHead.mesh, this.pSigPole.mesh, this.pSigHead.mesh, this.pTrunk.mesh, this.pBlob.mesh, this.pPalm.mesh);
    this.pools.add(this.pPool.mesh);

    // far skyline starts fully populated
    this.pFar.clear();
    for (const [k, boxes] of this.farBoxes) this.addFar(k, boxes);
    this.sigState = -1;
  }

  private addFar(key: string, boxes: Prim[]): void {
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();
    this.pFar.add(key, boxes.length, (i, m, c, p) => {
      const b = boxes[i]!;
      q.setFromEuler(eu.set(0, b.ry, 0));
      m.compose(pos.set(b.x, b.y, b.z), q, sc.set(b.sx, b.sy, b.sz));
      c.setHex(b.color);
      p[0] = b.mode;
    });
  }

  // ---------------------------------------------------------------------------------------- streaming

  attachPhysics(physics: Physics): void {
    this.physics = physics;
    physics.groundHook = (x, z) => this.plan.surfaceAt(x, z);
    for (const r of this.rec.values()) if (!r.handles.length && !r.pending.length) r.pending = this.collidersFor(r.cx, r.cz);
    this.drainColliders(1e9);
  }

  /** Synchronously load every chunk within the streaming radius (used at start-up and after a teleport). */
  warm(px: number, pz: number): void {
    for (const k of this.wanted(px, pz)) this.load(k.cx, k.cz);
  }

  private wanted(px: number, pz: number, margin = 0): { cx: number; cz: number; d: number }[] {
    const R = this.radius + margin;
    const rg = this.plan.chunkRange();
    const out: { cx: number; cz: number; d: number }[] = [];
    for (let cx = Math.max(rg.cx0, Math.floor((px - R) / CHUNK)); cx <= Math.min(rg.cx1, Math.floor((px + R) / CHUNK)); cx++) {
      for (let cz = Math.max(rg.cz0, Math.floor((pz - R) / CHUNK)); cz <= Math.min(rg.cz1, Math.floor((pz + R) / CHUNK)); cz++) {
        const nx = Math.max(cx * CHUNK, Math.min(px, (cx + 1) * CHUNK));
        const nz = Math.max(cz * CHUNK, Math.min(pz, (cz + 1) * CHUNK));
        const d = Math.hypot(px - nx, pz - nz);
        if (d <= R) out.push({ cx, cz, d });
      }
    }
    return out.sort((a, b) => a.d - b.d);
  }

  /**
   * Per-frame streaming, nearest first. Each call does at most one heavy step so a frame never pays for several at once:
   * queued collider removals, then one chunk unload, otherwise one chunk load (+ a small slice of collider creation).
   */
  update(dt: number, px: number, pz: number): void {
    this.time += dt;
    let heavy = this.drainRemovals(140);
    if (!heavy) {
      for (const [key, r] of this.rec) {
        const nx = Math.max(r.cx * CHUNK, Math.min(px, (r.cx + 1) * CHUNK));
        const nz = Math.max(r.cz * CHUNK, Math.min(pz, (r.cz + 1) * CHUNK));
        if (Math.hypot(px - nx, pz - nz) > this.radius + CHUNK) {
          this.unload(key);
          heavy = true;
          break;
        }
      }
    }
    if (!heavy) {
      for (const w of this.wanted(px, pz)) {
        if (!this.rec.has(`${w.cx},${w.cz}`)) {
          this.load(w.cx, w.cz);
          heavy = true;
          break;
        }
      }
    }
    this.drainColliders(heavy ? 40 : 120);
    this.updateSignals();
  }

  private drainRemovals(budget: number): boolean {
    if (!this.removeQueue.length || !this.physics) return false;
    this.physics.removeBuildings(this.removeQueue.splice(0, budget));
    this.stats.colliders = this.physics.buildingCount;
    return true;
  }

  /** Create queued colliders, at most `budget` per call, so a chunk load never costs a whole frame. */
  private drainColliders(budget: number): void {
    if (!this.physics) return;
    for (const r of this.rec.values()) {
      if (!r.pending.length) continue;
      const take = r.pending.splice(0, budget);
      r.handles.push(...this.physics.addBuildings(take));
      budget -= take.length;
      if (budget <= 0) break;
    }
    this.stats.colliders = this.physics.buildingCount;
  }

  private collidersFor(cx: number, cz: number): BuildingBox[] {
    const d = this.plan.generateChunk(cx, cz);
    return this.toColliders(d);
  }

  private toColliders(d: ChunkData): BuildingBox[] {
    const out: BuildingBox[] = [];
    for (const b of d.boxes) {
      if (!b.solid) continue;
      out.push({ cx: b.x, cy: b.y, cz: b.z, hx: b.sx / 2, hy: b.sy / 2, hz: b.sz / 2, ry: b.ry || undefined, win: b.mode });
    }
    for (const c of d.cyls) {
      if (!c.solid) continue;
      out.push({ cx: c.x, cy: c.y, cz: c.z, hx: c.sx / 2, hy: c.sy / 2, hz: c.sz / 2, cyl: true, win: 0 });
    }
    if (this.lamps) {
      for (const l of d.lamps) out.push({ cx: l.x, cy: l.y + 2.5, cz: l.z, hx: 0.16, hy: 2.5, hz: 0.16, win: 0 });
    }
    for (const t of d.trees) {
      const h = t.kind === 1 ? 4.5 : 1.6;
      out.push({ cx: t.x, cy: t.y + h / 2, cz: t.z, hx: 0.22, hy: h / 2, hz: 0.22, win: 0 });
    }
    return out;
  }

  private releaseColliders(): void {
    if (!this.physics) return;
    for (const r of this.rec.values()) this.physics.removeBuildings(r.handles);
    this.physics.removeBuildings(this.removeQueue.splice(0));
    this.stats.colliders = this.physics.buildingCount;
  }

  private load(cx: number, cz: number): void {
    const t0 = performance.now();
    const key = `${cx},${cz}`;
    if (this.rec.has(key)) return;
    const d = this.plan.generateChunk(cx, cz);
    const rec = { cx, cz, handles: [] as number[], pending: [] as BuildingBox[] };
    this.rec.set(key, rec);
    this.pFar.remove(key);

    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const prim = (list: Prim[]) => (i: number, m: THREE.Matrix4, c: THREE.Color, p: [number, number]) => {
      const b = list[i]!;
      q.setFromEuler(e.set(0, b.ry, 0));
      m.compose(pos.set(b.x, b.y, b.z), q, sc.set(b.sx, b.sy, b.sz));
      c.setHex(b.color);
      p[0] = b.mode;
    };
    this.pBox.add(key, d.boxes.length, prim(d.boxes));
    this.pCyl.add(key, d.cyls.length, prim(d.cyls));

    if (this.lamps) {
      const ones = new THREE.Vector3(1, 1, 1);
      const lampMat = (i: number, m: THREE.Matrix4) => {
        const l = d.lamps[i]!;
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, l.yaw);
        m.compose(pos.set(l.x, l.y, l.z), q, ones);
      };
      this.pPole.add(key, d.lamps.length, lampMat);
      this.pHead.add(key, d.lamps.length, lampMat);
      this.pPool.add(key, d.lamps.length, (i, m) => {
        const l = d.lamps[i]!;
        // pool sits under the lamp head (arm points along local +x, rotated by yaw about Y)
        m.compose(pos.set(l.x + 0.8 * Math.cos(l.yaw), l.y + 0.06, l.z - 0.8 * Math.sin(l.yaw)), q.identity(), ones);
      });
    }

    // traffic signals: pole + head; head param.x = axis (for the red/green cycle)
    const one = new THREE.Vector3(1, 1, 1);
    this.pSigPole.add(key, d.signals.length, (i, m) => {
      const s = d.signals[i]!;
      m.compose(pos.set(s.x, G, s.z), q.identity(), one);
    });
    this.pSigHead.add(key, d.signals.length, (i, m, c, p) => {
      const s = d.signals[i]!;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.yaw);
      m.compose(pos.set(s.x, G, s.z), q, one);
      c.setHex(0x40ff60);
      p[0] = s.axis;
    });
    this.sigState = -1;

    // trees: trunk + crown (broadleaf blob, cypress ellipsoid or palm fan)
    const green = new THREE.Color();
    const trunkH = (t: ChunkData['trees'][number]) => (t.kind === 1 ? 5.5 + t.s * 4.2 : t.kind === 2 ? 1.6 : 2.4 + t.s * 1.2);
    this.pTrunk.add(key, d.trees.length, (i, m, c) => {
      const t = d.trees[i]!;
      const h = trunkH(t);
      m.compose(pos.set(t.x, t.y, t.z), q.identity(), sc.set(t.kind === 1 ? t.s * 0.9 : t.s, h, t.kind === 1 ? t.s * 0.9 : t.s));
      c.setHex(t.kind === 1 ? 0x8a7a5a : 0x5b4631);
    });
    const blobs = d.trees.filter((t) => t.kind !== 1);
    this.pBlob.add(key, blobs.length, (i, m, c) => {
      const t = blobs[i]!;
      const h = trunkH(t);
      if (t.kind === 2) {
        m.compose(pos.set(t.x, t.y + h + 2.2 * t.s, t.z), q.identity(), sc.set(1.15 * t.s, 4.4 * t.s, 1.15 * t.s));
        c.setHex(0x1f4a2e);
      } else {
        m.compose(pos.set(t.x, t.y + h + 1.6 * t.s, t.z), q.identity(), sc.set(2.7 * t.s, 2.2 * t.s, 2.7 * t.s));
        c.setHex(0x244a20).lerp(green.setHex(0x4f6a26), t.tint);
      }
    });
    const palms = d.trees.filter((t) => t.kind === 1);
    this.pPalm.add(key, palms.length, (i, m, c) => {
      const t = palms[i]!;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t.tint * 6.28);
      m.compose(pos.set(t.x, t.y + trunkH(t), t.z), q, sc.set(t.s * 1.1, t.s * 1.1, t.s * 1.1));
      c.setHex(0x2f6a2c).lerp(green.setHex(0x4d7a30), t.tint);
    });

    if (this.physics) rec.pending = this.toColliders(d);
    const ms = performance.now() - t0;
    this.stats.loadMs = ms;
    this.stats.maxLoadMs = Math.max(this.stats.maxLoadMs, ms);
    this.stats.loads++;
    this.stats.chunks = this.rec.size;
  }

  private unload(key: string): void {
    const r = this.rec.get(key);
    if (!r) return;
    for (const p of this.all) if (p !== this.pFar) p.remove(key);
    this.removeQueue.push(...r.handles);
    this.rec.delete(key);
    const far = this.farBoxes.get(key);
    if (far) this.addFar(key, far);
    this.stats.chunks = this.rec.size;
  }

  // ------------------------------------------------------------------------------------- lighting

  /** Signal cycle: 16 s, with an amber phase and an all-red clearance interval. */
  private updateSignals(): void {
    const t = this.time % 16;
    const state = t < 6 ? 0 : t < 7.5 ? 1 : t < 8 ? 2 : t < 14 ? 3 : t < 15.5 ? 4 : 5;
    if (state === this.sigState) return;
    this.sigState = state;
    const col = this.pSigHead.mesh.instanceColor!;
    const arr = col.array as Float32Array;
    const par = (this.pSigHead.mesh.geometry.getAttribute('aParam') as THREE.InstancedBufferAttribute).array as Float32Array;
    const green = [0.2, 1, 0.3], amber = [1, 0.62, 0.05], red = [1, 0.1, 0.06];
    for (let i = 0; i < this.pSigHead.count; i++) {
      const axis = par[i * 2]!;
      // axis 0 is green in states 0–1 (amber in 1), axis 1 in states 3–4
      let c = red;
      if (axis === 0) c = state === 0 ? green : state === 1 ? amber : red;
      else c = state === 3 ? green : state === 4 ? amber : red;
      arr[i * 3] = c[0]!; arr[i * 3 + 1] = c[1]!; arr[i * 3 + 2] = c[2]!;
    }
    col.needsUpdate = true;
  }

  /** Night lighting: lamp emission and pool opacity follow how dark it is (and dim under heavy rain/fog). */
  setNight(night: number, wet: number): void {
    this.headMaterial.emissiveIntensity = night * 9;
    this.poolMaterial.opacity = night * (0.42 + 0.3 * wet);
    this.signalMaterial.emissiveIntensity = 1.2 + night * 3.2;
  }

  /** Signal heads glow in the colour of their instance. */
  static signalPatch = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb;');
  };

  dispose(): void {
    for (const p of this.all) p.dispose();
    this.fields.dispose();
  }

  /** Window/facade shader patch (installed through LightRig.register). */
  static patch = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aParam;\nvarying vec3 vLoc;\nvarying vec3 vNrm;\nvarying vec3 vSize;\nvarying float vSeed;\nvarying float vMode;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 bsz = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
vSize = bsz;
vLoc = (position + 0.5) * bsz;
vNrm = normal;
vMode = aParam.x;
vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLoc;\nvarying vec3 vNrm;\nvarying vec3 vSize;\nvarying float vSeed;\nvarying float vMode;\n${NOISE_GLSL}`)
      .replace('void main() {', 'float wMask = 0.0;\nfloat wLit = 0.0;\nfloat wEmit = 0.0;\nvec3 wCol = vec3(0.0);\nvec3 neonCol = vec3(0.0);\nvoid main() {')
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  float md = vMode;
  vec3 an = abs(vNrm);
  diffuseColor.rgb *= 0.80 + 0.20 * smoothstep(0.0, 14.0, vLoc.y);
  if (md > 6.5) {
    neonCol = diffuseColor.rgb; wEmit = 1.0; diffuseColor.rgb *= 0.35;
  } else if (md > 5.5) {
    // stadium seating: a crowd of colours
    vec2 sc = floor(vec2(vLoc.x + vLoc.z, vLoc.y) * vec2(0.8, 1.1));
    float hh = n_hash21(sc + vSeed * 17.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.85, 0.7) * (0.5 + hh), step(0.55, hh) * 0.8);
  } else if (md > 4.5) {
    diffuseColor.rgb *= 0.9;
  } else if (md > 3.5) {
    neonCol = diffuseColor.rgb; wEmit = 1.0; diffuseColor.rgb *= 0.25;
  } else if (md > 0.5 && an.y < 0.5) {
    vec2 fc = an.x > an.z ? vec2(vLoc.z, vLoc.y) : vec2(vLoc.x, vLoc.y);
    float yTop = vSize.y;
    float night = uNight;
    float fraction = 0.03 + 0.24 * smoothstep(0.05, 0.8, night);
    vec3 glassCol = vec3(0.035, 0.05, 0.075);
    if (md < 1.5) {
      vec2 cs = vec2(2.6, 3.7);
      vec2 cell = floor(fc / cs);
      vec2 f = fract(fc / cs);
      float ground = step(0.2, vLoc.y) * step(vLoc.y, yTop - 0.9);
      wMask = step(0.05, f.x) * step(f.x, 0.95) * step(0.08, f.y) * step(f.y, 0.9) * ground;
      float hh = n_hash21(cell + vSeed * 91.0 + an.x * 7.0);
      wLit = step(hh, fraction);
      glassCol = diffuseColor.rgb * 0.16 + vec3(0.012, 0.02, 0.035);
      wCol = mix(vec3(1.0, 0.72, 0.42), vec3(0.72, 0.86, 1.0), step(0.8, n_hash21(cell * 1.7 + vSeed)));
      wCol *= 0.6 + 0.9 * n_hash21(cell + 4.0);
    } else if (md < 2.5) {
      vec2 cs = vec2(3.4, 3.8);
      vec2 cell = floor(fc / cs);
      vec2 f = fract(fc / cs);
      float ground = step(4.5, vLoc.y) * step(vLoc.y, yTop - 1.2);
      wMask = step(0.16, f.x) * step(f.x, 0.84) * step(0.2, f.y) * step(f.y, 0.82) * ground;
      float hh = n_hash21(cell + vSeed * 91.0 + an.x * 7.0);
      wLit = step(hh, fraction);
      // shopfront band at street level
      float sx = mod(fc.x, 7.0);
      float shop = step(0.5, vLoc.y) * step(vLoc.y, 4.0) * step(0.8, sx) * step(sx, 6.2);
      wMask = max(wMask, shop);
      wLit = max(wLit, shop * step(n_hash21(vec2(floor(fc.x / 7.0), vSeed * 31.0)), 0.35 + 0.5 * night));
      wCol = mix(vec3(1.0, 0.70, 0.40), vec3(0.72, 0.86, 1.0), step(0.86, n_hash21(cell * 1.7 + vSeed)));
      wCol *= 0.6 + 0.9 * n_hash21(cell + 4.0);
    } else {
      vec2 cs = vec2(4.0, 1.0);
      vec2 cell = floor(fc / cs);
      vec2 f = fract(fc / cs);
      wMask = step(yTop - 5.0, vLoc.y) * step(vLoc.y, yTop - 2.4) * step(0.06, f.x) * step(f.x, 0.94);
      wLit = step(n_hash21(cell + vSeed * 91.0), fraction * 0.6);
      wCol = vec3(1.0, 0.8, 0.5);
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, glassCol, wMask);
  }
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor * (1.0 - 0.3 * uWet), 0.05, wMask);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.15, wMask);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += wCol * wMask * wLit * uNight * 0.55 + neonCol * wEmit * (0.35 + uNight * 4.0);');
  };
}

export { CHUNK };
