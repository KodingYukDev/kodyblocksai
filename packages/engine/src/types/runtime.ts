/**
 * Kontrak inti eksekusi: Thread, BlockUtility, primitive, BlocksContainer, Sequencer, Runtime.
 * Semantik WAJIB sama dengan scratch-vm (engine/thread.js, sequencer.js, execute.js, runtime.js,
 * block-utility.js, blocks.js). Lihat docs/CONTRACTS.md bagian "Eksekusi".
 */
import type { IAudioEngine } from "./audio";
import type { EditorWorkspaceEvent } from "./editor";
import type { ExtensionInfo, ExtensionModule } from "./extension";
import type { IODeviceName, IODevices } from "./io";
import type { MonitorRecord } from "./monitor";
import type { Block, BlockField, BlockInput, BlockMutation, ProjectModel, ScratchValue } from "./project-model";
import type { IRenderer } from "./renderer";
import type { IMediaLoader, ITarget } from "./target";

// ---------------------------------------------------------------------------
// Konstanta waktu (runtime.js)
// ---------------------------------------------------------------------------

/** Mode kompatibilitas 30 fps (default scratch-gui: ON). */
export const THREAD_STEP_INTERVAL_COMPATIBILITY = 1000 / 30;
/** Mode 60 fps. */
export const THREAD_STEP_INTERVAL = 1000 / 60;
/** Batas clone persis Runtime.MAX_CLONES. */
export const MAX_CLONES = 300;
/** Batas waktu warp (Sequencer.WARP_TIME). */
export const WARP_TIME = 500;

// ---------------------------------------------------------------------------
// Thread
// ---------------------------------------------------------------------------

/** Nilai numerik persis Thread.STATUS_* scratch-vm. */
export const ThreadStatus = {
  RUNNING: 0,
  PROMISE_WAIT: 1,
  YIELD: 2,
  YIELD_TICK: 3,
  DONE: 4,
} as const;
export type ThreadStatus = (typeof ThreadStatus)[keyof typeof ThreadStatus];

export interface StackFrame {
  isLoop: boolean;
  warpMode: boolean;
  justReported: ScratchValue | null;
  /** id blok yang sedang menunggu nilai reporter (execute.js). */
  reporting: string;
  reported: Record<string, unknown> | null;
  waitingReporter: string | null;
  /** Parameter procedure (nama -> nilai). */
  params: Record<string, ScratchValue> | null;
  /** State per-blok yang bertahan antar-yield (util.stackFrame), mis. loopCounter, timer. */
  executionContext: Record<string, unknown> | null;
}

export interface IThread {
  readonly topBlock: string;
  readonly target: ITarget;
  readonly blockContainer: IBlocksContainer;
  stack: string[];
  stackFrames: StackFrame[];
  status: ThreadStatus;
  isKilled: boolean;
  /** Thread dari klik blok di editor (glow, visual report). */
  stackClick: boolean;
  /** Thread untuk memperbarui monitor (runtime._step menjalankan monitor). */
  updateMonitor: boolean;
  requestScriptGlowInFrame: boolean;
  blockGlowInFrame: string | null;
  justReported: ScratchValue | null;
  /** Timer warp (dibuat saat masuk warp mode). */
  warpTimer: { start(): void; timeElapsed(): number } | null;
  /** Fungsi hat edge-activated / hat dengan nilai prediksi (_hats). */
  hatEdgeValue?: unknown;

  pushStack(blockId: string): void;
  reuseStackForNextBlock(blockId: string): void;
  popStack(): string | undefined;
  stopThisScript(): void;
  peekStack(): string | undefined;
  peekStackFrame(): StackFrame | undefined;
  peekParentStackFrame(): StackFrame | null;
  pushReportedValue(value: ScratchValue): void;
  initParams(): void;
  pushParam(paramName: string, value: ScratchValue): void;
  getParam(paramName: string): ScratchValue | null;
  atStackTop(): boolean;
  goToNextBlock(): void;
  isRecursiveCall(procedureCode: string): boolean;
  getId(): string;
}

// ---------------------------------------------------------------------------
// Primitive & BlockUtility
// ---------------------------------------------------------------------------

/**
 * Argumen blok yang diberikan execute ke primitive:
 * - setiap input -> nilai reporter/shadow (string/number/boolean, BELUM di-cast; primitive yang meng-cast).
 * - setiap field -> field.value (string), KECUALI field VARIABLE / LIST / BROADCAST_OPTION
 *   -> { id, name } (lihat execute.js).
 * - mutation -> block.mutation (kalau ada).
 * - BROADCAST_INPUT -> { BROADCAST_OPTION: { id, name } } persis execute.js.
 */
