/**
 * Pengenal gestur tangan berbasis aturan dari 21 landmark MediaPipe Hands (tanpa model tambahan).
 * Nama gestur mengikuti kategori MediaPipe GestureRecognizer agar konsisten dengan dokumentasi.
 * Aturan memakai jarak relatif terhadap pergelangan sehingga tahan rotasi dan skala.
 */

export const GESTURES = [
  "Open_Palm",
  "Closed_Fist",
  "Pointing_Up",
  "Victory",
  "ILoveYou",
  "Thumb_Up",
  "Thumb_Down",
] as const;
export type Gesture = (typeof GESTURES)[number];

export const GESTURE_LABELS_ID: Record<Gesture, string> = {
  Open_Palm: "telapak terbuka",
  Closed_Fist: "kepalan",
  Pointing_Up: "menunjuk ke atas",
  Victory: "victory (V)",
  ILoveYou: "I love you",
  Thumb_Up: "jempol ke atas",
  Thumb_Down: "jempol ke bawah",
};

interface P {
  x: number;
  y: number;
}

const dist = (a: P, b: P): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Indeks landmark MediaPipe Hands. */
const WRIST = 0;
const THUMB = { cmc: 1, mcp: 2, ip: 3, tip: 4 } as const;
const FINGERS = [
  { mcp: 5, pip: 6, tip: 8 }, // telunjuk
  { mcp: 9, pip: 10, tip: 12 }, // tengah
  { mcp: 13, pip: 14, tip: 16 }, // manis
  { mcp: 17, pip: 18, tip: 20 }, // kelingking
] as const;

export interface FingerState {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

export function fingerStates(lm: readonly P[]): FingerState | null {
  if (lm.length < 21) return null;
  const get = (i: number): P => lm[i] as P;
  const wrist = get(WRIST);
  const extended = (f: { mcp: number; pip: number; tip: number }): boolean =>
    dist(get(f.tip), wrist) > dist(get(f.pip), wrist) * 1.15;
  const [index, middle, ring, pinky] = FINGERS.map(extended) as [boolean, boolean, boolean, boolean];
  // Jempol lurus: ujung jauh dari pangkal telunjuk dibanding sendi IP, dan ruas jempol hampir lurus.
  const thumbFar = dist(get(THUMB.tip), get(5)) > dist(get(THUMB.ip), get(5)) * 1.1;
  const thumbStraight = dist(get(THUMB.tip), get(THUMB.mcp)) > 0.8 * (dist(get(THUMB.tip), get(THUMB.ip)) + dist(get(THUMB.ip), get(THUMB.mcp)));
  return { thumb: thumbFar && thumbStraight, index, middle, ring, pinky };
}

/** Gestur tangan, atau null bila tidak ada yang cocok. Landmark dalam koordinat gambar (y ke bawah). */
export function classifyGesture(lm: readonly P[]): Gesture | null {
  const s = fingerStates(lm);
  if (!s) return null;
  const fourDown = !s.index && !s.middle && !s.ring && !s.pinky;
  const handSize = dist(lm[WRIST] as P, lm[9] as P) || 1e-6;
  if (s.thumb && s.index && s.middle && s.ring && s.pinky) return "Open_Palm";
  if (s.thumb && s.index && !s.middle && !s.ring && s.pinky) return "ILoveYou";
  if (s.index && s.middle && !s.ring && !s.pinky) return "Victory";
  if (s.index && !s.middle && !s.ring && !s.pinky) {
    const tip = lm[8] as P;
    const mcp = lm[5] as P;
    // Ujung telunjuk jelas di atas pangkalnya.
    if (mcp.y - tip.y > 0.5 * handSize) return "Pointing_Up";
    return null;
  }
  if (fourDown && s.thumb) {
    const tip = lm[THUMB.tip] as P;
    const mcp = lm[THUMB.mcp] as P;
    const dy = tip.y - mcp.y;
    if (dy < -0.35 * handSize) return "Thumb_Up";
    if (dy > 0.35 * handSize) return "Thumb_Down";
    return null;
  }
  if (fourDown && !s.thumb) return "Closed_Fist";
  return null;
}
