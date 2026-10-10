/**
 * Adaptor hasil mentah MediaPipe / COCO-SSD -> tipe hasil KodyBlocks (koordinat panggung).
 * Fungsi murni (tanpa DOM) supaya bisa dites dengan data tiruan.
 */
import type { FaceResult, HandResult, ObjectResult, PoseResult } from "../types";
import { normPointsBox, normToStage, pixelBoxToStage, round2 } from "./coords";
import { dominantExpression, expressionsFromBlendshapes } from "./face-expressions";
import type { BlendshapeCategory } from "./face-expressions";
import { classifyGesture } from "./gestures";

export interface NormLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface RawHandResult {
  landmarks: NormLandmark[][];
  handedness?: { categoryName: string; score: number }[][];
}

export interface RawFaceResult {
  faceLandmarks: NormLandmark[][];
  faceBlendshapes?: { categories: BlendshapeCategory[] }[];
}

export interface RawPoseResult {
  landmarks: NormLandmark[][];
}

export interface RawCocoDetection {
  bbox: [number, number, number, number] | number[];
  class: string;
  score: number;
}

/**
 * MediaPipe Hands mengasumsikan gambar selfie tercermin. Bila frame TIDAK dicerminkan,
 * label kiri/kanan dibalik supaya tetap tangan kiri/kanan anak yang sebenarnya.
 */
export function handsFromMediaPipe(raw: RawHandResult, mirrored: boolean): HandResult[] {
  return raw.landmarks.map((lm, i) => {
    const cat = raw.handedness?.[i]?.[0];
    let side: "Left" | "Right" = cat?.categoryName === "Left" ? "Left" : "Right";
    if (!mirrored) side = side === "Left" ? "Right" : "Left";
    const gesture = classifyGesture(lm);
    return {
      handedness: side,
      landmarks: lm.map((p) => normToStage(p.x, p.y)),
      gesture,
      gestureScore: gesture ? 1 : 0,
    };
  });
}

export function facesFromMediaPipe(raw: RawFaceResult): (FaceResult & { dominant: string })[] {
  return raw.faceLandmarks.map((lm, i) => {
    const expressions = expressionsFromBlendshapes(raw.faceBlendshapes?.[i]?.categories ?? []);
    const roundedExpr: Record<string, number> = {};
    for (const [k, v] of Object.entries(expressions)) roundedExpr[k] = round2(v);
    return {
      ...normPointsBox(lm),
      landmarks: lm.map((p) => normToStage(p.x, p.y)),
      expressions: roundedExpr,
      dominant: dominantExpression(expressions),
    };
  });
}

export function posesFromMediaPipe(raw: RawPoseResult): PoseResult[] {
  return raw.landmarks.map((lm) => ({
    keypoints: lm.map((p) => ({ ...normToStage(p.x, p.y), visibility: round2(p.visibility ?? 1) })),
  }));
}

export function objectsFromCoco(dets: readonly RawCocoDetection[], frameWidth: number, frameHeight: number): ObjectResult[] {
  return dets.map((d) => ({
    ...pixelBoxToStage(d.bbox, frameWidth, frameHeight),
    label: String(d.class),
    confidence: round2(d.score),
  }));
}
