/**
 * Utilitas warna. Port dari scratch-vm 4.8.102 src/util/color.js (BSD-3-Clause, lihat THIRD_PARTY.md).
 * Pemilik: agent engine-core.
 */

export interface RGBObject {
  r: number;
  g: number;
  b: number;
  a?: number;
}
export interface HSVObject {
  h: number;
  s: number;
  v: number;
}

function rgbToDecimal(rgb: RGBObject): number {
  return (rgb.r << 16) + (rgb.g << 8) + rgb.b;
}

function decimalToHex(decimal: number): string {
  if (decimal < 0) decimal += 0xffffff + 1;
  let hex = Number(decimal).toString(16);
  hex = `#${"000000".substring(0, 6 - hex.length)}${hex}`;
  return hex;
}

function hexToRgb(hex: string): RGBObject | null {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const full = hex.replace(shorthandRegex, (_m, r: string, g: string, b: string) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(full);
  if (!result) return null;
  return {
    r: parseInt(result[1] ?? "0", 16),
    g: parseInt(result[2] ?? "0", 16),
    b: parseInt(result[3] ?? "0", 16),
  };
}

export const Color = {
  get RGB_BLACK(): RGBObject {
    return { r: 0, g: 0, b: 0 };
  },
  get RGB_WHITE(): RGBObject {
    return { r: 255, g: 255, b: 255 };
  },

  decimalToHex,

  decimalToRgb(decimal: number): RGBObject {
    const a = (decimal >> 24) & 0xff;
    const r = (decimal >> 16) & 0xff;
    const g = (decimal >> 8) & 0xff;
    const b = decimal & 0xff;
    return { r, g, b, a: a > 0 ? a : 255 };
  },

  hexToRgb,

  rgbToHex(rgb: RGBObject): string {
    return decimalToHex(rgbToDecimal(rgb));
  },

  rgbToDecimal,

  hexToDecimal(hex: string): number {
    // color.js memanggil rgbToDecimal(null) untuk hex tidak valid -> TypeError; di sini 0 agar tidak crash.
    const rgb = hexToRgb(hex);
    return rgb ? rgbToDecimal(rgb) : 0;
  },

  hsvToRgb(hsv: HSVObject): RGBObject {
    let h = hsv.h % 360;
    if (h < 0) h += 360;
    const s = Math.max(0, Math.min(hsv.s, 1));
    const v = Math.max(0, Math.min(hsv.v, 1));

    const i = Math.floor(h / 60);
    const f = h / 60 - i;
    const p = v * (1 - s);
    const q = v * (1 - s * f);
    const t = v * (1 - s * (1 - f));

    let r: number;
    let g: number;
    let b: number;
    switch (i) {
      case 1:
        r = q;
        g = v;
        b = p;
        break;
      case 2:
        r = p;
        g = v;
        b = t;
        break;
      case 3:
        r = p;
        g = q;
        b = v;
        break;
      case 4:
        r = t;
        g = p;
        b = v;
        break;
      case 5:
        r = v;
        g = p;
        b = q;
        break;
      default:
        r = v;
        g = t;
        b = p;
        break;
    }
    return { r: Math.floor(r * 255), g: Math.floor(g * 255), b: Math.floor(b * 255) };
  },

  rgbToHsv(rgb: RGBObject): HSVObject {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const x = Math.min(Math.min(r, g), b);
    const v = Math.max(Math.max(r, g), b);

    let h = 0;
    let s = 0;
    if (x !== v) {
      const f = r === x ? g - b : g === x ? b - r : r - g;
      const i = r === x ? 3 : g === x ? 5 : 1;
      h = ((i - f / (v - x)) * 60) % 360;
      s = (v - x) / v;
    }
    return { h, s, v };
  },

  mixRgb(rgb0: RGBObject, rgb1: RGBObject, fraction1: number): RGBObject {
    if (fraction1 <= 0) return rgb0;
    if (fraction1 >= 1) return rgb1;
    const fraction0 = 1 - fraction1;
    return {
      r: fraction0 * rgb0.r + fraction1 * rgb1.r,
      g: fraction0 * rgb0.g + fraction1 * rgb1.g,
      b: fraction0 * rgb0.b + fraction1 * rgb1.b,
    };
  },
};
