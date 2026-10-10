import { describe, expect, it } from "vitest";
import { FakeRenderer } from "../testing/fake-renderer";
import { addScript } from "../testing/script-builder";
import { makeKit } from "../testing/test-kit";
import { keyArgToScratchKey, keyStringToScratchKey } from "./keyboard";

describe("Keyboard", () => {
  it("pemetaan event.key -> nama Scratch", () => {
    expect(keyStringToScratchKey(" ")).toBe("space");
    expect(keyStringToScratchKey("ArrowLeft")).toBe("left arrow");
    expect(keyStringToScratchKey("Up")).toBe("up arrow");
    expect(keyStringToScratchKey("Enter")).toBe("enter");
    expect(keyStringToScratchKey("a")).toBe("A");
    expect(keyStringToScratchKey("Shift")).toBe("");
    expect(keyStringToScratchKey("1")).toBe("1");
  });

  it("pemetaan argumen blok (nama, huruf, kode)", () => {
    expect(keyArgToScratchKey("space")).toBe("space");
    expect(keyArgToScratchKey("left arrow")).toBe("left arrow");
    expect(keyArgToScratchKey("abc")).toBe("A");
    expect(keyArgToScratchKey(" ")).toBe("space");
    expect(keyArgToScratchKey(65)).toBe("A");
    expect(keyArgToScratchKey(48)).toBe("0");
    expect(keyArgToScratchKey(32)).toBe("space");
    expect(keyArgToScratchKey(37)).toBe("left arrow");
    expect(keyArgToScratchKey(40)).toBe("down arrow");
    expect(keyArgToScratchKey(13)).toBe("1");
  });

  it("status tombol & 'any', serta memicu hat tombol + any", () => {
    const kit = makeKit();
    const kb = kit.runtime.ioDevices.keyboard;
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [{ opcode: "event_whenkeypressed", fields: { KEY_OPTION: "a" } }, { opcode: "test_log", inputs: { TEXT: "a" } }]);
    addScript(sprite.blocks, [{ opcode: "event_whenkeypressed", fields: { KEY_OPTION: "any" } }, { opcode: "test_log", inputs: { TEXT: "any" } }]);
    expect(kb.getKeyIsDown("any")).toBe(false);
    kb.postData({ key: "a", isDown: true });
    expect(kb.getKeyIsDown("a")).toBe(true);
    expect(kb.getKeyIsDown(65)).toBe(true);
    expect(kb.getKeyIsDown("any")).toBe(true);
    kit.frames(1);
    expect(kit.log).toEqual(["a", "any"]);
    kb.postData({ key: "a", isDown: false });
    expect(kb.getKeyIsDown("any")).toBe(false);
    kb.postData({ key: "Shift", isDown: true });
    expect(kb.getKeyIsDown("any")).toBe(false);
  });
});

