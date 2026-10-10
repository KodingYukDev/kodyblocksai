/**
 * RenderBlock + definisi JSON -> BlockInstance (inputList/fieldRow/koneksi) seperti hasil
 * Blockly.Block.jsonInit + interpolate_ + ekstensi vertical (scratch-blocks 1.1.206, Apache-2.0)
 * dan ProcedureUtils.createAllInputs_ (blocks_vertical/procedures.js).
 */
import { CATEGORY_COLOURS } from "../colours";
import type { BlockLocale } from "../blocks/messages";
import { resolveMessage, tokenizeInterpolation } from "../blocks/messages";
import {
  OUTPUT_SHAPE_HEXAGONAL,
  OUTPUT_SHAPE_ROUND,
  jsonLine,
  type OutputShape,
  type ScratchArgJson,
  type ScratchBlockJson,
} from "../blocks/json-types";
import { DYNAMIC_PROCEDURE_OPCODES } from "../blocks/overrides";
import type { BlockRegistry } from "../blocks/registry";
import { createField, labelField, type FieldInstance } from "./fields";
import { fieldValue, type RenderBlock } from "./model";

export const INPUT_VALUE = 1;
export const NEXT_STATEMENT = 3;
export const DUMMY_INPUT = 5;
export type InputType = typeof INPUT_VALUE | typeof NEXT_STATEMENT | typeof DUMMY_INPUT;
export type Align = "LEFT" | "RIGHT" | "CENTRE";

export interface InputInstance {
  type: InputType;
  name: string;
  check: string[] | null;
  align: Align;
  fieldRow: FieldInstance[];
  target: BlockInstance | null;
}

export interface BlockColours {
  primary: string;
  secondary: string;
  tertiary: string;
  quaternary: string;
}

export interface BlockInstance {
  id?: string;
  opcode: string;
  category?: string;
  isShadow: boolean;
  /** Blockly.scratchBlocksUtils.isShadowArgumentReporter. */
  isArgumentReporterShadow: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  hasOutput: boolean;
  outputCheck: string[] | null;
  outputShape: OutputShape | null;
  colours: BlockColours;
  isScratchExtension: boolean;
  checkboxInFlyout: boolean;
  inputList: InputInstance[];
  next: BlockInstance | null;
  /** Opcode tidak ada di registri (dirender sebagai blok perintah abu-abu berlabel opcode). */
  unknown: boolean;
}

export interface InstantiateOptions {
  registry: BlockRegistry;
  locale: BlockLocale;
}

const UNKNOWN_COLOURS: BlockColours = { primary: "#BCBCBC", secondary: "#A8A8A8", tertiary: "#8E8E8E", quaternary: "#8E8E8E" };
const TEXTFIELD = "#FFFFFF";
/** Batas kedalaman rekursi (input/next) untuk data project tak tepercaya. */
const MAX_DEPTH = 4000;

const toCheck = (c: unknown): string[] | null =>
  c === undefined || c === null || c === true ? null : Array.isArray(c) ? c.map(String) : [String(c)];

function applyJsonBasics(b: BlockInstance, json: ScratchBlockJson): void {
  if (json.colour !== undefined) {
    const primary = json.colour;
    const tertiary = json.colourTertiary ?? primary;
    b.colours = {
      primary,
      secondary: json.colourSecondary ?? primary,
      tertiary,
      quaternary: json.colourQuaternary ?? tertiary,
    };
  }
  if (json.output !== undefined) {
    b.hasOutput = true;
    b.outputCheck = toCheck(json.output);
  }
  if (json.previousStatement !== undefined) b.hasPrevious = true;
  if (json.nextStatement !== undefined) b.hasNext = true;
  if (json.outputShape !== undefined) b.outputShape = json.outputShape;
  if (json.checkboxInFlyout !== undefined) b.checkboxInFlyout = !!json.checkboxInFlyout;
  if (typeof json.category === "string") b.category = json.category;
}

function applyExtensions(b: BlockInstance, extensions: readonly string[] | undefined): void {
  for (const ext of extensions ?? []) {
    if (ext.startsWith("colours_")) {
      const key = ext.slice("colours_".length);
      if (key === "textfield") {
        b.colours = { primary: TEXTFIELD, secondary: TEXTFIELD, tertiary: TEXTFIELD, quaternary: TEXTFIELD };
      } else if (key in CATEGORY_COLOURS) {
        b.colours = { ...CATEGORY_COLOURS[key as keyof typeof CATEGORY_COLOURS] };
      }
      continue;
    }
    switch (ext) {
      case "shape_statement":
        b.hasPrevious = true;
        b.hasNext = true;
        break;
      case "shape_hat":
        b.hasNext = true;
        break;
      case "shape_end":
        b.hasPrevious = true;
        break;
      case "output_number":
        b.outputShape = OUTPUT_SHAPE_ROUND;
        b.hasOutput = true;
        b.outputCheck = ["Number"];
        break;
      case "output_string":
        b.outputShape = OUTPUT_SHAPE_ROUND;
        b.hasOutput = true;
        b.outputCheck = ["String"];
        break;
      case "output_boolean":
        b.outputShape = OUTPUT_SHAPE_HEXAGONAL;
        b.hasOutput = true;
        b.outputCheck = ["Boolean"];
        break;
      case "scratch_extension":
        b.isScratchExtension = true;
        break;
    }
  }
}

type Element = string | ScratchArgJson;

