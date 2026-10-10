import { describe, expect, it } from "vitest";
import { ECHO_TAIL_SECONDS, EFFECT_TYPES, PITCH_RATIO, applyEffect, compress, diode, effectLayout, highpass, waveShape } from "./sound-effects";

const RATE = 8000;
const tone = (n: number, amp = 0.5): Float32Array => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * 440 * i) / RATE));
const peak = (a: Float32Array, from = 0, to = a.length): number => {
  let m = 0;
  for (let i = from; i < to; i++) m = Math.max(m, Math.abs(a[i] ?? 0));
  return m;
};

describe("effectLayout (konstruktor AudioEffects)", () => {
  it("faster memendekkan bagian terseleksi dan menyesuaikan seleksi", () => {
    const L = effectLayout(8000, RATE, EFFECT_TYPES.FASTER, 0.25, 0.75);
    const affected = 4000;
    const adj = Math.floor(affected / PITCH_RATIO);
    expect(L.sampleCount).toBe(4000 + adj);
    expect(L.adjustedTrimStart).toBeCloseTo(2000 / L.sampleCount, 10);
    expect(L.adjustedTrimEnd).toBeCloseTo((2000 + adj) / L.sampleCount, 10);
  });

  it("echo menambah ekor 0.75 detik setelah akhir seleksi", () => {
    const L = effectLayout(8000, RATE, EFFECT_TYPES.ECHO, 0, 1);
    expect(L.sampleCount).toBe(Math.floor((1 + ECHO_TAIL_SECONDS) * RATE));
  });
});

describe("applyEffect", () => {
  it("tidak memproses suara < 2 sampel", () => {
    expect(applyEffect({ samples: new Float32Array(1), sampleRate: RATE }, EFFECT_TYPES.ECHO)).toBeNull();
  });

  it("reverse hanya membalik seleksi (port persis)", () => {
    const s = Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7]).map((v) => v / 10);
    const r = applyEffect({ samples: s, sampleRate: 8 }, EFFECT_TYPES.REVERSE, 0.25, 0.75);
    expect(Array.from(r?.samples ?? []).map((v) => Math.round(v * 10))).toEqual([0, 1, 5, 4, 3, 2, 6, 7]);
  });

  it("louder/softer mengalikan seleksi dengan 1.25/0.75", () => {
    const s = tone(8000);
    const up = applyEffect({ samples: s, sampleRate: RATE }, EFFECT_TYPES.LOUDER);
    const down = applyEffect({ samples: s, sampleRate: RATE }, EFFECT_TYPES.SOFTER);
    expect(peak(up?.samples ?? new Float32Array(), 200, 7000)).toBeCloseTo(0.625, 2);
    expect(peak(down?.samples ?? new Float32Array(), 200, 7000)).toBeCloseTo(0.375, 2);
  });

  it("mute membuat seleksi hening, di luar tetap", () => {
    const s = tone(8000);
    const r = applyEffect({ samples: s, sampleRate: RATE }, EFFECT_TYPES.MUTE, 0.25, 0.5)?.samples ?? new Float32Array();
    expect(peak(r, 2100, 3900)).toBe(0);
    expect(peak(r, 5000, 8000)).toBeCloseTo(0.5, 2);
  });

  it("fade in naik dari 0, fade out turun ke 0", () => {
    const s = new Float32Array(8000).fill(0.5);
    const fin = applyEffect({ samples: s, sampleRate: RATE }, EFFECT_TYPES.FADEIN)?.samples ?? new Float32Array();
    const fout = applyEffect({ samples: s, sampleRate: RATE }, EFFECT_TYPES.FADEOUT)?.samples ?? new Float32Array();
    expect(fin[0]).toBeCloseTo(0, 5);
    expect(fin[4000]).toBeCloseTo(0.25, 2);
    expect(fout[0]).toBeCloseTo(0.5, 5);
    expect(fout[7999]).toBeCloseTo(0, 2);
  });

  it("faster/slower mengubah panjang sesuai rasio terts mayor", () => {
    const s = tone(8000);
    const f = applyEffect({ samples: s, sampleRate: RATE }, EFFECT_TYPES.FASTER);
    const sl = applyEffect({ samples: s, sampleRate: RATE }, EFFECT_TYPES.SLOWER);
    expect(f?.samples.length).toBe(Math.floor(8000 / PITCH_RATIO));
    expect(sl?.samples.length).toBe(Math.floor(8000 * PITCH_RATIO));
    expect(f?.trimStart).toBe(0);
    expect(f?.trimEnd).toBeCloseTo(1, 10);
  });

  it("echo menghasilkan pantulan setelah suara berhenti", () => {
    const s = new Float32Array(4000);
    s.set(tone(800), 0);
    const r = applyEffect({ samples: s, sampleRate: RATE }, EFFECT_TYPES.ECHO)?.samples ?? new Float32Array();
    expect(r.length).toBe(Math.floor((0.5 + ECHO_TAIL_SECONDS) * RATE));
    expect(peak(r, 2000, 2800)).toBeGreaterThan(0.2); // pantulan pertama (0.25 s)
    expect(peak(r, 1000, 1900)).toBeLessThan(1e-6);
  });

  it("robot mengubah seleksi dan tetap dalam batas", () => {
    const s = tone(8000);
    const r = applyEffect({ samples: s, sampleRate: RATE }, EFFECT_TYPES.ROBOT, 0.5, 1)?.samples ?? new Float32Array();
    expect(Array.from(r.subarray(0, 3900))).toEqual(Array.from(s.subarray(0, 3900)));
    expect(peak(r, 4100, 8000)).toBeGreaterThan(0);
    expect(peak(r)).toBeLessThan(2);
  });
});

describe("node DSP", () => {
  it("diode = transform robot-effect.js", () => {
    expect(diode(0.1)).toBe(0);
    expect(diode(0.3)).toBeCloseTo(0.65 * (0.01 / 0.4), 10);
    expect(diode(1)).toBeCloseTo(0.65 - 0.26 + 0.65 * (0.64 / 0.4), 10);
    expect(waveShape(-1)).toBe(0);
  });

  it("highpass meredam DC", () => {
    const out = highpass(new Float32Array(4000).fill(1), RATE, 1000);
    expect(Math.abs(out[3999] ?? 1)).toBeLessThan(1e-3);
  });

  it("compressor membatasi sinyal keras", () => {
    const out = compress(new Float32Array(1000).fill(4), RATE);
    expect(out[999]).toBeLessThan(4);
    expect(out[999]).toBeGreaterThan(0);
  });
});
