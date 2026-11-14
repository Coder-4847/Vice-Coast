import { S, type Builder, type Surf } from './Builder';
import * as F from './furniture';
import { PAINT, FABRIC, WOOD } from './furniture';

/** Which set to build: the building kind, the part of it (lobby, hallway, a room) and a seed. */
export interface Venue {
  kind: string;
  level: string;
  seed: number;
  name: string;
  floors: number;
  /** Sub-type: shop id, property id, store kind… */
  sub?: string;
  /** A floor or room number for hallways and rooms. */
  floor?: number;
  unit?: number;
}

/** What the rooms can make happen. */
export interface Ops {
  exit(): void;
  go(v: Venue): void;
  shop(kind: 'clothing' | 'barber' | 'weapons' | 'food'): void;
  property(): void;
  wardrobe(): void;
  sleep(): void;
  rent(price: number, v: Venue): void;
  heal(price: number): void;
  drink(price: number): void;
  workout(): void;
  breakIn(v: Venue): void;
  loot(amount: number, what: string): void;
  knock(): void;
  /** Open the web browser (computers and laptops). */
  web(url?: string): void;
  /** The room you rented in this building today, if any. */
  key(v: Venue): Venue | null;
  atm(): void;
  say(text: string): void;
  /** Is somebody home in this unit / house right now? */
  occupied(seed: number): 'away' | 'awake' | 'asleep';
  hour: number;
  owned: boolean;
}

const pi = Math.PI;

/** The street door: a leaf on the -z wall at x, an exit spot and where you appear. */
function entrance(b: Builder, x: number, z0: number, ops: Ops, glass = false, label = 'Leave'): void {
  if (glass) {
    b.box(x, 0, z0 + 0.02, 1.9, 2.4, 0.06, S('metal', 0x2a2d33), false, false);
    b.glow(x, 0.05, z0 + 0.06, 1.7, 2.25, 0.02, 0xbcd4e6, 0.55);
  } else F.doorLeaf(b, x, z0 + 0.05, 0, 'EXIT', 0x5a3e28);
  b.sign('EXIT', x, 2.6, z0 + 0.12, 0.5, 0, '#ffffff', '#1a8a3a');
  b.entry = { x, z: z0 + 1.4, yaw: pi };
  b.spot(x, z0 + 0.6, label, () => ops.exit(), 1.1);
}

/** A door in a room that leads somewhere else in the building (elevator, a hallway, a unit). */
function link(b: Builder, x: number, z: number, label: string, act: () => void): void {
  b.spot(x, z, label, act, 1.0);
}

const amb = (hex: number) => hex;
const PLASTER = (c: number): Surf => S('plaster', c, 2);

// ================================================================================================ shops

function store(b: Builder, v: Venue, ops: Ops): void {
  const sub = v.sub ?? 'gas';
  const big = sub === 'grocery';
  const W = big ? 16 : sub === 'liquor' ? 10 : sub === 'jewel' ? 12 : 12, D = big ? 14 : sub === 'jewel' ? 9 : 10;
  const x0 = -W / 2, x1 = W / 2, z0 = 0, z1 = D;
  b.room(x0, z0, x1, z1, 3.4, { floor: S(sub === 'jewel' ? 'marble' : 'lino', sub === 'jewel' ? 0xf2f0ea : 0xe8e4dc, sub === 'jewel' ? 2 : 1.2), wall: PLASTER(sub === 'liquor' ? 0x6a4a4a : 0xf2f0ea), ceil: S('ceiling', 0xf2f2f0, 1.2), amb: amb(sub === 'liquor' ? 0x6a5a50 : 0x8a8a86), skirting: 0x5a5a5a, gaps: [{ side: 0, at: 0, w: 1.9, h: 2.4 }] });
  for (let x = x0 + 2; x < x1 - 1; x += 3) for (let z = 2; z < z1 - 1; z += 3) b.fixture(x, z, 3.4, 'panel', 0xf4f8ff, 0.9);
  entrance(b, 0, z0, ops, true);
  // the counter on the right as you come in, clerk behind it facing the door
  const cx = x1 - 2.2, cz = 2.6;
  F.counter(b, cx, cz, 3, 3.2, S('wood', 0x6b4a30, 1));
  b.box(x1 - 0.6, 0, cz, 0.7, 2.2, 3.2, S('panel', 0x3a3a3a, 1), true); // cigarettes & scratchcards behind
  for (let i = 0; i < 18; i++) b.box(x1 - 0.95, 1.0 + (i % 6) * 0.18, cz - 1.4 + Math.floor(i / 6) * 1.0 + 0.2, 0.06, 0.14, 0.7, S('plain', b.pick([0xd83a2a, 0xe8e0d0, 0x2a2a2a, 0xc4a24a])), false, false);
  b.person(x1 - 1.35, cz, -pi / 2, 'clerk');
  b.spot(cx - 1.0, cz, sub === 'jewel' ? 'Browse the jewellery' : 'Buy snacks and drinks', () => ops.shop('food'), 1.3);
  if (sub === 'jewel') {
    for (let i = 0; i < 3; i++) F.display(b, x0 + 2, 2.5 + i * 2.2, 2, 1.8, [0xe6c84a, 0xd8dde6, 0x9ad7ff, 0xe84a6a]);
    F.display(b, 0, z1 - 1.5, 1, 3.6);
    F.display(b, -1.2, 5, 0, 2.2);
    F.plant(b, x0 + 0.6, z1 - 0.6);
    b.sign(v.name.toUpperCase(), 0, 2.7, z1 - 0.12, 3.2, 1, '#e6c84a', '#141210');
    return;
  }
  // aisles down the middle, coolers along the back and left walls
  const n = big ? 4 : 2;
  for (let i = 0; i < n; i++) {
    const ax = x0 + 2.4 + i * ((W - 6) / Math.max(1, n - 0.5));
    if (sub === 'liquor') F.aisle(b, ax, 5.2, 5, 'z', 1.7, [0x3a6a2a, 0x8a4a1a, 0xe8e0d0, 0x5a2a1a, 0x2a4a6a, 0xc4a24a, 0x8a1a2a]);
    else F.aisle(b, ax, 5.0, big ? 7 : 4.6, 'z');
  }
  F.cooler(b, (x0 + x1) / 2 - 1, z1 - 0.45, 1, W - 4);
  F.cooler(b, x0 + 0.45, z1 - 3.5, 2, 4);
  if (sub === 'gas') { F.atm(b, x0 + 0.5, 1.4, 2); b.spot(x0 + 1.2, 1.4, 'Use ATM', () => ops.atm(), 1); }
  if (big) { for (let i = 0; i < 3; i++) b.box(x0 + 3 + i * 2.2, 0, 1.6, 1.6, 0.8, 1, S('wood', 0x8a6a48, 0.6), true); for (let i = 0; i < 30; i++) b.ball(x0 + 2.4 + (i % 10) * 0.66, 0.86, 1.3 + Math.floor(i / 10) * 0.3, 0.1, S('plain', b.pick([0xd83a2a, 0xf2c43a, 0x3ab84a, 0xf28a2a]))); }
  b.sign(v.name.toUpperCase(), (x0 + x1) / 2 - 1, 2.75, z1 - 0.92, 3.2, 1, '#ffffff', sub === 'liquor' ? '#5a1a6a' : sub === 'grocery' ? '#1a6a3a' : '#c4501a');
  F.vending(b, x0 + 0.5, z1 - 6.5, 2);
}