describe("Mouse", () => {
  it("koordinat Scratch dibulatkan & di-clamp; 0 diabaikan", () => {
    const kit = makeKit();
    const m = kit.runtime.ioDevices.mouse;
    m.postData({ x: 120, y: 90, canvasWidth: 480, canvasHeight: 360 });
    expect([m.getScratchX(), m.getScratchY()]).toEqual([-120, 90]);
    m.postData({ x: 1000, y: 1000, canvasWidth: 480, canvasHeight: 360 });
    expect([m.getScratchX(), m.getScratchY()]).toEqual([240, -180]);
    m.postData({ x: 0.7, y: 359.3, canvasWidth: 480, canvasHeight: 360 });
    expect([m.getScratchX(), m.getScratchY()]).toEqual([-239, -179]);
    m.postData({ x: 0, y: 0, canvasWidth: 480, canvasHeight: 360 });
    expect([m.getScratchX(), m.getScratchY()]).toEqual([-239, -179]);
    expect(m.getClientX()).toBe(0.7);
    // Kanvas 2x lebih besar: skala tetap 480x360.
    m.postData({ x: 720, y: 180, canvasWidth: 960, canvasHeight: 720 });
    expect([m.getScratchX(), m.getScratchY()]).toEqual([120, 90]);
  });

  it("klik memicu hat sprite (mouse down) atau stage; sprite draggable saat mouse up", () => {
    const renderer = new FakeRenderer();
    const kit = makeKit({ renderer });
    const s = kit.addSprite("Kody", { skin: [100, 100] });
    addScript(s.blocks, [{ opcode: "event_whenthisspriteclicked" }, { opcode: "test_log", inputs: { TEXT: "sprite" } }]);
    addScript(kit.stage.blocks, [{ opcode: "event_whenstageclicked" }, { opcode: "test_log", inputs: { TEXT: "stage" } }]);
    const m = kit.runtime.ioDevices.mouse;
    m.postData({ x: 240, y: 180, isDown: true, canvasWidth: 480, canvasHeight: 360 });
    m.postData({ x: 240, y: 180, isDown: false, canvasWidth: 480, canvasHeight: 360 });
    m.postData({ x: 10, y: 10, isDown: true, canvasWidth: 480, canvasHeight: 360 });
    m.postData({ x: 10, y: 10, isDown: false, canvasWidth: 480, canvasHeight: 360 });
    expect(m.getIsDown()).toBe(false);
    kit.frames(1);
    expect(kit.log.sort()).toEqual(["sprite", "stage"]);
    kit.log.length = 0;
    s.setDraggable(true);
    m.postData({ x: 240, y: 180, isDown: true, canvasWidth: 480, canvasHeight: 360 });
    kit.frames(1);
    expect(kit.log).toEqual([]);
    m.postData({ x: 240, y: 180, isDown: false, canvasWidth: 480, canvasHeight: 360 });
    kit.frames(1);
    expect(kit.log).toEqual(["sprite"]);
    // Akhir drag bukan klik; di luar panggung diabaikan.
    m.postData({ x: 240, y: 180, isDown: true, canvasWidth: 480, canvasHeight: 360 });
    m.postData({ x: 240, y: 180, isDown: false, wasDragged: true, canvasWidth: 480, canvasHeight: 360 });
    m.postData({ x: 500, y: 180, isDown: true, canvasWidth: 480, canvasHeight: 360 });
    kit.frames(1);
    expect(kit.log).toEqual(["sprite"]);
  });
});

describe("MouseWheel & Clock", () => {
  it("scroll memicu hat panah atas/bawah", () => {
    const kit = makeKit();
    const s = kit.addSprite("Kody");
    addScript(s.blocks, [{ opcode: "event_whenkeypressed", fields: { KEY_OPTION: "up arrow" } }, { opcode: "test_log", inputs: { TEXT: "up" } }]);
    addScript(s.blocks, [{ opcode: "event_whenkeypressed", fields: { KEY_OPTION: "down arrow" } }, { opcode: "test_log", inputs: { TEXT: "down" } }]);
    kit.runtime.ioDevices.mouseWheel.postData({ deltaY: 0 });
    kit.runtime.ioDevices.mouseWheel.postData({ deltaY: -3 });
    kit.frames(1);
    kit.runtime.ioDevices.mouseWheel.postData({ deltaY: 3 });
    kit.frames(1);
    expect(kit.log).toEqual(["up", "down"]);
  });

  it("timer project mengikuti currentMSecs (per frame), pause/resume, reset saat green flag", () => {
    const kit = makeKit();
    const clock = kit.runtime.ioDevices.clock;
    kit.time.advance(1500);
    expect(clock.projectTimer()).toBe(0); // currentMSecs belum diperbarui
    kit.runtime.step();
    expect(clock.projectTimer()).toBe(1.5);
    clock.pause();
    kit.time.advance(1000);
    kit.runtime.step();
    expect(clock.projectTimer()).toBe(1.5);
    clock.resume();
    kit.time.advance(500);
    kit.runtime.step();
    expect(clock.projectTimer()).toBe(2);
    kit.runtime.greenFlag();
    expect(clock.projectTimer()).toBe(0);
  });
});
