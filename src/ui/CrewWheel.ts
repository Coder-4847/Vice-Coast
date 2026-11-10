import { h } from './dom';
import { COMMANDS, type Command } from '../crew/Allies';

/** A small command wheel for your crew: hold, follow, attack, breach. Keyboard 1–4 / ← →, pad d-pad, or tap. */
export class CrewWheel {
  readonly root: HTMLElement;
  private readonly chip = h('div', 'crew-chip is-hidden');
  private readonly cards: HTMLButtonElement[] = [];
  private sel = 0;
  open = false;
  onPick: ((c: Command) => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(parent: HTMLElement, hudRoot: HTMLElement) {
    this.root = h('div', 'crew-wheel');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Crew commands');
    COMMANDS.forEach((c, i) => {
      const b = h('button', 'cw-card', h('b', '', `${i + 1}`), h('span', 'cw-label', c.label), h('span', 'cw-hint', c.hint));
      b.type = 'button';
      b.addEventListener('click', () => this.pick(i));
      this.cards.push(b);
      this.root.append(b);
    });
    parent.append(this.root);
    hudRoot.append(this.chip);
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  show(current: Command): void {
    this.sel = Math.max(0, COMMANDS.findIndex((c) => c.id === current));
    this.open = true;
    this.root.classList.add('open');
    this.paint();
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('open');
    this.onClose?.();
  }

  setChip(text: string | null): void {
    this.chip.classList.toggle('is-hidden', !text);
    if (text && this.chip.textContent !== text) this.chip.textContent = text;
  }

  private paint(): void { this.cards.forEach((c, i) => c.classList.toggle('sel', i === this.sel)); }

  private pick(i: number): void {
    this.hide();
    this.onPick?.(COMMANDS[i]!.id);
  }

  step(d: number): void { this.sel = (this.sel + d + COMMANDS.length) % COMMANDS.length; this.paint(); }
  confirm(): void { this.pick(this.sel); }

  private onKey(e: KeyboardEvent): void {
    if (!this.open || e.repeat) return;
    const k = e.code;
    if (k === 'ArrowLeft' || k === 'KeyA') this.step(-1);
    else if (k === 'ArrowRight' || k === 'KeyD') this.step(1);
    else if (k === 'Enter' || k === 'Space') this.confirm();
    else if (k.startsWith('Digit') && Number(k.slice(5)) >= 1 && Number(k.slice(5)) <= 4) this.pick(Number(k.slice(5)) - 1);
    else if (k === 'KeyB' || k === 'Escape') this.hide();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
}
