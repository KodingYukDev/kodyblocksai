import { describe, expect, it } from "vitest";
import { CORE_OPCODES } from "../opcodes";
import { createMotionBlocks, limitPrecision } from "./motion";
import { call, createFakeRuntime, createFakeUtil, FakeTarget } from "./motion-looks.fixtures";

function setup(opts: { random?: () => number; mouse?: { x: number; y: number } } = {}) {
  const sprite = new FakeTarget("Sprite1");
  const other = new FakeTarget("Other");
  other.x = 30;
  other.y = -40;
  const stage = new FakeTarget("Stage", true);
  const { runtime } = createFakeRuntime({ targets: [stage, sprite, other], random: opts.random });
  const pkg = createMotionBlocks(runtime);
  const prims = pkg.getPrimitives();
  const u = createFakeUtil(runtime, sprite, opts.mouse);
  return { sprite, other, stage, runtime, pkg, prims, ...u };
}

describe("motion: katalog", () => {
  it("mendaftarkan semua opcode motion milik motion.ts dan tidak lebih", () => {
    const { prims } = setup();
    const expected = CORE_OPCODES.filter((o) => o.owner.endsWith("engine/src/blocks/motion.ts") && o.vmPrimitive)
      .map((o) => o.opcode)
      .sort();
    expect(Object.keys(prims).sort()).toEqual(expected);
  });

  it("getMonitored id persis scratch-vm", () => {
    const { pkg } = setup();
    const m = pkg.getMonitored?.() ?? {};
    expect(m.motion_xposition?.getId?.("T", {})).toBe("T_xposition");
    expect(m.motion_yposition?.getId?.("T", {})).toBe("T_yposition");
    expect(m.motion_direction?.getId?.("T", {})).toBe("T_direction");
    expect(m.motion_xposition?.isSpriteSpecific).toBe(true);
    expect(pkg.getHats?.()).toEqual({});
  });

  it("blok lama no-op", () => {
    const { prims, util, sprite } = setup();
    for (const op of ["motion_scroll_right", "motion_scroll_up", "motion_align_scene", "motion_xscroll", "motion_yscroll"]) {
      expect(call(prims, op, {}, util)).toBeUndefined();
    }
    expect([sprite.x, sprite.y]).toEqual([0, 0]);
  });
});

describe("motion_movesteps", () => {
  it("arah 90 bergerak ke kanan, string dicast, NaN jadi 0", () => {
    const { prims, util, sprite } = setup();
    call(prims, "motion_movesteps", { STEPS: "10" }, util);
    expect(sprite.x).toBe(10);
    expect(sprite.y).toBeCloseTo(0, 12);
    call(prims, "motion_movesteps", { STEPS: "abc" }, util);
    expect(sprite.x).toBe(10);
  });

  it("memakai cos/sin(90-dir) persis (galat float dipertahankan)", () => {
    const { prims, util, sprite } = setup();
    sprite.direction = 0;
    call(prims, "motion_movesteps", { STEPS: 10 }, util);
    const r = ((90 - 0) * Math.PI) / 180;
    expect(sprite.x).toBe(10 * Math.cos(r));
    expect(sprite.y).toBe(10 * Math.sin(r));
    expect(sprite.x).not.toBe(0); // 6.123e-16, sama seperti Scratch
  });

  it("langkah negatif dan arah -135", () => {
    const { prims, util, sprite } = setup();
    sprite.direction = -135;
    call(prims, "motion_movesteps", { STEPS: -10 }, util);
    expect(sprite.x).toBeCloseTo(7.0710678, 6);
    expect(sprite.y).toBeCloseTo(7.0710678, 6);
  });

  it("hasil lewat setXY sehingga fencing target berlaku", () => {
    const { prims, util, sprite } = setup();
    sprite.fence = (x, y) => [Math.min(x, 240), y];
    call(prims, "motion_movesteps", { STEPS: 1000 }, util);
    expect(sprite.x).toBe(240);
  });
});

