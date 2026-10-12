/**
 * ProjectModel -> project.json (sb3) yang bisa dibuka scratch.mit.edu. Port logika
 * serializePrimitiveBlock, serializeInputs, serializeFields, serializeBlock, compressInputTree,
 * serializeBlocks, serializeCostume, serializeSound, serializeVariables, serializeComments,
 * serializeTarget, serializeMonitors, dan serialize dari scratch-vm 4.8.102
 * src/serialization/sb3.js (BSD-3-Clause, lihat THIRD_PARTY.md).
 */
import {
  MathUtil,
  type Block,
  type BlockField,
  type BlockInput,
  type CommentState,
  type CostumeState,
  type MonitorState,
  type ProjectModel,
  type SoundState,
  type TargetState,
  type VariableState,
} from "@kody/engine";
import { getExtensionIdForOpcode } from "./opcode-check";
import { SB3_PRIMITIVE as P } from "./sb3-types";
import type {
  SB3Block,
  SB3BlockEntry,
  SB3Comment,
  SB3Costume,
  SB3Input,
  SB3Monitor,
  SB3Primitive,
  SB3Project,
  SB3Sound,
  SB3Target,
} from "./sb3-types";

/** Versi yang ditulis ke meta.vm. Harus cocok pola skema sb3 `^\d+\.\d+\.\d+($|-)`. */
export const KODY_VM_VERSION = "0.1.0-kodyblocks";

export interface SerializeOptions {
  /** meta.agent; default navigator.userAgent atau "none" (seperti scratch-vm). */
  agent?: string;
  /** Sertakan `extensionState` per target (diabaikan Scratch). Default true. */
  includeExtensionState?: boolean;
}

const PRIMITIVE_INFO: Readonly<Record<string, [number, string]>> = {
  math_number: [P.MATH_NUM_PRIMITIVE, "NUM"],
  math_positive_number: [P.POSITIVE_NUM_PRIMITIVE, "NUM"],
  math_whole_number: [P.WHOLE_NUM_PRIMITIVE, "NUM"],
  math_integer: [P.INTEGER_NUM_PRIMITIVE, "NUM"],
  math_angle: [P.ANGLE_NUM_PRIMITIVE, "NUM"],
  colour_picker: [P.COLOR_PICKER_PRIMITIVE, "COLOUR"],
  text: [P.TEXT_PRIMITIVE, "TEXT"],
  event_broadcast_menu: [P.BROADCAST_PRIMITIVE, "BROADCAST_OPTION"],
  data_variable: [P.VAR_PRIMITIVE, "VARIABLE"],
  data_listcontents: [P.LIST_PRIMITIVE, "LIST"],
};

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

function serializePrimitiveBlock(block: Block): SB3Primitive | null {
  if (!hasOwn(PRIMITIVE_INFO, block.opcode)) return null;
  const [kind, fieldName] = PRIMITIVE_INFO[block.opcode]!;
  const field = block.fields[fieldName];
  const desc: (string | number | null | undefined)[] = [kind, field?.value];
  if (block.opcode === "event_broadcast_menu") {
    desc.push(field?.id);
  } else if (block.opcode === "data_variable" || block.opcode === "data_listcontents") {
    desc.push(field?.id);
    if (block.topLevel) {
      desc.push(block.x ? Math.round(block.x) : 0);
      desc.push(block.y ? Math.round(block.y) : 0);
    }
  }
  return desc as SB3Primitive;
}

function serializeInputs(inputs: Record<string, BlockInput>): Record<string, SB3Input> {
  const obj: Record<string, SB3Input> = {};
  for (const name of Object.keys(inputs)) {
    const input = inputs[name]!;
    if (input.block === input.shadow) obj[name] = [P.INPUT_SAME_BLOCK_SHADOW, input.block];
    else if (input.shadow === null) obj[name] = [P.INPUT_BLOCK_NO_SHADOW, input.block];
    else obj[name] = [P.INPUT_DIFF_BLOCK_SHADOW, input.block, input.shadow];
  }
  return obj;
}

function serializeFields(fields: Record<string, BlockField>): SB3Block["fields"] {
  const obj: SB3Block["fields"] = {};
  for (const name of Object.keys(fields)) {
    const field = fields[name]!;
    obj[name] = hasOwn(field, "id") ? [field.value, field.id ?? null] : [field.value];
  }
  return obj;
}

