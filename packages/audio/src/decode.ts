/**
 * Dekode audio: urutan sama dengan scratch-audio AudioEngine._decodeSound:
 * 1. decodeAudioData browser (WAV PCM, MP3, OGG, ...);
 * 2. gagal & data kosong -> buffer kosong 1 sampel;
 * 3. gagal -> coba WAV IMA ADPCM (dekoder sendiri);
 * 4. ADPCM juga gagal -> buffer kosong 1 sampel.
 */
import { decodeAdpcmWav } from "./adpcm";

export { decodeAdpcmSamples, decodeAdpcmWav, isAdpcmWav, readWavHeader, AdpcmFormatError } from "./adpcm";
export type { AdpcmDecoded, AdpcmHeader } from "./adpcm";

/** Bungkus decodeAudioData agar jalan dengan API promise maupun callback lama (Safari lama). */
export function nativeDecode(context: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    try {
      const maybe = context.decodeAudioData(data, resolve, (err) => reject(err ?? new Error("decode gagal")));
      if (maybe && typeof (maybe as Promise<AudioBuffer>).then === "function") {
        (maybe as Promise<AudioBuffer>).then(resolve, reject);
      }
    } catch (err) {
      reject(err);
    }
  });
}

/** Buffer kosong untuk sound yang tidak bisa didekode (scratch-audio _emptySound). */
export function emptySound(context: BaseAudioContext): AudioBuffer {
  return context.createBuffer(1, 1, context.sampleRate);
}

/**
 * Dekode data sound menjadi AudioBuffer. Tidak pernah reject: data rusak menghasilkan buffer kosong,
 * sama seperti Scratch (project tetap bisa dibuka).
 * `data` tidak diubah; setiap percobaan memakai salinan karena decodeAudioData melepas buffer.
 */
export async function decodeToAudioBuffer(context: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  try {
    return await nativeDecode(context, data.slice(0));
  } catch {
    if (data.byteLength === 0) return emptySound(context);
    try {
      return decodeAdpcmWav(data.slice(0), context);
    } catch {
      return emptySound(context);
    }
  }
}
