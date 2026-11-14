import * as THREE from 'three';
import type { Game } from '../Game';
import { GROUP } from '../physics/Physics';
import { WEAPONS, type WeaponId } from '../player/Weapons';
import { h } from '../ui/dom';

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _end = new THREE.Vector3();
const _n = new THREE.Vector3();
const _up = new THREE.Vector3();
const _rt = new THREE.Vector3();

/**
 * Shooting from a vehicle. Keyboard and mouse: hold the right button to lean out and aim where the camera looks, left
 * button fires. Controller: hold LB to aim, RB fires. Only one-handed guns work from a seat: the WASP-9 if you have it,
 * otherwise the VC-9. Shots use the same hit rules as on foot (people, police helicopters, cars, aircraft).
 */
export class DriveBy {
  aiming = false;
  /** Set once the aim button has been used for aiming (so a quick LB tap can still change the radio). */
  usedThisHold = false;
  private cool = 0;
  private reloadT = 0;
  private readonly cross: HTMLElement;
  private readonly label: HTMLElement;
  private hitT = 0;

  constructor(private readonly g: Game) {
    this.label = h('span', 'db-ammo', '');
    this.cross = h('div', 'db-cross is-hidden', h('i', 'db-ring'), h('i', 'db-dot'), this.label);
    g.ui.hudRoot.append(this.cross);
  }

  /** The gun used from the car, or null when there is nothing to shoot with. */
  private gun(): WeaponId | null {
    const w = this.g.weapon;
    if (!w) return null;
    for (const id of ['smg', 'vc9'] as WeaponId[]) {
      const c = this.count(id);
      if (w.inv[id].owned && c.ammo + c.reserve > 0) return id;
    }
    return null;
  }

  /** Rounds of a gun, reading the live magazine when it is the gun in your hands. */
  private count(id: WeaponId): { ammo: number; reserve: number } {
    const w = this.g.weapon!;
    return w.def.id === id ? { ammo: w.ammo, reserve: w.reserve } : { ammo: w.inv[id].ammo, reserve: w.inv[id].reserve };
  }

  private setCount(id: WeaponId, ammo: number, reserve: number): void {
    const w = this.g.weapon!;
    if (w.def.id === id) { w.ammo = ammo; w.reserve = reserve; }
    w.inv[id].ammo = ammo; w.inv[id].reserve = reserve;
  }

  update(dt: number): void {
    const g = this.g;
    const inp = g.input;
    const d = g.driving;
    const car = d?.mode === 'driving' ? d.vehicle : null;
    const inCar = !!car && !g.piloting?.busy && g.state === 'playing' && !g.story?.cutscenes.active && !g.combat?.flow;
    const pad = inp.activeDevice === 'gamepad';
    const aimHeld = inCar && (pad ? inp.down('weaponWheel') : inp.down('aim'));
    if (!aimHeld) this.usedThisHold = false;
    const gun = aimHeld ? this.gun() : null;
    this.aiming = !!gun;
    if (d) d.holdLook = this.aiming;
    this.cross.classList.toggle('is-hidden', !this.aiming);
    this.cool -= dt;
    this.hitT -= dt;
    this.cross.classList.toggle('hit', this.hitT > 0);
    if (!gun || !car) return;
    this.usedThisHold = true;
    // RB is Mack's slow-motion in a car; while leaning out it fires instead
    if (pad) inp.swallow('ability');
    const c = this.count(gun);
    const def = WEAPONS[gun];
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      this.label.textContent = 'Reloading…';
      if (this.reloadT <= 0) {
        const take = Math.min(def.mag, c.reserve);
        this.setCount(gun, take, c.reserve - take);
        g.audio.mech('magIn');
      }
      return;
    }
    this.label.textContent = `${def.name} · ${c.ammo} / ${c.reserve}`;
    const trigger = pad ? inp.down('ability') : inp.down('fire');
    const pressed = pad ? inp.pressed('ability') : inp.pressed('fire');
    if (c.ammo <= 0) { if (c.reserve > 0) { this.reloadT = 1.4; g.audio.mech('magOut'); } return; }
    if (this.cool > 0) return;
    if (!(def.auto ? trigger : pressed)) return;
    this.cool = def.interval * (def.auto ? 1.15 : 1.6);
    this.setCount(gun, c.ammo - 1, c.reserve);
    this.shoot(def.damage, def.sound, car.position);
  }

  private shoot(damage: number, sound: 'pistol' | 'smg' | 'shotgun' | 'rifle', carPos: THREE.Vector3): void {
    const g = this.g;
    const cam = g.camera;
    const phys = g.physics!;
    // aim: whatever is under the crosshair (screen centre), found from the camera, skipping our own car
    _aim.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _rt.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const spread = 0.022;
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    _aim.addScaledVector(_rt, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
    const own = g.driving?.vehicle?.collider;
    const camHit = phys.raycast(cam.position, _aim, 260, own, GROUP.WORLD | GROUP.PROP);
    _end.copy(cam.position).addScaledVector(_aim, camHit ? camHit.distance : 200);
    // the muzzle: out of the driver's window, toward the aim
    _o.copy(carPos).add(_n.set(0, 1.35, 0)).addScaledVector(_rt, 0.9);
    _d.copy(_end).sub(_o);
    const len = _d.length();
    if (len < 0.5) return;
    _d.multiplyScalar(1 / len);
    const hit = phys.raycast(_o, _d, len + 2, own, GROUP.WORLD | GROUP.PROP);
    const npcHit = g.npcs?.rayHit(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, hit ? hit.distance : len + 2) ?? null;
    g.npcs?.alarm(_o.x, _o.z);
    const end = npcHit ? _end.copy(_o).addScaledVector(_d, npcHit.t) : hit ? hit.point : _end;
    g.effects?.tracer(_o, end);
    g.audio.gunshot(1, _o, sound, 0.9);
    g.input.rumble(0.35, 0.25, 50);
    if (npcHit) {
      _n.copy(_d).negate();
      g.effects?.impact(end, _n, 'flesh', false);
      const res = g.npcs?.hurt(npcHit.target, _d.x, _d.z, damage, npcHit.head);
      this.hitT = 0.15;
      this.cross.dataset.kind = res ?? 'hit';
      if (res === 'kill' || res === 'down') this.hitT = 0.35;
      g.weapon?.onFire?.(1);
    } else if (hit) {
      if (hit.collider && g.combat?.hitCollider(hit.collider.handle, damage * 0.55, hit.point)) this.hitT = 0.15;
      g.effects?.impact(hit.point, hit.normal, hit.surface, !hit.body);
      g.weapon?.onFire?.(1);
    } else g.weapon?.onFire?.(1);
  }
}
