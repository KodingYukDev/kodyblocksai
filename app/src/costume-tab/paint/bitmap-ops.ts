/**
 * Operasi piksel murni untuk mode bitmap paint editor (tanpa canvas, mudah dites).
 * Kanvas bitmap 960x720 piksel = panggung 480x360 pada bitmapResolution 2, pusat rotasi (480,360).
 */

export const BITMAP_W = 960;
export const BITMAP_H = 720;
export const BITMAP_CX = 480;
export const BITMAP_CY = 360;

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type RGBA = readonly [number, number, number, number];

export function createPixels(width = BITMAP_W, height = BITMAP_H): Pixels {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function clonePixels(p: Pixels): Pixels {
  return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) };
}

/** "#rrggbb" atau "#rrggbbaa" -> RGBA. Warna transparan = [0,0,0,0]. */
export function parseHex(hex: string): RGBA {
  if (hex === "transparent" || hex === "none") return [0, 0, 0, 0];
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
  if (!m) return [0, 0, 0, 255];
  const n = parseInt(m[1] ?? "000000", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) : 255];
}

export function getPixel(p: Pixels, x: number, y: number): RGBA {
  const o = (y * p.width + x) * 4;
  return [p.data[o] ?? 0, p.data[o + 1] ?? 0, p.data[o + 2] ?? 0, p.data[o + 3] ?? 0];
}

function put(p: Pixels, x: number, y: number, c: RGBA, blend: boolean): void {
  if (x < 0 || y < 0 || x >= p.width || y >= p.height) return;
  const o = (y * p.width + x) * 4;
  const d = p.data;
  if (!blend || c[3] === 255) {
    d[o] = c[0];
    d[o + 1] = c[1];
    d[o + 2] = c[2];
    d[o + 3] = c[3];
    return;
  }
  // "source-over" sederhana untuk warna semi transparan.
  const sa = c[3] / 255;
  const da = (d[o + 3] ?? 0) / 255;
  const oa = sa + da * (1 - sa);
  if (oa === 0) return;
  for (let k = 0; k < 3; k++) d[o + k] = ((c[k] ?? 0) * sa + (d[o + k] ?? 0) * da * (1 - sa)) / oa;
  d[o + 3] = oa * 255;
}

/** Cap lingkaran penuh (kuas/penghapus). eraser=true menulis transparan. */
export function stampCircle(p: Pixels, cx: number, cy: number, radius: number, c: RGBA, eraser = false): void {
  const r = Math.max(0.5, radius);
  const x0 = Math.floor(cx - r);
  const x1 = Math.ceil(cx + r);
  const y0 = Math.floor(cy - r);
  const y1 = Math.ceil(cy + r);
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) put(p, x, y, eraser ? [0, 0, 0, 0] : c, false);
    }
  }
}

/** Goresan kuas dari (x0,y0) ke (x1,y1): cap lingkaran setiap ~setengah radius. */
export function strokeLine(p: Pixels, x0: number, y0: number, x1: number, y1: number, width: number, c: RGBA, eraser = false): void {
  const r = width / 2;
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / Math.max(0.5, r / 2)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    stampCircle(p, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, c, eraser);
  }
}

export function fillRect(p: Pixels, x: number, y: number, w: number, h: number, c: RGBA): void {
  const xa = Math.max(0, Math.round(Math.min(x, x + w)));
  const xb = Math.min(p.width, Math.round(Math.max(x, x + w)));
  const ya = Math.max(0, Math.round(Math.min(y, y + h)));
  const yb = Math.min(p.height, Math.round(Math.max(y, y + h)));
  for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) put(p, xx, yy, c, true);
}

export function strokeRect(p: Pixels, x: number, y: number, w: number, h: number, width: number, c: RGBA): void {
  strokeLine(p, x, y, x + w, y, width, c);
  strokeLine(p, x + w, y, x + w, y + h, width, c);
  strokeLine(p, x + w, y + h, x, y + h, width, c);
  strokeLine(p, x, y + h, x, y, width, c);
}

export function fillEllipse(p: Pixels, cx: number, cy: number, rx: number, ry: number, c: RGBA): void {
  if (rx <= 0 || ry <= 0) return;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) put(p, x, y, c, true);
    }
  }
}

export function strokeEllipse(p: Pixels, cx: number, cy: number, rx: number, ry: number, width: number, c: RGBA): void {
  const n = Math.max(24, Math.ceil((rx + ry) * 1.5));
  let px = cx + rx;
  let py = cy;
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = cx + rx * Math.cos(a);
    const y = cy + ry * Math.sin(a);
    strokeLine(p, px, py, x, y, width, c);
    px = x;
    py = y;
  }
}

