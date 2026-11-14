import * as THREE from 'three';
import type { Game } from '../Game';
import type { Ped } from './Pedestrians';
import { CAR_TYPES, type TrafficCar } from './Traffic';
import { VEHICLES } from '../vehicles/specs';
import type { Fire } from '../combat/Ordnance';

// ------------------------------------------------------------------------------------------------ speech bubbles

interface Bubble { sprite: THREE.Sprite; ped: Ped; t: number }

/** Words over people's heads, with a babble of voice under them. Only shown close to the player. */
export class Speech {
  private readonly bubbles: Bubble[] = [];
  said = 0;
  constructor(private readonly g: Game) {}

  say(p: Ped, text: string, secs = 2.6, loud = false): void {
    const g = this.g;
    if (!p.active) return;
    const pl = g.player?.pos;
    if (!pl || Math.hypot(p.x - pl.x, p.z - pl.z) > 34) return;
    for (let i = this.bubbles.length - 1; i >= 0; i--) if (this.bubbles[i]!.ped === p) this.drop(i);
    if (this.bubbles.length >= 7) this.drop(0);
    const cv = document.createElement('canvas');
    const c = cv.getContext('2d')!;
    const font = `600 ${loud ? 30 : 26}px Inter, system-ui, sans-serif`;
    c.font = font;
    const w = Math.min(560, Math.ceil(c.measureText(text).width) + 40);
    cv.width = w; cv.height = 64;
    c.font = font;
    c.fillStyle = loud ? 'rgba(120,14,14,0.86)' : 'rgba(10,12,18,0.78)';
    c.beginPath(); c.roundRect(2, 4, w - 4, 46, 23); c.fill();
    c.beginPath(); c.moveTo(w / 2 - 9, 49); c.lineTo(w / 2, 62); c.lineTo(w / 2 + 9, 49); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, w / 2, 28, w - 24);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    sprite.scale.set(w / 64 * 0.5, 0.5, 1);
    sprite.renderOrder = 6;
    g.world.scene.add(sprite);
    this.bubbles.push({ sprite, ped: p, t: secs });
    this.said++;
    g.audio.babble(new THREE.Vector3(p.x, p.y + 1.6, p.z), (p.seed % 1 + p.look.h - 0.9) % 1, Math.min(2.4, 0.4 + text.length * 0.05), loud);
  }

  private drop(i: number): void {
    const b = this.bubbles[i]!;
    this.g.world.scene.remove(b.sprite);
    b.sprite.material.map?.dispose();
    b.sprite.material.dispose();
    this.bubbles.splice(i, 1);
  }

  update(dt: number): void {
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]!;
      b.t -= dt;
      if (b.t <= 0 || !b.ped.active) { this.drop(i); continue; }
      const lie = b.ped.state === 'down' || b.ped.pose === 'sit' || b.ped.pose === 'kneel';
      b.sprite.position.set(b.ped.x, b.ped.y + (lie ? 1.3 : 2.15) * b.ped.look.h, b.ped.z);
      b.sprite.material.opacity = Math.min(1, b.t * 3);
    }
  }
}

// ------------------------------------------------------------------------------------------------ lines

const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;

