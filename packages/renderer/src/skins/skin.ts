/**
 * Skin dasar (scratch-render Skin): gambar yang dipasang ke drawable + silhouette CPU.
 * Port struktur scratch-render 1.2.115 `src/Skin.js` (BSD-3-Clause). Bagian GPU dipisah:
 * skin hanya menyediakan `SkinTexture` (piksel/gambar), backend yang mengunggahnya.
 */
import type { Rect } from "@kody/engine";
import { createPixelData } from "../pixel-source";
import type { PixelData } from "../pixel-source";
import { Silhouette } from "../silhouette";

/** Satu tekstur yang siap diunggah backend. Objek yang sama = tekstur yang sama (di-cache backend). */
export interface SkinTexture {
  /** PixelData (RGBA) atau sumber gambar DOM (kanvas, video, ImageBitmap). */
  readonly source: PixelData | TexImageSource;
  readonly width: number;
  readonly height: number;
  /** true bila RGB sudah dikalikan alpha (data pena). Selain itu backend mengalikan saat unggah. */
  readonly premultiplied: boolean;
  /** Naik setiap isi berubah di tempat (pena, video) agar backend mengunggah ulang. */
  revision: number;
  /** Piksel CPU untuk stamp/sampling bila tersedia. */
  readonly pixels: PixelData | null;
}

export type SkinKind = "bitmap" | "svg" | "pen" | "text" | "video";

/** Bagian drawable yang dibutuhkan skin (hindari impor melingkar). */
export interface SkinDrawableView {
  readonly enabledEffects: number;
  readonly direction: number;
  getAABB(result?: import("../rectangle").Rectangle): Rect;
}

export function makeTexture(
  source: PixelData | TexImageSource,
  width: number,
  height: number,
  premultiplied: boolean,
  pixels: PixelData | null,
): SkinTexture {
  return { source, width, height, premultiplied, revision: 0, pixels };
}

let emptyPixels: PixelData | null = null;

export abstract class Skin {
  abstract readonly kind: SkinKind;
  private _id: number;
  /** Float32 seperti twgl.v3 di scratch-render (presisi transformasi ikut sama). */
  protected readonly _rotationCenter = new Float32Array(3);
  readonly silhouette = new Silhouette();
  protected emptyTexture: SkinTexture | null = null;
  private readonly listeners = new Set<() => void>();
  /** Naik setiap WasAltered; dipakai backend Canvas2D untuk cache efek. */
  version = 0;

  constructor(id: number) {
    this._id = id;
  }

  get id(): number {
    return this._id;
  }

  get rotationCenter(): Float32Array {
    return this._rotationCenter;
  }

  abstract get size(): [number, number];

  useNearest(_scale: readonly number[], _drawable: SkinDrawableView): boolean {
    return true;
  }

  calculateRotationCenter(): [number, number] {
    const size = this.size;
    return [size[0] / 2, size[1] / 2];
  }

  /** Tekstur untuk skala tertentu, atau null bila belum siap (drawable dilewati saat menggambar). */
  getTexture(_scale?: readonly number[]): SkinTexture | null {
    return this.emptyTexture;
  }

  getFenceBounds(drawable: SkinDrawableView, result?: import("../rectangle").Rectangle): Rect {
    return drawable.getAABB(result);
  }

  updateSilhouette(_scale?: readonly number[]): void {}

  isTouchingNearest(vec: ArrayLike<number>): boolean {
    return this.silhouette.isTouchingNearest(vec);
  }

  isTouchingLinear(vec: ArrayLike<number>): boolean {
    return this.silhouette.isTouchingLinear(vec);
  }

  /** Gambar kosong 1x1 transparan (Skin.setEmptyImageData). */
  protected setEmptyImageData(): void {
    if (!emptyPixels) emptyPixels = createPixelData(1, 1);
    if (!this.emptyTexture) this.emptyTexture = makeTexture(emptyPixels, 1, 1, false, emptyPixels);
    this._rotationCenter[0] = 0;
    this._rotationCenter[1] = 0;
    this.silhouette.update(emptyPixels);
    this.emitWasAltered();
  }

  onWasAltered(listener: () => void): void {
    this.listeners.add(listener);
  }

  offWasAltered(listener: () => void): void {
    this.listeners.delete(listener);
  }

  protected emitWasAltered(): void {
    this.version++;
    for (const l of [...this.listeners]) l();
  }

  dispose(): void {
    this._id = -1;
    this.listeners.clear();
  }
}
