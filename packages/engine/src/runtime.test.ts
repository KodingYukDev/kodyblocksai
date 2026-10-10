import { describe, expect, it } from "vitest";
import { addScript, type BlockSpec } from "./testing/script-builder";
import { makeKit } from "./testing/test-kit";
import { createMonitorRecord } from "./monitors";
import { Runtime } from "./runtime";
import type { ExtensionModule } from "./types/extension";
import { ThreadStatus } from "./types/runtime";

const flag: BlockSpec = { opcode: "event_whenflagclicked" };
const log = (text: string | BlockSpec): BlockSpec => ({ opcode: "test_log", inputs: { TEXT: text } });
const redraw = (text: string): BlockSpec => ({ opcode: "test_redraw", inputs: { TEXT: text } });
const whenBroadcast = (name: string): BlockSpec => ({
  opcode: "event_whenbroadcastreceived",
  fields: { BROADCAST_OPTION: { value: name, id: `bc-${name}` } },
});
const broadcastInput = (name: string) => ({
  opcode: "event_broadcast_menu",
  shadow: true,
  fields: { BROADCAST_OPTION: { value: name, id: `bc-${name}` } },
});

describe("Runtime dasar", () => {
  it("default 30 fps (compatibility) dan konstanta", () => {
    const rt = new Runtime({ autoStart: false, blockPackages: [] });
    expect(rt.compatibilityMode).toBe(true);
    expect(rt.currentStepTime).toBeCloseTo(1000 / 30);
    rt.setCompatibilityMode(false);
    expect(rt.currentStepTime).toBeCloseTo(1000 / 60);
    expect(rt.getTargetForStage()).toBeUndefined();
  });

  it("start/quit memakai interval dan tidak dobel", () => {
    const rt = new Runtime({ autoStart: true, blockPackages: [] });
    rt.start();
    rt.quit();
    rt.dispose();
  });

  it("random memakai RuntimeOptions.random", () => {
    const rt = new Runtime({ autoStart: false, blockPackages: [], random: () => 0.25 });
    expect(rt.random()).toBe(0.25);
  });
});

describe("startHats", () => {
  it("restartExistingThreads=true memulai ulang thread di posisi yang sama", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [flag, { opcode: "control_forever", substack: [redraw("x")] }]);
    kit.runtime.greenFlag();
    kit.frames(2);
    const first = kit.runtime.threads[0];
    const restarted = kit.runtime.startHats("event_whenflagclicked");
    expect(restarted).toHaveLength(1);
    expect(restarted[0]).not.toBe(first);
    expect(kit.runtime.threads).toEqual(restarted);
  });

  it("restartExistingThreads=false tidak memulai kalau masih berjalan", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [{ opcode: "event_whenkeypressed", fields: { KEY_OPTION: "space" } }, { opcode: "control_forever", substack: [redraw("k")] }]);
    expect(kit.runtime.startHats("event_whenkeypressed", { KEY_OPTION: "space" })).toHaveLength(1);
    expect(kit.runtime.startHats("event_whenkeypressed", { KEY_OPTION: "space" })).toHaveLength(0);
    expect(kit.runtime.startHats("event_whenkeypressed", { KEY_OPTION: "a" })).toHaveLength(0);
    expect(kit.runtime.startHats("tidak_ada_hat")).toEqual([]);
  });

  it("field dicocokkan case-insensitive (broadcast)", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [whenBroadcast("Pesan1"), log("diterima")]);
    kit.runtime.startHats("event_whenbroadcastreceived", { BROADCAST_OPTION: "pesan1" });
    kit.frames(1);
    expect(kit.log).toEqual(["diterima"]);
  });

  it("broadcast and wait menunggu semua penerima selesai", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    kit.stage.createVariable("bc-go", "go", "broadcast_msg");
    addScript(sprite.blocks, [whenBroadcast("go"), redraw("r1"), redraw("r2")]);
    addScript(sprite.blocks, [whenBroadcast("go"), { opcode: "control_wait", inputs: { DURATION: 0 } }, log("w")]);
    addScript(sprite.blocks, [flag, { opcode: "event_broadcastandwait", inputs: { BROADCAST_INPUT: broadcastInput("go") } }, log("selesai")]);
    kit.runtime.greenFlag();
    kit.frames(1);
    expect(kit.log).toEqual(["r1", "r2"]);
    kit.frames(3);
    expect(kit.log).toEqual(["r1", "r2", "w", "selesai"]);
  });

  it("hat edge-activated hanya terpicu saat false -> true", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    kit.stage.createVariable("edge", "edge", "");
    const edge = kit.stage.variables.edge;
    if (!edge) throw new Error("edge");
    addScript(sprite.blocks, [{ opcode: "test_edge" }, log("naik")]);
    kit.frames(2);
    expect(kit.log).toEqual([]);
    edge.value = "true";
    kit.frames(3);
    expect(kit.log).toEqual(["naik"]);
    edge.value = "false";
    kit.frames(1);
    edge.value = "true";
    kit.frames(1);
    expect(kit.log).toEqual(["naik", "naik"]);
  });

  it("green flag mengosongkan nilai edge sehingga hat yang sudah true terpicu lagi", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    kit.stage.createVariable("edge", "edge", "");
    const edge = kit.stage.variables.edge;
    if (edge) edge.value = "true";
    addScript(sprite.blocks, [{ opcode: "test_edge" }, log("naik")]);
    kit.frames(2);
    expect(kit.log).toEqual(["naik"]);
    kit.runtime.greenFlag();
    kit.frames(1);
    expect(kit.log).toEqual(["naik", "naik"]);
  });
});

