import * as THREE from 'three';
import type { Story } from '../story/Story';
import { money } from '../economy/Economy';
import { MARKERS } from '../ui/mapData';
import { h } from '../ui/dom';
import { btn, row, type Page, type PageHost } from '../ui/Modal';
import { golfPage } from './golf';
import { tennisPage } from './tennis';
import { armPage, ARM_RIVALS, bowlingPage, hoopsPage } from './games';
import { resultPage } from './arena';
import { Fishing, FISH_SPOTS } from './Fishing';
import { Hunting, HUNT } from './Hunting';
import { Diving, DIVE_SHOP, DIVE_SITES } from './Diving';
import { RangeChallenge, RANGE, RANGE_MEDALS } from './Range';

interface Venue { id: string; name: string; x: number; z: number; glyph: string; color: string; open: (p: Pastimes) => Page }

const VENUES: Venue[] = [
  { id: 'golf', name: 'Vista Verde Links', x: 1300, z: -760, glyph: '⛳', color: '#7be28f', open: (p) => p.golfMenu() },
  { id: 'tennis', name: 'Costa Merida Tennis Club', x: 700, z: 3150, glyph: '◐', color: '#d7f25a', open: (p) => p.tennisMenu() },
  { id: 'bowling', name: 'Starlite Lanes', x: 1210, z: 210, glyph: '●', color: '#8fb8ff', open: (p) => p.bowlingMenu() },
  { id: 'hoops', name: 'Seaside courts', x: 250, z: 90, glyph: '◍', color: '#ff9a4a', open: (p) => p.hoopsMenu() },
  { id: 'range', name: 'Beach shooting range', x: RANGE.x - 3, z: RANGE.z + 6, glyph: '⌖', color: '#ff7a59', open: (p) => p.rangeMenu() },
  { id: 'arm', name: 'Muscle Beach', x: 180, z: -60, glyph: '✊', color: '#ff7a7a', open: (p) => p.armMenu() },
];

// the map shows every pastime
for (const v of VENUES) MARKERS.push({ name: v.name, x: v.x, z: v.z, glyph: v.glyph, color: v.color });
for (const f of FISH_SPOTS) MARKERS.push({ name: `Fishing: ${f.name}`, x: f.x, z: f.z, glyph: '≈', color: '#5ac8ff' });
for (const d of DIVE_SITES) MARKERS.push({ name: `Dive site: ${d.name}`, x: d.x, z: d.z, glyph: '◒', color: '#3ad0c0' });
MARKERS.push({ name: 'Neptune Dive Shop', x: DIVE_SHOP.x, z: DIVE_SHOP.z, glyph: '◒', color: '#3ad0c0' });
MARKERS.push({ name: 'Kestrel Hunting Lodge', x: HUNT.lodge.x, z: HUNT.lodge.z, glyph: '⌖', color: '#c49a5a' });

/** A floating sign so the places can be found without the map. */
export function sign(text: string, glyph: string, color: string): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const c = cv.getContext('2d')!;
  c.fillStyle = 'rgba(10,12,18,0.78)';
  c.beginPath(); c.roundRect(4, 14, 504, 100, 50); c.fill();
  c.strokeStyle = color; c.lineWidth = 6; c.stroke();
  c.fillStyle = color; c.beginPath(); c.arc(64, 64, 38, 0, 7); c.fill();
  c.fillStyle = '#0a0c12'; c.font = '700 44px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(glyph, 64, 66);
  c.fillStyle = '#fff'; c.font = '600 40px Inter, system-ui'; c.textAlign = 'left'; c.fillText(text, 118, 66, 380);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(4.8, 1.2, 1);
  return s;
}

/**
 * Sports and outdoor pastimes: golf, tennis, bowling, hoops and arm wrestling at their venues; fishing, hunting and
 * diving out in the world.
 */
export class Pastimes {
  readonly fishing: Fishing;
  readonly hunting: Hunting;
  readonly diving: Diving;
  readonly range: RangeChallenge;
  private readonly spots = new Map<string, { x: number; z: number }>();
  private readonly signs: { s: THREE.Sprite; x: number; z: number }[] = [];
  private signT = 0;

