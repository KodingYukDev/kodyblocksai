import { describe, expect, it, vi } from "vitest";

// Cast milik engine-core dikerjakan paralel; tes ini memakai salinan perilaku cast.js
// (toNumber/toBoolean/toString) agar tidak bergantung pada urutan penyelesaian agent.
vi.mock("../cast", () => ({
  Cast: {
    toNumber(v: unknown): number {
      if (typeof v === "number") return Number.isNaN(v) ? 0 : v;
      const n = Number(v);
      return Number.isNaN(n) ? 0 : n;
    },
    toBoolean(v: unknown): boolean {
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return !(v === "" || v === "0" || v.toLowerCase() === "false");
      return Boolean(v);
    },
    toString(v: unknown): string {
      return String(v);
    },
  },
}));

import { ThreadStatus } from "../types/runtime";
import { Harness, varReporter } from "./control-event.harness";
import {
  cloneMenuOptions,
  controlStopHasNext,
  controlStopMutation,
  controlStopOptions,
  createControlBlocks,
  mutationHasNext,
} from "./control";
import { createEventBlocks } from "./event";
import type { ITarget } from "../types/target";

const flag = { op: "event_whenflagclicked" };
const log = (m: string) => ({ op: "test_log", args: { MSG: m } });
const draw = (m: string) => ({ op: "test_redraw", args: { MSG: m } });

function setup() {
  const h = new Harness([createControlBlocks, createEventBlocks]);
  const s = h.sprite("Sprite1");
  return { h, s };
}

/** Log per frame: jalankan n frame, kembalikan isi log yang muncul di tiap frame. */
function frames(h: Harness, n: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < n; i++) {
    const before = h.log.length;
    h.step();
    out.push(h.log.slice(before));
  }
  return out;
}

describe("control: daftar opcode", () => {
  it("mendaftarkan semua primitive & hat Control scratch-vm", () => {
    const { h } = setup();
    const pkg = createControlBlocks(h.runtime);
    expect(Object.keys(pkg.getPrimitives()).sort()).toEqual(
      [
        "control_repeat",
        "control_repeat_until",
        "control_while",
        "control_for_each",
        "control_forever",
        "control_wait",
        "control_wait_until",
        "control_if",
        "control_if_else",
        "control_stop",
        "control_create_clone_of",
        "control_delete_this_clone",
        "control_get_counter",
        "control_incr_counter",
        "control_clear_counter",
        "control_all_at_once",
      ].sort(),
    );
    expect(pkg.getHats()).toEqual({ control_start_as_clone: { restartExistingThreads: false } });
  });
});

describe("control: repeat & loop yield", () => {
  it("repeat tanpa redraw selesai dalam satu frame", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "control_repeat", args: { TIMES: 3 }, sub: [log("x")] }, log("end")]);
    h.greenFlag();
    expect(frames(h, 2)).toEqual([["x", "x", "x", "end"], []]);
  });

  it("repeat dengan redraw: satu iterasi per frame", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "control_repeat", args: { TIMES: 3 }, sub: [draw("x")] }, log("end")]);
    h.greenFlag();
    expect(frames(h, 4)).toEqual([["x"], ["x"], ["x"], ["end"]]);
  });

  it.each([
    ["2.5", 3],
    ["2.4", 2],
    [-1, 0],
    ["abc", 0],
    ["", 0],
    [1.5, 2],
    ["0x2", 2],
  ])("repeat TIMES=%j -> %d iterasi (Math.round(Cast))", (times, n) => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "control_repeat", args: { TIMES: times }, sub: [log("x")] }]);
    h.greenFlag();
    h.steps(2);
    expect(h.log.length).toBe(n);
  });

  it("repeat dengan cabang kosong tetap yield per putaran sequencer", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "control_repeat", args: { TIMES: 3 } }, log("end")]);
    h.greenFlag();
    h.step();
    expect(h.log).toEqual(["end"]);
  });

  it("forever + redraw berjalan sekali per frame dan tidak pernah selesai", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "control_forever", sub: [draw("f")] }, log("never")]);
    h.greenFlag();
    expect(frames(h, 3)).toEqual([["f"], ["f"], ["f"]]);
    expect(h.threads.length).toBe(1);
  });

  it("forever tanpa redraw berulang banyak kali dalam satu frame", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "control_forever", sub: [log("f")] }]);
    h.greenFlag();
    h.step();
    expect(h.log.length).toBeGreaterThan(1);
  });

  it("dua skrip bergantian tiap putaran loop (round-robin sequencer)", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "control_repeat", args: { TIMES: 2 }, sub: [log("a")] }]);
    h.addScript(s, [flag, { op: "control_repeat", args: { TIMES: 2 }, sub: [log("b")] }]);
    h.greenFlag();
    h.step();
    expect(h.log).toEqual(["a", "b", "a", "b"]);
  });
});

