import { describe, expect, it } from "vitest";
import {
  addMonitorRect,
  getInitialPosition,
  initialMonitorLayout,
  moveMonitorRect,
  PADDING,
  removeMonitorRect,
  resizeMonitorRect,
} from "./monitor-layout";

const rect = (x: number, y: number, w: number, h: number) => ({
  upperStart: { x, y },
  lowerEnd: { x: x + w, y: y + h },
});

describe("monitor-layout reducer (scratch-gui)", () => {
  it("menolak rect tidak valid dan id ganda", () => {
    let s = addMonitorRect(initialMonitorLayout, "a", rect(0, 0, 10, 10));
    expect(Object.keys(s.monitors)).toEqual(["a"]);
    expect(addMonitorRect(s, "a", rect(5, 5, 10, 10))).toBe(s);
    expect(addMonitorRect(s, "b", { upperStart: { x: 5, y: 5 }, lowerEnd: { x: 5, y: 9 } })).toBe(s);
    s = addMonitorRect(s, "b", rect(1, 2, 3, 4), true);
    expect(s.savedMonitorPositions.b).toEqual({ x: 1, y: 2 });
  });
  it("move menyimpan posisi; resize & remove tidak", () => {
    let s = addMonitorRect(initialMonitorLayout, "a", rect(0, 0, 10, 20));
    s = moveMonitorRect(s, "a", 50, 60);
    expect(s.monitors.a).toEqual(rect(50, 60, 10, 20));
    expect(s.savedMonitorPositions.a).toEqual({ x: 50, y: 60 });
    const same = moveMonitorRect(s, "a", 50, 60);
    expect(same).toBe(s);
    s = resizeMonitorRect(s, "a", 30, 40);
    expect(s.monitors.a).toEqual(rect(50, 60, 30, 40));
    expect(resizeMonitorRect(s, "a", 0, 40)).toBe(s);
    s = removeMonitorRect(s, "a");
    expect(s.monitors.a).toBeUndefined();
    expect(s.savedMonitorPositions.a).toEqual({ x: 50, y: 60 });
  });
});

describe("getInitialPosition", () => {
  it("monitor pertama di (5,5)", () => {
    expect(getInitialPosition(initialMonitorLayout, "a", 100, 20)).toEqual(rect(PADDING, PADDING, 100, 20));
  });
  it("monitor kedua di bawah yang pertama", () => {
    const s = addMonitorRect(initialMonitorLayout, "a", rect(5, 5, 100, 20));
    // endYs = [0, 25]; y=0 bertabrakan, y=25 -> (5, 30)
    expect(getInitialPosition(s, "b", 100, 20)).toEqual(rect(5, 30, 100, 20));
  });
  it("posisi tersimpan dipakai kembali", () => {
    let s = addMonitorRect(initialMonitorLayout, "a", rect(5, 5, 100, 20));
    s = moveMonitorRect(s, "a", 200, 100);
    s = removeMonitorRect(s, "a");
    expect(getInitialPosition(s, "a", 80, 20)).toEqual(rect(200, 100, 80, 20));
  });
  it("kolom kedua dengan lebar tab 50 saat kolom pertama penuh", () => {
    let s = initialMonitorLayout;
    // Isi kolom kiri hingga tinggi 300 (SCREEN_HEIGHT).
    for (let i = 0; i < 12; i++) {
      const r = getInitialPosition(s, `m${i}`, 60, 20);
      s = addMonitorRect(s, `m${i}`, r);
    }
    const xs = new Set(Object.values(s.monitors).map((m) => m.upperStart.x));
    expect(xs.has(5)).toBe(true);
    expect(xs.has(105)).toBe(true); // ceil(65/50)*50 = 100 -> 100 + 5
  });
  it("rencana B untuk monitor terlalu besar, rencana C acak", () => {
    expect(getInitialPosition(initialMonitorLayout, "big", 500, 20)).toEqual(rect(5, 5, 500, 20));
    let s = initialMonitorLayout;
    s = addMonitorRect(s, "full", rect(0, 0, 400, 300));
    const r = getInitialPosition(s, "x", 50, 50, () => 0.5);
    expect(r.upperStart).toEqual({ x: 100, y: 130 });
  });
});