describe("motion_turnright / turnleft / pointindirection", () => {
  it("wrapClamp -179..180", () => {
    const { prims, util, sprite } = setup();
    call(prims, "motion_turnright", { DEGREES: 100 }, util);
    expect(sprite.direction).toBe(-170);
    call(prims, "motion_turnleft", { DEGREES: "15" }, util);
    expect(sprite.direction).toBe(175);
    call(prims, "motion_pointindirection", { DIRECTION: -180 }, util);
    expect(sprite.direction).toBe(180);
    call(prims, "motion_pointindirection", { DIRECTION: 540 }, util);
    expect(sprite.direction).toBe(180);
    call(prims, "motion_pointindirection", { DIRECTION: "" }, util);
    expect(sprite.direction).toBe(0);
  });

  it("Infinity diabaikan oleh target", () => {
    const { prims, util, sprite } = setup();
    call(prims, "motion_pointindirection", { DIRECTION: "Infinity" }, util);
    expect(sprite.direction).toBe(90);
  });
});

describe("motion_goto / gotoxy", () => {
  it("gotoxy cast", () => {
    const { prims, util, sprite } = setup();
    call(prims, "motion_gotoxy", { X: "12.5", Y: true }, util);
    expect([sprite.x, sprite.y]).toEqual([12.5, 1]);
  });

  it("goto sprite, mouse, random, sprite tidak ada", () => {
    const seq = [0.75, 0.25];
    const { prims, util, sprite } = setup({ random: () => seq.shift() ?? 0, mouse: { x: -7, y: 9 } });
    call(prims, "motion_goto", { TO: "Other" }, util);
    expect([sprite.x, sprite.y]).toEqual([30, -40]);
    call(prims, "motion_goto", { TO: "_mouse_" }, util);
    expect([sprite.x, sprite.y]).toEqual([-7, 9]);
    call(prims, "motion_goto", { TO: "_random_" }, util);
    expect([sprite.x, sprite.y]).toEqual([Math.round(480 * 0.25), Math.round(360 * -0.25)]);
    call(prims, "motion_goto", { TO: "Ghost" }, util);
    expect([sprite.x, sprite.y]).toEqual([120, -90]);
  });

  it("goto stage (nama 'Stage') bukan sprite -> diam", () => {
    const { prims, util, sprite } = setup();
    call(prims, "motion_goto", { TO: "Stage" }, util);
    expect([sprite.x, sprite.y]).toEqual([0, 0]);
  });
});

describe("motion_pointtowards", () => {
  it("menghadap sprite lain: 90 - atan2(dy,dx)", () => {
    const { prims, util, sprite } = setup();
    call(prims, "motion_pointtowards", { TOWARDS: "Other" }, util);
    const expected = 90 - (Math.atan2(-40, 30) * 180) / Math.PI;
    expect(sprite.direction).toBe(expected);
  });

  it("mouse tepat di atas -> 0; posisi sama -> 90", () => {
    const { prims, util, sprite } = setup({ mouse: { x: 0, y: 50 } });
    call(prims, "motion_pointtowards", { TOWARDS: "_mouse_" }, util);
    expect(sprite.direction).toBe(0);
    sprite.y = 50;
    call(prims, "motion_pointtowards", { TOWARDS: "_mouse_" }, util);
    expect(sprite.direction).toBe(90);
  });

  it("random: round(r*360)-180", () => {
    const { prims, util, sprite } = setup({ random: () => 0.999 });
    call(prims, "motion_pointtowards", { TOWARDS: "_random_" }, util);
    expect(sprite.direction).toBe(180);
  });

  it("sprite tidak ada -> tidak berubah", () => {
    const { prims, util, sprite } = setup();
    call(prims, "motion_pointtowards", { TOWARDS: "nope" }, util);
    expect(sprite.direction).toBe(90);
  });
});

