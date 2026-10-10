/**
 * Tes Cast terhadap tabel oracle yang dihasilkan dari scratch-vm 4.8.102 asli (BSD-3, _reference/bsd3-local)
 * oleh __fixtures__/gen-cast-oracle.cjs. 76 nilai x semua fungsi Cast, 5776 pasangan compare,
 * 841 pasangan aritmetika/string operator, dan tabel tan.
 */
import { describe, expect, it } from "vitest";
import { letterOf, mathop, randomBetween, scratchMod } from "../blocks/operators";
import { Cast, LIST_ALL, LIST_INVALID } from "./cast";
import oracle from "./__fixtures__/cast-oracle.json";
import { MathUtil } from "./math-util";

type Enc = unknown;
function dec(v: Enc): unknown {
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === "object" && "$" in v) {
    switch ((v as { $: string }).$) {
      case "undefined":
        return undefined;
      case "NaN":
        return NaN;
      case "Infinity":
        return Infinity;
      case "-Infinity":
        return -Infinity;
      case "-0":
        return -0;
    }
  }
  return v;
}
const label = (v: unknown): string => (typeof v === "string" ? JSON.stringify(v) : String(v));

interface Row {
  in: Enc;
  toNumber: Enc;
  toBoolean: boolean;
  toString: string;
  isWhiteSpace: boolean;
  isInt: boolean;
  rgb: Enc;
  round: Enc;
  length: number;
  not: boolean;
  mathop: Record<string, Enc>;
  listIndex: [Enc, Enc][];
}
interface Arith {
  a: Enc;
  b: Enc;
  add: Enc;
  sub: Enc;
  mul: Enc;
  div: Enc;
  mod: Enc;
  join: string;
  contains: boolean;
  letterOf: string;
  letterOfB: string;
  and: boolean;
  or: boolean;
}
const rows = oracle.rows as unknown as Row[];
const pairs = oracle.pairs as unknown as [Enc, Enc, number][];
const arith = oracle.arith as unknown as Arith[];
const tan = oracle.tan as unknown as [Enc, Enc][];

describe("Cast vs oracle scratch-vm (per nilai)", () => {
  for (const row of rows) {
    const v = dec(row.in);
    it(`nilai ${label(v)}`, () => {
      expect(Object.is(Cast.toNumber(v), dec(row.toNumber))).toBe(true);
      expect(Cast.toBoolean(v)).toBe(row.toBoolean);
      expect(Cast.toString(v)).toBe(row.toString);
      expect(Cast.isWhiteSpace(v)).toBe(row.isWhiteSpace);
      expect(Cast.isInt(v)).toBe(row.isInt);
      expect(Cast.toRgbColorList(v)).toEqual(dec(row.rgb));
      expect(Object.is(Math.round(Cast.toNumber(v)), dec(row.round))).toBe(true);
      expect(Cast.toString(v).length).toBe(row.length);
      expect(!Cast.toBoolean(v)).toBe(row.not);
      for (const [op, want] of Object.entries(row.mathop)) {
        expect(Object.is(mathop(op, v), dec(want)), `mathop ${op}`).toBe(true);
      }
      [0, 1, 3, 10].forEach((len, i) => {
        const want = row.listIndex[i];
        expect(Cast.toListIndex(v, len, true)).toEqual(dec(want?.[0]));
        expect(Cast.toListIndex(v, len, false)).toEqual(dec(want?.[1]));
      });
    });
  }
});

describe("Cast.compare vs oracle (5776 pasangan)", () => {
  it("tanda hasil identik", () => {
    const fails: string[] = [];
    for (const [ea, eb, want] of pairs) {
      const a = dec(ea);
      const b = dec(eb);
      const c = Cast.compare(a, b);
      const sign = c < 0 ? -1 : c > 0 ? 1 : c === 0 ? 0 : "NaN";
      if (sign !== want) fails.push(`${label(a)} vs ${label(b)}: ${String(sign)} != ${String(want)}`);
    }
    expect(fails).toEqual([]);
  });
});

describe("Operator biner vs oracle (841 pasangan)", () => {
  it("add/sub/mul/div/mod/join/contains/letter/and/or identik", () => {
    const fails: string[] = [];
    const chk = (name: string, got: unknown, want: unknown): void => {
      if (!Object.is(got, want)) fails.push(`${name}: ${label(got)} != ${label(want)}`);
    };
    for (const r of arith) {
      const a = dec(r.a);
      const b = dec(r.b);
      const id = `${label(a)},${label(b)}`;
      chk(`add ${id}`, Cast.toNumber(a) + Cast.toNumber(b), dec(r.add));
      chk(`sub ${id}`, Cast.toNumber(a) - Cast.toNumber(b), dec(r.sub));
      chk(`mul ${id}`, Cast.toNumber(a) * Cast.toNumber(b), dec(r.mul));
      chk(`div ${id}`, Cast.toNumber(a) / Cast.toNumber(b), dec(r.div));
      chk(`mod ${id}`, scratchMod(a, b), dec(r.mod));
      chk(`join ${id}`, Cast.toString(a) + Cast.toString(b), r.join);
      chk(`contains ${id}`, Cast.toString(a).toLowerCase().includes(Cast.toString(b).toLowerCase()), r.contains);
      chk(`letterOf ${id}`, letterOf(a, "Hello"), r.letterOf);
      chk(`letterOfB ${id}`, letterOf(b, a), r.letterOfB);
      chk(`and ${id}`, Cast.toBoolean(a) && Cast.toBoolean(b), r.and);
      chk(`or ${id}`, Cast.toBoolean(a) || Cast.toBoolean(b), r.or);
    }
    expect(fails).toEqual([]);
  });
});

