/**
 * Logika "Make a Block" (custom procedure) - bentuk blok & mutation persis scratch-blocks:
 * procedures_definition > custom_block = procedures_prototype (shadow) > argument_reporter_* (shadow),
 * procedures_call dengan shadow math_number "1" (%n) / text "" (%s), tanpa shadow untuk %b.
 * Mutation prototype: proccode, argumentids, argumentnames, argumentdefaults, warp (string JSON).
 */
import type { Block, BlockMutation } from "@kody/engine";
import { PROCEDURE_CALL, PROCEDURE_DEFINITION, PROCEDURE_PROTOTYPE, readProcedureMutation, splitProccode, type ProcedureParts } from "./block-info";
import type { BlockMap } from "./tree";

export type ProcPart = { kind: "label"; text: string } | { kind: "input"; argType: "s" | "b"; name: string; id: string };

/** Escape label sebagai bagian proccode: '%' ditulis '\%' (sama seperti declaration scratch-blocks). */
function escapeLabel(text: string): string {
  return text.replace(/%/g, "\\%");
}

export function partsToProcedure(parts: readonly ProcPart[], warp: boolean): ProcedureParts {
  const codeParts: string[] = [];
  const argumentIds: string[] = [];
  const argumentNames: string[] = [];
  const argumentDefaults: string[] = [];
  for (const p of parts) {
    if (p.kind === "label") {
      const t = p.text.trim();
      if (t) codeParts.push(escapeLabel(t));
    } else {
      codeParts.push(`%${p.argType}`);
      argumentIds.push(p.id);
      argumentNames.push(p.name);
      argumentDefaults.push(p.argType === "b" ? "false" : "");
    }
  }
  return { proccode: codeParts.join(" "), argumentIds, argumentNames, argumentDefaults, warp };
}

/** Kebalikan partsToProcedure untuk membuka dialog "Edit". */
export function procedureToParts(p: ProcedureParts): ProcPart[] {
  const out: ProcPart[] = [];
  let i = 0;
  for (const c of splitProccode(p.proccode)) {
    if (c.argType) {
      out.push({ kind: "input", argType: c.argType === "b" ? "b" : "s", name: p.argumentNames[i] ?? "", id: p.argumentIds[i] ?? "" });
      i++;
    } else {
      out.push({ kind: "label", text: c.label });
    }
  }
  return out;
}

export function prototypeMutation(p: ProcedureParts): BlockMutation {
  return {
    tagName: "mutation",
    children: [],
    proccode: p.proccode,
    argumentids: JSON.stringify(p.argumentIds),
    argumentnames: JSON.stringify(p.argumentNames),
    argumentdefaults: JSON.stringify(p.argumentDefaults),
    warp: JSON.stringify(p.warp),
  };
}

export function callMutation(p: ProcedureParts): BlockMutation {
  return {
    tagName: "mutation",
    children: [],
    proccode: p.proccode,
    argumentids: JSON.stringify(p.argumentIds),
    warp: JSON.stringify(p.warp),
  };
}

function argTypes(p: ProcedureParts): ("n" | "s" | "b")[] {
  return splitProccode(p.proccode).flatMap((c) => (c.argType ? [c.argType] : []));
}

function base(id: string, opcode: string, extra: Partial<Block>): Block {
  return { id, opcode, next: null, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: false, ...extra };
}

/** Blok define baru (event create): define, prototype, argument reporter. */
export function createDefinitionBlocks(p: ProcedureParts, newId: () => string, xy: { x: number; y: number }): Block[] {
  const defId = newId();
  const protoId = newId();
  const proto = base(protoId, PROCEDURE_PROTOTYPE, { parent: defId, shadow: true, mutation: prototypeMutation(p) });
  const def = base(defId, PROCEDURE_DEFINITION, {
    topLevel: true,
    x: Math.round(xy.x),
    y: Math.round(xy.y),
    inputs: { custom_block: { name: "custom_block", block: protoId, shadow: protoId } },
  });
  const out: Block[] = [def, proto];
  argTypes(p).forEach((t, i) => {
    const argId = p.argumentIds[i];
    if (!argId) return;
    const rid = newId();
    proto.inputs[argId] = { name: argId, block: rid, shadow: rid };
    out.push(
      base(rid, t === "b" ? "argument_reporter_boolean" : "argument_reporter_string_number", {
        parent: protoId,
        shadow: true,
        fields: { VALUE: { name: "VALUE", value: p.argumentNames[i] ?? "" } },
      }),
    );
  });
  return out;
}

/** Blok panggil (procedures_call) beserta shadow input-nya. */
export function createCallBlocks(p: ProcedureParts, newId: () => string, xy?: { x: number; y: number }): Block[] {
  const callId = newId();
  const call = base(callId, PROCEDURE_CALL, { mutation: callMutation(p) });
  if (xy) {
    call.topLevel = true;
    call.x = Math.round(xy.x);
    call.y = Math.round(xy.y);
  }
  const out: Block[] = [call];
  argTypes(p).forEach((t, i) => {
    const argId = p.argumentIds[i];
    if (!argId || t === "b") return;
    const sid = newId();
    call.inputs[argId] = { name: argId, block: sid, shadow: sid };
    const isNum = t === "n";
    out.push(
      base(sid, isNum ? "math_number" : "text", {
        parent: callId,
        shadow: true,
        fields: isNum ? { NUM: { name: "NUM", value: "1" } } : { TEXT: { name: "TEXT", value: "" } },
      }),
    );
  });
  return out;
}

/** Semua mutation procedure yang didefinisikan di workspace, urut proccode (compareStrings). */
export function allProcedures(blocks: BlockMap): ProcedureParts[] {
  const seen = new Set<string>();
  const out: ProcedureParts[] = [];
  for (const b of Object.values(blocks)) {
    if (b.opcode !== PROCEDURE_PROTOTYPE) continue;
    const parts = readProcedureMutation(b);
    if (seen.has(parts.proccode)) continue;
    seen.add(parts.proccode);
    out.push(parts);
  }
  const collator = new Intl.Collator([], { sensitivity: "base", numeric: true });
  return out.sort((a, b) => collator.compare(a.proccode, b.proccode));
}

/** Ada define lain dengan proccode sama? (scratch-gui menolak nama blok kembar diam-diam: tidak dibuat). */
export function procedureExists(blocks: BlockMap, proccode: string): boolean {
  return allProcedures(blocks).some((p) => p.proccode === proccode);
}
