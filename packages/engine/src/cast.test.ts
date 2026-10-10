import { afterEach, describe, expect, it, vi } from "vitest";
import { Cast, LIST_ALL, LIST_INVALID } from "./cast";
import { Color } from "./util/color";
import { MathUtil } from "./util/math-util";
import { newBlockIds, StringUtil, uid } from "./util/string-util";
import type { Block } from "./types/project-model";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Cast.toNumber", () => {
  it("angka dan string numerik", () => {
    expect(Cast.toNumber(0)).toBe(0);
    expect(Cast.toNumber(3.14)).toBe(3.14);
    expect(Cast.toNumber("3.14")).toBe(3.14);
    expect(Cast.toNumber("0.1e10")).toBe(1000000000);
    expect(Cast.toNumber("1e3")).toBe(1000);
    expect(Cast.toNumber(" 5 ")).toBe(5);
    expect(Cast.toNumber("0x10")).toBe(16);
    expect(Cast.toNumber("Infinity")).toBe(Infinity);
    expect(Cast.toNumber("-Infinity")).toBe(-Infinity);
  });
  it("non-angka menjadi 0, boolean 1/0, NaN 0", () => {
    expect(Cast.toNumber("foobar")).toBe(0);
    expect(Cast.toNumber("")).toBe(0);
    expect(Cast.toNumber(true)).toBe(1);
    expect(Cast.toNumber(false)).toBe(0);
    expect(Cast.toNumber("true")).toBe(0);
    expect(Cast.toNumber(undefined)).toBe(0);
    expect(Cast.toNumber({})).toBe(0);
    expect(Cast.toNumber(NaN)).toBe(0);
    expect(Cast.toNumber("infinity")).toBe(0);
  });
});

describe("Cast.toBoolean / toString", () => {
  it("toBoolean persis Scratch", () => {
    expect(Cast.toBoolean(0)).toBe(false);
    expect(Cast.toBoolean(1)).toBe(true);
    expect(Cast.toBoolean("0")).toBe(false);
    expect(Cast.toBoolean("")).toBe(false);
    expect(Cast.toBoolean("false")).toBe(false);
    expect(Cast.toBoolean("FALSE")).toBe(false);
    expect(Cast.toBoolean("0.0")).toBe(true);
    expect(Cast.toBoolean("foobar")).toBe(true);
    expect(Cast.toBoolean(" ")).toBe(true);
    expect(Cast.toBoolean(undefined)).toBe(false);
    expect(Cast.toBoolean({})).toBe(true);
  });
  it("toString", () => {
    expect(Cast.toString(3.14)).toBe("3.14");
    expect(Cast.toString(true)).toBe("true");
    expect(Cast.toString(undefined)).toBe("undefined");
    expect(Cast.toString(1e21)).toBe("1e+21");
  });
});

describe("Cast.compare", () => {
  it("numerik bila keduanya angka", () => {
    expect(Cast.compare(1, 0)).toBe(1);
    expect(Cast.compare("0.1e10", "1000000000")).toBe(0);
    expect(Cast.compare("10", "9")).toBe(1);
    expect(Cast.compare(true, false)).toBe(1);
  });
  it("string case-insensitive", () => {
    expect(Cast.compare("foobar", "FOOBAR")).toBe(0);
    expect(Cast.compare("a", "B")).toBe(-1);
    expect(Cast.compare(undefined, "undefined")).toBe(0);
  });
  it("whitespace bukan angka 0", () => {
    expect(Cast.compare("", 0)).not.toBe(0);
    expect(Cast.compare(" ", 0)).toBe(-1);
    expect(Cast.compare(0, "")).toBe(1);
  });
  it("Infinity == Infinity", () => {
    expect(Cast.compare(Infinity, "Infinity")).toBe(0);
    expect(Cast.compare(-Infinity, -Infinity)).toBe(0);
    expect(Cast.compare(Infinity, 1)).toBe(Infinity);
  });
});

describe("Cast.isInt / toListIndex / warna", () => {
  it("isInt", () => {
    expect(Cast.isInt(0)).toBe(true);
    expect(Cast.isInt(3.14)).toBe(false);
    expect(Cast.isInt(NaN)).toBe(true);
    expect(Cast.isInt("0.0")).toBe(false);
    expect(Cast.isInt("1")).toBe(true);
    expect(Cast.isInt(true)).toBe(true);
    expect(Cast.isInt(undefined)).toBe(false);
  });
  it("toListIndex", () => {
    expect(Cast.toListIndex(1, 3, false)).toBe(1);
    expect(Cast.toListIndex(3.9, 3, false)).toBe(3);
    expect(Cast.toListIndex(0, 3, false)).toBe(LIST_INVALID);
    expect(Cast.toListIndex(4, 3, false)).toBe(LIST_INVALID);
    expect(Cast.toListIndex("last", 3, false)).toBe(3);
    expect(Cast.toListIndex("last", 0, false)).toBe(LIST_INVALID);
    expect(Cast.toListIndex("all", 3, true)).toBe(LIST_ALL);
    expect(Cast.toListIndex("all", 3, false)).toBe(LIST_INVALID);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(Cast.toListIndex("random", 4, false)).toBe(3);
    expect(Cast.toListIndex("any", 4, false)).toBe(3);
    expect(Cast.toListIndex("random", 0, false)).toBe(LIST_INVALID);
  });
  it("toRgbColorList / Object", () => {
    expect(Cast.toRgbColorList("#ff0080")).toEqual([255, 0, 128]);
    expect(Cast.toRgbColorList("#f08")).toEqual([255, 0, 136]);
    expect(Cast.toRgbColorList("#zzz")).toEqual([0, 0, 0]);
    expect(Cast.toRgbColorList(0x123456)).toEqual([0x12, 0x34, 0x56]);
    expect(Cast.toRgbColorObject(0x80123456)).toEqual({ r: 0x12, g: 0x34, b: 0x56, a: 0x80 });
    expect(Cast.toRgbColorObject(0)).toEqual({ r: 0, g: 0, b: 0, a: 255 });
  });
});

