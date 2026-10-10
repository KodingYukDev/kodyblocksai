/**
 * Menggambar BlockLayout ke SVG. Setiap blok = <g class="kb-block" data-block-id> berisi path,
 * teks, field (data-field), dan anak (input/mulut). Painter ini bisa diganti implementasi
 * packages/blocks-ui/src/render selama menghasilkan atribut data yang sama (lihat open issue).
 */
import { UI_COLOURS } from "../colours";
import type { CategoryColours } from "../types";
import { svg } from "./dom";
import type { BlockLayout, LaidElement, StackLayout } from "./layout";
import { STATEMENT_INPUT_EDGE_WIDTH } from "./layout";
import { blockPath, dropdownArrowPath, hexagonPath, roundedRectPath, roundPath } from "./paths";
import { MARKER_PREFIX } from "./preview";
import { safeImageHref } from "../render/svg";

export interface PaintOptions {
  doc: Document;
  /** Blok (id) yang disorot sebagai target ganti reporter. */
  highlight?: { blockId: string; input: string } | null;
  /** Blok yang sedang dipilih (outline). */
  selected?: string | null;
}

const TEXT_DARK = UI_COLOURS.textFieldText;
const WHITE = UI_COLOURS.text;

function text(opts: PaintOptions, parent: Element, x: number, y: number, value: string, fill: string, anchor = "start"): void {
  const t = svg(opts.doc, "text", { x, y, fill, "dominant-baseline": "central", "text-anchor": anchor, class: "kb-text" }, parent);
  t.textContent = value;
}

function isMarker(id: string): boolean {
  return id.startsWith(MARKER_PREFIX);
}

/** Warna isi blok: shadow angka/teks putih, menu dropdown memakai warna sekunder kategori. */
function fillFor(layout: BlockLayout): { fill: string; stroke: string } {
  const c = layout.info.colours;
  if (!layout.shadow) return { fill: c.primary, stroke: c.tertiary };
  const fields = layout.elements.filter((e) => e.kind === "field");
  const field = fields.length === 1 && layout.elements.length === 1 ? fields[0] : undefined;
  if (field?.kind === "field") {
    if (field.style === "dropdown-in-shadow") return { fill: c.secondary, stroke: c.tertiary };
    if (field.style === "colour") return { fill: field.text, stroke: WHITE };
    if (field.style === "text-in-shadow") return { fill: UI_COLOURS.textField, stroke: c.tertiary };
  }
  // Prototype di define dan reporter argumen digambar berwarna seperti blok biasa.
  return { fill: c.primary, stroke: c.tertiary };
}

function paintField(opts: PaintOptions, g: SVGGElement, layout: BlockLayout, el: Extract<LaidElement, { kind: "field" }>, colours: CategoryColours): void {
  const fg = svg(opts.doc, "g", {
    class: `kb-field kb-field-${el.style}`,
    "data-field": el.name,
    "data-block-id": layout.id,
    transform: `translate(${el.x},${el.y})`,
  }, g);
  const midY = el.height / 2;
  switch (el.style) {
    case "label":
      text(opts, fg, 0, midY, el.text, layout.shadow ? WHITE : WHITE);
      return;
    case "colour":
      if (!layout.shadow) {
        svg(opts.doc, "path", { d: roundPath(el.width, el.height), fill: el.text, stroke: WHITE, "stroke-width": 1 }, fg);
      }
      return;
    case "dropdown": {
      svg(opts.doc, "path", { d: roundedRectPath(el.width, el.height), fill: colours.secondary, stroke: colours.tertiary, "stroke-width": 1 }, fg);
      text(opts, fg, 8, midY, el.text, WHITE);
      svg(opts.doc, "path", { d: dropdownArrowPath(el.width - 20, midY - 2), fill: "none", stroke: WHITE, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }, fg);
      return;
    }
    case "dropdown-in-shadow": {
      text(opts, fg, 8, midY, el.text, WHITE);
      svg(opts.doc, "path", { d: dropdownArrowPath(el.width - 20, midY - 2), fill: "none", stroke: WHITE, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }, fg);
      return;
    }
    default: {
      if (!layout.shadow) {
        svg(opts.doc, "path", { d: roundPath(el.width, el.height), fill: UI_COLOURS.textField, stroke: colours.tertiary }, fg);
      }
      text(opts, fg, el.width / 2, midY, el.text, TEXT_DARK, "middle");
    }
  }
}

