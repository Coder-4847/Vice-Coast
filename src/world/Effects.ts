import * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import type { Surface } from '../physics/Physics';
import { terrainHeight } from './Terrain';

type PKind = 'dust' | 'spark' | 'splinter' | 'water' | 'glass' | 'smoke';

interface Style {
  color: [number, number, number];
  count: number;
  speed: number;
  life: number;
  size: number;
  gravity: number;
  kind: PKind;
  alpha: number;
}

const IMPACT: Record<Surface, Style[]> = {
  concrete: [
    { kind: 'dust', color: [0.62, 0.6, 0.57], count: 6, speed: 1.6, life: 0.55, size: 0.16, gravity: -0.3, alpha: 0.5 },
    { kind: 'spark', color: [1.0, 0.8, 0.45], count: 5, speed: 5.5, life: 0.25, size: 0.018, gravity: 9, alpha: 1 },
  ],
  asphalt: [
    { kind: 'dust', color: [0.28, 0.27, 0.27], count: 6, speed: 1.5, life: 0.5, size: 0.15, gravity: -0.3, alpha: 0.5 },
    { kind: 'spark', color: [1.0, 0.7, 0.4], count: 4, speed: 5, life: 0.22, size: 0.016, gravity: 9, alpha: 1 },
  ],
  dirt: [
    { kind: 'dust', color: [0.45, 0.36, 0.25], count: 9, speed: 2.1, life: 0.7, size: 0.2, gravity: 0.5, alpha: 0.6 },
    { kind: 'splinter', color: [0.35, 0.27, 0.18], count: 4, speed: 3.5, life: 0.4, size: 0.02, gravity: 10, alpha: 1 },
  ],
  sand: [
    { kind: 'dust', color: [0.78, 0.68, 0.48], count: 10, speed: 2, life: 0.75, size: 0.2, gravity: 0.4, alpha: 0.6 },
  ],
  metal: [
    { kind: 'spark', color: [1.0, 0.85, 0.5], count: 14, speed: 7, life: 0.3, size: 0.02, gravity: 9, alpha: 1 },
    { kind: 'smoke', color: [0.5, 0.5, 0.5], count: 2, speed: 0.6, life: 0.4, size: 0.1, gravity: -0.5, alpha: 0.25 },
  ],
  wood: [
    { kind: 'splinter', color: [0.72, 0.53, 0.3], count: 9, speed: 4, life: 0.45, size: 0.022, gravity: 10, alpha: 1 },
    { kind: 'dust', color: [0.6, 0.45, 0.28], count: 3, speed: 1.2, life: 0.5, size: 0.12, gravity: 0, alpha: 0.4 },
  ],
  glass: [
    { kind: 'glass', color: [0.8, 0.92, 1.0], count: 16, speed: 4.2, life: 0.55, size: 0.024, gravity: 11, alpha: 1 },
  ],
  water: [
    { kind: 'water', color: [0.85, 0.93, 1.0], count: 14, speed: 3.6, life: 0.6, size: 0.07, gravity: 9.5, alpha: 0.8 },
  ],
  flesh: [
    { kind: 'dust', color: [0.5, 0.05, 0.05], count: 6, speed: 2, life: 0.5, size: 0.08, gravity: 5, alpha: 0.8 },
  ],
};

const MAX_P = 320;

/** Pooled impact decals, particles, tracers and brass. Everything is preallocated; nothing allocates per shot. */
export class Effects {
  readonly group = new THREE.Group();

  // --- particles ------------------------------------------------------------------------------------
  private readonly pPos = new Float32Array(MAX_P * 3);
  private readonly pVel = new Float32Array(MAX_P * 3);
  private readonly pCol = new Float32Array(MAX_P * 4);
  private readonly pSize = new Float32Array(MAX_P);
  private readonly pLife = new Float32Array(MAX_P);
  private readonly pMax = new Float32Array(MAX_P);
  private readonly pGrav = new Float32Array(MAX_P);
  private readonly pSize0 = new Float32Array(MAX_P);
  private readonly pAlpha0 = new Float32Array(MAX_P);
  private readonly pGrow = new Float32Array(MAX_P);
  private pCursor = 0;
  private readonly points: THREE.Points;
  private readonly pointMat: THREE.ShaderMaterial;

