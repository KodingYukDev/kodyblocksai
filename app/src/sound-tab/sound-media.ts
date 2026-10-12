/**
 * Bagian tab Suara yang butuh WebAudio: dekode file, pemutaran pratinjau, dan pembuatan NewSound
 * dari sampel hasil edit. DSP-nya murni di sound-effects.ts / sound-edit.ts.
 */
import { decodeToAudioBuffer } from "@kody/audio";
import { makeSound } from "../costume-tab/new-asset";
import type { NewSound, SoundView } from "../costume-tab/types";
import { downsampleIfNeeded, SoundTooLargeError } from "./sound-edit";
import { WavFormatError, decodeWav, encodeWav, type PcmSound } from "./wav";

/**
 * WAV/MP3 disimpan apa adanya (format sound Scratch 3). Format lain (rekaman iPad .m4a, .aac, .ogg,
 * .webm, .flac) didekode browser lalu disimpan sebagai WAV agar file project tetap bisa dibuka Scratch.
 * `audio/*` membuat pemilih file iPad/Android menampilkan semua file suara.
 */
export const SOUND_ACCEPT = "audio/*,.wav,.mp3,.m4a,.aac,.ogg,.oga,.webm,.flac,.caf";
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

const CONVERT_EXT = new Set(["m4a", "aac", "mp4", "ogg", "oga", "opus", "webm", "flac", "caf", "3gp"]);

/**
 * Jenis upload suara seperti file-uploader.js soundUpload (MIME), dengan cadangan ekstensi.
 * "convert" = format yang didekode lalu disimpan ulang sebagai WAV.
 */
export function classifySoundFile(name: string, mime: string): "wav" | "mp3" | "convert" | null {
  switch (mime.split(";")[0]?.trim().toLowerCase()) {
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
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "wav") return "wav";
  if (ext === "mp3") return "mp3";
  if (CONVERT_EXT.has(ext) || mime.toLowerCase().startsWith("audio/")) return "convert";
  return null;
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

/** Tanda tangan byte: RIFF....WAVE = wav, ID3 / frame sync MPEG = mp3, lainnya null. */
export function sniffSound(b: Uint8Array): "wav" | "mp3" | "other" | null {
  if (b.length < 4) return null;
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return "wav";
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return "mp3";
  if (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0 && ((b[1] ?? 0) & 0x06) !== 0) return "mp3";
  return "other";
}

export async function soundFromFile(file: { name: string; type: string; bytes: Uint8Array }): Promise<NewSound> {
  if (file.bytes.length > MAX_SOUND_UPLOAD_BYTES) throw new SoundImportError(`File ${file.name} terlalu besar (maks 10 MB)`);
  const kind = classifySoundFile(file.name, file.type);
  if (!kind) throw new SoundImportError(`Jenis file tidak didukung: ${file.name}`);
  let pcm: PcmSound;
  try {
    pcm = await decodeSoundBytes(file.bytes);
  } catch (e) {
    if (e instanceof SoundImportError) throw e;
    throw new SoundImportError(`Suara ${file.name} tidak bisa dibuka di browser ini`);
  }
  if (pcm.samples.length === 0) throw new SoundImportError(`Suara ${file.name} kosong`);
  const name = file.name.split(".", 1)[0] || "suara";
  // Nama .mp3/.wav tetapi isinya format lain (mis. rekaman m4a yang diganti nama): simpan ulang sebagai WAV.
  const sniffed = sniffSound(file.bytes);
  if (kind === "convert" || (sniffed !== null && sniffed !== kind)) {
    try {
      return encodeSamples(name, pcm).sound;
    } catch (e) {
      if (e instanceof SoundTooLargeError) throw new SoundImportError(`Suara ${file.name} terlalu panjang`);
      throw e;
    }
  }
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