/** Port Block.interpolate_: pesan + argumen -> input dengan fieldRow. */
function interpolate(
  b: BlockInstance,
  rb: RenderBlock,
  message: string,
  args: ScratchArgJson[],
  lastDummyAlign: Align | undefined,
  opts: InstantiateOptions,
  depth: number,
): void {
  const elements: Element[] = [];
  for (const token of tokenizeInterpolation(resolveMessage(message, opts.locale))) {
    if (typeof token === "number") {
      const arg = args[token - 1];
      if (arg) elements.push(arg);
    } else {
      const t = token.trim();
      if (t) elements.push(t);
    }
  }
  const last = elements[elements.length - 1];
  if (last !== undefined && (typeof last === "string" || last.type.startsWith("field_"))) {
    const dummy: ScratchArgJson = { type: "input_dummy" };
    if (lastDummyAlign) dummy.align = lastDummyAlign;
    elements.push(dummy);
  }
  let fieldStack: FieldInstance[] = [];
  for (const el of elements) {
    if (typeof el === "string") {
      fieldStack.push(labelField(el));
      continue;
    }
    if (el.type === "input_value" || el.type === "input_statement" || el.type === "input_dummy") {
      const type: InputType = el.type === "input_value" ? INPUT_VALUE : el.type === "input_statement" ? NEXT_STATEMENT : DUMMY_INPUT;
      const name = el.name ?? "";
      const child = type === DUMMY_INPUT ? null : rb.inputs?.[name];
      b.inputList.push({
        type,
        name,
        check: toCheck(el.check),
        align: el.align ?? "LEFT",
        fieldRow: fieldStack,
        target: child ? instantiateAt(child, opts, depth + 1) : null,
      });
      fieldStack = [];
      continue;
    }
    const fv = el.name ? fieldValue(rb.fields?.[el.name]) : undefined;
    const field = createField(el, fv === undefined ? undefined : String(fv.value), opts.locale, fv?.text);
    if (field) fieldStack.push(field);
  }
}

function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== "string") return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** ProcedureUtils.createAllInputs_ + addLabelField_/addLabelEditor_. */
function buildProcedureInputs(b: BlockInstance, rb: RenderBlock, opts: InstantiateOptions, depth: number): void {
  const procCode = typeof rb.mutation?.proccode === "string" ? rb.mutation.proccode : "";
  const argumentIds = parseJsonArray(rb.mutation?.argumentids);
  const isDeclaration = rb.opcode === "procedures_declaration";
  const components = procCode.split(/(?=[^\\]%[nbs])/).map((c) => c.trim());
  let argCount = 0;
  for (const component of components) {
    if (!component) continue;
    let labelText: string;
    const type = component.substring(1, 2);
    if (component.startsWith("%") && (type === "n" || type === "b" || type === "s")) {
      labelText = component.substring(2).trim();
      const id = argumentIds[argCount] ?? `arg${argCount}`;
      const child = rb.inputs?.[id];
      b.inputList.push({
        type: INPUT_VALUE,
        name: id,
        check: type === "b" ? ["Boolean"] : null,
        align: "LEFT",
        fieldRow: [],
        target: child ? instantiateAt(child, opts, depth + 1) : null,
      });
      argCount++;
    } else {
      labelText = component;
    }
    const text = labelText.replace(/\\%/, "%");
    if (isDeclaration) {
      if (text) b.inputList.push(dummyWith([{ kind: "text_input", text, value: text, editable: true, arrow: null }]));
    } else {
      b.inputList.push(dummyWith(text ? [labelField(text)] : []));
    }
  }
}

const dummyWith = (fieldRow: FieldInstance[]): InputInstance => ({
  type: DUMMY_INPUT,
  name: "",
  check: null,
  align: "LEFT",
  fieldRow,
  target: null,
});

function instantiateAt(rb: RenderBlock, opts: InstantiateOptions, depth: number): BlockInstance {
  const json = depth > MAX_DEPTH ? undefined : opts.registry.get(rb.opcode);
  const isShadow = !!rb.shadow;
  const b: BlockInstance = {
    opcode: rb.opcode,
    isShadow,
    isArgumentReporterShadow:
      isShadow && (rb.opcode === "argument_reporter_boolean" || rb.opcode === "argument_reporter_string_number"),
    hasPrevious: false,
    hasNext: false,
    hasOutput: false,
    outputCheck: null,
    outputShape: null,
    colours: { ...UNKNOWN_COLOURS },
    isScratchExtension: false,
    checkboxInFlyout: false,
    inputList: [],
    next: null,
    unknown: !json,
  };
  if (rb.id !== undefined) b.id = rb.id;

  if (!json) {
    b.hasPrevious = true;
    b.hasNext = true;
    b.inputList.push(dummyWith([labelField(rb.opcode)]));
  } else {
    applyJsonBasics(b, json);
    for (let n = 0; ; n++) {
      const line = jsonLine(json, n);
      if (!line) break;
      interpolate(b, rb, line.message, line.args, line.lastDummyAlign, opts, depth);
    }
    applyExtensions(b, json.extensions);
    if (DYNAMIC_PROCEDURE_OPCODES.has(rb.opcode)) buildProcedureInputs(b, rb, opts, depth);
  }

  // control_stop: mutation hasnext="true" menambah nextStatement (domToMutation).
  if (rb.opcode === "control_stop") {
    const hasNext = rb.mutation?.hasnext;
    b.hasNext = hasNext === true || hasNext === "true";
  }
  if (rb.next && b.hasNext && depth <= MAX_DEPTH) b.next = instantiateAt(rb.next, opts, depth + 1);
  return b;
}

export function instantiate(rb: RenderBlock, opts: InstantiateOptions): BlockInstance {
  return instantiateAt(rb, opts, 0);
}
