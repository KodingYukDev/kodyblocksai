/**
 * Fitur suara ringan untuk classifier suara AI Lab: energi pita frekuensi berskala log
 * (dari AnalyserNode.getFloatFrequencyData) dirangkum per jendela waktu (rata-rata + simpangan).
 * Audio mentah tidak pernah disimpan; hanya vektor 48 angka per contoh.
 */

export const AUDIO_BANDS = 24;
export const AUDIO_FEATURE_DIM = AUDIO_BANDS * 2;
const MIN_HZ = 100;
const MAX_HZ = 8000;
const FLOOR_DB = -100;
/** Di bawah level ini dianggap hening (tidak diklasifikasi). */
export const SILENCE_LEVEL = 0.08;

export interface BandLayout {
  /** [binAwal, binAkhirEksklusif] per pita. */
  ranges: [number, number][];
}

export function bandLayout(binCount: number, sampleRate: number): BandLayout {
  const nyquist = sampleRate / 2;
  const hzPerBin = nyquist / binCount;
  const maxHz = Math.min(MAX_HZ, nyquist);
  const ranges: [number, number][] = [];
  for (let b = 0; b < AUDIO_BANDS; b++) {
    const lo = MIN_HZ * Math.pow(maxHz / MIN_HZ, b / AUDIO_BANDS);
    const hi = MIN_HZ * Math.pow(maxHz / MIN_HZ, (b + 1) / AUDIO_BANDS);
    const start = Math.min(binCount - 1, Math.max(0, Math.floor(lo / hzPerBin)));
    const end = Math.min(binCount, Math.max(start + 1, Math.ceil(hi / hzPerBin)));
    ranges.push([start, end]);
  }
  return { ranges };
}

/** Energi pita ternormalisasi 0..1 dari spektrum dB. */
export function bandEnergies(spectrumDb: Float32Array, layout: BandLayout): Float32Array {
  const out = new Float32Array(AUDIO_BANDS);
  layout.ranges.forEach(([s, e], b) => {
    let sum = 0;
    let n = 0;
    for (let i = s; i < e; i++) {
      const db = spectrumDb[i] ?? FLOOR_DB;
      sum += Number.isFinite(db) ? Math.max(FLOOR_DB, Math.min(0, db)) : FLOOR_DB;
      n++;
    }
    out[b] = n > 0 ? (sum / n - FLOOR_DB) / -FLOOR_DB : 0;
  });
  return out;
}

/** Mengumpulkan frame pita selama satu jendela, lalu menghasilkan vektor fitur. */
export class AudioFeatureWindow {
  private frames: Float32Array[] = [];

  constructor(readonly maxFrames = 20) {}

  push(bands: Float32Array): void {
    this.frames.push(bands);
    if (this.frames.length > this.maxFrames) this.frames.shift();
  }

  get size(): number {
    return this.frames.length;
  }

  clear(): void {
    this.frames = [];
  }

  /** Rata-rata level semua pita (0..1). */
  level(): number {
    if (this.frames.length === 0) return 0;
    let sum = 0;
    for (const f of this.frames) for (const v of f) sum += v;
    return sum / (this.frames.length * AUDIO_BANDS);
  }

  features(): Float32Array | null {
    const n = this.frames.length;
    if (n === 0) return null;
    const out = new Float32Array(AUDIO_FEATURE_DIM);
    for (let b = 0; b < AUDIO_BANDS; b++) {
      let mean = 0;
      for (const f of this.frames) mean += f[b] ?? 0;
      mean /= n;
      let variance = 0;
      for (const f of this.frames) variance += ((f[b] ?? 0) - mean) ** 2;
      out[b] = mean;
      out[AUDIO_BANDS + b] = Math.sqrt(variance / n);
    }
    return out;
  }
}
