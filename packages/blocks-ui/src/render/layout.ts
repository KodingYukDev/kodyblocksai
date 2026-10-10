/**
 * Tata letak & path blok. Port baris-demi-baris BlockSvg.render dari scratch-blocks 1.1.206
 * core/block_render_svg_vertical.js (Apache-2.0, (c) Google Inc. & MIT Scratch Team): renderCompute_,
 * computeInputWidth_/Height_, computeRightEdge_, computeOutputPadding_, renderDraw_ (Top/Right/Bottom/Left),
 * renderFields_, renderInputShape_, drawStatementInput*, renderDefineBlock_, getAlignedCursor_.
 * Hanya LTR (bahasa id/en).
 */
import {
  OUTPUT_SHAPE_HEXAGONAL,
  OUTPUT_SHAPE_ROUND,
  OUTPUT_SHAPE_SQUARE,
  type OutputShape,
} from "../blocks/json-types";
import { measureField, type FieldInstance, type FieldSize } from "./fields";
import { DUMMY_INPUT, INPUT_VALUE, NEXT_STATEMENT, type BlockInstance, type InputInstance } from "./instantiate";
import { GRID_UNIT, BLOCK_METRICS as M, PATHS, SHAPE_IN_SHAPE_PADDING } from "./metrics";
import type { TextMeasurer } from "./text-measure";

export interface PlacedField {
  field: FieldInstance;
  size: FieldSize;
  /** translate() grup field relatif blok. */
  x: number;
  y: number;
}

export interface PlacedInputShape {
  path: string;
  x: number;
  y: number;
  argType: "boolean" | "round" | "square";
}

export interface ChildPlacement {
  kind: "value" | "statement" | "next";
  inputName?: string;
  x: number;
  y: number;
  layout: BlockLayout;
}

export interface BlockLayout {
  block: BlockInstance;
  /** this.width / this.height Blockly (height termasuk takik bawah). */
  width: number;
  height: number;
  path: string;
  edgeShape: OutputShape | null;
  startHat: boolean;
  fields: PlacedField[];
  inputShapes: PlacedInputShape[];
  children: ChildPlacement[];
  /** getHeightWidth(): ukuran blok + tumpukan di bawahnya. */
  stackWidth: number;
  stackHeight: number;
  /** atribut data-shapes (renderClassify_). */
  shapes: string;
}

const INLINE = -1; // Blockly.BlockSvg.INLINE

interface MeasuredField {
  field: FieldInstance;
  size: FieldSize;
  renderWidth: number;
  renderSep: number;
}

interface MeasuredInput {
  input: InputInstance;
  child: BlockLayout | null;
  fields: MeasuredField[];
  renderHeight: number;
  renderWidth: number;
  fieldWidth: number;
}

interface Row {
  type: number;
  inputs: MeasuredInput[];
  height: number;
  paddingStart: number;
  paddingEnd: number;
  statementNotchAtBottom: boolean;
}

interface Rows {
  rows: Row[];
  rightEdge: number;
  bottomEdge: number;
  statementEdge: number;
  hasStatement: boolean;
}

const isLabel = (f: FieldInstance): boolean => f.kind === "label" || f.kind === "label_serializable";

/** BlockSvg.getOutputShape untuk koneksi input (Connection.getOutputShape). */
function connectionOutputShape(check: string[] | null): OutputShape {
  if (!check) return OUTPUT_SHAPE_ROUND;
  if (check.includes("Boolean")) return OUTPUT_SHAPE_HEXAGONAL;
  if (check.includes("Number")) return OUTPUT_SHAPE_ROUND;
  if (check.includes("String")) return OUTPUT_SHAPE_SQUARE;
  return OUTPUT_SHAPE_ROUND;
}

/** Bentuk output blok yang terhubung (Blockly.Block.getOutputShape, default null -> diperlakukan 0). */
const blockOutputShape = (b: BlockInstance): number => b.outputShape ?? 0;

function lastConnectionInStack(b: BlockInstance): boolean {
  let cur: BlockInstance | null = b;
  while (cur) {
    if (!cur.hasNext) return false;
    if (!cur.next) return true;
    cur = cur.next;
  }
  return false;
}

