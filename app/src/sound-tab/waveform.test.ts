import { describe, expect, it } from "vitest";
import { formatDuration, selectionFromDrag, waveformPath } from "./waveform";

describe("waveform", () => {
  it("path kosong = garis tengah", () => {
    expect(waveformPath([], 100, 40)).toBe("M0 20H100");
  });

  it("path simetris dan ditutup", () => {
    const d = waveformPath([1, 0.5], 90, 40);
    expect(d.startsWith("M0 20")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).toContain("L30 0");
    expect(d).toContain("L30 40");
  });

  it("level > 1 dibatasi", () => {
    expect(waveformPath([5], 10, 20)).toContain("L5 0");
  });

  it("seleksi dari seret", () => {
    expect(selectionFromDrag(80, 20, 100)).toEqual({ trimStart: 0.2, trimEnd: 0.8 });
    expect(selectionFromDrag(-10, 200, 100)).toEqual({ trimStart: 0, trimEnd: 1 });
    expect(selectionFromDrag(50, 50.5, 100)).toBeNull();
  });

  it("durasi", () => {
    expect(formatDuration(11025, 22050)).toBe("0,50 dtk");
    expect(formatDuration(44100, 22050, "en")).toBe("2.00 s");
  });
});