const CHAT = [
  ['Did you see the game last night?', 'Don\'t. I lost forty bucks.'],
  ['My landlord raised the rent again.', 'Everybody\'s landlord raised the rent again.'],
  ['Crane\'s on every billboard now.', 'Man\'s face is bigger than my apartment.'],
  ['You going to the beach later?', 'If the traffic lets me.'],
  ['I swear that guy was filming us.', 'Everybody\'s filming everybody.'],
  ['They opened a new taco place on Fifth.', 'Is it better than Mama Jo\'s?', 'Nothing is better than Mama Jo\'s.'],
  ['Did you hear the sirens last night?', 'Every night. I sleep through them now.'],
  ['My cousin got a job at the port.', 'Which cousin? You have nine.'],
] as const;
const FIGHT = ['You want some?!', 'Say that again!', 'Come on then!', 'You scratched my car!', 'Back off!', 'That\'s my parking spot!'];
const CHEER = ['Wooo!', 'To us!', 'Best night ever!', 'One more round!', 'I love this city!', 'Cheers!'];
const VENDOR = ['Hot dogs! Get \'em while they\'re hot!', 'Two for five, best deal on the coast!', 'Extra onions? Extra onions.'];
const ARREST = [['Hands behind your head!', 'I didn\'t do anything, man!'], ['Stay down!', 'This is a mistake!'], ['Don\'t move!', 'I want a lawyer!']];
const TOUR = ['Get one of me by the sign!', 'The light is perfect!', 'Smile!', 'One more, one more!'];
const BUMP = ['Hey! Watch it!', 'Excuse YOU.', 'Watch where you\'re going!', 'Seriously?', 'Ow!'];
const AIMED = ['Whoa! Don\'t shoot!', 'Please, please!', 'Take whatever you want!', 'I have kids!'];
const NICE_CAR = ['Nice ride!', 'Ooh, what is that?', 'How much did that cost?', 'Now THAT is a car.'];

type SceneKind = 'chat' | 'fight' | 'drunks' | 'smoker' | 'vendor' | 'arrest' | 'tourists' | 'sitters';
interface Scene { kind: SceneKind; x: number; z: number; peds: Ped[]; t: number; talkT: number; line: number; props: THREE.Object3D[]; car: TrafficCar | null; over: boolean }

interface MedicJob { kind: 'medic' | 'fire'; car: TrafficCar; x: number; z: number; body: Ped | null; fireIdx: number; crew: Ped[]; phase: 'drive' | 'walk' | 'work' | 'back'; t: number }

/**
 * The street, alive: people chatting on corners, a fistfight with a crowd, drunks cheering with bottles, a smoker by a
 * wall, a hot-dog vendor, an arrest at a cruiser, tourists taking photos, friends sitting on the kerb. People talk back
 * to you (bump into them, point a gun at them, roll up in something expensive). Paramedics come for the fallen and fire
 * crews for the fires.
 */
export class StreetLife {
  readonly speech: Speech;
  private readonly scenes: Scene[] = [];
  private sceneT = 4;
  private barkT = new Map<Ped, number>();
  private readonly jobs: MedicJob[] = [];
  private jobT = 3;
  private downSince = new Map<Ped, number>();
  private clock = 0;
  private niceT = 0;
  stats = { scenes: 0, medics: 0, fires: 0, revived: 0 };

  constructor(private readonly g: Game) { this.speech = new Speech(g); }

  update(dt: number): void {
    const g = this.g;
    this.clock += dt;
    this.speech.update(dt);
    if (g.state !== 'playing' || !g.player || !g.npcs) return;
    this.runScenes(dt);
    this.barks(dt);
    this.responders(dt);
  }

  // ------------------------------------------------------------------------------------------------ scenes

