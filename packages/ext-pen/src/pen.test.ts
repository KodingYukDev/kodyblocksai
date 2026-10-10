import { describe, expect, it, vi } from "vitest";
import { validateExtensionInfo } from "@kody/engine/extension-manager";
import type { BlockUtility, IRenderer, IRuntime, ITarget, PenAttributes, TargetEventMap } from "@kody/engine";
import { createPenExtension, createPenExtensionWithOptions } from "./pen";
import { getPenInfo } from "./pen-info";
import { PEN_STATE_KEY } from "./pen-state";
import type { PenState } from "./pen-state";
import oracle from "./__fixtures__/pen-oracle.json";

type Enc = number | string | boolean | null | { $: string } | Enc[] | { [k: string]: Enc };

function dec(v: Enc): unknown {
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === "object") {
    if ("$" in v && typeof v.$ === "string" && Object.keys(v).length === 1) {
      return { NaN: NaN, Infinity: Infinity, "-Infinity": -Infinity, "-0": -0 }[v.$];
    }
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = dec(x as Enc);
    return o;
  }
  return v;
}

type MoveListener = (e: TargetEventMap["TARGET_MOVED"]) => void;

interface FakeTarget extends ITarget {
  listeners: Set<MoveListener>;
  moveTo(x: number, y: number, force?: boolean): void;
}

function makeTarget(runtime: IRuntime, drawableId = 7): FakeTarget {
  const state: Record<string, unknown> = {};
  const listeners = new Set<MoveListener>();
  const t = {
    runtime,
    x: 0,
    y: 0,
    drawableId,
    listeners,
    getCustomState: (k: string) => state[k],
    setCustomState: (k: string, v: unknown) => {
      state[k] = v;
    },
    on: (_ev: string, fn: MoveListener) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    moveTo(x: number, y: number, force = false) {
      const oldX = t.x;
      const oldY = t.y;
      t.x = x;
      t.y = y;
      for (const l of [...listeners]) l({ target: t as unknown as ITarget, oldX, oldY, force });
    },
  };
  return t as unknown as FakeTarget;
}

type Handler = (p: unknown) => void;

function makeRuntime(renderer: Partial<IRenderer> | null) {
  const handlers = new Map<string, Set<Handler>>();
  const runtime = {
    renderer,
    requestRedraw: vi.fn(),
    on: (ev: string, fn: Handler) => {
      if (!handlers.has(ev)) handlers.set(ev, new Set());
      handlers.get(ev)?.add(fn);
      return () => handlers.get(ev)?.delete(fn);
    },
    emit: (ev: string, payload: unknown) => {
      for (const fn of handlers.get(ev) ?? []) fn(payload);
    },
    handlers,
  };
  return runtime as unknown as IRuntime & { requestRedraw: ReturnType<typeof vi.fn>; handlers: Map<string, Set<Handler>> };
}

function makeRenderer() {
  const calls: unknown[][] = [];
  const renderer = {
    createPenSkin: vi.fn(() => 42),
    createDrawable: vi.fn(() => 3),
    updateDrawableSkinId: vi.fn(),
    penClear: vi.fn((...a: unknown[]) => void calls.push(["clear", ...a])),
    penPoint: vi.fn((skin: number, attrs: PenAttributes, x: number, y: number) =>
      void calls.push(["point", skin, structuredClone(attrs), x, y]),
    ),
    penLine: vi.fn((skin: number, attrs: PenAttributes, x0: number, y0: number, x1: number, y1: number) =>
      void calls.push(["line", skin, structuredClone(attrs), x0, y0, x1, y1]),
    ),
    penStamp: vi.fn((...a: unknown[]) => void calls.push(["stamp", ...a])),
  };
  return { renderer, calls };
}

const utilFor = (target: ITarget): BlockUtility => ({ target }) as unknown as BlockUtility;

describe("ext-pen getInfo", () => {
  it("lolos validateExtensionInfo (id & en)", () => {
    expect(validateExtensionInfo(getPenInfo("id"))).toEqual([]);
    expect(validateExtensionInfo(getPenInfo("en"))).toEqual([]);
  });

  it("struktur blok & menu (en) identik scratch3_pen.getInfo()", () => {
    const ours = getPenInfo("en");
    const ref = oracle.info as Record<string, unknown>;
    expect(ours.id).toBe(ref.id);
    expect(ours.name).toBe(ref.name);
    expect(ours.blockIconURI).toBe(ref.blockIconURI);
    expect(ours.blocks).toEqual(ref.blocks);
    expect(ours.menus).toEqual(ref.menus);
  });

  it("versi Indonesia hanya mengganti teks, bukan opcode/argumen/value menu", () => {
    const en = getPenInfo("en");
    const id = getPenInfo("id");
    const strip = (info: typeof en) =>
      info.blocks.map((b) => (b === "---" ? b : { ...b, text: "" }));
    expect(strip(id)).toEqual(strip(en));
    const values = (info: typeof en) => {
      const items = info.menus?.colorParam?.items;
      return Array.isArray(items) ? items.map((i) => (typeof i === "string" ? i : i.value)) : items;
    };
    expect(values(id)).toEqual(values(en));
  });
});

