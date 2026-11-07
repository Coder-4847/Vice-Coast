import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A cross-section of a lofted hull / fuselage: trapezoid in x–y at height z. Forward is −z. */
export interface Section { z: number; wTop: number; wBot: number; yTop: number; yBot: number; x?: number }

export interface Xform { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number }

/** Collects low-poly parts with vertex colours and merges them into one mesh (so a whole aircraft is two draw calls). */
export class Mesher {
  private readonly parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, hex: number, t: Xform = {}): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    if (t.sx !== undefined || t.sy !== undefined || t.sz !== undefined) g.scale(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    if (t.rx || t.ry || t.rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0, 'YXZ')));
    g.translate(t.x ?? 0, t.y ?? 0, t.z ?? 0);
    g.computeVertexNormals();
    const c = new THREE.Color(hex);
    const n = g.attributes.position!.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    this.parts.push(g);
    return this;
  }

  box(w: number, h: number, d: number, hex: number, t: Xform = {}): this {
    return this.add(new THREE.BoxGeometry(w, h, d), hex, t);
  }

  /** Cylinder along y (use rx/rz to lay it down). */
  cyl(r0: number, r1: number, h: number, hex: number, t: Xform = {}, seg = 10): this {
    return this.add(new THREE.CylinderGeometry(r1, r0, h, seg), hex, t);
  }

  sphere(r: number, hex: number, t: Xform = {}, seg = 8): this {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1)), hex, t);
  }

  /** A closed shell through trapezoid sections. */
  loft(sections: Section[], hex: number, t: Xform = {}): this {
    const pos: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[]): void => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); };
    const corners = (s: Section): number[][] => {
      const x = s.x ?? 0;
      return [[x - s.wBot / 2, s.yBot, s.z], [x + s.wBot / 2, s.yBot, s.z], [x + s.wTop / 2, s.yTop, s.z], [x - s.wTop / 2, s.yTop, s.z]];
    };
    for (let i = 0; i < sections.length - 1; i++) {
      const a = corners(sections[i]!), b = corners(sections[i + 1]!);
      quad(a[0]!, b[0]!, b[1]!, a[1]!); // bottom
      quad(a[1]!, b[1]!, b[2]!, a[2]!); // right
      quad(a[2]!, b[2]!, b[3]!, a[3]!); // top
      quad(a[3]!, b[3]!, b[0]!, a[0]!); // left
    }
    const first = corners(sections[0]!), last = corners(sections[sections.length - 1]!);
    quad(first[3]!, first[2]!, first[1]!, first[0]!);
    quad(last[0]!, last[1]!, last[2]!, last[3]!);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return this.add(g, hex, t);
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  build(): THREE.BufferGeometry {
    if (!this.parts.length) return new THREE.BufferGeometry();
    return mergeGeometries(this.parts)!;
  }
}
