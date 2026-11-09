import type { SaveData, SlotInfo } from './types';

export const SLOTS = 3;
const DB = 'vicecoast';
const STORE = 'saves';
const LS = 'vicecoast.save.';

const open = (): Promise<IDBDatabase | null> =>
  new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

const tx = <T>(db: IDBDatabase, mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> =>
  new Promise((resolve) => {
    try {
      const r = f(db.transaction(STORE, mode).objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });

/** Three save slots in IndexedDB (falling back to localStorage), plus export / import as a file. */
export class SaveStore {
  private db: IDBDatabase | null | undefined;

  private async handle(): Promise<IDBDatabase | null> {
    if (this.db === undefined) this.db = await open();
    return this.db;
  }

  async read(slot: number): Promise<SaveData | null> {
    const db = await this.handle();
    let raw: unknown;
    if (db) raw = await tx(db, 'readonly', (s) => s.get(`slot-${slot}`));
    else {
      try { raw = JSON.parse(localStorage.getItem(LS + slot) ?? 'null'); } catch { raw = null; }
    }
    return SaveStore.valid(raw) ? raw : null;
  }

  async write(slot: number, data: SaveData): Promise<boolean> {
    const db = await this.handle();
    if (db) return (await tx(db, 'readwrite', (s) => s.put(data, `slot-${slot}`))) !== undefined;
    try { localStorage.setItem(LS + slot, JSON.stringify(data)); return true; } catch { return false; }
  }

  async remove(slot: number): Promise<void> {
    const db = await this.handle();
    if (db) await tx(db, 'readwrite', (s) => s.delete(`slot-${slot}`));
    else { try { localStorage.removeItem(LS + slot); } catch { /* ignore */ } }
  }

  async list(): Promise<SlotInfo[]> {
    const out: SlotInfo[] = [];
    for (let i = 1; i <= SLOTS; i++) {
      const d = await this.read(i);
      out.push(d
        ? { slot: i, empty: false, label: d.label, savedAt: d.savedAt, playSeconds: d.profile.stats.playSeconds, cash: d.profile.cash, bank: d.profile.bank, props: d.profile.props.length, cars: d.profile.vehicles.length }
        : { slot: i, empty: true, label: '', savedAt: 0, playSeconds: 0, cash: 0, bank: 0, props: 0, cars: 0 });
    }
    return out;
  }

  static valid(v: unknown): v is SaveData {
    if (typeof v !== 'object' || v === null) return false;
    const d = v as Partial<SaveData>;
    return d.version === 1 && typeof d.savedAt === 'number' && typeof d.profile === 'object' && d.profile !== null && typeof d.world === 'object' && d.world !== null
      && typeof d.profile.cash === 'number' && typeof d.profile.bank === 'number';
  }

  /** Save file as a download. */
  export(data: SaveData, slot: number): void {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vice-coast-slot${slot}-${new Date(data.savedAt).toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /** Read a save file the player picked; null when it is not one of ours. */
  async parseFile(file: File): Promise<SaveData | null> {
    try {
      const v: unknown = JSON.parse(await file.text());
      return SaveStore.valid(v) ? v : null;
    } catch {
      return null;
    }
  }
}
