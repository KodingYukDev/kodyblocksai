/**
 * BlockInfo = bentuk & sambungan satu blok (padanan hasil jsonInit scratch-blocks):
 * previous/next/output connection, input value (dengan check), input statement, baris teks.
 * Diturunkan dari BlockDefinition (packages/blocks-ui/src/definitions) + mutation blok.
 */
import type { Block, BlockShape } from "@kody/engine";
import { CATEGORY_COLOURS, EXTENSION_COLOURS } from "../colours";
import type { ArgSpec, BlockDefinition, CategoryColours } from "../types";

/** null = menerima apa saja (Blockly: check_ null). */
export type ConnCheck = readonly string[] | null;

export type RowItem =
  | { kind: "text"; text: string }
  | { kind: "field"; spec: Exclude<ArgSpec, { type: "input_value" } | { type: "input_statement" } | { type: "field_image" }> }
  | { kind: "image"; src: string; width: number; height: number }
  | { kind: "input"; name: string; check: ConnCheck };

export type RowSpec = { kind: "inline"; items: RowItem[] } | { kind: "statement"; name: string };

export type OutputShape = "round" | "hexagon" | "square";

export interface BlockInfo {
  opcode: string;
  colours: CategoryColours;
  shape: BlockShape;
  hasPrevious: boolean;
  hasNext: boolean;
  /** false = bukan reporter. */
  output: ConnCheck | false;
  outputShape: OutputShape;
  isHat: boolean;
  rows: RowSpec[];
  /** Nama input statement berurutan (cabang pertama = first statement connection). */
  statementInputs: string[];
  checkboxInFlyout: boolean;
  iconURI?: string;
}

export const PROCEDURE_DEFINITION = "procedures_definition";
export const PROCEDURE_PROTOTYPE = "procedures_prototype";
export const PROCEDURE_CALL = "procedures_call";

const CATEGORY_TO_COLOURS: Record<string, CategoryColours> = {
  motion: CATEGORY_COLOURS.motion,
  looks: CATEGORY_COLOURS.looks,
  sound: CATEGORY_COLOURS.sounds,
  events: CATEGORY_COLOURS.event,
  control: CATEGORY_COLOURS.control,
  sensing: CATEGORY_COLOURS.sensing,
  operators: CATEGORY_COLOURS.operators,
  variables: CATEGORY_COLOURS.data,
  lists: CATEGORY_COLOURS.data_lists,
  myBlocks: CATEGORY_COLOURS.more,
  procedures: CATEGORY_COLOURS.more,
  pen: CATEGORY_COLOURS.pen,
};

export function coloursForCategory(category: string): CategoryColours {
  return CATEGORY_TO_COLOURS[category] ?? EXTENSION_COLOURS;
}

function checkOf(check: "Boolean" | "Number" | "String" | null | undefined): ConnCheck {
  // Di scratch-blocks hanya slot Boolean yang membatasi; slot bulat menerima semua reporter.
  return check === "Boolean" ? ["Boolean"] : null;
}

/** Pecah "%1 teks %2" menjadi item baris sesuai args. */
export function parseMessage(message: string, args: readonly ArgSpec[]): RowItem[] {
  const items: RowItem[] = [];
  const re = /%(\d+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const pushText = (raw: string): void => {
    const text = raw.trim();
    if (text) items.push({ kind: "text", text });
  };
  while ((m = re.exec(message)) !== null) {
    pushText(message.slice(last, m.index));
    last = m.index + m[0].length;
    const spec = args[Number(m[1]) - 1];
    if (!spec) continue;
    if (spec.type === "input_value") items.push({ kind: "input", name: spec.name, check: checkOf(spec.check) });
    else if (spec.type === "input_statement") items.push({ kind: "input", name: `__statement:${spec.name}`, check: null });
    else if (spec.type === "field_image") items.push({ kind: "image", src: spec.src, width: spec.width, height: spec.height });
    else items.push({ kind: "field", spec });
  }
  pushText(message.slice(last));
  return items;
}

function rowsFromDefinition(def: BlockDefinition): RowSpec[] {
  const rows: RowSpec[] = [];
  def.messages.forEach((message, i) => {
    const items = parseMessage(message, def.args[i] ?? []);
    const statement = items.find((it) => it.kind === "input" && it.name.startsWith("__statement:"));
    if (statement && statement.kind === "input") {
      rows.push({ kind: "statement", name: statement.name.slice("__statement:".length) });
      const rest = items.filter((it) => it !== statement);
      if (rest.length) rows.push({ kind: "inline", items: rest });
    } else {
      rows.push({ kind: "inline", items });
    }
  });
  return rows;
}

export interface ProcedureParts {
  proccode: string;
  argumentIds: string[];
  argumentNames: string[];
  argumentDefaults: string[];
  warp: boolean;
}

function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}

export function readProcedureMutation(block: Pick<Block, "mutation">): ProcedureParts {
  const m = block.mutation ?? null;
  return {
    proccode: typeof m?.proccode === "string" ? m.proccode : "",
    argumentIds: parseJsonArray(m?.argumentids),
    argumentNames: parseJsonArray(m?.argumentnames),
    argumentDefaults: parseJsonArray(m?.argumentdefaults),
    warp: m?.warp === true || m?.warp === "true",
  };
}

/**
 * Pecah proccode jadi komponen, persis createAllInputs_ scratch-blocks:
 * split(/(?=[^\\]%[nbs])/), trim, label dengan "\%" -> "%".
 */
