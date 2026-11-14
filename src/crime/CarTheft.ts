import * as THREE from 'three';
import type { Game } from '../Game';
import type { Vehicle } from '../vehicles/Vehicle';
import type { TrafficCar } from '../npc/Traffic';
import { VEHICLES } from '../vehicles/specs';

/** Which drivable car a traffic car becomes when you take it. */
const SPEC_FOR: Record<string, string> = {
  hatch: 'pico', sedan: 'stanza', taxi: 'marlow', van: 'courier', pickup: 'ridgeback', police: 'cruiser', fedsuv: 'huntley', ambulance: 'courier', swatvan: 'courier',
};

/** What gets left at the kerb, and how often. */
const PARKED: [string, number][] = [
  ['stanza', 3], ['pico', 3], ['huntley', 1.2], ['courier', 1], ['ridgeback', 1], ['stallion', 1], ['marlow', 0.6], ['barrage', 0.6], ['comet', 0.3], ['veloce', 0.12], ['sparrow', 0.4], ['vandal', 0.4],
];
const PAINT = ['#d7d7d2', '#1d1f23', '#2a3446', '#7d1f26', '#8c9296', '#4a5b6e', '#b8a994', '#0f2a24', '#c8c8c4', '#2f4b7a', '#9b2d30', '#d2b24a', '#3f6b4a', '#e8e6df', '#5a2a6a', '#c06a1a'];
const MAX_PARKED = 5;

const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');
const _v = new THREE.Vector3();

/**
 * Stealing cars, the way the coast does it.
 *
 * - Parked cars line the side streets near you. Many are locked: press E to smash the driver's window (a car alarm may
 *   go off and a witness may call it in), climb in and hotwire it for a couple of seconds before it starts.
 * - Cars in traffic can be taken too: walk up to one that is stopped or crawling and press E. You pull the driver out
 *   (they run), and anyone watching calls the police. Police cruisers count double.
 */
export class CarTheft {
  /** "Steal …" label while a traffic car is in reach on foot. */
  prompt: string | null = null;
  private job: { kind: 'smash' | 'jack'; t: number; v?: Vehicle; car?: TrafficCar; x: number; z: number } | null = null;
  private spawnT = 1;
  private alarm: { v: Vehicle; t: number; honk: number } | null = null;
  private hotwireShown: Vehicle | null = null;
  private sparkT = 0;
  stats = { parked: 0, stolen: 0, jacked: 0 };

  constructor(private readonly g: Game) {
    if (g.driving) g.driving.onLocked = (v) => this.breakIn(v);
  }

  /** The parked cars currently in the world. */
  parked(): Vehicle[] { return this.g.vehicles?.vehicles.filter((v) => v.ambient) ?? []; }

  update(dt: number): void {
    const g = this.g;
    const d = g.driving, p = g.player, vm = g.vehicles;
    if (!d || !p || !vm || g.state !== 'playing') { this.prompt = null; return; }
    this.populate(dt);
    this.updateAlarm(dt);
    // hotwiring progress while sitting in the stolen car
    const cur = d.mode === 'driving' ? d.vehicle : null;
    if (cur && cur.hotwireT > 0) {
      if (this.hotwireShown !== cur) { this.hotwireShown = cur; g.story?.hud.showTip('Hotwiring… hold on a second.', 2); }
      // sparks under the steering column while the wires are crossed
      this.sparkT -= dt;
      if (this.sparkT <= 0) {
        this.sparkT = 0.18 + Math.random() * 0.25;
        const p0 = _v.set(cur.spec.seat.x * 0.6, 0.55 + cur.spec.clearance, -0.5).applyQuaternion(cur.quaternion).add(cur.position);
        g.effects?.impact(p0.clone(), new THREE.Vector3(0, 1, 0), 'metal', false);
        if (Math.random() < 0.5) g.audio.sport('snap', 0.35, p0);
      }
    } else if (this.hotwireShown && (!cur || cur.hotwireT <= 0)) {
      if (cur === this.hotwireShown) { g.audio.mech('rack'); g.ui.toast('Engine started'); }
      this.hotwireShown = null;
    }
    if (this.job) { this.stepJob(dt); this.prompt = null; return; }
    // carjack: a stopped or slow traffic car next to you
    this.prompt = null;
    if (d.mode !== 'foot' || d.hint || p.mantle || p.noclip || p.state !== 'ground' || g.story?.prompt || g.commerce?.prompt) return;
    if (g.story?.cutscenes.active || g.piloting?.busy) return;
    const traffic = g.npcs?.traffic;
    if (!traffic) return;
    let best: TrafficCar | null = null, bestD = 3.2;
    for (const c of traffic.cars) {
      if (!c.active || c.state === 'wreck' || c.state === 'box' || !SPEC_FOR[c.type.id] || Math.abs(c.v) > 3.2) continue;
      const dx = p.pos.x - c.x, dz = p.pos.z - c.z;
      if (Math.abs(dx) > 8 || Math.abs(dz) > 8) continue;
      const along = dx * c.fx + dz * c.fz, side = Math.abs(-dx * c.fz + dz * c.fx);
      if (Math.abs(along) > c.type.L / 2 + 0.3) continue;
      const gap = side - c.type.W / 2;
      if (gap < bestD) { bestD = gap; best = c; }
    }
    if (!best) return;
    const name = VEHICLES[SPEC_FOR[best.type.id]!]!.name;
    this.prompt = best.type.emergency === 'police' ? `Steal the ${name} (police!)` : `Pull the driver out: ${name}`;
    if (g.input.pressed('interact')) this.carjack(best);
  }

