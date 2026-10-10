import { describe, expect, it } from "vitest";
import {
  SOUND_BYTE_LIMIT,
  SoundHistory,
  SoundTooLargeError,
  UNDO_STACK_SIZE,
  autoTrimRecording,
  computeChunkedRMS,
  computeRMS,
  copySelection,
  cropToSelection,
  deleteSelection,
  downsampleIfNeeded,
  isTooLoud,
  pasteBuffer,
  resample,
} from "./sound-edit";

const seq = (n: number): Float32Array => Float32Array.from({ length: n }, (_, i) => i);
const snd = (n: number, rate = 10) => ({ samples: seq(n), sampleRate: rate });

describe("sound-edit", () => {
  it("computeRMS sama dengan rumus audio-util.js", () => {
    expect(computeRMS([])).toBe(0);
    expect(computeRMS([0.55, -0.55])).toBeCloseTo(1, 10);
    expect(computeChunkedRMS(new Float32Array(2500), 1024)).toHaveLength(3);
  });

  it("isTooLoud memeriksa chunk di seleksi", () => {
    // Tanpa seleksi scratch-gui memakai slice(0, n - 1): chunk terakhir tidak ikut diperiksa.
    expect(isTooLoud([0.1, 1.3, 0.2], null)).toBe(true);
    expect(isTooLoud([0.1, 0.2, 1.3], null)).toBe(false);
    expect(isTooLoud([1.3, 0.1, 0.1, 0.1], { trimStart: 0.5, trimEnd: 1 })).toBe(false);
  });

  it("deleteSelection & cropToSelection", () => {
    expect(Array.from(deleteSelection(snd(10), { trimStart: 0.2, trimEnd: 0.5 }).samples)).toEqual([0, 1, 5, 6, 7, 8, 9]);
    expect(deleteSelection(snd(10), { trimStart: 0, trimEnd: 1 }).samples.length).toBe(1);
    expect(Array.from(cropToSelection(snd(10), { trimStart: 0.2, trimEnd: 0.5 }).samples)).toEqual([2, 3, 4]);
    expect(cropToSelection(snd(10), { trimStart: 0.5, trimEnd: 0.5 }).samples.length).toBe(1);
  });

  it("copy & paste di akhir / mengganti seleksi", () => {
    const clip = copySelection(snd(10), { trimStart: 0, trimEnd: 0.3 });
    expect(Array.from(clip.samples)).toEqual([0, 1, 2]);
    expect(copySelection(snd(4), null).samples.length).toBe(4);
    const appended = pasteBuffer(snd(4), clip, null);
    expect(Array.from(appended.samples)).toEqual([0, 1, 2, 3, 0, 1, 2]);
    const replaced = pasteBuffer(snd(10), clip, { trimStart: 0.5, trimEnd: 0.9 });
    expect(Array.from(replaced.samples)).toEqual([0, 1, 2, 3, 4, 0, 1, 2, 9]);
    expect(replaced.selection?.trimStart).toBeCloseTo(5 / 9, 10);
    expect(replaced.selection?.trimEnd).toBeCloseTo(8 / 9, 10);
  });

  it("paste me-resample buffer dengan rate berbeda", () => {
    const r = pasteBuffer(snd(2, 10), { samples: new Float32Array(10), sampleRate: 20 }, null);
    expect(r.samples.length).toBe(2 + 5);
    expect(resample({ samples: seq(4), sampleRate: 4 }, 8).samples.length).toBe(8);
  });

  it("downsampleIfNeeded mengikuti batas 10MB", () => {
    const small = { samples: new Float32Array(100), sampleRate: 48000 };
    expect(downsampleIfNeeded(small)).toBe(small);
    const n = SOUND_BYTE_LIMIT / 2 + 10;
    const big = downsampleIfNeeded({ samples: new Float32Array(n), sampleRate: 48000 });
    expect(big.sampleRate).toBe(22050);
    expect(() => downsampleIfNeeded({ samples: new Float32Array(n), sampleRate: 22050 })).toThrow(SoundTooLargeError);
  });

  it("autoTrimRecording memotong hening di tepi", () => {
    const s = new Float32Array(1024 * 20);
    for (let i = 1024 * 8; i < 1024 * 12; i++) s[i] = Math.sin(i);
    const { trimStart, trimEnd, levels } = autoTrimRecording(s);
    expect(levels).toHaveLength(20);
    expect(trimStart).toBeCloseTo(7 / 20, 10);
    expect(trimEnd).toBeCloseTo(14 / 20, 10);
    expect(autoTrimRecording(new Float32Array(10))).toMatchObject({ trimStart: 0, trimEnd: 1 });
  });

  it("SoundHistory: undo/redo & batas ukuran", () => {
    const h = new SoundHistory();
    const item = (v: number) => ({ samples: new Float32Array([v]), sampleRate: 1, selection: null });
    h.push(item(1));
    const back = h.undo(item(2));
    expect(back?.samples[0]).toBe(1);
    expect(h.canRedo).toBe(true);
    expect(h.redo(item(1))?.samples[0]).toBe(2);
    h.push(item(3));
    expect(h.canRedo).toBe(false);
    for (let i = 0; i < UNDO_STACK_SIZE + 5; i++) h.push(item(i));
    let count = 0;
    while (h.undo(item(0))) count++;
    expect(count).toBe(UNDO_STACK_SIZE);
  });
});