function clothing(b: Builder, v: Venue, ops: Ops): void {
  const W = 14, D = 12;
  b.room(-W / 2, 0, W / 2, D, 3.6, { floor: S('parquet', 0xffffff, 2.4), wall: PLASTER(0xf4f2ee), amb: amb(0x8a8682), skirting: 0x2a2a2a, gaps: [{ side: 0, at: 0, w: 1.9, h: 2.4 }] });
  for (let x = -4.5; x <= 4.5; x += 3) for (let z = 2.5; z < D; z += 3.2) b.fixture(x, z, 3.6, 'round', 0xfff4e4, 0.95);
  entrance(b, 0, 0, ops, true);
  for (let i = 0; i < 3; i++) F.clothesRack(b, -4 + i * 4, 4.5, 'x', 2.2);
  for (let i = 0; i < 2; i++) F.clothesRack(b, -2 + i * 4, 7.8, 'x', 2.2);
  for (let i = 0; i < 4; i++) F.mannequin(b, -W / 2 + 1, 2.5 + i * 2.4, b.pick([0x2a3a5a, 0x8a2a2a, 0xe8e4dc, 0x1a1a1a]));
  // shelves of folded shirts along the right wall
  for (let i = 0; i < 4; i++) for (let row = 0; row < 4; row++) for (let k = 0; k < 3; k++) b.box(W / 2 - 0.35, 0.4 + row * 0.45, 2.4 + i * 2.2 + k * 0.5, 0.4, 0.12, 0.4, S('fabric', b.pick([0x2a3a5a, 0x8a2a2a, 0xe8e4dc, 0x3a5a3a, 0x1a1a1a, 0xc4a24a]), 0.3), false, false);
  b.box(W / 2 - 0.3, 0, 6, 0.6, 2.2, 9, S('wood', 0xc49a6c, 1), true);
  F.counter(b, 0, D - 1.6, 1, 3, S('wood', 0x2a2a2a, 1));
  b.person(0, D - 0.7, pi, 'clerk');
  b.spot(0, D - 2.6, `Shop at ${v.name}`, () => ops.shop('clothing'), 1.4);
  // changing rooms
  for (let i = 0; i < 2; i++) b.box(-W / 2 + 1.2 + i * 1.4, 0, D - 0.8, 0.06, 2.2, 1.6, S('fabric', 0x6a2a3a, 0.4), true);
  b.sign(v.name.toUpperCase(), 0, 2.9, D - 0.12, 3.4, 1, '#111111', '#f4f2ee');
  F.plant(b, W / 2 - 0.8, 1.0);
}

function barber(b: Builder, v: Venue, ops: Ops): void {
  const W = 9, D = 10;
  b.room(-W / 2, 0, W / 2, D, 3.2, { floor: S('checker', 0xffffff, 1.2), wall: PLASTER(0xe8ece8), amb: amb(0x8a8a86), skirting: 0x1a1a1a, gaps: [{ side: 0, at: 0, w: 1.9, h: 2.4 }] });
  for (let z = 2; z < D; z += 2.6) b.fixture(0, z, 3.2, 'strip', 0xf4f8ff, 1.0);
  entrance(b, 0, 0, ops, true);
  for (let i = 0; i < 3; i++) {
    F.barberChair(b, W / 2 - 1.3, 3 + i * 2.2, 3);
    b.box(W / 2 - 0.06, 1.0, 3 + i * 2.2, 0.04, 1.1, 1.0, S('plain', 0xb8c8d0), false, false);
    b.box(W / 2 - 0.25, 0.8, 3 + i * 2.2, 0.4, 0.06, 1.2, S('marble', 0xf2f0ea), false, false);
  }
  F.chairRow(b, -W / 2 + 0.55, 4, 2, 4, 0x2a2a2a);
  F.coffeeTable(b, -W / 2 + 1.6, 4, 0.6, 1.0);
  b.person(W / 2 - 2.1, 5.2, -pi / 2, 'staff');
  b.spot(W / 2 - 2.2, 3, 'Sit in the chair', () => ops.shop('barber'), 1.3);
  b.sign(v.name.toUpperCase(), 0, 2.6, D - 0.12, 3, 1, '#e8e8e8', '#8a1a1a');
  // the pole
  b.cyl(-W / 2 + 0.3, 0.6, D - 0.3, 0.1, 1.2, S('plain', 0xe8e8e8), false, 12);
}

function gunstore(b: Builder, v: Venue, ops: Ops): void {
  const W = 12, D = 11;
  b.room(-W / 2, 0, W / 2, D, 3.4, { floor: S('concrete', 0x8a8a86, 3), wall: S('brick', 0xffffff, 2.4), amb: amb(0x7a756e), skirting: 0x1a1a1a, gaps: [{ side: 0, at: 0, w: 1.9, h: 2.4 }] });
  for (let x = -3; x <= 3; x += 3) for (let z = 2.5; z < D; z += 3) b.fixture(x, z, 3.4, 'strip', 0xfff2dc, 0.9);
  entrance(b, 0, 0, ops, true);
  F.gunWall(b, 0, D - 0.1, 1, W - 1.5);
  F.gunWall(b, W / 2 - 0.1, 5, 3, 6);
  F.display(b, 0, D - 2.3, 0, 6, [0x1a1c20, 0x3a3d42, 0xc8b878]);
  b.person(0, D - 1.2, pi, 'clerk');
  b.spot(0, D - 3.4, `Browse ${v.name}`, () => ops.shop('weapons'), 1.6);
  F.palletRack(b, -W / 2 + 0.8, 5, 6, 'z', 2);
  b.sign('NO LOITERING · CASH ONLY', -2.5, 2.7, 0.12, 2.6, 0, '#ffd23a', '#1a1a1a');
  b.sign(v.name.toUpperCase(), 0, 2.95, D - 0.14, 3.4, 1, '#ff7a59', '#141210');
}

function food(b: Builder, v: Venue, ops: Ops): void {
  const sub = v.sub ?? 'diner';
  const W = 14, D = 12;
  const floor = sub === 'coffee' ? S('parquet', 0xffffff, 2.4) : sub === 'diner' || sub === 'diner2' ? S('checker', 0xffffff, 1.2) : S('tile', 0xe8d8c0, 0.8);
  const wall = sub === 'coffee' ? S('brick', 0xffffff, 2.4) : PLASTER(sub === 'chicken' ? 0xf2d8a8 : sub === 'taco' || sub === 'cantina' ? 0xf2c88a : 0xf2f0ea);
  b.room(-W / 2, 0, W / 2, D, 3.4, { floor, wall, amb: amb(0x8a8884), skirting: 0x3a2a1c, gaps: [{ side: 0, at: 0, w: 1.9, h: 2.4 }] });
  entrance(b, 0, 0, ops, true);
  for (let x = -4; x <= 4; x += 4) for (let z = 2.5; z < D - 2; z += 3) b.fixture(x, z, 3.4, sub === 'coffee' ? 'pendant' : 'round', 0xffe4c0, 1.0);
  // counter across the back, kitchen behind it
  F.counter(b, 1.5, D - 2.6, 0, 7, S('panel', sub === 'chicken' ? 0xc42a2a : 0x8a1a1a, 1));
  b.box(1.5, 0, D - 0.5, 9, 1.0, 0.8, S('metal', 0xb8bcc0), true);
  b.glow(1.5, 1.0, D - 0.5, 8, 0.04, 0.6, 0xff9a4a, 0.6);
  b.box(1.5, 1.6, D - 0.35, 9, 0.6, 0.5, S('metal', 0x9aa0a8), false, false);
  F.menuBoard(b, 1.5, 2.95, D - 0.16, 4.2, 1, v.name.toUpperCase());
  for (let i = 0; i < 3; i++) b.glow(-1.0 + i * 2.5, 2.25, D - 0.13, 2.2, 0.55, 0.02, b.pick([0xffe8b0, 0xfff0d0, 0xffd890]), 0.7);
  b.person(1.5, D - 1.7, pi, 'clerk');
  b.person(3.8, D - 0.95, pi * 0.8, 'staff');
  b.spot(1.5, D - 3.6, 'Order food', () => ops.shop('food'), 1.5);
  // seating
  if (sub === 'diner' || sub === 'diner2' || sub === 'burger') {
    for (let i = 0; i < 4; i++) F.booth(b, -W / 2 + 0.9, 2.3 + i * 2.1, 2, b.pick([0x8a1a1a, 0x1a4a8a, 0x2a6a4a]));
    for (let i = 0; i < 5; i++) F.stool(b, -1 + i * 1.0, D - 3.4, 0.75, 0x8a1a1a);
  } else {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const tx = -W / 2 + 2 + i * 2.6, tz = 2.5 + j * 3;
      F.roundTable(b, tx, tz, 0.4);
      F.chair(b, tx, tz - 0.65, 0); F.chair(b, tx, tz + 0.65, 1);
    }
  }
  if (b.r() < 0.7) b.person(-W / 2 + 0.9, 4.4, pi / 2, 'patron', 'sit');
  b.person(-W / 2 + 2, 2.5, 0, 'patron', 'sit');
  F.plant(b, W / 2 - 0.6, 0.8);
  F.vending(b, W / 2 - 0.5, 4, 3, 0x2a5aa8);
}

