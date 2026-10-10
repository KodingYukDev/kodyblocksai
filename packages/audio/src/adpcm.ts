/**
 * Dekoder WAV IMA ADPCM (format suara Scratch 2 / sb3 lama).
 * Port dari scratch-audio 1.0.325 src/ADPCMSoundDecoder.js + ArrayBufferStream.js (BSD-3-Clause,
 * (c) 2016 MIT). Algoritma, termasuk kekhasan hitungan sampel (`numberOfSamples`), dipertahankan
 * agar `sampleCount` dan isi sampel identik Scratch. Bagian ini murni (tanpa WebAudio) supaya bisa
 * dites di node.
 */

const STEP_TABLE: readonly number[] = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97,
  107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
  876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428,
  4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350,
  22385, 24623, 27086, 29794, 32767,
];

const INDEX_TABLE: readonly number[] = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];

let deltaTableCache: Int32Array | null = null;

function deltaTable(): Int32Array {
  if (deltaTableCache) return deltaTableCache;
  const table = new Int32Array(STEP_TABLE.length * INDEX_TABLE.length);
  let i = 0;
  for (const step of STEP_TABLE) {
    for (let code = 0; code < INDEX_TABLE.length; code++) {
      let delta = 0;
      if (code & 4) delta += step;
      if (code & 2) delta += step >> 1;
      if (code & 1) delta += step >> 2;
      delta += step >> 3;
      table[i++] = code & 8 ? -delta : delta;
    }
  }
  deltaTableCache = table;
  return table;
}

/** Galat format: file bukan WAV ADPCM yang bisa dibaca. */
export class AdpcmFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdpcmFormatError";
  }
}

/** Pembaca little-endian berbatas (padanan ArrayBufferStream). Baca melewati batas -> galat. */
class ByteStream {
  private readonly view: DataView;
  private pos: number;

  constructor(
    private readonly buffer: ArrayBuffer,
    private readonly start = 0,
    private readonly end = buffer.byteLength,
  ) {
    this.view = new DataView(buffer);
    this.pos = start;
  }

  get position(): number {
    return this.pos - this.start;
  }
  set position(value: number) {
    this.pos = value + this.start;
  }
  get length(): number {
    return this.end - this.start;
  }
  get bytesAvailable(): number {
    return this.end - this.pos;
  }

  private need(n: number): void {
    if (this.pos < this.start || this.pos + n > this.end) {
      throw new AdpcmFormatError("data WAV terpotong");
    }
  }

  extract(length: number): ByteStream {
    const end = Math.min(this.pos + Math.max(0, length), this.end);
    return new ByteStream(this.buffer, this.pos, end);
  }
  readUint8(): number {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }
  readString(n: number): string {
    this.need(n);
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.view.getUint8(this.pos + i));
    this.pos += n;
    return s;
  }
  readInt16(): number {
    this.need(2);
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }
  readUint16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  readInt32(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  readUint32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
}

/** Cari chunk RIFF (mulai offset 12), persis ADPCMSoundDecoder.extractChunk. */
function extractChunk(type: string, stream: ByteStream): ByteStream | null {
  stream.position = 12;
  while (stream.position < stream.length - 8) {
    const typeStr = stream.readString(4);
    const size = stream.readInt32();
    if (typeStr === type) return stream.extract(size);
    if (size < 0) return null;
    stream.position += size;
  }
  return null;
}

/** Jumlah sampel, persis numberOfSamples scratch-audio (termasuk "+1" tunggal untuk semua blok penuh). */
function numberOfSamples(data: ByteStream | null, blockSize: number): number {
  if (!data) return 0;
  data.position = 0;
  const available = data.bytesAvailable;
  const blocks = (available / blockSize) | 0;
  const fullBlocks = blocks * (2 * (blockSize - 4)) + 1;
  const subBlock = Math.max((available % blockSize) - 4, 0) * 2;
  const incompleteBlock = Math.min(available % blockSize, 1);
  return fullBlocks + subBlock + incompleteBlock;
}

