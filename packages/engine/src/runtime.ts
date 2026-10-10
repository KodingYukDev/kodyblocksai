/**
 * Runtime (padanan scratch-vm 4.8.102 engine/runtime.js, BSD-3-Clause; lihat THIRD_PARTY.md):
 * loop frame, startHats, thread, clone counter, monitor, glow, event. Pemilik: agent engine-core.
 */
import { CORE_BLOCK_PACKAGES } from "./blocks/index";
import { BlocksContainer } from "./blocks-container";
import { execute } from "./execute";
import { registerExtensionInto, type ExtensionHost } from "./extension-manager";
import { createIODevices } from "./io/index";
import { loadProjectInto } from "./runtime-loader";
import {
  asRenderedTarget,
  type ExtraRuntimeEventMap,
  type IRuntimeInternal,
} from "./runtime-internal";
import { Sequencer } from "./sequencer";
import { StageLayering } from "./stage-layering";
import { GlowTracker, upperFields } from "./runtime-glows";
import { Thread } from "./thread";
import type { IAudioEngine } from "./types/audio";
import type { ExtensionInfo, ExtensionModule } from "./types/extension";
import type { IODevices, IVideoProvider } from "./types/io";
import type { MonitorRecord } from "./types/monitor";
import type { BlockField, ProjectModel, VariableType } from "./types/project-model";
import type { IRenderer } from "./types/renderer";
import {
  MAX_CLONES,
  THREAD_STEP_INTERVAL,
  THREAD_STEP_INTERVAL_COMPATIBILITY,
  ThreadStatus,
  type BlockPackage,
  type BlockPackageFactory,
  type HatMetadata,
  type IRuntime,
  type IThread,
  type MonitoredMetadata,
  type PrimitiveFn,
  type RuntimeEventMap,
  type RuntimeEventName,
  type RuntimeListener,
  type ToggleScriptOptions,
} from "./types/runtime";
import type { IMediaLoader, ITarget, Variable } from "./types/target";
import { TypedEmitter } from "./util/event-emitter";
import { MonitorStore } from "./monitors";
import { StringUtil, uid } from "./util/string-util";
import { defaultTimeSource, type TimeSource } from "./util/timer";
import { createVariable } from "./variable";

export interface RuntimeOptions {
  renderer?: IRenderer | null;
  audioEngine?: IAudioEngine | null;
  video?: IVideoProvider | null;
  /** Default true (30 fps) seperti scratch-gui. */
  compatibilityMode?: boolean;
  /** Sumber waktu (tes deterministik / parity). Dipakai untuk WORK_TIME, warp, dan currentMSecs. */
  time?: TimeSource;
  /** Bilangan acak [0,1) (tes deterministik / parity). Default Math.random. */
  random?: () => number;
  /** Loop otomatis (setInterval seperti scratch-vm). false untuk tes: panggil runtime.step(). Default true. */
  autoStart?: boolean;
  /** Paket blok yang didaftarkan saat konstruksi (default CORE_BLOCK_PACKAGES, seperti scratch-vm). */
  blockPackages?: readonly BlockPackageFactory[];
}

type AllEvents = RuntimeEventMap & ExtraRuntimeEventMap;

export class Runtime implements IRuntimeInternal, ExtensionHost {
  private _targets: ITarget[] = [];
  executableTargets: ITarget[] = [];
  threads: IThread[] = [];
  readonly sequencer: Sequencer;
  readonly flyoutBlocks: BlocksContainer;
  readonly monitorBlocks: BlocksContainer;
  readonly ioDevices: IODevices;
  audioEngine: IAudioEngine | null;
  monitorBlockInfo: Record<string, MonitoredMetadata> = {};

  currentStepTime: number;
  currentMSecs = 0;
  compatibilityMode: boolean;
  turboMode = false;
  redrawRequested = false;

  private _renderer: IRenderer | null = null;
  private readonly emitter = new TypedEmitter<AllEvents>();
  private readonly timeSource: TimeSource | null;
  private readonly randomFn: () => number;
  private _editingTarget: ITarget | null = null;
  private _primitives: Record<string, PrimitiveFn> = {};
  private _hats: Record<string, HatMetadata> = {};
  private _extensions = new Map<string, { info: ExtensionInfo; module: ExtensionModule }>();
  private readonly glows = new GlowTracker(
    (id, on) => this.glowScript(id, on),
    (running) => this.emit(running ? "PROJECT_RUN_START" : "PROJECT_RUN_STOP", undefined),
  );
  private _cloneCounter = 0;
  private _refreshTargets = false;
  private _steppingInterval: ReturnType<typeof setInterval> | null = null;
  private readonly monitors = new MonitorStore();
  /** Thread selesai pada step terakhir (untuk tes). */
  lastStepDoneThreads: IThread[] = [];
  /** Media loader project terakhir (untuk duplikat sprite). */
  mediaLoader: IMediaLoader | null = null;

