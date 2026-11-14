import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BuildingBox } from '../physics/Physics';
import { artTexture, textTexture, texture, type TexName } from './textures';

/** A surface: which texture, the colour that tints it, and how many metres one repeat covers. */
export interface Surf { t: TexName; c: number; s?: number }
export const S = (t: TexName, c: number, s = 1): Surf => ({ t, c, s });

export interface Light { x: number; y: number; z: number; r: number; g: number; b: number; power: number; range: number; zone: number; down: boolean }
interface Zone { x0: number; z0: number; x1: number; z1: number; amb: THREE.Color }
interface Part { geo: THREE.BufferGeometry; key: string; glow: number; zone: number; own: number }
interface Occ { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }

/** Something to use inside: a prompt within reach of (x, z). */
export interface Spot { x: number; z: number; r: number; label: string; act: () => void; hold?: number; used?: boolean }
/** Someone in the room. */
export interface Extra { x: number; z: number; yaw: number; cast: 'clerk' | 'guard' | 'resident' | 'patron' | 'staff' | 'sleeper'; pose?: 'sit' | ''; talk?: string[] }

const _c = new THREE.Color();
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * Assembles an interior from boxes, cylinders and balls in local coordinates (floor at y = 0) and bakes its lighting:
 * every vertex gets the light from the room's fixtures and windows, a bounce term and contact shadows from whatever is
 * next to it, written into vertex colours on unlit materials. That gives soft, stable indoor light at any hour without
 * adding real lights to the scene (which would recompile every shader in the world).
 */
export class Builder {
  readonly parts: Part[] = [];
  readonly lights: Light[] = [];
  readonly zones: Zone[] = [];
  readonly occ: Occ[] = [];
  readonly solids: BuildingBox[] = [];
  readonly spots: Spot[] = [];
  readonly extras: Extra[] = [];
  readonly signs: THREE.Mesh[] = [];
  readonly mats = new Map<string, THREE.Material>();
  /** Where you appear, and where the way out is. */
  entry = { x: 0, z: 0, yaw: 0 };
  zone = -1;
  readonly r: () => number;
  /** Daylight 0..1 through the windows, and its tint. */
  day = 1;
  readonly sky = new THREE.Color(0.75, 0.85, 1);

