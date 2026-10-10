import { describe, expect, it, vi } from "vitest";
import { extensionBlockOpcode, extensionMenuOpcode, validateExtensionInfo } from "../extension-manager";
import { getMonitorIdForBlockWithArgs } from "../monitors";
import { createVariable } from "../variable";
import { TypedEmitter } from "./event-emitter";
import { MathUtil } from "./math-util";
import { NotImplementedError, notImplemented } from "./not-implemented";
import { Timer } from "./timer";

describe("TypedEmitter", () => {
  type M = { a: number; b: void };
  it("on/off/once", () => {
    const e = new TypedEmitter<M>();
    const fn = vi.fn();
    const off = e.on("a", fn);
    e.once("a", fn);
    e.emit("a", 1);
    e.emit("a", 2);
    off();
    e.emit("a", 3);
    expect(fn.mock.calls).toEqual([[1], [1], [2]]);
    expect(e.listenerCount("a")).toBe(0);
  });
  it("listener yang error tidak menghentikan listener lain", () => {
    const e = new TypedEmitter<M>();
    const ok = vi.fn();
    e.on("b", () => {
      throw new Error("x");
    });
    e.on("b", ok);
    expect(() => e.emit("b", undefined)).toThrow("x");
    expect(ok).toHaveBeenCalledOnce();
  });
});

describe("helper engine", () => {
  it("penamaan opcode ekstensi", () => {
    expect(extensionBlockOpcode("pen", "penDown")).toBe("pen_penDown");
    expect(extensionMenuOpcode("music", "DRUM")).toBe("music_menu_DRUM");
  });

  it("validateExtensionInfo menangkap argumen & menu yang hilang", () => {
    const problems = validateExtensionInfo({
      id: "demo",
      name: "Demo",
      color1: "#000",
      color2: "#000",
      color3: "#000",
      blocks: [
        { opcode: "a", blockType: "command", text: "set [X] to [Y]", arguments: { X: { type: "number", menu: "m" } } },
        "---",
        { opcode: "a", blockType: "reporter", text: "a" },
      ],
    });
    expect(problems).toEqual([
      "a: argumen [Y] tidak dideklarasikan",
      'a.X: menu "m" tidak ada',
      "opcode ganda: a",
    ]);
  });

  it("id monitor dengan field (sensing_current) di-lowercase", () => {
    expect(getMonitorIdForBlockWithArgs("current", { CURRENTMENU: { name: "CURRENTMENU", value: "YEAR" } })).toBe(
      "current_year",
    );
  });

  it("createVariable mengikuti default scratch-vm", () => {
    expect(createVariable("v", "skor", "").value).toBe(0);
    expect(createVariable("l", "daftar", "list").value).toEqual([]);
    expect(createVariable("b", "pesan1", "broadcast_msg").value).toBe("pesan1");
    expect(createVariable("l", "daftar", "list", true).isCloud).toBe(false);
  });

  it("MathUtil.wrapClamp seperti scratch-vm", () => {
    expect(MathUtil.wrapClamp(181, -179, 180)).toBe(-179);
    expect(MathUtil.wrapClamp(-180, -179, 180)).toBe(180);
    expect(MathUtil.wrapClamp(90, -179, 180)).toBe(90);
  });

  it("Timer memakai sumber waktu yang diberikan", () => {
    let t = 1000;
    const timer = new Timer({ now: () => t });
    timer.start();
    t = 1250;
    expect(timer.timeElapsed()).toBe(250);
  });

  it("notImplemented melempar NotImplementedError", () => {
    expect(() => notImplemented("x")).toThrow(NotImplementedError);
  });
});
