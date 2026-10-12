/**
 * Pasang satu sprite (.sprite3) ke runtime yang sedang berjalan, dan ekspor sprite sebagai .sprite3.
 * Padanan vm.addSprite -> sb3.deserialize(isSingleSprite) -> installTargets(wholeProject=false) ->
 * RenderedTarget.fixUpVariableReferences, dan vm.exportSprite (scratch-vm 4.8.102, BSD-3-Clause;
 * lihat THIRD_PARTY.md). Sprite yang sedang berjalan tidak dimuat ulang.
 */
import type { IMediaLoader, IRuntime, ITarget, TargetState, Variable, VariableType } from "@kody/engine";
import { asRenderedTarget, createBlocksContainer, createVariable, MathUtil, Sprite, StageLayering, StringUtil } from "@kody/engine";
import { saveSprite3, type LoadedSprite } from "@kody/project";
import { collectAssets } from "../shell/runtime-model";

type VarRef = { referencingField: { id?: string | null; value: string | number }; type: string };

/**
 * fixUpVariableReferences (target.js): sprite dari project lain bisa merujuk variabel global yang
 * tidak ikut terekspor, atau punya variabel lokal yang namanya bentrok dengan variabel global.
 */
export function fixUpVariableReferences(runtime: IRuntime, target: ITarget): void {
  const stage = runtime.getTargetForStage();
  if (!stage || target.isStage) return;

  const renameConflictingLocalVar = (id: string, name: string, type: VariableType): string | null => {
    if (!stage.lookupVariableByNameAndType(name, type)) return null;
    const newName = StringUtil.unusedName(`${target.getName()}: ${name}`, target.getAllVariableNamesInScopeByType(type));
    target.renameVariable(id, newName);
    return newName;
  };

  const allReferences = target.blocks.getAllVariableAndListReferences() as Record<string, VarRef[]>;
  const unreferenced = Object.keys(target.variables).filter((id) => !allReferences[id]);
  const idsToReplace: Record<string, string> = {};
  const namesToReplace: Record<string, string> = {};
  const namesByType = new Map<string, string[]>();
  const allVarNames = (type: string): string[] => {
    let names = namesByType.get(type);
    if (!names) {
      names = runtime.getAllVarNamesOfType(type);
      namesByType.set(type, names);
    }
    return names;
  };

  for (const varId in allReferences) {
    const refs = allReferences[varId] ?? [];
    const first = refs[0];
    if (!first) continue;
    const varName = String(first.referencingField.value);
    const varType = first.type as VariableType;
    if (target.lookupVariableById(varId)) {
      if (Object.prototype.hasOwnProperty.call(target.variables, varId)) {
        const newName = renameConflictingLocalVar(varId, varName, varType);
        if (newName) for (const ref of refs) ref.referencingField.value = newName;
      }
    } else {
      const existing = stage.lookupVariableByNameAndType(varName, varType);
      if (existing) {
        idsToReplace[varId] ??= existing.id;
      } else {
        const freshName = StringUtil.unusedName(varName, allVarNames(varType));
        stage.createVariable(varId, freshName, varType);
        namesToReplace[varId] ??= freshName;
      }
    }
  }
  for (const id of unreferenced) {
    const v = target.variables[id];
    if (v) renameConflictingLocalVar(id, v.name, v.type);
  }
  // mergeVariables
  for (const conflictId in idsToReplace) {
    for (const ref of allReferences[conflictId] ?? []) ref.referencingField.id = idsToReplace[conflictId] ?? null;
  }
  for (const conflictId in namesToReplace) {
    for (const ref of allReferences[conflictId] ?? []) ref.referencingField.value = namesToReplace[conflictId] ?? "";
  }
}

/**
 * Pesan siaran selalu milik Stage (Scratch 3). Pindahkan broadcast sprite ke Stage, gabungkan dengan
 * pesan bernama sama yang sudah ada, dan buat pesan yang dirujuk blok tetapi belum ada.
 */
export function shareBroadcastsToStage(runtime: IRuntime, target: ITarget): void {
  const stage = runtime.getTargetForStage();
  if (!stage || target.isStage) return;
  const refs = (
    target.blocks as unknown as { getAllVariableAndListReferences(b?: null, includeBroadcast?: boolean): Record<string, VarRef[]> }
  ).getAllVariableAndListReferences(null, true);
  const local: Record<string, Variable> = {};
  for (const [id, v] of Object.entries(target.variables)) {
    if (v.type === "broadcast_msg") {
      local[id] = v;
      delete target.variables[id];
    }
  }
  const ensure = (id: string, name: string): string => {
    const byId = stage.variables[id];
    if (byId && byId.type === "broadcast_msg") return id;
    const byName = stage.lookupBroadcastByInputValue(name);
    if (byName) return byName.id;
    stage.variables[id] = createVariable(id, name, "broadcast_msg", false);
    return id;
  };
  for (const [id, v] of Object.entries(local)) ensure(id, v.name);
  for (const [id, list] of Object.entries(refs)) {
    const first = list[0];
    if (!first || first.type !== "broadcast_msg") continue;
    const finalId = ensure(id, String(first.referencingField.value));
    if (finalId !== id) for (const ref of list) ref.referencingField.id = finalId;
  }
}

