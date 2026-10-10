/**
 * Validasi `target.blocks` project.json mengikuti skema sb3 scratch-parser (sb3_definitions.json,
 * BSD-3) ditambah pemeriksaan keamanan: opcode tak dikenal, referensi menggantung, siklus.
 */
import { describeUnknownOpcode, isKnownOpcode } from "./opcode-check";
import type { IssueReport } from "./report";
import type { UnknownOpcodePolicy } from "./types";
import {
  checkKey,
  hasOwn,
  isBool,
  isNumber,
  isObject,
  isOptString,
  isString,
  optional,
  seg,
  type Json,
  type JsonObject,
} from "./validate-util";

const COLOR_RE = /^#[a-fA-F0-9]{6}$/;
const BOOL_STRINGS = new Set(["true", "false", "null"]);

const isStringOrNumber = (v: unknown): boolean => isString(v) || isNumber(v);

/** Cek primitif terkompresi [4..13, ...] sesuai skema. `topLevel` = hanya var/list yang sah. */
export function checkPrimitive(report: IssueReport, path: string, arr: Json[], topLevel: boolean): boolean {
  const kind = arr[0];
  const bad = (msg: string): boolean => {
    report.error("primitive", path, msg);
    return false;
  };
  if (!isNumber(kind)) return bad("primitif harus diawali angka jenis");
  if (topLevel && kind !== 12 && kind !== 13) return bad("primitif top-level hanya boleh variabel (12) atau list (13)");
  switch (kind) {
    case 4:
    case 5:
    case 6:
    case 7:
    case 8:
    case 10:
      if (arr.length !== 2 || !isStringOrNumber(arr[1])) return bad(`primitif [${kind}, nilai] tidak valid`);
      return true;
    case 9:
      if (arr.length !== 2 || !isString(arr[1]) || !COLOR_RE.test(arr[1]))
        return bad("primitif warna harus [9, \"#rrggbb\"]");
      return true;
    case 11:
      if (arr.length !== 3 || !isString(arr[1]) || !isString(arr[2]))
        return bad("primitif broadcast harus [11, nama, id]");
      return true;
    case 12:
    case 13: {
      if (arr.length < 3 || arr.length > 5 || !isString(arr[1]) || !isString(arr[2]))
        return bad(`primitif [${kind}, nama, id, x?, y?] tidak valid`);
      for (let i = 3; i < arr.length; i++) if (!isNumber(arr[i])) return bad("koordinat primitif harus angka");
      return true;
    }
    default:
      return bad(`jenis primitif tak dikenal: ${String(kind)}`);
  }
}

function checkInputs(report: IssueReport, path: string, inputs: JsonObject): void {
  for (const name of Object.keys(inputs)) {
    const p = `${path}.inputs.${seg(name)}`;
    if (!checkKey(report, p, name)) continue;
    const desc = inputs[name];
    if (!Array.isArray(desc) || desc.length < 1) {
      report.error("input", p, "input harus array [1|2|3, ...]");
      continue;
    }
    const kind = desc[0];
    if (kind !== 1 && kind !== 2 && kind !== 3) {
      report.error("input", p, "jenis input harus 1, 2, atau 3");
      continue;
    }
    for (let i = 1; i < desc.length; i++) {
      const v = desc[i];
      if (v === null || isString(v)) continue;
      if (Array.isArray(v)) checkPrimitive(report, `${p}[${i}]`, v, false);
      else report.error("input", `${p}[${i}]`, "isi input harus id blok, null, atau primitif");
    }
  }
}

function checkFields(report: IssueReport, path: string, fields: JsonObject): void {
  for (const name of Object.keys(fields)) {
    const p = `${path}.fields.${seg(name)}`;
    if (!checkKey(report, p, name)) continue;
    const desc = fields[name];
    if (!Array.isArray(desc) || desc.length < 1 || desc.length > 2) {
      report.error("field", p, "field harus [nilai] atau [nilai, id]");
      continue;
    }
    const value = desc[0];
    if (value === null || isBool(value)) {
      report.warn("field-coerced", p, "nilai field bukan teks/angka; diubah menjadi teks");
    } else if (!isStringOrNumber(value)) {
      report.error("field", p, "nilai field harus teks atau angka");
    }
    if (desc.length === 2 && !isOptString(desc[1])) report.error("field", p, "id field harus teks atau null");
  }
}

function checkMutation(report: IssueReport, path: string, m: Json): void {
  const p = `${path}.mutation`;
  if (!isObject(m)) {
    report.error("mutation", p, "mutation harus objek");
    return;
  }
  if (hasOwn(m, "tagName") && m.tagName !== "mutation") report.error("mutation", p, 'tagName harus "mutation"');
  optional(report, m, "children", p, Array.isArray, "array");
  optional(report, m, "proccode", p, isString, "teks");
  optional(report, m, "argumentids", p, isString, "teks");
  const boolish = (v: unknown): boolean => v === null || isBool(v) || (isString(v) && BOOL_STRINGS.has(v));
  optional(report, m, "warp", p, boolish, 'boolean atau "true"/"false"');
  optional(report, m, "hasnext", p, boolish, 'boolean atau "true"/"false"');
  for (const key of ["argumentids", "argumentnames", "argumentdefaults"]) {
    const raw = m[key];
    if (!isString(raw)) continue;
    let ok = false;
    try {
      const parsed: unknown = JSON.parse(raw);
      ok = Array.isArray(parsed);
    } catch {
      ok = false;
    }
    if (!ok) report.warn("mutation-json", `${p}.${key}`, "bukan array JSON yang valid");
  }
}

