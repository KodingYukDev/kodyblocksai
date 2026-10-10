import { describe, expect, it, vi } from "vitest";
import type { BlockUtility, IRuntime } from "../types/runtime";
import { createProceduresBlocks } from "./procedures";

function fakeUtil(def: [string[], string[], (string | number | boolean)[]] | null) {
  const params: [string, unknown][] = [];
  const util = {
    stackFrame: {} as Record<string, unknown>,
    getProcedureParamNamesIdsAndDefaults: vi.fn(() => def),
    initParams: vi.fn(() => params.splice(0)),
    pushParam: vi.fn((n: string, v: unknown) => params.push([n, v])),
    startProcedure: vi.fn(),
    getParam: vi.fn((n: string) => (n === "ada" ? "nilai" : null)),
  };
  return { util: util as unknown as BlockUtility & typeof util, params };
}

const prims = createProceduresBlocks({} as IRuntime).getPrimitives();

describe("procedures (scratch3_procedures.js)", () => {
  it("call: parameter dari argumen, default bila input tidak ada, lalu startProcedure sekali", () => {
    const { util, params } = fakeUtil([["a", "b"], ["idA", "idB"], ["", false]]);
    prims.procedures_call!({ mutation: { tagName: "mutation", children: [], proccode: "lompat %s %b" }, idA: 7 }, util);
    expect(util.initParams).toHaveBeenCalledTimes(1);
    expect(params).toEqual([
      ["a", 7],
      ["b", false],
    ]);
    expect(util.startProcedure).toHaveBeenCalledWith("lompat %s %b");
    expect(util.stackFrame.executed).toBe(true);
    prims.procedures_call!({ mutation: { tagName: "mutation", children: [], proccode: "lompat %s %b" } }, util);
    expect(util.startProcedure).toHaveBeenCalledTimes(1);
  });

  it("call tanpa definisi = no-op (Scratch 2)", () => {
    const { util } = fakeUtil(null);
    prims.procedures_call!({ mutation: { tagName: "mutation", children: [], proccode: "hilang" } }, util);
    expect(util.initParams).not.toHaveBeenCalled();
    expect(util.startProcedure).not.toHaveBeenCalled();
  });

  it("reporter argumen: nilai parameter, 0 bila tidak ditemukan", () => {
    const { util } = fakeUtil(null);
    expect(prims.argument_reporter_string_number!({ VALUE: "ada" }, util)).toBe("nilai");
    expect(prims.argument_reporter_boolean!({ VALUE: "tidak" }, util)).toBe(0);
    expect(prims.procedures_definition!({}, util)).toBeUndefined();
  });
});
