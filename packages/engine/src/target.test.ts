import { describe, expect, it } from "vitest";
import { FakeRenderer } from "./testing/fake-renderer";
import { addScript, type BlockSpec } from "./testing/script-builder";
import { makeKit } from "./testing/test-kit";
import { MAX_CLONES } from "./types/runtime";

const flag: BlockSpec = { opcode: "event_whenflagclicked" };

function kitWithRenderer() {
  const renderer = new FakeRenderer();
  const kit = makeKit({ renderer });
  return { kit, renderer };
}

describe("RenderedTarget gerak & tampilan", () => {
  it("tanpa renderer: setXY tanpa fencing, tanpa requestRedraw", () => {
    const kit = makeKit();
    const s = kit.addSprite("Kody");
    kit.runtime.redrawRequested = false;
    s.setXY(1000, -1000);
    expect([s.x, s.y]).toEqual([1000, -1000]);
    expect(kit.runtime.redrawRequested).toBe(false);
    expect(s.keepInFence(5, 5)).toEqual([5, 5]);
  });

  it("fencing di 4 tepi lewat renderer (sprite 100x100 tetap tampak 15px)", () => {
    const { kit } = kitWithRenderer();
    const s = kit.addSprite("Kody", { skin: [100, 100] });
    s.setXY(1000, 0);
    expect(s.x).toBe(225 + 50);
    s.setXY(-1000, 0);
    expect(s.x).toBe(-275);
    s.setXY(0, 1000);
    expect(s.y).toBe(215);
    s.setXY(0, -1000);
    expect(s.y).toBe(-215);
    expect(kit.runtime.redrawRequested).toBe(true);
  });

  it("setXY diabaikan saat di-drag kecuali force, stage tidak bergerak", () => {
    const kit = makeKit();
    const s = kit.addSprite("Kody");
    s.startDrag();
    s.setXY(10, 10);
    expect([s.x, s.y]).toEqual([0, 0]);
    s.setXY(10, 10, true);
    expect([s.x, s.y]).toEqual([10, 10]);
    s.stopDrag();
    kit.stage.setXY(50, 50);
    expect([kit.stage.x, kit.stage.y]).toEqual([0, 0]);
  });

  it("TARGET_MOVED dikirim dengan posisi lama", () => {
    const kit = makeKit();
    const s = kit.addSprite("Kody");
    const moves: [number, number][] = [];
    s.on("TARGET_MOVED", (e) => moves.push([e.oldX, e.oldY]));
    s.setXY(3, 4);
    s.setXY(5, 6);
    expect(moves).toEqual([
      [0, 0],
      [3, 4],
    ]);
  });

  it("setDirection memakai wrapClamp(-179, 180) dan menolak non-finite", () => {
    const kit = makeKit();
    const s = kit.addSprite("Kody");
    s.setDirection(270);
    expect(s.direction).toBe(-90);
    s.setDirection(-180);
    expect(s.direction).toBe(180);
    s.setDirection(181);
    expect(s.direction).toBe(-179);
    s.setDirection(Infinity);
    expect(s.direction).toBe(-179);
    s.setDirection(NaN);
    expect(s.direction).toBe(-179);
  });

  it("rotation style menentukan arah & skala yang dirender", () => {
    const kit = makeKit();
    const s = kit.addSprite("Kody");
    s.setDirection(-90);
    s.setRotationStyle("left-right");
    expect(s._getRenderedDirectionAndScale()).toEqual({ direction: 90, scale: [-100, 100] });
    s.setRotationStyle("don't rotate");
    expect(s._getRenderedDirectionAndScale()).toEqual({ direction: 90, scale: [100, 100] });
    s.setRotationStyle("ngawur");
    expect(s.rotationStyle).toBe("don't rotate");
    s.setRotationStyle("all around");
    expect(s._getRenderedDirectionAndScale()).toEqual({ direction: -90, scale: [100, 100] });
  });

  it("setSize dibatasi ukuran costume (min 5px, maks 1.5x panggung)", () => {
    const { kit } = kitWithRenderer();
    const s = kit.addSprite("Kody", { skin: [100, 50] });
    s.setSize(10000);
    expect(s.size).toBe(Math.min((1.5 * 480) / 100, (1.5 * 360) / 50) * 100);
    s.setSize(0);
    expect(s.size).toBe(10);
    s.setSize(50);
    expect(s.size).toBe(50);
    const noRenderer = makeKit().addSprite("X");
    noRenderer.setSize(5000);
    expect(noRenderer.size).toBe(100);
  });

  it("setCostume membulatkan dan wrap; NaN/Infinity -> 0", () => {
    const kit = makeKit();
    const s = kit.addSprite("Kody");
    s.setCostume(1.6);
    expect(s.currentCostume).toBe(0);
    s.setCostume(3);
    expect(s.currentCostume).toBe(1);
    s.setCostume(-1);
    expect(s.currentCostume).toBe(1);
    s.setCostume(NaN);
    expect(s.currentCostume).toBe(0);
    expect(s.getCostumeIndexByName("Kody-c2")).toBe(1);
    expect(s.getCostumeIndexByName("tidak")).toBe(-1);
  });

  it("efek: hanya nama yang dikenal; clearEffects saat green flag", () => {
    const { kit, renderer } = kitWithRenderer();
    const s = kit.addSprite("Kody");
    s.setEffect("ghost", 50);
    s.setEffect("tidakada" as "ghost", 10);
    expect(s.effects.ghost).toBe(50);
    expect(renderer.drawables.get(s.drawableId)?.effects.ghost).toBe(50);
    kit.runtime.greenFlag();
    expect(s.effects.ghost).toBe(0);
  });
});