describe("control: wait", () => {
  it("wait 0 tetap yield dan meminta redraw (lanjut di frame berikutnya)", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, log("a"), { op: "control_wait", args: { DURATION: 0 } }, log("b")]);
    h.greenFlag();
    expect(frames(h, 3)).toEqual([["a"], ["b"], []]);
  });

  it("wait menunggu sampai waktu timer terlampaui", () => {
    const { h, s } = setup();
    h.frameMs = 40;
    h.addScript(s, [flag, { op: "control_wait", args: { DURATION: "0.1" } }, log("b")]);
    h.greenFlag();
    // frame1 t=0 mulai, frame2 t=40, frame3 t=80, frame4 t=120 >= 100.
    expect(frames(h, 5)).toEqual([[], [], [], ["b"], []]);
  });

  it.each([[-5], ["abc"]])("wait %j diperlakukan 0 detik", (d) => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "control_wait", args: { DURATION: d } }, log("b")]);
    h.greenFlag();
    expect(frames(h, 2)).toEqual([[], ["b"]]);
  });
});

describe("control: kondisi", () => {
  it.each([
    ["true", true],
    ["false", false],
    ["FALSE", false],
    ["0", false],
    ["", false],
    ["0.0", true],
    ["hello", true],
    [0, false],
    [1, true],
    [true, true],
  ])("if CONDITION=%j -> %s", (cond, taken) => {
    const { h, s } = setup();
    h.addScript(s, [
      flag,
      { op: "control_if", args: { CONDITION: cond }, sub: [log("then")] },
      { op: "control_if_else", args: { CONDITION: cond }, sub: [log("A")], sub2: [log("B")] },
      log("end"),
    ]);
    h.greenFlag();
    h.step();
    expect(h.log).toEqual(taken ? ["then", "A", "end"] : ["B", "end"]);
  });

  it("if tidak yield (blok setelahnya jalan di frame yang sama)", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "control_if", args: { CONDITION: true }, sub: [draw("x")] }, log("y")]);
    h.greenFlag();
    // redraw diminta di dalam if, tetapi thread tetap jalan sampai yield; frame berakhir setelahnya.
    expect(frames(h, 1)).toEqual([["x", "y"]]);
  });

  it("wait until yield sampai kondisi true", () => {
    const { h, s } = setup();
    const v = s.lookupOrCreateVariable("v", "v");
    h.addScript(s, [flag, { op: "control_wait_until", args: { CONDITION: varReporter("v") } }, log("go")]);
    h.greenFlag();
    h.steps(3);
    expect(h.log).toEqual([]);
    v.value = "true";
    h.step();
    expect(h.log).toEqual(["go"]);
  });

  it("repeat until berulang selama kondisi false", () => {
    const { h, s } = setup();
    const v = s.lookupOrCreateVariable("v", "v");
    v.value = 0;
    h.addScript(s, [flag, { op: "control_repeat_until", args: { CONDITION: varReporter("v") }, sub: [draw("u")] }, log("uend")]);
    h.greenFlag();
    h.steps(2);
    expect(h.log).toEqual(["u", "u"]);
    v.value = "1";
    h.step();
    expect(h.log).toEqual(["u", "u", "uend"]);
  });

  it("while berulang selama kondisi true", () => {
    const { h, s } = setup();
    const v = s.lookupOrCreateVariable("v", "v");
    v.value = "yes";
    h.addScript(s, [flag, { op: "control_while", args: { CONDITION: varReporter("v") }, sub: [draw("w")] }, log("wend")]);
    h.greenFlag();
    h.steps(2);
    expect(h.log).toEqual(["w", "w"]);
    v.value = "false";
    h.step();
    expect(h.log).toEqual(["w", "w", "wend"]);
  });

  it("all at once menjalankan isi sekali tanpa warp", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "control_all_at_once", sub: [log("in")] }, log("out")]);
    h.greenFlag();
    h.step();
    expect(h.log).toEqual(["in", "out"]);
  });
});

