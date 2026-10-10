/**
 * TextBubbleSkin: balon "say"/"think" (font 14px Helvetica, padding 10, lebar baris maks 170,
 * ekor, sudut 16). Port scratch-render 1.2.115 `src/TextBubbleSkin.js` (BSD-3-Clause).
 */
import type { BubbleType } from "@kody/engine";
import { createCanvas, get2d } from "../pixel-source";
import type { Any2DContext, AnyCanvas } from "../pixel-source";
import { Skin, makeTexture } from "./skin";
import type { SkinTexture } from "./skin";
import { TextWrapper } from "./text-wrap";

export const BubbleStyle = {
  MAX_LINE_WIDTH: 170,
  MIN_WIDTH: 50,
  STROKE_WIDTH: 4,
  PADDING: 10,
  CORNER_RADIUS: 16,
  TAIL_HEIGHT: 12,
  FONT: "Helvetica",
  FONT_SIZE: 14,
  FONT_HEIGHT_RATIO: 0.9,
  LINE_HEIGHT: 16,
  COLORS: {
    BUBBLE_FILL: "white",
    BUBBLE_STROKE: "rgba(0, 0, 0, 0.15)",
    TEXT_FILL: "#575E75",
  },
} as const;

const FONT_CSS = `${BubbleStyle.FONT_SIZE}px ${BubbleStyle.FONT}, sans-serif`;
/** Lebar rata-rata glyph Helvetica 14px, dipakai bila tidak ada kanvas (headless). */
const FALLBACK_CHAR_WIDTH = 7.8;

export class TextBubbleSkin extends Skin {
  readonly kind = "text" as const;
  private readonly canvas: AnyCanvas | null;
  private readonly ctx: Any2DContext | null;
  private readonly _size: [number, number] = [0, 0];
  private renderedScale = 0;
  private lines: string[] = [];
  private readonly textAreaSize = { width: 0, height: 0 };
  private bubbleType: BubbleType = "say";
  private pointsLeft = false;
  private text = "";
  private textDirty = true;
  private textureDirty = true;
  private texture: SkinTexture | null = null;
  private readonly measureCache = new Map<string, number>();
  private readonly wrapper: TextWrapper;

  constructor(id: number) {
    super(id);
    this.canvas = createCanvas(1, 1);
    this.ctx = this.canvas ? get2d(this.canvas) : null;
    this.wrapper = new TextWrapper((t) => this.measureText(t));
    this.restyle();
  }

  private restyle(): void {
    if (this.ctx) this.ctx.font = FONT_CSS;
  }

  private measureText(text: string): number {
    let w = this.measureCache.get(text);
    if (w === undefined) {
      w = this.ctx ? this.ctx.measureText(text).width : Array.from(text).length * FALLBACK_CHAR_WIDTH;
      this.measureCache.set(text, w);
    }
    return w;
  }

  get size(): [number, number] {
    if (this.textDirty) this.reflowLines();
    return this._size;
  }

  setTextBubble(type: BubbleType, text: string, pointsLeft: boolean): void {
    this.text = text;
    this.bubbleType = type;
    this.pointsLeft = pointsLeft;
    this.textDirty = true;
    this.textureDirty = true;
    this.emitWasAltered();
  }

  private reflowLines(): void {
    this.lines = this.wrapper.wrapText(BubbleStyle.MAX_LINE_WIDTH, this.text);
    let longest = 0;
    for (const line of this.lines) longest = Math.max(longest, this.measureText(line));
    const paddedWidth = Math.max(longest, BubbleStyle.MIN_WIDTH) + BubbleStyle.PADDING * 2;
    const paddedHeight = BubbleStyle.LINE_HEIGHT * this.lines.length + BubbleStyle.PADDING * 2;
    this.textAreaSize.width = paddedWidth;
    this.textAreaSize.height = paddedHeight;
    this._size[0] = paddedWidth + BubbleStyle.STROKE_WIDTH;
    this._size[1] = paddedHeight + BubbleStyle.STROKE_WIDTH + BubbleStyle.TAIL_HEIGHT;
    this.textDirty = false;
  }