describe("sentuhan", () => {
  it("tepi, sprite lain, titik mouse", () => {
    const { kit } = kitWithRenderer();
    const a = kit.addSprite("A", { skin: [40, 40] });
    const b = kit.addSprite("B", { skin: [40, 40] });
    b.setXY(30, 0);
    expect(a.isTouchingSprite("B")).toBe(true);
    expect(a.isTouchingObject("B")).toBe(true);
    b.setXY(100, 0);
    expect(a.isTouchingObject("B")).toBe(false);
    expect(a.isTouchingObject("_edge_")).toBe(false);
    a.setXY(235, 0);
    expect(a.isTouchingObject("_edge_")).toBe(true);
    kit.runtime.ioDevices.mouse.postData({ x: 360, y: 180, canvasWidth: 480, canvasHeight: 360 });
    expect(a.isTouchingObject("_mouse_")).toBe(false);
    expect(b.isTouchingObject("_mouse_")).toBe(true);
  });
});

describe("layer", () => {
  it("goToFront/goBack/goBackwardLayers menjaga urutan drawable dan executableTargets", () => {
    const { kit, renderer } = kitWithRenderer();
    const a = kit.addSprite("A");
    const b = kit.addSprite("B");
    const c = kit.addSprite("C");
    const order = () => kit.runtime.executableTargets.map((t) => t.getName());
    expect(order()).toEqual(["Stage", "A", "B", "C"]);
    a.goToFront();
    expect(order()).toEqual(["Stage", "B", "C", "A"]);
    expect(a.getLayerOrder()).toBe(3);
    a.goToBack();
    expect(order()).toEqual(["Stage", "A", "B", "C"]);
    expect(a.getLayerOrder()).toBe(1);
    c.goBackwardLayers(1);
    expect(order()).toEqual(["Stage", "A", "C", "B"]);
    c.goForwardLayers(5);
    expect(order()).toEqual(["Stage", "A", "B", "C"]);
    b.goBehindOther(a);
    expect(order()).toEqual(["Stage", "B", "A", "C"]);
    expect(renderer.drawList.map((id) => kit.runtime.getTargetByDrawableId(id)?.getName())).toEqual(order());
  });
});

