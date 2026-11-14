import * as THREE from 'three';
import type { Game } from '../Game';
import { WEAPONS, type WeaponId } from '../player/Weapons';
import { MARKERS } from '../ui/mapData';
import { radialTexture } from '../world/City';
import { callPolice } from '../crime/heat';
import { money } from './Economy';
import { PROPERTY_BY_ID, SHOP_WEAPONS } from './catalog';
import type { CartLine, Drop, DropKind } from './types';

/** Map markers for packages carry this invisible prefix so they can be found and removed. */
const TAG = '⁣';
const FALL = 140;

interface Live { drop: Drop; group: THREE.Group; chute: THREE.Group | null; y: number; ground: number; marker: { name: string; x: number; z: number; glyph: string; color?: string }; smoke: THREE.Sprite[]; t: number }

/**
 * Packages ordered online: guns, ammunition, attachments and gear. A courier leaves a crate near you, an air drop
 * parachutes one down, a safehouse delivery waits at the door, and the black market leaves a dead drop somewhere out of
 * the way (sometimes with the police watching). Pending and landed packages are saved; walk up and press E to collect.
 */
export class Deliveries {
  prompt: string | null = null;
  private readonly live = new Map<string, Live>();
  private near: Live | null = null;
  private readonly mats: { crate: THREE.MeshStandardMaterial; strap: THREE.MeshStandardMaterial; chute: THREE.MeshStandardMaterial; flare: THREE.MeshBasicMaterial; smoke: THREE.SpriteMaterial; label: THREE.MeshBasicMaterial };
  readonly stats = { delivered: 0, stings: 0 };