  // ------------------------------------------------------------------------------------------------ break-ins

  private breakIn(v: Vehicle): void {
    if (this.job) return;
    const g = this.g;
    this.job = { kind: 'smash', t: 0, v, x: v.position.x, z: v.position.z };
    g.player!.frozen = true;
    // face the window and wind up the elbow; the glass goes when it lands (see stepJob)
    const door = g.vehicles!.doorWorld(v, _v);
    g.player!.yaw = Math.atan2(-(v.position.x - g.player!.pos.x), -(v.position.z - g.player!.pos.z));
    g.player!.pitch = -0.32; // eyes on the window
    g.viewmodel?.play('smash');
    g.audio.mech('cloth');
    void door;
  }

  /** The elbow lands: glass everywhere. */
  private shatter(v: Vehicle): void {
    const g = this.g;
    const door = g.vehicles!.doorWorld(v, _v);
    door.y += 1.0;
    for (let i = 0; i < 3; i++) g.effects?.impact(door.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4)), new THREE.Vector3(0, 1, 0), 'glass', false);
    g.audio.sport('snap', 1.4, door);
    g.audio.sport('hit', 0.8, door);
    g.input.rumble(0.7, 0.4, 110);
  }

  private carjack(c: TrafficCar): void {
    const g = this.g;
    c.v = 0; c.brake = 1;
    this.job = { kind: 'jack', t: 0, car: c, x: c.x, z: c.z };
    g.player!.frozen = true;
    g.player!.yaw = Math.atan2(-(c.x - g.player!.pos.x), -(c.z - g.player!.pos.z));
    g.viewmodel?.play('jack');
    g.audio.mech('cloth');
  }

  private stepJob(dt: number): void {
    const g = this.g, j = this.job!;
    j.t += dt;
    if (j.kind === 'smash' && j.v) {
      if (j.t >= 0.4 && j.t - dt < 0.4) this.shatter(j.v);
      if (j.t < 0.75) return;
      const v = j.v;
      v.locked = false;
      v.hotwireT = 2.2;
      g.player!.frozen = false;
      this.job = null;
      // half of the cars on the street have an alarm, and somebody might hear it
      if (Math.random() < 0.5) { this.alarm = { v, t: 12, honk: 0 }; g.ui.toast('Car alarm!'); }
      g.police?.crime(this.alarm?.v === v ? 7 : 4, v.position.x, v.position.z);
      this.stats.stolen++;
      this.g.story?.market.event('RDLN', 0.004);
      g.driving!.enter(v);
      return;
    }
    if (j.kind === 'jack' && j.car) {
      const c = j.car;
      c.v = 0;
      if (j.t < 0.9) return;
      this.job = null;
      g.player!.frozen = false;
      if (!c.active || c.state === 'wreck') return;
      const specId = SPEC_FOR[c.type.id]!;
      const yaw = Math.atan2(-c.fx, -c.fz);
      const police = c.type.emergency === 'police';
      // the traffic car becomes a real one in the same spot, with the same paint
      const sx = c.x, sz = c.z, col = hex(c.color);
      g.npcs!.traffic.remove(c);
      const v = g.vehicles!.spawn(specId, sx, sz, yaw, police ? undefined : col);
      v.ambient = true;
      // the driver tumbles out of the far side and runs
      const pd = g.npcs!.peds;
      const sideX = -c.fz, sideZ = c.fx;
      const ped = pd.place(sx + sideX * 2.2, sz + sideZ * 2.2, police ? 'cop' : 'local', 'walk', yaw);
      if (ped) pd.startFlee(ped, g.player!.pos.x, g.player!.pos.z, 10);
      g.police?.crime(police ? 30 : 9, sx, sz, police ? { cop: true } : undefined);
      g.audio.sport('groan', 0.9, v.position);
      this.stats.jacked++;
      this.g.story?.market.event('RDLN', 0.004);
      g.driving!.enter(v);
    }
  }

  private updateAlarm(dt: number): void {
    const a = this.alarm;
    if (!a) return;
    a.t -= dt; a.honk -= dt;
    if (a.honk <= 0) { a.honk = 0.6; this.g.audio.honk(a.v.position, false); a.v.headlights = !a.v.headlights; }
    if (a.t <= 0 || a.v.exploded) { this.alarm = null; a.v.headlights = false; }
  }

  // ------------------------------------------------------------------------------------------------ parked cars

  private populate(dt: number): void {
    const g = this.g;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 1.5;
    const vm = g.vehicles!, d = g.driving!;
    const focus = d.mode === 'driving' && d.vehicle ? d.vehicle.position : g.player!.pos;
    // clear the ones far behind
    for (const v of this.parked()) {
      if (v.occupied || v === d.vehicle) continue;
      if (v.position.distanceTo(focus) > 260 || v.exploded && v.position.distanceTo(focus) > 120) vm.remove(v);
    }
    const list = this.parked();
    this.stats.parked = list.length;
    if (list.length >= MAX_PARKED || g.story?.mission?.def.id === 'm00') return;
    const plan = g.world.city.plan;
    if (!plan.inCity(focus.x, focus.z)) return;
    // a random side street 50–150 m away, at the kerb, away from junctions and other cars
    for (let tries = 0; tries < 6; tries++) {
      const ns = Math.random() < 0.5;
      const roads = (ns ? plan.X : plan.Z).filter((r) => !r.arterial && Math.abs(r.pos - (ns ? focus.x : focus.z)) < 150);
      if (!roads.length) continue;
      const r = roads[Math.floor(Math.random() * roads.length)]!;
      const along = (ns ? focus.z : focus.x) + (Math.random() * 2 - 1) * 150;
      const cross = ns ? plan.Z : plan.X;
      if (cross.some((q) => Math.abs(along - q.pos) < q.hw + 9)) continue;
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = r.pos + side * (r.hw - 0.95);
      const x = ns ? off : along, z = ns ? along : off;
      if (!plan.inCity(x, z) || plan.roadAt(x, z).kind !== 'road') continue;
      const dist = Math.hypot(x - focus.x, z - focus.z);
      if (dist < 50 || dist > 160) continue;
      // not right in front of the camera
      const cam = g.camera.position;
      _v.set(x - cam.x, 0, z - cam.z);
      g.camera.getWorldDirection(this.dir);
      if (dist < 110 && _v.normalize().dot(this.dir.setY(0).normalize()) > 0.5) continue;
      if (vm.vehicles.some((v) => Math.hypot(v.position.x - x, v.position.z - z) < 8)) continue;
      // parked with the flow of traffic on that side of the street
      const yaw = ns ? (side < 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
      const spec = this.pickSpec();
      const v = vm.spawn(spec, x, z, yaw, PAINT[Math.floor(Math.random() * PAINT.length)]);
      v.ambient = true;
      v.locked = VEHICLES[spec]!.kind === 'car' && Math.random() < 0.65;
      return;
    }
  }

  private readonly dir = new THREE.Vector3();

  private pickSpec(): string {
    const total = PARKED.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    for (const [id, w] of PARKED) { r -= w; if (r <= 0) return id; }
    return 'stanza';
  }
}
