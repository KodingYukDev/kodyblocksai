/**
 * Pengenalan opcode & id ekstensi. `getExtensionIdForOpcode` port dari scratch-vm 4.8.102
 * src/serialization/sb3.js (BSD-3-Clause, lihat THIRD_PARTY.md).
 */
import { getOpcodeSpec } from "@kody/engine";

/** Prefix opcode bawaan (bukan ekstensi), persis CORE_EXTENSIONS sb3.js. */
export const CORE_EXTENSIONS: readonly string[] = [
  "argument",
  "colour",
  "control",
  "data",
  "event",
  "looks",
  "math",
  "motion",
  "operator",
  "procedures",
  "sensing",
  "sound",
];

/** Ekstensi yang tersedia di KodyBlocks AI v2 (id sama dengan Scratch untuk pen & music). */
export const SUPPORTED_EXTENSIONS: readonly string[] = [
  "pen",
  "music",
  "aiFace",
  "aiHand",
  "aiPose",
  "aiImage",
  "aiObject",
  "aiText",
  "aiAudio",
];

/** Nama ekstensi Scratch resmi yang belum didukung, untuk pesan penolakan yang jelas. */
const SCRATCH_ONLY_EXTENSIONS: Readonly<Record<string, string>> = {
  videoSensing: "Video Sensing",
  text2speech: "Text to Speech",
  translate: "Translate",
  makeymakey: "Makey Makey",
  microbit: "micro:bit",
  ev3: "LEGO MINDSTORMS EV3",
  boost: "LEGO BOOST",
  wedo2: "LEGO Education WeDo 2.0",
  gdxfor: "Go Direct Force & Acceleration",
};

/**
 * Id ekstensi non-core untuk sebuah opcode, atau undefined untuk opcode core / tanpa prefix.
 * Karakter di luar [\w-] diganti "-" (tidak pernah menghasilkan URL).
 */
export function getExtensionIdForOpcode(opcode: string): string | undefined {
  const index = opcode.indexOf("_");
  const prefix = opcode.substring(0, index).replace(/[^\w-]/g, "-");
  if (CORE_EXTENSIONS.indexOf(prefix) === -1) {
    if (prefix !== "") return prefix;
  }
  return undefined;
}

/** Opcode ada di katalog engine (core, shadow, pen, music, AI). */
export function isKnownOpcode(opcode: string): boolean {
  return getOpcodeSpec(opcode) !== undefined;
}

/** Pesan Indonesia mengapa opcode tidak dikenali. */
export function describeUnknownOpcode(opcode: string): string {
  const ext = getExtensionIdForOpcode(opcode);
  if (ext !== undefined) {
    const scratchName = SCRATCH_ONLY_EXTENSIONS[ext];
    if (scratchName) return `blok "${opcode}" dari ekstensi Scratch "${scratchName}" belum didukung KodyBlocks`;
    if (SUPPORTED_EXTENSIONS.includes(ext)) return `blok "${opcode}" tidak dikenal di ekstensi "${ext}"`;
    return `blok "${opcode}" dari ekstensi tak dikenal "${ext}"`;
  }
  return `opcode "${opcode}" tidak dikenal`;
}
