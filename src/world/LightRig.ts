import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { clamp } from '../core/math';
import type { QualityPreset } from '../core/Quality';
import { useAtmosphere, type Atmosphere } from './Atmosphere';
import type { TimeOfDay } from './TimeOfDay';
import type { Weather } from './Weather';

type Patch = (shader: THREE.WebGLProgramParametersWithUniforms) => void;

const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Direct lighting: one key light that is the sun by day and the moon by night (crossfaded at near-zero
 * intensity so the shadow direction never visibly pops), cascaded shadow maps on capable presets,
 * and a hemisphere fill so shadows keep colour. Image-based lighting comes from the Atmosphere.
 */
export class LightRig {
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.1);
  private csm: CSM | null = null;
  private readonly plain = new THREE.DirectionalLight(0xffffff, 1);
  private readonly materials = new Map<THREE.Material, Patch | undefined>();
  private readonly keyDir = new THREE.Vector3(0, -1, 0);
  private readonly keyColor = new THREE.Color();
  /** Current key light intensity (read by the pipeline for lens flare strength). */
  sunVisibility = 1;
  keyIntensity = 0;

  constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera, preset: QualityPreset) {
    scene.add(this.hemi, this.plain, this.plain.target);
    this.build(preset);
  }

  /** Register a material that should receive shadows + atmosphere. Optional `patch` adds custom shader code. */
  register(material: THREE.Material, patch?: Patch): void {
    this.materials.set(material, patch);
    this.wire(material, patch);
  }

  private wire(material: THREE.Material, patch?: Patch): void {
    // Order matters: CSM installs its own onBeforeCompile, then the atmosphere + custom patch chain on top.
    this.csm?.setupMaterial(material);
    useAtmosphere(material, patch);
    material.needsUpdate = true;
  }

  setQuality(preset: QualityPreset): void {
    this.build(preset);
  }

  private build(preset: QualityPreset): void {
    if (this.csm) {
      this.csm.remove();
      this.csm.dispose();
      this.csm = null;
    }
    this.plain.castShadow = false;
    this.plain.visible = true;
    if (preset.shadows && preset.cascades > 0) {
      this.plain.visible = false;
      this.csm = new CSM({
        camera: this.camera,
        parent: this.scene,
        cascades: preset.cascades,
        maxFar: preset.shadowDistance,
        mode: 'practical',
        shadowMapSize: preset.shadowMapSize,
        shadowBias: -0.0004,
        lightDirection: this.keyDir.clone(),
        lightIntensity: 3,
        lightNear: 1,
        lightFar: 1500,
        lightMargin: 320,
      });
      this.csm.fade = preset.cascades > 2;
      for (const l of this.csm.lights) l.shadow.normalBias = 0.35;
    }
    for (const [m, patch] of this.materials) {
      m.onBeforeCompile = () => {};
      this.wire(m, patch);
    }
  }

  update(tod: TimeOfDay, weather: Weather, atmos: Atmosphere, flash: number): void {
    const look = tod.look;
    const elev = tod.sunElev;
    const cur = weather.current;

    // Sun strength fades out just before the horizon; moon takes over once it is dark.
    const sunI = smooth(-3.5, 3, elev) * 3.6 * cur.sun * (0.35 + 0.65 * smooth(0, 14, elev));
    const moonUp = smooth(-4, 8, tod.moonDir.y);
    const moonI = (1 - smooth(-11, -2, elev)) * moonUp * 0.42 * (1 - 0.7 * cur.overcast);

    let intensity: number;
    if (sunI >= moonI) {
      this.keyDir.copy(tod.sunDir).negate();
      this.keyColor.copy(atmos.sunColor);
      intensity = sunI;
    } else {
      this.keyDir.copy(tod.moonDir).negate();
      this.keyColor.copy(atmos.moonColor);
      intensity = moonI;
    }
    // Lightning briefly lights the world from above.
    intensity += flash * 2.2;
    if (flash > 0) this.keyColor.lerp(new THREE.Color(0.75, 0.82, 1), clamp(flash, 0, 0.7));
    this.keyIntensity = intensity;

    if (this.csm) {
      this.csm.lightDirection.copy(this.keyDir);
      this.csm.update();
      for (const l of this.csm.lights) {
        l.intensity = intensity;
        l.color.copy(this.keyColor);
      }
    } else {
      this.plain.position.copy(this.camera.position).addScaledVector(this.keyDir, -200);
      this.plain.target.position.copy(this.camera.position);
      this.plain.intensity = intensity;
      this.plain.color.copy(this.keyColor);
    }

    // Fill light keeps shadowed faces coloured, strongest at night/twilight.
    this.hemi.color.copy(look.fillSky);
    this.hemi.groundColor.copy(look.fillGround);
    this.hemi.intensity = look.fillIntensity * (1 + 0.5 * cur.overcast) + flash * 0.6;
  }

  /** Call on camera aspect/FOV changes. */
  onResize(): void {
    this.csm?.updateFrustums();
  }

  dispose(): void {
    this.csm?.remove();
    this.csm?.dispose();
  }
}
