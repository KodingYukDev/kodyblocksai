/**
 * Keputusan tata letak shell.
 * - "wide"  (>= 1024 px, atau layar landscape pendek >= 600 px): seperti Scratch, kode kiri, panggung kanan.
 * - "split" (600..1023 px, tinggi >= 600: tablet potret): baris atas [panggung | panel sprite], kode di bawah.
 * - "phone" (< 600 px): panggung di atas, kode di bawah, panel sprite pindah ke tab "Sprite".
 * Tidak ada mode yang membuat halaman menggulir; panggung diperkecil bila ruang tidak cukup.
 */
import type { StageSizeMode } from "../app-events";
import {
  FULL_SIZE_MIN_WIDTH,
  getStageDimensions,
  resolveStageSize,
  STACK_BREAKPOINT,
  type StageDimensions,
  type StageDisplaySize,
} from "../stage-pane/stage-geometry";
import { STAGE_HEIGHT, STAGE_WIDTH } from "@kody/engine";

/** Padding body shell kiri+kanan (px), harus sama dengan CSS .kb-shell__body. */
export const SHELL_HORIZONTAL_PADDING = 16;
/** Border panggung kiri+kanan (1px, content-box). */
export const STAGE_BORDER = 2;
export const MENU_BAR_HEIGHT = 48;
export const STAGE_HEADER_HEIGHT = 44;
/** Jarak antar-panel (0.5rem) = padding bawah body. */
export const GAP = 8;
/** Tinggi baris tombol panah/spasi di layar (termasuk jarak). */
export const KEYPAD_HEIGHT = 60;
/** Tinggi minimum panel sprite agar info + satu baris sprite muat. */
export const MIN_TARGET_PANE_HEIGHT = 200;
/** Lebar minimum area kode di tata letak lebar (palet + sedikit ruang kerja). */
export const MIN_EDITOR_WIDTH = 400;
/** Lebar di bawah ini memakai tata letak ponsel. */
export const PHONE_BREAKPOINT = 600;
/** Tablet potret butuh tinggi minimal ini untuk tata letak split. */
export const SPLIT_MIN_HEIGHT = 600;
/** Panggung tidak diperkecil di bawah lebar ini (kecuali layar memang lebih sempit). */
export const MIN_STAGE_WIDTH = 160;

export type ShellMode = "wide" | "split" | "phone";

export interface ShellLayout {
  mode: ShellMode;
  /** Panggung di atas area kode (split / phone). */
  stacked: boolean;
  /** Panel sprite dipindah ke tab editor karena tidak muat di samping/bawah panggung. */
  spritesInTab: boolean;
  displaySize: StageDisplaySize;
  dims: StageDimensions;
  /** Info sprite versi ringkas (panel sempit). */
  compactSpriteInfo: boolean;
  /** Lebar kolom panggung (px) pada tata letak lebar. */
  stageColumnWidth: number;
  /** Tinggi baris atas (header + panggung + keypad) pada split/phone. */
  topRowHeight: number;
}

export interface LayoutOptions {
  /** Tombol panah/spasi di layar sedang tampil di bawah panggung. */
  keypad?: boolean;
}

const dimsFromWidth = (width: number): StageDimensions => {
  const w = Math.max(1, Math.round(width));
  return { width: w, height: Math.round(w * 0.75), scale: w / STAGE_WIDTH, widthDefault: STAGE_WIDTH, heightDefault: STAGE_HEIGHT };
};

/** Panggung terbesar (4:3) yang muat di kotak maxW x maxH, tidak melebihi `cap`. */
const fitStage = (maxW: number, maxH: number, cap: number): StageDimensions =>
  dimsFromWidth(Math.max(1, Math.min(cap, maxW, Math.floor((maxH * 4) / 3))));

export function getShellMode(viewport: { width: number; height: number }): ShellMode {
  if (viewport.width < PHONE_BREAKPOINT) return "phone";
  if (viewport.width >= STACK_BREAKPOINT || viewport.height < SPLIT_MIN_HEIGHT) return "wide";
  return "split";
}

