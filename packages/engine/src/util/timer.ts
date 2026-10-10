/** Timer, padanan scratch-vm src/util/timer.js. Sumber waktu dapat diganti untuk tes deterministik. */
export interface TimeSource {
  now(): number;
}

export const defaultTimeSource: TimeSource = {
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
};

export class Timer {
  private startTime = 0;
  constructor(private readonly source: TimeSource = defaultTimeSource) {}
  time(): number {
    return this.source.now();
  }
  start(): void {
    this.startTime = this.source.now();
  }
  timeElapsed(): number {
    return this.source.now() - this.startTime;
  }
}
