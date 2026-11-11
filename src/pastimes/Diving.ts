import * as THREE from 'three';
import type { Story } from '../story/Story';
import { money } from '../economy/Economy';
import { terrainHeight, waterLevelAt } from '../world/Terrain';
import { h } from '../ui/dom';

export interface DiveSite { id: string; name: string; x: number; z: number; kind: 'trawler' | 'plane' | 'galleon' | 'containers' }
export const DIVE_SITES: DiveSite[] = [
  { id: 'delsol', name: 'Del Sol Wreck', x: -58, z: -150, kind: 'trawler' },
  { id: 'cove', name: 'Smuggler\'s Seaplane', x: -60, z: 720, kind: 'plane' },
  { id: 'isla', name: 'Isla Rojo Galleon', x: -1236, z: 1077, kind: 'galleon' },
  { id: 'pine', name: 'Pinecrest Trawler', x: 150, z: -2450, kind: 'trawler' },
  { id: 'costa', name: 'Lost Containers', x: -50, z: 3550, kind: 'containers' },
];
export const DIVE_SHOP = { x: 96, z: -138 };
const RELICS = [
  { name: 'Clay amphora', value: 180, color: 0xb0603a },
  { name: 'Gold doubloons', value: 420, color: 0xffcc44 },
  { name: 'Brass compass', value: 260, color: 0xd8a040 },
  { name: 'Sealed lockbox', value: 650, color: 0x6a7a8a },
];
export const RELIC_COUNT = DIVE_SITES.length * RELICS.length;

interface Relic { site: DiveSite; i: number; mesh: THREE.Mesh; x: number; y: number; z: number }

/** Scuba diving: rent gear on the beach, swim down to five wrecks and bring up what is lying around them. */
export class Diving {
  breath = 1;
  private under = 0;
  private built = new Set<string>();
  private readonly relics: Relic[] = [];
  private readonly mats: THREE.MeshStandardMaterial[] = [];
  private readonly hud: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly depthEl: HTMLElement;
  private drownT = 0;
  private wasUnder = false;
  private shop: { x: number; z: number } | null = null;

  constructor(private readonly s: Story) {
    this.fill = h('i', '');
    this.depthEl = h('span', '', '');
    this.hud = h('div', 'ps-breath is-hidden', h('span', 'ps-o2', 'O₂'), h('div', 'ps-bar air', this.fill), this.depthEl);
    s.g.ui.hudRoot.append(this.hud);
  }

