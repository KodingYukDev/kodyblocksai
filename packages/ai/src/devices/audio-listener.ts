/**
 * Membaca spektrum mikrofon secara berkala dan menyusun jendela fitur suara (lokal).
 * Dipakai blok klasifikasi suara dan perekaman contoh di AI Lab.
 */
import { AudioFeatureWindow, bandEnergies, bandLayout } from "../classifier/audio-features";
import type { BandLayout } from "../classifier/audio-features";
import { AI_LIMITS } from "../security";

export interface SpectrumSource {
  readonly active: boolean;
  readonly sampleRate: number;
  readSpectrum(): Float32Array | null;
}

export interface IntervalTimers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const defaultTimers: IntervalTimers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

export class AudioListener {
  readonly window: AudioFeatureWindow;
  private handle: unknown = null;
  private layout: BandLayout | null = null;
  private layoutKey = "";

  constructor(
    private readonly source: SpectrumSource,
    private readonly onTick: (listener: AudioListener) => void = () => {},
    private readonly timers: IntervalTimers = defaultTimers,
    readonly intervalMs = 1000 / AI_LIMITS.maxAnalysesPerSecond,
  ) {
    this.window = new AudioFeatureWindow(Math.round(1000 / intervalMs));
  }

  get running(): boolean {
    return this.handle !== null;
  }

  start(): void {
    if (this.handle !== null) return;
    this.handle = this.timers.setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.handle !== null) this.timers.clearInterval(this.handle);
    this.handle = null;
    this.window.clear();
  }

  tick(): void {
    if (!this.source.active) return;
    const spectrum = this.source.readSpectrum();
    if (!spectrum) return;
    const key = `${spectrum.length}@${this.source.sampleRate}`;
    if (!this.layout || key !== this.layoutKey) {
      this.layout = bandLayout(spectrum.length, this.source.sampleRate);
      this.layoutKey = key;
    }
    this.window.push(bandEnergies(spectrum, this.layout));
    this.onTick(this);
  }
}
