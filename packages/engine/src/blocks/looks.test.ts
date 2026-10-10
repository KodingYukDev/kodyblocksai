import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CORE_OPCODES } from "../opcodes";
import type { IThread } from "../types/runtime";
import { clampEffect, createLooksBlocks, formatBubbleText, LOOKS_STATE_KEY, type BubbleState } from "./looks";
import { call, createFakeRenderer, createFakeRuntime, createFakeUtil, FakeTarget } from "./motion-looks.fixtures";

function setup(opts: { random?: () => number; withRenderer?: boolean; bubbleSize?: [number, number] } = {}) {
  const sprite = new FakeTarget("Sprite1", false, [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "2" }]);
  const stage = new FakeTarget("Stage", true, [{ name: "bd1" }, { name: "bd2" }, { name: "bd3" }]);
  const fr = createFakeRenderer(opts.bubbleSize);
  const rt = createFakeRuntime({
    targets: [stage, sprite],
    random: opts.random,
    renderer: opts.withRenderer === false ? null : fr.renderer,
  });
  const pkg = createLooksBlocks(rt.runtime);
  const prims = pkg.getPrimitives();
  const u = createFakeUtil(rt.runtime, sprite);
  return { sprite, stage, fr, ...rt, pkg, prims, ...u };
}

const bubble = (t: FakeTarget) => t.getCustomState<BubbleState>(LOOKS_STATE_KEY);

describe("looks: katalog", () => {
  it("mendaftarkan semua opcode looks milik looks.ts dan tidak lebih", () => {
    const { prims } = setup();
    const expected = CORE_OPCODES.filter((o) => o.owner.endsWith("engine/src/blocks/looks.ts") && o.vmPrimitive)
      .map((o) => o.opcode)
      .sort();
    expect(Object.keys(prims).sort()).toEqual(expected);
  });

  it("getMonitored id persis scratch-vm", () => {
    const { pkg } = setup();
    const m = pkg.getMonitored?.() ?? {};
    const fields = { NUMBER_NAME: { name: "NUMBER_NAME", value: "number" } };
    expect(m.looks_size?.getId?.("T", {})).toBe("T_size");
    expect(m.looks_costumenumbername?.getId?.("T", fields)).toBe("T_costumenumbername_number");
    expect(m.looks_backdropnumbername?.getId?.(null, fields)).toBe("backdropnumbername_number");
    expect(m.looks_backdropnumbername?.isSpriteSpecific).toBeUndefined();
  });

  it("blok lama no-op", () => {
    const { prims, util, sprite } = setup();
    for (const op of ["looks_hideallsprites", "looks_changestretchby", "looks_setstretchto"]) {
      expect(call(prims, op, { CHANGE: 10 }, util)).toBeUndefined();
    }
    expect(sprite.size).toBe(100);
  });
});

describe("formatBubbleText & clampEffect", () => {
  it("bilangan non-bulat 2 desimal, kecil/bulat apa adanya, string tidak diubah", () => {
    expect(formatBubbleText(1 / 3)).toBe("0.33");
    expect(formatBubbleText(-2.005)).toBe((-2.005).toFixed(2));
    expect(formatBubbleText(0.005)).toBe("0.005");
    expect(formatBubbleText(5)).toBe("5");
    expect(formatBubbleText("1.23456")).toBe("1.23456");
    expect(formatBubbleText(true)).toBe("true");
    expect(formatBubbleText("")).toBe("");
    expect(formatBubbleText("x".repeat(400))).toHaveLength(330);
  });

  it("clamp ghost & brightness, efek lain bebas", () => {
    expect(clampEffect("ghost", 150)).toBe(100);
    expect(clampEffect("ghost", -5)).toBe(0);
    expect(clampEffect("brightness", -500)).toBe(-100);
    expect(clampEffect("brightness", Infinity)).toBe(100);
    expect(clampEffect("color", 1000)).toBe(1000);
    expect(clampEffect("whirl", -1000)).toBe(-1000);
  });
});

