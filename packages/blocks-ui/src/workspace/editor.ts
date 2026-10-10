/**
 * BlocksWorkspace: editor blok utama (padanan WorkspaceSvg + Toolbox + Flyout scratch-blocks dan
 * containers/blocks.jsx scratch-gui). Sumber kebenaran = target.blocks (IBlocksContainer); setiap
 * perubahan dikirim sebagai EditorWorkspaceEvent lalu workspace digambar ulang dari container.
 */
import type { Block, EditorWorkspaceEvent, IBlocksContainer, IRuntime, ITarget, RuntimeEventName, RuntimeListener, VariableType } from "@kody/engine";
import { getMonitorIdForBlockWithArgs } from "@kody/engine";
import { allCoreDefinitions } from "../definitions/index";
import { blockDefinitions } from "../blocks/definitions";
import { getDefaultRegistry } from "../blocks/registry";
import { makeDefaultToolbox } from "../toolbox";
import type { BlockDefinition, BlocksEditorProps, ToolboxCategory, WorkspaceController } from "../types";
import { buildFlyoutContent, type FlyoutContent } from "../flyout/content";
import { CategoryMenu } from "../flyout/category-menu";
import { FlyoutView } from "../flyout/flyout-view";
import { EditorActions } from "./actions";
import { getBlockInfo, type ProcedureParts } from "./block-info";
import { cleanUpEvents } from "./cleanup";
import { allPlacements } from "./connections";
import { clear, createMeasurer, FONT_FAMILY, html, svg } from "./dom";
import { dynamicMenuOptions, optionLabel, type MenuContext } from "./dynamic-menus";
import { GestureHandler } from "./gesture";
import { msg, type Locale } from "./i18n";
import { genUid } from "./ids";
import { layoutStack, type LayoutDeps, type TextMeasurer } from "./layout";
import { glowFilters, paintStack } from "./painter";
import type { PreviewState } from "./preview";
import { allProcedures } from "./procedures";
import { injectStyles } from "./styles";
import { getTopBlocks, type BlockMap } from "./tree";
import { applyWithInverse, UndoStack, type InverseDeps, type VarInfo } from "./undo";
import { workspaceVariables } from "./variables";
import { clampScroll, resetZoom, toWorkspace, zoomAt, ZOOM_OPTIONS, type Rect, type Viewport } from "./viewport";
import { Overlay } from "./widgets";

export interface WorkspaceExtras {
  /** Definisi tambahan (ekstensi) di samping allCoreDefinitions(). */
  definitions?: BlockDefinition[];
  /** Pembuat toolbox; default makeDefaultToolbox. */
  toolbox?: (isStage: boolean, targetId: string | null) => ToolboxCategory[];
  newId?: () => string;
  /** Blok dijatuhkan di luar editor (mis. ke sprite lain di sprite pane). */
  onDropOutside?: (blocks: Block[], clientX: number, clientY: number) => void;
  /** Tampilkan opsi variabel awan (butuh server cloud). Default false. */
  allowCloudVariables?: boolean;
}

interface SavedView {
  scrollX: number;
  scrollY: number;
  scale: number;
}

export class BlocksWorkspace implements WorkspaceController {
  readonly doc: Document;
  readonly root: HTMLElement;
  readonly main: HTMLElement;
  readonly mainSvg: SVGSVGElement;
  readonly canvas: SVGGElement;
  readonly dragSvg: SVGSVGElement;
  readonly dragLayer: SVGGElement;
  readonly flyout: FlyoutView;
  readonly categories: CategoryMenu;
  readonly overlay: Overlay;
  readonly undoStack = new UndoStack();
  readonly measure: TextMeasurer;
  readonly measureLabel: TextMeasurer;
  readonly newId: () => string;
  readonly filters: { stack: string; replace: string };
  readonly actions: EditorActions;
  readonly gesture: GestureHandler;
  locale: Locale;
  target: ITarget | null = null;
  view: Viewport;
  flyoutContent: FlyoutContent = { blocks: {}, items: [], sections: [] };
  /** Stack top-level yang sedang dirender di drag layer (tidak digambar di canvas). */
  hiddenTops = new Set<string>();
  preview: PreviewState | null = null;
  selected: string | null = null;
  readonly glowing = new Set<string>();
  private defs = new Map<string, BlockDefinition>();
  private savedViews = new Map<string, SavedView>();
  private unsubs: (() => void)[] = [];
  private renderQueued = 0;
  private flyoutQueued = 0;
  private disposed = false;
  private readonly resizeObserver: ResizeObserver | null;

