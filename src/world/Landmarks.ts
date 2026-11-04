import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CITY, terrainHeight } from './Terrain';
import { FUNFAIR, type CityPlan } from './city/plan';

const G = CITY.height;

function roadTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1b1b1f';
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 2400; i++) {
    const v = 20 + Math.random() * 26;
    g.fillStyle = `rgb(${v},${v},${v + 3})`;
    g.fillRect(Math.random() * 128, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  // edge lines and a dashed centre line
  g.fillStyle = '#cfcfc8';
  g.fillRect(6, 0, 3, 256);
  g.fillRect(119, 0, 3, 256);
  g.fillStyle = '#c7a02a';
  for (let y = 0; y < 256; y += 64) g.fillRect(62, y, 4, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Crestview Hill's spiral road, draped over the terrain. Built once (it is only ~2.3 km long). */
export class HillRoad {
  readonly mesh: THREE.Mesh;
  readonly material = new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.86, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  constructor(plan: CityPlan) {
    const half = 5.0;
    const n = 560;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let len = 0;
    let px = 0, pz = 0;
    for (let i = 0; i <= n; i++) {
      const p = plan.hillRoad(i / n);
      if (i > 0) len += Math.hypot(p.x - px, p.z - pz);
      px = p.x; pz = p.z;
      // perpendicular to the direction of travel; yaw = atan2(-tz, tx) so tangent = (cos yaw, -sin yaw)
      const tx = Math.cos(p.yaw), tz = -Math.sin(p.yaw);
      const nx = -tz, nz = tx;
      for (const s of [-1, 1]) {
        const x = p.x + nx * half * s, z = p.z + nz * half * s;
        pos.push(x, terrainHeight(x, z) + 0.09, z);
        uv.push(s < 0 ? 0 : 1, len / 16);
      }
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // normals may face down depending on winding; force up
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    // render both faces so winding never hides the road
    this.material.side = THREE.DoubleSide;
  }
}

/** The Sunwheel: a slowly turning Ferris wheel with lit gondolas, at the foot of the pier. */
export class FerrisWheel {
  readonly group = new THREE.Group();
  readonly frameMaterial = new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.5, metalness: 0.4, emissive: new THREE.Color(1, 0.2, 0.55), emissiveIntensity: 0 });
  readonly cabinMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, emissive: new THREE.Color(1, 0.8, 0.5), emissiveIntensity: 0 });
  private readonly wheel = new THREE.Group();
  private readonly cabins: THREE.InstancedMesh;
  private readonly radius = 24;
  private readonly hub = new THREE.Vector3(FUNFAIR.x - 4, G + 29, FUNFAIR.z);
  private readonly count = 16;
  private angle = 0;

  constructor() {
    const R = this.radius;
    const parts: THREE.BufferGeometry[] = [];
    for (const z of [-5, 5]) {
      parts.push(new THREE.TorusGeometry(R, 0.32, 6, 56).translate(0, 0, z));
      parts.push(new THREE.TorusGeometry(R * 0.55, 0.2, 5, 40).translate(0, 0, z));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI;
        parts.push(new THREE.BoxGeometry(0.2, R * 2, 0.2).rotateZ(a).translate(0, 0, z));
      }
    }
    parts.push(new THREE.CylinderGeometry(0.9, 0.9, 11, 10).rotateX(Math.PI / 2));
    const frame = new THREE.Mesh(mergeGeometries(parts)!, this.frameMaterial);
    frame.castShadow = true;
    this.wheel.add(frame);
    this.group.add(this.wheel);
    this.group.position.copy(this.hub);

    this.cabins = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 2.2, 3.4), this.cabinMaterial, this.count);
    const col = new THREE.Color();
    const palette = [0xff2e88, 0x27e6ff, 0xffb02e, 0x8a5cff, 0x39ff88, 0xff5a3c];
    for (let i = 0; i < this.count; i++) this.cabins.setColorAt(i, col.setHex(palette[i % palette.length]!));
    this.cabins.castShadow = true;
    this.cabins.frustumCulled = false;
    this.group.add(this.cabins);
    this.update(0, 0);
  }

  update(dt: number, night: number): void {
    this.angle += dt * 0.06;
    this.wheel.rotation.z = this.angle;
    const m = new THREE.Matrix4();
    for (let i = 0; i < this.count; i++) {
      const a = this.angle + (i / this.count) * Math.PI * 2;
      // cabins stay upright (translation only), hanging a little below the rim
      m.makeTranslation(Math.cos(a) * this.radius, Math.sin(a) * this.radius - 1.9, 0);
      this.cabins.setMatrixAt(i, m);
    }
    this.cabins.instanceMatrix.needsUpdate = true;
    this.frameMaterial.emissiveIntensity = night * 2.2;
    this.cabinMaterial.emissiveIntensity = 0.15 + night * 1.6;
  }
}

/** A tall additive light beam marking the active waypoint. */
export class WaypointBeacon {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;

  constructor() {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(c);
    this.mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(2.2, 0.9, 0.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 600, 16, 1, true).translate(0, 300, 0), this.mat);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  set(x: number, z: number): void {
    this.mesh.position.set(x, terrainHeight(x, z), z);
    this.mesh.visible = true;
  }

  clear(): void {
    this.mesh.visible = false;
  }
}
