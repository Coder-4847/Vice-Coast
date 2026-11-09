import * as THREE from 'three';
import type { Game } from '../Game';
import type { BuildingBox } from '../physics/Physics';
import { GEO } from '../world/heightfield';
import { terrainHeight } from '../world/Terrain';

export interface SiteCfg {
  id: string;
  name: string;
  /** Interior width (x) and depth (z) in metres. */
  w: number;
  d: number;
  /** The vault room at the back. */
  vault: { w: number; d: number };
  cases: number;
  cameras: number;
  /** Where on the salt pan the set is built. */
  at: { x: number; z: number };
  tint: number;
}

export interface Case { x: number; z: number; taken: boolean; mesh: THREE.Mesh }
export interface Cam { x: number; z: number; y: number; base: number; sweep: number; speed: number; range: number; mesh: THREE.Group; seen: number; off: boolean }

const WALL_H = 4.2;
const T = 0.4;

/**
 * A heist interior: a sealed room with a counter, display cases, a vault and security cameras, built from boxes far out on
 * the salt pan. The street entrance in the city is only a door marker: stepping through it moves the player here, and the
 * exit door moves them back.
 */
export class Site {
  readonly group = new THREE.Group();
  readonly cases: Case[] = [];
  readonly cams: Cam[] = [];
  readonly origin = new THREE.Vector3();
  private handles: number[] = [];
  private vaultHandle = -1;
  private vaultMesh: THREE.Mesh | null = null;
  private readonly mats: Record<string, THREE.MeshStandardMaterial> = {};
  private emptyMat!: THREE.MeshStandardMaterial;
  vaultOpen = false;
  private t = 0;
  /** Local positions: where you stand to use things. */
  readonly spots: { door: [number, number]; vault: [number, number]; panel: [number, number]; office: [number, number]; bags: [number, number][] } = { door: [0, 0], vault: [0, 0], panel: [0, 0], office: [0, 0], bags: [] };

  constructor(private readonly g: Game, readonly cfg: SiteCfg) {
    const x = cfg.at.x, z = cfg.at.z;
    this.origin.set(x, terrainHeight(x, z), z);
    this.build();
  }