  constructor(opts: RuntimeOptions = {}) {
    this.timeSource = opts.time ?? null;
    this.randomFn = opts.random ?? (() => Math.random());
    this.compatibilityMode = opts.compatibilityMode ?? true;
    this.currentStepTime = this.compatibilityMode ? THREAD_STEP_INTERVAL_COMPATIBILITY : THREAD_STEP_INTERVAL;
    this.sequencer = new Sequencer(this, opts.time ?? defaultTimeSource);
    this.flyoutBlocks = new BlocksContainer(this, true);
    this.monitorBlocks = new BlocksContainer(this, true);
    this.audioEngine = opts.audioEngine ?? null;
    if (opts.renderer) this.renderer = opts.renderer;
    this.updateCurrentMSecs();
    for (const factory of opts.blockPackages ?? CORE_BLOCK_PACKAGES) this.registerBlockPackage(factory(this));
    this.ioDevices = createIODevices(this, opts.video ?? null);
    if (opts.autoStart ?? true) this.start();
  }

  // ---------------------------------------------------------------- akses dasar
  get targets(): ITarget[] {
    return this._targets;
  }
  setTargets(targets: ITarget[]): void {
    this._targets = targets;
  }

  get renderer(): IRenderer | null {
    return this._renderer;
  }
  set renderer(renderer: IRenderer | null) {
    this._renderer = renderer;
    renderer?.setLayerGroupOrdering(StageLayering.LAYER_GROUPS);
  }

  random(): number {
    return this.randomFn();
  }

  updateCurrentMSecs(): void {
    this.currentMSecs = this.timeSource ? this.timeSource.now() : Date.now();
  }

  // ---------------------------------------------------------------- event
  on<K extends RuntimeEventName>(event: K, fn: RuntimeListener<K>): () => void {
    return this.emitter.on(event, fn as (p: AllEvents[K]) => void);
  }
  off<K extends RuntimeEventName>(event: K, fn: RuntimeListener<K>): void {
    this.emitter.off(event, fn as (p: AllEvents[K]) => void);
  }
  emit<K extends RuntimeEventName>(event: K, payload: RuntimeEventMap[K]): void {
    this.emitter.emit(event, payload as AllEvents[K]);
  }
  onExtra<K extends keyof ExtraRuntimeEventMap>(event: K, fn: (payload: ExtraRuntimeEventMap[K]) => void): () => void {
    return this.emitter.on(event, fn as (p: AllEvents[K]) => void);
  }
  emitExtra<K extends keyof ExtraRuntimeEventMap>(event: K, payload: ExtraRuntimeEventMap[K]): void {
    this.emitter.emit(event, payload as AllEvents[K]);
  }

  // ---------------------------------------------------------------- blok & ekstensi
  registerBlockPackage(pkg: BlockPackage): void {
    const primitives = pkg.getPrimitives();
    for (const op in primitives) {
      const fn = primitives[op];
      if (fn) this._primitives[op] = fn.bind(pkg);
    }
    const hats = pkg.getHats?.() ?? {};
    for (const hatName in hats) {
      const meta = hats[hatName];
      if (meta) this._hats[hatName] = meta;
    }
    if (pkg.getMonitored) this.monitorBlockInfo = { ...this.monitorBlockInfo, ...pkg.getMonitored() };
  }
  registerExtension(module: ExtensionModule): ExtensionInfo {
    return registerExtensionInto(this, module);
  }
  addPrimitive(opcode: string, fn: PrimitiveFn): void {
    this._primitives[opcode] = fn;
  }
  addHat(opcode: string, meta: HatMetadata): void {
    this._hats[opcode] = meta;
  }
  addLoadedExtension(info: ExtensionInfo, module: ExtensionModule): void {
    this._extensions.set(info.id, { info, module });
    this.emit("EXTENSION_ADDED", { info });
    this.emit("BLOCKSINFO_UPDATE", { info });
  }
  isExtensionLoaded(extensionId: string): boolean {
    return this._extensions.has(extensionId);
  }
  getExtensionInfo(extensionId: string): ExtensionInfo | undefined {
    return this._extensions.get(extensionId)?.info;
  }
  getExtensionModule(extensionId: string): ExtensionModule | undefined {
    return this._extensions.get(extensionId)?.module;
  }
  getOpcodeFunction(opcode: string): PrimitiveFn | undefined {
    return Object.prototype.hasOwnProperty.call(this._primitives, opcode) ? this._primitives[opcode] : undefined;
  }
  getIsHat(opcode: string): boolean {
    return Object.prototype.hasOwnProperty.call(this._hats, opcode);
  }
  getIsEdgeActivatedHat(opcode: string): boolean {
    return this.getIsHat(opcode) && Boolean(this._hats[opcode]?.edgeActivated);
  }
  getHatMetadata(opcode: string): HatMetadata | undefined {
    return this.getIsHat(opcode) ? this._hats[opcode] : undefined;
  }
  getMonitoredMetadata(opcode: string): MonitoredMetadata | undefined {
    return Object.prototype.hasOwnProperty.call(this.monitorBlockInfo, opcode) ? this.monitorBlockInfo[opcode] : undefined;
  }

