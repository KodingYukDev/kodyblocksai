/**
 * Fitur pose tubuh & gestur tangan untuk classifier AI Lab: titik landmark dinormalisasi
 * (digeser ke pusat, dibagi ukuran tubuh/tangan) sehingga model tidak bergantung pada posisi
 * anak di kamera atau jaraknya. Yang disimpan hanya angka koordinat ini, bukan foto.
 */
import type { HandResult, Point2, PoseResult } from "../types";

export const HAND_POINTS = 21;
export const HAND_FEATURE_DIM = HAND_POINTS * 2;
export const POSE_POINTS = 33;
/** x, y, terlihat (0/1) per titik. */
export const POSE_FEATURE_DIM = POSE_POINTS * 3;
const MIN_VISIBILITY = 0.5;

const finite = (n: number): number => (Number.isFinite(n) ? n : 0);

/** Tangan: relatif ke pergelangan, dibagi jarak terjauh. null bila data tidak lengkap. */
export function handFeatures(hand: HandResult | undefined): Float32Array | null {
  const lm = hand?.landmarks;
  if (!lm || lm.length < HAND_POINTS) return null;
  const wrist = lm[0] as Point2;
  let scale = 0;
  for (let i = 0; i < HAND_POINTS; i++) {
    const p = lm[i] as Point2;
    scale = Math.max(scale, Math.hypot(p.x - wrist.x, p.y - wrist.y));
  }
  if (!(scale > 0)) return null;
  const out = new Float32Array(HAND_FEATURE_DIM);
  for (let i = 0; i < HAND_POINTS; i++) {
    const p = lm[i] as Point2;
    out[i * 2] = finite((p.x - wrist.x) / scale);
    out[i * 2 + 1] = finite((p.y - wrist.y) / scale);
  }
  return out;
}

/** Pose: relatif ke titik tengah bahu (atau pinggul), dibagi lebar bahu/tinggi badan. */
export function poseFeatures(pose: PoseResult | undefined): Float32Array | null {
  const kp = pose?.keypoints;
  if (!kp || kp.length < POSE_POINTS) return null;
  const visible = kp.map((p) => p.visibility >= MIN_VISIBILITY);
  const pts = kp.filter((_, i) => visible[i]);
  if (pts.length < 4) return null;
  // Pusat = rata-rata titik terlihat; skala = sisi terpanjang kotak pembatasnya.
  let cx = 0;
  let cy = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  cx /= pts.length;
  cy /= pts.length;
  const scale = Math.max(maxX - minX, maxY - minY);
  if (!(scale > 0)) return null;
  const out = new Float32Array(POSE_FEATURE_DIM);
  for (let i = 0; i < POSE_POINTS; i++) {
    if (!visible[i]) continue;
    const p = kp[i] as Point2;
    out[i * 3] = finite((p.x - cx) / scale);
    out[i * 3 + 1] = finite((p.y - cy) / scale);
    out[i * 3 + 2] = 1;
  }
  return out;
}

/** Titik untuk menggambar kerangka kecil dari vektor fitur (thumbnail tanpa foto). */
export function featurePoints(kind: "pose" | "hand", features: ArrayLike<number>): (Point2 | null)[] {
  const out: (Point2 | null)[] = [];
  if (kind === "hand") {
    for (let i = 0; i < HAND_POINTS; i++) out.push({ x: features[i * 2] ?? 0, y: features[i * 2 + 1] ?? 0 });
  } else {
    for (let i = 0; i < POSE_POINTS; i++) {
      out.push((features[i * 3 + 2] ?? 0) > 0 ? { x: features[i * 3] ?? 0, y: features[i * 3 + 1] ?? 0 } : null);
    }
  }
  return out;
}

/** Garis kerangka (pasangan indeks) untuk thumbnail & pratinjau. */
export const HAND_EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

export const POSE_EDGES: readonly (readonly [number, number])[] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
  [0, 11], [0, 12],
];
