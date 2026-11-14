import * as THREE from 'three';

/** Surface textures for interiors, painted once on canvases and shared. Most are near-white detail that the surface colour tints. */
export type TexName =
  | 'plain' | 'plaster' | 'wood' | 'parquet' | 'tile' | 'checker' | 'carpet' | 'concrete' | 'marble' | 'wallpaper'
  | 'brick' | 'lino' | 'fabric' | 'metal' | 'ceiling' | 'leather' | 'panel' | 'grass' | 'stone';

const cache = new Map<TexName, THREE.CanvasTexture>();

/** A cheap repeatable value noise for the painters. */
function noise(seed: number): (x: number, y: number) => number {
  const hash = (x: number, y: number): number => {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** Paint every pixel from a function returning [r, g, b] in 0..1, with wrap-safe noise (period = `per` cells). */
function paint(size: number, f: (x: number, y: number, n: (x: number, y: number) => number) => [number, number, number]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const base = noise(7);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, gg, b] = f(x / size, y / size, base);
      const i = (y * size + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, r * 255));
      img.data[i + 1] = Math.max(0, Math.min(255, gg * 255));
      img.data[i + 2] = Math.max(0, Math.min(255, b * 255));
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Tileable fractal noise in 0..1 on the unit square (`p` = base period). */
function fbm(n: (x: number, y: number) => number, u: number, v: number, p: number, oct = 4): number {
  let s = 0, a = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    const P = p * f;
    // blend four wrapped samples so the result tiles
    const x = u * P, y = v * P;
    const s00 = n(x, y), s10 = n(x - P, y), s01 = n(x, y - P), s11 = n(x - P, y - P);
    const val = (s00 * (1 - u) + s10 * u) * (1 - v) + (s01 * (1 - u) + s11 * u) * v;
    s += val * a; norm += a; a *= 0.5; f *= 2;
  }
  return s / norm;
}

const g3 = (v: number): [number, number, number] => [v, v, v];

