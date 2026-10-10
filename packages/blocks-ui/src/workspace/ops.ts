/**
 * Penerjemah aksi editor -> EditorWorkspaceEvent, dengan urutan & isi yang sama dengan event
 * yang ditembakkan scratch-blocks ke vm.blockListener:
 * - mulai drag  = Block.unplug(healStack=false) + respawn shadow
 * - lepas      = BlockMove (koordinat) + Connection.connect_ (sisip tengah stack, bungkus C, bump)
 * - hapus menu = unplug(healStack=true) + BlockDelete
 * - duplikat   = salin seluruh stack mulai blok ini dengan id baru.
 */
import type { Block, EditorWorkspaceEvent } from "@kody/engine";
import type { BlockInfo } from "./block-info";
import { PROCEDURE_CALL, PROCEDURE_DEFINITION, PROCEDURE_PROTOTYPE, readProcedureMutation } from "./block-info";
import type { ConnPoint } from "./layout";
import { SNAP_RADIUS, type Vec } from "./snap";
import { getDescendants, getLastInStack, getParentLink, getStackFrom, type BlockMap } from "./tree";

type MoveEvent = Extract<EditorWorkspaceEvent, { type: "move" }>;

function move(blockId: string, parts: Omit<MoveEvent, "type" | "blockId">): MoveEvent {
  const ev: MoveEvent = { type: "move", blockId };
  // scratch-vm membedakan "undefined" (tidak ada) dari string; jangan kirim null.
  if (parts.oldParent) ev.oldParent = parts.oldParent;
  if (parts.oldParent && parts.oldInput) ev.oldInput = parts.oldInput;
  if (parts.newParent) ev.newParent = parts.newParent;
  if (parts.newParent && parts.newInput) ev.newInput = parts.newInput;
  if (parts.newCoordinate) ev.newCoordinate = { x: parts.newCoordinate.x, y: parts.newCoordinate.y };
  return ev;
}

/** Lepas blok dari induknya (awal drag). Shadow yang tadinya tertutup muncul lagi. */
export function unplugEvents(blocks: BlockMap, id: string, absolute: Vec): EditorWorkspaceEvent[] {
  const link = getParentLink(blocks, id);
  if (!link) return [];
  const events: EditorWorkspaceEvent[] = [
    move(id, { oldParent: link.parent, oldInput: link.input, newCoordinate: absolute }),
  ];
  if (link.input) {
    const shadow = blocks[link.parent]?.inputs[link.input]?.shadow ?? null;
    if (shadow && shadow !== id && blocks[shadow]) {
      events.push(move(shadow, { newParent: link.parent, newInput: link.input }));
    }
  }
  return events;
}

/** Event memindah blok top-level ke koordinat baru (tanpa sambungan). */
export function moveToEvent(id: string, xy: Vec): EditorWorkspaceEvent {
  return move(id, { newCoordinate: { x: Math.round(xy.x), y: Math.round(xy.y) } });
}

/**
 * Event sambungan saat drop (Connection.connect_). `topId` sudah top-level (sudah di-unplug).
 * `info` dipakai untuk mengetahui apakah blok terakhir stack punya next connection.
 */
export function connectEvents(
  blocks: BlockMap,
  info: (id: string) => BlockInfo,
  topId: string,
  local: ConnPoint,
  closest: ConnPoint,
): EditorWorkspaceEvent[] {
  const events: EditorWorkspaceEvent[] = [];
  const bumpFrom = (c: ConnPoint): Vec => ({ x: Math.round(c.x + SNAP_RADIUS), y: Math.round(c.y + SNAP_RADIUS) });

  if (local.type === "output" && closest.type === "input" && closest.input) {
    const input = blocks[closest.blockId]?.inputs[closest.input];
    const occupant = input?.block ?? null;
    if (occupant && occupant !== input?.shadow && blocks[occupant] && !blocks[occupant]?.shadow) {
      events.push(move(occupant, { oldParent: closest.blockId, oldInput: closest.input, newCoordinate: bumpFrom(closest) }));
    }
    events.push(move(local.blockId, { newParent: closest.blockId, newInput: closest.input }));
    return events;
  }

  if (local.type === "previous" && (closest.type === "next" || closest.type === "statement")) {
    const occupant = closest.occupant;
    const inputName = closest.type === "statement" ? closest.input : null;
    if (occupant && blocks[occupant]) {
      // Sisip di tengah stack: sambungkan sisa stack ke ujung stack yang dijatuhkan.
      const last = getLastInStack(blocks, topId);
      if (info(last).hasNext) {
        events.push(move(occupant, { oldParent: closest.blockId, oldInput: inputName, newParent: last }));
      } else {
        events.push(move(occupant, { oldParent: closest.blockId, oldInput: inputName, newCoordinate: bumpFrom(closest) }));
      }
    }
    events.push(move(local.blockId, { newParent: closest.blockId, newInput: inputName }));
    return events;
  }

  if ((local.type === "next" || local.type === "statement") && closest.type === "previous") {
    const target = closest.blockId;
    if (local.type === "statement") {
      // C-block membungkus stack: induk lama stack pindah menjadi induk C.
      const link = getParentLink(blocks, target);
      if (link) {
        events.push(move(target, { oldParent: link.parent, oldInput: link.input, newCoordinate: { x: closest.x, y: closest.y } }));
        events.push(move(local.blockId, { newParent: link.parent, newInput: link.input }));
      }
      events.push(move(target, { newParent: local.blockId, newInput: local.input }));
      return events;
    }
    events.push(move(target, { newParent: local.blockId }));
    return events;
  }
  return events;
}

