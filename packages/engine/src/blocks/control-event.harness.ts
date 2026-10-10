/**
 * Harness KHUSUS TES untuk control.ts / event.ts: runtime + sequencer + execute mini yang meniru
 * semantik scratch-vm (sequencer.stepThreads/stepThread/stepToBranch, execute handleReport hat,
 * runtime.startHats, runtime._step edge hats, BlockUtility stack timer) agar urutan eksekusi dan
 * yield primitive bisa diuji sebelum engine-core selesai. Tidak dipakai kode produksi.
 */
import { ThreadStatus } from "../types/runtime";
import type {
  BlockPackage,
  BlockUtility,
  HatMetadata,
  IRuntime,
  IThread,
  PrimitiveFn,
  StackFrame,
} from "../types/runtime";
import type { ScratchValue } from "../types/project-model";
import type { ITarget, Variable } from "../types/target";

/** Deskripsi skrip ringkas: [opcode, args?, branches?]. */
export interface ScriptBlock {
  op: string;
  /** Nilai input/field literal, atau reporter bersarang. */
  args?: Record<string, unknown>;
  sub?: ScriptBlock[];
  sub2?: ScriptBlock[];
  mutation?: Record<string, unknown>;
}

interface HBlock {
  id: string;
  opcode: string;
  next: string | null;
  args: Record<string, unknown>;
  sub: string | null;
  sub2: string | null;
  mutation: Record<string, unknown> | null;
}

export interface Reporter {
  reporter: (h: Harness, t: HTarget) => ScratchValue;
}

let uid = 0;

export class HTarget {
  readonly id = `t${++uid}`;
  variables: Record<string, Variable> = {};
  scripts: string[] = [];
  clones: HTarget[];
  touching = new Set<string>();
  layerLog: string[] = [];
  disposed = false;
  constructor(
    readonly h: Harness,
    readonly name: string,
    readonly isStage: boolean,
    readonly isOriginal = true,
    readonly original: HTarget | null = null,
  ) {
    this.clones = original ? original.clones : [];
    this.clones.push(this);
  }
  get sprite(): { name: string; clones: HTarget[] } {
    return { name: this.name, clones: this.clones };
  }
  get blocks(): unknown {
    return this.h.blocks;
  }
  getName(): string {
    return this.name;
  }
  lookupOrCreateVariable(id: string, name: string): Variable {
    const v = this.variables[id] ?? { id, name, type: "", value: 0, isCloud: false };
    this.variables[id] = v as Variable;
    return v as Variable;
  }
  lookupBroadcastMsg(id: string, name: string): Variable | undefined {
    const byId = this.variables[id];
    if (byId && byId.type === "broadcast_msg") return byId;
    return Object.values(this.variables).find(
      (v) => v.type === "broadcast_msg" && v.name.toLowerCase() === name.toLowerCase(),
    );
  }
  isTouchingObject(obj: string): boolean {
    return this.touching.has(obj);
  }
  makeClone(): HTarget | null {
    if (this.isStage || !this.h.clonesAvailable()) return null;
    const c = new HTarget(this.h, this.name, false, false, this.original ?? this);
    c.scripts = this.scripts;
    c.variables = Object.fromEntries(Object.entries(this.variables).map(([k, v]) => [k, { ...v }]));
    this.h.cloneCount++;
    // RenderedTarget.initDrawable memicu start_as_clone untuk clone.
    this.h.pendingCloneInit.push(c);
    return c;
  }
  goBehindOther(other: HTarget): void {
    this.layerLog.push(`behind:${other.id}`);
  }
}

