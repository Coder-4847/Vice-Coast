import * as THREE from 'three';
import type { CityTextures } from '../Terrain';
import { CityPlan, FUNFAIR, PLAN_RADIUS, type Road } from './plan';

const ROAD_W = 4096;
const ZONE_N = 1024;
const toHalf = THREE.DataUtils.toHalfFloat;

/** 1-D road fields along both axes: one RGBA half-float row each, sampled by the terrain shader. */
function buildRoadTexture(plan: CityPlan): THREE.DataTexture {
  const data = new Uint16Array(ROAD_W * 2 * 4);
  const b = plan.box;
  const fill = (row: number, roads: Road[], start: number, size: number) => {
    for (let u = 0; u < ROAD_W; u++) {
      const p = start + ((u + 0.5) / ROAD_W) * size;
      let best = Infinity;
      let road: Road | null = null;
      for (const r of roads) {
        const d = Math.abs(p - r.pos) - r.hw;
        if (d < best) { best = d; road = r; }
      }
      const o = (row * ROAD_W + u) * 4;
      data[o] = toHalf(Math.max(-48, Math.min(48, best)));
      data[o + 1] = toHalf(Math.max(-32, Math.min(32, p - road!.pos)));
      data[o + 2] = toHalf(road!.hw);
      data[o + 3] = toHalf(road!.arterial ? 1 : 0);
    }
  };
  fill(0, plan.X, b.x0, b.x1 - b.x0);
  fill(1, plan.Z, b.z0, b.z1 - b.z0);
  const tex = new THREE.DataTexture(data, ROAD_W, 2, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Anti-aliased rectangle paint into one channel of the zone mask (coverage = overlapped texel area). */
function paintRect(data: Uint8Array, ch: number, ox: number, oz: number, sx: number, sz: number, x0: number, z0: number, x1: number, z1: number, v = 1, ellipse = false): void {
  const tx = sx / ZONE_N, tz = sz / ZONE_N;
  const i0 = Math.max(0, Math.floor((x0 - ox) / tx)), i1 = Math.min(ZONE_N - 1, Math.floor((x1 - ox) / tx));
  const j0 = Math.max(0, Math.floor((z0 - oz) / tz)), j1 = Math.min(ZONE_N - 1, Math.floor((z1 - oz) / tz));
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rx = (x1 - x0) / 2, rz = (z1 - z0) / 2;
  for (let j = j0; j <= j1; j++) {
    const tz0 = oz + j * tz, tz1 = tz0 + tz;
    const cov_z = Math.max(0, Math.min(z1, tz1) - Math.max(z0, tz0)) / tz;
    for (let i = i0; i <= i1; i++) {
      const tx0 = ox + i * tx, tx1 = tx0 + tx;
      let cov = Math.max(0, Math.min(x1, tx1) - Math.max(x0, tx0)) / tx * cov_z;
      if (ellipse) {
        const e = Math.hypot((tx0 + tx / 2 - cx) / rx, (tz0 + tz / 2 - cz) / rz);
        cov = Math.max(0, Math.min(1, (1 - e) * Math.min(rx, rz) / Math.max(tx, tz) + 0.5));
      }
      const o = (j * ZONE_N + i) * 4 + ch;
      data[o] = Math.max(data[o]!, Math.round(255 * Math.min(1, cov) * v));
    }
  }
}

export interface CityFields extends CityTextures {
  dispose(): void;
}

export function buildCityFields(plan: CityPlan): CityFields {
  const road = buildRoadTexture(plan);

  const zb = { x: 195, z: -765, sx: 1600, sz: 1530 };
  const zone = new Uint8Array(ZONE_N * ZONE_N * 4);
  const paint = (ch: number, x0: number, z0: number, x1: number, z1: number, ellipse = false) => paintRect(zone, ch, zb.x, zb.z, zb.sx, zb.sz, x0, z0, x1, z1, 1, ellipse);
  for (const b of plan.blocks) {
    switch (b.kind) {
      case 'park': paint(0, b.x0, b.z0, b.x1, b.z1); break;
      case 'plaza': paint(1, b.x0, b.z0, b.x1, b.z1); break;
      case 'mall': paint(2, b.x0, b.z0, b.x1, b.z1); break;
      case 'police': paint(2, b.x0, b.z1 - 30, b.x1, b.z1); break;
      case 'hospital': paint(1, b.x0, b.z0, b.x1, b.z1); break;
      case 'stadium': {
        paint(1, b.x0, b.z0, b.x1, b.z1);
        const rx = Math.min(100, b.w / 2 - 12) * 0.62, rz = Math.min(80, b.d / 2 - 12) * 0.62;
        paint(0, b.cx - rx, b.cz - rz, b.cx + rx, b.cz + rz, true);
        break;
      }
      default:
        if (b.district === 'residential') paint(0, b.x0, b.z0, b.x1, b.z1);
        else if (b.district === 'industrial') paint(2, b.x0, b.z0, b.x1, b.z1);
        else if (b.district === 'downtown') paint(1, b.x0, b.z0, b.x1, b.z1);
    }
  }
  // boardwalk strip along the beach side of Ocean Boulevard
  paint(3, 194, -735, 216, 735);
  // funfair forecourt
  paint(1, FUNFAIR.x - 40, FUNFAIR.z - 40, FUNFAIR.x + 52, FUNFAIR.z + 40);

  const zoneTex = new THREE.DataTexture(zone, ZONE_N, ZONE_N, THREE.RGBAFormat, THREE.UnsignedByteType);
  zoneTex.magFilter = THREE.LinearFilter;
  zoneTex.minFilter = THREE.LinearFilter;
  zoneTex.generateMipmaps = false;
  zoneTex.wrapS = zoneTex.wrapT = THREE.ClampToEdgeWrapping;
  zoneTex.needsUpdate = true;

  const b = plan.box;
  return {
    road,
    zone: zoneTex,
    roadBox: new THREE.Vector4(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0),
    zoneBox: new THREE.Vector4(zb.x, zb.z, zb.sx, zb.sz),
    radius: PLAN_RADIUS,
    dispose() {
      road.dispose();
      zoneTex.dispose();
    },
  };
}
