import { describe, expect, it, vi } from "vitest";

// Salinan perilaku cast.js untuk fungsi yang dipakai (lihat control.test.ts).
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

import type { BlockUtility, IRuntime, IThread } from "../types/runtime";
import type { Variable } from "../types/target";
import { createControlBlocks } from "./control";
import { Harness } from "./control-event.harness";
import {
  createEventBlocks,
  EVENT_HATS,
  startBackdropHats,
  startClickHats,
  startWhenKeyPressedHats,
} from "./event";

const flag = { op: "event_whenflagclicked" };
const log = (m: string) => ({ op: "test_log", args: { MSG: m } });
const draw = (m: string) => ({ op: "test_redraw", args: { MSG: m } });
const wait0 = { op: "control_wait", args: { DURATION: 0 } };
const msgRef = { id: "m1", name: "message1" };

function setup() {
  const h = new Harness([createControlBlocks, createEventBlocks]);
  const s = h.sprite("Sprite1");
  h.stage.variables.m1 = { id: "m1", name: "message1", type: "broadcast_msg", value: "message1", isCloud: false } as Variable;
  return { h, s };
}

function frames(h: Harness, n: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < n; i++) {
    const before = h.log.length;
    h.step();
    out.push(h.log.slice(before));
  }
  return out;
}

describe("event: daftar opcode & metadata hat", () => {
  it("primitive & hat persis Scratch3EventBlocks", () => {
    const { h } = setup();
    const pkg = createEventBlocks(h.runtime);
    expect(Object.keys(pkg.getPrimitives()).sort()).toEqual(
      ["event_broadcast", "event_broadcastandwait", "event_whengreaterthan", "event_whentouchingobject"].sort(),
    );
    expect(pkg.getHats()).toEqual({
      event_whenflagclicked: { restartExistingThreads: true },
      event_whenkeypressed: { restartExistingThreads: false },
      event_whenthisspriteclicked: { restartExistingThreads: true },
      event_whentouchingobject: { restartExistingThreads: false, edgeActivated: true },
      event_whenstageclicked: { restartExistingThreads: true },
      event_whenbackdropswitchesto: { restartExistingThreads: true },
      event_whengreaterthan: { restartExistingThreads: false, edgeActivated: true },
      event_whenbroadcastreceived: { restartExistingThreads: true },
    });
    // Salinan, bukan referensi beku.
    pkg.getHats().event_whenflagclicked!.restartExistingThreads = false;
    expect(EVENT_HATS.event_whenflagclicked?.restartExistingThreads).toBe(true);
  });
});

describe("event: green flag", () => {
  it("urutan thread: sprite paling depan dulu, skrip urut penyisipan, stage terakhir", () => {
    const { h, s } = setup();
    const front = h.sprite("Front");
    h.addScript(h.stage, [flag, log("stage")]);
    h.addScript(s, [flag, log("s-1")]);
    h.addScript(s, [flag, log("s-2")]);
    h.addScript(front, [flag, log("front")]);
    h.greenFlag();
    h.step();
    expect(h.log).toEqual(["front", "s-1", "s-2", "stage"]);
  });

  it("klik bendera lagi me-restart thread yang sedang jalan", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "control_forever", sub: [draw("f")] }]);
    h.greenFlag();
    h.step();
    const first = h.threads[0];
    h.greenFlag();
    expect(h.threads[0]).not.toBe(first);
    h.step();
    expect(h.threads.length).toBe(1);
  });
});

