/** Menu kelas dinamis bersama untuk ekstensi classifier (gambar, pose, tangan, teks, suara). */
import type { ExtensionMenuItem, IRuntime } from "@kody/engine";
import { notifyTrainedModelChanged } from "../classifier/storage";
import type { TrainedKind } from "../types";

export const NO_CLASS_ITEM: ExtensionMenuItem = { text: "(latih model di AI Lab)", value: "" };

/** Item menu kelas dari label model (atau petunjuk bila belum ada model). */
export function classMenuItems(labels: readonly string[]): (string | ExtensionMenuItem)[] {
  return labels.length > 0 ? labels.map((l) => ({ text: l, value: l })) : [NO_CLASS_ITEM];
}

/**
 * Saat project baru dimuat, model di state panggung ikut berganti: minta palet memperbarui menu kelas.
 * `onLoaded` dipanggil juga (mis. reset peringatan "belum ada model"). Mengembalikan fungsi lepas.
 */
export function watchProjectModels(runtime: IRuntime, kind: TrainedKind, onLoaded: () => void = () => {}): () => void {
  try {
    return runtime.on("PROJECT_LOADED", () => {
      onLoaded();
      notifyTrainedModelChanged(runtime, kind);
    });
  } catch {
    return () => {};
  }
}
