/**
 * Komentar workspace & komentar blok (padanan ScratchBlockComment / WorkspaceCommentSvg).
 * Disimpan di target.comments lewat event comment_create/change/move/delete (vm blocklyListen).
 * Digambar sebagai lapisan HTML di atas SVG yang ikut transform scroll/zoom; komentar blok diberi
 * garis ke bloknya. Bisa diseret (kepala), diubah ukurannya (pojok), dikecilkan, dan dihapus.
 */
import type { CommentState, EditorWorkspaceEvent } from "@kody/engine";
import { BlockReducer } from "./reducer";
import type { BlocksWorkspace } from "./editor";
import { html, svg } from "./dom";
import { forEachPlacement, layoutStack, type LayoutDeps } from "./layout";
import { msg } from "./i18n";
import { getTopBlocks, getDescendants, type BlockMap } from "./tree";

export const COMMENT_DEFAULT_SIZE = { width: 200, height: 200 } as const;
export const COMMENT_MIN_SIZE = { width: 120, height: 64 } as const;
const MINIMIZED_HEIGHT = 32;

interface CommentNode {
  el: HTMLDivElement;
  textarea: HTMLTextAreaElement;
  label: HTMLSpanElement;
  toggle: HTMLButtonElement;
}

/** Komentar yang menempel di blok mana pun dalam pohon (blok + bawahnya + input). */
export function commentsInTrees(comments: Record<string, CommentState>, blocks: BlockMap, rootIds: readonly string[]): CommentState[] {
  const ids = new Set<string>();
  for (const root of rootIds) for (const id of getDescendants(blocks, root)) ids.add(id);
  return Object.values(comments).filter((c) => c.blockId !== null && ids.has(c.blockId));
}

/** Tambahkan comment_delete sebelum setiap delete blok yang membawa komentar (Blockly membuang komentar bersama bloknya). */
export function withCommentDeletes(events: readonly EditorWorkspaceEvent[], comments: Record<string, CommentState>, blocks: BlockMap): EditorWorkspaceEvent[] {
  const attached = Object.values(comments).some((c) => c.blockId !== null);
  if (!attached || !events.some((e) => e.type === "delete")) return [...events];
  // Simulasikan urutan event: delete dengan "heal" memindah blok bawah lebih dulu (event move).
  const reducer = new BlockReducer(Object.values(blocks));
  const out: EditorWorkspaceEvent[] = [];
  const gone = new Set<string>();
  for (const ev of events) {
    if (ev.type === "delete") {
      for (const c of commentsInTrees(comments, reducer.blocks, [ev.blockId])) {
        if (gone.has(c.id)) continue;
        gone.add(c.id);
        out.push({ type: "comment_delete", commentId: c.id });
      }
    }
    out.push(ev);
    reducer.apply(ev);
  }
  return out;
}

export class CommentLayer {
  readonly el: HTMLDivElement;
  readonly lines: SVGGElement;
  private nodes = new Map<string, CommentNode>();
  private dragging: string | null = null;

  constructor(private readonly ws: BlocksWorkspace) {
    this.el = html(ws.doc, "div", { class: "kb-comments" }, ws.main);
    this.lines = svg(ws.doc, "g", { class: "kb-comment-lines" });
  }

  private comments(): Record<string, CommentState> {
    return this.ws.target?.comments ?? {};
  }

  applyTransform(): void {
    const v = this.ws.view;
    this.el.style.transform = `translate(${v.scrollX}px,${v.scrollY}px) scale(${v.scale})`;
  }

  /** Gambar ulang komentar sesuai target.comments (DOM dipakai ulang per id). */
  render(blocks: BlockMap, deps: LayoutDeps, hiddenTops: ReadonlySet<string>): void {
    const comments = this.comments();
    const seen = new Set<string>();
    for (const c of Object.values(comments)) {
      seen.add(c.id);
      let node = this.nodes.get(c.id);
      if (!node) {
        node = this.create(c);
        this.nodes.set(c.id, node);
      }
      this.update(node, c);
    }
    for (const [id, node] of this.nodes) {
      if (!seen.has(id)) {
        node.el.remove();
        this.nodes.delete(id);
      }
    }
    this.drawLines(comments, blocks, deps, hiddenTops);
    this.applyTransform();
  }

