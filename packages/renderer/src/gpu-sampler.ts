/**
 * Emulasi fragment shader sprite.frag di CPU (float), dipakai stamp pena ke buffer CPU dan
 * backend Canvas2D untuk efek yang tidak bisa dilakukan Canvas (color, fisheye, whirl, pixelate, mosaic).
 * Rumus mengikuti scratch-render 1.2.115 `src/shaders/sprite.frag` (BSD-3-Clause).
 */
import { EFFECT_INFO } from "./effect-info";
import type { EffectUniforms } from "./effect-info";
import { transformPoint } from "./effect-transform";
import type { EffectSubject } from "./effect-transform";
import type { PixelData } from "./pixel-source";

const EPS = 1e-3;
const work = new Float32Array(3);

/** Sampel tekstur seperti texture2D dengan CLAMP_TO_EDGE; hasil premultiplied 0..1. */
export function sampleTexture(
  tex: PixelData,
  premultiplied: boolean,
  u: number,
  v: number,
  nearest: boolean,
  out: Float64Array,
): Float64Array {
  const { width: w, height: h, data } = tex;
  const read = (x: number, y: number, weight: number): void => {
    const xi = x < 0 ? 0 : x >= w ? w - 1 : x;
    const yi = y < 0 ? 0 : y >= h ? h - 1 : y;
    const o = (yi * w + xi) * 4;
    const a = (data[o + 3] as number) / 255;
    const m = premultiplied ? 1 : a;
    out[0] = (out[0] as number) + ((data[o] as number) / 255) * m * weight;
    out[1] = (out[1] as number) + ((data[o + 1] as number) / 255) * m * weight;
    out[2] = (out[2] as number) + ((data[o + 2] as number) / 255) * m * weight;
    out[3] = (out[3] as number) + a * weight;
  };
  out.fill(0);
  if (nearest) {
    read(Math.floor(u * w), Math.floor(v * h), 1);
    return out;
  }
  const x = u * w - 0.5;
  const y = v * h - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  read(x0, y0, (1 - fx) * (1 - fy));
  read(x0 + 1, y0, fx * (1 - fy));
  read(x0, y0 + 1, (1 - fx) * fy);
  read(x0 + 1, y0 + 1, fx * fy);
  return out;
}

function rgb2hsv(r: number, g: number, b: number, out: number[]): void {
  // Sama dengan convertRGB2HSV di shader (tanpa cabang, dengan epsilon).
  let t1x: number, t1y: number, t1z: number, t1w: number;
  if (b > g) {
    t1x = b; t1y = g; t1z = -1.0; t1w = 2.0 / 3.0;
  } else {
    t1x = g; t1y = b; t1z = 0.0; t1w = -1.0 / 3.0;
  }
  let t2x: number, t2y: number, t2z: number, t2w: number;
  if (r > t1x) {
    t2x = r; t2y = t1y; t2z = t1z; t2w = t1x;
  } else {
    t2x = t1x; t2y = t1y; t2z = t1w; t2w = r;
  }
  const m = Math.min(t2y, t2w);
  const C = t2x - m;
  out[0] = Math.abs(t2z + (t2w - t2y) / (6.0 * C + EPS));
  out[1] = C / (t2x + EPS);
  out[2] = t2x;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const hsvWork = [0, 0, 0];

/** Efek warna shader pada warna premultiplied 0..1 (di tempat). */
export function applyColorEffects(effects: number, u: EffectUniforms, c: Float64Array): void {
  const enableColor = (effects & EFFECT_INFO.color.mask) !== 0;
  const enableBrightness = (effects & EFFECT_INFO.brightness.mask) !== 0;
  if (enableColor || enableBrightness) {
    const a = c[3] as number;
    let r = clamp01((c[0] as number) / (a + EPS));
    let g = clamp01((c[1] as number) / (a + EPS));
    let b = clamp01((c[2] as number) / (a + EPS));
    if (enableColor) {
      const hsv = hsvWork;
      rgb2hsv(r, g, b, hsv);
      const minLightness = 0.11 / 2.0;
      const minSaturation = 0.09;
      if ((hsv[2] as number) < minLightness) {
        hsv[0] = 0; hsv[1] = 1; hsv[2] = minLightness;
      } else if ((hsv[1] as number) < minSaturation) {
        hsv[0] = 0; hsv[1] = minSaturation;
      }
      let hue = ((hsv[0] as number) + u.u_color) % 1.0;
      if (hue < 0) hue += 1.0;
      const hr = clamp01(Math.abs(hue * 6 - 3) - 1);
      const hg = clamp01(2 - Math.abs(hue * 6 - 2));
      const hb = clamp01(2 - Math.abs(hue * 6 - 4));
      const s = hsv[1] as number;
      const v = hsv[2] as number;
      const ch = v * s;
      r = hr * ch + v - ch;
      g = hg * ch + v - ch;
      b = hb * ch + v - ch;
    }
    if (enableBrightness) {
      r = clamp01(r + u.u_brightness);
      g = clamp01(g + u.u_brightness);
      b = clamp01(b + u.u_brightness);
    }
    c[0] = r * (a + EPS);
    c[1] = g * (a + EPS);
    c[2] = b * (a + EPS);
  }
  if ((effects & EFFECT_INFO.ghost.mask) !== 0) {
    c[0] = (c[0] as number) * u.u_ghost;
    c[1] = (c[1] as number) * u.u_ghost;
    c[2] = (c[2] as number) * u.u_ghost;
    c[3] = (c[3] as number) * u.u_ghost;
  }
}

/** Konteks shading satu drawable, disiapkan sekali sebelum loop piksel. */
export interface ShadeContext {
  /** Subjek efek dengan enabledEffects SUDAH di-AND effectMask. */
  readonly subject: EffectSubject;
  readonly tex: PixelData;
  readonly premultiplied: boolean;
  readonly nearest: boolean;
}

const DISTORT_MASK = EFFECT_INFO.mosaic.mask | EFFECT_INFO.pixelate.mask | EFFECT_INFO.whirl.mask | EFFECT_INFO.fisheye.mask;

/** Fragment shader lengkap untuk koordinat tekstur (u,v) 0..1: distorsi -> sampel -> efek warna. */
export function shadeFragment(ctx: ShadeContext, u: number, v: number, out: Float64Array): Float64Array {
  let tu = u;
  let tv = v;
  const effects = ctx.subject.enabledEffects;
  if ((effects & DISTORT_MASK) !== 0) {
    work[0] = u;
    work[1] = v;
    work[2] = 0;
    transformPoint(ctx.subject, work, work);
    tu = Number.isNaN(work[0]) ? 0.5 : (work[0] as number);
    tv = Number.isNaN(work[1]) ? 0.5 : (work[1] as number);
  }
  sampleTexture(ctx.tex, ctx.premultiplied, tu, tv, ctx.nearest, out);
  applyColorEffects(effects, ctx.subject.getUniforms(), out);
  return out;
}

/** Bungkus subjek efek dengan mask (mis. tanpa ghost). */
export function maskedSubject(subject: EffectSubject, effectMask: number): EffectSubject {
  return {
    enabledEffects: subject.enabledEffects & effectMask,
    getUniforms: () => subject.getUniforms(),
    getSkinSize: () => subject.getSkinSize(),
  };
}
