import { stocksApp } from '../economy/stocks';
import type { Commerce } from '../economy/Commerce';
import { PROPERTIES, SHOWROOM } from '../economy/catalog';
import { money } from '../economy/Economy';
import { VEHICLES } from '../vehicles/specs';
import { h } from './dom';
import { MenuNav } from './MenuNav';
import { CHARS } from '../story/chars';
import { Story } from '../story/Story';
import { crewPage } from '../crew/CrewUi';
import { toolkitPage } from '../minigames/skill';
import { CHAR_IDS } from '../story/types';
import { row, section } from './Modal';

interface App { id: string; name: string; glyph: string; color: string }

const APPS: App[] = [
  { id: 'messages', name: 'Messages', glyph: '✉', color: '#4aa8ff' },
  { id: 'contacts', name: 'Contacts', glyph: '☎', color: '#5ad17a' },
  { id: 'map', name: 'Maps', glyph: '⌖', color: '#ff7a59' },
  { id: 'bank', name: 'Bank', glyph: '$', color: '#7be28f' },
  { id: 'taxi', name: 'Cab', glyph: '◈', color: '#ffd166' },
  { id: 'garage', name: 'Garage', glyph: '⚙', color: '#c0c4cc' },
  { id: 'motors', name: 'Motors', glyph: '▣', color: '#ff8a5c' },
  { id: 'realty', name: 'Realty', glyph: '⌂', color: '#9a7aff' },
  { id: 'insurance', name: 'Insure', glyph: '◉', color: '#ff6a6a' },
  { id: 'missions', name: 'Missions', glyph: '★', color: '#ffd166' },
  { id: 'switch', name: 'Switch', glyph: '⇄', color: '#4aa8ff' },
  { id: 'crew', name: 'Crew', glyph: '☻', color: '#ff7a59' },
  { id: 'progress', name: 'Progress', glyph: '%', color: '#ffb347' },
  { id: 'stocks', name: 'Stocks', glyph: '↗', color: '#38d39f' },
  { id: 'toolkit', name: 'Toolkit', glyph: '⚿', color: '#7ad7e0' },
  { id: 'camera', name: 'Camera', glyph: '◐', color: '#e8e9ec' },
];

/**
 * The phone: a slide-up overlay while the game keeps running. Messages, contacts you can ring (cab, mechanic, insurer),
 * maps, your bank, online car and property listings, and a camera that saves a PNG.
 */
export class Phone {
  readonly root: HTMLElement;
  private readonly screen: HTMLElement;
  private readonly title: HTMLElement;
  private readonly clockEl: HTMLElement;
  private readonly back: HTMLButtonElement;
  private readonly nav: MenuNav;
  private readonly stack: { name: string; build: (el: HTMLElement) => void }[] = [];
  private opened = false;
  onClose: (() => void) | null = null;

  constructor(parent: HTMLElement, private readonly c: Commerce) {
    this.back = h('button', 'ph-back', '‹');
    this.back.type = 'button';
    this.back.dataset.navRow = '';
    this.back.addEventListener('click', () => this.pop());
    this.title = h('span', 'ph-title', '');
    this.clockEl = h('span', 'ph-clock', '');
    const bar = h('div', 'ph-bar', this.back, this.title, this.clockEl);
    this.screen = h('div', 'ph-screen');
    const home = h('div', 'ph-home-bar');
    this.root = h('div', 'phone is-hidden', h('div', 'ph-notch'), bar, this.screen, home);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Phone');
    parent.append(this.root);
    this.nav = new MenuNav(this.root);
    c.eco.on('message', () => { if (this.opened && this.stack.length === 1) this.render(); });
  }

  get isOpen(): boolean { return this.opened; }

  open(): void {
    this.opened = true;
    this.stack.length = 0;
    this.stack.push({ name: 'Phone', build: (el) => this.home(el) });
    this.root.classList.remove('is-hidden');
    this.render(true);
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.root.classList.add('is-hidden');
    (document.activeElement as HTMLElement | null)?.blur();
    this.onClose?.();
  }

