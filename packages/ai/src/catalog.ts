/** Katalog ekstensi AI untuk galeri ekstensi app. Modul dimuat lazy. */
import type { ExtensionCatalogEntry } from "@kody/engine";

export const AI_EXTENSIONS: ExtensionCatalogEntry[] = [
  {
    id: "aiFace",
    name: "Deteksi Wajah",
    description: "MediaPipe FaceLandmarker (lokal)",
    requires: ["camera"],
    load: async () => (await import("./extensions/face")).createAiFaceExtension,
  },
  {
    id: "aiHand",
    name: "Deteksi Tangan",
    description: "MediaPipe HandLandmarker + GestureRecognizer (lokal)",
    requires: ["camera"],
    load: async () => (await import("./extensions/hand")).createAiHandExtension,
  },
  {
    id: "aiPose",
    name: "Deteksi Tubuh",
    description: "MediaPipe PoseLandmarker (lokal)",
    requires: ["camera"],
    load: async () => (await import("./extensions/pose")).createAiPoseExtension,
  },
  {
    id: "aiImage",
    name: "Klasifikasi Gambar",
    description: "MobileNet feature + classifier dari AI Lab (lokal)",
    requires: ["camera"],
    load: async () => (await import("./extensions/image")).createAiImageExtension,
  },
  {
    id: "aiObject",
    name: "Deteksi Objek",
    description: "COCO-SSD tfjs (lokal)",
    requires: ["camera"],
    load: async () => (await import("./extensions/object")).createAiObjectExtension,
  },
  {
    id: "aiText",
    name: "Klasifikasi Teks",
    description: "classifier teks dari AI Lab + suara text-to-speech (lokal)",
    requires: [],
    load: async () => (await import("./extensions/text")).createAiTextExtension,
  },
  {
    id: "aiAudio",
    name: "Suara AI",
    description: "classifier suara dari AI Lab (lokal) + pengenalan ucapan (lokal bila didukung browser, selain itu butuh izin internet)",
    requires: ["microphone"],
    load: async () => (await import("./extensions/audio")).createAiAudioExtension,
  },
];

/**
 * Opcode ekstensi AI yang SUDAH diimplementasikan tetapi belum ada di katalog engine (opcodes.ts milik
 * scaffold). Perlu ditambahkan ke AI_OPCODES agar blocks-ui/parity mengenalinya.
 */
export const AI_EXTRA_OPCODES: readonly { opcode: string; shape: "command" | "reporter" | "shadow"; owner: string; monitorable?: boolean }[] = [
  { opcode: "aiText_speak", shape: "command", owner: "packages/ai/src/extensions/text.ts" },
  { opcode: "aiText_setSpeechLanguage", shape: "command", owner: "packages/ai/src/extensions/text.ts" },
  { opcode: "aiText_menu_LANGUAGE", shape: "shadow", owner: "packages/ai/src/extensions/text.ts" },
  { opcode: "aiAudio_recognizeSpeech", shape: "command", owner: "packages/ai/src/extensions/audio.ts" },
  { opcode: "aiAudio_speechText", shape: "reporter", owner: "packages/ai/src/extensions/audio.ts", monitorable: true },
  { opcode: "aiAudio_menu_LANGUAGE", shape: "shadow", owner: "packages/ai/src/extensions/audio.ts" },
];