  // ---------------------------------------------------------------- thread
  pushThread(topBlockId: string, target: ITarget, opts?: ToggleScriptOptions): IThread {
    const updateMonitor = Boolean(opts?.updateMonitor);
    const thread = new Thread(topBlockId, target, updateMonitor ? this.monitorBlocks : target.blocks);
    thread.stackClick = Boolean(opts?.stackClick);
    thread.updateMonitor = updateMonitor;
    thread.pushStack(topBlockId);
    this.threads.push(thread);
    return thread;
  }

  private stopThread(thread: IThread): void {
    thread.isKilled = true;
    this.sequencer.retireThread(thread);
  }

  restartThread(thread: IThread): IThread {
    const newThread = new Thread(thread.topBlock, thread.target, thread.blockContainer);
    newThread.stackClick = thread.stackClick;
    newThread.updateMonitor = thread.updateMonitor;
    newThread.pushStack(thread.topBlock);
    const i = this.threads.indexOf(thread);
    if (i > -1) {
      this.threads[i] = newThread;
      return newThread;
    }
    this.threads.push(thread);
    return thread;
  }

  isActiveThread(thread: IThread): boolean {
    return thread.stack.length > 0 && thread.status !== ThreadStatus.DONE && this.threads.indexOf(thread) > -1;
  }

  isWaitingThread(thread: IThread): boolean {
    return (
      thread.status === ThreadStatus.PROMISE_WAIT ||
      thread.status === ThreadStatus.YIELD_TICK ||
      !this.isActiveThread(thread)
    );
  }

  toggleScript(topBlockId: string, opts?: ToggleScriptOptions): IThread | null {
    const target = opts?.target ?? this._editingTarget;
    const stackClick = opts?.stackClick ?? false;
    if (!target) return null;
    for (const thread of this.threads) {
      // Skrip yang sedang jalan di-toggle -> dihentikan.
      if (thread.topBlock === topBlockId && thread.status !== ThreadStatus.DONE) {
        const opcode = target.blocks.getOpcode(target.blocks.getBlock(topBlockId)) ?? "";
        // Hat edge (dievaluasi tiap frame) boleh hidup bersama thread hasil klik.
        if (this.getIsEdgeActivatedHat(opcode) && thread.stackClick !== stackClick) continue;
        this.stopThread(thread);
        return null;
      }
    }
    return this.pushThread(topBlockId, target, { ...opts, stackClick });
  }

  addMonitorScript(topBlockId: string, optTarget?: ITarget | null): void {
    const target = optTarget ?? this._editingTarget;
    for (const thread of this.threads) {
      // Jangan tambah lagi bila thread monitor yang sama masih berjalan.
      if (thread.topBlock === topBlockId && thread.status !== ThreadStatus.DONE && thread.updateMonitor) return;
    }
    // scratch-vm membuat thread bertarget null yang langsung dipensiunkan; hasilnya sama dengan tidak dibuat.
    if (!target) return;
    this.pushThread(topBlockId, target, { updateMonitor: true });
  }

  allScriptsDo(fn: (topBlockId: string, target: ITarget) => void, optTarget?: ITarget): void {
    const targets = optTarget ? [optTarget] : this.executableTargets;
    for (let t = targets.length - 1; t >= 0; t--) {
      const target = targets[t];
      if (!target) continue;
      for (const topBlockId of target.blocks.getScripts()) fn(topBlockId, target);
    }
  }