describe("motion_glidesecstoxy / glideto", () => {
  it("interpolasi linear per frame lalu posisi akhir", () => {
    const { prims, util, sprite, clock, yields } = setup();
    const args = { SECS: 1, X: 100, Y: -50 };
    call(prims, "motion_glidesecstoxy", args, util);
    expect(yields.yield).toBe(1);
    expect([sprite.x, sprite.y]).toEqual([0, 0]);
    clock.t = 250;
    call(prims, "motion_glidesecstoxy", args, util);
    expect([sprite.x, sprite.y]).toEqual([25, -12.5]);
    expect(yields.yield).toBe(2);
    clock.t = 1000;
    call(prims, "motion_glidesecstoxy", args, util);
    expect([sprite.x, sprite.y]).toEqual([100, -50]);
    expect(yields.yield).toBe(2);
  });

  it("argumen dibaca sekali di awal (perubahan sesudahnya diabaikan)", () => {
    const { prims, util, sprite, clock } = setup();
    call(prims, "motion_glidesecstoxy", { SECS: 2, X: 10, Y: 0 }, util);
    clock.t = 2000;
    call(prims, "motion_glidesecstoxy", { SECS: 0, X: 999, Y: 999 }, util);
    expect([sprite.x, sprite.y]).toEqual([10, 0]);
  });

  it("durasi <= 0 atau bukan angka langsung lompat tanpa yield", () => {
    const { prims, util, sprite, yields, resetFrame } = setup();
    call(prims, "motion_glidesecstoxy", { SECS: 0, X: 5, Y: 6 }, util);
    expect([sprite.x, sprite.y]).toEqual([5, 6]);
    resetFrame();
    call(prims, "motion_glidesecstoxy", { SECS: "abc", X: 7, Y: 8 }, util);
    expect([sprite.x, sprite.y]).toEqual([7, 8]);
    resetFrame();
    call(prims, "motion_glidesecstoxy", { SECS: -1, X: 1, Y: 1 }, util);
    expect(yields.yield).toBe(0);
  });

  it("glideto ke sprite; sprite tidak ada -> tidak melakukan apa pun", () => {
    const { prims, util, sprite, clock, yields } = setup();
    call(prims, "motion_glideto", { SECS: 1, TO: "nope" }, util);
    expect(yields.yield).toBe(0);
    call(prims, "motion_glideto", { SECS: 1, TO: "Other" }, util);
    clock.t = 500;
    call(prims, "motion_glideto", { SECS: 1, TO: "Other" }, util);
    expect([sprite.x, sprite.y]).toEqual([15, -20]);
  });
});