const isRenderShadowed = (b: BlockInstance): boolean => b.isShadow && !b.isArgumentReporterShadow;

function computeInputHeight(b: BlockInstance, row: Row, previousRow: Row | undefined): number {
  if (b.inputList.length === 1 && b.hasOutput && isRenderShadowed(b)) return M.MIN_BLOCK_Y_SINGLE_FIELD_OUTPUT;
  if (b.hasOutput) return b.isScratchExtension ? M.MIN_BLOCK_Y_REPORTER + 2 * GRID_UNIT : M.MIN_BLOCK_Y_REPORTER;
  if (row.type === NEXT_STATEMENT) return M.MIN_STATEMENT_INPUT_HEIGHT;
  if (previousRow && previousRow.type === NEXT_STATEMENT) return M.EXTRA_STATEMENT_ROW_Y;
  if (b.isScratchExtension && b.hasPrevious) return M.MIN_BLOCK_Y + 2 * GRID_UNIT;
  return M.MIN_BLOCK_Y;
}

function computeInputWidth(input: InputInstance): number {
  if (input.type === INPUT_VALUE && !input.target) {
    switch (connectionOutputShape(input.check)) {
      case OUTPUT_SHAPE_SQUARE:
        return M.INPUT_SHAPE_SQUARE_WIDTH;
      case OUTPUT_SHAPE_ROUND:
        return M.INPUT_SHAPE_ROUND_WIDTH;
      case OUTPUT_SHAPE_HEXAGONAL:
        return M.INPUT_SHAPE_HEXAGONAL_WIDTH;
    }
  }
  return 0;
}

function computeRightEdge(b: BlockInstance, curEdge: number, hasStatement: boolean): number {
  let edge = curEdge;
  if (b.hasPrevious || b.hasNext) edge = Math.max(edge, M.MIN_BLOCK_X);
  else if (b.hasOutput) edge = Math.max(edge, isRenderShadowed(b) ? M.MIN_BLOCK_X_SHADOW_OUTPUT : M.MIN_BLOCK_X_OUTPUT);
  if (hasStatement) edge = Math.max(edge, M.MIN_BLOCK_X_WITH_STATEMENT);
  return edge;
}

function computeOutputPadding(b: BlockInstance, rows: Row[]): void {
  if (!b.outputShape || !b.hasOutput || isRenderShadowed(b)) return;
  if (rows.length > 1) return;
  const row = rows[0];
  if (!row) return;
  const shape = b.outputShape;
  row.paddingStart = 0;
  row.paddingEnd = 0;
  const first = row.inputs[0];
  if (!first) return;
  let other: number;
  if (first.fields[0]) {
    other = 0;
  } else {
    other = first.input.target ? blockOutputShape(first.input.target) : connectionOutputShape(first.input.check);
    if (shape === OUTPUT_SHAPE_HEXAGONAL && other !== OUTPUT_SHAPE_HEXAGONAL) {
      row.paddingStart += (first.renderHeight - M.MIN_BLOCK_Y_REPORTER) / 2;
    }
  }
  row.paddingStart += SHAPE_IN_SHAPE_PADDING[shape][other as 0 | 1 | 2 | 3] ?? 0;
  const last = row.inputs[row.inputs.length - 1];
  if (last && last.input.type === INPUT_VALUE) {
    other = last.input.target ? blockOutputShape(last.input.target) : connectionOutputShape(last.input.check);
    if (shape === OUTPUT_SHAPE_HEXAGONAL && other !== OUTPUT_SHAPE_HEXAGONAL) {
      row.paddingEnd += (last.renderHeight - M.MIN_BLOCK_Y_REPORTER) / 2;
    }
  } else {
    other = 0;
  }
  row.paddingEnd += SHAPE_IN_SHAPE_PADDING[shape][other as 0 | 1 | 2 | 3] ?? 0;
}