describe("stop", () => {
  it("stop all menghentikan semua thread dan membuang clone", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [flag, { opcode: "control_create_clone_of" }, { opcode: "control_forever", substack: [redraw("x")] }]);
    addScript(sprite.blocks, [flag, { opcode: "control_wait", inputs: { DURATION: 0 } }, { opcode: "control_stop", fields: { STOP_OPTION: "all" } }]);
    kit.runtime.greenFlag();
    kit.frames(1);
    expect(kit.runtime.targets).toHaveLength(3);
    const stops: string[] = [];
    kit.runtime.on("PROJECT_STOP_ALL", () => stops.push("stop"));
    kit.frames(1);
    expect(stops).toEqual(["stop"]);
    expect(kit.runtime.threads).toHaveLength(0);
    expect(kit.runtime.targets).toHaveLength(2);
  });

  it("stop other scripts in sprite tidak menghentikan thread sendiri atau sprite lain", () => {
    const kit = makeKit();
    const a = kit.addSprite("A");
    const b = kit.addSprite("B");
    addScript(a.blocks, [flag, { opcode: "control_forever", substack: [redraw("a1")] }]);
    addScript(b.blocks, [flag, { opcode: "control_forever", substack: [redraw("b")] }]);
    addScript(a.blocks, [flag, { opcode: "control_stop", fields: { STOP_OPTION: "other scripts in sprite" } }, { opcode: "control_forever", substack: [redraw("a2")] }]);
    kit.runtime.greenFlag();
    kit.frames(1);
    kit.log.length = 0;
    kit.frames(1);
    expect(kit.log.sort()).toEqual(["a2", "b"]);
  });

  it("isActiveThread / isWaitingThread", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    const top = addScript(sprite.blocks, [flag, { opcode: "test_async", inputs: { TEXT: "x" } }]);
    const [thread] = kit.runtime.startHats("event_whenflagclicked");
    if (!thread) throw new Error("thread");
    expect(thread.topBlock).toBe(top);
    expect(kit.runtime.isActiveThread(thread)).toBe(true);
    kit.frames(1);
    expect(thread.status).toBe(ThreadStatus.PROMISE_WAIT);
    expect(kit.runtime.isWaitingThread(thread)).toBe(true);
  });
});

describe("toggleScript, glow, visual report", () => {
  it("klik skrip menjalankan, klik lagi menghentikan; glow dan laporan nilai", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    kit.runtime.setEditingTarget(sprite);
    const events: string[] = [];
    kit.runtime.on("SCRIPT_GLOW_ON", (e) => events.push(`on:${e.id}`));
    kit.runtime.on("SCRIPT_GLOW_OFF", (e) => events.push(`off:${e.id}`));
    kit.runtime.on("VISUAL_REPORT", (e) => events.push(`report:${e.id}=${String(e.value)}`));
    const loop = addScript(sprite.blocks, [{ opcode: "control_forever", substack: [redraw("x")] }]);
    const t = kit.runtime.toggleScript(loop, { stackClick: true });
    expect(t?.stackClick).toBe(true);
    kit.frames(1);
    expect(events).toEqual([`on:${loop}`]);
    expect(kit.runtime.toggleScript(loop, { stackClick: true })).toBeNull();
    kit.frames(1);
    expect(events).toEqual([`on:${loop}`, `off:${loop}`]);

    const reporter = addScript(sprite.blocks, [{ opcode: "operator_add", inputs: { NUM1: 2, NUM2: 3 } }]);
    kit.runtime.toggleScript(reporter, { stackClick: true });
    kit.frames(1);
    expect(events).toContain(`report:${reporter}=5`);
  });

  it("PROJECT_RUN_START/STOP mengikuti jumlah thread non-monitor", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [flag, log("a")]);
    const events: string[] = [];
    kit.runtime.on("PROJECT_RUN_START", () => events.push("start"));
    kit.runtime.on("PROJECT_RUN_STOP", () => events.push("stop"));
    kit.runtime.greenFlag();
    kit.frames(2);
    expect(events).toEqual(["start", "stop"]);
  });
});

