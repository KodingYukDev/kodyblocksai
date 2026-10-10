/**
 * Merakit runtime + renderer + audio + ekstensi + media loader + ShellController untuk app.
 * Urutan (padanan scratch-gui vm-manager-hoc + stage.jsx):
 *   createAudioEngine -> createRuntime (CORE_BLOCK_PACKAGES didaftarkan engine sendiri, JANGAN ulang)
 *   -> kanvas panggung terpasang -> createRenderer(canvas) -> runtime.renderer -> project default dimuat.
 * Kalau kanvas diganti (mis. remount), renderer dibuat ulang dan project saat ini dimuat ulang ke renderer baru.
 */
import type { IRenderer, IRuntime } from "@kody/engine";
import { createRuntime } from "@kody/engine";
import { createAudioEngine, type KodyAudioEngine } from "@kody/audio";
import { createRenderer } from "@kody/renderer";
import { configureAiServices } from "@kody/ai";
import { createRuntimeController } from "../shell/runtime-controller";
import { runtimeToModel } from "../shell/runtime-model";
import type { ShellController } from "../shell/types";
import type { AssetEditorHost } from "../costume-tab/types";
import type { LibraryLoader } from "../library/library-loader";
import type { LibraryBackdropEntry, LibraryKind, LibrarySpriteEntry } from "../library/library-types";
import { createAssetActions } from "./asset-actions";
import { createRuntimeAssetHost } from "./asset-host";
import { ExtensionHost } from "./extensions";
import { createMediaLoader } from "./media-loader";
import { createProjectIO } from "./project-io";

export interface RuntimeHostOptions {
  kodySvg: string;
  loader: LibraryLoader;
  locale?: "id" | "en";
  chooseFromLibrary(kind: Extract<LibraryKind, "sprite" | "backdrop">): Promise<LibrarySpriteEntry | LibraryBackdropEntry | null>;
  onDeviceActive?: (device: "camera" | "microphone", active: boolean) => void;
  onWarnings?: (warnings: readonly string[]) => void;
  /** Persetujuan fitur AI yang memakai internet (default: tanya lewat window.confirm). */
  requestNetworkConsent?: (feature: string) => Promise<boolean>;
  /** Pembuat renderer (tes). */
  createStageRenderer?: (canvas: HTMLCanvasElement, onAsyncLoad: () => void) => IRenderer;
}

export interface RuntimeHost {
  runtime: IRuntime;
  audio: KodyAudioEngine;
  extensions: ExtensionHost;
  controller: ShellController & { dispose(): void };
  assetHost: AssetEditorHost & { dispose(): void };
  /** Selesai saat renderer pertama dibuat dan project awal dimuat. */
  ready: Promise<void>;
  dispose(): void;
}

export function createRuntimeHost(opts: RuntimeHostOptions): RuntimeHost {
  const audio = createAudioEngine({
    onMicrophoneActiveChange: (active) => opts.onDeviceActive?.("microphone", active),
  });
  const runtime = createRuntime({ audioEngine: audio });
  const extensions = new ExtensionHost(runtime);
  const media = createMediaLoader({ getRenderer: () => runtime.renderer, getAudio: () => audio });

  // Kamera bersama + izin internet AI (speech recognition online) hanya setelah persetujuan pengguna.
  const consent =
    opts.requestNetworkConsent ??
    ((feature: string) =>
      Promise.resolve(
        typeof window !== "undefined" &&
          window.confirm(`Fitur "${feature}" memakai layanan internet browser. Izinkan untuk sesi ini?`),
      ));
  configureAiServices(runtime, { requestNetworkConsent: (f) => consent(String(f)) });

  const projectIO = createProjectIO({
    extensions,
    kodySvg: opts.kodySvg,
    locale: opts.locale ?? "id",
    ...(opts.onWarnings ? { onWarnings: opts.onWarnings } : {}),
  });

  let canvas: HTMLCanvasElement | null = null;
  let lastSize: [number, number] | null = null;
  let resolveReady: () => void = () => {};
  let firstLoad = true;
  const ready = new Promise<void>((r) => {
    resolveReady = r;
  });

  const makeRenderer =
    opts.createStageRenderer ?? ((c: HTMLCanvasElement, onAsyncLoad: () => void) => createRenderer({ canvas: c, onAsyncLoad }));

  const attach = async (next: HTMLCanvasElement | null): Promise<void> => {
    // StrictMode melepas lalu memasang kanvas yang sama: abaikan null, renderer tetap hidup.
    if (!next || next === canvas) return;
    const hadProject = runtime.targets.length > 0;
    const snapshot = hadProject ? runtimeToModel(runtime) : null;
    canvas = next;
    runtime.renderer = makeRenderer(next, () => runtime.requestRedraw());
    if (lastSize) runtime.renderer.resize(lastSize[0], lastSize[1]);
    if (snapshot) {
      await runtime.loadProject(snapshot.model, media, snapshot.assets);
    } else if (firstLoad) {
      firstLoad = false;
      await controller.newProject();
      resolveReady();
    }
  };

  const assetActions = createAssetActions({
    runtime,
    media,
    loader: opts.loader,
    chooseFromLibrary: opts.chooseFromLibrary,
    locale: opts.locale ?? "id",
  });

  const base = createRuntimeController({
    runtime,
    mediaLoader: media,
    projectIO,
    assetActions,
    onStageCanvas: (c) => {
      void attach(c).catch((e: unknown) => {
        console.error("Gagal menyiapkan panggung", e);
        resolveReady();
      });
    },
  });

  const controller: ShellController & { dispose(): void } = {
    ...base,
    resizeStage(w, h) {
      lastSize = [w, h];
      base.resizeStage(w, h);
    },
    greenFlag() {
      // Gesture pengguna: buka kunci AudioContext seperti scratch-gui.
      void audio.resume();
      base.greenFlag();
    },
  };

  const assetHost = createRuntimeAssetHost(runtime, media);

  // Keamanan AI: mikrofon dilepas saat project dihentikan (kamera dimatikan oleh AiServices).
  const offStop = runtime.on("PROJECT_STOP_ALL", () => audio.releaseMicrophone());

  return {
    runtime,
    audio,
    extensions,
    controller,
    assetHost,
    ready,
    dispose() {
      offStop();
      assetHost.dispose();
      base.dispose();
      extensions.dispose();
      runtime.dispose();
      audio.dispose();
    },
  };
}
