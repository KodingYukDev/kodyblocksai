/**
 * Ekspresi wajah sederhana dari blendshape MediaPipe FaceLandmarker.
 * HANYA ekspresi (senyum, terkejut, ...). Tidak ada pengenalan identitas, umur, gender,
 * atau embedding wajah yang bisa dipakai mengenali orang.
 */

export interface BlendshapeCategory {
  categoryName: string;
  score: number;
}

export const EXPRESSIONS = ["senang", "terkejut", "sedih", "mulut terbuka", "mata tertutup"] as const;
export type Expression = (typeof EXPRESSIONS)[number];
export const NEUTRAL_EXPRESSION = "netral";

/** Ekspresi yang bersaing untuk "ekspresi utama". */
const DOMINANT_CANDIDATES: Expression[] = ["senang", "terkejut", "sedih"];
const DOMINANT_THRESHOLD = 0.4;

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export function expressionsFromBlendshapes(categories: readonly BlendshapeCategory[]): Record<Expression, number> {
  const s = new Map<string, number>();
  for (const c of categories) s.set(c.categoryName, clamp01(c.score));
  const g = (name: string): number => s.get(name) ?? 0;
  const avg = (...v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
  return {
    senang: clamp01(avg(g("mouthSmileLeft"), g("mouthSmileRight"))),
    terkejut: clamp01(avg(g("jawOpen"), g("browInnerUp"), avg(g("eyeWideLeft"), g("eyeWideRight")))),
    sedih: clamp01(avg(g("mouthFrownLeft"), g("mouthFrownRight"), g("browInnerUp") * 0.5 + avg(g("browDownLeft"), g("browDownRight")) * 0.5)),
    "mulut terbuka": g("jawOpen"),
    "mata tertutup": clamp01(avg(g("eyeBlinkLeft"), g("eyeBlinkRight"))),
  };
}

export function dominantExpression(expr: Partial<Record<string, number>>): string {
  let best = NEUTRAL_EXPRESSION;
  let bestScore = DOMINANT_THRESHOLD;
  for (const name of DOMINANT_CANDIDATES) {
    const score = expr[name] ?? 0;
    if (score > bestScore) {
      best = name;
      bestScore = score;
    }
  }
  return best;
}