  constructor(readonly s: Story) {
    this.fishing = new Fishing(s);
    this.hunting = new Hunting(s);
    this.diving = new Diving(s);
    this.range = new RangeChallenge(s);
    const g = s.g;
    const npcs = g.npcs;
    if (npcs) {
      // bullets can hit animals; gunfire on the hunting grounds is not a crime and spooks the game
      const prevRay = npcs.extraRay, prevHurt = npcs.extraHurt, prevShot = npcs.onGunshot;
      npcs.extraRay = (ox, oy, oz, dx, dy, dz, max) => {
        const a = this.hunting.active ? this.hunting.rayHit(ox, oy, oz, dx, dy, dz, max) : this.range.active ? this.range.rayHit(ox, oy, oz, dx, dy, dz, max) : null;
        const p = prevRay?.(ox, oy, oz, dx, dy, dz, a ? a.t : max) ?? null;
        if (p && (!a || p.t < a.t)) return p;
        return a;
      };
      npcs.extraHurt = (t, dmg) => {
        if (this.range.hurt(t)) return true;
        if (t && typeof t === 'object' && 'animal' in t) { this.hunting.hurt(t as Parameters<Hunting['hurt']>[0], dmg); return true; }
        return prevHurt?.(t, dmg) ?? false;
      };
      npcs.onGunshot = (x, z) => {
        if (this.hunting.inGrounds(x, z, 60)) { if (this.hunting.active) this.hunting.heard(x, z); return; }
        prevShot?.(x, z);
      };
    }
    // signs over the venues, the lodge and the dive shop
    const add = (text: string, glyph: string, color: string, x: number, z: number): void => {
      const sp = sign(text, glyph, color);
      sp.visible = false;
      g.world.scene.add(sp);
      this.signs.push({ s: sp, x, z });
    };
    for (const v of VENUES) add(v.name, v.glyph, v.color, v.x, v.z);
    add('Neptune Dive Shop', '◒', '#3ad0c0', DIVE_SHOP.x, DIVE_SHOP.z);
    add('Hunting Lodge', '⌖', '#c49a5a', HUNT.lodge.x, HUNT.lodge.z);
    for (const f of FISH_SPOTS) add(`Fishing · ${f.name}`, '≈', '#5ac8ff', f.x, f.z);
  }

  /** True while an activity owns the controls (no other prompts). */
  get busy(): boolean { return this.fishing.active || this.range.active; }

  private spot(id: string, x: number, z: number): { x: number; z: number } {
    let p = this.spots.get(id);
    if (!p) { p = this.s.snap(x, z, 1.4); this.spots.set(id, p); }
    return p;
  }

  offer(): { text: string; go: () => void } | null {
    const g = this.s.g;
    if (g.driving?.mode !== 'foot' || this.s.mission || this.busy) return null;
    const pos = g.player!.pos;
    const skin = this.hunting.offer();
    if (skin) return skin;
    for (const v of VENUES) {
      if (Math.abs(v.x - pos.x) > 60 || Math.abs(v.z - pos.z) > 60) continue;
      const p = this.spot(v.id, v.x, v.z);
      if (Math.hypot(p.x - pos.x, p.z - pos.z) < 3.2) return { text: `${v.name}`, go: () => g.commerce!.open(v.open(this)) };
    }
    const dive = this.diving.offer();
    if (dive) return dive;
    const lodge = this.spot('lodge', HUNT.lodge.x, HUNT.lodge.z);
    if (Math.hypot(lodge.x - pos.x, lodge.z - pos.z) < 3.2) {
      return this.hunting.active ? { text: 'Hunting Lodge (hunt in progress)', go: () => g.ui.toast('Head into the hills. Leave the grounds to finish.') } : { text: 'Go hunting (the lodge lends a rifle)', go: () => this.hunting.start() };
    }
    if ((g.wanted?.stars ?? 0) === 0 && g.player!.state !== 'swim') {
      const f = this.fishing.near(pos.x, pos.z);
      if (f) return { text: `Fish at ${f.name}`, go: () => this.fishing.start(f) };
    }
    return null;
  }

