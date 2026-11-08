import type { CityPlan, Landmark } from '../world/city/plan';
import { PLAN_RADIUS } from '../world/city/plan';
import type { Route } from '../world/city/route';
import { WorldRouter } from '../world/WorldRouter';
import { CITY, terrainHeight } from '../world/Terrain';
import { TerrainData } from '../world/TerrainData';
import { nearestRoad } from '../world/roads';
import { buildNetStrokes, MAP_LABELS, MARKERS, regionAt, RESTRICTED_ZONES, type NetStroke } from './mapData';
import { h as el } from './dom';

const MB = { x0: -1500, x1: 4800, z0: -3400, z1: 4400 };
const STEP = 8;
const ACCENT = '#ff7a59';

const DISTRICT_FILL: Record<string, string> = {
  downtown: '#434c5c', midtown: '#3b4350', boardwalk: '#46485a', residential: '#38453f', industrial: '#4a443c', hills: '#38453f',
};
const LANDMARK_GLYPH: Record<Landmark['kind'], string> = {
  stadium: 'S', hospital: '+', police: 'P', mall: 'M', pier: '≈', funfair: '★', hills: '▲', beach: '~',
};

export interface MapEntities {
  x: number; z: number; yaw: number;
  speedKmh: number;
  vehicles: { x: number; z: number }[];
}

interface View { cx: number; cz: number; scale: number; rot: number; w: number; h: number }

/**
 * Minimap (rotating radar, top-right) and full-screen map. Both draw the plan as vectors every frame over one baked
 * terrain relief, so the map stays crisp at any zoom without storing city art. A waypoint set on the map is routed
 * over the road graph and shown on the minimap.
 */
export class MapUI {
  readonly router: WorldRouter;
  private net: NetStroke[] = [];
  waypoint: { x: number; z: number } | null = null;
  route: Route | null = null;
  onWaypoint: ((wp: { x: number; z: number } | null) => void) | null = null;

  private readonly mini: HTMLCanvasElement;
  private readonly miniCtx: CanvasRenderingContext2D;
  private readonly label: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly wpChip: HTMLElement;
  private readonly north: HTMLElement;
  readonly miniRoot: HTMLElement;

  private readonly full: HTMLElement;
  private readonly big: HTMLCanvasElement;
  private readonly bigCtx: CanvasRenderingContext2D;
  private readonly hint: HTMLElement;
  private readonly wpBtn: HTMLButtonElement;
  private readonly base = document.createElement('canvas');
  private baseReady = false;

  private open_ = false;
  private view: View = { cx: 980, cz: 0, scale: 0.4, rot: 0, w: 800, h: 600 };
  private ents: MapEntities = { x: 0, z: 0, yaw: 0, speedKmh: 0, vehicles: [] };
  private miniScale = 0.9;
  private miniT = 0;
  private routeT = 0;
  private lastLabel = '';
  private dragId = -1;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragMoved = 0;
  private pinch = 0;
  private padPrev: boolean[] = [];
  private labelT = 0;

