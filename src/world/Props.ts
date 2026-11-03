import * as THREE from 'three';
import type { Collider, ImpulseJoint, RigidBody } from '@dimforge/rapier3d-compat';
import { GROUP, type Physics, type Surface } from '../physics/Physics';
import { terrainHeight } from './Terrain';

const groups = (member: number, filter: number): number => ((member << 16) | filter) >>> 0;

interface Prop {
  mesh: THREE.Object3D;
  body: RigidBody;
  collider: Collider;
  prevP: THREE.Vector3;
  prevQ: THREE.Quaternion;
  curP: THREE.Vector3;
  curQ: THREE.Quaternion;
  /** Multiplies the bullet impulse (heavy steel plates need more than cans). */
  impulseScale: number;
  surface: Surface;
  home: { p: THREE.Vector3; q: THREE.Quaternion };
  joint?: ImpulseJoint;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Shootable test range: crates, barrels, cans and swinging steel plates — real rigid bodies. */
export class Props {
  readonly group = new THREE.Group();
  readonly materials: THREE.Material[] = [];
  private readonly props: Prop[] = [];
  private readonly R: Physics['R'];

  private readonly crateMat: THREE.MeshStandardMaterial;
  private readonly barrelMat: THREE.MeshStandardMaterial;
  private readonly canMat: THREE.MeshStandardMaterial;
  private readonly plateMat: THREE.MeshStandardMaterial;
  private readonly steelMat: THREE.MeshStandardMaterial;
  private readonly tableMat: THREE.MeshStandardMaterial;

  constructor(private readonly physics: Physics) {
    this.R = physics.R;
    const rnd = (() => { let s = 42; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

    const crateTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#9a7646'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = `rgba(${60 + rnd() * 40},${40 + rnd() * 30},20,0.35)`;
        g.fillRect(0, i * 43 + 1, 256, 3);
      }
      g.strokeStyle = '#5b4222'; g.lineWidth = 14; g.strokeRect(7, 7, 242, 242);
      g.beginPath(); g.moveTo(10, 10); g.lineTo(246, 246); g.moveTo(246, 10); g.lineTo(10, 246); g.lineWidth = 12; g.stroke();
      for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`; g.fillRect(rnd() * 256, rnd() * 256, 2, 8); }
    });
    this.crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85, metalness: 0 });

    const barrelTex = canvasTex(256, 128, (g) => {
      g.fillStyle = '#b3402e'; g.fillRect(0, 0, 256, 128);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (const y of [10, 40, 88, 118]) g.fillRect(0, y, 256, 6);
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.08})`; g.fillRect(rnd() * 256, rnd() * 128, 3, 3); }
    });
    this.barrelMat = new THREE.MeshStandardMaterial({ map: barrelTex, roughness: 0.55, metalness: 0.65 });

    const canTex = canvasTex(128, 64, (g) => {
      g.fillStyle = '#d8d8d4'; g.fillRect(0, 0, 128, 64);
      g.fillStyle = '#c4362c'; g.fillRect(0, 16, 128, 32);
      g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.fillText('VICE', 26, 40);
    });
    this.canMat = new THREE.MeshStandardMaterial({ map: canTex, roughness: 0.35, metalness: 0.7 });

