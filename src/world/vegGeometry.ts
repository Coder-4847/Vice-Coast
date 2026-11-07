import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash2 } from './city/plan';

/** Merged, vertex-coloured low-poly meshes for wild vegetation. One draw call per kind; instance colour tints them. */

const paint = (g: THREE.BufferGeometry, hex: number, jitter = 0): THREE.BufferGeometry => {
  const c = new THREE.Color(hex);
  const n = g.attributes.position!.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = jitter ? 1 + (((hash2(i, n, 3) % 1000) / 1000) - 0.5) * jitter : 1;
    a[i * 3] = c.r * j; a[i * 3 + 1] = c.g * j; a[i * 3 + 2] = c.b * j;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const flat = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
  const ni = g.index ? g.toNonIndexed() : g;
  ni.computeVertexNormals();
  return ni;
};
const merge = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  const norm = parts.map((p) => {
    const q = p.index ? p.toNonIndexed() : p;
    q.deleteAttribute('uv');
    return q;
  });
  return mergeGeometries(norm)!;
};

export function pineGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(new THREE.CylinderGeometry(0.12, 0.26, 3.0, 5).translate(0, 1.5, 0), 0x4b3828));
  const tiers = 4;
  for (let k = 0; k < tiers; k++) {
    const r = 2.3 - k * 0.46;
    const h = 2.9 - k * 0.2;
    const y = 1.5 + k * 1.55;
    const col = [0x1c3a26, 0x20432a, 0x255030, 0x2c5a36][k]!;
    parts.push(paint(flat(new THREE.ConeGeometry(r, h, 7, 1, true).translate(0, y + h / 2, 0)), col, 0.18));
  }
  return merge(parts);
}

export function broadGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(new THREE.CylinderGeometry(0.12, 0.2, 3.4, 5).translate(0, 1.7, 0), 0xb9b09a));
  const blob = (r: number, x: number, y: number, z: number, col: number): void => {
    parts.push(paint(flat(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.85, 1).translate(x, y, z)), col, 0.22));
  };
  blob(1.8, 0, 4.3, 0, 0x4f7a2e);
  blob(1.3, 1.1, 3.6, 0.5, 0x5e8a34);
  blob(1.2, -1.0, 3.7, -0.6, 0x446e2a);
  return merge(parts);
}

export function saguaroGeometry(): THREE.BufferGeometry {
  const g = 0x476c3c;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(new THREE.CylinderGeometry(0.36, 0.42, 5.4, 8).translate(0, 2.7, 0), g, 0.1));
  parts.push(paint(new THREE.SphereGeometry(0.36, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 5.4, 0), g));
  for (const [dir, y, up] of [[1, 2.5, 1.9], [-1, 3.3, 1.4]] as const) {
    parts.push(paint(new THREE.CylinderGeometry(0.24, 0.24, 1.3, 7).rotateZ(Math.PI / 2).translate(dir * 0.85, y, 0), g, 0.1));
    parts.push(paint(new THREE.CylinderGeometry(0.22, 0.24, up, 7).translate(dir * 1.45, y + up / 2, 0), g, 0.1));
    parts.push(paint(new THREE.SphereGeometry(0.22, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(dir * 1.45, y + up, 0), g));
  }
  return merge(parts);
}

/** A small barrel/prickly-pear style cactus. */
export function cactusGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(flat(new THREE.SphereGeometry(0.55, 7, 5).scale(1, 0.9, 1).translate(0, 0.5, 0)), 0x5a7d46, 0.12));
  parts.push(paint(flat(new THREE.SphereGeometry(0.34, 6, 4).scale(1, 0.9, 1).translate(0.55, 1.0, 0.1)), 0x628a4a, 0.12));
  parts.push(paint(flat(new THREE.SphereGeometry(0.3, 6, 4).scale(1, 0.9, 1).translate(-0.4, 1.15, -0.2)), 0x57783f, 0.12));
  return merge(parts);
}

export function deadTreeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const wood = 0x6b5d4e;
  parts.push(paint(new THREE.CylinderGeometry(0.1, 0.24, 3.6, 5).translate(0, 1.8, 0), wood, 0.15));
  for (const [a, y, l] of [[0.0, 2.3, 1.7], [2.1, 2.9, 1.4], [4.2, 1.9, 1.2], [5.2, 3.2, 1.0]] as const) {
    const b = new THREE.CylinderGeometry(0.04, 0.09, l, 4).translate(0, l / 2, 0).rotateZ(-0.9).rotateY(a).translate(0, y, 0);
    parts.push(paint(b, wood, 0.15));
  }
  return merge(parts);
}

export function joshuaGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6).translate(0, 1.2, 0), 0x6a5a40, 0.12));
  for (const [a, y, l] of [[0.0, 1.6, 1.5], [2.0, 2.0, 1.3], [4.0, 1.4, 1.1]] as const) {
    const b = new THREE.CylinderGeometry(0.1, 0.16, l, 5).translate(0, l / 2, 0).rotateZ(-0.75).rotateY(a).translate(0, y, 0);
    parts.push(paint(b, 0x6a5a40, 0.12));
    parts.push(paint(flat(new THREE.IcosahedronGeometry(0.55, 0).translate(Math.cos(a) * l * 0.7, y + l * 0.72, -Math.sin(a) * l * 0.7)), 0x6f8a4a, 0.2));
  }
  parts.push(paint(flat(new THREE.IcosahedronGeometry(0.7, 0).translate(0, 2.7, 0)), 0x6f8a4a, 0.2));
  return merge(parts);
}

export function scrubGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(flat(new THREE.IcosahedronGeometry(0.75, 0).scale(1.2, 0.6, 1.1).translate(0, 0.35, 0)), 0xa89c6a, 0.3));
  parts.push(paint(flat(new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.7, 1).translate(0.7, 0.28, 0.3)), 0x948a5c, 0.3));
  return merge(parts);
}

/** A rough boulder: displaced icosphere. */
export function rockGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.78 + ((hash2(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50)) % 1000) / 1000) * 0.5;
    p.setXYZ(i, x * k * 1.15, y * k * 0.8, z * k);
  }
  const ni = flat(g);
  return paint(ni.translate(0, 0.25, 0), 0xb6b0a6, 0.16);
}