  constructor(root: HTMLElement, hud: HTMLElement, readonly plan: CityPlan, private readonly hooks: { toast(m: string): void; device(): string; close(): void }) {
    this.router = new WorldRouter(plan);
    this.net = buildNetStrokes();

    this.mini = el('canvas', 'minimap-canvas');
    this.miniCtx = this.mini.getContext('2d')!;
    this.north = el('span', 'minimap-n', 'N');
    this.label = el('div', 'minimap-label', '');
    this.sub = el('div', 'minimap-sub', '');
    this.wpChip = el('div', 'minimap-wp is-hidden', '');
    this.miniRoot = el('div', 'minimap', el('div', 'minimap-disc', this.mini, this.north), this.label, this.sub, this.wpChip);
    hud.append(this.miniRoot);

    this.big = el('canvas', 'fullmap-canvas');
    this.bigCtx = this.big.getContext('2d')!;
    const center = el('button', 'btn', 'Centre on me');
    this.wpBtn = el('button', 'btn', 'Clear waypoint');
    const close = el('button', 'btn primary', 'Close');
    for (const b of [center, this.wpBtn, close]) b.type = 'button';
    center.addEventListener('click', () => this.centreOnPlayer());
    this.wpBtn.addEventListener('click', () => this.setWaypoint(null));
    close.addEventListener('click', () => hooks.close());
    this.hint = el('div', 'fullmap-hint', '');
    this.full = el(
      'div', 'fullmap is-hidden',
      this.big,
      el('div', 'fullmap-top panel-glass', el('div', 'fullmap-title', el('b', '', 'San Verano'), el('span', '', 'State map')), el('div', 'fullmap-actions', center, this.wpBtn, close)),
      this.hint,
    );
    root.append(this.full);
    this.bindFull();
    window.addEventListener('resize', () => { if (this.open_) this.resizeBig(); });
  }

  // ------------------------------------------------------------------------------------- terrain bake

  /** Paint the relief + water into an offscreen canvas in a few time slices so start-up never stalls. */
  bakeTerrain(): void {
    this.bake();
  }

  private bake(): void {
    const nx = Math.round((MB.x1 - MB.x0) / STEP), nz = Math.round((MB.z1 - MB.z0) / STEP);
    this.base.width = nx;
    this.base.height = nz;
    const g = this.base.getContext('2d')!;
    const img = g.createImageData(nx, nz);
    const hgt = new Float32Array(nx * nz);
    let row = 0;
    const slice = () => {
      const end = Math.min(nz, row + 24);
      for (; row < end; row++) for (let i = 0; i < nx; i++) hgt[row * nx + i] = terrainHeight(MB.x0 + (i + 0.5) * STEP, MB.z0 + (row + 0.5) * STEP);
      if (row < nz) { window.setTimeout(slice, 0); return; }
      const td = TerrainData.current;
      const sf = { desert: 0, forest: 0, salt: 0, dirt: 0 };
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const h = hgt[j * nx + i]!;
          const hl = hgt[j * nx + Math.max(0, i - 1)]!, hu = hgt[Math.max(0, j - 1) * nx + i]!;
          const shade = Math.max(0.55, Math.min(1.4, 1 + ((hl - h) + (hu - h)) * 0.045));
          const wx = MB.x0 + (i + 0.5) * STEP, wz = MB.z0 + (j + 0.5) * STEP;
          let r: number, gg: number, b: number;
          if (h < 0) {
            const d = Math.min(1, -h / 70);
            r = 34 - 22 * d; gg = 82 - 50 * d; b = 112 - 40 * d;
          } else {
            r = 84; gg = 98; b = 68;
            if (td) {
              td.surface(wx, wz, sf);
              const mixc = (c: number[], t: number) => { r += (c[0]! - r) * t; gg += (c[1]! - gg) * t; b += (c[2]! - b) * t; };
              mixc([172, 138, 92], sf.desert);
              mixc([44, 76, 46], sf.forest);
              mixc([222, 220, 208], sf.salt);
            }
            if (h < 5.2 && wx < 205) { r = 150; gg = 138; b = 108; }
            else if (h < 5.2 && wx < 2200 && !(wx > 215 && wx < 1765 && wz > -745 && wz < 745)) { r = r * 0.8 + 18; gg = gg * 0.85 + 14; b = b * 0.8 + 8; }
            const snow = Math.max(0, Math.min(1, (h - 520) / 90));
            if (snow > 0) { r += (226 - r) * snow; gg += (232 - gg) * snow; b += (240 - b) * snow; }
            r *= shade; gg *= shade; b *= shade;
          }
          const o = (j * nx + i) * 4;
          img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      this.baseReady = true;
    };
    slice();
  }

  // ------------------------------------------------------------------------------------------ drawing

