import * as THREE from 'three';
import type { AmbienceBed, AudioEngine, NatureBed, SirenVoice, StreetMusic } from '../audio/AudioEngine';
import { TerrainData } from '../world/TerrainData';
import { terrainHeight } from '../world/Terrain';
import { CITY } from '../world/Terrain';
import type { CityPlan } from '../world/city/plan';
import { mulberry32 } from '../world/city/plan';
import type { Ped, Pedestrians } from './Pedestrians';
import type { Traffic, TrafficCar } from './Traffic';

const G: number = CITY.height;

type Kind = 'accident' | 'musician' | 'protest' | 'beach' | 'patrol';

interface AmbientEvent {
  kind: Kind;
  x: number;
  z: number;
  ttl: number;
  age: number;
  peds: Ped[];
  cars: TrafficCar[];
  music: StreetMusic | null;
  /** Second responder to dispatch after a delay (accident only). */
  pending: { kind: 'ambulance' | 'police'; at: number }[];
}

export interface AmbientContext {
  x: number;
  z: number;
  hour: number;
  frustum: THREE.Frustum;
}

/**
 * The living-world director: schedules street events around the player (a crash with an emergency response, a busker with an
 * audience, a protest march, the beach crowd), keeps seagulls overhead near the coast, drives the siren voices and the
 * city-wide ambience bed. Everything is placed out of sight where possible and cleaned up when the player moves on.
 */
export class Ambient {
  private readonly rnd = mulberry32((Date.now() >>> 5) & 0xffffff);
  private readonly events: AmbientEvent[] = [];
  private readonly timers: Record<Kind, number> = { accident: 40, musician: 14, protest: 70, beach: 3, patrol: 55 };
  private sirens: (SirenVoice | null)[] = [null, null];
  private bed: AmbienceBed | null = null;
  private nature: NatureBed | null = null;
  private chirpT = 3;
  private readonly sf = { desert: 0, forest: 0, salt: 0, dirt: 0 };
  readonly flock: BirdFlock;
  private gullT = 6;
  stats = { events: 0, sirens: 0 };
  /** Accident cool-down so a pile-up does not happen every minute. */
  private lastAccident = -1e9;
  private clock = 0;

  constructor(
    private readonly traffic: Traffic,
    private readonly peds: Pedestrians,
    private readonly plan: CityPlan,
    private readonly audio: AudioEngine,
  ) {
    this.flock = new BirdFlock(14);
  }

  has(kind: Kind): boolean {
    return this.events.some((e) => e.kind === kind);
  }

