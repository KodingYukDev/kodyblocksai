import { describe, expect, it } from "vitest";
// @ts-expect-error -- modul .mjs tanpa deklarasi tipe
import { forbidden, scanSource } from "./check-no-scratch-import.mjs";

describe("check-no-scratch-import", () => {
  it("menandai import Scratch/Blockly", () => {
    expect(forbidden("scratch-vm")).toBe(true);
    expect(forbidden("scratch-render/src/x")).toBe(true);
    expect(forbidden("@scratch/scratch-gui")).toBe(true);
    expect(forbidden("blockly")).toBe(true);
    expect(forbidden("blockly/core")).toBe(true);
  });
  it("membiarkan import biasa", () => {
    expect(forbidden("react")).toBe(false);
    expect(forbidden("./scratch-compat")).toBe(false);
    expect(forbidden("@kody/engine")).toBe(false);
  });
  it("memindai semua bentuk import", () => {
    const src = [
      'import VM from "scratch-vm";',
      "const r = require('scratch-render');",
      'const b = await import("blockly");',
      'export { x } from "scratch-blocks";',
      'import "scratch-audio";',
      'import { a } from "./local";',
    ].join("\n");
    expect(scanSource(src)).toEqual(["scratch-vm", "scratch-render", "blockly", "scratch-blocks", "scratch-audio"]);
  });
});
