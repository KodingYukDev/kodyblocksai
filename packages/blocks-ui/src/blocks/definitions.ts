/**
 * Adaptor definisi JSON (registri) -> `BlockDefinition` kontrak blocks-ui (types.ts).
 * Teks sudah di-resolve ke bahasa terpilih; bentuk & kategori dari katalog opcode engine bila ada.
 */
import { getOpcodeSpec, type BlockShape, type OpcodeCategory } from "@kody/engine";
import type { ArgSpec, BlockDefinition, CategoryColours } from "../types";
import { OUTPUT_SHAPE_HEXAGONAL, jsonLine, type ScratchArgJson, type ScratchBlockJson } from "./json-types";
import { resolveMessage, type BlockLocale } from "./messages";
import type { BlockRegistry } from "./registry";

const CATEGORY_BY_JSON: Record<string, OpcodeCategory> = {
  motion: "motion",
  looks: "looks",
  sounds: "sound",
  events: "events",
  control: "control",
  sensing: "sensing",
  operators: "operators",
  data: "variables",
  "data-lists": "lists",
  more: "myBlocks",
};

const CATEGORY_BY_PREFIX: [string, OpcodeCategory][] = [
  ["motion_", "motion"],
  ["looks_", "looks"],
  ["sound_", "sound"],
  ["event_", "events"],
  ["control_", "control"],
  ["sensing_", "sensing"],
  ["operator_", "operators"],
  ["data_", "variables"],
  ["procedures_", "myBlocks"],
  ["argument_", "myBlocks"],
  ["pen_", "pen"],
  ["music_", "music"],
  ["ai", "ai"],
];

function categoryOf(opcode: string, json: ScratchBlockJson): OpcodeCategory {
  const spec = getOpcodeSpec(opcode);
  if (spec) return spec.category;
  if (typeof json.category === "string" && CATEGORY_BY_JSON[json.category]) return CATEGORY_BY_JSON[json.category] as OpcodeCategory;
  for (const [prefix, cat] of CATEGORY_BY_PREFIX) if (opcode.startsWith(prefix)) return cat;
  return "shadow";
}

const has = (json: ScratchBlockJson, ext: string): boolean => (json.extensions ?? []).includes(ext);

function shapeOf(opcode: string, json: ScratchBlockJson): BlockShape {
  const spec = getOpcodeSpec(opcode);
  if (spec) return spec.shape;
  const output = json.output !== undefined || ["output_number", "output_string", "output_boolean"].some((e) => has(json, e));
  if (opcode.includes("_menu_")) return "shadow";
  if (output) return json.outputShape === OUTPUT_SHAPE_HEXAGONAL || has(json, "output_boolean") ? "boolean" : "reporter";
  const prev = json.previousStatement !== undefined || has(json, "shape_statement") || has(json, "shape_end");
  const next = json.nextStatement !== undefined || has(json, "shape_statement") || has(json, "shape_hat");
  let statements = 0;
  for (let n = 0; ; n++) {
    const line = jsonLine(json, n);
    if (!line) break;
    statements += line.args.filter((a) => a.type === "input_statement").length;
  }
  if (!prev) return "hat";
  if (statements >= 2) return "c2";
  if (statements === 1) return next ? "c" : "c-cap";
  return next ? "command" : "cap";
}

const checkOf = (c: ScratchArgJson["check"]): "Boolean" | "Number" | "String" | null => {
  const v = Array.isArray(c) ? c[0] : c;
  return v === "Boolean" || v === "Number" || v === "String" ? v : null;
};

function argSpec(a: ScratchArgJson, locale: BlockLocale): ArgSpec {
  const name = a.name ?? "";
  const options = (a.options ?? []).map(([t, v]): [string, string] => [resolveMessage(t, locale), v]);
  switch (a.type) {
    case "input_value":
      return { type: "input_value", name, check: checkOf(a.check) };
    case "input_statement":
      return { type: "input_statement", name };
    case "field_dropdown":
    case "field_numberdropdown":
    case "field_textdropdown":
      return { type: "field_dropdown", name, options };
    case "field_variable":
      return { type: "field_variable", name, variableTypes: (a.variableTypes ?? [""]) as ("" | "list" | "broadcast_msg")[] };
    case "field_variable_getter":
      return { type: "field_variable_getter", name, variableType: a.variableType === "list" ? "list" : "" };
    case "field_number": {
      const s: ArgSpec = { type: "field_number", name };
      if (a.value !== undefined) s.value = Number(a.value);
      if (a.min !== undefined) s.min = a.min;
      if (a.max !== undefined) s.max = a.max;
      if (a.precision !== undefined) s.precision = a.precision;
      return s;
    }
    case "field_angle":
      return a.value !== undefined ? { type: "field_angle", name, value: Number(a.value) } : { type: "field_angle", name };
    case "field_colour_slider":
      return a.colour !== undefined ? { type: "field_colour_slider", name, colour: a.colour } : { type: "field_colour_slider", name };
    case "field_note":
      return a.value !== undefined ? { type: "field_note", name, value: Number(a.value) } : { type: "field_note", name };
    case "field_matrix":
      return { type: "field_matrix", name };
    case "field_image":
      return { type: "field_image", src: a.src ?? "", width: a.width ?? 0, height: a.height ?? 0, flipRtl: a.flip_rtl ?? false };
    case "field_vertical_separator":
      return { type: "field_image", src: "", width: 1, height: 40 };
    case "field_label_serializable":
      return { type: "field_label_serializable", name };
    default:
      return a.text !== undefined ? { type: "field_input", name, text: a.text } : { type: "field_input", name };
  }
}

/** Definisi kontrak untuk satu opcode dari JSON-nya. */
export function toBlockDefinition(opcode: string, json: ScratchBlockJson, locale: BlockLocale): BlockDefinition {
  const messages: string[] = [];
  const args: ArgSpec[][] = [];
  for (let n = 0; ; n++) {
    const line = jsonLine(json, n);
    if (!line) break;
    messages.push(resolveMessage(line.message, locale));
    args.push(line.args.map((a) => argSpec(a, locale)));
  }
  const shape = shapeOf(opcode, json);
  const def: BlockDefinition = { opcode, category: categoryOf(opcode, json), shape, messages, args };
  if (json.colour !== undefined && json.category !== undefined && !(json.extensions ?? []).some((e) => e.startsWith("colours_"))) {
    const colours: CategoryColours = {
      primary: json.colour,
      secondary: json.colourSecondary ?? json.colour,
      tertiary: json.colourTertiary ?? json.colour,
      quaternary: json.colourQuaternary ?? json.colourTertiary ?? json.colour,
    };
    def.colours = colours;
  }
  if (json.checkboxInFlyout) def.checkboxInFlyout = true;
  if (shape === "reporter" || shape === "boolean") {
    def.output = shape === "boolean" ? "Boolean" : has(json, "output_number") && !has(json, "output_string") ? "Number" : "String";
  }
  if (shape === "hat") def.isHat = true;
  const icon = has(json, "scratch_extension") ? json.args0?.[0] : undefined;
  if (icon?.type === "field_image" && icon.src) def.iconURI = icon.src;
  return def;
}

/** Semua definisi di registri (core + ekstensi terdaftar) dalam bahasa terpilih. */
export function blockDefinitions(registry: BlockRegistry, locale: BlockLocale): BlockDefinition[] {
  const out: BlockDefinition[] = [];
  for (const opcode of registry.opcodes()) {
    const json = registry.get(opcode);
    if (json) out.push(toBlockDefinition(opcode, json, locale));
  }
  return out;
}
