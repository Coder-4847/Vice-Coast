import type { Story } from '../story/Story';
import type { CrewRec } from '../story/types';
import { ROSTER, ROSTER_BY_ID, type CrewDef } from './roster';

export type Approach = 'loud' | 'quiet' | 'smart';

/** What a chosen crew does to one job. 1 = no change; smaller = better. */
export interface CrewFx {
  camScale: number;
  vaultScale: number;
  lockScale: number;
  /** Wanted stars removed when you leave. */
  starsOff: number;
  gunmen: CrewDef[];
  cuts: number;
  ids: string[];
}

export interface Outcome { approach: Approach; alarm: boolean; success: boolean; downed: Set<string> }

const MIN_LOYALTY = 15;

/**
 * The crew: who you have hired, how loyal they are, who is hurt or dead, and what they do for a job. Story-given crew join
 * on their own; everyone else is recruited for a fee. Loyalty rises with clean jobs and bonuses and falls when people get hurt.
 */
export class Crew {
  constructor(private readonly s: Story) {}

  private get rec(): Record<string, CrewRec> { return this.s.st.crew; }

  record(id: string): CrewRec {
    return (this.rec[id] ??= { hired: false, loyalty: 55, status: 'ok', healDay: 0, jobs: 0, xp: 0 });
  }

  def(id: string): CrewDef | undefined { return ROSTER_BY_ID[id]; }

  /** Roster skill plus what they have learned on the job. */
  skill(id: string): number {
    const d = ROSTER_BY_ID[id];
    return d ? Math.min(5, d.skill + this.record(id).xp) : 0;
  }

  /** Have the story's own recruits joined yet? */
  storyOpen(d: CrewDef): boolean {
    if (!d.story) return false;
    if (d.story.mission && !this.s.done(d.story.mission)) return false;
    if (d.story.heist && !this.s.heists.record(d.story.heist).done) return false;
    return true;
  }

  /** Auto-hire the people the story hands you. */
  sync(): void {
    for (const d of ROSTER) {
      if (!d.story) continue;
      const r = this.record(d.id);
      if (!r.hired && r.status !== 'dead' && this.storyOpen(d)) {
        r.hired = true;
        r.loyalty = 70;
        this.s.g.commerce?.eco.message(d.name, `I'm in if you need me. ${d.role === 'gunman' ? 'Just point me at somebody.' : 'Call me for the next job.'}`);
      }
    }
  }

  hired(): CrewDef[] {
    return ROSTER.filter((d) => this.record(d.id).hired && this.record(d.id).status !== 'dead' && this.record(d.id).status !== 'quit');
  }

  /** Can this person work the next job? Returns a reason when they cannot. */
  usable(id: string): { ok: boolean; why: string } {
    const r = this.record(id);
    if (!r.hired) return { ok: false, why: 'Not hired' };
    if (r.status === 'dead') return { ok: false, why: 'Dead' };
    if (r.status === 'quit') return { ok: false, why: 'Walked away' };
    if (r.status === 'hurt') return { ok: false, why: `Recovering until day ${r.healDay}` };
    if (r.loyalty < MIN_LOYALTY) return { ok: false, why: 'Won\'t work with you: pay a bonus' };
    return { ok: true, why: '' };
  }

  canRecruit(d: CrewDef): { ok: boolean; why: string } {
    const r = this.record(d.id);
    if (r.hired) return { ok: false, why: 'Already on the crew' };
    if (r.status === 'dead') return { ok: false, why: 'Dead' };
    if (r.status === 'quit') return { ok: false, why: 'Won\'t come back' };
    if (d.story) return { ok: false, why: 'Joins through the story' };
    if (!this.s.g.commerce!.eco.canAffordTotal(d.fee)) return { ok: false, why: 'Cannot afford the fee' };
    return { ok: true, why: '' };
  }

  recruit(id: string): boolean {
    const d = ROSTER_BY_ID[id];
    if (!d || !this.canRecruit(d).ok) return false;
    const eco = this.s.g.commerce!.eco;
    if (!eco.charge(d.fee, `Recruited ${d.name}`)) return false;
    const r = this.record(id);
    r.hired = true;
    r.loyalty = 55;
    r.status = 'ok';
    this.s.g.ui.toast(`${d.name} joined the crew`);
    return true;
  }

  /** A bonus buys loyalty. */
  bonus(id: string, amount = 2500): boolean {
    const eco = this.s.g.commerce!.eco;
    const r = this.record(id);
    if (!r.hired || r.status === 'dead' || r.status === 'quit') return false;
    if (!eco.charge(amount, 'Crew bonus')) return false;
    r.loyalty = Math.min(100, r.loyalty + 10);
    return true;
  }

