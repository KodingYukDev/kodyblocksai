/**
 * Gesture pointer (mouse + touch) padanan Blockly.Gesture: klik vs seret (DRAG_RADIUS 3,
 * FLYOUT_DRAG_RADIUS 10, sudut seret palet 70 derajat), seret blok dengan pratinjau, seret latar untuk
 * scroll, long-press 750 ms = context menu, wheel = scroll/zoom, pintasan keyboard undo/redo/hapus.
 * Sentuh: dua jari = cubit untuk zoom + geser workspace (seperti Scratch di tablet).
 */
import type { Block, EditorWorkspaceEvent } from "@kody/engine";
import { allPlacements } from "./connections";
import { DragSession, type DragPreview } from "./drag";
import type { BlocksWorkspace } from "./editor";
import { msg } from "./i18n";
import { copyTree, unplugEvents } from "./ops";
import { paintStack } from "./painter";
import { buildPreview } from "./preview";
import { DRAG_RADIUS, FLYOUT_DRAG_RADIUS } from "./snap";
import { getDescendants, getRootBlock, type BlockMap } from "./tree";
import { layoutStack } from "./layout";
import { applyWheel, clampScale, toScreen, toWorkspace } from "./viewport";
import { showAlert } from "./dialogs";

export const LONGPRESS = 750;
export const DRAG_ANGLE_RANGE = 70;

type Region = "workspace" | "flyout" | "other";

interface Pending {
  kind: "pending";
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  region: Region;
  blockId: string | null;
  fieldName: string | null;
  flyoutRoot: string | null;
  anchor: Element | null;
  timer: ReturnType<typeof setTimeout> | null;
}

interface BlockDrag {
  kind: "block";
  pointerId: number | null;
  startX: number;
  startY: number;
  session: DragSession;
  forward: EditorWorkspaceEvent[];
  inverse: EditorWorkspaceEvent[];
  previewKey: string;
  offsets: Map<string, { x: number; y: number }>;
  outside: boolean;
  /** Seret "lengket" setelah Duplicate: selesai di pointerdown berikutnya. */
  sticky: boolean;
}

interface ScrollDrag {
  kind: "wsScroll" | "flyoutScroll";
  pointerId: number;
  startX: number;
  startY: number;
  startScrollX: number;
  startScrollY: number;
}

interface Pinch {
  kind: "pinch";
  ids: [number, number];
  startDist: number;
  startCenter: { x: number; y: number };
  startView: { scrollX: number; scrollY: number; scale: number };
}

type State = Pending | BlockDrag | ScrollDrag | Pinch | null;

/** Hitung tampilan baru saat dua jari mencubit: titik workspace di bawah pusat awal tetap di bawah pusat sekarang. */
export function pinchView(
  start: { scrollX: number; scrollY: number; scale: number },
  startCenter: { x: number; y: number },
  startDist: number,
  center: { x: number; y: number },
  dist: number,
): { scrollX: number; scrollY: number; scale: number } {
  const scale = clampScale(start.scale * (startDist > 0 ? dist / startDist : 1));
  const anchor = toWorkspace({ ...start, viewWidth: 0, viewHeight: 0 }, startCenter.x, startCenter.y);
  return { scale, scrollX: center.x - anchor.x * scale, scrollY: center.y - anchor.y * scale };
}

function deferToNextFrame(fn: () => void): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => fn());
  else setTimeout(fn, 0);
}

export function isDragTowardWorkspace(dx: number, dy: number): boolean {
  const dir = (Math.atan2(dy, dx) / Math.PI) * 180;
  return dir < DRAG_ANGLE_RANGE && dir > -DRAG_ANGLE_RANGE;
}

/** Shadow diseret lewat induk non-shadow; prototype lewat define-nya. */
export function resolveDraggable(blocks: BlockMap, id: string): string | null {
  let cur: string | null = id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const b: Block | undefined = blocks[cur];
    if (!b) return null;
    if (!b.shadow) return cur;
    cur = b.parent;
  }
  return null;
}