  /** Back one screen, or close from the home screen. */
  pop(): void {
    if (this.stack.length > 1) { this.stack.pop(); this.render(true); } else this.close();
  }

  navigate(dx: number, dy: number): void { this.nav.move(dx, dy); }
  confirm(): void { this.nav.confirm(); }

  tick(): void {
    this.clockEl.textContent = this.c.game.world.tod.clock;
  }

  private push(name: string, build: (el: HTMLElement) => void): void {
    this.stack.push({ name, build });
    this.render(true);
  }

  private render(focus = false): void {
    const top = this.stack[this.stack.length - 1]!;
    this.title.textContent = top.name;
    this.back.classList.toggle('is-hidden', this.stack.length === 1);
    this.clockEl.textContent = this.c.game.world.tod.clock;
    const scroll = this.screen.scrollTop;
    this.screen.textContent = '';
    this.screen.className = 'ph-screen';
    top.build(this.screen);
    if (focus) this.nav.focusFirst(); else this.screen.scrollTop = scroll;
  }

  // ---------------------------------------------------------------------------------------------- home

  private home(el: HTMLElement): void {
    el.classList.add('ph-grid-screen');
    const unread = this.c.eco.unread;
    const rows: HTMLElement[] = [];
    for (let i = 0; i < APPS.length; i += 3) {
      const r = h('div', 'ph-apps');
      r.dataset.navRow = '';
      for (const a of APPS.slice(i, i + 3)) {
        const icon = h('span', 'ph-icon', a.glyph);
        icon.style.background = a.color;
        const b = h('button', 'ph-app', icon, h('span', '', a.name), a.id === 'messages' && unread ? h('i', 'ph-badge', String(unread)) : null);
        b.type = 'button';
        b.addEventListener('click', () => this.launch(a.id));
        r.append(b);
      }
      rows.push(r);
    }
    el.append(...rows);
    el.append(h('div', 'ph-foot', `${money(this.c.eco.cash)} cash · ${money(this.c.eco.bank)} in the bank`));
  }

  private launch(id: string): void {
    const g = this.c.game;
    switch (id) {
      case 'messages': this.push('Messages', (el) => this.messages(el)); break;
      case 'contacts': this.push('Contacts', (el) => this.contacts(el)); break;
      case 'map': this.close(); g.openMap(); break;
      case 'bank': this.push('Valeria Savings', (el) => this.bank(el)); break;
      case 'taxi': this.push('Marlow Cab', (el) => this.taxi(el)); break;
      case 'garage': this.push('Garage', (el) => this.garage(el)); break;
      case 'motors': this.push('Valeria Motors', (el) => this.motors(el)); break;
      case 'realty': this.push('Valeria Realty', (el) => this.realty(el)); break;
      case 'insurance': this.push('Mors Mutual', (el) => this.insurance(el)); break;
      case 'missions': this.push('Missions', (el) => this.missions(el)); break;
      case 'switch': this.push('Characters', (el) => this.characters(el)); break;
      case 'progress': this.push('Progress', (el) => { const st = this.c.game.story; if (st) st.completion.render(el, { onMark: (k) => { const p = this.c.game.player!; const it = st.collect.nearest(k as import('../collect/defs').CKind, p.pos.x, p.pos.z); if (it) { this.c.game.map.setWaypoint({ x: it.x, z: it.z }); this.c.game.ui.toast('Waypoint set'); } } }); }); break;
      case 'toolkit': this.close(); setTimeout(() => { const st = this.c.game.story; if (st) this.c.open(toolkitPage(st)); }, 400); break;
      case 'crew': this.close(); setTimeout(() => { const st = this.c.game.story; if (st) this.c.open(crewPage(st)); }, 400); break;
      case 'stocks': { const st = this.c.game.story; if (st) { const open = (): void => { this.stack.pop(); this.push('Verano Exchange', (el) => stocksApp(st, el, open)); }; this.push('Verano Exchange', (el) => stocksApp(st, el, open)); } break; }
      case 'camera': this.close(); setTimeout(() => this.c.photo(), 450); break;
      default:
    }
  }

  // ---------------------------------------------------------------------------------------------- apps