  constructor(readonly seed: number) {
    let s = (seed >>> 0) || 1;
    this.r = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  pick<T>(a: readonly T[]): T { return a[Math.floor(this.r() * a.length) % a.length]!; }
  range(a: number, b: number): number { return a + (b - a) * this.r(); }

  // ------------------------------------------------------------------------------------------------ primitives

  private add(geo: THREE.BufferGeometry, surf: Surf | null, glow: number, colour: number, occl: boolean, key?: string): number {
    const k = key ?? (surf ? surf.t : 'glow');
    const s = surf?.s ?? 1;
    // world-scaled UVs: project each vertex on the plane its normal faces
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
      let u: number, v: number;
      if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
      uv[i * 2] = u / s; uv[i * 2 + 1] = v / s;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const col = new Float32Array(pos.count * 3);
    _c.setHex(colour);
    for (let i = 0; i < pos.count; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const own = occl ? this.occ.length : -1;
    this.parts.push({ geo, key: k, glow, zone: this.zone, own });
    return own;
  }

  private occlude(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.occ.push({ x0, y0, z0, x1, y1, z1 });
  }

  /** A box standing on y0, centred on (x, z). `solid` adds a collider; small detail can skip the contact shadows. */
  box(x: number, y0: number, z: number, sx: number, sy: number, sz: number, surf: Surf, solid = false, occl = true): void {
    const seg = (v: number): number => Math.max(1, Math.min(24, Math.round(v / 0.7)));
    const geo = new THREE.BoxGeometry(sx, sy, sz, seg(sx), seg(sy), seg(sz));
    geo.translate(x, y0 + sy / 2, z);
    this.add(geo, surf, 0, surf.c, occl);
    if (occl) this.occlude(x - sx / 2, y0, z - sz / 2, x + sx / 2, y0 + sy, z + sz / 2);
    if (solid) this.solids.push({ cx: x, cy: y0 + sy / 2, cz: z, hx: sx / 2, hy: sy / 2, hz: sz / 2 });
  }

  /** Box from corner to corner. */
  slab(x0: number, z0: number, x1: number, z1: number, y0: number, h: number, surf: Surf, solid = false, occl = true): void {
    this.box((x0 + x1) / 2, y0, (z0 + z1) / 2, Math.abs(x1 - x0), h, Math.abs(z1 - z0), surf, solid, occl);
  }

  cyl(x: number, y0: number, z: number, rad: number, h: number, surf: Surf, solid = false, seg = 14, rTop = rad): void {
    const geo = new THREE.CylinderGeometry(rTop, rad, h, seg, Math.max(1, Math.round(h / 0.6)));
    geo.translate(x, y0 + h / 2, z);
    this.add(geo, surf, 0, surf.c, true);
    this.occlude(x - rad, y0, z - rad, x + rad, y0 + h, z + rad);
    if (solid) this.solids.push({ cx: x, cy: y0 + h / 2, cz: z, hx: rad, hy: h / 2, hz: rad });
  }

  ball(x: number, y: number, z: number, rad: number, surf: Surf, sy = 1): void {
    const geo = new THREE.IcosahedronGeometry(rad, 2);
    geo.scale(1, sy, 1);
    geo.translate(x, y, z);
    this.add(geo, surf, 0, surf.c, true);
    this.occlude(x - rad * 0.7, y - rad * sy * 0.7, z - rad * 0.7, x + rad * 0.7, y + rad * sy * 0.7, z + rad * 0.7);
  }

  /** Self-lit box: lamps, screens, signs, fridge glass. `bright` 1 = a lit diffuser. */
  glow(x: number, y0: number, z: number, sx: number, sy: number, sz: number, colour: number, bright = 1): void {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    geo.translate(x, y0 + sy / 2, z);
    this.add(geo, null, bright, colour, false, 'glow');
  }

  /** A flat textured plate (sign, poster, painting) facing +z/-z/+x/-x. */
  plate(x: number, y: number, z: number, w: number, h: number, face: 0 | 1 | 2 | 3, map: THREE.Texture, lit = false): void {
    const geo = new THREE.PlaneGeometry(w, h);
    if (face === 1) geo.rotateY(Math.PI);
    else if (face === 2) geo.rotateY(Math.PI / 2);
    else if (face === 3) geo.rotateY(-Math.PI / 2);
    geo.translate(x, y, z);
    const m = new THREE.MeshBasicMaterial({ map, fog: false, toneMapped: true, color: lit ? 0xffffff : 0xd8d8d8 });
    const mesh = new THREE.Mesh(geo, m);
    this.signs.push(mesh);
  }

  sign(text: string, x: number, y: number, z: number, w: number, face: 0 | 1 | 2 | 3, fg = '#ffffff', bg = '#1b1e24'): void {
    this.plate(x, y, z, w, w / 4, face, textTexture(text, fg, bg), true);
  }

  picture(x: number, y: number, z: number, w: number, face: 0 | 1 | 2 | 3): void {
    const h = w * 0.75;
    const n = face === 0 ? [0, 1] : face === 1 ? [0, -1] : face === 2 ? [1, 0] : [-1, 0];
    // frame behind it
    const fx = x - n[0]! * 0.02, fz = z - n[1]! * 0.02;
    const thin = face < 2;
    this.box(fx, y - h / 2 - 0.05, fz, thin ? w + 0.1 : 0.04, h + 0.1, thin ? 0.04 : w + 0.1, S('wood', 0x3a2a1c, 0.5), false, false);
    this.plate(x, y, z, w, h, face, artTexture(this.seed + Math.floor(x * 13 + z * 7)));
  }

  // ------------------------------------------------------------------------------------------------ lighting

  /** Start a lighting zone (a room): lights added after this only light vertices inside it. */
  beginZone(x0: number, z0: number, x1: number, z1: number, amb: number | THREE.Color = 0x8a8278): number {
    this.zones.push({ x0, z0, x1, z1, amb: amb instanceof THREE.Color ? amb.clone() : new THREE.Color(amb) });
    this.zone = this.zones.length - 1;
    return this.zone;
  }

  /** A light source (ceiling fixtures point down). */
  light(x: number, y: number, z: number, colour = 0xfff4e8, power = 1, range = 4.5, down = true): void {
    _c.setHex(colour);
    this.lights.push({ x, y, z, r: _c.r, g: _c.g, b: _c.b, power, range, zone: this.zone, down });
  }

  /** A ceiling fixture: a glowing panel and its light. */
  fixture(x: number, z: number, ceil: number, kind: 'panel' | 'round' | 'strip' | 'pendant' | 'bulb' = 'panel', colour = 0xfff1dc, power = 1): void {
    if (kind === 'panel') this.glow(x, ceil - 0.04, z, 1.2, 0.04, 0.6, colour, 1.5);
    else if (kind === 'strip') this.glow(x, ceil - 0.05, z, 1.6, 0.05, 0.16, colour, 1.6);
    else if (kind === 'round') { this.glow(x, ceil - 0.06, z, 0.5, 0.06, 0.5, colour, 1.4); }
    else if (kind === 'pendant') {
      this.box(x, ceil - 0.55, z, 0.02, 0.55, 0.02, S('metal', 0x222222), false, false);
      this.cyl(x, ceil - 0.8, z, 0.24, 0.26, S('metal', 0x2a2d33), false, 16, 0.08);
      this.glow(x, ceil - 0.81, z, 0.32, 0.02, 0.32, colour, 1.8);
    } else { this.ball(x, ceil - 0.25, z, 0.07, S('plain', 0xffffff)); this.glow(x, ceil - 0.3, z, 0.1, 0.1, 0.1, colour, 2); }
    this.light(x, ceil - (kind === 'pendant' ? 0.85 : 0.1), z, colour, power, kind === 'strip' ? 5 : 4.4);
  }

  /** A window on a wall plane: a pane lit by the sky (dark at night), with light coming in from it. */
  window(x: number, y0: number, z: number, w: number, h: number, face: 0 | 1 | 2 | 3): void {
    const thin = face < 2;
    const n = face === 0 ? [0, 1] : face === 1 ? [0, -1] : face === 2 ? [1, 0] : [-1, 0];
    const day = this.day;
    const sky = this.sky.clone().multiplyScalar(0.25 + 0.95 * day);
    if (day < 0.2) sky.setRGB(0.05, 0.07, 0.12).lerp(new THREE.Color(0.9, 0.6, 0.3), 0.15);
    this.glow(x, y0, z, thin ? w : 0.03, h, thin ? 0.03 : w, sky.getHex(), 1);
    // sill and frame
    this.box(x + n[0]! * 0.06, y0 - 0.06, z + n[1]! * 0.06, thin ? w + 0.16 : 0.16, 0.06, thin ? 0.16 : w + 0.16, S('plain', 0xe8e4dc), false, false);
    this.box(x, y0 + h / 2 - 0.02, z, thin ? w : 0.05, 0.04, thin ? 0.05 : w, S('plain', 0xe8e4dc), false, false);
    if (day > 0.05) this.light(x + n[0]! * 0.9, y0 + h * 0.6, z + n[1]! * 0.9, sky.getHex(), 0.9 * day + 0.05, 5.5, false);
  }

  // ------------------------------------------------------------------------------------------------ rooms

  /**
   * A room with floor, ceiling and four walls, plus skirting. `gaps` cut doorways: side 0 = -z wall, 1 = +z, 2 = -x, 3 = +x,
   * `at` = centre along the wall (x for 0/1, z for 2/3), `w` = width, `h` = height (default 2.3).
   */
  room(x0: number, z0: number, x1: number, z1: number, h: number, o: { floor: Surf; wall: Surf; ceil?: Surf; gaps?: { side: 0 | 1 | 2 | 3; at: number; w: number; h?: number }[]; amb?: number; skirting?: number; noCeil?: boolean; t?: number; wallTop?: Surf; wainscot?: Surf }): void {
    const T = o.t ?? 0.2;
    this.beginZone(x0, z0, x1, z1, o.amb ?? 0x8a8278);
    this.slab(x0, z0, x1, z1, -0.1, 0.1, o.floor);
    if (!o.noCeil) this.slab(x0, z0, x1, z1, h, 0.12, o.ceil ?? S('plaster', 0xf2efe8, 2));
    const gaps = o.gaps ?? [];
    const wall = (side: 0 | 1 | 2 | 3): void => {
      const along = side < 2;
      const a0 = along ? x0 : z0, a1 = along ? x1 : z1;
      const fixed = side === 0 ? z0 - T / 2 : side === 1 ? z1 + T / 2 : side === 2 ? x0 - T / 2 : x1 + T / 2;
      const cuts = gaps.filter((g) => g.side === side).sort((a, b) => a.at - b.at);
      let cur = a0 - (along ? T : 0);
      const end = a1 + (along ? T : 0);
      const piece = (p0: number, p1: number, y0: number, hh: number): void => {
        if (p1 - p0 < 0.01 || hh < 0.01) return;
        if (along) this.slab(p0, fixed - T / 2, p1, fixed + T / 2, y0, hh, o.wall, true);
        else this.slab(fixed - T / 2, p0, fixed + T / 2, p1, y0, hh, o.wall, true);
      };
      for (const g of cuts) {
        const g0 = g.at - g.w / 2, g1 = g.at + g.w / 2, gh = g.h ?? 2.3;
        piece(cur, g0, 0, h);
        piece(g0, g1, gh, h - gh);
        cur = g1;
      }
      piece(cur, end, 0, h);
      // skirting board along the inside face
      if (o.skirting !== undefined) {
        const inset = side === 0 ? z0 + 0.01 : side === 1 ? z1 - 0.01 : side === 2 ? x0 + 0.01 : x1 - 0.01;
        let c2 = a0;
        for (const g of [...cuts, { at: a1 + 10, w: 0 }]) {
          const e = Math.min(a1, g.at - g.w / 2);
          if (e - c2 > 0.05) {
            if (along) this.slab(c2, inset - 0.012, e, inset + 0.012, 0, 0.1, S('plain', o.skirting), false, false);
            else this.slab(inset - 0.012, c2, inset + 0.012, e, 0, 0.1, S('plain', o.skirting), false, false);
          }
          c2 = g.at + g.w / 2;
        }
      }
    };
    wall(0); wall(1); wall(2); wall(3);
  }

  /** A partition between two rooms with optional doorway (axis 'x' = wall runs along x at z = pos). */
  partition(axis: 'x' | 'z', pos: number, a0: number, a1: number, h: number, surf: Surf, door?: { at: number; w: number }): void {
    const T = 0.14;
    const seg = (p0: number, p1: number, y0: number, hh: number): void => {
      if (p1 - p0 < 0.01) return;
      if (axis === 'x') this.slab(p0, pos - T / 2, p1, pos + T / 2, y0, hh, surf, true);
      else this.slab(pos - T / 2, p0, pos + T / 2, p1, y0, hh, surf, true);
    };
    if (!door) { seg(a0, a1, 0, h); return; }
    seg(a0, door.at - door.w / 2, 0, h);
    seg(door.at - door.w / 2, door.at + door.w / 2, 2.15, h - 2.15);
    seg(door.at + door.w / 2, a1, 0, h);
  }

  spot(x: number, z: number, label: string, act: () => void, r = 1.3, hold?: number): Spot {
    const s: Spot = { x, z, r, label, act, hold };
    this.spots.push(s);
    return s;
  }

  person(x: number, z: number, yaw: number, cast: Extra['cast'], pose: Extra['pose'] = '', talk?: string[]): void {
    this.extras.push({ x, z, yaw, cast, pose, talk });
  }

  // ------------------------------------------------------------------------------------------------ bake

  /** Bake the light into vertex colours and return the merged meshes. */
  finish(): THREE.Group {
    const group = new THREE.Group();
    const byKey = new Map<string, THREE.BufferGeometry[]>();
    const occ = this.occ;
    for (const part of this.parts) {
      const geo = part.geo;
      if (!part.glow) this.bake(part, occ);
      else {
        const col = geo.getAttribute('color') as THREE.BufferAttribute;
        for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * part.glow, col.getY(i) * part.glow, col.getZ(i) * part.glow);
      }
      const list = byKey.get(part.key) ?? [];
      list.push(geo.index ? geo.toNonIndexed() : geo);
      if (geo.index) geo.dispose();
      byKey.set(part.key, list);
    }
    for (const [key, list] of byKey) {
      for (const g of list) for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      let mat = this.mats.get(key);
      if (!mat) {
        mat = key === 'glow'
          ? new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })
          : new THREE.MeshBasicMaterial({ vertexColors: true, map: texture(key as TexName), fog: false });
        this.mats.set(key, mat);
      }
      const mesh = new THREE.Mesh(merged, mat);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    for (const s of this.signs) { s.matrixAutoUpdate = false; group.add(s); this.mats.set('sign' + s.id, s.material as THREE.Material); }
    return group;
  }