/** Buat target dari TargetState tanpa mengganggu target lain (parseScratchObject untuk satu sprite). */
async function buildTarget(runtime: IRuntime, media: IMediaLoader, state: TargetState, assets: ReadonlyMap<string, Uint8Array>): Promise<ITarget> {
  const blocks = createBlocksContainer(runtime);
  const sprite = new Sprite(blocks, runtime);
  const others = runtime.targets.filter((t) => !t.isStage && t.isOriginal).map((t) => t.sprite.name);
  sprite.name = StringUtil.unusedName(state.name || "Sprite1", others);
  for (const block of Object.values(state.blocks)) blocks.createBlock(structuredClone(block));

  const asset = (item: { assetId: string; md5ext: string; dataFormat: string }) => {
    const data = assets.get(item.md5ext) ?? assets.get(item.assetId);
    return data ? { assetId: item.assetId, dataFormat: item.dataFormat, data } : null;
  };
  const costumes = await Promise.all(
    state.costumes.map(async (c) => {
      const a = asset(c);
      try {
        return await media.loadCostume({ ...c }, a);
      } catch {
        return { ...c, skinId: -1, size: [0, 0] as [number, number], asset: a };
      }
    }),
  );
  const sounds = await Promise.all(
    state.sounds.map(async (s) => {
      const a = asset(s);
      try {
        return await media.loadSound({ ...s }, a);
      } catch {
        return { ...s, soundId: "", asset: a };
      }
    }),
  );
  sprite.costumes = costumes;
  sprite.sounds = sounds;

  const target = sprite.createClone(StageLayering.SPRITE_LAYER);
  target.volume = state.volume;
  for (const [id, v] of Object.entries(state.variables)) {
    const variable = createVariable(id, v.name, v.type, false);
    if (v.type === "list") variable.value = Array.isArray(v.value) ? [...v.value] : [];
    else if (v.type === "") variable.value = Array.isArray(v.value) ? String(v.value) : v.value;
    target.variables[id] = variable;
  }
  for (const [id, c] of Object.entries(state.comments)) target.comments[id] = { ...c };
  if (state.x !== undefined) target.x = state.x;
  if (state.y !== undefined) target.y = state.y;
  if (state.direction !== undefined) target.direction = MathUtil.wrapClamp(state.direction, -179, 180);
  if (state.size !== undefined) target.size = state.size;
  if (state.visible !== undefined) target.visible = state.visible;
  if (state.rotationStyle !== undefined) target.rotationStyle = state.rotationStyle;
  if (state.draggable !== undefined) target.draggable = state.draggable;
  target.currentCostume = MathUtil.clamp(state.currentCostume, 0, Math.max(0, costumes.length - 1));
  for (const [key, value] of Object.entries(state.extensionState ?? {})) target.setCustomState(key, value);
  return target;
}

export interface InstallSpriteDeps {
  runtime: IRuntime;
  media: IMediaLoader;
  /** Muat ekstensi yang dipakai sprite; kembalikan id yang tidak dikenal. */
  loadExtensions?: (ids: readonly string[]) => Promise<string[]>;
}

/** vm.addSprite untuk .sprite3 yang sudah divalidasi @kody/project. Sprite baru jadi target yang diedit. */
export async function installSprite(deps: InstallSpriteDeps, loaded: LoadedSprite): Promise<ITarget> {
  const { runtime } = deps;
  if (loaded.extensions.length && deps.loadExtensions) {
    const unknown = await deps.loadExtensions(loaded.extensions);
    if (unknown.length) throw new Error(`Sprite memakai ekstensi yang tidak tersedia: ${unknown.join(", ")}`);
  }
  const target = await buildTarget(runtime, deps.media, loaded.target, loaded.assets);
  runtime.addTarget(target);
  asRenderedTarget(target)?.updateAllDrawableProperties();
  shareBroadcastsToStage(runtime, target);
  fixUpVariableReferences(runtime, target);
  runtime.setEditingTarget(target);
  runtime.emit("TARGETS_UPDATE", { emitProjectChanged: true });
  runtime.emitProjectChanged();
  return target;
}

/** vm.exportSprite: bytes .sprite3 + nama file yang aman. */
export async function exportSprite(runtime: IRuntime, targetId: string): Promise<{ data: Uint8Array; fileName: string }> {
  const target = runtime.getTargetById(targetId);
  if (!target || target.isStage) throw new Error("Pilih sprite untuk diekspor");
  const original = target.sprite.clones.find((c) => c.isOriginal) ?? target;
  const { data } = await saveSprite3(original.toState(), collectAssets([original]));
  const safe = original.sprite.name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim() || "sprite";
  return { data, fileName: `${safe}.sprite3` };
}
