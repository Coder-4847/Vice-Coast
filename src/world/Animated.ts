import * as THREE from 'three';
import { GEO } from './heightfield';
import { CABLE } from './towns/kestrel';
import { TURBINE_HUB, TURBINES } from './towns/cinder';
import { roadPaths, type RoadPath } from './roads';
import { terrainHeight } from './Terrain';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Sample a road path at distance s along it: position (with bed height) and heading. */
function along(p: RoadPath, s: number, out: { x: number; y: number; z: number; yaw: number }): void {
  const t = Math.max(0, Math.min(p.length - 0.01, s));
  let lo = 0, hi = p.n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p.s[mid]! <= t) lo = mid; else hi = mid; }
  const f = (t - p.s[lo]!) / Math.max(1e-6, p.s[hi]! - p.s[lo]!);
  out.x = p.xs[lo]! + (p.xs[hi]! - p.xs[lo]!) * f;
  out.z = p.zs[lo]! + (p.zs[hi]! - p.zs[lo]!) * f;
  out.y = p.ys[lo]! + (p.ys[hi]! - p.ys[lo]!) * f;
  out.yaw = Math.atan2(p.xs[hi]! - p.xs[lo]!, p.zs[hi]! - p.zs[lo]!);
}

/**
 * Everything that moves on its own in the new regions: wind-turbine rotors, the Kestrel cable car, the Coast Line train,
 * blinking aviation lights, and the lighthouse beam.
 */
