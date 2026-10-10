import { describe, expect, it } from "vitest";
import { decodeAdpcmSamples, decodeAdpcmWav, isAdpcmWav, readWavHeader } from "./adpcm";
import { decodeToAudioBuffer } from "./decode";
import { buildAdpcmWav, MockAudioContext, pcmBytes } from "./test-utils/mock-audio-context";

/**
 * Nilai oracle dihasilkan dengan menjalankan scratch-audio 1.0.325 ADPCMSoundDecoder asli
 * (_reference/bsd3-local) di node terhadap WAV yang sama (buildAdpcmWav).
 */
const ORACLE = [
  {
    len: 868,
    seed: 7,
    n: 1706,
    sum: -50.891143798828125,
    picks: [-0.516326904296875, -0.581451416015625, -0.694122314453125, 0.999969482421875, 0.428436279296875,
      0.42791748046875, 0.999969482421875, 0.999969482421875],
  },
  {
    len: 512,
    seed: 99,
    n: 1009,
    sum: 88.2335205078125,
    picks: [-0.45111083984375, -0.391937255859375, -0.305267333984375, -0.62493896484375, -0.76385498046875,
      -0.888824462890625, 0.999969482421875, 0.43170166015625],
  },
  {
    len: 259,
    seed: 5,
    n: 506,
    sum: 86.47821044921875,
    picks: [-0.525543212890625, -0.57794189453125, -0.682769775390625, 0.999969482421875, -0.544647216796875,
      undefined, 0.058624267578125, -0.544647216796875],
  },
];

describe("ADPCM decoder (paritas scratch-audio)", () => {
  for (const o of ORACLE) {
    it(`len=${o.len} seed=${o.seed} identik oracle`, () => {
      const { samples, sampleRate } = decodeAdpcmSamples(buildAdpcmWav(o.len, o.seed));
      expect(sampleRate).toBe(22050);
      expect(samples.length).toBe(o.n);
      let sum = 0;
      for (const x of samples) sum += x;
      expect(sum).toBe(o.sum);
      const idx = [0, 1, 2, 100, 505, 506, o.n - 2, o.n - 1];
      expect(idx.map((i) => samples[i])).toEqual(o.picks);
    });
  }

  it("deteksi header", () => {
    const wav = buildAdpcmWav(512, 1);
    expect(isAdpcmWav(wav)).toBe(true);
    expect(readWavHeader(wav)).toMatchObject({ encoding: 0x11, channels: 1, sampleRate: 22050, samplesPerBlock: 505 });
    expect(isAdpcmWav(pcmBytes())).toBe(false);
    expect(isAdpcmWav(new ArrayBuffer(0))).toBe(false);
  });

  it("menolak data rusak tanpa hang", () => {
    expect(() => decodeAdpcmSamples(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]).buffer)).toThrow();
    const wav = buildAdpcmWav(512, 1);
    new DataView(wav).setUint16(12 + 8 + 18, 0, true); // samplesPerBlock = 0
    expect(() => decodeAdpcmSamples(wav)).toThrow();
    // Ukuran data chunk berbohong (lebih besar dari file): dibatasi ke akhir buffer.
    const lie = buildAdpcmWav(512, 3);
    const v = new DataView(lie);
    v.setInt32(12 + 28 + 20 + 4, 1_000_000, true);
    expect(() => decodeAdpcmSamples(lie)).not.toThrow();
  });

  it("decodeAdpcmWav mengisi AudioBuffer", () => {
    const ctx = new MockAudioContext();
    const buf = decodeAdpcmWav(buildAdpcmWav(868, 7), ctx as unknown as BaseAudioContext);
    expect(buf.length).toBe(1706);
    expect(buf.sampleRate).toBe(22050);
    expect(buf.getChannelData(0)[0]).toBe(-0.516326904296875);
  });
});

describe("decodeToAudioBuffer (urutan _decodeSound)", () => {
  it("native dulu", async () => {
    const ctx = new MockAudioContext();
    const buf = await decodeToAudioBuffer(ctx as unknown as BaseAudioContext, pcmBytes());
    expect(buf.length).toBe(1000);
    expect(ctx.decodeCalls).toBe(1);
  });
  it("native gagal -> ADPCM", async () => {
    const ctx = new MockAudioContext();
    const data = buildAdpcmWav(512, 99);
    const buf = await decodeToAudioBuffer(ctx as unknown as BaseAudioContext, data);
    expect(buf.length).toBe(1009);
    expect(data.byteLength).toBeGreaterThan(0); // data asli tidak dilepas
  });
  it("kosong / rusak -> buffer 1 sampel", async () => {
    const ctx = new MockAudioContext();
    expect((await decodeToAudioBuffer(ctx as unknown as BaseAudioContext, new ArrayBuffer(0))).length).toBe(1);
    const junk = new Uint8Array(64).fill(7).buffer;
    expect((await decodeToAudioBuffer(ctx as unknown as BaseAudioContext, junk)).length).toBe(1);
  });
});
