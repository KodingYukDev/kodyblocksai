import { describe, expect, it } from "vitest";
import { addScript, procedureCall, procedureDefinition, type BlockSpec } from "./testing/script-builder";
import { makeKit } from "./testing/test-kit";
import { ThreadStatus, WARP_TIME } from "./types/runtime";

const flag: BlockSpec = { opcode: "event_whenflagclicked" };
const log = (text: string | number | BlockSpec): BlockSpec => ({ opcode: "test_log", inputs: { TEXT: text } });
const redraw = (text: string): BlockSpec => ({ opcode: "test_redraw", inputs: { TEXT: text } });

describe("Sequencer.stepThreads", () => {
  it("tanpa thread mengembalikan [] dan thread selesai dibuang di step yang sama", () => {
    const kit = makeKit();
    expect(kit.runtime.sequencer.stepThreads()).toEqual([]);
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [flag, log("a"), log("b"), log("c")]);
    kit.runtime.greenFlag();
    expect(kit.runtime.threads).toHaveLength(1);
    const done = kit.runtime.sequencer.stepThreads();
    expect(done).toHaveLength(1);
    expect(kit.runtime.threads).toHaveLength(0);
    expect(kit.log).toEqual(["a", "b", "c"]);
  });

  it("loop yield sekali per frame bila redraw diminta", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [flag, { opcode: "control_forever", substack: [redraw("tick")] }]);
    kit.runtime.greenFlag();
    kit.frames(3);
    expect(kit.log).toEqual(["tick", "tick", "tick"]);
  });

  it("loop tanpa redraw berjalan sampai WORK_TIME (75% frame) habis", () => {
    const kit = makeKit();
    kit.time.autoStep = 1; // setiap now() maju 1 ms
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [flag, { opcode: "control_forever", substack: [log("i")] }]);
    kit.runtime.greenFlag();
    kit.runtime.step();
    // WORK_TIME = 25 ms; satu iterasi memanggil now() sekali di kondisi while.
    expect(kit.log.length).toBeGreaterThan(5);
    expect(kit.log.length).toBeLessThanOrEqual(25);
  });

  it("turbo mode mengabaikan redraw", () => {
    const kit = makeKit();
    kit.time.autoStep = 1;
    kit.runtime.setTurboMode(true);
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [flag, { opcode: "control_repeat", inputs: { TIMES: 10 }, substack: [redraw("r")] }]);
    kit.runtime.greenFlag();
    kit.runtime.step();
    expect(kit.log).toHaveLength(10);
  });

  it("repeat: iterasi per frame, cabang kosong tetap yield", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [flag, { opcode: "control_repeat", inputs: { TIMES: 3 }, substack: [redraw("r")] }, log("end")]);
    kit.runtime.greenFlag();
    kit.frames(1);
    expect(kit.log).toEqual(["r"]);
    kit.frames(2);
    expect(kit.log).toEqual(["r", "r", "r"]);
    kit.frames(1);
    expect(kit.log).toEqual(["r", "r", "r", "end"]);
  });

  it("urutan thread: sprite paling depan dimulai lebih dulu, lalu bergiliran per frame", () => {
    const kit = makeKit();
    const back = kit.addSprite("Belakang");
    const front = kit.addSprite("Depan");
    addScript(back.blocks, [flag, redraw("B1"), redraw("B2")]);
    addScript(front.blocks, [flag, redraw("F1"), redraw("F2")]);
    kit.runtime.greenFlag();
    kit.frames(1);
    // redraw diminta di thread pertama -> thread lain tetap jalan di tick yang sama.
    expect(kit.log).toEqual(["F1", "F2", "B1", "B2"]);
  });

  it("wait memakai jam frame (currentMSecs) dan yield", () => {
    const kit = makeKit();
    // Jam harus bergerak: wait yang belum selesai yield tanpa redraw, jadi frame berakhir karena WORK_TIME.
    kit.time.autoStep = 1;
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [flag, { opcode: "control_wait", inputs: { DURATION: 0.1 } }, log("done")]);
    kit.runtime.greenFlag();
    kit.frames(1);
    expect(kit.log).toEqual([]);
    const start = kit.runtime.currentMSecs;
    let frames = 1;
    while (kit.log.length === 0 && frames < 20) {
      kit.frames(1);
      frames++;
    }
    expect(kit.log).toEqual(["done"]);
    // Selesai pada frame pertama yang currentMSecs-nya >= 100 ms setelah timer dimulai.
    expect(kit.runtime.currentMSecs - start).toBeGreaterThanOrEqual(100 - 60);
  });

  it("YIELD_TICK menunggu sampai frame berikutnya", () => {
    const kit = makeKit();
    kit.time.autoStep = 1;
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [flag, { opcode: "test_yieldtick" }, log("after")]);
    addScript(sprite.blocks, [flag, { opcode: "control_repeat", inputs: { TIMES: 3 }, substack: [log("loop")] }]);
    kit.runtime.greenFlag();
    kit.runtime.step();
    expect(kit.log).toEqual(["loop", "loop", "loop"]);
    kit.runtime.step();
    expect(kit.log).toEqual(["loop", "loop", "loop", "after"]);
  });

  it("stepToBranch mendorong penanda null untuk cabang kosong", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    const top = addScript(sprite.blocks, [{ opcode: "control_if_else", inputs: { CONDITION: "true" }, substack: [log("x")] }]);
    const thread = kit.runtime.pushThread(top, sprite);
    kit.runtime.sequencer.stepToBranch(thread, 2, false);
    expect(thread.peekStack()).toBe("");
    thread.popStack();
    kit.runtime.sequencer.stepToBranch(thread, 1, true);
    expect(thread.peekStack()).not.toBe("");
    expect(thread.peekParentStackFrame()?.isLoop).toBe(true);
    kit.runtime.sequencer.retireThread(thread);
    expect(thread.stack).toHaveLength(0);
    expect(thread.status).toBe(ThreadStatus.DONE);
  });
});

