/**
 * Kotak sejajar sumbu dalam koordinat panggung Scratch (+y ke atas).
 * Port scratch-render 1.2.115 `src/Rectangle.js` (BSD-3-Clause, lihat packages/renderer/THIRD_PARTY.md).
 */
import type { Rect } from "@kody/engine";

export type Point2 = ArrayLike<number>;

export class Rectangle implements Rect {
  left = -Infinity;
  right = Infinity;
  bottom = -Infinity;
  top = Infinity;

  initFromBounds(left: number, right: number, bottom: number, top: number): this {
    this.left = left;
    this.right = right;
    this.bottom = bottom;
    this.top = top;
    return this;
  }

  initFromPointsAABB(points: readonly Point2[]): this {
    this.left = Infinity;
    this.right = -Infinity;
    this.top = -Infinity;
    this.bottom = Infinity;
    for (let i = 0; i < points.length; i++) {
      const p = points[i] as Point2;
      const x = p[0] as number;
      const y = p[1] as number;
      if (x < this.left) this.left = x;
      if (x > this.right) this.right = x;
      if (y > this.top) this.top = y;
      if (y < this.bottom) this.bottom = y;
    }
    return this;
  }

  /** Persegi satuan berpusat 0,0 yang ditransformasi matriks model 4x4 (kolom-mayor). */
  initFromModelMatrix(m: ArrayLike<number>): this {
    const m30 = m[12] as number;
    const m31 = m[13] as number;
    const x = Math.abs(0.5 * (m[0] as number)) + Math.abs(0.5 * (m[4] as number));
    const y = Math.abs(0.5 * (m[1] as number)) + Math.abs(0.5 * (m[5] as number));
    this.left = -x + m30;
    this.right = x + m30;
    this.top = y + m31;
    this.bottom = -y + m31;
    return this;
  }

  intersects(other: Rect): boolean {
    return this.left <= other.right && other.left <= this.right && this.top >= other.bottom && other.top >= this.bottom;
  }

  contains(other: Rect): boolean {
    return other.left > this.left && other.right < this.right && other.top < this.top && other.bottom > this.bottom;
  }

  clamp(left: number, right: number, bottom: number, top: number): void {
    this.left = Math.max(this.left, left);
    this.right = Math.min(this.right, right);
    this.bottom = Math.max(this.bottom, bottom);
    this.top = Math.min(this.top, top);

    this.left = Math.min(this.left, right);
    this.right = Math.max(this.right, left);
    this.bottom = Math.min(this.bottom, top);
    this.top = Math.max(this.top, bottom);
  }

  snapToInt(): void {
    this.left = Math.floor(this.left);
    this.right = Math.ceil(this.right);
    this.bottom = Math.floor(this.bottom);
    this.top = Math.ceil(this.top);
  }

  get width(): number {
    return Math.abs(this.left - this.right);
  }

  get height(): number {
    return Math.abs(this.top - this.bottom);
  }

  /** Salinan polos (objek Rect biasa) untuk dikembalikan ke engine. */
  toRect(): Rect {
    return { left: this.left, right: this.right, top: this.top, bottom: this.bottom };
  }

  static intersect(a: Rect, b: Rect, result: Rectangle = new Rectangle()): Rectangle {
    result.left = Math.max(a.left, b.left);
    result.right = Math.min(a.right, b.right);
    result.top = Math.min(a.top, b.top);
    result.bottom = Math.max(a.bottom, b.bottom);
    return result;
  }

  static union(a: Rect, b: Rect, result: Rectangle = new Rectangle()): Rectangle {
    result.left = Math.min(a.left, b.left);
    result.right = Math.max(a.right, b.right);
    result.top = Math.max(a.top, b.top);
    result.bottom = Math.min(a.bottom, b.bottom);
    return result;
  }
}