describe("say / think", () => {
  it("say membuat balon, emit SAY, posisi kanan sprite", () => {
    const { prims, util, sprite, fr, runtime } = setup();
    const said: string[] = [];
    runtime.on("SAY", ({ type, text }) => said.push(`${type}:${text}`));
    sprite.bubbleBounds = { left: -20, right: 20, top: 30, bottom: -30 };
    call(prims, "looks_say", { MESSAGE: 2.5 }, util);
    // Event SAY membawa nilai mentah (scratch-vm); balon memakai teks terformat.
    expect(said).toEqual(["say:2.5"]);
    expect(bubble(sprite)?.text).toBe("2.50");
    expect(fr.mock.createTextSkin).toHaveBeenCalledWith("say", "2.50", true);
    expect(fr.mock.updateDrawablePosition).toHaveBeenLastCalledWith(1, [20, 20]);
  });

  it("say kedua memperbarui skin yang sama; teks kosong menghapus balon", () => {
    const { prims, util, sprite, fr } = setup();
    call(prims, "looks_say", { MESSAGE: "hai" }, util);
    call(prims, "looks_think", { MESSAGE: "hmm" }, util);
    expect(fr.mock.createTextSkin).toHaveBeenCalledTimes(1);
    expect(fr.mock.updateTextSkin).toHaveBeenCalledWith(2, "think", "hmm", true);
    call(prims, "looks_say", { MESSAGE: "" }, util);
    expect(fr.mock.destroyDrawable).toHaveBeenCalledWith(1, "sprite");
    expect(fr.mock.destroySkin).toHaveBeenCalledWith(2);
    expect(bubble(sprite)?.drawableId).toBeNull();
    expect(sprite.listeners.size).toBe(0);
  });

  it("balon pindah ke kiri bila tidak muat di kanan, dan dibatasi tepi panggung", () => {
    const { prims, util, sprite, fr } = setup({ bubbleSize: [100, 50] });
    sprite.bubbleBounds = { left: 180, right: 200, top: 170, bottom: 150 };
    call(prims, "looks_say", { MESSAGE: "x" }, util);
    expect(bubble(sprite)?.onSpriteRight).toBe(false);
    expect(fr.mock.updateTextSkin).toHaveBeenCalledWith(2, "say", "x", false);
    // x = min(240-100, max(-240, 180-100)) = 80; y = min(180, 150+50) = 180
    expect(fr.mock.updateDrawablePosition).toHaveBeenLastCalledWith(1, [80, 180]);
  });

  it("balon mengikuti sprite yang bergerak (EVENT_TARGET_VISUAL_CHANGE)", () => {
    const { prims, util, sprite, fr } = setup();
    call(prims, "looks_say", { MESSAGE: "x" }, util);
    sprite.setXY(10, 20);
    // tanpa bounds balon -> posisi x/y target
    expect(fr.mock.updateDrawablePosition).toHaveBeenLastCalledWith(1, [10, 70]);
  });

  it("hide menghapus drawable balon, show memunculkan lagi teks yang masih tersimpan", () => {
    const { prims, util, sprite, fr } = setup();
    call(prims, "looks_say", { MESSAGE: "x" }, util);
    call(prims, "looks_hide", {}, util);
    expect(sprite.visible).toBe(false);
    expect(fr.mock.destroyDrawable).toHaveBeenCalledTimes(1);
    call(prims, "looks_show", {}, util);
    expect(sprite.visible).toBe(true);
    // teks masih "x" -> balon dibuat ulang seperti scratch-vm
    expect(fr.mock.createTextSkin).toHaveBeenCalledTimes(2);
  });

  it("tanpa renderer: state tetap diperbarui tanpa error", () => {
    const { prims, util, sprite } = setup({ withRenderer: false });
    call(prims, "looks_say", { MESSAGE: "hai" }, util);
    expect(bubble(sprite)?.text).toBe("hai");
  });

  it("stop all mengosongkan semua balon", () => {
    const { prims, util, sprite, fr, runtime } = setup();
    call(prims, "looks_say", { MESSAGE: "x" }, util);
    runtime.emit("PROJECT_STOP_ALL", undefined);
    expect(bubble(sprite)?.text).toBe("");
    expect(fr.mock.destroySkin).toHaveBeenCalledTimes(1);
  });

  it("target dihapus -> balon dihancurkan", () => {
    const { prims, util, sprite, fr, runtime } = setup();
    call(prims, "looks_say", { MESSAGE: "x" }, util);
    runtime.emit("TARGET_WAS_REMOVED", { target: sprite.asTarget() });
    expect(fr.mock.destroyDrawable).toHaveBeenCalledTimes(1);
  });
});

