/**
 * Tipe renderer. Antarmuka yang dipakai engine (IRenderer) didefinisikan di @kody/engine
 * agar engine tidak bergantung pada paket ini; paket ini MENGIMPLEMENTASIKANNYA.
 */
export type {
  BitmapSource,
  BubbleType,
  DrawableGroup,
  DrawableProperties,
  GraphicEffect,
  IRenderer,
  PenAttributes,
  Rect,
  RGB,
  RGBA,
} from "@kody/engine";

export type { EffectUniforms } from "./effect-info";
export type { PixelData } from "./pixel-source";

export type BackendChoice = "auto" | "webgl" | "canvas2d" | "headless";

export interface RendererOptions {
  /** Kanvas panggung. Boleh kosong untuk headless. */
  canvas?: HTMLCanvasElement | null;
  /** Batas panggung Scratch, default -240, 240, -180, 180. */
  xLeft?: number;
  xRight?: number;
  yBottom?: number;
  yTop?: number;
  /** Dipakai tes: renderer tanpa gambar (hanya geometri/tabrakan CPU). */
  headless?: boolean;
  /** Pilihan backend; "auto" = WebGL lalu Canvas2D. */
  backend?: BackendChoice;
  /** Dipanggil saat costume SVG selesai dimuat (minta redraw). */
  onAsyncLoad?: () => void;
  /** Atur canvas.style.width/height saat resize (default true). */
  setCssSize?: boolean;
}