  allScriptsByOpcodeDo(
    opcode: string,
    fn: (script: { blockId: string; fieldsOfInputs: Record<string, BlockField> }, target: ITarget) => void,
    optTarget?: ITarget,
  ): void {
    const targets = optTarget ? [optTarget] : this.executableTargets;
    // Dari atas ke bawah: sprite paling depan lebih dulu.
    for (let t = targets.length - 1; t >= 0; t--) {
      const target = targets[t];
      if (!target) continue;
      const blocks = target.blocks;
      const scripts =
        blocks instanceof BlocksContainer
          ? blocks.getScriptsByOpcode(opcode)
          : blocks
              .getScripts()
              .filter((id) => blocks.getBlock(id)?.opcode === opcode)
              .map((id) => ({ blockId: id, fieldsOfInputs: upperFields(blocks.getBlock(id)?.fields ?? {}) }));
      for (let j = 0; j < scripts.length; j++) {
        const script = scripts[j];
        if (script) fn(script, target);
      }
    }
  }

  startHats(requestedHat: string, optMatchFields?: Record<string, string>, optTarget?: ITarget): IThread[] {
    if (!this.getIsHat(requestedHat)) return [];
    const newThreads: IThread[] = [];
    const hatMeta = this._hats[requestedHat] ?? {};
    const matchFields: Record<string, string> = {};
    for (const key in optMatchFields) matchFields[key] = String(optMatchFields[key]).toUpperCase();

    this.allScriptsByOpcodeDo(
      requestedHat,
      (script, target) => {
        const { blockId: topBlockId, fieldsOfInputs: hatFields } = script;
        // Cocokkan field (mis. nama broadcast) sebelum predikat dievaluasi.
        for (const matchField in matchFields) {
          if (hatFields[matchField]?.value !== matchFields[matchField]) return;
        }
        if (hatMeta.restartExistingThreads) {
          // Hentikan & mulai ulang thread dari hat yang sama (thread klik boleh hidup bersama).
          for (const thread of this.threads) {
            if (thread.target === target && thread.topBlock === topBlockId && !thread.stackClick) {
              newThreads.push(this.restartThread(thread));
              return;
            }
          }
        } else {
          // Sudah ada yang berjalan -> jangan mulai lagi.
          for (const thread of this.threads) {
            if (
              thread.target === target &&
              thread.topBlock === topBlockId &&
              !thread.stackClick &&
              thread.status !== ThreadStatus.DONE
            ) {
              return;
            }
          }
        }
        newThreads.push(this.pushThread(topBlockId, target));
      },
      optTarget,
    );
    // Kompatibel Scratch 2: hat dievaluasi sebelum thread di-step.
    for (const thread of newThreads) {
      execute(this.sequencer, thread);
      thread.goToNextBlock();
    }
    return newThreads;
  }

  stopForTarget(target: ITarget, exceptThread?: IThread): void {
    this.emit("STOP_FOR_TARGET", { target });
    for (const thread of this.threads) {
      if (thread === exceptThread) continue;
      if (thread.target === target) this.stopThread(thread);
    }
  }

  // ---------------------------------------------------------------- siklus hidup
  greenFlag(): void {
    this.stopAll();
    this.emit("PROJECT_START", undefined);
    this.ioDevices.clock.resetProjectTimer();
    for (const target of this._targets) asRenderedTarget(target)?.clearEdgeActivatedValues();
    for (const target of [...this._targets]) asRenderedTarget(target)?.onGreenFlag();
    this.startHats("event_whenflagclicked");
  }

  stopAll(): void {
    this.emit("PROJECT_STOP_ALL", undefined);
    // Buang semua clone.
    const newTargets: ITarget[] = [];
    for (const target of [...this._targets]) {
      asRenderedTarget(target)?.onStopAll();
      if (!target.isOriginal) target.dispose();
      else newTargets.push(target);
    }
    this._targets = newTargets;
    if (this.sequencer.activeThread !== null) this.stopThread(this.sequencer.activeThread);
    this.threads = [];
  }

