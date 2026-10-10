import { describe, expect, it } from "vitest";
import {
  dialHandlePosition,
  directionToPoint,
  displayNumber,
  flushBufferedValue,
  gaugePath,
  resolveSpriteRename,
  unusedName,
  withoutTrailingDigits,
} from "./sprite-logic";

describe("nama sprite (StringUtil scratch-vm)", () => {
  it("withoutTrailingDigits", () => {
    expect(withoutTrailingDigits("Sprite12")).toBe("Sprite");
    expect(withoutTrailingDigits("123")).toBe("");
    expect(withoutTrailingDigits("a1b")).toBe("a1b");
  });
  it("unusedName menambah angka mulai 2", () => {
    expect(unusedName("Kody", [])).toBe("Kody");
    expect(unusedName("Kody", ["Kody"])).toBe("Kody2");
    expect(unusedName("Kody", ["Kody", "Kody2"])).toBe("Kody3");
    expect(unusedName("Sprite1", ["Sprite1"])).toBe("Sprite2");
  });
  it("rename: kosong & nama khusus diabaikan", () => {
    expect(resolveSpriteRename("", [])).toBeNull();
    expect(resolveSpriteRename("_mouse_", [])).toBeNull();
    expect(resolveSpriteRename("_stage_", [])).toBeNull();
    expect(resolveSpriteRename("Bola", ["Bola"])).toBe("Bola2");
  });
});

describe("BufferedInput.handleFlush", () => {
  it("tanpa buffer tidak submit", () => {
    expect(flushBufferedValue(10, null)).toBeUndefined();
  });
  it("prop angka: Number(), NaN ditolak, string kosong -> 0", () => {
    expect(flushBufferedValue(10, "42.5")).toBe(42.5);
    expect(flushBufferedValue(10, "abc")).toBeUndefined();
    expect(flushBufferedValue(10, "")).toBe(0);
    expect(flushBufferedValue(10, " 7 ")).toBe(7);
    expect(flushBufferedValue(10, "0x10")).toBe(16);
  });
  it("prop string: dikirim apa adanya", () => {
    expect(flushBufferedValue("Kody", "Bola")).toBe("Bola");
    expect(flushBufferedValue("", "")).toBe("");
  });
});

describe("dial arah", () => {
  it("arah dari pusat: atas 0, kanan 90, bawah 180, kiri -90 (atau 270)", () => {
    expect(directionToPoint(0, -10, 0, 0)).toBeCloseTo(0);
    expect(directionToPoint(10, 0, 0, 0)).toBeCloseTo(90);
    expect(directionToPoint(0, 10, 0, 0)).toBeCloseTo(180);
    expect(directionToPoint(-10, 0, 0, 0)).toBeCloseTo(270);
  });
  it("posisi pegangan & gauge", () => {
    const p = dialHandlePosition(50, 90);
    expect(p.left).toBeCloseTo(100);
    expect(p.top).toBeCloseTo(50);
    expect(gaugePath(50, -90)).toContain("A 50 50 0 0 1 50 0");
    expect(gaugePath(50, 90)).toContain("A 50 50 0 0 0 50 0");
  });
  it("nilai tampilan dibulatkan; kosong saat nonaktif", () => {
    expect(displayNumber(12.6, false)).toBe(13);
    expect(displayNumber(-0.4, false)).toBe(-0);
    expect(displayNumber(5, true)).toBe("");
  });
});
