/**
 * Silhouette skin: uji piksel buram & sampel warna di CPU.
 * Port scratch-render 1.2.115 `src/Silhouette.js` (BSD-3-Clause).
 */
import type { PixelData } from "./pixel-source";

const intMin = (i: number, j: number): number => j ^ ((i ^ j) & ((i - j) >> 31));
const intMax = (i: number, j: number): number => i ^ ((i ^ j) & ((i - j) >> 31));

const cornerWork = [new Uint8ClampedArray(4), new Uint8ClampedArray(4), new Uint8ClampedArray(4), new Uint8ClampedArray(4)];

export class Silhouette {
  private width = 0;
  private height = 0;
  private colorData: Uint8ClampedArray | null = null;
  private premultiplied = false;

  get dataWidth(): number {
    return this.width;
  }
  get dataHeight(): number {
    return this.height;
  }
  get hasData(): boolean {
    return this.colorData !== null;
  }

  /** Perbarui dari data RGBA. `isPremultiplied` true untuk data hasil pena (readPixels). */
  update(pixels: PixelData, isPremultiplied = false): void {
    this.width = pixels.width;
    this.height = pixels.height;
    if (!(this.width && this.height)) {
      // Ukuran nol: tidak ada piksel yang bisa disentuh (scratch-render mengembalikan falsy).
      this.colorData = null;
      return;
    }
    this.premultiplied = isPremultiplied;
    this.colorData = pixels.data;
  }

  /** Alpha piksel (x,y), 0 bila di luar. */
  private getPoint(x: number, y: number): number {
    if (x >= this.width || y >= this.height || x < 0 || y < 0) return 0;
    return (this.colorData as Uint8ClampedArray)[(y * this.width + x) * 4 + 3] as number;
  }

  private getColor(x: number, y: number, dst: Uint8ClampedArray): Uint8ClampedArray {
    const data = this.colorData as Uint8ClampedArray;
    // Jepit ke tepi, seperti GL_CLAMP_TO_EDGE.
    x = intMax(0, intMin(x, this.width - 1));
    y = intMax(0, intMin(y, this.height - 1));
    const offset = (y * this.width + x) * 4;
    if (this.premultiplied) {
      dst[0] = data[offset] as number;
      dst[1] = data[offset + 1] as number;
      dst[2] = data[offset + 2] as number;
      dst[3] = data[offset + 3] as number;
      return dst;
    }
    if (x >= this.width || y >= this.height || x < 0 || y < 0) return dst.fill(0);
    const alpha = (data[offset + 3] as number) / 255;
    dst[0] = (data[offset] as number) * alpha;
    dst[1] = (data[offset + 1] as number) * alpha;
    dst[2] = (data[offset + 2] as number) * alpha;
    dst[3] = data[offset + 3] as number;
    return dst;
  }

  colorAtNearest(vec: ArrayLike<number>, dst: Uint8ClampedArray): Uint8ClampedArray {
    if (!this.colorData) return dst.fill(0);
    return this.getColor(
      Math.floor((vec[0] as number) * (this.width - 1)),
      Math.floor((vec[1] as number) * (this.height - 1)),
      dst,
    );
  }

  colorAtLinear(vec: ArrayLike<number>, dst: Uint8ClampedArray): Uint8ClampedArray {
    if (!this.colorData) return dst.fill(0);
    const x = (vec[0] as number) * (this.width - 1);
    const y = (vec[1] as number) * (this.height - 1);
    const x1D = x % 1;
    const y1D = y % 1;
    const x0D = 1 - x1D;
    const y0D = 1 - y1D;
    const xFloor = Math.floor(x);
    const yFloor = Math.floor(y);
    const a = this.getColor(xFloor, yFloor, cornerWork[0] as Uint8ClampedArray);
    const b = this.getColor(xFloor + 1, yFloor, cornerWork[1] as Uint8ClampedArray);
    const c = this.getColor(xFloor, yFloor + 1, cornerWork[2] as Uint8ClampedArray);
    const d = this.getColor(xFloor + 1, yFloor + 1, cornerWork[3] as Uint8ClampedArray);
    for (let i = 0; i < 4; i++) {
      dst[i] =
        (a[i] as number) * x0D * y0D +
        (c[i] as number) * x0D * y1D +
        (b[i] as number) * x1D * y0D +
        (d[i] as number) * x1D * y1D;
    }
    return dst;
  }

  isTouchingNearest(vec: ArrayLike<number>): boolean {
    if (!this.colorData) return false;
    return (
      this.getPoint(Math.floor((vec[0] as number) * (this.width - 1)), Math.floor((vec[1] as number) * (this.height - 1))) > 0
    );
  }

  isTouchingLinear(vec: ArrayLike<number>): boolean {
    if (!this.colorData) return false;
    const x = Math.floor((vec[0] as number) * (this.width - 1));
    const y = Math.floor((vec[1] as number) * (this.height - 1));
    return this.getPoint(x, y) > 0 || this.getPoint(x + 1, y) > 0 || this.getPoint(x, y + 1) > 0 || this.getPoint(x + 1, y + 1) > 0;
  }
}
