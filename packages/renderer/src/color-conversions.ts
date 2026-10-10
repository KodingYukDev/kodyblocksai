/**
 * Konversi RGB <-> HSV untuk efek warna di CPU, identik shader.
 * Port scratch-render 1.2.115 `src/util/color-conversions.js` (BSD-3-Clause).
 */

/** rgb 0..255 -> hsv 0..1. `dst` boleh array biasa. */
export function rgbToHsv(rgb: ArrayLike<number>, dst: number[]): number[] {
  let K = 0.0;
  let r = (rgb[0] as number) / 255;
  let g = (rgb[1] as number) / 255;
  let b = (rgb[2] as number) / 255;
  let tmp = 0;

  if (g < b) {
    tmp = g;
    g = b;
    b = tmp;
    K = -1;
  }
  if (r < g) {
    tmp = r;
    r = g;
    g = tmp;
    K = -2 / 6 - K;
  }

  const chroma = r - Math.min(g, b);
  dst[0] = Math.abs(K + (g - b) / (6 * chroma + Number.EPSILON));
  dst[1] = chroma / (r + Number.EPSILON);
  dst[2] = r;
  return dst;
}

/** hsv 0..1 -> rgb 0..255 (ditulis ke Uint8ClampedArray agar pembulatannya sama). */
export function hsvToRgb(hsv: ArrayLike<number>, dst: Uint8ClampedArray): Uint8ClampedArray {
  let h = hsv[0] as number;
  const s = hsv[1] as number;
  const v = hsv[2] as number;
  if (s === 0) {
    const c = v * 255 + 0.5;
    dst[0] = c;
    dst[1] = c;
    dst[2] = c;
    return dst;
  }

  h %= 1;
  const i = (h * 6) | 0;
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));

  let r = 0;
  let g = 0;
  let b = 0;
  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }

  dst[0] = r * 255 + 0.5;
  dst[1] = g * 255 + 0.5;
  dst[2] = b * 255 + 0.5;
  return dst;
}
