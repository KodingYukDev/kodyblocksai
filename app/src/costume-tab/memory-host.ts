/**
 * AssetEditorHost di memori (tanpa runtime). Dipakai tes, pratinjau komponen, dan sebagai contoh
 * bagi app-shell: setiap metode memakai fungsi port scratch-vm di asset-list-logic.ts.
 */
import * as L from "./asset-list-logic";
import { costumeFromView, soundFromView } from "./new-asset";
import type { AssetEditorHost, CostumeView, EditingTargetView, NewCostume, NewSound, SoundView } from "./types";

export interface MemoryTarget {
  id: string;
  name: string;
  isStage: boolean;
  costumes: CostumeView[];
  currentCostume: number;
  sounds: SoundView[];
}

const toCostumeView = (c: NewCostume): CostumeView => ({ ...c.state, asset: c.asset });
const toSoundView = (s: NewSound): SoundView => ({ ...s.state, asset: s.asset });

export function createMemoryAssetHost(initial: MemoryTarget): AssetEditorHost & { target: MemoryTarget } {
  const target = initial;
  const listeners = new Set<() => void>();
  let snapshot: EditingTargetView | null = null;
  const changed = (): void => {
    snapshot = null;
    for (const l of [...listeners]) l();
  };

  return {
    target,
    getEditingTarget() {
      snapshot ??= { ...target, costumes: [...target.costumes], sounds: [...target.sounds] };
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setCostume(index) {
      if (index < 0 || index >= target.costumes.length) return;
      target.currentCostume = index;
      changed();
    },
    async addCostumes(costumes) {
      for (const c of costumes) L.addCostumeAndSelect(target, toCostumeView(c));
      changed();
    },
    async duplicateCostume(index) {
      const v = target.costumes[index];
      const copy = v ? costumeFromView(v) : null;
      if (!copy) return;
      L.duplicateCostume(target, index, () => toCostumeView(copy));
      changed();
    },
    deleteCostume(index) {
      const ok = L.deleteCostume(target, index) !== null;
      if (ok) changed();
      return ok;
    },
    renameCostume(index, newName) {
      if (L.renameCostume(target.costumes, index, newName)) changed();
    },
    reorderCostume(from, to) {
      const ok = L.reorderCostume(target, from, to);
      if (ok) changed();
      return ok;
    },
    async updateCostume(index, costume) {
      const old = target.costumes[index];
      if (!old) return;
      target.costumes[index] = { ...toCostumeView(costume), name: old.name };
      changed();
    },
    async addSounds(sounds) {
      for (const s of sounds) L.addSound(target.sounds, toSoundView(s));
      changed();
    },
    async duplicateSound(index) {
      const v = target.sounds[index];
      const copy = v ? soundFromView(v) : null;
      if (!copy) return;
      L.duplicateSound(target.sounds, index, () => toSoundView(copy));
      changed();
    },
    deleteSound(index) {
      const ok = L.deleteSound(target.sounds, index) !== null;
      if (ok) changed();
      return ok;
    },
    renameSound(index, newName) {
      if (L.renameSound(target.sounds, index, newName)) changed();
    },
    reorderSound(from, to) {
      const ok = L.reorderSound(target.sounds, from, to);
      if (ok) changed();
      return ok;
    },
    async updateSound(index, sound) {
      const old = target.sounds[index];
      if (!old) return;
      target.sounds[index] = { ...toSoundView(sound), name: old.name };
      changed();
    },
  };
}