describe("Color", () => {
  it("konversi dasar", () => {
    expect(Color.decimalToHex(0xff)).toBe("#0000ff");
    expect(Color.decimalToHex(-1)).toBe("#ffffff");
    expect(Color.rgbToHex({ r: 1, g: 2, b: 3 })).toBe("#010203");
    expect(Color.hexToDecimal("#010203")).toBe(0x010203);
    expect(Color.hexToRgb("nope")).toBeNull();
  });
  it("hsv <-> rgb", () => {
    expect(Color.hsvToRgb({ h: 0, s: 1, v: 1 })).toEqual({ r: 255, g: 0, b: 0 });
    expect(Color.hsvToRgb({ h: 120, s: 1, v: 1 })).toEqual({ r: 0, g: 255, b: 0 });
    expect(Color.hsvToRgb({ h: -120, s: 1, v: 1 })).toEqual({ r: 0, g: 0, b: 255 });
    expect(Color.rgbToHsv({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 1, v: 1 });
    expect(Color.rgbToHsv({ r: 128, g: 128, b: 128 })).toEqual({ h: 0, s: 0, v: 128 / 255 });
  });
  it("mixRgb", () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 100, g: 200, b: 50 };
    expect(Color.mixRgb(a, b, 0)).toBe(a);
    expect(Color.mixRgb(a, b, 1)).toBe(b);
    expect(Color.mixRgb(a, b, 0.5)).toEqual({ r: 50, g: 100, b: 25 });
  });
});

describe("MathUtil", () => {
  it("tan dengan kasus khusus", () => {
    expect(MathUtil.tan(90)).toBe(Infinity);
    expect(MathUtil.tan(-270)).toBe(Infinity);
    expect(MathUtil.tan(270)).toBe(-Infinity);
    expect(MathUtil.tan(450)).toBe(Infinity);
    expect(MathUtil.tan(45)).toBe(1);
    expect(MathUtil.tan(0)).toBe(0);
  });
  it("reducedSortOrdering & inclusiveRandIntWithout", () => {
    expect(MathUtil.reducedSortOrdering([5, 19, 13, 1])).toEqual([1, 3, 2, 0]);
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    expect(MathUtil.inclusiveRandIntWithout(1, 3, 2)).toBe(3);
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(MathUtil.inclusiveRandIntWithout(1, 3, 1)).toBe(2);
  });
});

describe("StringUtil & id", () => {
  it("unusedName", () => {
    expect(StringUtil.unusedName("Sprite1", ["Sprite1"])).toBe("Sprite2");
    expect(StringUtil.unusedName("Sprite1", ["Sprite1", "Sprite2"])).toBe("Sprite3");
    expect(StringUtil.unusedName("Kody", ["Kody"])).toBe("Kody2");
    expect(StringUtil.unusedName("baru", ["Kody"])).toBe("baru");
  });
  it("replaceUnsafeChars & splitFirst", () => {
    expect(StringUtil.replaceUnsafeChars(`a<b>&'"`)).toBe("altbgtampaposquot");
    expect(StringUtil.splitFirst("pen_penDown", "_")).toEqual(["pen", "penDown"]);
    expect(StringUtil.splitFirst("x", "_")).toEqual(["x", null]);
  });
  it("uid 20 karakter dan newBlockIds memperbarui referensi", () => {
    expect(uid()).toHaveLength(20);
    const blocks: Block[] = [
      { id: "a", opcode: "x", next: "b", parent: null, inputs: { I: { name: "I", block: "c", shadow: "c" } }, fields: {}, shadow: false, topLevel: true },
      { id: "b", opcode: "y", next: null, parent: "a", inputs: {}, fields: {}, shadow: false, topLevel: false },
      { id: "c", opcode: "z", next: null, parent: "a", inputs: {}, fields: {}, shadow: true, topLevel: false },
    ];
    let n = 0;
    newBlockIds(blocks, () => `n${++n}`);
    expect(blocks.map((b) => b.id)).toEqual(["n1", "n2", "n3"]);
    expect(blocks[0]?.next).toBe("n2");
    expect(blocks[0]?.inputs.I).toEqual({ name: "I", block: "n3", shadow: "n3" });
    expect(blocks[1]?.parent).toBe("n1");
  });
});