  private bake(part: Part, occ: Occ[]): void {
    const geo = part.geo;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    // the zone is the room this part was made in; vertices outside every zone use the part's own
    const zones = this.zones;
    const lights = this.lights;
    // the bounding box of the part, to pick nearby occluders once
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const R = 0.75;
    const near: Occ[] = [];
    for (let i = 0; i < occ.length; i++) {
      if (i === part.own) continue;
      const o = occ[i]!;
      if (o.x1 < bb.min.x - R || o.x0 > bb.max.x + R || o.y1 < bb.min.y - R || o.y0 > bb.max.y + R || o.z1 < bb.min.z - R || o.z0 > bb.max.z + R) continue;
      near.push(o);
    }
    for (let i = 0; i < pos.count; i++) {
      _p.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      _n.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      // which room is this vertex in? (the smallest zone holding a point just in front of the face)
      let zi = part.zone, best = Infinity;
      const zx = _p.x + _n.x * 0.25, zz = _p.z + _n.z * 0.25;
      for (let k = 0; k < zones.length; k++) {
        const z = zones[k]!;
        if (zx > z.x0 - 0.05 && zx < z.x1 + 0.05 && zz > z.z0 - 0.05 && zz < z.z1 + 0.05) {
          const area = (z.x1 - z.x0) * (z.z1 - z.z0);
          if (area < best) { best = area; zi = k; }
        }
      }
      const amb = zones[zi]?.amb ?? _c.setHex(0x8a8278);
      let lr = amb.r, lg = amb.g, lb = amb.b;
      // gentle sky-from-above bias: floors catch more bounce than ceilings
      const up = 0.85 + 0.25 * _n.y;
      lr *= up; lg *= up; lb *= up;
      for (const L of lights) {
        if (L.zone !== zi && L.zone >= 0) continue;
        const dx = L.x - _p.x, dy = L.y - _p.y, dz = L.z - _p.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const d = Math.sqrt(d2) || 1e-3;
        let ndl = (_n.x * dx + _n.y * dy + _n.z * dz) / d;
        ndl = Math.max(0, ndl * 0.85 + 0.15);
        let k = L.power * ndl / (1 + d2 / (L.range * L.range * 0.35));
        if (L.down) k *= 0.35 + 0.65 * Math.max(0, dy / d);
        k *= Math.max(0, 1 - d / (L.range * 2.4));
        lr += L.r * k; lg += L.g * k; lb += L.b * k;
      }
      // contact shadows from nearby solids
      let o = 0;
      const qx = _p.x + _n.x * 0.03, qy = _p.y + _n.y * 0.03, qz = _p.z + _n.z * 0.03;
      for (const b of near) {
        const cx = Math.max(b.x0, Math.min(qx, b.x1)), cy = Math.max(b.y0, Math.min(qy, b.y1)), cz = Math.max(b.z0, Math.min(qz, b.z1));
        const ex = cx - qx, ey = cy - qy, ez = cz - qz;
        const dd = Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (dd > R) continue;
        const facing = dd < 1e-4 ? 1 : (ex * _n.x + ey * _n.y + ez * _n.z) / dd;
        if (facing < -0.2) continue;
        const f = 1 - dd / R;
        o += f * f * (0.45 + 0.55 * Math.max(0, facing));
      }
      const ao = 1 - Math.min(0.6, o * 0.5);
      col.setXYZ(i, col.getX(i) * lr * ao, col.getY(i) * lg * ao, col.getZ(i) * lb * ao);
    }
  }
}
