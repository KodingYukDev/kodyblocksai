/**
 * SVGSkin: costume vektor dirasterisasi per tingkat mip (skala pangkat 2) dengan rotation center
 * dikompensasi offset viewBox. Port scratch-render 1.2.115 `src/SVGSkin.js` (BSD-3-Clause).
 */
import { DISTORTION_EFFECTS_MASK } from "../effect-info";
import { createCanvas, get2d } from "../pixel-source";
import type { AnyCanvas } from "../pixel-source";
import { Skin, makeTexture } from "./skin";
import type { SkinDrawableView, SkinTexture } from "./skin";
import { loadSvgString } from "./svg-loader";

const MAX_TEXTURE_DIMENSION = 2048;
/** Indeks mip 0 = skala 1/256. */
const INDEX_OFFSET = 8;

export class SVGSkin extends Skin {
  readonly kind = "svg" as const;
  private readonly _size: [number, number] = [0, 0];
  private image: HTMLImageElement | null = null;
  private imageLoaded = false;
  private canvas: AnyCanvas | null = null;
  private scaledMIPs: (SkinTexture | null)[] = [];
  private largestMIPScale = 0;
  private maxTextureScale = 1;
  /** Dipanggil setelah gambar SVG selesai dimuat (renderer meminta redraw). */
  onLoad: (() => void) | null = null;
  /** Error parse/muat terakhir (costume tetap kosong, tidak melempar ke VM). */
  lastError: string | null = null;

  get size(): [number, number] {
    return [this._size[0], this._size[1]];
  }

  override useNearest(scale: readonly number[], drawable: SkinDrawableView): boolean {
    if ((drawable.enabledEffects & DISTORTION_EFFECTS_MASK) !== 0) return false;
    if (drawable.direction % 90 !== 0) return false;
    const sx = Math.abs(scale[0] as number);
    const sy = Math.abs(scale[1] as number);
    return sx > 99 && sx < 101 && sy > 99 && sy < 101;
  }

  private createMIP(scale: number): SkinTexture | null {
    const [width, height] = this._size;
    if (!this.canvas) this.canvas = createCanvas(1, 1);
    const canvas = this.canvas;
    const img = this.image;
    if (!canvas || !img) return super.getTexture();
    canvas.width = width * scale;
    canvas.height = height * scale;
    if (canvas.width <= 0 || canvas.height <= 0 || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
      return super.getTexture();
    }
    const ctx = get2d(canvas);
    if (!ctx) return super.getTexture();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = { width: imageData.width, height: imageData.height, data: imageData.data };
    const mip = makeTexture(pixels, pixels.width, pixels.height, false, pixels);
    // Silhouette hanya diperbesar (sama dengan scratch-render).
    if (this.largestMIPScale < scale) {
      this.silhouette.update(pixels);
      this.largestMIPScale = scale;
    }
    return mip;
  }

  override updateSilhouette(scale: readonly number[] = [100, 100]): void {
    this.getTexture(scale);
  }

  override getTexture(scale?: readonly number[]): SkinTexture | null {
    const scaleMax = scale ? Math.max(Math.abs(scale[0] as number), Math.abs(scale[1] as number)) : 100;
    const requestedScale = Math.min(scaleMax / 100, this.maxTextureScale);
    const mipLevel = Math.max(Math.ceil(Math.log2(requestedScale)) + INDEX_OFFSET, 0);
    const mipScale = Math.pow(2, mipLevel - INDEX_OFFSET);
    if (this.imageLoaded && !this.scaledMIPs[mipLevel]) {
      this.scaledMIPs[mipLevel] = this.createMIP(mipScale);
    }
    return this.scaledMIPs[mipLevel] || super.getTexture();
  }

  resetMIPs(): void {
    this.scaledMIPs.length = 0;
    this.largestMIPScale = 0;
  }

  /** Semua mip yang sudah dibuat (backend membuang tekstur GPU lamanya). */
  get mips(): readonly (SkinTexture | null)[] {
    return this.scaledMIPs;
  }

  setSVG(svgData: string, rotationCenter?: readonly number[]): void {
    let loaded;
    try {
      loaded = loadSvgString(svgData);
      this.lastError = null;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.imageLoaded = false;
      this.resetMIPs();
      this._size[0] = 0;
      this._size[1] = 0;
      this.setEmptyImageData();
      return;
    }
    const { x, y, width, height } = loaded.viewBox;
    this.imageLoaded = false;
    // Ukuran diisi sebelum gambar termuat: VM membaca size langsung setelah setSVG.
    this._size[0] = width;
    this._size[1] = height;

    const finish = (): void => {
      if (width === 0 || height === 0) {
        this.setEmptyImageData();
        this.onLoad?.();
        return;
      }
      const maxDimension = Math.ceil(Math.max(width, height));
      for (let testScale = 2; maxDimension * testScale <= MAX_TEXTURE_DIMENSION; testScale *= 2) {
        this.maxTextureScale = testScale;
      }
      this.resetMIPs();
      const center = rotationCenter === undefined ? this.calculateRotationCenter() : rotationCenter;
      this._rotationCenter[0] = (center[0] as number) - x;
      this._rotationCenter[1] = (center[1] as number) - y;
      this.imageLoaded = true;
      this.emitWasAltered();
      this.onLoad?.();
    };

    if (typeof Image === "undefined") {
      // Headless: tidak bisa merasterisasi. Pusat rotasi tetap diatur agar geometri benar.
      const center = rotationCenter === undefined ? this.calculateRotationCenter() : rotationCenter;
      this._rotationCenter[0] = (center[0] as number) - x;
      this._rotationCenter[1] = (center[1] as number) - y;
      this.emitWasAltered();
      return;
    }
    if (!this.image) this.image = new Image();
    const img = this.image;
    // Muat baru menggantikan onload lama (membatalkan muat sebelumnya).
    img.onload = finish;
    img.onerror = () => {
      this.lastError = "SVG image failed to load";
    };
    img.src = `data:image/svg+xml;utf8,${encodeURIComponent(loaded.text)}`;
  }

  override dispose(): void {
    this.resetMIPs();
    if (this.image) {
      this.image.onload = null;
      this.image.onerror = null;
    }
    super.dispose();
  }
}
