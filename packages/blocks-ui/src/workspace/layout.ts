/**
 * Geometri blok (murni, tanpa DOM): ukuran tiap blok, posisi elemen, posisi sambungan.
 * Konstanta mengikuti scratch-blocks core/block_render_svg_vertical.js (Apache-2.0, 1.1.206):
 * GRID_UNIT 4, MIN_BLOCK_Y 48, MIN_BLOCK_Y_REPORTER 40, MIN_BLOCK_X_WITH_STATEMENT 160,
 * STATEMENT_INPUT_EDGE_WIDTH 16, START_HAT_HEIGHT 16, input bulat/heksagon 8*GU tinggi.
 */
import type { Block } from "@kody/engine";
import { getBlockInfo, type BlockInfo, type ConnCheck, type DefinitionLookup, type RowItem } from "./block-info";
import type { BlockMap } from "./tree";

export const GU = 4;
export const SEP_SPACE_X = 2 * GU;
export const MIN_BLOCK_X = 16 * GU;
export const MIN_BLOCK_Y = 12 * GU;
export const MIN_BLOCK_X_OUTPUT = 12 * GU;
export const MIN_BLOCK_X_SHADOW_OUTPUT = 10 * GU;
export const MIN_BLOCK_Y_REPORTER = 10 * GU;
export const MIN_BLOCK_Y_SINGLE_FIELD_OUTPUT = 8 * GU;
export const MIN_BLOCK_X_WITH_STATEMENT = 40 * GU;
export const MIN_STATEMENT_INPUT_HEIGHT = 6 * GU;
export const STATEMENT_INPUT_EDGE_WIDTH = 4 * GU;
export const EXTRA_STATEMENT_ROW_Y = 8 * GU;
export const START_HAT_HEIGHT = 16;
export const HAT_MIN_WIDTH = 100;
export const INPUT_SHAPE_HEIGHT = 8 * GU;
export const INPUT_SHAPE_HEXAGONAL_WIDTH = 12 * GU;
export const INPUT_SHAPE_ROUND_WIDTH = 10 * GU;
export const FIELD_HEIGHT = 8 * GU;
export const DROPDOWN_ARROW_WIDTH = 12;

export type TextMeasurer = (text: string) => number;

/** Perkiraan lebar teks 12pt Helvetica bila DOM tidak tersedia (tes, SSR). */
export const approxMeasure: TextMeasurer = (text) => Math.ceil(text.length * 7.2);

export interface LayoutDeps {
  blocks: BlockMap;
  lookup: DefinitionLookup;
  measure: TextMeasurer;
  /** Teks tampilan field (label opsi dropdown, nama variabel, dst). */
  fieldText(block: Block, fieldName: string): string;
}

export type FieldStyle = "text-in-shadow" | "dropdown" | "dropdown-in-shadow" | "colour" | "label";

export type LaidElement =
  | { kind: "text"; x: number; y: number; width: number; text: string }
  | { kind: "image"; x: number; y: number; width: number; height: number; src: string }
  | {
      kind: "field";
      x: number;
      y: number;
      width: number;
      height: number;
      name: string;
      text: string;
      style: FieldStyle;
      fieldType: string;
    }
  | {
      kind: "input";
      x: number;
      y: number;
      width: number;
      height: number;
      name: string;
      check: ConnCheck;
      child: BlockLayout | null;
    };

export interface Segment {
  kind: "row" | "mouth";
  y: number;
  height: number;
  /** Nama input statement untuk segmen "mouth". */
  name?: string;
  child?: StackLayout | null;
}

export interface BlockLayout {
  id: string;
  info: BlockInfo;
  shadow: boolean;
  width: number;
  height: number;
  elements: LaidElement[];
  segments: Segment[];
}

export interface StackLayout {
  /** Blok berurutan dengan offset y relatif terhadap atas stack. */
  items: { layout: BlockLayout; y: number }[];
  width: number;
  height: number;
}

interface Measured {
  width: number;
  height: number;
  place(x: number, centerY: number): LaidElement;
}

