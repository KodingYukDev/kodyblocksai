/**
 * Mesin status alat paint editor (pointer down/move/up) untuk mode vektor & bitmap.
 * Tidak menyentuh DOM: komponen React meneruskan koordinat kanvas dan menggambar hasilnya.
 */
import * as B from "./bitmap-ops";
import * as V from "./vector-doc";

export type PaintTool = "select" | "brush" | "eraser" | "line" | "rect" | "ellipse" | "text" | "fill" | "center";
export type PaintMode = "vector" | "bitmap";

export const TOOLS_BY_MODE: Record<PaintMode, readonly PaintTool[]> = {
  vector: ["select", "brush", "eraser", "line", "rect", "ellipse", "text", "fill", "center"],
  bitmap: ["select", "brush", "eraser", "line", "rect", "ellipse", "text", "fill", "center"],
};

export interface PaintSettings {
  fill: string;
  stroke: string;
  width: number;
  fontSize: number;
  /** Bentuk diisi (true) atau hanya garis tepi. */
  filled: boolean;
}

export const DEFAULT_SETTINGS: PaintSettings = { fill: "#9966ff", stroke: "#575e75", width: 4, fontSize: 32, filled: true };

export interface Point {
  x: number;
  y: number;
}

export interface Modifiers {
  shift?: boolean;
}

/** Riwayat undo/redo umum untuk snapshot dokumen. */
export class PaintHistory<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];
  constructor(
    private readonly clone: (v: T) => T,
    private readonly limit = 30,
  ) {}
  push(state: T): void {
    this.undoStack.push(this.clone(state));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }
  undo(current: T): T | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    this.redoStack.push(this.clone(current));
    return prev;
  }
  redo(current: T): T | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(this.clone(current));
    return next;
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}

// ---------------------------------------------------------------- vektor

export interface VectorResult {
  doc: V.VectorDoc;
  /** Bentuk sementara yang sedang digambar (untuk pratinjau). */
  draft: V.VectorShape | null;
  selectedId: number | null;
  /** Alat teks meminta isian teks di titik ini. */
  textRequest: Point | null;
  /** true bila dokumen berubah dan perlu masuk riwayat. */
  committed: boolean;
}

export class VectorToolSession {
  private start: Point | null = null;
  private last: Point | null = null;
  private points: [number, number][] = [];
  private moving: number | null = null;

  constructor(
    public tool: PaintTool,
    public settings: PaintSettings,
  ) {}

  private result(doc: V.VectorDoc, partial: Partial<VectorResult> = {}): VectorResult {
    return { doc, draft: null, selectedId: null, textRequest: null, committed: false, ...partial };
  }

  down(doc: V.VectorDoc, p: Point, selectedId: number | null): VectorResult {
    this.start = p;
    this.last = p;
    this.points = [[p.x, p.y]];
    switch (this.tool) {
      case "select": {
        const hit = V.hitTest(doc, p.x, p.y);
        this.moving = hit ? hit.id : null;
        return this.result(doc, { selectedId: hit ? hit.id : null });
      }
      case "eraser": {
        const hit = V.hitTest(doc, p.x, p.y, this.settings.width / 2);
        return hit ? this.result(V.removeShape(doc, hit.id), { committed: true }) : this.result(doc);
      }
      case "fill": {
        const hit = V.hitTest(doc, p.x, p.y);
        return hit ? this.result(V.updateShape(doc, hit.id, (s) => V.fillShape(s, this.settings.fill)), { committed: true, selectedId }) : this.result(doc, { selectedId });
      }
      case "center":
        return this.result(V.recenter(doc, p.x, p.y), { committed: true, selectedId });
      case "text":
        return this.result(doc, { textRequest: p, selectedId });
      default:
        return this.result(doc, { draft: this.draft(p, {}) });
    }
  }