function serializeBlock(block: Block): SB3BlockEntry {
  const primitive = serializePrimitiveBlock(block);
  if (primitive) return primitive;
  const obj: SB3Block = {
    opcode: block.opcode,
    // Penting: `next: null` tetap ditulis (catatan scratch-vm).
    next: block.next,
    parent: block.parent,
    inputs: serializeInputs(block.inputs),
    fields: serializeFields(block.fields),
    shadow: block.shadow,
    topLevel: false,
  };
  if (block.topLevel) {
    obj.topLevel = true;
    obj.x = block.x ? Math.round(block.x) : 0;
    obj.y = block.y ? Math.round(block.y) : 0;
  }
  if (block.mutation) obj.mutation = structuredClone(block.mutation) as unknown as SB3Block["mutation"];
  if (block.comment) obj.comment = block.comment;
  return obj;
}

/** Ganti id primitif di input dengan primitifnya langsung, lalu hapus entri primitif itu. */
function compressInputTree(block: SB3BlockEntry, blocks: Record<string, SB3BlockEntry>): SB3BlockEntry {
  if (Array.isArray(block)) return block;
  for (const name of Object.keys(block.inputs)) {
    const input = block.inputs[name] as unknown as (string | SB3Primitive | null | number)[];
    for (let i = 1; i < input.length; i++) {
      const ref = input[i];
      if (!ref || typeof ref !== "string") continue;
      const target = blocks[ref];
      if (Array.isArray(target)) {
        input[i] = target;
        delete blocks[ref];
      }
    }
  }
  return block;
}

function serializeBlocks(blocks: Record<string, Block>): [Record<string, SB3BlockEntry>, string[]] {
  const obj: Record<string, SB3BlockEntry> = {};
  const extensionIds = new Set<string>();
  for (const id of Object.keys(blocks)) {
    const block = blocks[id]!;
    obj[id] = serializeBlock(block);
    const ext = getExtensionIdForOpcode(block.opcode);
    if (ext) extensionIds.add(ext);
  }
  // for-in scratch-vm tidak mengunjungi kunci yang dihapus di tengah jalan.
  for (const id of Object.keys(obj)) {
    if (!hasOwn(obj, id)) continue;
    obj[id] = compressInputTree(obj[id]!, obj);
  }
  // Hapus primitif top-level yang bukan variabel/list (shadow yatim, LLK/scratch-vm#1011).
  for (const id of Object.keys(obj)) {
    const entry = obj[id]!;
    if (Array.isArray(entry) && entry[0] !== P.VAR_PRIMITIVE && entry[0] !== P.LIST_PRIMITIVE) delete obj[id];
  }
  return [obj, Array.from(extensionIds)];
}

function serializeCostume(c: CostumeState): SB3Costume {
  return {
    name: c.name,
    bitmapResolution: c.bitmapResolution,
    dataFormat: c.dataFormat.toLowerCase(),
    assetId: c.assetId,
    md5ext: c.md5ext,
    rotationCenterX: c.rotationCenterX,
    rotationCenterY: c.rotationCenterY,
  };
}

function serializeSound(s: SoundState): SB3Sound {
  return {
    name: s.name,
    assetId: s.assetId,
    dataFormat: s.dataFormat.toLowerCase(),
    rate: s.rate,
    sampleCount: s.sampleCount,
    md5ext: s.md5ext,
  };
}

function serializeVariables(variables: Record<string, VariableState>): Pick<SB3Target, "variables" | "lists" | "broadcasts"> {
  const out: Pick<SB3Target, "variables" | "lists" | "broadcasts"> = { variables: {}, lists: {}, broadcasts: {} };
  for (const id of Object.keys(variables)) {
    const v = variables[id]!;
    if (v.type === "broadcast_msg") {
      out.broadcasts[id] = typeof v.value === "string" ? v.value : v.name;
      continue;
    }
    if (v.type === "list") {
      out.lists[id] = [v.name, Array.isArray(v.value) ? v.value.slice() : []];
      continue;
    }
    const value = Array.isArray(v.value) ? String(v.value) : v.value;
    out.variables[id] = v.isCloud ? [v.name, value, true] : [v.name, value];
  }
  return out;
}

function serializeComments(comments: Record<string, CommentState>): Record<string, SB3Comment> {
  const obj: Record<string, SB3Comment> = {};
  for (const id of Object.keys(comments)) {
    const c = comments[id]!;
    obj[id] = {
      blockId: c.blockId,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      minimized: c.minimized,
      text: c.text,
    };
  }
  return obj;
}

