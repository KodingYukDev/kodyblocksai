/**
 * Model dokumen vektor paint editor. Ruang kerja 480x360 seperti paint editor Scratch: pusat
 * rotasi costume selalu di titik (240,180). Costume SVG lama dipasang utuh sebagai satu bentuk
 * "embed" (bisa dipindah), bentuk baru ditambahkan di atasnya. Saat simpan, viewBox = kotak batas
 * semua isi dan pusat rotasi = (240,180) relatif terhadap kotak itu.
 */
import { svgViewBox } from "../costume-upload";

export const CANVAS_W = 480;
export const CANVAS_H = 360;
export const CENTER_X = 240;
export const CENTER_Y = 180;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ShapeBase {
  id: number;
}

export type VectorShape =
  | (ShapeBase & { type: "path"; points: [number, number][]; stroke: string; width: number })
  | (ShapeBase & { type: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number })
  | (ShapeBase & { type: "rect"; x: number; y: number; w: number; h: number; fill: string; stroke: string; width: number })
  | (ShapeBase & { type: "ellipse"; cx: number; cy: number; rx: number; ry: number; fill: string; stroke: string; width: number })
  | (ShapeBase & { type: "text"; x: number; y: number; text: string; size: number; fill: string })
  | (ShapeBase & { type: "embed"; x: number; y: number; w: number; h: number; viewBox: string; inner: string; rootAttrs: string });

export interface VectorDoc {
  shapes: VectorShape[];
  nextId: number;
}

const r2 = (n: number): string => String(Math.round(n * 100) / 100);

export function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c);
}

export function emptyDoc(): VectorDoc {
  return { shapes: [], nextId: 1 };
}

/** Atribut root yang aman dipertahankan saat costume lama di-embed (namespace, preserveAspectRatio). */
function keptRootAttrs(svgTag: string): string {
  const out: string[] = [];
  const re = /\s(xmlns:[a-z]+|preserveAspectRatio)\s*=\s*("[^"]*"|'[^']*')/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svgTag))) out.push(`${m[1]}=${m[2]}`);
  return out.join(" ");
}

/**
 * Buka costume SVG (sudah disanitasi) sebagai dokumen: seluruh isi menjadi satu "embed" yang
 * ditempatkan sehingga pusat rotasinya jatuh di (240,180).
 */
export function docFromSvg(svgText: string, rotationCenterX: number, rotationCenterY: number): VectorDoc {
  const vb = svgViewBox(svgText);
  const tag = /<svg\b[^>]*>/i.exec(svgText)?.[0] ?? "";
  const start = svgText.indexOf(tag) + tag.length;
  const end = svgText.lastIndexOf("</svg>");
  const inner = tag && end > start ? svgText.slice(start, end) : "";
  if (!inner.trim() || vb.width <= 0 || vb.height <= 0) return emptyDoc();
  return {
    nextId: 2,
    shapes: [
      {
        id: 1,
        type: "embed",
        x: CENTER_X - rotationCenterX,
        y: CENTER_Y - rotationCenterY,
        w: vb.width,
        h: vb.height,
        viewBox: `${r2(vb.x)} ${r2(vb.y)} ${r2(vb.width)} ${r2(vb.height)}`,
        inner,
        rootAttrs: keptRootAttrs(tag),
      },
    ],
  };
}