describe("control: for each", () => {
  it.each([
    ["3", [1, 2, 3]],
    ["2.5", [1, 2, 3]],
    ["abc", []],
    ["", []],
    [0, []],
  ])("VALUE=%j -> variabel %j (Number(), bukan Cast)", (value, seen) => {
    const { h, s } = setup();
    const out: unknown[] = [];
    h.prims.test_rec = () => {
      out.push(s.variables.i?.value);
    };
    h.addScript(s, [
      flag,
      { op: "control_for_each", args: { VARIABLE: { id: "i", name: "i" }, VALUE: value }, sub: [{ op: "test_rec" }] },
    ]);
    h.greenFlag();
    h.steps(2);
    expect(out).toEqual(seen);
  });
});

describe("control: stop", () => {
  it("stop this script mengakhiri skrip saja", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, log("a"), { op: "control_stop", args: { STOP_OPTION: "this script" } }, log("no")]);
    h.addScript(s, [flag, { op: "control_forever", sub: [draw("f")] }]);
    h.greenFlag();
    h.step();
    expect(h.log).toEqual(["a", "f"]);
    h.step();
    expect(h.log).toEqual(["a", "f", "f"]);
  });

  it("stop all menghentikan semua thread dan menghapus clone", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "control_forever", sub: [draw("f")] }]);
    h.addScript(s, [flag, { op: "control_create_clone_of", args: { CLONE_OPTION: "_myself_" } }, { op: "control_wait", args: { DURATION: 0 } }, { op: "control_stop", args: { STOP_OPTION: "all" } }]);
    h.greenFlag();
    h.steps(3);
    expect(h.threads.length).toBe(0);
    expect(h.targets.filter((t) => !t.isOriginal)).toEqual([]);
  });

  it("stop other scripts in sprite: skrip sendiri lanjut, sprite lain tidak terganggu", () => {
    const { h, s } = setup();
    const other = h.sprite("Other");
    h.addScript(s, [flag, { op: "control_forever", sub: [draw("s1")] }]);
    h.addScript(other, [flag, { op: "control_forever", sub: [draw("o")] }]);
    h.addScript(s, [
      flag,
      { op: "control_wait", args: { DURATION: 0 } },
      { op: "control_stop", args: { STOP_OPTION: "other scripts in sprite" }, mutation: { hasnext: "true" } },
      log("after"),
    ]);
    h.greenFlag();
    h.steps(3);
    const tail = h.log.slice(h.log.indexOf("after"));
    expect(tail).not.toContain("s1");
    expect(tail).toContain("o");
  });

  it("helper mutasi hasnext & opsi dropdown seperti scratch-blocks", () => {
    expect(controlStopHasNext("other scripts in sprite")).toBe(true);
    expect(controlStopHasNext("other scripts in stage")).toBe(true);
    expect(controlStopHasNext("all")).toBe(false);
    expect(controlStopMutation("this script")).toEqual({ tagName: "mutation", children: [], hasnext: "false" });
    expect(mutationHasNext({ tagName: "mutation", children: [], hasnext: "true" })).toBe(true);
    expect(mutationHasNext(null)).toBe(false);
    expect(controlStopOptions(true, false)).toEqual([["other scripts in sprite", "other scripts in sprite"]]);
    expect(controlStopOptions(false, true).map((o) => o[1])).toEqual(["all", "this script", "other scripts in stage"]);
  });
});

