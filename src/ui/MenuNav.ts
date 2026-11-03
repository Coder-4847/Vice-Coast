/**
 * Spatial-ish menu navigation for keyboard and gamepad.
 *
 * Markup contract: every navigable line is an element with `data-nav-row`
 * (a settings row, the tab bar, the footer…). Up/Down move between rows, Left/Right move
 * inside a row (or nudge a slider). Native focus is used so screen readers keep working.
 */
export class MenuNav {
  private lastActive: HTMLElement | null = null;

  constructor(private readonly container: HTMLElement) {
    container.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case 'ArrowUp': e.preventDefault(); this.move(0, -1); break;
        case 'ArrowDown': e.preventDefault(); this.move(0, 1); break;
        case 'ArrowLeft': if (this.move(-1, 0)) e.preventDefault(); break;
        case 'ArrowRight': if (this.move(1, 0)) e.preventDefault(); break;
        default:
      }
    });
    container.addEventListener('pointerdown', () => this.clearMark(), true);
  }

  private rows(): HTMLElement[] {
    return [...this.container.querySelectorAll<HTMLElement>('[data-nav-row]')].filter((r) => r.offsetParent !== null);
  }

  private focusables(row: HTMLElement): HTMLElement[] {
    const sel = 'button:not([disabled]), input[type="range"]:not([disabled])';
    const list = [...row.querySelectorAll<HTMLElement>(sel)].filter((e) => e.offsetParent !== null);
    if (row.matches(sel)) list.unshift(row);
    return list;
  }

  private currentRow(rows: HTMLElement[]): number {
    const a = document.activeElement;
    return a ? rows.findIndex((r) => r.contains(a)) : -1;
  }

  /** Returns true if the input was consumed. `via` marks the focus visibly for pad/keyboard users. */
  move(dx: number, dy: number): boolean {
    const rows = this.rows();
    if (!rows.length) return false;
    let ri = this.currentRow(rows);
    if (ri < 0) {
      this.focusEl(this.focusables(rows[0]!)[0]);
      return true;
    }
    const row = rows[ri]!;
    const items = this.focusables(row);
    const active = document.activeElement as HTMLElement;
    const ci = Math.max(0, items.indexOf(active));

    if (dy !== 0) {
      ri = Math.max(0, Math.min(rows.length - 1, ri + dy));
      const next = this.focusables(rows[ri]!);
      if (next.length) this.focusEl(next[Math.min(ci, next.length - 1)]);
      return true;
    }

    if (active instanceof HTMLInputElement && active.type === 'range') {
      const step = Number(active.step) || 1;
      const span = Number(active.max) - Number(active.min);
      const delta = Math.max(step, Math.round(span / 20 / step) * step) * dx;
      const v = Math.min(Number(active.max), Math.max(Number(active.min), Number(active.value) + delta));
      active.value = String(v);
      active.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    const target = items[ci + dx];
    if (target) {
      this.focusEl(target);
      // Tabs activate as you arrow across them, so the page changes smoothly.
      if (target.getAttribute('role') === 'tab') target.click();
      return true;
    }
    return items.length > 1;
  }

  confirm(): void {
    const a = document.activeElement as HTMLElement | null;
    if (a && this.container.contains(a)) a.click();
    else this.move(0, 1);
  }

  focusFirst(): void {
    const rows = this.rows();
    const sel = rows.length ? this.focusables(rows[Math.min(1, rows.length - 1)]!) : [];
    this.focusEl(sel[0] ?? this.focusables(rows[0]!)[0]);
  }

  private focusEl(el: HTMLElement | undefined): void {
    if (!el) return;
    this.clearMark();
    el.focus({ preventScroll: true });
    el.classList.add('nav-active');
    this.lastActive = el;
    el.scrollIntoView({ block: 'nearest', behavior: document.documentElement.dataset.reduceMotion === 'true' ? 'auto' : 'smooth' });
  }

  private clearMark(): void {
    this.lastActive?.classList.remove('nav-active');
    this.lastActive = null;
  }
}
