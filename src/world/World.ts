import * as THREE from 'three';
import type { GameRenderer } from '../core/GameRenderer';
import type { PostParams } from '../core/RenderPipeline';
import { RenderPipeline } from '../core/RenderPipeline';
import type { QualityPreset } from '../core/Quality';
import { clamp, damp } from '../core/math';
import { GROUP, type Physics } from '../physics/Physics';
import { Atmosphere } from './Atmosphere';
import { SignalClock } from '../npc/Signals';
import { City } from './City';
import { FerrisWheel, HillRoad, WaypointBeacon } from './Landmarks';
import { LightRig } from './LightRig';
import { Ocean } from './Ocean';
import { Roads } from './RoadMeshes';
import { Props } from './Props';
import { Terrain, terrainHeight, CITY } from './Terrain';
import type { TerrainData } from './TerrainData';
import { TimeOfDay } from './TimeOfDay';
import { Weather, type WeatherType } from './Weather';

const _v = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/**
 * The Phase 2 world: physically-based sky and day/night cycle, weather, cascaded-shadow lighting,
 * procedural terrain + ocean, a placeholder city, and the HDR post-processing pipeline.
 */
export class World {
  /** Emissive-instance patch (traffic lights, siren bars): glow in the instance colour. */
  static glow = City.glowPatch;

  readonly scene = new THREE.Scene();
  readonly tod = new TimeOfDay();
  readonly weather: Weather;
  readonly atmosphere: Atmosphere;
  readonly rig: LightRig;
  readonly terrain: Terrain;
  readonly ocean = new Ocean();
  readonly signals = new SignalClock();
  readonly city = new City(this.signals);
  readonly hillRoad: HillRoad;
  readonly roads = new Roads();
  readonly wheel = new FerrisWheel();
  readonly beacon = new WaypointBeacon();
  readonly pipeline: RenderPipeline;
  props: Props | null = null;

  private readonly post: PostParams = {
    exposure: 1, tint: new THREE.Color(1, 1, 1), saturation: 1, bloom: 0.3, vignette: 0.25, flash: 0, time: 0,
    sunUv: new THREE.Vector2(0.5, 0.5), sunVisibility: 0, sunColor: new THREE.Color(1, 1, 1),
  };
  private sunVis = 0;
  private sunOccluded = 0;
  private frame = 0;
  private clock = 0;

  physics: Physics | null = null;

  constructor(private readonly gfx: GameRenderer, private readonly camera: THREE.PerspectiveCamera, preset: QualityPreset) {
    this.scene.background = null;
    this.weather = new Weather({ rain: preset.rain, snow: preset.snow, dust: preset.dust });
    this.atmosphere = new Atmosphere(gfx.renderer, this.scene, { cloudOctaves: preset.cloudOctaves, envSize: preset.envSize, envInterval: preset.envInterval });
    this.rig = new LightRig(this.scene, camera, preset);
    this.terrain = new Terrain(preset.terrainSegments);

    this.rig.register(this.terrain.material, Terrain.patch);
    this.rig.register(this.ocean.material, this.ocean.patch);
    this.rig.register(this.city.buildingMaterial, City.patch);
    this.rig.register(this.city.poleMaterial);
    this.rig.register(this.city.headMaterial);
    this.rig.register(this.city.signalMaterial, City.signalPatch);
    this.rig.register(this.city.trunkMaterial);
    this.rig.register(this.city.leafMaterial);
    this.rig.register(this.city.vegMaterial);

    this.city.configure(preset, camera.position.x, camera.position.z);
    this.hillRoad = new HillRoad(this.city.plan);
    this.rig.register(this.hillRoad.material);
    this.rig.register(this.roads.material, Roads.patch);
    this.rig.register(this.roads.dirtMaterial, Roads.patch);
    this.rig.register(this.wheel.frameMaterial);
    this.rig.register(this.wheel.cabinMaterial);
    this.scene.add(this.roads.group, this.hillRoad.mesh, this.wheel.group, this.beacon.mesh, this.atmosphere.group, this.ocean.mesh, this.terrain.mesh, this.city.group, this.weather.group);

    this.pipeline = new RenderPipeline(gfx, this.scene, camera);
    this.pipeline.hideForAO.push(this.atmosphere.group, this.ocean.mesh, this.city.pools, this.weather.group, this.beacon.mesh);
    const size = this.drawingSize();
    this.pipeline.configure(preset, size.x, size.y);
    gfx.onResize = (w, h) => {
      this.pipeline.setSize(w, h);
      this.rig.onResize();
    };
    this.atmosphere.markEnvDirty();
  }

