/**
 * Konversi koordinat hasil model (ternormalisasi 0..1, y ke bawah, relatif frame yang DIANALISIS)
 * ke koordinat panggung Scratch (x -240..240, y -180..180, y ke atas).
 * Frame yang dianalisis = frame yang ditampilkan (sudah dicerminkan bila mode cermin),
 * sehingga titik di panggung pas dengan gambar video yang dilihat anak.
 */
import type { BoxResult, Point2 } from "../types";

export const STAGE_WIDTH = 480;
export const STAGE_HEIGHT = 360;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const finite = (v: number): number => (Number.isFinite(v) ? v : 0.5);

export function normToStage(nx: number, ny: number): Point2 {
  const x = (clamp(finite(nx), 0, 1) - 0.5) * STAGE_WIDTH;
  const y = (0.5 - clamp(finite(ny), 0, 1)) * STAGE_HEIGHT;
  return { x: round2(x), y: round2(y) };
}

/** Kotak piksel (kiri-atas, lebar, tinggi) pada frame w x h -> kotak panggung berpusat. */
export function pixelBoxToStage(bbox: readonly number[], frameWidth: number, frameHeight: number): BoxResult {
  const [bx = 0, by = 0, bw = 0, bh = 0] = bbox;
  const w = frameWidth > 0 ? frameWidth : STAGE_WIDTH;
  const h = frameHeight > 0 ? frameHeight : STAGE_HEIGHT;
  const center = normToStage((bx + bw / 2) / w, (by + bh / 2) / h);
  return {
    x: center.x,
    y: center.y,
    width: round2((bw / w) * STAGE_WIDTH),
    height: round2((bh / h) * STAGE_HEIGHT),
  };
}

/** Kotak pembatas sekumpulan titik ternormalisasi -> kotak panggung berpusat. */
export function normPointsBox(points: readonly { x: number; y: number }[]): BoxResult {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of points) {
    const px = clamp(finite(p.x), 0, 1);
    const py = clamp(finite(p.y), 0, 1);
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  const center = normToStage((minX + maxX) / 2, (minY + maxY) / 2);
  return {
    x: center.x,
    y: center.y,
    width: round2((maxX - minX) * STAGE_WIDTH),
    height: round2((maxY - minY) * STAGE_HEIGHT),
  };
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