function bar(b: Builder, v: Venue, ops: Ops): void {
  const W = 13, D = 11;
  b.room(-W / 2, 0, W / 2, D, 3.2, { floor: S('wood', 0xffffff, 1.6), wall: S('panel', 0xe8d8c0, 1.4), ceil: S('plaster', 0x5a5048, 2), amb: amb(0x7a6a5c), skirting: 0x1a120c, gaps: [{ side: 0, at: -3, w: 1.6, h: 2.3 }] });
  entrance(b, -3, 0, ops);
  F.backBar(b, 1, D - 0.3, 1, 7);
  F.counter(b, 1, D - 2.2, 1, 7, S('wood', 0x3a2418, 1), false);
  for (let i = 0; i < 7; i++) F.stool(b, -2 + i * 1.0, D - 3.2, 0.78, 0x2a1a12);
  for (let i = 0; i < 3; i++) b.fixture(-2 + i * 3, D - 2.6, 3.2, 'pendant', 0xffc488, 1.1);
  for (let i = 0; i < 2; i++) b.fixture(-3 + i * 5, 3, 3.2, 'round', 0xffc488, 0.7);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const tx = -4 + i * 3.4, tz = 2.4 + j * 2.6; F.roundTable(b, tx, tz, 0.4, S('wood', 0x2a1a12, 1)); F.stool(b, tx - 0.6, tz, 0.5, 0x2a1a12); F.stool(b, tx + 0.6, tz, 0.5, 0x2a1a12); b.light(tx, 1.4, tz, 0xff9a5a, 0.35, 2, false); }
  b.box(W / 2 - 0.5, 0, 3.2, 1.0, 0.8, 2.2, S('fabric', 0x1a5a2a, 0.5), true); // pool table
  b.box(W / 2 - 0.5, 0.8, 3.2, 1.2, 0.08, 2.4, S('wood', 0x3a2418, 1), false, false);
  b.light(W / 2 - 0.5, 2.2, 3.2, 0xfff0d0, 0.7, 2.4);
  b.glow(W / 2 - 0.5, 2.3, 3.2, 0.3, 0.1, 1.6, 0xfff0d0, 1.4);
  b.sign(v.name.toUpperCase(), 1, 2.75, D - 0.1, 3.4, 1, '#ff4a8a', '#140a10');
  b.glow(-W / 2 + 0.12, 1.5, 6, 0.04, 0.5, 2.2, 0x3ae8ff, 1.6);
  b.light(-W / 2 + 0.8, 1.8, 6, 0x3ae8ff, 0.4, 2.5, false);
  b.person(1.2, D - 1.2, pi, 'staff');
  b.person(-0.5, D - 3.3, 0, 'patron', 'sit');
  b.person(2.8, D - 3.3, 0, 'patron', 'sit');
  b.spot(1, D - 3.4, 'Buy a drink ($8)', () => ops.drink(8), 1.4);
  F.vending(b, -W / 2 + 0.5, D - 1, 2, 0x1a1a1a);
}

// ================================================================================================ homes

/** Fill a living room / bedroom / kitchen set inside the given rectangles. */
function livingRoom(b: Builder, x0: number, z0: number, x1: number, z1: number, rich = false): void {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  F.rug(b, cx, cz, Math.min(3, x1 - x0 - 1.4), Math.min(2.4, z1 - z0 - 1.4), b.pick(FABRIC));
  F.sofa(b, cx, z1 - 0.6, 1, b.pick(FABRIC), Math.min(2.4, x1 - x0 - 1.5));
  F.coffeeTable(b, cx, cz + 0.1);
  F.tv(b, cx, z0 + 0.35, 0, rich ? 1.7 : 1.2);
  if (x1 - x0 > 4.5) F.armchair(b, x0 + 0.7, cz, 2, b.pick(FABRIC));
  F.floorLamp(b, x1 - 0.45, z1 - 0.45);
  F.plant(b, x0 + 0.5, z0 + 0.5, rich);
  if (x1 - x0 > 4) F.bookcase(b, x1 - 0.25, cz - 0.5, 3, 1.0);
}

function bedroom(b: Builder, x0: number, z0: number, x1: number, z1: number, rich = false): void {
  const cx = (x0 + x1) / 2;
  F.bed(b, cx, z1 - 1.15, 1, rich ? 1.9 : 1.5, b.pick(FABRIC));
  F.nightstand(b, cx - (rich ? 1.3 : 1.1), z1 - 0.3);
  F.nightstand(b, cx + (rich ? 1.3 : 1.1), z1 - 0.3, rich);
  F.wardrobe(b, x0 + 0.35, z0 + 1.0, 2, 1.4);
  if (x1 - x0 > 3.6) F.dresser(b, x1 - 0.3, z0 + 1.2, 3);
  F.rug(b, cx, z1 - 2.4, 2, 1.2, b.pick(FABRIC));
}

function bathroom(b: Builder, x0: number, z0: number, x1: number, z1: number): void {
  F.toilet(b, x0 + 0.45, z1 - 0.45, 1);
  F.basin(b, x1 - 0.35, z1 - 0.6, 3);
  if (x1 - x0 > 2.4) F.bathtub(b, (x0 + x1) / 2, z0 + 0.5, 'x'); else F.shower(b, x0 + 0.55, z0 + 0.55);
}

/** Kitchen run against the left (x0) wall with the fridge at its end, and a table out in the room. */
function kitchenArea(b: Builder, x0: number, z0: number, x1: number, z1: number): void {
  const len = Math.min(3.6, z1 - z0 - 1.1);
  if (len > 1.2) {
    F.kitchen(b, x0 + 0.32, z1 - 0.15 - len / 2, 2, len);
    F.fridge(b, x0 + 0.38, z1 - 0.55 - len, 2);
  }
  if (x1 - x0 > 2.8) {
    const tx = Math.min(x1 - 0.9, x0 + 2.3), tz = (z0 + z1) / 2;
    F.table(b, tx, tz, 0.85, 1.3);
    F.chair(b, tx - 0.6, tz - 0.35, 2); F.chair(b, tx - 0.6, tz + 0.35, 2);
    F.chair(b, tx + 0.6, tz - 0.35, 3); F.chair(b, tx + 0.6, tz + 0.35, 3);
  }
}

/** Residents and the things worth taking. `home` is the seed that decides who is in. */
function residents(b: Builder, v: Venue, ops: Ops, lounge: [number, number], bedAt: [number, number], loot: [number, number, string, number][]): void {
  const who = ops.owned ? 'away' : ops.occupied(v.seed);
  if (who === 'awake') b.person(lounge[0], lounge[1], b.r() * 6, 'resident', b.r() < 0.5 ? 'sit' : '');
  else if (who === 'asleep') b.person(bedAt[0], bedAt[1], 0, 'sleeper');
  if (ops.owned) return;
  for (const [x, z, what, amt] of loot) {
    const s = b.spot(x, z, `Take ${what}`, () => { s.used = true; ops.loot(amt, what); }, 1.0, 1.2);
  }
}