describe("sayforsecs / thinkforsecs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("menghapus balon setelah SECS lalu resolve", async () => {
    const { prims, util, sprite } = setup();
    const p = call(prims, "looks_sayforsecs", { MESSAGE: "hi", SECS: "2" }, util) as Promise<void>;
    expect(bubble(sprite)?.text).toBe("hi");
    vi.advanceTimersByTime(1999);
    expect(bubble(sprite)?.text).toBe("hi");
    vi.advanceTimersByTime(1);
    await p;
    expect(bubble(sprite)?.text).toBe("");
    expect(bubble(sprite)?.type).toBe("say");
  });

  it("tidak menghapus balon yang sudah diganti blok lain", async () => {
    const { prims, util, sprite } = setup();
    const p = call(prims, "looks_thinkforsecs", { MESSAGE: "a", SECS: 1 }, util) as Promise<void>;
    call(prims, "looks_say", { MESSAGE: "b" }, util);
    vi.advanceTimersByTime(1000);
    await p;
    expect(bubble(sprite)?.text).toBe("b");
  });

  it("SECS bukan angka -> segera", async () => {
    const { prims, util, sprite } = setup();
    const p = call(prims, "looks_thinkforsecs", { MESSAGE: "a", SECS: "abc" }, util) as Promise<void>;
    expect(bubble(sprite)?.type).toBe("think");
    vi.advanceTimersByTime(1);
    await p;
    expect(bubble(sprite)?.text).toBe("");
  });
});

describe("switchcostumeto / nextcostume", () => {
  it("nama dulu, lalu angka teks, angka asli = indeks 1-based", () => {
    const { prims, util, sprite } = setup();
    call(prims, "looks_switchcostumeto", { COSTUME: "b" }, util);
    expect(sprite.currentCostume).toBe(1);
    // nama "2" menang atas indeks 2
    call(prims, "looks_switchcostumeto", { COSTUME: "2" }, util);
    expect(sprite.currentCostume).toBe(3);
    call(prims, "looks_switchcostumeto", { COSTUME: 2 }, util);
    expect(sprite.currentCostume).toBe(1);
    call(prims, "looks_switchcostumeto", { COSTUME: "3" }, util);
    expect(sprite.currentCostume).toBe(2);
  });

  it("next/previous costume, wrap, spasi diabaikan, teks tak dikenal diabaikan", () => {
    const { prims, util, sprite } = setup();
    call(prims, "looks_switchcostumeto", { COSTUME: "previous costume" }, util);
    expect(sprite.currentCostume).toBe(3);
    call(prims, "looks_switchcostumeto", { COSTUME: "next costume" }, util);
    expect(sprite.currentCostume).toBe(0);
    call(prims, "looks_switchcostumeto", { COSTUME: "   " }, util);
    call(prims, "looks_switchcostumeto", { COSTUME: "zzz" }, util);
    expect(sprite.currentCostume).toBe(0);
    call(prims, "looks_switchcostumeto", { COSTUME: 0 }, util);
    expect(sprite.currentCostume).toBe(3); // 0 -> indeks -1 -> wrap ke terakhir
    call(prims, "looks_switchcostumeto", { COSTUME: 1.6 }, util);
    expect(sprite.calls).toContain("costume:0.6000000000000001");
    expect(sprite.currentCostume).toBe(1);
  });

  it("boolean true -> Number(true)-1 = 0; '' tidak berubah", () => {
    const { prims, util, sprite } = setup();
    sprite.currentCostume = 2;
    call(prims, "looks_switchcostumeto", { COSTUME: "" }, util);
    expect(sprite.currentCostume).toBe(2);
    call(prims, "looks_switchcostumeto", { COSTUME: true }, util);
    expect(sprite.currentCostume).toBe(0);
    call(prims, "looks_switchcostumeto", { COSTUME: "0x2" }, util);
    expect(sprite.currentCostume).toBe(1);
  });

  it("nextcostume wrap ke awal", () => {
    const { prims, util, sprite } = setup();
    sprite.currentCostume = 3;
    call(prims, "looks_nextcostume", {}, util);
    expect(sprite.currentCostume).toBe(0);
  });

  it("switchcostumeto tidak memicu hat", () => {
    const { prims, util, startHats } = setup();
    call(prims, "looks_switchcostumeto", { COSTUME: "b" }, util);
    expect(startHats).not.toHaveBeenCalled();
  });
});