function build(name: TexName): HTMLCanvasElement {
  switch (name) {
    case 'plaster': return paint(256, (u, v, n) => g3(0.93 + (fbm(n, u, v, 4, 3) - 0.5) * 0.035 + (fbm(n, u + 3, v, 48, 2) - 0.5) * 0.03));
    case 'concrete': return paint(256, (u, v, n) => { const b = fbm(n, u, v, 3, 3); const s = fbm(n, u + 9, v, 40, 2); return g3(0.8 + (b - 0.5) * 0.14 + (s - 0.5) * 0.035); });
    case 'wood': return paint(256, (u, v, n) => {
      // four planks across, grain along v
      const pl = Math.floor(u * 4), fu = u * 4 - pl;
      const tone = 0.78 + ((pl * 7919) % 13) / 13 * 0.22;
      const grain = Math.sin((u * 40 + fbm(n, u, v, 3) * 6 + pl * 3) * Math.PI * 2) * 0.5 + 0.5;
      const seam = fu < 0.025 || fu > 0.975 ? 0.55 : 1;
      const butt = Math.abs(((v + pl * 0.37) % 1) - 0.5) > 0.495 ? 0.6 : 1;
      const k = tone * (0.86 + grain * 0.14) * seam * butt;
      return [0.62 * k, 0.44 * k, 0.29 * k];
    });
    case 'parquet': return paint(256, (u, v, n) => {
      const cx = Math.floor(u * 8), cy = Math.floor(v * 8);
      const flip = (cx + cy) % 2 === 0;
      const a = flip ? u * 8 - cx : v * 8 - cy;
      const strip = Math.floor(a * 4), fa = a * 4 - strip;
      const tone = 0.8 + (((cx * 31 + cy * 17 + strip * 7) % 11) / 11) * 0.25;
      const edge = fa < 0.06 || (flip ? v * 8 - cy : u * 8 - cx) < 0.02 ? 0.65 : 1;
      const grain = 0.92 + fbm(n, u * (flip ? 1 : 6), v * (flip ? 6 : 1), 8, 2) * 0.12;
      const k = tone * edge * grain;
      return [0.66 * k, 0.47 * k, 0.3 * k];
    });
    case 'tile': return paint(256, (u, v, n) => {
      const fu = (u * 4) % 1, fv = (v * 4) % 1;
      const grout = fu < 0.03 || fv < 0.03 ? 0.62 : 1;
      const t = 0.94 + (fbm(n, Math.floor(u * 4) / 4 + u * 0.2, Math.floor(v * 4) / 4, 8, 2) - 0.5) * 0.1;
      return g3(t * grout);
    });
    case 'checker': return paint(256, (u, v) => {
      const c = (Math.floor(u * 4) + Math.floor(v * 4)) % 2;
      const fu = (u * 4) % 1, fv = (v * 4) % 1;
      const grout = fu < 0.02 || fv < 0.02 ? 0.5 : 1;
      return g3((c ? 0.92 : 0.12) * grout);
    });
    case 'carpet': return paint(256, (u, v, n) => g3(0.86 + (fbm(n, u, v, 64, 2) - 0.5) * 0.16 + (fbm(n, u + 5, v + 5, 8, 2) - 0.5) * 0.05));
    case 'marble': return paint(512, (u, v, n) => {
      const w = Math.abs(Math.sin((u * 3 + v * 2 + fbm(n, u, v, 3, 5) * 4) * Math.PI));
      const vein = Math.pow(1 - w, 18) * 0.16;
      const fu = (u * 2) % 1, fv = (v * 2) % 1;
      const joint = fu < 0.006 || fv < 0.006 ? 0.8 : 1;
      return g3((0.95 - vein + (fbm(n, u, v, 12, 2) - 0.5) * 0.05) * joint);
    });
    case 'wallpaper': return paint(256, (u, v, n) => {
      const stripe = Math.sin(u * Math.PI * 16) > 0.55 ? 0.9 : 1;
      const motif = Math.pow(Math.max(0, Math.sin(u * Math.PI * 8) * Math.sin(v * Math.PI * 8)), 6) * 0.08;
      return g3((0.95 - motif) * stripe + (fbm(n, u, v, 30, 2) - 0.5) * 0.04);
    });
    case 'brick': return paint(256, (u, v, n) => {
      const row = Math.floor(v * 8);
      const bu = (u * 4 + (row % 2) * 0.5) % 1, bv = (v * 8) % 1;
      const mortar = bu < 0.04 || bv < 0.09;
      const id = Math.floor(u * 4 + (row % 2) * 0.5) * 13 + row * 7;
      const tone = 0.75 + ((id % 9) / 9) * 0.25 + (fbm(n, u, v, 16, 2) - 0.5) * 0.1;
      return mortar ? [0.72, 0.7, 0.66] : [0.62 * tone, 0.3 * tone, 0.22 * tone];
    });
    case 'lino': return paint(256, (u, v, n) => { const s = fbm(n, u, v, 64, 1); return g3(0.88 + (fbm(n, u, v, 6, 2) - 0.5) * 0.08 - (s > 0.72 ? 0.1 : 0) + (s < 0.2 ? 0.06 : 0)); });
    case 'fabric': return paint(128, (u, v, n) => { const w = (Math.sin(u * Math.PI * 64) * Math.sin(v * Math.PI * 64)) * 0.05; return g3(0.85 + w + (fbm(n, u, v, 10, 2) - 0.5) * 0.1); });
    case 'leather': return paint(128, (u, v, n) => g3(0.82 + (fbm(n, u, v, 24, 3) - 0.5) * 0.22));
    case 'metal': return paint(128, (u, v, n) => g3(0.85 + (fbm(n, u * 0.05, v, 64, 2) - 0.5) * 0.18));
    case 'ceiling': return paint(256, (u, v, n) => {
      const fu = (u * 2) % 1, fv = (v * 2) % 1;
      const rail = fu < 0.02 || fv < 0.02 ? 0.72 : 1;
      return g3((0.92 + (fbm(n, u, v, 40, 2) - 0.5) * 0.14) * rail);
    });
    case 'panel': return paint(256, (u, v, n) => {
      const fu = (u * 2) % 1, fv = v;
      const edge = fu < 0.03 || fu > 0.97 || fv < 0.02 || fv > 0.98 ? 0.72 : fu < 0.08 || fu > 0.92 ? 0.88 : 1;
      const k = edge * (0.9 + fbm(n, u * 0.3, v * 3, 6, 2) * 0.12);
      return [0.62 * k, 0.45 * k, 0.3 * k];
    });
    case 'grass': return paint(128, (u, v, n) => { const k = 0.7 + fbm(n, u, v, 20, 3) * 0.4; return [0.32 * k, 0.5 * k, 0.24 * k]; });
    case 'stone': return paint(256, (u, v, n) => {
      const fu = (u * 3) % 1, fv = (v * 3 + Math.floor(u * 3) * 0.5) % 1;
      const joint = fu < 0.03 || fv < 0.03 ? 0.6 : 1;
      return g3((0.8 + (fbm(n, u, v, 9, 4) - 0.5) * 0.3) * joint);
    });
    default: return paint(4, () => [1, 1, 1]);
  }
}