function measureItem(deps: LayoutDeps, block: Block, info: BlockInfo, item: RowItem, inShadow: boolean): Measured {
  if (item.kind === "text") {
    const width = deps.measure(item.text);
    return { width, height: 16, place: (x, cy) => ({ kind: "text", x, y: cy, width, text: item.text }) };
  }
  if (item.kind === "image") {
    return {
      width: item.width,
      height: item.height,
      place: (x, cy) => ({ kind: "image", x, y: cy - item.height / 2, width: item.width, height: item.height, src: item.src }),
    };
  }
  if (item.kind === "field") {
    const spec = item.spec;
    const name = "name" in spec ? spec.name : "";
    const text = deps.fieldText(block, name);
    const textW = deps.measure(text);
    let style: FieldStyle;
    let width: number;
    let height = FIELD_HEIGHT;
    if (spec.type === "field_label_serializable") {
      style = "label";
      width = textW;
      height = 16;
    } else if (spec.type === "field_colour_slider") {
      style = "colour";
      width = INPUT_SHAPE_ROUND_WIDTH;
    } else if (spec.type === "field_dropdown" || spec.type === "field_variable" || spec.type === "field_variable_getter") {
      if (spec.type === "field_variable_getter") {
        style = "label";
        width = textW;
        height = 16;
      } else {
        style = inShadow ? "dropdown-in-shadow" : "dropdown";
        width = textW + 2 * SEP_SPACE_X + DROPDOWN_ARROW_WIDTH + (inShadow ? 0 : SEP_SPACE_X);
      }
    } else {
      style = "text-in-shadow";
      width = Math.max(textW + 2 * SEP_SPACE_X, inShadow ? 0 : 2 * SEP_SPACE_X);
    }
    void info;
    return {
      width,
      height,
      place: (x, cy) => ({ kind: "field", x, y: cy - height / 2, width, height, name, text, style, fieldType: spec.type }),
    };
  }
  // input value
  const input = block.inputs[item.name];
  const childId = input?.block ?? null;
  const child = childId && deps.blocks[childId] ? layoutBlock(deps, childId, true) : null;
  const isBool = item.check?.includes("Boolean") ?? false;
  const width = child ? child.width : isBool ? INPUT_SHAPE_HEXAGONAL_WIDTH : INPUT_SHAPE_ROUND_WIDTH;
  const height = child ? child.height : INPUT_SHAPE_HEIGHT;
  return {
    width,
    height,
    place: (x, cy) => ({ kind: "input", x, y: cy - height / 2, width, height, name: item.name, check: item.check, child }),
  };
}

/** Tata letak satu baris inline mulai x=startX; kembalikan lebar isi & tinggi maks. */
function layoutRow(deps: LayoutDeps, block: Block, info: BlockInfo, items: RowItem[], inShadow: boolean) {
  const measured = items.map((it) => measureItem(deps, block, info, it, inShadow));
  let contentW = 0;
  let maxH = 0;
  measured.forEach((m, i) => {
    contentW += m.width + (i > 0 ? SEP_SPACE_X : 0);
    maxH = Math.max(maxH, m.height);
  });
  const place = (startX: number, centerY: number): LaidElement[] => {
    let x = startX;
    return measured.map((m) => {
      const el = m.place(x, centerY);
      x += m.width + SEP_SPACE_X;
      return el;
    });
  };
  return { contentW, maxH, place, firstIsInput: items[0]?.kind === "input" };
}

const cache = new WeakMap<LayoutDeps, Map<string, BlockLayout>>();

/** Layout satu blok tanpa `next`-nya. */
export function layoutBlock(deps: LayoutDeps, id: string, inInput = false): BlockLayout {
  let perDeps = cache.get(deps);
  if (!perDeps) {
    perDeps = new Map();
    cache.set(deps, perDeps);
  }
  const key = `${id}|${inInput ? 1 : 0}`;
  const hit = perDeps.get(key);
  if (hit) return hit;
  const block = deps.blocks[id];
  if (!block) throw new Error(`layoutBlock: blok ${id} tidak ada`);
  const info = getBlockInfo(block, deps.lookup, inInput);
  const result = info.output !== false ? layoutReporter(deps, block, info) : layoutStatement(deps, block, info);
  perDeps.set(key, result);
  return result;
}

