/**
 * Serialisasi BlockLayout -> string SVG (fungsi murni, tanpa DOM). Struktur elemen & atribut mengikuti
 * BlockSvg scratch-blocks 1.1.206 (path blocklyBlockBackground, outline input, field, anak), warna
 * mengikuti BlockSvg.updateColour.
 */
import { BLOCK_MEDIA } from "../blocks/generated/media";
import { UI_COLOURS } from "../colours";
import { displayText, type FieldInstance } from "./fields";
import type { BlockInstance } from "./instantiate";
import type { BlockLayout, PlacedField } from "./layout";
import { BLOCK_FONT, BLOCK_METRICS as M } from "./metrics";

export interface SvgOptions {
  /** Tumpukan teratas sedang berjalan (stack glow kuning). */
  glow?: boolean;
  /** Akhiran id filter agar unik per dokumen. */
  idSuffix?: string;
  /** Pemetaan src gambar field (default: media bawaan sebagai data URI). */
  resolveMedia?: (src: string) => string;
}

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

const num = (n: number): string => String(Math.round(n * 1000) / 1000);

/** Hanya data:image/* atau path relatif tanpa skema (tidak memuat URL luar dari data). */
export function safeImageHref(src: string): string {
  const mapped = BLOCK_MEDIA[src] ?? src;
  if (/^data:image\/(svg\+xml|png|jpeg|gif|webp)[;,]/i.test(mapped)) return mapped;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(mapped) && !mapped.startsWith("//")) return mapped;
  return "";
}

/** Blockly.Colours.colourPickerStroke */
const COLOUR_PICKER_STROKE = "#FFFFFF";

const isRenderShadowed = (b: BlockInstance): boolean => b.isShadow && !b.isArgumentReporterShadow;

function firstFieldIsColour(b: BlockInstance): FieldInstance | null {
  const f = b.inputList[0]?.fieldRow[0];
  return f && f.kind === "colour" ? f : null;
}

/** BlockSvg.updateColour: fill & stroke. */
export function blockPaint(b: BlockInstance, parent: BlockInstance | null): { fill: string; stroke: string } {
  const shadowed = isRenderShadowed(b);
  const colourField = firstFieldIsColour(b);
  let stroke = b.colours.tertiary;
  if (shadowed && parent) {
    stroke = parent.colours.tertiary;
    if (colourField) stroke = COLOUR_PICKER_STROKE;
  }
  let fill = shadowed ? b.colours.secondary : b.colours.primary;
  // FieldColourSlider.setValue -> block.setColour(colour, colour, ...)
  if (colourField) fill = colourField.value;
  return { fill, stroke };
}

const textAttrs = (fill: string, cls: string): string =>
  `class="${cls}" fill="${fill}" font-family="${escapeXml(BLOCK_FONT.family)}" font-size="${BLOCK_FONT.sizePt}pt" ` +
  `font-weight="${BLOCK_FONT.weight}" dominant-baseline="middle" text-anchor="middle"`;

function arrowX(pf: PlacedField, textWidth: number): number {
  return textWidth + M.EDITABLE_FIELD_PADDING + M.DROPDOWN_ARROW_PADDING / 2 + (pf.size.box ? M.BOX_FIELD_PADDING : 0);
}

