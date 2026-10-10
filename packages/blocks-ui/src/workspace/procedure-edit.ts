/**
 * "Edit" custom block: event untuk mengubah prototype di define dan semua procedures_call,
 * mengikuti scratch-blocks (ProcedureUtils.updateDeclarationProcCode_ + Procedures.editProcedureCallback_):
 * - mutation prototype & pemanggil diganti (change element "mutation"),
 * - argumen baru: reporter argumen (shadow) di prototype + shadow math_number/text di pemanggil,
 * - argumen yang dihapus: blok non-shadow di input pemanggil dilepas ke workspace (bump),
 * - nama argumen berubah: field VALUE reporter di prototype diperbarui.
 * Reporter argumen yang sudah dipakai di badan skrip TIDAK diganti namanya (sama seperti Scratch 3).
 */
import type { Block, EditorWorkspaceEvent } from "@kody/engine";
import { PROCEDURE_CALL, PROCEDURE_PROTOTYPE, readProcedureMutation, splitProccode, type ProcedureParts } from "./block-info";
import { callMutation, prototypeMutation } from "./procedures";
import { SNAP_RADIUS } from "./snap";
import type { BlockMap } from "./tree";

function argTypeMap(p: ProcedureParts): Map<string, "n" | "s" | "b"> {
  const types = splitProccode(p.proccode).flatMap((c) => (c.argType ? [c.argType] : []));
  const out = new Map<string, "n" | "s" | "b">();
  p.argumentIds.forEach((id, i) => {
    const t = types[i];
    if (t) out.set(id, t);
  });
  return out;
}

function shadowFor(id: string, parent: string, t: "n" | "s"): Block {
  const isNum = t === "n";
  return {
    id,
    opcode: isNum ? "math_number" : "text",
    next: null,
    parent,
    inputs: {},
    fields: isNum ? { NUM: { name: "NUM", value: "1" } } : { TEXT: { name: "TEXT", value: "" } },
    shadow: true,
    topLevel: false,
  };
}

export function editProcedureEvents(
  blocks: BlockMap,
  defId: string,
  next: ProcedureParts,
  newId: () => string,
): EditorWorkspaceEvent[] {
  const def = blocks[defId];
  const protoId = def?.inputs.custom_block?.block ?? null;
  const proto = protoId ? blocks[protoId] : undefined;
  if (!def || !proto || proto.opcode !== PROCEDURE_PROTOTYPE || !protoId) return [];
  const prev = readProcedureMutation(proto);
  const prevTypes = argTypeMap(prev);
  const nextTypes = argTypeMap(next);
  const events: EditorWorkspaceEvent[] = [{ type: "change", blockId: protoId, element: "mutation", value: prototypeMutation(next) }];

  next.argumentIds.forEach((argId, i) => {
    const t = nextTypes.get(argId);
    if (!t) return;
    const name = next.argumentNames[i] ?? "";
    const existing = proto.inputs[argId]?.block;
    const sameKind = prevTypes.has(argId) && (prevTypes.get(argId) === "b") === (t === "b");
    if (existing && blocks[existing] && sameKind) {
      if (String(blocks[existing]?.fields.VALUE?.value ?? "") !== name) {
        events.push({ type: "change", blockId: existing, element: "field", name: "VALUE", value: name });
      }
      return;
    }
    const rid = newId();
    const reporter: Block = {
      id: rid,
      opcode: t === "b" ? "argument_reporter_boolean" : "argument_reporter_string_number",
      next: null,
      parent: protoId,
      inputs: {},
      fields: { VALUE: { name: "VALUE", value: name } },
      shadow: true,
      topLevel: false,
    };
    events.push({ type: "create", blocks: [reporter] }, { type: "move", blockId: rid, newParent: protoId, newInput: argId });
  });

  for (const call of Object.values(blocks)) {
    if (call.opcode !== PROCEDURE_CALL || readProcedureMutation(call).proccode !== prev.proccode) continue;
    events.push({ type: "change", blockId: call.id, element: "mutation", value: callMutation(next) });
    let bump = 0;
    for (const [argId, input] of Object.entries(call.inputs)) {
      const keep = nextTypes.has(argId) && (nextTypes.get(argId) === "b") === (prevTypes.get(argId) === "b");
      const occupant = input.block;
      if (keep || !occupant || occupant === input.shadow || !blocks[occupant]) continue;
      bump += 1;
      events.push({
        type: "move",
        blockId: occupant,
        oldParent: call.id,
        oldInput: argId,
        newCoordinate: { x: (call.x ?? 0) + SNAP_RADIUS * bump, y: (call.y ?? 0) + SNAP_RADIUS * bump },
      });
    }
    for (const argId of next.argumentIds) {
      const t = nextTypes.get(argId);
      if (!t || t === "b") continue;
      const input = call.inputs[argId];
      const keep = prevTypes.has(argId) && prevTypes.get(argId) !== "b";
      if (keep && input && (input.shadow || input.block)) continue;
      const sid = newId();
      events.push({ type: "create", blocks: [shadowFor(sid, call.id, t)] }, { type: "move", blockId: sid, newParent: call.id, newInput: argId });
    }
  }
  return events;
}