export class HThread {
  stack: string[] = [];
  stackFrames: StackFrame[] = [];
  status: ThreadStatus = ThreadStatus.RUNNING;
  isKilled = false;
  stackClick = false;
  updateMonitor = false;
  warpTimer = null;
  constructor(
    readonly topBlock: string,
    readonly target: HTarget,
  ) {}
  pushStack(id: string | null): void {
    this.stack.push(id as string);
    const parent = this.stackFrames[this.stackFrames.length - 1];
    this.stackFrames.push({
      isLoop: false,
      warpMode: parent?.warpMode ?? false,
      justReported: null,
      reporting: "",
      reported: null,
      waitingReporter: null,
      params: null,
      executionContext: null,
    });
  }
  reuseStackForNextBlock(id: string | null): void {
    this.stack[this.stack.length - 1] = id as string;
    const f = this.stackFrames[this.stackFrames.length - 1];
    if (f) {
      f.isLoop = false;
      f.executionContext = null;
      f.justReported = null;
    }
  }
  popStack(): string | undefined {
    this.stackFrames.pop();
    return this.stack.pop();
  }
  peekStack(): string | undefined {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : undefined;
  }
  peekStackFrame(): StackFrame | undefined {
    return this.stackFrames[this.stackFrames.length - 1];
  }
  stopThisScript(): void {
    let id = this.peekStack();
    while (id !== undefined) {
      this.popStack();
      id = this.peekStack();
    }
    this.status = ThreadStatus.DONE;
  }
  goToNextBlock(): void {
    const cur = this.peekStack();
    this.reuseStackForNextBlock(cur ? (this.target.h.byId.get(cur)?.next ?? null) : null);
  }
}

export class Harness {
  now = 0;
  frameMs = 1000 / 30;
  readonly byId = new Map<string, HBlock>();
  readonly targets: HTarget[] = [];
  threads: HThread[] = [];
  readonly log: string[] = [];
  readonly prims: Record<string, PrimitiveFn> = {};
  readonly hats: Record<string, HatMetadata> = {};
  redrawRequested = false;
  turboMode = false;
  cloneCount = 0;
  pendingCloneInit: HTarget[] = [];
  edgeValues = new Map<string, unknown>();
  timer = 0;
  loudness = -1;
  hasAudio = true;
  frame = 0;
  readonly blocks = {
    getBranch: (id: string, n: number) => (n === 2 ? this.byId.get(id)?.sub2 : this.byId.get(id)?.sub) ?? null,
  };
  readonly stage: HTarget;
  readonly runtime: IRuntime;

  constructor(packages: ((rt: IRuntime) => BlockPackage)[]) {
    this.stage = new HTarget(this, "Stage", true);
    this.targets.push(this.stage);
    const h = this;
    this.runtime = {
      get threads() {
        return h.threads;
      },
      get audioEngine() {
        return h.hasAudio ? { getLoudness: () => h.loudness } : null;
      },
      requestRedraw: () => {
        h.redrawRequested = true;
      },
      getTargetForStage: () => h.stage,
      getSpriteTargetByName: (n: string) => h.targets.find((t) => !t.isStage && t.isOriginal && t.name === n),
      addTarget: (t: HTarget) => {
        h.targets.push(t);
        h.flushCloneInit();
      },
      disposeTarget: (t: HTarget) => {
        t.disposed = true;
        h.cloneCount--;
        const i = h.targets.indexOf(t);
        if (i >= 0) h.targets.splice(i, 1);
      },
      stopForTarget: (t: HTarget) => {
        for (const th of h.threads) if (th.target === t) h.retire(th);
      },
      isActiveThread: (t: HThread) => t.stack.length > 0 && t.status !== ThreadStatus.DONE && h.threads.includes(t),
      isWaitingThread: (t: HThread) =>
        t.status === ThreadStatus.PROMISE_WAIT ||
        t.status === ThreadStatus.YIELD_TICK ||
        !(t.stack.length > 0 && t.status !== ThreadStatus.DONE && h.threads.includes(t)),
      startHats: (op: string, m?: Record<string, string>, tg?: ITarget) => h.startHats(op, m, tg as HTarget | undefined),
      on: () => () => undefined,
    } as unknown as IRuntime;
    for (const make of packages) {
      const pkg = make(this.runtime);
      Object.assign(this.prims, pkg.getPrimitives());
      Object.assign(this.hats, pkg.getHats?.() ?? {});
    }
    // Primitive uji.
    this.prims.test_log = (args) => {
      this.log.push(String(args.MSG));
    };
    this.prims.test_redraw = (args) => {
      this.log.push(String(args.MSG));
      this.runtime.requestRedraw();
    };
  }

  clonesAvailable(): boolean {
    return this.cloneCount < 300;
  }

  flushCloneInit(): void {
    const list = this.pendingCloneInit;
    this.pendingCloneInit = [];
    for (const c of list) this.startHats("control_start_as_clone", undefined, c);
  }