  private messages(el: HTMLElement): void {
    const list = this.c.eco.p.messages;
    if (!list.length) el.append(h('p', 'm-info', 'No messages.'));
    for (const m of list) {
      const r = row({ label: m.from, sub: m.text, badge: m.read ? '' : 'New', right: `Day ${m.day}`, onClick: () => { m.read = true; this.render(); } });
      r.classList.add('ph-msg');
      el.append(r);
    }
    for (const m of list) m.read = true;
  }

  private contacts(el: HTMLElement): void {
    const call = (name: string, line: string, action?: () => void): void => {
      this.push(name, (e) => {
        e.append(h('div', 'ph-call', h('div', 'ph-avatar', name[0]!), h('b', '', name), h('span', 'muted', 'calling…')));
        setTimeout(() => {
          if (this.stack[this.stack.length - 1]?.name !== name) return;
          e.append(h('p', 'm-info ph-line', line));
          if (action) e.append(row({ label: 'Continue', onClick: () => { this.pop(); action(); } }));
          e.append(row({ label: 'Hang up', onClick: () => this.pop() }));
          this.nav.focusFirst();
        }, 900);
        e.append(row({ label: 'Hang up', onClick: () => this.pop() }));
      });
    };
    el.append(
      row({ label: 'Marlow Cab Co.', sub: 'Door to door, anywhere in San Verano', onClick: () => call('Marlow Cab Co.', '“Cab’s on its way. Where are we headed? Set a waypoint on your map and use the Cab app.”', () => this.push('Marlow Cab', (e) => this.taxi(e))) }),
      row({ label: 'Redline Rick (mechanic)', sub: 'Brings your car to you', onClick: () => call('Redline Rick', '“Which one do you want, boss? $150 and I’ll have it there in a flash.”', () => this.push('Garage', (e) => this.garage(e))) }),
      row({ label: 'Mors Mutual', sub: 'Insurance claims', onClick: () => call('Mors Mutual', '“Please hold… Thank you. Which vehicle was written off?”', () => this.push('Mors Mutual', (e) => this.insurance(e))) }),
      row({ label: 'Valeria Savings', sub: 'Your bank', onClick: () => call('Valeria Savings', '“Good day. Your balance is available in the Bank app.”') }),
      row({ label: 'Pound & Paws shelter', sub: this.c.game.story?.st.flags.dog ? 'Rufus says hi' : 'Adopt a dog: $500', onClick: () => call('Pound & Paws', this.c.game.story?.st.flags.dog ? '“How is Rufus doing? Give him a scratch behind the ears from us.”' : '“We have a big golden boy called Rufus who needs a home. Five hundred dollars and he is yours.”', this.c.game.story?.st.flags.dog ? undefined : () => this.c.game.animals?.adopt()) }),
      row({ label: 'Mom', sub: 'You should call more often', onClick: () => call('Mom', '“Honey? Are you eating? You sound tired. Call me Sunday.”') }),
    );
  }

  private bank(el: HTMLElement): void {
    const e = this.c.eco;
    el.append(
      h('div', 'm-balance', h('div', 'm-kv', h('span', '', 'Cash'), h('b', '', money(e.cash))), h('div', 'm-kv', h('span', '', 'Account'), h('b', '', money(e.bank))), h('div', 'm-kv', h('span', '', 'Earned in total'), h('b', '', money(e.p.stats.earned))), h('div', 'm-kv', h('span', '', 'Spent in total'), h('b', '', money(e.p.stats.spent)))),
      row({ label: 'Move $1,000 to the account', disabled: e.cash < 1000, onClick: () => { e.deposit(1000); this.render(); } }),
      row({ label: 'Move $1,000 to cash', disabled: e.bank < 1000, onClick: () => { e.withdraw(1000); this.render(); } }),
      h('p', 'm-info', 'Cash is lost when you are Wasted or Busted. Property upkeep is taken from the account.'),
    );
    for (const o of e.p.props) el.append(h('div', 'm-kv', h('span', '', PROPERTIES.find((p) => p.id === o.id)!.name), h('b', '', `${money(PROPERTIES.find((p) => p.id === o.id)!.upkeep)} / day`)));
  }