export function texture(name: TexName): THREE.CanvasTexture {
  let t = cache.get(name);
  if (!t) {
    t = new THREE.CanvasTexture(build(name));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    cache.set(name, t);
  }
  return t;
}

/** A sign / label face: text on a coloured plate. */
export function textTexture(text: string, fg: string, bg: string, w = 512, h = 128, font = '700 72px system-ui, sans-serif'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = parseInt(/(\d+)px/.exec(font)?.[1] ?? '72', 10);
  while (size > 12 && g.measureText(text).width > w * 0.92) { size -= 4; g.font = font.replace(/\d+px/, `${size}px`); }
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A framed picture for the walls: an abstract or a little landscape, from a seed. */
export function artTexture(seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 96;
  const g = c.getContext('2d')!;
  const r = (k: number): number => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const hue = Math.floor(r(1) * 360);
  if (r(2) < 0.5) {
    // landscape: sky, sea or hills, a sun
    const sky = g.createLinearGradient(0, 0, 0, 60);
    sky.addColorStop(0, `hsl(${hue},55%,${60 + r(3) * 20}%)`); sky.addColorStop(1, `hsl(${(hue + 40) % 360},60%,80%)`);
    g.fillStyle = sky; g.fillRect(0, 0, 128, 96);
    g.fillStyle = `hsl(${(hue + 30) % 360},80%,70%)`; g.beginPath(); g.arc(30 + r(4) * 70, 30 + r(5) * 15, 9 + r(6) * 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = `hsl(${(hue + 180) % 360},35%,${25 + r(7) * 20}%)`;
    g.beginPath(); g.moveTo(0, 96); for (let x = 0; x <= 128; x += 8) g.lineTo(x, 55 + Math.sin(x * 0.05 + r(8) * 6) * 10 + r(9 + x) * 6); g.lineTo(128, 96); g.fill();
  } else {
    g.fillStyle = `hsl(${hue},20%,90%)`; g.fillRect(0, 0, 128, 96);
    for (let i = 0; i < 7; i++) {
      g.fillStyle = `hsla(${(hue + i * 47) % 360},${50 + r(i) * 40}%,${35 + r(i + 20) * 40}%,0.85)`;
      if (r(i + 40) < 0.5) g.fillRect(r(i + 50) * 100, r(i + 60) * 70, 12 + r(i + 70) * 50, 8 + r(i + 80) * 40);
      else { g.beginPath(); g.arc(r(i + 50) * 128, r(i + 60) * 96, 6 + r(i + 70) * 26, 0, Math.PI * 2); g.fill(); }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