  constructor(
    host: HTMLElement,
    readonly runtime: IRuntime,
    readonly props: BlocksEditorProps,
    readonly extras: WorkspaceExtras = {},
  ) {
    const doc = host.ownerDocument;
    this.doc = doc;
    this.locale = props.locale;
    injectStyles(doc);
    this.newId = extras.newId ?? (() => genUid());
    this.measure = createMeasurer(doc);
    this.measureLabel = createMeasurer(doc, `500 12pt ${FONT_FAMILY}`);
    this.root = html(doc, "div", { class: "kb-ws", tabindex: "0" }, host);
    this.categories = new CategoryMenu(doc, (id) => this.flyout.scrollToCategory(id));
    this.flyout = new FlyoutView(doc, {
      onButton: (key) => void this.actions.flyoutButton(key),
      onCheckbox: (rootId, checked) => this.toggleMonitor(rootId, checked),
      onCategoryScrolled: (id) => this.categories.select(id),
    });
    this.root.appendChild(this.categories.el);
    this.root.appendChild(this.flyout.el);
    this.main = html(doc, "div", { class: "kb-ws-main" }, this.root);
    this.mainSvg = svg(doc, "svg", { class: "kb-main-svg" }, this.main);
    const defs = svg(doc, "defs", {}, this.mainSvg);
    const prefix = `kb${Math.floor(Math.random() * 1e9).toString(36)}`;
    this.filters = glowFilters(doc, defs, prefix);
    const grid = svg(doc, "pattern", { id: `${prefix}-grid`, patternUnits: "userSpaceOnUse", width: 40, height: 40 }, defs);
    svg(doc, "circle", { cx: 1, cy: 1, r: 1, fill: "#ddd" }, grid);
    svg(doc, "rect", { width: "100%", height: "100%", fill: `url(#${prefix}-grid)`, class: "kb-grid" }, this.mainSvg);
    this.canvas = svg(doc, "g", { class: "kb-canvas" }, this.mainSvg);
    this.dragSvg = svg(doc, "svg", { class: "kb-drag-surface" }, this.root);
    this.dragSvg.setAttribute("style", "position:absolute;inset:0;pointer-events:none;z-index:30;overflow:visible");
    const dragDefs = svg(doc, "defs", {}, this.dragSvg);
    glowFilters(doc, dragDefs, `${prefix}d`);
    this.dragLayer = svg(doc, "g", {}, this.dragSvg);
    this.overlay = new Overlay(this.root);
    this.addZoomControls();
    this.view = { scrollX: 20, scrollY: 20, scale: props.initialScale ?? ZOOM_OPTIONS.startScale, viewWidth: 800, viewHeight: 600 };
    this.rebuildDefinitions();
    this.actions = new EditorActions(this);
    this.gesture = new GestureHandler(this);
    this.listenRuntime();
    const win = doc.defaultView;
    this.resizeObserver = win && "ResizeObserver" in win ? new win.ResizeObserver(() => this.onResize()) : null;
    this.resizeObserver?.observe(this.main);
    this.reload();
  }

  // ---------------------------------------------------------------------------
  // Definisi, container, blok
  // ---------------------------------------------------------------------------

  rebuildDefinitions(): void {
    this.defs.clear();
    try {
      for (const d of blockDefinitions(getDefaultRegistry(), this.locale)) this.defs.set(d.opcode, d);
    } catch {
      /* registri belum tersedia */
    }
    for (const d of allCoreDefinitions()) this.defs.set(d.opcode, d);
    for (const d of this.extras.definitions ?? []) this.defs.set(d.opcode, d);
  }

