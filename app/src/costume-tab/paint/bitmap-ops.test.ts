import { describe, expect, it } from "vitest";
import {
  BITMAP_CX,
  BITMAP_CY,
  clonePixels,
  createPixels,
  cropForSave,
  fillEllipse,
  fillRect,
  floodFill,
  getPixel,
  moveRegion,
  opaqueBounds,
  parseHex,
  shiftAll,
  stampCircle,
  strokeEllipse,
  strokeLine,
  strokeRect,
} from "./bitmap-ops";

const RED = parseHex("#ff0000");
const BLUE = parseHex("#0000ff");

describe("bitmap-ops", () => {
  it("parseHex", () => {
    expect(parseHex("#102030")).toEqual([16, 32, 48, 255]);
    expect(parseHex("#10203080")).toEqual([16, 32, 48, 128]);
    expect(parseHex("none")).toEqual([0, 0, 0, 0]);
  });

  it("stamp & eraser", () => {
    const p = createPixels(20, 20);
    stampCircle(p, 10, 10, 3, RED);
    expect(getPixel(p, 10, 10)).toEqual(RED);
    expect(getPixel(p, 0, 0)[3]).toBe(0);
    stampCircle(p, 10, 10, 1, RED, true);
    expect(getPixel(p, 10, 10)[3]).toBe(0);
  });

  it("strokeLine menyambung tanpa celah", () => {
    const p = createPixels(50, 10);
    strokeLine(p, 2, 5, 47, 5, 2, RED);
    for (let x = 3; x < 46; x++) expect(getPixel(p, x, 5)).toEqual(RED);
  });

  it("rect & ellipse", () => {
    const p = createPixels(40, 40);
    fillRect(p, 5, 5, 10, 10, RED);
    expect(getPixel(p, 14, 14)).toEqual(RED);
    expect(getPixel(p, 15, 15)[3]).toBe(0);
    fillEllipse(p, 30, 30, 5, 5, BLUE);
    expect(getPixel(p, 30, 30)).toEqual(BLUE);
    expect(getPixel(p, 35, 35)[3]).toBe(0);
    const q = createPixels(40, 40);
    strokeRect(q, 5, 5, 20, 20, 2, RED);
    expect(getPixel(q, 15, 15)[3]).toBe(0);
    expect(getPixel(q, 15, 5)).toEqual(RED);
    strokeEllipse(q, 20, 20, 10, 10, 2, BLUE);
    expect(getPixel(q, 30, 20)).toEqual(BLUE);
  });

  it("blend semi transparan", () => {
    const p = createPixels(2, 2);
    fillRect(p, 0, 0, 1, 1, [255, 0, 0, 255]);
    fillRect(p, 0, 0, 1, 1, [0, 0, 255, 128]);
    const [r, , b, a] = getPixel(p, 0, 0);
    expect(a).toBe(255);
    expect(r).toBeGreaterThan(100);
    expect(b).toBeGreaterThan(100);
  });

  it("floodFill berhenti di batas warna", () => {
    const p = createPixels(10, 10);
    strokeRect(p, 2, 2, 5, 5, 1, RED);
    const inside = floodFill(p, 4, 4, BLUE);
    expect(inside).toBeGreaterThan(0);
    expect(getPixel(p, 4, 4)).toEqual(BLUE);
    expect(getPixel(p, 0, 0)[3]).toBe(0);
    expect(floodFill(p, 4, 4, BLUE)).toBe(0);
    expect(floodFill(p, -1, 4, BLUE)).toBe(0);
  });

  it("opaqueBounds, cropForSave memberi pusat relatif (480,360)", () => {
    const p = createPixels();
    expect(cropForSave(p)).toMatchObject({ rotationCenterX: 1, rotationCenterY: 1 });
    fillRect(p, 400, 300, 100, 80, RED);
    expect(opaqueBounds(p)).toEqual({ x: 400, y: 300, w: 100, h: 80 });
    const c = cropForSave(p);
    expect(c.pixels.width).toBe(100);
    expect(c.rotationCenterX).toBe(BITMAP_CX - 400);
    expect(c.rotationCenterY).toBe(BITMAP_CY - 300);
  });

  it("moveRegion & shiftAll", () => {
    const p = createPixels(20, 20);
    fillRect(p, 0, 0, 4, 4, RED);
    const before = clonePixels(p);
    moveRegion(p, 0, 0, 4, 4, 10, 10);
    expect(getPixel(p, 0, 0)[3]).toBe(0);
    expect(getPixel(p, 12, 12)).toEqual(RED);
    const s = shiftAll(before, 5, 0);
    expect(getPixel(s, 6, 1)).toEqual(RED);
    expect(getPixel(s, 1, 1)[3]).toBe(0);
  });
});
