import * as THREE from 'three';

/**
 * Placeholder sunset sky dome (gradient + sun disc). Phase 2 replaces it with a physically
 * based sky driven by the day/night cycle; this keeps Phase 1 worlds from looking empty.
 */
export class Sky {
  readonly mesh: THREE.Mesh;
  readonly sunDirection = new THREE.Vector3();
  readonly horizon = new THREE.Color('#ff9d6b');
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color('#10204f') },
        uMid: { value: new THREE.Color('#9a4f78') },
        uHorizon: { value: this.horizon },
        uGround: { value: new THREE.Color('#5a3a40') },
        uSunDir: { value: this.sunDirection },
        uSunColor: { value: new THREE.Color('#ffd7a8') },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith, uMid, uHorizon, uGround, uSunDir, uSunColor;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.25, h));
          col = mix(col, uZenith, smoothstep(0.15, 0.85, h));
          col = mix(col, uGround, smoothstep(0.0, -0.35, h));
          float s = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunColor * (pow(s, 900.0) * 14.0 + pow(s, 24.0) * 0.55 + pow(s, 5.0) * 0.18);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  setSun(elevationDeg: number, azimuthDeg: number): void {
    const el = THREE.MathUtils.degToRad(elevationDeg);
    const az = THREE.MathUtils.degToRad(azimuthDeg);
    this.sunDirection.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  }

  follow(camera: THREE.Camera, radius: number): void {
    this.mesh.position.copy(camera.position);
    this.mesh.scale.setScalar(radius);
  }
}
