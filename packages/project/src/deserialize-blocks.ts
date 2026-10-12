/**
 * Blok sb3 terkompresi -> blok model (bentuk memori scratch-vm). Port logika
 * deserializeInputDesc/deserializeInputs/deserializeFields/deserializeBlocks dari scratch-vm
 * 4.8.102 src/serialization/sb3.js (BSD-3-Clause, lihat THIRD_PARTY.md).
 * Urutan kunci hasil sama dengan scratch-vm (primitif top-level dipindah ke akhir dengan id baru),
 * karena urutan ini menentukan urutan skrip -> urutan thread.
 */
import type { Block, BlockField, BlockInput, BlockMutation, VariableType } from "@kody/engine";
import { SB3_PRIMITIVE as P } from "./sb3-types";
import type { IssueReport } from "./report";
import { hasOwn, isObject, isString, type Json, type JsonObject } from "./validate-util";

const PRIMITIVE_OPCODES: Record<number, [opcode: string, field: string]> = {
  [P.MATH_NUM_PRIMITIVE]: ["math_number", "NUM"],
  [P.POSITIVE_NUM_PRIMITIVE]: ["math_positive_number", "NUM"],
  [P.WHOLE_NUM_PRIMITIVE]: ["math_whole_number", "NUM"],
  [P.INTEGER_NUM_PRIMITIVE]: ["math_integer", "NUM"],
  [P.ANGLE_NUM_PRIMITIVE]: ["math_angle", "NUM"],
  [P.COLOR_PICKER_PRIMITIVE]: ["colour_picker", "COLOUR"],
  [P.TEXT_PRIMITIVE]: ["text", "TEXT"],
  [P.BROADCAST_PRIMITIVE]: ["event_broadcast_menu", "BROADCAST_OPTION"],
  [P.VAR_PRIMITIVE]: ["data_variable", "VARIABLE"],
  [P.LIST_PRIMITIVE]: ["data_listcontents", "LIST"],
};

const FIELD_VARIABLE_TYPE: Record<string, VariableType> = {
  BROADCAST_OPTION: "broadcast_msg",
  VARIABLE: "",
  LIST: "list",
};

export interface BlockBuildContext {
  report: IssueReport;
  path: string;
  /** Pembuat id baru untuk primitif. */
  makeId: () => string;
}

type Entry = Json | Block;
/** Penyimpanan kerja. Map (bukan objek + delete) agar tetap cepat untuk project besar; urutan sisip sama. */
type Store = Map<string, Entry>;

function freshId(ctx: BlockBuildContext, blocks: Store, raw: JsonObject): string {
  for (let i = 0; i < 1000; i++) {
    const id = ctx.makeId();
    if (!blocks.has(id) && !hasOwn(raw, id)) return id;
  }
  throw new Error("makeId menghasilkan id bentrok terus-menerus");
}

function fieldValue(v: Json | undefined): string | number {
  if (typeof v === "string" || typeof v === "number") return v;
  if (v === null || v === undefined) return "";
  return String(v);
}

/** Buat blok dari primitif [jenis, ...]; mengembalikan id barunya. */
function deserializePrimitive(
  ctx: BlockBuildContext,
  desc: Json[],
  parentId: string | null,
  isShadow: boolean,
  blocks: Store,
  raw: JsonObject,
): string | null {
  const kind = desc[0] as number;
  const info = PRIMITIVE_OPCODES[kind];
  if (!info) return null; // validasi sudah menolak; jaga-jaga seperti scratch-vm (log.error -> null)
  const [opcode, fieldName] = info;
  const id = freshId(ctx, blocks, raw);
  const field: BlockField = { name: fieldName, value: fieldValue(desc[1]) };
  const block: Block = {
    id,
    opcode,
    next: null,
    parent: parentId,
    inputs: {},
    fields: { [fieldName]: field },
    shadow: isShadow,
    topLevel: false,
  };
  if (kind === P.BROADCAST_PRIMITIVE || kind === P.VAR_PRIMITIVE || kind === P.LIST_PRIMITIVE) {
    field.id = desc[2] as string;
    field.variableType = FIELD_VARIABLE_TYPE[fieldName];
  }
  if ((kind === P.VAR_PRIMITIVE || kind === P.LIST_PRIMITIVE) && desc.length > 3) {
    block.topLevel = true;
    block.x = desc[3] as number;
    block.y = desc[4] as number;
  }
  blocks.set(id, block);
  return id;
}

function inputDesc(
  ctx: BlockBuildContext,
  v: Json | undefined,
  parentId: string,
  isShadow: boolean,
  blocks: Store,
  raw: JsonObject,
): string | null {
  if (Array.isArray(v)) return deserializePrimitive(ctx, v, parentId, isShadow, blocks, raw);
  return isString(v) ? v : null;
}

