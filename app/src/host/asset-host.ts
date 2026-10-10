/**
 * AssetEditorHost di atas runtime: tab Kostum/Suara mengubah costume & sound target yang sedang diedit.
 * Padanan vm.addCostume/duplicateCostume/deleteCostume/renameCostume/reorderCostume/updateSvg/updateBitmap
 * dan versi sound-nya (scratch-vm virtual-machine.js + rendered-target.js).
 */
import type { Costume, IMediaLoader, IRuntime, ITarget, Sound } from "@kody/engine";
import { StringUtil } from "@kody/engine";
import { costumeFromView, soundFromView } from "../costume-tab/new-asset";
import type { AssetEditorHost, CostumeView, EditingTargetView, NewCostume, NewSound, SoundView } from "../costume-tab/types";

const toCostumeView = (c: Costume): CostumeView => ({
  name: c.name,
  assetId: c.assetId,
  md5ext: c.md5ext,
  dataFormat: c.dataFormat,
  bitmapResolution: c.bitmapResolution,
  rotationCenterX: c.rotationCenterX,
  rotationCenterY: c.rotationCenterY,
  asset: c.asset,
  size: [c.size[0], c.size[1]],
});

const toSoundView = (s: Sound): SoundView => ({
  name: s.name,
  assetId: s.assetId,
  md5ext: s.md5ext,
  dataFormat: s.dataFormat,
  rate: s.rate,
  sampleCount: s.sampleCount,
  asset: s.asset,
});

/** Pindahkan item dalam array (scratch-vm StringUtil/arrayMove semantics). */
function move<T>(list: T[], from: number, to: number): boolean {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return false;
  const [item] = list.splice(from, 1);
  if (item === undefined) return false;
  list.splice(to, 0, item);
  return true;
}