  // --- decals ---------------------------------------------------------------------------------------
  private readonly decals: { mesh: THREE.InstancedMesh; cursor: number; cap: number }[] = [];
  private readonly decalIndex: Record<string, number> = { hole: 0, crack: 1, splinter: 2, dent: 3, scorch: 4 };

  // --- tracers --------------------------------------------------------------------------------------
  private readonly tracers: { mesh: THREE.Mesh; life: number }[] = [];
  private tracerCursor = 0;

  // --- brass / magazines ----------------------------------------------------------------------------
  private readonly casings: { p: THREE.Vector3; v: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; alive: boolean; bounces: number; mag: boolean }[] = [];
  private readonly casingMesh: THREE.InstancedMesh;
  private readonly magMesh: THREE.Mesh;
  private casingCursor = 0;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(private readonly audio: AudioEngine) {
    // particles
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.pCol, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.pointMat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 800 } },
      transparent: true, depthWrite: false, fog: false,
      vertexShader: /* glsl */ `
        attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vC;
        void main() {
          vC = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(1.0, aSize * uScale / max(-mv.z, 0.1));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vC;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = (1.0 - smoothstep(0.35, 1.0, d)) * vC.a;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC.rgb, a);
        }`,
    });
    this.points = new THREE.Points(geo, this.pointMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.group.add(this.points);
    for (let i = 0; i < MAX_P; i++) this.pLife[i] = 0;

    // decals: five pools sharing procedural textures
    const mk = (draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      draw(g);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const textures = [
      mk((g) => { // hole with soft halo
        const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62);
        gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.22, 'rgba(8,8,8,0.95)'); gr.addColorStop(0.35, 'rgba(30,28,26,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      }),
      mk((g) => { // glass star crack
        g.strokeStyle = 'rgba(235,245,255,0.9)'; g.lineWidth = 1.5;
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2 + Math.random() * 0.2; const l = 20 + Math.random() * 42;
          g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * l, 64 + Math.sin(a) * l); g.stroke();
        }
        g.fillStyle = 'rgba(10,15,20,0.9)'; g.beginPath(); g.arc(64, 64, 4, 0, 7); g.fill();
      }),
      mk((g) => { // wood splinter hole
        g.fillStyle = 'rgba(30,18,8,1)'; g.beginPath(); g.arc(64, 64, 7, 0, 7); g.fill();
        g.strokeStyle = 'rgba(230,200,150,0.9)'; g.lineWidth = 2;
        for (let i = 0; i < 9; i++) { const a = Math.random() * 6.28; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * (14 + Math.random() * 18), 64 + Math.sin(a) * (14 + Math.random() * 18)); g.stroke(); }
      }),
      mk((g) => { // metal dent: bright rim, dark centre
        const gr = g.createRadialGradient(64, 64, 2, 64, 64, 40);
        gr.addColorStop(0, 'rgba(5,5,5,1)'); gr.addColorStop(0.35, 'rgba(15,15,15,1)'); gr.addColorStop(0.5, 'rgba(210,210,215,0.9)'); gr.addColorStop(0.75, 'rgba(110,110,115,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      }),
      mk((g) => { // dirt scorch
        const gr = g.createRadialGradient(64, 64, 2, 64, 64, 50);
        gr.addColorStop(0, 'rgba(20,14,8,0.95)'); gr.addColorStop(0.5, 'rgba(60,45,30,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      }),
    ];
    for (const t of textures) {
      const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false });
      const cap = 48;
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, cap);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.renderOrder = 4;
      this.group.add(mesh);
      this.decals.push({ mesh, cursor: 0, cap });
    }

    // tracers
    const tgeo = new THREE.PlaneGeometry(1, 1);
    tgeo.translate(0, 0, -0.5);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(tgeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 5, 2.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide }));
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }

    // brass
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.3, metalness: 1 });
    const cgeo = new THREE.CylinderGeometry(0.0048, 0.0052, 0.019, 8);
    this.casingMesh = new THREE.InstancedMesh(cgeo, brass, 32);
    this.casingMesh.frustumCulled = false;
    this.casingMesh.castShadow = true;
    for (let i = 0; i < 32; i++) {
      this.casingMesh.setMatrixAt(i, this.zero);
      this.casings.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), alive: false, bounces: 0, mag: false });
    }
    this.group.add(this.casingMesh);
    const magMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.4, metalness: 0.9 });
    this.magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.0255, 0.098, 0.0385), magMat);
    this.magMesh.visible = false;
    this.magMesh.castShadow = true;
    this.group.add(this.magMesh);
  }

  /** Needed so point sprites keep a constant on-screen size for the current FOV/resolution. */
  setViewport(heightPx: number, fovDeg: number): void {
    this.pointMat.uniforms.uScale!.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  // ------------------------------------------------------------------------------------ spawning

  private emit(p: THREE.Vector3, n: THREE.Vector3, s: Style): void {
    for (let k = 0; k < s.count; k++) {
      const i = this.pCursor++ % MAX_P;
      const o3 = i * 3;
      const spread = s.kind === 'spark' || s.kind === 'glass' || s.kind === 'splinter' ? 0.9 : 0.55;
      let rx = Math.random() * 2 - 1;
      let ry = Math.random() * 2 - 1;
      let rz = Math.random() * 2 - 1;
      const l = Math.hypot(rx, ry, rz) || 1;
      rx /= l; ry /= l; rz /= l;
      const v = s.speed * (0.4 + Math.random() * 0.8);
      this.pPos[o3] = p.x + n.x * 0.02; this.pPos[o3 + 1] = p.y + n.y * 0.02; this.pPos[o3 + 2] = p.z + n.z * 0.02;
      this.pVel[o3] = (n.x + rx * spread) * v; this.pVel[o3 + 1] = (n.y + ry * spread) * v + (s.kind === 'water' ? 1.5 : 0); this.pVel[o3 + 2] = (n.z + rz * spread) * v;
      const j = i * 4;
      const jitter = 0.85 + Math.random() * 0.3;
      this.pCol[j] = s.color[0] * jitter; this.pCol[j + 1] = s.color[1] * jitter; this.pCol[j + 2] = s.color[2] * jitter; this.pCol[j + 3] = s.alpha;
      this.pSize0[i] = s.size * (0.6 + Math.random() * 0.8);
      this.pSize[i] = this.pSize0[i]!;
      this.pAlpha0[i] = s.alpha;
      this.pLife[i] = this.pMax[i] = s.life * (0.7 + Math.random() * 0.6);
      this.pGrav[i] = s.gravity;
      this.pGrow[i] = s.kind === 'dust' || s.kind === 'smoke' ? 2.2 : 0;
    }
  }

  /** Bullet strike: decal + particles + sound. */
  impact(point: THREE.Vector3, normal: THREE.Vector3, surface: Surface, onStatic: boolean): void {
    for (const s of IMPACT[surface] ?? IMPACT.concrete) this.emit(point, normal, s);
    this.audio.impact(surface, point);
    if (!onStatic) return;
    const kind = surface === 'glass' ? 'crack' : surface === 'wood' ? 'splinter' : surface === 'metal' ? 'dent' : surface === 'dirt' || surface === 'sand' ? 'scorch' : 'hole';
    if (surface === 'water') return;
    const pool = this.decals[this.decalIndex[kind]!]!;
    const idx = pool.cursor++ % pool.cap;
    const size = surface === 'glass' ? 0.22 : surface === 'metal' ? 0.07 : 0.1;
    // orient the quad to the surface normal, random roll
    this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const roll = new THREE.Quaternion().setFromAxisAngle(normal, Math.random() * Math.PI * 2);
    this.q.premultiply(roll);
    this.m4.compose(new THREE.Vector3().copy(point).addScaledVector(normal, 0.006), this.q, new THREE.Vector3(size, size, 1));
    pool.mesh.setMatrixAt(idx, this.m4);
    pool.mesh.count = Math.min(pool.cap, Math.max(pool.mesh.count, idx + 1));
    pool.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Visible bullet trail. */
  tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const t = this.tracers[this.tracerCursor++ % this.tracers.length]!;
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = Math.min(dir.length(), 40);
    if (len < 1) return;
    dir.normalize();
    t.mesh.position.copy(from).addScaledVector(dir, 1.5);
    t.mesh.lookAt(t.mesh.position.clone().add(dir));
    t.mesh.scale.set(0.012, 0.012, len - 1.5);
    t.mesh.visible = true;
    t.life = 0.05;
  }

  /** A casing leaves the ejection port. */
  casing(pos: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, back: THREE.Vector3): void {
    const c = this.casings[this.casingCursor++ % this.casings.length]!;
    c.alive = true;
    c.bounces = 0;
    c.mag = false;
    c.p.copy(pos);
    c.v.set(0, 0, 0)
      .addScaledVector(right, 1.9 + Math.random() * 0.9)
      .addScaledVector(up, 1.6 + Math.random() * 0.8)
      .addScaledVector(back, 0.5 + Math.random() * 0.5);
    c.spin.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
    c.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
  }

  /** Spent magazine falling to the ground. */
  dropMagazine(pos: THREE.Vector3, vel: THREE.Vector3): void {
    const c = this.casings[31]!;
    c.alive = true;
    c.mag = true;
    c.bounces = 0;
    c.p.copy(pos);
    c.v.copy(vel);
    c.spin.set(2, 1, 3);
    c.rot.set(0.2, 0, 0.1);
    this.magMesh.visible = true;
  }

  // ----------------------------------------------------------------------------------------- update

  update(dt: number): void {
    // particles
    let any = false;
    for (let i = 0; i < MAX_P; i++) {
      const life = this.pLife[i]!;
      if (life <= 0) {
        if (this.pCol[i * 4 + 3]! !== 0) { this.pCol[i * 4 + 3] = 0; any = true; }
        continue;
      }
      any = true;
      const o = i * 3;
      this.pLife[i] = life - dt;
      const t = this.pLife[i]! / this.pMax[i]!;
      this.pVel[o + 1] = this.pVel[o + 1]! - this.pGrav[i]! * dt;
      const drag = Math.exp(-2.2 * dt);
      this.pVel[o] = this.pVel[o]! * drag; this.pVel[o + 1] = this.pVel[o + 1]! * drag; this.pVel[o + 2] = this.pVel[o + 2]! * drag;
      this.pPos[o] = this.pPos[o]! + this.pVel[o]! * dt;
      this.pPos[o + 1] = this.pPos[o + 1]! + this.pVel[o + 1]! * dt;
      this.pPos[o + 2] = this.pPos[o + 2]! + this.pVel[o + 2]! * dt;
      this.pCol[i * 4 + 3] = this.pAlpha0[i]! * Math.min(1, t * 2.2);
      this.pSize[i] = this.pSize0[i]! * (1 + this.pGrow[i]! * (1 - t));
    }
    if (any) {
      (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.points.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
      (this.points.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    }

    // tracers
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }

    // brass + magazine ballistics
    let dirty = false;
    for (let i = 0; i < this.casings.length; i++) {
      const c = this.casings[i]!;
      if (!c.alive) continue;
      c.v.y -= 16 * dt;
      c.p.addScaledVector(c.v, dt);
      c.rot.x += c.spin.x * dt; c.rot.y += c.spin.y * dt; c.rot.z += c.spin.z * dt;
      const ground = Math.max(terrainHeight(c.p.x, c.p.z), 0) + (c.mag ? 0.02 : 0.005);
      if (c.p.y < ground) {
        c.p.y = ground;
        if (c.bounces < (c.mag ? 1 : 3) && Math.abs(c.v.y) > 0.6) {
          c.v.y = -c.v.y * 0.38;
          c.v.x *= 0.55; c.v.z *= 0.55;
          c.spin.multiplyScalar(0.5);
          c.bounces++;
          if (c.mag) this.audio.mech('magDrop');
          else this.audio.casing(Math.hypot(c.p.x - 980, c.p.z) < 740 && c.p.x > 200 ? 'concrete' : 'dirt', c.p);
        } else {
          c.v.set(0, 0, 0);
          c.spin.set(0, 0, 0);
          c.rot.x = c.mag ? 0 : Math.PI / 2;
        }
      }
      if (c.mag) {
        this.magMesh.position.copy(c.p);
        this.magMesh.rotation.copy(c.rot);
      } else {
        this.q.setFromEuler(c.rot);
        this.m4.compose(c.p, this.q, this.one);
        this.casingMesh.setMatrixAt(i, this.m4);
        dirty = true;
      }
    }
    if (dirty) this.casingMesh.instanceMatrix.needsUpdate = true;
  }
}