function renderCompute(b: BlockInstance, iconWidth: number, measurer: TextMeasurer, childOf: (i: InputInstance) => BlockLayout | null): Rows {
  const rows: Row[] = [];
  let fieldStatementWidth = 0;
  let hasStatement = false;
  let lastType: number | undefined;
  let previousRow: Row | undefined;
  for (const input of b.inputList) {
    const isSecondInputOnProcedure = b.opcode === "procedures_definition" && lastType === NEXT_STATEMENT;
    let row: Row;
    if (!isSecondInputOnProcedure && (lastType === undefined || lastType === NEXT_STATEMENT || input.type === NEXT_STATEMENT)) {
      lastType = input.type;
      row = {
        type: input.type !== NEXT_STATEMENT ? INLINE : NEXT_STATEMENT,
        inputs: [],
        height: 0,
        paddingStart: M.SEP_SPACE_X,
        paddingEnd: M.SEP_SPACE_X,
        statementNotchAtBottom: true,
      };
      rows.push(row);
    } else {
      row = rows[rows.length - 1] as Row;
    }
    const child = childOf(input);
    const mi: MeasuredInput = { input, child, fields: [], renderHeight: 0, renderWidth: 0, fieldWidth: 0 };
    row.inputs.push(mi);
    mi.renderHeight = computeInputHeight(b, row, previousRow);
    mi.renderWidth = computeInputWidth(input);
    row.statementNotchAtBottom = true;
    if (input.type === NEXT_STATEMENT && input.target && !lastConnectionInStack(input.target)) {
      row.statementNotchAtBottom = false;
    }
    if (input.type !== DUMMY_INPUT) {
      let paddedHeight = 0;
      let paddedWidth = 0;
      if (child) {
        paddedHeight = child.stackHeight;
        paddedWidth = child.stackWidth;
      } else {
        paddedHeight = M.INPUT_SHAPE_HEIGHT;
      }
      if (input.type === INPUT_VALUE) paddedHeight += 2 * M.INLINE_PADDING_Y;
      if (input.type === NEXT_STATEMENT && row.statementNotchAtBottom) paddedHeight -= M.NOTCH_HEIGHT;
      mi.renderHeight = Math.max(mi.renderHeight, paddedHeight);
      mi.renderWidth = Math.max(mi.renderWidth, paddedWidth);
    }
    row.height = Math.max(row.height, mi.renderHeight);
    mi.fieldWidth = rows.length === 1 ? iconWidth : 0;
    let previousFieldEditable = false;
    input.fieldRow.forEach((field, j) => {
      if (j !== 0) mi.fieldWidth += M.SEP_SPACE_X;
      const size = measureField(field, b.isShadow, measurer);
      const mf: MeasuredField = {
        field,
        size,
        renderWidth: size.width,
        renderSep: previousFieldEditable && field.editable ? M.SEP_SPACE_X : 0,
      };
      mi.fields.push(mf);
      if (!isSecondInputOnProcedure) mi.fieldWidth += mf.renderWidth + mf.renderSep;
      row.height = Math.max(row.height, size.height);
      previousFieldEditable = field.editable;
    });
    if (row.type === NEXT_STATEMENT) {
      hasStatement = true;
      fieldStatementWidth = Math.max(fieldStatementWidth, mi.fieldWidth);
    }
    previousRow = row;
  }
  computeOutputPadding(b, rows);
  return {
    rows,
    statementEdge: M.STATEMENT_INPUT_EDGE_WIDTH + fieldStatementWidth,
    rightEdge: computeRightEdge(b, 0, hasStatement),
    bottomEdge: rows.reduce((s, r) => s + r.height, 0),
    hasStatement,
  };
}

function inputShapeInfo(shape: OutputShape): { path: string; argType: PlacedInputShape["argType"] } {
  switch (shape) {
    case OUTPUT_SHAPE_HEXAGONAL:
      return { path: PATHS.INPUT_SHAPE_HEXAGONAL, argType: "boolean" };
    case OUTPUT_SHAPE_ROUND:
      return { path: PATHS.INPUT_SHAPE_ROUND, argType: "round" };
    default:
      return { path: PATHS.INPUT_SHAPE_SQUARE, argType: "square" };
  }
}

function alignedCursor(cursorX: number, mi: MeasuredInput, rightEdge: number): number {
  if (mi.input.align === "RIGHT") return cursorX + rightEdge - mi.fieldWidth - 2 * M.SEP_SPACE_X;
  if (mi.input.align === "CENTRE") return Math.max(cursorX, rightEdge / 2 - mi.fieldWidth / 2);
  return cursorX;
}