  update(dt: number): void {
    this.fishing.update(dt);
    this.hunting.update(dt);
    this.diving.update(dt);
    this.range.update(dt);
    this.signT -= dt;
    if (this.signT <= 0) {
      this.signT = 0.5;
      const p = this.s.g.camera.position;
      for (const sg of this.signs) {
        const d = Math.hypot(sg.x - p.x, sg.z - p.z);
        sg.s.visible = d < 140 && !this.s.cutscenes.active;
        if (sg.s.visible && !sg.s.userData.placed) {
          const at = this.s.snap(sg.x, sg.z, 1.4);
          sg.s.position.set(at.x, this.s.g.world.heightAt(at.x, at.z) + 3.4, at.z);
          sg.s.userData.placed = true;
        }
      }
    }
  }

  /** Where a venue is (for tests). */
  where(id: string): { x: number; z: number } | null {
    const v = VENUES.find((q) => q.id === id);
    if (v) return this.spot(v.id, v.x, v.z);
    if (id === 'lodge') return this.spot('lodge', HUNT.lodge.x, HUNT.lodge.z);
    if (id === 'dive') return this.s.snap(DIVE_SHOP.x, DIVE_SHOP.z, 1.4);
    return null;
  }

  // ---------------------------------------------------------------------------------------------- venue menus

  private rec(id: string): { plays: number; wins: number; best: number; ext: Record<string, number> } {
    return (this.s.st.acts[id] ??= { plays: 0, wins: 0, best: 0, ext: {} });
  }

  /** A paid entry: take the fee, then open the game page. */
  private entry(host: PageHost, fee: number, label: string, page: () => Page): void {
    if (!this.s.g.commerce!.eco.spend(fee, label)) { host.toast(`You need ${money(fee)}.`); return; }
    host.push(page());
  }

  private settle(host: PageHost, act: string, win: boolean, prize: number, title: string, lines: string[]): void {
    const rec = this.rec(act);
    rec.plays++;
    if (win) { this.s.g.commerce!.eco.earn(prize, title); this.s.actWin(act, 1); rec.plays--; }
    host.push(resultPage(win ? 'You win' : 'You lose', title, [...lines, win ? `Prize: +${money(prize)}` : 'Better luck next time.'], () => undefined));
  }

  private menu(title: string, kicker: string, blurb: string, rows: (host: PageHost) => HTMLElement[]): Page {
    return {
      title, kicker,
      render: (host) => { host.body.append(h('p', 'm-info', blurb), ...rows(host), btn('Leave', '', () => host.close())); },
    };
  }

  rangeMenu(): Page {
    const best = this.rec('sport.range').best;
    return this.menu('Beach shooting range', 'Shooting range', 'Forty-five seconds of pop-up targets. Red targets score one, bullseyes two; shooting a blue civilian costs three. Each medal pays the first time you earn it.', (host) => [
      row({ label: 'Pop-up targets', sub: RANGE_MEDALS.map((m) => `${m.name} ${m.at} (${money(m.pay)})`).join(' · '), right: best ? `Best ${best}` : 'Free', onClick: () => { host.close(); this.range.start(); } }),
    ]);
  }

  golfMenu(): Page {
    return this.menu('Vista Verde Links', 'Golf', 'Eighteen tees, nine of them open to the public. Beat the club pro\'s card and the pot is yours.', (host) => [
      row({ label: 'Quick round', sub: 'Three holes against the pro. $30 entry, $150 prize.', right: `${this.rec('sport.golf').wins} won`, onClick: () => this.entry(host, 30, 'Golf entry', () => golfPage(this.s, 3, (st, par, rv) => this.settle(host, 'sport.golf', st <= rv, 150, 'Golf', [`You: ${st} (${st - par >= 0 ? '+' : ''}${st - par}) · Pro: ${rv}`]))) }),
      row({ label: 'Front nine', sub: 'Nine holes. $80 entry, $600 prize.', onClick: () => this.entry(host, 80, 'Golf entry', () => golfPage(this.s, 9, (st, par, rv) => this.settle(host, 'sport.golf', st <= rv, 600, 'Golf', [`You: ${st} (${st - par >= 0 ? '+' : ''}${st - par}) · Pro: ${rv}`]))) }),
    ]);
  }

