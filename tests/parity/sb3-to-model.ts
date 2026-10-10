/**
 * Konversi project.json (sb3) -> ProjectModel KHUSUS harness parity, agar tes parity tidak bergantung
 * pada kemajuan packages/project. Ditulis sendiri dari spesifikasi format sb3 (bentuk input
 * [1|2|3, ...], primitif [4..13, ...], field [value, id]) - bukan salinan sb3.js.
 * Id shadow primitif dibuat deterministik (`<parent>__<input>`), id target `t<index>`.
 */
import type {
  Block,
  BlockField,
  BlockInput,
  BlockMutation,
  CostumeState,
  ProjectModel,
  ScratchValue,
  SoundState,
  TargetState,
  VariableState,
} from "@kody/engine";

type Json = Record<string, unknown>;

const PRIMITIVE_OPCODES: Record<number, [opcode: string, field: string]> = {
  4: ["math_number", "NUM"],
  5: ["math_positive_number", "NUM"],
  6: ["math_whole_number", "NUM"],
  7: ["math_integer", "NUM"],
  8: ["math_angle", "NUM"],
  9: ["colour_picker", "COLOUR"],
  10: ["text", "TEXT"],
  11: ["event_broadcast_menu", "BROADCAST_OPTION"],
  12: ["data_variable", "VARIABLE"],
  13: ["data_listcontents", "LIST"],
};

const FIELD_VAR_TYPE: Record<string, BlockField["variableType"]> = {
  VARIABLE: "",
  LIST: "list",
  BROADCAST_OPTION: "broadcast_msg",
};

function decodePrimitive(
  desc: unknown,
  parent: string | null,
  isShadow: boolean,
  newId: string,
  out: Record<string, Block>,
): string | null {
  if (typeof desc === "string") return desc;
  if (!Array.isArray(desc)) return null;
  const code = desc[0] as number;
  const spec = PRIMITIVE_OPCODES[code];
  if (!spec) throw new Error(`primitif sb3 tidak dikenal: ${JSON.stringify(desc)}`);
  const [opcode, fieldName] = spec;
  const field: BlockField = { name: fieldName, value: desc[1] as string | number };
  if (code >= 11) {
    field.id = desc[2] as string;
    field.variableType = FIELD_VAR_TYPE[fieldName] ?? "";
  }
  const block: Block = {
    id: newId,
    opcode,
    next: null,
    parent,
    inputs: {},
    fields: { [fieldName]: field },
    shadow: isShadow,
    topLevel: false,
  };
  if ((code === 12 || code === 13) && desc.length > 3) {
    block.topLevel = true;
    block.parent = null;
    block.x = desc[3] as number;
    block.y = desc[4] as number;
  }
  out[newId] = block;
  return newId;
}

function decodeInputs(raw: Json, blockId: string, out: Record<string, Block>): Record<string, BlockInput> {
  const inputs: Record<string, BlockInput> = {};
  for (const [name, desc] of Object.entries(raw)) {
    if (!Array.isArray(desc)) continue;
    const kind = desc[0] as number;
    const base = `${blockId}__${name}`;
    let block: string | null = null;
    let shadow: string | null = null;
    if (kind === 1) {
      block = shadow = decodePrimitive(desc[1], blockId, true, base, out);
    } else if (kind === 2) {
      block = decodePrimitive(desc[1], blockId, false, base, out);
    } else {
      block = decodePrimitive(desc[1], blockId, false, `${base}__b`, out);
      shadow = decodePrimitive(desc[2], blockId, true, `${base}__s`, out);
    }
    inputs[name] = { name, block, shadow };
  }
  return inputs;
}

function decodeFields(raw: Json): Record<string, BlockField> {
  const fields: Record<string, BlockField> = {};
  for (const [name, desc] of Object.entries(raw)) {
    if (!Array.isArray(desc)) continue;
    const field: BlockField = { name, value: desc[0] as string | number };
    if (desc.length > 1) field.id = desc[1] as string | null;
    const vt = FIELD_VAR_TYPE[name];
    if (vt !== undefined) field.variableType = vt;
    fields[name] = field;
  }
  return fields;
}