const sameColor = (d: Uint8ClampedArray, o: number, c: RGBA, tol: number): boolean =>
  Math.abs((d[o] ?? 0) - c[0]) <= tol && Math.abs((d[o + 1] ?? 0) - c[1]) <= tol && Math.abs((d[o + 2] ?? 0) - c[2]) <= tol && Math.abs((d[o + 3] ?? 0) - c[3]) <= tol;

/** Isi wilayah bersambung (4 arah) yang warnanya sama dengan titik awal. Mengembalikan jumlah piksel. */
export function floodFill(p: Pixels, sx: number, sy: number, c: RGBA, tolerance = 0): number {
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  if (x0 < 0 || y0 < 0 || x0 >= p.width || y0 >= p.height) return 0;
  const target = getPixel(p, x0, y0);
  if (target.every((v, i) => v === c[i])) return 0;
  const { width, height, data } = p;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [y0 * width + x0];
  let count = 0;
  while (stack.length) {
    const i = stack.pop() ?? 0;
    if (seen[i]) continue;
    seen[i] = 1;
    if (!sameColor(data, i * 4, target, tolerance)) continue;
    data[i * 4] = c[0];
    data[i * 4 + 1] = c[1];
    data[i * 4 + 2] = c[2];
    data[i * 4 + 3] = c[3];
    count++;
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) stack.push(i - 1);
    if (x < width - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - width);
    if (y < height - 1) stack.push(i + width);
  }
  return count;
}

/** Kotak batas piksel tidak transparan, atau null bila kosong. */
export function opaqueBounds(p: Pixels): { x: number; y: number; w: number; h: number } | null {
  let x0 = p.width;
  let y0 = p.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if ((p.data[(y * p.width + x) * 4 + 3] ?? 0) > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function crop(p: Pixels, x: number, y: number, w: number, h: number): Pixels {
  const out = createPixels(w, h);
  for (let yy = 0; yy < h; yy++) {
    const sy = y + yy;
    if (sy < 0 || sy >= p.height) continue;
    for (let xx = 0; xx < w; xx++) {
      const sx = x + xx;
      if (sx < 0 || sx >= p.width) continue;
      const so = (sy * p.width + sx) * 4;
      out.data.set(p.data.subarray(so, so + 4), (yy * w + xx) * 4);
    }
  }
  return out;
}

/** Tempel src ke dst di (x,y) dengan blending. */
export function blit(dst: Pixels, src: Pixels, x: number, y: number): void {
  for (let yy = 0; yy < src.height; yy++) {
    for (let xx = 0; xx < src.width; xx++) {
      const o = (yy * src.width + xx) * 4;
      const a = src.data[o + 3] ?? 0;
      if (a === 0) continue;
      put(dst, Math.round(x + xx), Math.round(y + yy), [src.data[o] ?? 0, src.data[o + 1] ?? 0, src.data[o + 2] ?? 0, a], true);
    }
  }
}

/** Pindahkan isi kotak sejauh (dx,dy): area asal dikosongkan. */
export function moveRegion(p: Pixels, x: number, y: number, w: number, h: number, dx: number, dy: number): void {
  const piece = crop(p, x, y, w, h);
  for (let yy = Math.max(0, y); yy < Math.min(p.height, y + h); yy++) p.data.fill(0, (yy * p.width + Math.max(0, x)) * 4, (yy * p.width + Math.min(p.width, x + w)) * 4);
  blit(p, piece, x + dx, y + dy);
}

/** Geser seluruh gambar (alat pusat rotasi pada bitmap). */
export function shiftAll(p: Pixels, dx: number, dy: number): Pixels {
  const out = createPixels(p.width, p.height);
  blit(out, p, Math.round(dx), Math.round(dy));
  return out;
}

export interface CroppedBitmap {
  pixels: Pixels;
  rotationCenterX: number;
  rotationCenterY: number;
}

/** Siapkan costume bitmap untuk disimpan: potong ke isi; pusat rotasi = (480,360) relatif potongan. */
export function cropForSave(p: Pixels): CroppedBitmap {
  const b = opaqueBounds(p);
  if (!b) return { pixels: createPixels(2, 2), rotationCenterX: 1, rotationCenterY: 1 };
  return { pixels: crop(p, b.x, b.y, b.w, b.h), rotationCenterX: BITMAP_CX - b.x, rotationCenterY: BITMAP_CY - b.y };
}
