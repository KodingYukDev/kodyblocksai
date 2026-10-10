/**
 * Clock (padanan scratch-vm 4.8.102 io/clock.js, BSD-3-Clause; lihat THIRD_PARTY.md):
 * timer project berbasis runtime.currentMSecs dengan pause/resume. Pemilik: agent engine-core.
 */
import type { IClock } from "../types/io";
import type { IRuntime } from "../types/runtime";

export class Clock implements IClock {
  private startTime: number;
  private pausedTime: number | null = null;
  private paused = false;

  constructor(private readonly runtime: IRuntime) {
    this.startTime = runtime.currentMSecs;
  }

  private elapsed(): number {
    return this.runtime.currentMSecs - this.startTime;
  }

  /** Detik sejak reset (blok "timer"). */
  projectTimer(): number {
    if (this.paused) return (this.pausedTime ?? 0) / 1000;
    return this.elapsed() / 1000;
  }

  pause(): void {
    this.paused = true;
    this.pausedTime = this.elapsed();
  }

  resume(): void {
    this.paused = false;
    const dt = this.elapsed() - (this.pausedTime ?? 0);
    this.startTime += dt;
  }

  resetProjectTimer(): void {
    this.startTime = this.runtime.currentMSecs;
  }
}

export function createClock(runtime: IRuntime): IClock {
  return new Clock(runtime);
}