export function decodeBlocks(raw: Json): Record<string, Block> {
  const out: Record<string, Block> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      // Variabel/list top-level terkompresi: [12, nama, id, x, y].
      decodePrimitive(value, null, false, id, out);
      continue;
    }
    const src = value as Json;
    const block: Block = {
      id,
      opcode: String(src.opcode),
      next: (src.next as string | null) ?? null,
      parent: (src.parent as string | null) ?? null,
      inputs: decodeInputs((src.inputs as Json | undefined) ?? {}, id, out),
      fields: decodeFields((src.fields as Json | undefined) ?? {}),
      shadow: Boolean(src.shadow),
      topLevel: Boolean(src.topLevel),
    };
    if (typeof src.x === "number") block.x = src.x;
    if (typeof src.y === "number") block.y = src.y;
    if (src.mutation) {
      const m = src.mutation as Json;
      block.mutation = { ...m, tagName: "mutation", children: (m.children as BlockMutation[] | undefined) ?? [] };
    }
    out[id] = block;
  }
  return out;
}

function decodeVariables(t: Json): Record<string, VariableState> {
  const vars: Record<string, VariableState> = {};
  for (const [id, v] of Object.entries((t.variables as Json | undefined) ?? {})) {
    const [name, value, isCloud] = v as [string, ScratchValue, boolean?];
    vars[id] = { id, name, type: "", value, isCloud: Boolean(isCloud) };
  }
  for (const [id, v] of Object.entries((t.lists as Json | undefined) ?? {})) {
    const [name, value] = v as [string, ScratchValue[]];
    vars[id] = { id, name, type: "list", value: [...value], isCloud: false };
  }
  for (const [id, name] of Object.entries((t.broadcasts as Json | undefined) ?? {})) {
    vars[id] = { id, name: String(name), type: "broadcast_msg", value: String(name), isCloud: false };
  }
  return vars;
}

export function sb3ToModel(project: object): ProjectModel {
  const json = JSON.parse(JSON.stringify(project)) as Json;
  const targets = (json.targets as Json[]).map((t, i): TargetState => {
    const state: TargetState = {
      id: `t${i}`,
      isStage: Boolean(t.isStage),
      name: String(t.name),
      variables: decodeVariables(t),
      blocks: decodeBlocks((t.blocks as Json | undefined) ?? {}),
      comments: {},
      currentCostume: Number(t.currentCostume ?? 0),
      costumes: (t.costumes as CostumeState[] | undefined) ?? [],
      sounds: (t.sounds as SoundState[] | undefined) ?? [],
      volume: Number(t.volume ?? 100),
      layerOrder: Number(t.layerOrder ?? i),
    };
    if (state.isStage) {
      state.tempo = Number(t.tempo ?? 60);
      state.videoTransparency = Number(t.videoTransparency ?? 50);
      state.videoState = (t.videoState as TargetState["videoState"]) ?? "off";
      state.textToSpeechLanguage = (t.textToSpeechLanguage as string | null) ?? null;
    } else {
      state.visible = Boolean(t.visible ?? true);
      state.x = Number(t.x ?? 0);
      state.y = Number(t.y ?? 0);
      state.size = Number(t.size ?? 100);
      state.direction = Number(t.direction ?? 90);
      state.draggable = Boolean(t.draggable);
      state.rotationStyle = (t.rotationStyle as TargetState["rotationStyle"]) ?? "all around";
    }
    return state;
  });
  return {
    targets,
    monitors: [],
    extensions: (json.extensions as string[] | undefined) ?? [],
    meta: { semver: "3.0.0", vm: "0.2.0", agent: "kodyblocks-parity" },
  };
}
