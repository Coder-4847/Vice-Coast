import * as THREE from 'three';
import type { Story } from '../story/Story';
import { MARKERS, type Marker } from '../ui/mapData';
import { money } from '../economy/Economy';
import { terrainHeight } from '../world/Terrain';
import { buildItems, CKINDS, KINDS, WORDS, type CItem, type CKind } from './defs';
import { drawArt } from './art';

const PLATE_CODES = ['VC-0001', 'KSTL-77', 'ROJO-1', 'PINE-09', 'SALT-4', 'FLATS-8', 'HARB-12', 'CAFE-60', 'MERID-3', 'NOVA-21', 'RAZE-5', 'ECHO-88', 'TIDE-14', 'MOTH-6', 'ZEAL-2'];

interface Live {
  item: CItem;
  obj: THREE.Object3D;
  handles?: number[];
  tex?: THREE.CanvasTexture;
  ctx?: CanvasRenderingContext2D;
  dispose(): void;
}

interface Site { item: CItem; dir: THREE.Vector2; len: number; ramp: (() => void) | null; flag: THREE.Object3D | null }

const SPRAY_SECS = 2.6;
const ACTIVE_R = 280;

/**
 * Five kinds of collectible: hidden packages, graffiti walls to spray, murals to photograph, stunt-jump ramps and trophy
 * plates in hard places. Positions are generated from fixed seeds, snapped onto open ground over a few frames after the
 * game starts, and drawn only near the player. Finds are saved in `StoryState.collect`.
 */