describe("backdrop", () => {
  it("switchbackdropto memicu event_whenbackdropswitchesto dengan nama baru", () => {
    const { prims, util, stage, startHats } = setup();
    call(prims, "looks_switchbackdropto", { BACKDROP: "bd3" }, util);
    expect(stage.currentCostume).toBe(2);
    expect(startHats).toHaveBeenLastCalledWith("event_whenbackdropswitchesto", { BACKDROP: "bd3" });
    call(prims, "looks_switchbackdropto", { BACKDROP: "next backdrop" }, util);
    expect(stage.currentCostume).toBe(0);
    call(prims, "looks_switchbackdropto", { BACKDROP: "previous backdrop" }, util);
    expect(stage.currentCostume).toBe(2);
    // backdrop tidak dikenal: tetap memicu hat dengan nama sekarang
    call(prims, "looks_switchbackdropto", { BACKDROP: "nope" }, util);
    expect(startHats).toHaveBeenLastCalledWith("event_whenbackdropswitchesto", { BACKDROP: "bd3" });
  });

  it("random backdrop tidak pernah memilih yang sedang aktif", () => {
    const seq = [0, 0.99, 0.5];
    const { prims, util, stage } = setup({ random: () => seq.shift() ?? 0 });
    stage.currentCostume = 0;
    call(prims, "looks_switchbackdropto", { BACKDROP: "random backdrop" }, util);
    expect(stage.currentCostume).toBe(1); // floor(0*2)=0 >= 0 -> 1
    call(prims, "looks_switchbackdropto", { BACKDROP: "random backdrop" }, util);
    expect(stage.currentCostume).toBe(2); // floor(.99*2)=1 >= 1 -> 2
    call(prims, "looks_switchbackdropto", { BACKDROP: "random backdrop" }, util);
    expect(stage.currentCostume).toBe(1); // floor(.5*2)=1 < 2 -> 1
  });

  it("random backdrop dengan satu backdrop tidak berubah", () => {
    const { prims, util, stage } = setup();
    stage.costumes = [{ name: "only" }];
    call(prims, "looks_switchbackdropto", { BACKDROP: "random backdrop" }, util);
    expect(stage.currentCostume).toBe(0);
  });

  it("nextbackdrop & angka", () => {
    const { prims, util, stage } = setup();
    call(prims, "looks_nextbackdrop", {}, util);
    expect(stage.currentCostume).toBe(1);
    call(prims, "looks_switchbackdropto", { BACKDROP: 3 }, util);
    expect(stage.currentCostume).toBe(2);
  });

  it("switchbackdroptoandwait menunggu thread yang dipicu", () => {
    const { prims, util, startHats, threads, waiting, yields } = setup();
    const t1 = { id: "t1" } as unknown as IThread;
    startHats.mockReturnValueOnce([t1]);
    threads.push(t1);
    call(prims, "looks_switchbackdroptoandwait", { BACKDROP: "bd2" }, util);
    expect(yields.yield).toBe(1);
    waiting.add(t1);
    call(prims, "looks_switchbackdroptoandwait", { BACKDROP: "bd2" }, util);
    expect(yields.yieldTick).toBe(1);
    expect(startHats).toHaveBeenCalledTimes(1);
    threads.length = 0;
    call(prims, "looks_switchbackdroptoandwait", { BACKDROP: "bd2" }, util);
    expect(yields).toEqual({ yield: 1, yieldTick: 1 });
  });

  it("switchbackdroptoandwait tanpa thread selesai langsung", () => {
    const { prims, util, yields, stage } = setup();
    call(prims, "looks_switchbackdroptoandwait", { BACKDROP: "bd2" }, util);
    expect(stage.currentCostume).toBe(1);
    expect(yields).toEqual({ yield: 0, yieldTick: 0 });
  });

  it("backdropnumbername & costumenumbername", () => {
    const { prims, util, stage, sprite } = setup();
    stage.currentCostume = 1;
    sprite.currentCostume = 2;
    expect(call(prims, "looks_backdropnumbername", { NUMBER_NAME: "number" }, util)).toBe(2);
    expect(call(prims, "looks_backdropnumbername", { NUMBER_NAME: "name" }, util)).toBe("bd2");
    expect(call(prims, "looks_costumenumbername", { NUMBER_NAME: "number" }, util)).toBe(3);
    expect(call(prims, "looks_costumenumbername", { NUMBER_NAME: "name" }, util)).toBe("c");
  });
});