  move(doc: V.VectorDoc, p: Point, mods: Modifiers, selectedId: number | null): VectorResult {
    if (!this.start) return this.result(doc, { selectedId });
    if (this.tool === "select") {
      if (this.moving !== null && this.last) {
        const dx = p.x - this.last.x;
        const dy = p.y - this.last.y;
        this.last = p;
        return this.result(
          V.updateShape(doc, this.moving, (s) => V.translateShape(s, dx, dy)),
          { selectedId: this.moving },
        );
      }
      return this.result(doc, { selectedId });
    }
    if (this.tool === "brush") this.points.push([p.x, p.y]);
    this.last = p;
    return this.result(doc, { draft: this.draft(p, mods), selectedId });
  }

  up(doc: V.VectorDoc, p: Point, mods: Modifiers, selectedId: number | null): VectorResult {
    const start = this.start;
    if (!start) return this.result(doc, { selectedId });
    if (this.tool === "select") {
      this.start = null;
      const moved = this.moving !== null && (p.x !== start.x || p.y !== start.y);
      const id = this.moving;
      this.moving = null;
      return this.result(doc, { selectedId: id, committed: moved });
    }
    if (this.tool === "brush") this.points.push([p.x, p.y]);
    const shape = this.draft(p, mods);
    this.start = null;
    if (!shape) return this.result(doc, { selectedId });
    const next = V.addShape(doc, shape);
    return this.result(next, { committed: true, selectedId: next.nextId - 1 });
  }

  /** Bentuk sementara dari titik awal ke p. null = terlalu kecil (klik tanpa seret). */
  private draft(p: Point, mods: Modifiers): V.VectorShape | null {
    const s = this.start;
    if (!s) return null;
    const st = this.settings;
    switch (this.tool) {
      case "brush":
        return { id: 0, type: "path", points: [...this.points], stroke: st.stroke, width: st.width };
      case "line": {
        let { x, y } = p;
        if (mods.shift) {
          // Kunci ke kelipatan 45 derajat.
          const ang = Math.round(Math.atan2(y - s.y, x - s.x) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(x - s.x, y - s.y);
          x = s.x + len * Math.cos(ang);
          y = s.y + len * Math.sin(ang);
        }
        if (Math.hypot(x - s.x, y - s.y) < 1) return null;
        return { id: 0, type: "line", x1: s.x, y1: s.y, x2: x, y2: y, stroke: st.stroke, width: st.width };
      }
      case "rect": {
        const b = V.dragBox(s.x, s.y, p.x, p.y, mods.shift);
        if (b.w < 1 || b.h < 1) return null;
        return { id: 0, type: "rect", ...b, fill: st.filled ? st.fill : "none", stroke: st.filled ? "none" : st.stroke, width: st.width };
      }
      case "ellipse": {
        const b = V.dragBox(s.x, s.y, p.x, p.y, mods.shift);
        if (b.w < 1 || b.h < 1) return null;
        return { id: 0, type: "ellipse", cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2, ry: b.h / 2, fill: st.filled ? st.fill : "none", stroke: st.filled ? "none" : st.stroke, width: st.width };
      }
      default:
        return null;
    }
  }
}

/** Tambahkan teks hasil textRequest. Teks kosong diabaikan. */
export function addText(doc: V.VectorDoc, at: Point, text: string, settings: PaintSettings): V.VectorDoc {
  const t = text.slice(0, 200);
  if (!t.trim()) return doc;
  return V.addShape(doc, { type: "text", x: at.x, y: at.y, text: t, size: settings.fontSize, fill: settings.fill });
}

// ---------------------------------------------------------------- bitmap

export interface BitmapSelection {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BitmapResult {
  pixels: B.Pixels;
  selection: BitmapSelection | null;
  textRequest: Point | null;
  committed: boolean;
}

/**
 * Sesi alat bitmap. Koordinat dalam piksel bitmap (960x720). Bentuk (garis/kotak/elips) digambar
 * ulang dari snapshot setiap gerakan supaya pratinjau tidak menumpuk.
 */
export class BitmapToolSession {
  private start: Point | null = null;
  private last: Point | null = null;
  private snapshot: B.Pixels | null = null;
  private dragSel: BitmapSelection | null = null;

  constructor(
    public tool: PaintTool,
    public settings: PaintSettings,
  ) {}

  private res(pixels: B.Pixels, partial: Partial<BitmapResult> = {}): BitmapResult {
    return { pixels, selection: null, textRequest: null, committed: false, ...partial };
  }