function deserializeInputs(
  ctx: BlockBuildContext,
  inputs: Json | undefined,
  parentId: string,
  blocks: Store,
  raw: JsonObject,
): Record<string, BlockInput> {
  const out: Record<string, BlockInput> = {};
  if (!isObject(inputs)) return out;
  for (const name of Object.keys(inputs)) {
    const desc = inputs[name];
    if (!Array.isArray(desc)) continue;
    let block: string | null = null;
    let shadow: string | null = null;
    if (desc[0] === 1) {
      block = shadow = inputDesc(ctx, desc[1], parentId, true, blocks, raw);
    } else if (desc[0] === 2) {
      block = inputDesc(ctx, desc[1], parentId, false, blocks, raw);
    } else {
      block = inputDesc(ctx, desc[1], parentId, false, blocks, raw);
      shadow = inputDesc(ctx, desc[2], parentId, true, blocks, raw);
    }
    out[name] = { name, block, shadow };
  }
  return out;
}

function deserializeFields(fields: Json | undefined): Record<string, BlockField> {
  const out: Record<string, BlockField> = {};
  if (!isObject(fields)) return out;
  for (const name of Object.keys(fields)) {
    const desc = fields[name];
    if (!Array.isArray(desc)) continue;
    const field: BlockField = { name, value: fieldValue(desc[0]) };
    if (desc.length > 1) field.id = desc[1] as string | null;
    const vt = FIELD_VARIABLE_TYPE[name];
    if (vt !== undefined) field.variableType = vt;
    out[name] = field;
  }
  return out;
}

function deserializeMutation(m: JsonObject): BlockMutation {
  const out: BlockMutation = { ...(m as Record<string, unknown>), tagName: "mutation", children: [] };
  if (Array.isArray(m.children)) {
    out.children = m.children.filter(isObject).map((c) => deserializeMutation(c));
  }
  return out;
}

function deserializeBlockObject(
  ctx: BlockBuildContext,
  id: string,
  b: JsonObject,
  blocks: Store,
  raw: JsonObject,
): Block {
  const block: Block = {
    id,
    opcode: b.opcode as string,
    next: isString(b.next) ? b.next : null,
    parent: isString(b.parent) ? b.parent : null,
    inputs: deserializeInputs(ctx, b.inputs, id, blocks, raw),
    fields: deserializeFields(b.fields),
    shadow: b.shadow === true,
    topLevel: b.topLevel === true,
  };
  if (typeof b.x === "number") block.x = b.x;
  if (typeof b.y === "number") block.y = b.y;
  if (isObject(b.mutation)) block.mutation = deserializeMutation(b.mutation);
  if (isString(b.comment)) block.comment = b.comment;
  return block;
}

/** Putuskan referensi ke blok yang tidak ada (sudah dilaporkan validasi sebagai peringatan). */
function repairDanglingRefs(blocks: Record<string, Block>): void {
  const exists = (id: string | null): boolean => id !== null && hasOwn(blocks, id);
  for (const block of Object.values(blocks)) {
    if (block.next !== null && !exists(block.next)) block.next = null;
    if (block.parent !== null && !exists(block.parent)) block.parent = null;
    for (const input of Object.values(block.inputs)) {
      if (input.shadow !== null && !exists(input.shadow)) input.shadow = null;
      if (input.block !== null && !exists(input.block)) input.block = input.shadow;
    }
  }
}

/**
 * `target.blocks` sb3 -> Record<id, Block>. Tidak memodifikasi `raw`.
 * Mengikuti for-in scratch-vm: kunci asli diproses berurutan; primitif top-level dihapus lalu
 * dibuat ulang dengan id baru di akhir; primitif input ditambahkan di akhir sesuai urutan dibuat.
 */
export function deserializeBlocks(ctx: BlockBuildContext, raw: JsonObject): Record<string, Block> {
  const blocks: Store = new Map();
  const ids = Object.keys(raw);
  for (const id of ids) blocks.set(id, raw[id] as Json);
  for (const id of ids) {
    const entry = raw[id];
    if (Array.isArray(entry)) {
      blocks.delete(id);
      deserializePrimitive(ctx, entry, null, false, blocks, raw);
      continue;
    }
    if (isObject(entry)) blocks.set(id, deserializeBlockObject(ctx, id, entry, blocks, raw));
    else blocks.delete(id);
  }
  const result: Record<string, Block> = {};
  for (const [id, b] of blocks) result[id] = b as Block;
  repairDanglingRefs(result);
  return result;
}
