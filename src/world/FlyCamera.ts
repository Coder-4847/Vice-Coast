import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import type { InputManager } from '../input/InputManager';

const MAX_PITCH = THREE.MathUtils.degToRad(89);
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _look = { x: 0, y: 0 };

/**
 * Debug free-fly camera used by the Phase 1 test world to exercise every input device.
 * Movement runs on the fixed step and is interpolated on render; look is applied every
 * rendered frame so aiming stays responsive at any frame rate.
 */
export class FlyCamera {
  yaw = 0;
  pitch = 0;
  private readonly prev = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();

  /** Adopt the pose of an existing camera so hand-off from the title shot is seamless. */
  setFromCamera(camera: THREE.Camera): void {
    _euler.setFromQuaternion(camera.quaternion, 'YXZ');
    this.yaw = _euler.y;
    this.pitch = clamp(_euler.x, -MAX_PITCH, MAX_PITCH);
    this.pos.copy(camera.position);
    this.prev.copy(camera.position);
    this.vel.set(0, 0, 0);
  }

  fixedUpdate(dt: number, input: InputManager, groundAt: (x: number, z: number) => number): void {
    this.prev.copy(this.pos);

    _euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.fwd.set(0, 0, -1).applyEuler(_euler);
    this.right.set(1, 0, 0).applyEuler(_euler);

    const speed = input.active('sprint') ? 60 : 14;
    const up = (input.down('jump') ? 1 : 0) - (input.active('crouch') ? 1 : 0);
    this.wish
      .set(0, 0, 0)
      .addScaledVector(this.fwd, input.move.y)
      .addScaledVector(this.right, input.move.x)
      .addScaledVector(THREE.Object3D.DEFAULT_UP, up)
      .multiplyScalar(speed);

    // Smooth acceleration/deceleration (frame-rate independent).
    const k = this.wish.lengthSq() > 0 ? 7 : 9;
    this.vel.x = damp(this.vel.x, this.wish.x, k, dt);
    this.vel.y = damp(this.vel.y, this.wish.y, k, dt);
    this.vel.z = damp(this.vel.z, this.wish.z, k, dt);
    this.pos.addScaledVector(this.vel, dt);
    // Stay above terrain and the sea surface.
    const floor = Math.max(groundAt(this.pos.x, this.pos.z), 0) + 1.7;
    if (this.pos.y < floor) {
      this.pos.y = floor;
      if (this.vel.y < 0) this.vel.y = 0;
    }
  }

  update(alpha: number, input: InputManager, camera: THREE.PerspectiveCamera): void {
    input.consumeLook(_look);
    this.yaw -= _look.x;
    this.pitch = clamp(this.pitch - _look.y, -MAX_PITCH, MAX_PITCH);
    camera.position.lerpVectors(this.prev, this.pos, alpha);
    camera.quaternion.setFromEuler(_euler.set(this.pitch, this.yaw, 0, 'YXZ'));
  }
}