  private taxi(el: HTMLElement): void {
    const wp = this.c.game.map.waypoint;
    const p = this.c.game.player!;
    if (!wp) { el.append(h('p', 'm-info', 'Set a waypoint on the map first: open Maps, click where you want to go.'), row({ label: 'Open maps', onClick: () => { this.close(); this.c.game.openMap(); } })); return; }
    const d = Math.hypot(wp.x - p.pos.x, wp.z - p.pos.z);
    const fare = Math.round(18 + d * 0.045);
    el.append(
      h('div', 'm-balance', h('div', 'm-kv', h('span', '', 'Distance'), h('b', '', `${(d / 1000).toFixed(1)} km`)), h('div', 'm-kv', h('span', '', 'Fare'), h('b', '', money(fare)))),
      row({ label: 'Take me there', right: money(fare), disabled: this.c.eco.worth < fare, onClick: () => { if (this.c.taxi(wp.x, wp.z)) this.close(); } }),
    );
  }

  private garage(el: HTMLElement): void {
    const e = this.c.eco;
    if (!e.p.vehicles.length) { el.append(h('p', 'm-info', 'You do not own any vehicles. Buy one at Valeria Motors, or register one at Redline Customs.')); return; }
    el.append(h('p', 'm-info', 'Redline Rick will bring any of your cars to where you are for $150.'));
    for (const o of e.p.vehicles) {
      const sp = VEHICLES[o.spec]!;
      const where = o.where.kind === 'stored' ? 'In a garage' : o.where.kind === 'destroyed' ? 'Written off' : 'Out in the city';
      el.append(row({ label: `${sp.name} · ${o.custom.plate}`, swatch: o.custom.color, sub: where, right: o.where.kind === 'destroyed' ? '' : '$150', disabled: o.where.kind === 'destroyed' || e.worth < 150, onClick: () => { if (this.c.deliverVehicle(o)) this.close(); } }));
    }
  }

  private insurance(el: HTMLElement): void {
    const e = this.c.eco;
    const wrecks = e.p.vehicles.filter((v) => v.where.kind === 'destroyed');
    if (!wrecks.length) { el.append(h('p', 'm-info', 'No open claims. If one of your cars is written off, it will show up here.')); return; }
    for (const o of wrecks) el.append(row({ label: `${VEHICLES[o.spec]!.name} · ${o.custom.plate}`, sub: 'Claim: replaced and repaired', right: money(e.insuranceFee(o)), disabled: e.worth < e.insuranceFee(o), onClick: () => { if (this.c.claimInsurance(o)) this.render(); } }));
  }

  private motors(el: HTMLElement): void {
    const e = this.c.eco;
    const garage = e.p.props.map((p) => PROPERTIES.find((d) => d.id === p.id)!).find((d) => d.bays === 'car' && e.stored(d.id).length < d.slots);
    el.append(h('p', 'm-info', garage ? `Online orders are delivered to ${garage.name}.` : 'You need a garage with a free space to order online: buy a property first, or visit the showroom.'));
    for (const id of SHOWROOM) {
      const sp = VEHICLES[id]!;
      el.append(row({
        label: sp.name, swatch: sp.body.color, sub: `${sp.engine.topSpeedKmh} km/h top speed`, right: money(sp.price), disabled: !garage || e.worth < sp.price,
        onClick: () => {
          if (!garage || !e.charge(sp.price, `Bought ${sp.name}`)) return;
          e.addVehicle(id, this.c.defaultCustomFor(id), sp.price, garage.id);
          this.c.game.ui.toast(`${sp.name} delivered to ${garage.name}`);
          void this.c.save(this.c.slot ?? 1, true);
          this.render();
        },
      }));
    }
  }

  private realty(el: HTMLElement): void {
    const e = this.c.eco;
    el.append(h('p', 'm-info', 'Visit a property to buy it. Pick one to mark it on your map.'));
    for (const d of PROPERTIES) {
      const own = e.owns(d.id);
      el.append(row({
        label: d.name, sub: `${d.region} · ${d.kind} · upkeep ${money(d.upkeep)}/day`, badge: own ? 'Owned' : '', right: own ? '' : money(d.price),
        onClick: () => {
          const pt = this.c.points.byRef(d.id);
          if (pt) { this.c.game.map.setWaypoint({ x: pt.x, z: pt.z }); this.c.game.ui.toast(`Waypoint set: ${d.name}`); }
        },
      }));
    }
    el.append(section(''));
  }