  update(dt: number, ctx: AmbientContext): void {
    this.clock += dt;
    for (const k of Object.keys(this.timers) as Kind[]) this.timers[k] -= dt;
    const day = ctx.hour >= 7 && ctx.hour < 20;
    const evening = ctx.hour >= 10 && ctx.hour < 23.5;

    if (this.timers.beach <= 0 && !this.has('beach')) {
      this.timers.beach = 4;
      if (day && ctx.x < 360 && Math.abs(ctx.z) < 640) this.startBeach(ctx);
    }
    if (this.timers.musician <= 0) {
      this.timers.musician = 30 + this.rnd() * 30;
      if (evening && this.events.filter((e) => e.kind === 'musician').length < 2) this.startMusician(ctx);
    }
    if (this.timers.protest <= 0) {
      this.timers.protest = 120 + this.rnd() * 80;
      if (ctx.hour >= 11 && ctx.hour < 19.5 && !this.has('protest')) this.startProtest(ctx);
    }
    if (this.timers.accident <= 0) {
      this.timers.accident = 100 + this.rnd() * 90;
      if (!this.has('accident') && this.traffic.stats.active > 8 && this.clock - this.lastAccident > 90) this.startAccident(ctx);
    }
    if (this.timers.patrol <= 0) {
      this.timers.patrol = 90 + this.rnd() * 90;
      if (!this.has('accident') && ctx.hour > 17 || ctx.hour < 5) this.startPatrol(ctx);
    }

    // run the events
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i]!;
      e.age += dt;
      for (const p of e.pending) {
        if (p.at >= 0 && e.age >= p.at) {
          const c = this.traffic.dispatch(p.kind, e.x, e.z);
          if (c) e.cars.push(c);
          p.at = -1;
        }
      }
      const d = Math.hypot(e.x - ctx.x, e.z - ctx.z);
      if (e.music) e.music.update(dt, e.x, 6, e.z, d);
      if (e.age > e.ttl || d > (e.kind === 'beach' ? 520 : 420)) this.end(e, i);
    }

    this.updateSirens(dt, ctx);
    this.updateBed(dt, ctx);

    // seagulls near the coast
    const coast = ctx.x < 420 && ctx.hour > 6 && ctx.hour < 20.5;
    this.flock.active = coast;
    this.flock.update(dt, ctx.x, ctx.z);
    this.gullT -= dt;
    if (coast && this.gullT <= 0) {
      this.gullT = 5 + this.rnd() * 8;
      const f = this.flock.centre;
      if (Math.hypot(f.x - ctx.x, f.z - ctx.z) < 220) this.audio.gull(f);
    }
    this.stats.events = this.events.length;
  }

  private end(e: AmbientEvent, i: number): void {
    for (const p of e.peds) if (p.active) this.peds.resume(p);
    e.music?.dispose();
    this.events.splice(i, 1);
  }

  private add(kind: Kind, x: number, z: number, ttl: number): AmbientEvent {
    const e: AmbientEvent = { kind, x, z, ttl, age: 0, peds: [], cars: [], music: null, pending: [] };
    this.events.push(e);
    return e;
  }

  // ---------------------------------------------------------------------------------------- accident

  private startAccident(ctx: AmbientContext): void {
    const net = this.traffic.net;
    const cand = net.nodes.filter((n) => {
      if (!n.ok) return false;
      const d = Math.hypot(n.x - ctx.x, n.z - ctx.z);
      return d > 130 && d < 270;
    });
    if (!cand.length) return;
    // prefer a junction the player cannot currently see
    cand.sort(() => this.rnd() - 0.5);
    let node = cand[0]!;
    const v = new THREE.Vector3();
    for (const n of cand) {
      v.set(n.x, G + 2, n.z);
      if (!ctx.frustum.containsPoint(v)) { node = n; break; }
    }
    const e = this.add('accident', node.x, node.z, 170);
    this.lastAccident = this.clock;
    const yaw = this.rnd() * 6;
    const a = this.traffic.spawnWreck(node.x - 2, node.z + 1.2, yaw);
    const b = this.traffic.spawnWreck(node.x + 2.8, node.z - 2.2, yaw + 1.1 + this.rnd() * 0.6);
    if (a) e.cars.push(a);
    if (b) e.cars.push(b);
    // bystanders on the four sidewalk corners, filming
    const ni = net.nodes.indexOf(node);
    for (let c = 0; c < 4; c++) {
      const id = ni * 4 + c;
      if (this.rnd() < 0.2) continue;
      const p = this.peds.place(this.peds.net.nx[id]!, this.peds.net.nz[id]!, 'local', 'film', 0);
      if (!p) continue;
      p.tx = node.x; p.tz = node.z; p.stateT = 90; p.accessory = 1;
      e.peds.push(p);
    }
    e.pending.push({ kind: 'police', at: 6 }, { kind: 'ambulance', at: 12 });
    const d = Math.hypot(node.x - ctx.x, node.z - ctx.z);
    if (d < 280) this.audio.crash(new THREE.Vector3(node.x, 5.5, node.z), 0.7);
  }

  // ----------------------------------------------------------------------------------------- patrol

  private startPatrol(ctx: AmbientContext): void {
    const kind = this.rnd() < 0.7 ? 'police' : 'ambulance';
    const e = this.add('patrol', ctx.x, ctx.z, 120);
    const net = this.traffic.net;
    const far = net.nodes.filter((n) => n.ok && Math.hypot(n.x - ctx.x, n.z - ctx.z) > 80 && Math.hypot(n.x - ctx.x, n.z - ctx.z) < 220);
    const t = far[Math.floor(this.rnd() * far.length)];
    if (!t) { this.events.pop(); return; }
    const c = this.traffic.dispatch(kind, t.x, t.z);
    if (c) e.cars.push(c); else this.events.pop();
  }

  // ---------------------------------------------------------------------------------------- musician

  private startMusician(ctx: AmbientContext): void {
    const pn = this.peds.net;
    // a sidewalk corner 50–170 m away in a lively district
    let best = -1;
    for (let attempt = 0; attempt < 60; attempt++) {
      const id = Math.floor(this.rnd() * pn.nx.length);
      if (!pn.ok[id]) continue;
      const x = pn.nx[id]!, z = pn.nz[id]!;
      const d = Math.hypot(x - ctx.x, z - ctx.z);
      if (d < 50 || d > 170) continue;
      const dist = this.plan.districtAt(x, z);
      if (dist === 'industrial' || dist === 'hills') continue;
      best = id;
      break;
    }
    if (best < 0) return;
    const x = pn.nx[best]!, z = pn.nz[best]!;
    const e = this.add('musician', x, z, 240);
    const m = this.peds.place(x, z, 'musician', 'stand', this.rnd() * 6);
    if (m) { m.accessory = 3; e.peds.push(m); }
    const n = 2 + Math.floor(this.rnd() * 3);
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * 2.2 - 1.1 + 0.4;
      const lx = x + Math.cos(ang) * (2.6 + this.rnd()), lz = z + Math.sin(ang) * (2.6 + this.rnd());
      const p = this.peds.place(lx, lz, 'listener', 'stand', Math.atan2(x - lx, z - lz));
      if (p) { p.accessory = this.rnd() < 0.3 ? 1 : 0; e.peds.push(p); }
    }
    e.music = this.audio.createMusic();
  }

  // ------------------------------------------------------------------------------------------ protest

  private startProtest(ctx: AmbientContext): void {
    const cand = this.plan.blocks.filter((b) => {
      const d = Math.hypot(b.cx - ctx.x, b.cz - ctx.z);
      return (b.district === 'downtown' || b.kind === 'plaza') && d > 60 && d < 260;
    });
    const b = cand[Math.floor(this.rnd() * cand.length)];
    if (!b) return;
    const z = b.z0 - 1.9;
    const e = this.add('protest', b.cx, z, 300);
    const x0 = b.x0 + 3, x1 = b.x1 - 3;
    const n = 12 + Math.floor(this.rnd() * 5);
    for (let k = 0; k < n; k++) {
      const x = x0 + ((x1 - x0) * (k + this.rnd() * 0.6)) / n;
      const p = this.peds.place(x, z + (this.rnd() - 0.5) * 2.2, 'protester', 'path', 0);
      if (!p) continue;
      p.accessory = 2;
      p.speed = p.baseSpeed = 0.85 + this.rnd() * 0.15;
      p.px = x0; p.pz = z; p.tx = x1; p.tz = z;
      e.peds.push(p);
    }
  }

  // --------------------------------------------------------------------------------------- beach crowd

  private startBeach(ctx: AmbientContext): void {
    const zc = Math.max(-560, Math.min(560, ctx.z));
    const e = this.add('beach', 100, zc, 700);
    const rnd = this.rnd;
    const usable = (z: number) => Math.abs(z) > 120 && !(z > -380 && z < -230); // keep clear of the range and the funfair
    // sunbathers and a few people paddling at the water's edge
    for (let k = 0; k < 14; k++) {
      const z = zc + (rnd() - 0.5) * 420;
      if (!usable(z)) continue;
      const p = this.peds.place(96 + rnd() * 90, z, 'sunbather', 'lie', rnd() * 6, 'beach');
      if (p) e.peds.push(p);
    }
    for (let k = 0; k < 6; k++) {
      const z = zc + (rnd() - 0.5) * 420;
      if (!usable(z)) continue;
      const p = this.peds.place(22 + rnd() * 30, z, rnd() < 0.5 ? 'tourist' : 'kid', 'stand', -Math.PI / 2 + (rnd() - 0.5) * 0.6, 'beach');
      if (p) e.peds.push(p);
    }
    // strollers and joggers on the boardwalk, back and forth along a stretch of it
    for (let k = 0; k < 9; k++) {
      const jog = k < 3;
      const z0 = zc + (rnd() - 0.5) * 360, len = jog ? 140 + rnd() * 120 : 40 + rnd() * 80;
      const x = 199 + rnd() * 14;
      const p = this.peds.place(x, z0, jog ? 'jogger' : 'stroller', 'path', 0, 'boardwalk');
      if (!p) continue;
      if (!jog) p.baseSpeed = 1.0 + rnd() * 0.4;
      p.speed = p.baseSpeed;
      const sgn = rnd() < 0.5 ? 1 : -1;
      p.px = x; p.pz = z0 - sgn * len / 2; p.tx = x; p.tz = z0 + sgn * len / 2;
      e.peds.push(p);
    }
  }

  // ----------------------------------------------------------------------------------------- audio

  private updateSirens(dt: number, ctx: AmbientContext): void {
    const list = this.traffic.cars.filter((c) => c.active && c.siren);
    this.stats.sirens = list.length;
    this.traffic.applySirens(list.map((c) => ({ x: c.x, z: c.z, fx: c.fx, fz: c.fz })));
    list.sort((a, b) => Math.hypot(a.x - ctx.x, a.z - ctx.z) - Math.hypot(b.x - ctx.x, b.z - ctx.z));
    for (let i = 0; i < this.sirens.length; i++) {
      const c = list[i];
      let v = this.sirens[i] ?? null;
      if (!v && c) { v = this.audio.createSiren(); this.sirens[i] = v; }
      if (!v) continue;
      if (!c) { v.update(dt, 0, 0, 0, 0, false, 0); continue; }
      const dx = c.x - ctx.x, dz = c.z - ctx.z;
      const d = Math.hypot(dx, dz) || 1;
      const radial = (c.fx * c.v * dx + c.fz * c.v * dz) / d;
      const kind = c.type.emergency === 'ambulance' ? 2 : c.id % 2 === 0 ? 0 : 1;
      v.update(dt, c.x, 6, c.z, kind, d < 450, radial);
    }
  }

  private updateBed(dt: number, ctx: AmbientContext): void {
    if (!this.bed) {
      this.bed = this.audio.createAmbience();
      if (!this.bed) return;
    }
    let cars = 0, crowd = 0;
    for (const c of this.traffic.cars) if (c.active && c.state !== 'wreck' && Math.hypot(c.x - ctx.x, c.z - ctx.z) < 90) cars += Math.min(1, c.v / 6) + 0.3;
    for (const p of this.peds.peds) if (p.active && p.dist < 40) crowd++;
    const inCity = Math.hypot(ctx.x - CITY.x, ctx.z - CITY.z) < 800 && ctx.x > 215;
    const city = inCity ? 1 : ctx.x > 215 ? 0.0 : 0.25;
    this.bed.update((cars / 9) * city, (crowd / 14) * city, this.audio.context!);

    // the natural soundscape: wind rises with height and in the open desert, trees rustle, surf on the coast, crickets at night
    if (!this.nature) this.nature = this.audio.createNature();
    const td = TerrainData.current;
    if (this.nature && td) {
      const s = td.surface(ctx.x, ctx.z, this.sf);
      const h = terrainHeight(ctx.x, ctx.z);
      const night = ctx.hour < 5.5 || ctx.hour > 20 ? 1 : ctx.hour < 7 || ctx.hour > 18.5 ? 0.4 : 0;
      const wind = Math.min(1, 0.12 + Math.max(0, h - 40) / 700 + s.desert * 0.55 + s.salt * 0.3) * (inCity ? 0.4 : 1);
      this.nature.update({ wind, forest: s.forest, surf: Math.max(0, 1 - Math.abs(ctx.x - 40) / 260) * (ctx.x < 300 ? 1 : 0), night: night * (inCity ? 0.2 : 1) });
      this.chirpT -= dt;
      if (this.chirpT <= 0) {
        this.chirpT = 1.5 + Math.random() * 6;
        if (night === 0 && s.forest > 0.3 && !inCity) this.nature.chirp();
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------ seagulls

/** A small flock of instanced gulls wheeling over the seafront, wings flapping. */
export class BirdFlock {
  readonly group = new THREE.Group();
  readonly mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  active = true;
  readonly centre = new THREE.Vector3(60, 30, 0);
  private readonly body: THREE.InstancedMesh;
  private readonly wings: THREE.InstancedMesh;
  private readonly t: number[] = [];
  private clock = 0;

  constructor(private readonly n: number) {
    this.body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.14, 0.55), this.mat, n);
    this.wings = new THREE.InstancedMesh(new THREE.BoxGeometry(0.95, 0.025, 0.2).translate(0.47, 0, 0), this.mat, n * 2);
    for (const m of [this.body, this.wings]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(m); }
    for (let i = 0; i < n; i++) this.t.push(Math.random() * 100);
    this.group.visible = false;
  }

  update(dt: number, px: number, pz: number): void {
    this.group.visible = this.active;
    if (!this.active) return;
    this.clock += dt;
    // the flock hangs around the sea edge nearest the player
    this.centre.set(Math.min(px, 70) - 10, 32, pz);
    const q = new THREE.Quaternion();
    const q2 = new THREE.Quaternion();
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    const fwd = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < this.n; i++) {
      const a = this.clock * (0.22 + (i % 5) * 0.02) + i * 1.7;
      const r = 28 + (i % 4) * 14;
      p.set(this.centre.x + Math.cos(a) * r, this.centre.y + Math.sin(this.clock * 0.3 + i) * 5 + (i % 3) * 3, this.centre.z + Math.sin(a) * r * 0.8);
      q.setFromAxisAngle(up, -a);
      // counter-clockwise tangent; roll into the turn
      q2.setFromAxisAngle(fwd, -0.35);
      q.multiply(q2);
      m.compose(p, q, s);
      this.body.setMatrixAt(i, m);
      const flap = Math.sin(this.clock * (7 + (i % 3)) + i) * 0.55;
      for (const side of [0, 1]) {
        const w = new THREE.Quaternion().setFromAxisAngle(fwd, (side ? 1 : -1) * flap).premultiply(q);
        if (side === 0) w.multiply(q2.setFromAxisAngle(up, Math.PI));
        m.compose(p, w, s);
        this.wings.setMatrixAt(i * 2 + side, m);
      }
    }
    this.body.count = this.n;
    this.wings.count = this.n * 2;
    this.body.instanceMatrix.needsUpdate = true;
    this.wings.instanceMatrix.needsUpdate = true;
  }
}