  mood(id: string): string {
    const l = this.record(id).loyalty;
    return l >= 80 ? 'Devoted' : l >= 55 ? 'Loyal' : l >= 30 ? 'Wavering' : 'About to walk';
  }

  // ------------------------------------------------------------------------------------------- a job

  effects(ids: string[], _approach: Approach): CrewFx {
    const fx: CrewFx = { camScale: 1, vaultScale: 1, lockScale: 1, starsOff: 0, gunmen: [], cuts: 0, ids };
    for (const id of ids) {
      const d = ROSTER_BY_ID[id];
      if (!d) continue;
      const sk = this.skill(id);
      fx.cuts += d.cut;
      switch (d.role) {
        case 'hacker': fx.camScale *= 1 - 0.14 * sk; fx.vaultScale *= 1 - 0.07 * sk; break;
        case 'lockpicker': fx.lockScale *= 1 - 0.1 * sk; break;
        case 'driver': fx.starsOff += sk >= 4 ? 2 : 1; break;
        case 'pilot': fx.starsOff += sk >= 3 ? 1 : 0; break;
        case 'demolitions': fx.vaultScale *= 1 - 0.08 * sk; break;
        case 'gunman': fx.gunmen.push(d); break;
        default:
      }
    }
    fx.starsOff = Math.min(3, fx.starsOff);
    fx.camScale = Math.max(0.15, fx.camScale);
    fx.vaultScale = Math.max(0.35, fx.vaultScale);
    fx.lockScale = Math.max(0.4, fx.lockScale);
    return fx;
  }

  /** The extra cut a disloyal crew member takes. */
  skim(ids: string[]): number {
    return ids.filter((id) => this.record(id).loyalty < 30).length * 0.05;
  }

  /**
   * After a job: who got hurt or killed, who learned something, who is happier. Returns lines for the result card.
   * Risk grows with a loud approach and a raised alarm and shrinks with skill; anyone dropped in the field is far worse off.
   */
  settle(ids: string[], o: Outcome): string[] {
    const eco = this.s.g.commerce!.eco;
    const lines: string[] = [];
    const base = o.approach === 'loud' ? 0.18 : o.approach === 'quiet' ? 0.05 : 0.03;
    for (const id of ids) {
      const d = ROSTER_BY_ID[id];
      if (!d) continue;
      const r = this.record(id);
      const sk = this.skill(id);
      const downed = o.downed.has(id);
      const risk = downed ? 0.9 : Math.min(0.6, (base + (o.alarm ? 0.08 : 0)) * (1.25 - 0.15 * sk) * (d.role === 'gunman' ? 1.3 : 1));
      r.jobs++;
      let hurt = false;
      if (Math.random() < risk) {
        hurt = true;
        const deadShare = downed ? 0.3 : o.approach === 'loud' ? 0.12 : 0.04;
        if (Math.random() < deadShare) {
          r.status = 'dead';
          lines.push(`${d.name} did not make it.`);
          eco.message('Pruitt', `${d.name} is dead. I'm sorry. I will see that the family hears something true.`);
        } else {
          r.status = 'hurt';
          r.healDay = eco.p.day + 2 + Math.floor(Math.random() * 3);
          r.loyalty = Math.max(0, r.loyalty - 8);
          lines.push(`${d.name} was hurt and is out until day ${r.healDay}.`);
        }
      }
      if (r.status === 'dead') continue;
      if (!hurt) {
        r.loyalty = Math.min(100, r.loyalty + (o.success ? 5 : -6));
        if (o.success && r.jobs % 3 === 0 && this.skill(id) < 5) { r.xp++; lines.push(`${d.name} improved: skill ${this.skill(id)}.`); }
      }
      if (r.loyalty < 5 && r.status !== 'hurt') {
        r.status = 'quit';
        lines.push(`${d.name} has had enough and walked away.`);
        eco.message(d.name, 'We\'re done. Don\'t call.');
      }
    }
    return lines;
  }

  /** A new day: the injured recover. */
  onNewDay(day: number): void {
    for (const d of ROSTER) {
      const r = this.record(d.id);
      if (r.status === 'hurt' && day >= r.healDay) {
        r.status = 'ok';
        if (r.hired) this.s.g.commerce?.eco.message(d.name, 'Back on my feet. Say the word.');
      }
    }
  }
}