  /** Baris hasil pembungkusan (untuk tes & aksesibilitas). */
  get wrappedLines(): readonly string[] {
    if (this.textDirty) this.reflowLines();
    return this.lines;
  }

  private renderTextBubble(scale: number): void {
    const ctx = this.ctx as Any2DContext;
    const canvas = this.canvas as AnyCanvas;
    if (this.textDirty) this.reflowLines();
    const paddedWidth = this.textAreaSize.width;
    const paddedHeight = this.textAreaSize.height;
    const R = BubbleStyle.CORNER_RADIUS;

    canvas.width = Math.ceil(this._size[0] * scale);
    canvas.height = Math.ceil(this._size[1] * scale);
    this.restyle();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.translate(BubbleStyle.STROKE_WIDTH * 0.5, BubbleStyle.STROKE_WIDTH * 0.5);

    ctx.save();
    if (this.pointsLeft) {
      ctx.scale(-1, 1);
      ctx.translate(-paddedWidth, 0);
    }
    ctx.beginPath();
    ctx.moveTo(R, paddedHeight);
    ctx.arcTo(0, paddedHeight, 0, paddedHeight - R, R);
    ctx.arcTo(0, 0, paddedWidth, 0, R);
    ctx.arcTo(paddedWidth, 0, paddedWidth, paddedHeight, R);
    ctx.arcTo(paddedWidth, paddedHeight, paddedWidth - R, paddedHeight, R);

    ctx.save();
    ctx.translate(paddedWidth - R, paddedHeight);
    if (this.bubbleType === "say") {
      ctx.bezierCurveTo(0, 4, 4, 8, 4, 10);
      ctx.arcTo(4, 12, 2, 12, 2);
      ctx.bezierCurveTo(-1, 12, -11, 8, -16, 0);
      ctx.closePath();
    } else {
      ctx.arc(-16, 0, 4, 0, Math.PI);
      ctx.closePath();
      ctx.moveTo(-7, 7.25);
      ctx.arc(-9.25, 7.25, 2.25, 0, Math.PI * 2);
      ctx.moveTo(0, 9.5);
      ctx.arc(-1.5, 9.5, 1.5, 0, Math.PI * 2);
    }
    ctx.restore();

    ctx.fillStyle = BubbleStyle.COLORS.BUBBLE_FILL;
    ctx.strokeStyle = BubbleStyle.COLORS.BUBBLE_STROKE;
    ctx.lineWidth = BubbleStyle.STROKE_WIDTH;
    ctx.stroke();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = BubbleStyle.COLORS.TEXT_FILL;
    ctx.font = FONT_CSS;
    for (let n = 0; n < this.lines.length; n++) {
      ctx.fillText(
        this.lines[n] as string,
        BubbleStyle.PADDING,
        BubbleStyle.PADDING + BubbleStyle.LINE_HEIGHT * n + BubbleStyle.FONT_HEIGHT_RATIO * BubbleStyle.FONT_SIZE,
      );
    }
    this.renderedScale = scale;
  }

  override updateSilhouette(scale: readonly number[] = [100, 100]): void {
    this.getTexture(scale);
  }

  override getTexture(scale?: readonly number[]): SkinTexture | null {
    if (!this.ctx || !this.canvas) return null;
    const scaleMax = scale ? Math.max(Math.abs(scale[0] as number), Math.abs(scale[1] as number)) : 100;
    const requestedScale = scaleMax / 100;
    if (this.textureDirty || this.renderedScale !== requestedScale || !this.texture) {
      this.renderTextBubble(requestedScale);
      this.textureDirty = false;
      const img = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      const pixels = { width: img.width, height: img.height, data: img.data };
      this.texture = makeTexture(pixels, pixels.width, pixels.height, false, pixels);
      this.silhouette.update(pixels);
    }
    return this.texture;
  }
}