  /** Satu frame: hat edge, monitor, step thread, glow, draw, event. */
  step(): void {
    this.threads = this.threads.filter((thread) => !thread.isKilled);
    for (const hatType in this._hats) {
      if (this._hats[hatType]?.edgeActivated) this.startHats(hatType);
    }
    this.redrawRequested = false;
    this.monitorBlocks.runAllMonitored();
    const doneThreads = this.sequencer.stepThreads();
    const all = [...this.threads, ...doneThreads];
    this.glows.update(all, this._editingTarget, this.flyoutBlocks);
    // Thread yang selesai dalam satu frame tetap dihitung agar bendera hijau menyala.
    this.glows.updateRunStatus(all);
    this.lastStepDoneThreads = doneThreads;
    this._renderer?.draw();
    if (this._refreshTargets) {
      this.emit("TARGETS_UPDATE", { emitProjectChanged: false });
      this._refreshTargets = false;
    }
    if (this.monitors.takeChanged()) this.emit("MONITORS_UPDATE", { monitors: this.monitors.current });
    this.emit("RUNTIME_STEP", { threads: this.threads.length });
  }

  start(): void {
    if (this._steppingInterval) return;
    const interval = this.compatibilityMode ? THREAD_STEP_INTERVAL_COMPATIBILITY : THREAD_STEP_INTERVAL;
    this.currentStepTime = interval;
    const handle = setInterval(() => this.step(), interval);
    // Node (tes): jangan menahan proses tetap hidup.
    (handle as unknown as { unref?: () => void }).unref?.();
    this._steppingInterval = handle;
    this.emitExtra("RUNTIME_STARTED", undefined);
  }

  quit(): void {
    if (this._steppingInterval) clearInterval(this._steppingInterval);
    this._steppingInterval = null;
  }

  setCompatibilityMode(enabled: boolean): void {
    this.compatibilityMode = enabled;
    this.currentStepTime = enabled ? THREAD_STEP_INTERVAL_COMPATIBILITY : THREAD_STEP_INTERVAL;
    if (this._steppingInterval) {
      this.quit();
      this.start();
    }
    this.emit("COMPATIBILITY_MODE_CHANGED", { enabled });
  }

  setTurboMode(enabled: boolean): void {
    this.turboMode = enabled;
    this.emit(enabled ? "TURBO_MODE_ON" : "TURBO_MODE_OFF", undefined);
  }

  requestRedraw(): void {
    this.redrawRequested = true;
  }

  /** Kosongkan project (scratch-vm runtime.dispose): stop, hapus target & monitor. */
  clear(): void {
    this.stopAll();
    for (const target of this._targets) if (target.isOriginal) asRenderedTarget(target)?.deleteMonitors();
    for (const target of [...this._targets]) this.disposeTarget(target);
    this.monitors.clear();
    this.emitExtra("RUNTIME_DISPOSED", undefined);
    this.ioDevices.clock.resetProjectTimer();
    this._editingTarget = null;
    this.executableTargets = [];
    // Catatan: seperti scratch-vm, penghitung clone TIDAK di-reset (dispose target asli juga menguranginya).
  }

  dispose(): void {
    this.clear();
    this.quit();
  }

  // ---------------------------------------------------------------- project & target
  loadProject(model: ProjectModel, media: IMediaLoader, assets?: ReadonlyMap<string, Uint8Array>): Promise<void> {
    this.mediaLoader = media;
    return loadProjectInto(this, model, media, assets);
  }

  addTarget(target: ITarget): void {
    this._targets.push(target);
    this.executableTargets.push(target);
  }

  moveExecutable(target: ITarget, delta: number): number {
    const oldIndex = this.executableTargets.indexOf(target);
    this.executableTargets.splice(oldIndex, 1);
    let newIndex = oldIndex + delta;
    if (newIndex > this.executableTargets.length) newIndex = this.executableTargets.length;
    if (newIndex <= 0) {
      newIndex = this.executableTargets.length > 0 && this.executableTargets[0]?.isStage ? 1 : 0;
    }
    this.executableTargets.splice(newIndex, 0, target);
    return newIndex;
  }

  setExecutablePosition(target: ITarget, newIndex: number): number {
    const oldIndex = this.executableTargets.indexOf(target);
    return this.moveExecutable(target, newIndex - oldIndex);
  }

  removeExecutable(target: ITarget): void {
    const i = this.executableTargets.indexOf(target);
    if (i > -1) this.executableTargets.splice(i, 1);
  }

  disposeTarget(target: ITarget): void {
    this._targets = this._targets.filter((t) => {
      if (t !== target) return true;
      t.dispose();
      return false;
    });
  }