function layoutReporter(deps: LayoutDeps, block: Block, info: BlockInfo): BlockLayout {
  const items = info.rows.flatMap((r) => (r.kind === "inline" ? r.items : []));
  const row = layoutRow(deps, block, info, items, block.shadow);
  const first = items[0];
  const singleField =
    block.shadow && items.length === 1 && first?.kind === "field" && first.spec.type !== "field_label_serializable";
  const minH = singleField ? MIN_BLOCK_Y_SINGLE_FIELD_OUTPUT : MIN_BLOCK_Y_REPORTER;
  const height = singleField ? minH : Math.max(minH, row.maxH + 2 * GU);
  const hex = info.outputShape === "hexagon";
  let padX: number;
  if (singleField) padX = 0;
  else if (hex) padX = Math.max(5 * GU, height / 2 - 2 * GU);
  else padX = row.firstIsInput ? 2 * GU : 3 * GU;
  const minW = singleField ? MIN_BLOCK_X_SHADOW_OUTPUT : block.shadow ? MIN_BLOCK_X_SHADOW_OUTPUT : MIN_BLOCK_X_OUTPUT;
  const width = Math.max(minW, row.contentW + 2 * padX);
  const startX = (width - row.contentW) / 2;
  let elements = row.place(singleField ? 0 : startX, height / 2);
  if (singleField) {
    elements = elements.map((el) => (el.kind === "field" ? { ...el, x: 0, y: 0, width, height } : el));
  }
  return {
    id: block.id,
    info,
    shadow: block.shadow,
    width,
    height,
    elements,
    segments: [{ kind: "row", y: 0, height }],
  };
}

function layoutStatement(deps: LayoutDeps, block: Block, info: BlockInfo): BlockLayout {
  const elements: LaidElement[] = [];
  const segments: Segment[] = [];
  let y = info.isHat ? START_HAT_HEIGHT : 0;
  let width = info.isHat ? HAT_MIN_WIDTH : MIN_BLOCK_X;
  if (info.statementInputs.length) width = MIN_BLOCK_X_WITH_STATEMENT;
  const pending: { place: (startX: number, cy: number) => LaidElement[]; y: number; h: number; rightW: number | null }[] = [];
  const lastRowIndex = info.rows.length - 1;
  info.rows.forEach((row, index) => {
    if (row.kind === "statement") {
      const input = block.inputs[row.name];
      const child = input?.block && deps.blocks[input.block] ? layoutStack(deps, input.block) : null;
      const h = Math.max(MIN_STATEMENT_INPUT_HEIGHT, child ? child.height : 0);
      segments.push({ kind: "mouth", y, height: h, name: row.name, child });
      width = Math.max(width, STATEMENT_INPUT_EDGE_WIDTH + (child ? child.width : 0));
      y += h;
      return;
    }
    const r = layoutRow(deps, block, info, row.items, false);
    const afterStatement = index > 0 && info.rows[index - 1]?.kind === "statement";
    const isBottomArm = afterStatement && index === lastRowIndex;
    let minH = MIN_BLOCK_Y;
    if (afterStatement) minH = isBottomArm ? EXTRA_STATEMENT_ROW_Y : MIN_BLOCK_Y;
    const h = Math.max(minH, r.maxH + 4 * GU);
    // lastDummyAlign RIGHT: ikon panah loop di lengan bawah C-block rata kanan.
    const onlyImages = row.items.length > 0 && row.items.every((it) => it.kind === "image");
    pending.push({ place: r.place, y, h, rightW: afterStatement && onlyImages ? r.contentW : null });
    segments.push({ kind: "row", y, height: h });
    width = Math.max(width, r.contentW + 2 * SEP_SPACE_X);
    y += h;
  });
  // Bottom arm C-block tanpa baris teks (forever/repeat tanpa ikon di definisi).
  if (info.rows[lastRowIndex]?.kind === "statement") {
    segments.push({ kind: "row", y, height: MIN_STATEMENT_INPUT_HEIGHT });
    y += MIN_STATEMENT_INPUT_HEIGHT;
  }
  if (!info.rows.length) {
    segments.push({ kind: "row", y, height: MIN_BLOCK_Y });
    y += MIN_BLOCK_Y;
  }
  for (const p of pending) {
    const startX = p.rightW !== null ? width - SEP_SPACE_X - p.rightW : SEP_SPACE_X;
    elements.push(...p.place(startX, p.y + p.h / 2));
  }
  return { id: block.id, info, shadow: block.shadow, width, height: y, elements, segments };
}

