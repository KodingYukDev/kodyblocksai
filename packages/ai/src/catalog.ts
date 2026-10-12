/** Katalog ekstensi AI untuk galeri ekstensi app. Modul dimuat lazy. */
import type { ExtensionCatalogEntry } from "@kody/engine";

export const AI_EXTENSIONS: ExtensionCatalogEntry[] = [
  {
    id: "aiFace",
    name: "Deteksi Wajah",
    description: "Temukan wajah, posisi mata/hidung, dan ekspresi (senyum, terkejut). Berjalan di perangkatmu.",
    requires: ["camera"],
    load: async () => (await import("./extensions/face")).createAiFaceExtension,
  },
  {
    id: "aiHand",
    name: "Deteksi Tangan",
    description: "Lacak jari dan gestur tangan (jempol, damai, telapak) atau gestur buatanmu dari AI Lab.",
    requires: ["camera"],
    load: async () => (await import("./extensions/hand")).createAiHandExtension,
  },
  {
    id: "aiPose",
    name: "Deteksi Tubuh",
    description: "Lacak posisi bahu, tangan, dan kaki, atau kenali pose buatanmu dari AI Lab.",
    requires: ["camera"],
    load: async () => (await import("./extensions/pose")).createAiPoseExtension,
  },
  {
    id: "aiImage",
    name: "Klasifikasi Gambar",
    description: "Kenali gambar dari kamera dengan model yang kamu latih sendiri di AI Lab.",
    requires: ["camera"],
    load: async () => (await import("./extensions/image")).createAiImageExtension,
  },
  {
    id: "aiObject",
    name: "Deteksi Objek",
    description: "Kenali 80 benda sehari-hari (orang, kucing, botol, kursi...) dari kamera.",
    requires: ["camera"],
    load: async () => (await import("./extensions/object")).createAiObjectExtension,
  },
  {
    id: "aiText",
    name: "Klasifikasi Teks",
    description: "Ajari AI memahami kalimat (mis. senang/sedih) di AI Lab, lalu buat chatbot yang bisa bicara.",
    requires: [],
    load: async () => (await import("./extensions/text")).createAiTextExtension,
  },
  {
    id: "aiAudio",
    name: "Suara AI",
    description: "Kenali suara buatanmu dari AI Lab (tepuk, siul). Ubah ucapan jadi tulisan butuh izin internet di sebagian browser.",
    requires: ["microphone"],
    load: async () => (await import("./extensions/audio")).createAiAudioExtension,
  },
];

/**
 * Opcode ekstensi AI yang diimplementasikan tetapi belum ada di katalog engine (opcodes.ts).
 * Kosong: semua opcode AI sudah terdaftar di AI_OPCODES, sehingga file .sb3 yang memakainya
 * dimuat tanpa peringatan "blok tidak dikenal". Tetap diekspor untuk kompatibilitas.
 */
export const AI_EXTRA_OPCODES: readonly { opcode: string; shape: "command" | "reporter" | "shadow"; owner: string; monitorable?: boolean }[] = [];
