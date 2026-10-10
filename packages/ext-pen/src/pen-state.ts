/**
 * State pena per target dan logika warna, padanan perilaku scratch-vm 4.8.102
 * src/extensions/scratch3_pen/index.js (BSD-3-Clause, lihat THIRD_PARTY.md).
 * Semua fungsi di sini murni (tidak menyentuh renderer) supaya mudah diuji.
 */
import { Color } from "@kody/engine/util/color";
import { MathUtil } from "@kody/engine/util/math-util";
import type { PenAttributes } from "@kody/engine";

/** Kunci custom state target, sama dengan Scratch3PenBlocks.STATE_KEY. */
export const PEN_STATE_KEY = "Scratch.pen";

/** Nilai menu colorParam (ColorParam di scratch-vm). */
export const ColorParam = {
  COLOR: "color",
  SATURATION: "saturation",
  BRIGHTNESS: "brightness",
  TRANSPARENCY: "transparency",
} as const;
export type ColorParam = (typeof ColorParam)[keyof typeof ColorParam];

/** Batas ukuran pena (PEN_SIZE_RANGE). */
export const PEN_SIZE_RANGE = { min: 1, max: 1200 } as const;

export interface PenState {
  penDown: boolean;
  /** Hue 0..100 (wrap). */
  color: number;
  /** 0..100 (clamp). */
  saturation: number;
  /** 0..100 (clamp). */
  brightness: number;
  /** 0..100 (clamp). */
  transparency: number;
  /** Hanya untuk blok legacy "change pen shade by". */
  _shade: number;
  penAttributes: PenAttributes;
}

/** DEFAULT_PEN_STATE (color4f awal memang [0,0,1,1] seperti Scratch). */
export function defaultPenState(): PenState {
  return {
    penDown: false,
    color: 66.66,
    saturation: 100,
    brightness: 100,
    transparency: 0,
    _shade: 50,
    penAttributes: {
      color4f: [0, 0, 1, 1],
      diameter: 1,
    },
  };
}

/**
 * Clone.simple scratch-vm = JSON.parse(JSON.stringify(x)). Sengaja dipertahankan (bukan
 * structuredClone) karena NaN/Infinity berubah menjadi null persis seperti di Scratch.
 */
export function cloneSimple<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function clampPenSize(requestedSize: number): number {
  return MathUtil.clamp(requestedSize, PEN_SIZE_RANGE.min, PEN_SIZE_RANGE.max);
}

function wrapColor(value: number): number {
  return MathUtil.wrapClamp(value, 0, 100);
}

function clampColorParam(value: number): number {
  return MathUtil.clamp(value, 0, 100);
}

function transparencyToAlpha(transparency: number): number {
  return 1.0 - transparency / 100.0;
}

/** _updatePenColor: HSV state -> color4f. */
export function updatePenColor(penState: PenState): void {
  const rgb = Color.hsvToRgb({
    h: (penState.color * 360) / 100,
    s: penState.saturation / 100,
    v: penState.brightness / 100,
  });
  const c = penState.penAttributes.color4f;
  c[0] = rgb.r / 255.0;
  c[1] = rgb.g / 255.0;
  c[2] = rgb.b / 255.0;
  c[3] = transparencyToAlpha(penState.transparency);
}

/**
 * _setOrChangeColorParam. `param` dibandingkan apa adanya (===) seperti switch di Scratch,
 * jadi reporter yang mengembalikan nilai lain hanya memicu update warna tanpa perubahan.
 */
export function setOrChangeColorParam(param: unknown, value: number, penState: PenState, change: boolean): void {
  switch (param) {
    case ColorParam.COLOR:
      penState.color = wrapColor(value + (change ? penState.color : 0));
      break;
    case ColorParam.SATURATION:
      penState.saturation = clampColorParam(value + (change ? penState.saturation : 0));
      break;
    case ColorParam.BRIGHTNESS:
      penState.brightness = clampColorParam(value + (change ? penState.brightness : 0));
      break;
    case ColorParam.TRANSPARENCY:
      penState.transparency = clampColorParam(value + (change ? penState.transparency : 0));
      break;
    default:
      // Scratch hanya log.warn; warna tetap dihitung ulang di bawah.
      break;
  }
  updatePenColor(penState);
}

/** setPenColorToColor setelah Cast.toRgbColorObject. */
export function setPenColorFromRgb(penState: PenState, rgb: { r: number; g: number; b: number; a?: number }): void {
  const hsv = Color.rgbToHsv(rgb);
  penState.color = (hsv.h / 360) * 100;
  penState.saturation = hsv.s * 100;
  penState.brightness = hsv.v * 100;
  if (Object.prototype.hasOwnProperty.call(rgb, "a")) {
    // Sama dengan Scratch: kalau kunci "a" ada tapi undefined, hasilnya NaN.
    penState.transparency = 100 * (1 - (rgb.a as number) / 255.0);
  } else {
    penState.transparency = 0;
  }
  // Nilai shade legacy diatur seperti Scratch 2.
  penState._shade = penState.brightness / 2;
  updatePenColor(penState);
}

/** _legacyUpdatePenColor: model "shade" Scratch 2. */
export function legacyUpdatePenColor(penState: PenState): void {
  let rgb = Color.hsvToRgb({ h: (penState.color * 360) / 100, s: 1, v: 1 });
  const shade = penState._shade > 100 ? 200 - penState._shade : penState._shade;
  if (shade < 50) {
    rgb = Color.mixRgb(Color.RGB_BLACK, rgb, (10 + shade) / 60);
  } else {
    rgb = Color.mixRgb(rgb, Color.RGB_WHITE, (shade - 50) / 60);
  }
  const hsv = Color.rgbToHsv(rgb);
  penState.color = (100 * hsv.h) / 360;
  penState.saturation = 100 * hsv.s;
  penState.brightness = 100 * hsv.v;
  updatePenColor(penState);
}

/** setPenShadeToNumber setelah Cast.toNumber: wrap 0..200 seperti Scratch 2. */
export function setPenShade(penState: PenState, shade: number): void {
  let newShade = shade % 200;
  if (newShade < 0) newShade += 200;
  penState._shade = newShade;
  legacyUpdatePenColor(penState);
}