  // ---------------------------------------------------------------------------------------------- story

  private missions(el: HTMLElement): void {
    const st = this.c.game.story;
    if (!st) return;
    const avail = Story.missions.filter((d) => st.available(d));
    el.append(h('p', 'm-info', st.mission ? `On a mission: ${st.mission.def.title}` : 'Pick a mission to mark its start on your map.'));
    if (st.heists.list().length) el.append(row({ label: 'Heist board', sub: 'Plan jobs at the board in Mack\'s flat', onClick: () => { const p = st.heists.boardPoint(); this.c.game.map.setWaypoint({ x: p.x, z: p.z }); this.c.game.ui.toast('Waypoint set: heist board'); } }));
    el.append(section('Available'));
    if (!avail.length) el.append(h('p', 'm-info', 'Nothing new right now. Unlock more by finishing missions.'));
    for (const d of avail) {
      const mine = d.char === 'any' || d.char === st.active;
      el.append(row({
        label: d.title, sub: `${d.char === 'any' ? 'Everyone' : CHARS[d.char].nick} · ${d.blurb}`, badge: mine ? '' : 'Switch', right: `Act ${d.act}`,
        onClick: () => { const w = st.place(d.start); this.c.game.map.setWaypoint({ x: w.x, z: w.z }); this.c.game.ui.toast(`Waypoint set: ${d.title}`); },
      }));
    }
    const done = Story.missions.filter((d) => st.done(d.id));
    if (done.length) el.append(section('Completed'));
    for (const d of done) {
      const rec = st.record(d.id);
      const gold = d.gold.length && d.gold.every((g) => rec.medals.includes(g.id));
      el.append(row({
        label: d.title, sub: rec.skipped ? 'Skipped' : `Best ${Math.floor(rec.best / 60)}:${String(rec.best % 60).padStart(2, '0')} · ${rec.medals.length}/${d.gold.length} gold objectives`,
        right: gold ? '★ Gold' : `${'★'.repeat(rec.medals.length)}${'☆'.repeat(Math.max(0, d.gold.length - rec.medals.length))}`,
        onClick: () => this.push(d.title, (e) => this.replay(e, d.id)),
      }));
    }
  }

  private replay(el: HTMLElement, id: string): void {
    const st = this.c.game.story;
    const d = st && Story.def(id);
    if (!st || !d) return;
    const rec = st.record(id);
    el.append(
      h('div', 'st-block', h('h3', '', d.title), h('p', '', d.blurb)),
      ...d.gold.map((g) => row({ label: g.label, right: rec.medals.includes(g.id) ? '★' : '☆', selected: rec.medals.includes(g.id) })),
      row({ label: 'Replay mission', sub: 'Pays half. The story is not affected.', disabled: !!st.mission, onClick: () => { this.close(); setTimeout(() => st.replay(d), 400); } }),
    );
  }

  private characters(el: HTMLElement): void {
    const st = this.c.game.story;
    if (!st) return;
    el.append(h('p', 'm-info', 'Switch to another character: they stand where you left them. Special ability: ' + CHARS[st.active].ability.name + '.'));
    for (const id of CHAR_IDS) {
      const c = CHARS[id];
      const open = st.st.unlocked.includes(id);
      el.append(row({
        label: c.name, sub: open ? `${c.role} · ${c.ability.name}: ${c.ability.blurb}` : 'You have not met this character yet.', badge: id === st.active ? 'Playing' : '', disabled: !open || id === st.active,
        onClick: () => { const why = st.protagonists.canSwitch(); if (why) { this.c.game.ui.toast(why === 'busy' ? 'Not right now' : why); return; } this.close(); setTimeout(() => st.protagonists.switchTo(id), 450); },
      }));
    }
  }
}
