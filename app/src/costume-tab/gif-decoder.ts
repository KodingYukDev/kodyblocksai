/**
 * Dekoder GIF sendiri (GIF87a/89a): LZW, interlace, tabel warna global/lokal, transparansi,
 * dan disposal 0-3. Setiap frame dikembalikan sebagai gambar RGBA penuh (sudah dikomposit),
 * dipakai untuk "upload GIF = satu costume per frame" seperti scratch-gui lib/gif-decoder.js.
 * Dibatasi ukuran & jumlah frame agar file rusak/berbahaya tidak menghabiskan memori.
 */

export interface GifFrame {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  /** Jeda frame (ms). */
  delay: number;
}

export const GIF_LIMITS = {
  maxDimension: 4096,
  maxFrames: 300,
  maxTotalPixels: 64 * 1024 * 1024,
} as const;

export class GifFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GifFormatError";
  }
}

class Reader {
  pos = 0;
  constructor(readonly b: Uint8Array) {}
  u8(): number {
    if (this.pos >= this.b.length) throw new GifFormatError("File GIF terpotong");
    return this.b[this.pos++] ?? 0;
  }
  u16(): number {
    const lo = this.u8();
    return lo | (this.u8() << 8);
  }
  bytes(n: number): Uint8Array {
    if (this.pos + n > this.b.length) throw new GifFormatError("File GIF terpotong");
    const out = this.b.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  subBlocks(): Uint8Array {
    const parts: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const size = this.u8();
      if (size === 0) break;
      const part = this.bytes(size);
      parts.push(part);
      total += size;
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}

/** Dekompresi LZW GIF. Mengembalikan indeks warna sebanyak `pixelCount` (sisa diisi 0). */
export function lzwDecode(minCodeSize: number, data: Uint8Array, pixelCount: number): Uint8Array {
  if (minCodeSize < 2 || minCodeSize > 8) throw new GifFormatError("Ukuran kode LZW tidak sah");
  const out = new Uint8Array(pixelCount);
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const firstChar = new Uint8Array(4096);
  const length = new Int32Array(4096);
  for (let i = 0; i < clear; i++) {
    prefix[i] = -1;
    suffix[i] = i;
    firstChar[i] = i;
    length[i] = 1;
  }
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let prev = -1;
  let bits = 0;
  let acc = 0;
  let op = 0;
  let dp = 0;
  const stack = new Uint8Array(4096);

  while (op < pixelCount) {
    while (bits < codeSize) {
      if (dp >= data.length) return out;
      acc |= (data[dp++] ?? 0) << bits;
      bits += 8;
    }
    const code = acc & ((1 << codeSize) - 1);
    acc >>>= codeSize;
    bits -= codeSize;
    if (code === clear) {
      codeSize = minCodeSize + 1;
      next = eoi + 1;
      prev = -1;
      continue;
    }
    if (code === eoi) break;
    let cur: number;
    if (code < next) cur = code;
    else if (code === next && prev !== -1) cur = prev;
    else throw new GifFormatError("Kode LZW tidak sah");

    // Uraikan string `cur` ke stack (terbalik).
    let sp = 0;
    let c = cur;
    while (c >= 0 && sp < 4096) {
      stack[sp++] = suffix[c] ?? 0;
      c = prefix[c] ?? -1;
    }
    if (code === next) {
      // KwKwK: string prev + firstChar(prev)
      const fc = firstChar[prev] ?? 0;
      for (let i = sp - 1; i >= 0 && op < pixelCount; i--) out[op++] = stack[i] ?? 0;
      if (op < pixelCount) out[op++] = fc;
    } else {
      for (let i = sp - 1; i >= 0 && op < pixelCount; i--) out[op++] = stack[i] ?? 0;
    }
    if (prev !== -1 && next < 4096) {
      prefix[next] = prev;
      const fc = code === next ? (firstChar[prev] ?? 0) : (firstChar[cur] ?? 0);
      suffix[next] = fc;
      firstChar[next] = firstChar[prev] ?? 0;
      length[next] = (length[prev] ?? 0) + 1;
      next++;
      if (next === 1 << codeSize && codeSize < 12) codeSize++;
    }
    prev = code;
  }
  return out;
}

function deinterlace(indices: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(indices.length);
  let row = 0;
  const passes: [number, number][] = [
    [0, 8],
    [4, 8],
    [2, 4],
    [1, 2],
  ];
  for (const [start, step] of passes) {
    for (let y = start; y < h; y += step) {
      out.set(indices.subarray(row * w, row * w + w), y * w);
      row++;
    }
  }
  return out;
}

export function isGif(bytes: Uint8Array): boolean {
  return bytes.length >= 6 && String.fromCharCode(...bytes.subarray(0, 6)).match(/^GIF8[79]a$/) !== null;
}

export function decodeGif(bytes: Uint8Array): GifFrame[] {
  if (!isGif(bytes)) throw new GifFormatError("Bukan file GIF");
  const r = new Reader(bytes);
  r.pos = 6;
  const width = r.u16();
  const height = r.u16();
  if (width < 1 || height < 1 || width > GIF_LIMITS.maxDimension || height > GIF_LIMITS.maxDimension) {
    throw new GifFormatError("Ukuran GIF tidak didukung");
  }
  const packed = r.u8();
  r.u8(); // background color index (diabaikan: browser memakai transparan)
  r.u8(); // aspect
  const globalTable = packed & 0x80 ? r.bytes(3 * (1 << ((packed & 7) + 1))) : null;

  const frames: GifFrame[] = [];
  const canvas = new Uint8ClampedArray(width * height * 4);
  let transparentIndex = -1;
  let disposal = 0;
  let delay = 0;
  let totalPixels = 0;

  for (;;) {
    const block = r.u8();
    if (block === 0x3b) break; // trailer
    if (block === 0x21) {
      const label = r.u8();
      const body = r.subBlocks();
      if (label === 0xf9 && body.length >= 4) {
        const flags = body[0] ?? 0;
        disposal = (flags >> 2) & 7;
        delay = ((body[1] ?? 0) | ((body[2] ?? 0) << 8)) * 10;
        transparentIndex = flags & 1 ? (body[3] ?? -1) : -1;
      }
      continue;
    }
    if (block !== 0x2c) throw new GifFormatError("Blok GIF tidak dikenal");
    const fx = r.u16();
    const fy = r.u16();
    const fw = r.u16();
    const fh = r.u16();
    const fpacked = r.u8();
    const localTable = fpacked & 0x80 ? r.bytes(3 * (1 << ((fpacked & 7) + 1))) : null;
    const table = localTable ?? globalTable;
    const minCode = r.u8();
    const data = r.subBlocks();
    if (!table) throw new GifFormatError("GIF tanpa tabel warna");
    if (frames.length >= GIF_LIMITS.maxFrames) break;
    totalPixels += width * height;
    if (totalPixels > GIF_LIMITS.maxTotalPixels) throw new GifFormatError("GIF terlalu besar");

    let indices = lzwDecode(minCode, data, fw * fh);
    if (fpacked & 0x40) indices = deinterlace(indices, fw, fh);

    const previous = disposal === 3 ? canvas.slice() : null;
    for (let y = 0; y < fh; y++) {
      const cy = fy + y;
      if (cy >= height) break;
      for (let x = 0; x < fw; x++) {
        const cx = fx + x;
        if (cx >= width) break;
        const idx = indices[y * fw + x] ?? 0;
        if (idx === transparentIndex) continue;
        const o = (cy * width + cx) * 4;
        canvas[o] = table[idx * 3] ?? 0;
        canvas[o + 1] = table[idx * 3 + 1] ?? 0;
        canvas[o + 2] = table[idx * 3 + 2] ?? 0;
        canvas[o + 3] = 255;
      }
    }
    frames.push({ width, height, rgba: canvas.slice(), delay });

    if (disposal === 2) {
      for (let y = fy; y < Math.min(height, fy + fh); y++) {
        canvas.fill(0, (y * width + fx) * 4, (y * width + Math.min(width, fx + fw)) * 4);
      }
    } else if (disposal === 3 && previous) {
      canvas.set(previous);
    }
    transparentIndex = -1;
    disposal = 0;
    delay = 0;
  }
  if (frames.length === 0) throw new GifFormatError("GIF tanpa frame");
  return frames;
}