function renderField(pf: PlacedField, b: BlockInstance, opts: SvgOptions): string {
  const f = pf.field;
  const { width, height, arrowWidth } = pf.size;
  const t = `transform="translate(${num(pf.x)}, ${num(pf.y)})" `;
  const resolve = opts.resolveMedia ?? safeImageHref;
  const shown = escapeXml(displayText(f.text));
  switch (f.kind) {
    case "label": {
      const x = b.isShadow ? Math.max(M.FIELD_WIDTH / 2, width / 2) : width / 2;
      return `<text ${t}${textAttrs(UI_COLOURS.text, "blocklyText")} x="${num(x)}" y="${M.FIELD_TOP_PADDING}">${shown}</text>`;
    }
    case "label_serializable": {
      const x = Math.max(M.FIELD_WIDTH / 2, width / 2);
      return `<text ${t}${textAttrs(UI_COLOURS.text, "blocklyText")} x="${num(x)}" y="${M.FIELD_TOP_PADDING}">${shown}</text>`;
    }
    case "image": {
      const img = f.image;
      if (!img) return "";
      return `<g ${t}><image height="${img.height}px" width="${img.width}px" href="${escapeXml(resolve(img.src))}"/></g>`;
    }
    case "separator":
      return (
        `<g ${t}><line stroke="${b.colours.secondary}" stroke-linecap="round" x1="0" y1="0" x2="0" ` +
        `y2="${f.lineHeight ?? M.ICON_SEPARATOR_HEIGHT}"/></g>`
      );
    case "matrix":
      return renderMatrix(pf, b, t, resolve);
    default:
      break;
  }
  const parts: string[] = [`<g ${t}>`];
  const textWidth = width - arrowWidth - (pf.size.box ? 2 * M.BOX_FIELD_PADDING : 0) - (f.editable ? M.EDITABLE_FIELD_PADDING : 0);
  if (pf.size.box) {
    if (f.kind === "text_input" || f.kind === "text_dropdown") {
      parts.push(`<rect x="0" y="0" width="${num(width)}" height="${height}" fill="${b.colours.tertiary}"/>`);
    } else {
      parts.push(
        `<rect rx="${M.CORNER_RADIUS}" ry="${M.CORNER_RADIUS}" x="0" y="0" width="${num(width)}" height="${height}" ` +
          `stroke="${b.colours.tertiary}" fill="${b.colours.primary}" class="blocklyBlockBackground" fill-opacity="1"/>`,
      );
    }
  }
  let centerX = (width - arrowWidth) / 2;
  if (b.isShadow && !f.arrow) centerX = Math.max(M.FIELD_WIDTH / 2, centerX);
  let fill: string = UI_COLOURS.textFieldText;
  let cls = "blocklyText";
  if (f.kind === "dropdown" || f.kind === "variable") {
    fill = UI_COLOURS.text;
    cls += " blocklyDropdownText";
  } else if (f.kind === "variable_getter") {
    fill = UI_COLOURS.text;
  } else if (pf.size.box) {
    fill = UI_COLOURS.text;
    cls += " blocklyEditableLabel";
  }
  parts.push(`<text ${textAttrs(fill, cls)} x="${num(centerX)}" y="${height / 2 + M.FIELD_TOP_PADDING}">${shown}</text>`);
  if (f.arrow) {
    const src = f.arrow === "dark" ? "media/dropdown-arrow-dark.svg" : "media/dropdown-arrow.svg";
    parts.push(
      `<image height="${M.DROPDOWN_ARROW_SIZE}px" width="${M.DROPDOWN_ARROW_SIZE}px" ` +
        `transform="translate(${num(arrowX(pf, textWidth))},${M.DROPDOWN_ARROW_Y})" href="${escapeXml(resolve(src))}"/>`,
    );
  }
  parts.push("</g>");
  return parts.join("");
}

function renderMatrix(pf: PlacedField, b: BlockInstance, t: string, resolve: (s: string) => string): string {
  const size = M.MATRIX_THUMBNAIL_NODE_SIZE;
  const pad = M.MATRIX_THUMBNAIL_NODE_PAD;
  const thumbY = (pf.size.height - M.MATRIX_THUMBNAIL_SIZE) / 2;
  const value = (pf.field.value + "0".repeat(25)).slice(0, 25);
  const rects: string[] = [];
  for (let i = 0; i < 5; i++) {
    for (let n = 0; n < 5; n++) {
      const on = value[i * 5 + n] !== "0";
      rects.push(
        `<rect x="${(size + pad) * n + pad}" y="${(size + pad) * i + pad}" width="${size}" height="${size}" ` +
          `rx="${pad}" ry="${pad}" fill="${on ? "#FFFFFF" : b.colours.primary}"/>`,
      );
    }
  }
  const ax = M.MATRIX_THUMBNAIL_SIZE + M.DROPDOWN_ARROW_PADDING * 1.5;
  const ay = (pf.size.height - M.DROPDOWN_ARROW_SIZE) / 2;
  return (
    `<g ${t}><g transform="translate(${M.DROPDOWN_ARROW_PADDING / 2}, ${num(thumbY)})">${rects.join("")}</g>` +
    `<image height="${M.DROPDOWN_ARROW_SIZE}px" width="${M.DROPDOWN_ARROW_SIZE}px" transform="translate(${ax}, ${ay})" ` +
    `href="${escapeXml(resolve("media/dropdown-arrow.svg"))}"/></g>`
  );
}

