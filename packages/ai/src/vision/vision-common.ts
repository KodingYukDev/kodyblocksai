/**
 * Bagian bersama ekstensi AI visi (seperti PictoBlox): blok video (nyala/mati/terbalik, transparansi)
 * dan "analisis gambar dari [kamera/panggung]". Hasil analisis terakhir disimpan; reporter, boolean,
 * dan hat HANYA membaca hasil itu (hat tidak pernah menyalakan kamera).
 */
import { Cast } from "@kody/engine";
import type { BlockArgs, ExtensionBlock, ExtensionMenu, IRuntime, PrimitiveFn } from "@kody/engine";
import { TensorBudgetError } from "../models/tensor-guard";
import { AI_LIMITS } from "../security";
import { getAiServices } from "../services";
import type { AiServices } from "../services";
import type { AiSource, FrameSource } from "../types";
import { AnalysisGate } from "./analysis-gate";

export const VIDEO_STATE_MENU: ExtensionMenu = {
  acceptReporters: true,
  items: [
    { text: "mati", value: "off" },
    { text: "nyala", value: "on" },
    { text: "nyala tanpa cermin", value: "on-flipped" },
  ],
};

export const SOURCE_MENU: ExtensionMenu = {
  acceptReporters: false,
  items: [
    { text: "kamera", value: "camera" },
    { text: "panggung", value: "stage" },
  ],
};

export const CAMERA_MENU: ExtensionMenu = {
  acceptReporters: false,
  items: [
    { text: "depan", value: "user" },
    { text: "belakang", value: "environment" },
  ],
};

export const AXIS_MENU: ExtensionMenu = {
  acceptReporters: false,
  items: [
    { text: "x", value: "x" },
    { text: "y", value: "y" },
  ],
};

export interface VisionBlockTexts {
  /** Teks blok mulai analisis terus-menerus (mis. "mulai klasifikasi kamera"). */
  startAuto?: string;
  stopAuto?: string;
}

export const commonVisionBlocks = (texts: VisionBlockTexts = {}): ExtensionBlock[] => [
  {
    opcode: "videoToggle",
    blockType: "command",
    text: "atur video [VIDEO_STATE]",
    arguments: { VIDEO_STATE: { type: "string", menu: "VIDEO_STATE", defaultValue: "on" } },
  },
  {
    opcode: "setVideoTransparency",
    blockType: "command",
    text: "atur transparansi video ke [TRANSPARENCY]",
    arguments: { TRANSPARENCY: { type: "number", defaultValue: 50 } },
  },
  {
    opcode: "setCamera",
    blockType: "command",
    text: "pakai kamera [CAMERA]",
    arguments: { CAMERA: { type: "string", menu: "CAMERA", defaultValue: "user" } },
  },
  {
    opcode: "startAuto",
    blockType: "command",
    text: texts.startAuto ?? "mulai deteksi kamera terus-menerus",
  },
  { opcode: "stopAuto", blockType: "command", text: texts.stopAuto ?? "berhenti deteksi" },
  {
    opcode: "analyse",
    blockType: "command",
    text: "analisis gambar dari [SOURCE]",
    arguments: { SOURCE: { type: "string", menu: "SOURCE", defaultValue: "camera" } },
  },
];

/** Opcode bersama semua ekstensi visi (dipakai katalog). */
export const COMMON_VISION_OPCODES = ["videoToggle", "setVideoTransparency", "setCamera", "startAuto", "stopAuto", "analyse"] as const;

export const commonVisionMenus = (): Record<string, ExtensionMenu> => ({
  VIDEO_STATE: VIDEO_STATE_MENU,
  SOURCE: SOURCE_MENU,
  CAMERA: CAMERA_MENU,
});

export interface VisionCore<R> {
  readonly services: AiServices;
  /** Hasil analisis terakhir (kosong setelah stop / kamera mati). */
  result(): R;
  /** true selama analisis terus-menerus berjalan. */
  readonly running: boolean;
  primitives: Record<(typeof COMMON_VISION_OPCODES)[number], PrimitiveFn>;
  dispose(): void;
}

export interface VisionCoreOptions<R> {
  extensionId: string;
  empty: () => R;
  /** Analisis satu frame (memuat model lazy lewat services.detector). */
  analyse: (services: AiServices, frame: FrameSource, timestampMs: number, mirrored: boolean) => Promise<R>;
}

export function parseVideoState(value: unknown): "off" | "on" | "on-flipped" {
  const s = Cast.toString(value);
  return s === "off" || s === "on-flipped" ? s : "on";
}