/** Layout stack mulai dari id mengikuti next. */
export function layoutStack(deps: LayoutDeps, topId: string): StackLayout {
  const items: { layout: BlockLayout; y: number }[] = [];
  let y = 0;
  let width = 0;
  let current: string | null = topId;
  const seen = new Set<string>();
  while (current && deps.blocks[current] && !seen.has(current)) {
    seen.add(current);
    const layout = layoutBlock(deps, current);
    items.push({ layout, y });
    y += layout.height;
    width = Math.max(width, layout.width);
    current = deps.blocks[current]?.next ?? null;
  }
  return { items, width, height: y };
}

// ---------------------------------------------------------------------------
// Posisi absolut & sambungan
// ---------------------------------------------------------------------------

export type ConnType = "previous" | "next" | "output" | "input" | "statement";

export interface ConnPoint {
  blockId: string;
  type: ConnType;
  /** Nama input untuk "input"/"statement". */
  input: string | null;
  x: number;
  y: number;
  check: ConnCheck;
  /** Blok yang sedang menempati (next/input/statement), null kalau kosong. */
  occupant: string | null;
}

export interface Placement {
  layout: BlockLayout;
  x: number;
  y: number;
}

/** Kunjungi setiap blok (termasuk anak di input/mulut) dengan posisi absolut. */
export function forEachPlacement(stack: StackLayout, x0: number, y0: number, fn: (p: Placement) => void): void {
  for (const item of stack.items) placeBlock(item.layout, x0, y0 + item.y, fn);
}

export function placeBlock(layout: BlockLayout, x: number, y: number, fn: (p: Placement) => void): void {
  fn({ layout, x, y });
  for (const el of layout.elements) {
    if (el.kind === "input" && el.child) placeBlock(el.child, x + el.x, y + el.y, fn);
  }
  for (const seg of layout.segments) {
    if (seg.kind === "mouth" && seg.child) forEachPlacement(seg.child, x + STATEMENT_INPUT_EDGE_WIDTH, y + seg.y, fn);
  }
}

/** Titik sambungan satu blok pada posisi absolut (x, y). */
export function connectionsOf(blocks: BlockMap, p: Placement): ConnPoint[] {
  const { layout, x, y } = p;
  const info = layout.info;
  const block = blocks[layout.id];
  const out: ConnPoint[] = [];
  const id = layout.id;
  if (info.output !== false) out.push({ blockId: id, type: "output", input: null, x, y, check: info.output, occupant: null });
  if (info.hasPrevious) out.push({ blockId: id, type: "previous", input: null, x, y, check: null, occupant: null });
  if (info.hasNext) out.push({ blockId: id, type: "next", input: null, x, y: y + layout.height, check: null, occupant: block?.next ?? null });
  for (const el of layout.elements) {
    if (el.kind !== "input" || el.name === "custom_block") continue;
    const occ = block?.inputs[el.name]?.block ?? null;
    out.push({ blockId: id, type: "input", input: el.name, x: x + el.x, y: y + el.y, check: el.check, occupant: occ });
  }
  for (const seg of layout.segments) {
    if (seg.kind !== "mouth" || !seg.name) continue;
    const occ = block?.inputs[seg.name]?.block ?? null;
    out.push({ blockId: id, type: "statement", input: seg.name, x: x + STATEMENT_INPUT_EDGE_WIDTH, y: y + seg.y, check: null, occupant: occ });
  }
  return out;
}
