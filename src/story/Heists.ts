import { btn, row, section, type Page } from '../ui/Modal';
import { money } from '../economy/Economy';
import { h } from '../ui/dom';
import { APPROACHES, HEISTS, PREPS, execMission, type Approach, type HeistDef } from './content/heists';
import { crewPage, crewSub } from '../crew/CrewUi';
import { ROSTER } from '../crew/roster';
import { Site, type SiteCfg } from './Sites';
import type { Story } from './Story';
import type { HeistRecord } from './types';

const BOARD = 'board';

/** Heist boards, planning (approach, crew, prep) and the interiors the jobs happen in. */
export class Heists {
  site: Site | null = null;
  transitioning = false;
  inside = false;
  private outside = { x: 0, z: 0, yaw: 0 };
  /** The last pay-out (for the result card). */
  lastResult: { gross: number; perf: number; cuts: number; net: number; alarm: boolean; notes: string[] } | null = null;
  private boardId = -1;
  private boardPos = { x: 0, z: 0 };

  constructor(readonly s: Story) {}

  // ------------------------------------------------------------------------------------------- state

  record(id: string): HeistRecord {
    return (this.s.st.heists[id] ??= { done: false, approach: null, prep: [], crew: [], take: 0, plays: 0 });
  }

  unlock(id: string): void { this.s.st.flags[`heist:${id}`] = true; this.s.g.commerce?.refreshMarkers(); }

  unlocked(id: string): boolean { return !!this.s.st.flags[`heist:${id}`]; }

  list(): HeistDef[] { return HEISTS.filter((x) => this.unlocked(x.id)); }

  /** A heist just finished. */
  finishJob(hd: HeistDef, approach: Approach, net: number): void {
    const rec = this.record(hd.id);
    rec.done = true;
    rec.plays++;
    rec.approach = approach;
    rec.take = Math.max(rec.take, net);
    const next = HEISTS[HEISTS.findIndex((x) => x.id === hd.id) + 1];
    if (next && !this.unlocked(next.id)) {
      this.unlock(next.id);
      this.s.g.commerce?.eco.message('Pruitt', next.id === 'h2' ? 'Two for two soon, I hope. Silas Quinn, a hacker I trust, has asked to join you. The bank is next.' : `${next.name}: the file is on the heist board.`);
    }
  }

  prepDone(hd: HeistDef, a: Approach): boolean {
    const rec = this.record(hd.id);
    return hd.prep[a].every((p) => rec.prep.includes(p) || this.s.done(p));
  }

  // ------------------------------------------------------------------------------------------- the board in the world

  private spot(): { x: number; z: number } {
    const w = this.s.place('home.mack');
    return this.s.snap(w.x + 5, w.z + 2, 1.6);
  }

  boardPoint(): { x: number; z: number } { return this.spot(); }

  markerKey(): string { return this.list().map((x) => x.id + (this.record(x.id).done ? 'd' : '')).join(','); }

  addMarkers(ids: Map<string, number>): void {
    if (!this.list().length) return;
    const p = this.spot();
    this.boardPos = p;
    const id = this.s.beacons.add(p.x, p.z, { color: '#4aa8ff', glyph: '✦', name: 'Heist board', r: 2.6, tall: 10 });
    ids.set(BOARD, id);
    this.boardId = id;
  }

  nearBoard(x: number, z: number, r: number): { id: string; prompt: string } | null {
    if (this.boardId < 0 || !this.list().length) return null;
    if (Math.hypot(this.boardPos.x - x, this.boardPos.z - z) > r) return null;
    return { id: BOARD, prompt: 'Heist board' };
  }

  update(_dt: number): void { /* interiors are driven by the mission */ }

  // ------------------------------------------------------------------------------------------- interiors

  /** Build the set and move the player into it (with a fade). */
  enter(cfg: SiteCfg): Site {
    const g = this.s.g;
    if (this.site) this.dispose();
    const site = new Site(g, cfg);
    this.site = site;
    this.transitioning = true;
    this.s.fadeThrough(() => {
      site.enable();
      const pl = g.player!;
      this.outside = { x: pl.pos.x, z: pl.pos.z, yaw: pl.yaw };
      const p = site.at(site.spots.door[0], site.spots.door[1] + 1.0);
      pl.teleport(p.x, p.z, Math.PI);
      g.world.city.warm(p.x, p.z);
      this.inside = true;
      this.transitioning = false;
    }, 250);
    return site;
  }

  /** Back to the street. */
  leave(): void {
    const g = this.s.g;
    if (!this.inside) { this.transitioning = false; return; }
    this.transitioning = true;
    this.s.fadeThrough(() => {
      g.player!.teleport(this.outside.x, this.outside.z, this.outside.yaw);
      g.world.city.warm(this.outside.x, this.outside.z);
      this.inside = false;
      this.s.hostiles.clear();
      this.site?.dispose();
      this.site = null;
      this.transitioning = false;
    }, 250);
  }