    const plateTex = canvasTex(128, 128, (g) => {
      g.fillStyle = '#e9e7df'; g.fillRect(0, 0, 128, 128);
      for (const [r, c] of [[58, '#c33'], [38, '#e9e7df'], [20, '#c33']] as const) {
        g.fillStyle = c; g.beginPath(); g.arc(64, 64, r, 0, Math.PI * 2); g.fill();
      }
    });
    this.plateMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.5, metalness: 0.6 });
    this.steelMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.5, metalness: 0.8 });
    this.tableMat = new THREE.MeshStandardMaterial({ color: 0x6b4f30, roughness: 0.8, metalness: 0 });
    this.materials.push(this.crateMat, this.barrelMat, this.canMat, this.plateMat, this.steelMat, this.tableMat);
  }

  /** Lay out the range between x = 104 and x = 140 on the beach-top flat. */
  buildRange(): void {
    const g = (x: number, z: number) => terrainHeight(x, z);

    // Table with cans (static table, dynamic cans)
    const tx = 111;
    const tz = -3.5;
    const ty = g(tx, tz);
    this.addStatic(new THREE.BoxGeometry(2.4, 0.08, 0.9), this.tableMat, tx, ty + 0.9, tz, [1.2, 0.04, 0.45], 'wood');
    for (const dz of [-0.9, 0.9]) for (const dx of [-0.4, 0.4]) {
      this.addStatic(new THREE.BoxGeometry(0.08, 0.9, 0.08), this.tableMat, tx + dx * 2.4, ty + 0.45, tz + dz * 0.45 / 0.9 * 0.9, [0.04, 0.45, 0.04], 'wood');
    }
    for (let i = 0; i < 5; i++) this.addCan(tx - 0.2, ty + 0.98, tz - 0.8 + i * 0.4);

    // Crate pyramid
    const cx = 118;
    const cz = 5;
    const cy = g(cx, cz);
    const s = 0.8;
    for (let i = 0; i < 3; i++) this.addCrate(cx, cy + s / 2, cz + (i - 1) * (s + 0.02), s);
    for (let i = 0; i < 2; i++) this.addCrate(cx, cy + s * 1.5 + 0.01, cz + (i - 0.5) * (s + 0.02), s);
    this.addCrate(cx, cy + s * 2.5 + 0.02, cz, s);
    for (let i = 0; i < 3; i++) this.addCrate(cx + 1.6, cy + s / 2, cz + 0.4 + (i - 1) * (s + 0.05), s);

    // Barrels
    for (const [bx, bz] of [[121, -6], [121, -7.2], [122.2, -6.6], [124, -9]] as const) this.addBarrel(bx, g(bx, bz) + 0.46, bz);

    // Steel plates on swinging frames at 12 / 20 / 28 / 36 m from the firing line (x = 100)
    [[112, -2], [120, 2], [128, -3], [136, 1]].forEach(([x, z]) => this.addPlate(x!, z!));
  }

  private mkBody(desc: ReturnType<typeof this.R.RigidBodyDesc.dynamic>, pos: [number, number, number]): RigidBody {
    return this.physics.world.createRigidBody(desc.setTranslation(pos[0], pos[1], pos[2]));
  }

  private track(mesh: THREE.Object3D, body: RigidBody, collider: Collider, surface: Surface, impulseScale = 1): Prop {
    const p = body.translation();
    const q = body.rotation();
    const prop: Prop = {
      mesh, body, collider, surface, impulseScale,
      prevP: new THREE.Vector3(p.x, p.y, p.z), curP: new THREE.Vector3(p.x, p.y, p.z),
      prevQ: new THREE.Quaternion(q.x, q.y, q.z, q.w), curQ: new THREE.Quaternion(q.x, q.y, q.z, q.w),
      home: { p: new THREE.Vector3(p.x, p.y, p.z), q: new THREE.Quaternion(q.x, q.y, q.z, q.w) },
    };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.props.push(prop);
    this.physics.tagSurface(collider, surface, body);
    return prop;
  }

  private addStatic(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, half: [number, number, number], surface: Surface): void {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
    const col = this.physics.world.createCollider(
      this.R.ColliderDesc.cuboid(half[0], half[1], half[2]).setTranslation(x, y, z).setCollisionGroups(groups(GROUP.WORLD, GROUP.PLAYER | GROUP.PROP)),
    );
    this.physics.tagSurface(col, surface);
  }

  private addCrate(x: number, y: number, z: number, size: number): void {
    const body = this.mkBody(this.R.RigidBodyDesc.dynamic().setLinearDamping(0.1).setAngularDamping(0.3), [x, y, z]);
    const col = this.physics.world.createCollider(
      this.R.ColliderDesc.cuboid(size / 2, size / 2, size / 2).setDensity(260).setFriction(0.8).setRestitution(0.1)
        .setCollisionGroups(groups(GROUP.PROP, GROUP.WORLD | GROUP.PROP | GROUP.PLAYER)), body);
    this.track(new THREE.Mesh(new THREE.BoxGeometry(size, size, size), this.crateMat), body, col, 'wood', 1);
  }

  private addBarrel(x: number, y: number, z: number): void {
    const body = this.mkBody(this.R.RigidBodyDesc.dynamic().setLinearDamping(0.1).setAngularDamping(0.4), [x, y, z]);
    const col = this.physics.world.createCollider(
      this.R.ColliderDesc.cylinder(0.45, 0.3).setDensity(120).setFriction(0.7).setRestitution(0.2)
        .setCollisionGroups(groups(GROUP.PROP, GROUP.WORLD | GROUP.PROP | GROUP.PLAYER)), body);
    this.track(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 20), this.barrelMat), body, col, 'metal', 1);
  }

  private addCan(x: number, y: number, z: number): void {
    const body = this.mkBody(this.R.RigidBodyDesc.dynamic().setLinearDamping(0.05).setAngularDamping(0.1), [x, y, z]);
    const col = this.physics.world.createCollider(
      this.R.ColliderDesc.cylinder(0.06, 0.033).setDensity(500).setFriction(0.5).setRestitution(0.35)
        .setCollisionGroups(groups(GROUP.PROP, GROUP.WORLD | GROUP.PROP | GROUP.PLAYER)), body);
    this.track(new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 14), this.canMat), body, col, 'metal', 1);
  }

  /** A steel plate hanging from a frame on a hinge: swings and rings when shot. */
  private addPlate(x: number, z: number): void {
    const gy = terrainHeight(x, z);
    const top = gy + 1.9;
    // frame: two posts + crossbar (static)
    for (const dz of [-0.55, 0.55]) this.addStatic(new THREE.BoxGeometry(0.08, 1.95, 0.08), this.steelMat, x, gy + 0.975, z + dz, [0.04, 0.975, 0.04], 'metal');
    this.addStatic(new THREE.BoxGeometry(0.08, 0.08, 1.2), this.steelMat, x, top, z, [0.04, 0.04, 0.6], 'metal');

    const hang = 0.12;
    const body = this.mkBody(this.R.RigidBodyDesc.dynamic().setLinearDamping(0.6).setAngularDamping(1.2), [x, top - hang - 0.3, z]);
    const col = this.physics.world.createCollider(
      this.R.ColliderDesc.cuboid(0.02, 0.3, 0.22).setDensity(2200).setFriction(0.4).setRestitution(0.1)
        .setCollisionGroups(groups(GROUP.PROP, GROUP.WORLD | GROUP.PLAYER)), body);
    const frameBody = this.physics.world.createRigidBody(this.R.RigidBodyDesc.fixed().setTranslation(x, top, z));
    const joint = this.physics.world.createImpulseJoint(
      this.R.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.3 + hang, z: 0 }, { x: 0, y: 0, z: 1 }),
      frameBody, body, true,
    );
    const plateGeo = new THREE.BoxGeometry(0.04, 0.6, 0.44);
    const plate = new THREE.Mesh(plateGeo, [this.plateMat, this.plateMat, this.steelMat, this.steelMat, this.plateMat, this.steelMat]);
    const prop = this.track(plate, body, col, 'metal', 6);
    prop.joint = joint;
  }

  /** Store the post-step transform for render interpolation. */
  fixedUpdate(): void {
    for (const p of this.props) {
      p.prevP.copy(p.curP);
      p.prevQ.copy(p.curQ);
      const t = p.body.translation();
      const r = p.body.rotation();
      p.curP.set(t.x, t.y, t.z);
      p.curQ.set(r.x, r.y, r.z, r.w);
    }
  }

  update(alpha: number): void {
    for (const p of this.props) {
      p.mesh.position.lerpVectors(p.prevP, p.curP, alpha);
      p.mesh.quaternion.slerpQuaternions(p.prevQ, p.curQ, alpha);
    }
  }

  /** Bullet impulse at a world point. Returns true if the body is one of ours. */
  hit(body: RigidBody, point: THREE.Vector3, dir: THREE.Vector3, energy: number): boolean {
    const prop = this.props.find((p) => p.body === body);
    if (!prop) return false;
    const k = energy * prop.impulseScale;
    body.applyImpulseAtPoint({ x: dir.x * k, y: dir.y * k, z: dir.z * k }, { x: point.x, y: point.y, z: point.z }, true);
    return true;
  }

  /** Put everything back where it started. */
  reset(): void {
    for (const p of this.props) {
      p.body.setTranslation({ x: p.home.p.x, y: p.home.p.y, z: p.home.p.z }, true);
      p.body.setRotation({ x: p.home.q.x, y: p.home.q.y, z: p.home.q.z, w: p.home.q.w }, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      p.curP.copy(p.home.p); p.prevP.copy(p.home.p);
      p.curQ.copy(p.home.q); p.prevQ.copy(p.home.q);
    }
  }
}