describe("control: clone", () => {
  it("create clone of myself memicu start as clone di frame yang sama, clone di belakang asal", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "control_create_clone_of", args: { CLONE_OPTION: "_myself_" } }, log("made")]);
    h.addScript(s, [{ op: "control_start_as_clone" }, log("clone hello")]);
    h.greenFlag();
    h.step();
    expect(h.log).toEqual(["made", "clone hello"]);
    const clone = h.targets.find((t) => !t.isOriginal);
    expect(clone?.layerLog).toEqual([`behind:${s.id}`]);
  });

  it("create clone by nama sprite lain; nama tak dikenal diabaikan; stage tak bisa di-clone", () => {
    const { h, s } = setup();
    const b = h.sprite("B");
    h.addScript(s, [
      flag,
      { op: "control_create_clone_of", args: { CLONE_OPTION: "B" } },
      { op: "control_create_clone_of", args: { CLONE_OPTION: "Nope" } },
      { op: "control_create_clone_of", args: { CLONE_OPTION: "Stage" } },
    ]);
    h.greenFlag();
    h.step();
    const clones = h.targets.filter((t) => !t.isOriginal);
    expect(clones.map((c) => c.name)).toEqual(["B"]);
    expect(clones[0]?.original).toBe(b);
  });

  it("delete this clone: asli diabaikan, clone dibuang & thread-nya berhenti", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "control_create_clone_of", args: { CLONE_OPTION: "_myself_" } }, { op: "control_delete_this_clone" }, log("orig still")]);
    h.addScript(s, [{ op: "control_start_as_clone" }, log("c"), { op: "control_delete_this_clone" }, log("never")]);
    h.greenFlag();
    h.steps(2);
    // Thread asli selesai dulu dalam satu putaran, lalu thread clone (ditambahkan di akhir).
    expect(h.log).toEqual(["orig still", "c"]);
    expect(h.targets.filter((t) => !t.isOriginal)).toEqual([]);
    expect(h.cloneCount).toBe(0);
  });

  it("menu clone persis scratch-gui", () => {
    const { h, s } = setup();
    const b = h.sprite("B");
    const targets = h.targets as unknown as ITarget[];
    expect(cloneMenuOptions(targets, s as unknown as ITarget)).toEqual([
      ["myself", "_myself_"],
      ["B", "B"],
    ]);
    expect(cloneMenuOptions(targets, h.stage as unknown as ITarget).map((o) => o[1])).toEqual(["Sprite1", "B"]);
    void b;
    const lone = new Harness([createControlBlocks]);
    expect(cloneMenuOptions(lone.targets as unknown as ITarget[], lone.stage as unknown as ITarget)).toEqual([["", ""]]);
  });
});

describe("control: counter tersembunyi", () => {
  it("incr / get / clear", () => {
    const { h } = setup();
    const pkg = createControlBlocks(h.runtime);
    const p = pkg.getPrimitives();
    const util = {} as never;
    p.control_incr_counter?.({}, util);
    p.control_incr_counter?.({}, util);
    expect(p.control_get_counter?.({}, util)).toBe(2);
    p.control_clear_counter?.({}, util);
    expect(pkg.getCounter()).toBe(0);
    p.control_incr_counter?.({}, util);
    pkg.clearCounter();
    expect(p.control_get_counter?.({}, util)).toBe(0);
  });
});

describe("harness sanity", () => {
  it("status thread YIELD dikembalikan ke RUNNING setelah step", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "control_wait", args: { DURATION: 1 } }]);
    h.greenFlag();
    h.step();
    expect(h.threads[0]?.status).toBe(ThreadStatus.RUNNING);
  });
});
