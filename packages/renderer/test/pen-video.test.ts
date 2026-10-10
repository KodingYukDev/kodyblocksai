import { describe, expect, it } from "vitest";
import { createPixelData } from "../src/pixel-source";
import { PenSkin, rasterizeLine } from "../src/skins/pen-skin";
import { addSquare, headless, solidBitmap } from "./helpers";

const alphaAt = (pen: PenSkin, sx: number, sy: number): number => {
  const { width, data } = pen.buffer;
  const col = Math.floor(sx + 240);
  const row = Math.floor(180 - sy);
  return data[(row * width + col) * 4 + 3] as number;
};

describe("rasterisasi pena", () => {
  it("garis diameter 1 digeser 0.5 sehingga tepat satu piksel penuh", () => {
    const pen = new PenSkin(0, [480, 360]);
    pen.drawLine({ color4f: [1, 0, 0, 1], diameter: 1 }, -10, 0, 10, 0);
    // pusat piksel baris y=0.5 (Scratch) tertutup penuh, baris tetangga kosong
    expect(alphaAt(pen, 0.5, 0.5)).toBe(255);
    expect(alphaAt(pen, 0.5, 1.5)).toBe(0);
    expect(alphaAt(pen, 0.5, -0.5)).toBe(0);
  });

  it("ujung bulat: titik berdiameter 10 berbentuk lingkaran", () => {
    const pen = new PenSkin(0, [480, 360]);
    pen.drawPoint({ color4f: [0, 0, 1, 1], diameter: 10 }, 0, 0);
    expect(alphaAt(pen, 0.5, 0.5)).toBe(255);
    expect(alphaAt(pen, 3.5, 0.5)).toBe(255);
    expect(alphaAt(pen, 4.5, 0.5)).toBe(248); // jarak 4.53 -> cakupan 0.97 (antialias)
    expect(alphaAt(pen, 4.5, 4.5)).toBe(0); // sudut kotak di luar lingkaran
    expect(alphaAt(pen, 6.5, 0.5)).toBe(0);
  });

  it("warna premultiplied + blend ONE, ONE_MINUS_SRC_ALPHA", () => {
    const buf = createPixelData(480, 360);
    rasterizeLine(buf, [0.5, 0, 0, 0.5], 20, 0, 0, 0, 0);
    rasterizeLine(buf, [0.5, 0, 0, 0.5], 20, 0, 0, 0, 0);
    const o = (180 * 480 + 240) * 4;
    // lapis 1: 127.5 -> 128 (8-bit); lapis 2: 0.5 + 128/255 * 0.5 = 0.751 -> 192
    expect(buf.data[o + 3]).toBe(192);
    expect(buf.data[o]).toBe(192);
  });

  it("menyentuh warna pena, clear, dan stamp", () => {
    const r = headless();
    const penSkin = r.createPenSkin();
    const penLayer = r.createDrawable("pen");
    r.updateDrawableSkinId(penLayer, penSkin);
    const sprite = addSquare(r, 10, [0, 0, 0, 255], [100, 100]);
    expect(r.isTouchingColor(sprite, [0, 255, 0])).toBe(false);
    r.penLine(penSkin, { color4f: [0, 1, 0, 1], diameter: 4 }, 90, 100, 110, 100);
    expect(r.isTouchingColor(sprite, [0, 255, 0])).toBe(true);
    r.penClear(penSkin);
    expect(r.isTouchingColor(sprite, [0, 255, 0])).toBe(false);

    // stamp sprite merah lalu sembunyikan: warna merah tetap ada di lapisan pena
    const stamp = addSquare(r, 10, [255, 0, 0, 255], [-100, 0]);
    r.penStamp(penSkin, stamp);
    r.updateDrawableVisible(stamp, false);
    r.updateDrawablePosition(sprite, [-95, 0]);
    expect(r.isTouchingColor(sprite, [255, 0, 0])).toBe(true);
    expect(r.sampleColor(-103, 0)).toEqual([255, 0, 0, 255]);
    // ghost 50 ikut ter-stamp
    r.penClear(penSkin);
    r.updateDrawableEffect(stamp, "ghost", 50);
    r.penStamp(penSkin, stamp);
    const c = r.sampleColor(-103, 0);
    expect(c[0]).toBe(255);
    expect(c[1]).toBeGreaterThan(120);
    expect(c[1]).toBeLessThan(135);
  });

  it("sprite di atas pena: pen layer di bawah grup sprite", () => {
    const r = headless();
    const penSkin = r.createPenSkin();
    const penLayer = r.createDrawable("pen");
    r.updateDrawableSkinId(penLayer, penSkin);
    const s = addSquare(r, 10, [0, 0, 255, 255]);
    r.penLine(penSkin, { color4f: [1, 0, 0, 1], diameter: 30 }, 0, 0, 0, 0);
    expect(r.getDrawableOrder(penLayer)).toBeLessThan(r.getDrawableOrder(s));
    expect(r.sampleColor(0, 0)).toEqual([0, 0, 255, 255]);
    expect(r.sampleColor(12, 0)).toEqual([255, 0, 0, 255]);
  });
});

describe("lapisan video", () => {
  it("frame dicerminkan, transparansi = ghost, di bawah pena & sprite, bisa dinonaktifkan", () => {
    const r = headless();
    const sprite = addSquare(r, 10, [0, 0, 0, 255], [-200, 0]);
    const frame = solidBitmap(4, 3, [0, 0, 255, 255]);
    // kolom kiri merah pada frame asli -> setelah dicerminkan ada di kanan
    for (let y = 0; y < 3; y++) frame.data.set([255, 0, 0, 255], y * 16);
    r.setVideoFrame(frame, 0, true);
    expect(r.sampleColor(200, 0)).toEqual([255, 0, 0, 255]);
    expect(r.sampleColor(-200, 0)[2]).toBe(0); // sprite hitam menutupi
    expect(r.isTouchingColor(sprite, [0, 0, 255])).toBe(true);
    r.setVideoFrame(frame, 50, false);
    const c = r.sampleColor(-100, 0);
    expect(c[0]).toBeGreaterThan(120);
    expect(c[2]).toBe(255);
    r.setVideoFrame(null, 0, false);
    expect(r.sampleColor(-100, 0)).toEqual([255, 255, 255, 255]);
    expect(r.getDrawableOrder(r.videoDrawable)).toBeLessThan(r.getDrawableOrder(sprite));
  });
});
