import * as THREE from 'three';
import { damp } from '../core/math';

export type WeatherType = 'clear' | 'cloudy' | 'overcast' | 'rain' | 'storm' | 'fog' | 'dust' | 'snow';

export const WEATHER_TYPES: { id: WeatherType; label: string }[] = [
  { id: 'clear', label: 'Clear' },
  { id: 'cloudy', label: 'Cloudy' },
  { id: 'overcast', label: 'Overcast' },
  { id: 'rain', label: 'Rain' },
  { id: 'storm', label: 'Storm' },
  { id: 'fog', label: 'Fog' },
  { id: 'dust', label: 'Dust' },
  { id: 'snow', label: 'Snow' },
];

/** Everything the renderer needs to know about the weather; blended continuously between presets. */
export interface WeatherParams {
  coverage: number;
  cloudDark: number;
  cloudDensity: number;
  /** FogExp2 density (per metre). */
  fog: number;
  fogFalloff: number;
  /** 0–1: how strongly the sky is desaturated toward `tint`. */
  overcast: number;
  /** Direct sunlight multiplier. */
  sun: number;
  rain: number;
  snow: number;
  dust: number;
  /** Target road/facade wetness. */
  wet: number;
  turbidity: number;
  /** Wind speed in m/s (clouds, particles). */
  wind: number;
  exposure: number;
  saturation: number;
  tint: THREE.Color;
}

const P = (o: Partial<Omit<WeatherParams, 'tint'>> & { tint?: string }): WeatherParams => ({
  coverage: 0.3, cloudDark: 0, cloudDensity: 0.55, fog: 0.00042, fogFalloff: 0.0025, overcast: 0, sun: 1,
  rain: 0, snow: 0, dust: 0, wet: 0, turbidity: 2.2, wind: 4, exposure: 1, saturation: 1,
  ...o,
  tint: new THREE.Color(o.tint ?? '#9aa3b0'),
});

const PRESETS: Record<WeatherType, WeatherParams> = {
  clear: P({ coverage: 0.3, cloudDensity: 0.5 }),
  cloudy: P({ coverage: 0.58, cloudDensity: 0.7, fog: 0.0005, overcast: 0.12, sun: 0.85, wind: 7 }),
  overcast: P({ coverage: 0.9, cloudDark: 0.35, cloudDensity: 1.0, fog: 0.0007, overcast: 0.65, sun: 0.3, wind: 8, exposure: 1.05, saturation: 0.82, turbidity: 3 }),
  rain: P({ coverage: 0.95, cloudDark: 0.6, cloudDensity: 1.2, fog: 0.0012, fogFalloff: 0.0018, overcast: 0.8, sun: 0.18, rain: 0.75, wet: 1, wind: 11, exposure: 1.08, saturation: 0.78, turbidity: 4, tint: '#7d8794' }),
  storm: P({ coverage: 1, cloudDark: 0.9, cloudDensity: 1.5, fog: 0.0016, fogFalloff: 0.0016, overcast: 0.9, sun: 0.1, rain: 1, wet: 1, wind: 18, exposure: 1.14, saturation: 0.7, turbidity: 5, tint: '#59616d' }),
  fog: P({ coverage: 0.7, cloudDark: 0.15, cloudDensity: 0.9, fog: 0.0048, fogFalloff: 0.0011, overcast: 0.85, sun: 0.35, wet: 0.35, wind: 2, saturation: 0.78, turbidity: 3, tint: '#a9b2bc' }),
  dust: P({ coverage: 0.2, cloudDensity: 0.4, fog: 0.0022, fogFalloff: 0.0014, overcast: 0.85, sun: 0.55, dust: 1, wind: 14, saturation: 0.95, turbidity: 6, tint: '#c28a52' }),
  snow: P({ coverage: 0.92, cloudDark: 0.25, cloudDensity: 1.0, fog: 0.0013, fogFalloff: 0.0018, overcast: 0.75, sun: 0.35, snow: 1, wind: 5, exposure: 1.06, saturation: 0.75, turbidity: 3, tint: '#aab6c6' }),
};

