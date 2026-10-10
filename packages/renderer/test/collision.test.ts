import { describe, expect, it } from "vitest";
import { addSquare, headless, solidBitmap } from "./helpers";

describe("isTouchingDrawables", () => {
  it("berdasarkan piksel, bukan kotak", () => {
    const r = headless();
    const a = addSquare(r, 20, [255, 0, 0, 255], [0, 0]);
    const b = addSquare(r, 20, [0, 0, 255, 255], [19, 0]);
    expect(r.isTouchingDrawables(a)).toBe(true);
    // Seperti Scratch: sampling silhouette melebar satu texel, jadi celah 1 px masih "menyentuh".
    r.updateDrawablePosition(b, [21, 0]);
    expect(r.isTouchingDrawables(a)).toBe(true);
    r.updateDrawablePosition(b, [23, 0]);
    expect(r.isTouchingDrawables(a)).toBe(false);
    // bitmap dengan sudut transparan: kotak beririsan tetapi piksel tidak
    const ring = solidBitmap(20, 20, [0, 255, 0, 0]);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if (x + y > 30) ring.data[(y * 20 + x) * 4 + 3] = 255;
    const skin = r.createBitmapSkin(ring, 1);
    const c = r.createDrawable("sprite");
    r.updateDrawableSkinId(c, skin);
    r.updateDrawablePosition(c, [-30, 30]);
    expect(r.isTouchingDrawables(a, [c])).toBe(false);
  });

  it("sprite tersembunyi tidak pernah menyentuh; ghost tetap menyentuh", () => {
    const r = headless();
    const a = addSquare(r, 20, [255, 0, 0, 255]);
    const b = addSquare(r, 20, [0, 0, 255, 255], [5, 5]);
    r.updateDrawableEffect(b, "ghost", 100);
    expect(r.isTouchingDrawables(a)).toBe(true);
    r.updateDrawableVisible(b, false);
    expect(r.isTouchingDrawables(a)).toBe(false);
  });
});

describe("isTouchingColor", () => {
  it("menemukan warna kandidat dengan toleransi bit Scratch", () => {
    const r = headless();
    const me = addSquare(r, 10, [0, 0, 0, 255], [0, 0]);
    addSquare(r, 10, [250, 4, 10, 255], [8, 0]);
    expect(r.isTouchingColor(me, [255, 0, 0])).toBe(true);
    expect(r.isTouchingColor(me, [0, 255, 0])).toBe(false);
  });

  it("warna latar putih terdeteksi di area kosong; ghost diabaikan untuk mask", () => {
    const r = headless();
    const me = addSquare(r, 10, [0, 0, 0, 255], [0, 0]);
    expect(r.isTouchingColor(me, [255, 255, 255])).toBe(true);
    const cover = addSquare(r, 40, [0, 0, 255, 255], [0, 0]);
    r.setDrawableOrder(cover, -Infinity, "sprite");
    expect(r.isTouchingColor(me, [255, 255, 255])).toBe(false);
    r.updateDrawableEffect(cover, "ghost", 100);
    expect(r.isTouchingColor(me, [255, 255, 255])).toBe(true);
    // "warna hitam menyentuh biru": mask diambil dari drawable sendiri, ghost diri diabaikan
    r.updateDrawableEffect(cover, "ghost", 0);
    r.updateDrawableEffect(me, "ghost", 100);
    expect(r.colorIsTouchingColor(me, [0, 0, 255], [0, 0, 0])).toBe(true);
    expect(r.colorIsTouchingColor(me, [0, 0, 255], [255, 0, 0])).toBe(false);
  });

  it("balon teks tidak ikut kueri menyentuh", () => {
    const r = headless();
    const me = addSquare(r, 10, [0, 0, 0, 255]);
    const bubble = r.createDrawable("sprite");
    r.updateDrawableSkinId(bubble, r.createTextSkin("say", "halo", false));
    expect(r.isTouchingDrawables(me, [bubble])).toBe(false);
  });

  it("efek warna diterapkan sebelum pencocokan", () => {
    const r = headless();
    const me = addSquare(r, 10, [0, 0, 0, 255]);
    const other = addSquare(r, 10, [255, 0, 0, 255], [5, 0]);
    expect(r.isTouchingColor(me, [255, 0, 0])).toBe(true);
    r.updateDrawableEffect(other, "color", 66.6667); // geser hue ~1/3 -> hijau
    expect(r.isTouchingColor(me, [255, 0, 0])).toBe(false);
    expect(r.isTouchingColor(me, [0, 255, 0])).toBe(true);
  });
});

describe("pick & titik", () => {
  it("memilih sprite paling atas yang terlihat dan tidak transparan penuh", () => {
    const r = headless();
    const bottom = addSquare(r, 40, [255, 0, 0, 255]);
    const top = addSquare(r, 10, [0, 0, 255, 255], [0, 0]);
    expect(r.pick(0, 0)).toBe(top);
    expect(r.pick(15, 0)).toBe(bottom);
    expect(r.pick(100, 100)).toBe(-1);
    r.updateDrawableEffect(top, "ghost", 100);
    expect(r.pick(0, 0)).toBe(bottom);
    expect(r.pick(0, 0, 1, 1, [top])).toBe(-1);
    expect(r.isTouchingPoint(top, 0, 0)).toBe(true);
    expect(r.isTouchingPoint(top, 30, 0)).toBe(false);
  });

  it("clientToStage memetakan kanvas berskala tanpa mengubah koordinat logis", () => {
    const r = headless();
    expect(r.clientToStage(0, 0, 960, 720)).toEqual([-240, 180]);
    expect(r.clientToStage(480, 360, 960, 720)).toEqual([0, 0]);
    expect(r.clientToStage(120, 90, 240, 180)).toEqual([0, 0]);
  });

  it("sampleColor memadukan sprite dengan latar", () => {
    const r = headless();
    addSquare(r, 10, [0, 0, 255, 128]);
    const c = r.sampleColor(0, 0);
    expect(c[2]).toBe(255);
    expect(c[0]).toBeGreaterThan(120);
    expect(c[0]).toBeLessThan(135);
    expect(r.sampleColor(100, 100)).toEqual([255, 255, 255, 255]);
    r.setBackgroundColor(0, 0, 0);
    expect(r.sampleColor(100, 100)).toEqual([0, 0, 0, 255]);
  });
});