describe("ext-pen state = oracle scratch-vm", () => {
  for (const [name, steps] of Object.entries(oracle.cases)) {
    it(`kasus ${name}`, () => {
      const runtime = makeRuntime(null);
      const pen = createPenExtension(runtime);
      const prims = pen.getPrimitives();
      const target = makeTarget(runtime);
      for (const step of steps) {
        const fn = prims[step.op];
        expect(fn, step.op).toBeDefined();
        fn?.(dec(step.args as Enc) as Record<string, unknown>, utilFor(target));
        expect(pen.getPenState(target), `${name} ${step.op} ${JSON.stringify(step.args)}`).toEqual(dec(step.state as Enc));
      }
    });
  }
});

describe("ext-pen renderer", () => {
  it("tanpa renderer: semua blok aman dan tidak membuat layer", () => {
    const runtime = makeRuntime(null);
    const pen = createPenExtension(runtime);
    const target = makeTarget(runtime);
    const p = pen.getPrimitives();
    p.clear?.({}, utilFor(target));
    p.stamp?.({}, utilFor(target));
    p.penDown?.({}, utilFor(target));
    target.moveTo(10, 10);
    expect(pen.penSkinId).toBe(-1);
    expect(runtime.requestRedraw).not.toHaveBeenCalled();
  });

  it("layer pena dibuat malas sekali di grup 'pen'", () => {
    const { renderer } = makeRenderer();
    const runtime = makeRuntime(renderer);
    const pen = createPenExtension(runtime);
    expect(renderer.createPenSkin).not.toHaveBeenCalled();
    const target = makeTarget(runtime);
    pen.getPrimitives().clear?.({}, utilFor(target));
    pen.getPrimitives().clear?.({}, utilFor(target));
    expect(renderer.createPenSkin).toHaveBeenCalledTimes(1);
    expect(renderer.createDrawable).toHaveBeenCalledWith("pen");
    expect(renderer.updateDrawableSkinId).toHaveBeenCalledWith(3, 42);
    expect(renderer.penClear).toHaveBeenCalledWith(42);
    expect(runtime.requestRedraw).toHaveBeenCalledTimes(2);
    expect(pen.penSkinId).toBe(42);
    expect(pen.penDrawableId).toBe(3);
  });

  it("pen down menggambar titik, gerak menggambar garis, drag (force) tidak", () => {
    const { renderer, calls } = makeRenderer();
    const runtime = makeRuntime(renderer);
    const pen = createPenExtension(runtime);
    const p = pen.getPrimitives();
    const target = makeTarget(runtime);
    target.x = 5;
    target.y = -3;
    p.setPenSizeTo?.({ SIZE: 4 }, utilFor(target));
    p.penDown?.({}, utilFor(target));
    target.moveTo(20, 30);
    target.moveTo(50, 50, true);
    target.moveTo(60, 70);
    p.penUp?.({}, utilFor(target));
    target.moveTo(0, 0);
    expect(calls).toEqual([
      ["point", 42, { color4f: [0, 0, 1, 1], diameter: 4 }, 5, -3],
      ["line", 42, { color4f: [0, 0, 1, 1], diameter: 4 }, 5, -3, 20, 30],
      ["line", 42, { color4f: [0, 0, 1, 1], diameter: 4 }, 50, 50, 60, 70],
    ]);
    expect(target.listeners.size).toBe(0);
  });

  it("pen down dua kali hanya memasang satu listener tetapi menggambar dua titik", () => {
    const { renderer, calls } = makeRenderer();
    const runtime = makeRuntime(renderer);
    const p = createPenExtension(runtime).getPrimitives();
    const target = makeTarget(runtime);
    p.penDown?.({}, utilFor(target));
    p.penDown?.({}, utilFor(target));
    expect(target.listeners.size).toBe(1);
    expect(calls.filter((c) => c[0] === "point")).toHaveLength(2);
  });

  it("stamp memakai drawableId target", () => {
    const { renderer } = makeRenderer();
    const runtime = makeRuntime(renderer);
    const p = createPenExtension(runtime).getPrimitives();
    const target = makeTarget(runtime, 11);
    p.stamp?.({}, utilFor(target));
    expect(renderer.penStamp).toHaveBeenCalledWith(42, 11);
    expect(runtime.requestRedraw).toHaveBeenCalled();
  });

  it("warna & ukuran berubah tidak memicu redraw (sama dengan Scratch)", () => {
    const { renderer } = makeRenderer();
    const runtime = makeRuntime(renderer);
    const p = createPenExtension(runtime).getPrimitives();
    const target = makeTarget(runtime);
    p.setPenColorToColor?.({ COLOR: "#ff0000" }, utilFor(target));
    p.changePenSizeBy?.({ SIZE: 3 }, utilFor(target));
    expect(runtime.requestRedraw).not.toHaveBeenCalled();
    expect(renderer.createPenSkin).not.toHaveBeenCalled();
  });
});

