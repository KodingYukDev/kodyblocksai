/**
 * Loudness mikrofon. Rumus port dari scratch-audio 1.0.325 src/Loudness.js (BSD-3-Clause,
 * (c) 2016 MIT): RMS, penghalusan turun 0.6, skala *1.63, akar, *100, dibulatkan, maks 100.
 *
 * Keamanan (docs/CONTRACTS.md bagian 12): izin mikrofon baru diminta saat loudness pertama kali
 * dibaca (blok sensing/hat dijalankan), audio tidak pernah keluar dari browser, dan pemanggil
 * diberi tahu lewat `onActiveChange` agar indikator mikrofon terlihat. `release()` mematikan track.
 */

export interface LoudnessMeter {
  getLoudness(): number;
  /** Matikan mikrofon (track dihentikan). Pemanggilan getLoudness berikutnya meminta ulang. */
  release(): void;
  dispose(): void;
}

export type GetUserMedia = (constraints: MediaStreamConstraints) => Promise<MediaStream>;

export interface LoudnessOptions {
  context: BaseAudioContext;
  getUserMedia?: GetUserMedia | null;
  onActiveChange?: (active: boolean) => void;
  onError?: (error: unknown) => void;
}

/** Hitung loudness Scratch dari sampel domain waktu. Mengembalikan nilai & rms halus terbaru. */
export function computeLoudness(samples: Float32Array, lastValue: number | undefined): { loudness: number; rms: number } {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] ?? 0;
    sum += Math.pow(s, 2);
  }
  let rms = Math.sqrt(sum / samples.length);
  if (lastValue) rms = Math.max(rms, lastValue * 0.6);
  const smoothed = rms;
  rms *= 1.63;
  rms = Math.sqrt(rms);
  rms = Math.round(rms * 100);
  rms = Math.min(rms, 100);
  return { loudness: rms, rms: smoothed };
}

function defaultGetUserMedia(): GetUserMedia | null {
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (!md || typeof md.getUserMedia !== "function") return null;
  return (c) => md.getUserMedia(c);
}

export function createLoudnessMeter(opts: LoudnessOptions): LoudnessMeter {
  const getUserMedia = opts.getUserMedia === undefined ? defaultGetUserMedia() : opts.getUserMedia;
  let connecting = false;
  let disposed = false;
  let stream: MediaStream | null = null;
  let mic: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let data: Float32Array<ArrayBuffer> | null = null;
  let lastValue: number | undefined;
  /** Naik setiap release agar permintaan izin yang terlambat diabaikan. */
  let generation = 0;

  const connect = (): void => {
    if (!getUserMedia || disposed) return;
    connecting = true;
    const gen = generation;
    getUserMedia({ audio: true })
      .then((s) => {
        if (disposed || gen !== generation) {
          for (const t of s.getTracks()) t.stop();
          return;
        }
        const ctx = opts.context as AudioContext;
        if (typeof ctx.createMediaStreamSource !== "function") {
          for (const t of s.getTracks()) t.stop();
          return;
        }
        stream = s;
        mic = ctx.createMediaStreamSource(s);
        analyser = ctx.createAnalyser();
        mic.connect(analyser);
        data = new Float32Array(analyser.fftSize);
        opts.onActiveChange?.(true);
      })
      .catch((err: unknown) => {
        // Izin ditolak: tetap -1, tidak meminta ulang terus-menerus (sama seperti Scratch).
        opts.onError?.(err);
      });
  };

  const release = (): void => {
    generation++;
    const wasActive = stream !== null;
    if (stream) for (const t of stream.getTracks()) t.stop();
    mic?.disconnect();
    stream = null;
    mic = null;
    analyser = null;
    data = null;
    lastValue = undefined;
    connecting = false;
    if (wasActive) opts.onActiveChange?.(false);
  };

  return {
    getLoudness(): number {
      if (disposed) return -1;
      if (!mic && !connecting) connect();
      if (mic && analyser && data && stream?.active) {
        analyser.getFloatTimeDomainData(data);
        const { loudness, rms } = computeLoudness(data, lastValue);
        lastValue = rms;
        return loudness;
      }
      return -1;
    },
    release,
    dispose(): void {
      release();
      disposed = true;
    },
  };
}