  constructor(private readonly g: Game) {
    const reg = (m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial => { g.world.rig.register(m); return m; };
    this.mats = {
      crate: reg(new THREE.MeshStandardMaterial({ color: 0x4a5238, roughness: 0.85 })),
      strap: reg(new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 })),
      chute: reg(new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.8, side: THREE.DoubleSide })),
      flare: new THREE.MeshBasicMaterial({ color: 0xff3a1a }),
      smoke: new THREE.SpriteMaterial({ map: radialTexture(), color: 0xff7a3a, transparent: true, opacity: 0.55, depthWrite: false }),
      label: new THREE.MeshBasicMaterial({ color: 0xe8d8a0 }),
    };
  }

  private get drops(): Drop[] { return this.g.commerce!.eco.p.drops; }
  private get now(): number { return this.g.commerce!.eco.p.stats.playSeconds; }

  /** Where the player really is (the street door while indoors). */
  private here(): { x: number; z: number; yaw: number } {
    const pl = this.g.player!;
    const out = this.g.interiors?.outside();
    return out ?? { x: pl.pos.x, z: pl.pos.z, yaw: pl.yaw };
  }

  /** Book a delivery. Returns a line for the confirmation page. */
  order(items: CartLine[], kind: DropKind, home?: string): Drop {
    const cm = this.g.commerce!;
    const p = this.here();
    let x = p.x, z = p.z, eta = 40;
    const ang = Math.random() * Math.PI * 2;
    if (kind === 'courier') { const r = 25 + Math.random() * 20; ({ x, z } = cm.points.find(p.x + Math.cos(ang) * r, p.z + Math.sin(ang) * r, 1.6, { walkOnly: false, maxR: 60 })); eta = 40; }
    else if (kind === 'air') { const r = 22 + Math.random() * 16; ({ x, z } = cm.points.find(p.x + Math.cos(ang) * r, p.z + Math.sin(ang) * r, 2.5, { walkOnly: false, maxR: 60 })); eta = 12; }
    else if (kind === 'home') { const pt = cm.points.byRef(home ?? ''); const s = cm.points.find((pt?.x ?? p.x) + 3, (pt?.z ?? p.z) + 2, 1.4, { walkOnly: false, maxR: 30 }); x = s.x; z = s.z; eta = 20; }
    else { const r = 220 + Math.random() * 200; ({ x, z } = cm.points.find(p.x + Math.cos(ang) * r, p.z + Math.sin(ang) * r, 2, { walkOnly: false, maxR: 120 })); eta = 60; }
    const d: Drop = { id: `d${cm.eco.p.seq++}`, items, kind, x, z, at: this.now + eta, home, sting: kind === 'dead' && Math.random() < 0.15, landed: false };
    this.drops.push(d);
    void cm.save(cm.slot ?? 1, true);
    return d;
  }

  /** Seconds until a pending drop arrives (0 when it is there). */
  eta(d: Drop): number { return Math.max(0, d.at - this.now); }

  // ------------------------------------------------------------------------------------------------ per frame

  update(dt: number): void {
    const g = this.g;
    this.prompt = null;
    this.near = null;
    if (!g.commerce || !g.player || g.state !== 'playing') return;
    // arrivals
    for (const d of this.drops) {
      if (this.live.has(d.id)) continue;
      if (!d.landed && this.now < d.at) continue;
      const fresh = !d.landed;
      this.spawn(d, fresh && d.kind === 'air');
      if (fresh) {
        d.landed = true;
        const where = d.kind === 'home' ? `at ${PROPERTY_BY_ID[d.home ?? '']?.name ?? 'your place'}` : d.kind === 'dead' ? 'at the dead drop' : 'nearby';
        g.commerce.eco.message(d.kind === 'dead' ? 'ghostline' : 'Brass & Barrel', d.kind === 'dead' ? 'Package is down. Coordinates on your map. Come alone.' : `Your order has been delivered ${where}. It is marked on your map.`);
        g.ui.toast(d.kind === 'air' ? 'Air drop incoming!' : `Package delivered ${where}`);
        g.map.setWaypoint({ x: d.x, z: d.z });
      }
    }
    // falling crates, smoke and the collect prompt
    const pl = g.player;
    const onFoot = g.driving?.mode === 'foot' && !g.piloting?.busy && !g.interiors?.inside;
    for (const L of this.live.values()) {
      L.t += dt;
      if (L.y > L.ground) {
        L.y = Math.max(L.ground, L.y - dt * 7);
        L.group.position.y = L.y;
        L.group.rotation.y += dt * 0.4;
        if (L.y <= L.ground && L.chute) { L.chute.visible = false; g.audio.sport('thwack', 0.5, L.group.position); }
      }
      for (const [i, s] of L.smoke.entries()) {
        const k = (L.t * 0.35 + i / L.smoke.length) % 1;
        s.position.set(L.drop.x + Math.sin(i * 2.3 + L.t * 0.3) * k * 1.5, L.ground + 0.4 + k * 6, L.drop.z + Math.cos(i * 1.7) * k * 1.5);
        s.scale.setScalar(0.6 + k * 3);
        s.material.opacity = 0.5 * (1 - k);
      }
      if (onFoot && L.y <= L.ground && Math.hypot(pl.pos.x - L.drop.x, pl.pos.z - L.drop.z) < 2.3) this.near = L;
    }
    if (this.near) {
      this.prompt = 'Collect package';
      if (g.input.pressed('interact')) { g.input.swallow('interact'); this.collect(this.near); }
    }
  }

  private spawn(d: Drop, falling: boolean): void {
    const g = this.g;
    const ground = g.world.heightAt(d.x, d.z);
    const grp = new THREE.Group();
    const m = this.mats;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.62), m.crate);
    crate.position.y = 0.3;
    grp.add(crate);
    for (const sx of [-0.3, 0.3]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.64), m.strap); s.position.set(sx, 0.3, 0); grp.add(s); }
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.22), m.label);
    label.position.set(0, 0.34, 0.315);
    grp.add(label);
    const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), m.flare);
    flare.position.set(0.42, 0.7, 0.2);
    grp.add(flare);
    let chute: THREE.Group | null = null;
    if (falling) {
      chute = new THREE.Group();
      const dome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), m.chute);
      dome.position.y = 5;
      chute.add(dome);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 4.6, 4), m.strap);
        line.position.set(sx * 0.7, 3, sz * 0.7);
        line.rotation.set(sz * 0.32, 0, -sx * 0.32);
        chute.add(line);
      }
      grp.add(chute);
    }
    const y = falling ? ground + FALL : ground;
    grp.position.set(d.x, y, d.z);
    g.world.scene.add(grp);
    const smoke: THREE.Sprite[] = [];
    if (d.kind !== 'home') for (let i = 0; i < 8; i++) { const s = new THREE.Sprite(m.smoke.clone()); g.world.scene.add(s); smoke.push(s); }
    const marker = { name: `${TAG}${d.kind === 'dead' ? 'Dead drop' : 'Package'}`, x: d.x, z: d.z, glyph: '▣', color: d.kind === 'dead' ? '#b04aff' : '#ffb02e' };
    MARKERS.push(marker);
    this.live.set(d.id, { drop: d, group: grp, chute, y, ground, marker, smoke, t: 0 });
  }

  private remove(L: Live): void {
    const g = this.g;
    g.world.scene.remove(L.group);
    L.group.traverse((o) => { const mm = o as THREE.Mesh; if (mm.geometry) mm.geometry.dispose(); });
    for (const s of L.smoke) { g.world.scene.remove(s); s.material.dispose(); }
    const i = MARKERS.indexOf(L.marker);
    if (i >= 0) MARKERS.splice(i, 1);
    this.live.delete(L.drop.id);
    const k = this.drops.indexOf(L.drop);
    if (k >= 0) this.drops.splice(k, 1);
  }

  private collect(L: Live): void {
    const g = this.g, cm = g.commerce!;
    const got: string[] = [];
    for (const line of L.drop.items) { grant(g, line); got.push(line.qty > 1 ? `${line.label} ×${line.qty}` : line.label); }
    cm.applyKits();
    g.audio.mech('cloth');
    g.audio.uiBlip('ok');
    this.stats.delivered++;
    this.remove(L);
    g.ui.toast(`Collected: ${got.slice(0, 3).join(', ')}${got.length > 3 ? ` and ${got.length - 3} more` : ''}`);
    if (g.map.waypoint && Math.hypot(g.map.waypoint.x - L.drop.x, g.map.waypoint.z - L.drop.z) < 3) g.map.setWaypoint(null);
    if (L.drop.sting) {
      this.stats.stings++;
      callPolice(g, 2, L.drop.x, L.drop.z, true);
      g.ui.toast('It was a sting! The police were watching the drop.');
    }
    void cm.save(cm.slot ?? 1, true);
  }

  /** Drop every package from the world (new game / load): they come back from the save. */
  reset(): void {
    for (const L of [...this.live.values()]) {
      this.g.world.scene.remove(L.group);
      for (const s of L.smoke) this.g.world.scene.remove(s);
      const i = MARKERS.indexOf(L.marker);
      if (i >= 0) MARKERS.splice(i, 1);
    }
    this.live.clear();
  }
}

