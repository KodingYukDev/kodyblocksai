/**
 * Container blok (padanan scratch-vm 4.8.102 engine/blocks.js + blocks-runtime-cache.js +
 * blocks-execute-cache.js, BSD-3-Clause; lihat THIRD_PARTY.md). Pemilik: agent engine-core.
 */
import { applyEditorEventTo } from "./blocks-container-events";
import { getMonitorIdForBlockWithArgs } from "./monitors";
import {
  asRuntimeInternal,
  type ContainerBlockExtras,
  type HatScriptCache,
} from "./runtime-internal";
import type { EditorWorkspaceEvent } from "./types/editor";
import { DEFAULT_MONITOR } from "./types/monitor";
import type { Block, BlockField, BlockInput, BlockMutation, ScratchValue } from "./types/project-model";
import type { IBlocksContainer, IRuntime } from "./types/runtime";
import type { ITarget } from "./types/target";

export const BRANCH_INPUT_PREFIX = "SUBSTACK";

export type ContainerBlock = Block & ContainerBlockExtras;

interface BlocksCache {
  inputs: Record<string, Record<string, BlockInput>>;
  procedureParamNames: Record<string, [string[], string[], ScratchValue[]] | null>;
  procedureDefinitions: Record<string, string | null>;
  executeCached: Map<string, unknown>;
  monitored: { blockId: string; target: ITarget | null }[] | null;
  scripts: Record<string, HatScriptCache[]>;
}

function emptyCache(): BlocksCache {
  return {
    inputs: {},
    procedureParamNames: {},
    procedureDefinitions: {},
    executeCached: new Map(),
    monitored: null,
    scripts: {},
  };
}