/** An apartment or condo: living room + kitchen, a bedroom and a bathroom off a short hall. */
function unit(b: Builder, v: Venue, ops: Ops, rich = false): void {
  const W = rich ? 14 : 10, D = rich ? 11 : 8.5;
  const wall = PLASTER(b.pick(PAINT));
  const floor = rich ? S('marble', 0xf2f0ea, 2) : S(b.pick(['wood', 'parquet', 'carpet'] as const), b.r() < 0.5 ? 0xffffff : 0xd8d0c4, 1.6);
  b.day = dayLight(ops.hour);
  const split = rich ? 8 : 5.6;
  b.room(-W / 2, 0, W / 2, D, rich ? 3.2 : 2.7, { floor, wall, amb: amb(0x8a8884), skirting: 0xf2f0ea, gaps: [{ side: 0, at: -W / 2 + 1.4, w: 1.0, h: 2.15 }] });
  // the living space on the left, bedroom + bath on the right
  const bx = -W / 2 + split;
  b.partition('z', bx, 0, D, rich ? 3.2 : 2.7, wall, { at: 1.2, w: 0.95 });
  b.beginZone(bx, 0, W / 2, D * 0.45, amb(0x8a8884));
  b.partition('x', D * 0.45, bx, W / 2, rich ? 3.2 : 2.7, wall, { at: bx + 0.9, w: 0.85 });
  b.beginZone(bx, D * 0.45, W / 2, D, amb(0x8a8884));
  const H = rich ? 3.2 : 2.7;
  // lights per room
  b.zone = 0; b.fixture(-W / 2 + split / 2, D / 2 + 0.6, H, 'round', 0xfff0dc, 1.0); b.fixture(-W / 2 + split / 2, 1.8, H, 'round', 0xfff0dc, 0.7);
  b.window(-W / 2 + split / 2, 0.9, D - 0.11, 1.8, 1.4, 1);
  b.zone = 1; b.fixture((bx + W / 2) / 2, D * 0.22, H, 'round', 0xf4f8ff, 0.9);
  b.zone = 2; b.fixture((bx + W / 2) / 2, D * 0.72, H, 'round', 0xffe0c0, 0.8);
  b.window(W / 2 - 0.11, 1.0, D * 0.75, 1.4, 1.2, 3);
  // furniture
  b.zone = 0;
  livingRoom(b, -W / 2 + 0.3, D * 0.42, bx - 0.2, D - 0.2, rich);
  kitchenArea(b, -W / 2 + 0.3, 0.2, bx - 0.2, D * 0.42);
  bathroom(b, bx + 0.15, 0.15, W / 2 - 0.15, D * 0.45 - 0.15);
  bedroom(b, bx + 0.15, D * 0.45 + 0.15, W / 2 - 0.15, D - 0.15, rich);
  b.picture(-W / 2 + 0.13, 1.6, D * 0.7, 0.8, 2);
  b.picture(bx + 0.1, 1.6, D * 0.75, 0.6, 2);
  // the front door
  F.doorLeaf(b, -W / 2 + 1.4, 0.05, 0, 'EXIT', 0x5a3e28);
  b.entry = { x: -W / 2 + 1.4, z: 1.2, yaw: pi };
  b.spot(-W / 2 + 1.4, 0.5, 'Leave', () => ops.exit(), 0.9);
  const bedX = (bx + W / 2) / 2, bedZ = D - 1.4;
  if (ops.owned) {
    b.spot(bedX, bedZ - 1.4, 'Sleep / save', () => ops.sleep(), 1.2);
    b.spot(bx + 0.9, D * 0.45 + 1.0, 'Wardrobe', () => ops.wardrobe(), 0.9);
    b.spot(-W / 2 + split / 2, D * 0.42 + 1.2, 'Property menu', () => ops.property(), 1.0);
    F.desk(b, -W / 2 + 0.75, D * 0.62, 2, true, 1.1);
    b.spot(-W / 2 + 1.5, D * 0.62, 'Use the computer', () => ops.web(), 0.9);
  } else residents(b, v, ops, [-W / 2 + split / 2, D - 1.6], [bedX, bedZ], [
    [-W / 2 + split / 2, D * 0.42 + 0.9, 'the TV', 180 + Math.floor(b.r() * 140)],
    [bx + 0.8, D - 0.6, 'the jewellery box', 120 + Math.floor(b.r() * 380)],
    [-W / 2 + 1.0, 0.8 + 1.2, 'cash from the drawer', 30 + Math.floor(b.r() * 150)],
  ]);
}

/** A detached house: hall, living room, kitchen-diner, two bedrooms, bathroom. */
function house(b: Builder, v: Venue, ops: Ops, size: 'small' | 'house' | 'mansion' = 'house'): void {
  const big = size === 'mansion', small = size === 'small';
  const W = big ? 20 : small ? 9 : 13, D = big ? 15 : small ? 6.5 : 10;
  const H = big ? 3.6 : small ? 2.4 : 2.7;
  b.day = dayLight(ops.hour);
  const wall = small && v.kind === 'cabin' ? S('wood', 0xffffff, 1.6) : PLASTER(b.pick(PAINT));
  const floor = big ? S('marble', 0xf2f0ea, 2) : S(b.pick(['wood', 'parquet'] as const), 0xffffff, 1.8);
  b.room(-W / 2, 0, W / 2, D, H, { floor, wall, amb: amb(0x8a8884), skirting: 0xf2f0ea, gaps: [{ side: 0, at: 0, w: 1.0, h: 2.15 }] });
  if (small) {
    // one room plus a bathroom corner
    b.fixture(-W / 4, D / 2, H, 'bulb', 0xffd9a8, 0.9);
    b.fixture(W / 4, D / 2, H, 'bulb', 0xffd9a8, 0.8);
    b.window(-W / 4, 0.9, D - 0.11, 1.2, 1.0, 1);
    b.partition('z', W / 2 - 2.2, D - 2.2, D, H, wall, { at: D - 1.1, w: 0.01 });
    b.partition('x', D - 2.2, W / 2 - 2.2, W / 2, H, wall, { at: W / 2 - 1.1, w: 0.8 });
    F.bed(b, W / 2 - 3.3, D - 1.2, 1, 1.3, b.pick(FABRIC));
    F.sofa(b, -W / 2 + 1.6, D - 0.6, 1, b.pick(FABRIC), 1.8);
    F.tv(b, -W / 2 + 1.6, 2.6, 0, 0.9);
    F.kitchen(b, -W / 2 + 1.6, 0.35, 0, 2.4);
    F.toilet(b, W / 2 - 0.5, D - 0.5, 3);
    F.table(b, 1.2, 2.2, 1.0, 0.7);
    F.chair(b, 1.2, 1.6, 0);
    if (v.kind === 'cabin') { b.box(-W / 2 + 0.6, 0, D / 2 + 0.6, 0.9, 0.9, 0.7, S('metal', 0x1a1a1a), true); b.glow(-W / 2 + 0.6, 0.3, D / 2 + 0.95, 0.4, 0.3, 0.02, 0xff7a2a, 1.6); b.light(-W / 2 + 1.2, 0.6, D / 2 + 0.6, 0xff8a3a, 0.8, 3, false); }
    entranceDoor(b, 0, ops);
    if (ops.owned) { b.spot(W / 2 - 3.3, D - 2.6, 'Sleep / save', () => ops.sleep(), 1.2); b.spot(-W / 2 + 1.6, D - 1.6, 'Property menu', () => ops.property(), 1.2); b.spot(1.2, 3.2, 'Wardrobe', () => ops.wardrobe(), 0.9); b.spot(1.9, 2.2, 'Use the laptop', () => ops.web(), 0.7); b.box(1.5, 0.75, 2.2, 0.32, 0.02, 0.24, S('metal', 0x2a2d33)); b.glow(1.5, 0.77, 2.08, 0.3, 0.2, 0.01, 0x9ac4ff, 0.8); }
    else residents(b, v, ops, [-W / 2 + 1.6, D - 1.3], [W / 2 - 3.3, D - 1.2], [[-W / 2 + 1.6, 3.4, 'the TV', 120 + Math.floor(b.r() * 100)], [1.2, 3.0, 'cash from the table', 20 + Math.floor(b.r() * 120)]]);
    return;
  }
  // rooms: left column living (front) + kitchen (back); right column bedrooms + bath; a hall in the middle
  const hall = big ? 3 : 1.8;
  const lx1 = -hall / 2, rx0 = hall / 2;
  const mid = D * 0.5;
  b.partition('z', lx1, 0.9, D, H, wall, { at: mid * 0.5, w: 1.0 });
  b.partition('z', rx0, 0.9, D, H, wall, { at: mid * 0.5, w: 1.0 });
  b.partition('x', mid, -W / 2, lx1, H, wall, { at: (lx1 - W / 2) / 2 + 1.2, w: 1.2 });
  b.partition('x', mid, rx0, W / 2, H, wall, { at: rx0 + 1.0, w: 0.9 });
  b.partition('z', (rx0 + W / 2) / 2 + 0.6, mid, D, H, wall, { at: mid + 0.9, w: 0.85 });
  // zones (rooms) and their lights
  const Z = (x0: number, z0: number, x1: number, z1: number, lights: [number, number][], kind: 'round' | 'pendant' | 'panel' = 'round', col = 0xfff0dc, win?: [number, number, number, 0 | 1 | 2 | 3]): void => {
    b.beginZone(x0, z0, x1, z1, amb(0x8a8884));
    for (const [x, z] of lights) b.fixture(x, z, H, kind, col, big ? 1.1 : 0.95);
    if (win) b.window(win[0], 0.9, win[1], win[2], 1.4, win[3]);
  };
  Z(-W / 2, 0, lx1, mid, [[(lx1 - W / 2) / 2, mid / 2]], 'round', 0xfff0dc, [-W / 2 + 0.11, mid / 2, 1.6, 2]);
  Z(-W / 2, mid, lx1, D, [[(lx1 - W / 2) / 2, (mid + D) / 2]], 'pendant', 0xfff0dc, [(lx1 - W / 2) / 2, D - 0.11, 1.6, 1]);
  Z(lx1, 0, rx0, D, [[0, 2], [0, D - 2]], 'round');
  Z(rx0, 0, W / 2, mid, [[(rx0 + W / 2) / 2, mid / 2]], 'round', 0xffe0c0, [W / 2 - 0.11, mid / 2, 1.4, 3]);
  const bx1 = (rx0 + W / 2) / 2 + 0.6;
  Z(rx0, mid, bx1, D, [[(rx0 + bx1) / 2, (mid + D) / 2]], 'round', 0xf4f8ff);
  Z(bx1, mid, W / 2, D, [[(bx1 + W / 2) / 2, (mid + D) / 2]], 'round', 0xffe0c0, [W / 2 - 0.11, (mid + D) / 2, 1.2, 3]);
  livingRoom(b, -W / 2 + 0.2, 0.25, lx1 - 0.2, mid - 0.2, big);
  kitchenArea(b, -W / 2 + 0.2, mid + 0.2, lx1 - 0.2, D - 0.2);
  bedroom(b, rx0 + 0.2, 0.2, W / 2 - 0.2, mid - 0.2, big);
  bathroom(b, rx0 + 0.15, mid + 0.15, bx1 - 0.15, D - 0.15);
  F.bed(b, (bx1 + W / 2) / 2, D - 1.2, 1, 1.0, b.pick(FABRIC));
  F.desk(b, W / 2 - 0.6, mid + 1.2, 3, b.r() < 0.6, 1.0);
  b.picture(0, 1.6, D - 0.11, 0.9, 1);
  F.plant(b, -hall / 2 + 0.4, D - 0.4);
  F.rug(b, 0, D / 2, hall - 0.5, D - 2.5, b.pick(FABRIC));
  if (big) F.bookcase(b, lx1 - 0.25, mid / 2, 3, 1.6);
  entranceDoor(b, 0, ops);
  const bedX = (rx0 + W / 2) / 2, bedZ = 1.4;
  if (ops.owned) {
    b.spot(bedX, mid - 2.4, 'Sleep / save', () => ops.sleep(), 1.2);
    b.spot(rx0 + 0.9, 1.4, 'Wardrobe', () => ops.wardrobe(), 0.9);
    b.spot((lx1 - W / 2) / 2, mid - 1.4, 'Property menu', () => ops.property(), 1.2);
    b.spot(W / 2 - 1.2, mid + 1.2, 'Use the computer', () => ops.web(), 0.9);
  } else residents(b, v, ops, [(lx1 - W / 2) / 2, mid - 1.0], [bedX, bedZ], [
    [(lx1 - W / 2) / 2, 1.2, 'the TV', 200 + Math.floor(b.r() * 200)],
    [W / 2 - 0.9, mid - 0.8, 'the jewellery box', 150 + Math.floor(b.r() * (big ? 1600 : 400))],
    [W / 2 - 1.2, mid + 1.2, 'the laptop', 160 + Math.floor(b.r() * 220)],
    ...(big ? [[(lx1 - W / 2) / 2, D - 1.8, 'the silverware', 400 + Math.floor(b.r() * 800)] as [number, number, string, number]] : []),
  ]);
}

