import { describe, expect, it } from "vitest";
import type { Block } from "@kody/engine";
import { fromProjectBlocks, renderBlockToSvg, safeImageHref, type RenderBlock, type TextMeasurer } from "./index";

const m8: TextMeasurer = { measure: (t) => t.length * 8 };

describe("renderBlockToSvg", () => {
  const rb: RenderBlock = {
    id: "b1",
    opcode: "data_setvariableto",
    fields: { VARIABLE: "skor <x>" },
    inputs: { VALUE: { opcode: "text", shadow: true, fields: { TEXT: "a & b" } } },
  };

  it("warna primary/tertiary kategori, shadow teks putih dengan stroke induk", () => {
    const { svg } = renderBlockToSvg(rb, { measurer: m8 });
    expect(svg).toContain('stroke="#DB6E00" fill="#FF8C1A"');
    expect(svg).toMatch(/data-opcode="text"[^>]*><path [^>]*stroke="#DB6E00" fill="#FFFFFF"/);
    expect(svg).toContain('data-id="b1"');
    expect(svg).toContain('data-shapes="stack"');
  });

  it("teks di-escape dan spasi jadi NBSP", () => {
    const { svg } = renderBlockToSvg(rb, { measurer: m8 });
    expect(svg).toContain("skor &lt;x&gt;");
    expect(svg).toContain("a &amp; b");
    expect(svg).not.toContain("<x>");
  });

  it("font blok 12pt weight 500 Helvetica Neue, teks putih", () => {
    const { svg } = renderBlockToSvg({ opcode: "looks_show" }, { measurer: m8, locale: "id" });
    expect(svg).toContain('font-size="12pt"');
    expect(svg).toContain('font-weight="500"');
    expect(svg).toContain("Helvetica Neue");
    expect(svg).toContain(">tampilkan</text>");
    expect(svg).toContain('fill="#FFFFFF"');
  });

  it("glow tumpukan memakai filter stack glow #FFF200", () => {
    const { svg } = renderBlockToSvg({ opcode: "looks_show" }, { glow: true, idSuffix: "X" });
    expect(svg).toContain('<filter id="blocklyStackGlowFilterX"');
    expect(svg).toContain('flood-color="#FFF200"');
    expect(svg).toContain('filter="url(#blocklyStackGlowFilterX)"');
  });

  it("bounds hat menyertakan lengkung topi; scale zoom", () => {
    const r = renderBlockToSvg({ opcode: "event_whenflagclicked" }, { measurer: m8, scale: 0.675, locale: "en" });
    expect(r.bounds.y).toBe(-17);
    expect(r.svg).toContain('viewBox="-1 -18 146 75"');
    expect(r.svg).toContain(`width="${Math.round(146 * 0.675 * 1000) / 1000}"`);
  });

  it("colour picker: isi = warna field, stroke putih", () => {
    const { svg } = renderBlockToSvg({
      opcode: "sensing_touchingcolor",
      inputs: { COLOR: { opcode: "colour_picker", shadow: true, fields: { COLOUR: "#ff0000" } } },
    });
    expect(svg).toMatch(/data-opcode="colour_picker"[^>]*><path [^>]*stroke="#FFFFFF" fill="#ff0000"/);
  });

  it("slot boolean kosong digambar tertiary", () => {
    const { svg } = renderBlockToSvg({ opcode: "control_if" });
    expect(svg).toContain('fill="#CF8B17" d="M 16,0  h 16 l 16,16');
    expect(svg).toContain('data-argument-type="boolean"');
  });

  it("href gambar: hanya data:image atau path relatif", () => {
    expect(safeImageHref("media/repeat.svg")).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(safeImageHref("javascript:alert(1)")).toBe("");
    expect(safeImageHref("https://evil.example/x.svg")).toBe("");
    expect(safeImageHref("//evil.example/x.svg")).toBe("");
    expect(safeImageHref("data:text/html,<script>")).toBe("");
    expect(safeImageHref("static/icon.svg")).toBe("static/icon.svg");
  });
});

describe("fromProjectBlocks", () => {
  const blk = (b: Partial<Block> & { id: string; opcode: string }): Block => ({
    next: null,
    parent: null,
    inputs: {},
    fields: {},
    shadow: false,
    topLevel: false,
    ...b,
  });

  it("reporter menutupi shadow, next & field ikut", () => {
    const blocks: Record<string, Block> = {
      a: blk({ id: "a", opcode: "motion_movesteps", topLevel: true, next: "c", inputs: { STEPS: { name: "STEPS", block: "r", shadow: "s" } } }),
      s: blk({ id: "s", opcode: "math_number", shadow: true, parent: "a", fields: { NUM: { name: "NUM", value: 10 } } }),
      r: blk({ id: "r", opcode: "motion_xposition", parent: "a" }),
      c: blk({ id: "c", opcode: "looks_show", parent: "a" }),
    };
    const rb = fromProjectBlocks(blocks, "a");
    expect(rb?.inputs?.STEPS?.opcode).toBe("motion_xposition");
    expect(rb?.next?.opcode).toBe("looks_show");
    const noCover = fromProjectBlocks({ ...blocks, a: { ...blocks.a!, inputs: { STEPS: { name: "STEPS", block: "s", shadow: "s" } } } }, "a");
    expect(noCover?.inputs?.STEPS?.fields?.NUM).toEqual({ value: 10 });
  });

  it("siklus next/input dari project rusak tidak berulang tanpa akhir", () => {
    const blocks: Record<string, Block> = {
      a: blk({ id: "a", opcode: "looks_show", next: "b" }),
      b: blk({ id: "b", opcode: "looks_hide", next: "a", inputs: { X: { name: "X", block: "b", shadow: null } } }),
    };
    const rb = fromProjectBlocks(blocks, "a");
    expect(rb?.next?.opcode).toBe("looks_hide");
    expect(rb?.next?.next).toBeNull();
    expect(rb?.next?.inputs?.X).toBeNull();
    expect(fromProjectBlocks(blocks, "zzz")).toBeNull();
  });
});