describe("procedure", () => {
  it("argumen, kembali ke pemanggil, dan stop this script hanya keluar dari procedure", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    addScript(
      sprite.blocks,
      procedureDefinition("say %s", ["msg"], [
        log({ opcode: "argument_reporter_string_number", fields: { VALUE: "msg" } }),
        { opcode: "control_stop", fields: { STOP_OPTION: "this script" }, mutation: { hasnext: "false" } },
        log("tidak"),
      ]),
    );
    addScript(sprite.blocks, [flag, procedureCall("say %s", { msg: "halo" }), log("setelah")]);
    kit.runtime.greenFlag();
    kit.frames(1);
    expect(kit.log).toEqual(["halo", "setelah"]);
  });

  it("argumen di luar procedure bernilai 0", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [flag, log({ opcode: "argument_reporter_string_number", fields: { VALUE: "zzz" } })]);
    kit.runtime.greenFlag();
    kit.frames(1);
    expect(kit.log).toEqual(["0"]);
  });

  it("rekursi normal yield setiap panggilan rekursif", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    const v = { value: "n", id: "var-n" };
    sprite.createVariable("var-n", "n", "");
    addScript(
      sprite.blocks,
      procedureDefinition("rec", [], [
        { opcode: "data_changevariableby", fields: { VARIABLE: v }, inputs: { VALUE: 1 } },
        { opcode: "test_redraw", inputs: { TEXT: { opcode: "data_variable", fields: { VARIABLE: v } } } },
        procedureCall("rec", {}),
      ]),
    );
    addScript(sprite.blocks, [flag, procedureCall("rec", {})]);
    kit.runtime.greenFlag();
    // Tanpa yield pada panggilan rekursif, stepThread tidak akan pernah kembali.
    kit.frames(1);
    expect(kit.log).toEqual(["1"]);
    kit.frames(2);
    expect(kit.log).toEqual(["1", "2", "3"]);
  });

  it("warp: loop dalam procedure warp tidak yield sampai WARP_TIME", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    addScript(
      sprite.blocks,
      procedureDefinition("fast", [], [{ opcode: "control_repeat", inputs: { TIMES: 50 }, substack: [redraw("w")] }], true),
    );
    addScript(sprite.blocks, [flag, procedureCall("fast", {}), redraw("end")]);
    kit.runtime.greenFlag();
    kit.frames(1);
    expect(kit.log.filter((s) => s === "w")).toHaveLength(50);
    expect(kit.log[50]).toBe("end");
  });

  it("warp berhenti yield setelah WARP_TIME habis", () => {
    const kit = makeKit();
    kit.time.autoStep = 10;
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, procedureDefinition("slow", [], [{ opcode: "control_forever", substack: [log("w")] }], true));
    addScript(sprite.blocks, [flag, procedureCall("slow", {})]);
    kit.runtime.greenFlag();
    kit.runtime.step();
    const n = kit.log.length;
    expect(n).toBeGreaterThan(10);
    expect(n).toBeLessThanOrEqual(WARP_TIME / 10 + 2);
  });
});

