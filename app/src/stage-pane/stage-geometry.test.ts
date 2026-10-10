import { describe, expect, it } from "vitest";
import {
  canvasToStagePoint,
  computeDragOffset,
  dragPosition,
  exceedsDragThreshold,
  getScratchCoords,
  getStackedStageDimensions,
  getStageDimensions,
  resolveStageSize,
  stageSizeToTransform,
} from "./stage-geometry";

describe("resolveStageSize (scratch-gui screen-utils)", () => {
  it("small selalu small", () => {
    expect(resolveStageSize("small", true)).toBe("small");
    expect(resolveStageSize("small", false)).toBe("small");
  });
  it("large tergantung lebar jendela", () => {
    expect(resolveStageSize("large", true)).toBe("large");
    expect(resolveStageSize("large", false)).toBe("largeConstrained");
  });
});

describe("getStageDimensions", () => {
  const vp = { width: 1280, height: 800 };
  it("skala 1 / 0.85 / 0.5 dibulatkan", () => {
    expect(getStageDimensions("large", false, vp)).toMatchObject({ width: 480, height: 360, scale: 1 });
    expect(getStageDimensions("largeConstrained", false, vp)).toMatchObject({ width: 408, height: 306, scale: 0.85 });
    expect(getStageDimensions("small", false, vp)).toMatchObject({ width: 240, height: 180, scale: 0.5 });
  });
  it("layar penuh: tinggi = innerHeight - 44 - 12, lebar 4:3", () => {
    const d = getStageDimensions("large", true, { width: 1920, height: 1080 });
    expect(d.height).toBe(1024);
    expect(d.width).toBe(Math.round(1024 + 1024 / 3));
    expect(d.scale).toBeCloseTo((1024 + 1024 / 3) / 480);
  });
  it("layar penuh sempit: dibatasi lebar jendela", () => {
    const d = getStageDimensions("large", true, { width: 400, height: 1000 });
    expect(d.width).toBe(400);
    expect(d.height).toBe(300);
  });
});

describe("stacked & transform", () => {
  it("panggung tumpuk tidak melebihi wadah", () => {
    expect(getStackedStageDimensions("large", 300)).toMatchObject({ width: 300, height: 225 });
    expect(getStackedStageDimensions("large", 900)).toMatchObject({ width: 480, height: 360 });
    expect(getStackedStageDimensions("small", 900)).toMatchObject({ width: 240, height: 180 });
  });
  it("tidak ada transform di skala 1", () => {
    expect(stageSizeToTransform({ width: 480, height: 360, widthDefault: 480, heightDefault: 360, scale: 1 })).toBeUndefined();
    expect(stageSizeToTransform({ width: 240, height: 180, widthDefault: 480, heightDefault: 360, scale: 0.5 })).toBe(
      "scale(0.5,0.5)",
    );
  });
});

describe("koordinat & drag (containers/stage.jsx)", () => {
  it("getScratchCoords memetakan pusat ke 0,0 dan y positif ke bawah", () => {
    expect(getScratchCoords(240, 180, 480, 360)).toEqual([0, 0]);
    expect(getScratchCoords(0, 0, 480, 360)).toEqual([-240, -180]);
    expect(getScratchCoords(120, 90, 240, 180)).toEqual([0, 0]);
    expect(getScratchCoords(240, 180, 240, 180)).toEqual([240, 180]);
  });
  it("canvasToStagePoint membalik y", () => {
    expect(canvasToStagePoint(480, 0, 480, 360)).toEqual([240, 180]);
  });
  it("offset + posisi drag mempertahankan titik pegang", () => {
    const mouse = getScratchCoords(250, 170, 480, 360); // [10, -10] -> titik panggung (10, 10)
    const off = computeDragOffset(30, 40, mouse);
    expect(off).toEqual([20, -30]);
    // Mouse tidak bergerak -> sprite tetap di posisinya.
    expect(dragPosition(mouse, off)).toEqual({ x: 30, y: 40 });
    // Mouse bergeser 5 px ke kanan & 5 px ke atas (layar) -> sprite +5,+5.
    expect(dragPosition(getScratchCoords(255, 165, 480, 360), off)).toEqual({ x: 35, y: 45 });
  });
  it("ambang drag 3px (lebih dari, bukan sama dengan)", () => {
    expect(exceedsDragThreshold([0, 0], [3, 0])).toBe(false);
    expect(exceedsDragThreshold([0, 0], [3, 1])).toBe(true);
  });
});
