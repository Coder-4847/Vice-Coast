import * as THREE from 'three';
import type { Game } from '../Game';
import type { Ped } from '../npc/Pedestrians';
import { terrainHeight } from '../world/Terrain';
import { MARKERS } from '../ui/mapData';

export type StoreKind = 'gas' | 'grocery' | 'liquor' | 'jewel';

export interface StoreDef { id: string; kind: StoreKind; name: string; near: { x: number; z: number } }

export const STORES: StoreDef[] = [
  { id: 'gas-ind', kind: 'gas', name: 'Petrolia Gas', near: { x: 1420, z: -232 } },
  { id: 'gas-mall', kind: 'gas', name: 'Petrolia Gas', near: { x: 1190, z: 175 } },
  { id: 'gas-cinder', kind: 'gas', name: 'Dust Devil Gas', near: { x: 3375, z: 545 } },
  { id: 'gas-harbor', kind: 'gas', name: 'Petrolia Gas', near: { x: 445, z: 1725 } },
  { id: 'gas-pine', kind: 'gas', name: 'Pinecrest Fuel', near: { x: 715, z: -2255 } },
  { id: 'mart-city', kind: 'grocery', name: 'FreshMart', near: { x: 975, z: 95 } },
  { id: 'mart-costa', kind: 'grocery', name: 'Mercado Merida', near: { x: 505, z: 3310 } },
  { id: 'mart-beach', kind: 'grocery', name: 'Beach Basket', near: { x: 110, z: 40 } },
  { id: 'liq-city', kind: 'liquor', name: 'Last Call Liquor', near: { x: 1010, z: 15 } },
  { id: 'liq-cinder', kind: 'liquor', name: 'Cactus Spirits', near: { x: 3305, z: 575 } },
  { id: 'liq-harbor', kind: 'liquor', name: 'Dockside Drinks', near: { x: 455, z: 1695 } },
  { id: 'liq-hills', kind: 'liquor', name: 'Crestview Cellar', near: { x: 1085, z: -880 } },
  { id: 'jew-mall', kind: 'jewel', name: 'Gem Counter', near: { x: 1205, z: 155 } },
  { id: 'jew-costa', kind: 'jewel', name: 'Joyería Dorada', near: { x: 535, z: 3335 } },
];

const STYLE: Record<StoreKind, { color: number; sign: string; take: [number, number]; secs: number; glyph: string }> = {
  gas: { color: 0xff7a1a, sign: 'GAS', take: [350, 1100], secs: 12, glyph: '⛽' },
  grocery: { color: 0x33c46a, sign: 'MART', take: [450, 1500], secs: 14, glyph: '▣' },
  liquor: { color: 0xa24dff, sign: 'LIQUOR', take: [500, 1700], secs: 12, glyph: '▼' },
  jewel: { color: 0xe6b84a, sign: 'JEWELS', take: [3000, 8000], secs: 20, glyph: '◆' },
};

export const storeStyle = (k: StoreKind): (typeof STYLE)[StoreKind] => STYLE[k];

export interface Store {
  def: StoreDef;
  x: number;
  z: number;
  /** The way the service window faces (forward = (sin yaw, cos yaw)). */
  yaw: number;
  clerk: Ped | null;
  group: THREE.Group;
  marker: { name: string; x: number; z: number; glyph: string; color?: string };
}

const TAG = '‍';