function imaDecompress(data: ByteStream | null, blockSize: number, out: Float32Array): void {
  if (!data) return;
  data.position = 0;
  const size = out.length;
  const samplesAfterBlockHeader = (blockSize - 4) * 2;
  const DELTA = deltaTable();
  let i = 0;
  while (i < size) {
    // Data habis sebelum hitungan sampel terpenuhi (file rusak): sisanya diam.
    if (data.bytesAvailable < 2) break;
    let sample = data.readInt16();
    // Blok terakhir yang hanya berisi sebagian header: sampel header tetap ditulis (scratch-audio).
    let index = data.bytesAvailable >= 1 ? data.readUint8() : 0;
    data.position = Math.min(data.position + 1, data.length);
    if (index > 88) index = 88;
    out[i++] = sample / 32768;

    const blockLength = Math.min(samplesAfterBlockHeader, size - i);
    const blockStart = i;
    while (i - blockStart < blockLength) {
      if (data.bytesAvailable < 1) return;
      const lastByte = data.readUint8();
      let code = lastByte & 0xf;
      let delta = DELTA[index * 16 + code] ?? 0;
      index += INDEX_TABLE[code] ?? 0;
      if (index > 88) index = 88;
      else if (index < 0) index = 0;
      sample += delta;
      if (sample > 32767) sample = 32767;
      else if (sample < -32768) sample = -32768;
      // Tulisan di luar panjang array diabaikan typed array, sama seperti scratch-audio.
      if (i < size) out[i] = sample / 32768;
      i++;

      code = (lastByte >> 4) & 0xf;
      delta = DELTA[index * 16 + code] ?? 0;
      index += INDEX_TABLE[code] ?? 0;
      if (index > 88) index = 88;
      else if (index < 0) index = 0;
      sample += delta;
      if (sample > 32767) sample = 32767;
      else if (sample < -32768) sample = -32768;
      if (i < size) out[i] = sample / 32768;
      i++;
    }
  }
}

export interface AdpcmHeader {
  encoding: number;
  channels: number;
  sampleRate: number;
  blockAlign: number;
  bitsPerSample: number;
  samplesPerBlock: number;
}

export interface AdpcmDecoded {
  sampleRate: number;
  /** Sampel mono -1..1. */
  samples: Float32Array;
}

/** Batas sampel hasil dekode (~ 1 jam pada 22050 Hz) agar file jahat tidak menghabiskan memori. */
export const ADPCM_MAX_SAMPLES = 22050 * 60 * 60;

function readHeader(stream: ByteStream): AdpcmHeader {
  if (stream.length < 12 || stream.readString(4) !== "RIFF") {
    throw new AdpcmFormatError("header RIFF tidak valid");
  }
  stream.readInt32();
  if (stream.readString(4) !== "WAVE") throw new AdpcmFormatError("header WAVE tidak valid");
  const fmt = extractChunk("fmt ", stream);
  if (!fmt) throw new AdpcmFormatError("chunk fmt tidak ada");
  const encoding = fmt.readUint16();
  const channels = fmt.readUint16();
  const sampleRate = fmt.readUint32();
  fmt.readUint32(); // bytesPerSecond
  const blockAlign = fmt.readUint16();
  const bitsPerSample = fmt.readUint16();
  let samplesPerBlock = 0;
  if (fmt.bytesAvailable >= 4) {
    fmt.position = fmt.position + 2; // jumlah byte header tambahan
    samplesPerBlock = fmt.readUint16();
  }
  return { encoding, channels, sampleRate, blockAlign, bitsPerSample, samplesPerBlock };
}

/** Baca header WAV; null kalau bukan WAV yang valid. */
export function readWavHeader(data: ArrayBuffer): AdpcmHeader | null {
  try {
    return readHeader(new ByteStream(data));
  } catch {
    return null;
  }
}

/** WAV dengan encoding 0x11 (IMA ADPCM), yang tidak didukung decodeAudioData browser. */
export function isAdpcmWav(data: ArrayBuffer): boolean {
  return readWavHeader(data)?.encoding === 0x11;
}

/** Dekode WAV IMA ADPCM mono 4-bit menjadi sampel float. */
export function decodeAdpcmSamples(data: ArrayBuffer): AdpcmDecoded {
  const stream = new ByteStream(data);
  const header = readHeader(stream);
  const blockSize = (header.samplesPerBlock - 1) / 2 + 4;
  if (!Number.isFinite(blockSize) || blockSize <= 4 || !Number.isInteger(blockSize)) {
    throw new AdpcmFormatError(`samplesPerBlock tidak valid: ${header.samplesPerBlock}`);
  }
  const compressed = extractChunk("data", stream);
  const sampleCount = numberOfSamples(compressed, blockSize);
  if (sampleCount > ADPCM_MAX_SAMPLES) throw new AdpcmFormatError("sound terlalu panjang");
  const samples = new Float32Array(sampleCount);
  imaDecompress(compressed, blockSize, samples);
  return { sampleRate: header.sampleRate, samples };
}

/** Dekode WAV ADPCM ke AudioBuffer (padanan ADPCMSoundDecoder.decode). */
export function decodeAdpcmWav(data: ArrayBuffer, context: BaseAudioContext): AudioBuffer {
  const { sampleRate, samples } = decodeAdpcmSamples(data);
  const buffer = context.createBuffer(1, samples.length, sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

/** Hanya untuk tes: tabel internal. */
export const __adpcmTables = { STEP_TABLE, INDEX_TABLE, deltaTable };