export function createVisionCore<R>(runtime: IRuntime, opts: VisionCoreOptions<R>): VisionCore<R> {
  // Lazy: layanan (kamera, model) baru disentuh saat blok pertama dijalankan.
  type State = { services: AiServices; gate: AnalysisGate<R>; offReset: () => void; loop: unknown };
  let state: State | null = null;
  const stopLoop = (s: State | null): void => {
    if (s && s.loop !== null) {
      s.services.timers.clearInterval(s.loop);
      s.loop = null;
    }
  };
  const init = (): State => {
    if (state && !state.services.isDisposed) return state;
    const services = getAiServices(runtime);
    services.hold(opts.extensionId);
    const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
    const gate = new AnalysisGate<R>(opts.empty, 1000 / AI_LIMITS.maxAnalysesPerSecond, now);
    const s: State = { services, gate, offReset: () => {}, loop: null };
    // Stop / tab tersembunyi / project baru: hasil lama dibuang DAN analisis terus-menerus berhenti.
    s.offReset = services.events.on("reset", () => {
      stopLoop(s);
      gate.invalidate();
    });
    state = s;
    return state;
  };

  const analyseOnce = async (services: AiServices, source: AiSource): Promise<R> => {
    const acquired = await services.acquireFrame(source, opts.extensionId);
    if (!acquired) return opts.empty();
    try {
      return await opts.analyse(services, acquired.frame, services.timestamp(), acquired.mirrored);
    } catch (err) {
      if (err instanceof TensorBudgetError) {
        services.unloadDetectors();
        services.notice({ level: "warning", code: "ai-memory", message: "Memori AI hampir penuh; model dimuat ulang." });
      }
      throw err;
    }
  };

  const primitives: VisionCore<R>["primitives"] = {
    videoToggle: async (args: BlockArgs) => {
      const { services } = init();
      const videoState = parseVideoState(args.VIDEO_STATE);
      services.setVideoState(videoState);
      if (videoState !== "off") {
        await services.ensureCamera(opts.extensionId);
        services.updateVideoLayer();
      }
    },
    setVideoTransparency: (args: BlockArgs) => {
      init().services.setVideoTransparency(Cast.toNumber(args.TRANSPARENCY));
    },
    setCamera: async (args: BlockArgs) => {
      const { services } = init();
      await services.setCameraFacing(Cast.toString(args.CAMERA) === "environment" ? "environment" : "user");
    },
    startAuto: async () => {
      const s = init();
      if (s.loop !== null) return;
      if (!(await s.services.ensureCamera(opts.extensionId))) return;
      if (s.loop !== null || state !== s) return;
      const tick = (): void => {
        // Kamera dimatikan (tombol Matikan, izin dicabut): berhenti, jangan minta izin berulang-ulang.
        if (!s.services.camera.enabled) {
          stopLoop(s);
          s.gate.invalidate();
          return;
        }
        // Error (mis. model gagal dimuat) menghentikan loop supaya notice tidak berulang 15x per detik.
        // The loop is fire-and-forget, so a failure must be shown here or the child sees nothing.
        s.gate
          .run(() =>
            analyseOnce(s.services, "camera").catch((err: unknown) => {
              stopLoop(s);
              throw err;
            }),
          )
          .catch(() => {
            s.services.notice({ level: "error", code: "ai-model", message: "Model AI gagal dimuat. Coba muat ulang halaman." });
          });
      };
      s.loop = s.services.timers.setInterval(tick, Math.ceil(1000 / AI_LIMITS.maxAnalysesPerSecond));
      tick();
    },
    stopAuto: () => {
      stopLoop(state);
    },
    analyse: async (args: BlockArgs) => {
      const { services, gate } = init();
      const source: AiSource = Cast.toString(args.SOURCE) === "stage" ? "stage" : "camera";
      await gate.run(() => analyseOnce(services, source));
    },
  };

  return {
    get services() {
      return init().services;
    },
    result: () => state?.gate.result ?? opts.empty(),
    get running() {
      return state !== null && state.loop !== null;
    },
    primitives,
    dispose: () => {
      if (!state) return;
      const s = state;
      state = null;
      stopLoop(s);
      s.offReset();
      s.gate.invalidate();
      s.services.release(opts.extensionId);
    },
  };
}

/** Nomor urut 1-based dari argumen (mis. "tangan 1") -> indeks 0-based, atau -1. */
export function toIndex(value: unknown, count: number): number {
  const n = Math.floor(Cast.toNumber(value));
  return n >= 1 && n <= count ? n - 1 : -1;
}

/** Ambil koordinat dari titik sesuai menu AXIS ("x"/"y"). */
export function axisOf(point: { x: number; y: number } | undefined, axis: unknown): number {
  if (!point) return 0;
  return Cast.toString(axis) === "y" ? point.y : point.x;
}
