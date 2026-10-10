/**
 * BlockUtility (padanan scratch-vm 4.8.102 engine/block-utility.js, BSD-3-Clause; lihat THIRD_PARTY.md).
 * Satu instance per sequencer dipakai ulang oleh execute (thread diganti setiap eksekusi).
 * Pemilik: agent engine-core.
 */
import type { IODeviceName } from "./types/io";
import type { ScratchValue } from "./types/project-model";
import { ThreadStatus, type BlockUtility, type IRuntime, type ISequencer, type IThread } from "./types/runtime";
import type { ITarget } from "./types/target";
import { Timer } from "./util/timer";

interface StackTimerState {
  timer?: Timer;
  duration?: number;
}

export class BlockUtilityImpl implements BlockUtility {
  sequencer: ISequencer;
  private currentThread: IThread | null;
  private readonly _nowObj: { now(): number };

  constructor(sequencer: ISequencer, thread: IThread | null = null) {
    this.sequencer = sequencer;
    this.currentThread = thread;
    this._nowObj = { now: () => this.sequencer.runtime.currentMSecs };
  }

  get thread(): IThread {
    if (!this.currentThread) throw new Error("BlockUtility dipakai di luar eksekusi blok");
    return this.currentThread;
  }

  set thread(thread: IThread) {
    this.currentThread = thread;
  }

  /** Dipakai execute untuk mengganti konteks. */
  setThread(thread: IThread | null): void {
    this.currentThread = thread;
  }

  get target(): ITarget {
    return this.thread.target;
  }

  get runtime(): IRuntime {
    return this.sequencer.runtime;
  }

  /** Jam berbasis runtime.currentMSecs (diperbarui sekali per frame), persis scratch-vm. */
  get nowObj(): { now(): number } {
    return this._nowObj;
  }

  get stackFrame(): Record<string, unknown> {
    const frame = this.thread.peekStackFrame();
    if (!frame) throw new Error("Thread tanpa stack frame");
    if (frame.executionContext === null) frame.executionContext = {};
    return frame.executionContext;
  }

  stackTimerFinished(): boolean {
    const state = this.stackFrame as StackTimerState;
    const timeElapsed = state.timer ? state.timer.timeElapsed() : 0;
    if (timeElapsed < (state.duration ?? 0)) return false;
    return true;
  }

  stackTimerNeedsInit(): boolean {
    return !(this.stackFrame as StackTimerState).timer;
  }

  startStackTimer(duration: number): void {
    const state = this.stackFrame as StackTimerState;
    state.timer = new Timer(this.nowObj);
    state.timer.start();
    state.duration = duration;
  }

  yield(): void {
    this.thread.status = ThreadStatus.YIELD;
  }

  yieldTick(): void {
    this.thread.status = ThreadStatus.YIELD_TICK;
  }

  startBranch(branchNum: number, isLoop: boolean): void {
    this.sequencer.stepToBranch(this.thread, branchNum, isLoop);
  }

  stopAll(): void {
    this.sequencer.runtime.stopAll();
  }

  stopOtherTargetThreads(): void {
    this.sequencer.runtime.stopForTarget(this.thread.target, this.thread);
  }

  stopThisScript(): void {
    this.thread.stopThisScript();
  }

  startProcedure(procedureCode: string): void {
    this.sequencer.stepToProcedure(this.thread, procedureCode);
  }

  getProcedureParamNamesAndIds(procedureCode: string): [string[], string[]] | null {
    return this.thread.target.blocks.getProcedureParamNamesAndIds(procedureCode);
  }

  getProcedureParamNamesIdsAndDefaults(procedureCode: string): [string[], string[], ScratchValue[]] | null {
    return this.thread.target.blocks.getProcedureParamNamesIdsAndDefaults(procedureCode);
  }

  initParams(): void {
    this.thread.initParams();
  }

  pushParam(paramName: string, value: ScratchValue): void {
    this.thread.pushParam(paramName, value);
  }

  getParam(paramName: string): ScratchValue | null {
    return this.thread.getParam(paramName);
  }

  startHats(requestedHat: string, optMatchFields?: Record<string, string>, optTarget?: ITarget): IThread[] {
    // startHats bisa mengeksekusi blok lain dan mengotori konteks util; pulihkan setelahnya.
    const callerThread = this.currentThread;
    const callerSequencer = this.sequencer;
    const result = this.sequencer.runtime.startHats(requestedHat, optMatchFields, optTarget);
    this.currentThread = callerThread;
    this.sequencer = callerSequencer;
    return result;
  }

  ioQuery<K extends IODeviceName>(device: K, func: string, args: unknown[] = []): unknown {
    const devObject = this.sequencer.runtime.ioDevices[device] as unknown as Record<string, unknown> | null;
    const fn = devObject ? devObject[func] : undefined;
    if (devObject && typeof fn === "function") {
      return (fn as (...a: unknown[]) => unknown).apply(devObject, args);
    }
    return undefined;
  }
}

export function createBlockUtility(sequencer: ISequencer, thread: IThread | null): BlockUtility {
  return new BlockUtilityImpl(sequencer, thread);
}