function entranceDoor(b: Builder, x: number, ops: Ops): void {
  F.doorLeaf(b, x, 0.05, 0, 'EXIT', 0x5a3e28);
  b.entry = { x, z: 1.2, yaw: pi };
  b.spot(x, 0.5, 'Leave', () => ops.exit(), 0.9);
}

function dayLight(h: number): number {
  return Math.max(0, Math.min(1, (h - 6) / 1.5)) * Math.max(0, Math.min(1, (19.5 - h) / 1.5));
}

// ================================================================================================ apartments, hotels, motels

function lobby(b: Builder, v: Venue, ops: Ops, hotel: boolean): void {
  const W = hotel ? 16 : 10, D = hotel ? 13 : 9;
  b.day = dayLight(ops.hour);
  b.room(-W / 2, 0, W / 2, D, hotel ? 4.4 : 3, { floor: hotel ? S('marble', 0xf2ece0, 2.4) : S('tile', 0xd8d0c0, 0.8), wall: hotel ? S('panel', 0xffffff, 1.8) : PLASTER(b.pick(PAINT)), amb: amb(0x8a8070), skirting: 0x2a2a2a, gaps: [{ side: 0, at: 0, w: 1.9, h: 2.4 }] });
  entrance(b, 0, 0, ops, true);
  for (let x = -W / 2 + 2.5; x < W / 2 - 1; x += 3.5) for (let z = 2.5; z < D - 1; z += 3.5) b.fixture(x, z, hotel ? 4.4 : 3, hotel ? 'pendant' : 'round', 0xfff0dc, hotel ? 1.2 : 0.9);
  // elevators on the back wall
  const n = hotel ? 2 : 1;
  for (let i = 0; i < n; i++) F.elevator(b, (i - (n - 1) / 2) * 2.4 + (hotel ? 3 : 2), D - 0.06, 1);
  const floors = Math.max(2, v.floors);
  if (hotel) {
    F.reception(b, -W / 2 + 3.2, D - 3, 0, 4.2);
    b.person(-W / 2 + 3.2, D - 2.2, pi, 'clerk');
    const price = 90 + (v.seed % 5) * 30;
    const fl = 2 + (v.seed % Math.max(1, floors - 2));
    b.spot(-W / 2 + 3.2, D - 4.2, ops.key(v) ? 'Your room is ready (elevator)' : `Rent a room ($${price})`, () => { if (!ops.key(v)) ops.rent(price, { ...v, level: 'room', floor: fl, unit: fl * 100 + 1 + (v.seed % 10) }); }, 1.4);
    b.sign(v.name.toUpperCase(), -W / 2 + 3.2, 3.2, D - 0.12, 3.6, 1, '#e8d8a8', '#1a1612');
    F.sofa(b, W / 2 - 1, 4, 3, b.pick(FABRIC), 2.2); F.sofa(b, W / 2 - 3.6, 4, 2, b.pick(FABRIC), 2.2);
    F.coffeeTable(b, W / 2 - 2.3, 4, 0.7, 1.1);
    F.plant(b, -W / 2 + 0.7, 0.8); F.plant(b, W / 2 - 0.7, 0.8); F.plant(b, W / 2 - 0.7, D - 0.8);
    F.rug(b, 0, D / 2, 5, 4, 0x6a1a2a);
    b.person(W / 2 - 1.1, 4.8, -pi / 2, 'patron', 'sit');
  } else {
    F.mailboxes(b, -W / 2 + 0.07, 3.2, 2, 15);
    F.plant(b, W / 2 - 0.6, 0.8, false);
    b.box(W / 2 - 0.3, 0, D / 2, 0.5, 0.45, 2, S('wood', 0x6b4a30), true);
    b.sign(v.name.toUpperCase(), 0, 2.5, D - 0.12, 2.4, 1, '#2a2010', '#d8c890');
    if (b.r() < 0.5) b.person(-W / 2 + 1.2, 4.6, -pi / 2, 'resident');
  }
  const ex = hotel ? 3 : 2;
  if (v.floor === -1) b.entry = { x: ex, z: D - 1.7, yaw: 0 };
  link(b, ex, D - 1.0, hotel ? 'Elevator (guests only)' : `Elevator · floor ${2 + (v.seed % Math.max(1, floors - 1))}`, () => {
    if (hotel) { const k = ops.key(v); if (k) ops.go({ ...k, level: 'hall' }); else ops.say('You need a room key. Ask at the desk.'); return; }
    ops.go({ ...v, level: 'hall', floor: 2 + (v.seed % Math.max(1, floors - 1)) });
  });
}

