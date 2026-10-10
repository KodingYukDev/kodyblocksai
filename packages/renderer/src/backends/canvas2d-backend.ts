/**
 * Backend Canvas2D (cadangan bila WebGL tidak tersedia). Transformasi sama dengan quad WebGL.
 * Ghost = globalAlpha; efek lain (color, brightness, fisheye, whirl, pixelate, mosaic) dihitung
 * di CPU dengan emulasi shader (gpu-sampler) dan di-cache per nilai efek.
 */
import type { Drawable } from "../drawable";
import { EFFECT_INFO } from "../effect-info";
import { maskedSubject, shadeFragment } from "../gpu-sampler";
import { createCanvas, get2d, isPixelData } from "../pixel-source";
import type { Any2DContext, AnyCanvas, PixelData } from "../pixel-source";
import type { SkinTexture } from "../skins/skin";
import { framebufferScale } from "./backend";
import type { FrameInfo, RenderBackend } from "./backend";

interface CachedImage {
  canvas: AnyCanvas;
  revision: number;
  effectKey: string;
  lastUsedFrame: number;
}

const IDLE_FRAMES = 300;
const MAX_EFFECT_CACHE = 64;
const NON_GHOST = ~EFFECT_INFO.ghost.mask;

export class Canvas2DBackend implements RenderBackend {
  readonly kind = "canvas2d" as const;
  private readonly ctx: CanvasRenderingContext2D;
  private plain = new Map<SkinTexture, CachedImage>();
  private effected = new Map<string, CachedImage>();
  private frameNumber = 0;
  private readonly textureIds = new WeakMap<SkinTexture, number>();
  private nextTextureId = 1;

  constructor(private readonly canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  setBufferSize(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  getBufferSize(): [number, number] {
    return [this.canvas.width, this.canvas.height];
  }

  private texId(tex: SkinTexture): number {
    let id = this.textureIds.get(tex);
    if (id === undefined) {
      id = this.nextTextureId++;
      this.textureIds.set(tex, id);
    }
    return id;
  }

  /** Sumber gambar polos (straight alpha) untuk drawImage. */
  private plainImage(tex: SkinTexture): CanvasImageSource | null {
    if (!isPixelData(tex.source) && !tex.premultiplied) return tex.source as CanvasImageSource;
    let entry = this.plain.get(tex);
    if (!entry) {
      const c = createCanvas(tex.width, tex.height);
      if (!c) return null;
      entry = { canvas: c, revision: -1, effectKey: "", lastUsedFrame: 0 };
      this.plain.set(tex, entry);
    }
    entry.lastUsedFrame = this.frameNumber;
    if (entry.revision !== tex.revision) {
      const ctx = get2d(entry.canvas) as Any2DContext;
      const src = tex.source as PixelData;
      const img = ctx.createImageData(tex.width, tex.height);
      if (tex.premultiplied) {
        const d = src.data;
        const o = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3] as number;
          if (a === 0) continue;
          o[i] = ((d[i] as number) * 255) / a;
          o[i + 1] = ((d[i + 1] as number) * 255) / a;
          o[i + 2] = ((d[i + 2] as number) * 255) / a;
          o[i + 3] = a;
        }
      } else {
        img.data.set(src.data);
      }
      ctx.putImageData(img, 0, 0);
      entry.revision = tex.revision;
    }
    return entry.canvas as CanvasImageSource;
  }

