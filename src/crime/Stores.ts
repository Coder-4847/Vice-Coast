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
  { id: 'gas-south', kind: 'gas', name: 'Kings Gas', near: { x: 1480, z: 420 } },
  { id: 'gas-down', kind: 'gas', name: 'Petrolia Gas', near: { x: 870, z: -40 } },
  { id: 'gas-costa', kind: 'gas', name: 'Merida Fuel', near: { x: 650, z: 3420 } },
  { id: 'gas-air', kind: 'gas', name: 'Runway Fuel', near: { x: 980, z: 860 } },
  { id: 'gas-hills', kind: 'gas', name: 'Crestview Fuel', near: { x: 1150, z: -820 } },
  { id: 'mart-south', kind: 'grocery', name: 'Kwik Stop', near: { x: 1430, z: 380 } },
  { id: 'mart-pine', kind: 'grocery', name: 'Pinecrest Grocer', near: { x: 680, z: -2330 } },
  { id: 'mart-harbor', kind: 'grocery', name: 'Harbor 24/7', near: { x: 520, z: 1780 } },
  { id: 'liq-south', kind: 'liquor', name: 'Corner Spirits', near: { x: 1350, z: 520 } },
  { id: 'liq-costa', kind: 'liquor', name: 'Bodega Merida', near: { x: 470, z: 3380 } },
  { id: 'jew-down', kind: 'jewel', name: 'Vanderlyn Diamonds', near: { x: 1050, z: -120 } },
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
  /** The clerk's spot behind the counter inside, while the interior is built (world coordinates). */
  room: { x: number; z: number; yaw: number } | null;
  /** The street door (forward = the way out). */
  door: { x: number; z: number; yaw: number } | null;
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

/** Little walk-in shops (a gas station, a mini-mart, a liquor store, a jeweller) placed on open ground near their listed spots. */
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
      // a closed box of a shop: walls, a flat roof with a lit fascia, big windows either side of a glass door
      const W = 6.2, D = 4.6, H = 3.3;
      add(W, H, D, 0, H / 2, -0.4, wall);
      add(W + 0.5, 0.35, D + 0.5, 0, H + 0.17, -0.4, accent);
      add(W - 0.6, 0.6, 0.08, 0, H - 0.45, D / 2 - 0.36, sign);
      const glass = new THREE.MeshStandardMaterial({ color: 0x1a2430, emissive: 0xfff0d0, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.2 });
      g.world.rig.register(glass);
      for (const s of [-1, 1]) add(1.9, 1.6, 0.06, s * 1.95, 1.35, D / 2 - 0.37, glass);
      add(1.4, 2.3, 0.06, 0, 1.15, D / 2 - 0.37, glass);
      add(1.7, 2.5, 0.1, 0, 1.25, D / 2 - 0.42, dark);
      add(W, 0.12, 1.2, 0, 0.06, D / 2 + 0.2, dark);
      if (def.kind === 'gas') {
        add(8, 0.4, 5, 0, 4.4, 4.6, accent);
        for (const s of [-1, 1]) { add(0.35, 4.2, 0.35, s * 3.4, 2.1, 4.6, wood); add(0.5, 1.5, 0.5, s * 1.7, 0.75, 4.6, accent); add(0.7, 0.25, 1.4, s * 1.7, 0.12, 4.6, dark); }
      }
      void wood;
      this.group.add(grp);
      // colliders: back, sides, counter, pumps (local → world with the yaw)
      const boxes: { cx: number; cy: number; cz: number; hx: number; hy: number; hz: number; ry: number }[] = [];
      const co = (lx: number, lz: number, hx: number, hz: number): void => {
        boxes.push({ cx: spot.x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, cy: y + 1.4, cz: spot.z - Math.sin(yaw) * lx + Math.cos(yaw) * lz, hx, hy: 1.4, hz, ry: yaw });
      };
      co(0, -0.4, W / 2, D / 2);
      if (def.kind === 'gas') { co(-1.7, 4.6, 0.25, 0.25); co(1.7, 4.6, 0.25, 0.25); co(-3.4, 4.6, 0.18, 0.18); co(3.4, 4.6, 0.18, 0.18); }
      g.physics!.addBuildings(boxes);
      const marker = { name: `${TAG}${def.name}`, x: spot.x, z: spot.z, glyph: '¢', color: '#9aa3b5' };
      MARKERS.push(marker);
      const dx = spot.x + Math.sin(yaw) * (D / 2 - 0.4 + 1.0), dz = spot.z + Math.cos(yaw) * (D / 2 - 0.4 + 1.0);
      this.list.push({ def, x: spot.x, z: spot.z, yaw, clerk: null, group: grp, marker, room: null, door: { x: dx, z: dz, yaw } });
    }
    g.world.scene.add(this.group);
  }

  /** The clerk's spot behind the counter (world). */
  clerkSpot(s: Store): { x: number; z: number } {
    if (s.room) return { x: s.room.x, z: s.room.z };
    return { x: s.x + Math.sin(s.yaw) * 0.2, z: s.z + Math.cos(s.yaw) * 0.2 };
  }

  /** Where the clerk works right now: the counter inside while it is built, else the shop itself. */
  anchor(s: Store): { x: number; z: number } {
    return s.room ?? { x: s.x, z: s.z };
  }

  /** Where a customer stands, in front of the window. */
  front(s: Store, d = 1.8): { x: number; z: number } {
    return { x: s.x + Math.sin(s.yaw) * (1.15 + d), z: s.z + Math.cos(s.yaw) * (1.15 + d) };
  }
}