export function splitProccode(proccode: string): { label: string; argType: "n" | "b" | "s" | null }[] {
  const parts = proccode.split(/(?=[^\\]%[nbs])/).map((c) => c.trim());
  const out: { label: string; argType: "n" | "b" | "s" | null }[] = [];
  for (const component of parts) {
    if (!component) continue;
    if (component.startsWith("%") && /^%[nbs]/.test(component)) {
      const argType = component.charAt(1) as "n" | "b" | "s";
      out.push({ label: "", argType });
      const label = component.substring(2).trim().replace(/\\%/, "%");
      if (label) out.push({ label, argType: null });
    } else {
      out.push({ label: component.replace(/\\%/, "%"), argType: null });
    }
  }
  return out;
}

function procedureRows(block: Block): RowSpec[] {
  const parts = readProcedureMutation(block);
  const items: RowItem[] = [];
  let argIndex = 0;
  for (const comp of splitProccode(parts.proccode)) {
    if (comp.argType) {
      const id = parts.argumentIds[argIndex++] ?? `arg${argIndex}`;
      items.push({ kind: "input", name: id, check: comp.argType === "b" ? ["Boolean"] : null });
    } else {
      items.push({ kind: "text", text: comp.label });
    }
  }
  return [{ kind: "inline", items }];
}

const MORE = CATEGORY_COLOURS.more;

function baseInfo(opcode: string, shape: BlockShape, colours: CategoryColours, rows: RowSpec[]): BlockInfo {
  const isHat = shape === "hat";
  const isReporter = shape === "reporter" || shape === "boolean" || shape === "shadow";
  const statementInputs = rows.flatMap((r) => (r.kind === "statement" ? [r.name] : []));
  return {
    opcode,
    colours,
    shape,
    hasPrevious: !isHat && !isReporter,
    hasNext: !isReporter && shape !== "cap" && shape !== "c-cap",
    output: isReporter ? (shape === "boolean" ? ["Boolean"] : ["String", "Number"]) : false,
    outputShape: shape === "boolean" ? "hexagon" : "round",
    isHat,
    rows,
    statementInputs,
    checkboxInFlyout: false,
  };
}

/** Info untuk blok tanpa definisi (opcode asing dari project): tetap bisa ditampilkan & diseret. */
function fallbackInfo(block: Block): BlockInfo {
  const items: RowItem[] = [{ kind: "text", text: block.opcode }];
  for (const name of Object.keys(block.fields)) {
    items.push({ kind: "field", spec: { type: "field_input", name } });
  }
  const rows: RowSpec[] = [{ kind: "inline", items }];
  for (const name of Object.keys(block.inputs)) {
    if (name.startsWith("SUBSTACK")) rows.push({ kind: "statement", name });
    else items.push({ kind: "input", name, check: null });
  }
  const shape: BlockShape = block.shadow ? "shadow" : "command";
  return baseInfo(block.opcode, shape, EXTENSION_COLOURS, rows);
}

export type DefinitionLookup = (opcode: string) => BlockDefinition | undefined;

/** Hitung BlockInfo untuk satu blok. Procedure memakai mutation; control_stop memakai hasnext. */
export function getBlockInfo(block: Block, lookup: DefinitionLookup, isReporterContext = false): BlockInfo {
  const op = block.opcode;
  if (op === PROCEDURE_CALL) return baseInfo(op, "command", MORE, procedureRows(block));
  if (op === PROCEDURE_PROTOTYPE) {
    const info = baseInfo(op, "command", MORE, procedureRows(block));
    // Prototype hanya hidup di dalam define; sambungannya tidak ikut connection DB.
    return { ...info, hasPrevious: false, hasNext: false };
  }
  if (op === PROCEDURE_DEFINITION) {
    const rows: RowSpec[] = [{ kind: "inline", items: [{ kind: "text", text: "define" }, { kind: "input", name: "custom_block", check: null }] }];
    const def = lookup(op);
    if (def?.messages[0]) {
      const items = parseMessage(def.messages[0], def.args[0] ?? []).map((it): RowItem =>
        it.kind === "input" && it.name === "__statement:custom_block" ? { kind: "input", name: "custom_block", check: null } : it,
      );
      rows[0] = { kind: "inline", items };
    }
    return baseInfo(op, "hat", def?.colours ?? MORE, rows);
  }
  const def = lookup(op);
  if (!def) {
    const info = fallbackInfo(block);
    if (isReporterContext) return { ...info, hasPrevious: false, hasNext: false, output: ["String", "Number"] };
    return info;
  }
  const colours = def.colours ?? coloursForCategory(def.category);
  const info = baseInfo(op, def.shape, colours, rowsFromDefinition(def));
  info.checkboxInFlyout = !!def.checkboxInFlyout;
  if (def.iconURI) info.iconURI = def.iconURI;
  if (def.output !== undefined && info.output !== false) {
    info.output = def.output === "Boolean" ? ["Boolean"] : def.output === null ? null : [def.output];
    if (def.output === "Boolean") info.outputShape = "hexagon";
  }
  if (op === "control_stop") {
    const hasNext = block.mutation?.hasnext;
    info.hasNext = hasNext === true || hasNext === "true";
  }
  if (def.shape === "shadow" && Object.keys(block.fields).length === 1 && !Object.keys(block.inputs).length) {
    // Menu dropdown shadow (motion_goto_menu dll.) bentuknya bulat/persegi sesuai Scratch: tetap bulat.
    info.outputShape = "round";
  }
  return info;
}

/** Blok yang tidak boleh diseret sendiri (shadow; prototype di dalam define). */
export function isDraggable(block: Block): boolean {
  return !block.shadow;
}
