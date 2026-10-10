/** Menu kelas dinamis bersama untuk ekstensi classifier (gambar, teks, suara). */
import type { ExtensionMenuItem } from "@kody/engine";

export const NO_CLASS_ITEM: ExtensionMenuItem = { text: "(latih model di AI Lab)", value: "" };

/** Item menu kelas dari label model (atau petunjuk bila belum ada model). */
export function classMenuItems(labels: readonly string[]): (string | ExtensionMenuItem)[] {
  return labels.length > 0 ? labels.map((l) => ({ text: l, value: l })) : [NO_CLASS_ITEM];
}
