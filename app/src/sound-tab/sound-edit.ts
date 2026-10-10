/**
 * Operasi editor suara murni: hapus/potong, salin/tempel, undo/redo, level RMS, downsample,
 * dan potong-otomatis rekaman. Perilaku diport dari scratch-gui containers/sound-editor.jsx,
 * lib/audio/audio-util.js, lib/audio/audio-recorder.js (BSD-3, lewat fork KodyBlocks).
 */
import type { PcmSound } from "./wav";

export const UNDO_STACK_SIZE = 99;
export const MAX_RMS = 1.2;
/** Batas ukuran WAV hasil edit (audio-util.js SOUND_BYTE_LIMIT). */
export const SOUND_BYTE_LIMIT = 10 * 1000 * 1000;

export interface Selection {
  trimStart: number;
  trimEnd: number;
}

export interface EditResult extends PcmSound {
  /** Seleksi setelah operasi; null = tanpa seleksi. */
  selection: Selection | null;
}

export function computeRMS(samples: ArrayLike<number>, scaling = 0.55): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] ?? 0;
    sum += s * s;
  }
  const rms = Math.sqrt(sum / samples.length);
  return Math.sqrt(rms / scaling);
}

export function computeChunkedRMS(samples: Float32Array, chunkSize = 1024): number[] {
  const levels: number[] = [];
  for (let i = 0; i < samples.length; i += chunkSize) {
    levels.push(computeRMS(samples.subarray(i, Math.min(samples.length, i + chunkSize))));
  }
  return levels;
}

/** sound-editor.jsx tooLoud: ada chunk di seleksi dengan RMS > MAX_RMS. */
export function isTooLoud(levels: readonly number[], sel: Selection | null): boolean {
  const n = levels.length;
  const start = sel === null ? 0 : Math.floor(sel.trimStart * n);
  const end = sel === null ? n - 1 : Math.ceil(sel.trimEnd * n);
  const chunks = levels.slice(start, end);
  return chunks.length > 0 && Math.max(...chunks) > MAX_RMS;
}

/** handleDelete: buang seleksi. Hasil kosong -> 1 sampel hening. */
export function deleteSelection(sound: PcmSound, sel: Selection): EditResult {
  const { samples, sampleRate } = sound;
  const n = samples.length;
  const a = Math.floor(sel.trimStart * n);
  const b = Math.floor(sel.trimEnd * n);
  const first = samples.slice(0, a);
  const second = samples.slice(b, n);
  const len = first.length + second.length;
  let out: Float32Array;
  if (len === 0) out = new Float32Array(1);
  else {
    out = new Float32Array(len);
    out.set(first, 0);
    out.set(second, first.length);
  }
  return { samples: out, sampleRate, selection: null };
}

/** handleDeleteInverse: simpan hanya seleksi. */
export function cropToSelection(sound: PcmSound, sel: Selection): EditResult {
  const n = sound.samples.length;
  let clipped = sound.samples.slice(Math.floor(sel.trimStart * n), Math.floor(sel.trimEnd * n));
  if (clipped.length === 0) clipped = new Float32Array(1);
  return { samples: clipped, sampleRate: sound.sampleRate, selection: null };
}

/** copy(): seleksi (atau seluruh suara) ke buffer salin. */
export function copySelection(sound: PcmSound, sel: Selection | null): PcmSound {
  const n = sound.samples.length;
  const a = (sel?.trimStart ?? 0) * n;
  const b = (sel?.trimEnd ?? 1) * n;
  // TypedArray.slice memotong indeks pecahan ke bawah, sama dengan perilaku JS asli.
  return { samples: sound.samples.slice(Math.trunc(a), Math.trunc(b)), sampleRate: sound.sampleRate };
}

/** Resample linear (pengganti OfflineAudioContext pada resampleBufferToRate). */
export function resample(sound: PcmSound, newRate: number): PcmSound {
  const ratio = newRate / sound.sampleRate;
  const len = Math.floor(ratio * sound.samples.length);
  const out = new Float32Array(len);
  const src = sound.samples;
  for (let i = 0; i < len; i++) {
    const p = i / ratio;
    const k = Math.floor(p);
    const f = p - k;
    out[i] = (src[k] ?? 0) * (1 - f) + (src[k + 1] ?? src[k] ?? 0) * f;
  }
  return { samples: out, sampleRate: newRate };
}