describe("execute", () => {
  it("reporter bersarang dievaluasi dalam urutan input dan hasilnya di-cast oleh primitive", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [
      flag,
      log({ opcode: "operator_join", inputs: { STRING1: { opcode: "operator_add", inputs: { NUM1: "1e3", NUM2: " 5 " } }, STRING2: "!" } }),
      log({ opcode: "operator_add", inputs: { NUM1: "", NUM2: "abc" } }),
    ]);
    kit.runtime.greenFlag();
    kit.frames(1);
    expect(kit.log).toEqual(["1005!", "0"]);
  });

  it("Promise: thread PROMISE_WAIT lalu lanjut dengan nilai reporter yang dipulihkan", async () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [
      flag,
      log({
        opcode: "operator_join",
        inputs: {
          STRING1: { opcode: "operator_add", inputs: { NUM1: 2, NUM2: 3 } },
          STRING2: { opcode: "test_async", inputs: { TEXT: "-async" } },
        },
      }),
      log("next"),
    ]);
    kit.runtime.greenFlag();
    kit.frames(1);
    expect(kit.runtime.threads[0]?.status).toBe(ThreadStatus.PROMISE_WAIT);
    expect(kit.log).toEqual([]);
    await Promise.resolve();
    kit.frames(1);
    expect(kit.log).toEqual(["5-async", "next"]);
  });

  it("command yang mengembalikan Promise melanjutkan ke blok berikutnya setelah resolve", async () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [flag, { opcode: "test_async", inputs: { TEXT: "x" } }, log("lanjut")]);
    kit.runtime.greenFlag();
    kit.frames(1);
    await Promise.resolve();
    kit.frames(1);
    expect(kit.log).toEqual(["lanjut"]);
  });

  it("error primitive dilaporkan lewat RUNTIME_ERROR tanpa menghentikan frame", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    kit.runtime.addPrimitive("test_throw", () => {
      throw new Error("boom");
    });
    const errors: unknown[] = [];
    kit.runtime.on("RUNTIME_ERROR", (e) => errors.push(e.opcode));
    addScript(sprite.blocks, [flag, { opcode: "test_throw" }, log("tetap")]);
    kit.runtime.greenFlag();
    kit.frames(1);
    expect(errors).toEqual(["test_throw"]);
    expect(kit.log).toEqual(["tetap"]);
  });

  it("blok yang dihapus saat thread berjalan menghentikan thread", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    const top = addScript(sprite.blocks, [flag, { opcode: "control_forever", substack: [redraw("x")] }]);
    kit.runtime.greenFlag();
    kit.frames(1);
    sprite.blocks.deleteBlock(top);
    kit.frames(1);
    expect(kit.runtime.threads).toHaveLength(0);
  });
});
