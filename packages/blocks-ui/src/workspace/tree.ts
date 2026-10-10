/**
 * Kueri murni atas peta blok (bentuk memori scratch-vm: Record<id, Block>).
 * Dipakai oleh layout, snapping, dan pembuat event. Tidak menyentuh DOM.
 */
import type { Block } from "@kody/engine";

export type BlockMap = Readonly<Record<string, Block>>;

/** Nama input statement (C-block) yang dikenali, urut sesuai cabang. */
export const STATEMENT_INPUT_NAMES = ["SUBSTACK", "SUBSTACK2"] as const;

/** Lokasi blok relatif terhadap induknya. */
export interface ParentLink {
  parent: string;
  /** null = terhubung lewat `next` induk. */
  input: string | null;
}

export function getParentLink(blocks: BlockMap, id: string): ParentLink | null {
  const block = blocks[id];
  if (!block || !block.parent) return null;
  const parent = blocks[block.parent];
  if (!parent) return null;
  if (parent.next === id) return { parent: parent.id, input: null };
  for (const name of Object.keys(parent.inputs)) {
    const input = parent.inputs[name];
    if (input && input.block === id) return { parent: parent.id, input: name };
  }
  // Shadow yang sedang tertutup reporter: masih menunjuk induk, tapi tidak lewat input.block.
  return null;
}

/** Blok paling atas dari stack/rantai yang memuat id. */
export function getRootBlock(blocks: BlockMap, id: string): string {
  let current = id;
  const seen = new Set<string>();
  for (;;) {
    if (seen.has(current)) return current;
    seen.add(current);
    const block = blocks[current];
    if (!block || !block.parent || !blocks[block.parent]) return current;
    current = block.parent;
  }
}

/** Urutan blok dari id mengikuti `next` (id itu sendiri termasuk). */
export function getStackFrom(blocks: BlockMap, id: string | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let current = id;
  while (current && blocks[current] && !seen.has(current)) {
    seen.add(current);
    out.push(current);
    current = blocks[current]?.next ?? null;
  }
  return out;
}

export function getLastInStack(blocks: BlockMap, id: string): string {
  const stack = getStackFrom(blocks, id);
  return stack[stack.length - 1] ?? id;
}

/** Blok sebelumnya dalam stack (induk yang `next`-nya menunjuk id), atau null. */
export function getPreviousBlock(blocks: BlockMap, id: string): string | null {
  const link = getParentLink(blocks, id);
  return link && link.input === null ? link.parent : null;
}

/**
 * Semua keturunan id (termasuk id) mengikuti input dan next, termasuk shadow yang tertutup.
 * Urutan: pre-order (root lebih dulu), sama seperti XML scratch-blocks -> create event.
 */
export function getDescendants(blocks: BlockMap, id: string, includeNext = true): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (bid: string | null): void => {
    if (!bid || seen.has(bid)) return;
    const block = blocks[bid];
    if (!block) return;
    seen.add(bid);
    out.push(bid);
    for (const name of Object.keys(block.inputs)) {
      const input = block.inputs[name];
      if (!input) continue;
      visit(input.block);
      if (input.shadow && input.shadow !== input.block) visit(input.shadow);
    }
    if (includeNext || bid !== id) visit(block.next);
  };
  visit(id);
  return out;
}

/** Jumlah blok non-shadow yang ikut terhapus oleh "Delete Block" (blockDeleteOption). */
export function countDeleteBlocks(blocks: BlockMap, id: string): number {
  return getDescendants(blocks, id, false).filter((bid) => !blocks[bid]?.shadow).length;
}

/** Script top-level non-shadow, urutan sesuai peta. */
export function getTopBlocks(blocks: BlockMap): string[] {
  return Object.keys(blocks).filter((id) => {
    const b = blocks[id];
    return !!b && b.topLevel && !b.shadow;
  });
}

/** true kalau `maybeDescendant` berada di dalam pohon `ancestor` (termasuk lewat next). */
export function isInTree(blocks: BlockMap, ancestor: string, maybeDescendant: string): boolean {
  let current: string | null = maybeDescendant;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    if (current === ancestor) return true;
    seen.add(current);
    current = blocks[current]?.parent ?? null;
  }
  return false;
}
