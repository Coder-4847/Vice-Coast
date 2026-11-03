import * as THREE from 'three';
import type { InputState } from '../input/InputManager';

/**
 * Phase 1 placeholder world: a flat ground, a grid of pillars, and a free-walk
 * camera so every input method has something visible to drive.
 * Replaced by the real sky, lighting and terrain in Phase 2.
 */
export class TestWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);

  private pos = new THREE.Vector3(0, 1.7, 8);
  private prevPos = this.pos.clone();
  private yaw = 0;
  private pitch = 0;
  private velY = 0;
  private sun = new THREE.DirectionalLight(0xffe2c0, 2.2);

  constructor() {
    const sky = new THREE.Color(0xb9c6cf);
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 60, 300);

    this.scene.add(new THREE.HemisphereLight(0xdfe8ee, 0x3b3f42, 0.9));
    this.sun.position.set(40, 60, 20);
    this.sun.castShadow = true;
    this.sun.shadow.camera.left = -60;
    this.sun.shadow.camera.right = 60;
    this.sun.shadow.camera.top = 60;
    this.sun.shadow.camera.bottom = -60;
    this.scene.add(this.sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1000, 1000),
      new THREE.MeshStandardMaterial({ color: 0x6b7075, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(1000, 250, 0x4a4f54, 0x555a5f);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    grid.position.y = 0.01;
    this.scene.add(grid);

    const mat = new THREE.MeshStandardMaterial({ color: 0xcfd4d8, roughness: 0.7 });
    const geo = new THREE.BoxGeometry(2, 1, 2);
    const count = 12 * 12;
    const pillars = new THREE.InstancedMesh(geo, mat, count);
    pillars.castShadow = true;
    pillars.receiveShadow = true;
    const m = new THREE.Matrix4();
    let i = 0;
    for (let gx = -6; gx < 6; gx++) {
      for (let gz = -6; gz < 6; gz++) {
        const h = 1 + ((gx * 7 + gz * 13) & 7);
        m.compose(
          new THREE.Vector3(gx * 14 + 7, h / 2, gz * 14 - 20),
          new THREE.Quaternion(),
          new THREE.Vector3(1, h, 1),
        );
        pillars.setMatrixAt(i++, m);
      }
    }
    this.scene.add(pillars);
  }

  applyQuality(shadows: boolean, shadowMapSize: number, viewDistance: number): void {
    this.sun.castShadow = shadows;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.camera.far = viewDistance;
    this.camera.updateProjectionMatrix();
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.far = viewDistance * 0.9;
      this.scene.fog.near = viewDistance * 0.2;
    }
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Fixed-step simulation. */
  update(dt: number, input: InputState, sensitivity: number): void {
    this.prevPos.copy(this.pos);

    this.yaw -= input.lookX * sensitivity;
    this.pitch -= input.lookY * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);

    const speed = input.sprint ? 9 : 4.5;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const fx = -sin;
    const fz = -cos;
    const rx = cos;
    const rz = -sin;
    this.pos.x += (fx * input.moveY + rx * input.moveX) * speed * dt;
    this.pos.z += (fz * input.moveY + rz * input.moveX) * speed * dt;

    this.velY -= 22 * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= 1.7) {
      this.pos.y = 1.7;
      this.velY = 0;
      if (input.jump) this.velY = 7;
    }
  }

  /** Per-frame render with interpolation between the last two sim states. */
  render(alpha: number): void {
    this.camera.position.lerpVectors(this.prevPos, this.pos, alpha);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
