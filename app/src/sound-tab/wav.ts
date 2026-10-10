/**
 * Encode/decode WAV PCM tanpa WebAudio (dipakai editor suara & generator pustaka).
 * Encode: mono 16-bit PCM, sama dengan wav-encoder default yang dipakai scratch-gui
 * (audio-util.js encodeAndAddSoundToVM). Decode: PCM 8/16/24/32-bit & float32, kanal 0
 * (editor scratch-gui juga hanya memakai getChannelData(0)). ADPCM ditangani @kody/audio.
 */

export interface PcmSound {
  samples: Float32Array;
  sampleRate: number;
}

export class WavFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WavFormatError";
  }
}

function writeAscii(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

/** Float [-1,1] -> int16, dibulatkan & dibatasi seperti wav-encoder. */
export function floatToInt16(v: number): number {
  const x = Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
  return x < 0 ? Math.round(x * 0x8000) : Math.round(x * 0x7fff);
}

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const rate = Math.round(sampleRate);
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, floatToInt16(samples[i] ?? 0), true);
  return new Uint8Array(buf);
}

function readAscii(view: DataView, offset: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

export interface WavInfo {
  format: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  blockAlign: number;
  dataOffset: number;
  dataLength: number;
}

export function readWavInfo(bytes: Uint8Array): WavInfo {
  if (bytes.length < 12) throw new WavFormatError("File WAV terlalu pendek");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") throw new WavFormatError("Bukan file WAV");
  let off = 12;
  let fmt: Omit<WavInfo, "dataOffset" | "dataLength"> | null = null;
  while (off + 8 <= bytes.length) {
    const id = readAscii(view, off, 4);
    const size = view.getUint32(off + 4, true);
    const body = off + 8;
    if (id === "fmt ") {
      if (size < 16 || body + 16 > bytes.length) throw new WavFormatError("Chunk fmt rusak");
      let format = view.getUint16(body, true);
      if (format === 0xfffe && size >= 26) format = view.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE
      fmt = {
        format,
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        blockAlign: view.getUint16(body + 12, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!fmt) throw new WavFormatError("Chunk data sebelum fmt");
      const dataLength = Math.min(size, bytes.length - body);
      return { ...fmt, dataOffset: body, dataLength };
    }
    off = body + size + (size & 1);
  }
  throw new WavFormatError("Chunk data tidak ditemukan");
}

/** Decode WAV PCM/float ke Float32 kanal 0. Format lain (ADPCM=17) -> WavFormatError. */
export function decodeWav(bytes: Uint8Array): PcmSound {
  const info = readWavInfo(bytes);
  const { format, channels, bitsPerSample, sampleRate } = info;
  if (channels < 1 || sampleRate <= 0) throw new WavFormatError("Header WAV tidak sah");
  const bytesPer = bitsPerSample / 8;
  const frameBytes = info.blockAlign || bytesPer * channels;
  if (!Number.isInteger(bytesPer) || bytesPer < 1 || frameBytes < bytesPer) throw new WavFormatError("Bit per sampel tidak didukung");
  const isFloat = format === 3;
  if (!(format === 1 || (isFloat && bitsPerSample === 32))) throw new WavFormatError(`Format WAV ${format} tidak didukung`);
  const count = Math.floor(info.dataLength / frameBytes);
  const out = new Float32Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i++) {
    const p = info.dataOffset + i * frameBytes;
    let v: number;
    if (isFloat) v = view.getFloat32(p, true);
    else if (bitsPerSample === 8) v = (view.getUint8(p) - 128) / 128;
    else if (bitsPerSample === 16) v = view.getInt16(p, true) / 32768;
    else if (bitsPerSample === 24) {
      const raw = view.getUint8(p) | (view.getUint8(p + 1) << 8) | (view.getInt8(p + 2) << 16);
      v = raw / 8388608;
    } else if (bitsPerSample === 32) v = view.getInt32(p, true) / 2147483648;
    else throw new WavFormatError("Bit per sampel tidak didukung");
    out[i] = v;
  }
  return { samples: out, sampleRate };
}
