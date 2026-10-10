/**
 * Path SVG bentuk blok vertikal. Konstanta path (notch, sudut, topi) dari scratch-blocks
 * core/block_render_svg_vertical.js (Apache-2.0, versi 1.1.206); perakitan path ditulis sendiri.
 */
import type { BlockLayout } from "./layout";
import { START_HAT_HEIGHT, STATEMENT_INPUT_EDGE_WIDTH } from "./layout";

export const CORNER_RADIUS = 4;
export const NOTCH_START_PADDING = 12;
export const START_HAT_PATH = "c 25,-22 71,-22 96,0";
export const NOTCH_PATH_LEFT = "c 2,0 3,1 4,2 l 4,4 c 1,1 2,2 4,2 h 12 c 2,0 3,-1 4,-2 l 4,-4 c 1,-1 2,-2 4,-2";
export const NOTCH_PATH_RIGHT = "c -2,0 -3,1 -4,2 l -4,4 c -1,1 -2,2 -4,2 h -12 c -2,0 -3,-1 -4,-2 l -4,-4 c -1,-1 -2,-2 -4,-2";
/** Lebar horizontal total satu notch (jumlah dx NOTCH_PATH_LEFT). */
export const NOTCH_SPAN = 36;

const R = CORNER_RADIUS;

/** Path blok statement/hat/C (sudut, notch atas/bawah, mulut C). */
export function statementPath(layout: BlockLayout): string {
  const { width: w, height: h, info } = layout;
  const parts: string[] = [];
  if (info.isHat) {
    if (info.opcode === "procedures_definition") {
      const r = 20;
      parts.push(`M 0,${START_HAT_HEIGHT + r}`, `a ${r},${r} 0 0,1 ${r},-${r}`, `H ${w - r}`, `a ${r},${r} 0 0,1 ${r},${r}`);
    } else {
      parts.push(`M 0,${START_HAT_HEIGHT}`, START_HAT_PATH, `H ${w - R}`, `a ${R},${R} 0 0,1 ${R},${R}`);
    }
  } else {
    parts.push(`M 0,${R}`, `A ${R},${R} 0 0,1 ${R},0`);
    if (info.hasPrevious) parts.push(`H ${NOTCH_START_PADDING}`, NOTCH_PATH_LEFT);
    parts.push(`H ${w - R}`, `a ${R},${R} 0 0,1 ${R},${R}`);
  }
  const mouthX = STATEMENT_INPUT_EDGE_WIDTH;
  for (const seg of layout.segments) {
    if (seg.kind === "row") {
      parts.push(`V ${seg.y + seg.height - R}`);
      continue;
    }
    // Mulut C: sudut kanan bawah lengan atas, tab notch ke dalam mulut, sisi dalam, lengan berikutnya.
    parts.push(
      `a ${R},${R} 0 0,1 -${R},${R}`,
      `H ${mouthX + NOTCH_START_PADDING + NOTCH_SPAN}`,
      NOTCH_PATH_RIGHT,
      `H ${mouthX + R}`,
      `a ${R},${R} 0 0,0 -${R},${R}`,
      `V ${seg.y + seg.height - R}`,
      `a ${R},${R} 0 0,0 ${R},${R}`,
      `H ${w - R}`,
      `a ${R},${R} 0 0,1 ${R},${R}`,
    );
  }
  parts.push(`V ${h - R}`, `a ${R},${R} 0 0,1 -${R},${R}`);
  if (info.hasNext) parts.push(`H ${NOTCH_START_PADDING + NOTCH_SPAN}`, NOTCH_PATH_RIGHT);
  parts.push(`H ${R}`, `a ${R},${R} 0 0,1 -${R},-${R}`, "Z");
  return parts.join(" ");
}

export function roundPath(w: number, h: number): string {
  const r = h / 2;
  return `M ${r},0 H ${w - r} a ${r},${r} 0 0,1 0,${h} H ${r} a ${r},${r} 0 0,1 0,-${h} Z`;
}

export function hexagonPath(w: number, h: number): string {
  const r = h / 2;
  return `M ${r},0 H ${w - r} L ${w},${r} L ${w - r},${h} H ${r} L 0,${r} Z`;
}

export function roundedRectPath(w: number, h: number, r = R): string {
  return `M 0,${r} A ${r},${r} 0 0,1 ${r},0 H ${w - r} a ${r},${r} 0 0,1 ${r},${r} V ${h - r} a ${r},${r} 0 0,1 -${r},${r} H ${r} a ${r},${r} 0 0,1 -${r},-${r} Z`;
}

/** Path blok apa pun sesuai bentuknya. */
export function blockPath(layout: BlockLayout): string {
  if (layout.info.output === false) return statementPath(layout);
  return layout.info.outputShape === "hexagon" ? hexagonPath(layout.width, layout.height) : roundPath(layout.width, layout.height);
}

/** Panah dropdown kecil (segitiga) berukuran 12x8 di titik (x, y). */
export function dropdownArrowPath(x: number, y: number): string {
  return `M ${x},${y} l 4,4 l 4,-4`;
}