  /** A sidewalk spot 40–110 m away, ideally behind the camera. */
  private spot(min = 40, max = 110): { x: number; z: number; yaw: number } | null {
    const g = this.g, p = g.player!.pos;
    const plan = g.world.city.plan;
    if (!plan.inCity(p.x, p.z)) return null;
    const cam = new THREE.Vector3();
    g.camera.getWorldDirection(cam);
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, d = min + Math.random() * (max - min);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (plan.roadAt(x, z).kind !== 'sidewalk') continue;
      const ahead = (Math.cos(a) * cam.x + Math.sin(a) * cam.z) > 0.55;
      if (ahead && d < 75 && i < 18) continue;
      if (this.scenes.some((s) => Math.hypot(s.x - x, s.z - z) < 30)) continue;
      return { x, z, yaw: Math.random() * Math.PI * 2 };
    }
    return null;
  }

  private ped(x: number, z: number, yaw: number, arch: Parameters<NonNullable<Game['npcs']>['peds']['place']>[2] = 'local'): Ped | null {
    const p = this.g.npcs!.peds.place(x, z, arch, 'stand', yaw);
    if (p) { p.keep = true; p.stateT = 1e6; }
    return p;
  }

  private startScene(): void {
    const g = this.g;
    const hour = g.world.tod.hour;
    const night = hour > 20 || hour < 4;
    const kinds: SceneKind[] = ['chat', 'chat', 'fight', 'smoker', 'vendor', 'tourists', 'sitters', 'arrest'];
    if (night) kinds.push('drunks', 'drunks', 'fight');
    else if (hour > 9 && hour < 18) kinds.push('vendor', 'tourists');
    const kind = pick(kinds);
    const at = this.spot();
    if (!at) return;
    const { x, z, yaw } = at;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const sc: Scene = { kind, x, z, peds: [], t: 0, talkT: 1 + Math.random() * 2, line: 0, props: [], car: null, over: false };
    const face = (p: Ped | null, tx: number, tz: number): void => { if (p) p.yaw = Math.atan2(tx - p.x, tz - p.z); };
    const add = (p: Ped | null): Ped | null => { if (p) sc.peds.push(p); return p; };
    switch (kind) {
      case 'chat': case 'sitters': {
        const a = add(this.ped(x - fx * 0.65, z - fz * 0.65, yaw)), b = add(this.ped(x + fx * 0.65, z + fz * 0.65, yaw + Math.PI));
        if (kind === 'sitters') { if (a) a.pose = 'sit'; if (b) b.pose = 'sit'; }
        break;
      }
      case 'fight': {
        const a = add(this.ped(x - fx * 0.55, z - fz * 0.55, yaw)), b = add(this.ped(x + fx * 0.55, z + fz * 0.55, yaw + Math.PI));
        if (a) a.pose = 'fight'; if (b) b.pose = 'fight';
        // a small crowd, filming
        for (let i = 0; i < 3; i++) {
          const ang = yaw + Math.PI / 2 + (i - 1) * 0.7, r = 3.2 + Math.random();
          const o = add(this.ped(x + Math.sin(ang) * r, z + Math.cos(ang) * r, 0));
          if (o) { o.state = 'film'; o.stateT = 1e6; o.tx = x; o.tz = z; face(o, x, z); }
        }
        break;
      }
      case 'drunks': {
        for (let i = 0; i < 3; i++) {
          const ang = (i / 3) * Math.PI * 2;
          const p = add(this.ped(x + Math.sin(ang) * 0.8, z + Math.cos(ang) * 0.8, 0, 'drunk'));
          if (p) { p.pose = 'cheer'; face(p, x, z); }
        }
        break;
      }
      case 'smoker': { const p = add(this.ped(x, z, yaw)); if (p) p.pose = 'smoke'; break; }
      case 'vendor': {
        const cart = this.cart();
        cart.position.set(x, g.world.heightAt(x, z), z);
        cart.rotation.y = yaw;
        g.world.scene.add(cart);
        sc.props.push(cart);
        add(this.ped(x - fx * 0.9, z - fz * 0.9, yaw));
        for (let i = 0; i < 2; i++) { const c = add(this.ped(x + fx * (1.6 + i * 0.9) + (i ? 0.6 : -0.4), z + fz * (1.6 + i * 0.9), yaw + Math.PI)); face(c, x, z); }
        break;
      }
      case 'arrest': {
        const tp = CAR_TYPES.find((t) => t.id === 'police')!;
        sc.car = g.npcs!.traffic.spawnBlocker(tp, x + fz * 4.5, z - fx * 4.5, yaw);
        const cop = add(this.ped(x - fx * 1.8, z - fz * 1.8, yaw, 'cop'));
        const sus = add(this.ped(x, z, yaw));
        if (cop) { cop.role = 'actor'; cop.armed = true; cop.aim = true; }
        if (sus) sus.pose = 'kneel';
        break;
      }
      case 'tourists': {
        for (let i = 0; i < 3; i++) {
          const p = add(this.ped(x + fz * (i - 1) * 0.9, z - fx * (i - 1) * 0.9, yaw, 'tourist'));
          if (p && i !== 1) { p.state = 'film'; p.stateT = 1e6; p.tx = x + fx * 8; p.tz = z + fz * 8; }
        }
        break;
      }
    }
    if (!sc.peds.length) return;
    this.scenes.push(sc);
    this.stats.scenes++;
  }

  /** A hot-dog cart: a steel box on wheels with a striped umbrella. */
  private cart(): THREE.Group {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.35, metalness: 0.7 });
    const red = new THREE.MeshStandardMaterial({ color: 0xc8302a, roughness: 0.6 });
    const yel = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.8), steel); box.position.y = 0.75;
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.05, 0.85), red); top.position.y = 1.17;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6), steel); pole.position.y = 1.8;
    const umb = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.4, 8, 1, true), [red, yel][0]); umb.position.y = 2.45;
    const umb2 = new THREE.Mesh(new THREE.ConeGeometry(1.12, 0.41, 8, 1, true, Math.PI / 8, Math.PI / 4), yel); umb2.position.y = 2.45;
    g.add(box, top, pole, umb, umb2);
    for (const sx of [-0.55, 0.55]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1a1c })); w.position.set(sx, 0.18, 0.42); g.add(w); }
    g.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; this.g.world.rig.register(o.material as THREE.MeshStandardMaterial); } });
    return g;
  }

  private endScene(i: number): void {
    const g = this.g, sc = this.scenes[i]!;
    for (const p of sc.peds) {
      if (!p.active) continue;
      p.keep = false; p.pose = ''; p.aim = false; p.armed = false;
      if (p.role === 'actor') p.role = 'civ';
      if (p.state !== 'down') { p.state = 'idle'; g.npcs!.peds.resume(p); }
    }
    for (const o of sc.props) g.world.scene.remove(o);
    if (sc.car && sc.car.active) g.npcs!.traffic.remove(sc.car);
    this.scenes.splice(i, 1);
  }

  private runScenes(dt: number): void {
    const g = this.g, p = g.player!.pos;
    this.sceneT -= dt;
    const story = g.story;
    if (this.sceneT <= 0) {
      this.sceneT = 9 + Math.random() * 8;
      if (this.scenes.length < 4 && !story?.mission && (g.wanted?.stars ?? 0) === 0) this.startScene();
    }
    for (let i = this.scenes.length - 1; i >= 0; i--) {
      const sc = this.scenes[i]!;
      sc.t += dt;
      const d = Math.hypot(sc.x - p.x, sc.z - p.z);
      // anybody scared off (gunfire, a crash) breaks the scene
      const broken = sc.peds.some((q) => !q.active || q.state === 'flee' || q.state === 'down');
      if (d > 220 || sc.t > 300 || (broken && sc.kind !== 'fight')) { this.endScene(i); continue; }
      if (broken && sc.kind === 'fight' && !sc.over) { this.endScene(i); continue; }
      sc.talkT -= dt;
      if (sc.talkT > 0 || d > 30) continue;
      sc.talkT = 2.6 + Math.random() * 1.6;
      const [a, b] = sc.peds;
      switch (sc.kind) {
        case 'chat': case 'sitters': {
          const conv = CHAT[Math.floor(sc.t / 30) % CHAT.length]!;
          const who = sc.peds[sc.line % 2];
          if (who) this.speech.say(who, conv[sc.line % conv.length]!);
          sc.line++;
          if (sc.line >= conv.length) { sc.line = 0; sc.talkT = 8 + Math.random() * 6; }
          break;
        }
        case 'fight':
          if (!sc.over && a && b) {
            this.speech.say(sc.line++ % 2 ? b : a, pick(FIGHT), 2, true);
            if (Math.random() < 0.4) g.audio.sport('hit', 0.6, new THREE.Vector3(sc.x, 1.4, sc.z));
            const tgt = sc.line % 2 ? a : b;
            tgt.flinch = 0.3; tgt.flinchSign = 1;
            // after a few exchanges somebody goes down and the other walks off
            if (sc.t > 10 + Math.random() * 6) {
              sc.over = true;
              const loser = Math.random() < 0.5 ? a : b, winner = loser === a ? b : a;
              loser.pose = ''; loser.state = 'lie'; loser.stateT = 8;
              // they pick themselves up a little later and limp off
              setTimeout(() => { if (loser.active && loser.state === 'lie') { loser.state = 'idle'; loser.wound = 0.5; loser.keep = false; g.npcs?.peds.resume(loser); } }, 9000);
              winner.pose = ''; winner.state = 'idle'; winner.stateT = 0.1; winner.keep = false;
              this.speech.say(winner, 'Stay down!', 2.2, true);
              g.audio.sport('groan', 0.9, new THREE.Vector3(loser.x, 1, loser.z));
              for (const o of sc.peds.slice(2)) { o.state = 'idle'; o.stateT = 1 + Math.random() * 3; o.keep = false; }
            }
          }
          break;
        case 'drunks': { const who = pick(sc.peds); if (who) this.speech.say(who, pick(CHEER), 2, Math.random() < 0.5); if (Math.random() < 0.3) g.audio.sport('cheer', 0.4, new THREE.Vector3(sc.x, 1.5, sc.z)); break; }
        case 'vendor': if (a && Math.random() < 0.6) this.speech.say(a, pick(VENDOR), 3, true); break;
        case 'arrest': if (a && b) { const l = ARREST[Math.floor(sc.t / 12) % ARREST.length]!; this.speech.say(sc.line++ % 2 ? b : a, l[sc.line % 2]!, 2.4, sc.line % 2 === 1); } break;
        case 'tourists': if (b) this.speech.say(b, pick(TOUR), 2.2); break;
        case 'smoker': if (a && Math.random() < 0.25) this.speech.say(a, Math.random() < 0.5 ? '*cough*' : 'Long day.', 1.6); break;
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ people talking back

  private canBark(p: Ped, secs = 6): boolean {
    const t = this.barkT.get(p) ?? -1e9;
    if (this.clock - t < secs) return false;
    this.barkT.set(p, this.clock);
    return true;
  }

  private barks(dt: number): void {
    const g = this.g, pl = g.player!;
    const peds = g.npcs!.peds.peds;
    const d = g.driving;
    const onFoot = d?.mode === 'foot';
    // bumped into
    if (onFoot && pl.speed2D > 1.4) {
      for (const p of peds) {
        if (!p.active || p.role !== 'civ' || p.state === 'down' || p.state === 'flee' || p.pose) continue;
        if (Math.abs(p.x - pl.pos.x) > 0.8 || Math.abs(p.z - pl.pos.z) > 0.8) continue;
        if (Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z) < 0.75 && this.canBark(p)) {
          p.flinch = 0.32; p.flinchSign = 1;
          this.speech.say(p, pick(BUMP), 2, true);
        }
      }
    }
    // a gun pointed at them
    const w = g.weapon;
    if (onFoot && w?.isDrawn && pl.aiming) {
      const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
      for (const p of peds) {
        if (!p.active || p.role !== 'civ' || p.state === 'down') continue;
        const dx = p.x - pl.pos.x, dz = p.z - pl.pos.z, dist = Math.hypot(dx, dz);
        if (dist > 18 || dist < 0.5 || (dx * fx + dz * fz) / dist < 0.97) continue;
        if (!this.canBark(p, 5)) continue;
        this.speech.say(p, pick(AIMED), 2.4, true);
        p.pose = 'hands'; p.state = 'stand'; p.stateT = 1e6;
        const q = p;
        setTimeout(() => { if (q.active && q.pose === 'hands') { q.pose = ''; g.npcs?.peds.startFlee(q, pl.pos.x, pl.pos.z, 8); } }, 2600);
      }
    }
    // rolling up in something expensive
    this.niceT -= dt;
    const car = d?.mode === 'driving' ? d.vehicle : null;
    if (car && this.niceT <= 0 && Math.abs(car.speed) < 3 && (VEHICLES[car.spec.id]?.price ?? 0) >= 90000) {
      this.niceT = 4;
      for (const p of peds) {
        if (!p.active || p.role !== 'civ' || p.state === 'down' || p.state === 'flee') continue;
        if (Math.hypot(p.x - car.position.x, p.z - car.position.z) < 7 && this.canBark(p, 30)) { this.speech.say(p, pick(NICE_CAR), 2.2); break; }
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ paramedics and fire crews

  private responders(dt: number): void {
    const g = this.g, pl = g.player!.pos;
    const peds = g.npcs!.peds;
    this.jobT -= dt;
    if (this.jobT <= 0) {
      this.jobT = 2;
      // bodies that have been lying there a while
      for (const p of peds.peds) {
        if (!p.active || p.state !== 'down' || p.dying > 0) { this.downSince.delete(p); continue; }
        if (!this.downSince.has(p)) this.downSince.set(p, this.clock);
      }
      const busy = (k: MedicJob['kind']): number => this.jobs.filter((j) => j.kind === k).length;
      if (busy('medic') < 1 && (g.wanted?.stars ?? 0) < 2) {
        for (const [p, since] of this.downSince) {
          if (this.clock - since < 14 || this.jobs.some((j) => j.body === p)) continue;
          if (Math.hypot(p.x - pl.x, p.z - pl.z) > 150) continue;
          const car = g.npcs!.traffic.dispatch('ambulance', p.x, p.z, 120, 260);
          if (car) { p.keep = true; this.jobs.push({ kind: 'medic', car, x: p.x, z: p.z, body: p, fireIdx: -1, crew: [], phase: 'drive', t: 0 }); this.stats.medics++; }
          break;
        }
      }
      const fires = g.ordnance?.fires ?? [];
      if (busy('fire') < 1 && fires.length) {
        const f = fires.find((q) => q.t > 3 && Math.hypot(q.pos.x - pl.x, q.pos.z - pl.z) < 200);
        if (f) {
          const car = g.npcs!.traffic.dispatch('fire', f.pos.x, f.pos.z, 120, 260);
          if (car) { this.jobs.push({ kind: 'fire', car, x: f.pos.x, z: f.pos.z, body: null, fireIdx: 0, crew: [], phase: 'drive', t: 0 }); this.stats.fires++; f.t = Math.max(f.t, 45); }
        }
      }
    }
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const j = this.jobs[i]!;
      j.t += dt;
      const c = j.car;
      // the body was cleared away (or got up), or the crew lost its way
      if (j.kind === 'medic' && j.body && j.phase !== 'back' && (!j.body.active || (j.body.state !== 'down' && j.phase !== 'work'))) { this.back(j); j.body = null; }
      if (!c.active || j.t > 150 || Math.hypot(j.x - pl.x, j.z - pl.z) > 260) { this.endJob(i); continue; }
      if (j.phase === 'drive') {
        const near = Math.hypot(c.x - j.x, c.z - j.z) < 70;
        if ((c.state === 'park' || c.v < 0.3) && near && j.t > 4 || (near && c.v < 0.5)) {
          // the crew climbs out
          for (let k = 0; k < 2; k++) {
            const q = this.ped(c.x + (k ? 1.6 : -1.6) * c.fz, c.z - (k ? 1.6 : -1.6) * c.fx, 0, 'worker');
            if (q) {
              q.look = { ...q.look, shirt: j.kind === 'medic' ? 0xf2f2ee : 0x2a2a2e, sleeve: j.kind === 'medic' ? 0xf2f2ee : 0x2a2a2e, pants: j.kind === 'medic' ? 0x1d3b6a : 0xc9a227 };
              j.crew.push(q);
            }
          }
          j.phase = 'walk'; j.t = 0;
        }
        continue;
      }
      // the target: the body, or the fire
      let tx = j.x, tz = j.z;
      if (j.kind === 'medic' && j.body) { tx = j.body.x; tz = j.body.z; }
      let fire: Fire | null = null;
      if (j.kind === 'fire') for (const f of g.ordnance?.fires ?? []) if (!fire || Math.hypot(f.pos.x - j.x, f.pos.z - j.z) < Math.hypot(fire.pos.x - j.x, fire.pos.z - j.z)) fire = f;
      if (j.kind === 'fire' && fire) { tx = fire.pos.x; tz = fire.pos.z; }
      const stand = j.kind === 'medic' ? 0.9 : 6.5;
      if (j.phase === 'walk') {
        let all = true;
        j.crew.forEach((q, k) => {
          const ox = tx + (k ? 1 : -1) * stand * 0.7, oz = tz + stand * 0.7;
          if (!this.walkTo(q, ox, oz, dt, j.kind === 'medic' ? 3.6 : 2.6)) all = false;
          else q.yaw = Math.atan2(tx - q.x, tz - q.z);
        });
        if (all || j.t > 30) { j.phase = 'work'; j.t = 0; for (const q of j.crew) q.pose = j.kind === 'medic' ? 'cpr' : 'hose'; }
        continue;
      }
      if (j.phase === 'work') {
        if (j.kind === 'fire') {
          // water from the hoses onto the flames, then out
          for (const q of j.crew) {
            if (Math.random() < 0.5) {
              const s = Math.random();
              const px = q.x + (tx - q.x) * s, pz = q.z + (tz - q.z) * s;
              g.effects?.impact(new THREE.Vector3(px, g.world.heightAt(px, pz) + 1.2 * (1 - s) + 0.3, pz), new THREE.Vector3(0, 1, 0), 'water', false);
            }
          }
          if (j.t > 6) {
            if (fire) fire.t = Math.min(fire.t, 0.5);
            for (const v of g.vehicles?.vehicles ?? []) if (!v.exploded && v.health < 300 && Math.hypot(v.position.x - tx, v.position.z - tz) < 10) v.health = 300;
            if (j.crew[0]) this.speech.say(j.crew[0], 'Fire\'s out!', 2.4, true);
            this.back(j);
          }
        } else if (j.body) {
          if (j.t > 7) {
            const b = j.body;
            if (Math.random() < 0.35 && b.active) {
              // back from the brink
              b.state = 'idle'; b.health = 60; b.dying = 0; b.fall = 0; b.wound = 0.5; b.stateT = 0.1;
              peds.resume(b);
              if (j.crew[0]) this.speech.say(j.crew[0], 'He\'s breathing! We\'ve got him!', 2.6, true);
              this.stats.revived++;
            } else {
              if (j.crew[0]) this.speech.say(j.crew[0], 'We lost him. Cover him up.', 2.6);
              setTimeout(() => { if (b.state === 'down') b.active = false; }, 3500);
            }
            this.back(j);
          }
        } else this.back(j);
        continue;
      }
      // walking back to the truck, then gone
      let home = true;
      for (const q of j.crew) if (q.active && !this.walkTo(q, c.x, c.z, dt, 2.2, 2.5)) home = false;
      if (home || j.t > 30) this.endJob(i);
    }
  }

  private back(j: MedicJob): void { j.phase = 'back'; j.t = 0; for (const q of j.crew) q.pose = ''; }

  /** Step a crew member toward a point. True when there. */
  private walkTo(q: Ped, x: number, z: number, dt: number, speed: number, r = 0.45): boolean {
    const dx = x - q.x, dz = z - q.z, d = Math.hypot(dx, dz);
    if (d < r) { q.speed = 0; return true; }
    const step = Math.min(d, speed * dt);
    q.x += (dx / d) * step; q.z += (dz / d) * step;
    q.y = this.g.world.heightAt(q.x, q.z);
    q.yaw = Math.atan2(dx, dz);
    q.speed = speed;
    q.phase += speed * dt * 3.2;
    return false;
  }

  private endJob(i: number): void {
    const j = this.jobs[i]!;
    for (const q of j.crew) if (q.active) q.active = false;
    if (j.car.active) this.g.npcs?.traffic.remove(j.car);
    if (j.body) { this.downSince.delete(j.body); if (j.body.state === 'down') j.body.keep = false; }
    this.jobs.splice(i, 1);
  }
}
