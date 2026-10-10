import { describe, expect, it } from "vitest";
import { GifFormatError, decodeGif, isGif, lzwDecode } from "./gif-decoder";

/** Encoder LZW GIF standar (hanya untuk tes). */
function lzwEncode(minCodeSize: number, indices: number[]): Uint8Array {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  const dict = new Map<string, number>();
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  const emit = (code: number) => {
    acc |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      bytes.push(acc & 0xff);
      acc >>>= 8;
      bits -= 8;
    }
  };
  emit(clear);
  let w = "";
  for (const k of indices) {
    const wk = w ? `${w},${k}` : `${k}`;
    if (w === "" || dict.has(wk)) {
      w = wk;
      continue;
    }
    emit(w.includes(",") ? (dict.get(w) ?? 0) : Number(w));
    if (next < 4096) {
      dict.set(wk, next++);
      if (next - 1 === 1 << codeSize && codeSize < 12) codeSize++;
    }
    w = `${k}`;
  }
  if (w) emit(w.includes(",") ? (dict.get(w) ?? 0) : Number(w));
  emit(eoi);
  if (bits > 0) bytes.push(acc & 0xff);
  return Uint8Array.from(bytes);
}

function subBlocks(data: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 255) {
    const chunk = data.subarray(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
  return out;
}

function makeGif(w: number, h: number, frames: { indices: number[]; transparent?: number; disposal?: number; x?: number; y?: number; fw?: number; fh?: number }[]): Uint8Array {
  const palette = [0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]; // 4 warna
  const b: number[] = [..."GIF89a"].map((c) => c.charCodeAt(0));
  b.push(w & 255, w >> 8, h & 255, h >> 8, 0x80 | 1, 0, 0, ...palette);
  for (const f of frames) {
    const flags = ((f.disposal ?? 0) << 2) | (f.transparent !== undefined ? 1 : 0);
    b.push(0x21, 0xf9, 4, flags, 10, 0, f.transparent ?? 0, 0);
    const fw = f.fw ?? w;
    const fh = f.fh ?? h;
    b.push(0x2c, (f.x ?? 0) & 255, 0, (f.y ?? 0) & 255, 0, fw, 0, fh, 0, 0);
    b.push(2, ...subBlocks(lzwEncode(2, f.indices)));
  }
  b.push(0x3b);
  return Uint8Array.from(b);
}

const px = (f: { rgba: Uint8ClampedArray; width: number }, x: number, y: number) => Array.from(f.rgba.subarray((y * f.width + x) * 4, (y * f.width + x) * 4 + 4));

describe("gif-decoder", () => {
  it("LZW round-trip termasuk kasus KwKwK dan pertumbuhan ukuran kode", () => {
    const data = Array.from({ length: 5000 }, (_, i) => (i * i + (i >> 3)) % 4);
    data.push(1, 1, 1, 1, 1, 1, 1);
    expect(Array.from(lzwDecode(2, lzwEncode(2, data), data.length))).toEqual(data);
  });

  it("mendeteksi header", () => {
    expect(isGif(new TextEncoder().encode("GIF89a...."))).toBe(true);
    expect(isGif(new TextEncoder().encode("PNG"))).toBe(false);
    expect(() => decodeGif(new Uint8Array(10))).toThrow(GifFormatError);
  });

  it("frame dikomposit dengan transparansi & disposal", () => {
    const gif = makeGif(2, 2, [
      { indices: [1, 2, 3, 0] },
      { indices: [0, 0, 0, 2], transparent: 0, disposal: 2 },
      { indices: [3], transparent: 0, x: 0, y: 0, fw: 1, fh: 1 },
    ]);
    const frames = decodeGif(gif);
    expect(frames).toHaveLength(3);
    const [f0, f1, f2] = frames;
    if (!f0 || !f1 || !f2) throw new Error("frame hilang");
    expect(px(f0, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(f0, 1, 1)).toEqual([0, 0, 0, 255]);
    expect(f0.delay).toBe(100);
    // frame 2: hanya piksel (1,1) diganti hijau, sisanya tetap dari frame 1
    expect(px(f1, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(f1, 1, 1)).toEqual([0, 255, 0, 255]);
    // disposal 2 mengosongkan area frame 2 (seluruh kanvas) -> frame 3 transparan kecuali (0,0)
    expect(px(f2, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(px(f2, 1, 1)).toEqual([0, 0, 0, 0]);
  });
});
