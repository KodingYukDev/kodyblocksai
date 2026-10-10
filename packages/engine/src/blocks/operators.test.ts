import { describe, expect, it } from "vitest";
import type { BlockArgs, BlockUtility, IRuntime, PrimitiveFn } from "../types/runtime";
import { createOperatorsBlocks, mathop, scratchMod } from "./operators";
import { CORE_OPCODES } from "../opcodes";

const runtime = { random: () => 0.5 } as unknown as IRuntime;
const prims = createOperatorsBlocks(runtime).getPrimitives();
const run = (op: string, args: BlockArgs): unknown => (prims[op] as PrimitiveFn)(args, {} as BlockUtility);

describe("operators", () => {
  it("mendaftarkan semua opcode operators di katalog", () => {
    const want = CORE_OPCODES.filter((o) => o.owner.endsWith("blocks/operators.ts") && o.vmPrimitive).map(
      (o) => o.opcode,
    );
    expect(Object.keys(prims).sort()).toEqual([...want].sort());
  });

  it("aritmetika meng-cast input mentah", () => {
    expect(run("operator_add", { NUM1: "1", NUM2: "2" })).toBe(3);
    expect(run("operator_add", { NUM1: 0.1, NUM2: 0.2 })).toBe(0.30000000000000004);
    expect(run("operator_subtract", { NUM1: "abc", NUM2: 3 })).toBe(-3);
    expect(run("operator_multiply", { NUM1: "", NUM2: 3 })).toBe(0);
    expect(run("operator_divide", { NUM1: 1, NUM2: 0 })).toBe(Infinity);
    expect(run("operator_divide", { NUM1: 0, NUM2: 0 })).toBeNaN();
  });

  it("perbandingan & logika", () => {
    expect(run("operator_equals", { OPERAND1: "Apple", OPERAND2: "apple" })).toBe(true);
    expect(run("operator_lt", { OPERAND1: "10", OPERAND2: "9" })).toBe(false);
    expect(run("operator_gt", { OPERAND1: "b", OPERAND2: "A" })).toBe(true);
    expect(run("operator_and", { OPERAND1: "false", OPERAND2: true })).toBe(false);
    expect(run("operator_or", { OPERAND1: "0", OPERAND2: "" })).toBe(false);
    expect(run("operator_not", { OPERAND: undefined })).toBe(true);
  });

  it("string", () => {
    expect(run("operator_join", { STRING1: "a", STRING2: 1 })).toBe("a1");
    expect(run("operator_letter_of", { LETTER: 1, STRING: "kody" })).toBe("k");
    expect(run("operator_letter_of", { LETTER: 0, STRING: "kody" })).toBe("");
    // charAt(0.5) -> "k" (perilaku scratch-vm)
    expect(run("operator_letter_of", { LETTER: 1.5, STRING: "kody" })).toBe("k");
    expect(run("operator_length", { STRING: 12.5 })).toBe(4);
    expect(run("operator_contains", { STRING1: "Apple", STRING2: "PL" })).toBe(true);
  });

  it("random memakai sumber runtime", () => {
    expect(run("operator_random", { FROM: 1, TO: 10 })).toBe(6);
    expect(run("operator_random", { FROM: "1", TO: "2.0" })).toBe(1.5);
  });

  it("mod floored", () => {
    expect(scratchMod(-1, 3)).toBe(2);
    expect(scratchMod(1, -3)).toBe(-2);
    expect(scratchMod(5.5, 2)).toBe(1.5);
    expect(scratchMod(5, 0)).toBeNaN();
  });

  it("round & mathop", () => {
    expect(run("operator_round", { NUM: "2.5" })).toBe(3);
    expect(run("operator_round", { NUM: -2.5 })).toBe(-2);
    expect(mathop("sin", 30)).toBe(0.5);
    expect(mathop("cos", 90)).toBe(0);
    expect(mathop("tan", 45)).toBe(1);
    expect(mathop("tan", 90)).toBe(Infinity);
    expect(mathop("SQRT", 16)).toBe(4);
    // Math.log(1000) / Math.LN10, persis Scratch (bukan Math.log10)
    expect(mathop("log", 1000)).toBe(2.9999999999999996);
    expect(mathop("log", 100)).toBe(2);
    expect(mathop("10 ^", 2)).toBe(100);
    expect(mathop("ceiling", 1.1)).toBe(2);
    expect(mathop("unknown", 5)).toBe(0);
  });
});
