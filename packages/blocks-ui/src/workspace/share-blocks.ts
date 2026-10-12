/**
 * Salin skrip ke sprite/panggung lain (seret skrip ke sprite di sprite pane).
 * Port dari scratch-vm 4.8.102 (BSD-3-Clause): virtual-machine.js shareBlocksToTarget,
 * engine/target.js resolveVariableSharingConflictsWithTarget / shareLocalVariableToStage /
 * shareLocalVariableToSprite / mergeVariables, engine/blocks.js getAllVariableAndListReferences.
 * Posisi blok atas mengikuti perilaku scratch-gui: pojok kiri atas area terlihat workspace tujuan.
 * Lihat THIRD_PARTY.md.
 */
import type { Block, BlockField, IRuntime, ITarget, VariableType } from "@kody/engine";
import { newBlockIds, StringUtil, uid } from "@kody/engine";

interface VarRef {
  referencingField: BlockField;
  type: VariableType;
}

/** blocks.getAllVariableAndListReferences (tanpa broadcast). */
export function variableAndListReferences(blocks: readonly Block[]): Record<string, VarRef[]> {
  const all: Record<string, VarRef[]> = Object.create(null) as Record<string, VarRef[]>;
  for (const block of blocks) {
    let field: BlockField | undefined;
    let type: VariableType | null = null;
    if (block.fields.VARIABLE) {
      field = block.fields.VARIABLE;
      type = "";
    } else if (block.fields.LIST) {
      field = block.fields.LIST;
      type = "list";
    }
    if (!field || type === null) continue;
    const id = String(field.id ?? "");
    (all[id] ??= []).push({ referencingField: field, type });
  }
  return all;
}

function mergeVariables(refs: VarRef[], idToMergeWith: string, newName?: string): void {
  for (const ref of refs) {
    ref.referencingField.id = idToMergeWith;
    if (newName !== undefined) ref.referencingField.value = newName;
  }
}

/** target.resolveVariableSharingConflictsWithTarget. */
export function resolveVariableSharingConflicts(runtime: IRuntime, from: ITarget, blocks: readonly Block[], receiving: ITarget): void {
  if (from.isStage) return;
  const refs = variableAndListReferences(blocks);
  for (const varId in refs) {
    const variable = from.variables[varId];
    const list = refs[varId];
    if (!variable || !list) continue; // global: tidak ada konflik
    if (receiving.isStage) {
      // shareLocalVariableToStage: jadi variabel global "Stage: nama" (sekali per variabel lokal).
      const stage = runtime.getTargetForStage();
      if (!stage) continue;
      const stageVarId = `StageVarFromLocal_${varId}`;
      let stageVar = stage.lookupVariableById(stageVarId);
      if (!stageVar) {
        const name = StringUtil.unusedName(`Stage: ${variable.name}`, runtime.getAllVarNamesOfType(variable.type));
        stage.createVariable(stageVarId, name, variable.type);
        stageVar = stage.lookupVariableById(stageVarId);
      }
      if (stageVar) mergeVariables(list, stageVar.id, stageVar.name);
    } else {
      // shareLocalVariableToSprite: pakai variabel bernama sama di sprite tujuan, atau buat baru.
      const existing = receiving.lookupVariableByNameAndType(variable.name, variable.type);
      let newId: string;
      if (existing) {
        newId = existing.id;
      } else {
        newId = uid();
        receiving.createVariable(newId, variable.name, variable.type);
      }
      mergeVariables(list, newId);
    }
  }
}

export interface ShareView {
  scrollX: number;
  scrollY: number;
  scale: number;
}

/**
 * vm.shareBlocksToTarget: salin blok (id baru), selesaikan konflik variabel, taruh blok atas
 * di area terlihat target tujuan, lalu buat di container target. Mengembalikan jumlah blok.
 */
export function shareBlocksToTarget(
  runtime: IRuntime,
  blocks: readonly Block[],
  targetId: string,
  fromTargetId: string | null,
  view: ShareView = { scrollX: 0, scrollY: 0, scale: 0.675 },
): number {
  const target = runtime.getTargetById(targetId);
  if (!target || !blocks.length) return 0;
  const copied = JSON.parse(JSON.stringify(blocks)) as Block[];
  for (const b of copied) delete b.comment;
  newBlockIds(copied);
  const from = fromTargetId ? runtime.getTargetById(fromTargetId) : undefined;
  if (from) resolveVariableSharingConflicts(runtime, from, copied, target);
  const top = copied.find((b) => b.topLevel);
  if (top) {
    top.x = (-view.scrollX + 15) / view.scale;
    top.y = (-view.scrollY + 30) / view.scale;
  }
  for (const b of copied) target.blocks.createBlock(b);
  (target.blocks as { updateTargetSpecificBlocks?(isStage: boolean): void }).updateTargetSpecificBlocks?.(target.isStage);
  runtime.emitProjectChanged();
  return copied.length;
}
