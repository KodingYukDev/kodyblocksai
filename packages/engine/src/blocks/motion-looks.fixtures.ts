/**
 * Fake runtime/target/util untuk tes primitive motion & looks (hanya dipakai *.test.ts).
 * Perilaku setter meniru RenderedTarget scratch-vm secukupnya (wrapClamp arah, wrap costume,
 * stage tidak bergerak) supaya hasil tes bermakna tanpa bergantung pada target.ts.
 */
import { vi } from "vitest";
import { MathUtil } from "../util/math-util";
import { TypedEmitter } from "../util/event-emitter";
import type { GraphicEffect, IRenderer, Rect } from "../types/renderer";
import type {
  BlockArgs,
  BlockUtility,
  IRuntime,
  IThread,
  PrimitiveFn,
  RuntimeEventMap,
} from "../types/runtime";
import type { ITarget, TargetEventMap } from "../types/target";

export class FakeTarget {
  x = 0;
  y = 0;
  direction = 90;
  size = 100;
  visible = true;
  rotationStyle = "all around";
  currentCostume = 0;
  effects: Record<GraphicEffect, number> = {
    color: 0,
    fisheye: 0,
    whirl: 0,
    pixelate: 0,
    mosaic: 0,
    brightness: 0,
    ghost: 0,
  };
  bounds: Rect | null = null;
  bubbleBounds: Rect | null = null;
  /** Fungsi fencing opsional (meniru renderer.getFencedPositionOfDrawable). */
  fence: ((x: number, y: number) => [number, number]) | null = null;
  readonly custom = new Map<string, unknown>();
  readonly listeners = new Set<(p: TargetEventMap["EVENT_TARGET_VISUAL_CHANGE"]) => void>();
  readonly calls: string[] = [];

  constructor(
    readonly name: string,
    readonly isStage = false,
    public costumes: { name: string }[] = [{ name: "costume1" }],
  ) {}