describe("motion_ifonedgebounce", () => {
  it("tanpa bounds tidak melakukan apa pun", () => {
    const { prims, util, sprite } = setup();
    call(prims, "motion_ifonedgebounce", {}, util);
    expect(sprite.direction).toBe(90);
  });

  it("tidak menyentuh tepi -> tidak berubah", () => {
    const { prims, util, sprite } = setup();
    sprite.bounds = { left: -10, right: 10, top: 10, bottom: -10 };
    call(prims, "motion_ifonedgebounce", {}, util);
    expect(sprite.direction).toBe(90);
    expect(sprite.calls).not.toContain("keepInFence:0,0");
  });

  it("tepi kanan: arah 90 menjadi -90, lalu keepInFence", () => {
    const { prims, util, sprite } = setup();
    sprite.x = 235;
    sprite.bounds = { left: 225, right: 245, top: 10, bottom: -10 };
    sprite.fence = (x, y) => [Math.min(x, 230), y];
    call(prims, "motion_ifonedgebounce", {}, util);
    expect(sprite.direction).toBe(-90);
    expect(sprite.calls).toContain("keepInFence:235,0");
    expect(sprite.x).toBe(230);
  });

  it("tepi atas dengan arah 45 -> 135", () => {
    const { prims, util, sprite } = setup();
    sprite.direction = 45;
    sprite.bounds = { left: -10, right: 10, top: 185, bottom: 165 };
    call(prims, "motion_ifonedgebounce", {}, util);
    expect(sprite.direction).toBeCloseTo(135, 10);
  });

  it("dx minimal 0.2 saat bergerak lurus ke atas lalu kena tepi kiri", () => {
    const { prims, util, sprite } = setup();
    sprite.direction = 0;
    sprite.bounds = { left: -250, right: -230, top: 10, bottom: -10 };
    call(prims, "motion_ifonedgebounce", {}, util);
    const rad = ((90 - 0) * Math.PI) / 180;
    const dx = Math.max(0.2, Math.abs(Math.cos(rad)));
    const dy = -Math.sin(rad);
    expect(sprite.direction).toBe((Math.atan2(dy, dx) * 180) / Math.PI + 90);
  });

  it("seri jarak: urutan left > top > right > bottom (pojok kiri atas memilih left)", () => {
    const { prims, util, sprite } = setup();
    sprite.direction = -45; // bergerak ke kiri atas
    sprite.bounds = { left: -245, right: -225, top: 185, bottom: 165 };
    call(prims, "motion_ifonedgebounce", {}, util);
    // Left dipilih: dx dipaksa positif, dy tetap -> arah 45.
    expect(sprite.direction).toBeCloseTo(45, 10);
  });

  it("tepi bawah", () => {
    const { prims, util, sprite } = setup();
    sprite.direction = 180;
    sprite.bounds = { left: -10, right: 10, top: -170, bottom: -190 };
    call(prims, "motion_ifonedgebounce", {}, util);
    expect(sprite.direction).toBeCloseTo(0, 10);
  });
});

describe("motion x/y/rotation", () => {
  it("changexby/setx/changeyby/sety", () => {
    const { prims, util, sprite } = setup();
    call(prims, "motion_changexby", { DX: "5" }, util);
    call(prims, "motion_changeyby", { DY: -3 }, util);
    expect([sprite.x, sprite.y]).toEqual([5, -3]);
    call(prims, "motion_setx", { X: "x" }, util);
    call(prims, "motion_sety", { Y: 1.5 }, util);
    expect([sprite.x, sprite.y]).toEqual([0, 1.5]);
  });

  it("stage tidak bergerak", () => {
    const { prims, runtime, stage } = setup();
    const u = createFakeUtil(runtime, stage);
    call(prims, "motion_gotoxy", { X: 10, Y: 10 }, u.util);
    expect([stage.x, stage.y]).toEqual([0, 0]);
  });

  it("setrotationstyle meneruskan nilai mentah", () => {
    const { prims, util, sprite } = setup();
    call(prims, "motion_setrotationstyle", { STYLE: "left-right" }, util);
    expect(sprite.rotationStyle).toBe("left-right");
    call(prims, "motion_setrotationstyle", { STYLE: "bogus" }, util);
    expect(sprite.rotationStyle).toBe("left-right");
  });

  it("reporter x/y memakai limitPrecision; direction apa adanya", () => {
    const { prims, util, sprite } = setup();
    sprite.x = 1.0000000000001;
    sprite.y = -2.5;
    sprite.direction = 6.123e-17;
    expect(call(prims, "motion_xposition", {}, util)).toBe(1);
    expect(call(prims, "motion_yposition", {}, util)).toBe(-2.5);
    expect(call(prims, "motion_direction", {}, util)).toBe(6.123e-17);
  });

  it("limitPrecision", () => {
    expect(limitPrecision(6.123233995736766e-16)).toBe(0);
    expect(limitPrecision(0.1 + 0.2)).toBe(0.1 + 0.2);
    expect(limitPrecision(-3.0000000001)).toBe(-3);
    expect(limitPrecision(-3.000001)).toBe(-3.000001);
  });
});