export interface FieldRef {
  id: string;
  name: string;
}
export type BlockArgs = Record<string, unknown> & { mutation?: BlockMutation | null };

/** Nilai kembali primitive. Promise = thread PROMISE_WAIT sampai resolve. */
export type PrimitiveResult = ScratchValue | void | undefined | Promise<ScratchValue | void | undefined>;

export type PrimitiveFn = (args: BlockArgs, util: BlockUtility) => PrimitiveResult;

export interface HatMetadata {
  /** Hat dievaluasi tiap frame dan hanya terpicu saat nilai berubah false -> true. */
  edgeActivated?: boolean;
  /** Memicu ulang thread yang sedang jalan dari hat yang sama (true) atau dibiarkan (false). */
  restartExistingThreads?: boolean;
}

export interface MonitoredMetadata {
  isSpriteSpecific?: boolean;
  /** Id monitor; default = id blok di flyout. */
  getId?: (targetId: string | null, fields: Record<string, BlockField>) => string;
}

/** Paket blok satu kategori (padanan class Scratch3*Blocks). */
export interface BlockPackage {
  getPrimitives(): Record<string, PrimitiveFn>;
  getHats?(): Record<string, HatMetadata>;
  getMonitored?(): Record<string, MonitoredMetadata>;
}

export type BlockPackageFactory = (runtime: IRuntime) => BlockPackage;

/**
 * Padanan BlockUtility scratch-vm. Satu instance dipakai ulang oleh sequencer
 * (jangan simpan referensi util di luar pemanggilan primitive).
 */
export interface BlockUtility {
  readonly target: ITarget;
  readonly runtime: IRuntime;
  readonly thread: IThread;
  readonly sequencer: ISequencer;
  /** executionContext frame aktif; dipakai blok bertimer/loop untuk menyimpan state. */
  readonly stackFrame: Record<string, unknown>;
  /** Waktu sekarang (ms) dari timer runtime. */
  readonly nowObj: { now(): number };

  stackTimerFinished(): boolean;
  stackTimerNeedsInit(): boolean;
  startStackTimer(durationMs: number): void;
  /** Thread menyerah sampai tick berikutnya (STATUS_YIELD). */
  yield(): void;
  /** Menyerah sampai frame berikutnya walau dalam warp (STATUS_YIELD_TICK). */
  yieldTick(): void;
  /** Masuk ke cabang SUBSTACK (1) / SUBSTACK2 (2). isLoop=true menjadikan blok ini loop. */
  startBranch(branchNum: number, isLoop: boolean): void;
  stopAll(): void;
  stopOtherTargetThreads(): void;
  stopThisScript(): void;
  startProcedure(procedureCode: string): void;
  getProcedureParamNamesAndIds(procedureCode: string): [string[], string[]] | null;
  getProcedureParamNamesIdsAndDefaults(procedureCode: string): [string[], string[], ScratchValue[]] | null;
  initParams(): void;
  pushParam(paramName: string, value: ScratchValue): void;
  getParam(paramName: string): ScratchValue | null;
  startHats(
    requestedHat: string,
    optMatchFields?: Record<string, string>,
    optTarget?: ITarget,
  ): IThread[];
  ioQuery<K extends IODeviceName>(device: K, func: string, args?: unknown[]): unknown;
}

// ---------------------------------------------------------------------------
// Blocks container (blocks.js)
// ---------------------------------------------------------------------------

