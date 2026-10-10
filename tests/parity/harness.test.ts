/** Tes untuk harness parity itu sendiri (tidak bergantung pada kemajuan engine). */
import { describe, expect, it } from "vitest";
import { CORE_OPCODES, coreHatOpcodes, coreVmPrimitiveOpcodes } from "@kody/engine";
import { b, bc, buildBlocks, flag, menu, opcodesInBlocks, procCall, procDef, setVar, var12 } from "./block-builder";
import { allParityCases } from "./corpus/index";
import { FakeClock, createDeterministicEnv, installDeterministicGlobals, mulberry32 } from "./fake-env";
import { GeometryWorld } from "./geometry-renderer";
import { createGeometryIRenderer } from "./geometry-irenderer";
import { formatParityTable } from "./parity-runner";
import { decodeBlocks, sb3ToModel } from "./sb3-to-model";
import { diffTraces } from "./trace-diff";
import type { FrameSnapshot } from "./snapshot";

describe("korpus parity", () => {
  const cases = allParityCases();

  it("mencakup SEMUA primitive & hat core scratch-vm", () => {
    const used = new Set<string>();
    for (const c of cases) for (const t of c.project.targets) for (const op of opcodesInBlocks(t.blocks as Record<string, unknown>)) used.add(op);
    const required = [...coreVmPrimitiveOpcodes(), ...coreHatOpcodes().map((s) => s.opcode), "procedures_definition"];
    const missing = required.filter((op) => !used.has(op)).sort();
    expect(missing).toEqual([]);
  });

  it("mencakup semua shadow/menu core yang dibaca execute", () => {
    const used = new Set<string>();
    for (const c of cases) for (const t of c.project.targets) for (const op of opcodesInBlocks(t.blocks as Record<string, unknown>)) used.add(op);
    // Shadow editor-only (prototype editor, matrix/note milik ekstensi) tidak muncul di project jalan.
    const editorOnly = new Set(["procedures_declaration", "argument_editor_boolean", "argument_editor_string_number", "matrix", "note", "data_listindexall", "data_listindexrandom"]);
    const shadows = CORE_OPCODES.filter((s) => s.shape === "shadow" && !editorOnly.has(s.opcode)).map((s) => s.opcode);
    const prim = new Set(["math_number", "math_integer", "math_whole_number", "math_positive_number", "math_angle", "text", "colour_picker"]);
    const missing = shadows.filter((op) => !prim.has(op) && !used.has(op)).sort();
    expect(missing).toEqual([]);
  });

  it("id unik, kategori valid, frame > 0", () => {
    expect(cases.length).toBeGreaterThan(60);
    for (const c of cases) {
      expect(c.id.startsWith(`${c.category}/`), c.id).toBe(true);
      expect(c.frames, c.id).toBeGreaterThan(0);
    }
  });

  it("setiap project lolos konversi sb3 -> ProjectModel (input/field tidak dangling)", () => {
    for (const c of cases) {
      const model = sb3ToModel(c.project);
      for (const t of model.targets) {
        for (const blk of Object.values(t.blocks)) {
          for (const inp of Object.values(blk.inputs)) {
            if (inp.block) expect(t.blocks[inp.block], `${c.id} ${blk.opcode}.${inp.name}`).toBeDefined();
            if (inp.shadow) expect(t.blocks[inp.shadow], `${c.id} ${blk.opcode}.${inp.name}`).toBeDefined();
          }
          if (blk.next) expect(t.blocks[blk.next]?.parent, `${c.id} next.parent`).toBe(blk.id);
        }
      }
    }
  });
});

