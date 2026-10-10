/** Antarmuka backend gambar (WebGL / Canvas2D / headless). Logika geometri tetap di RendererCore. */
import type { Drawable } from "../drawable";

export interface FrameInfo {
  /** Drawable urut bawah -> atas (sudah termasuk yang tersembunyi; backend memfilter visible). */
  readonly drawables: readonly Drawable[];
  readonly nativeSize: readonly [number, number];
  readonly xLeft: number;
  readonly xRight: number;
  readonly yBottom: number;
  readonly yTop: number;
  /** RGBA 0..1. */
  readonly backgroundColor4f: readonly [number, number, number, number];
}

export interface RenderBackend {
  readonly kind: "webgl" | "canvas2d" | "headless";
  /** Ukuran buffer gambar dalam piksel perangkat. */
  setBufferSize(width: number, height: number): void;
  getBufferSize(): [number, number];
  drawFrame(frame: FrameInfo): void;
  /** PNG data URL dari isi kanvas saat ini (panggil langsung setelah drawFrame). */
  toDataURL(): string | null;
  dispose(): void;
}

/** Skala drawable dalam ruang piksel framebuffer (RenderWebGL._drawThese). */
export function framebufferScale(
  drawable: Drawable,
  nativeSize: readonly [number, number],
  fbWidth: number,
  fbHeight: number,
): [number, number] {
  const differs = fbWidth !== nativeSize[0] && fbHeight !== nativeSize[1];
  const s = drawable.scale;
  return differs ? [(s[0] * fbWidth) / nativeSize[0], (s[1] * fbHeight) / nativeSize[1]] : s;
}

export class HeadlessBackend implements RenderBackend {
  readonly kind = "headless" as const;
  private size: [number, number] = [480, 360];
  setBufferSize(width: number, height: number): void {
    this.size = [width, height];
  }
  getBufferSize(): [number, number] {
    return [this.size[0], this.size[1]];
  }
  drawFrame(): void {}
  toDataURL(): string | null {
    return null;
  }
  dispose(): void {}
}