describe("event: broadcast", () => {
  it("broadcast memicu penerima (nama tidak peka huruf) di frame yang sama tanpa menunggu", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "event_broadcast", args: { BROADCAST_OPTION: msgRef } }, log("sent")]);
    h.addScript(s, [{ op: "event_whenbroadcastreceived", args: { BROADCAST_OPTION: "MESSAGE1" } }, log("got")]);
    h.addScript(s, [{ op: "event_whenbroadcastreceived", args: { BROADCAST_OPTION: "other" } }, log("wrong")]);
    h.greenFlag();
    h.step();
    expect(h.log).toEqual(["sent", "got"]);
  });

  it("broadcast pesan yang tidak ada di stage tidak memicu apa pun", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "event_broadcast", args: { BROADCAST_OPTION: { id: "x", name: "ghost" } } }]);
    h.addScript(s, [{ op: "event_whenbroadcastreceived", args: { BROADCAST_OPTION: "ghost" } }, log("got")]);
    h.greenFlag();
    h.step();
    expect(h.log).toEqual([]);
  });

  it("broadcast lookup by nama bila id tidak cocok (reporter di input broadcast)", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "event_broadcast", args: { BROADCAST_OPTION: { id: null, name: "Message1" } } }]);
    h.addScript(s, [{ op: "event_whenbroadcastreceived", args: { BROADCAST_OPTION: "message1" } }, log("got")]);
    h.greenFlag();
    h.step();
    expect(h.log).toEqual(["got"]);
  });

  it("broadcast ulang me-restart thread penerima", () => {
    const { h, s } = setup();
    h.addScript(s, [{ op: "event_whenbroadcastreceived", args: { BROADCAST_OPTION: "message1" } }, log("r1"), wait0, log("r2")]);
    h.addScript(s, [flag, { op: "event_broadcast", args: { BROADCAST_OPTION: msgRef } }, wait0, { op: "event_broadcast", args: { BROADCAST_OPTION: msgRef } }]);
    h.greenFlag();
    // f1: r1 (penerima tunggu); f2: broadcast ulang -> restart: r1 lagi, r2 lama tidak pernah jalan.
    expect(frames(h, 3)).toEqual([["r1"], ["r1"], ["r2"]]);
  });

  it("broadcast and wait menunggu semua penerima selesai lalu lanjut di frame yang sama", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "event_broadcastandwait", args: { BROADCAST_OPTION: msgRef } }, log("after")]);
    h.addScript(s, [{ op: "event_whenbroadcastreceived", args: { BROADCAST_OPTION: "message1" } }, log("a1"), wait0, log("a2")]);
    h.addScript(h.stage, [{ op: "event_whenbroadcastreceived", args: { BROADCAST_OPTION: "message1" } }, log("b1"), wait0, wait0, log("b2")]);
    h.greenFlag();
    expect(frames(h, 4)).toEqual([["a1", "b1"], ["a2"], ["b2", "after"], []]);
  });

  it("broadcast and wait tanpa penerima langsung lanjut", () => {
    const { h, s } = setup();
    h.addScript(s, [flag, { op: "event_broadcastandwait", args: { BROADCAST_OPTION: msgRef } }, log("after")]);
    h.greenFlag();
    h.step();
    expect(h.log).toEqual(["after"]);
  });

  it("broadcast and wait: yieldTick bila semua thread menunggu, yield bila ada yang aktif", () => {
    const t = {} as IThread;
    const calls: string[] = [];
    let waiting = true;
    const rt = {
      threads: [t],
      isWaitingThread: () => waiting,
      getTargetForStage: () => ({ lookupBroadcastMsg: () => ({ name: "m" }) }),
      on: () => () => undefined,
    } as unknown as IRuntime;
    const prim = createEventBlocks(rt).getPrimitives().event_broadcastandwait!;
    const frame: Record<string, unknown> = {};
    const util = {
      runtime: rt,
      stackFrame: frame,
      startHats: () => [t],
      yield: () => calls.push("yield"),
      yieldTick: () => calls.push("yieldTick"),
    } as unknown as BlockUtility;
    prim({ BROADCAST_OPTION: msgRef }, util);
    waiting = false;
    prim({ BROADCAST_OPTION: msgRef }, util);
    (rt.threads as IThread[]).length = 0;
    prim({ BROADCAST_OPTION: msgRef }, util);
    expect(calls).toEqual(["yieldTick", "yield"]);
  });
});

