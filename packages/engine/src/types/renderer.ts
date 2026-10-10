/**
 * Antarmuka renderer yang DIPAKAI engine. Diimplementasikan oleh packages/renderer.
 * Meniru permukaan API scratch-render yang dipanggil scratch-vm (RenderedTarget, pen, looks),
 * tetapi koordinat titik selalu koordinat panggung Scratch (x kanan, y atas, pusat 0,0).
 */

/** Kotak batas dalam koordinat panggung (top > bottom). */
export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** RGB 0-255, sama seperti Cast.toRgbColorList. */
export type RGB = readonly [number, number, number];
export type RGBA = readonly [number, number, number, number];

/** Grup layer persis StageLayering scratch-vm. Urutan bawah ke atas. */
export type DrawableGroup = "background" | "video" | "pen" | "sprite";
export const LAYER_GROUPS: readonly DrawableGroup[] = ["background", "video", "pen", "sprite"];

/** Efek grafis Scratch. Nilai = nilai blok (renderer yang menormalisasi untuk shader). */
export type GraphicEffect = "color" | "fisheye" | "whirl" | "pixelate" | "mosaic" | "brightness" | "ghost";
export const GRAPHIC_EFFECTS: readonly GraphicEffect[] = [
  "color",
  "fisheye",
  "whirl",
  "pixelate",
  "mosaic",
  "brightness",
  "ghost",
];

/** Atribut pena: color4f RGBA 0..1, diameter piksel panggung. Sama dengan scratch-render PenSkin. */
export interface PenAttributes {
  color4f: [number, number, number, number];
  diameter: number;
}

export type BubbleType = "say" | "think";

export type BitmapSource = ImageBitmap | ImageData | HTMLCanvasElement | HTMLImageElement;

export interface DrawableProperties {
  position?: [number, number];
  /** Arah Scratch (derajat, 90 = kanan) SETELAH rotationStyle diterapkan engine. */
  direction?: number;
  /** Skala persen [sx, sy]; sx negatif untuk flip left-right. */
  scale?: [number, number];
  visible?: boolean;
  skinId?: number;
}

export interface IRenderer {
  // --- panggung ---
  /** Ukuran logis panggung, default 480x360. */
  getNativeSize(): [number, number];
  /** Ukuran kanvas CSS. */
  resize(pixelsWide: number, pixelsTall: number): void;
  setLayerGroupOrdering(groups: readonly DrawableGroup[]): void;
  draw(): void;

  // --- skin (costume, balon, pena) ---
  createBitmapSkin(bitmap: BitmapSource, bitmapResolution: number, rotationCenter?: [number, number]): number;
  createSVGSkin(svg: string, rotationCenter?: [number, number]): number;
  updateBitmapSkin(
    skinId: number,
    bitmap: BitmapSource,
    bitmapResolution: number,
    rotationCenter?: [number, number],
  ): void;
  updateSVGSkin(skinId: number, svg: string, rotationCenter?: [number, number]): void;
  createTextSkin(type: BubbleType, text: string, pointsLeft: boolean): number;
  updateTextSkin(skinId: number, type: BubbleType, text: string, pointsLeft: boolean): void;
  createPenSkin(): number;
  destroySkin(skinId: number): void;
  getSkinSize(skinId: number): [number, number];
  getSkinRotationCenter(skinId: number): [number, number];

  // --- drawable ---
  createDrawable(group: DrawableGroup): number;
  destroyDrawable(drawableId: number, group: DrawableGroup): void;
  /**
   * Atur urutan layer di dalam grup, sama seperti scratch-render setDrawableOrder:
   * isRelative=true berarti order adalah delta; optMin = indeks minimum di grup.
   * Mengembalikan indeks baru, atau null kalau drawable tidak ada.
   */
  setDrawableOrder(
    drawableId: number,
    order: number,
    group: DrawableGroup,
    isRelative?: boolean,
    optMin?: number,
  ): number | null;
  getDrawableOrder(drawableId: number): number;
  updateDrawableSkinId(drawableId: number, skinId: number): void;
  updateDrawablePosition(drawableId: number, position: [number, number]): void;
  updateDrawableDirectionScale(drawableId: number, direction: number, scale: [number, number]): void;
  updateDrawableVisible(drawableId: number, visible: boolean): void;
  updateDrawableEffect(drawableId: number, effect: GraphicEffect, value: number): void;
  updateDrawableProperties(drawableId: number, props: DrawableProperties): void;

  // --- geometri & tabrakan (motion/sensing/looks) ---
  /** Bounds ketat (convex hull ter-transformasi) persis scratch-render getBounds. */
  getBounds(drawableId: number): Rect | null;
  /** Bounds untuk penempatan balon (getBoundsForBubble). */
  getBoundsForBubble(drawableId: number): Rect | null;
  /** AABB kasar (getAABB). */
  getAABB(drawableId: number): Rect | null;
  getCurrentSkinSize(drawableId: number): [number, number];
  /** Posisi setelah fencing (keepInFence scratch-vm + getFencedPositionOfDrawable scratch-render). */
  getFencedPositionOfDrawable(drawableId: number, position: [number, number]): [number, number];
  isTouchingDrawables(drawableId: number, candidateIds?: readonly number[]): boolean;
  isTouchingColor(drawableId: number, color: RGB, mask?: RGB): boolean;
  /** Apakah titik panggung (x,y) menyentuh piksel buram drawable. */
  isTouchingPoint(drawableId: number, stageX: number, stageY: number): boolean;
  /** Drawable teratas di titik panggung, atau -1. */
  pick(
    stageX: number,
    stageY: number,
    touchWidth?: number,
    touchHeight?: number,
    candidateIds?: readonly number[],
  ): number;
  /** Warna di titik panggung. */
  sampleColor(stageX: number, stageY: number): RGBA;

  // --- pena ---
  penClear(penSkinId: number): void;
  penPoint(penSkinId: number, attrs: PenAttributes, x: number, y: number): void;
  penLine(penSkinId: number, attrs: PenAttributes, x0: number, y0: number, x1: number, y1: number): void;
  penStamp(penSkinId: number, stampDrawableId: number): void;

  // --- video (lapisan kamera untuk AI) ---
  /** Pasang frame video ke lapisan "video". null = sembunyikan. transparency 0..100. */
  setVideoFrame?(frame: BitmapSource | HTMLVideoElement | null, transparency: number, mirrored: boolean): void;

  /** Snapshot panggung (PNG data URL) untuk thumbnail dan AI "dari panggung". */
  snapshot?(): Promise<string>;
}