export function computeShellLayout(
  viewport: { width: number; height: number },
  mode: StageSizeMode,
  opts: LayoutOptions = {},
): ShellLayout {
  const shellMode = getShellMode(viewport);
  const keypadH = opts.keypad ? KEYPAD_HEIGHT : 0;
  const toggle = mode === "small" ? "small" : "large";
  const displaySize = resolveStageSize(toggle, viewport.width >= FULL_SIZE_MIN_WIDTH);
  const small = toggle === "small";
  const availW = viewport.width - SHELL_HORIZONTAL_PADDING;
  const availH = viewport.height - MENU_BAR_HEIGHT - STAGE_HEADER_HEIGHT - GAP - keypadH;

  if (mode === "fullscreen") {
    const dims = getStageDimensions(displaySize, true, { width: viewport.width, height: viewport.height - keypadH });
    return {
      mode: shellMode,
      stacked: shellMode !== "wide",
      spritesInTab: shellMode === "phone",
      displaySize,
      dims,
      compactSpriteInfo: false,
      stageColumnWidth: dims.width + STAGE_BORDER,
      topRowHeight: 0,
    };
  }

  if (shellMode === "wide") {
    const scratch = getStageDimensions(displaySize, false, viewport);
    let maxW = Math.max(MIN_STAGE_WIDTH, availW - GAP - MIN_EDITOR_WIDTH - STAGE_BORDER);
    let spritesInTab = false;
    let maxH = availH - STAGE_BORDER - GAP - MIN_TARGET_PANE_HEIGHT;
    if (maxH < 150) {
      // Layar pendek (ponsel landscape): panggung saja di kolom kanan, panel sprite pindah ke tab,
      // dan area kode tetap mendapat lebih dari separuh lebar.
      spritesInTab = true;
      maxH = availH - STAGE_BORDER;
      maxW = Math.max(MIN_STAGE_WIDTH, Math.min(maxW, Math.floor(availW * 0.42)));
    }
    const dims =
      scratch.width <= maxW && scratch.height <= maxH ? scratch : fitStage(maxW, maxH, small ? scratch.width : STAGE_WIDTH);
    return {
      mode: "wide",
      stacked: false,
      spritesInTab,
      displaySize,
      dims,
      compactSpriteInfo: !spritesInTab && dims.width < 320,
      stageColumnWidth: Math.max(dims.width + STAGE_BORDER, 240),
      topRowHeight: 0,
    };
  }

  if (shellMode === "split") {
    const maxW = Math.floor((availW - GAP) * 0.58) - STAGE_BORDER;
    const maxH = Math.floor((availH - STAGE_BORDER) * 0.45);
    const normal = fitStage(maxW, maxH, STAGE_WIDTH);
    const dims = small ? dimsFromWidth(Math.max(Math.min(MIN_STAGE_WIDTH * 1.5, normal.width), normal.width / 2)) : normal;
    const paneWidth = availW - GAP - dims.width - STAGE_BORDER;
    return {
      mode: "split",
      stacked: true,
      spritesInTab: false,
      displaySize,
      dims,
      compactSpriteInfo: paneWidth < 300,
      stageColumnWidth: availW,
      topRowHeight: STAGE_HEADER_HEIGHT + dims.height + STAGE_BORDER + keypadH,
    };
  }

  // Ponsel: selebar layar, tinggi panggung paling banyak ~40% agar area kode tetap lega.
  const maxW = availW - STAGE_BORDER;
  const maxH = Math.floor((availH - STAGE_BORDER) * 0.42);
  const normal = fitStage(maxW, maxH, STAGE_WIDTH);
  const dims = small ? dimsFromWidth(Math.max(Math.min(MIN_STAGE_WIDTH, normal.width), normal.width / 2)) : normal;
  return {
    mode: "phone",
    stacked: true,
    spritesInTab: true,
    displaySize,
    dims,
    // Di tab "Sprite" ada ruang penuh: info sprite lengkap.
    compactSpriteInfo: false,
    stageColumnWidth: availW,
    topRowHeight: STAGE_HEADER_HEIGHT + dims.height + STAGE_BORDER + keypadH,
  };
}

/** Mode yang dipulihkan saat keluar layar penuh. */
export function nextSizeMode(current: StageSizeMode, requested: StageSizeMode, lastWindowed: StageSizeMode): StageSizeMode {
  if (current === "fullscreen" && requested !== "fullscreen") {
    return lastWindowed === "fullscreen" ? "normal" : lastWindowed;
  }
  return requested;
}
