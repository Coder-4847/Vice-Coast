import type { Story } from '../story/Story';
import { money } from '../economy/Economy';
import { h } from '../ui/dom';
import { row, section, type Page } from '../ui/Modal';
import { ROLE_EFFECT, ROLE_LABEL, ROSTER, type CrewDef } from './roster';

export const starsText = (n: number): string => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));

/** One line describing a crew member for lists. */
export function crewSub(s: Story, d: CrewDef): string {
  const r = s.crew.record(d.id);
  const bits = [`${ROLE_LABEL[d.role]} ${starsText(s.crew.skill(d.id))}`, `${Math.round(d.cut * 100)}% cut`];
  if (r.hired) bits.push(s.crew.mood(d.id));
  return bits.join(' · ');
}

/** Recruit people and keep them happy. Shared by the heist board and the phone. */
export function crewPage(s: Story): Page {
  return {
    title: 'Crew',
    kicker: 'Recruit, pay bonuses, check on people',
    hints: 'Pick a person · Esc back',
    render: (host) => {
      const hired = s.crew.hired();
      host.body.append(h('p', 'm-info', hired.length ? `${hired.length} on the crew. Bonuses ($2,500) buy loyalty; hurt people are out for a few days; the dead stay dead.` : 'Nobody yet. Recruit someone below, or finish story missions and heists to meet people who join for free.'));
      for (const d of ROSTER) {
        const r = s.crew.record(d.id);
        let right = '', disabled = false, onClick: (() => void) | undefined;
        if (r.status === 'dead') { right = 'Dead'; disabled = true; }
        else if (r.status === 'quit') { right = 'Gone'; disabled = true; }
        else if (r.hired) {
          const u = s.crew.usable(d.id);
          right = r.status === 'hurt' ? `Out until day ${r.healDay}` : `Bonus ${money(2500)}`;
          disabled = r.status === 'hurt' && !u.ok && r.loyalty >= 100;
          onClick = () => { if (s.crew.bonus(d.id)) { host.toast(`${d.name} appreciates it`); host.refresh(); } else host.toast('Not enough money'); };
        } else {
          const c = s.crew.canRecruit(d);
          right = d.story ? 'Story' : money(d.fee);
          disabled = !c.ok;
          onClick = () => { if (s.crew.recruit(d.id)) host.refresh(); };
        }
        host.body.append(row({
          label: d.name, sub: `${crewSub(s, d)} — ${r.hired ? ROLE_EFFECT[d.role] : d.blurb}`, right, disabled,
          badge: r.hired ? (r.status === 'hurt' ? 'Hurt' : 'Crew') : '', selected: r.hired && r.status === 'ok', onClick,
        }));
      }
      host.body.append(section(''));
    },
  };
}
