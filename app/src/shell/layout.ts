/** Keputusan tata letak shell (lebar >= 1024 seperti Scratch; di bawahnya panggung ditumpuk di atas kode). */
import type { StageSizeMode } from "../app-events";
import {
  FULL_SIZE_MIN_WIDTH,
  getStackedStageDimensions,
  getStageDimensions,
  resolveStageSize,
  STACK_BREAKPOINT,
  type StageDimensions,
  type StageDisplaySize,
} from "../stage-pane/stage-geometry";

/** Padding body shell kiri+kanan (px), harus sama dengan CSS .kb-shell__body. */
export const SHELL_HORIZONTAL_PADDING = 16;
/** Border panggung kiri+kanan (1px, content-box). */
export const STAGE_BORDER = 2;

export interface ShellLayout {
  stacked: boolean;
  displaySize: StageDisplaySize;
  dims: StageDimensions;
  /** Info sprite versi ringkas (panggung kecil). */
  compactSpriteInfo: boolean;
  /** Lebar kolom panggung (px) pada tata letak lebar. */
  stageColumnWidth: number;
}

export function computeShellLayout(viewport: { width: number; height: number }, mode: StageSizeMode): ShellLayout {
  const stacked = viewport.width < STACK_BREAKPOINT;
  const toggle = mode === "small" ? "small" : "large";
  const displaySize = resolveStageSize(toggle, viewport.width >= FULL_SIZE_MIN_WIDTH);
  let dims: StageDimensions;
  if (mode === "fullscreen") {
    dims = getStageDimensions(displaySize, true, viewport);
  } else if (stacked) {
    dims = getStackedStageDimensions(toggle, viewport.width - SHELL_HORIZONTAL_PADDING - STAGE_BORDER);
  } else {
    dims = getStageDimensions(displaySize, false, viewport);
  }
  return {
    stacked,
    displaySize,
    dims,
    compactSpriteInfo: !stacked && displaySize === "small",
    stageColumnWidth: stacked ? viewport.width - SHELL_HORIZONTAL_PADDING : Math.max(dims.width + STAGE_BORDER, 240),
  };
}

/** Mode yang dipulihkan saat keluar layar penuh. */
export function nextSizeMode(current: StageSizeMode, requested: StageSizeMode, lastWindowed: StageSizeMode): StageSizeMode {
  if (current === "fullscreen" && requested !== "fullscreen") {
    return lastWindowed === "fullscreen" ? "normal" : lastWindowed;
  }
  return requested;
}
