import { describe, expect, it } from "vitest";
import { WavFormatError, decodeWav, encodeWav, floatToInt16, readWavInfo } from "./wav";

describe("wav", () => {
  it("encode menghasilkan header PCM 16-bit mono", () => {
    const bytes = encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1]), 22050);
    expect(bytes.length).toBe(44 + 10);
    const info = readWavInfo(bytes);
    expect(info).toMatchObject({ format: 1, channels: 1, sampleRate: 22050, bitsPerSample: 16, dataLength: 10 });
  });

  it("round-trip menjaga sampel dalam presisi 16-bit", () => {
    const src = new Float32Array(1000).map((_, i) => Math.sin(i / 10) * 0.9);
    const { samples, sampleRate } = decodeWav(encodeWav(src, 48000));
    expect(sampleRate).toBe(48000);
    expect(samples.length).toBe(1000);
    for (let i = 0; i < src.length; i++) expect(Math.abs((samples[i] ?? 0) - (src[i] ?? 0))).toBeLessThan(1 / 16000);
  });

  it("floatToInt16 membatasi & menangani NaN", () => {
    expect(floatToInt16(2)).toBe(32767);
    expect(floatToInt16(-2)).toBe(-32768);
    expect(floatToInt16(Number.NaN)).toBe(0);
  });

  it("decode 8-bit stereo memakai kanal 0", () => {
    const bytes = encodeWav(new Float32Array(0), 8000);
    const buf = new Uint8Array(44 + 4);
    buf.set(bytes.subarray(0, 44));
    const v = new DataView(buf.buffer);
    v.setUint16(22, 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 8, true);
    v.setUint32(40, 4, true);
    buf.set([255, 0, 0, 255], 44);
    const { samples } = decodeWav(buf);
    expect(Array.from(samples)).toEqual([127 / 128, -1]);
  });

  it("menolak file bukan WAV dan ADPCM", () => {
    expect(() => decodeWav(new Uint8Array(50))).toThrow(WavFormatError);
    const b = encodeWav(new Float32Array(4), 8000);
    new DataView(b.buffer).setUint16(20, 17, true);
    expect(() => decodeWav(b)).toThrow(/tidak didukung/);
  });
});