describe("event: hat edge-activated", () => {
  it("when timer > N terpicu hanya pada transisi false -> true", () => {
    const { h, s } = setup();
    h.addScript(s, [{ op: "event_whengreaterthan", args: { WHENGREATERTHANMENU: "TIMER", VALUE: "1" } }, log("t")]);
    const seq: number[] = [0, 2, 2, 0, 3];
    const out: string[][] = [];
    for (const v of seq) {
      h.timer = v;
      const before = h.log.length;
      h.step();
      out.push(h.log.slice(before));
    }
    expect(out).toEqual([[], ["t"], [], [], ["t"]]);
  });

  it("evaluasi pertama yang sudah true langsung memicu", () => {
    const { h, s } = setup();
    h.timer = 5;
    h.addScript(s, [{ op: "event_whengreaterthan", args: { WHENGREATERTHANMENU: "timer", VALUE: 1 } }, log("t")]);
    h.step();
    expect(h.log).toEqual(["t"]);
  });

  it("loudness memakai audioEngine; tanpa audio selalu false; menu tak dikenal false", () => {
    const { h } = setup();
    const p = createEventBlocks(h.runtime).getPrimitives().event_whengreaterthan!;
    const util = { ioQuery: () => 0 } as unknown as BlockUtility;
    h.loudness = 50;
    expect(p({ WHENGREATERTHANMENU: "LOUDNESS", VALUE: 10 }, util)).toBe(true);
    expect(p({ WHENGREATERTHANMENU: "loudness", VALUE: 50 }, util)).toBe(false);
    expect(p({ WHENGREATERTHANMENU: "volume", VALUE: -100 }, util)).toBe(false);
    h.hasAudio = false;
    expect(p({ WHENGREATERTHANMENU: "loudness", VALUE: -100 }, util)).toBe(false);
    expect(p({ WHENGREATERTHANMENU: "timer", VALUE: "abc" }, { ioQuery: () => 0.5 } as unknown as BlockUtility)).toBe(true);
  });

  it("when touching object: edge per target, tidak memicu ulang saat masih menyentuh", () => {
    const { h, s } = setup();
    h.addScript(s, [{ op: "event_whentouchingobject", args: { TOUCHINGOBJECTMENU: "_edge_" } }, log("hit")]);
    h.step();
    s.touching.add("_edge_");
    h.step();
    h.step();
    s.touching.delete("_edge_");
    h.step();
    s.touching.add("_edge_");
    h.step();
    expect(h.log).toEqual(["hit", "hit"]);
  });
});

describe("event: pemicu dari IO/looks", () => {
  it("tombol: hat tombol spesifik lalu 'any'; huruf tidak peka besar-kecil", () => {
    const { h, s } = setup();
    h.addScript(s, [{ op: "event_whenkeypressed", args: { KEY_OPTION: "any" } }, log("any")]);
    h.addScript(s, [{ op: "event_whenkeypressed", args: { KEY_OPTION: "space" } }, log("space")]);
    h.addScript(s, [{ op: "event_whenkeypressed", args: { KEY_OPTION: "a" } }, log("a")]);
    h.addScript(s, [{ op: "event_whenkeypressed", args: { KEY_OPTION: "left arrow" } }, log("left")]);
    startWhenKeyPressedHats(h.runtime, "space");
    h.step();
    startWhenKeyPressedHats(h.runtime, "A");
    h.step();
    startWhenKeyPressedHats(h.runtime, "left arrow");
    h.step();
    expect(h.log).toEqual(["space", "any", "a", "any", "left", "any"]);
  });

  it("tombol ditahan tidak me-restart thread yang masih jalan (restartExistingThreads false)", () => {
    const { h, s } = setup();
    h.addScript(s, [{ op: "event_whenkeypressed", args: { KEY_OPTION: "space" } }, log("start"), wait0, wait0, log("end")]);
    startWhenKeyPressedHats(h.runtime, "space");
    h.step();
    startWhenKeyPressedHats(h.runtime, "space");
    h.step();
    h.step();
    expect(h.log).toEqual(["start", "end"]);
  });

  it("klik: kedua hat klik dipicu hanya untuk target yang diklik", () => {
    const { h, s } = setup();
    const other = h.sprite("Other");
    h.addScript(s, [{ op: "event_whenthisspriteclicked" }, log("s-sprite")]);
    h.addScript(s, [{ op: "event_whenstageclicked" }, log("s-stage")]);
    h.addScript(other, [{ op: "event_whenthisspriteclicked" }, log("other")]);
    h.addScript(h.stage, [{ op: "event_whenstageclicked" }, log("stage")]);
    startClickHats(h.runtime, s as never);
    h.step();
    expect(h.log).toEqual(["s-sprite", "s-stage"]);
    startClickHats(h.runtime, h.stage as never);
    h.step();
    expect(h.log.slice(2)).toEqual(["stage"]);
  });

  it("backdrop berganti memicu hat dengan nama cocok", () => {
    const { h, s } = setup();
    h.addScript(s, [{ op: "event_whenbackdropswitchesto", args: { BACKDROP: "Backdrop2" } }, log("bd2")]);
    h.addScript(h.stage, [{ op: "event_whenbackdropswitchesto", args: { BACKDROP: "backdrop1" } }, log("bd1")]);
    startBackdropHats(h.runtime, "backdrop2");
    h.step();
    expect(h.log).toEqual(["bd2"]);
  });
});
