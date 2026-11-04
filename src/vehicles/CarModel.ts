import * as THREE from 'three';
import { ArmRig, HandRig, POSES } from '../player/HandRig';
import type { BodyStyle, VehicleSpec } from './specs';
import type { Vehicle } from './Vehicle';

type P2 = [number, number];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Side silhouettes in (distance from the front bumper, height above ground) metres. */
function silhouettes(kind: BodyStyle['kind'], L: number): { body: P2[]; cabin: P2[]; belt: number; roof: number } {
  switch (kind) {
    case 'hatch':
      return {
        body: [[0, 0.3], [0, 0.6], [0.1, 0.71], [0.9, 0.83], [3.1, 0.87], [3.62, 0.94], [L, 0.8], [L, 0.38], [L - 0.15, 0.3]],
        cabin: [[0.98, 0.83], [1.5, 1.4], [1.62, 1.46], [2.95, 1.46], [3.42, 1.0], [3.52, 0.87]], belt: 0.83, roof: 1.46,
      };
    case 'sedan':
      return {
        body: [[0, 0.32], [0, 0.62], [0.14, 0.73], [1.2, 0.9], [3.95, 0.95], [4.55, 0.96], [L, 0.8], [L, 0.42], [L - 0.2, 0.32]],
        cabin: [[1.25, 0.9], [2.0, 1.4], [2.15, 1.44], [3.15, 1.44], [3.7, 0.97], [3.82, 0.95]], belt: 0.9, roof: 1.44,
      };
    case 'muscle':
      return {
        body: [[0, 0.3], [0, 0.62], [0.16, 0.74], [1.7, 0.92], [4.3, 0.98], [L, 1.0], [L, 0.5], [L - 0.2, 0.3]],
        cabin: [[1.75, 0.92], [2.45, 1.3], [2.6, 1.32], [3.3, 1.32], [4.0, 1.0], [4.1, 0.98]], belt: 0.92, roof: 1.32,
      };
    case 'super':
      return {
        body: [[0, 0.25], [0, 0.48], [0.35, 0.58], [1.45, 0.7], [2.7, 0.82], [4.1, 0.86], [L, 0.78], [L, 0.38], [L - 0.2, 0.25]],
        cabin: [[1.4, 0.7], [2.05, 1.04], [2.25, 1.09], [2.8, 1.09], [3.55, 0.9], [3.7, 0.84]], belt: 0.7, roof: 1.09,
      };
    case 'pickup':
      return {
        body: [[0, 0.45], [0, 0.98], [0.12, 1.1], [1.35, 1.22], [3.4, 1.2], [3.5, 1.16], [L, 1.15], [L, 0.52], [L - 0.2, 0.45]],
        cabin: [[1.4, 1.2], [1.95, 1.78], [2.1, 1.83], [3.05, 1.83], [3.35, 1.2], [3.4, 1.2]], belt: 1.2, roof: 1.83,
      };
    default:
      return { body: [], cabin: [], belt: 0, roof: 0 };
  }
}

/** Extrude a closed side profile across the car's width, apply tumblehome (narrowing toward the top) and centre it. */
export function extrudeProfile(points: P2[], L: number, width: number, taper: [number, number, number], bevel = 0.04, arches?: { d: number; r: number; cy: number }[], floorY = 0.24): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  // build polygon with wheel-arch notches along the bottom (front → rear)
  const pts: P2[] = [];
  const first = points[0]!;
  const last = points[points.length - 1]!;
  void first;
  for (const p of points) pts.push(p);
  if (arches) {
    // bottom edge: from rear back to front, notched
    const sorted = [...arches].sort((a, b) => b.d - a.d);
    pts.push([last[0], floorY]);
    for (const a of sorted) {
      pts.push([a.d + a.r, floorY]);
      for (let i = 0; i <= 10; i++) {
        const t = (i / 10) * Math.PI;
        pts.push([a.d + a.r * Math.cos(t), a.cy + a.r * 0.95 * Math.sin(t)]);
      }
      pts.push([a.d - a.r, floorY]);
    }
    pts.push([points[0]![0], floorY]);
  }
  pts.forEach(([d, h], i) => (i === 0 ? shape.moveTo(L / 2 - d, h) : shape.lineTo(L / 2 - d, h)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(Math.PI / 2); // profile x (front +) → −Z (forward)
  const pos = g.attributes.position as THREE.BufferAttribute;
  const [y0, y1, k] = taper;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) * (1 - (1 - k) * smooth(y0, y1, y)));
  }
  g.computeVertexNormals();
  return g;
}