/** Hasil kerja renderDraw_. */
interface DrawState {
  b: BlockInstance;
  steps: (string | number)[];
  width: number;
  edgeShapeWidth: number;
  edgeShape: OutputShape | null;
  fields: PlacedField[];
  inputShapes: PlacedInputShape[];
  children: ChildPlacement[];
}

function renderFields(st: DrawState, fields: MeasuredField[], startX: number, cursorY: number): number {
  let cursorX = startX;
  const first = st.b.inputList[0]?.fieldRow[0];
  for (const mf of fields) {
    const f = mf.field;
    if (st.b.hasPrevious && !isLabel(f) && f.kind !== "image") cursorX = Math.max(cursorX, M.INPUT_AND_FIELD_MIN_X);
    let yOffset = -mf.size.height / 2;
    if (st.b.isScratchExtension && f === first && f.kind === "image" && st.b.hasPrevious) yOffset += GRID_UNIT;
    if (st.b.isScratchExtension && !st.b.hasPrevious && st.b.hasNext && f.kind === "separator") {
      f.lineHeight = M.ICON_SEPARATOR_HEIGHT - GRID_UNIT;
    }
    st.fields.push({ field: f, size: mf.size, x: cursorX + mf.renderSep, y: cursorY + yOffset });
    if (mf.renderWidth) cursorX += mf.renderSep + mf.renderWidth + M.SEP_SPACE_X;
  }
  return cursorX;
}

function drawStatementInput(steps: DrawState["steps"], cursorX: number, rightEdge: number, row: Row): void {
  const R = M.CORNER_RADIUS;
  steps.push(PATHS.BOTTOM_RIGHT_CORNER);
  steps.push("H", cursorX + M.STATEMENT_INPUT_INNER_SPACE + 2 * R);
  steps.push(PATHS.NOTCH_RIGHT);
  steps.push("h", "-" + M.STATEMENT_INPUT_INNER_SPACE);
  steps.push(PATHS.INNER_TOP_LEFT_CORNER);
  steps.push("v", row.height - 2 * R);
  steps.push(PATHS.INNER_BOTTOM_LEFT_CORNER);
  if (row.statementNotchAtBottom) {
    steps.push("h ", M.STATEMENT_INPUT_INNER_SPACE);
    steps.push(PATHS.NOTCH_LEFT);
  }
  steps.push("H", rightEdge - R);
}

function renderDefineBlock(st: DrawState, r: Rows, mi: MeasuredInput, row: Row, cursorY: number): void {
  const second = row.inputs.length === 2 ? row.inputs[1] : undefined;
  let rightSide: number;
  if (mi.child) {
    rightSide = r.statementEdge + mi.child.stackWidth + M.DEFINE_BLOCK_PADDING_RIGHT;
  } else {
    rightSide = Math.max(M.MIN_BLOCK_X_WITH_STATEMENT, r.rightEdge) + M.DEFINE_BLOCK_PADDING_RIGHT;
  }
  rightSide -= M.DEFINE_HAT_CORNER_RADIUS;
  if (second) {
    const fieldStart = rightSide + 3 * M.SEP_SPACE_X;
    rightSide += second.fields[0]?.size.width ?? 0;
    rightSide += 2 * M.SEP_SPACE_X;
    renderFields(st, second.fields, fieldStart, cursorY + M.MIN_STATEMENT_INPUT_HEIGHT);
  }
  st.steps.push("H", rightSide);
  st.steps.push(PATHS.TOP_RIGHT_CORNER_DEFINE_HAT);
  row.height += 3 * GRID_UNIT;
  st.steps.push("v", row.height);
  row.height += GRID_UNIT;
}