/** Put one order line into the player's hands. */
export function grant(g: Game, line: CartLine): void {
  const e = g.commerce!.eco, w = g.weapon!;
  const id = line.id as WeaponId;
  if (line.kind === 'supply') {
    for (let i = 0; i < line.qty; i++) { if (line.id === 'medkit') g.combat?.vitals.heal(100); else g.combat?.vitals.addArmour(100); }
    return;
  }
  const def = WEAPONS[id];
  if (!def) return;
  const st = e.p.weapons[id];
  const sw = SHOP_WEAPONS.find((s) => s.id === id);
  const cur = w.def.id === id;
  const addAmmo = (n: number): void => {
    const have = cur ? w.reserve : w.inv[id].reserve;
    const next = Math.min(def.reserveMax, have + n);
    if (cur) w.reserve = next; else w.inv[id].reserve = next;
    st.reserve = next;
  };
  if (line.kind === 'weapon') {
    if (!st.owned) {
      st.owned = true; st.ammo = def.mag; st.reserve = Math.min(def.reserveMax, (sw?.ammoPack ?? 0) * 2);
      w.inv[id].owned = true; w.inv[id].ammo = st.ammo; w.inv[id].reserve = st.reserve;
    } else addAmmo((sw?.ammoPack ?? 0) * 2);
  } else if (line.kind === 'ammo') addAmmo((sw?.ammoPack ?? 0) * line.qty);
  else if (line.kind === 'attach' && line.key) e.p.kits[id][line.key] = true;
}

export const dropLabel = (k: DropKind): string => ({ courier: 'Courier drop', air: 'Express air drop', home: 'Safehouse delivery', dead: 'Dead drop' })[k];
export { money };
