import * as THREE from 'three';
import { NOISE_GLSL } from './skyGlsl';

/**
 * Ocean: a camera-following plane shaded as glossy PBR water. Reflections come from the live sky
 * (image-based lighting), waves from layered scrolling noise normals, depth colour from the coast
 * profile. Real foam/shoreline/refraction arrive with the Dusk Harbor biome pass.
 */
export class Ocean {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardMaterial;
  /** Wave roughness 0 (glassy) … 1.6 (storm). Driven by the weather. */
  readonly sea = { value: 0.6 };

  constructor() {
    this.material = new THREE.MeshStandardMaterial({ color: 0x0b3340, roughness: 0.07, metalness: 0.0, envMapIntensity: 1.1 });
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.scale.setScalar(30000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  follow(camera: THREE.Camera): void {
    const step = 64;
    this.mesh.position.set(Math.round(camera.position.x / step) * step, 0, Math.round(camera.position.z / step) * step);
  }

  patch = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    shader.uniforms.uSea = this.sea;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nuniform float uSea;\n${NOISE_GLSL}
float wave(vec2 p, float t) {
  return n_noise(p * 0.11 + vec2(t * 0.30, t * 0.12)) * 1.0
       + n_noise(p * 0.37 - vec2(t * 0.40, t * 0.25)) * 0.55
       + n_noise(p * 1.20 + vec2(t * 0.70, -t * 0.50)) * 0.22
       + n_noise(p * 3.10 - vec2(t * 0.90, t * 0.60)) * 0.08;
}
float coastY(float x) { float t = clamp((x + 260.0) / 300.0, 0.0, 1.0); return -70.0 + 74.0 * t * t * (3.0 - 2.0 * t); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float depth = clamp(-coastY(vWPos.x) / 80.0, 0.0, 1.0);
vec3 shallow = vec3(0.03, 0.30, 0.33);
vec3 deep = vec3(0.005, 0.045, 0.09);
diffuseColor.rgb = mix(shallow, deep, smoothstep(0.0, 0.55, depth));
float foamN = n_fbm(vWPos.xz * 0.35 + vec2(uTime * 0.2, 0.0));
float shoreBand = smoothstep(0.075, 0.0, depth);
foam = shoreBand * smoothstep(0.35, 0.75, foamN + 0.25 * sin(vWPos.x * 0.45 - uTime * 0.9)) ;
foam += smoothstep(0.7, 1.0, wave(vWPos.xz, uTime) * 0.45 * uSea) * 0.25 * smoothstep(0.4, 1.2, uSea);
foam = clamp(foam, 0.0, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.95, 1.0), foam);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor + 0.02 * uSea, 0.8, foam);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float e = 0.3;
  float h0 = wave(vWPos.xz, uTime);
  vec2 gr = vec2(wave(vWPos.xz + vec2(e, 0.0), uTime) - h0, wave(vWPos.xz + vec2(0.0, e), uTime) - h0) / e;
  #ifdef USE_FOG
    float dist = length(vFogViewPos);
  #else
    float dist = 0.0;
  #endif
  float amt = (0.10 + 0.22 * uSea) / (1.0 + dist * 0.012);
  normal = normalize(normal + (viewMatrix * vec4(-gr.x * amt, 0.0, -gr.y * amt, 0.0)).xyz);
}`)
      .replace('void main() {', 'float foam = 0.0;\nvoid main() {');
  };
}
