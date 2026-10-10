/**
 * Logika murni daftar costume & sound. Port perilaku scratch-vm 4.8.102 (BSD-3):
 * sprites/sprite.js addCostumeAt, sprites/rendered-target.js addCostume/renameCostume/deleteCostume/
 * reorderCostume/addSound/renameSound/deleteSound/reorderSound, virtual-machine.js duplicateCostume/
 * duplicateSound/addCostume; plus aturan seleksi scratch-gui containers/sound-tab.jsx & costume-tab.jsx.
 * Fungsi memutasi array yang diberikan (seperti scratch-vm) supaya host bisa memakainya langsung pada
 * sprite.costumes / sprite.sounds. Lihat THIRD_PARTY.md.
 */
import { unusedName } from "../sprite-pane/sprite-logic";

export interface Named {
  name: string;
}

export interface CostumeListState<C extends Named> {
  costumes: C[];
  currentCostume: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** sprite.addCostumeAt: nama dibuat unik di antara semua costume. */
export function addCostumeAt<C extends Named>(costumes: C[], costume: C, index: number): void {
  if (!costume.name) costume.name = "";
  costume.name = unusedName(
    costume.name,
    costumes.map((c) => c.name),
  );
  costumes.splice(index, 0, costume);
}

/** RenderedTarget.addCostume: index bukan angka sah -> di akhir. */
export function addCostume<C extends Named>(costumes: C[], costume: C, index?: number): void {
  if (typeof index === "number" && !Number.isNaN(index)) addCostumeAt(costumes, costume, index);
  else addCostumeAt(costumes, costume, costumes.length);
}

/** vm.addCostume / addBackdrop: tambah di akhir lalu jadikan costume aktif. */
export function addCostumeAndSelect<C extends Named>(state: CostumeListState<C>, costume: C): void {
  addCostume(state.costumes, costume);
  state.currentCostume = state.costumes.length - 1;
}

/** vm.duplicateCostume: salinan di index+1 dan menjadi aktif. */
export function duplicateCostume<C extends Named>(state: CostumeListState<C>, index: number, copy: (c: C) => C = (c) => ({ ...c })): void {
  const original = state.costumes[index];
  if (!original) return;
  addCostume(state.costumes, copy(original), index + 1);
  state.currentCostume = index + 1;
}

/** RenderedTarget.renameCostume. Mengembalikan nama lama & baru (untuk updateAssetName blok). */
export function renameCostume<C extends Named>(costumes: C[], index: number, newName: string): { oldName: string; newName: string } | null {
  const target = costumes[index];
  if (!target) return null;
  const used = costumes.filter((_, i) => i !== index).map((c) => c.name);
  const oldName = target.name;
  target.name = unusedName(newName, used);
  return { oldName, newName: target.name };
}

/**
 * RenderedTarget.deleteCostume. null bila hanya satu costume atau index di luar batas.
 * currentCostume disesuaikan persis seperti aslinya.
 */
export function deleteCostume<C extends Named>(state: CostumeListState<C>, index: number): C | null {
  const count = state.costumes.length;
  if (count === 1) return null;
  if (index < 0 || index >= count) return null;
  const [deleted] = state.costumes.splice(index, 1);
  if (index === state.currentCostume && index === count - 1) state.currentCostume = index - 1;
  else if (index < state.currentCostume) state.currentCostume = state.currentCostume - 1;
  // setCostume(currentCostume) lain: tetap (sudah dalam batas).
  return deleted ?? null;
}

/** RenderedTarget.reorderCostume. currentCostume dicari ulang lewat nama. */
export function reorderCostume<C extends Named>(state: CostumeListState<C>, costumeIndex: number, newIndex: number): boolean {
  const last = state.costumes.length - 1;
  const to = clamp(newIndex, 0, last);
  const from = clamp(costumeIndex, 0, last);
  if (to === from) return false;
  const current = state.costumes[state.currentCostume];
  const [moved] = state.costumes.splice(from, 1);
  if (!moved) return false;
  addCostume(state.costumes, moved, to);
  if (current) state.currentCostume = state.costumes.findIndex((c) => c.name === current.name);
  return true;
}

/** RenderedTarget.addSound: nama unik, sisip di index atau di akhir. */
export function addSound<S extends Named>(sounds: S[], sound: S, index?: number): void {
  sound.name = unusedName(
    sound.name,
    sounds.map((s) => s.name),
  );
  if (typeof index === "number" && !Number.isNaN(index)) sounds.splice(index, 0, sound);
  else sounds.push(sound);
}

export function duplicateSound<S extends Named>(sounds: S[], index: number, copy: (s: S) => S = (s) => ({ ...s })): void {
  const original = sounds[index];
  if (!original) return;
  addSound(sounds, copy(original), index + 1);
}

export function renameSound<S extends Named>(sounds: S[], index: number, newName: string): { oldName: string; newName: string } | null {
  const target = sounds[index];
  if (!target) return null;
  const used = sounds.filter((_, i) => i !== index).map((s) => s.name);
  const oldName = target.name;
  target.name = unusedName(newName, used);
  return { oldName, newName: target.name };
}

export function deleteSound<S extends Named>(sounds: S[], index: number): S | null {
  if (index < 0 || index >= sounds.length) return null;
  return sounds.splice(index, 1)[0] ?? null;
}

export function reorderSound<S extends Named>(sounds: S[], soundIndex: number, newIndex: number): boolean {
  const last = sounds.length - 1;
  const to = clamp(newIndex, 0, last);
  const from = clamp(soundIndex, 0, last);
  if (to === from) return false;
  const sound = sounds[from];
  if (!sound) return false;
  deleteSound(sounds, from);
  addSound(sounds, sound, to);
  return true;
}

// --- aturan seleksi tab suara (scratch-gui sound-tab.jsx) ---

/** Setelah menghapus sound `deleted` dengan seleksi `selected`. */
export function selectionAfterSoundDelete(selected: number, deleted: number): number {
  return deleted >= selected ? Math.max(0, deleted - 1) : selected;
}

/** Seleksi dibatasi ke jumlah sound yang ada (componentWillReceiveProps). */
export function clampSoundSelection(selected: number, count: number): number {
  return selected > count - 1 ? Math.max(count - 1, 0) : selected;
}

/** Hitung index tujuan drop dari posisi pointer pada daftar vertikal (SortableHOC disederhanakan). */
export function dropIndexFromPointer(itemMidpoints: readonly number[], pointer: number): number {
  let i = 0;
  while (i < itemMidpoints.length && pointer > (itemMidpoints[i] ?? 0)) i++;
  return i;
}

/** Hasil drop: index setelah item dicabut dari `from`. */
export function normalizeDropIndex(from: number, slot: number): number {
  return slot > from ? slot - 1 : slot;
}

/** formatCostumeDetails scratch-gui: "W x H" dalam satuan panggung, dibulatkan ke atas. */
export function formatCostumeDetails(size: readonly [number, number], bitmapResolution?: number): string {
  const r = bitmapResolution ? bitmapResolution : 1;
  return `${Math.ceil(size[0] / r)} x ${Math.ceil(size[1] / r)}`;
}

/** Nama default costume/backdrop baru (messages.costume / messages.backdrop scratch-gui). */
export function defaultCostumeName(isStage: boolean, locale: "id" | "en" = "id"): string {
  if (locale === "en") return isStage ? "backdrop1" : "costume1";
  return isStage ? "latar1" : "kostum1";
}