function renderDrawRight(st: DrawState, r: Rows, iconWidth: number): number {
  const { b, steps } = st;
  let cursorY = 0;
  r.rows.forEach((row, y) => {
    let cursorX = row.paddingStart + (y === 0 ? iconWidth : 0);
    if (row.type === INLINE) {
      for (const mi of row.inputs) {
        const fieldY = cursorY + row.height / 2;
        const fieldX = alignedCursor(cursorX, mi, r.rightEdge);
        cursorX = renderFields(st, mi.fields, fieldX, fieldY);
        if (mi.input.type === INPUT_VALUE) {
          if (b.hasPrevious) cursorX = Math.max(cursorX, M.INPUT_AND_FIELD_MIN_X);
          const connectionY = cursorY + row.height / 2;
          if (mi.child) {
            st.children.push({ kind: "value", inputName: mi.input.name, x: cursorX, y: connectionY - mi.child.height / 2, layout: mi.child });
          } else {
            const info = inputShapeInfo(connectionOutputShape(mi.input.check));
            st.inputShapes.push({ ...info, x: cursorX, y: connectionY - M.INPUT_SHAPE_HEIGHT / 2 });
          }
          cursorX += mi.renderWidth + M.SEP_SPACE_X;
        }
      }
      cursorX -= M.SEP_SPACE_X;
      cursorX += row.paddingEnd;
      r.rightEdge = Math.max(cursorX, r.rightEdge);
      cursorX = Math.max(cursorX, r.rightEdge);
      st.width = Math.max(st.width, cursorX);
      if (!st.edgeShape) {
        steps.push("H", cursorX - M.CORNER_RADIUS - st.edgeShapeWidth);
        steps.push(PATHS.TOP_RIGHT_CORNER);
        steps.push("v", row.height - M.CORNER_RADIUS * 2);
      } else {
        steps.push("H", cursorX - st.edgeShapeWidth);
      }
    } else if (row.type === NEXT_STATEMENT) {
      const mi = row.inputs[0] as MeasuredInput;
      renderFields(st, mi.fields, cursorX, cursorY + M.MIN_STATEMENT_INPUT_HEIGHT);
      cursorX = r.statementEdge + M.NOTCH_WIDTH;
      if (b.opcode === "procedures_definition") renderDefineBlock(st, r, mi, row, cursorY);
      else drawStatementInput(steps, cursorX, r.rightEdge, row);
      if (mi.child) {
        st.children.push({ kind: "statement", inputName: mi.input.name, x: cursorX - M.NOTCH_WIDTH, y: cursorY, layout: mi.child });
        st.width = Math.max(st.width, r.statementEdge + mi.child.stackWidth);
      }
      const nextRow = r.rows[y + 1];
      if (b.opcode !== "procedures_definition" && (y === r.rows.length - 1 || nextRow?.type === NEXT_STATEMENT)) {
        steps.push(PATHS.TOP_RIGHT_CORNER);
        steps.push("v", M.EXTRA_STATEMENT_ROW_Y - 2 * M.CORNER_RADIUS);
        cursorY += M.EXTRA_STATEMENT_ROW_Y;
      }
    }
    cursorY += row.height;
  });
  if (st.edgeShape === OUTPUT_SHAPE_ROUND) {
    steps.push(`a ${st.edgeShapeWidth} ${st.edgeShapeWidth} 0 0 1 0 ${st.edgeShapeWidth * 2}`);
  } else if (st.edgeShape === OUTPUT_SHAPE_HEXAGONAL) {
    steps.push(`l ${st.edgeShapeWidth} ${st.edgeShapeWidth} l ${-st.edgeShapeWidth} ${st.edgeShapeWidth}`);
  }
  if (!r.rows.length) {
    cursorY = M.MIN_BLOCK_Y;
    steps.push("V", cursorY);
  }
  return cursorY;
}

function classify(b: BlockInstance, startHat: boolean, edgeShape: OutputShape | null): string {
  const shapes: string[] = [];
  if (b.hasOutput) {
    shapes.push(b.isShadow ? "argument" : "reporter");
    if (edgeShape === OUTPUT_SHAPE_HEXAGONAL) shapes.push("boolean");
    else if (edgeShape === OUTPUT_SHAPE_ROUND) shapes.push("round");
  } else {
    const statementCount = b.inputList.filter((i) => i.type === NEXT_STATEMENT).length;
    if (statementCount) shapes.push("c-block", "c-" + statementCount);
    if (startHat) shapes.push("hat");
    else if (!statementCount) shapes.push("stack");
    if (!b.hasNext) shapes.push("end");
  }
  return shapes.join(" ");
}