/** Kotak batas sebuah bentuk (termasuk tebal garis). */
export function shapeBounds(s: VectorShape): Box {
  switch (s.type) {
    case "path": {
      const xs = s.points.map((p) => p[0]);
      const ys = s.points.map((p) => p[1]);
      const pad = s.width / 2;
      const x = Math.min(...xs) - pad;
      const y = Math.min(...ys) - pad;
      return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
    }
    case "line": {
      const pad = s.width / 2;
      const x = Math.min(s.x1, s.x2) - pad;
      const y = Math.min(s.y1, s.y2) - pad;
      return { x, y, w: Math.abs(s.x2 - s.x1) + 2 * pad, h: Math.abs(s.y2 - s.y1) + 2 * pad };
    }
    case "rect": {
      const pad = s.stroke !== "none" ? s.width / 2 : 0;
      return { x: s.x - pad, y: s.y - pad, w: s.w + 2 * pad, h: s.h + 2 * pad };
    }
    case "ellipse": {
      const pad = s.stroke !== "none" ? s.width / 2 : 0;
      return { x: s.cx - s.rx - pad, y: s.cy - s.ry - pad, w: 2 * (s.rx + pad), h: 2 * (s.ry + pad) };
    }
    case "text": {
      // Perkiraan metrik Helvetica: lebar rata-rata 0.6em, tinggi 1em, baseline di y.
      const w = Math.max(1, s.text.length) * s.size * 0.6;
      return { x: s.x, y: s.y - s.size * 0.8, w, h: s.size };
    }
    case "embed":
      return { x: s.x, y: s.y, w: s.w, h: s.h };
  }
}

