/**
 * Transformasi efek di CPU untuk tabrakan, pick, dan stamp: meniru shader sprite.frag.
 * Port scratch-render 1.2.115 `src/EffectTransform.js` (BSD-3-Clause).
 */
import { hsvToRgb, rgbToHsv } from "./color-conversions";
import { EFFECT_INFO } from "./effect-info";
import type { EffectUniforms } from "./effect-info";

/** Koordinat tekstur 0..1, 0.5 = pusat. */
const CENTER_X = 0.5;
const CENTER_Y = 0.5;

const hsvWork = [0, 0, 0];

/** Bagian Drawable yang dibutuhkan transformasi efek. */
export interface EffectSubject {
  readonly enabledEffects: number;
  getUniforms(): EffectUniforms;
  /** Ukuran skin (u_skinSize), dipakai efek pixelate. */
  getSkinSize(): readonly [number, number];
}

/**
 * Transformasi warna (premultiplied, 0..255) di tempat: color, brightness, ghost.
 * `inOutColor` HARUS Uint8ClampedArray agar pembulatan per langkah sama dengan scratch-render.
 */
export function transformColor(subject: EffectSubject, inOutColor: Uint8ClampedArray, effectMask?: number): Uint8ClampedArray {
  if (inOutColor[3] === 0) return inOutColor;

  let effects = subject.enabledEffects;
  if (typeof effectMask === "number") effects &= effectMask;
  const uniforms = subject.getUniforms();

  const enableColor = (effects & EFFECT_INFO.color.mask) !== 0;
  const enableBrightness = (effects & EFFECT_INFO.brightness.mask) !== 0;

  if (enableColor || enableBrightness) {
    const alpha = (inOutColor[3] as number) / 255;
    inOutColor[0] = (inOutColor[0] as number) / alpha;
    inOutColor[1] = (inOutColor[1] as number) / alpha;
    inOutColor[2] = (inOutColor[2] as number) / alpha;

    if (enableColor) {
      const hsv = rgbToHsv(inOutColor, hsvWork);
      const minV = 0.11 / 2.0;
      const minS = 0.09;
      if ((hsv[2] as number) < minV) {
        hsv[0] = 0;
        hsv[1] = 1;
        hsv[2] = minV;
      } else if ((hsv[1] as number) < minS) {
        hsv[0] = 0;
        hsv[1] = minS;
      }
      hsv[0] = uniforms.u_color + (hsv[0] as number) + 1;
      hsvToRgb(hsv, inOutColor);
    }

    if (enableBrightness) {
      const brightness = uniforms.u_brightness * 255;
      inOutColor[0] = (inOutColor[0] as number) + brightness;
      inOutColor[1] = (inOutColor[1] as number) + brightness;
      inOutColor[2] = (inOutColor[2] as number) + brightness;
    }

    inOutColor[0] = (inOutColor[0] as number) * alpha;
    inOutColor[1] = (inOutColor[1] as number) * alpha;
    inOutColor[2] = (inOutColor[2] as number) * alpha;
  }

  if ((effects & EFFECT_INFO.ghost.mask) !== 0) {
    inOutColor[0] = (inOutColor[0] as number) * uniforms.u_ghost;
    inOutColor[1] = (inOutColor[1] as number) * uniforms.u_ghost;
    inOutColor[2] = (inOutColor[2] as number) * uniforms.u_ghost;
    inOutColor[3] = (inOutColor[3] as number) * uniforms.u_ghost;
  }

  return inOutColor;
}

/**
 * Transformasi koordinat tekstur sesuai efek distorsi (mosaic, pixelate, whirl, fisheye).
 * `dst` sebaiknya Float32Array (twgl.v3) agar presisi tiap langkah sama dengan scratch-render.
 */
export function transformPoint(subject: EffectSubject, vec: ArrayLike<number>, dst: Float32Array): Float32Array {
  dst[0] = vec[0] as number;
  dst[1] = vec[1] as number;
  dst[2] = (vec[2] as number | undefined) ?? 0;

  const effects = subject.enabledEffects;
  const uniforms = subject.getUniforms();
  if ((effects & EFFECT_INFO.mosaic.mask) !== 0) {
    dst[0] = (uniforms.u_mosaic * (dst[0] as number)) % 1;
    dst[1] = (uniforms.u_mosaic * (dst[1] as number)) % 1;
  }
  if ((effects & EFFECT_INFO.pixelate.mask) !== 0) {
    const skinSize = subject.getSkinSize();
    const texelX = skinSize[0] / uniforms.u_pixelate;
    const texelY = skinSize[1] / uniforms.u_pixelate;
    dst[0] = (Math.floor((dst[0] as number) * texelX) + CENTER_X) / texelX;
    dst[1] = (Math.floor((dst[1] as number) * texelY) + CENTER_Y) / texelY;
  }
  if ((effects & EFFECT_INFO.whirl.mask) !== 0) {
    const RADIUS = 0.5;
    const offsetX = (dst[0] as number) - CENTER_X;
    const offsetY = (dst[1] as number) - CENTER_Y;
    const offsetMagnitude = Math.sqrt(Math.pow(offsetX, 2) + Math.pow(offsetY, 2));
    const whirlFactor = Math.max(1.0 - offsetMagnitude / RADIUS, 0.0);
    const whirlActual = uniforms.u_whirl * whirlFactor * whirlFactor;
    const sinWhirl = Math.sin(whirlActual);
    const cosWhirl = Math.cos(whirlActual);
    const rot1 = cosWhirl;
    const rot2 = -sinWhirl;
    const rot3 = sinWhirl;
    const rot4 = cosWhirl;
    dst[0] = rot1 * offsetX + rot3 * offsetY + CENTER_X;
    dst[1] = rot2 * offsetX + rot4 * offsetY + CENTER_Y;
  }
  if ((effects & EFFECT_INFO.fisheye.mask) !== 0) {
    const vX = ((dst[0] as number) - CENTER_X) / CENTER_X;
    const vY = ((dst[1] as number) - CENTER_Y) / CENTER_Y;
    const vLength = Math.sqrt(vX * vX + vY * vY);
    const r = Math.pow(Math.min(vLength, 1), uniforms.u_fisheye) * Math.max(1, vLength);
    const unitX = vX / vLength;
    const unitY = vY / vLength;
    dst[0] = CENTER_X + r * unitX * CENTER_X;
    dst[1] = CENTER_Y + r * unitY * CENTER_Y;
  }
  return dst;
}