  private mat(key: string, color: number, emis = 0.5, rough = 0.8, metal = 0.1): THREE.MeshStandardMaterial {
    let m = this.mats[key];
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: color, emissiveIntensity: emis });
      this.mats[key] = m;
      this.g.world.rig.register(m);
    }
    return m;
  }

  /** Local → world position. */
  at(lx: number, lz: number): { x: number; z: number } { return { x: this.origin.x + lx, z: this.origin.z + lz }; }

  private box(x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: THREE.Material, collide = true, boxes?: BuildingBox[]): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(this.origin.x + x, this.origin.y + y, this.origin.z + z);
    this.group.add(mesh);
    if (collide) (boxes ?? this.pending).push({ cx: this.origin.x + x, cy: this.origin.y + y, cz: this.origin.z + z, hx: sx / 2, hy: sy / 2, hz: sz / 2 });
    return mesh;
  }

  private pending: BuildingBox[] = [];

  private build(): void {
    const { w, d, vault, cases, cameras, tint } = this.cfg;
    const wall = this.mat('wall', 0xcfc7b8, 0.38);
    const floor = this.mat('floor', 0x3a3d46, 0.5);
    const ceil = this.mat('ceil', 0xe4e2dc, 0.55);
    const wood = this.mat('wood', 0x6b4a2e, 0.35);
    const steel = this.mat('steel', 0x7c828c, 0.3, 0.35, 0.8);
    const glass = this.mat('glass', 0x9ad7ff, 0.35, 0.1, 0.1);
    const accent = this.mat('accent', tint, 0.6);
    this.emptyMat = this.mat('empty', 0x20232a, 0.1);
    const light = new THREE.MeshBasicMaterial({ color: 0xfff3dc });

    // floor and ceiling (the salt pan underneath is the collision floor)
    this.box(0, 0.04, 0, w + 1, 0.08, d + 1, floor, false);
    this.box(0, WALL_H + 0.1, 0, w + 1, T, d + 1, ceil, false);
    // outer walls: the front (south, -z) has a 2.6 m door gap in the middle
    const hw = w / 2, hd = d / 2;
    this.box(0, WALL_H / 2, hd, w + T, WALL_H, T, wall);
    this.box(-hw, WALL_H / 2, 0, T, WALL_H, d, wall);
    this.box(hw, WALL_H / 2, 0, T, WALL_H, d, wall);
    const gap = 2.6;
    this.box(-(hw + gap / 2) / 2 - 0.0, WALL_H / 2, -hd, hw - gap / 2, WALL_H, T, wall);
    this.box((hw + gap / 2) / 2, WALL_H / 2, -hd, hw - gap / 2, WALL_H, T, wall);
    this.box(0, WALL_H - 0.5, -hd, gap, 1.0, T, accent, false);
    // ceiling light panels
    for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) this.box(ix * (w / 3.2), WALL_H - 0.02, iz * (d / 3.2) * 0.9, 1.6, 0.05, 0.6, light, false);

    // the vault room at the back, with a door in the front wall
    const vw = vault.w, vd = vault.d, vz = hd - vd / 2 - T;
    this.box(0, WALL_H / 2, hd - T - vd, vw, WALL_H, T, steel);
    this.box(-vw / 2, WALL_H / 2, vz, T, WALL_H, vd, steel);
    this.box(vw / 2, WALL_H / 2, vz, T, WALL_H, vd, steel);
    this.vaultMesh = this.box(0, 1.5, hd - T - vd, 2.4, 3, T + 0.1, this.mat('door', 0x4a4f58, 0.25, 0.3, 0.9), false);
    this.pending.push({ cx: this.origin.x, cy: this.origin.y + 1.5, cz: this.origin.z + hd - T - vd, hx: 1.2, hy: 1.5, hz: (T + 0.1) / 2 });
    this.vaultHandle = this.pending.length - 1;
    this.spots.vault = [0, hd - T - vd - 1.6];
    // cash bags inside the vault
    for (let i = 0; i < 3; i++) this.spots.bags.push([-vw / 2 + 1.6 + i * ((vw - 3.2) / 2), vz + 0.9]);
    for (const b of this.spots.bags) this.box(b[0], 0.35, b[1], 0.9, 0.7, 0.9, this.mat('bag', 0x2a7a3a, 0.6), false);

    // counter along the left wall and display cases down the right
    this.box(-hw + 1.6, 0.55, -1, 1.0, 1.1, Math.min(10, d * 0.5), wood);
    for (let i = 0; i < cases; i++) {
      const cz = -hd + 3 + i * ((d - 6 - vd - 2) / Math.max(1, cases - 1));
      const cx = hw - 1.8;
      this.box(cx, 0.45, cz, 1.2, 0.9, 1.6, wood);
      const g = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 1.4), glass);
      g.position.set(this.origin.x + cx, this.origin.y + 1.02, this.origin.z + cz);
      this.group.add(g);
      this.cases.push({ x: this.origin.x + cx - 1.4, z: this.origin.z + cz, taken: false, mesh: g });
    }
    // a staff door and desk in the front-left corner (the manager's keycard / terminal)
    this.box(-hw + 1.6, 0.4, hd - vd - 3.8, 1.6, 0.8, 0.9, wood);
    this.spots.panel = [-hw + 3.0, hd - vd - 3.8];
    this.spots.office = [-hw + 3.0, hd - vd - 3.8];
    this.spots.door = [0, -hd + 1.3];
    // cameras on the walls
    for (let i = 0; i < cameras; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.5), this.mat('cam', 0x2a2d33, 0.2));
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
      eye.position.set(0, 0, -0.28);
      g.add(body, eye);
      const side = i % 2 === 0 ? 1 : -1;
      const lx = side * (hw - 0.4), lz = -hd + 3 + (i >> 1) * (d / Math.max(2, cameras / 2 + 0.5));
      g.position.set(this.origin.x + lx, this.origin.y + WALL_H - 0.5, this.origin.z + lz);
      this.group.add(g);
      this.cams.push({ x: this.origin.x + lx, z: this.origin.z + lz, y: this.origin.y + WALL_H - 0.5, base: side > 0 ? Math.PI : 0, sweep: 0.9, speed: 0.55 + 0.1 * i, range: 15, mesh: g, seen: 0, off: false });
    }
    this.group.traverse((o) => { o.frustumCulled = true; });
  }

  /** Switch the room on: meshes visible and colliders in. */
  enable(): void {
    this.g.world.scene.add(this.group);
    this.handles = this.g.physics!.addBuildings(this.pending);
    this.vaultHandle = this.handles[this.vaultHandle] ?? -1;
  }

  /** Remove the room entirely. */
  dispose(): void {
    this.g.world.scene.remove(this.group);
    this.g.physics!.removeBuildings(this.handles);
    this.handles = [];
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    for (const k of Object.keys(this.mats)) this.mats[k]!.dispose();
  }

  openVault(): void {
    if (this.vaultOpen) return;
    this.vaultOpen = true;
    if (this.vaultMesh) this.vaultMesh.visible = false;
    if (this.vaultHandle >= 0) this.g.physics!.removeBuildings([this.vaultHandle]);
  }

  takeCase(i: number): void {
    const c = this.cases[i];
    if (!c || c.taken) return;
    c.taken = true;
    c.mesh.material = this.emptyMat;
  }

  /** Sweep the cameras; returns the highest "seen" meter (0–1+). */
  updateCams(dt: number, px: number, py: number, pz: number, crouch: boolean): number {
    this.t += dt;
    let top = 0;
    for (const c of this.cams) {
      const a = c.base + Math.sin(this.t * c.speed + c.x) * c.sweep;
      c.mesh.rotation.y = a;
      if (c.off) { c.seen = 0; continue; }
      const dx = px - c.x, dz = pz - c.z;
      const d = Math.hypot(dx, dz);
      const bearing = Math.atan2(-dx, -dz);
      let da = bearing - a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const hit = d < c.range * (crouch ? 0.65 : 1) && Math.abs(da) < 0.55 && Math.abs(py - c.y) < 4;
      c.seen = hit ? Math.min(2, c.seen + dt * 0.85) : Math.max(0, c.seen - dt * 0.6);
      top = Math.max(top, c.seen);
    }
    return top;
  }

  /** The salt pan site bounds (for debug placement). */
  static defaultAt(i: number): { x: number; z: number } { return { x: GEO.salt.x - 150 + i * 80, z: GEO.salt.z }; }
}