export interface IBlocksContainer {
  /** true untuk container flyout/monitor (tidak memicu hat). */
  readonly forceNoGlow: boolean;
  getBlock(blockId: string): Block | undefined;
  /** id blok top-level (urutan penyisipan, sama seperti _scripts). */
  getScripts(): string[];
  getNextBlock(blockId: string): string | null;
  /** Cabang ke-n (1 = SUBSTACK, 2 = SUBSTACK2). */
  getBranch(blockId: string, branchNum: number): string | null;
  getOpcode(block: Block | undefined): string | null;
  getFields(block: Block | undefined): Record<string, BlockField> | null;
  getInputs(block: Block | undefined): Record<string, BlockInput> | null;
  getMutation(block: Block | undefined): BlockMutation | null;
  getTopLevelScript(blockId: string): string | null;
  getProcedureDefinition(procedureCode: string): string | null;
  getProcedureParamNamesAndIds(procedureCode: string): [string[], string[]] | null;
  getProcedureParamNamesIdsAndDefaults(procedureCode: string): [string[], string[], ScratchValue[]] | null;
  createBlock(block: Block): void;
  changeBlock(args: { id: string; element: "field" | "mutation" | "checkbox"; name?: string; value: unknown }): void;
  moveBlock(args: {
    id: string;
    oldParent?: string | null;
    oldInput?: string | null;
    newParent?: string | null;
    newInput?: string | null;
    newCoordinate?: { x: number; y: number } | null;
  }): void;
  deleteBlock(blockId: string): void;
  /** Terapkan event dari editor (padanan blocklyListen). */
  applyEditorEvent(event: EditorWorkspaceEvent): void;
  updateBlocksAfterVarRename(varId: string, newName: string): void;
  getAllVariableAndListReferences(): Record<string, { referencingField: BlockField; type: string }[]>;
  duplicate(): IBlocksContainer;
  resetCache(): void;
  /** Semua blok (id -> block), untuk serialisasi. */
  toRecord(): Record<string, Block>;
}

// ---------------------------------------------------------------------------
// Sequencer (sequencer.js)
// ---------------------------------------------------------------------------

export interface ISequencer {
  readonly runtime: IRuntime;
  /** Menjalankan thread sampai WORK_TIME (75% dari currentStepTime) habis atau redraw diminta. */
  stepThreads(): IThread[];
  stepThread(thread: IThread): void;
  stepToBranch(thread: IThread, branchNum: number, isLoop: boolean): void;
  stepToProcedure(thread: IThread, procedureCode: string): void;
  retireThread(thread: IThread): void;
}

// ---------------------------------------------------------------------------
// Runtime (runtime.js)
// ---------------------------------------------------------------------------

export interface ToggleScriptOptions {
  target?: ITarget;
  stackClick?: boolean;
  updateMonitor?: boolean;
}

export type SayType = "say" | "think";

/** Event runtime. Nama string mengikuti scratch-vm agar mudah dipetakan. */
export type RuntimeEventMap = {
  PROJECT_START: void;
  PROJECT_RUN_START: void;
  PROJECT_RUN_STOP: void;
  PROJECT_STOP_ALL: void;
  PROJECT_CHANGED: void;
  PROJECT_LOADED: void;
  RUNTIME_STEP: { threads: number };
  STOP_FOR_TARGET: { target: ITarget };
  TARGETS_UPDATE: { emitProjectChanged: boolean };
  TARGET_WAS_CREATED: { target: ITarget; source: ITarget | null };
  TARGET_WAS_REMOVED: { target: ITarget };
  EDITING_TARGET_CHANGED: { target: ITarget | null };
  SCRIPT_GLOW_ON: { id: string };
  SCRIPT_GLOW_OFF: { id: string };
  BLOCK_GLOW_ON: { id: string };
  BLOCK_GLOW_OFF: { id: string };
  VISUAL_REPORT: { id: string; value: ScratchValue };
  MONITORS_UPDATE: { monitors: ReadonlyMap<string, MonitorRecord> };
  SAY: { target: ITarget; type: SayType; text: string };
  QUESTION: { question: string | null };
  ANSWER: { answer: string };
  BLOCKSINFO_UPDATE: { info: ExtensionInfo };
  EXTENSION_ADDED: { info: ExtensionInfo };
  TURBO_MODE_ON: void;
  TURBO_MODE_OFF: void;
  COMPATIBILITY_MODE_CHANGED: { enabled: boolean };
  HAS_CLOUD_DATA_UPDATE: { hasCloud: boolean };
  /** Kesalahan primitive yang tertangkap (thread lanjut seperti scratch-vm). */
  RUNTIME_ERROR: { error: unknown; blockId: string | null; opcode: string | null };
};

export type RuntimeEventName = keyof RuntimeEventMap;
export type RuntimeListener<K extends RuntimeEventName> = (payload: RuntimeEventMap[K]) => void;

export interface IRuntime {
  readonly targets: ITarget[];
  /** Target berurutan layer (bawah -> atas) untuk startHats; stage di indeks 0. */
  readonly executableTargets: ITarget[];
  readonly threads: IThread[];
  readonly sequencer: ISequencer;
  readonly ioDevices: IODevices;
  /** Blok flyout (palet) dan monitor, terpisah dari blok target. */
  readonly flyoutBlocks: IBlocksContainer;
  readonly monitorBlocks: IBlocksContainer;
  renderer: IRenderer | null;
  audioEngine: IAudioEngine | null;

