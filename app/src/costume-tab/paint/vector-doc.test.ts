import { describe, expect, it } from "vitest";
import {
  CENTER_X,
  CENTER_Y,
  addShape,
  docBounds,
  docFromSvg,
  dragBox,
  emptyDoc,
  escapeXml,
  fillShape,
  hitTest,
  recenter,
  removeShape,
  serializeDoc,
  shapeBounds,
  translateShape,
  updateShape,
  type NewShape,
  type VectorShape,
} from "./vector-doc";

const rectShape = (x: number, y: number, w: number, h: number): NewShape => ({ type: "rect", x, y, w, h, fill: "#f00", stroke: "none", width: 0 });

describe("vector-doc", () => {
  it("dokumen kosong -> SVG kecil", () => {
    const s = serializeDoc(emptyDoc());
    expect(s.svg).toContain('viewBox="0 0 2 2"');
    expect(s).toMatchObject({ rotationCenterX: 1, rotationCenterY: 1 });
  });

  it("serialize memotong ke kotak batas dan menghitung pusat rotasi relatif", () => {
    const doc = addShape(emptyDoc(), rectShape(200, 150, 100, 50));
    const s = serializeDoc(doc);
    expect(s.svg).toContain('viewBox="200 150 100 50"');
    expect(s.svg).toContain('width="100" height="50"');
    expect(s.rotationCenterX).toBe(CENTER_X - 200);
    expect(s.rotationCenterY).toBe(CENTER_Y - 150);
  });

  it("docFromSvg menempatkan pusat rotasi lama di tengah kanvas lalu round-trip", () => {
    const src = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40" viewBox="0 0 60 40"><rect width="60" height="40" fill="blue"/></svg>';
    const doc = docFromSvg(src, 30, 10);
    const embed = doc.shapes[0];
    expect(embed?.type).toBe("embed");
    expect(shapeBounds(embed as VectorShape)).toEqual({ x: 210, y: 170, w: 60, h: 40 });
    const out = serializeDoc(doc);
    expect(out.rotationCenterX).toBe(30);
    expect(out.rotationCenterY).toBe(10);
    expect(out.svg).toContain('<rect width="60" height="40" fill="blue"/>');
  });

  it("docFromSvg untuk SVG kosong menghasilkan dokumen kosong", () => {
    expect(docFromSvg('<svg viewBox="-1 -1 2 2"></svg>', 0, 0).shapes).toHaveLength(0);
  });

  it("bounds memperhitungkan tebal garis", () => {
    const doc = addShape(emptyDoc(), { type: "line", x1: 0, y1: 0, x2: 10, y2: 0, stroke: "#000", width: 4 });
    expect(docBounds(doc)).toEqual({ x: -2, y: -2, w: 14, h: 4 });
  });

  it("hitTest memilih bentuk teratas", () => {
    let doc = addShape(emptyDoc(), rectShape(0, 0, 50, 50));
    doc = addShape(doc, { type: "ellipse", cx: 25, cy: 25, rx: 10, ry: 10, fill: "#0f0", stroke: "none", width: 0 });
    expect(hitTest(doc, 25, 25)?.type).toBe("ellipse");
    expect(hitTest(doc, 2, 2)?.type).toBe("rect");
    expect(hitTest(doc, 200, 200)).toBeNull();
    const p = addShape(emptyDoc(), { type: "path", points: [[0, 0], [100, 0]], stroke: "#000", width: 2 });
    expect(hitTest(p, 50, 3)?.type).toBe("path");
    expect(hitTest(p, 50, 30)).toBeNull();
  });

  it("translate, update, remove, fill, recenter", () => {
    let doc = addShape(emptyDoc(), rectShape(10, 10, 5, 5));
    const id = doc.shapes[0]?.id ?? 0;
    doc = updateShape(doc, id, (s) => translateShape(s, 5, -5));
    expect(shapeBounds(doc.shapes[0] as VectorShape)).toMatchObject({ x: 15, y: 5 });
    doc = updateShape(doc, id, (s) => fillShape(s, "#123456"));
    expect((doc.shapes[0] as { fill: string }).fill).toBe("#123456");
    doc = recenter(doc, 15, 5);
    expect(shapeBounds(doc.shapes[0] as VectorShape)).toMatchObject({ x: CENTER_X, y: CENTER_Y });
    expect(removeShape(doc, id).shapes).toHaveLength(0);
  });

  it("teks di-escape", () => {
    const doc = addShape(emptyDoc(), { type: "text", x: 0, y: 20, text: '<b>&"', size: 20, fill: "#000" });
    expect(serializeDoc(doc).svg).toContain("&lt;b&gt;&amp;&quot;");
    expect(escapeXml("'")).toBe("&apos;");
  });

  it("dragBox normalisasi & mode persegi", () => {
    expect(dragBox(10, 10, 0, 30)).toEqual({ x: 0, y: 10, w: 10, h: 20 });
    expect(dragBox(0, 0, 10, -30, true)).toEqual({ x: 0, y: -30, w: 30, h: 30 });
  });
});
