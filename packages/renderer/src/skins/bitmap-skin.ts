/**
 * BitmapSkin: costume bitmap dengan bitmapResolution (default 2) dan rotation center.
 * Port scratch-render 1.2.115 `src/BitmapSkin.js` (BSD-3-Clause).
 */
import type { BitmapSource } from "@kody/engine";
import { getSourceSize, isPixelData, readPixels } from "../pixel-source";
import type { PixelData } from "../pixel-source";
import { Skin, makeTexture } from "./skin";
import type { SkinTexture } from "./skin";

export class BitmapSkin extends Skin {
  readonly kind = "bitmap" as const;
  private costumeResolution = 1;
  private textureSize: [number, number] = [0, 0];
  private texture: SkinTexture | null = null;

  get size(): [number, number] {
    return [this.textureSize[0] / this.costumeResolution, this.textureSize[1] / this.costumeResolution];
  }

  override getTexture(): SkinTexture | null {
    return this.texture ?? super.getTexture();
  }

  setBitmap(bitmap: BitmapSource | PixelData, costumeResolution?: number, rotationCenter?: readonly number[]): void {
    const [w, h] = getSourceSize(bitmap);
    if (!w || !h) {
      this.texture = null;
      this.setEmptyImageData();
      return;
    }
    // ImageData/kanvas dibaca sebagai piksel; gambar lain dibaca lewat kanvas bila ada DOM.
    const pixels = readPixels(bitmap);
    const source: PixelData | TexImageSource = pixels ?? (bitmap as TexImageSource);
    this.texture = makeTexture(source, w, h, false, pixels);
    if (pixels) this.silhouette.update(pixels);

    this.costumeResolution = costumeResolution || 2;
    this.textureSize = [w, h];

    const center = rotationCenter === undefined ? this.calculateRotationCenter() : rotationCenter;
    this._rotationCenter[0] = center[0] as number;
    this._rotationCenter[1] = center[1] as number;
    this.emitWasAltered();
  }

  /** true bila sumbernya PixelData langsung (tes headless). */
  get hasPixels(): boolean {
    return this.texture !== null && (this.texture.pixels !== null || isPixelData(this.texture.source));
  }
}
