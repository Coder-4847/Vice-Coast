/**
 * Player health and body armour. Armour soaks 70 % of each hit until it is gone; health regenerates (slowly, after a
 * quiet spell) up to 60 % — medkits and hospitals restore the rest.
 */
export class Vitals {
  readonly maxHealth = 100;
  readonly maxArmour = 100;
  health = 100;
  armour = 0;
  dead = false;
  /** Story cutscenes and ability moments: no damage lands. */
  invulnerable = false;
  /** Rampage and friends scale all incoming damage. */
  damageScale = 1;
  /** Seconds since the last hit. */
  sinceHit = 99;
  /** 0–1 screen flash after taking damage (HUD vignette). */
  hurtFlash = 0;
  /** World direction (radians, atan2(dx, dz)) the last hit came from, or NaN. */
  lastHitFrom = NaN;
  /** Called once when health reaches zero. */
  onDeath: (() => void) | null = null;
  /** Called on every hit that lands (amount after armour). */
  onHurt: ((amount: number) => void) | null = null;

  hurt(amount: number, fromX?: number, fromZ?: number, px = 0, pz = 0): void {
    if (this.dead || this.invulnerable || amount <= 0) return;
    amount *= this.damageScale;
    const soak = Math.min(this.armour, amount * 0.7);
    this.armour -= soak;
    const hp = amount - soak;
    this.health = Math.max(0, this.health - hp);
    this.sinceHit = 0;
    this.hurtFlash = Math.min(1, this.hurtFlash + 0.25 + amount * 0.012);
    if (fromX !== undefined && fromZ !== undefined) this.lastHitFrom = Math.atan2(fromX - px, fromZ - pz);
    this.onHurt?.(hp);
    if (this.health <= 0) {
      this.dead = true;
      this.onDeath?.();
    }
  }

  heal(amount: number): void {
    if (!this.dead) this.health = Math.min(this.maxHealth, this.health + amount);
  }

  addArmour(amount: number): void {
    this.armour = Math.min(this.maxArmour, this.armour + amount);
  }

  reset(): void {
    this.health = this.maxHealth;
    this.armour = 0;
    this.dead = false;
    this.sinceHit = 99;
    this.hurtFlash = 0;
  }

  update(dt: number): void {
    this.sinceHit += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6);
    if (!this.dead && this.sinceHit > 5 && this.health < this.maxHealth * 0.6) {
      this.health = Math.min(this.maxHealth * 0.6, this.health + dt * 3.2);
    }
  }
}