  tennisMenu(): Page {
    const tiers = [
      { label: 'Friendly', sub: 'First to 2 games against a club member.', fee: 20, prize: 100, games: 2, skill: 0.25 },
      { label: 'Club match', sub: 'First to 3 games against the club captain.', fee: 50, prize: 300, games: 3, skill: 0.55 },
      { label: 'Pro-am', sub: 'First to 4 games against a touring pro.', fee: 120, prize: 800, games: 4, skill: 0.9 },
    ];
    return this.menu('Costa Merida Tennis Club', 'Tennis', 'Hard courts by the canal. Move with left and right; swing as the ball reaches you.', (host) => tiers.map((t) => row({
      label: t.label, sub: `${t.sub} ${money(t.fee)} entry, ${money(t.prize)} prize.`, right: '',
      onClick: () => this.entry(host, t.fee, 'Tennis entry', () => tennisPage(this.s, t.games, t.skill, (win, gm) => this.settle(host, 'sport.tennis', win, t.prize, 'Tennis', [`Games: ${gm[0]}–${gm[1]}`]))),
    })));
  }

  bowlingMenu(): Page {
    return this.menu('Starlite Lanes', 'Bowling', 'Neon, rental shoes and a regular who bowls a 190 in his sleep.', (host) => [
      row({ label: 'Ten frames', sub: 'Beat the regular\'s score. $20 lane fee, $150 prize.', right: `${this.rec('sport.bowling').wins} won`, onClick: () => this.entry(host, 20, 'Lane fee', () => bowlingPage(this.s, (me, rv) => this.settle(host, 'sport.bowling', me > rv, 150, 'Bowling', [`You: ${me} · Regular: ${rv}`]))) }),
    ]);
  }

  hoopsMenu(): Page {
    return this.menu('Seaside courts', 'Hoops', 'A sixty-second shootout. Five racks; the gold money ball counts double.', (host) => [
      row({ label: 'Shootout', sub: '$10 to play, $80 if you beat the local record.', right: `${this.rec('sport.hoops').wins} won`, onClick: () => this.entry(host, 10, 'Hoops', () => hoopsPage(this.s, (me, rv) => this.settle(host, 'sport.hoops', me > rv, 80, 'Hoops', [`You: ${me} · Record: ${rv}`]))) }),
    ]);
  }

  armMenu(): Page {
    const beaten = this.rec('sport.arm').ext;
    return this.menu('Muscle Beach', 'Arm wrestling', 'Three champions hold the tables. Beat each one to face the next.', (host) => ARM_RIVALS.map((r, i) => {
      const fee = [20, 50, 100][i]!, prize = [60, 160, 450][i]!;
      const locked = i > 0 && !beaten['t' + (i - 1)];
      return row({
        label: r.name, sub: locked ? 'Beat the previous champion first.' : `${r.line} ${money(fee)} to play, ${money(prize)} to win.`, right: beaten['t' + i] ? 'Beaten' : '', disabled: locked,
        onClick: () => this.entry(host, fee, 'Arm wrestling', () => armPage(this.s, i, (win) => {
          const first = win && !beaten['t' + i];
          if (win) beaten['t' + i] = 1;
          const rec = this.rec('sport.arm');
          rec.plays++;
          if (win) this.s.g.commerce!.eco.earn(prize, 'Arm wrestling');
          if (first) this.s.actWin('sport.arm');
          host.push(resultPage(win ? 'You win' : 'You lose', 'Arm wrestling', [win ? `${r.name} taps out. +${money(prize)}` : `${r.name} slams your hand on the table.`], () => undefined));
        })),
      });
    }));
  }
}
