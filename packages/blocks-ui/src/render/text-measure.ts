/**
 * Pengukur lebar teks blok. scratch-blocks memakai getComputedTextLength() pada elemen SVG
 * (Field.getCachedWidth). Di sini dibuat injeksi supaya renderer tetap fungsi murni:
 *  - `helveticaMeasurer` (default, deterministik, dipakai tes): tabel lebar glyph Helvetica (AFM, per 1000 em).
 *  - `createCanvasMeasurer()` (browser): CanvasRenderingContext2D.measureText dengan font blok asli.
 */
import { BLOCK_FONT } from "./metrics";

export type TextClass = "blocklyText" | "blocklyTextTruncated";

export interface TextMeasurer {
  /** Lebar teks dalam px pada font blok (12pt weight 500). */
  measure(text: string, cls?: TextClass): number;
}

/** Lebar glyph Helvetica (Adobe Core14 AFM), karakter ASCII 32..126. */
const HELVETICA_ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // ' '..'/'
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, // 0..9
  278, 278, 584, 584, 584, 556, 1015, // : ; < = > ? @
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667,
  944, 667, 667, 611, // A..Z
  278, 278, 278, 469, 556, 333, // [ \ ] ^ _ `
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500,
  722, 500, 500, 500, // a..z
  334, 260, 334, 584, // { | } ~
];

const EXTRA_WIDTHS: Record<string, number> = {
  " ": 278, // NBSP (Blockly.Field.NBSP)
  "…": 1000, // ellipsis
  "°": 400, // degree
  "×": 584,
  "÷": 584,
  "≤": 549,
  "≥": 549,
  "≠": 549,
};

const DEFAULT_WIDTH = 556;

function glyphWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 32 && code <= 126) return HELVETICA_ASCII[code - 32] ?? DEFAULT_WIDTH;
  const extra = EXTRA_WIDTHS[ch];
  if (extra !== undefined) return extra;
  // CJK/emoji ~ 1 em; karakter lain memakai lebar digit Helvetica.
  if (code >= 0x2e80) return 1000;
  return DEFAULT_WIDTH;
}

export const helveticaMeasurer: TextMeasurer = {
  measure(text: string, cls: TextClass = "blocklyText"): number {
    const sizePx = cls === "blocklyTextTruncated" ? (11 * 4) / 3 : BLOCK_FONT.sizePx;
    let units = 0;
    for (const ch of text) units += glyphWidth(ch);
    return Math.round(((units * sizePx) / 1000) * 100) / 100;
  },
};

/** Pengukur memakai canvas 2D (lebar identik dengan getComputedTextLength untuk font yang sama). */
export function createCanvasMeasurer(doc: Document = document): TextMeasurer {
  const canvas = doc.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return helveticaMeasurer;
  const cache = new Map<string, number>();
  return {
    measure(text: string, cls: TextClass = "blocklyText"): number {
      const key = cls + "\n" + text;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      ctx.font = `${BLOCK_FONT.weight} ${cls === "blocklyTextTruncated" ? 11 : BLOCK_FONT.sizePt}pt ${BLOCK_FONT.family}`;
      const width = ctx.measureText(text).width;
      cache.set(key, width);
      return width;
    },
  };
}