describe("ext-pen clone", () => {
  it("clone menyalin state (deep) dan ikut menggambar bila sumbernya pen down", () => {
    const { renderer, calls } = makeRenderer();
    const runtime = makeRuntime(renderer) as IRuntime & { emit: (e: string, p: unknown) => void };
    const pen = createPenExtension(runtime);
    const p = pen.getPrimitives();
    const source = makeTarget(runtime);
    p.setPenColorToColor?.({ COLOR: "#00ff00" }, utilFor(source));
    p.penDown?.({}, utilFor(source));
    const clone = makeTarget(runtime);
    runtime.emit("TARGET_WAS_CREATED", { target: clone, source });
    const cs = clone.getCustomState<PenState>(PEN_STATE_KEY);
    expect(cs).toEqual(source.getCustomState(PEN_STATE_KEY));
    expect(cs).not.toBe(source.getCustomState(PEN_STATE_KEY));
    calls.length = 0;
    clone.moveTo(1, 2);
    expect(calls).toEqual([["line", 42, { color4f: [0, 1, 0, 1], diameter: 1 }, 0, 0, 1, 2]]);
    // ubah clone tidak mengubah sumber
    p.setPenSizeTo?.({ SIZE: 9 }, utilFor(clone));
    expect(pen.getPenState(source).penAttributes.diameter).toBe(1);
  });

  it("clone dari sumber tanpa state pena tidak mendapat state; tanpa source diabaikan", () => {
    const runtime = makeRuntime(null) as IRuntime & { emit: (e: string, p: unknown) => void };
    createPenExtension(runtime);
    const source = makeTarget(runtime);
    const clone = makeTarget(runtime);
    runtime.emit("TARGET_WAS_CREATED", { target: clone, source });
    runtime.emit("TARGET_WAS_CREATED", { target: makeTarget(runtime), source: null });
    expect(clone.getCustomState(PEN_STATE_KEY)).toBeUndefined();
  });

  it("clone dari sumber pen up tidak memasang listener", () => {
    const runtime = makeRuntime(null) as IRuntime & { emit: (e: string, p: unknown) => void };
    const pen = createPenExtension(runtime);
    const source = makeTarget(runtime);
    pen.getPenState(source);
    const clone = makeTarget(runtime);
    runtime.emit("TARGET_WAS_CREATED", { target: clone, source });
    expect(clone.listeners.size).toBe(0);
  });

  it("target dihapus melepas listener; dispose melepas semua dan berhenti mendengar runtime", () => {
    const { renderer } = makeRenderer();
    const runtime = makeRuntime(renderer) as IRuntime & {
      emit: (e: string, p: unknown) => void;
      handlers: Map<string, Set<Handler>>;
    };
    const pen = createPenExtensionWithOptions(runtime, { locale: "en" });
    const p = pen.getPrimitives();
    const a = makeTarget(runtime);
    const b = makeTarget(runtime);
    p.penDown?.({}, utilFor(a));
    p.penDown?.({}, utilFor(b));
    runtime.emit("TARGET_WAS_REMOVED", { target: a });
    expect(a.listeners.size).toBe(0);
    expect(b.listeners.size).toBe(1);
    pen.dispose?.();
    expect(b.listeners.size).toBe(0);
    expect(renderer.penClear).toHaveBeenCalledWith(42);
    expect(runtime.handlers.get("TARGET_WAS_CREATED")?.size ?? 0).toBe(0);
  });
});