  /** Interval step sekarang (ms), 1000/30 bila compatibilityMode. */
  readonly currentStepTime: number;
  /** Waktu (ms) awal frame berjalan. */
  readonly currentMSecs: number;
  compatibilityMode: boolean;
  turboMode: boolean;
  redrawRequested: boolean;

  // --- siklus hidup ---
  start(): void;
  /** Hentikan loop (bukan stop all). */
  quit(): void;
  /** Jalankan satu frame secara manual (dipakai tes & parity). */
  step(): void;
  greenFlag(): void;
  stopAll(): void;
  dispose(): void;
  setCompatibilityMode(enabled: boolean): void;
  setTurboMode(enabled: boolean): void;
  requestRedraw(): void;

  // --- project ---
  loadProject(model: ProjectModel, media: IMediaLoader, assets?: ReadonlyMap<string, Uint8Array>): Promise<void>;
  addTarget(target: ITarget): void;
  disposeTarget(target: ITarget): void;
  getTargetForStage(): ITarget | undefined;
  getTargetById(id: string): ITarget | undefined;
  getSpriteTargetByName(name: string): ITarget | undefined;
  getEditingTarget(): ITarget | null;
  setEditingTarget(target: ITarget | null): void;
  requestTargetsUpdate(target?: ITarget): void;
  emitProjectChanged(): void;
  getAllVarNamesOfType(type: string): string[];

  // --- clone ---
  clonesAvailable(): boolean;
  changeCloneCounter(delta: number): void;

  // --- thread ---
  startHats(
    requestedHat: string,
    optMatchFields?: Record<string, string>,
    optTarget?: ITarget,
  ): IThread[];
  /** Klik skrip di editor: jalankan atau hentikan. */
  toggleScript(topBlockId: string, opts?: ToggleScriptOptions): IThread | null;
  isActiveThread(thread: IThread): boolean;
  isWaitingThread(thread: IThread): boolean;
  /** Buat thread baru (_pushThread). */
  pushThread(topBlockId: string, target: ITarget, opts?: ToggleScriptOptions): IThread;
  /** Restart thread (_restartThread). */
  restartThread(thread: IThread): IThread;
  stopForTarget(target: ITarget, exceptThread?: IThread): void;
  allScriptsDo(fn: (topBlockId: string, target: ITarget) => void, optTarget?: ITarget): void;
  allScriptsByOpcodeDo(
    opcode: string,
    fn: (script: { blockId: string; fieldsOfInputs: Record<string, BlockField> }, target: ITarget) => void,
    optTarget?: ITarget,
  ): void;

  // --- blok & ekstensi ---
  registerBlockPackage(pkg: BlockPackage): void;
  /** Daftarkan ekstensi (pen/music/AI). Opcode didaftarkan sebagai `${info.id}_${block.opcode}`. */
  registerExtension(module: ExtensionModule): ExtensionInfo;
  isExtensionLoaded(extensionId: string): boolean;
  getExtensionInfo(extensionId: string): ExtensionInfo | undefined;
  getOpcodeFunction(opcode: string): PrimitiveFn | undefined;
  getIsHat(opcode: string): boolean;
  getIsEdgeActivatedHat(opcode: string): boolean;
  getHatMetadata(opcode: string): HatMetadata | undefined;
  getMonitoredMetadata(opcode: string): MonitoredMetadata | undefined;

  // --- monitor ---
  requestAddMonitor(record: MonitorRecord): void;
  requestUpdateMonitor(partial: Partial<MonitorRecord> & { id: string }): void;
  requestRemoveMonitor(monitorId: string): void;
  getMonitorState(): ReadonlyMap<string, MonitorRecord>;

  // --- glow & laporan ke editor ---
  glowScript(topBlockId: string, isGlowing: boolean): void;
  glowBlock(blockId: string, isGlowing: boolean): void;
  visualReport(blockId: string, value: ScratchValue): void;

  // --- event ---
  on<K extends RuntimeEventName>(event: K, fn: RuntimeListener<K>): () => void;
  off<K extends RuntimeEventName>(event: K, fn: RuntimeListener<K>): void;
  emit<K extends RuntimeEventName>(event: K, payload: RuntimeEventMap[K]): void;
}