export class Collectibles {
  readonly items: CItem[] = buildItems();
  private readonly byId = new Map<string, CItem>(this.items.map((i) => [i.id, i]));
  private readonly group = new THREE.Group();
  readonly live = new Map<string, Live>();
  private readonly blips = new Map<string, Marker>();
  private readonly sites = new Map<string, Site>();
  private readonly matBox: THREE.MeshStandardMaterial;
  private readonly matBeam: THREE.MeshBasicMaterial;
  private readonly matPlate: THREE.MeshStandardMaterial;
  private readonly matPole: THREE.MeshStandardMaterial;
  private readonly matConcrete: THREE.MeshStandardMaterial;
  private readonly geoBox = new THREE.BoxGeometry(0.55, 0.55, 0.55);
  private readonly geoBeam = new THREE.CylinderGeometry(0.1, 0.1, 7, 8, 1, true);
  private readonly geoPlate = new THREE.BoxGeometry(0.62, 0.32, 0.04);
  private readonly geoPole = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6);
  private cursor = 0;
  private t = 0;
  private syncT = 0;
  private spawnT = 0;
  private spray: { item: CItem; t: number } | null = null;
  private ready = false;
  /** Vehicle air tracking for stunt jumps. */
  private air: { site: Site; t: number; x: number; z: number } | null = null;
  private wasGrounded = true;
  private bannerQueue: (() => void)[] = [];
  private bannerT = 0;

  constructor(private readonly story: Story) {
    const rig = story.g.world.rig;
    this.matBox = new THREE.MeshStandardMaterial({ color: 0x2a1c08, emissive: new THREE.Color(0xffb347), emissiveIntensity: 1.8, roughness: 0.5, metalness: 0.2 });
    this.matBeam = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.matPlate = new THREE.MeshStandardMaterial({ color: 0xf5e9b8, emissive: new THREE.Color(0xffe07a), emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.6 });
    this.matPole = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.8, metalness: 0.4 });
    this.matConcrete = new THREE.MeshStandardMaterial({ color: 0x8c8a85, roughness: 0.95 });
    for (const m of [this.matBox, this.matBeam, this.matPlate, this.matPole, this.matConcrete]) rig.register(m);
    story.g.world.scene.add(this.group);
  }

  // ------------------------------------------------------------------------------------------------ state

  private found(kind: CKind): string[] { return (this.story.st.collect[kind] ??= []); }
  has(item: CItem): boolean { return this.found(item.kind).includes(item.id); }
  count(kind: CKind): number { return this.found(kind).length; }
  total(kind: CKind): number { return this.items.filter((i) => i.kind === kind).length; }
  get foundAll(): number { return CKINDS.reduce((n, k) => n + this.count(k), 0); }
  get totalAll(): number { return this.items.length; }
  /** Half the set found shows the rest on the map. */
  revealed(kind: CKind): boolean { return this.count(kind) >= Math.ceil(this.total(kind) / 2); }

  /** A save was loaded, or a new game began. */
  onBegin(): void {
    this.clearLive();
    this.clearBlips();
    this.spray = null;
    this.air = null;
    this.syncT = 0;
    this.ready = true;
    // earlier finds that were saved against ids that no longer exist are dropped
    for (const k of CKINDS) this.story.st.collect[k] = this.found(k).filter((id) => this.byId.has(id));
  }

  // ------------------------------------------------------------------------------------------------ placement

  /** Snap a few items per frame onto open ground (the chunk generator is not free). */
  private resolveSome(): void {
    const t0 = performance.now();
    while (this.cursor < this.items.length && performance.now() - t0 < 3) {
      const it = this.items[this.cursor++]!;
      this.resolve(it);
    }
  }

  get resolved(): boolean { return this.cursor >= this.items.length; }

  /** Resolve everything now (tests, and the first map reveal). */
  resolveAll(): void { while (this.cursor < this.items.length) this.resolve(this.items[this.cursor++]!); }

  private resolve(it: CItem): void {
    const st = this.story;
    const pts = st.g.commerce!.points;
    const city = st.g.world.city.plan.inCity(it.x, it.z);
    if (it.kind === 'plate') {
      const p = pts.find(it.x, it.z, 1.4, { walkOnly: false, maxR: 14 });
      const ok = terrainHeight(p.x, p.z) > 1.4;
      it.x = ok ? p.x : it.x; it.z = ok ? p.z : it.z;
      it.ok = terrainHeight(it.x, it.z) > 0.4;
      return;
    }
    const margin = it.kind === 'package' ? 1.4 : it.kind === 'jump' ? 5 : 3.4;
    // several tries around the seed point; each must land on dry, level, open ground
    let rx = it.x, rz = it.z;
    const seed = it.design + 1;
    for (let k = 0; k < (it.kind === 'jump' ? 40 : 16); k++) {
      let cx = rx, cz = rz;
      if (k > 0) {
        const a = (seed * (k + 3) * 2.399) % (Math.PI * 2), d = 30 + (k % 20) * 22;
        cx = it.x + Math.cos(a) * d; cz = it.z + Math.sin(a) * d;
      }
      if (terrainHeight(cx, cz) < 1.6) continue;
      if (it.kind === 'jump') {
        const yaw = ((seed * (k + 5)) % 628) / 100;
        const site = this.jumpSite(cx, cz, yaw);
        if (!site) continue;
        it.x = site.x; it.z = site.z; it.yaw = yaw; it.ok = true;
        return;
      }
      const p = pts.find(cx, cz, margin, { walkOnly: city, maxR: 16 });
      if (Math.hypot(p.x - cx, p.z - cz) > 16 || terrainHeight(p.x, p.z) < 1.4) continue;
      rx = p.x; rz = p.z;
      it.x = p.x; it.z = p.z;
      if (city && (it.kind === 'graffiti' || it.kind === 'art')) it.yaw = st.roadYaw(p.x, p.z);
      it.ok = true;
      return;
    }
    it.ok = false;
  }

  /** A launch strip: level dry ground, nothing solid for 70 m ahead. Returns the ramp's centre. */
  private jumpSite(x: number, z: number, yaw: number): { x: number; z: number } | null {
    const pts = this.story.g.commerce!.points;
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    const h0 = terrainHeight(x, z);
    for (let d = -26; d <= 62; d += 8) {
      const px = x + dx * d, pz = z + dz * d;
      const h = terrainHeight(px, pz);
      if (h < 1.6 || Math.abs(h - h0) > 2.2) return null;
      if (!pts.free(px, pz, 4.5)) return null;
    }
    return { x, z };
  }

  // ------------------------------------------------------------------------------------------------ per frame

  update(dt: number): void {
    const g = this.story.g;
    if (!this.ready || !g.player) return;
    this.t += dt;
    if (!this.resolved) this.resolveSome();
    const car = g.driving?.mode === 'driving' ? g.driving.vehicle : null;
    const px = car ? car.position.x : g.player.pos.x, pz = car ? car.position.z : g.player.pos.z;

    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 0.7; this.streamLive(px, pz); }
    this.syncT -= dt;
    if (this.syncT <= 0) { this.syncT = 0.8; this.syncBlips(px, pz); }

    for (const lv of this.live.values()) this.animate(lv, px, pz);
    this.pickups(px, pz, !!car);
    this.updateSpray(dt);
    this.updateJumps(dt, car);

    this.bannerT -= dt;
    if (this.bannerQueue.length && this.bannerT <= 0 && g.state === 'playing') { this.bannerQueue.shift()!(); this.bannerT = 2.6; }
  }

  private active(it: CItem, px: number, pz: number, r = ACTIVE_R): boolean {
    return it.ok && Math.hypot(it.x - px, it.z - pz) < r;
  }

  private streamLive(px: number, pz: number): void {
    for (const it of this.items) {
      const lv = this.live.get(it.id);
      const want = this.active(it, px, pz, lv ? ACTIVE_R + 70 : ACTIVE_R) && (it.kind === 'graffiti' || it.kind === 'art' || it.kind === 'jump' || !this.has(it));
      if (want && !lv) this.spawn(it);
      else if (!want && lv) { lv.dispose(); this.live.delete(it.id); }
    }
  }

  private spawn(it: CItem): void {
    const y = terrainHeight(it.x, it.z);
    const g = new THREE.Group();
    g.position.set(it.x, y, it.z);
    const live: Live = { item: it, obj: g, dispose: () => { this.group.remove(g); } };
    switch (it.kind) {
      case 'package': {
        const box = new THREE.Mesh(this.geoBox, this.matBox);
        box.position.y = 0.9;
        box.castShadow = true;
        const beam = new THREE.Mesh(this.geoBeam, this.matBeam);
        beam.position.y = 3.5;
        g.add(box, beam);
        break;
      }
      case 'plate': {
        const pole = new THREE.Mesh(this.geoPole, this.matPole);
        pole.position.y = 0.75;
        const plate = new THREE.Mesh(this.geoPlate, this.matPlate);
        plate.position.y = 1.55;
        const beam = new THREE.Mesh(this.geoBeam, this.matBeam);
        beam.position.y = 3.5;
        g.add(pole, plate, beam);
        break;
      }
      case 'graffiti':
      case 'art': {
        const wide = it.kind === 'art' ? 7.2 : 4.8, tall = it.kind === 'art' ? 3.4 : 2.5;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(0.28, tall, wide), this.matConcrete);
        slab.position.y = tall / 2;
        slab.castShadow = true;
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = Math.round(512 * tall / wide);
        const ctx = canvas.getContext('2d')!;
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const done = this.has(it) || it.kind === 'art';
        drawArt(ctx, canvas.width, canvas.height, it.kind, it.design, done ? 1 : 0, WORDS);
        tex.needsUpdate = true;
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
        this.story.g.world.rig.register(mat);
        const pg = new THREE.PlaneGeometry(wide - 0.2, tall - 0.2);
        const front = new THREE.Mesh(pg, mat);
        front.position.set(0.15, tall / 2, 0);
        front.rotation.y = Math.PI / 2;
        const back = new THREE.Mesh(pg, mat);
        back.position.set(-0.15, tall / 2, 0);
        back.rotation.y = -Math.PI / 2;
        g.add(slab, front, back);
        g.rotation.y = it.yaw;
        const hx = 0.14, hz = wide / 2, hy = tall / 2;
        live.handles = this.story.g.physics!.addBuildings([{ cx: it.x, cy: y + hy, cz: it.z, hx, hy, hz, ry: it.yaw }]);
        live.tex = tex; live.ctx = ctx;
        live.dispose = () => {
          this.group.remove(g);
          if (live.handles) this.story.g.physics?.removeBuildings(live.handles);
          tex.dispose(); mat.dispose(); pg.dispose(); slab.geometry.dispose();
        };
        break;
      }
      case 'jump': {
        const site = this.site(it);
        if (!site.ramp) site.ramp = this.story.ramp(it.x, it.z, it.yaw, site.len, 9, 3.6);
        if (!site.flag) {
          const flag = new THREE.Group();
          const pole = new THREE.Mesh(this.geoPole, this.matPole);
          pole.position.set(0, 0.75, 0);
          const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.8), new THREE.MeshBasicMaterial({ color: 0x6ae0ff }));
          cloth.position.set(0, 1.3, 0.45);
          flag.add(pole, cloth);
          // beside the ramp's entry end
          const fx = it.x - site.dir.x * site.len / 2 + Math.cos(it.yaw) * 5.4, fz = it.z - site.dir.y * site.len / 2 - Math.sin(it.yaw) * 5.4;
          flag.position.set(fx, terrainHeight(fx, fz), fz);
          this.group.add(flag);
          site.flag = flag;
        }
        live.dispose = () => {
          site.ramp?.(); site.ramp = null;
          if (site.flag) { this.group.remove(site.flag); site.flag = null; }
        };
        return void this.live.set(it.id, live);
      }
    }
    this.group.add(g);
    this.live.set(it.id, live);
  }

  private site(it: CItem): Site {
    let s = this.sites.get(it.id);
    if (!s) { s = { item: it, dir: new THREE.Vector2(Math.sin(it.yaw), Math.cos(it.yaw)), len: 15, ramp: null, flag: null }; this.sites.set(it.id, s); }
    return s;
  }

  private animate(lv: Live, px: number, pz: number): void {
    const it = lv.item;
    if (it.kind === 'package') {
      const box = lv.obj.children[0]!;
      box.rotation.y = this.t * 1.4 + it.design;
      box.position.y = 0.95 + Math.sin(this.t * 2 + it.design) * 0.12;
      lv.obj.children[1]!.visible = Math.hypot(it.x - px, it.z - pz) < 90;
    } else if (it.kind === 'plate') {
      lv.obj.children[1]!.rotation.y = Math.sin(this.t * 0.7 + it.design) * 0.25;
      lv.obj.children[2]!.visible = Math.hypot(it.x - px, it.z - pz) < 160;
    }
  }

  private pickups(px: number, pz: number, car: boolean): void {
    const g = this.story.g;
    if (this.story.mission || this.story.cutscenes.active || g.state !== 'playing') return;
    const r = car ? 4 : 2.1;
    for (const it of this.items) {
      if (!it.ok || (it.kind !== 'package' && it.kind !== 'plate')) continue;
      if (Math.abs(it.x - px) > r + 1 || Math.abs(it.z - pz) > r + 1) continue;
      if (this.has(it)) continue;
      if (Math.hypot(it.x - px, it.z - pz) > (it.kind === 'plate' ? r + 0.6 : r)) continue;
      this.collect(it);
    }
  }

  // ------------------------------------------------------------------------------------------------ interactions

  /** An interact prompt for a wall in reach, if any. */
  offer(): { text: string; go: () => void } | null {
    const g = this.story.g;
    if (this.spray || g.driving?.mode !== 'foot' || this.story.mission) return null;
    const p = g.player!.pos;
    for (const it of this.items) {
      if ((it.kind !== 'graffiti' && it.kind !== 'art') || !it.ok || this.has(it)) continue;
      const wide = it.kind === 'art' ? 3.8 : 2.6;
      // distance in the wall's own frame: along the wall and across it
      const dx = p.x - it.x, dz = p.z - it.z;
      const along = dx * Math.sin(it.yaw) + dz * Math.cos(it.yaw);
      const across = dx * Math.cos(it.yaw) - dz * Math.sin(it.yaw);
      if (Math.abs(along) > wide + 0.5 || Math.abs(across) > (it.kind === 'art' ? 6.5 : 2.6)) continue;
      if (it.kind === 'graffiti') return { text: 'Spray a tag', go: () => this.startSpray(it) };
      return { text: 'Photograph the mural', go: () => this.photograph(it) };
    }
    return null;
  }

  private startSpray(it: CItem): void {
    this.spray = { item: it, t: 0 };
    this.story.hud.showTip('Spraying… stay close', SPRAY_SECS + 0.3);
  }

  private updateSpray(dt: number): void {
    const s = this.spray;
    if (!s) return;
    const g = this.story.g;
    const p = g.player!.pos;
    if (g.driving?.mode !== 'foot' || Math.hypot(p.x - s.item.x, p.z - s.item.z) > 5.2 || this.story.mission) {
      this.spray = null;
      g.ui.toast('Tag interrupted');
      const lv = this.live.get(s.item.id);
      if (lv?.ctx && lv.tex) { drawArt(lv.ctx, lv.ctx.canvas.width, lv.ctx.canvas.height, 'graffiti', s.item.design, 0, WORDS); lv.tex.needsUpdate = true; }
      return;
    }
    s.t += dt;
    const k = Math.min(1, s.t / SPRAY_SECS);
    const lv = this.live.get(s.item.id);
    if (lv?.ctx && lv.tex) { drawArt(lv.ctx, lv.ctx.canvas.width, lv.ctx.canvas.height, 'graffiti', s.item.design, k, WORDS); lv.tex.needsUpdate = true; }
    if (k >= 1) { this.spray = null; this.collect(s.item); }
  }

  private photograph(it: CItem): void {
    this.story.g.ui.toast('📷 Click');
    this.collect(it);
  }

  // ------------------------------------------------------------------------------------------------ stunt jumps

  private updateJumps(dt: number, car: import('../vehicles/Vehicle').Vehicle | null): void {
    if (!car) { this.air = null; this.wasGrounded = true; return; }
    const airborne = car.wheels.length > 0 && car.wheels.every((w) => !w.onGround);
    if (airborne && this.wasGrounded && !this.air) {
      // taking off: only counts near the far end of a ramp
      for (const s of this.sites.values()) {
        if (!s.ramp || this.has(s.item)) continue;
        const rx = car.position.x - s.item.x, rz = car.position.z - s.item.z;
        const along = rx * s.dir.x + rz * s.dir.y;
        const side = Math.abs(rx * s.dir.y - rz * s.dir.x);
        if (along > 0 && along < s.len / 2 + 6 && side < 6) { this.air = { site: s, t: 0, x: car.position.x, z: car.position.z }; break; }
      }
    }
    if (this.air) {
      this.air.t += dt;
      if (!airborne && this.air.t > 0.12) {
        const a = this.air;
        this.air = null;
        const dist = Math.hypot(car.position.x - a.x, car.position.z - a.z);
        if (a.t >= 0.7 && dist >= 20) this.collect(a.site.item, `${Math.round(dist)} m`);
        else if (a.t >= 0.25) this.story.g.ui.toast(`Jump: ${Math.round(dist)} m — not far enough (20 m)`);
      }
    }
    this.wasGrounded = !airborne;
  }

  // ------------------------------------------------------------------------------------------------ rewards

  collect(it: CItem, extra = ''): void {
    if (this.has(it)) return;
    const info = KINDS[it.kind];
    const st = this.story;
    const eco = st.g.commerce!.eco;
    this.found(it.kind).push(it.id);
    eco.earn(info.pay, `${info.name}`);
    const n = this.count(it.kind), tot = this.total(it.kind);
    const lv = this.live.get(it.id);
    if (lv && (it.kind === 'package' || it.kind === 'plate')) { lv.dispose(); this.live.delete(it.id); }
    const blip = this.blips.get(it.id);
    if (blip) { const k = MARKERS.indexOf(blip); if (k >= 0) MARKERS.splice(k, 1); this.blips.delete(it.id); }
    const sub = `${n}/${tot}  +${money(info.pay)}${extra ? ` · ${extra}` : ''}`;
    const title = it.kind === 'plate' ? `Plate ${PLATE_CODES[(it.design - 100) % PLATE_CODES.length]}` : info.name;
    this.bannerQueue.push(() => st.hud.showBanner(info.name, title.toUpperCase(), sub, 'good', 2.4));
    st.g.audio.unlock();
    const claim = `set.${it.kind}`;
    if (n >= tot && !st.st.claimed.includes(claim)) {
      st.st.claimed.push(claim);
      eco.earn(info.set, `${info.plural} complete`);
      this.bannerQueue.push(() => st.hud.showBanner('Collection complete', info.plural.toUpperCase(), `+${money(info.set)}`, 'good', 4));
    } else if (n === Math.ceil(tot / 2) && tot > 1) {
      this.bannerQueue.push(() => st.hud.showTip(`${info.plural}: the rest are now marked on your map`, 6));
    }
    st.completion.check();
    void st.g.commerce!.save(st.g.commerce!.slot ?? 1, true);
  }

  // ------------------------------------------------------------------------------------------------ map

  private syncBlips(px: number, pz: number): void {
    const want = new Set<string>();
    for (const it of this.items) {
      if (!it.ok || this.has(it)) continue;
      if (this.revealed(it.kind) || Math.hypot(it.x - px, it.z - pz) < 240) want.add(it.id);
    }
    for (const [id, b] of this.blips) {
      if (!want.has(id)) { const k = MARKERS.indexOf(b); if (k >= 0) MARKERS.splice(k, 1); this.blips.delete(id); }
    }
    for (const id of want) {
      if (this.blips.has(id)) continue;
      const it = this.byId.get(id)!;
      const k = KINDS[it.kind];
      const b: Marker = { name: `${k.name}${it.kind === 'plate' ? ': ' + it.where : ''}`, x: it.x, z: it.z, glyph: k.glyph, color: k.color };
      this.blips.set(id, b);
      MARKERS.push(b);
    }
  }

  private clearBlips(): void {
    for (const b of this.blips.values()) { const k = MARKERS.indexOf(b); if (k >= 0) MARKERS.splice(k, 1); }
    this.blips.clear();
  }

  private clearLive(): void {
    for (const lv of this.live.values()) lv.dispose();
    this.live.clear();
    this.sites.clear();
  }

  /** Where the nearest uncollected item of a kind is (for the tracker's "mark on map"). */
  nearest(kind: CKind, x: number, z: number): CItem | null {
    let best: CItem | null = null, bd = Infinity;
    for (const it of this.items) {
      if (it.kind !== kind || !it.ok || this.has(it)) continue;
      const d = Math.hypot(it.x - x, it.z - z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
}