/** Grup SVG satu blok (dan semua anaknya) pada posisi (x, y) relatif induk. */
export function renderBlockGroup(
  layout: BlockLayout,
  parent: BlockInstance | null,
  x: number,
  y: number,
  opts: SvgOptions = {},
  isTop = false,
): string {
  const b = layout.block;
  const { fill, stroke } = blockPaint(b, parent);
  const attrs = [
    `class="blocklyDraggable${b.isShadow ? " blocklyShadow" : ""}"`,
    `transform="translate(${num(x)},${num(y)})"`,
    `data-opcode="${escapeXml(b.opcode)}"`,
    `data-shapes="${layout.shapes}"`,
  ];
  if (b.id !== undefined) attrs.push(`data-id="${escapeXml(b.id)}"`);
  if (b.category) attrs.push(`data-category="${escapeXml(b.category)}"`);
  if (isTop && opts.glow) attrs.push(`filter="url(#blocklyStackGlowFilter${opts.idSuffix ?? ""})"`);
  const out: string[] = [`<g ${attrs.join(" ")}>`];
  out.push(
    `<path class="blocklyPath blocklyBlockBackground" stroke="${stroke}" fill="${fill}" fill-opacity="1" d="${layout.path}"/>`,
  );
  for (const s of layout.inputShapes) {
    out.push(
      `<path class="blocklyPath" fill="${b.colours.tertiary}" d="${s.path}" transform="translate(${num(s.x)},${num(s.y)})" ` +
        `data-argument-type="${s.argType}"/>`,
    );
  }
  for (const pf of layout.fields) out.push(renderField(pf, b, opts));
  for (const c of layout.children) {
    if (c.kind !== "next") out.push(renderBlockGroup(c.layout, b, c.x, c.y, opts));
  }
  for (const c of layout.children) {
    if (c.kind === "next") out.push(renderBlockGroup(c.layout, b, c.x, c.y, opts));
  }
  out.push("</g>");
  return out.join("");
}

/** <defs> filter stack glow persis inject.js (stackGlowSize 4, warna #FFF200). */
export function glowFilterDefs(idSuffix = ""): string {
  return (
    `<filter id="blocklyStackGlowFilter${idSuffix}" height="160%" width="180%" y="-30%" x="-40%">` +
    `<feGaussianBlur in="SourceGraphic" stdDeviation="${UI_COLOURS.stackGlowSize}"/>` +
    `<feComponentTransfer result="outBlur"><feFuncA type="table" tableValues="0${" 1".repeat(16)}"/></feComponentTransfer>` +
    `<feFlood flood-color="${UI_COLOURS.stackGlow}" flood-opacity="1" result="outColor"/>` +
    `<feComposite in="outColor" in2="outBlur" operator="in" result="outGlow"/>` +
    `<feComposite in="SourceGraphic" in2="outGlow" operator="over"/></filter>`
  );
}

/** Kotak pembatas visual tumpukan (termasuk lengkung topi). */
export function stackBounds(layout: BlockLayout): { x: number; y: number; width: number; height: number } {
  let top = 0;
  if (layout.block.opcode === "procedures_definition") top = -M.DEFINE_HAT_CORNER_RADIUS;
  else if (layout.startHat) top = -(M.START_HAT_HEIGHT + 1);
  return { x: 0, y: top, width: layout.stackWidth, height: layout.stackHeight - top };
}

/** Dokumen SVG lengkap untuk satu tumpukan, diskalakan `scale` (default 1). */
export function renderLayoutToSvg(layout: BlockLayout, opts: SvgOptions & { scale?: number } = {}): string {
  const scale = opts.scale ?? 1;
  const bounds = stackBounds(layout);
  const pad = 1;
  const vbX = bounds.x - pad;
  const vbY = bounds.y - pad;
  const vbW = bounds.width + 2 * pad;
  const vbH = bounds.height + 2 * pad;
  const defs = opts.glow ? `<defs>${glowFilterDefs(opts.idSuffix)}</defs>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${num(vbW * scale)}" height="${num(vbH * scale)}" viewBox="${num(vbX)} ${num(vbY)} ${num(vbW)} ${num(vbH)}">` +
    defs +
    renderBlockGroup(layout, null, 0, 0, opts, true) +
    `</svg>`
  );
}
