/** Tipe kasus parity dan aksi IO yang disuntikkan per frame (sama persis untuk kedua VM). */
import type { SB3Json } from "./fixtures";

export type ParityCategory =
  | "motion"
  | "looks"
  | "sound"
  | "events"
  | "control"
  | "sensing"
  | "operators"
  | "variables"
  | "lists"
  | "myBlocks"
  | "combined";

export const PARITY_CATEGORIES: readonly ParityCategory[] = [
  "motion",
  "looks",
  "sound",
  "events",
  "control",
  "sensing",
  "operators",
  "variables",
  "lists",
  "myBlocks",
  "combined",
];

/** Koordinat mouse = koordinat klien kanvas 480x360 (0,0 kiri atas), seperti postIOData scratch-gui. */
export type ParityAction =
  | { frame: number; kind: "key"; key: string; isDown: boolean }
  | { frame: number; kind: "mouse"; x: number; y: number; isDown?: boolean }
  | { frame: number; kind: "wheel"; deltaY: number }
  | { frame: number; kind: "answer"; text: string }
  | { frame: number; kind: "username"; name: string }
  | { frame: number; kind: "greenFlag" }
  | { frame: number; kind: "stopAll" };

export interface ParityCase {
  /** Unik, bentuk `<kategori>/<nama>`. */
  id: string;
  category: ParityCategory;
  title: string;
  project: SB3Json;
  frames: number;
  /** Seed PRNG blok (default 1). */
  seed?: number;
  /** Default true. */
  greenFlag?: boolean;
  /** Default true (30 fps). */
  compatibilityMode?: boolean;
  turbo?: boolean;
  actions?: ParityAction[];
  /** Opcode yang menjadi fokus kasus ini (untuk laporan; cakupan dihitung dari isi project). */
  focus: string[];
}

export const CANVAS = { width: 480, height: 360 } as const;
