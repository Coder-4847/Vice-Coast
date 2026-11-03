/** Tiny typed event emitter. */
export class Emitter<E extends { [K in keyof E]: unknown }> {
  private listeners = new Map<keyof E, Set<(payload: never) => void>>();

  on<K extends keyof E>(event: K, fn: (payload: E[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn as (payload: never) => void);
    return () => set.delete(fn as (payload: never) => void);
  }

  protected emit<K extends keyof E>(event: K, payload: E[K]): void {
    this.listeners.get(event)?.forEach((fn) => (fn as (p: E[K]) => void)(payload));
  }
}