describe("monitor", () => {
  it("MONITORS_UPDATE hanya saat state berubah; null tidak menimpa", () => {
    const kit = makeKit();
    const updates: number[] = [];
    kit.runtime.on("MONITORS_UPDATE", (e) => updates.push(e.monitors.size));
    kit.runtime.requestAddMonitor(createMonitorRecord({ id: "m1", opcode: "data_variable", value: 1 }));
    kit.frames(1);
    kit.frames(1);
    expect(updates).toEqual([1]);
    kit.runtime.requestUpdateMonitor({ id: "m1", value: 1, spriteName: null });
    kit.frames(1);
    expect(updates).toEqual([1]);
    kit.runtime.requestUpdateMonitor({ id: "m1", value: 2 });
    kit.frames(1);
    expect(updates).toEqual([1, 1]);
    expect(kit.runtime.getMonitorState().get("m1")?.value).toBe(2);
    expect(kit.runtime.requestHideMonitor("m1")).toBe(true);
    expect(kit.runtime.requestShowMonitor("tidak-ada")).toBe(false);
    kit.runtime.requestRemoveMonitor("m1");
    kit.frames(1);
    expect(updates).toEqual([1, 1, 0]);
  });

  it("checkbox flyout membuat monitor dan thread monitor memperbarui nilainya", () => {
    const kit = makeKit();
    const sprite = kit.addSprite("Kody");
    kit.runtime.setEditingTarget(sprite);
    kit.stage.createVariable("v1", "skor", "");
    const v = kit.stage.variables.v1;
    if (v) v.value = 7;
    kit.runtime.monitorBlocks.createBlock({
      id: "v1",
      opcode: "data_variable",
      next: null,
      parent: null,
      inputs: {},
      fields: { VARIABLE: { name: "VARIABLE", value: "skor", id: "v1" } },
      shadow: false,
      topLevel: true,
    });
    kit.runtime.monitorBlocks.changeBlock({ id: "v1", element: "checkbox", value: true });
    kit.frames(1);
    const m = kit.runtime.getMonitorState().get("v1");
    expect(m?.visible).toBe(true);
    expect(m?.value).toBe(7);
    expect(m?.targetId).toBeNull();
    kit.runtime.monitorBlocks.changeBlock({ id: "v1", element: "checkbox", value: false });
    expect(kit.runtime.getMonitorState().get("v1")?.visible).toBe(false);
  });
});

describe("ekstensi", () => {
  it("opcode diberi prefix id, hat edge default true, event tanpa primitive", () => {
    const kit = makeKit();
    const module: ExtensionModule = {
      getInfo: () => ({
        id: "demo",
        name: "Demo",
        color1: "#000",
        color2: "#000",
        color3: "#000",
        blocks: [
          { opcode: "say", blockType: "command", text: "katakan [X]", arguments: { X: { type: "string" } } },
          { opcode: "when", blockType: "hat", text: "ketika" },
          { opcode: "evt", blockType: "event", text: "event", isEdgeActivated: false },
          "---",
        ],
      }),
      getPrimitives: () => ({
        say: (args) => {
          kit.log.push(`demo:${String(args.X)}`);
        },
        when: () => true,
        evt: () => true,
      }),
    };
    const added: string[] = [];
    kit.runtime.on("EXTENSION_ADDED", (e) => added.push(e.info.id));
    kit.runtime.registerExtension(module);
    expect(added).toEqual(["demo"]);
    expect(kit.runtime.isExtensionLoaded("demo")).toBe(true);
    expect(kit.runtime.getOpcodeFunction("demo_say")).toBeTypeOf("function");
    expect(kit.runtime.getIsEdgeActivatedHat("demo_when")).toBe(true);
    expect(kit.runtime.getIsHat("demo_evt")).toBe(true);
    expect(kit.runtime.getIsEdgeActivatedHat("demo_evt")).toBe(false);
    expect(kit.runtime.getOpcodeFunction("demo_evt")).toBeUndefined();
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [flag, { opcode: "demo_say", inputs: { X: "hai" } }]);
    kit.runtime.greenFlag();
    kit.frames(1);
    expect(kit.log).toEqual(["demo:hai"]);
  });

  it("ExtensionInfo tidak valid ditolak", () => {
    const kit = makeKit();
    expect(() =>
      kit.runtime.registerExtension({
        getInfo: () => ({ id: "1bad", name: "x", color1: "", color2: "", color3: "", blocks: [] }),
        getPrimitives: () => ({}),
      }),
    ).toThrow(/tidak valid/);
  });
});