export class Animated {
  readonly group = new THREE.Group();
  readonly bladeMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.5, metalness: 0.1 });
  readonly beaconMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false });
  readonly beamMaterial: THREE.MeshBasicMaterial;

  private readonly blades: THREE.InstancedMesh;
  private readonly cabins: THREE.InstancedMesh;
  private readonly beacons: THREE.InstancedMesh;
  private readonly train: THREE.InstancedMesh;
  private readonly beam: THREE.Mesh;
  private readonly rail: RoadPath | null;
  private readonly beaconSpots: { x: number; y: number; z: number; period: number; phase: number }[] = [];
  private t = 0;
  private trainS = 0;
  private trainDir = 1;
  private trainWait = 6;
  private cabinS = 0.02;
  private cabinDir = 1;
  private cabinWait = 5;
  /** Where the train is right now (for ambience). */
  readonly trainPos = new THREE.Vector3(0, -999, 0);
  private readonly cars = 6;

  constructor(buildingMaterial: THREE.Material) {
    // wind turbines: three blades per hub
    this.blades = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 34, 0.18).translate(0, 17, 0), this.bladeMaterial, TURBINES.length * 3);
    this.blades.frustumCulled = false;
    this.blades.castShadow = false;
    this.group.add(this.blades);

    // cable-car cabins (two, one going up while the other comes down)
    const mkParam = (n: number, mode: number): THREE.InstancedBufferAttribute => {
      const a = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) a[i * 2] = mode;
      return new THREE.InstancedBufferAttribute(a, 2);
    };
    const cabinG = new THREE.BoxGeometry(1, 1, 1);
    cabinG.setAttribute('aParam', mkParam(2, 1));
    this.cabins = new THREE.InstancedMesh(cabinG, buildingMaterial, 2);
    this.cabins.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array([0.78, 0.18, 0.14, 0.2, 0.42, 0.7]), 3);
    this.cabins.frustumCulled = false;
    this.group.add(this.cabins);

    // the train: a locomotive and coaches, drawn with the building shader so the coaches get windows
    this.rail = roadPaths().find((p) => p.def.id === 'coast-line') ?? null;
    const trainG = new THREE.BoxGeometry(1, 1, 1);
    trainG.setAttribute('aParam', mkParam(this.cars, 2));
    this.train = new THREE.InstancedMesh(trainG, buildingMaterial, this.cars);
    const cols = new Float32Array(this.cars * 3);
    for (let i = 0; i < this.cars; i++) {
      const c = new THREE.Color(i === 0 ? 0x23406a : 0xdcdcd6);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    this.train.instanceColor = new THREE.InstancedBufferAttribute(cols, 3);
    this.train.frustumCulled = false;
    this.train.visible = !!this.rail;
    this.group.add(this.train);

    // aviation lights: summit tower, harbour tower, quay cranes, airstrip tower, turbine hubs
    const k = GEO.kestrel;
    const spot = (x: number, z: number, dy: number, period = 1.6, phase = 0): void => { this.beaconSpots.push({ x, y: terrainHeight(x, z) + dy, z, period, phase }); };
    spot(k.summit.x, k.summit.z - 6, 74.4, 1.2);
    spot(506, 1618, 49, 1.9);
    for (let i = 0; i < 5; i++) spot(GEO.harbor.basin.x1 + 8 - 62, 1650 + i * 64, 4.8 + 28.6, 1.6, i * 0.3);
    for (const [x, z] of TURBINES) spot(x, z, TURBINE_HUB + 2.4, 2.0, (x % 7) * 0.1);
    this.beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 6, 4), this.beaconMaterial, this.beaconSpots.length);
    this.beacons.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.beaconSpots.length * 3).fill(0).map((_, i) => (i % 3 === 0 ? 6 : i % 3 === 1 ? 0.3 : 0.2)), 3);
    this.beacons.frustumCulled = false;
    this.group.add(this.beacons);

    // the lighthouse beam: two additive fans rotating about the lantern
    const c = document.createElement('canvas');
    c.width = 256; c.height = 16;
    const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 256, 0);
    grd.addColorStop(0, 'rgba(255,240,200,0.95)'); grd.addColorStop(0.25, 'rgba(255,240,200,0.35)'); grd.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 16);
    const tex = new THREE.CanvasTexture(c);
    this.beamMaterial = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, opacity: 0 });
    const bg = new THREE.PlaneGeometry(220, 9).translate(110, 0, 0).rotateX(-Math.PI / 2);
    const bg2 = bg.clone().rotateY(Math.PI);
    const merged = new THREE.BufferGeometry();
    const pos = new Float32Array([...(bg.attributes.position!.array as Float32Array), ...(bg2.attributes.position!.array as Float32Array)]);
    const uv = new Float32Array([...(bg.attributes.uv!.array as Float32Array), ...(bg2.attributes.uv!.array as Float32Array)]);
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    merged.setIndex([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]);
    this.beam = new THREE.Mesh(merged, this.beamMaterial);
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 6;
    const lh = GEO.pinecrest.lighthouse;
    this.beam.position.set(lh.x, terrainHeight(lh.x, lh.z) + 32.5, lh.z);
    this.group.add(this.beam);
  }

  update(dt: number, camera: THREE.Camera, night: number, wind: number): void {
    this.t += dt;
    const cx = camera.position.x, cz = camera.position.z;

    // turbines
    const near = (x: number, z: number, r: number): boolean => (x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r;
    if (near(3400, 60, 2600)) {
      const w = 0.45 + Math.min(1.6, wind * 0.08);
      TURBINES.forEach(([x, z], i) => {
        const yaw = 0.35 + Math.sin(this.t * 0.02 + i) * 0.04;
        const base = (this.t * w) + i * 0.7;
        for (let b = 0; b < 3; b++) {
          _e.set(0, yaw, base + (b * Math.PI * 2) / 3, 'YXZ');
          _q.setFromEuler(_e);
          _p.set(x + Math.sin(yaw) * 2.2, terrainHeight(x, z) + TURBINE_HUB, z + Math.cos(yaw) * 2.2);
          this.blades.setMatrixAt(i * 3 + b, _m.compose(_p, _q, _s.set(1, 1, 1)));
        }
      });
      this.blades.instanceMatrix.needsUpdate = true;
    }

    // cable car
    {
      const a = CABLE.base, b = CABLE.top;
      const yA = terrainHeight(a.x, a.z) + 9.2, yB = terrainHeight(b.x, b.z) + 9.2;
      if (this.cabinWait > 0) this.cabinWait -= dt;
      else {
        this.cabinS += (this.cabinDir * 6.5 * dt) / Math.hypot(b.x - a.x, b.z - a.z);
        if (this.cabinS >= 0.97 || this.cabinS <= 0.03) { this.cabinDir *= -1; this.cabinS = Math.max(0.03, Math.min(0.97, this.cabinS)); this.cabinWait = 9; }
      }
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? this.cabinS : 1 - this.cabinS;
        const off = i === 0 ? -1 : 1;
        _e.set(0, yaw, 0);
        _q.setFromEuler(_e);
        const side = off * 1.0;
        _p.set(a.x + (b.x - a.x) * s + Math.cos(yaw) * side, yA + (yB - yA) * s - 2.1, a.z + (b.z - a.z) * s - Math.sin(yaw) * side);
        this.cabins.setMatrixAt(i, _m.compose(_p, _q, _s.set(2.4, 2.0, 3.4)));
      }
      this.cabins.instanceMatrix.needsUpdate = true;
    }

    // train
    if (this.rail) {
      const p = this.rail;
      if (this.trainWait > 0) this.trainWait -= dt;
      else {
        this.trainS += this.trainDir * 27 * dt;
        const total = this.cars * 21.6;
        if (this.trainS >= p.length - 4) { this.trainDir = -1; this.trainWait = 18; this.trainS = p.length - 4; }
        else if (this.trainS <= total + 4) { this.trainDir = 1; this.trainWait = 18; this.trainS = total + 4; }
      }
      const front = { x: 0, y: 0, z: 0, yaw: 0 }, back = { x: 0, y: 0, z: 0, yaw: 0 };
      let on = false;
      for (let i = 0; i < this.cars; i++) {
        const s0 = this.trainS - i * 21.6;
        along(p, s0, front);
        along(p, s0 - 17, back);
        const dx = front.x - back.x, dz = front.z - back.z, dy = front.y - back.y;
        const yaw = Math.atan2(dx, dz);
        const pitch = -Math.atan2(dy, Math.hypot(dx, dz));
        _e.set(pitch, yaw, 0, 'YXZ');
        _q.setFromEuler(_e);
        _p.set((front.x + back.x) / 2, (front.y + back.y) / 2 + 2.5, (front.z + back.z) / 2);
        this.train.setMatrixAt(i, _m.compose(_p, _q, _s.set(3.0, 3.6, 19.5)));
        if (i === 0) this.trainPos.copy(_p);
        if (near(_p.x, _p.z, 1500)) on = true;
      }
      this.train.visible = on;
      if (on) this.train.instanceMatrix.needsUpdate = true;
    }

    // beacons blink; at night they glow, by day they are faint
    this.beaconSpots.forEach((b, i) => {
      const on = ((this.t / b.period + b.phase) % 1) < 0.18 ? 1 : 0.0001;
      _p.set(b.x, b.y, b.z);
      this.beacons.setMatrixAt(i, _m.compose(_p, _q.identity(), _s.set(on, on, on).multiplyScalar(0.8 + night * 1.6)));
    });
    this.beacons.instanceMatrix.needsUpdate = true;

    // lighthouse
    this.beam.rotation.y = -this.t * 0.55;
    this.beamMaterial.opacity = night * 0.85;
    this.beam.visible = night > 0.02 && near(this.beam.position.x, this.beam.position.z, 3500);
  }
}
