import { describe, expect, it } from "vitest";
import { EFFECT_INFO, effectToUniform } from "../src/effect-info";
import { colorMatches, maskMatches } from "../src/collision";
import { LayerList } from "../src/layer-list";
import { Rectangle } from "../src/rectangle";
import { monotoneConvexHull } from "../src/convex-hull";
import { computeStageSize } from "../src/stage-size";
import { addSquare, headless, solidBitmap } from "./helpers";

describe("Rectangle", () => {
  it("intersects/contains/clamp/snapToInt seperti scratch-render", () => {
    const a = new Rectangle().initFromBounds(-10, 10, -5, 5);
    const b = new Rectangle().initFromBounds(10, 20, 5, 9);
    expect(a.intersects(b)).toBe(true); // menyentuh di tepi tetap berpotongan
    expect(a.contains(new Rectangle().initFromBounds(-9, 9, -4, 4))).toBe(true);
    const c = new Rectangle().initFromBounds(-300.4, 12.2, -1.5, 400);
    c.clamp(-240, 240, -180, 180);
    expect(c.toRect()).toEqual({ left: -240, right: 12.2, bottom: -1.5, top: 180 });
    c.snapToInt();
    expect(c.toRect()).toEqual({ left: -240, right: 13, bottom: -2, top: 180 });
    const u = Rectangle.union(a, b);
    expect([u.left, u.right, u.bottom, u.top]).toEqual([-10, 20, -5, 9]);
  });

  it("initFromModelMatrix = AABB persegi satuan ter-transformasi", () => {
    const m = new Float32Array(16);
    m[0] = 0; m[1] = 20; m[4] = -10; m[5] = 0; m[12] = 3; m[13] = 4; // rotasi 90 derajat, 20x10
    const r = new Rectangle().initFromModelMatrix(m);
    expect(r.toRect()).toEqual({ left: -2, right: 8, top: 14, bottom: -6 });
  });
});

describe("konversi efek (ShaderManager.EFFECT_INFO)", () => {
  it("nilai batas", () => {
    expect(effectToUniform("ghost", 150)).toBe(0);
    expect(effectToUniform("ghost", -5)).toBe(1);
    expect(effectToUniform("brightness", 250)).toBe(1);
    expect(effectToUniform("mosaic", 0)).toBe(1);
    expect(effectToUniform("mosaic", 99999)).toBe(512);
    expect(effectToUniform("pixelate", -30)).toBe(3);
    expect(effectToUniform("fisheye", -500)).toBe(0);
    expect(effectToUniform("color", 450)).toBeCloseTo(0.25);
    expect(effectToUniform("whirl", 180)).toBeCloseTo(-Math.PI);
    expect(EFFECT_INFO.ghost.mask).toBe(64);
  });
});

describe("pencocokan warna", () => {
  it("colorMatches 5/5/4 bit, maskMatches 6 bit + alpha", () => {
    expect(colorMatches([255, 0, 0], [250, 7, 15], 0)).toBe(true);
    expect(colorMatches([255, 0, 0], [247, 0, 0], 0)).toBe(false);
    expect(colorMatches([0, 0, 0], [0, 0, 16], 0)).toBe(false);
    expect(maskMatches([255, 0, 0, 255], [252, 3, 0])).toBe(true);
    expect(maskMatches([255, 0, 0, 255], [251, 0, 0])).toBe(false);
    expect(maskMatches([0, 0, 0, 0], [0, 0, 0])).toBe(false); // transparan tidak pernah cocok
  });
});

