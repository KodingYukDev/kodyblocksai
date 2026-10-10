import { describe, expect, it } from "vitest";
import { addScript, procedureCall, procedureDefinition } from "./testing/script-builder";
import { makeKit } from "./testing/test-kit";
import { NULL_BLOCK, Thread } from "./thread";
import { ThreadStatus } from "./types/runtime";

function setup() {
  const kit = makeKit();
  const sprite = kit.addSprite("Kody");
  return { kit, sprite };
}

describe("Thread", () => {
  it("nilai status sama dengan scratch-vm", () => {
    expect(ThreadStatus).toEqual({ RUNNING: 0, PROMISE_WAIT: 1, YIELD: 2, YIELD_TICK: 3, DONE: 4 });
  });

  it("pushStack/popStack menjaga stack frame dan mewarisi warpMode", () => {
    const { sprite } = setup();
    const th = new Thread("a", sprite);
    th.pushStack("a");
    expect(th.stackFrames).toHaveLength(1);
    expect(th.peekStackFrame()?.warpMode).toBe(false);
    const frame = th.peekStackFrame();
    if (frame) frame.warpMode = true;
    th.pushStack("b");
    expect(th.stackFrames).toHaveLength(2);
    expect(th.peekStackFrame()?.warpMode).toBe(true);
    expect(th.peekParentStackFrame()).toBe(frame);
    expect(th.popStack()).toBe("b");
    expect(th.peekStack()).toBe("a");
    expect(th.atStackTop()).toBe(true);
    th.popStack();
    expect(th.peekStack()).toBeUndefined();
    expect(th.peekStackFrame()).toBeUndefined();
    expect(th.peekParentStackFrame()).toBeNull();
  });

  it("reuseStackForNextBlock mereset frame tetapi mempertahankan warpMode", () => {
    const { sprite } = setup();
    const th = new Thread("a", sprite);
    th.pushStack("a");
    const frame = th.peekStackFrame();
    if (!frame) throw new Error("frame");
    frame.warpMode = true;
    frame.isLoop = true;
    frame.executionContext = { loopCounter: 3 };
    frame.params = { x: 1 };
    th.reuseStackForNextBlock("b");
    expect(th.peekStack()).toBe("b");
    expect(frame).toMatchObject({ isLoop: false, warpMode: true, executionContext: null, params: null });
  });

  it("cabang kosong disimpan sebagai NULL_BLOCK (falsy)", () => {
    const { sprite } = setup();
    const th = new Thread("a", sprite);
    th.pushStack(null);
    expect(th.peekStack()).toBe(NULL_BLOCK);
    expect(Boolean(th.peekStack())).toBe(false);
  });

  it("getParam mencari frame terdekat yang punya params saja", () => {
    const { sprite } = setup();
    const th = new Thread("a", sprite);
    th.pushStack("a");
    th.initParams();
    th.pushParam("x", 5);
    th.pushStack("b");
    th.pushStack("c");
    expect(th.getParam("x")).toBe(5);
    th.initParams();
    th.pushParam("y", 1);
    // Frame teratas punya params tanpa "x" -> null (tidak lanjut ke frame bawah).
    expect(th.getParam("x")).toBeNull();
    expect(th.getParam("y")).toBe(1);
    th.pushReportedValue(undefined);
    expect(th.justReported).toBeNull();
    th.pushReportedValue(0);
    expect(th.justReported).toBe(0);
  });

  it("stopThisScript berhenti di procedures_call terdekat", () => {
    const { sprite } = setup();
    const callTop = addScript(sprite.blocks, [procedureCall("f", {})]);
    const th = new Thread("x", sprite);
    th.pushStack("x");
    th.pushStack(callTop);
    th.pushStack("inner1");
    th.pushStack("inner2");
    th.stopThisScript();
    expect(th.peekStack()).toBe(callTop);
    expect(th.status).toBe(ThreadStatus.RUNNING);
    const th2 = new Thread("x", sprite);
    th2.pushStack("x");
    th2.pushStack("y");
    th2.stopThisScript();
    expect(th2.stack).toHaveLength(0);
    expect(th2.status).toBe(ThreadStatus.DONE);
  });

  it("isRecursiveCall memeriksa maksimal 5 panggilan pembungkus", () => {
    const { sprite } = setup();
    addScript(sprite.blocks, procedureDefinition("f", [], []));
    const calls = Array.from({ length: 8 }, () => addScript(sprite.blocks, [procedureCall("f", {})]));
    const th = new Thread(calls[0] ?? "", sprite);
    th.pushStack(calls[0] ?? "");
    th.pushStack("current");
    expect(th.isRecursiveCall("f")).toBe(true);
    expect(th.isRecursiveCall("g")).toBe(false);
    const deep = new Thread(calls[0] ?? "", sprite);
    deep.pushStack(calls[0] ?? "");
    for (let i = 0; i < 7; i++) deep.pushStack(`other${i}`);
    deep.pushStack("current");
    expect(deep.isRecursiveCall("f")).toBe(false);
  });
});