function signTexture(text: string, color: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#101218'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  g.font = '700 38px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Little service kiosks with a clerk behind the counter, placed on open ground near their listed spots. */
export class Stores {
  readonly list: Store[] = [];
  readonly group = new THREE.Group();

  constructor(g: Game) {
    const cm = g.commerce!;
    const wall = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.8, emissive: 0xd8d2c4, emissiveIntensity: 0.12 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8, emissive: 0x6b4a2e, emissiveIntensity: 0.12 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.7 });
    for (const m of [wall, wood, dark]) g.world.rig.register(m);
    for (const def of STORES) {
      const st = STYLE[def.kind];
      const spot = cm.points.find(def.near.x, def.near.z, 4.2, { walkOnly: false, maxR: 90 });
      // face the open side
      let yaw = 0, best = -1;
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        let open = 0;
        for (const r of [3, 5, 7]) if (cm.points.free(spot.x + Math.sin(a) * r, spot.z + Math.cos(a) * r, 1.6)) open++;
        if (open > best) { best = open; yaw = a; }
      }
      const y = terrainHeight(spot.x, spot.z);
      const grp = new THREE.Group();
      grp.position.set(spot.x, y, spot.z);
      grp.rotation.y = yaw;
      const accent = new THREE.MeshStandardMaterial({ color: st.color, emissive: st.color, emissiveIntensity: 0.5, roughness: 0.6 });
      g.world.rig.register(accent);
      const sign = new THREE.MeshBasicMaterial({ map: signTexture(def.name.length < 14 ? def.name : st.sign, st.color) });
      const add = (sx: number, sy: number, sz: number, x: number, yy: number, z: number, mat: THREE.Material): THREE.Mesh => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        mesh.position.set(x, yy, z);
        grp.add(mesh);
        return mesh;
      };
      add(3.8, 0.1, 2.8, 0, 0.05, 0, dark);
      add(3.6, 2.8, 0.2, 0, 1.4, -1.3, wall);
      add(0.2, 2.8, 2.6, -1.8, 1.4, 0, wall);
      add(0.2, 2.8, 2.6, 1.8, 1.4, 0, wall);
      add(4.4, 0.2, 3.4, 0, 2.95, 0.1, accent);
      add(3.6, 1.1, 0.5, 0, 0.55, 1.15, wood);
      add(3.0, 0.7, 0.1, 0, 3.55, 1.5, sign);
      for (let i = 0; i < 4; i++) add(0.7, 0.5, 0.3, -1.2 + i * 0.8, 1.1 + (i % 2) * 0.6, -1.1, accent);
      if (def.kind === 'gas') { add(0.5, 1.5, 0.5, -1.7, 0.75, 4.4, accent); add(0.5, 1.5, 0.5, 1.7, 0.75, 4.4, accent); }
      if (def.kind === 'jewel') add(1.0, 0.25, 0.8, 0, 1.22, 1.15, new THREE.MeshStandardMaterial({ color: 0x9ad7ff, emissive: 0x9ad7ff, emissiveIntensity: 0.4, transparent: true, opacity: 0.7 }));
      this.group.add(grp);
      // colliders: back, sides, counter, pumps (local → world with the yaw)
      const boxes: { cx: number; cy: number; cz: number; hx: number; hy: number; hz: number; ry: number }[] = [];
      const co = (lx: number, lz: number, hx: number, hz: number): void => {
        boxes.push({ cx: spot.x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, cy: y + 1.4, cz: spot.z - Math.sin(yaw) * lx + Math.cos(yaw) * lz, hx, hy: 1.4, hz, ry: yaw });
      };
      co(0, -1.3, 1.8, 0.1); co(-1.8, 0, 0.1, 1.3); co(1.8, 0, 0.1, 1.3); co(0, 1.15, 1.8, 0.25);
      if (def.kind === 'gas') { co(-1.7, 4.4, 0.25, 0.25); co(1.7, 4.4, 0.25, 0.25); }
      g.physics!.addBuildings(boxes);
      const marker = { name: `${TAG}${def.name}`, x: spot.x, z: spot.z, glyph: '¢', color: '#9aa3b5' };
      MARKERS.push(marker);
      this.list.push({ def, x: spot.x, z: spot.z, yaw, clerk: null, group: grp, marker });
    }
    g.world.scene.add(this.group);
  }

  /** The clerk's spot behind the counter (world). */
  clerkSpot(s: Store): { x: number; z: number } {
    return { x: s.x + Math.sin(s.yaw) * 0.2, z: s.z + Math.cos(s.yaw) * 0.2 };
  }

  /** Where a customer stands, in front of the window. */
  front(s: Store, d = 1.8): { x: number; z: number } {
    return { x: s.x + Math.sin(s.yaw) * (1.15 + d), z: s.z + Math.cos(s.yaw) * (1.15 + d) };
  }
}