  sprite(name: string): HTarget {
    const t = new HTarget(this, name, false);
    this.targets.push(t);
    return t;
  }

  /** Tambah skrip ke target, kembalikan id blok teratas. */
  addScript(target: HTarget, blocks: ScriptBlock[]): string {
    const top = this.build(blocks);
    if (!top) throw new Error("skrip kosong");
    target.scripts.push(top);
    return top;
  }

  private build(blocks: ScriptBlock[] | undefined): string | null {
    if (!blocks || blocks.length === 0) return null;
    const ids = blocks.map(() => `b${++uid}`);
    blocks.forEach((b, i) => {
      const id = ids[i] as string;
      this.byId.set(id, {
        id,
        opcode: b.op,
        next: ids[i + 1] ?? null,
        args: b.args ?? {},
        sub: this.build(b.sub),
        sub2: this.build(b.sub2),
        mutation: b.mutation ?? null,
      });
    });
    return ids[0] ?? null;
  }

  // ---- runtime.startHats ----
  startHats(op: string, match?: Record<string, string>, optTarget?: HTarget): HThread[] {
    const meta = this.hats[op];
    if (!meta) return [];
    const up: Record<string, string> = {};
    for (const [k, v] of Object.entries(match ?? {})) up[k] = v.toUpperCase();
    const out: HThread[] = [];
    const targets = optTarget ? [optTarget] : [...this.targets].reverse(); // atas -> bawah
    for (const target of targets) {
      for (const top of target.scripts) {
        const b = this.byId.get(top);
        if (!b || b.opcode !== op) continue;
        if (Object.entries(up).some(([k, v]) => String(b.args[k]).toUpperCase() !== v)) continue;
        if (meta.restartExistingThreads) {
          const ex = this.threads.find((t) => t.target === target && t.topBlock === top && !t.stackClick);
          if (ex) {
            const nt = new HThread(top, target);
            nt.pushStack(top);
            this.threads[this.threads.indexOf(ex)] = nt;
            ex.isKilled = true;
            out.push(nt);
            continue;
          }
        } else if (
          this.threads.some(
            (t) => t.target === target && t.topBlock === top && !t.stackClick && t.status !== ThreadStatus.DONE,
          )
        ) {
          continue;
        }
        const th = new HThread(top, target);
        th.pushStack(top);
        this.threads.push(th);
        out.push(th);
      }
    }
    for (const th of out) {
      this.execute(th);
      th.goToNextBlock();
    }
    return out;
  }

  greenFlag(): void {
    this.startHats("event_whenflagclicked");
  }

  stopAll(): void {
    for (const t of this.threads) this.retire(t);
    this.threads = [];
    for (const t of [...this.targets]) if (!t.isOriginal) this.runtime.disposeTarget(t as unknown as ITarget);
  }

  retire(t: HThread): void {
    t.stack = [];
    t.stackFrames = [];
    t.status = ThreadStatus.DONE;
  }

  // ---- runtime._step + sequencer.stepThreads ----
  step(): void {
    this.frame++;
    this.threads = this.threads.filter((t) => !t.isKilled);
    for (const [op, meta] of Object.entries(this.hats)) if (meta.edgeActivated) this.startHats(op);
    this.redrawRequested = false;
    const WORK = 25; // jumlah putaran maks per frame (pengganti 75% waktu frame)
    let passes = 0;
    let numActive = Infinity;
    let ranFirstTick = false;
    while (this.threads.length > 0 && numActive > 0 && passes < WORK && (this.turboMode || !this.redrawRequested)) {
      passes++;
      numActive = 0;
      let stopped = false;
      for (let i = 0; i < this.threads.length; i++) {
        const t = this.threads[i] as HThread;
        if (t.stack.length === 0 || t.status === ThreadStatus.DONE) {
          stopped = true;
          continue;
        }
        if (t.status === ThreadStatus.YIELD_TICK && !ranFirstTick) t.status = ThreadStatus.RUNNING;
        if (t.status === ThreadStatus.RUNNING || t.status === ThreadStatus.YIELD) {
          this.stepThread(t);
          if (t.isKilled) i--;
        }
        if ((t.status as ThreadStatus) === ThreadStatus.RUNNING) numActive++;
        if (t.stack.length === 0 || (t.status as ThreadStatus) === ThreadStatus.DONE) stopped = true;
      }
      ranFirstTick = true;
      if (stopped) this.threads = this.threads.filter((t) => t.stack.length !== 0 && t.status !== ThreadStatus.DONE);
    }
    this.now += this.frameMs;
  }