export function unionBounds(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function docBounds(doc: VectorDoc): Box | null {
  return unionBounds(doc.shapes.map(shapeBounds));
}

/** Markup satu bentuk (koordinat kanvas). */
export function shapeMarkup(s: VectorShape): string {
  switch (s.type) {
    case "path": {
      const [first, ...rest] = s.points;
      if (!first) return "";
      const d = `M${r2(first[0])} ${r2(first[1])}` + (rest.length ? rest.map((p) => `L${r2(p[0])} ${r2(p[1])}`).join("") : `L${r2(first[0] + 0.01)} ${r2(first[1])}`);
      return `<path d="${d}" fill="none" stroke="${s.stroke}" stroke-width="${r2(s.width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    case "line":
      return `<line x1="${r2(s.x1)}" y1="${r2(s.y1)}" x2="${r2(s.x2)}" y2="${r2(s.y2)}" stroke="${s.stroke}" stroke-width="${r2(s.width)}" stroke-linecap="round"/>`;
    case "rect":
      return `<rect x="${r2(s.x)}" y="${r2(s.y)}" width="${r2(s.w)}" height="${r2(s.h)}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${r2(s.width)}"/>`;
    case "ellipse":
      return `<ellipse cx="${r2(s.cx)}" cy="${r2(s.cy)}" rx="${r2(s.rx)}" ry="${r2(s.ry)}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${r2(s.width)}"/>`;
    case "text":
      return `<text x="${r2(s.x)}" y="${r2(s.y)}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${r2(s.size)}" fill="${s.fill}" xml:space="preserve">${escapeXml(s.text)}</text>`;
    case "embed":
      return `<svg x="${r2(s.x)}" y="${r2(s.y)}" width="${r2(s.w)}" height="${r2(s.h)}" viewBox="${s.viewBox}" overflow="visible"${s.rootAttrs ? ` ${s.rootAttrs}` : ""}>${s.inner}</svg>`;
  }
}

export interface SerializedVector {
  svg: string;
  rotationCenterX: number;
  rotationCenterY: number;
}

/** Simpan dokumen sebagai costume SVG. Dokumen kosong -> SVG 2x2 pusat (1,1) seperti costume kosong. */
export function serializeDoc(doc: VectorDoc): SerializedVector {
  const b = docBounds(doc);
  const head = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"';
  if (!b || b.w <= 0 || b.h <= 0) {
    return { svg: `<svg ${head} width="2" height="2" viewBox="0 0 2 2"></svg>`, rotationCenterX: 1, rotationCenterY: 1 };
  }
  const x = Math.floor(b.x);
  const y = Math.floor(b.y);
  const w = Math.ceil(b.x + b.w) - x;
  const h = Math.ceil(b.y + b.h) - y;
  const body = doc.shapes.map(shapeMarkup).join("");
  const svg = `<svg ${head} width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}"><!-- KodyBlocks paint -->${body}</svg>`;
  return { svg, rotationCenterX: CENTER_X - x, rotationCenterY: CENTER_Y - y };
}

/** Markup untuk tampilan editor (tanpa pemangkasan, koordinat kanvas). */
export function previewMarkup(doc: VectorDoc): string {
  return doc.shapes.map(shapeMarkup).join("");
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Bentuk teratas di titik (px,py), atau null. */
export function hitTest(doc: VectorDoc, px: number, py: number, tolerance = 4): VectorShape | null {
  for (let i = doc.shapes.length - 1; i >= 0; i--) {
    const s = doc.shapes[i];
    if (!s) continue;
    if (s.type === "path") {
      for (let k = 0; k < s.points.length; k++) {
        const a = s.points[k];
        const b = s.points[k + 1] ?? a;
        if (a && b && distToSegment(px, py, a[0], a[1], b[0], b[1]) <= s.width / 2 + tolerance) return s;
      }
      continue;
    }
    if (s.type === "line") {
      if (distToSegment(px, py, s.x1, s.y1, s.x2, s.y2) <= s.width / 2 + tolerance) return s;
      continue;
    }
    if (s.type === "ellipse") {
      const nx = (px - s.cx) / (s.rx + tolerance);
      const ny = (py - s.cy) / (s.ry + tolerance);
      if (nx * nx + ny * ny <= 1) return s;
      continue;
    }
    const bb = shapeBounds(s);
    if (px >= bb.x - tolerance && px <= bb.x + bb.w + tolerance && py >= bb.y - tolerance && py <= bb.y + bb.h + tolerance) return s;
  }
  return null;
}

export function translateShape(s: VectorShape, dx: number, dy: number): VectorShape {
  switch (s.type) {
    case "path":
      return { ...s, points: s.points.map(([x, y]) => [x + dx, y + dy]) };
    case "line":
      return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
    case "ellipse":
      return { ...s, cx: s.cx + dx, cy: s.cy + dy };
    default:
      return { ...s, x: s.x + dx, y: s.y + dy };
  }
}

/** Bentuk baru tanpa id (Omit distributif per varian union). */
export type NewShape = VectorShape extends infer S ? (S extends VectorShape ? Omit<S, "id"> : never) : never;

export function addShape(doc: VectorDoc, shape: NewShape): VectorDoc {
  return { shapes: [...doc.shapes, { ...shape, id: doc.nextId } as VectorShape], nextId: doc.nextId + 1 };
}

export function updateShape(doc: VectorDoc, id: number, fn: (s: VectorShape) => VectorShape): VectorDoc {
  return { ...doc, shapes: doc.shapes.map((s) => (s.id === id ? fn(s) : s)) };
}

export function removeShape(doc: VectorDoc, id: number): VectorDoc {
  return { ...doc, shapes: doc.shapes.filter((s) => s.id !== id) };
}

/** Alat pusat rotasi: geser seluruh isi sehingga titik (px,py) menjadi pusat (240,180). */
export function recenter(doc: VectorDoc, px: number, py: number): VectorDoc {
  const dx = CENTER_X - px;
  const dy = CENTER_Y - py;
  return { ...doc, shapes: doc.shapes.map((s) => translateShape(s, dx, dy)) };
}

/** Alat isi: warnai bentuk tertutup; garis/path mendapat warna garis. */
export function fillShape(s: VectorShape, color: string): VectorShape {
  switch (s.type) {
    case "rect":
    case "ellipse":
    case "text":
      return { ...s, fill: color };
    case "path":
    case "line":
      return { ...s, stroke: color };
    default:
      return s;
  }
}

/** Kotak dari dua titik seret (dengan Shift = persegi). */
export function dragBox(x0: number, y0: number, x1: number, y1: number, square = false): Box {
  let w = x1 - x0;
  let h = y1 - y0;
  if (square) {
    const m = Math.max(Math.abs(w), Math.abs(h));
    w = Math.sign(w || 1) * m;
    h = Math.sign(h || 1) * m;
  }
  return { x: Math.min(x0, x0 + w), y: Math.min(y0, y0 + h), w: Math.abs(w), h: Math.abs(h) };
}