describe("efek grafis", () => {
  it("changeeffectby: nama case-insensitive, clamp, efek tak dikenal diabaikan", () => {
    const { prims, util, sprite } = setup();
    call(prims, "looks_changeeffectby", { EFFECT: "GHOST", CHANGE: 70 }, util);
    call(prims, "looks_changeeffectby", { EFFECT: "ghost", CHANGE: "50" }, util);
    expect(sprite.effects.ghost).toBe(100);
    call(prims, "looks_changeeffectby", { EFFECT: "brightness", CHANGE: -150 }, util);
    expect(sprite.effects.brightness).toBe(-100);
    call(prims, "looks_changeeffectby", { EFFECT: "color", CHANGE: 500 }, util);
    expect(sprite.effects.color).toBe(500);
    call(prims, "looks_changeeffectby", { EFFECT: "toString", CHANGE: 5 }, util);
    expect(Object.keys(sprite.effects)).toHaveLength(7);
  });

  it("seteffectto & cleargraphiceffects", () => {
    const { prims, util, sprite } = setup();
    call(prims, "looks_seteffectto", { EFFECT: "ghost", VALUE: -20 }, util);
    expect(sprite.effects.ghost).toBe(0);
    call(prims, "looks_seteffectto", { EFFECT: "Fisheye", VALUE: "abc" }, util);
    expect(sprite.effects.fisheye).toBe(0);
    call(prims, "looks_seteffectto", { EFFECT: "whirl", VALUE: 720 }, util);
    expect(sprite.effects.whirl).toBe(720);
    call(prims, "looks_cleargraphiceffects", {}, util);
    expect(sprite.effects.whirl).toBe(0);
  });
});

describe("ukuran & layer", () => {
  it("changesizeby / setsizeto / size (dibulatkan)", () => {
    const { prims, util, sprite } = setup();
    call(prims, "looks_changesizeby", { CHANGE: "10.4" }, util);
    expect(sprite.size).toBeCloseTo(110.4, 10);
    expect(call(prims, "looks_size", {}, util)).toBe(110);
    call(prims, "looks_setsizeto", { SIZE: "x" }, util);
    expect(sprite.size).toBe(0);
    sprite.size = 2.5;
    expect(call(prims, "looks_size", {}, util)).toBe(3);
  });

  it("gotofrontback & goforwardbackwardlayers; stage diabaikan", () => {
    const { prims, util, sprite, stage, runtime } = setup();
    call(prims, "looks_gotofrontback", { FRONT_BACK: "front" }, util);
    call(prims, "looks_gotofrontback", { FRONT_BACK: "back" }, util);
    call(prims, "looks_gotofrontback", { FRONT_BACK: "FRONT" }, util);
    call(prims, "looks_goforwardbackwardlayers", { FORWARD_BACKWARD: "forward", NUM: "2" }, util);
    call(prims, "looks_goforwardbackwardlayers", { FORWARD_BACKWARD: "backward", NUM: "a" }, util);
    expect(sprite.calls).toEqual(["front", "back", "back", "forward:2", "backward:0"]);
    const su = createFakeUtil(runtime, stage);
    call(prims, "looks_gotofrontback", { FRONT_BACK: "front" }, su.util);
    call(prims, "looks_goforwardbackwardlayers", { FORWARD_BACKWARD: "forward", NUM: 1 }, su.util);
    expect(stage.calls).toEqual([]);
  });

  it("show/hide pada stage tidak mengubah visibilitas", () => {
    const { prims, runtime, stage } = setup();
    const su = createFakeUtil(runtime, stage);
    call(prims, "looks_hide", {}, su.util);
    expect(stage.visible).toBe(true);
  });
});