describe("MathUtil.tan vs oracle", () => {
  it("90/270 -> +-Infinity, lainnya dibulatkan 10 desimal", () => {
    for (const [ed, want] of tan) {
      const d = dec(ed) as number;
      expect(Object.is(MathUtil.tan(d), dec(want)), `tan ${d}`).toBe(true);
    }
  });
});

describe("Cast kasus manual", () => {
  it.each([
    ["", 0],
    ["  ", 0],
    ["0x1A", 26],
    [" 12 ", 12],
    ["1e3", 1000],
    ["Infinity", Infinity],
    ["abc", 0],
    [true, 1],
    [false, 0],
    [null, 0],
    [undefined, 0],
    [NaN, 0],
  ] as const)("toNumber(%j) = %j", (v, want) => {
    expect(Cast.toNumber(v)).toBe(want);
  });

  it("compare: whitespace bukan angka, string case-insensitive", () => {
    expect(Cast.compare("", 0)).not.toBe(0);
    expect(Cast.compare("ABC", "abc")).toBe(0);
    expect(Cast.compare("10", "9")).toBeGreaterThan(0);
    expect(Cast.compare("10", "9a")).toBeLessThan(0);
    expect(Cast.compare(Infinity, "Infinity")).toBe(0);
    expect(Cast.compare(" ", " ")).toBe(0);
    expect(Cast.compare("0x10", 16)).toBe(0);
  });

  it("isInt: string bertitik bukan int, number bulat int", () => {
    expect(Cast.isInt("1.0")).toBe(false);
    expect(Cast.isInt(1.0)).toBe(true);
    expect(Cast.isInt("abc")).toBe(true);
    expect(Cast.isInt(1e21)).toBe(false);
    expect(Cast.isInt(null)).toBe(false);
  });

  it("toListIndex: last/random/any/all", () => {
    expect(Cast.toListIndex("last", 5, false)).toBe(5);
    expect(Cast.toListIndex("last", 0, false)).toBe(LIST_INVALID);
    expect(Cast.toListIndex("all", 5, true)).toBe(LIST_ALL);
    expect(Cast.toListIndex("all", 5, false)).toBe(LIST_INVALID);
    expect(Cast.toListIndex("random", 4, false, () => 0.99)).toBe(4);
    expect(Cast.toListIndex("any", 4, false, () => 0)).toBe(1);
    expect(Cast.toListIndex("random", 0, false, () => 0)).toBe(LIST_INVALID);
    expect(Cast.toListIndex(2.9, 5, false)).toBe(2);
    expect(Cast.toListIndex("2.9", 5, false)).toBe(2);
    expect(Cast.toListIndex(0, 5, false)).toBe(LIST_INVALID);
  });

  it("toRgbColorObject: hex invalid -> hitam, desimal dengan alpha", () => {
    expect(Cast.toRgbColorObject("#zzz")).toEqual({ r: 0, g: 0, b: 0, a: 255 });
    expect(Cast.toRgbColorObject(0x80ff0000)).toEqual({ r: 255, g: 0, b: 0, a: 128 });
    expect(Cast.toRgbColorObject("#0F8")).toEqual({ r: 0, g: 255, b: 136 });
  });
});

describe("operator_random", () => {
  it("int vs desimal tergantung titik pada input", () => {
    expect(randomBetween(1, 10, () => 0.999)).toBe(10);
    expect(randomBetween("1", "10", () => 0.5)).toBe(6);
    expect(randomBetween("1.0", "10", () => 0.5)).toBe(5.5);
    expect(randomBetween(10, 1, () => 0)).toBe(1);
    expect(randomBetween(5, 5, () => 0.3)).toBe(5);
    expect(randomBetween(1.5, 2, () => 0.5)).toBe(1.75);
    expect(randomBetween("a", "3", () => 0.99)).toBe(3);
  });
});

describe("MathUtil lain", () => {
  it("reducedSortOrdering", () => {
    expect(MathUtil.reducedSortOrdering([5, 19, 13, 1])).toEqual([1, 3, 2, 0]);
  });
  it("inclusiveRandIntWithout melewati excluded", () => {
    expect(MathUtil.inclusiveRandIntWithout(1, 5, 3, () => 0)).toBe(1);
    expect(MathUtil.inclusiveRandIntWithout(1, 5, 3, () => 0.5)).toBe(4);
    expect(MathUtil.inclusiveRandIntWithout(1, 5, 3, () => 0.99)).toBe(5);
  });
});