  private mat(color: number, emissive = 0, rough = 0.85, metal = 0.1): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: emissive ? 0.6 : 0 });
    this.s.g.world.rig.register(m);
    this.mats.push(m);
    return m;
  }

  private found(site: string, i: number): boolean { return !!this.s.st.acts['pastime.dive']?.ext['r:' + site + ':' + i]; }

  /** Build a wreck and its relics when the player first comes near. */
  private build(site: DiveSite): void {
    this.built.add(site.id);
    const g = this.s.g;
    const grp = new THREE.Group();
    const floor = terrainHeight(site.x, site.z);
    grp.position.set(site.x, floor, site.z);
    grp.rotation.y = (site.x * 13 + site.z * 7) % 6.28;
    const rust = this.mat(0x5a3a2a, 0, 0.95), dark = this.mat(0x2a2e2a, 0, 0.9), wood = this.mat(0x4a3826, 0, 0.95), weed = this.mat(0x2f5a3a, 0, 1);
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void => {
      const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); mesh.castShadow = true; grp.add(mesh);
    };
    if (site.kind === 'trawler') {
      add(new THREE.BoxGeometry(5, 3, 16), rust, 0, 1.2, 0, 0.06, 0, 0.32);
      add(new THREE.BoxGeometry(3.6, 2.4, 4), dark, 0.6, 3.2, -2, 0.06, 0, 0.32);
      add(new THREE.CylinderGeometry(0.15, 0.2, 8, 6), rust, -0.8, 5, 3, 0.3, 0, 0.32);
    } else if (site.kind === 'plane') {
      add(new THREE.CylinderGeometry(0.9, 0.7, 9, 10), this.mat(0xc8c4b8, 0, 0.6, 0.4), 0, 0.9, 0, Math.PI / 2, 0, 0.15);
      add(new THREE.BoxGeometry(14, 0.25, 2), this.mat(0xb8b4a8, 0, 0.6, 0.4), 0, 1.6, 0.6, 0, 0, 0.12);
      add(new THREE.BoxGeometry(1, 0.6, 4), dark, 3, 0.3, 0.5); add(new THREE.BoxGeometry(1, 0.6, 4), dark, -3, 0.3, 0.5);
    } else if (site.kind === 'galleon') {
      add(new THREE.BoxGeometry(7, 4, 22), wood, 0, 1.6, 0, 0.1, 0, -0.4);
      add(new THREE.BoxGeometry(6, 3, 5), wood, 0.4, 4.2, -8, 0.1, 0, -0.4);
      add(new THREE.CylinderGeometry(0.3, 0.35, 12, 6), wood, -1.8, 5, 2, 0.5, 0, -0.4);
      add(new THREE.CylinderGeometry(0.28, 0.3, 9, 6), wood, -1.2, 4, -4, -0.6, 0, -0.5);
    } else {
      const cols = [0xa8362a, 0x2a5a8a, 0x3a7a3a, 0xc8902a];
      for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(2.5, 2.6, 12), this.mat(cols[k % 4]!, 0, 0.8, 0.3), (k % 3) * 4 - 4, 1.3 + (k > 3 ? 2.6 : 0), Math.floor(k / 3) * 6 - 3, 0, k * 0.4, k % 2 ? 0.1 : -0.15);
    }
    // seaweed and rocks around it
    for (let k = 0; k < 18; k++) {
      const a = k * 2.4, d = 6 + (k * 7) % 14;
      add(new THREE.ConeGeometry(0.25, 1.4 + (k % 4) * 0.7, 4), weed, Math.cos(a) * d, 0.7, Math.sin(a) * d, 0, a, 0.15);
    }
    g.world.scene.add(grp);
    // relics around the wreck, resting on the seabed
    RELICS.forEach((r, i) => {
      if (this.found(site.id, i)) return;
      const a = i * 1.7 + 0.6, d = 7 + i * 3;
      const x = site.x + Math.cos(a) * d, z = site.z + Math.sin(a) * d;
      const y = terrainHeight(x, z) + 0.35;
      const geo = i === 0 ? new THREE.CylinderGeometry(0.18, 0.28, 0.7, 10) : i === 1 ? new THREE.CylinderGeometry(0.3, 0.3, 0.12, 14) : i === 2 ? new THREE.SphereGeometry(0.2, 12, 8) : new THREE.BoxGeometry(0.6, 0.4, 0.45);
      const mesh = new THREE.Mesh(geo, this.mat(r.color, r.color, 0.4, 0.6));
      mesh.position.set(x, y, z);
      g.world.scene.add(mesh);
      this.relics.push({ site, i, mesh, x, y, z });
    });
  }

  rentGear(): void {
    const g = this.s.g;
    if (g.player!.scuba) { g.ui.toast('You already have scuba gear on.'); return; }
    if (!g.commerce!.eco.spend(60, 'Scuba rental')) { g.ui.toast('Scuba rental is $60.'); return; }
    g.player!.scuba = true;
    this.s.hud.showBanner('Scuba gear', 'Ten minutes of air', 'Crouch to dive · Jump to rise · wrecks are on the map', 'good', 4);
    this.breath = 1;
  }

  /** The prompt at the dive shop. */
  offer(): { text: string; go: () => void } | null {
    const p = this.s.g.player!.pos;
    const shop = (this.shop ??= this.s.snap(DIVE_SHOP.x, DIVE_SHOP.z, 1.4));
    if (Math.hypot(shop.x - p.x, shop.z - p.z) < 3) return { text: this.s.g.player!.scuba ? 'Neptune Dive Shop (gear on)' : 'Rent scuba gear ($60)', go: () => this.rentGear() };
    return null;
  }

  update(dt: number): void {
    const g = this.s.g;
    const pl = g.player;
    if (!pl) return;
    // build wrecks as the player approaches
    for (const site of DIVE_SITES) if (!this.built.has(site.id) && Math.hypot(site.x - pl.pos.x, site.z - pl.pos.z) < 320) this.build(site);
    if (g.driving?.mode !== 'foot' && pl.scuba) { pl.scuba = false; g.ui.toast('Scuba gear returned.'); }
    const cam = g.camera.position;
    const wl = waterLevelAt(cam.x, cam.z);
    const onFoot = g.driving?.mode === 'foot' && g.state !== 'title';
    const under = onFoot && cam.y < wl - 0.08 && terrainHeight(cam.x, cam.z) < wl;
    this.under += ((under ? 1 : 0) - this.under) * Math.min(1, dt * 8);
    g.world.atmosphere.setUnderwater(this.under > 0.02 ? this.under : 0);
    g.audio.setUnderwater(under);
    if (under !== this.wasUnder) {
      this.wasUnder = under;
      document.getElementById('ui')?.classList.toggle('uw', under);
    }
    // breath
    if (under) {
      this.breath = Math.max(0, this.breath - dt / (pl.scuba ? 600 : 32));
      if (this.breath <= 0) {
        this.drownT -= dt;
        if (this.drownT <= 0) { this.drownT = 1; g.combat?.vitals.hurt(14); }
      }
    } else this.breath = Math.min(1, this.breath + dt * 0.4);
    const show = under || this.breath < 0.999;
    this.hud.classList.toggle('is-hidden', !show);
    if (show) {
      this.fill.style.transform = `scaleX(${this.breath})`;
      this.hud.classList.toggle('low', this.breath < 0.25);
      const depth = Math.max(0, wl - cam.y);
      this.depthEl.textContent = under ? `${depth.toFixed(1)} m${pl.scuba ? ' · scuba' : ''}` : '';
    }
    // relics: swim close to pick them up
    if (under || pl.state === 'swim') {
      for (let i = this.relics.length - 1; i >= 0; i--) {
        const r = this.relics[i]!;
        r.mesh.rotation.y += dt * 0.6;
        if (Math.hypot(r.x - pl.pos.x, r.z - pl.pos.z) < 1.8 && Math.abs(r.y - (pl.pos.y + 0.8)) < 2.2) this.take(r, i);
      }
    }
  }

  private take(r: Relic, idx: number): void {
    const g = this.s.g;
    const def = RELICS[r.i]!;
    g.world.scene.remove(r.mesh);
    this.relics.splice(idx, 1);
    const rec = (this.s.st.acts['pastime.dive'] ??= { plays: 0, wins: 0, best: 0, ext: {} });
    rec.ext['r:' + r.site.id + ':' + r.i] = 1;
    this.s.actWin('pastime.dive');
    g.commerce!.eco.earn(def.value, 'Salvage');
    const n = Object.keys(rec.ext).filter((k) => k.startsWith('r:')).length;
    this.s.hud.showBanner('Salvage', def.name, `${r.site.name} · +${money(def.value)} · ${n}/${RELIC_COUNT}`, 'good', 3);
    g.audio.sport('rim', 0.4);
  }
}
