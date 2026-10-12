// @vitest-environment jsdom
/**
 * Tes editor untuk tablet & fitur yang ditambahkan untuk produksi: long-press, cubit dua jari,
 * papan angka layar, komentar (buat/hapus/undo), cache gambar stack, menu dinamis ekstensi.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Block, CommentState, EditorWorkspaceEvent, IBlocksContainer, IRuntime, ITarget } from "@kody/engine";
import { CATEGORY_COLOURS } from "../colours";
import type { ToolboxCategory } from "../types";
import { createWorkspace } from "./index";
import type { BlocksWorkspace } from "./editor";
import { sequentialIds } from "./ids";
import { BlockReducer } from "./reducer";
import { cmdWithNumber, TEST_DEFS } from "./testing/fixtures";
import { pinchView, LONGPRESS } from "./gesture";
import { dynamicMenuOptions } from "./dynamic-menus";

class FakeContainer {
  reducer: BlockReducer;
  log: EditorWorkspaceEvent[] = [];
  readonly forceNoGlow = false;
  comments: Record<string, CommentState> = {};
  constructor(blocks: Block[] = []) {
    this.reducer = new BlockReducer(blocks);
  }
  applyEditorEvent(ev: EditorWorkspaceEvent): void {
    this.log.push(ev);
    switch (ev.type) {
      case "comment_create": {
        const { commentId, blockId, text, x, y, width, height, minimized } = ev;
        this.comments[commentId] = { id: commentId, blockId, text, x, y, width, height, minimized };
        const b = blockId ? this.reducer.blocks[blockId] : undefined;
        if (b) b.comment = commentId;
        return;
      }
      case "comment_delete": {
        const c = this.comments[ev.commentId];
        delete this.comments[ev.commentId];
        const b = c?.blockId ? this.reducer.blocks[c.blockId] : undefined;
        if (b) delete b.comment;
        return;
      }
      case "comment_move": {
        const c = this.comments[ev.commentId];
        if (c) Object.assign(c, { x: ev.x, y: ev.y });
        return;
      }
      case "comment_change": {
        const c = this.comments[ev.commentId];
        if (!c) return;
        if (ev.text !== undefined) c.text = ev.text;
        if (ev.minimized !== undefined) c.minimized = ev.minimized;
        return;
      }
      default:
        this.reducer.apply(ev);
    }
  }
  toRecord(): Record<string, Block> {
    return this.reducer.blocks;
  }
  getBlock(id: string): Block | undefined {
    return this.reducer.blocks[id];
  }
  getScripts(): string[] {
    return this.reducer.scripts;
  }
}

const TOOLBOX: ToolboxCategory[] = [
  {
    id: "motion",
    name: "Motion",
    colours: CATEGORY_COLOURS.motion,
    blocks: [{ opcode: "motion_movesteps", inputs: { STEPS: { shadow: "math_number", field: "NUM", value: 10 } } }],
  },
];

function setup() {
  const blocks = [
    ...cmdWithNumber("a1", "motion_movesteps", "STEPS", 10, { topLevel: true, x: 0, y: 0 }),
    ...cmdWithNumber("b1", "motion_turnright", "DEGREES", 15, { topLevel: true, x: 0, y: 300 }),
  ];
  const container = new FakeContainer(blocks);
  const flyout = new FakeContainer();
  const target = {
    id: "spr1",
    isStage: false,
    isOriginal: true,
    sprite: { name: "Kody" },
    blocks: container as unknown as IBlocksContainer,
    variables: {},
    comments: container.comments,
    x: 0,
    y: 0,
    lookupVariableById: () => undefined,
    getCostumes: () => [],
    getSounds: () => [],
  } as unknown as ITarget;
  const stage = { id: "stage", isStage: true, isOriginal: true, variables: {}, comments: {}, sprite: { name: "Stage" }, getCostumes: () => [], lookupVariableById: () => undefined } as unknown as ITarget;
  const runtime = {
    targets: [stage, target],
    flyoutBlocks: flyout as unknown as IBlocksContainer,
    getTargetById: (id: string) => (id === "spr1" ? target : id === "stage" ? stage : undefined),
    getEditingTarget: () => target,
    getTargetForStage: () => stage,
    getSpriteTargetByName: () => undefined,
    getAllVarNamesOfType: () => [],
    getExtensionInfo: () => undefined,
    getMonitorState: () => new Map(),
    on: () => () => undefined,
    emit: () => undefined,
    toggleScript: vi.fn(),
  } as unknown as IRuntime;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const ws = createWorkspace(host, { runtime, targetId: "spr1", locale: "en" }, { definitions: TEST_DEFS, toolbox: () => TOOLBOX, newId: sequentialIds("n") }) as unknown as BlocksWorkspace;
  return { ws, host, container };
}

function pointer(el: Element, type: string, x: number, y: number, extra: Record<string, unknown> = {}): void {
  const Ctor = (window as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  const ev = new Ctor(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra });
  for (const [k, v] of Object.entries({ pointerId: 1, pointerType: "mouse", ...extra })) {
    if ((ev as unknown as Record<string, unknown>)[k] === undefined) Object.defineProperty(ev, k, { value: v });
  }
  el.dispatchEvent(ev);
}

const tap = (el: Element, extra: Record<string, unknown> = {}): void => {
  pointer(el, "pointerdown", 0, 0, extra);
  pointer(el, "pointerup", 0, 0, extra);
};

const menuTexts = (host: HTMLElement): string[] => Array.from(host.querySelectorAll(".kb-menu-item")).map((i) => i.textContent ?? "");
const menuItem = (host: HTMLElement, text: string): Element => {
  const el = Array.from(host.querySelectorAll(".kb-menu-item")).find((i) => i.textContent === text);
  if (!el) throw new Error(`item menu "${text}" tidak ada: ${menuTexts(host).join(", ")}`);
  return el;
};

describe("BlocksWorkspace di tablet", () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });
  afterEach(() => {
    vi.useRealTimers();
    env.ws.dispose();
    env.host.remove();
  });

  it("long-press sentuh membuka context menu dan mengangkat jari tidak memilih item", () => {
    vi.useFakeTimers();
    const block = env.host.querySelector('.kb-main-svg [data-block-id="a1"] > path')!;
    pointer(block, "pointerdown", 50, 50, { pointerType: "touch", pointerId: 7 });
    vi.advanceTimersByTime(LONGPRESS + 10);
    expect(menuTexts(env.host)).toEqual(["Duplicate", "Add Comment", "Delete Block"]);
    const before = env.container.log.length;
    // Jari diangkat tepat di atas item pertama (menu muncul di bawah jari).
    pointer(menuItem(env.host, "Duplicate"), "pointerup", 50, 50, { pointerType: "touch", pointerId: 7 });
    expect(env.container.log.length).toBe(before);
    expect(env.host.querySelector(".kb-menu")).not.toBeNull();
    // Ketukan berikutnya (down + up di item yang sama) baru memilih.
    tap(menuItem(env.host, "Delete Block"), { pointerType: "touch", pointerId: 8 });
    expect(env.container.reducer.blocks.a1).toBeUndefined();
  });

  it("timer tekan-lama yang menang dari gerakan jari yang masih antre tidak membatalkan seretan", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] });
    const block = env.host.querySelector('.kb-main-svg [data-block-id="a1"] > path')!;
    pointer(block, "pointerdown", 50, 50, { pointerType: "touch", pointerId: 7 });
    // Main thread sibuk: timer long-press jalan dulu, gerakan jari baru diproses sesudahnya (sebelum frame).
    vi.advanceTimersByTime(LONGPRESS);
    pointer(document.body, "pointermove", 120, 90, { pointerType: "touch", pointerId: 7 });
    vi.advanceTimersByTime(50);
    expect(env.host.querySelector(".kb-menu")).toBeNull();
    expect(env.host.querySelector(".kb-dragging")).not.toBeNull();
    pointer(document.body, "pointerup", 120, 90, { pointerType: "touch", pointerId: 7 });
    expect(env.host.querySelector(".kb-dragging")).toBeNull();
    expect(env.container.log.some((ev) => ev.type === "move")).toBe(true);
  });

  it("dua jari mencubit = zoom di sekitar titik tengah jari", () => {
    const grid = env.host.querySelector(".kb-grid")!;
    const s0 = env.ws.view.scale;
    pointer(grid, "pointerdown", 300, 300, { pointerType: "touch", pointerId: 1 });
    pointer(grid, "pointerdown", 400, 300, { pointerType: "touch", pointerId: 2 });
    pointer(document.body, "pointermove", 500, 300, { pointerType: "touch", pointerId: 2 });
    expect(env.ws.view.scale).toBeCloseTo(s0 * 2);
    pointer(document.body, "pointerup", 500, 300, { pointerType: "touch", pointerId: 2 });
    pointer(document.body, "pointerup", 300, 300, { pointerType: "touch", pointerId: 1 });
    // Cubit tidak dianggap klik/seret blok.
    expect(env.container.log).toEqual([]);
  });

  it("pinchView menjaga titik workspace di bawah pusat jari", () => {
    const start = { scrollX: 10, scrollY: 20, scale: 1 };
    const v = pinchView(start, { x: 110, y: 120 }, 100, { x: 140, y: 120 }, 200);
    expect(v.scale).toBe(2);
    // Titik workspace (100,100) tadinya di (110,120); sekarang harus di pusat baru (140,120).
    expect(100 * v.scale + v.scrollX).toBeCloseTo(140);
    expect(100 * v.scale + v.scrollY).toBeCloseTo(120);
    expect(pinchView(start, { x: 0, y: 0 }, 100, { x: 0, y: 0 }, 10000).scale).toBe(3);
  });

  it("ketuk field angka di tablet memunculkan papan angka (bisa minus)", () => {
    const field = env.host.querySelector('.kb-main-svg [data-field="NUM"]')!;
    tap(field, { pointerType: "touch", pointerId: 3 });
    const input = env.host.querySelector<HTMLInputElement>(".kb-field-editor")!;
    expect(input.inputMode).toBe("none");
    const key = (k: string) => env.host.querySelector<HTMLButtonElement>(`.kb-numpad [data-key="${k}"]`)!;
    key("-").click();
    key("4").click();
    key("2").click();
    expect(input.value).toBe("-42");
    key("back").click();
    key("done").click();
    expect(env.container.log.at(-1)).toEqual({ type: "change", blockId: "a1_s", element: "field", name: "NUM", value: "-4" });
    expect(env.host.querySelector(".kb-numpad")).toBeNull();
  });

  it("mouse tetap memakai keyboard biasa (tanpa papan angka)", () => {
    const field = env.host.querySelector('.kb-main-svg [data-field="NUM"]')!;
    tap(field);
    expect(env.host.querySelector(".kb-numpad")).toBeNull();
    expect(env.host.querySelector<HTMLInputElement>(".kb-field-editor")!.inputMode).toBe("decimal");
  });

  it("komentar workspace & blok: buat, ikut terhapus bersama blok, lalu undo", () => {
    const grid = env.host.querySelector(".kb-grid")!;
    grid.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 150 }));
    expect(menuTexts(env.host)).toContain("Add Comment");
    tap(menuItem(env.host, "Add Comment"));
    expect(Object.values(env.container.comments)).toHaveLength(1);
    expect(env.host.querySelectorAll(".kb-comment")).toHaveLength(1);

    const block = env.host.querySelector('.kb-main-svg [data-block-id="a1"] > path')!;
    block.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    tap(menuItem(env.host, "Add Comment"));
    const attached = Object.values(env.container.comments).find((c) => c.blockId === "a1");
    expect(attached).toBeTruthy();
    expect(env.container.reducer.blocks.a1?.comment).toBe(attached?.id);
    expect(env.host.querySelectorAll(".kb-comment-line")).toHaveLength(1);

    void env.ws.actions.deleteBlock("a1");
    const types = env.container.log.slice(-2).map((e) => e.type);
    expect(types).toEqual(["comment_delete", "delete"]);
    expect(Object.values(env.container.comments)).toHaveLength(1);

    env.ws.undo();
    expect(env.container.reducer.blocks.a1).toBeTruthy();
    const restored = Object.values(env.container.comments).find((c) => c.blockId === "a1");
    expect(restored?.id).toBe(attached?.id);
    expect(env.host.querySelectorAll(".kb-comment")).toHaveLength(2);
  });

  it("tombol x di komentar menghapus komentar (bisa di-undo)", () => {
    env.ws.actions.addComment(null, 10, 10);
    const close = env.host.querySelector<HTMLButtonElement>(".kb-comment-close")!;
    close.click();
    expect(Object.keys(env.container.comments)).toHaveLength(0);
    expect(env.host.querySelector(".kb-comment")).toBeNull();
    env.ws.undo();
    expect(Object.keys(env.container.comments)).toHaveLength(1);
  });

  it("perubahan satu stack tidak menggambar ulang stack lain", () => {
    const gB = env.host.querySelector('.kb-main-svg [data-top-id="b1"]');
    const gA = env.host.querySelector('.kb-main-svg [data-top-id="a1"]');
    env.ws.apply([{ type: "change", blockId: "a1_s", element: "field", name: "NUM", value: "99" }]);
    expect(env.host.querySelector('.kb-main-svg [data-top-id="b1"]')).toBe(gB);
    expect(env.host.querySelector('.kb-main-svg [data-top-id="a1"]')).not.toBe(gA);
    // Pindah posisi: elemen sama, transform baru.
    env.ws.apply([{ type: "move", blockId: "b1", newCoordinate: { x: 40, y: 320 } }]);
    const moved = env.host.querySelector('.kb-main-svg [data-top-id="b1"]');
    expect(moved).toBe(gB);
    expect(moved?.getAttribute("transform")).toBe("translate(40,320)");
  });

  it("refreshToolbox membuang cache gambar", () => {
    const gB = env.host.querySelector('.kb-main-svg [data-top-id="b1"]');
    env.ws.refreshToolbox();
    expect(env.host.querySelector('.kb-main-svg [data-top-id="b1"]')).not.toBe(gB);
  });
});

describe("menu dinamis ekstensi (kelas AI hasil latihan)", () => {
  it("selalu meminta daftar terbaru ke modul ekstensi", () => {
    let labels = [{ text: "Kucing", value: "kucing" }];
    const runtime = {
      targets: [],
      getTargetForStage: () => undefined,
      getExtensionInfo: (id: string) => (id === "aiImage" ? { menus: { CLASS: { acceptReporters: true, items: "getClassMenu" } } } : undefined),
      getExtensionModule: () => ({ getDynamicMenus: () => ({ getClassMenu: () => labels }) }),
    } as unknown as IRuntime;
    const ctx = { runtime, target: null, locale: "id" as const, container: null, getBlock: () => undefined };
    const block = { id: "m", opcode: "aiImage_menu_CLASS", inputs: {}, fields: {}, next: null, parent: null, shadow: true, topLevel: false } as Block;
    expect(dynamicMenuOptions(ctx, block, "CLASS")).toEqual([["Kucing", "kucing"]]);
    labels = [
      { text: "Kucing", value: "kucing" },
      { text: "Anjing", value: "anjing" },
    ];
    expect(dynamicMenuOptions(ctx, block, "CLASS")).toEqual([
      ["Kucing", "kucing"],
      ["Anjing", "anjing"],
    ]);
    labels = [];
    expect(dynamicMenuOptions(ctx, block, "CLASS")).toEqual([["", ""]]);
  });
});
