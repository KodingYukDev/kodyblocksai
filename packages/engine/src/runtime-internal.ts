/**
 * Permukaan tambahan Runtime/Target yang ada di scratch-vm tetapi tidak di kontrak IRuntime/ITarget.
 * Dipakai antar-modul engine-core (target, blocks-container, io, execute). Tipe pelengkap ini milik
 * agent engine-core; kontrak utama tetap di types/*.
 */
import type { BlockField, ScratchValue, VariableType } from "./types/project-model";
import type { DrawableGroup } from "./types/renderer";
import type { IRuntime, MonitoredMetadata } from "./types/runtime";
import type { ITarget, Variable } from "./types/target";

/** Event runtime tambahan (nama sama dengan scratch-vm) yang tidak ada di RuntimeEventMap. */
export type ExtraRuntimeEventMap = {
  KEY_PRESSED: string;
  RUNTIME_STARTED: void;
  RUNTIME_DISPOSED: void;
  BLOCKS_NEED_UPDATE: void;
  TOOLBOX_EXTENSIONS_NEED_UPDATE: void;
  BLOCK_DRAG_UPDATE: boolean;
};

export interface IRuntimeInternal extends IRuntime {
  readonly monitorBlockInfo: Record<string, MonitoredMetadata>;
  /** Bilangan acak [0,1) dari RuntimeOptions.random (default Math.random). */
  random(): number;
  moveExecutable(target: ITarget, delta: number): number;
  setExecutablePosition(target: ITarget, newIndex: number): number;
  removeExecutable(target: ITarget): void;
  addMonitorScript(topBlockId: string, optTarget?: ITarget | null): void;
  quietGlow(scriptBlockId: string): void;
  requestHideMonitor(monitorId: string): boolean;
  requestShowMonitor(monitorId: string): boolean;
  requestRemoveMonitorByTargetId(targetId: string): void;
  requestBlocksUpdate(): void;
  requestToolboxExtensionsUpdate(): void;
  emitBlockDragUpdate(areBlocksOverGui: boolean): void;
  createNewGlobalVariable(name: string, optVarId?: string, optVarType?: VariableType): Variable;
  getTargetByDrawableId(drawableId: number): ITarget | undefined;
  /** Daftar target dapat diganti (stopAll membuang clone). */
  setTargets(targets: ITarget[]): void;
  emitExtra<K extends keyof ExtraRuntimeEventMap>(event: K, payload: ExtraRuntimeEventMap[K]): void;
  onExtra<K extends keyof ExtraRuntimeEventMap>(
    event: K,
    fn: (payload: ExtraRuntimeEventMap[K]) => void,
  ): () => void;
}

export function asRuntimeInternal(runtime: IRuntime | null | undefined): IRuntimeInternal | null {
  if (runtime && typeof (runtime as Partial<IRuntimeInternal>).moveExecutable === "function") {
    return runtime as IRuntimeInternal;
  }
  return null;
}

/** Bilangan acak runtime (RuntimeOptions.random) untuk dipakai primitive; fallback Math.random. */
export function getRuntimeRandom(runtime: IRuntime): () => number {
  const rt = asRuntimeInternal(runtime);
  return rt ? () => rt.random() : () => Math.random();
}

/** Permukaan RenderedTarget scratch-vm di luar ITarget. */
export interface IRenderedTarget extends ITarget {
  /** Urutan layer sementara saat loadProject (scratch-vm target.layerOrder). */
  layerOrder?: number;
  hasEdgeActivatedValue(blockId: string): boolean;
  updateEdgeActivatedValue(blockId: string, newValue: unknown): unknown;
  clearEdgeActivatedValues(): void;
  onGreenFlag(): void;
  onStopAll(): void;
  isSprite(): boolean;
  startDrag(): void;
  stopDrag(): void;
  updateAllDrawableProperties(): void;
  initDrawable(layerGroup: DrawableGroup): void;
  postSpriteInfo(data: Record<string, unknown>): void;
  createComment(
    id: string,
    blockId: string | null,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    minimized: boolean,
  ): void;
  deleteMonitors(): void;
  duplicateVariables(): Record<string, Variable>;
}

export function asRenderedTarget(target: ITarget | null | undefined): IRenderedTarget | null {
  if (target && typeof (target as Partial<IRenderedTarget>).hasEdgeActivatedValue === "function") {
    return target as IRenderedTarget;
  }
  return null;
}

/** Blok di container dengan properti monitor (scratch-vm menempelkannya ke objek blok). */
export interface ContainerBlockExtras {
  isMonitored?: boolean;
  targetId?: string | null;
}

/** Script hat beserta field (dinaikkan huruf besar) untuk startHats (RuntimeScriptCache). */
export interface HatScriptCache {
  blockId: string;
  fieldsOfInputs: Record<string, BlockField>;
}

export type { ScratchValue };
