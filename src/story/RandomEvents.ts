import * as THREE from 'three';
import type { Story } from './Story';
import type { Vehicle } from '../vehicles/Vehicle';
import type { Ped } from '../npc/Pedestrians';
import { money } from '../economy/Economy';
import { HEAT } from '../combat/Wanted';

type Ev =
  | { kind: 'van'; v: Vehicle; beacon: number; x: number; z: number; prog: number; t: number; robbed: boolean }
  | { kind: 'thief'; thief: Ped; victim: Ped; beacon: number; t: number; fleeT: number; wallet: { x: number; z: number } | null; carrying: boolean; cash: number }
  | { kind: 'ride'; who: Ped[]; beacon: number; t: number; dest: { x: number; z: number } | null; pay: number; getaway: boolean; car: Vehicle | null };

const _b = new THREE.Vector3();

/**
 * Things that happen on the street while you are free-roaming, every few minutes, marked with a blue "?" on the map:
 *
 * - **Security van**: a cash van parked with two guards. Take the money from the back (hold E at the rear doors). The
 *   guards fight back and the police will hear about it.
 * - **Thief**: somebody snatches a wallet and runs. Stop him (he is fair game), pick up the wallet, then either bring it
 *   back to its owner for a reward or keep what is inside.
 */
export class RandomEvents {
  ev: Ev | null = null;
  private nextT = 90 + Math.random() * 60;
  stats = { vans: 0, thieves: 0 };

  constructor(private readonly s: Story) {}

  get active(): boolean { return !!this.ev; }

  /** Start one right now (tests, debugging). */
  force(kind: 'van' | 'thief' | 'hitch' | 'getaway'): boolean {
    if (this.ev) this.end();
    return kind === 'van' ? this.startVan() : kind === 'thief' ? this.startThief() : this.startRide(kind === 'getaway');
  }

  update(dt: number): void {
    const s = this.s, g = s.g;
    if (!g.player || g.state !== 'playing') return;
    const busy = !!s.mission || s.cutscenes.active || s.pastimes.busy || !!g.piloting?.busy;
    if (this.ev) { if (s.mission) this.end(); else this.step(dt); return; }
    if (busy) return;
    this.nextT -= dt;
    if (this.nextT > 0) return;
    this.nextT = 150 + Math.random() * 120;
    if ((g.wanted?.stars ?? 0) > 0) return;
    if (!g.world.city.plan.inCity(g.player.pos.x, g.player.pos.z)) return;
    const r = Math.random();
    if (r < 0.3) this.startVan(); else if (r < 0.6) this.startThief(); else this.startRide(r > 0.85);
  }

  // ------------------------------------------------------------------------------------------------ the van

