/**
 * Titik convex hull skin sebuah drawable (dalam piksel skin, +y ke bawah) untuk getBounds.
 * Pemindaian kiri/kanan per baris = port scratch-render 1.2.115 `RenderWebGL._getConvexHullPointsForDrawable`
 * (BSD-3-Clause). Penyederhanaan akhir (scratch-render memakai hull.js dengan concavity Infinity,
 * yang setara convex hull monotone chain) ditulis ulang di `monotoneConvexHull`.
 */
import type { Drawable } from "./drawable";
import { transformPoint } from "./effect-transform";

const determinant = (A: number[], B: number[], C: number[]): number =>
  ((B[0] as number) - (A[0] as number)) * ((C[1] as number) - (A[1] as number)) -
  ((B[1] as number) - (A[1] as number)) * ((C[0] as number) - (A[0] as number));

export function getConvexHullPointsForDrawable(drawable: Drawable): number[][] {
  const skin = drawable.skin;
  if (!skin) return [];
  const [width, height] = skin.size;
  if (!drawable.getVisible() || width === 0 || height === 0) return [];

  drawable.updateCPURenderAttributes();

  const leftHull: number[][] = [];
  const rightHull: number[][] = [];
  let leftEnd = -1;
  let rightEnd = -1;
  const pixelPos = new Float32Array(3);
  const effectPos = new Float32Array(3);
  let currentPoint: number[] = [0, 0];

  for (let y = 0; y < height; y++) {
    pixelPos[1] = y / height;

    let x = 0;
    for (; x < width; x++) {
      pixelPos[0] = x / width;
      transformPoint(drawable, pixelPos, effectPos);
      if (skin.isTouchingLinear(effectPos)) {
        currentPoint = [x, y];
        break;
      }
    }
    if (x >= width) continue;

    while (leftEnd > 0) {
      if (determinant(leftHull[leftEnd] as number[], leftHull[leftEnd - 1] as number[], currentPoint) > 0) break;
      --leftEnd;
    }
    leftHull[++leftEnd] = currentPoint;

    for (x = width - 1; x >= 0; x--) {
      pixelPos[0] = x / width;
      transformPoint(drawable, pixelPos, effectPos);
      if (skin.isTouchingLinear(effectPos)) {
        currentPoint = [x, y];
        break;
      }
    }

    while (rightEnd > 0) {
      if (determinant(rightHull[rightEnd] as number[], rightHull[rightEnd - 1] as number[], currentPoint) < 0) break;
      --rightEnd;
    }
    rightHull[++rightEnd] = currentPoint;
  }

  const hullPoints = leftHull;
  hullPoints.length = leftEnd + 1;
  for (let j = rightEnd; j >= 0; --j) hullPoints.push(rightHull[j] as number[]);

  return monotoneConvexHull(hullPoints);
}

const cross = (o: number[], a: number[], b: number[]): number =>
  ((a[0] as number) - (o[0] as number)) * ((b[1] as number) - (o[1] as number)) -
  ((a[1] as number) - (o[1] as number)) * ((b[0] as number) - (o[0] as number));

/**
 * Convex hull (Andrew monotone chain, titik kolinear dibuang), poligon ditutup dengan titik awal.
 * Kurang dari 4 titik dikembalikan apa adanya, sama dengan perilaku hull.js yang dipakai scratch-render.
 */
export function monotoneConvexHull(points: readonly number[][]): number[][] {
  if (points.length < 4) return points.slice();
  const sorted = points
    .slice()
    .sort((a, b) => ((a[0] as number) === (b[0] as number) ? (a[1] as number) - (b[1] as number) : (a[0] as number) - (b[0] as number)))
    .filter((p, i, arr) => {
      const prev = arr[i - 1];
      return i === 0 || !(prev && prev[0] === p[0] && prev[1] === p[1]);
    });
  const chain = (list: readonly number[][]): number[][] => {
    const out: number[][] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2] as number[], out[out.length - 1] as number[], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  const upper = chain(sorted);
  const reversed = sorted.slice().reverse();
  const lower = chain(reversed);
  const hull = lower.concat(upper);
  hull.push(reversed[0] as number[]);
  return hull;
}
