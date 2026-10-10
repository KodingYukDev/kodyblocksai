/** Landmark tangan sintetis untuk tes gestur. */
export type Thumb = "side" | "folded" | "down";
export interface HandSpec {
  thumb: Thumb;
  index?: boolean;
  middle?: boolean;
  ring?: boolean;
  pinky?: boolean;
}

/** 21 landmark sintetis (koordinat gambar ternormalisasi, y ke bawah), telapak tegak. */
export function syntheticHand(spec: HandSpec): { x: number; y: number }[] {
  const lm: { x: number; y: number }[] = new Array(21).fill(null).map(() => ({ x: 0.5, y: 0.8 }));
  lm[0] = { x: 0.5, y: 0.8 };
  const thumbs: Record<Thumb, [number, number][]> = {
    side: [[0.42, 0.75], [0.36, 0.68], [0.31, 0.62], [0.27, 0.56]],
    folded: [[0.45, 0.75], [0.42, 0.7], [0.43, 0.66], [0.45, 0.64]],
    down: [[0.42, 0.75], [0.36, 0.68], [0.33, 0.75], [0.31, 0.82]],
  };
  thumbs[spec.thumb].forEach(([x, y], i) => (lm[1 + i] = { x, y }));
  const fingers: [number, boolean | undefined][] = [
    [0.44, spec.index],
    [0.5, spec.middle],
    [0.56, spec.ring],
    [0.62, spec.pinky],
  ];
  fingers.forEach(([x, up], f) => {
    const base = 5 + f * 4;
    lm[base] = { x, y: 0.6 };
    lm[base + 1] = { x, y: up ? 0.5 : 0.52 };
    lm[base + 2] = { x, y: up ? 0.42 : 0.58 };
    lm[base + 3] = { x, y: up ? 0.35 : 0.62 };
  });
  return lm;
}