const plateTex = (): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8e6da'; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#223'; g.lineWidth = 3; g.strokeRect(3, 3, 122, 58);
  g.fillStyle = '#c33'; g.font = 'bold 9px sans-serif'; g.fillText('SAN VERANO', 28, 15);
  g.fillStyle = '#223'; g.font = 'bold 30px sans-serif';
  g.fillText(`VC${Math.floor(1000 + Math.random() * 8999)}`.slice(0, 6), 12, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const labelTex = (text: string, bg: string, fg: string): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, 256, 96);
  g.fillStyle = fg; g.font = 'bold 58px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

export interface WheelVisual {
  root: THREE.Group;
  spin: THREE.Group;
  front: boolean;
}

/** Lathe-profiled tyre + rim so wheels read as real wheels at close range. */
export function buildWheel(radius: number, width: number, rimColor = '#c9ccd2', side = 1): THREE.Group {
  const g = new THREE.Group();
  const rimR = radius * 0.62;
  const hw = width / 2;
  const prof: THREE.Vector2[] = [];
  const add = (r: number, y: number) => prof.push(new THREE.Vector2(r, y));
  add(rimR, -hw * 0.9); add(rimR + 0.015, -hw);
  add(radius - 0.045, -hw); add(radius - 0.012, -hw * 0.86); add(radius, -hw * 0.6);
  add(radius, hw * 0.6); add(radius - 0.012, hw * 0.86); add(radius - 0.045, hw);
  add(rimR + 0.015, hw); add(rimR, hw * 0.9);
  const tireGeo = new THREE.LatheGeometry(prof, 32);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.92, metalness: 0 }));
  g.add(tire);
  const rimMat = new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.28, metalness: 0.95 });
  const face = new THREE.CylinderGeometry(rimR, rimR * 0.97, width * 0.55, 28);
  face.rotateZ(Math.PI / 2);
  const rim = new THREE.Mesh(face, new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.6, metalness: 0.6 }));
  g.add(rim);
  const spokes = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(width * 0.35, rimR * 0.92, rimR * 0.2), rimMat);
    sp.position.set(side * hw * 0.55, rimR * 0.46, 0);
    const holder = new THREE.Group();
    holder.rotation.x = (i / 6) * Math.PI * 2;
    holder.add(sp);
    spokes.add(holder);
  }
  g.add(spokes);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.22, rimR * 0.22, 0.02, 16).rotateZ(Math.PI / 2), rimMat);
  cap.position.x = side * hw * 0.62;
  g.add(cap);
  // brake disc
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.85, rimR * 0.85, 0.012, 24).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x707479, roughness: 0.5, metalness: 0.9 }));
  disc.position.x = -side * hw * 0.2;
  g.add(disc);
  return g;
}

/**
 * Builds the visual for a car and returns an object with an `update` hook that animates wheels, suspension,
 * lights, steering wheel, driver and door from the physics state.
 */
export class CarModel {
  readonly group = new THREE.Group();
  readonly materials: THREE.Material[] = [];
  private readonly wheelsVis: WheelVisual[] = [];
  private readonly shell = new THREE.Group();
  private readonly door = new THREE.Group();
  private readonly steeringWheel = new THREE.Group();
  private readonly driver = new THREE.Group();
  private readonly armR: ArmRig;
  private readonly armL: ArmRig;
  private readonly handR = new HandRig();
  private readonly handL: HandRig;
  private readonly headlightMat: THREE.MeshStandardMaterial;
  private readonly tailMat: THREE.MeshStandardMaterial;
  private readonly cone: THREE.Mesh;
  private readonly coneMat: THREE.MeshBasicMaterial;
  private readonly shoulderR = new THREE.Vector3();
  private readonly shoulderL = new THREE.Vector3();
  private readonly _a = new THREE.Vector3();
  private readonly _b = new THREE.Vector3();
  private readonly _m = new THREE.Matrix4();
  readonly bodyMat: THREE.MeshPhysicalMaterial;