export interface BlockCheckContext {
  report: IssueReport;
  unknownOpcodes: UnknownOpcodePolicy;
}

/** Validasi satu blok berbentuk objek. */
function checkBlock(ctx: BlockCheckContext, path: string, block: JsonObject): void {
  const { report } = ctx;
  if (!isString(block.opcode)) {
    report.error("missing", `${path}.opcode`, "opcode wajib berupa teks");
    return;
  }
  if (!isKnownOpcode(block.opcode)) {
    const msg = describeUnknownOpcode(block.opcode);
    if (ctx.unknownOpcodes === "reject") report.error("unknown-opcode", `${path}.opcode`, msg);
    else report.warn("unknown-opcode", `${path}.opcode`, msg);
  }
  optional(report, block, "comment", path, isString, "teks");
  optional(report, block, "next", path, isOptString, "teks atau null");
  optional(report, block, "parent", path, isOptString, "teks atau null");
  optional(report, block, "topLevel", path, isBool, "boolean");
  optional(report, block, "shadow", path, isBool, "boolean");
  optional(report, block, "x", path, isNumber, "angka");
  optional(report, block, "y", path, isNumber, "angka");
  if (hasOwn(block, "inputs")) {
    if (isObject(block.inputs)) checkInputs(report, path, block.inputs);
    else report.error("type", `${path}.inputs`, "harus objek");
  }
  if (hasOwn(block, "fields")) {
    if (isObject(block.fields)) checkFields(report, path, block.fields);
    else report.error("type", `${path}.fields`, "harus objek");
  }
  if (hasOwn(block, "mutation")) checkMutation(report, path, block.mutation as Json);
}

/** Referensi anak (next + input) dari sebuah blok objek. */
function childRefs(block: JsonObject): string[] {
  const refs: string[] = [];
  if (isString(block.next)) refs.push(block.next);
  if (isObject(block.inputs)) {
    for (const desc of Object.values(block.inputs)) {
      if (!Array.isArray(desc)) continue;
      for (let i = 1; i < desc.length; i++) {
        const v = desc[i];
        if (isString(v)) refs.push(v);
      }
    }
  }
  return refs;
}

/** Cari siklus pada graf next/input (DFS iteratif) dan rantai parent. */
function checkGraph(report: IssueReport, path: string, blocks: JsonObject): void {
  const ids = Object.keys(blocks);
  const objects = new Map<string, JsonObject>();
  for (const id of ids) {
    const b = blocks[id];
    if (isObject(b)) objects.set(id, b);
  }
  for (const [id, b] of objects) {
    const p = `${path}.blocks.${seg(id)}`;
    for (const ref of childRefs(b)) {
      if (!hasOwn(blocks, ref)) report.warn("dangling-ref", p, `merujuk blok yang tidak ada (${seg(ref)}); dihapus`);
    }
    if (isString(b.parent) && !hasOwn(blocks, b.parent)) {
      report.warn("dangling-parent", p, "parent tidak ada; dijadikan null");
    }
  }

  // 0 = belum, 1 = sedang di stack, 2 = selesai
  const state = new Map<string, number>();
  for (const start of objects.keys()) {
    if (state.get(start)) continue;
    const stack: [string, string[], number][] = [[start, childRefs(objects.get(start)!), 0]];
    state.set(start, 1);
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const [node, children] = top;
      if (top[2] >= children.length) {
        state.set(node, 2);
        stack.pop();
        continue;
      }
      const child = children[top[2]++]!;
      const childBlock = objects.get(child);
      if (!childBlock) continue;
      const s = state.get(child) ?? 0;
      if (s === 1) {
        report.error("cycle", `${path}.blocks.${seg(child)}`, "susunan blok membentuk siklus (next/input)");
        return;
      }
      if (s === 0) {
        state.set(child, 1);
        stack.push([child, childRefs(childBlock), 0]);
      }
    }
  }

  const acyclic = new Set<string>();
  for (const start of objects.keys()) {
    const seen = new Set<string>();
    let cur: string | undefined = start;
    while (cur !== undefined && !acyclic.has(cur)) {
      if (seen.has(cur)) {
        report.error("cycle", `${path}.blocks.${seg(cur)}`, "rantai parent membentuk siklus");
        return;
      }
      seen.add(cur);
      const parent: Json | undefined = objects.get(cur)?.parent;
      cur = isString(parent) && objects.has(parent) ? parent : undefined;
    }
    for (const s of seen) acyclic.add(s);
  }
}

/** Validasi seluruh `blocks` satu target. Mengembalikan jumlah entri. */
export function validateBlocks(ctx: BlockCheckContext, path: string, blocks: JsonObject): number {
  const ids = Object.keys(blocks);
  for (const id of ids) {
    const p = `${path}.blocks.${seg(id)}`;
    if (!checkKey(ctx.report, p, id)) continue;
    const entry = blocks[id];
    if (Array.isArray(entry)) checkPrimitive(ctx.report, p, entry, true);
    else if (isObject(entry)) checkBlock(ctx, p, entry);
    else ctx.report.error("block", p, "blok harus objek atau primitif top-level");
  }
  if (!ctx.report.hasErrors) checkGraph(ctx.report, path, blocks);
  return ids.length;
}
