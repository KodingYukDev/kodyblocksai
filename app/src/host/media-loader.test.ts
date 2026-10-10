import { describe, expect, it, vi } from "vitest";
import type { CostumeState, IAudioEngine, IRenderer } from "@kody/engine";
import { createMediaLoader, sliceBuffer } from "./media-loader";

function fakeRenderer(): IRenderer & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  let next = 1;
  const r = {
    calls,
    createSVGSkin: vi.fn((svg: string, center?: [number, number]) => {
      calls.push(["svg", svg.length, center]);
      return next++;
    }),
    createBitmapSkin: vi.fn((_b: unknown, res: number, center?: [number, number]) => {
      calls.push(["bitmap", res, center]);
      return next++;
    }),
    getSkinSize: vi.fn(() => [40, 30] as [number, number]),
    getSkinRotationCenter: vi.fn(() => [20, 15] as [number, number]),
  };
  return r as unknown as IRenderer & { calls: unknown[][] };
}

const svgState: CostumeState = {
  name: "c1",
  assetId: "a",
  md5ext: "a.svg",
  dataFormat: "svg",
  bitmapResolution: 1,
  rotationCenterX: 10,
  rotationCenterY: 12,
};

describe("createMediaLoader", () => {
  it("tanpa renderer: costume tetap dimuat tanpa skin", async () => {
    const loader = createMediaLoader({ getRenderer: () => null, getAudio: () => null });
    const c = await loader.loadCostume(svgState, { assetId: "a", dataFormat: "svg", data: new Uint8Array([60]) });
    expect(c.skinId).toBe(-1);
    expect(c.size).toEqual([0, 0]);
    expect(c.rotationCenterX).toBe(10);
  });

  it("SVG: rotation center diteruskan apa adanya (loadVector_)", async () => {
    const r = fakeRenderer();
    const loader = createMediaLoader({ getRenderer: () => r, getAudio: () => null });
    const c = await loader.loadCostume(svgState, { assetId: "a", dataFormat: "svg", data: new TextEncoder().encode("<svg/>") });
    expect(r.calls[0]).toEqual(["svg", 6, [10, 12]]);
    expect(c.skinId).toBe(1);
    expect(c.size).toEqual([40, 30]);
  });

  it("bitmap: pusat dibagi bitmapResolution, pusat kosong diambil dari skin dikali resolusi", async () => {
    const r = fakeRenderer();
    const decodeBitmap = vi.fn(async () => ({}) as ImageData);
    const loader = createMediaLoader({ getRenderer: () => r, getAudio: () => null, decodeBitmap });
    const png: CostumeState = { ...svgState, dataFormat: "png", md5ext: "a.png", bitmapResolution: 2, rotationCenterX: 48, rotationCenterY: 50 };
    await loader.loadCostume(png, { assetId: "a", dataFormat: "png", data: new Uint8Array([1]) });
    expect(r.calls[0]).toEqual(["bitmap", 2, [24, 25]]);
    expect(decodeBitmap).toHaveBeenCalledWith(expect.any(Uint8Array), "image/png");

    const noCenter = { ...png, rotationCenterX: undefined, rotationCenterY: undefined } as unknown as CostumeState;
    const c = await loader.loadCostume(noCenter, { assetId: "a", dataFormat: "png", data: new Uint8Array([1]) });
    expect(r.calls[1]).toEqual(["bitmap", 2, undefined]);
    expect([c.rotationCenterX, c.rotationCenterY]).toEqual([40, 30]);
  });

  it("sound: decode memakai salinan buffer sesuai byteOffset dan mengisi soundId/rate/sampleCount", async () => {
    const decodeSound = vi.fn(async (buf: ArrayBuffer) => ({ soundId: `s${buf.byteLength}`, rate: 22050, sampleCount: 7 }));
    const audio = { decodeSound } as unknown as IAudioEngine;
    const loader = createMediaLoader({ getRenderer: () => null, getAudio: () => audio });
    const backing = new Uint8Array([9, 9, 1, 2, 3, 9]);
    const view = backing.subarray(2, 5);
    const s = await loader.loadSound(
      { name: "pop", assetId: "p", md5ext: "p.wav", dataFormat: "wav", rate: 0, sampleCount: 0 },
      { assetId: "p", dataFormat: "wav", data: view },
    );
    expect(new Uint8Array(decodeSound.mock.calls[0]![0])).toEqual(new Uint8Array([1, 2, 3]));
    expect(s).toMatchObject({ soundId: "s3", rate: 22050, sampleCount: 7, name: "pop" });
    expect(sliceBuffer(view).byteLength).toBe(3);
  });
});