  constructor(readonly vehicle: Vehicle) {
    const spec = vehicle.spec;
    const st = spec.body;
    const L = spec.size.length;
    const W = spec.size.width;
    const sil = silhouettes(st.kind, L);
    this.group.add(this.shell);
    this.shell.position.y = -spec.comHeight;

    // --- materials -----------------------------------------------------------------------------------------
    this.bodyMat = new THREE.MeshPhysicalMaterial({ color: st.color, metalness: st.metallic, roughness: st.roughness, clearcoat: 1, clearcoatRoughness: 0.07 });
    const trim = new THREE.MeshStandardMaterial({ color: st.accent, roughness: 0.55, metalness: 0.2 });
    const glass = new THREE.MeshPhysicalMaterial({ color: st.glassTint, roughness: 0.04, metalness: 0.1, clearcoat: 1, transparent: true, opacity: 0.82 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.8, metalness: 0.2 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd2d6, roughness: 0.15, metalness: 1 });
    this.headlightMat = new THREE.MeshStandardMaterial({ color: 0xdfe7ee, emissive: new THREE.Color(1, 0.95, 0.8), emissiveIntensity: 0.15, roughness: 0.1, metalness: 0.3 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0a0c, emissive: new THREE.Color(1, 0.05, 0.04), emissiveIntensity: 0.35, roughness: 0.3 });
    const interior = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.9 });
    this.materials.push(this.bodyMat, trim, glass, dark, chrome, this.headlightMat, this.tailMat, interior);
    for (const m of this.materials) (m as THREE.MeshStandardMaterial).fog = false;
    this.bodyMat.fog = true;

    // --- body shell ---------------------------------------------------------------------------------------
    const frontAx = (L - spec.wheelbase) / 2;
    const arches = [
      { d: frontAx, r: spec.wheelRadius + 0.07, cy: spec.wheelRadius },
      { d: frontAx + spec.wheelbase, r: spec.wheelRadius + 0.07, cy: spec.wheelRadius },
    ];
    const body = new THREE.Mesh(extrudeProfile(sil.body, L, W, [sil.belt - 0.35, sil.belt + 0.1, 0.9], 0.05, arches, spec.clearance + 0.07), this.bodyMat);
    body.castShadow = true;
    this.shell.add(body);

    // greenhouse: glass volume + body-coloured pillars and roof
    const cabin = new THREE.Mesh(extrudeProfile(sil.cabin, L, W * 0.9, [sil.belt, sil.roof, 0.8], 0.015), glass);
    this.shell.add(cabin);
    const roofThickness = 0.045;
    const roofPts = sil.cabin.filter((p) => p[1] > sil.roof - 0.02);
    if (roofPts.length >= 2) {
      const d0 = roofPts[0]![0] - 0.06;
      const d1 = roofPts[roofPts.length - 1]![0] + 0.1;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 0.78, roofThickness, d1 - d0), this.bodyMat);
      roof.position.set(0, sil.roof + roofThickness / 2 - 0.01, (d0 + d1) / 2 - L / 2);
      roof.castShadow = true;
      this.shell.add(roof);
    }
    // pillars along the cabin outline (A pillar → C pillar)
    const pillar = (a: P2, b: P2, x: number) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, len, 0.07), this.bodyMat);
      m.position.set(x, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2 - L / 2);
      // a box's long (Y) axis rotated about X by θ points along (z = sin θ, y = cos θ): θ = atan2(Δd, Δh)
      m.rotation.x = Math.atan2(b[0] - a[0], b[1] - a[1]);
      this.shell.add(m);
    };
    const cb = sil.cabin;
    const taperAt = (y: number) => 1 - 0.2 * smooth(sil.belt, sil.roof, y);
    for (const side of [-1, 1]) {
      const xAt = (y: number) => side * (W * 0.45 * taperAt(y));
      pillar(cb[0]!, cb[1]!, xAt((cb[0]![1] + cb[1]![1]) / 2));
      pillar(cb[cb.length - 2]!, cb[cb.length - 1]!, xAt((cb[cb.length - 2]![1] + cb[cb.length - 1]![1]) / 2));
    }

    // underbody and arch liners
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.06, L * 0.94), dark);
    floor.position.set(0, spec.clearance + 0.04, 0);
    this.shell.add(floor);

    // --- front and rear details ------------------------------------------------------------------------------
    const hlY = sil.body[2]![1] - 0.07;
    for (const side of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.06), this.headlightMat);
      hl.position.set(side * W * 0.34, hlY, -L / 2 + 0.07);
      this.shell.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.05), this.tailMat);
      tl.position.set(side * W * 0.35, sil.body[sil.body.length - 4]![1] - 0.02, L / 2 - 0.03);
      this.shell.add(tl);
      // mirrors
      const mir = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.07), this.bodyMat);
      mir.position.set(side * (W * 0.5 + 0.06), sil.belt + 0.18, cb[0]![0] + 0.12 - L / 2);
      this.shell.add(mir);
    }
    const grille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.42, 0.13, 0.04), dark);
    grille.position.set(0, sil.body[1]![1] - 0.12, -L / 2 + 0.03);
    this.shell.add(grille);
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(W * 0.96, 0.15, 0.1), trim);
    bumperF.position.set(0, spec.clearance + 0.16, -L / 2 + 0.03);
    const bumperR = bumperF.clone();
    bumperR.position.z = L / 2 - 0.03;
    this.shell.add(bumperF, bumperR);
    // plates
    const plate = new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.5 });
    plate.fog = false;
    this.materials.push(plate);
    const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), plate);
    pf.position.set(0, spec.clearance + 0.16, -L / 2 - 0.025);
    pf.rotation.y = Math.PI;
    const pr = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), plate);
    pr.position.set(0, spec.clearance + 0.33, L / 2 + 0.01);
    this.shell.add(pf, pr);
    // exhaust tips
    for (const side of [-1, 1]) {
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.12, 12).rotateX(Math.PI / 2), chrome);
      ex.position.set(side * W * (st.kind === 'super' ? 0.12 : 0.3), spec.clearance + 0.08, L / 2 + 0.02);
      this.shell.add(ex);
    }
    // door seams + handles on both sides
    const doorX = W / 2 * 0.985;
    for (const side of [-1, 1]) {
      const dz0 = cb[0]![0] + 0.1 - L / 2;
      const dz1 = cb[cb.length - 1]![0] - 0.25 - L / 2;
      for (const z of [dz0, dz1]) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.004, sil.belt - spec.clearance - 0.25, 0.006), dark);
        seam.position.set(side * doorX, (sil.belt + spec.clearance) / 2 + 0.06, z);
        this.shell.add(seam);
      }
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.12), chrome);
      handle.position.set(side * (doorX + 0.004), sil.belt - 0.06, dz1 + 0.18);
      this.shell.add(handle);
    }

    // --- style-specific details --------------------------------------------------------------------------------
    this.styleDetails(st, spec, sil, trim, dark, chrome);

    // --- livery stripe / text ------------------------------------------------------------------------------------
    if (st.livery) {
      const tex = labelTex(st.livery, st.color, '#15171b');
      const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.2 });
      m.fog = false;
      this.materials.push(m);
      for (const side of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), m);
        p.position.set(side * (doorX + 0.006), sil.belt - 0.28, (cb[0]![0] + cb[cb.length - 1]![0]) / 2 - L / 2 + 0.2);
        p.rotation.y = side * Math.PI / 2;
        this.shell.add(p);
      }
    }

    // --- interior ----------------------------------------------------------------------------------------------------
    const seatMat = interior;
    for (const sx of [-1, 1]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46), seatMat);
      seat.position.set(sx * 0.4, spec.seat.y + spec.comHeight - 0.16, spec.seat.z + 0.02);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.55, 0.1), seatMat);
      back.position.set(sx * 0.4, spec.seat.y + spec.comHeight + 0.1, spec.seat.z + 0.28);
      back.rotation.x = 0.18;
      this.shell.add(seat, back);
    }
    const dash = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.2, 0.28), interior);
    dash.position.set(0, sil.belt - 0.02, cb[0]![0] - L / 2 + 0.28);
    this.shell.add(dash);

    // steering wheel (rim + spokes) mounted on a column
    const swRim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.016, 8, 28), new THREE.MeshStandardMaterial({ color: 0x121316, roughness: 0.7 }));
    const swSpoke = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.018, 0.018), swRim.material);
    const swSpoke2 = swSpoke.clone();
    swSpoke2.rotation.z = Math.PI / 2;
    this.steeringWheel.add(swRim, swSpoke, swSpoke2);
    const col = spec.seat;
    this.steeringWheel.position.set(col.x, col.y + spec.comHeight + 0.24, col.z - 0.4 + 0.0);
    this.steeringWheel.rotation.x = -1.05;
    const steerRoot = new THREE.Group();
    steerRoot.position.copy(this.steeringWheel.position);
    steerRoot.rotation.x = -1.05;
    this.steeringWheel.position.set(0, 0, 0);
    this.steeringWheel.rotation.set(0, 0, 0);
    steerRoot.add(this.steeringWheel);
    this.shell.add(steerRoot);
    this.steerRoot = steerRoot;

    // --- door (visual overlay panel on the driver's side) ---------------------------------------------------------------
    const doorLen = cb[cb.length - 1]![0] - cb[0]![0] - 0.35;
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.035, sil.belt - spec.clearance - 0.3, doorLen), this.bodyMat);
    doorPanel.position.set(0, 0, doorLen / 2);
    this.door.add(doorPanel);
    const dz = cb[0]![0] + 0.1 - L / 2 + 0.0;
    this.door.position.set(spec.doorSide * (W / 2 + 0.002), (sil.belt + spec.clearance) / 2 - 0.02, dz);
    this.shell.add(this.door);

    // --- driver ------------------------------------------------------------------------------------------------------------
    const jacket = new THREE.MeshStandardMaterial({ color: 0x3d4248, roughness: 0.9 });
    const skin = this.handR.material;
    const cuff = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.95 });
    this.materials.push(jacket, cuff);
    this.armR = new ArmRig(jacket, skin, cuff);
    this.armL = new ArmRig(jacket, skin, cuff);
    this.handL = new HandRig(skin);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.34, 6, 14), jacket);
    torso.position.set(0, 0.25, 0.05);
    torso.scale.set(1.0, 1, 0.75);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 14), skin);
    head.position.set(0, 0.66, -0.02);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0x241a14, roughness: 0.9 }));
    hair.position.copy(head.position);
    hair.position.y += 0.012;
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.4, 4, 10), jacket);
    thigh.rotation.x = Math.PI / 2;
    thigh.position.set(0.1, 0.0, -0.22);
    const thigh2 = thigh.clone();
    thigh2.position.x = -0.1;
    this.driver.add(torso, head, hair, thigh, thigh2);
    this.driver.position.set(spec.seat.x, spec.seat.y + spec.comHeight - 0.04, spec.seat.z + 0.05);
    this.driver.rotation.x = 0.1;
    this.shell.add(this.driver);
    this.shell.add(this.armR.root, this.armL.root, this.handR.root, this.handL.root);
    this.handR.root.matrixAutoUpdate = false;
    this.handL.root.matrixAutoUpdate = false;
    this.driver.visible = false;
    this.armR.root.visible = this.armL.root.visible = this.handR.root.visible = this.handL.root.visible = false;
    this.shoulderR.set(spec.seat.x + 0.2, spec.seat.y + spec.comHeight + 0.42, spec.seat.z + 0.02);
    this.shoulderL.set(spec.seat.x - 0.2, spec.seat.y + spec.comHeight + 0.42, spec.seat.z + 0.02);

    // --- wheels ----------------------------------------------------------------------------------------------------------------
    for (const w of vehicle.wheels) {
      const root = new THREE.Group();
      const spin = new THREE.Group();
      const sideSign = Math.sign(w.x) || 1;
      const wheel = buildWheel(spec.wheelRadius, spec.wheelWidth, st.kind === 'super' ? '#8a8d92' : '#c9ccd2', sideSign);
      spin.add(wheel);
      root.add(spin);
      // mirror so the dished face points outward on both sides
      if (w.x < 0) wheel.scale.x = -1;
      this.group.add(root);
      this.wheelsVis.push({ root, spin, front: w.front });
    }

    // --- headlight beam cone (additive, subtle) -----------------------------------------------------------------------------------
    this.coneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.92, 0.7), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    this.cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 14, 20, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -7), this.coneMat);
    this.cone.position.set(0, hlY - spec.comHeight, -L / 2);
    this.cone.renderOrder = 6;
    this.group.add(this.cone);

    this.group.traverse((o) => {
      o.frustumCulled = false;
      if (o instanceof THREE.Mesh && o.material !== this.coneMat) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.cone.castShadow = false;
    this.cone.receiveShadow = false;
    this.materials.push(this.coneMat);
  }

  private steerRoot!: THREE.Group;

  /** Spoilers, scoops, bed, light bars… */
  private styleDetails(st: BodyStyle, spec: VehicleSpec, sil: ReturnType<typeof silhouettes>, trim: THREE.Material, dark: THREE.Material, chrome: THREE.Material): void {
    const L = spec.size.length;
    const W = spec.size.width;
    const add = (m: THREE.Mesh, x: number, y: number, d: number) => { m.position.set(x, y, d - L / 2); this.shell.add(m); };
    switch (st.kind) {
      case 'muscle': {
        const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.8), dark);
        add(scoop, 0, sil.body[3]![1] + 0.04, 1.0);
        for (const x of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 3.2), trim), x * 0.28, sil.belt + 0.11, 2.6);
        break;
      }
      case 'super': {
        add(new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.035, 0.34), trim), 0, 1.02, L - 0.28);
        for (const x of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.34), trim), x * W * 0.44, 0.95, L - 0.28);
        add(new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.04, 0.5), dark), 0, 0.14, 0.3);
        for (const x of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.5), dark), x * (W / 2 - 0.02), 0.52, 3.2);
        break;
      }
      case 'pickup': {
        const bedStart = 3.5;
        add(new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, 0.02, L - bedStart - 0.15), dark), 0, sil.body[5]![1] + 0.006, (bedStart + L - 0.15) / 2);
        for (const x of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, L - bedStart - 0.1), trim), x * (W / 2 - 0.05), sil.body[5]![1] + 0.04, (bedStart + L - 0.1) / 2);
        // roof light bar
        add(new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.08, 0.14), dark), 0, sil.roof + 0.1, 2.2);
        add(new THREE.Mesh(new THREE.BoxGeometry(W * 1.0, 0.18, 0.2), trim), 0, 0.5, 0.05);
        break;
      }
      case 'sedan':
        if (st.livery) {
          const sign = new THREE.MeshStandardMaterial({ map: labelTex('TAXI', '#fff6c0', '#111'), emissive: new THREE.Color(1, 0.9, 0.45), emissiveMap: labelTex('TAXI', '#222', '#ffffff'), emissiveIntensity: 0.3 });
          sign.fog = false;
          this.materials.push(sign);
          add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.2), sign), 0, sil.roof + 0.1, 2.55);
        }
        break;
      case 'hatch':
        add(new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, 0.025, 0.28), trim), 0, sil.roof + 0.0, 3.35);
        break;
      default:
    }
    void chrome;
  }

  /** Light state, called each frame. */
  setLights(headlights: boolean, braking: boolean, reversing: boolean, night: number): void {
    this.headlightMat.emissiveIntensity = headlights ? 3.2 : 0.15;
    this.tailMat.emissiveIntensity = braking ? 5 : headlights ? 1.6 : 0.3;
    if (reversing) this.tailMat.emissiveIntensity = Math.max(this.tailMat.emissiveIntensity, 1.2);
    this.coneMat.opacity = headlights ? 0.06 + 0.1 * night : 0;
  }

  /** Per-frame visual update from the physics state. `dt` in seconds. */
  update(): void {
    const v = this.vehicle;
    const spec = v.spec;
    // wheels: suspension travel, steering, spin
    this.wheelsVis.forEach((wv, i) => {
      const w = v.wheels[i]!;
      const y = w.mountY - (spec.suspension.rest - w.visualComp);
      wv.root.position.set(w.x, y, w.z);
      wv.root.rotation.y = wv.front ? -w.steer : 0;
      wv.spin.rotation.x = w.spin;
    });
    // steering wheel follows the road wheels (≈ 2.4× lock)
    this.steeringWheel.rotation.z = -v.steerAngle * 2.6;
    // door
    const target = v.doorOpen;
    this.door.rotation.y = spec.doorSide * target * 1.1 * -1;
    // driver visibility and IK arms on the wheel
    const show = v.occupied;
    this.driver.visible = show;
    this.armR.root.visible = this.armL.root.visible = this.handR.root.visible = this.handL.root.visible = show;
    if (show) this.poseArms();
  }

  private poseArms(): void {
    // Hand targets on the rim at 10 and 2 o'clock, rotated with the wheel
    const a = this.steeringWheel.rotation.z;
    const rimR = 0.17;
    this.steerRoot.updateMatrix();
    for (const side of [1, -1]) {
      const ang = Math.PI / 2 - side * 0.95 + a; // around the wheel's local z axis
      this._a.set(Math.cos(ang) * rimR, Math.sin(ang) * rimR, 0.0).applyMatrix4(this.steerRoot.matrix);
      const arm = side > 0 ? this.armR : this.armL;
      const hand = side > 0 ? this.handR : this.handL;
      const shoulder = side > 0 ? this.shoulderR : this.shoulderL;
      this._b.set(side * 0.5, -1, 0.1);
      arm.solve(shoulder, this._a, this._b);
      hand.apply(POSES.gripTrigger);
      // orient: back of the hand up/outward, fingers wrapping across the rim
      this._m.makeRotationFromEuler(new THREE.Euler(-0.7, 0, side * 1.3));
      this._m.setPosition(this._a);
      if (side < 0) this._m.scale(new THREE.Vector3(-1, 1, 1));
      hand.root.matrix.copy(this._m);
    }
  }
}
