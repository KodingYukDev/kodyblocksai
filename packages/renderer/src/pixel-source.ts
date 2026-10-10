/**
 * Utilitas piksel: data RGBA mentah, kanvas (DOM / OffscreenCanvas), konversi sumber bitmap.
 * Tidak bergantung DOM saat dipakai dengan PixelData, sehingga bisa diuji di Node.
 */

/** Data RGBA 8-bit (bentuk sama dengan ImageData, tanpa butuh kelas DOM). */
export interface PixelData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type Any2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function createPixelData(width: number, height: number, data?: Uint8ClampedArray): PixelData {
  return { width, height, data: data ?? new Uint8ClampedArray(width * height * 4) };
}

export function isPixelData(x: unknown): x is PixelData {
  if (typeof x !== "object" || x === null) return false;
  const o = x as { width?: unknown; height?: unknown; data?: unknown };
  return typeof o.width === "number" && typeof o.height === "number" && o.data instanceof Uint8ClampedArray;
}

/** Ada DOM/OffscreenCanvas untuk menggambar? (false di Node tanpa jsdom-canvas). */
export function canCreateCanvas(): boolean {
  if (typeof OffscreenCanvas !== "undefined") return true;
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return typeof c.getContext === "function" && c.getContext("2d") !== null;
  } catch {
    return false;
  }
}

export function createCanvas(width: number, height: number): AnyCanvas | null {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
  }
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  return null;
}

export function get2d(canvas: AnyCanvas, willReadFrequently = true): Any2DContext | null {
  try {
    return canvas.getContext("2d", { willReadFrequently }) as Any2DContext | null;
  } catch {
    return null;
  }
}

/** Ukuran intrinsik sumber gambar apa pun (BitmapSkin._getBitmapSize). */
export function getSourceSize(src: unknown): [number, number] {
  if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement) {
    return [src.naturalWidth || src.width, src.naturalHeight || src.height];
  }
  if (typeof HTMLVideoElement !== "undefined" && src instanceof HTMLVideoElement) {
    return [src.videoWidth || src.width, src.videoHeight || src.height];
  }
  const o = src as { width?: number; height?: number };
  return [o.width ?? 0, o.height ?? 0];
}

let scratchCanvas: AnyCanvas | null = null;

/**
 * Baca piksel (straight alpha) dari sumber apa pun. PixelData/ImageData dikembalikan apa adanya.
 * Mengembalikan null bila tidak ada kanvas (lingkungan headless) atau sumber kosong.
 */
export function readPixels(src: unknown): PixelData | null {
  if (isPixelData(src)) return src;
  const [width, height] = getSourceSize(src);
  if (!(width > 0 && height > 0)) return null;
  if (!scratchCanvas) scratchCanvas = createCanvas(width, height);
  if (!scratchCanvas) return null;
  scratchCanvas.width = width;
  scratchCanvas.height = height;
  const ctx = get2d(scratchCanvas);
  if (!ctx) return null;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(src as CanvasImageSource, 0, 0, width, height);
  const img = ctx.getImageData(0, 0, width, height);
  return { width: img.width, height: img.height, data: img.data };
}

/** PixelData -> ImageData (butuh kelas ImageData di lingkungan). */
export function toImageData(p: PixelData): ImageData | null {
  if (typeof ImageData !== "undefined" && p instanceof ImageData) return p;
  if (typeof ImageData === "undefined") return null;
  return new ImageData(new Uint8ClampedArray(p.data.buffer, p.data.byteOffset, p.data.length), p.width, p.height);
}
