/**
 * Matematika scroll & zoom workspace (murni). Perilaku WorkspaceSvg scratch-blocks:
 * zoom(x, y, amount) dengan scaleSpeed 1.2 dan batas min 0.3 / max 3 (options.js),
 * startScale 0.675 (scratch-gui BLOCKS_DEFAULT_SCALE), batas scroll = konten + setengah layar
 * (getContentDimensionsBounded_), wheel = scroll, ctrl+wheel = zoom (50 px per langkah).
 * Koordinat layar = koordinat workspace * scale + scroll.
 */
export const ZOOM_OPTIONS = {
  startScale: 0.675,
  maxScale: 3,
  minScale: 0.3,
  scaleSpeed: 1.2,
} as const;

export const PIXELS_PER_ZOOM_STEP = 50;
export const LINE_SCROLL_MULTIPLIER = 15;

export interface Viewport {
  scrollX: number;
  scrollY: number;
  scale: number;
  viewWidth: number;
  viewHeight: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function toWorkspace(v: Viewport, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - v.scrollX) / v.scale, y: (sy - v.scrollY) / v.scale };
}

export function toScreen(v: Viewport, wx: number, wy: number): { x: number; y: number } {
  return { x: wx * v.scale + v.scrollX, y: wy * v.scale + v.scrollY };
}

export function clampScale(scale: number): number {
  return Math.min(ZOOM_OPTIONS.maxScale, Math.max(ZOOM_OPTIONS.minScale, scale));
}

/** Batas konten dalam piksel (getContentDimensionsBounded_). content dalam unit workspace. */
export function boundedContent(v: Viewport, content: Rect): Rect {
  const c = { left: content.left * v.scale, right: content.right * v.scale, top: content.top * v.scale, bottom: content.bottom * v.scale };
  const halfW = v.viewWidth / 2;
  const halfH = v.viewHeight / 2;
  return {
    left: Math.min(c.left - halfW, c.right - v.viewWidth),
    right: Math.max(c.right + halfW, c.left + v.viewWidth),
    top: Math.min(c.top - halfH, c.bottom - v.viewHeight),
    bottom: Math.max(c.bottom + halfH, c.top + v.viewHeight),
  };
}

/** Batasi scroll agar tampilan tetap di area konten berbatas. */
export function clampScroll(v: Viewport, content: Rect): Viewport {
  const b = boundedContent(v, content);
  const minX = -(b.right - v.viewWidth);
  const maxX = -b.left;
  const minY = -(b.bottom - v.viewHeight);
  const maxY = -b.top;
  return {
    ...v,
    scrollX: Math.min(maxX, Math.max(minX, v.scrollX)),
    scrollY: Math.min(maxY, Math.max(minY, v.scrollY)),
  };
}

/** Zoom di sekitar titik layar (cx, cy) sebanyak `amount` langkah (positif = membesar). */
export function zoomAt(v: Viewport, cx: number, cy: number, amount: number): Viewport {
  const scale = clampScale(v.scale * Math.pow(ZOOM_OPTIONS.scaleSpeed, amount));
  if (scale === v.scale) return v;
  const ws = toWorkspace(v, cx, cy);
  return { ...v, scale, scrollX: cx - ws.x * scale, scrollY: cy - ws.y * scale };
}

/** Tombol "=": kembali ke startScale lalu pusatkan konten (scrollCenter). */
export function resetZoom(v: Viewport, content: Rect): Viewport {
  const scaled = { ...v, scale: ZOOM_OPTIONS.startScale };
  const b = boundedContent(scaled, content);
  const viewLeft = b.left + (b.right - b.left - v.viewWidth) / 2;
  const viewTop = b.top + (b.bottom - b.top - v.viewHeight) / 2;
  return { ...scaled, scrollX: -viewLeft, scrollY: -viewTop };
}

export interface WheelInput {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  /** Posisi pointer relatif area workspace. */
  x: number;
  y: number;
}

/** onMouseWheel_: ctrl = zoom, shift = scroll horizontal, selain itu scroll. */
export function applyWheel(v: Viewport, e: WheelInput, content: Rect): Viewport {
  const mult = e.deltaMode === 1 ? LINE_SCROLL_MULTIPLIER : 1;
  if (e.ctrlKey) {
    return clampScroll(zoomAt(v, e.x, e.y, (-e.deltaY / PIXELS_PER_ZOOM_STEP) * mult), content);
  }
  let x = v.scrollX - e.deltaX * mult;
  let y = v.scrollY - e.deltaY * mult;
  if (e.shiftKey && e.deltaX === 0) {
    x = v.scrollX - e.deltaY * mult;
    y = v.scrollY;
  }
  return clampScroll({ ...v, scrollX: x, scrollY: y }, content);
}