/** Ekstensi reporter digeser 1 grid (BlockSvg.render). */
function iconOffset(b: BlockInstance): number {
  return b.isScratchExtension && b.hasOutput ? GRID_UNIT : 0;
}

/** Hitung layout satu blok beserta semua anak & blok berikutnya. */
export function layoutBlock(b: BlockInstance, measurer: TextMeasurer): BlockLayout {
  const childLayouts = new Map<InputInstance, BlockLayout>();
  for (const input of b.inputList) if (input.target) childLayouts.set(input, layoutBlock(input.target, measurer));
  const iconWidth = iconOffset(b);
  const r = renderCompute(b, iconWidth, measurer, (i) => childLayouts.get(i) ?? null);

  const startHat = !b.hasOutput && !b.hasPrevious;
  let squareTopLeft = startHat;
  if (startHat) r.rightEdge = Math.max(r.rightEdge, M.START_HAT_MIN_WIDTH);
  let edgeShapeWidth = 0;
  let edgeShape: OutputShape | null = null;
  if (b.hasOutput && (b.outputShape === OUTPUT_SHAPE_HEXAGONAL || b.outputShape === OUTPUT_SHAPE_ROUND)) {
    edgeShapeWidth = r.bottomEdge / 2;
    edgeShape = b.outputShape;
    squareTopLeft = true;
  }
  const st: DrawState = { b, steps: [], width: 0, edgeShapeWidth, edgeShape, fields: [], inputShapes: [], children: [] };
  const steps = st.steps;
  // renderDrawTop_
  if (b.opcode === "procedures_definition") {
    steps.push("m 0, 0");
    steps.push(PATHS.TOP_LEFT_CORNER_DEFINE_HAT);
  } else {
    if (squareTopLeft) {
      steps.push("m 0,0");
      if (startHat) steps.push(PATHS.START_HAT);
      if (edgeShapeWidth) steps.push("m " + edgeShapeWidth + ",0");
    } else {
      steps.push(PATHS.TOP_LEFT_CORNER_START);
      steps.push(PATHS.TOP_LEFT_CORNER);
    }
    if (b.hasPrevious) {
      steps.push("H", M.NOTCH_START_PADDING);
      steps.push(PATHS.NOTCH_LEFT);
    }
  }
  st.width = r.rightEdge;
  const cursorY = renderDrawRight(st, r, iconWidth);
  // renderDrawBottom_
  let height = cursorY;
  if (!edgeShape) steps.push(PATHS.BOTTOM_RIGHT_CORNER);
  if (b.hasNext) {
    steps.push("H", M.NOTCH_WIDTH + M.NOTCH_START_PADDING + M.CORNER_RADIUS, " ");
    steps.push(PATHS.NOTCH_RIGHT);
    height += M.NOTCH_HEIGHT;
  }
  if (!edgeShape) {
    steps.push("H", M.CORNER_RADIUS);
    steps.push(PATHS.BOTTOM_LEFT_CORNER);
  } else {
    steps.push("H", edgeShapeWidth);
  }
  // renderDrawLeft_
  if (edgeShape === OUTPUT_SHAPE_ROUND) {
    steps.push(`a ${edgeShapeWidth} ${edgeShapeWidth} 0 0 1 0 -${edgeShapeWidth * 2}`);
  } else if (edgeShape === OUTPUT_SHAPE_HEXAGONAL) {
    steps.push(`l ${-edgeShapeWidth} ${-edgeShapeWidth} l ${edgeShapeWidth} ${-edgeShapeWidth}`);
  }
  steps.push("z");

  let stackWidth = st.width;
  let stackHeight = height;
  if (b.next) {
    const next = layoutBlock(b.next, measurer);
    st.children.push({ kind: "next", x: 0, y: cursorY, layout: next });
    stackHeight += next.stackHeight - M.NOTCH_HEIGHT;
    stackWidth = Math.max(stackWidth, next.stackWidth);
  }
  return {
    block: b,
    width: st.width,
    height,
    path: steps.join(" "),
    edgeShape,
    startHat,
    fields: st.fields,
    inputShapes: st.inputShapes,
    children: st.children,
    stackWidth,
    stackHeight,
    shapes: classify(b, startHat, edgeShape),
  };
}
