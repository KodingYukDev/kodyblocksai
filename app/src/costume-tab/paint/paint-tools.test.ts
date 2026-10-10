import { describe, expect, it } from "vitest";
import { createPixels, getPixel, parseHex } from "./bitmap-ops";
import { BitmapToolSession, DEFAULT_SETTINGS, PaintHistory, VectorToolSession, addText } from "./paint-tools";
import { CENTER_X, CENTER_Y, emptyDoc, shapeBounds, type VectorShape } from "./vector-doc";

const S = { ...DEFAULT_SETTINGS, fill: "#ff0000", stroke: "#0000ff", width: 4 };

describe("VectorToolSession", () => {
  it("rect: seret membuat kotak terisi, klik saja tidak", () => {
    const t = new VectorToolSession("rect", S);
    let doc = emptyDoc();
    t.down(doc, { x: 10, y: 10 }, null);
    const mid = t.move(doc, { x: 30, y: 20 }, {}, null);
    expect(mid.draft?.type).toBe("rect");
    const r = t.up(doc, { x: 50, y: 40 }, {}, null);
    expect(r.committed).toBe(true);
    doc = r.doc;
    expect(shapeBounds(doc.shapes[0] as VectorShape)).toEqual({ x: 10, y: 10, w: 40, h: 30 });
    t.down(doc, { x: 5, y: 5 }, null);
    expect(t.up(doc, { x: 5, y: 5 }, {}, null).committed).toBe(false);
  });

  it("line dengan shift terkunci 45 derajat", () => {
    const t = new VectorToolSession("line", S);
    t.down(emptyDoc(), { x: 0, y: 0 }, null);
    const r = t.up(emptyDoc(), { x: 100, y: 10 }, { shift: true }, null);
    const l = r.doc.shapes[0] as Extract<VectorShape, { type: "line" }>;
    expect(l.y2).toBeCloseTo(0, 6);
  });

  it("brush mengumpulkan titik; select memindah; eraser menghapus; fill mewarnai", () => {
    const brush = new VectorToolSession("brush", S);
    let doc = emptyDoc();
    brush.down(doc, { x: 0, y: 0 }, null);
    brush.move(doc, { x: 10, y: 0 }, {}, null);
    doc = brush.up(doc, { x: 20, y: 0 }, {}, null).doc;
    const path = doc.shapes[0] as Extract<VectorShape, { type: "path" }>;
    expect(path.points).toHaveLength(3);

    const sel = new VectorToolSession("select", S);
    expect(sel.down(doc, { x: 10, y: 1 }, null).selectedId).toBe(path.id);
    doc = sel.move(doc, { x: 15, y: 6 }, {}, path.id).doc;
    const up = sel.up(doc, { x: 15, y: 6 }, {}, path.id);
    expect(up.committed).toBe(true);
    expect((up.doc.shapes[0] as typeof path).points[0]).toEqual([5, 5]);

    const fill = new VectorToolSession("fill", S);
    const filled = fill.down(up.doc, { x: 15, y: 5 }, null);
    expect((filled.doc.shapes[0] as typeof path).stroke).toBe("#ff0000");

    const er = new VectorToolSession("eraser", S);
    expect(er.down(filled.doc, { x: 15, y: 5 }, null).doc.shapes).toHaveLength(0);
  });

  it("center & text", () => {
    const t = new VectorToolSession("text", S);
    const r = t.down(emptyDoc(), { x: 5, y: 6 }, null);
    expect(r.textRequest).toEqual({ x: 5, y: 6 });
    let doc = addText(emptyDoc(), { x: 5, y: 40 }, "Halo", S);
    expect(doc.shapes[0]?.type).toBe("text");
    expect(addText(doc, { x: 0, y: 0 }, "   ", S)).toBe(doc);
    doc = new VectorToolSession("center", S).down(doc, { x: 5, y: 40 }, null).doc;
    const tx = doc.shapes[0] as Extract<VectorShape, { type: "text" }>;
    expect([tx.x, tx.y]).toEqual([CENTER_X, CENTER_Y]);
  });
});

describe("BitmapToolSession", () => {
  it("brush menggambar goresan, eraser menghapus", () => {
    let px = createPixels(50, 50);
    const b = new BitmapToolSession("brush", S);
    px = b.down(px, { x: 5, y: 5 }, null).pixels;
    px = b.move(px, { x: 40, y: 5 }, {}, null).pixels;
    const r = b.up(px, { x: 40, y: 5 }, {}, null);
    expect(r.committed).toBe(true);
    expect(getPixel(r.pixels, 20, 5)).toEqual(parseHex("#0000ff"));
    const e = new BitmapToolSession("eraser", S);
    px = e.down(r.pixels, { x: 20, y: 5 }, null).pixels;
    expect(getPixel(e.up(px, { x: 20, y: 5 }, {}, null).pixels, 20, 5)[3]).toBe(0);
  });

  it("rect dirender ulang dari snapshot (pratinjau tidak menumpuk)", () => {
    const px = createPixels(50, 50);
    const t = new BitmapToolSession("rect", S);
    t.down(px, { x: 0, y: 0 }, null);
    t.move(px, { x: 40, y: 40 }, {}, null);
    const r = t.up(px, { x: 10, y: 10 }, {}, null);
    expect(getPixel(r.pixels, 5, 5)).toEqual(parseHex("#ff0000"));
    expect(getPixel(r.pixels, 30, 30)[3]).toBe(0);
  });

  it("select lalu seret memindahkan piksel", () => {
    let px = createPixels(50, 50);
    const f = new BitmapToolSession("rect", S);
    f.down(px, { x: 0, y: 0 }, null);
    px = f.up(px, { x: 10, y: 10 }, {}, null).pixels;
    const s = new BitmapToolSession("select", S);
    s.down(px, { x: 0, y: 0 }, null);
    const sel = s.up(px, { x: 10, y: 10 }, {}, null).selection;
    expect(sel).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    s.down(px, { x: 5, y: 5 }, sel);
    const moved = s.up(px, { x: 25, y: 5 }, {}, sel);
    expect(moved.committed).toBe(true);
    expect(getPixel(moved.pixels, 2, 2)[3]).toBe(0);
    expect(getPixel(moved.pixels, 22, 2)).toEqual(parseHex("#ff0000"));
    expect(moved.selection?.x).toBe(20);
  });

  it("fill & center", () => {
    const px = createPixels(10, 10);
    const r = new BitmapToolSession("fill", S).down(px, { x: 1, y: 1 }, null);
    expect(r.committed).toBe(true);
    expect(getPixel(r.pixels, 9, 9)).toEqual(parseHex("#ff0000"));
  });
});

describe("PaintHistory", () => {
  it("undo/redo dengan batas", () => {
    const h = new PaintHistory<number[]>((v) => [...v], 2);
    h.push([1]);
    h.push([2]);
    h.push([3]);
    expect(h.undo([4])).toEqual([3]);
    expect(h.undo([3])).toEqual([2]);
    expect(h.undo([2])).toBeNull();
    expect(h.redo([2])).toEqual([3]);
    expect(h.canRedo).toBe(true);
  });
});