  /** Remove the set (quitting or failing mid-job puts the player back on the street). */
  dispose(): void {
    const g = this.s.g;
    if (this.inside && g.player) {
      g.player.teleport(this.outside.x, this.outside.z, this.outside.yaw);
      this.inside = false;
    }
    this.s.hostiles.clear();
    this.site?.dispose();
    this.site = null;
    this.transitioning = false;
  }

  // ------------------------------------------------------------------------------------------- planning UI

  openBoard(_id?: string): void {
    const cm = this.s.g.commerce!;
    cm.open(this.listPage());
  }

  private listPage(): Page {
    return {
      title: 'Heist board',
      kicker: 'Plan the next job',
      hideMoney: false,
      hints: 'Pick a job · Esc back',
      render: (host) => {
        for (const hd of this.list()) {
          const rec = this.record(hd.id);
          host.body.append(row({
            label: hd.name, sub: hd.blurb, badge: rec.done ? 'Done' : undefined, right: rec.take ? `Best ${money(rec.take)}` : '',
            onClick: () => host.push(this.heistPage(hd)),
          }));
        }
        host.body.append(h('p', 'm-info', 'More heists (armoured convoy, casino vault, cargo train, the yacht) arrive in later updates.'));
      },
    };
  }

  private heistPage(hd: HeistDef): Page {
    const rec = this.record(hd.id);
    return {
      title: hd.name, kicker: 'Planning', hints: 'Choose an approach, a crew, finish the prep, then go',
      render: (host) => {
        const a = rec.approach;
        host.body.append(h('div', 'st-block', h('h3', '', hd.site.name), h('p', '', hd.blurb)));
        host.body.append(section('Approach'));
        for (const ap of APPROACHES) {
          const done = this.prepDone(hd, ap);
          host.body.append(row({
            label: ap[0]!.toUpperCase() + ap.slice(1), sub: hd.approachText[ap], selected: a === ap,
            right: done ? 'Prep ready' : `Prep ${hd.prep[ap].filter((p) => rec.prep.includes(p) || this.s.done(p)).length}/${hd.prep[ap].length}`,
            onClick: () => { rec.approach = ap; host.refresh(); },
          }));
        }
        host.body.append(section('Crew (up to four)'));
        const picked = rec.crew;
        const hired = ROSTER.filter((d) => this.s.crew.hired().includes(d));
        if (!hired.length) host.body.append(h('p', 'm-info', 'No crew yet: recruit people below.'));
        for (const d of hired) {
          const u = this.s.crew.usable(d.id);
          host.body.append(row({
            label: d.name, sub: u.ok ? crewSub(this.s, d) : `${crewSub(this.s, d)} — ${u.why}`, right: `${Math.round(d.cut * 100)}%`, selected: picked.includes(d.id) && u.ok, disabled: !u.ok,
            onClick: () => { const i = picked.indexOf(d.id); if (i >= 0) picked.splice(i, 1); else if (picked.filter((x) => this.s.crew.usable(x).ok).length < 4) picked.push(d.id); else host.toast('Four is a full crew'); host.refresh(); },
          }));
        }
        host.body.append(row({ label: 'Recruit and manage crew', sub: 'Hire specialists, pay bonuses, see who is hurt', onClick: () => host.push(crewPage(this.s)) }));
        if (a) {
          host.body.append(section('Prep'));
          for (const id of hd.prep[a]) {
            const done = rec.prep.includes(id) || this.s.done(id);
            const pd = PREPS.find((p) => p.id === id)!;
            host.body.append(row({
              label: pd.title, sub: pd.blurb, right: done ? 'Done' : 'Start', selected: done,
              onClick: () => {
                if (done) return;
                host.close();
                const def = this.s.defOf(id);
                if (def) this.s.startMission(def);
              },
            }));
          }
          const ready = this.prepDone(hd, a);
          host.body.append(btn(ready ? `Start the job (${a})` : 'Finish the prep first', ready ? 'primary' : '', () => {
            if (!ready) return;
            host.close();
            const crew = this.chosenCrew(rec);
            const def = execMission(hd, { approach: a, crew, prepDone: [...hd.prep[a]], fx: this.s.crew.effects(crew, a) });
            this.s.startMission(def);
          }));
        } else host.body.append(h('p', 'm-info', 'Choose an approach to see its prep jobs.'));
      },
    };
  }

  private chosenCrew(rec: HeistRecord): string[] {
    return rec.crew.filter((id) => this.s.crew.usable(id).ok);
  }
}