describe("block-builder + sb3-to-model", () => {
  it("encode input sesuai format sb3 dan decode kembali tak terkompresi", () => {
    const blocks = buildBlocks([
      [flag(), setVar("v", b("operator_add", { NUM1: 1, NUM2: "x" })), b("event_broadcast", { BROADCAST_INPUT: bc("m") }), setVar("w", var12("v"))],
      [b("control_if", { CONDITION: b("operator_not"), SUBSTACK: [b("motion_goto", { TO: menu("motion_goto_menu", "TO", "_random_") })] })],
    ]);
    const raw = blocks as Record<string, { opcode: string; inputs: Record<string, unknown>; next: string | null; parent: string | null }>;
    const set = Object.values(raw).find((x) => x.opcode === "data_setvariableto");
    expect(set?.inputs.VALUE).toEqual([3, expect.any(String), [10, ""]]);
    const add = Object.values(raw).find((x) => x.opcode === "operator_add");
    expect(add?.inputs).toEqual({ NUM1: [1, [4, "1"]], NUM2: [1, [10, "x"]] });
    const ifb = Object.values(raw).find((x) => x.opcode === "control_if");
    expect(ifb?.inputs.CONDITION).toEqual([2, expect.any(String)]);
    const decoded = decodeBlocks(blocks);
    const bcast = Object.values(decoded).find((x) => x.opcode === "event_broadcast_menu");
    expect(bcast?.fields.BROADCAST_OPTION).toEqual({ name: "BROADCAST_OPTION", value: "m", id: "bc_m", variableType: "broadcast_msg" });
    expect(bcast?.shadow).toBe(true);
    const dv = Object.values(decoded).find((x) => x.opcode === "data_variable");
    expect(dv?.shadow).toBe(false);
    expect(dv?.fields.VARIABLE?.variableType).toBe("");
    const num = Object.values(decoded).find((x) => x.opcode === "math_number");
    expect(num?.fields.NUM?.value).toBe("1");
  });

  it("procedure: prototype + mutation + argumen boolean tanpa shadow", () => {
    const args = [{ name: "a", kind: "s" as const }, { name: "ok", kind: "b" as const }];
    const blocks = decodeBlocks(buildBlocks([procDef("p %s %b", args, true, []), [flag(), procCall("p %s %b", args, [5, b("operator_not")])]]));
    const proto = Object.values(blocks).find((x) => x.opcode === "procedures_prototype");
    expect(proto?.mutation?.warp).toBe("true");
    expect(JSON.parse(String(proto?.mutation?.argumentnames))).toEqual(["a", "ok"]);
    const call = Object.values(blocks).find((x) => x.opcode === "procedures_call");
    const ids = JSON.parse(String(call?.mutation?.argumentids)) as string[];
    expect(call?.inputs[ids[1] ?? ""]?.shadow).toBeNull();
    expect(call?.inputs[ids[0] ?? ""]?.shadow).not.toBeNull();
  });

  it("variabel top-level terkompresi [12, nama, id, x, y]", () => {
    const blocks = decodeBlocks({ abc: [12, "skor", "var_skor", 10, 20] });
    expect(blocks.abc).toMatchObject({ opcode: "data_variable", topLevel: true, x: 10, y: 20, parent: null });
  });
});

describe("fake-env", () => {
  it("jam beku dalam frame dan maju per stepTime", () => {
    const clock = new FakeClock(1000 / 30, 1000);
    expect(clock.now()).toBe(1000);
    expect(clock.now()).toBe(1000);
    clock.beginFrame();
    expect(clock.now()).toBe(1033);
    clock.beginFrame();
    expect(clock.now()).toBe(1066);
  });

  it("tick virtual hanya maju pada pemeriksaan WORK_TIME dan direset per frame", () => {
    const clock = new FakeClock(1000 / 30, 0);
    let isCheck = false;
    clock.isWorkTimeCheck = () => isCheck;
    expect(clock.now()).toBe(0);
    isCheck = true;
    expect(clock.now()).toBe(0);
    expect(clock.now()).toBeCloseTo(0.1);
    isCheck = false;
    expect(clock.now()).toBeCloseTo(0.2);
    expect(clock.ticksThisFrame).toBe(2);
    clock.beginFrame();
    expect(clock.now()).toBe(33);
  });

  it("deteksi pemeriksaan WORK_TIME lewat nama fungsi di stack", () => {
    const clock = new FakeClock(1000 / 30, 0);
    class Timer {
      start = 0;
      timeElapsed(): number {
        return clock.now() - this.start;
      }
    }
    class Sequencer {
      timer = new Timer();
      stepThreads(): number {
        let n = 0;
        while (this.timer.timeElapsed() < 25) n++;
        return n;
      }
    }
    expect(new Sequencer().stepThreads()).toBe(250);
    expect(clock.spinGuardTriggered).toBe(false);
  });

  it("FakeTimers menjalankan callback pada awal frame yang melewati due", () => {
    const env = createDeterministicEnv(1, 1000 / 30);
    env.clock.isWorkTimeCheck = () => false;
    const log: string[] = [];
    const restore = installDeterministicGlobals(env, "id-only");
    try {
      setTimeout(() => log.push("b"), 50);
      setTimeout(() => log.push("a"), 10);
      const cancel = setTimeout(() => log.push("x"), 10);
      clearTimeout(cancel);
      env.clock.beginFrame();
      env.timers.runDue();
      expect(log).toEqual(["a"]);
      env.clock.beginFrame();
      env.timers.runDue();
      expect(log).toEqual(["a", "b"]);
      expect(env.timers.size).toBe(0);
    } finally {
      restore();
    }
  });

  it("spin guard melompat setelah batas baca", () => {
    const clock = new FakeClock(1000 / 30, 0, 5);
    for (let i = 0; i < 5; i++) clock.now();
    expect(clock.now()).toBeGreaterThan(1000);
    expect(clock.spinGuardTriggered).toBe(true);
  });

  it("memasang dan memulihkan Date & Math.random", () => {
    const env = createDeterministicEnv(7, 1000 / 30);
    const realDate = Date;
    const restore = installDeterministicGlobals(env, "id-only");
    try {
      expect(Date.now()).toBe(env.clock.epoch);
      expect(new Date().getTime()).toBe(env.clock.epoch);
      expect(new Date(0).getTime()).toBe(0);
      const expected = mulberry32((7 ^ 0x9e3779b9) >>> 0)();
      expect(Math.random()).toBe(expected);
    } finally {
      restore();
    }
    expect(Date).toBe(realDate);
  });
});

