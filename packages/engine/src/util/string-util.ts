/**
 * Utilitas string & id. Port dari scratch-vm 4.8.102 src/util/string-util.js, uid.js,
 * new-block-ids.js (BSD-3-Clause, lihat THIRD_PARTY.md). Pemilik: agent engine-core.
 */
import type { Block } from "../types/project-model";

export const StringUtil = {
  withoutTrailingDigits(s: string): string {
    let i = s.length - 1;
    while (i >= 0 && "0123456789".indexOf(s.charAt(i)) > -1) i--;
    return s.slice(0, i + 1);
  },

  /** "Sprite1" sudah dipakai -> "Sprite2", dst. Persis StringUtil.unusedName. */
  unusedName(name: string, existingNames: readonly string[]): string {
    if (existingNames.indexOf(name) < 0) return name;
    const base = StringUtil.withoutTrailingDigits(name);
    let i = 2;
    while (existingNames.indexOf(base + i) >= 0) i++;
    return base + i;
  },

  splitFirst(text: string, separator: string): [string, string | null] {
    const index = text.indexOf(separator);
    if (index >= 0) return [text.substring(0, index), text.substring(index + 1)];
    return [text, null];
  },

  replaceUnsafeChars(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case "<":
          return "lt";
        case ">":
          return "gt";
        case "&":
          return "amp";
        case "'":
          return "apos";
        default:
          return "quot";
      }
    });
  },
};

const SOUP = "!#%()*+,-./:;=?@[]^_`{|}~ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Id acak 20 karakter seperti scratch-vm uid(). */
export function uid(random: () => number = Math.random): string {
  const id: string[] = [];
  for (let i = 0; i < 20; i++) id.push(SOUP.charAt(Math.floor(random() * SOUP.length)));
  return id.join("");
}

/** Ganti semua id blok (dan referensi parent/next/input) dengan id baru, in-place. */
export function newBlockIds(blocks: Block[], makeId: () => string = () => uid()): void {
  const oldToNew: Record<string, string> = {};
  for (const block of blocks) {
    const newId = makeId();
    oldToNew[block.id] = newId;
    block.id = newId;
  }
  const remap = (id: string | null): string | null => (id === null ? null : (oldToNew[id] ?? null));
  for (const block of blocks) {
    for (const key in block.inputs) {
      const input = block.inputs[key];
      if (!input) continue;
      input.block = remap(input.block);
      input.shadow = remap(input.shadow);
    }
    if (block.parent) block.parent = remap(block.parent);
    if (block.next) block.next = remap(block.next);
  }
}
