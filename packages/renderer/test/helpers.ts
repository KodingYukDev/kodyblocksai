/** Pembantu tes renderer: bitmap padat & renderer headless. */
import { createPixelData } from "../src/pixel-source";
import type { PixelData } from "../src/pixel-source";
import { KodyRenderer } from "../src/renderer-core";

export function solidBitmap(w: number, h: number, rgba: [number, number, number, number]): PixelData {
  const img = createPixelData(w, h);
  for (let i = 0; i < w * h; i++) img.data.set(rgba, i * 4);
  return img;
}

/** Sprite persegi padat dengan resolusi 1 di posisi tertentu. */
export function addSquare(
  r: KodyRenderer,
  size: number,
  rgba: [number, number, number, number],
  position: [number, number] = [0, 0],
  group: "sprite" | "background" | "pen" | "video" = "sprite",
): number {
  const skin = r.createBitmapSkin(solidBitmap(size, size, rgba), 1);
  const id = r.createDrawable(group);
  r.updateDrawableSkinId(id, skin);
  r.updateDrawablePosition(id, position);
  return id;
}

export function headless(): KodyRenderer {
  return new KodyRenderer();
}
