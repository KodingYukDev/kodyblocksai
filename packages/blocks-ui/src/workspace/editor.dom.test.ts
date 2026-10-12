// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Block, EditorWorkspaceEvent, IBlocksContainer, IRuntime, ITarget } from "@kody/engine";
import { CATEGORY_COLOURS } from "../colours";
import type { ToolboxCategory } from "../types";
import { createWorkspace } from "./index";
import type { BlocksWorkspace } from "./editor";
import { sequentialIds } from "./ids";
import { BlockReducer } from "./reducer";
import { cmdWithNumber, TEST_DEFS } from "./testing/fixtures";

class FakeContainer {
  reducer: BlockReducer;
  log: EditorWorkspaceEvent[] = [];
  readonly forceNoGlow = false;
  constructor(blocks: Block[] = []) {
    this.reducer = new BlockReducer(blocks);
  }
  applyEditorEvent(ev: EditorWorkspaceEvent): void {
    this.log.push(ev);
    this.reducer.apply(ev);
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
    blocks: [{ opcode: "motion_movesteps", inputs: { STEPS: { shadow: "math_number", field: "NUM", value: 10 } } }, { opcode: "motion_xposition" }],
  },
  { id: "control", name: "Control", colours: CATEGORY_COLOURS.control, blocks: [{ opcode: "control_forever" }] },
  { id: "variables", name: "Variables", colours: CATEGORY_COLOURS.data, blocks: [], custom: "VARIABLE" },
];

function setup() {
  const blocks = cmdWithNumber("a1", "motion_movesteps", "STEPS", 10, { topLevel: true, x: 0, y: 0 });
  const container = new FakeContainer(blocks);
  const flyout = new FakeContainer();
  const target = {
    id: "spr1",
    isStage: false,
    isOriginal: true,
    sprite: { name: "Kody" },
    blocks: container as unknown as IBlocksContainer,
    variables: {},
    x: 12,
    y: -7,
    lookupVariableById: () => undefined,
    getCostumes: () => [],
    getSounds: () => [],
  } as unknown as ITarget;
  const stage = { id: "stage", isStage: true, isOriginal: true, variables: {}, sprite: { name: "Stage" }, getCostumes: () => [], lookupVariableById: () => undefined } as unknown as ITarget;
  const toggleScript = vi.fn();
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
    toggleScript,
  } as unknown as IRuntime;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const ws = createWorkspace(host, { runtime, targetId: "spr1", locale: "en" }, { definitions: TEST_DEFS, toolbox: () => TOOLBOX, newId: sequentialIds("n") }) as unknown as BlocksWorkspace;
  return { ws, host, container, flyout, toggleScript };
}

function pointer(el: Element, type: string, x: number, y: number, extra: Record<string, unknown> = {}): void {
  const Ctor = (window as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  const ev = new Ctor(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra });
  for (const [k, v] of Object.entries({ pointerId: 1, pointerType: "mouse", ...extra })) {
    if ((ev as unknown as Record<string, unknown>)[k] === undefined) Object.defineProperty(ev, k, { value: v });
  }
  el.dispatchEvent(ev);
}