/**
 * paste(): tanpa seleksi -> tempel di akhir; dengan seleksi -> ganti seleksi.
 * Buffer salin di-resample dulu bila rate berbeda (handlePaste).
 */
export function pasteBuffer(sound: PcmSound, clip: PcmSound, sel: Selection | null): EditResult {
  const buf = clip.sampleRate === sound.sampleRate ? clip : resample(clip, sound.sampleRate);
  const { samples, sampleRate } = sound;
  if (sel === null) {
    const out = new Float32Array(samples.length + buf.samples.length);
    out.set(samples, 0);
    out.set(buf.samples, samples.length);
    return { samples: out, sampleRate, selection: null };
  }
  const a = Math.trunc(sel.trimStart * samples.length);
  const b = Math.trunc(sel.trimEnd * samples.length);
  const first = samples.slice(0, a);
  const last = samples.slice(b);
  const out = new Float32Array(first.length + buf.samples.length + last.length);
  out.set(first, 0);
  out.set(buf.samples, first.length);
  out.set(last, first.length + buf.samples.length);
  const startSec = (sel.trimStart * samples.length) / sampleRate;
  const endSec = startSec + buf.samples.length / buf.sampleRate;
  const dur = out.length / buf.sampleRate;
  return { samples: out, sampleRate, selection: { trimStart: startSec / dur, trimEnd: endSec / dur } };
}

export class SoundTooLargeError extends Error {
  constructor() {
    super("Suara terlalu besar untuk disimpan");
    this.name = "SoundTooLargeError";
  }
}

/** downsampleIfNeeded: kalau WAV 16-bit > 10MB, turunkan ke 22050 Hz; masih terlalu besar -> error. */
export function downsampleIfNeeded(sound: PcmSound): PcmSound {
  const { samples, sampleRate } = sound;
  const duration = samples.length / sampleRate;
  if (samples.length * 2 < SOUND_BYTE_LIMIT) return sound;
  if (duration * 22050 * 2 < SOUND_BYTE_LIMIT) return resample(sound, 22050);
  throw new SoundTooLargeError();
}

/** Seleksi awal rekaman (audio-recorder.js stop()): potong hening di awal/akhir. */
export function autoTrimRecording(samples: Float32Array): { levels: number[]; trimStart: number; trimEnd: number } {
  const levels = computeChunkedRMS(samples);
  const n = levels.length;
  if (n === 0) return { levels, trimStart: 0, trimEnd: 1 };
  const threshold = Math.max(...levels) / 8;
  let first: number | null = null;
  let last: number | null = null;
  for (let i = 0; i < n; i++) {
    if ((levels[i] ?? 0) > threshold) {
      if (first === null) first = i + 1;
      last = i + 1;
    }
  }
  // scratch-gui membagi dengan jumlah buffer 8192 sampel; di sini satuannya chunk 1024 (lebih tepat).
  let trimStart = Math.max(2, (first ?? 0) - 2) / n;
  let trimEnd = Math.min(n - 2, (last ?? n) + 2) / n;
  if (!(trimStart < trimEnd)) {
    trimStart = 0;
    trimEnd = 1;
  }
  return { levels, trimStart, trimEnd };
}

interface UndoItem extends PcmSound {
  selection: Selection | null;
}

/** Tumpukan undo/redo editor suara (UNDO_STACK_SIZE 99, redo dikosongkan saat edit baru). */
export class SoundHistory {
  private undoStack: UndoItem[] = [];
  private redoStack: UndoItem[] = [];

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Simpan keadaan SEBELUM edit baru. */
  push(current: UndoItem): void {
    this.redoStack = [];
    if (this.undoStack.length >= UNDO_STACK_SIZE) this.undoStack.shift();
    this.undoStack.push(current);
  }

  undo(current: UndoItem): UndoItem | null {
    const item = this.undoStack.pop();
    if (!item) return null;
    this.redoStack.push(current);
    return item;
  }

  redo(current: UndoItem): UndoItem | null {
    const item = this.redoStack.pop();
    if (!item) return null;
    this.undoStack.push(current);
    return item;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