  readonly lookup = (opcode: string): BlockDefinition | undefined => this.defs.get(opcode);

  get container(): IBlocksContainer | null {
    return this.target?.blocks ?? null;
  }

  blocks(): BlockMap {
    try {
      return this.container?.toRecord() ?? {};
    } catch {
      return {};
    }
  }

  menuContext(container: IBlocksContainer | null): MenuContext {
    return {
      runtime: this.runtime,
      target: this.target,
      locale: this.locale,
      container,
      getBlock: (id) => container?.getBlock(id) ?? this.flyoutContent.blocks[id],
    };
  }

  /** Teks tampilan field: label opsi dropdown statis/dinamis, nama variabel, atau nilai. */
  fieldText(block: Block, name: string, container: IBlocksContainer | null): string {
    const field = block.fields[name];
    const raw = String(field?.value ?? "");
    const def = this.lookup(block.opcode);
    const spec = def?.args.flat().find((a) => "name" in a && a.name === name);
    if (spec?.type === "field_dropdown") {
      const dyn = dynamicMenuOptions(this.menuContext(container), block, name);
      return optionLabel(dyn ?? (spec.options === "dynamic" ? null : spec.options), raw);
    }
    if (spec?.type === "field_variable" && field?.id && this.target) {
      const v = this.target.lookupVariableById(field.id) ?? this.runtime.getTargetForStage()?.lookupVariableById(field.id);
      if (v) return v.name;
    }
    return raw;
  }

  deps(blocks: BlockMap = this.blocks(), container: IBlocksContainer | null = this.container): LayoutDeps {
    return { blocks, lookup: this.lookup, measure: this.measure, fieldText: (b, n) => this.fieldText(b, n, container) };
  }

  variablesOfType(type: VariableType) {
    return workspaceVariables(this.runtime, this.target, type);
  }

  // ---------------------------------------------------------------------------
  // Event + undo
  // ---------------------------------------------------------------------------

  inverseDeps(): InverseDeps {
    return {
      getBlock: (id) => this.container?.getBlock(id),
      getVariable: (id): VarInfo | undefined => {
        const stage = this.runtime.getTargetForStage();
        const local = this.target && !this.target.isStage ? this.target.variables[id] : undefined;
        const v = local ?? stage?.variables[id];
        return v ? { id: v.id, name: v.name, type: v.type, isLocal: !!local, isCloud: v.isCloud } : undefined;
      },
    };
  }

  /** Terapkan event ke container target; kembalikan event kebalikan (urutan siap undo). */
  applyRaw(events: readonly EditorWorkspaceEvent[]): EditorWorkspaceEvent[] {
    const container = this.container;
    if (!container) return [];
    return applyWithInverse(events, this.inverseDeps(), (ev) => {
      try {
        container.applyEditorEvent(ev);
      } catch (error) {
        this.runtime.emit("RUNTIME_ERROR", { error, blockId: "blockId" in ev ? ev.blockId : null, opcode: null });
      }
    });
  }

  /** Satu aksi pengguna = satu grup undo. */
  apply(events: readonly EditorWorkspaceEvent[], opts: { refreshFlyout?: boolean } = {}): void {
    if (!events.length) return;
    const inverse = this.applyRaw(events);
    this.undoStack.push({ forward: [...events], inverse });
    this.changed(opts.refreshFlyout ?? events.some((e) => e.type.startsWith("var_") || e.type === "create" || e.type === "delete"));
  }

  changed(refreshFlyout: boolean): void {
    this.render();
    if (refreshFlyout && this.flyoutSignature() !== this.lastFlyoutSignature) this.refreshFlyout();
    this.props.onChange?.();
  }

  private lastFlyoutSignature = "";

  /** Palet hanya dibangun ulang bila variabel/list/procedure/target berubah. */
  flyoutSignature(): string {
    const vars = (["", "list", "broadcast_msg"] as const).map((t) => this.variablesOfType(t).map((v) => `${v.id}:${v.name}`).join(",")).join("|");
    const procs = allProcedures(this.blocks()).map((p) => `${p.proccode}/${p.argumentIds.join(",")}`).join("|");
    return `${this.target?.id ?? ""}#${this.locale}#${vars}#${procs}`;
  }