  private draw(ctx: CanvasRenderingContext2D, v: View, full: boolean): void {
    ctx.save();
    ctx.fillStyle = '#16314a';
    ctx.fillRect(0, 0, v.w, v.h);
    ctx.translate(v.w / 2, v.h / 2);
    ctx.rotate(v.rot);
    ctx.scale(v.scale, v.scale);
    ctx.translate(-v.cx, -v.cz);
    ctx.imageSmoothingEnabled = true;
    if (this.baseReady) ctx.drawImage(this.base, MB.x0, MB.z0, MB.x1 - MB.x0, MB.z1 - MB.z0);
    {
      const w0 = (m: number) => Math.max(m, 1.5 / v.scale);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'butt';
      for (const st of this.net) {
        ctx.setLineDash(st.dash ? st.dash.map((d) => d * w0(1) * 0.6) : []);
        ctx.strokeStyle = st.casing;
        ctx.lineWidth = w0(st.w) + 2.4 / v.scale;
        if (!st.dash) ctx.stroke(st.path);
        ctx.strokeStyle = st.color;
        ctx.lineWidth = w0(st.w);
        ctx.stroke(st.path);
      }
      ctx.setLineDash([]);
    }

    const plan = this.plan;
    // everything below is clipped to the built-up area
    ctx.save();
    ctx.beginPath();
    ctx.arc(CITY.x, CITY.z, PLAN_RADIUS + 6, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#2f343c';
    ctx.fillRect(plan.box.x0, plan.box.z0, plan.box.x1 - plan.box.x0, plan.box.z1 - plan.box.z0);
    for (const b of plan.blocks) {
      ctx.fillStyle = b.kind === 'park' ? '#3e5c42' : b.kind === 'plaza' ? '#58564f' : DISTRICT_FILL[b.district] ?? '#3b4350';
      ctx.fillRect(b.x0 - 1, b.z0 - 1, b.w + 2, b.d + 2);
    }
    const lw = (m: number) => Math.max(m, 1.5 / v.scale);
    ctx.lineCap = 'butt';
    for (const arterial of [false, true]) {
      ctx.strokeStyle = arterial ? '#d2d6dd' : '#9aa0aa';
      ctx.lineWidth = lw(arterial ? 22 : 13);
      ctx.beginPath();
      for (const r of plan.Z) if (r.arterial === arterial) { ctx.moveTo(plan.box.x0, r.pos); ctx.lineTo(plan.box.x1, r.pos); }
      for (const r of plan.X) if (r.arterial === arterial) { ctx.moveTo(r.pos, plan.box.z0); ctx.lineTo(r.pos, plan.box.z1); }
      ctx.stroke();
    }
    // stadium pitch + landmark blocks
    if (plan.stadiumBlock) {
      const s = plan.stadiumBlock;
      ctx.fillStyle = '#7e2f30';
      ctx.beginPath(); ctx.ellipse(s.cx, s.cz, 100, 80, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4c7a4a';
      ctx.beginPath(); ctx.ellipse(s.cx, s.cz, 60, 48, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // boardwalk, pier and hill road
    ctx.strokeStyle = '#a4825a';
    ctx.lineWidth = lw(14);
    ctx.beginPath(); ctx.moveTo(205, -735); ctx.lineTo(205, 735); ctx.stroke();
    ctx.lineWidth = lw(9);
    ctx.beginPath(); ctx.moveTo(56, -300); ctx.lineTo(-190, -300); ctx.stroke();
    ctx.strokeStyle = '#cfd3da';
    ctx.lineWidth = lw(9);
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const p = plan.hillRoad(i / 120);
      if (i === 0) ctx.moveTo(p.x, p.z); else ctx.lineTo(p.x, p.z);
    }
    ctx.stroke();

    // route
    if (this.route && this.route.pts.length > 1) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 6.5 / v.scale;
      this.tracePath(ctx, this.route.pts);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 3.6 / v.scale;
      this.tracePath(ctx, this.route.pts);
    }
    ctx.restore();

    // ---- screen-space overlays -------------------------------------------------------------------------
    const toScreen = (x: number, z: number): [number, number] => {
      const dx = (x - v.cx) * v.scale, dz = (z - v.cz) * v.scale;
      const c = Math.cos(v.rot), s = Math.sin(v.rot);
      return [v.w / 2 + dx * c - dz * s, v.h / 2 + dx * s + dz * c];
    };
    const e = this.ents;
    // landmarks
    if (full || v.scale > 0.6) {
      ctx.font = `600 ${full ? 12 : 9}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const l of plan.landmarks) {
        const [sx, sy] = toScreen(l.x, l.z);
        if (sx < -20 || sy < -20 || sx > v.w + 20 || sy > v.h + 20) continue;
        const r = full ? 10 : 7;
        ctx.fillStyle = 'rgba(14,16,23,0.9)';
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = l.kind === 'hospital' ? '#ff6b6b' : l.kind === 'police' ? '#6aa8ff' : '#eceef3';
        ctx.fillText(LANDMARK_GLYPH[l.kind], sx, sy + 0.5);
        if (full && v.scale > 0.5) {
          ctx.fillStyle = 'rgba(236,238,243,0.92)';
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.lineWidth = 3;
          ctx.strokeText(l.name, sx, sy + 20);
          ctx.fillText(l.name, sx, sy + 20);
        }
      }
    }
    if (full) {
      // district names, fading in as the map zooms out and out as it zooms in
      const a = Math.max(0, Math.min(1, (v.scale - 0.34) * 6)) * Math.max(0, Math.min(1, (1.3 - v.scale) * 3));
      if (a > 0.02) {
        ctx.font = '500 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(236,238,243,${0.8 * a})`;
        for (const d of plan.districts) {
          const [sx, sy] = toScreen(d.x, d.z);
          ctx.save();
          ctx.translate(sx, sy);
          ctx.fillText(d.name.toUpperCase().split('').join(' '), 0, 0);
          ctx.restore();
        }
      }
    }
    // restricted military ground
    for (const zn of RESTRICTED_ZONES) {
      const [sx, sy] = toScreen(zn.x, zn.z);
      const pr = zn.r * v.scale;
      if (sx + pr < 0 || sy + pr < 0 || sx - pr > v.w || sy - pr > v.h) continue;
      ctx.save();
      ctx.fillStyle = 'rgba(214,60,48,0.16)';
      ctx.strokeStyle = 'rgba(236,90,76,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 7]);
      ctx.beginPath(); ctx.arc(sx, sy, pr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (full || v.scale > 0.5) {
      ctx.font = `600 ${full ? 11 : 9}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const m of MARKERS) {
        const [sx, sy] = toScreen(m.x, m.z);
        if (sx < -20 || sy < -20 || sx > v.w + 20 || sy > v.h + 20) continue;
        const r = full ? 9 : 6.5;
        ctx.fillStyle = 'rgba(14,16,23,0.88)';
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = m.color ?? '#eceef3';
        ctx.fillText(m.glyph, sx, sy + 0.5);
        if (full && v.scale > 0.28) {
          ctx.fillStyle = 'rgba(236,238,243,0.92)';
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.lineWidth = 3;
          ctx.strokeText(m.name, sx, sy + 18);
          ctx.fillText(m.name, sx, sy + 18);
        }
      }
    }
    if (full) {
      const ar = Math.max(0, Math.min(1, (0.36 - v.scale) * 8));
      if (ar > 0.02) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const l of MAP_LABELS) {
          const [sx, sy] = toScreen(l.x, l.z);
          if (sx < -80 || sy < -30 || sx > v.w + 80 || sy > v.h + 30) continue;
          ctx.font = `600 ${l.size}px system-ui, sans-serif`;
          ctx.strokeStyle = `rgba(0,0,0,${0.75 * ar})`;
          ctx.lineWidth = 4;
          const text = l.name.toUpperCase().split('').join(' ');
          ctx.strokeText(text, sx, sy);
          ctx.fillStyle = `rgba(240,242,246,${0.92 * ar})`;
          ctx.fillText(text, sx, sy);
        }
      }
    }
    // vehicles
    ctx.fillStyle = '#f2c14e';
    for (const car of e.vehicles) {
      const [sx, sy] = toScreen(car.x, car.z);
      if (sx < 0 || sy < 0 || sx > v.w || sy > v.h) continue;
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
    }
    // waypoint
    if (this.waypoint) {
      let [sx, sy] = toScreen(this.waypoint.x, this.waypoint.z);
      let edge = false;
      if (!full) {
        const rad = Math.min(v.w, v.h) / 2 - 8;
        const dx = sx - v.w / 2, dy = sy - v.h / 2;
        const d = Math.hypot(dx, dy);
        if (d > rad) { sx = v.w / 2 + (dx / d) * rad; sy = v.h / 2 + (dy / d) * rad; edge = true; }
      }
      ctx.fillStyle = ACCENT;
      ctx.strokeStyle = '#0a0c11';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (edge) ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      else { ctx.moveTo(sx, sy); ctx.lineTo(sx - 6, sy - 13); ctx.arc(sx, sy - 16, 7, Math.PI * 0.8, Math.PI * 0.2, false); ctx.lineTo(sx, sy); }
      ctx.fill();
      ctx.stroke();
    }
    // player arrow (screen space; the map rotation is already applied to its position)
    {
      const [sx, sy] = toScreen(e.x, e.z);
      // heading on screen: forward in map space is (-sin yaw, -cos yaw)
      const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
      const c = Math.cos(v.rot), s = Math.sin(v.rot);
      const ang = Math.atan2(fx * c - fz * s, -(fx * s + fz * c)); // clockwise from screen-up
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(ang);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0a0c11';
      ctx.lineWidth = 2;
      const k = full ? 1.2 : 1;
      ctx.beginPath();
      ctx.moveTo(0, -9 * k); ctx.lineTo(6 * k, 7 * k); ctx.lineTo(0, 3.5 * k); ctx.lineTo(-6 * k, 7 * k); ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }
  }

  private tracePath(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
    ctx.stroke();
  }

  // --------------------------------------------------------------------------------------- minimap

  update(dt: number, ents: MapEntities): void {
    this.ents = ents;
    this.labelT -= dt;
    if (this.labelT <= 0) {
      this.labelT = 0.4;
      const inCity = Math.hypot(ents.x - CITY.x, ents.z - CITY.z) < PLAN_RADIUS + 20;
      const dn = inCity ? this.plan.districtName(ents.x, ents.z) : regionAt(ents.x, ents.z) ?? (ents.x < 60 ? 'Pacific Ocean' : 'San Verano');
      const st = inCity ? this.plan.streetAt(ents.x, ents.z) : nearestRoad(ents.x, ents.z, 16)?.path.def.name ?? '';
      const key = `${dn}|${st}`;
      if (key !== this.lastLabel) {
        this.lastLabel = key;
        this.label.textContent = dn;
        this.sub.textContent = st;
      }
    }
    // route refresh (cheap Dijkstra over ~200 nodes)
    this.routeT -= dt;
    if (this.waypoint) {
      const d = Math.hypot(this.waypoint.x - ents.x, this.waypoint.z - ents.z);
      if (d < 22) {
        this.hooks.toast('You have arrived');
        this.setWaypoint(null);
      } else if (this.routeT <= 0) {
        this.routeT = 1.2;
        this.route = this.router.route(ents.x, ents.z, this.waypoint.x, this.waypoint.z);
      }
      if (this.waypoint) {
        const len = this.route ? this.route.length : d;
        this.wpChip.textContent = len >= 1000 ? `${(len / 1000).toFixed(1)} km` : `${Math.round(len / 10) * 10} m`;
        this.wpChip.classList.remove('is-hidden');
      }
    } else {
      this.wpChip.classList.add('is-hidden');
    }

    if (this.open_) return;
    this.miniT -= dt;
    if (this.miniT > 0) return;
    this.miniT = 1 / 30;
    const target = 0.95 - Math.min(1, ents.speedKmh / 140) * 0.5;
    this.miniScale += (target - this.miniScale) * 0.12;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.round(this.mini.clientWidth || 168);
    if (this.mini.width !== size * dpr) {
      this.mini.width = this.mini.height = size * dpr;
    }
    const ctx = this.miniCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw(ctx, { cx: ents.x, cz: ents.z, scale: this.miniScale, rot: ents.yaw, w: size, h: size }, false);
    this.north.style.transform = `rotate(${-ents.yaw}rad) translateY(-${size / 2 - 11}px) rotate(${ents.yaw}rad)`;
  }

  setHudVisible(on: boolean): void {
    this.miniRoot.classList.toggle('is-hidden', !on);
  }

  // -------------------------------------------------------------------------------------- full map

  get isOpen(): boolean {
    return this.open_;
  }

  open(): void {
    this.open_ = true;
    this.full.classList.remove('is-hidden');
    this.resizeBig();
    const h = this.big.clientHeight || 600;
    this.view.scale = Math.max(0.2, Math.min(0.5, h / 1700));
    this.view.rot = 0;
    this.centreOnPlayer();
    const pad = (navigator.getGamepads?.() ?? []).find((q) => q && q.connected) ?? null;
    this.padPrev = pad ? pad.buttons.map((b) => b.pressed) : [];
  }

  close(): void {
    this.open_ = false;
    this.full.classList.add('is-hidden');
    this.pointers.clear();
    this.dragId = -1;
  }

  centreOnPlayer(): void {
    this.view.cx = this.ents.x;
    this.view.cz = this.ents.z;
  }

  private resizeBig(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.big.clientWidth, h = this.big.clientHeight;
    this.big.width = Math.round(w * dpr);
    this.big.height = Math.round(h * dpr);
    this.view.w = w;
    this.view.h = h;
  }

  setWaypoint(wp: { x: number; z: number } | null): void {
    this.waypoint = wp;
    this.route = wp ? this.router.route(this.ents.x, this.ents.z, wp.x, wp.z) : null;
    this.routeT = 1.2;
    this.wpBtn.disabled = !wp;
    this.wpBtn.textContent = wp ? 'Clear waypoint' : 'No waypoint';
    this.onWaypoint?.(wp);
  }

  private screenToWorld(sx: number, sy: number): { x: number; z: number } {
    const v = this.view;
    return { x: v.cx + (sx - v.w / 2) / v.scale, z: v.cz + (sy - v.h / 2) / v.scale };
  }

  private zoomAt(sx: number, sy: number, factor: number): void {
    const v = this.view;
    const before = this.screenToWorld(sx, sy);
    v.scale = Math.max(0.07, Math.min(4, v.scale * factor));
    const after = this.screenToWorld(sx, sy);
    v.cx += before.x - after.x;
    v.cz += before.z - after.z;
  }

  private bindFull(): void {
    const c = this.big;
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); this.setWaypoint(null); });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) { this.dragId = e.pointerId; this.dragMoved = 0; }
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        const r = c.getBoundingClientRect();
        if (this.pinch > 0) this.zoomAt((a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top, d / this.pinch);
        this.pinch = d;
        this.dragMoved = 99;
      } else if (e.pointerId === this.dragId) {
        this.dragMoved += Math.abs(dx) + Math.abs(dy);
        this.view.cx -= dx / this.view.scale;
        this.view.cz -= dy / this.view.scale;
      }
    });
    const up = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      const tapped = this.pointers.size === 1 && e.pointerId === this.dragId && this.dragMoved < 7 && e.type === 'pointerup' && e.button === 0;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = 0;
      if (this.pointers.size === 0) this.dragId = -1;
      if (tapped) {
        const r = c.getBoundingClientRect();
        this.setWaypoint(this.screenToWorld(e.clientX - r.left, e.clientY - r.top));
      }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    window.addEventListener('keydown', (e) => {
      if (!this.open_) return;
      const step = 90 / this.view.scale;
      switch (e.code) {
        case 'KeyM': this.hooks.close(); break;
        case 'KeyW': case 'ArrowUp': this.view.cz -= step * 0.4; break;
        case 'KeyS': case 'ArrowDown': this.view.cz += step * 0.4; break;
        case 'KeyA': case 'ArrowLeft': this.view.cx -= step * 0.4; break;
        case 'KeyD': case 'ArrowRight': this.view.cx += step * 0.4; break;
        case 'Equal': case 'NumpadAdd': this.zoomAt(this.view.w / 2, this.view.h / 2, 1.25); break;
        case 'Minus': case 'NumpadSubtract': this.zoomAt(this.view.w / 2, this.view.h / 2, 0.8); break;
        case 'KeyC': this.centreOnPlayer(); break;
        case 'Enter': case 'Space': this.setWaypoint({ x: this.view.cx, z: this.view.cz }); e.preventDefault(); break;
        case 'Backspace': case 'Delete': this.setWaypoint(null); break;
        default: return;
      }
      e.preventDefault();
    });
  }

  /** Per-frame work while the full map is open: gamepad pan / zoom / waypoint, then redraw. */
  tick(dt: number): void {
    if (!this.open_) return;
    const pad = (navigator.getGamepads?.() ?? []).find((p) => p && p.connected) ?? null;
    const v = this.view;
    if (pad) {
      const ax = (i: number) => { const a = pad.axes[i] ?? 0; return Math.abs(a) > 0.18 ? a : 0; };
      const sx = ax(0) + ax(2), sy = ax(1) + ax(3);
      v.cx += (sx * 520 * dt) / v.scale;
      v.cz += (sy * 520 * dt) / v.scale;
      const zin = pad.buttons[7]?.value ?? 0, zout = pad.buttons[6]?.value ?? 0;
      if (zin > 0.05 || zout > 0.05) this.zoomAt(v.w / 2, v.h / 2, Math.exp((zin - zout) * 1.6 * dt));
      const down = pad.buttons.map((b) => b.pressed);
      const hit = (i: number) => !!down[i] && !this.padPrev[i];
      if (hit(0)) this.setWaypoint({ x: v.cx, z: v.cz });
      if (hit(2)) this.setWaypoint(null);
      if (hit(3)) this.centreOnPlayer();
      if (hit(1) || hit(8) || hit(9)) this.hooks.close();
      this.padPrev = down;
    }
    const dev = this.hooks.device();
    this.hint.innerHTML = dev === 'gamepad'
      ? '<span><kbd>Left stick</kbd> pan</span><span><kbd>LT</kbd><kbd>RT</kbd> zoom</span><span><kbd>A</kbd> set waypoint</span><span><kbd>X</kbd> clear</span><span><kbd>Y</kbd> centre</span><span><kbd>B</kbd> close</span>'
      : dev === 'touch'
        ? '<span>Drag to pan</span><span>Pinch to zoom</span><span>Tap to set a waypoint</span>'
        : '<span><kbd>Click</kbd> set waypoint</span><span><kbd>Drag</kbd> pan</span><span><kbd>Scroll</kbd> zoom</span><span><kbd>Right-click</kbd> clear</span><span><kbd>M</kbd> close</span>';
    const ctx = this.bigCtx;
    const dpr = this.big.width / Math.max(1, this.view.w);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw(ctx, this.view, true);
    if (dev === 'gamepad') {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      const x = v.w / 2, y = v.h / 2;
      ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x - 4, y); ctx.moveTo(x + 4, y); ctx.lineTo(x + 12, y); ctx.moveTo(x, y - 12); ctx.lineTo(x, y - 4); ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 12); ctx.stroke();
    }
  }
}