  steps(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  private stepThread(t: HThread): void {
    if (!t.peekStack()) {
      t.popStack();
      if (t.stack.length === 0) {
        t.status = ThreadStatus.DONE;
        return;
      }
    }
    let cur: string | undefined;
    while ((cur = t.peekStack())) {
      this.execute(t);
      if (t.status === ThreadStatus.YIELD) {
        t.status = ThreadStatus.RUNNING;
        return;
      } else if (t.status === ThreadStatus.PROMISE_WAIT || t.status === ThreadStatus.YIELD_TICK) {
        return;
      }
      if (t.peekStack() === cur) t.goToNextBlock();
      while (!t.peekStack()) {
        t.popStack();
        if (t.stack.length === 0) {
          t.status = ThreadStatus.DONE;
          return;
        }
        const f = t.peekStackFrame() as StackFrame;
        if (f.isLoop) return;
        t.goToNextBlock();
      }
    }
  }

  private evalArgs(t: HThread, b: HBlock): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(b.args)) {
      out[k] = v && typeof v === "object" && "reporter" in v ? (v as Reporter).reporter(this, t.target) : v;
    }
    if (b.mutation) out.mutation = b.mutation;
    return out;
  }

  private execute(t: HThread): void {
    const id = t.peekStack();
    const b = id ? this.byId.get(id) : undefined;
    if (!b) return;
    const fn = this.prims[b.opcode];
    const meta = this.hats[b.opcode];
    if (!fn) return; // hat tanpa predikat
    const util = this.makeUtil(t);
    const value = fn(this.evalArgs(t, b), util) as unknown;
    if (meta) {
      if (meta.edgeActivated) {
        const key = `${t.target.id}:${b.id}`;
        const had = this.edgeValues.has(key);
        const old = this.edgeValues.get(key);
        this.edgeValues.set(key, value);
        const activated = had ? !old && value : value;
        if (!activated) this.retire(t);
      } else if (!value) this.retire(t);
    }
  }

  private makeUtil(t: HThread): BlockUtility {
    const h = this;
    const frame = t.peekStackFrame() as StackFrame;
    if (!frame.executionContext) frame.executionContext = {};
    const ctx = frame.executionContext;
    return {
      target: t.target as unknown as ITarget,
      runtime: h.runtime,
      thread: t as unknown as IThread,
      stackFrame: ctx,
      stackTimerNeedsInit: () => ctx.timerStart === undefined,
      startStackTimer: (ms: number) => {
        ctx.timerStart = h.now;
        ctx.duration = ms;
      },
      stackTimerFinished: () => h.now - (ctx.timerStart as number) >= (ctx.duration as number),
      yield: () => {
        t.status = ThreadStatus.YIELD;
      },
      yieldTick: () => {
        t.status = ThreadStatus.YIELD_TICK;
      },
      startBranch: (n: number, isLoop: boolean) => {
        const cur = t.peekStack() as string;
        frame.isLoop = isLoop;
        t.pushStack(h.blocks.getBranch(cur, n));
      },
      stopAll: () => h.stopAll(),
      stopOtherTargetThreads: () => {
        for (const o of h.threads) if (o !== t && o.target === t.target) h.retire(o);
      },
      stopThisScript: () => t.stopThisScript(),
      startHats: (op: string, m?: Record<string, string>, tg?: ITarget) => h.startHats(op, m, tg as HTarget | undefined),
      ioQuery: (dev: string, fn: string) => (dev === "clock" && fn === "projectTimer" ? h.timer : undefined),
    } as unknown as BlockUtility;
  }
}

/** Reporter pembaca variabel (untuk kondisi wait until / repeat until). */
export function varReporter(id: string): Reporter {
  return { reporter: (_h, t) => (t.variables[id]?.value as ScratchValue | undefined) ?? 0 };
}
