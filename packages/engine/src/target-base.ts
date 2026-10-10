/**
 * Target dasar (padanan scratch-vm 4.8.102 engine/target.js, BSD-3-Clause; lihat THIRD_PARTY.md):
 * variabel lokal/global, komentar, nilai hat edge, state ekstensi. Variabel cloud diabaikan.
 * Pemilik: agent engine-core.
 */
import type { BlocksContainer } from "./blocks-container";
import { asRuntimeInternal } from "./runtime-internal";
import type { CommentState, VariableType } from "./types/project-model";
import type { IBlocksContainer, IRuntime } from "./types/runtime";
import type { TargetEventMap, Variable } from "./types/target";
import { TypedEmitter } from "./util/event-emitter";
import { uid } from "./util/string-util";
import { createVariable } from "./variable";

function has(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export abstract class TargetBase {
  id: string;
  readonly runtime: IRuntime;
  blocks: IBlocksContainer;
  variables: Record<string, Variable> = {};
  comments: Record<string, CommentState> = {};
  abstract isStage: boolean;
  protected readonly emitter = new TypedEmitter<TargetEventMap>();
  protected _customState: Record<string, unknown> = {};
  _edgeActivatedHatValues: Record<string, unknown> = {};

  constructor(runtime: IRuntime, blocks: IBlocksContainer, id?: string) {
    this.runtime = runtime;
    this.blocks = blocks;
    this.id = id ?? uid();
  }

  abstract getName(): string;

  on<K extends keyof TargetEventMap>(event: K, fn: (payload: TargetEventMap[K]) => void): () => void {
    return this.emitter.on(event, fn);
  }

  // ------------------------------------------------------------ hat edge
  updateEdgeActivatedValue(blockId: string, newValue: unknown): unknown {
    const oldValue = this._edgeActivatedHatValues[blockId];
    this._edgeActivatedHatValues[blockId] = newValue;
    return oldValue;
  }
  hasEdgeActivatedValue(blockId: string): boolean {
    return has(this._edgeActivatedHatValues, blockId);
  }
  clearEdgeActivatedValues(): void {
    this._edgeActivatedHatValues = {};
  }

  // ------------------------------------------------------------ variabel
  lookupOrCreateVariable(id: string, name: string): Variable {
    let variable = this.lookupVariableById(id);
    if (variable) return variable;
    variable = this.lookupVariableByNameAndType(name, "") ?? undefined;
    if (variable) return variable;
    const newVariable = createVariable(id, name, "", false);
    this.variables[id] = newVariable;
    return newVariable;
  }

  lookupOrCreateList(id: string, name: string): Variable {
    let list = this.lookupVariableById(id);
    if (list) return list;
    list = this.lookupVariableByNameAndType(name, "list") ?? undefined;
    if (list) return list;
    const newList = createVariable(id, name, "list", false);
    this.variables[id] = newList;
    return newList;
  }

  lookupBroadcastMsg(id: string, name: string): Variable | undefined {
    let msg: Variable | undefined;
    if (id) msg = this.lookupVariableById(id);
    else if (name) msg = this.lookupBroadcastByInputValue(name);
    return msg;
  }

  /** Cari broadcast berdasarkan nama (case-insensitive) hanya di target ini (biasanya stage). */
  lookupBroadcastByInputValue(name: string): Variable | undefined {
    for (const id in this.variables) {
      const v = this.variables[id];
      if (v && v.type === "broadcast_msg" && v.name.toLowerCase() === name.toLowerCase()) return v;
    }
    return undefined;
  }

  /** Lokal dulu, lalu stage (kalau target ini bukan stage). */
  lookupVariableById(id: string): Variable | undefined {
    if (has(this.variables, id)) return this.variables[id];
    if (!this.isStage) {
      const stage = this.runtime.getTargetForStage();
      if (stage && has(stage.variables, id)) return stage.variables[id];
    }
    return undefined;
  }

  lookupVariableByNameAndType(name: string, type?: VariableType, skipStage = false): Variable | null {
    if (typeof name !== "string") return null;
    const t: VariableType = typeof type === "string" ? type : "";
    for (const id in this.variables) {
      const v = this.variables[id];
      if (v && v.name === name && v.type === t) return v;
    }
    if (!skipStage && !this.isStage) {
      const stage = this.runtime.getTargetForStage();
      if (stage) {
        for (const id in stage.variables) {
          const v = stage.variables[id];
          if (v && v.name === name && v.type === t) return v;
        }
      }
    }
    return null;
  }

  createVariable(id: string, name: string, type: VariableType, _isCloud = false): void {
    // Variabel cloud diabaikan (selalu variabel biasa).
    if (!has(this.variables, id)) this.variables[id] = createVariable(id, name, type, false);
  }

  createComment(
    id: string,
    blockId: string | null,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    minimized: boolean,
  ): void {
    if (has(this.comments, id)) return;
    const comment: CommentState = { id, blockId: null, x, y, width, height, minimized, text };
    if (blockId) {
      comment.blockId = blockId;
      const block = this.blocks.getBlock(blockId);
      if (block) block.comment = id;
    }
    this.comments[id] = comment;
  }

  renameVariable(id: string, newName: string): void {
    if (!has(this.variables, id)) return;
    const variable = this.variables[id];
    if (!variable || variable.id !== id) return;
    const oldName = variable.name;
    variable.name = newName;
    const rt = asRuntimeInternal(this.runtime);
    if (variable.type === "") {
      // Perbarui blok "[x position] of [sprite]" yang merujuk variabel ini.
      let blockUpdated = false;
      for (const t of this.runtime.targets) {
        const container = t.blocks as Partial<BlocksContainer>;
        if (typeof container.updateSensingOfReference === "function") {
          blockUpdated =
            container.updateSensingOfReference(oldName, newName, this.isStage ? "_stage_" : this.getName()) ||
            blockUpdated;
        }
      }
      if (blockUpdated) rt?.requestBlocksUpdate();
    }
    const monitorBlocks = this.runtime.monitorBlocks as Partial<BlocksContainer> & IBlocksContainer;
    monitorBlocks.changeBlock({ id, element: "field", name: variable.type === "list" ? "LIST" : "VARIABLE", value: id });
    const monitorBlock = monitorBlocks.getBlock(variable.id);
    if (monitorBlock && typeof monitorBlocks.getBlockParams === "function") {
      this.runtime.requestUpdateMonitor({ id, params: monitorBlocks.getBlockParams(monitorBlock) });
    }
  }

  deleteVariable(id: string): void {
    if (!has(this.variables, id)) return;
    delete this.variables[id];
    this.runtime.monitorBlocks.deleteBlock(id);
    this.runtime.requestRemoveMonitor(id);
  }

  /** Hapus monitor milik target ini (dipakai saat sprite dihapus / project dikosongkan). */
  deleteMonitors(): void {
    asRuntimeInternal(this.runtime)?.requestRemoveMonitorByTargetId(this.id);
    let ids: string[];
    if (this.isStage) {
      ids = Object.keys(this.variables);
    } else {
      const record = this.runtime.monitorBlocks.toRecord() as Record<string, { targetId?: string | null }>;
      ids = Object.keys(record).filter((key) => record[key]?.targetId === this.id);
    }
    for (const blockId of ids) this.runtime.monitorBlocks.deleteBlock(blockId);
  }

  duplicateVariable(id: string, keepOriginalId: boolean): Variable | null {
    const original = this.variables[id];
    if (!original) return null;
    const copy = createVariable(keepOriginalId ? id : uid(), original.name, original.type, original.isCloud);
    copy.value = Array.isArray(original.value) ? original.value.slice(0) : original.value;
    return copy;
  }

  /** Salin semua variabel lokal. Tanpa optBlocks id dipertahankan (clone); dengan optBlocks id baru + referensi diperbarui. */
  duplicateVariables(optBlocks?: IBlocksContainer): Record<string, Variable> {
    const refs = optBlocks?.getAllVariableAndListReferences();
    const out: Record<string, Variable> = {};
    for (const varId of Object.keys(this.variables)) {
      const v = this.duplicateVariable(varId, !optBlocks);
      if (!v) continue;
      out[v.id] = v;
      const current = refs?.[varId];
      if (current) for (const ref of current) ref.referencingField.id = v.id;
    }
    return out;
  }

  getCustomState<T>(key: string): T | undefined {
    return this._customState[key] as T | undefined;
  }
  setCustomState<T>(key: string, value: T): void {
    this._customState[key] = value;
  }

  getAllVariableNamesInScopeByType(type: VariableType, skipStage = false): string[] {
    const t: VariableType = typeof type === "string" ? type : "";
    const names = Object.values(this.variables)
      .filter((v) => v.type === t)
      .map((v) => v.name);
    if (skipStage || this.isStage) return names;
    const stage = this.runtime.getTargetForStage();
    return stage ? names.concat(stage.getAllVariableNamesInScopeByType(t)) : names;
  }
}