function has(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function parseJsonArray<T>(text: unknown): T[] {
  if (typeof text !== "string") return [];
  try {
    const v: unknown = JSON.parse(text);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function cloneMutation(m: BlockMutation): BlockMutation {
  return { ...m, children: (m.children ?? []).map(cloneMutation) };
}

export class BlocksContainer implements IBlocksContainer {
  readonly runtime: IRuntime | null;
  readonly forceNoGlow: boolean;
  /** id -> blok. Dibaca langsung oleh serializer & monitor (scratch-vm `_blocks`). */
  _blocks: Record<string, ContainerBlock> = {};
  _scripts: string[] = [];
  private cache: BlocksCache = emptyCache();

  constructor(runtime: IRuntime | null, optNoGlow = false) {
    this.runtime = runtime;
    this.forceNoGlow = optNoGlow;
  }

  getBlock(blockId: string): ContainerBlock | undefined {
    return has(this._blocks, blockId) ? this._blocks[blockId] : undefined;
  }

  getScripts(): string[] {
    return this._scripts;
  }

  getNextBlock(id: string): string | null {
    const block = this.getBlock(id);
    return typeof block === "undefined" ? null : block.next;
  }

  getBranch(id: string, branchNum: number): string | null {
    const block = this.getBlock(id);
    if (typeof block === "undefined") return null;
    const n = branchNum || 1;
    const inputName = n > 1 ? `${BRANCH_INPUT_PREFIX}${n}` : BRANCH_INPUT_PREFIX;
    const input = block.inputs[inputName];
    return typeof input === "undefined" ? null : input.block;
  }

  getOpcode(block: Block | undefined): string | null {
    return typeof block === "undefined" ? null : block.opcode;
  }

  getFields(block: Block | undefined): Record<string, BlockField> | null {
    return typeof block === "undefined" ? null : block.fields;
  }

  /** Input non-cabang (SUBSTACK* diabaikan), di-cache. */
  getInputs(block: Block | undefined): Record<string, BlockInput> | null {
    if (typeof block === "undefined") return null;
    const cached = this.cache.inputs[block.id];
    if (typeof cached !== "undefined") return cached;
    const inputs: Record<string, BlockInput> = {};
    for (const name in block.inputs) {
      const input = block.inputs[name];
      if (input && name.substring(0, BRANCH_INPUT_PREFIX.length) !== BRANCH_INPUT_PREFIX) {
        inputs[name] = input;
      }
    }
    this.cache.inputs[block.id] = inputs;
    return inputs;
  }

  getMutation(block: Block | undefined): BlockMutation | null {
    return typeof block === "undefined" ? null : (block.mutation ?? null);
  }

  getTopLevelScript(id: string): string | null {
    let block = this.getBlock(id);
    if (typeof block === "undefined") return null;
    while (block.parent !== null) {
      const parent = this.getBlock(block.parent);
      if (!parent) break;
      block = parent;
    }
    return block.id;
  }

  getProcedureDefinition(name: string): string | null {
    const cached = this.cache.procedureDefinitions[name];
    if (typeof cached !== "undefined") return cached;
    for (const id in this._blocks) {
      const block = this._blocks[id];
      if (block?.opcode === "procedures_definition") {
        const internal = this.getCustomBlockInternal(block);
        if (internal && internal.mutation?.proccode === name) {
          this.cache.procedureDefinitions[name] = id;
          return id;
        }
      }
    }
    this.cache.procedureDefinitions[name] = null;
    return null;
  }

  getProcedureParamNamesAndIds(name: string): [string[], string[]] | null {
    const all = this.getProcedureParamNamesIdsAndDefaults(name);
    // scratch-vm memanggil .slice pada null (TypeError); di sini null dikembalikan.
    return all ? [all[0], all[1]] : null;
  }

  getProcedureParamNamesIdsAndDefaults(name: string): [string[], string[], ScratchValue[]] | null {
    const cached = this.cache.procedureParamNames[name];
    if (typeof cached !== "undefined") return cached;
    for (const id in this._blocks) {
      const block = this._blocks[id];
      if (block?.opcode === "procedures_prototype" && block.mutation?.proccode === name) {
        const names = parseJsonArray<string>(block.mutation.argumentnames);
        const ids = parseJsonArray<string>(block.mutation.argumentids);
        const defaults = parseJsonArray<ScratchValue>(block.mutation.argumentdefaults);
        const result: [string[], string[], ScratchValue[]] = [names, ids, defaults];
        this.cache.procedureParamNames[name] = result;
        return result;
      }
    }
    this.cache.procedureParamNames[name] = null;
    return null;
  }

  duplicate(): BlocksContainer {
    const copy = new BlocksContainer(this.runtime, this.forceNoGlow);
    copy._blocks = JSON.parse(JSON.stringify(this._blocks)) as Record<string, ContainerBlock>;
    copy._scripts = [...this._scripts];
    return copy;
  }

  applyEditorEvent(event: EditorWorkspaceEvent): void {
    applyEditorEventTo(this, event);
  }

  resetCache(): void {
    this.cache = emptyCache();
  }

  emitProjectChanged(): void {
    if (!this.forceNoGlow && this.runtime) this.runtime.emitProjectChanged();
  }

  createBlock(block: Block): void {
    // Blok sudah ada (mis. shadow yang muncul kembali) -> abaikan.
    if (has(this._blocks, block.id)) return;
    this._blocks[block.id] = block;
    if (block.topLevel) this.addScript(block.id);
    this.resetCache();
    this.emitProjectChanged();
  }

  changeBlock(args: { id: string; element: "field" | "mutation" | "checkbox"; name?: string; value: unknown }): void {
    if (["field", "mutation", "checkbox"].indexOf(args.element) === -1) return;
    let block = this.getBlock(args.id);
    if (typeof block === "undefined") return;
    const rt = asRuntimeInternal(this.runtime);

    switch (args.element) {
      case "field": {
        const name = args.name ?? "";
        const field = block.fields[name];
        if (!field) return;
        if (name === "VARIABLE" || name === "LIST" || name === "BROADCAST_OPTION") {
          // Nilai = id variabel; nama diambil dari variabel.
          const variable = this.runtime?.getEditingTarget()?.lookupVariableById(String(args.value));
          if (variable) {
            field.value = variable.name;
            field.id = String(args.value);
          }
        } else {
          field.value = args.value as string | number;
          if (block.opcode === "sensing_of_object_menu" && block.parent) {
            const parent = this.getBlock(block.parent);
            const property = parent?.fields.PROPERTY;
            if (property) {
              property.value = block.fields.OBJECT?.value === "_stage_" ? "backdrop #" : "x position";
            }
            rt?.requestBlocksUpdate();
          }
          const flyoutBlock = block.shadow && block.parent ? this.getBlock(block.parent) : block;
          if (flyoutBlock?.isMonitored && this.runtime) {
            this.runtime.requestUpdateMonitor({ id: flyoutBlock.id, params: this.getBlockParams(flyoutBlock) });
          }
        }
        break;
      }
      case "mutation":
        if (args.value && typeof args.value === "object") {
          block.mutation = cloneMutation(args.value as BlockMutation);
        }
        break;
      case "checkbox": {
        if (!this.runtime || !rt) break;
        // Blok ber-field (kecuali variabel/list) memakai id monitor unik per kombinasi field.
        if (
          block.fields &&
          Object.keys(block.fields).length > 0 &&
          block.opcode !== "data_variable" &&
          block.opcode !== "data_listcontents"
        ) {
          const newId = getMonitorIdForBlockWithArgs(block.id, block.fields);
          const monitorBlocks = this.runtime.monitorBlocks as BlocksContainer;
          let newBlock = monitorBlocks.getBlock(newId);
          if (!newBlock) {
            newBlock = JSON.parse(JSON.stringify(block)) as ContainerBlock;
            newBlock.id = newId;
            monitorBlocks.createBlock(newBlock);
          }
          block = newBlock;
        }
        this.toggleMonitorCheckbox(block, Boolean(args.value));
        break;
      }
    }
    this.emitProjectChanged();
    this.resetCache();
  }

  private toggleMonitorCheckbox(block: ContainerBlock, checked: boolean): void {
    const runtime = this.runtime;
    const rt = asRuntimeInternal(runtime);
    if (!runtime || !rt) return;
    const wasMonitored = block.isMonitored;
    block.isMonitored = checked;
    const stage = runtime.getTargetForStage();
    let isSpriteLocalVariable = false;
    if (block.opcode === "data_variable") {
      isSpriteLocalVariable = !stage?.variables[String(block.fields.VARIABLE?.id ?? "")];
    } else if (block.opcode === "data_listcontents") {
      isSpriteLocalVariable = !stage?.variables[String(block.fields.LIST?.id ?? "")];
    }
    const isSpriteSpecific =
      isSpriteLocalVariable ||
      (has(rt.monitorBlockInfo, block.opcode) && Boolean(rt.monitorBlockInfo[block.opcode]?.isSpriteSpecific));
    if (isSpriteSpecific) {
      block.targetId = block.targetId || runtime.getEditingTarget()?.id || null;
    } else {
      block.targetId = null;
    }
    if (wasMonitored && !block.isMonitored) {
      rt.requestHideMonitor(block.id);
    } else if (!wasMonitored && block.isMonitored) {
      if (!rt.requestShowMonitor(block.id)) {
        const target = block.targetId ? runtime.getTargetById(block.targetId) : undefined;
        runtime.requestAddMonitor({
          ...DEFAULT_MONITOR,
          id: block.id,
          targetId: block.targetId ?? null,
          spriteName: target ? target.getName() : null,
          opcode: block.opcode,
          params: this.getBlockParams(block),
          value: "",
          mode: block.opcode === "data_listcontents" ? "list" : "default",
        });
      }
    }
  }

  moveBlock(e: {
    id: string;
    oldParent?: string | null;
    oldInput?: string | null;
    newParent?: string | null;
    newInput?: string | null;
    newCoordinate?: { x: number; y: number } | null;
  }): void {
    const block = this.getBlock(e.id);
    if (!block) return;
    let didChange = false;
    if (e.newCoordinate) {
      didChange = block.x !== e.newCoordinate.x || block.y !== e.newCoordinate.y;
      block.x = e.newCoordinate.x;
      block.y = e.newCoordinate.y;
    }
    // Lepas dari parent lama.
    if (e.oldParent !== undefined && e.oldParent !== null) {
      const oldParent = this.getBlock(e.oldParent);
      if (oldParent) {
        const oldInput = e.oldInput !== undefined && e.oldInput !== null ? oldParent.inputs[e.oldInput] : undefined;
        if (oldInput && oldInput.block === e.id) {
          oldInput.block = null;
        } else if (oldParent.next === e.id) {
          oldParent.next = null;
        }
      }
      block.parent = null;
      didChange = true;
    }
    if (e.newParent === undefined || e.newParent === null) {
      // Jadi stack top-level.
      this.addScript(e.id);
    } else {
      const newParent = this.getBlock(e.newParent);
      if (!newParent) return;
      this.deleteScript(e.id);
      if (e.newInput === undefined || e.newInput === null) {
        newParent.next = e.id;
      } else {
        let oldShadow: string | null = null;
        const existing = newParent.inputs[e.newInput];
        if (existing) oldShadow = existing.shadow;
        // Shadow yang dipindah ke input tetap shadow input itu.
        if (block.shadow) oldShadow = e.id;
        newParent.inputs[e.newInput] = { name: e.newInput, block: e.id, shadow: oldShadow };
      }
      block.parent = e.newParent;
      didChange = true;
    }
    this.resetCache();
    if (didChange) this.emitProjectChanged();
  }

  /** Jalankan thread monitor untuk semua blok bercentang (dipanggil runtime setiap frame). */
  runAllMonitored(): void {
    const rt = asRuntimeInternal(this.runtime);
    if (!rt) return;
    if (this.cache.monitored === null) {
      this.cache.monitored = Object.keys(this._blocks)
        .filter((blockId) => this._blocks[blockId]?.isMonitored)
        .map((blockId) => {
          const targetId = this._blocks[blockId]?.targetId;
          return { blockId, target: targetId ? (rt.getTargetById(targetId) ?? null) : null };
        });
    }
    for (const { blockId, target } of this.cache.monitored) {
      rt.addMonitorScript(blockId, target);
    }
  }

  deleteBlock(blockId: string): void {
    const block = this.getBlock(blockId);
    if (!block) return;
    if (block.next !== null) this.deleteBlock(block.next);
    for (const name in block.inputs) {
      const input = block.inputs[name];
      if (!input) continue;
      if (input.block !== null) this.deleteBlock(input.block);
      if (input.shadow !== null && input.shadow !== input.block) this.deleteBlock(input.shadow);
    }
    this.deleteScript(blockId);
    delete this._blocks[blockId];
    this.resetCache();
    this.emitProjectChanged();
  }

  deleteAllBlocks(): void {
    for (const id of Object.keys(this._blocks)) this.deleteBlock(id);
  }

  getAllVariableAndListReferences(
    optBlocks?: Record<string, Block> | null,
    optIncludeBroadcast = false,
  ): Record<string, { referencingField: BlockField; type: string }[]> {
    const blocks = optBlocks ?? this._blocks;
    const all: Record<string, { referencingField: BlockField; type: string }[]> = Object.create(null) as Record<
      string,
      { referencingField: BlockField; type: string }[]
    >;
    for (const blockId in blocks) {
      const fields = blocks[blockId]?.fields;
      if (!fields) continue;
      let field: BlockField | null = null;
      let type = "";
      if (fields.VARIABLE) {
        field = fields.VARIABLE;
        type = "";
      } else if (fields.LIST) {
        field = fields.LIST;
        type = "list";
      } else if (optIncludeBroadcast && fields.BROADCAST_OPTION) {
        field = fields.BROADCAST_OPTION;
        type = "broadcast_msg";
      }
      if (field) {
        const id = String(field.id);
        const ref = { referencingField: field, type };
        if (all[id]) all[id].push(ref);
        else all[id] = [ref];
      }
    }
    return all;
  }

  updateBlocksAfterVarRename(varId: string, newName: string): void {
    for (const blockId in this._blocks) {
      const fields = this._blocks[blockId]?.fields;
      if (!fields) continue;
      const field = fields.VARIABLE ?? fields.LIST;
      if (field && field.id === varId) field.value = newName;
    }
  }

  /** Stage <-> sprite: whenthisspriteclicked <-> whenstageclicked. */
  updateTargetSpecificBlocks(isStage: boolean): void {
    for (const blockId in this._blocks) {
      const block = this._blocks[blockId];
      if (!block) continue;
      if (isStage && block.opcode === "event_whenthisspriteclicked") block.opcode = "event_whenstageclicked";
      else if (!isStage && block.opcode === "event_whenstageclicked") block.opcode = "event_whenthisspriteclicked";
    }
  }

  /** Ganti nama costume/sound/backdrop/sprite di menu blok (rename di editor). */
  updateAssetName(oldName: string, newName: string, assetType: "costume" | "sound" | "backdrop" | "sprite"): void {
    const fieldNames: Record<typeof assetType, string[]> = {
      costume: ["COSTUME"],
      sound: ["SOUND_MENU"],
      backdrop: ["BACKDROP"],
      sprite: ["TOWARDS", "TO", "OBJECT", "VIDEOONMENU2", "DISTANCETOMENU", "TOUCHINGOBJECTMENU", "CLONE_OPTION"],
    };
    for (const blockId in this._blocks) {
      const fields = this._blocks[blockId]?.fields;
      if (!fields) continue;
      const key = fieldNames[assetType].find((n) => has(fields, n));
      const field = key ? fields[key] : undefined;
      if (field && field.value === oldName) field.value = newName;
    }
  }

  updateSensingOfReference(oldName: string, newName: string, targetName: string): boolean {
    let updated = false;
    for (const blockId in this._blocks) {
      const block = this._blocks[blockId];
      const objectInput = block?.inputs.OBJECT;
      if (
        block?.opcode === "sensing_of" &&
        block.fields.PROPERTY?.value === oldName &&
        objectInput &&
        objectInput.block === objectInput.shadow &&
        objectInput.block
      ) {
        const inputBlock = this.getBlock(objectInput.block);
        if (inputBlock?.fields.OBJECT?.value === targetName && block.fields.PROPERTY) {
          block.fields.PROPERTY.value = newName;
          updated = true;
        }
      }
    }
    if (updated) this.resetCache();
    return updated;
  }

  /** Nilai field blok + field input-nya (params monitor). */
  getBlockParams(block: Block): Record<string, string> {
    const params: Record<string, string> = {};
    for (const key in block.fields) params[key] = String(block.fields[key]?.value ?? "");
    for (const inputKey in block.inputs) {
      const inputId = block.inputs[inputKey]?.block;
      const inputBlock = inputId ? this.getBlock(inputId) : undefined;
      if (!inputBlock) continue;
      for (const key in inputBlock.fields) params[key] = String(inputBlock.fields[key]?.value ?? "");
    }
    return params;
  }

  /** Cache eksekusi per blok (BlocksExecuteCache.getCached). */
  getExecuteCached<T>(blockId: string, make: (block: Block) => T): T | null {
    const cached = this.cache.executeCached.get(blockId);
    if (typeof cached !== "undefined") return cached as T;
    const block = this.getBlock(blockId);
    if (typeof block === "undefined") return null;
    const created = make(block);
    this.cache.executeCached.set(blockId, created);
    return created;
  }

  /** Script top-level dengan opcode tertentu + field (huruf besar) untuk startHats (BlocksRuntimeCache). */
  getScriptsByOpcode(opcode: string): HatScriptCache[] {
    let scripts = this.cache.scripts[opcode];
    if (!scripts) {
      scripts = [];
      this.cache.scripts[opcode] = scripts;
      for (const topBlockId of this._scripts) {
        const block = this.getBlock(topBlockId);
        if (block && block.opcode === opcode) scripts.push(this.makeHatScriptCache(topBlockId));
      }
    }
    return scripts;
  }

  private makeHatScriptCache(blockId: string): HatScriptCache {
    const block = this.getBlock(blockId);
    const fields = this.getFields(block) ?? {};
    const fieldsOfInputs: Record<string, BlockField> = { ...fields };
    if (Object.keys(fields).length === 0) {
      const inputs = this.getInputs(block) ?? {};
      for (const name in inputs) {
        const id = inputs[name]?.block;
        const inputBlock = id ? this.getBlock(id) : undefined;
        Object.assign(fieldsOfInputs, this.getFields(inputBlock) ?? {});
      }
    }
    for (const key in fieldsOfInputs) {
      const src = fieldsOfInputs[key];
      if (!src) continue;
      const field = { ...src };
      if (typeof field.value === "string") field.value = field.value.toUpperCase();
      fieldsOfInputs[key] = field;
    }
    return { blockId, fieldsOfInputs };
  }

  toRecord(): Record<string, Block> {
    return this._blocks;
  }

  private getCustomBlockInternal(defineBlock: Block): Block | undefined {
    const id = defineBlock.inputs?.custom_block?.block;
    return id ? this.getBlock(id) : undefined;
  }

  private addScript(topBlockId: string): void {
    if (this._scripts.indexOf(topBlockId) > -1) return;
    this._scripts.push(topBlockId);
    const block = this.getBlock(topBlockId);
    if (block) block.topLevel = true;
  }

  private deleteScript(topBlockId: string): void {
    const i = this._scripts.indexOf(topBlockId);
    if (i > -1) this._scripts.splice(i, 1);
    const block = this.getBlock(topBlockId);
    if (block) block.topLevel = false;
  }
}

export function createBlocksContainer(runtime: IRuntime | null, optNoGlow = false): IBlocksContainer {
  return new BlocksContainer(runtime, optNoGlow);
}

export function isBlocksContainer(c: IBlocksContainer | null | undefined): c is BlocksContainer {
  return c instanceof BlocksContainer;
}
