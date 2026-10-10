/**
 * Memastikan katalog opcode kita (packages/engine/src/opcodes.ts) cocok dengan scratch-vm asli,
 * dan oracle parity bisa menjalankan project. Engine kita belum dibandingkan di sini
 * (diisi agent parity setelah runtime ada).
 */
import { describe, expect, it } from "vitest";
import { coreHatOpcodes, coreVmPrimitiveOpcodes } from "@kody/engine";
import { createOracleVM, runOracle } from "./scratch-vm-oracle";
import { foreverMoveScript, makeProject } from "./fixtures";

describe("parity: katalog opcode vs scratch-vm", () => {
  const vm = createOracleVM();

  it("primitive core sama persis", () => {
    const vmPrims = Object.keys(vm.runtime._primitives).sort();
    expect(coreVmPrimitiveOpcodes().sort()).toEqual(vmPrims);
  });

  it("hat core & metadata sama persis", () => {
    const vmHats = Object.fromEntries(
      Object.entries(vm.runtime._hats).map(([k, v]) => [k, { edge: !!v.edgeActivated, restart: !!v.restartExistingThreads }]),
    );
    const ours = Object.fromEntries(
      coreHatOpcodes().map((s) => [s.opcode, { edge: !!s.edgeActivated, restart: !!s.restartExistingThreads }]),
    );
    expect(ours).toEqual(vmHats);
  });
});

describe("parity: oracle scratch-vm", () => {
  it("forever move 10 = +10 px per frame (30 fps, redraw yield)", async () => {
    const project = makeProject([{ blocks: foreverMoveScript(10) }]);
    const frames = await runOracle(project, { frames: 3 });
    const xs = frames.map((f) => f.targets.find((t) => !t.isStage)?.x);
    expect(xs).toEqual([10, 20, 30]);
  });

  it("fencing tepi panggung memakai geometri bersama (skin default 96x100)", async () => {
    const project = makeProject([{ blocks: foreverMoveScript(100) }]);
    const frames = await runOracle(project, { frames: 5 });
    const xs = frames.map((f) => f.targets.find((t) => !t.isStage)?.x);
    // inset = min(15, 96/2) -> sx = 225; x maks = 225 + 48 = 273
    expect(xs).toEqual([100, 200, 273, 273, 273]);
  });
});