  private drawLines(comments: Record<string, CommentState>, blocks: BlockMap, deps: LayoutDeps, hiddenTops: ReadonlySet<string>): void {
    while (this.lines.firstChild) this.lines.removeChild(this.lines.firstChild);
    const attached = Object.values(comments).filter((c) => c.blockId && blocks[c.blockId]);
    if (!attached.length) return;
    const wanted = new Set(attached.map((c) => c.blockId as string));
    const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const top of getTopBlocks(blocks)) {
      if (hiddenTops.has(top)) continue;
      const b = blocks[top];
      forEachPlacement(layoutStack(deps, top), b?.x ?? 0, b?.y ?? 0, (p) => {
        if (wanted.has(p.layout.id)) pos.set(p.layout.id, { x: p.x, y: p.y, w: p.layout.width, h: p.layout.height });
      });
    }
    for (const c of attached) {
      const p = pos.get(c.blockId as string);
      if (!p) continue;
      svg(this.ws.doc, "line", {
        x1: p.x + p.w,
        y1: p.y + Math.min(p.h, 48) / 2,
        x2: c.x,
        y2: c.y + MINIMIZED_HEIGHT / 2,
        stroke: "#bca903",
        "stroke-width": 1,
        class: "kb-comment-line",
      }, this.lines);
    }
  }

  private create(c: CommentState): CommentNode {
    const doc = this.ws.doc;
    const L = this.ws.locale;
    const el = html(doc, "div", { class: "kb-comment", "data-comment-id": c.id }, this.el);
    const header = html(doc, "div", { class: "kb-comment-top" }, el);
    const toggle = html(doc, "button", { type: "button", class: "kb-comment-toggle" }, header);
    const label = html(doc, "span", { class: "kb-comment-label" }, header);
    const close = html(doc, "button", { type: "button", class: "kb-comment-close", "aria-label": msg(L, "REMOVE_COMMENT"), title: msg(L, "REMOVE_COMMENT") }, header, "×");
    const textarea = html(doc, "textarea", { class: "kb-comment-text", placeholder: msg(L, "COMMENT_PLACEHOLDER"), maxlength: "8000" }, el);
    const resize = html(doc, "div", { class: "kb-comment-resize", "aria-label": msg(L, "COMMENT_RESIZE"), role: "button" }, el);
    // Jangan biarkan gesture workspace (scroll/long-press) mengambil pointer di dalam komentar.
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    el.addEventListener("contextmenu", (e) => e.stopPropagation());
    toggle.addEventListener("click", () => {
      const cur = this.comments()[c.id];
      if (cur) this.ws.apply([{ type: "comment_change", commentId: c.id, minimized: !cur.minimized }], { refreshFlyout: false });
    });
    close.addEventListener("click", () => this.ws.apply([{ type: "comment_delete", commentId: c.id }], { refreshFlyout: false }));
    const commitText = (): void => {
      const cur = this.comments()[c.id];
      if (cur && cur.text !== textarea.value) this.ws.apply([{ type: "comment_change", commentId: c.id, text: textarea.value }], { refreshFlyout: false });
    };
    textarea.addEventListener("change", commitText);
    textarea.addEventListener("blur", commitText);
    textarea.addEventListener("keydown", (e) => e.stopPropagation());
    this.dragHandle(header, c.id, "move");
    this.dragHandle(resize, c.id, "resize");
    return { el, textarea, label, toggle };
  }

  private update(node: CommentNode, c: CommentState): void {
    const L = this.ws.locale;
    node.el.style.left = `${c.x}px`;
    node.el.style.top = `${c.y}px`;
    node.el.style.width = `${Math.max(COMMENT_MIN_SIZE.width, c.width)}px`;
    node.el.style.height = c.minimized ? `${MINIMIZED_HEIGHT}px` : `${Math.max(COMMENT_MIN_SIZE.height, c.height)}px`;
    node.el.classList.toggle("kb-comment--min", c.minimized);
    node.label.textContent = c.minimized ? c.text.replace(/\s+/g, " ").slice(0, 40) : "";
    node.toggle.setAttribute("aria-label", msg(L, c.minimized ? "COMMENT_EXPAND" : "COMMENT_MINIMIZE"));
    node.toggle.textContent = c.minimized ? "▸" : "▾";
    if (this.ws.doc.activeElement !== node.textarea && node.textarea.value !== c.text) node.textarea.value = c.text;
  }

  private dragHandle(handle: HTMLElement, id: string, mode: "move" | "resize"): void {
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || (e.target instanceof Element && e.target.closest("button"))) return;
      const c = this.comments()[id];
      const node = this.nodes.get(id);
      if (!c || !node) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* jsdom */
      }
      this.dragging = id;
      const start = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y, w: c.width, h: c.height };
      let last = { x: c.x, y: c.y, w: c.width, h: c.height };
      const move = (ev: PointerEvent): void => {
        if (ev.pointerId !== e.pointerId) return;
        const s = this.ws.view.scale;
        const dx = (ev.clientX - start.x) / s;
        const dy = (ev.clientY - start.y) / s;
        if (mode === "move") {
          last = { ...last, x: Math.round(start.cx + dx), y: Math.round(start.cy + dy) };
          node.el.style.left = `${last.x}px`;
          node.el.style.top = `${last.y}px`;
        } else {
          last = { ...last, w: Math.round(Math.max(COMMENT_MIN_SIZE.width, start.w + dx)), h: Math.round(Math.max(COMMENT_MIN_SIZE.height, start.h + dy)) };
          node.el.style.width = `${last.w}px`;
          node.el.style.height = `${last.h}px`;
        }
      };
      const up = (ev: PointerEvent): void => {
        if (ev.pointerId !== e.pointerId) return;
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        this.dragging = null;
        if (mode === "move" && (last.x !== c.x || last.y !== c.y)) {
          this.ws.apply([{ type: "comment_move", commentId: id, x: last.x, y: last.y }], { refreshFlyout: false });
        } else if (mode === "resize" && (last.w !== c.width || last.h !== c.height)) {
          this.ws.apply([{ type: "comment_change", commentId: id, width: last.w, height: last.h }], { refreshFlyout: false });
        }
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }

  get isDragging(): boolean {
    return this.dragging !== null;
  }

  /** Fokus ke kotak teks komentar baru agar anak bisa langsung mengetik. */
  focus(id: string): void {
    this.nodes.get(id)?.textarea.focus({ preventScroll: true });
  }

  dispose(): void {
    this.el.remove();
    this.nodes.clear();
  }
}