  private startVan(): boolean {
    const s = this.s, g = s.g, p = g.player!.pos;
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 60;
      const c = s.snap(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 3.2);
      if (Math.hypot(c.x - p.x, c.z - p.z) < 60) continue;
      const yaw = s.roadYaw(c.x, c.z);
      const v = g.vehicles!.spawn('courier', c.x, c.z, yaw, '#c9ccd0');
      v.locked = true;
      const right = _b.set(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      for (const side of [-1, 1]) {
        const gp = s.snap(c.x + right.x * side * 2.6, c.z + right.z * side * 2.6, 0.8);
        s.hostiles.spawn({ x: gp.x, z: gp.z, kind: 'pistol', tag: 'ev.van', look: 'guard', unaware: true, neutral: true, hold: true, hp: 80, yaw: yaw + side * 1.2 });
      }
      const beacon = s.beacons.add(c.x, c.z, { color: '#4aa8ff', glyph: '$', name: 'Security van', tall: 30 });
      this.ev = { kind: 'van', v, beacon, x: c.x, z: c.z, prog: 0, t: 240, robbed: false };
      s.hud.showTip('A security van is making a stop nearby. The blue $ on your map.', 6);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------------------------------------ the thief

  private startThief(): boolean {
    const s = this.s, g = s.g, p = g.player!.pos, pd = g.npcs?.peds;
    if (!pd) return false;
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, d = 26 + Math.random() * 14;
      const c = s.snap(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 1.0);
      const victim = pd.place(c.x, c.z, 'local', 'idle', a);
      if (!victim) continue;
      const tc = s.snap(c.x + 2, c.z + 1, 0.8);
      const thief = pd.place(tc.x, tc.z, 'local', 'walk', a);
      if (!thief) { victim.active = false; continue; }
      victim.keep = true; thief.keep = true;
      // a criminal: taking him down is not a crime
      thief.role = 'thug';
      pd.startFlee(thief, p.x, p.z, 8);
      const beacon = s.beacons.add(thief.x, thief.z, { color: '#4aa8ff', glyph: '!', name: 'Thief', tall: 8 });
      this.ev = { kind: 'thief', thief, victim, beacon, t: 120, fleeT: 0, wallet: null, carrying: false, cash: 120 + Math.floor(Math.random() * 480) };
      g.audio.sport('groan', 1, new THREE.Vector3(c.x, terrainY(s, c.x, c.z) + 1.5, c.z));
      s.hud.showBanner('Stop! Thief!', 'Somebody just got robbed', 'Catch the thief and get the wallet back', 'bad', 3);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------------------------------------ rides

  /** Somebody at the kerb waving you down: a hitchhiker, or two robbers who need a getaway driver. */
  private startRide(getaway: boolean): boolean {
    const s = this.s, g = s.g, p = g.player!.pos, pd = g.npcs?.peds;
    if (!pd) return false;
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 50;
      const c = s.snap(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 1.0);
      const who: Ped[] = [];
      for (let k = 0; k < (getaway ? 2 : 1); k++) {
        const q = pd.place(c.x + k * 1.1, c.z + k * 0.4, 'local', 'stand', a + Math.PI);
        if (!q) continue;
        q.keep = true; q.stateT = 1e6; q.pose = 'wave';
        if (getaway) { q.role = 'thug'; q.look = { ...q.look, shirt: 0x1d1f23, sleeve: 0x1d1f23, pants: 0x2a2d32 }; }
        who.push(q);
      }
      if (!who.length) continue;
      const beacon = s.beacons.add(c.x, c.z, { color: '#4aa8ff', glyph: getaway ? '$' : '☞', name: getaway ? 'Getaway job' : 'Hitchhiker', tall: 10 });
      this.ev = { kind: 'ride', who, beacon, t: 150, dest: null, pay: getaway ? 2500 + Math.floor(Math.random() * 2500) : 150 + Math.floor(Math.random() * 300), getaway, car: null };
      s.hud.showTip(getaway ? 'Two men outside a store are waving at passing cars. They look in a hurry.' : 'Somebody is hitching a ride nearby.', 6);
      return true;
    }
    return false;
  }

  private stepRide(dt: number, ev: Extract<Ev, { kind: 'ride' }>): void {
    const s = this.s, g = s.g;
    const d = g.driving;
    const car = d?.mode === 'driving' ? d.vehicle : null;
    const lead = ev.who[0]!;
    if (!ev.dest) {
      const dist = car ? Math.hypot(car.position.x - lead.x, car.position.z - lead.z) : 1e9;
      const pd = Math.hypot(g.player!.pos.x - lead.x, g.player!.pos.z - lead.z);
      s.hud.setObjective(ev.getaway ? 'Getaway job' : 'Hitchhiker', car ? 'Pull up next to them' : 'You need a car to give them a ride', pd < 300 ? `${Math.round(pd)} m` : '');
      if (ev.who.some((q) => !q.active || q.state === 'down' || q.state === 'flee') || ev.t <= 0) { this.end(); return; }
      if (pd < 30 && Math.random() < dt * 0.4) g.street?.speech.say(lead, ev.getaway ? 'Hey! You! Drive!' : 'Need a ride? Anywhere north!', 2.2, ev.getaway);
      if (car && dist < 8 && Math.abs(car.speed) < 2.5) {
        // they climb in
        for (const q of ev.who) { q.active = false; q.keep = false; }
        ev.car = car;
        const p = g.player!.pos;
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2, r = 500 + Math.random() * 500;
          const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
          if (!g.world.city.plan.inCity(x, z)) continue;
          ev.dest = s.snap(x, z, 3);
          break;
        }
        ev.dest ??= s.snap(p.x + 400, p.z, 3);
        s.beacons.move(ev.beacon, ev.dest.x, ev.dest.z);
        s.setWaypoint(ev.dest.x, ev.dest.z);
        ev.t = 240;
        if (ev.getaway) {
          g.wanted?.report(HEAT[2]! + 6, p.x, p.z, true);
          s.hud.showBanner('Getaway', 'DRIVE!', 'Lose the cops, then take them to the hideout', 'bad', 3);
        } else s.hud.showBanner('Hitchhiker', 'Thanks for stopping!', 'Drop them at the marker', 'good', 2.5);
        g.audio.mech('cloth');
      }
      return;
    }
    // on the way
    const dd = car ? Math.hypot(car.position.x - ev.dest.x, car.position.z - ev.dest.z) : 1e9;
    const stars = g.wanted?.stars ?? 0;
    s.hud.setObjective(ev.getaway ? 'Getaway job' : 'Hitchhiker', ev.getaway && stars > 0 ? 'Lose the cops' : 'Drive them to the marker', `${Math.round(dd)} m · ${Math.ceil(ev.t)} s`);
    if (!car || car !== ev.car || car.exploded || ev.t <= 0) {
      g.ui.toast(ev.getaway ? 'Your passengers bailed out.' : 'Your passenger got out and walked.');
      s.clearWaypoint();
      this.end();
      return;
    }
    if (dd < 25 && Math.abs(car.speed) < 4 && !(ev.getaway && stars > 0)) {
      g.commerce?.eco.earn(ev.pay, ev.getaway ? 'Getaway job' : 'Hitchhiker');
      s.hud.showBanner(ev.getaway ? 'Getaway job' : 'Hitchhiker', ev.getaway ? 'CLEAN GETAWAY' : 'DROPPED OFF', `+${money(ev.pay)}`, 'good', 3);
      // they hop out and wander off
      const pd = g.npcs?.peds;
      for (const q of ev.who) {
        const out = pd?.place(car.position.x + 2.4, car.position.z + 1, 'local', 'idle', 0);
        if (out) { out.look = { ...q.look }; out.stateT = 0.5; pd!.resume(out); }
      }
      s.clearWaypoint();
      s.actWin(ev.getaway ? 'event.getaway' : 'event.hitch', 1);
      this.end();
    }
  }

  // ------------------------------------------------------------------------------------------------ per frame

  private step(dt: number): void {
    const s = this.s, g = s.g, ev = this.ev!;
    const p = g.driving?.mode === 'driving' && g.driving.vehicle ? g.driving.vehicle.position : g.player!.pos;
    ev.t -= dt;
    if (ev.kind === 'van') {
      const d = Math.hypot(p.x - ev.x, p.z - ev.z);
      if (ev.robbed) { if (d > 220) this.end(); return; }
      if (ev.t <= 0 || d > 450 || ev.v.exploded) { if (!ev.robbed && d < 450) g.ui.toast('The security van has gone.'); this.end(); return; }
      // the rear doors
      const back = _b.set(0, 0, 1).applyQuaternion(ev.v.quaternion).multiplyScalar(ev.v.spec.size.length / 2 + 0.9).add(ev.v.position);
      const atDoor = g.driving?.mode === 'foot' && Math.hypot(g.player!.pos.x - back.x, g.player!.pos.z - back.z) < 2.2;
      if (d < 40) {
        const guards = s.hostiles.alive('ev.van');
        s.hud.setObjective('Security van', 'Take the cash from the back of the van', atDoor ? `Hold ${s.interactKey()}: ${Math.round((ev.prog / 4) * 100)}%` : guards ? `${guards} guard${guards > 1 ? 's' : ''} watching` : 'Go round to the rear doors');
      } else s.hud.setObjective(null, null);
      if (atDoor && g.input.down('interact')) {
        ev.prog += dt;
        if (ev.prog >= 4) {
          ev.robbed = true;
          const cash = 4000 + Math.floor(Math.random() * 8000);
          g.commerce?.eco.earn(cash, 'Security van');
          s.hostiles.alertAll('ev.van');
          g.police?.crime(30, ev.x, ev.z);
          g.audio.mech('magIn');
          s.hud.setObjective(null, null);
          s.hud.showBanner('Security van', 'CASH GRABBED', `+${money(cash)} · the alarm is going`, 'good', 3);
          s.beacons.remove(ev.beacon); ev.beacon = -1;
          this.stats.vans++;
          s.actWin('event.van', 1);
        }
      } else ev.prog = Math.max(0, ev.prog - dt * 0.5);
      return;
    }
    if (ev.kind === 'ride') { this.stepRide(dt, ev); return; }
    // ---- the thief
    const th = ev.thief, vic = ev.victim;
    if (!ev.wallet && !ev.carrying) {
      s.beacons.move(ev.beacon, th.x, th.z);
      s.hud.setObjective('Thief', 'Stop the thief', `${Math.round(Math.hypot(th.x - p.x, th.z - p.z))} m`);
      if (th.state === 'down' || !th.active) {
        ev.wallet = { x: th.x, z: th.z };
        s.beacons.move(ev.beacon, th.x, th.z);
        g.ui.toast('He dropped the wallet.');
      } else {
        ev.fleeT -= dt;
        if (ev.fleeT <= 0) { ev.fleeT = 1.2; g.npcs?.peds.startFlee(th, p.x, p.z, 6); th.speed = Math.max(th.speed, 6.2); }
        if (Math.hypot(th.x - p.x, th.z - p.z) > 200 || ev.t <= 0) { g.ui.toast('The thief got away.'); this.end(); }
      }
      return;
    }
    if (ev.wallet && !ev.carrying) {
      s.hud.setObjective('Thief', 'Pick up the wallet', '');
      if (Math.hypot(g.player!.pos.x - ev.wallet.x, g.player!.pos.z - ev.wallet.z) < 2.2) {
        ev.carrying = true; ev.t = 90;
        g.audio.mech('cloth');
        s.beacons.move(ev.beacon, vic.x, vic.z);
        g.ui.toast(`The wallet has ${money(ev.cash)} in it.`);
      }
      return;
    }
    // carrying: return it, or keep it
    s.beacons.move(ev.beacon, vic.x, vic.z);
    s.hud.setObjective('Thief', 'Return the wallet to its owner', `Or keep the ${money(ev.cash)} · ${Math.ceil(ev.t)} s`);
    if (vic.active && vic.state !== 'down' && Math.hypot(g.player!.pos.x - vic.x, g.player!.pos.z - vic.z) < 2.6) {
      const reward = 400;
      g.commerce?.eco.earn(reward, 'Reward');
      s.hud.showBanner('Good deed', 'WALLET RETURNED', `"Thank you! Here, take this." +${money(reward)}`, 'good', 3);
      this.stats.thieves++;
      s.actWin('event.thief', 1);
      this.end();
    } else if (ev.t <= 0 || !vic.active || vic.state === 'down') {
      g.commerce?.eco.earn(ev.cash, 'Kept the wallet');
      s.hud.showBanner('Finders keepers', 'YOU KEPT THE WALLET', `+${money(ev.cash)}`, 'neutral', 3);
      this.stats.thieves++;
      this.end();
    }
  }

  private end(): void {
    const s = this.s, g = s.g, ev = this.ev;
    this.ev = null;
    if (!ev) return;
    s.hud.setObjective(null, null);
    if (ev.beacon >= 0) s.beacons.remove(ev.beacon);
    if (ev.kind === 'van') {
      s.hostiles.clear('ev.van');
      const v = ev.v;
      if (!v.occupied && g.driving?.vehicle !== v) g.vehicles?.remove(v);
      else { v.ambient = true; v.locked = false; }
    } else if (ev.kind === 'ride') {
      for (const q of ev.who) if (q.active) { q.keep = false; q.pose = ''; if (q.role === 'thug') q.role = 'civ'; q.state = 'idle'; g.npcs?.peds.resume(q); }
    } else {
      ev.thief.keep = false; ev.victim.keep = false;
      if (ev.victim.state === 'idle') g.npcs?.peds.resume(ev.victim);
    }
  }
}

function terrainY(s: Story, x: number, z: number): number { return s.g.world.heightAt(x, z); }
