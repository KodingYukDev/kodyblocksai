/** Event emitter bertipe kecil (tanpa dependensi DOM). Dipakai runtime, target, dan app bus. */
export type Listener<P> = (payload: P) => void;

export class TypedEmitter<M extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof M, Set<Listener<never>>>();

  on<K extends keyof M>(event: K, fn: Listener<M[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as Listener<never>);
    return () => this.off(event, fn);
  }

  once<K extends keyof M>(event: K, fn: Listener<M[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off<K extends keyof M>(event: K, fn: Listener<M[K]>): void {
    this.listeners.get(event)?.delete(fn as Listener<never>);
  }

  /** Listener yang melempar error tidak menghentikan listener lain; error dilempar ulang setelah semua dipanggil. */
  emit<K extends keyof M>(event: K, payload: M[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    const errors: unknown[] = [];
    for (const fn of [...set]) {
      try {
        (fn as Listener<M[K]>)(payload);
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, `${String(event)}: ${errors.length} listener gagal`);
  }

  listenerCount<K extends keyof M>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