  /** Gambar dengan efek non-ghost dirender di CPU (emulasi shader). */
  private effectedImage(drawable: Drawable, tex: SkinTexture, nearest: boolean): CanvasImageSource | null {
    const pixels = tex.pixels ?? (isPixelData(tex.source) ? tex.source : null);
    if (!pixels) return this.plainImage(tex);
    const u = drawable.getUniforms();
    const bits = drawable.enabledEffects & NON_GHOST;
    const key = `${this.texId(tex)}|${tex.revision}|${bits}|${u.u_color}|${u.u_fisheye}|${u.u_whirl}|${u.u_pixelate}|${u.u_mosaic}|${u.u_brightness}|${nearest}`;
    let entry = this.effected.get(key);
    if (!entry) {
      const c = createCanvas(tex.width, tex.height);
      if (!c) return null;
      const ctx = get2d(c) as Any2DContext;
      const img = ctx.createImageData(tex.width, tex.height);
      const shade = { subject: maskedSubject(drawable, NON_GHOST), tex: pixels, premultiplied: tex.premultiplied, nearest };
      const out = new Float64Array(4);
      const o = img.data;
      for (let y = 0; y < tex.height; y++) {
        for (let x = 0; x < tex.width; x++) {
          shadeFragment(shade, (x + 0.5) / tex.width, (y + 0.5) / tex.height, out);
          const a = out[3] as number;
          const i = (y * tex.width + x) * 4;
          if (a <= 0) continue;
          o[i] = ((out[0] as number) / a) * 255;
          o[i + 1] = ((out[1] as number) / a) * 255;
          o[i + 2] = ((out[2] as number) / a) * 255;
          o[i + 3] = a * 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      entry = { canvas: c, revision: tex.revision, effectKey: key, lastUsedFrame: 0 };
      this.effected.set(key, entry);
      // Efek yang beranimasi membuat kunci baru tiap frame: batasi jumlah cache.
      if (this.effected.size > MAX_EFFECT_CACHE) {
        const oldest = this.effected.keys().next().value;
        if (oldest !== undefined) this.effected.delete(oldest);
      }
    }
    entry.lastUsedFrame = this.frameNumber;
    return entry.canvas as CanvasImageSource;
  }

  drawFrame(frame: FrameInfo): void {
    this.frameNumber++;
    const ctx = this.ctx;
    const [fbW, fbH] = this.getBufferSize();
    const [nw, nh] = frame.nativeSize;
    const sx = fbW / nw;
    const sy = fbH / nh;
    const bg = frame.backgroundColor4f;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgb(${Math.round(bg[0] * 255)},${Math.round(bg[1] * 255)},${Math.round(bg[2] * 255)})`;
    ctx.fillRect(0, 0, fbW, fbH);

    for (const drawable of frame.drawables) {
      if (!drawable.getVisible() || !drawable.skin) continue;
      const skin = drawable.skin;
      const scale = framebufferScale(drawable, frame.nativeSize, fbW, fbH);
      const tex = skin.getTexture(scale);
      if (!tex) continue;
      const nearest = skin.useNearest(scale, drawable);
      const image = (drawable.enabledEffects & NON_GHOST) !== 0 ? this.effectedImage(drawable, tex, nearest) : this.plainImage(tex);
      if (!image) continue;

      const m = drawable.getUniforms().u_modelMatrix;
      const W = tex.width;
      const H = tex.height;
      const m0 = m[0] as number;
      const m1 = m[1] as number;
      const m4 = m[4] as number;
      const m5 = m[5] as number;
      const m12 = m[12] as number;
      const m13 = m[13] as number;
      // Piksel tekstur (px,py) -> quad (0.5 - px/W, py/H - 0.5) -> panggung (model) -> piksel kanvas.
      ctx.setTransform(
        (-m0 * sx) / W,
        (m1 * sy) / W,
        (m4 * sx) / H,
        (-m5 * sy) / H,
        sx * (0.5 * m0 - 0.5 * m4 + m12 - frame.xLeft),
        sy * (frame.yTop - 0.5 * m1 + 0.5 * m5 - m13),
      );
      ctx.imageSmoothingEnabled = !nearest;
      ctx.globalAlpha = (drawable.enabledEffects & EFFECT_INFO.ghost.mask) !== 0 ? drawable.getUniforms().u_ghost : 1;
      ctx.drawImage(image, 0, 0, W, H);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (this.frameNumber % 60 === 0) this.sweep();
  }

  private sweep(): void {
    for (const [k, e] of this.plain) if (this.frameNumber - e.lastUsedFrame > IDLE_FRAMES) this.plain.delete(k);
    for (const [k, e] of this.effected) if (this.frameNumber - e.lastUsedFrame > IDLE_FRAMES) this.effected.delete(k);
  }

  toDataURL(): string | null {
    try {
      return this.canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }

  dispose(): void {
    this.plain.clear();
    this.effected.clear();
  }
}