function hallway(b: Builder, v: Venue, ops: Ops, hotel: boolean): void {
  const L = 18, Wd = 2.4;
  b.room(-L / 2, 0, L / 2, Wd, 2.7, { floor: S('carpet', hotel ? 0x8a2a3a : b.pick([0x6a6a62, 0x5a4a3a, 0x3a4a5a]), 1.2), wall: hotel ? S('wallpaper', 0xf2e6d0, 1.2) : PLASTER(b.pick(PAINT)), amb: amb(0x7a7268), skirting: 0x3a2a1c });
  for (let x = -L / 2 + 2; x < L / 2; x += 3.2) b.fixture(x, Wd / 2, 2.7, hotel ? 'round' : 'panel', 0xfff0dc, 0.8);
  // elevator at the -x end
  F.elevator(b, -L / 2 + 0.06, Wd / 2, 2);
  b.entry = { x: -L / 2 + 1.2, z: Wd / 2, yaw: -pi / 2 };
  link(b, -L / 2 + 0.6, Wd / 2, 'Elevator · lobby', () => ops.go({ ...v, level: 'lobby', floor: -1 }));
  const fl = v.floor ?? 2;
  for (let i = 0; i < 5; i++) {
    for (const side of [0, 1] as const) {
      const x = -L / 2 + 3 + i * 3.2 + side * 1.6;
      const z = side === 0 ? 0.05 : Wd - 0.05;
      const n = fl * 100 + i * 2 + side + 1;
      F.doorLeaf(b, x, z, side === 0 ? 0 : 1, `${n}`, hotel ? 0x4a2a1c : b.pick(WOOD));
      const mine = hotel && n === (v.unit ?? -1);
      b.spot(x, side === 0 ? 0.7 : Wd - 0.7, mine ? `Room ${n} (yours)` : hotel ? `Knock on room ${n}` : `Break into apartment ${n}`, () => {
        if (mine) ops.go({ ...v, level: 'room', unit: n });
        else if (hotel) ops.knock();
        else ops.breakIn({ ...v, level: 'unit', unit: n, seed: (v.seed ^ (n * 2654435761)) >>> 0 });
      }, 0.75, hotel ? undefined : 1.8);
    }
  }
  b.picture(L / 2 - 0.12, 1.6, Wd / 2, 0.7, 3);
  F.plant(b, L / 2 - 0.5, 0.45, false);
}

function hotelRoom(b: Builder, v: Venue, ops: Ops, motel: boolean): void {
  const W = motel ? 5 : 6, D = motel ? 7 : 8;
  b.day = dayLight(ops.hour);
  b.room(-W / 2, 0, W / 2, D, 2.7, { floor: S('carpet', motel ? b.pick([0x6a5a3a, 0x4a5a6a, 0x7a4a3a]) : 0x8a7a6a, 1), wall: motel ? PLASTER(0xd8c8a8) : S('wallpaper', 0xf2e6d0, 1.2), amb: amb(0x8a7a68), skirting: 0x3a2a1c, gaps: [{ side: 0, at: -W / 2 + 0.9, w: 0.95, h: 2.15 }] });
  F.doorLeaf(b, -W / 2 + 0.9, 0.05, 0, `${v.unit ?? 12}`, motel ? 0x2a6a7a : 0x4a2a1c);
  b.entry = { x: -W / 2 + 0.9, z: 1.2, yaw: pi };
  b.spot(-W / 2 + 0.9, 0.5, 'Leave the room', () => motel ? ops.exit() : ops.go({ ...v, level: 'hall' }), 0.9);
  // bathroom box in the front-right corner
  b.partition('z', W / 2 - 2.0, 0, 2.2, 2.7, PLASTER(0xf2f2ee), { at: 1.6, w: 0.8 });
  b.partition('x', 2.2, W / 2 - 2.0, W / 2, 2.7, PLASTER(0xf2f2ee));
  b.beginZone(W / 2 - 2.0, 0, W / 2, 2.2, amb(0x8a8a86));
  b.fixture(W / 2 - 1, 1.1, 2.7, 'round', 0xf4f8ff, 0.8);
  F.toilet(b, W / 2 - 0.4, 0.45, 3); F.basin(b, W / 2 - 1.6, 0.3, 0); F.shower(b, W / 2 - 0.55, 1.65);
  b.zone = 0;
  b.fixture(0, D / 2, 2.7, motel ? 'bulb' : 'round', 0xffe0b8, 0.8);
  b.window(0, 0.9, D - 0.11, 2.2, 1.4, 1);
  F.bed(b, -0.3, D - 1.3, 1, motel ? 1.4 : 1.8, b.pick(FABRIC));
  F.nightstand(b, -0.3 - (motel ? 1.0 : 1.2), D - 0.3);
  F.nightstand(b, -0.3 + (motel ? 1.0 : 1.2), D - 0.3, true);
  F.tv(b, -0.3, 2.6, 0, motel ? 0.7 : 1.1);
  F.dresser(b, W / 2 - 0.3, 3.8, 3);
  F.armchair(b, -W / 2 + 0.6, 3.2, 2, b.pick(FABRIC));
  b.picture(-0.3, 1.7, D - 0.11, 0.8, 1);
  b.spot(-0.3, D - 2.8, 'Sleep until morning', () => ops.sleep(), 1.3);
}

function motelOffice(b: Builder, v: Venue, ops: Ops): void {
  const W = 6, D = 5;
  b.room(-W / 2, 0, W / 2, D, 2.6, { floor: S('lino', 0xd8c8a8, 1.2), wall: S('panel', 0xffffff, 1.4), amb: amb(0x8a7a68), skirting: 0x3a2a1c, gaps: [{ side: 0, at: 0, w: 1.0, h: 2.15 }] });
  entrance(b, 0, 0, ops);
  b.fixture(0, 2.5, 2.6, 'strip', 0xfff2dc, 1.0);
  F.reception(b, 0, D - 1.6, 0, 3, S('panel', 0x8a6a48, 1));
  b.person(0, D - 0.8, pi, 'clerk');
  const price = 40 + (v.seed % 4) * 10;
  b.spot(0, D - 2.8, `Rent a room ($${price})`, () => ops.rent(price, { ...v, level: 'room', unit: 1 + (v.seed % 24) }), 1.3);
  b.box(W / 2 - 0.25, 1.2, D / 2, 0.06, 0.9, 1.2, S('plain', 0xd8c890), false, false); // key board
  F.chairRow(b, -W / 2 + 0.5, 2.0, 2, 2, 0x6a3a2a);
  F.vending(b, W / 2 - 0.5, 1.0, 3, 0x2a5aa8);
  b.sign(v.name.toUpperCase(), 0, 2.2, D - 0.12, 2.2, 1, '#2ad8c4', '#141818');
}

// ================================================================================================ work and public buildings