export function createRuntimeAssetHost(runtime: IRuntime, media: IMediaLoader): AssetEditorHost & { dispose(): void } {
  const listeners = new Set<() => void>();
  let snapshot: EditingTargetView | null = null;
  let lastKey = "";

  const keyOf = (t: ITarget | null): string =>
    t ? `${t.id}|${t.currentCostume}|${t.getCostumes().length}|${t.getSounds().length}|${t.sprite.name}` : "";

  const changed = (): void => {
    snapshot = null;
    for (const l of [...listeners]) l();
  };
  const notifyRuntime = (): void => {
    runtime.emit("TARGETS_UPDATE", { emitProjectChanged: true });
    runtime.emitProjectChanged();
    changed();
  };

  const editing = (): ITarget => {
    const t = runtime.getEditingTarget();
    if (!t) throw new Error("Tidak ada target yang sedang diedit");
    return t;
  };

  const check = (): void => {
    const k = keyOf(runtime.getEditingTarget());
    if (k !== lastKey) {
      lastKey = k;
      changed();
    }
  };
  const offs = [
    runtime.on("EDITING_TARGET_CHANGED", check),
    runtime.on("TARGETS_UPDATE", check),
    runtime.on("PROJECT_LOADED", () => {
      lastKey = "";
      check();
    }),
    // Blok "ganti kostum" mengubah costume saat berjalan: perbarui pilihan seperti targetsUpdate scratch-gui.
    runtime.on("RUNTIME_STEP", check),
  ];

  const loadCostume = (c: NewCostume): Promise<Costume> => media.loadCostume({ ...c.state }, c.asset);
  const loadSound = (s: NewSound): Promise<Sound> => media.loadSound({ ...s.state }, s.asset);

  return {
    getEditingTarget() {
      if (snapshot) return snapshot;
      const t = runtime.getEditingTarget();
      if (!t) return null;
      snapshot = {
        id: t.id,
        name: t.isStage ? "Stage" : t.sprite.name,
        isStage: t.isStage,
        costumes: t.getCostumes().map(toCostumeView),
        currentCostume: t.currentCostume,
        sounds: t.getSounds().map(toSoundView),
      };
      return snapshot;
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },

    setCostume(index) {
      const t = editing();
      if (index < 0 || index >= t.getCostumes().length) return;
      t.setCostume(index);
      notifyRuntime();
    },
    async addCostumes(costumes) {
      const t = editing();
      for (const c of costumes) {
        const loaded = await loadCostume(c);
        t.sprite.addCostumeAt(loaded, t.sprite.costumes.length);
        t.setCostume(t.sprite.costumes.length - 1);
      }
      notifyRuntime();
    },
    async duplicateCostume(index) {
      const t = editing();
      const v = t.getCostumes()[index];
      const copy = v ? costumeFromView(toCostumeView(v)) : null;
      if (!copy) return;
      const loaded = await loadCostume(copy);
      t.sprite.addCostumeAt(loaded, index + 1);
      t.setCostume(index + 1);
      notifyRuntime();
    },
    deleteCostume(index) {
      // RenderedTarget.deleteCostume: costume terakhir tidak bisa dihapus.
      const t = editing();
      const count = t.getCostumes().length;
      if (count <= 1 || index < 0 || index >= count) return false;
      const current = t.currentCostume;
      t.sprite.deleteCostumeAt(index);
      if (index === current && index === count - 1) t.setCostume(index - 1);
      else if (index < current) t.setCostume(current - 1);
      else t.setCostume(current);
      notifyRuntime();
      return true;
    },
    renameCostume(index, newName) {
      const t = editing();
      const c = t.getCostumes()[index];
      if (!c) return;
      const others = t
        .getCostumes()
        .filter((_, i) => i !== index)
        .map((x) => x.name);
      const name = StringUtil.unusedName(newName, others);
      if (name === c.name) return;
      c.name = name;
      notifyRuntime();
    },
    reorderCostume(from, to) {
      const t = editing();
      const list = t.sprite.costumes;
      const current = list[t.currentCostume];
      if (!move(list, from, to)) return false;
      if (current) t.setCostume(list.indexOf(current));
      notifyRuntime();
      return true;
    },
    async updateCostume(index, costume) {
      const t = editing();
      const old = t.getCostumes()[index];
      if (!old) return;
      const loaded = await loadCostume(costume);
      loaded.name = old.name;
      const list = t.sprite.costumes;
      list.splice(index, 1, loaded);
      if (old.skinId >= 0 && old.skinId !== loaded.skinId && !list.some((c) => c.skinId === old.skinId)) {
        runtime.renderer?.destroySkin(old.skinId);
      }
      if (t.currentCostume === index) t.setCostume(index);
      notifyRuntime();
    },

    async addSounds(sounds) {
      const t = editing();
      for (const s of sounds) t.sprite.addSound(await loadSound(s));
      notifyRuntime();
    },
    async duplicateSound(index) {
      const t = editing();
      const v = t.getSounds()[index];
      const copy = v ? soundFromView(toSoundView(v)) : null;
      if (!copy) return;
      t.sprite.addSound(await loadSound(copy), index + 1);
      notifyRuntime();
    },
    deleteSound(index) {
      const t = editing();
      if (index < 0 || index >= t.getSounds().length) return false;
      t.sprite.deleteSoundAt(index);
      notifyRuntime();
      return true;
    },
    renameSound(index, newName) {
      const t = editing();
      const s = t.getSounds()[index];
      if (!s) return;
      const others = t
        .getSounds()
        .filter((_, i) => i !== index)
        .map((x) => x.name);
      const name = StringUtil.unusedName(newName, others);
      if (name === s.name) return;
      s.name = name;
      notifyRuntime();
    },
    reorderSound(from, to) {
      const t = editing();
      if (!move(t.sprite.sounds, from, to)) return false;
      notifyRuntime();
      return true;
    },
    async updateSound(index, sound) {
      const t = editing();
      const old = t.getSounds()[index];
      if (!old) return;
      const loaded = await loadSound(sound);
      loaded.name = old.name;
      t.sprite.sounds.splice(index, 1, loaded);
      notifyRuntime();
    },
    dispose() {
      for (const off of offs) off();
      listeners.clear();
    },
  };
}
