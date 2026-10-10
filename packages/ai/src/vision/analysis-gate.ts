/**
 * Pembatas laju analisis: paling banyak AI_LIMITS.maxAnalysesPerSecond analisis per detik.
 * - Panggilan saat analisis berjalan memakai Promise yang sama (tidak menumpuk inferensi).
 * - Panggilan terlalu cepat mengembalikan hasil terakhir (loop "selamanya" tidak membuat tab hang).
 * - invalidate() membuang hasil lama dan hasil analisis yang sedang berjalan (kamera dimatikan).
 */
export class AnalysisGate<R> {
  private inFlight: Promise<R> | null = null;
  private lastStart = -Infinity;
  private generation = 0;
  private last: R;

  constructor(
    private readonly empty: () => R,
    private readonly minIntervalMs: number,
    private readonly now: () => number,
  ) {
    this.last = empty();
  }

  get result(): R {
    return this.last;
  }

  run(analyse: () => Promise<R>): Promise<R> {
    if (this.inFlight) return this.inFlight;
    const t = this.now();
    if (t - this.lastStart < this.minIntervalMs) return Promise.resolve(this.last);
    this.lastStart = t;
    const generation = this.generation;
    const p = analyse().then(
      (r) => {
        if (generation === this.generation) this.last = r;
        return this.last;
      },
      () => this.last,
    );
    const tracked = p.finally(() => {
      if (this.inFlight === tracked) this.inFlight = null;
    });
    this.inFlight = tracked;
    return tracked;
  }

  invalidate(): void {
    this.generation++;
    this.inFlight = null;
    this.lastStart = -Infinity;
    this.last = this.empty();
  }
}