describe("BlocksWorkspace (DOM)", () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });
  afterEach(() => {
    env.ws.dispose();
    env.host.remove();
  });

  it("merender kolom kategori, palet, dan skrip dari container", () => {
    const cats = env.host.querySelectorAll(".kb-ws-cat");
    expect(Array.from(cats).map((c) => c.textContent)).toEqual(["Motion", "Control", "Variables"]);
    expect(env.host.querySelector('.kb-main-svg [data-top-id="a1"]')).not.toBeNull();
    expect(env.host.querySelector('[data-flyout-root="spr1_xposition"]')).not.toBeNull();
    // Palet disinkronkan ke runtime.flyoutBlocks (vm.flyoutBlockListener).
    expect(Object.values(env.flyout.toRecord()).some((b) => b.opcode === "control_forever")).toBe(true);
    expect(env.host.querySelector(".kb-flyout-button")?.textContent).toBe("Make a Variable");
  });

  it("klik blok menjalankan skripnya (toggleScript stackClick)", () => {
    const block = env.host.querySelector('.kb-main-svg [data-block-id="a1"] > path')!;
    pointer(block, "pointerdown", 10, 10);
    pointer(block, "pointerup", 10, 10);
    expect(env.toggleScript).toHaveBeenCalledWith("a1", { stackClick: true });
  });

  it("seret dari palet membuat blok baru di workspace (satu grup undo)", () => {
    const pal = env.host.querySelector('[data-flyout-root] [data-block-id] > path')!;
    pointer(pal, "pointerdown", 20, 20);
    pointer(document.body, "pointermove", 120, 25);
    pointer(document.body, "pointerup", 400, 300);
    const created = env.container.log.find((e) => e.type === "create");
    expect(created).toBeTruthy();
    const rootId = created?.type === "create" ? created.blocks[0]?.id : undefined;
    expect(rootId && env.container.reducer.blocks[rootId]?.topLevel).toBe(true);
    env.ws.undo();
    expect(rootId && env.container.reducer.blocks[rootId]).toBeUndefined();
    env.ws.redo();
    expect(rootId && env.container.reducer.blocks[rootId]).toBeTruthy();
  });

  it("context menu: Delete Block lalu undo", () => {
    const block = env.host.querySelector('.kb-main-svg [data-block-id="a1"] > path')!;
    block.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    const items = Array.from(env.host.querySelectorAll(".kb-menu-item"));
    expect(items.map((i) => i.textContent)).toEqual(["Duplicate", "Add Comment", "Delete Block"]);
    pointer(items[2]!, "pointerdown", 0, 0);
    pointer(items[2]!, "pointerup", 0, 0);
    expect(env.container.reducer.blocks.a1).toBeUndefined();
    env.ws.undo();
    expect(env.container.reducer.blocks.a1).toBeTruthy();
    expect(env.container.reducer.blocks.a1_s?.fields.NUM?.value).toBe("10");
  });

  it("edit field angka inline mengirim change event", () => {
    const field = env.host.querySelector('.kb-main-svg [data-field="NUM"]')!;
    pointer(field, "pointerdown", 30, 10);
    pointer(field, "pointerup", 30, 10);
    const input = env.host.querySelector<HTMLInputElement>(".kb-field-editor")!;
    expect(input.value).toBe("10");
    input.value = "25";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(env.container.log.at(-1)).toEqual({ type: "change", blockId: "a1_s", element: "field", name: "NUM", value: "25" });
    expect(env.container.reducer.blocks.a1_s?.fields.NUM?.value).toBe("25");
  });

  it("Make a Variable: dialog, validasi, var_create", async () => {
    const btn = env.host.querySelector<SVGGElement>(".kb-flyout-button")!;
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const input = env.host.querySelector<HTMLInputElement>(".kb-modal input[type=text]")!;
    expect(env.host.querySelectorAll(".kb-modal input[type=radio]")).toHaveLength(2);
    input.value = "  skor ";
    env.host.querySelector<HTMLButtonElement>(".kb-btn-ok")!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(env.container.log.find((e) => e.type === "var_create")).toMatchObject({ type: "var_create", varName: "skor", varType: "", isLocal: false, isCloud: false });
    expect(env.host.querySelector(".kb-modal")).toBeNull();
  });

  it("zoom +/- dan reset", () => {
    const [plus, minus, reset] = Array.from(env.host.querySelectorAll<HTMLButtonElement>(".kb-zoom button"));
    const s0 = env.ws.view.scale;
    plus!.click();
    expect(env.ws.view.scale).toBeCloseTo(s0 * 1.2);
    minus!.click();
    minus!.click();
    expect(env.ws.view.scale).toBeCloseTo(s0 / 1.2);
    reset!.click();
    expect(env.ws.view.scale).toBe(0.675);
  });
});
