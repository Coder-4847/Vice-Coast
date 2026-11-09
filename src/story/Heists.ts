import type { Story } from './Story';

/** Heist boards, planning, crew and the two playable heists (filled in below). */
export class Heists {
  constructor(readonly s: Story) {}
  markerKey(): string { return ''; }
  addMarkers(_ids: Map<string, number>): void { /* later */ }
  nearBoard(_x: number, _z: number, _r: number): { id: string; prompt: string } | null { return null; }
  openBoard(_id: string): void { /* later */ }
  update(_dt: number): void { /* later */ }
}