export class GestureHandler {
  private state: State = null;
  /** Posisi jari yang sedang menempel (untuk cubit dua jari). */
  private readonly touches = new Map<number, { x: number; y: number; region: Region }>();
  /** Jenis pointer terakhir (touch -> papan angka layar untuk field angka). */
  lastPointerType = "mouse";
  private readonly listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];

  constructor(private readonly ws: BlocksWorkspace) {
    const root = ws.root;
    this.listen(root, "pointerdown", (e) => this.onDown(e as PointerEvent));
    this.listen(ws.doc, "pointermove", (e) => this.onMove(e as PointerEvent));
    this.listen(ws.doc, "pointerup", (e) => this.onUp(e as PointerEvent));
    this.listen(ws.doc, "pointercancel", (e) => this.onCancel(e as PointerEvent));
    this.listen(root, "contextmenu", (e) => this.onContextMenu(e as MouseEvent));
    this.listen(ws.main, "wheel", (e) => this.onWheel(e as WheelEvent), { passive: false });
    this.listen(root, "keydown", (e) => this.onKey(e as KeyboardEvent));
    // Safari iOS/macOS: cegah zoom halaman bawaan saat mencubit di atas editor.
    const stop = (e: Event): void => e.preventDefault();
    this.listen(root, "gesturestart", stop);
    this.listen(root, "gesturechange", stop);
  }

  private listen(t: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions): void {
    t.addEventListener(type, fn, opts);
    this.listeners.push([t, type, fn, opts]);
  }

  get isDragging(): boolean {
    return this.state?.kind === "block";
  }

  private region(target: Element): Region {
    if (this.ws.flyout.el.contains(target)) return "flyout";
    if (this.ws.main.contains(target)) return "workspace";
    return "other";
  }

  private onDown(e: PointerEvent): void {
    this.lastPointerType = e.pointerType || "mouse";
    const downTarget = e.target instanceof Element ? e.target : null;
    if (e.pointerType === "touch" && downTarget) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, region: this.region(downTarget) });
      if (this.tryStartPinch(e)) return;
    }
    if (this.state?.kind === "block" && this.state.sticky) {
      e.preventDefault();
      this.finishBlockDrag(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0 || this.state) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target || target.closest(".kb-zoom, .kb-menu, .kb-dropdown, .kb-colour, .kb-modal, .kb-field-editor, .kb-checkbox, .kb-flyout-button, .kb-ws-categories, .kb-comment, .kb-numpad, .kb-angle")) return;
    const region = this.region(target);
    if (region === "other") return;
    const fieldEl = target.closest("[data-field]");
    const blockEl = target.closest("[data-block-id]");
    const rootEl = target.closest("[data-flyout-root]");
    this.ws.root.focus({ preventScroll: true });
    const pending: Pending = {
      kind: "pending",
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      region,
      blockId: blockEl?.getAttribute("data-block-id") ?? null,
      fieldName: fieldEl?.getAttribute("data-field") ?? null,
      flyoutRoot: rootEl?.getAttribute("data-flyout-root") ?? null,
      anchor: fieldEl ?? blockEl,
      timer: null,
    };
    if (e.pointerType === "touch") {
      pending.timer = setTimeout(() => {
        if (this.state !== pending) return;
        // Tunggu satu frame dulu: saat main thread sibuk (mis. AI mengklasifikasi kamera), gerakan jari
        // bisa masih antre dan timer ini menang duluan. Input yang antre diproses sebelum frame berikutnya,
        // jadi seretan yang sebenarnya sudah dimulai tidak berubah menjadi menu tekan-lama.
        deferToNextFrame(() => {
          if (this.state !== pending) return;
          this.state = null;
          this.ws.actions.showContextMenu(region, pending.blockId, pending.startX, pending.startY);
        });
      }, LONGPRESS);
    }
    this.state = pending;
    e.preventDefault();
  }

  /** Jari kedua di workspace saat jari pertama belum menyeret blok: mulai cubit/geser dua jari. */
  private tryStartPinch(e: PointerEvent): boolean {
    const s = this.state;
    if (this.touches.size !== 2) return false;
    if (s && s.kind !== "pending" && s.kind !== "wsScroll") return false;
    if (s?.kind === "pending" && s.region === "flyout") return false;
    const entries = [...this.touches.entries()];
    const [a, b] = entries;
    if (!a || !b || a[1].region !== "workspace" || b[1].region !== "workspace") return false;
    if (s?.kind === "pending" && s.timer) clearTimeout(s.timer);
    const r = this.ws.main.getBoundingClientRect();
    const v = this.ws.view;
    this.state = {
      kind: "pinch",
      ids: [a[0], b[0]],
      startDist: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y),
      startCenter: { x: (a[1].x + b[1].x) / 2 - r.left, y: (a[1].y + b[1].y) / 2 - r.top },
      startView: { scrollX: v.scrollX, scrollY: v.scrollY, scale: v.scale },
    };
    this.ws.overlay.hide();
    e.preventDefault();
    return true;
  }

  private movePinch(s: Pinch): void {
    const a = this.touches.get(s.ids[0]);
    const b = this.touches.get(s.ids[1]);
    if (!a || !b) return;
    const r = this.ws.main.getBoundingClientRect();
    const center = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
    const next = pinchView(s.startView, s.startCenter, s.startDist, center, Math.hypot(a.x - b.x, a.y - b.y));
    this.ws.setView({ ...this.ws.view, ...next });
  }

  /** Jari terangkat saat cubit: jari yang tersisa melanjutkan sebagai geser biasa. */
  private endPinch(s: Pinch, liftedId: number): void {
    const rest = s.ids[0] === liftedId ? s.ids[1] : s.ids[0];
    const t = this.touches.get(rest);
    const v = this.ws.view;
    this.state = t ? { kind: "wsScroll", pointerId: rest, startX: t.x, startY: t.y, startScrollX: v.scrollX, startScrollY: v.scrollY } : null;
  }

  private onMove(e: PointerEvent): void {
    const tracked = this.touches.get(e.pointerId);
    if (tracked) {
      tracked.x = e.clientX;
      tracked.y = e.clientY;
    }
    const s = this.state;
    if (!s) return;
    if (s.kind === "pinch") {
      if (s.ids.includes(e.pointerId)) {
        e.preventDefault();
        this.movePinch(s);
      }
      return;
    }
    if (s.kind !== "block" || !s.sticky) {
      if ("pointerId" in s && s.pointerId !== null && s.pointerId !== e.pointerId) return;
    }
    if (s.kind === "pending") {
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      const radius = s.region === "flyout" ? FLYOUT_DRAG_RADIUS : DRAG_RADIUS;
      if (Math.hypot(dx, dy) <= radius) return;
      if (s.timer) clearTimeout(s.timer);
      if (s.region === "workspace" && s.blockId) this.startWorkspaceDrag(s, s.blockId);
      else if (s.region === "flyout" && s.flyoutRoot && isDragTowardWorkspace(dx, dy)) this.startFlyoutDrag(s, s.flyoutRoot);
      else this.startScroll(s);
      this.onMove(e);
      return;
    }
    if (s.kind === "wsScroll") {
      const v = this.ws.view;
      this.ws.setView({ ...v, scrollX: s.startScrollX + (e.clientX - s.startX), scrollY: s.startScrollY + (e.clientY - s.startY) });
      return;
    }
    if (s.kind === "flyoutScroll") {
      this.ws.flyout.setScroll(s.startScrollY - (e.clientY - s.startY));
      return;
    }
    if (s.kind === "block") this.moveBlockDrag(s, e.clientX, e.clientY);
  }

  private onUp(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    const s = this.state;
    if (!s) return;
    if (s.kind === "pinch") {
      if (s.ids.includes(e.pointerId)) this.endPinch(s, e.pointerId);
      return;
    }
    if (s.kind === "block") {
      if (s.sticky) return;
      if (s.pointerId !== e.pointerId) return;
      this.finishBlockDrag(e.clientX, e.clientY);
      return;
    }
    if (s.pointerId !== e.pointerId) return;
    this.state = null;
    if (s.kind !== "pending") return;
    if (s.timer) clearTimeout(s.timer);
    this.click(s);
  }

  private onCancel(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    const s = this.state;
    if (s?.kind === "pinch") {
      if (s.ids.includes(e.pointerId)) this.endPinch(s, e.pointerId);
      return;
    }
    if (!s || ("pointerId" in s && s.pointerId !== e.pointerId)) return;
    if (s.kind === "block") this.finishBlockDrag(s.startX, s.startY, true);
    else {
      if (s.kind === "pending" && s.timer) clearTimeout(s.timer);
      this.state = null;
    }
  }

  private click(s: Pending): void {
    const ws = this.ws;
    ws.overlay.hide();
    if (s.region === "flyout") {
      if (!s.flyoutRoot) return;
      if (s.fieldName && s.blockId && s.anchor) {
        ws.actions.editField("flyout", s.blockId, s.fieldName, s.anchor);
        return;
      }
      ws.runtime.toggleScript(s.flyoutRoot, { stackClick: true, ...(ws.target ? { target: ws.target } : {}) });
      return;
    }
    if (!s.blockId) {
      if (ws.selected) {
        ws.selected = null;
        ws.render();
      }
      return;
    }
    const blocks = ws.blocks();
    if (s.fieldName && s.anchor && ws.actions.isEditableField(blocks, s.blockId, s.fieldName)) {
      ws.actions.editField("workspace", s.blockId, s.fieldName, s.anchor);
      return;
    }
    const sel = resolveDraggable(blocks, s.blockId);
    if (sel !== ws.selected) {
      ws.selected = sel;
      ws.render();
    }
    const root = getRootBlock(blocks, s.blockId);
    ws.runtime.toggleScript(root, { stackClick: true });
  }

  private startScroll(s: Pending): void {
    if (s.region === "flyout") {
      this.state = { kind: "flyoutScroll", pointerId: s.pointerId, startX: s.startX, startY: s.startY, startScrollX: 0, startScrollY: this.ws.flyout.scroll };
    } else {
      const v = this.ws.view;
      this.state = { kind: "wsScroll", pointerId: s.pointerId, startX: s.startX, startY: s.startY, startScrollX: v.scrollX, startScrollY: v.scrollY };
    }
  }

  // ---------------------------------------------------------------------------
  // Seret blok
  // ---------------------------------------------------------------------------

  private absolutePosition(blocks: BlockMap, id: string): { x: number; y: number } {
    const p = allPlacements(this.ws.deps(blocks)).find((pl) => pl.layout.id === id);
    return p ? { x: p.x, y: p.y } : { x: blocks[id]?.x ?? 0, y: blocks[id]?.y ?? 0 };
  }

  private startWorkspaceDrag(s: Pending, rawId: string): void {
    const ws = this.ws;
    const blocks = ws.blocks();
    const raw = blocks[rawId];
    let forward: EditorWorkspaceEvent[] = [];
    let topId: string | null;
    if (raw?.shadow && raw.opcode.startsWith("argument_reporter_") && raw.parent && blocks[raw.parent]?.opcode === "procedures_prototype") {
      // Seret argumen dari define = buat reporter baru (Scratch).
      const xy = this.absolutePosition(blocks, rawId);
      const copy = copyTree(blocks, rawId, ws.newId, xy, false);
      const root = copy[0];
      if (!root) return;
      root.shadow = false;
      forward = [{ type: "create", blocks: copy }];
      topId = root.id;
    } else {
      topId = resolveDraggable(blocks, rawId);
      if (!topId) return;
      forward = unplugEvents(blocks, topId, this.absolutePosition(blocks, topId));
    }
    const inverse = ws.applyRaw(forward);
    this.beginDrag(topId, s.pointerId, s.startX, s.startY, forward, inverse, false);
  }

  private startFlyoutDrag(s: Pending, rootId: string): void {
    const ws = this.ws;
    const pos = ws.flyout.rootPosition(rootId);
    if (!pos) return;
    const flyRect = ws.flyout.el.getBoundingClientRect();
    const local = ws.flyout.toLocal(pos.x, pos.y);
    const xy = ws.clientToWorkspace(flyRect.left + local.x, flyRect.top + local.y);
    const { events, topId } = ws.actions.instantiateFromFlyout(rootId, xy);
    if (!topId) return;
    const inverse = ws.applyRaw(events);
    this.beginDrag(topId, s.pointerId, s.startX, s.startY, events, inverse, false);
  }

  /** Mulai seret stack yang SUDAH top-level (dipakai juga oleh Duplicate). */
  beginDrag(topId: string, pointerId: number | null, startX: number, startY: number, forward: EditorWorkspaceEvent[], inverse: EditorWorkspaceEvent[], sticky: boolean): void {
    const ws = this.ws;
    ws.overlay.hide();
    const blocks = ws.blocks();
    const deps = ws.deps(blocks);
    const session = new DragSession(deps, topId);
    const offsets = new Map<string, { x: number; y: number }>();
    for (const p of allPlacements(deps)) {
      if (session.dragged.has(p.layout.id)) offsets.set(p.layout.id, { x: p.x, y: p.y });
    }
    this.state = { kind: "block", pointerId, startX, startY, session, forward, inverse, previewKey: "", offsets, outside: false, sticky };
    ws.root.classList.add("kb-dragging");
    ws.hiddenTops = new Set([topId]);
    ws.render();
    const { doc } = ws;
    while (ws.dragLayer.firstChild) ws.dragLayer.removeChild(ws.dragLayer.firstChild);
    ws.dragLayer.appendChild(paintStack({ doc }, layoutStack(deps, topId), 0, 0));
    this.positionDragLayer(session.start.x, session.start.y);
  }

  private positionDragLayer(wx: number, wy: number): void {
    const ws = this.ws;
    const rootRect = ws.root.getBoundingClientRect();
    const mainRect = ws.main.getBoundingClientRect();
    const sc = toScreen(ws.view, wx, wy);
    const x = mainRect.left - rootRect.left + sc.x;
    const y = mainRect.top - rootRect.top + sc.y;
    ws.dragLayer.setAttribute("transform", `translate(${x},${y}) scale(${ws.view.scale})`);
  }

  private overDeleteArea(clientX: number, clientY: number): boolean {
    const mainRect = this.ws.main.getBoundingClientRect();
    const rootRect = this.ws.root.getBoundingClientRect();
    return clientX < mainRect.left && clientX >= rootRect.left && clientY >= rootRect.top && clientY <= rootRect.bottom;
  }

  private isOutside(clientX: number, clientY: number): boolean {
    const r = this.ws.root.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    return clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom;
  }

  private moveBlockDrag(s: BlockDrag, clientX: number, clientY: number): void {
    const ws = this.ws;
    const dxy = { x: (clientX - s.startX) / ws.view.scale, y: (clientY - s.startY) / ws.view.scale };
    this.positionDragLayer(s.session.start.x + dxy.x, s.session.start.y + dxy.y);
    const outside = this.isOutside(clientX, clientY);
    if (outside !== s.outside) {
      s.outside = outside;
      ws.container?.applyEditorEvent({ type: "drag_outside", blockId: s.session.topId, isOutside: outside });
    }
    const overDelete = this.overDeleteArea(clientX, clientY);
    ws.root.classList.toggle("kb-drag-delete", overDelete);
    ws.extras.onDragOver?.({ clientX, clientY, outside });
    const preview = s.session.move(dxy, outside || overDelete);
    const key = previewKey(preview);
    if (key === s.previewKey) return;
    s.previewKey = key;
    if (preview) {
      const owner = s.offsets.get(preview.local.blockId) ?? s.session.start;
      const offset = { x: preview.local.x - owner.x, y: preview.local.y - owner.y };
      ws.preview = buildPreview(ws.deps(), s.session.dragged, preview, offset);
    } else {
      ws.preview = null;
    }
    ws.render();
  }

  private finishBlockDrag(clientX: number, clientY: number, cancel = false): void {
    const s = this.state;
    if (!s || s.kind !== "block") return;
    const ws = this.ws;
    this.state = null;
    ws.root.classList.remove("kb-dragging", "kb-drag-delete");
    ws.extras.onDragOver?.(null);
    ws.preview = null;
    ws.hiddenTops = new Set();
    while (ws.dragLayer.firstChild) ws.dragLayer.removeChild(ws.dragLayer.firstChild);
    const dxy = { x: (clientX - s.startX) / ws.view.scale, y: (clientY - s.startY) / ws.view.scale };
    const outside = !cancel && this.isOutside(clientX, clientY);
    if (s.outside) ws.container?.applyEditorEvent({ type: "drag_outside", blockId: s.session.topId, isOutside: false });
    if (cancel || outside) {
      if (outside && ws.extras.onDropOutside) {
        const blocks = ws.blocks();
        const copy = getDescendants(blocks, s.session.topId).map((id) => JSON.parse(JSON.stringify(blocks[id])) as Block);
        ws.extras.onDropOutside(copy, clientX, clientY);
      }
      ws.applyRaw(s.inverse);
      ws.changed(true);
      return;
    }
    const result = s.session.drop(dxy, this.overDeleteArea(clientX, clientY));
    if (result.kind === "refused") {
      ws.applyRaw(s.inverse);
      ws.changed(false);
      void showAlert(ws.root, ws.locale, msg(ws.locale, "PROCEDURE_USED"));
      return;
    }
    // Komentar blok ikut pindah bersama skripnya (ScratchBlockComment mengikuti blok).
    const deleted = result.events.some((ev) => ev.type === "delete");
    const commentMoves: EditorWorkspaceEvent[] = [];
    if (!deleted && ws.target?.comments && (dxy.x !== 0 || dxy.y !== 0)) {
      for (const c of Object.values(ws.target.comments)) {
        if (c.blockId && s.session.dragged.has(c.blockId)) {
          commentMoves.push({ type: "comment_move", commentId: c.id, x: Math.round(c.x + dxy.x), y: Math.round(c.y + dxy.y) });
        }
      }
    }
    const events = [...result.events, ...commentMoves];
    const inverse = ws.applyRaw(events);
    ws.undoStack.push({ forward: [...s.forward, ...events], inverse: [...inverse, ...s.inverse] });
    ws.changed(true);
  }

  // ---------------------------------------------------------------------------

  private onContextMenu(e: MouseEvent): void {
    const target = e.target instanceof Element ? e.target : null;
    if (!target || target.closest(".kb-modal, .kb-field-editor")) return;
    e.preventDefault();
    if (this.state?.kind === "block") return;
    if (this.state?.kind === "pending" && this.state.timer) clearTimeout(this.state.timer);
    this.state = null;
    const region = this.region(target);
    if (region === "other") return;
    const blockId = target.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null;
    this.ws.actions.showContextMenu(region, blockId, e.clientX, e.clientY);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (this.state) return;
    const r = this.ws.main.getBoundingClientRect();
    this.ws.overlay.hide();
    this.ws.setView(
      applyWheel(this.ws.view, { deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, ctrlKey: e.ctrlKey || e.metaKey, shiftKey: e.shiftKey, x: e.clientX - r.left, y: e.clientY - r.top }, this.ws.contentRect()),
      false,
    );
  }

  private onKey(e: KeyboardEvent): void {
    const t = e.target instanceof Element ? e.target : null;
    if (t && t.closest("input, textarea, .kb-modal")) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === "z") {
      e.preventDefault();
      if (e.shiftKey) this.ws.redo();
      else this.ws.undo();
    } else if (mod && key === "y") {
      e.preventDefault();
      this.ws.redo();
    } else if ((e.key === "Delete" || e.key === "Backspace") && this.ws.selected && !this.state) {
      e.preventDefault();
      void this.ws.actions.deleteBlock(this.ws.selected);
    }
  }

  dispose(): void {
    if (this.state?.kind === "pending" && this.state.timer) clearTimeout(this.state.timer);
    this.state = null;
    this.touches.clear();
    for (const [t, type, fn, opts] of this.listeners) t.removeEventListener(type, fn, opts);
    this.listeners.length = 0;
  }
}

function previewKey(p: DragPreview | null): string {
  if (!p) return "";
  return `${p.local.blockId}|${p.local.type}|${p.local.input}|${p.closest.blockId}|${p.closest.type}|${p.closest.input}`;
}