function office(b: Builder, v: Venue, ops: Ops): void {
  if (v.level === 'floor') {
    const W = 22, D = 16;
    b.day = dayLight(ops.hour);
    b.room(-W / 2, 0, W / 2, D, 2.9, { floor: S('carpet', 0x5a6068, 1), wall: PLASTER(0xe8eaec), ceil: S('ceiling', 0xf2f2f0, 1.2), amb: amb(0x8a8c8e), skirting: 0x3a3d42 });
    for (let x = -W / 2 + 2; x < W / 2; x += 3) for (let z = 2; z < D; z += 3) b.fixture(x, z, 2.9, 'panel', 0xf4f8ff, 0.85);
    for (let i = 0; i < 4; i++) b.window(-W / 2 + 3 + i * 5, 0.8, D - 0.11, 3.8, 1.8, 1);
    F.elevator(b, -W / 2 + 0.06, 2.5, 2);
    b.entry = { x: -W / 2 + 1.2, z: 2.5, yaw: -pi / 2 };
    link(b, -W / 2 + 0.6, 2.5, 'Elevator · lobby', () => ops.go({ ...v, level: 'lobby', floor: -1 }));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) F.cubicle(b, -4 + i * 2.2, 4 + j * 3.2, 0);
    // glass meeting room and the boss's office
    b.box(W / 2 - 3.5, 0, 6, 0.06, 2.6, 6, S('plain', 0xb8d4e0), true, false);
    F.table(b, W / 2 - 1.8, 6, 1.4, 3.4, S('wood', 0x3a2a1c));
    for (let k = 0; k < 3; k++) { F.officeChair(b, W / 2 - 2.8, 4.8 + k * 1.2); F.officeChair(b, W / 2 - 0.8, 4.8 + k * 1.2); }
    F.desk(b, W / 2 - 2, D - 2.5, 1, true, 2.0);
    F.bookcase(b, W / 2 - 0.25, D - 4.5, 3, 1.2);
    F.plant(b, -W / 2 + 0.6, D - 0.6); F.plant(b, 3, 0.6);
    F.vending(b, -W / 2 + 0.5, 6, 2);
    b.box(-W / 2 + 2.5, 0, D - 0.4, 1.4, 1.0, 0.6, S('metal', 0x8a8f96), true); // copier
    for (let k = 0; k < 4; k++) b.person(-4 + k * 2.2, 4.5 + (k % 2) * 3.2, pi, 'staff', 'sit');
    b.spot(-4, 2.6, 'Use a computer', () => ops.web(), 0.9);
    const s = b.spot(W / 2 - 2, D - 1.8, 'Search the desk', () => { s.used = true; ops.loot(60 + (v.seed % 240), 'petty cash'); }, 1, 1.5);
    return;
  }
  const W = 18, D = 13;
  b.room(-W / 2, 0, W / 2, D, 5, { floor: S('marble', 0xe0dcd4, 2.6), wall: S('stone', 0xe8e4dc, 2.2), amb: amb(0x8a8680), skirting: 0x2a2a2a, gaps: [{ side: 0, at: 0, w: 3, h: 2.6 }] });
  entrance(b, 0, 0, ops, true);
  for (let x = -6; x <= 6; x += 4) for (let z = 3; z < D; z += 4) b.fixture(x, z, 5, 'panel', 0xfff6e8, 1.2);
  F.reception(b, 0, 6, 0, 4.5, S('marble', 0x2a2a2a, 1));
  b.person(0, 6.7, pi, 'guard');
  for (let i = 0; i < 3; i++) F.elevator(b, -4 + i * 4, D - 0.06, 1);
  b.sign(v.name.toUpperCase(), 0, 3.6, D - 0.12, 5, 1, '#e8e8e8', '#20242a');
  F.plant(b, -W / 2 + 0.8, 1); F.plant(b, W / 2 - 0.8, 1);
  F.sofa(b, -W / 2 + 1, 6, 2, 0x2a2a2a, 2.4);
  if (v.floor === -1) b.entry = { x: 0, z: D - 1.7, yaw: 0 };
  link(b, 0, D - 1.0, 'Elevator · offices', () => ops.go({ ...v, level: 'floor', floor: 2 + (v.seed % Math.max(1, v.floors - 2)) }));
}

function gym(b: Builder, v: Venue, ops: Ops): void {
  const W = 18, D = 13;
  b.room(-W / 2, 0, W / 2, D, 3.6, { floor: S('fabric', 0x2a2d33, 0.6), wall: PLASTER(0xe8e8e4), amb: amb(0x8a8a88), skirting: 0x1a1a1a, gaps: [{ side: 0, at: 0, w: 1.9, h: 2.4 }] });
  entrance(b, 0, 0, ops, true);
  for (let x = -6; x <= 6; x += 4) for (let z = 3; z < D; z += 3.5) b.fixture(x, z, 3.6, 'strip', 0xf4f8ff, 1.0);
  for (let i = 0; i < 5; i++) F.treadmill(b, -6 + i * 1.6, D - 1.4, 1);
  for (let i = 0; i < 3; i++) F.bench(b, W / 2 - 2, 3 + i * 2.6, 3);
  b.box(-W / 2 + 0.06, 0.4, 5, 0.04, 2, 6, S('plain', 0xb8c8d0), false, false); // mirror wall
  F.reception(b, -W / 2 + 2.4, 1.8, 0, 2.6, S('plain', 0x1a1a1a));
  b.person(-W / 2 + 2.4, 2.5, pi, 'staff');
  b.person(-4.4, D - 1.4, 0, 'patron');
  b.person(W / 2 - 2, 5.6, -pi / 2, 'patron');
  b.spot(0, D - 3.2, 'Work out', () => ops.workout(), 1.6);
  b.sign(v.name.toUpperCase(), 0, 3.0, D - 0.12, 4, 1, '#ffd23a', '#141414');
}

function warehouse(b: Builder, v: Venue, ops: Ops): void {
  const W = 26, D = 22;
  b.room(-W / 2, 0, W / 2, D, 8, { floor: S('concrete', 0xa8a8a4, 4), wall: S('metal', 0xa8aeb4, 2), ceil: S('metal', 0x6a6e72, 3), amb: amb(0x6a6a68), gaps: [{ side: 0, at: 0, w: 1.2, h: 2.2 }] });
  F.doorLeaf(b, 0, 0.05, 0, 'EXIT', 0x5a6a7a);
  b.entry = { x: 0, z: 1.3, yaw: pi };
  b.spot(0, 0.6, 'Leave', () => ops.exit(), 1);
  for (let x = -9; x <= 9; x += 6) for (let z = 4; z < D; z += 6) { b.fixture(x, z, 8, 'round', 0xfff0d0, 1.0); b.light(x, 6.5, z, 0xfff0d0, 1.4, 9); }
  for (let i = 0; i < 4; i++) F.palletRack(b, -9 + i * 6, 11, 14, 'z', 3);
  F.forklift(b, 6, 3.5, 3);
  F.crates(b, -10, 3, 5);
  F.crates(b, 10, D - 3, 4);
  // site office in the corner
  b.box(-W / 2 + 3, 0, D - 2.5, 5.6, 2.8, 0.1, S('panel', 0xd8d0c0, 1.4), true);
  b.box(-W / 2 + 5.8, 0, D - 1.25, 0.1, 2.8, 2.5, S('panel', 0xd8d0c0, 1.4), true);
  F.desk(b, -W / 2 + 2, D - 1.4, 0, true, 1.2);
  b.person(4, 6, b.r() * 6, 'staff');
  const s = b.spot(-10, 4.2, 'Pry open a crate', () => { s.used = true; ops.loot(80 + (v.seed % 320), 'something from the crate'); }, 1.2, 2.0);
}

function police(b: Builder, _v: Venue, ops: Ops): void {
  const W = 16, D = 12;
  b.room(-W / 2, 0, W / 2, D, 3.4, { floor: S('lino', 0xc8ccd0, 1.2), wall: PLASTER(0xd8dce2), ceil: S('ceiling', 0xf2f2f0, 1.2), amb: amb(0x8a8c8e), skirting: 0x2a3a5a, gaps: [{ side: 0, at: 0, w: 1.9, h: 2.4 }] });
  entrance(b, 0, 0, ops, true);
  for (let x = -5; x <= 5; x += 3.3) for (let z = 2.5; z < D; z += 3) b.fixture(x, z, 3.4, 'panel', 0xf4f8ff, 0.9);
  F.reception(b, 0, 6, 0, 6, S('panel', 0x2a3a5a, 1));
  b.box(0, 1.16, 6.2, 6, 0.9, 0.04, S('plain', 0xc8dde8), false, false); // glass screen
  b.person(-1.2, 6.8, pi, 'guard');
  b.person(1.6, 7.2, pi * 0.9, 'guard');
  F.chairRow(b, -W / 2 + 0.55, 3.5, 2, 5, 0x2a3a5a);
  F.chairRow(b, W / 2 - 0.55, 3.5, 3, 5, 0x2a3a5a);
  b.sign('VALERIA POLICE DEPARTMENT', 0, 2.75, D - 0.12, 5, 1, '#ffffff', '#1a2a5a');
  b.picture(-W / 2 + 0.12, 1.7, 8, 1.0, 2);
  F.vending(b, W / 2 - 0.5, D - 1.5, 3);
  b.spot(0, 4.6, 'Talk to the desk sergeant', () => ops.say(b.pick(['Take a number. We\'ll get to you.', 'If you\'re here to confess, you\'re in luck.', 'Lost property is on Tuesdays.'])), 1.4);
}