  getTargetForStage(): ITarget | undefined {
    return this._targets.find((t) => t.isStage);
  }
  getTargetById(id: string): ITarget | undefined {
    return this._targets.find((t) => t.id === id);
  }
  getSpriteTargetByName(name: string): ITarget | undefined {
    return this._targets.find((t) => !t.isStage && t.sprite && t.sprite.name === name);
  }
  getTargetByDrawableId(drawableId: number): ITarget | undefined {
    return this._targets.find((t) => t.drawableId === drawableId);
  }
  getEditingTarget(): ITarget | null {
    return this._editingTarget;
  }

  setEditingTarget(target: ITarget | null): void {
    const old = this._editingTarget;
    this._editingTarget = target;
    // Glow skrip harus dibersihkan.
    this.glows.reset();
    this.glows.update(this.threads, target, this.flyoutBlocks);
    if (old !== target) {
      this.requestToolboxExtensionsUpdate();
      this.emit("EDITING_TARGET_CHANGED", { target });
    }
  }

  requestTargetsUpdate(target?: ITarget): void {
    if (target && !target.isOriginal) return;
    this._refreshTargets = true;
  }
  emitProjectChanged(): void {
    this.emit("PROJECT_CHANGED", undefined);
  }
  requestBlocksUpdate(): void {
    this.emitExtra("BLOCKS_NEED_UPDATE", undefined);
  }
  requestToolboxExtensionsUpdate(): void {
    this.emitExtra("TOOLBOX_EXTENSIONS_NEED_UPDATE", undefined);
  }
  emitBlockDragUpdate(areBlocksOverGui: boolean): void {
    this.emitExtra("BLOCK_DRAG_UPDATE", areBlocksOverGui);
  }

  getAllVarNamesOfType(type: string): string[] {
    let names: string[] = [];
    for (const target of this._targets) {
      names = names.concat(target.getAllVariableNamesInScopeByType(type as VariableType, true));
    }
    return names;
  }

  createNewGlobalVariable(name: string, optVarId?: string, optVarType?: VariableType): Variable {
    const varType = typeof optVarType === "string" ? optVarType : "";
    const newName = StringUtil.unusedName(name, this.getAllVarNamesOfType(varType));
    const variable = createVariable(optVarId || uid(), newName, varType);
    const stage = this.getTargetForStage();
    if (stage) stage.variables[variable.id] = variable;
    return variable;
  }

  fireTargetWasCreated(target: ITarget, source: ITarget | null): void {
    this.emit("TARGET_WAS_CREATED", { target, source });
  }
  fireTargetWasRemoved(target: ITarget): void {
    this.emit("TARGET_WAS_REMOVED", { target });
  }

  // ---------------------------------------------------------------- clone
  changeCloneCounter(delta: number): void {
    this._cloneCounter += delta;
  }
  clonesAvailable(): boolean {
    return this._cloneCounter < MAX_CLONES;
  }

  // ---------------------------------------------------------------- monitor
  requestAddMonitor(record: MonitorRecord): void {
    this.monitors.add(record);
  }
  requestUpdateMonitor(partial: Partial<MonitorRecord> & { id: string }): void {
    this.monitors.update(partial);
  }
  requestRemoveMonitor(monitorId: string): void {
    this.monitors.remove(monitorId);
  }
  requestHideMonitor(monitorId: string): boolean {
    return this.monitors.update({ id: monitorId, visible: false });
  }
  requestShowMonitor(monitorId: string): boolean {
    return this.monitors.update({ id: monitorId, visible: true });
  }
  requestRemoveMonitorByTargetId(targetId: string): void {
    this.monitors.removeByTargetId(targetId);
  }
  getMonitorState(): ReadonlyMap<string, MonitorRecord> {
    return this.monitors.current;
  }

  // ---------------------------------------------------------------- glow & laporan
  quietGlow(scriptBlockId: string): void {
    this.glows.quiet(scriptBlockId);
  }
  glowBlock(blockId: string, isGlowing: boolean): void {
    this.emit(isGlowing ? "BLOCK_GLOW_ON" : "BLOCK_GLOW_OFF", { id: blockId });
  }
  glowScript(topBlockId: string, isGlowing: boolean): void {
    this.emit(isGlowing ? "SCRIPT_GLOW_ON" : "SCRIPT_GLOW_OFF", { id: topBlockId });
  }
  visualReport(blockId: string, value: unknown): void {
    this.emit("VISUAL_REPORT", { id: blockId, value: String(value) });
  }
}

export function createRuntime(opts: RuntimeOptions = {}): IRuntime {
  return new Runtime(opts);
}