/** Gambar satu blok beserta isinya (tanpa next). */
export function paintBlock(opts: PaintOptions, layout: BlockLayout, x: number, y: number, parentColours?: CategoryColours): SVGGElement {
  const doc = opts.doc;
  const marker = isMarker(layout.id);
  const g = svg(doc, "g", { class: "kb-block", "data-block-id": layout.id, transform: `translate(${x},${y})` });
  if (layout.shadow) g.setAttribute("data-shadow", "true");
  const colours = layout.shadow && parentColours ? { ...layout.info.colours, tertiary: parentColours.tertiary } : layout.info.colours;
  const { fill, stroke } = fillFor({ ...layout, info: { ...layout.info, colours } });
  const path = svg(doc, "path", { d: blockPath(layout), fill, stroke, "stroke-width": 1, class: "kb-block-path" }, g);
  if (marker) {
    path.setAttribute("fill", UI_COLOURS.insertionMarker);
    path.setAttribute("fill-opacity", String(UI_COLOURS.insertionMarkerOpacity));
    path.setAttribute("stroke", "none");
  }
  if (opts.selected === layout.id) path.classList.add("kb-selected");
  for (const el of layout.elements) {
    if (marker && el.kind !== "input") continue;
    switch (el.kind) {
      case "text":
        text(opts, g, el.x, el.y, el.text, WHITE);
        break;
      case "image":
        {
          const href = safeImageHref(el.src);
          if (href) svg(doc, "image", { href, x: el.x, y: el.y, width: el.width, height: el.height }, g);
        }
        break;
      case "field":
        paintField(opts, g, layout, el, layout.info.colours);
        break;
      case "input": {
        const hl = opts.highlight && opts.highlight.blockId === layout.id && opts.highlight.input === el.name;
        if (el.child) {
          if (marker) break;
          const child = paintBlock(opts, el.child, el.x, el.y, layout.info.colours);
          if (hl) child.classList.add("kb-replace");
          g.appendChild(child);
        } else {
          const isBool = el.check?.includes("Boolean");
          const d = isBool ? hexagonPath(el.width, el.height) : roundPath(el.width, el.height);
          const slot = svg(doc, "path", {
            d,
            transform: `translate(${el.x},${el.y})`,
            fill: marker ? "none" : isBool ? layout.info.colours.tertiary : UI_COLOURS.textField,
            "fill-opacity": isBool ? 0.55 : 1,
            class: "kb-empty-input",
            "data-input": el.name,
          }, g);
          if (hl) slot.classList.add("kb-replace");
        }
        break;
      }
    }
  }
  for (const seg of layout.segments) {
    if (seg.kind === "mouth" && seg.child && !marker) {
      g.appendChild(paintStack(opts, seg.child, STATEMENT_INPUT_EDGE_WIDTH, seg.y));
    }
  }
  return g;
}

/** Gambar stack; mengembalikan <g class="kb-stack"> berisi blok berurutan. */
export function paintStack(opts: PaintOptions, stack: StackLayout, x: number, y: number): SVGGElement {
  const g = svg(opts.doc, "g", { class: "kb-stack", transform: `translate(${x},${y})` });
  const first = stack.items[0];
  if (first) g.setAttribute("data-top-id", first.layout.id);
  for (const item of stack.items) g.appendChild(paintBlock(opts, item.layout, 0, item.y));
  return g;
}

/** Definisi filter glow (kuning saat skrip jalan, putih saat target ganti). Tambahkan sekali ke <defs>. */
export function glowFilters(doc: Document, defs: SVGDefsElement, prefix: string): { stack: string; replace: string } {
  const make = (id: string, colour: string, std: number): void => {
    const f = svg(doc, "filter", { id, height: "160%", width: "180%", y: "-30%", x: "-40%" }, defs);
    svg(doc, "feGaussianBlur", { in: "SourceGraphic", stdDeviation: std }, f);
    const ct = svg(doc, "feComponentTransfer", { result: "outBlur" }, f);
    svg(doc, "feFuncA", { type: "table", tableValues: `0 ${Array(16).fill(1).join(" ")}` }, ct);
    svg(doc, "feFlood", { "flood-color": colour, "flood-opacity": 1, result: "outColor" }, f);
    svg(doc, "feComposite", { in: "outColor", in2: "outBlur", operator: "in", result: "outGlow" }, f);
    svg(doc, "feComposite", { in: "SourceGraphic", in2: "outGlow", operator: "over" }, f);
  };
  const stack = `${prefix}-stackGlow`;
  const replace = `${prefix}-replaceGlow`;
  make(stack, UI_COLOURS.stackGlow, UI_COLOURS.stackGlowSize);
  make(replace, UI_COLOURS.replacementGlow, 2);
  return { stack, replace };
}