describe("LayerList (setDrawableOrder scratch-render)", () => {
  it("grup terpisah dan urutan relatif dengan optMin", () => {
    const l = new LayerList();
    l.setLayerGroupOrdering(["background", "video", "pen", "sprite"]);
    l.add(0, "background");
    l.add(1, "sprite");
    l.add(2, "sprite");
    l.add(3, "pen");
    l.add(4, "sprite");
    expect(l.drawList).toEqual([0, 3, 1, 2, 4]);
    // go to front: Infinity -> ujung grup
    // Indeks dikembalikan apa adanya (5 = setelah splice, sama seperti scratch-render).
    expect(l.setOrder(1, Infinity, "sprite")).toBe(5);
    expect(l.drawList).toEqual([0, 3, 2, 4, 1]);
    // mundur 5 lapis tetapi tidak melewati optMin
    expect(l.setOrder(1, -5, "sprite", true, 1)).toBe(3);
    expect(l.drawList).toEqual([0, 3, 2, 1, 4]);
    expect(l.setOrder(1, 0, "sprite")).toBe(3);
    expect(l.setOrder(99, 1, "sprite")).toBeNull();
    expect(l.remove(3, "pen")).toBe(true);
    l.add(5, "sprite");
    expect(l.drawList).toEqual([0, 2, 1, 4, 5]);
  });
});

describe("convex hull", () => {
  it("membuang titik kolinear dan menutup poligon", () => {
    const hull = monotoneConvexHull([[0, 0], [1, 0], [2, 0], [2, 2], [0, 2], [1, 1]]);
    const set = new Set(hull.map((p) => p.join(",")));
    expect(set).toEqual(new Set(["0,0", "2,0", "2,2", "0,2"]));
    expect(hull[0]).toEqual(hull[hull.length - 1]);
  });

  it("getBounds sprite persegi 10x10: titik hull di pusat piksel (inset setengah piksel)", () => {
    const r = headless();
    const id = addSquare(r, 10, [255, 0, 0, 255], [20, 30]);
    expect(r.getBounds(id)).toEqual({ left: 15.5, right: 24.5, top: 34.5, bottom: 25.5 });
    expect(r.getAABB(id)).toEqual({ left: 15, right: 25, top: 35, bottom: 25 });
    r.updateDrawableDirectionScale(id, 0, [200, 100]);
    const b = r.getBounds(id);
    expect(b?.left).toBeCloseTo(15.5, 4);
    expect(b?.right).toBeCloseTo(24.5, 4);
    expect(b?.top).toBeCloseTo(39, 4);
    expect(b?.bottom).toBeCloseTo(21, 4);
  });

  it("piksel transparan tidak ikut bounds; bitmapResolution 2 membagi ukuran", () => {
    const r = headless();
    const img = solidBitmap(40, 40, [0, 0, 0, 0]);
    for (let y = 10; y < 20; y++) for (let x = 0; x < 40; x++) img.data[(y * 40 + x) * 4 + 3] = 255;
    const skin = r.createBitmapSkin(img, 2);
    expect(r.getSkinSize(skin)).toEqual([20, 20]);
    expect(r.getSkinRotationCenter(skin)).toEqual([10, 10]);
    const id = r.createDrawable("sprite");
    r.updateDrawableSkinId(id, skin);
    const b = r.getBounds(id);
    expect(b).toEqual({ left: -9.5, right: 9.5, top: 4.5, bottom: -0.5 });
  });
});

describe("fencing", () => {
  it("sprite tidak bisa keluar seluruhnya dari panggung", () => {
    const r = headless();
    const id = addSquare(r, 100, [0, 0, 255, 255]);
    expect(r.getFencedPositionOfDrawable(id, [1000, 0])).toEqual([275, 0]);
    expect(r.getFencedPositionOfDrawable(id, [0, -1000])).toEqual([0, -215]);
    expect(r.getFencedPositionOfDrawable(id, [10, 20])).toEqual([10, 20]);
    // sprite kecil: inset = setengah ukuran
    const small = addSquare(r, 6, [0, 0, 255, 255]);
    expect(r.getFencedPositionOfDrawable(small, [1000, 1000])).toEqual([240, 180]);
  });
});

describe("ukuran panggung", () => {
  it("kecil/normal/layar penuh menjaga rasio 4:3", () => {
    expect(computeStageSize("normal", { width: 1000, height: 800 })).toEqual({ width: 480, height: 360, scale: 1 });
    expect(computeStageSize("small", { width: 1000, height: 800 })).toEqual({ width: 240, height: 180, scale: 0.5 });
    expect(computeStageSize("fullscreen", { width: 1280, height: 720 })).toEqual({ width: 960, height: 720, scale: 2 });
    expect(computeStageSize("normal", { width: 320, height: 800 }).height).toBe(240);
  });
});