function serializeTarget(
  t: TargetState,
  layerOrder: number,
  extensions: Set<string>,
  options: SerializeOptions,
): SB3Target {
  const vars = serializeVariables(t.variables);
  const [blocks, targetExtensions] = serializeBlocks(t.blocks);
  const currentCostume =
    t.currentCostume < 0 || t.currentCostume >= t.costumes.length
      ? MathUtil.clamp(t.currentCostume, 0, t.costumes.length - 1)
      : t.currentCostume;
  const obj: SB3Target = {
    isStage: t.isStage,
    name: t.isStage ? "Stage" : t.name,
    variables: vars.variables,
    lists: vars.lists,
    broadcasts: vars.broadcasts,
    blocks,
    comments: serializeComments(t.comments),
    currentCostume,
    costumes: t.costumes.map(serializeCostume),
    sounds: t.sounds.map(serializeSound),
    volume: t.volume,
    layerOrder,
  };
  if (t.isStage) {
    obj.tempo = t.tempo ?? 60;
    obj.videoTransparency = t.videoTransparency ?? 50;
    obj.videoState = t.videoState ?? "on";
    obj.textToSpeechLanguage = t.textToSpeechLanguage ?? null;
  } else {
    obj.visible = t.visible ?? true;
    obj.x = t.x ?? 0;
    obj.y = t.y ?? 0;
    obj.size = t.size ?? 100;
    obj.direction = t.direction ?? 90;
    obj.draggable = t.draggable ?? false;
    obj.rotationStyle = t.rotationStyle ?? "all around";
  }
  if (options.includeExtensionState !== false && t.extensionState && Object.keys(t.extensionState).length > 0) {
    (obj as SB3Target & { extensionState?: unknown }).extensionState = structuredClone(t.extensionState);
  }
  for (const ext of targetExtensions) extensions.add(ext);
  return obj;
}

function serializeMonitors(monitors: MonitorState[]): SB3Monitor[] {
  return monitors.map((m) => {
    const out: SB3Monitor = {
      id: m.id,
      mode: m.mode,
      opcode: m.opcode,
      params: { ...m.params },
      spriteName: m.spriteName,
      value: Array.isArray(m.value) ? m.value.slice() : m.value,
      width: m.width,
      height: m.height,
      x: m.x,
      y: m.y,
      visible: m.visible,
    };
    if (m.mode !== "list") {
      out.sliderMin = m.sliderMin;
      out.sliderMax = m.sliderMax;
      out.isDiscrete = m.isDiscrete;
    }
    return out;
  });
}

function defaultAgent(): string {
  return typeof navigator !== "undefined" && typeof navigator.userAgent === "string" ? navigator.userAgent : "none";
}

/** ProjectModel -> objek project.json. Model tidak dimodifikasi. */
export function serializeProject(model: ProjectModel, options: SerializeOptions = {}): SB3Project {
  const extensions = new Set<string>();
  // Stage selalu 0 (lapisan background; skema sb3 mewajibkan 0), sprite = peringkat + 1.
  const sprites = model.targets.filter((t) => !t.isStage);
  const spriteRanks = MathUtil.reducedSortOrdering(sprites.map((t) => t.layerOrder));
  const rankOf = new Map(sprites.map((t, i) => [t, (spriteRanks[i] ?? i) + 1]));
  const targets = model.targets.map((t) => serializeTarget(t, rankOf.get(t) ?? 0, extensions, options));
  const meta: SB3Project["meta"] = { semver: "3.0.0", vm: KODY_VM_VERSION, agent: options.agent ?? defaultAgent() };
  if (model.meta.origin) meta.origin = model.meta.origin;
  return {
    targets,
    monitors: serializeMonitors(model.monitors),
    extensions: Array.from(extensions),
    meta,
  };
}

/** JSON.stringify seperti StringUtil.stringify scratch-vm: NaN/Infinity -> 0. */
export function stringifyProject(project: SB3Project): string {
  return JSON.stringify(project, (_key, value: unknown) => {
    if (typeof value === "number" && (value === Infinity || value === -Infinity || Number.isNaN(value))) return 0;
    return value;
  });
}

/**
 * Satu sprite -> objek sprite.json (.sprite3), seperti sb3.serialize(runtime, targetId): target tunggal
 * tanpa layerOrder. Daftar ekstensi ditambahkan sebagai `extensions` (diabaikan scratch-parser, membantu
 * pemuat kita memasang ekstensi lebih dulu).
 */
export function serializeSprite(target: TargetState, options: SerializeOptions = {}): SB3Target & { extensions: string[] } {
  if (target.isStage) throw new Error("Stage tidak bisa diekspor sebagai sprite");
  const extensions = new Set<string>();
  const obj = serializeTarget(target, 1, extensions, options) as SB3Target & { extensions: string[] };
  delete (obj as Partial<SB3Target>).layerOrder;
  obj.extensions = Array.from(extensions);
  return obj;
}
