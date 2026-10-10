/** Helper DOM kecil untuk SVG & HTML workspace (tanpa innerHTML dari data project). */
import type { TextMeasurer } from "./layout";
import { approxMeasure } from "./layout";

export const SVG_NS = "http://www.w3.org/2000/svg";
export const FONT_FAMILY = '"Helvetica Neue", Helvetica, Arial, sans-serif';
export const BLOCK_FONT = `500 12pt ${FONT_FAMILY}`;

export function svg<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string | number> = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (parent) parent.appendChild(el);
  return el;
}

export function html<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string> = {},
  parent?: Element,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else el.setAttribute(k, v);
  }
  if (text !== undefined) el.textContent = text;
  if (parent) parent.appendChild(el);
  return el;
}

/** Pengukur lebar teks memakai canvas 2D (fallback perkiraan bila tidak ada canvas, mis. jsdom). */
export function createMeasurer(doc: Document, font = BLOCK_FONT): TextMeasurer {
  const cache = new Map<string, number>();
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    const ua = doc.defaultView?.navigator?.userAgent ?? "";
    if (ua.includes("jsdom")) throw new Error("tanpa canvas");
    const canvas = doc.createElement("canvas");
    ctx = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  } catch {
    ctx = null;
  }
  if (ctx) ctx.font = font;
  return (text) => {
    const hit = cache.get(text);
    if (hit !== undefined) return hit;
    let w = approxMeasure(text);
    if (ctx) {
      try {
        const m = ctx.measureText(text).width;
        if (m > 0 || text === "") w = Math.ceil(m);
      } catch {
        /* jsdom tanpa canvas: pakai perkiraan */
      }
    }
    cache.set(text, w);
    return w;
  };
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