describe("trace-diff", () => {
  const frame = (x: number, v: unknown): FrameSnapshot => ({
    frame: 1,
    threads: 1,
    says: [],
    questions: [],
    monitors: [],
    targets: [{ name: "A", isStage: false, isOriginal: true, x, y: 0, direction: 90, size: 100, visible: true, currentCostume: 0, volume: 100, rotationStyle: "all around", draggable: false, layer: 1, effects: {}, variables: { "var:v": v }, bubble: null }],
  });

  it("identik -> kosong; 0 vs -0 dan '10' vs 10 berbeda; NaN sama", () => {
    expect(diffTraces([frame(1, NaN)], [frame(1, NaN)])).toEqual([]);
    expect(diffTraces([frame(0, 1)], [frame(-0, 1)])[0]?.path).toBe("targets[0](A).x");
    expect(diffTraces([frame(1, "10")], [frame(1, 10)])[0]?.path).toBe("targets[0](A).variables.var:v");
  });

  it("panjang trace berbeda dilaporkan", () => {
    expect(diffTraces([frame(1, 1)], [])[0]?.path).toBe("frames.length");
  });

  it("tabel PARITY per kategori", () => {
    const table = formatParityTable([
      { id: "motion/a", category: "motion", status: "match", diffs: [], oracleFrames: [], oursFrames: [] },
      { id: "motion/b", category: "motion", status: "error", diffs: [], oracleFrames: [], oursFrames: [] },
    ]);
    expect(table).toContain("motion");
    expect(table).toMatch(/TOTAL\s+2\s+1\s+0\s+1\s+0\s+50%/);
  });
});

describe("geometry IRenderer adapter", () => {
  it("fencing, layer, pick, dan sentuhan sama dengan GeometryWorld", () => {
    const world = new GeometryWorld();
    const { renderer } = createGeometryIRenderer(world);
    renderer.setLayerGroupOrdering(["background", "video", "pen", "sprite"]);
    const stage = renderer.createDrawable("background");
    const a = renderer.createDrawable("sprite");
    const c = renderer.createDrawable("sprite");
    renderer.updateDrawablePosition(c, [50, 0]);
    expect(renderer.getFencedPositionOfDrawable(a, [1000, 0])).toEqual([273, 0]);
    expect(renderer.getDrawableOrder(stage)).toBe(0);
    expect(renderer.getDrawableOrder(c)).toBe(2);
    renderer.setDrawableOrder(c, 0, "sprite");
    expect(renderer.getDrawableOrder(c)).toBe(1);
    expect(renderer.isTouchingDrawables(a, [c])).toBe(true);
    expect(renderer.pick(30, 0)).toBe(a);
    expect(renderer.isTouchingPoint(c, 90, 0)).toBe(true);
    renderer.updateDrawableVisible(a, false);
    expect(renderer.pick(30, 0)).toBe(c);
    expect(renderer.pick(-200, 150)).toBe(-1);
  });
});