  down(px: B.Pixels, p: Point, selection: BitmapSelection | null): BitmapResult {
    this.start = p;
    this.last = p;
    this.snapshot = B.clonePixels(px);
    const st = this.settings;
    switch (this.tool) {
      case "brush":
      case "eraser": {
        const out = B.clonePixels(px);
        B.stampCircle(out, p.x, p.y, st.width / 2, B.parseHex(st.stroke), this.tool === "eraser");
        return this.res(out);
      }
      case "fill": {
        const out = B.clonePixels(px);
        const n = B.floodFill(out, p.x, p.y, B.parseHex(st.fill));
        return this.res(out, { committed: n > 0 });
      }
      case "center":
        return this.res(B.shiftAll(px, B.BITMAP_CX - Math.round(p.x), B.BITMAP_CY - Math.round(p.y)), { committed: true });
      case "text":
        return this.res(px, { textRequest: p });
      case "select": {
        const inside = selection && p.x >= selection.x && p.x <= selection.x + selection.w && p.y >= selection.y && p.y <= selection.y + selection.h;
        this.dragSel = inside ? selection : null;
        return this.res(px, { selection: inside ? selection : null });
      }
      default:
        return this.res(px);
    }
  }

  move(px: B.Pixels, p: Point, mods: Modifiers, selection: BitmapSelection | null): BitmapResult {
    const s = this.start;
    const base = this.snapshot;
    if (!s || !base) return this.res(px, { selection });
    const st = this.settings;
    switch (this.tool) {
      case "brush":
      case "eraser": {
        const from = this.last ?? s;
        B.strokeLine(px, from.x, from.y, p.x, p.y, st.width, B.parseHex(st.stroke), this.tool === "eraser");
        this.last = p;
        return this.res(px);
      }
      case "line":
      case "rect":
      case "ellipse": {
        const out = B.clonePixels(base);
        this.drawShape(out, s, p, mods);
        return this.res(out);
      }
      case "select": {
        if (this.dragSel) {
          const dx = Math.round(p.x - s.x);
          const dy = Math.round(p.y - s.y);
          const out = B.clonePixels(base);
          B.moveRegion(out, this.dragSel.x, this.dragSel.y, this.dragSel.w, this.dragSel.h, dx, dy);
          return this.res(out, { selection: { ...this.dragSel, x: this.dragSel.x + dx, y: this.dragSel.y + dy } });
        }
        const b = V.dragBox(s.x, s.y, p.x, p.y);
        return this.res(px, { selection: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) } });
      }
      default:
        return this.res(px, { selection });
    }
  }

  up(px: B.Pixels, p: Point, mods: Modifiers, selection: BitmapSelection | null): BitmapResult {
    if (!this.start) return this.res(px, { selection });
    const r = this.move(px, p, mods, selection);
    this.start = null;
    this.snapshot = null;
    const changed = this.tool !== "select" || this.dragSel !== null;
    this.dragSel = null;
    const sel = this.tool === "select" ? (r.selection && r.selection.w > 1 && r.selection.h > 1 ? r.selection : null) : null;
    return { ...r, selection: sel, committed: changed && this.tool !== "text" && this.tool !== "fill" && this.tool !== "center" };
  }

  private drawShape(out: B.Pixels, s: Point, p: Point, mods: Modifiers): void {
    const st = this.settings;
    const fill = B.parseHex(st.fill);
    const stroke = B.parseHex(st.stroke);
    if (this.tool === "line") {
      B.strokeLine(out, s.x, s.y, p.x, p.y, st.width, stroke);
      return;
    }
    const b = V.dragBox(s.x, s.y, p.x, p.y, mods.shift);
    if (this.tool === "rect") {
      if (st.filled) B.fillRect(out, b.x, b.y, b.w, b.h, fill);
      else B.strokeRect(out, b.x, b.y, b.w, b.h, st.width, stroke);
    } else if (st.filled) B.fillEllipse(out, b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, fill);
    else B.strokeEllipse(out, b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, st.width, stroke);
  }
}