function hospital(b: Builder, _v: Venue, ops: Ops): void {
  const W = 18, D = 13;
  b.room(-W / 2, 0, W / 2, D, 3.4, { floor: S('lino', 0xe8eef0, 1.4), wall: PLASTER(0xeef2f2), ceil: S('ceiling', 0xf6f6f4, 1.2), amb: amb(0x8e9294), skirting: 0x4a8a9a, gaps: [{ side: 0, at: 0, w: 3, h: 2.6 }] });
  entrance(b, 0, 0, ops, true);
  for (let x = -6; x <= 6; x += 3) for (let z = 2.5; z < D; z += 3) b.fixture(x, z, 3.4, 'panel', 0xf4fbff, 0.95);
  F.reception(b, 4, 6.5, 0, 5, S('plain', 0xe8eef0));
  b.person(4, 7.3, pi, 'staff');
  for (let i = 0; i < 3; i++) F.chairRow(b, -5, 3 + i * 1.6, 0, 5, 0x4a8a9a);
  b.person(-5.5, 4.6, 0, 'patron', 'sit');
  b.person(-4.4, 6.2, 0, 'patron', 'sit');
  F.hospitalBed(b, W / 2 - 1, D - 1.5, 1);
  b.box(W / 2 - 2.2, 0, D - 2.5, 0.04, 2.1, 2.6, S('fabric', 0x8ac4c8, 0.4), false, false);
  F.vending(b, -W / 2 + 0.5, D - 1, 2, 0x2a8a5a);
  b.sign('EMERGENCY · ST. AURELIA', 0, 2.75, D - 0.12, 5, 1, '#ffffff', '#c42a2a');
  b.spot(4, 5.2, 'See a doctor ($200)', () => ops.heal(200), 1.5);
}

function mall(b: Builder, v: Venue, ops: Ops): void {
  const W = 34, D = 26;
  b.day = dayLight(ops.hour);
  b.room(-W / 2, 0, W / 2, D, 9, { floor: S('marble', 0xe8e4dc, 3), wall: PLASTER(0xf2ece4), amb: amb(0x9a948c), skirting: 0x8a7a6a, gaps: [{ side: 0, at: 0, w: 3.2, h: 2.8 }] });
  entrance(b, 0, 0, ops, true);
  b.glow(0, 8.95, D / 2, 12, 0.04, 10, b.day > 0.2 ? 0xdcecff : 0x1a2030, 1); // skylight
  if (b.day > 0.2) b.light(0, 8, D / 2, 0xe8f4ff, 1.3 * b.day + 0.2, 12);
  for (let x = -12; x <= 12; x += 6) for (let z = 4; z < D; z += 7) b.fixture(x, z, 9, 'round', 0xfff4e4, 1.4);
  F.fountain(b, 0, D / 2, 2.6);
  // shopfronts along the side walls: lit windows with names
  const names = ['Threadline', 'Gem Counter', 'Sole Mates', 'Vinyl Vault', 'Galleria Toys', 'Byte Shop', 'Café Costa', 'Sunrise Optics'];
  for (let i = 0; i < 4; i++) for (const side of [0, 1]) {
    const z = 4 + i * 5.6, x = side === 0 ? -W / 2 + 0.12 : W / 2 - 0.12;
    b.glow(x, 0.2, z, 0.04, 2.6, 4.2, b.pick([0xfff2dc, 0xf2f6ff, 0xfff0dc]), 0.75);
    b.box(x + (side === 0 ? 0.1 : -0.1), 2.8, z, 0.2, 0.7, 4.6, S('plain', 0x2a2d33), false, false);
    b.sign(names[(i * 2 + side) % names.length]!.toUpperCase(), x + (side === 0 ? 0.22 : -0.22), 3.15, z, 3.2, side === 0 ? 2 : 3, '#ffffff', '#2a2d33');
    b.light(x + (side === 0 ? 1.2 : -1.2), 1.6, z, 0xfff0d8, 0.6, 4, false);
  }
  // mezzanine walkway along the back
  b.slab(-W / 2, D - 4, W / 2, D, 4.5, 0.3, S('marble', 0xd8d4cc, 2), false);
  b.box(0, 4.8, D - 4, W, 1.0, 0.06, S('plain', 0xc8dde6), false, false);
  for (let x = -14; x <= 14; x += 7) b.cyl(x, 0, D - 4, 0.3, 4.5, S('marble', 0xe8e4dc), true, 16);
  for (let i = 0; i < 6; i++) F.plant(b, -12 + i * 4.8, 3.5);
  for (let i = 0; i < 4; i++) b.box(-8 + i * 5.3, 0, D / 2 + 4.5, 2.2, 0.45, 0.6, S('wood', 0x8a6040), true);
  b.spot(-W / 2 + 1.4, 4, 'Shop at Threadline', () => ops.shop('clothing'), 1.6);
  b.spot(W / 2 - 1.4, 4 + 5.6 * 3, 'Food court', () => ops.shop('food'), 1.6);
  b.spot(W / 2 - 1.4, 4, 'Use ATM', () => ops.atm(), 1.2);
  F.atm(b, W / 2 - 0.6, 5.6, 3);
  for (let k = 0; k < 6; k++) b.person(-10 + k * 4, 6 + (k % 3) * 4, b.r() * 6, 'patron');
  void v;
}

// ================================================================================================ dispatch

/** Build the set for a venue into the builder. */
export function layout(b: Builder, v: Venue, ops: Ops): void {
  switch (v.kind) {
    case 'store': return store(b, v, ops);
    case 'clothing': return clothing(b, v, ops);
    case 'barber': return barber(b, v, ops);
    case 'weapons': return gunstore(b, v, ops);
    case 'food': case 'diner': return food(b, v, ops);
    case 'bar': return bar(b, v, ops);
    case 'apartments':
      if (v.level === 'hall') return hallway(b, v, ops, false);
      if (v.level === 'unit') return unit(b, v, ops);
      return lobby(b, v, ops, false);
    case 'hotel':
      if (v.level === 'hall') return hallway(b, v, ops, true);
      if (v.level === 'room') return hotelRoom(b, v, ops, false);
      return lobby(b, v, ops, true);
    case 'motel':
      if (v.level === 'room') return hotelRoom(b, v, ops, true);
      return motelOffice(b, v, ops);
    case 'house': return house(b, v, ops, 'house');
    case 'mansion': return house(b, v, ops, 'mansion');
    case 'cabin': case 'trailer': return house(b, v, ops, 'small');
    case 'penthouse': return unit(b, v, ops, true);
    case 'office': return office(b, v, ops);
    case 'gym': return gym(b, v, ops);
    case 'warehouse': return warehouse(b, v, ops);
    case 'police': return police(b, v, ops);
    case 'hospital': return hospital(b, v, ops);
    case 'mall': return mall(b, v, ops);
    default: return house(b, v, ops, 'house');
  }
}

/** A name for the building on its sign and in the prompt. */
export function venueName(kind: string, seed: number): string {
  const pick = <T>(a: readonly T[], k = 0): T => a[(seed >>> k) % a.length]!;
  switch (kind) {
    case 'hotel': return `${pick(['The Meridian', 'Hotel Valeria', 'The Palmetto', 'Casa Marina', 'The Lantern', 'Sunset Grand', 'Hotel Aurelia', 'The Crown'])}`;
    case 'motel': return `${pick(['Sea Breeze', 'Starlite', 'Palm Court', 'Driftwood', 'Blue Lagoon', 'Desert Rose', 'Sandpiper'])} Motel`;
    case 'apartments': return `${pick(['Harbor', 'Marlow', 'Orchard', 'Palmetto', 'Kestrel', 'Bayview', 'Grand', 'Crown'], 3)} ${pick(['Apartments', 'Court', 'House', 'Towers', 'Place'], 7)}`;
    case 'office': return `${pick(['Meridian', 'Halcyon', 'Northgate', 'Valeria', 'Bayline', 'Corsair', 'Atlas'])} ${pick(['Plaza', 'Tower', 'Centre', 'Building'], 5)}`;
    case 'bar': return pick(['The Rusty Anchor', 'Neon Palms', 'Last Call', 'The Tilted Pelican', 'Barnacle Bill\'s', 'Velvet Room', 'The Dive']);
    case 'diner': return pick(['Sunny Side Diner', 'Mel\'s Grill', 'Rosa\'s Kitchen', 'The Griddle', 'Starlight Diner', 'Coastline Café']);
    case 'gym': return pick(['Iron Coast Gym', 'Pump House', 'Valeria Fitness', 'Muscle Beach Club']);
    case 'store': return pick(['Kwik Stop', 'Corner Mart', '24/7 Deli', 'Lucky Liquor', 'Bodega Sol']);
    case 'warehouse': return pick(['Coastline Freight', 'Valeria Logistics', 'Halloran Storage', 'Pacific Imports']);
    case 'police': return 'Valeria PD';
    case 'hospital': return 'St. Aurelia Medical Center';
    case 'mall': return 'Galleria Costa';
    case 'mansion': return 'Villa';
    case 'cabin': return 'Cabin';
    case 'trailer': return 'Trailer';
    default: return 'House';
  }
}
