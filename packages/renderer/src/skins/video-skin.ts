/**
 * VideoSkin: lapisan kamera untuk ekstensi AI. Setara cara scratch-vm video-provider memakai
 * BitmapSkin (frame digambar penuh ke ukuran panggung, opsional dicerminkan, resolusi 1),
 * tetapi silhouette (untuk "menyentuh warna" terhadap video) hanya dibaca saat dibutuhkan.
 */
import type { BitmapSource } from "@kody/engine";
import { createCanvas, get2d, getSourceSize, isPixelData } from "../pixel-source";
import type { AnyCanvas, PixelData } from "../pixel-source";
import { Skin, makeTexture } from "./skin";
import type { SkinTexture } from "./skin";

export type VideoFrame = BitmapSource | HTMLVideoElement | PixelData;

export class VideoSkin extends Skin {
  readonly kind = "video" as const;
  private readonly _size: [number, number];
  private readonly canvas: AnyCanvas | null;
  private texture: SkinTexture | null = null;
  private pixels: PixelData | null = null;
  private silhouetteDirty = true;

  constructor(id: number, nativeSize: readonly [number, number]) {
    super(id);
    this._size = [nativeSize[0], nativeSize[1]];
    this._rotationCenter[0] = nativeSize[0] / 2;
    this._rotationCenter[1] = nativeSize[1] / 2;
    this.canvas = createCanvas(Math.floor(nativeSize[0]), Math.floor(nativeSize[1]));
  }

  get size(): [number, number] {
    return [this._size[0], this._size[1]];
  }

  override getTexture(): SkinTexture | null {
    return this.texture;
  }

  /** Gambar frame baru (diregangkan ke ukuran panggung; mirrored = dibalik horizontal). */
  setFrame(frame: VideoFrame, mirrored: boolean): void {
    const [fw, fh] = getSourceSize(frame);
    if (!fw || !fh) return;
    const w = Math.floor(this._size[0]);
    const h = Math.floor(this._size[1]);
    const first = this.texture === null;
    if (isPixelData(frame)) {
      this.pixels = scalePixels(frame, w, h, mirrored);
      if (first || !this.texture || this.texture.source !== this.pixels) {
        this.texture = makeTexture(this.pixels, w, h, false, this.pixels);
      }
    } else if (this.canvas) {
      const ctx = get2d(this.canvas);
      if (!ctx) return;
      ctx.setTransform(mirrored ? -1 : 1, 0, 0, 1, mirrored ? w : 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(frame as CanvasImageSource, 0, 0, w, h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (!this.texture) this.texture = makeTexture(this.canvas as TexImageSource, w, h, false, null);
      this.texture.revision++;
    } else {
      return;
    }
    this.silhouetteDirty = true;
    if (first) this.emitWasAltered();
  }

  override updateSilhouette(): void {
    if (!this.silhouetteDirty) return;
    this.silhouetteDirty = false;
    if (this.pixels) {
      this.silhouette.update(this.pixels);
      return;
    }
    if (!this.canvas) return;
    const ctx = get2d(this.canvas);
    if (!ctx) return;
    const img = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.silhouette.update({ width: img.width, height: img.height, data: img.data });
  }

  /** Piksel frame terakhir (untuk stamp/sampel CPU). */
  currentPixels(): PixelData | null {
    this.updateSilhouette();
    if (this.pixels) return this.pixels;
    if (!this.canvas) return null;
    const ctx = get2d(this.canvas);
    if (!ctx) return null;
    const img = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    return { width: img.width, height: img.height, data: img.data };
  }
}

/** Skala nearest-neighbor + cermin opsional untuk PixelData (jalur headless). */
function scalePixels(src: PixelData, w: number, h: number, mirrored: boolean): PixelData {
  if (src.width === w && src.height === h && !mirrored) return src;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y * src.height) / h));
    for (let x = 0; x < w; x++) {
      const tx = mirrored ? w - 1 - x : x;
      const sx = Math.min(src.width - 1, Math.floor((tx * src.width) / w));
      const si = (sy * src.width + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = src.data[si] as number;
      out[di + 1] = src.data[si + 1] as number;
      out[di + 2] = src.data[si + 2] as number;
      out[di + 3] = src.data[si + 3] as number;
    }
  }
  return { width: w, height: h, data: out };
}
