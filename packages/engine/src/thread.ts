/**
 * Thread (padanan scratch-vm 4.8.102 engine/thread.js, BSD-3-Clause; lihat THIRD_PARTY.md).
 * Pemilik: agent engine-core.
 *
 * Catatan representasi: scratch-vm mendorong `null` ke stack untuk cabang kosong. Kontrak IThread
 * memakai `string[]`, jadi cabang kosong disimpan sebagai string kosong `""` (sama-sama falsy;
 * semua pemeriksaan sequencer memakai truthiness).
 */
import type { ScratchValue } from "./types/project-model";
import { ThreadStatus, type IBlocksContainer, type IThread, type StackFrame } from "./types/runtime";
import type { ITarget } from "./types/target";

/** Penanda cabang kosong di stack (scratch-vm: null). */
export const NULL_BLOCK = "";

function createStackFrame(warpMode: boolean): StackFrame {
  return {
    isLoop: false,
    warpMode,
    justReported: null,
    reporting: "",
    reported: null,
    waitingReporter: null,
    params: null,
    executionContext: null,
  };
}

/** _StackFrame.reuse(): reset semua field kecuali warpMode dipertahankan. */
function reuseStackFrame(frame: StackFrame): void {
  const warpMode = frame.warpMode;
  frame.isLoop = false;
  frame.justReported = null;
  frame.reported = null;
  frame.waitingReporter = null;
  frame.params = null;
  frame.executionContext = null;
  frame.warpMode = Boolean(warpMode);
}

export class Thread implements IThread {
  readonly topBlock: string;
  target: ITarget;
  blockContainer: IBlocksContainer;
  stack: string[] = [];
  stackFrames: StackFrame[] = [];
  status: ThreadStatus = ThreadStatus.RUNNING;
  isKilled = false;
  stackClick = false;
  updateMonitor = false;
  requestScriptGlowInFrame = false;
  blockGlowInFrame: string | null = null;
  justReported: ScratchValue | null = null;
  warpTimer: { start(): void; timeElapsed(): number } | null = null;
  hatEdgeValue?: unknown;
  private readonly id: string;
  private static nextId = 1;

  constructor(topBlock: string, target: ITarget, blockContainer?: IBlocksContainer) {
    this.topBlock = topBlock;
    this.target = target;
    this.blockContainer = blockContainer ?? target.blocks;
    this.id = `thread-${Thread.nextId++}`;
  }

  getId(): string {
    return this.id;
  }

  pushStack(blockId: string | null): void {
    this.stack.push(blockId ?? NULL_BLOCK);
    // Dorong stack frame kosong bila perlu (mungkin tidak, kalau baru saja pop).
    if (this.stack.length > this.stackFrames.length) {
      const parent = this.stackFrames[this.stackFrames.length - 1];
      this.stackFrames.push(createStackFrame(typeof parent !== "undefined" && parent.warpMode));
    }
  }

  reuseStackForNextBlock(blockId: string | null): void {
    this.stack[this.stack.length - 1] = blockId ?? NULL_BLOCK;
    const frame = this.stackFrames[this.stackFrames.length - 1];
    if (frame) reuseStackFrame(frame);
  }

  popStack(): string | undefined {
    this.stackFrames.pop();
    return this.stack.pop();
  }

  /** Pop sampai ketemu procedures_call (kembali dari procedure) atau stack habis. */
  stopThisScript(): void {
    let blockID = this.peekStack();
    // scratch-vm berhenti pada null (stack habis atau penanda cabang kosong).
    while (blockID !== undefined && blockID !== NULL_BLOCK) {
      const block = this.target.blocks.getBlock(blockID);
      if (typeof block !== "undefined" && block.opcode === "procedures_call") break;
      this.popStack();
      blockID = this.peekStack();
    }
    if (this.stack.length === 0) {
      this.requestScriptGlowInFrame = false;
      this.status = ThreadStatus.DONE;
    }
  }

  peekStack(): string | undefined {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : undefined;
  }

  peekStackFrame(): StackFrame | undefined {
    return this.stackFrames.length > 0 ? this.stackFrames[this.stackFrames.length - 1] : undefined;
  }

  peekParentStackFrame(): StackFrame | null {
    return this.stackFrames.length > 1 ? (this.stackFrames[this.stackFrames.length - 2] ?? null) : null;
  }

  pushReportedValue(value: ScratchValue | undefined): void {
    this.justReported = typeof value === "undefined" ? null : value;
  }

  initParams(): void {
    const stackFrame = this.peekStackFrame();
    if (stackFrame && stackFrame.params === null) stackFrame.params = {};
  }

  pushParam(paramName: string, value: ScratchValue): void {
    const stackFrame = this.peekStackFrame();
    if (!stackFrame) return;
    if (stackFrame.params === null) stackFrame.params = {};
    stackFrame.params[paramName] = value;
  }

  /** Cari parameter di frame procedure terdekat (frame pertama yang punya params). */
  getParam(paramName: string): ScratchValue | null {
    for (let i = this.stackFrames.length - 1; i >= 0; i--) {
      const frame = this.stackFrames[i];
      if (!frame || frame.params === null) continue;
      if (Object.prototype.hasOwnProperty.call(frame.params, paramName)) {
        return frame.params[paramName] ?? null;
      }
      return null;
    }
    return null;
  }

  atStackTop(): boolean {
    return this.peekStack() === this.topBlock;
  }

  goToNextBlock(): void {
    const current = this.peekStack();
    const nextBlockId = current ? this.target.blocks.getNextBlock(current) : null;
    this.reuseStackForNextBlock(nextBlockId);
  }

  /** Rekursif bila salah satu dari 5 procedures_call terdekat di stack memanggil proccode yang sama. */
  isRecursiveCall(procedureCode: string): boolean {
    let callCount = 5;
    const sp = this.stack.length - 1;
    for (let i = sp - 1; i >= 0; i--) {
      const id = this.stack[i];
      const block = id ? this.target.blocks.getBlock(id) : undefined;
      if (block && block.opcode === "procedures_call" && block.mutation?.proccode === procedureCode) {
        return true;
      }
      if (--callCount < 0) return false;
    }
    return false;
  }
}

export function createThread(topBlock: string, target: ITarget, blockContainer?: IBlocksContainer): IThread {
  return new Thread(topBlock, target, blockContainer);
}