  /** Called once Rapier has loaded: builds the static colliders and the shooting range. */
  /** Hand the baked heightfield to the GPU. */
  terrainData: TerrainData | null = null;

  attachTerrain(data: TerrainData): void {
    this.terrainData = data;
    this.terrain.attach(data);
    this.atmosphere.markEnvDirty();
  }

  attachPhysics(physics: Physics): void {
    this.physics = physics;
    physics.buildTerrain();
    this.city.attachPhysics(physics);
    this.props = new Props(physics);
    this.props.buildRange();
    for (const m of this.props.materials) this.rig.register(m);
    this.scene.add(this.props.group);
  }

  private drawingSize(): THREE.Vector2 {
    return this.gfx.renderer.getDrawingBufferSize(new THREE.Vector2());
  }

  applyQuality(preset: QualityPreset): void {
    this.rig.setQuality(preset);
    this.atmosphere.setQuality({ cloudOctaves: preset.cloudOctaves, envSize: preset.envSize, envInterval: preset.envInterval });
    this.terrain.rebuild(preset.terrainSegments);
    this.city.configure(preset, this.camera.position.x, this.camera.position.z);
    this.weather.buildFields({ rain: preset.rain, snow: preset.snow, dust: preset.dust });
    const size = this.drawingSize();
    this.pipeline.configure(preset, size.x, size.y);
  }

  get instanceCount(): number {
    return this.city.instanceCount;
  }

  heightAt(x: number, z: number): number {
    return terrainHeight(x, z);
  }

  setHour(h: number): void {
    this.tod.setHour(h);
    this.atmosphere.markEnvDirty();
  }

  setWeather(type: WeatherType, instant = false): void {
    this.weather.set(type, instant);
    if (instant) this.atmosphere.markEnvDirty();
  }

  update(dt: number, running: boolean, playing = running): void {
    this.clock += dt;
    this.frame++;
    const cam = this.camera;
    if (running) this.tod.advance(dt);
    if (playing) this.signals.update(dt);
    const w = this.weather;
    w.update(dt, cam, this.gfx.renderer.domElement.height, this.atmosphere.skyLuma);
    this.atmosphere.update(dt, cam, this.tod, w, w.flash);
    this.rig.update(this.tod, w, this.atmosphere, w.flash);

    const look = this.tod.look;
    this.city.setNight(look.night, w.wetness);
    this.city.update(dt, cam.position.x, cam.position.z);
    this.wheel.update(running ? dt : 0, look.night);
    this.ocean.follow(cam);
    this.ocean.sea.value = clamp(0.3 + w.current.wind / 13, 0.3, 1.7);
    this.updateSunVisibility(dt);

    // Compose final-grade parameters from time of day + weather.
    const p = this.post;
    p.exposure = look.exposure * w.current.exposure;
    p.tint.copy(look.tint);
    p.saturation = look.saturation * w.current.saturation;
    p.bloom = look.bloom;
    p.vignette = look.vignette;
    p.flash = w.flash;
    p.time = this.clock;
    p.sunColor.copy(this.atmosphere.sunColor).multiplyScalar(1.1);
    p.sunVisibility = this.sunVis;
  }

  /** Sun occlusion by terrain/buildings/clouds, smoothed, plus its screen position for the lens flare. */
  private updateSunVisibility(dt: number): void {
    const cam = this.camera;
    const sd = this.tod.sunDir;
    let target = 0;
    _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    if (sd.y > 0.01 && _fwd.dot(sd) > 0.1) {
      // terrain: march the sun ray
      let blocked = false;
      const o = cam.position;
      for (let i = 1; i <= 28 && !blocked; i++) {
        const t = 8 * Math.pow(1.22, i);
        if (terrainHeight(o.x + sd.x * t, o.z + sd.z * t) > o.y + sd.y * t) blocked = true;
      }
      // buildings: cheap raycast every few frames
      if (!blocked && this.physics && this.frame % 3 === 0) {
        this.sunOccluded = this.physics.raycast(o, sd, 3000, undefined, GROUP.WORLD) ? 1 : 0;
      }
      if (!blocked && !this.sunOccluded) {
        target = 1 - clamp(this.weather.current.coverage * 1.15 - 0.15, 0, 1) * 0.92;
        target *= clamp(sd.y * 12, 0, 1);
      }
    }
    this.sunVis = damp(this.sunVis, target, 6, dt);
    _v.copy(cam.position).addScaledVector(sd, 1000).project(cam);
    this.post.sunUv.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
  }

  render(dt: number): void {
    if (this.gfx.contextLost) return;
    this.camera.updateMatrixWorld();
    this.terrain.update(this.camera);
    this.pipeline.render(dt, this.post);
  }
}

export { CITY };
