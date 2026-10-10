/** Port scratch-vm 4.8.102 src/util/math-util.js (BSD-3-Clause), lihat THIRD_PARTY.md. */

export const MathUtil = {
  degToRad(deg: number): number {
    return (deg * Math.PI) / 180;
  },
  radToDeg(rad: number): number {
    return (rad * 180) / Math.PI;
  },
  clamp(n: number, min: number, max: number): number {
    return Math.min(Math.max(n, min), max);
  },
  /** wrapClamp persis scratch-vm (setDirection memakai wrapClamp(d, -179, 180)). */
  wrapClamp(n: number, min: number, max: number): number {
    const range = max - min + 1;
    return n - Math.floor((n - min) / range) * range;
  },
  /** tan dengan kasus 90/270 -> +-Infinity persis scratch-vm. */
  tan(angleIn: number): number {
    const angle = angleIn % 360;
    switch (angle) {
      case -270:
      case 90:
        return Infinity;
      case -90:
      case 270:
        return -Infinity;
      default:
        return parseFloat(Math.tan((Math.PI * angle) / 180).toFixed(10));
    }
  },
  /** [5, 19, 13, 1] -> [1, 3, 2, 0]: posisi tiap elemen dalam versi terurut. */
  reducedSortOrdering(elts: number[]): number[] {
    const sorted = elts.slice(0).sort((a, b) => a - b);
    return elts.map((e) => sorted.indexOf(e));
  },
  /** Bilangan bulat acak di [lower, upper] kecuali `excluded` (yang wajib ada di rentang itu). */
  inclusiveRandIntWithout(lower: number, upper: number, excluded: number, random: () => number = Math.random): number {
    const possibleOptions = upper - lower;
    const randInt = lower + Math.floor(random() * possibleOptions);
    if (randInt >= excluded) return randInt + 1;
    return randInt;
  },
  scale(i: number, iMin: number, iMax: number, oMin: number, oMax: number): number {
    // Urutan operasi sama dengan scratch-vm agar hasil floating point identik.
    const frac = (i - iMin) / (iMax - iMin);
    return oMin + frac * (oMax - oMin);
  },
};

/**
 * Sumber acak runtime. IRuntime belum punya `random()`; bila runtime menyediakannya
 * (RuntimeOptions.random), pakai itu agar tes/parity deterministik, selain itu Math.random.
 */
export function getRuntimeRandom(runtime: unknown): () => number {
  if (typeof runtime === "object" && runtime !== null) {
    const fn = (runtime as { random?: unknown }).random;
    if (typeof fn === "function") return () => (fn as () => number).call(runtime);
  }
  return Math.random;
}