  undo(): void {
    const g = this.undoStack.popUndo();
    if (!g) return;
    this.applyRaw(g.inverse);
    this.changed(true);
  }

  redo(): void {
    const g = this.undoStack.popRedo();
    if (!g) return;
    this.applyRaw(g.forward);
    this.changed(true);
  }

  cleanUp(): void {
    this.apply(cleanUpEvents(this.deps()), { refreshFlyout: false });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  contentRect(blocks: BlockMap = this.blocks()): Rect {
    const deps = this.deps(blocks);
    let r: Rect | null = null;
    for (const top of getTopBlocks(blocks)) {
      const b = blocks[top];
      const s = layoutStack(deps, top);
      const x = b?.x ?? 0;
      const y = b?.y ?? 0;
      r = r
        ? { left: Math.min(r.left, x), top: Math.min(r.top, y), right: Math.max(r.right, x + s.width), bottom: Math.max(r.bottom, y + s.height) }
        : { left: x, top: y, right: x + s.width, bottom: y + s.height };
    }
    return r ?? { left: 0, top: 0, right: 0, bottom: 0 };
  }

  applyTransform(): void {
    const v = this.view;
    this.canvas.setAttribute("transform", `translate(${v.scrollX},${v.scrollY}) scale(${v.scale})`);
  }

  render(): void {
    if (this.disposed) return;
    const blocks = this.preview?.blocks ?? this.blocks();
    const deps = this.deps(blocks);
    clear(this.canvas);
    const opts = { doc: this.doc, highlight: this.preview?.highlight ?? null, selected: this.selected };
    for (const top of getTopBlocks(blocks)) {
      if (this.hiddenTops.has(top)) continue;
      const b = blocks[top];
      const g = paintStack(opts, layoutStack(deps, top), b?.x ?? 0, b?.y ?? 0);
      if (this.glowing.has(top)) {
        g.classList.add("kb-glow");
        g.setAttribute("filter", `url(#${this.filters.stack})`);
      }
      this.canvas.appendChild(g);
    }
    this.applyTransform();
  }

  scheduleRender(): void {
    const win = this.doc.defaultView;
    if (!win || this.renderQueued || this.gesture.isDragging) return;
    this.renderQueued = win.requestAnimationFrame(() => {
      this.renderQueued = 0;
      this.render();
    });
  }

  // ---------------------------------------------------------------------------
  // Flyout
  // ---------------------------------------------------------------------------

  toolbox(): ToolboxCategory[] {
    const isStage = !!this.target?.isStage;
    const id = this.target?.id ?? null;
    const base = (this.extras.toolbox ?? makeDefaultToolbox)(isStage, id);
    return [...base, ...(this.props.extensionCategories ?? [])];
  }

  refreshFlyout(): void {
    const flyoutBlocks = this.runtime.flyoutBlocks;
    const procs: ProcedureParts[] = allProcedures(this.blocks());
    const content = buildFlyoutContent(this.toolbox(), {
      lookup: this.lookup,
      locale: this.locale,
      targetId: this.target?.id ?? null,
      isStage: !!this.target?.isStage,
      newId: this.newId,
      variables: (t) => this.variablesOfType(t),
      procedures: procs,
      dynamicOptions: (opcode, field, block) => dynamicMenuOptions(this.menuContext(flyoutBlocks), { ...block, opcode }, field),
    });
    this.syncFlyoutContainer(content);
    this.flyoutContent = content;
    this.lastFlyoutSignature = this.flyoutSignature();
    this.categories.setSections(content.sections);
    this.renderFlyout();
  }

  /** Sinkronkan runtime.flyoutBlocks (vm.flyoutBlockListener): hapus root lama, buat yang baru. */
  private syncFlyoutContainer(content: FlyoutContent): void {
    const fb = this.runtime.flyoutBlocks;
    try {
      for (const id of fb.getScripts().slice()) fb.applyEditorEvent({ type: "delete", blockId: id });
      for (const item of content.items) {
        if (item.kind !== "block") continue;
        const ids = collectTree(content.blocks, item.rootId);
        fb.applyEditorEvent({ type: "create", blocks: ids.map((id) => JSON.parse(JSON.stringify(content.blocks[id])) as Block) });
      }
    } catch {
      /* engine belum siap: palet tetap tampil */
    }
  }

  renderFlyout(): void {
    const deps = this.deps(this.flyoutContent.blocks, this.runtime.flyoutBlocks);
    this.flyout.render(this.flyoutContent, deps, this.measureLabel, (id) => this.isMonitorChecked(id), this.glowing);
  }

  scheduleFlyoutRefresh(): void {
    const win = this.doc.defaultView;
    if (!win || this.flyoutQueued) return;
    this.flyoutQueued = win.requestAnimationFrame(() => {
      this.flyoutQueued = 0;
      if (!this.gesture.isDragging) this.refreshFlyout();
    });
  }

  monitorIdFor(rootId: string): string {
    const b = this.flyoutContent.blocks[rootId];
    if (!b || b.opcode === "data_variable" || b.opcode === "data_listcontents" || !Object.keys(b.fields).length) return rootId;
    return getMonitorIdForBlockWithArgs(rootId, b.fields);
  }

  isMonitorChecked(rootId: string): boolean {
    try {
      return this.runtime.getMonitorState().get(this.monitorIdFor(rootId))?.visible ?? false;
    } catch {
      return false;
    }
  }

  toggleMonitor(rootId: string, checked: boolean): void {
    try {
      this.runtime.flyoutBlocks.applyEditorEvent({ type: "change", blockId: rootId, element: "checkbox", value: checked });
    } catch {
      /* engine belum mendukung */
    }
  }

  // ---------------------------------------------------------------------------
  // Viewport
  // ---------------------------------------------------------------------------

  private onResize(): void {
    this.view = { ...this.view, viewWidth: this.main.clientWidth || this.view.viewWidth, viewHeight: this.main.clientHeight || this.view.viewHeight };
    this.applyTransform();
    this.flyout.setScroll(this.flyout.scroll);
  }

  setView(v: Viewport, clamp = true): void {
    this.view = clamp ? clampScroll(v, this.contentRect()) : v;
    this.applyTransform();
    this.overlay.hide();
  }

  zoom(delta: number): void {
    this.setView(zoomAt(this.view, this.view.viewWidth / 2, this.view.viewHeight / 2, delta));
  }

  resetZoom(): void {
    this.setView(resetZoom(this.view, this.contentRect()), false);
  }

  clientToWorkspace(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.main.getBoundingClientRect();
    return toWorkspace(this.view, clientX - r.left, clientY - r.top);
  }

  private addZoomControls(): void {
    const doc = this.doc;
    const box = html(doc, "div", { class: "kb-zoom" }, this.main);
    const mk = (label: string, d: string, fn: () => void): void => {
      const b = html(doc, "button", { type: "button", "aria-label": label, title: label }, box);
      const s = svg(doc, "svg", { viewBox: "0 0 20 20" }, b);
      svg(doc, "path", { d, stroke: "#575E75", "stroke-width": 2.5, "stroke-linecap": "round", fill: "none" }, s);
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      b.addEventListener("click", fn);
    };
    mk(msg(this.locale, "ZOOM_IN"), "M4 10h12M10 4v12", () => this.zoom(1));
    mk(msg(this.locale, "ZOOM_OUT"), "M4 10h12", () => this.zoom(-1));
    mk(msg(this.locale, "ZOOM_RESET"), "M4 7h12M4 13h12", () => this.resetZoom());
  }

  // ---------------------------------------------------------------------------
  // Runtime
  // ---------------------------------------------------------------------------

  private on<K extends RuntimeEventName>(name: K, fn: RuntimeListener<K>): void {
    try {
      this.unsubs.push(this.runtime.on(name, fn));
    } catch {
      /* runtime tiruan tanpa event */
    }
  }

  private listenRuntime(): void {
    this.on("SCRIPT_GLOW_ON", ({ id }) => this.glowStack(id, true));
    this.on("SCRIPT_GLOW_OFF", ({ id }) => this.glowStack(id, false));
    this.on("VISUAL_REPORT", ({ id, value }) => this.actions.reportValue(id, value));
    this.on("PROJECT_CHANGED", () => this.scheduleRender());
    this.on("EDITING_TARGET_CHANGED", ({ target }) => {
      if (target !== this.target) this.reload(target?.id ?? null);
    });
    this.on("TARGETS_UPDATE", () => this.actions.updateFlyoutPositions());
    this.on("MONITORS_UPDATE", () => {
      for (const item of this.flyoutContent.items) if (item.kind === "block" && item.checkbox) this.flyout.setChecked(item.rootId, this.isMonitorChecked(item.rootId));
    });
    this.on("EXTENSION_ADDED", () => {
      this.rebuildDefinitions();
      this.scheduleFlyoutRefresh();
    });
    this.on("BLOCKSINFO_UPDATE", () => {
      this.rebuildDefinitions();
      this.scheduleFlyoutRefresh();
    });
  }

  glowStack(id: string, on: boolean): void {
    if (on) this.glowing.add(id);
    else this.glowing.delete(id);
    const g = Array.from(this.canvas.querySelectorAll(".kb-stack")).find((el) => el.getAttribute("data-top-id") === id);
    if (g) {
      g.classList.toggle("kb-glow", on);
      if (on) g.setAttribute("filter", `url(#${this.filters.stack})`);
      else g.removeAttribute("filter");
    }
    this.flyout.setGlow(id, on, this.filters.stack);
  }

  // ---------------------------------------------------------------------------
  // WorkspaceController
  // ---------------------------------------------------------------------------

  scrollToCategory(categoryId: string): void {
    this.categories.select(categoryId);
    this.flyout.scrollToCategory(categoryId);
  }

  /** Muat ulang dari target (ganti target / load project). Undo dikosongkan seperti scratch-gui. */
  reload(targetId?: string | null): void {
    if (this.target) this.savedViews.set(this.target.id, { scrollX: this.view.scrollX, scrollY: this.view.scrollY, scale: this.view.scale });
    const wanted = targetId !== undefined ? targetId : this.props.targetId;
    this.target = (wanted ? this.runtime.getTargetById(wanted) : undefined) ?? this.runtime.getEditingTarget() ?? null;
    this.undoStack.clear();
    this.glowing.clear();
    this.selected = null;
    this.overlay.hide();
    const saved = this.target ? this.savedViews.get(this.target.id) : undefined;
    this.onResize();
    if (saved) {
      this.view = { ...this.view, ...saved };
    } else {
      const c = this.contentRect();
      this.view = { ...this.view, scale: this.props.initialScale ?? ZOOM_OPTIONS.startScale };
      this.view.scrollX = 24 - c.left * this.view.scale;
      this.view.scrollY = 24 - c.top * this.view.scale;
    }
    this.render();
    this.refreshFlyout();
  }

  setLocale(locale: Locale): void {
    this.locale = locale;
    this.rebuildDefinitions();
    this.render();
    this.refreshFlyout();
  }

  dispose(): void {
    this.disposed = true;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.resizeObserver?.disconnect();
    this.gesture.dispose();
    this.overlay.hide();
    this.flyout.dispose();
    this.root.remove();
  }

  /** Info blok (bentuk/sambungan) untuk blok di workspace. */
  infoOf(block: Block) {
    return getBlockInfo(block, this.lookup);
  }

  placements(blocks: BlockMap = this.blocks()) {
    return allPlacements(this.deps(blocks));
  }
}

function collectTree(blocks: BlockMap, rootId: string): string[] {
  const out: string[] = [];
  const visit = (id: string | null): void => {
    if (!id || out.includes(id) || !blocks[id]) return;
    out.push(id);
    const b = blocks[id];
    if (!b) return;
    for (const inp of Object.values(b.inputs)) {
      visit(inp.block);
      visit(inp.shadow);
    }
    visit(b.next);
  };
  visit(rootId);
  return out;
}
