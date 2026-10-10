/**
 * Bagian tab Suara yang butuh WebAudio: dekode file, pemutaran pratinjau, dan pembuatan NewSound
 * dari sampel hasil edit. DSP-nya murni di sound-effects.ts / sound-edit.ts.
 */
import { decodeToAudioBuffer } from "@kody/audio";
import { makeSound } from "../costume-tab/new-asset";
import type { NewSound, SoundView } from "../costume-tab/types";
import { downsampleIfNeeded } from "./sound-edit";
import { WavFormatError, decodeWav, encodeWav, type PcmSound } from "./wav";

export const SOUND_ACCEPT = ".wav, .mp3";
export const MAX_SOUND_UPLOAD_BYTES = 10 * 1024 * 1024;

export class SoundImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SoundImportError";
  }
}

let shared: AudioContext | null = null;

/** AudioContext bersama tab suara (dibuat malas setelah aksi pengguna). Host boleh menyuntikkan miliknya. */
export function getAudioContext(): AudioContext {
  if (!shared) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new SoundImportError("WebAudio tidak tersedia");
    shared = new Ctor();
  }
  return shared;
}

export function setAudioContext(ctx: AudioContext): void {
  shared = ctx;
}

/** Jenis upload suara seperti file-uploader.js soundUpload (MIME), dengan cadangan ekstensi. */
export function classifySoundFile(name: string, mime: string): "wav" | "mp3" | null {
  switch (mime) {
    case "audio/mp3":
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
    case "audio/x-pn-wav":
      return "wav";
    default:
      break;
  }
  const ext = name.toLowerCase().split(".").pop();
  return ext === "wav" ? "wav" : ext === "mp3" ? "mp3" : null;
}

/** Dekode bytes suara ke PCM kanal 0. WAV PCM tanpa AudioContext; format lain lewat @kody/audio. */
export async function decodeSoundBytes(data: Uint8Array): Promise<PcmSound> {
  try {
    return decodeWav(data);
  } catch (e) {
    if (!(e instanceof WavFormatError)) throw e;
  }
  const ctx = getAudioContext();
  const buf = await decodeToAudioBuffer(ctx, data.slice().buffer);
  return { samples: new Float32Array(buf.getChannelData(0)), sampleRate: buf.sampleRate };
}

export async function soundFromFile(file: { name: string; type: string; bytes: Uint8Array }): Promise<NewSound> {
  if (file.bytes.length > MAX_SOUND_UPLOAD_BYTES) throw new SoundImportError(`File ${file.name} terlalu besar (maks 10 MB)`);
  const kind = classifySoundFile(file.name, file.type);
  if (!kind) throw new SoundImportError(`Jenis file tidak didukung: ${file.name}`);
  const pcm = await decodeSoundBytes(file.bytes);
  const name = file.name.split(".", 1)[0] || "suara";
  return makeSound(name, kind, file.bytes, pcm.sampleRate, pcm.samples.length);
}

/** submitNewSamples: downsample bila perlu lalu encode WAV 16-bit. `pcm` = sampel yang benar-benar disimpan. */
export function encodeSamples(name: string, pcm: PcmSound): { sound: NewSound; pcm: PcmSound } {
  const s = downsampleIfNeeded(pcm);
  const data = encodeWav(s.samples, s.sampleRate);
  return { sound: makeSound(name, "wav", data, s.sampleRate, s.samples.length), pcm: s };
}

export function soundFromSamples(name: string, pcm: PcmSound): NewSound {
  return encodeSamples(name, pcm).sound;
}

export async function pcmFromView(v: SoundView): Promise<PcmSound> {
  if (!v.asset) return { samples: new Float32Array(1), sampleRate: v.rate || 22050 };
  return decodeSoundBytes(v.asset.data);
}

/** Pemutar pratinjau sederhana dengan posisi playhead (0..1). */
export class PreviewPlayer {
  private source: AudioBufferSourceNode | null = null;
  private startedAt = 0;
  private offset = 0;
  private span = 0;
  private total = 0;

  play(pcm: PcmSound, from = 0, to = 1, onEnded?: () => void): void {
    this.stop();
    const ctx = getAudioContext();
    void ctx.resume?.();
    const buf = ctx.createBuffer(1, Math.max(1, pcm.samples.length), pcm.sampleRate);
    buf.copyToChannel(new Float32Array(pcm.samples), 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    this.total = buf.duration;
    this.offset = from * buf.duration;
    this.span = Math.max(0, (to - from) * buf.duration);
    this.startedAt = ctx.currentTime;
    src.onended = () => {
      if (this.source === src) this.source = null;
      onEnded?.();
    };
    src.start(0, this.offset, this.span);
    this.source = src;
  }

  /** Posisi playhead 0..1 atau null bila tidak memutar. */
  position(): number | null {
    if (!this.source || this.total === 0) return null;
    const ctx = getAudioContext();
    const p = (this.offset + Math.min(this.span, ctx.currentTime - this.startedAt)) / this.total;
    return Math.max(0, Math.min(1, p));
  }

  stop(): void {
    const s = this.source;
    this.source = null;
    if (s) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        // sudah berhenti
      }
    }
  }
}
