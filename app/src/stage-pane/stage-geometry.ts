/**
 * Ukuran panggung & konversi koordinat. Port perilaku scratch-gui lib/layout-constants.js,
 * lib/screen-utils.js, dan containers/stage.jsx (getScratchCoords). Lihat THIRD_PARTY.md.
 */
import { STAGE_HEIGHT, STAGE_WIDTH } from "@kody/engine";

/** Tombol ukuran panggung (STAGE_SIZE_MODES). */
export type StageSizeToggle = "large" | "small";
/** Ukuran tampil yang sudah diresolusikan (STAGE_DISPLAY_SIZES). */
export type StageDisplaySize = "large" | "largeConstrained" | "small";

export const STAGE_DISPLAY_SCALES: Record<StageDisplaySize, number> = {
  large: 1,
  largeConstrained: 0.85,
  small: 0.5,
};

/** layout.fullSizeMinWidth scratch-gui. */
export const FULL_SIZE_MIN_WIDTH = 1096;
/** Di bawah lebar ini, panggung ditumpuk di atas area kode (tanpa scroll horizontal). */
export const STACK_BREAKPOINT = 1024;
/** STAGE_DIMENSION_DEFAULTS scratch-gui. */
export const MENU_HEIGHT_ADJUSTMENT = 44;
export const FULLSCREEN_SPACING_BORDER_ADJUSTMENT = 12;

export interface StageDimensions {
  width: number;
  height: number;
  scale: number;
  widthDefault: number;
  heightDefault: number;
}

export function resolveStageSize(mode: StageSizeToggle, isFullSize: boolean): StageDisplaySize {
  if (mode === "small") return "small";
  return isFullSize ? "large" : "largeConstrained";
}

export interface Viewport {
  width: number;
  height: number;
}

/** Persis getStageDimensions scratch-gui (dibulatkan agar tidak buram). */
export function getStageDimensions(size: StageDisplaySize, isFullScreen: boolean, viewport: Viewport): StageDimensions {
  const dims: StageDimensions = {
    widthDefault: STAGE_WIDTH,
    heightDefault: STAGE_HEIGHT,
    width: 0,
    height: 0,
    scale: 0,
  };
  if (isFullScreen) {
    dims.height = viewport.height - MENU_HEIGHT_ADJUSTMENT - FULLSCREEN_SPACING_BORDER_ADJUSTMENT;
    dims.width = dims.height + dims.height / 3;
    if (dims.width > viewport.width) {
      dims.width = viewport.width;
      dims.height = dims.width * 0.75;
    }
    dims.scale = dims.width / dims.widthDefault;
  } else {
    dims.scale = STAGE_DISPLAY_SCALES[size];
    dims.height = dims.scale * dims.heightDefault;
    dims.width = dims.scale * dims.widthDefault;
  }
  dims.height = Math.round(dims.height);
  dims.width = Math.round(dims.width);
  return dims;
}

/**
 * Dimensi panggung untuk tata letak tumpuk (layar kecil): selebar wadah, maksimal ukuran normal
 * (atau setengahnya di mode kecil), rasio 4:3 tetap.
 */
export function getStackedStageDimensions(mode: StageSizeToggle, containerWidth: number): StageDimensions {
  const cap = mode === "small" ? STAGE_WIDTH * STAGE_DISPLAY_SCALES.small : STAGE_WIDTH;
  const width = Math.max(1, Math.round(Math.min(cap, containerWidth)));
  const height = Math.round(width * 0.75);
  return { width, height, scale: width / STAGE_WIDTH, widthDefault: STAGE_WIDTH, heightDefault: STAGE_HEIGHT };
}

/** stageSizeToTransform: undefined bila skala 1 (scratch-gui tidak memasang transform). */
export function stageSizeToTransform(d: StageDimensions): string | undefined {
  const sx = d.width / d.widthDefault;
  const sy = d.height / d.heightDefault;
  if (sx === 1 && sy === 1) return undefined;
  return `scale(${sx},${sy})`;
}

/**
 * Koordinat relatif kanvas (px CSS) -> koordinat "scratch" scratch-gui getScratchCoords.
 * Catatan: y yang dihasilkan masih terbalik (positif ke bawah), sama seperti aslinya.
 */
export function getScratchCoords(
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
  nativeSize: readonly [number, number] = [STAGE_WIDTH, STAGE_HEIGHT],
): [number, number] {
  return [(nativeSize[0] / rectWidth) * (x - rectWidth / 2), (nativeSize[1] / rectHeight) * (y - rectHeight / 2)];
}

/** Titik kanvas (px CSS) -> koordinat panggung Scratch (y ke atas), untuk IRenderer.pick. */
export function canvasToStagePoint(x: number, y: number, rectWidth: number, rectHeight: number): [number, number] {
  const [sx, sy] = getScratchCoords(x, y, rectWidth, rectHeight);
  return [sx, -sy];
}

/** Ambang drag sprite di panggung (sama dengan ambang drag blok). */
export const DRAG_THRESHOLD = 3;
/** Tahan mouse 400 ms memulai drag walau belum bergerak. */
export const DRAG_HOLD_MS = 400;

export function exceedsDragThreshold(a: readonly [number, number], b: readonly [number, number]): boolean {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) > DRAG_THRESHOLD;
}

/** Offset drag persis onStartDrag scratch-gui. */
export function computeDragOffset(
  targetX: number,
  targetY: number,
  scratchMouse: readonly [number, number],
): [number, number] {
  return [targetX - scratchMouse[0], -(targetY + scratchMouse[1])];
}

/** Posisi sprite saat diseret, persis onMouseMove scratch-gui. */
export function dragPosition(scratchMouse: readonly [number, number], offset: readonly [number, number]): { x: number; y: number } {
  return { x: scratchMouse[0] + offset[0], y: -(scratchMouse[1] + offset[1]) };
}