type NumKey = { [K in keyof WeatherParams]: WeatherParams[K] extends number ? K : never }[keyof WeatherParams];
const NUM_KEYS: NumKey[] = [
  'coverage', 'cloudDark', 'cloudDensity', 'fog', 'fogFalloff', 'overcast', 'sun', 'rain', 'snow', 'dust',
  'wet', 'turbidity', 'wind', 'exposure', 'saturation',
];

export interface PrecipQuality {
  rain: number;
  snow: number;
  dust: number;
}

/** A box of GPU-animated particles that wraps around the camera (no per-frame CPU work). */
class ParticleField {
  readonly object: THREE.Object3D;
  readonly material: THREE.ShaderMaterial;

  constructor(kind: 'rain' | 'snow' | 'dust', count: number, box: THREE.Vector3) {
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = Math.random();
      seeds[i * 4 + 1] = Math.random();
      seeds[i * 4 + 2] = Math.random();
      seeds[i * 4 + 3] = Math.random();
    }
    const common = /* glsl */ `
      uniform float uTime; uniform float uIntensity; uniform vec3 uCam; uniform vec3 uBox; uniform vec3 uVel;
      attribute vec4 aSeed;
      varying float vA;
      vec3 cell(vec4 s) {
        vec3 p = s.xyz * uBox + uVel * uTime;
        return mod(p - uCam, uBox) - 0.5 * uBox;
      }
    `;
    const geo = new THREE.BufferGeometry();
    const uniforms = {
      uTime: { value: 0 }, uIntensity: { value: 0 }, uCam: { value: new THREE.Vector3() },
      uBox: { value: box }, uVel: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color('#cfd8e6') },
      uAlpha: { value: 0.3 }, uSize: { value: 1 }, uScale: { value: 800 },
    };
    if (kind === 'rain') {
      const pos = new Float32Array(count * 2 * 3);
      const seed2 = new Float32Array(count * 2 * 4);
      const end = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        for (let k = 0; k < 2; k++) {
          for (let c = 0; c < 4; c++) seed2[(i * 2 + k) * 4 + c] = seeds[i * 4 + c]!;
          end[i * 2 + k] = k;
        }
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed2, 4));
      geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
      this.material = new THREE.ShaderMaterial({
        uniforms, transparent: true, depthWrite: false, fog: false,
        vertexShader: /* glsl */ `${common}
          attribute float aEnd;
          void main() {
            vec3 p = cell(aSeed);
            vec3 pos = p - normalize(uVel) * 0.9 * aEnd;
            float vis = step(aSeed.w, uIntensity);
            float fade = 1.0 - smoothstep(0.3, 0.5, length(p.xz) / uBox.x);
            vA = vis * fade * (1.0 - 0.7 * aEnd);
            gl_Position = projectionMatrix * viewMatrix * vec4(uCam + pos, 1.0);
          }`,
        fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uAlpha; varying float vA;
          void main() { gl_FragColor = vec4(uColor, vA * uAlpha); }`,
      });
      this.object = new THREE.LineSegments(geo, this.material);
    } else {
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
      const snow = kind === 'snow';
      this.material = new THREE.ShaderMaterial({
        uniforms, transparent: true, depthWrite: false, fog: false,
        vertexShader: /* glsl */ `${common}
          uniform float uSize; uniform float uScale;
          void main() {
            vec3 p = cell(aSeed);
            ${snow ? 'p.x += sin(uTime * 1.3 + aSeed.w * 40.0) * 0.5; p.z += cos(uTime * 1.1 + aSeed.x * 40.0) * 0.5;' : 'p.y += sin(uTime * 0.6 + aSeed.w * 30.0) * 1.2;'}
            vec4 mv = viewMatrix * vec4(uCam + p, 1.0);
            float vis = step(aSeed.w, uIntensity);
            float fade = 1.0 - smoothstep(0.3, 0.5, length(p.xz) / uBox.x);
            float near = smoothstep(0.4, 1.5, -mv.z);
            vA = vis * fade * near;
            gl_PointSize = max(1.0, uSize * (0.6 + aSeed.x) * uScale / max(-mv.z, 0.1));
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uAlpha; varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            float soft = 1.0 - smoothstep(0.2, 1.0, d);
            gl_FragColor = vec4(uColor, vA * uAlpha * soft);
          }`,
      });
      this.object = new THREE.Points(geo, this.material);
    }
    this.object.frustumCulled = false;
    this.object.visible = false;
    this.object.renderOrder = 10;
  }
}

/**
 * Weather state machine: blends parameters between presets, drives precipitation, wetness and lightning.
 * `current` is what the rest of the renderer reads.
 */
export class Weather {
  type: WeatherType = 'clear';
  readonly current: WeatherParams = { ...PRESETS.clear, tint: PRESETS.clear.tint.clone() };
  /** Road/facade wetness, rises while it rains and dries slowly. */
  wetness = 0;
  /** Lightning flash 0–1 this frame. */
  flash = 0;
  /** Seconds to blend between presets. */
  blendTime = 14;
  /** Wind phase accumulator so cloud drift is continuous when wind speed changes. */
  windPhase = 0;

  readonly group = new THREE.Group();
  private fields!: { rain: ParticleField; snow: ParticleField; dust: ParticleField };
  private readonly bolt: THREE.LineSegments;
  private readonly boltMaterial: THREE.LineBasicMaterial;
  private boltLife = 0;
  private nextStrike = 6;
  private flashes: { t0: number; amp: number }[] = [];
  private clock = 0;
  private pendingInstant = false;
  private readonly vel = new THREE.Vector3();
  private readonly colA = new THREE.Color();
  private readonly light = new THREE.Color();

  constructor(quality: PrecipQuality) {
    this.buildFields(quality);
    this.boltMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(7, 8, 12), transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending,
    });
    this.bolt = new THREE.LineSegments(new THREE.BufferGeometry(), this.boltMaterial);
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    this.group.add(this.bolt);
  }

  /** (Re)create particle fields when the quality preset changes. */
  buildFields(q: PrecipQuality): void {
    if (this.fields) {
      for (const f of Object.values(this.fields)) {
        this.group.remove(f.object);
        (f.object as THREE.Points).geometry.dispose();
        f.material.dispose();
      }
    }
    this.fields = {
      rain: new ParticleField('rain', q.rain, new THREE.Vector3(34, 22, 34)),
      snow: new ParticleField('snow', q.snow, new THREE.Vector3(34, 22, 34)),
      dust: new ParticleField('dust', q.dust, new THREE.Vector3(60, 18, 60)),
    };
    this.group.add(this.fields.rain.object, this.fields.snow.object, this.fields.dust.object);
  }

  set(type: WeatherType, instant = false): void {
    this.type = type;
    this.pendingInstant = instant;
    if (type === 'storm') this.nextStrike = 1.5 + Math.random() * 3;
  }

  /** Indoors: no rain, snow or dust around the camera. */
  sheltered = false;

  update(dt: number, camera: THREE.Camera, viewportHeightPx: number, skyLuma: number): void {
    this.clock += dt;
    const target = PRESETS[this.type];
    const cur = this.current;
    const k = this.pendingInstant ? 1000 : 3 / Math.max(1, this.blendTime);
    this.pendingInstant = false;
    for (const key of NUM_KEYS) cur[key] = damp(cur[key], target[key], k, dt);
    cur.tint.lerp(target.tint, 1 - Math.exp(-k * dt));

    // Wetness: soaks quickly, dries over ~2 minutes of game-independent time.
    const wetTarget = target.wet;
    this.wetness += (wetTarget - this.wetness) * (wetTarget > this.wetness ? 0.08 : 0.008) * Math.min(dt * 10, 1);
    this.wetness = Math.min(1, Math.max(0, this.wetness));

    this.windPhase += dt * (0.4 + cur.wind * 0.12);

    // Precipitation fields
    const f = this.fields;
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 60;
    const scale = viewportHeightPx / (2 * Math.tan((fov * Math.PI) / 360));
    const wind = cur.wind * 0.35;
    this.light.setScalar(0.35 + 0.65 * Math.min(1, skyLuma * 2.2));

    const setField = (field: ParticleField, intensity: number, vx: number, vy: number, vz: number, hex: string, boost: number, alpha: number, size = 1) => {
      field.object.visible = intensity > 0.01 && !this.sheltered;
      if (!field.object.visible) return;
      const u = field.material.uniforms;
      u.uTime!.value = this.clock;
      u.uIntensity!.value = Math.min(1, intensity);
      u.uCam!.value.copy(camera.position);
      u.uVel!.value.copy(this.vel.set(vx, vy, vz));
      u.uColor!.value.copy(this.colA.set(hex)).multiply(this.light).multiplyScalar(boost);
      u.uAlpha!.value = alpha;
      u.uSize!.value = size;
      u.uScale!.value = scale;
    };
    setField(f.rain, cur.rain, wind, -17, wind * 0.4, '#c4d0e0', 1, 0.38);
    setField(f.snow, cur.snow, wind * 0.5, -1.5, wind * 0.2, '#ffffff', 1.5, 0.9, 0.07);
    setField(f.dust, cur.dust, wind * 1.8, -0.2, wind * 0.5, '#d9a066', 1, 0.1, 0.45);

    this.updateLightning(dt, camera);
  }

  private updateLightning(dt: number, camera: THREE.Camera): void {
    const storm = this.type === 'storm' ? 1 : this.type === 'rain' ? 0.15 : 0;
    if (storm > 0 && this.current.rain > 0.5) {
      this.nextStrike -= dt * (storm > 0.5 ? 1 : 0.25);
      if (this.nextStrike <= 0) {
        this.strike(camera);
        this.nextStrike = 4 + Math.random() * 10;
      }
    }
    let flash = 0;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i]!;
      const age = this.clock - fl.t0;
      if (age < 0) continue;
      flash = Math.max(flash, fl.amp * Math.exp(-age * 13));
      if (age > 1.2) this.flashes.splice(i, 1);
    }
    this.flash = flash;
    if (this.boltLife > 0) {
      this.boltLife -= dt;
      this.bolt.visible = this.boltLife > 0;
      this.boltMaterial.opacity = Math.min(1, this.boltLife * 9) * (0.6 + 0.4 * Math.sin(this.clock * 90));
    }
  }

  /** Trigger a bolt + multi-pulse flash. Exposed so the environment menu can fire one on demand. */
  strike(camera: THREE.Camera): void {
    const ang = Math.random() * Math.PI * 2;
    const dist = 500 + Math.random() * 1200;
    const base = new THREE.Vector3(camera.position.x + Math.cos(ang) * dist, 0, camera.position.z + Math.sin(ang) * dist);
    const top = base.clone().setY(520 + Math.random() * 200);
    const segs: number[] = [];
    const jag = (a: THREE.Vector3, b: THREE.Vector3, offset: number, depth: number) => {
      if (depth === 0) {
        segs.push(a.x, a.y, a.z, b.x, b.y, b.z);
        return;
      }
      const m = a.clone().add(b).multiplyScalar(0.5);
      m.x += (Math.random() - 0.5) * offset;
      m.z += (Math.random() - 0.5) * offset;
      jag(a, m, offset * 0.55, depth - 1);
      jag(m, b, offset * 0.55, depth - 1);
      if (depth > 2 && Math.random() < 0.3) {
        const branch = m.clone().add(new THREE.Vector3((Math.random() - 0.5) * 160, -60 - Math.random() * 120, (Math.random() - 0.5) * 160));
        jag(m, branch, offset * 0.5, depth - 2);
      }
    };
    jag(top, base, 120, 6);
    this.bolt.geometry.dispose();
    this.bolt.geometry = new THREE.BufferGeometry();
    this.bolt.geometry.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    this.boltLife = 0.28;
    this.bolt.visible = true;
    const t = this.clock;
    this.flashes.push({ t0: t, amp: 1 }, { t0: t + 0.09, amp: 0.45 }, { t0: t + 0.19, amp: 0.95 }, { t0: t + 0.45, amp: 0.35 });
  }
}
