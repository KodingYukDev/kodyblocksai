import { describe, expect, it } from "vitest";
import { createMockController } from "../shell/mock-controller";
import { createStagePointer, keyForIO, shouldPreventKeyScroll } from "./stage-pointer";

function setup(opts: { editor?: boolean; draggable?: boolean; pick?: string | null } = {}) {
  const c = createMockController();
  c.patch({
    targets: c.getSnapshot().targets.map((t) => (t.id === "kody" ? { ...t, x: 30, y: 40, draggable: opts.draggable ?? false } : t)),
  });
  c.pickHandler = () => (opts.pick === undefined ? "kody" : opts.pick);
  const timers: { fn: () => void; ms: number }[] = [];
  const p = createStagePointer({
    controller: c,
    editorDragStyle: opts.editor ?? true,
    getRect: () => ({ left: 100, top: 50, width: 480, height: 360 }),
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => undefined,
  });
  return { c, p, timers };
}

const methods = (c: ReturnType<typeof createMockController>) => c.calls.map((x) => x.method);

describe("stage pointer (containers/stage.jsx)", () => {
  it("klik tanpa gerak: mouse down/up ke IO, tanpa drag", () => {
    const { c, p } = setup();
    p.down(100 + 240, 50 + 180, true);
    p.up(100 + 240, 50 + 180);
    expect(methods(c)).toEqual(["postMouse", "postMouse"]);
    expect(c.calls[0]?.args[0]).toEqual({ isDown: true, x: 240, y: 180, canvasWidth: 480, canvasHeight: 360 });
    expect(c.calls[1]?.args[0]).toMatchObject({ isDown: false, wasDragged: false });
  });

  it("gerak > 3px memulai drag: goToFront, startDrag, posisi force", () => {
    const { c, p } = setup();
    p.down(100 + 250, 50 + 170, true); // titik panggung (10, 10)
    p.move(100 + 255, 50 + 165);
    expect(methods(c)).toEqual(["postMouse", "pickTarget", "goToFront", "startDrag", "postSpriteInfo", "postMouse"]);
    expect(c.calls[1]?.args).toEqual([10, 10]);
    expect(c.calls[4]?.args[0]).toEqual({ x: 35, y: 45, force: true });
    expect(p.isDragging).toBe(true);
    p.up(100 + 255, 50 + 165);
    expect(methods(c).slice(-2)).toEqual(["stopDrag", "postMouse"]);
    expect(c.calls.at(-1)?.args[0]).toMatchObject({ isDown: false, wasDragged: true });
    expect(c.getSnapshot().editingTargetId).toBe("kody");
  });

  it("gerak tepat 3px belum drag", () => {
    const { c, p } = setup();
    p.down(300, 200, true);
    p.move(303, 200);
    expect(methods(c)).toEqual(["postMouse", "postMouse"]);
  });

  it("tahan 400 ms memulai drag", () => {
    const { c, p, timers } = setup();
    p.down(300, 200, true);
    expect(timers[0]?.ms).toBe(400);
    timers[0]?.fn();
    expect(p.isDragging).toBe(true);
    expect(methods(c)).toContain("startDrag");
  });

  it("mode pemutar: sprite tidak draggable tidak bisa diseret", () => {
    const { c, p } = setup({ editor: false, draggable: false });
    p.down(300, 200, true);
    p.move(320, 220);
    expect(methods(c)).not.toContain("startDrag");
    const d = setup({ editor: false, draggable: true });
    d.p.down(300, 200, true);
    d.p.move(320, 220);
    expect(methods(d.c)).toContain("startDrag");
  });

  it("tombol non-primer tidak memulai drag, tapi tetap memberi IO", () => {
    const { c, p, timers } = setup();
    p.down(300, 200, false);
    p.move(330, 230);
    expect(timers.length).toBe(0);
    expect(methods(c)).toEqual(["postMouse", "postMouse"]);
  });

  it("tidak ada sprite di titik -> tidak drag", () => {
    const { c, p } = setup({ pick: null });
    p.down(300, 200, true);
    p.move(330, 230);
    expect(methods(c)).not.toContain("startDrag");
  });

  it("roda mouse", () => {
    const { c, p } = setup();
    p.wheel(-120);
    expect(c.calls[0]).toEqual({ method: "postWheel", args: [-120] });
  });
});

describe("keyboard IO", () => {
  it("key DOM, fallback keyCode", () => {
    expect(keyForIO({ key: "ArrowLeft", keyCode: 37 })).toBe("ArrowLeft");
    expect(keyForIO({ key: "Dead", keyCode: 65 })).toBe("A");
    expect(keyForIO({ key: "", keyCode: 0 })).toBeNull();
  });
  it("spasi & panah dicegah menggulir", () => {
    expect(shouldPreventKeyScroll(32)).toBe(true);
    expect(shouldPreventKeyScroll(37)).toBe(true);
    expect(shouldPreventKeyScroll(40)).toBe(true);
    expect(shouldPreventKeyScroll(65)).toBe(false);
  });
});