/** Context menu "Delete Block": hapus blok ini saja, sambungkan blok di bawahnya ke atas (healStack). */
export function deleteBlockEvents(blocks: BlockMap, id: string, absolute: Vec, nextAbsolute: Vec | null): EditorWorkspaceEvent[] {
  const block = blocks[id];
  if (!block) return [];
  const events: EditorWorkspaceEvent[] = [...unplugEvents(blocks, id, absolute)];
  const link = getParentLink(blocks, id);
  const next = block.next;
  if (next && blocks[next]) {
    if (link) {
      events.push(move(next, { oldParent: id, newParent: link.parent, newInput: link.input }));
    } else {
      events.push(move(next, { oldParent: id, newCoordinate: nextAbsolute ?? absolute }));
    }
  }
  events.push({ type: "delete", blockId: id });
  return events;
}

/** Hapus seluruh stack top-level (drag ke palet / delete all). */
export function deleteStackEvents(id: string): EditorWorkspaceEvent[] {
  return [{ type: "delete", blockId: id }];
}

function cloneBlock(b: Block): Block {
  return JSON.parse(JSON.stringify(b)) as Block;
}

/**
 * Salin pohon blok mulai `rootId` dengan id baru (duplicate / ambil dari palet).
 * Root menjadi top-level di `xy`. includeNext=false hanya menyalin blok itu (dengan isinya).
 * Hasil berurutan root dulu (bentuk event create).
 */
export function copyTree(
  source: BlockMap,
  rootId: string,
  newId: () => string,
  xy: Vec,
  includeNext = true,
): Block[] {
  const ids = getDescendants(source, rootId, includeNext);
  const map = new Map<string, string>();
  for (const id of ids) map.set(id, newId());
  const remap = (id: string | null): string | null => (id ? (map.get(id) ?? null) : null);
  return ids.map((id) => {
    const src = source[id];
    if (!src) throw new Error(`copyTree: ${id} hilang`);
    const b = cloneBlock(src);
    b.id = remap(id) ?? id;
    b.next = id === rootId && !includeNext ? null : remap(src.next);
    b.parent = id === rootId ? null : remap(src.parent);
    for (const name of Object.keys(b.inputs)) {
      const inp = b.inputs[name];
      if (!inp) continue;
      inp.block = remap(inp.block);
      inp.shadow = remap(inp.shadow);
    }
    delete b.comment;
    if (id === rootId) {
      b.topLevel = true;
      b.x = Math.round(xy.x);
      b.y = Math.round(xy.y);
    } else {
      b.topLevel = false;
      delete b.x;
      delete b.y;
    }
    return b;
  });
}

/** Panggilan procedure (procedures_call) di luar stack definisi tertentu. */
export function findCallers(blocks: BlockMap, proccode: string, excludeRoot: string | null): string[] {
  const inside = excludeRoot ? new Set(getDescendants(blocks, excludeRoot)) : new Set<string>();
  return Object.values(blocks)
    .filter((b) => b.opcode === PROCEDURE_CALL && !inside.has(b.id) && readProcedureMutation(b).proccode === proccode)
    .map((b) => b.id);
}

/** proccode sebuah define (lewat prototype di input custom_block). */
export function definitionProccode(blocks: BlockMap, defId: string): string | null {
  const def = blocks[defId];
  if (!def || def.opcode !== PROCEDURE_DEFINITION) return null;
  const protoId = def.inputs.custom_block?.block ?? def.inputs.custom_block?.shadow ?? null;
  const proto = protoId ? blocks[protoId] : undefined;
  if (!proto || proto.opcode !== PROCEDURE_PROTOTYPE) return null;
  return readProcedureMutation(proto).proccode;
}

/**
 * Boleh menghapus stack ini? Scratch menolak menghapus define yang masih dipanggil
 * (Blockly.Msg.PROCEDURE_USED). Mengembalikan proccode yang menghalangi, atau null kalau boleh.
 */
export function blockingProcedure(blocks: BlockMap, rootId: string): string | null {
  for (const id of getStackFrom(blocks, rootId)) {
    const code = definitionProccode(blocks, id);
    if (code !== null && findCallers(blocks, code, rootId).length > 0) return code;
  }
  return null;
}