describe("clone", () => {
  it("makeClone menyalin state & variabel lokal (list disalin), memicu start as clone", () => {
    const { kit } = kitWithRenderer();
    const s = kit.addSprite("Kody");
    s.createVariable("l1", "daftar", "list");
    s.createVariable("v1", "nyawa", "");
    const list = s.variables.l1;
    const life = s.variables.v1;
    if (!list || !life) throw new Error("var");
    list.value = ["a"];
    life.value = 3;
    s.setXY(10, 20);
    s.setDirection(45);
    s.setEffect("color", 25);
    addScript(s.blocks, [{ opcode: "control_start_as_clone" }, { opcode: "test_log", inputs: { TEXT: "clone!" } }]);
    const clone = s.makeClone();
    if (!clone) throw new Error("clone");
    expect(clone.isOriginal).toBe(false);
    expect([clone.x, clone.y, clone.direction, clone.effects.color]).toEqual([10, 20, 45, 25]);
    expect(clone.variables.l1?.value).toEqual(["a"]);
    expect(clone.variables.l1?.value).not.toBe(list.value);
    expect(clone.variables.v1?.value).toBe(3);
    expect(clone.sprite).toBe(s.sprite);
    expect(s.sprite.clones).toHaveLength(2);
    kit.runtime.addTarget(clone);
    kit.frames(1);
    expect(kit.log).toEqual(["clone!"]);
  });

  it("clone baru tepat di belakang induknya (urutan layer)", () => {
    const { kit } = kitWithRenderer();
    const a = kit.addSprite("A");
    kit.addSprite("B");
    addScript(a.blocks, [flag, { opcode: "control_create_clone_of" }]);
    kit.runtime.greenFlag();
    kit.frames(1);
    const names = kit.runtime.executableTargets.map((t) => `${t.getName()}${t.isOriginal ? "" : "*"}`);
    expect(names).toEqual(["Stage", "A*", "A", "B"]);
  });

  it("batas 300 clone dan delete this clone", () => {
    const kit = makeKit();
    const s = kit.addSprite("Kody");
    let made = 0;
    for (let i = 0; i < MAX_CLONES + 5; i++) {
      const c = s.makeClone();
      if (c) {
        kit.runtime.addTarget(c);
        made++;
      }
    }
    expect(made).toBe(MAX_CLONES);
    expect(kit.runtime.clonesAvailable()).toBe(false);
    expect(kit.stage.makeClone()).toBeNull();
    const removed: string[] = [];
    kit.runtime.on("TARGET_WAS_REMOVED", (e) => removed.push(e.target.id));
    kit.runtime.stopAll();
    expect(removed).toHaveLength(MAX_CLONES);
    expect(kit.runtime.clonesAvailable()).toBe(true);
    expect(s.sprite.clones).toHaveLength(1);
  });
});

describe("variabel", () => {
  it("lookup lokal dulu lalu stage; buat bila tidak ada", () => {
    const kit = makeKit();
    const s = kit.addSprite("Kody");
    kit.stage.createVariable("g1", "skor", "");
    s.createVariable("l1", "skor", "");
    expect(s.lookupVariableById("g1")?.name).toBe("skor");
    expect(s.lookupVariableByNameAndType("skor", "")?.id).toBe("l1");
    expect(s.lookupVariableByNameAndType("skor", "", true)?.id).toBe("l1");
    expect(kit.stage.lookupVariableById("l1")).toBeUndefined();
    const created = s.lookupOrCreateVariable("baru", "x");
    expect(created).toMatchObject({ id: "baru", name: "x", value: 0, type: "" });
    const list = s.lookupOrCreateList("lst", "daftar");
    expect(list.value).toEqual([]);
    expect(s.getAllVariableNamesInScopeByType("")).toEqual(["skor", "x", "skor"]);
  });

  it("broadcast dicari case-insensitive; rename & delete variabel", () => {
    const kit = makeKit();
    kit.stage.createVariable("b1", "Pesan1", "broadcast_msg");
    expect(kit.stage.lookupBroadcastMsg("", "pesan1")?.id).toBe("b1");
    expect(kit.stage.lookupBroadcastMsg("b1", "x")?.id).toBe("b1");
    kit.stage.createVariable("g1", "skor", "");
    kit.stage.renameVariable("g1", "poin");
    expect(kit.stage.variables.g1?.name).toBe("poin");
    kit.stage.deleteVariable("g1");
    expect(kit.stage.variables.g1).toBeUndefined();
  });

  it("toState tidak menyertakan data runtime (skinId/asset) dan menyimpan extensionState", () => {
    const kit = makeKit();
    const s = kit.addSprite("Kody");
    s.setCustomState("Scratch.pen", { down: true });
    const state = s.toState();
    expect(state.name).toBe("Kody");
    expect(state.costumes[0]).not.toHaveProperty("skinId");
    expect(state.extensionState).toEqual({ "Scratch.pen": { down: true } });
    expect(kit.stage.toState()).toMatchObject({ isStage: true, tempo: 60, videoState: "on" });
  });
});