  getName(): string {
    return this.name;
  }
  private changed(): void {
    for (const fn of [...this.listeners]) fn({ target: this as unknown as ITarget });
  }
  setXY(x: number, y: number): void {
    if (this.isStage) return;
    const [fx, fy] = this.fence ? this.fence(x, y) : [x, y];
    this.x = fx;
    this.y = fy;
    this.changed();
  }
  setDirection(d: number): void {
    if (!Number.isFinite(d)) return;
    this.direction = MathUtil.wrapClamp(d, -179, 180);
    this.changed();
  }
  setSize(s: number): void {
    this.size = s;
    this.changed();
  }
  setVisible(v: boolean): void {
    if (this.isStage) return;
    this.visible = v;
    this.changed();
  }
  setRotationStyle(s: string): void {
    this.calls.push(`rotationStyle:${String(s)}`);
    if (s === "all around" || s === "left-right" || s === "don't rotate") this.rotationStyle = s;
  }
  setCostume(index: number): void {
    let i = Math.round(index);
    if (!Number.isFinite(i)) i = 0;
    this.currentCostume = MathUtil.wrapClamp(i, 0, this.costumes.length - 1);
    this.calls.push(`costume:${index}`);
  }
  setEffect(effect: GraphicEffect, value: number): void {
    if (!Object.prototype.hasOwnProperty.call(this.effects, effect)) return;
    this.effects[effect] = value;
  }
  clearEffects(): void {
    for (const k of Object.keys(this.effects) as GraphicEffect[]) this.effects[k] = 0;
  }
  getCostumes(): { name: string }[] {
    return this.costumes;
  }
  getCostumeIndexByName(name: string): number {
    return this.costumes.findIndex((c) => c.name === name);
  }
  getBounds(): Rect | null {
    return this.bounds;
  }
  getBoundsForBubble(): Rect | null {
    return this.bubbleBounds;
  }
  keepInFence(x: number, y: number): [number, number] {
    this.calls.push(`keepInFence:${x},${y}`);
    return this.fence ? this.fence(x, y) : [x, y];
  }
  goToFront(): void {
    this.calls.push("front");
  }
  goToBack(): void {
    this.calls.push("back");
  }
  goForwardLayers(n: number): void {
    this.calls.push(`forward:${n}`);
  }
  goBackwardLayers(n: number): void {
    this.calls.push(`backward:${n}`);
  }
  getCustomState<T>(key: string): T | undefined {
    return this.custom.get(key) as T | undefined;
  }
  setCustomState<T>(key: string, value: T): void {
    this.custom.set(key, value);
  }
  on(_event: "EVENT_TARGET_VISUAL_CHANGE", fn: (p: TargetEventMap["EVENT_TARGET_VISUAL_CHANGE"]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  asTarget(): ITarget {
    return this as unknown as ITarget;
  }
}

/** Renderer palsu: id drawable/skin mulai dari 1 (stage memakai 0 di renderer nyata). */
export function createFakeRenderer(bubbleSize: [number, number] = [100, 50]) {
  let nextId = 1;
  const r = {
    getNativeSize: vi.fn((): [number, number] => [480, 360]),
    createDrawable: vi.fn(() => nextId++),
    createTextSkin: vi.fn(() => nextId++),
    updateTextSkin: vi.fn(),
    updateDrawableSkinId: vi.fn(),
    updateDrawablePosition: vi.fn(),
    destroyDrawable: vi.fn(),
    destroySkin: vi.fn(),
    getCurrentSkinSize: vi.fn((): [number, number] => bubbleSize),
  };
  return { mock: r, renderer: r as unknown as IRenderer };
}

export interface FakeRuntimeOptions {
  targets?: FakeTarget[];
  random?: () => number;
  renderer?: IRenderer | null;
}

export function createFakeRuntime(opts: FakeRuntimeOptions = {}) {
  const emitter = new TypedEmitter<RuntimeEventMap>();
  const targets = opts.targets ?? [];
  const threads: IThread[] = [];
  const waiting = new Set<IThread>();
  const startHats = vi.fn((_hat: string, _fields?: Record<string, string>): IThread[] => []);
  const runtime = {
    targets: targets.map((t) => t.asTarget()),
    threads,
    renderer: opts.renderer ?? null,
    random: opts.random,
    requestRedraw: vi.fn(),
    startHats,
    isWaitingThread: (t: IThread) => waiting.has(t),
    getTargetForStage: () => targets.find((t) => t.isStage)?.asTarget(),
    getSpriteTargetByName: (name: string) => targets.find((t) => !t.isStage && t.name === name)?.asTarget(),
    on: <K extends keyof RuntimeEventMap>(e: K, fn: (p: RuntimeEventMap[K]) => void) => emitter.on(e, fn),
    off: <K extends keyof RuntimeEventMap>(e: K, fn: (p: RuntimeEventMap[K]) => void) => emitter.off(e, fn),
    emit: <K extends keyof RuntimeEventMap>(e: K, p: RuntimeEventMap[K]) => emitter.emit(e, p),
  };
  return { runtime: runtime as unknown as IRuntime, raw: runtime, startHats, threads, waiting };
}

export interface FakeUtil {
  util: BlockUtility;
  clock: { t: number };
  yields: { yield: number; yieldTick: number };
  /** Frame eksekusi baru (seperti blok baru di thread). */
  resetFrame(): void;
}

export function createFakeUtil(
  runtime: IRuntime,
  target: FakeTarget,
  mouse: { x: number; y: number } = { x: 0, y: 0 },
): FakeUtil {
  const clock = { t: 0 };
  const yields = { yield: 0, yieldTick: 0 };
  let frame: Record<string, unknown> = {};
  const util = {
    target: target.asTarget(),
    runtime,
    get stackFrame() {
      return frame;
    },
    nowObj: { now: () => clock.t },
    // glide memakai jam nyata sequencer (Timer default scratch-vm), dikendalikan jam yang sama di tes.
    sequencer: { timeSource: { now: () => clock.t } },
    yield: () => {
      yields.yield++;
    },
    // Thread pemanggil: status YIELD (2) / YIELD_TICK (3) dihitung sama seperti util.yield/yieldTick.
    thread: {
      get status() {
        return 0;
      },
      set status(v: number) {
        if (v === 2) yields.yield++;
        else if (v === 3) yields.yieldTick++;
      },
    },
    yieldTick: () => {
      yields.yieldTick++;
    },
    ioQuery: (device: string, func: string) => {
      if (device === "mouse" && func === "getScratchX") return mouse.x;
      if (device === "mouse" && func === "getScratchY") return mouse.y;
      return undefined;
    },
  };
  return {
    util: util as unknown as BlockUtility,
    clock,
    yields,
    resetFrame: () => {
      frame = {};
    },
  };
}

/** Panggil primitive berdasarkan opcode (gagal keras bila tidak terdaftar). */
export function call(prims: Record<string, PrimitiveFn>, opcode: string, args: BlockArgs, util: BlockUtility) {
  const fn = prims[opcode];
  if (!fn) throw new Error(`primitive ${opcode} tidak terdaftar`);
  return fn(args, util);
}
