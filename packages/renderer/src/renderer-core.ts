/**
 * KodyRenderer: implementasi IRenderer (padanan scratch-render RenderWebGL). Semua geometri,
 * tabrakan, pena, dan layer dikerjakan di sini (CPU, deterministik); backend hanya menggambar.
 * Struktur API dan aturan skin/drawable mengikuti scratch-render 1.2.115 (BSD-3-Clause).
 */
import { LAYER_GROUPS } from "@kody/engine";
import type {
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
import { HeadlessBackend } from "./backends/backend";
import type { RenderBackend } from "./backends/backend";
import {
  drawableTouchingBounds,
  fencedPosition,
  isTouchingColor as cpuIsTouchingColor,
  isTouchingDrawables as cpuIsTouchingDrawables,
  pickInBounds,
  stageTouchBounds,
  touchingBounds,
} from "./collision";
import type { SceneView } from "./collision";
import { getConvexHullPointsForDrawable } from "./convex-hull";
import { Drawable } from "./drawable";
import type { DrawablePropertyBag } from "./drawable";
import { LayerList } from "./layer-list";
import { stampDrawable } from "./pen-stamp";
import { isPixelData } from "./pixel-source";
import type { PixelData } from "./pixel-source";
import { BitmapSkin } from "./skins/bitmap-skin";
import { PenSkin } from "./skins/pen-skin";
import type { Skin } from "./skins/skin";
import { SVGSkin } from "./skins/svg-skin";
import { TextBubbleSkin } from "./skins/text-bubble-skin";
import { VideoSkin } from "./skins/video-skin";
import type { VideoFrame } from "./skins/video-skin";

export interface RendererCoreOptions {
  canvas?: HTMLCanvasElement | null;
  backend?: RenderBackend;
  xLeft?: number;
  xRight?: number;
  yBottom?: number;
  yTop?: number;
  /** Dipanggil saat aset asinkron (SVG) selesai dimuat dan panggung perlu digambar ulang. */
  onAsyncLoad?: () => void;
  /** Atur canvas.style.width/height saat resize (default true). */
  setCssSize?: boolean;
}

export interface RenderStats {
  drawables: number;
  skins: number;
  lastDrawMs: number;
  backend: RenderBackend["kind"];
}

export class KodyRenderer implements IRenderer, SceneView {
  readonly canvas: HTMLCanvasElement | null;
  private backend: RenderBackend;
  private readonly drawables = new Map<number, Drawable>();
  private readonly skins = new Map<number, Skin>();
  private readonly layers = new LayerList();
  private nextDrawableId = 0;
  private nextSkinId = 0;
  xLeft = -240;
  xRight = 240;
  yBottom = -180;
  yTop = 180;
  private nativeSize: [number, number] = [480, 360];
  private readonly backgroundColor4f: [number, number, number, number] = [1, 1, 1, 1];
  readonly backgroundColor3b = new Uint8ClampedArray([255, 255, 255]);
  private readonly onAsyncLoad: (() => void) | undefined;
  private readonly setCssSize: boolean;
  private videoSkin: VideoSkin | null = null;
  private videoDrawableId = -1;
  private lastDrawMs = 0;

  constructor(opts: RendererCoreOptions = {}) {
    this.canvas = opts.canvas ?? null;
    this.backend = opts.backend ?? new HeadlessBackend();
    this.onAsyncLoad = opts.onAsyncLoad;
    this.setCssSize = opts.setCssSize ?? true;
    this.setLayerGroupOrdering(LAYER_GROUPS);
    this.setStageSize(opts.xLeft ?? -240, opts.xRight ?? 240, opts.yBottom ?? -180, opts.yTop ?? 180);
  }

  // ----- SceneView -----
  get drawList(): readonly number[] {
    return this.layers.drawList;
  }

  getDrawable(id: number): Drawable | undefined {
    return this.drawables.get(id);
  }

  getSkin(id: number): Skin | undefined {
    return this.skins.get(id);
  }

  get backendKind(): RenderBackend["kind"] {
    return this.backend.kind;
  }

  // ----- panggung -----
  getNativeSize(): [number, number] {
    return [this.nativeSize[0], this.nativeSize[1]];
  }

  setStageSize(xLeft: number, xRight: number, yBottom: number, yTop: number): void {
    this.xLeft = xLeft;
    this.xRight = xRight;
    this.yBottom = yBottom;
    this.yTop = yTop;
    this.nativeSize = [Math.abs(xRight - xLeft), Math.abs(yBottom - yTop)];
    for (const skin of this.skins.values()) {
      if (skin instanceof PenSkin) skin.setCanvasSize(this.nativeSize);
    }
  }

  setBackgroundColor(red: number, green: number, blue: number): void {
    this.backgroundColor4f[0] = red;
    this.backgroundColor4f[1] = green;
    this.backgroundColor4f[2] = blue;
    this.backgroundColor3b[0] = red * 255;
    this.backgroundColor3b[1] = green * 255;
    this.backgroundColor3b[2] = blue * 255;
  }

  /** Ukuran CSS kanvas; buffer = CSS x devicePixelRatio. Koordinat logis tidak berubah. */
  resize(pixelsWide: number, pixelsTall: number): void {
    const ratio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const w = Math.max(1, Math.round(pixelsWide * ratio));
    const h = Math.max(1, Math.round(pixelsTall * ratio));
    if (this.canvas && this.setCssSize) {
      this.canvas.style.width = `${pixelsWide}px`;
      this.canvas.style.height = `${pixelsTall}px`;
    }
    const [cw, ch] = this.backend.getBufferSize();
    if (cw !== w || ch !== h) {
      this.backend.setBufferSize(w, h);
      this.draw();
    }
  }

  setLayerGroupOrdering(groups: readonly DrawableGroup[]): void {
    this.layers.setLayerGroupOrdering(groups);
  }

  draw(): void {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const list: Drawable[] = [];
    for (const id of this.layers.drawList) {
      const d = this.drawables.get(id);
      if (d) list.push(d);
    }
    this.backend.drawFrame({
      drawables: list,
      nativeSize: this.nativeSize,
      xLeft: this.xLeft,
      xRight: this.xRight,
      yBottom: this.yBottom,
      yTop: this.yTop,
      backgroundColor4f: this.backgroundColor4f,
    });
    this.lastDrawMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
  }

  getStats(): RenderStats {
    return { drawables: this.drawables.size, skins: this.skins.size, lastDrawMs: this.lastDrawMs, backend: this.backend.kind };
  }

  // ----- skin -----
  private addSkin(skin: Skin): number {
    this.skins.set(skin.id, skin);
    return skin.id;
  }

  createBitmapSkin(bitmap: BitmapSource | PixelData, bitmapResolution: number, rotationCenter?: [number, number]): number {
    const skin = new BitmapSkin(this.nextSkinId++);
    skin.setBitmap(bitmap, bitmapResolution, rotationCenter);
    return this.addSkin(skin);
  }

  createSVGSkin(svg: string, rotationCenter?: [number, number]): number {
    const skin = this.newSvgSkin(this.nextSkinId++);
    skin.setSVG(svg, rotationCenter);
    return this.addSkin(skin);
  }

  private newSvgSkin(id: number): SVGSkin {
    const skin = new SVGSkin(id);
    skin.onLoad = () => this.onAsyncLoad?.();
    return skin;
  }

  createPenSkin(): number {
    return this.addSkin(new PenSkin(this.nextSkinId++, this.nativeSize));
  }

  createTextSkin(type: BubbleType, text: string, pointsLeft: boolean): number {
    const skin = new TextBubbleSkin(this.nextSkinId++);
    skin.setTextBubble(type, text, pointsLeft);
    return this.addSkin(skin);
  }

  private reskin(skinId: number, newSkin: Skin): void {
    const oldSkin = this.skins.get(skinId);
    this.skins.set(skinId, newSkin);
    for (const d of this.drawables.values()) {
      if (oldSkin && d.skin === oldSkin) d.skin = newSkin;
    }
    oldSkin?.dispose();
  }

  updateSVGSkin(skinId: number, svg: string, rotationCenter?: [number, number]): void {
    const existing = this.skins.get(skinId);
    if (existing instanceof SVGSkin) {
      existing.setSVG(svg, rotationCenter);
      return;
    }
    const skin = this.newSvgSkin(skinId);
    skin.setSVG(svg, rotationCenter);
    this.reskin(skinId, skin);
  }

  updateBitmapSkin(skinId: number, bitmap: BitmapSource | PixelData, bitmapResolution: number, rotationCenter?: [number, number]): void {
    const existing = this.skins.get(skinId);
    if (existing instanceof BitmapSkin) {
      existing.setBitmap(bitmap, bitmapResolution, rotationCenter);
      return;
    }
    const skin = new BitmapSkin(skinId);
    skin.setBitmap(bitmap, bitmapResolution, rotationCenter);
    this.reskin(skinId, skin);
  }

  updateTextSkin(skinId: number, type: BubbleType, text: string, pointsLeft: boolean): void {
    const existing = this.skins.get(skinId);
    if (existing instanceof TextBubbleSkin) {
      existing.setTextBubble(type, text, pointsLeft);
      return;
    }
    const skin = new TextBubbleSkin(skinId);
    skin.setTextBubble(type, text, pointsLeft);
    this.reskin(skinId, skin);
  }

  destroySkin(skinId: number): void {
    const skin = this.skins.get(skinId);
    if (!skin) return;
    skin.dispose();
    this.skins.delete(skinId);
  }

  getSkinSize(skinId: number): [number, number] {
    const skin = this.skins.get(skinId);
    return skin ? skin.size : [0, 0];
  }

  /** Sama dengan scratch-render: pusat geometris skin (size / 2), bukan rotation center tersimpan. */
  getSkinRotationCenter(skinId: number): [number, number] {
    const skin = this.skins.get(skinId);
    return skin ? skin.calculateRotationCenter() : [0, 0];
  }

  // ----- drawable -----
  createDrawable(group: DrawableGroup): number {
    if (!this.layers.hasGroup(group)) {
      console.warn(`Cannot create a drawable without a known layer group: ${String(group)}`);
      return -1;
    }
    const id = this.nextDrawableId++;
    const drawable = new Drawable(id);
    this.drawables.set(id, drawable);
    this.layers.add(id, group);
    drawable.skin = null;
    return id;
  }

  destroyDrawable(drawableId: number, group: DrawableGroup): void {
    if (!this.layers.hasGroup(group)) return;
    const drawable = this.drawables.get(drawableId);
    if (!drawable) return;
    drawable.dispose();
    this.drawables.delete(drawableId);
    this.layers.remove(drawableId, group);
  }

  setDrawableOrder(drawableId: number, order: number, group: DrawableGroup, isRelative?: boolean, optMin?: number): number | null {
    const result = this.layers.setOrder(drawableId, order, group, isRelative, optMin);
    return result === undefined ? null : result;
  }

  getDrawableOrder(drawableId: number): number {
    return this.layers.indexOf(drawableId);
  }

  updateDrawableSkinId(drawableId: number, skinId: number): void {
    const d = this.drawables.get(drawableId);
    if (d) d.skin = this.skins.get(skinId) ?? null;
  }

  updateDrawablePosition(drawableId: number, position: [number, number]): void {
    this.drawables.get(drawableId)?.updatePosition(position);
  }

  updateDrawableDirectionScale(drawableId: number, direction: number, scale: [number, number]): void {
    const d = this.drawables.get(drawableId);
    if (!d) return;
    d.updateDirection(direction);
    d.updateScale(scale);
  }

  updateDrawableVisible(drawableId: number, visible: boolean): void {
    this.drawables.get(drawableId)?.updateVisible(visible);
  }

  updateDrawableEffect(drawableId: number, effect: GraphicEffect, value: number): void {
    this.drawables.get(drawableId)?.updateEffect(effect, value);
  }

  updateDrawableProperties(drawableId: number, props: DrawableProperties | DrawablePropertyBag): void {
    const d = this.drawables.get(drawableId);
    if (!d) return;
    if ("skinId" in props && props.skinId !== undefined) this.updateDrawableSkinId(drawableId, props.skinId);
    d.updateProperties(props);
  }

  // ----- geometri -----
  private ensureHull(d: Drawable): void {
    if (d.needsConvexHullPoints()) d.setConvexHullPoints(getConvexHullPointsForDrawable(d));
  }

  getBounds(drawableId: number): Rect | null {
    const d = this.drawables.get(drawableId);
    if (!d || !d.skin) return null;
    this.ensureHull(d);
    return d.getFastBounds().toRect();
  }

  getBoundsForBubble(drawableId: number): Rect | null {
    const d = this.drawables.get(drawableId);
    if (!d || !d.skin) return null;
    this.ensureHull(d);
    if (d.needsConvexHullPoints()) return d.getAABB().toRect();
    return d.getBoundsForBubble().toRect();
  }

  getAABB(drawableId: number): Rect | null {
    const d = this.drawables.get(drawableId);
    return d ? d.getAABB().toRect() : null;
  }

  getCurrentSkinSize(drawableId: number): [number, number] {
    const d = this.drawables.get(drawableId);
    return d && d.skin ? this.getSkinSize(d.skin.id) : [0, 0];
  }

  getFencedPositionOfDrawable(drawableId: number, position: [number, number]): [number, number] {
    return fencedPosition(this, drawableId, position);
  }

  isTouchingDrawables(drawableId: number, candidateIds?: readonly number[]): boolean {
    return cpuIsTouchingDrawables(this, drawableId, candidateIds ?? this.layers.drawList);
  }

  isTouchingColor(drawableId: number, color: RGB, mask?: RGB): boolean {
    return cpuIsTouchingColor(this, drawableId, color, mask);
  }

  /** "warna menyentuh warna" (alias eksplisit isTouchingColor dengan mask). */
  colorIsTouchingColor(drawableId: number, color: RGB, mask: RGB): boolean {
    return cpuIsTouchingColor(this, drawableId, color, mask);
  }

  /** stageX/stageY sebaiknya TIDAK dibulatkan (clientX * 480 / clientWidth - 240) agar sama dengan Scratch. */
  isTouchingPoint(drawableId: number, stageX: number, stageY: number): boolean {
    return drawableTouchingBounds(this, drawableId, stageTouchBounds(this, stageX, stageY, 1, 1));
  }

  pick(stageX: number, stageY: number, touchWidth?: number, touchHeight?: number, candidateIds?: readonly number[]): number {
    return pickInBounds(this, stageTouchBounds(this, stageX, stageY, touchWidth, touchHeight), candidateIds);
  }

  /** Koordinat klien kanvas (px CSS) -> koordinat panggung Scratch tak dibulatkan. */
  clientToStage(clientX: number, clientY: number, clientWidth?: number, clientHeight?: number): [number, number] {
    const cw = clientWidth ?? this.canvas?.clientWidth ?? this.nativeSize[0];
    const ch = clientHeight ?? this.canvas?.clientHeight ?? this.nativeSize[1];
    return [this.xLeft + (clientX * this.nativeSize[0]) / (cw || 1), this.yTop - (clientY * this.nativeSize[1]) / (ch || 1)];
  }

  /** Warna gabungan panggung di titik (dibulatkan ke piksel), alpha 255. */
  sampleColor(stageX: number, stageY: number): RGBA {
    const point = new Float32Array([Math.round(stageX), Math.round(stageY), 0]);
    const ids = this.layers.drawList;
    const color = new Uint8ClampedArray(4);
    const acc = [0, 0, 0];
    let blendAlpha = 1;
    for (let i = ids.length - 1; i >= 0 && blendAlpha !== 0; i--) {
      const d = this.drawables.get(ids[i] as number);
      if (!d || !d.getVisible() || !d.skin) continue;
      d.updateCPURenderAttributes();
      Drawable.sampleColor4b(point, d, color);
      acc[0] = (acc[0] as number) + (color[0] as number) * blendAlpha;
      acc[1] = (acc[1] as number) + (color[1] as number) * blendAlpha;
      acc[2] = (acc[2] as number) + (color[2] as number) * blendAlpha;
      blendAlpha *= 1 - (color[3] as number) / 255;
    }
    const bg = this.backgroundColor3b;
    const r = Math.round(Math.min(255, (acc[0] as number) + blendAlpha * (bg[0] as number)));
    const g = Math.round(Math.min(255, (acc[1] as number) + blendAlpha * (bg[1] as number)));
    const b = Math.round(Math.min(255, (acc[2] as number) + blendAlpha * (bg[2] as number)));
    return [r, g, b, 255];
  }

  // ----- pena -----
  private penSkin(id: number): PenSkin | null {
    const s = this.skins.get(id);
    return s instanceof PenSkin ? s : null;
  }

  penClear(penSkinId: number): void {
    this.penSkin(penSkinId)?.clear();
  }

  penPoint(penSkinId: number, attrs: PenAttributes, x: number, y: number): void {
    this.penSkin(penSkinId)?.drawPoint(attrs, x, y);
  }

  penLine(penSkinId: number, attrs: PenAttributes, x0: number, y0: number, x1: number, y1: number): void {
    this.penSkin(penSkinId)?.drawLine(attrs, x0, y0, x1, y1);
  }

  penStamp(penSkinId: number, stampDrawableId: number): void {
    const pen = this.penSkin(penSkinId);
    const d = this.drawables.get(stampDrawableId);
    if (!pen || !d || !d.skin) return;
    const bounds = touchingBounds(this, stampDrawableId);
    if (!bounds) return;
    const tex = d.skin.getTexture(d.scale);
    if (!tex) return;
    let pixels = tex.pixels ?? (isPixelData(tex.source) ? tex.source : null);
    if (!pixels && d.skin instanceof VideoSkin) pixels = d.skin.currentPixels();
    if (!pixels) return;
    stampDrawable(pen, d, bounds, pixels, tex.premultiplied);
  }

  // ----- video -----
  setVideoFrame(frame: VideoFrame | null, transparency: number, mirrored: boolean): void {
    if (frame === null) {
      if (this.videoDrawableId >= 0) this.updateDrawableVisible(this.videoDrawableId, false);
      return;
    }
    if (!this.videoSkin) {
      const skin = new VideoSkin(this.nextSkinId++, this.nativeSize);
      this.addSkin(skin);
      this.videoSkin = skin;
      this.videoDrawableId = this.createDrawable("video");
      this.updateDrawableSkinId(this.videoDrawableId, skin.id);
    }
    this.videoSkin.setFrame(frame, mirrored);
    const d = this.drawables.get(this.videoDrawableId) as Drawable;
    d.updateVisible(true);
    d.updateEffect("ghost", transparency);
  }

  /** Drawable lapisan video (atau -1), mis. untuk "menyentuh warna" terhadap kamera. */
  get videoDrawable(): number {
    return this.videoDrawableId;
  }

  async snapshot(): Promise<string> {
    this.draw();
    return this.backend.toDataURL() ?? "";
  }

  dispose(): void {
    for (const s of this.skins.values()) s.dispose();
    this.skins.clear();
    for (const d of this.drawables.values()) d.dispose();
    this.drawables.clear();
    this.backend.dispose();
  }
}
