/** Heat needed for each star. */
export const HEAT = [0, 14, 45, 100, 180, 290, 450] as const;
/** Seconds out of sight before a star is lost (the 6-star cool-down is deliberately brutal). */
export const SEARCH = [0, 16, 24, 34, 48, 66, 110] as const;

export const STAR_NAMES = ['', 'Local patrol', 'Roadblocks', 'SWAT', 'Heavy response', 'Federal', 'Military'] as const;

/**
 * Wanted level. Crimes add heat (full value when somebody saw them, a trickle otherwise); heat sets the stars. Stars drop
 * only when the police have lost you: while no officer has line of sight a search timer runs down, resetting whenever you
 * are seen again; each time it empties a star goes (and the timer restarts for the new level).
 */
export class Wanted {
  heat = 0;
  stars = 0;
  /** An officer (or aircraft) currently has eyes on the player. */
  seen = false;
  /** Seconds left in the search countdown. */
  searchT = 0;
  /** Where the player was last seen. */
  lastX = 0;
  lastZ = 0;
  /** Seconds before units begin to arrive after the level goes up. */
  response = 0;
  onChange: ((stars: number, previous: number) => void) | null = null;

  /** Scripted scenes (the prologue) switch the real police response off. */
  muted = false;

  report(weight: number, x: number, z: number, witnessed: boolean): void {
    if (this.muted) return;
    if (weight <= 0) return;
    const prev = this.stars;
    this.heat += weight * (witnessed ? 1 : 0.15);
    let s = 0;
    while (s < 6 && this.heat >= HEAT[s + 1]!) s++;
    if (s > this.stars) {
      this.stars = s;
      this.searchT = SEARCH[s]!;
      this.response = prev === 0 ? 7 : 3;
      this.lastX = x; this.lastZ = z;
      this.onChange?.(s, prev);
    } else if (this.stars > 0) {
      // a fresh crime keeps the search alive
      this.searchT = Math.max(this.searchT, SEARCH[this.stars]! * 0.7);
      this.lastX = x; this.lastZ = z;
    }
  }

  /** `hiding`: the player is swimming or otherwise hard to find (halves the search time). */
  update(dt: number, seen: boolean, px: number, pz: number, hiding = false): void {
    this.seen = seen;
    if (this.response > 0) this.response -= dt;
    if (this.stars === 0) return;
    if (seen) {
      this.lastX = px; this.lastZ = pz;
      this.searchT = SEARCH[this.stars]!;
      // staying visible while committing crimes is what drives the level up; heat bleeds off very slowly
      return;
    }
    this.searchT -= dt * (hiding ? 2 : 1);
    if (this.searchT <= 0) {
      const prev = this.stars;
      this.stars--;
      this.heat = this.stars === 0 ? 0 : HEAT[this.stars]!;
      this.searchT = SEARCH[this.stars] ?? 0;
      this.onChange?.(this.stars, prev);
    }
  }

  clear(): void {
    const prev = this.stars;
    this.heat = 0;
    this.stars = 0;
    this.searchT = 0;
    this.seen = false;
    if (prev !== 0) this.onChange?.(0, prev);
  }

  /** Radius (m) of the search zone around the last sighting; leave it to lose the police faster. */
  get searchRadius(): number { return 70 + this.stars * 35; }

  /** 0–1 remaining search time for the HUD. */
  get searchFrac(): number {
    return this.stars > 0 ? Math.max(0, Math.min(1, this.searchT / SEARCH[this.stars]!)) : 0;
  }
}
