/**
 * Layanan AI bersama per runtime: kamera, mikrofon, model (lazy + terverifikasi), suara, lapisan video,
 * dan siklus hidup privasi. Semua ekstensi AI memakai satu instance per runtime (getAiServices).
 *
 * Siklus hidup perangkat:
 * - kamera/mic HANYA dinyalakan oleh blok AI yang dijalankan (bukan oleh hat yang dievaluasi tiap frame);
 * - dimatikan saat tombol stop (PROJECT_STOP_ALL), project baru dimuat (PROJECT_LOADED),
 *   tab disembunyikan (visibilitychange), ekstensi dilepas, atau stopAllDevices("user") dari tombol UI.
 */
import type { IRuntime, ITarget } from "@kody/engine";
import { TypedEmitter } from "@kody/engine";
import { CameraController } from "./devices/camera";
import type { CameraDeps } from "./devices/camera";
import { MicrophoneController } from "./devices/microphone";
import type { MicrophoneDeps } from "./devices/microphone";
import { createDefaultDetectorFactories } from "./models/loaders";
import { createVerifiedFetcher } from "./models/verified-fetch";
import { SpeechRecognizer } from "./speech/speech-recognition";
import type { SpeechDeps } from "./speech/speech-recognition";
import { TextToSpeech } from "./speech/tts";
import type { TtsDeps } from "./speech/tts";
import type { AiDevice, AiNotice, AiSource, DetectorFactories, DetectorKind, FrameSource, NetworkFeature } from "./types";

export type ResetReason = "stop" | "hidden" | "project" | "user" | "dispose";

export type AiServiceEventMap = {
  "device-active": { device: AiDevice; active: boolean };
  "permission-requested": { device: AiDevice; extensionId: string };
  "permission-result": { device: AiDevice; granted: boolean };
  notice: AiNotice;
  /** Semua hasil analisis lama harus dibuang (perangkat dimatikan). */
  reset: { reason: ResetReason };
};

export interface VisibilitySource {
  isHidden(): boolean;
  onChange(fn: () => void): () => void;
}

export interface AiServicesOptions {
  camera?: CameraDeps;
  microphone?: MicrophoneDeps;
  /** Ganti pabrik detektor (tes). Default: MediaPipe/tfjs lazy + verifikasi hash. */
  detectors?: Partial<DetectorFactories>;
  fetchVerified?: (path: string) => Promise<ArrayBuffer>;
  /** null = tanpa pemantauan visibilitas (tes). Default: document.visibilityState. */
  visibility?: VisibilitySource | null;
  /** Dialog persetujuan fitur yang memakai internet. Default: selalu ditolak. */
  requestNetworkConsent?: (feature: NetworkFeature) => Promise<boolean>;
  now?: () => number;
  speech?: Pick<SpeechDeps, "ctor" | "setTimer" | "clearTimer">;
  tts?: Pick<TtsDeps, "synth" | "createUtterance" | "voicesTimeoutMs">;
  /** Ubah snapshot panggung (data URL PNG) jadi frame. Default: HTMLImageElement -> kanvas. */
  decodeSnapshot?: (dataUrl: string) => Promise<FrameSource | null>;
}

export interface AcquiredFrame {
  frame: FrameSource;
  mirrored: boolean;
}

function documentVisibility(): VisibilitySource | null {
  if (typeof document === "undefined") return null;
  return {
    isHidden: () => document.visibilityState === "hidden",
    onChange: (fn) => {
      document.addEventListener("visibilitychange", fn);
      return () => document.removeEventListener("visibilitychange", fn);
    },
  };
}

async function decodeDataUrl(dataUrl: string): Promise<FrameSource | null> {
  if (!/^data:image\/(png|jpeg);base64,/.test(dataUrl)) return null;
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = 480;
  c.height = 360;
  c.getContext("2d")?.drawImage(img, 0, 0, 480, 360);
  return c;
}

export class AiServices {
  readonly events = new TypedEmitter<AiServiceEventMap>();
  readonly camera: CameraController;
  readonly microphone: MicrophoneController;
  readonly speech: SpeechRecognizer;
  readonly tts: TextToSpeech;
  private readonly detectorCache = new Map<DetectorKind, Promise<unknown>>();
  private readonly loadedDetectors = new Set<{ dispose(): void }>();
  private readonly factories: DetectorFactories & { dispose?(): void };
  private readonly unsubs: (() => void)[] = [];
  private readonly holders = new Set<string>();
  private readonly visibility: VisibilitySource | null;
  private lastTimestamp = 0;
  private videoLayerShown = false;
  private disposed = false;
  private readonly now: () => number;

  constructor(
    readonly runtime: IRuntime,
    private readonly options: AiServicesOptions = {},
  ) {
    this.now = options.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this.visibility = options.visibility === undefined ? documentVisibility() : options.visibility;
    const isHidden = (): boolean => this.visibility?.isHidden() ?? false;

    const existing = runtime.ioDevices.video;
    if (existing instanceof CameraController && !options.camera) {
      this.camera = existing;
    } else {
      this.camera = new CameraController({ isHidden, ...options.camera });
      if (!existing) runtime.ioDevices.video = this.camera;
    }
    this.microphone = new MicrophoneController({ isHidden, ...options.microphone });
    const notice = (n: AiNotice): void => this.notice(n);
    const consent = (f: NetworkFeature): Promise<boolean> => options.requestNetworkConsent?.(f) ?? Promise.resolve(false);
    this.speech = new SpeechRecognizer({
      ...options.speech,
      notice,
      requestNetworkConsent: consent,
      onActive: (active) => this.events.emit("device-active", { device: "microphone", active }),
    });
    this.tts = new TextToSpeech({ ...options.tts, notice, requestNetworkConsent: consent });

    const defaults = createDefaultDetectorFactories({ fetchVerified: options.fetchVerified ?? createVerifiedFetcher() });
    this.factories = { ...defaults, ...options.detectors, dispose: defaults.dispose };

    this.wireDevice("camera", this.camera.events);
    this.wireDevice("microphone", this.microphone.events);
    this.unsubs.push(
      runtime.on("PROJECT_STOP_ALL", () => this.stopAllDevices("stop")),
      runtime.on("PROJECT_LOADED", () => {
        this.stopAllDevices("project");
        this.speech.resetConsent();
        this.tts.resetConsent();
      }),
      runtime.on("RUNTIME_STEP", () => this.updateVideoLayer()),
    );
    if (this.visibility) {
      this.unsubs.push(
        this.visibility.onChange(() => {
          if (this.visibility?.isHidden()) this.stopAllDevices("hidden");
        }),
      );
    }
  }

  private wireDevice(
    device: AiDevice,
    events: TypedEmitter<{
      "permission-requested": void;
      "permission-result": { granted: boolean; reason?: string };
      "active-change": { active: boolean };
    }>,
  ): void {
    const label = device === "camera" ? "kamera" : "mikrofon";
    this.unsubs.push(
      events.on("active-change", ({ active }) => this.events.emit("device-active", { device, active })),
      events.on("permission-result", ({ granted, reason }) => {
        this.events.emit("permission-result", { device, granted });
        if (granted) return;
        if (reason === "NotAllowedError" || reason === "SecurityError") {
          this.notice({ level: "warning", code: `${device}-denied`, message: `Izin ${label} ditolak. Blok AI tidak bisa memakai ${label}.` });
        } else if (reason === "NotFoundError" || reason === "OverconstrainedError") {
          this.notice({ level: "warning", code: `${device}-missing`, message: `Tidak ada ${label} yang bisa dipakai.` });
        } else if (reason === "unsupported") {
          this.notice({ level: "warning", code: `${device}-unsupported`, message: `Browser tidak mendukung ${label} (butuh HTTPS).` });
        }
      }),
    );
  }

  notice(n: AiNotice): void {
    this.events.emit("notice", n);
  }

  /** Ekstensi mendaftar sebagai pemakai. */
  hold(extensionId: string): void {
    this.holders.add(extensionId);
  }

  /** Saat pemakai terakhir dilepas: matikan perangkat dan lepas model (instance tetap hidup untuk UI). */
  release(extensionId: string): void {
    this.holders.delete(extensionId);
    if (this.holders.size === 0) {
      this.stopAllDevices("dispose");
      this.unloadDetectors();
    }
  }

  /** Nyalakan kamera atas permintaan blok AI. */
  async ensureCamera(extensionId: string): Promise<boolean> {
    if (this.disposed) return false;
    if (this.camera.enabled) return true;
    this.events.emit("permission-requested", { device: "camera", extensionId });
    return this.camera.enableVideo();
  }

  async ensureMicrophone(extensionId: string): Promise<boolean> {
    if (this.disposed) return false;
    if (this.microphone.active) return true;
    this.events.emit("permission-requested", { device: "microphone", extensionId });
    return this.microphone.start();
  }

  /** Ambil frame untuk analisis: dari kamera (dinyalakan bila perlu) atau snapshot panggung. */
  async acquireFrame(source: AiSource, extensionId: string): Promise<AcquiredFrame | null> {
    if (source === "stage") {
      const snap = this.runtime.renderer?.snapshot;
      if (!snap) return null;
      const dataUrl = await snap.call(this.runtime.renderer);
      const frame = await (this.options.decodeSnapshot ?? decodeDataUrl)(dataUrl);
      return frame ? { frame, mirrored: false } : null;
    }
    if (!(await this.ensureCamera(extensionId))) return null;
    const frame = this.camera.getFrame({ format: "canvas" });
    return frame ? { frame, mirrored: this.camera.isMirrored } : null;
  }

  /** Timestamp naik ketat (syarat MediaPipe VIDEO mode). */
  timestamp(): number {
    const t = Math.max(this.now(), this.lastTimestamp + 1);
    this.lastTimestamp = t;
    return t;
  }

  /** Detektor/embedder (dimuat sekali, lazy). Gagal -> notice + lempar ulang. */
  detector<K extends DetectorKind>(kind: K): ReturnType<DetectorFactories[K]> {
    let p = this.detectorCache.get(kind);
    if (!p) {
      p = (this.factories[kind] as () => Promise<{ dispose(): void }>)().then(
        (d) => {
          if (this.disposed) {
            d.dispose();
            throw new Error("layanan AI sudah ditutup");
          }
          this.loadedDetectors.add(d);
          return d;
        },
        (err: unknown) => {
          this.detectorCache.delete(kind);
          this.notice({ level: "error", code: "model-load-failed", message: `Model AI gagal dimuat: ${(err as Error).message}` });
          throw err;
        },
      );
      this.detectorCache.set(kind, p);
    }
    return p as ReturnType<DetectorFactories[K]>;
  }

  /** Lepas model yang memakan memori (mis. setelah TensorBudgetError). */
  unloadDetectors(): void {
    for (const d of this.loadedDetectors) d.dispose();
    this.loadedDetectors.clear();
    this.detectorCache.clear();
  }

  // --- lapisan video panggung (stage.videoState / videoTransparency, seperti video sensing Scratch) ---

  private stage(): ITarget | undefined {
    return this.runtime.getTargetForStage();
  }

  setVideoState(state: "off" | "on" | "on-flipped"): void {
    const stage = this.stage();
    if (stage) stage.videoState = state;
    if (state === "off") {
      this.camera.disableVideo();
    } else {
      this.camera.setMirrored(state === "on");
    }
    this.updateVideoLayer();
  }

  setVideoTransparency(value: number): void {
    const stage = this.stage();
    if (stage) stage.videoTransparency = Math.min(100, Math.max(0, value));
    this.updateVideoLayer();
  }

  updateVideoLayer(): void {
    const renderer = this.runtime.renderer;
    if (!renderer?.setVideoFrame) return;
    const stage = this.stage();
    const state = stage?.videoState ?? "off";
    const video = this.camera.getVideoElement();
    if (state !== "off" && video) {
      renderer.setVideoFrame(video as unknown as HTMLVideoElement, stage?.videoTransparency ?? 50, this.camera.isMirrored);
      this.videoLayerShown = true;
    } else if (this.videoLayerShown) {
      renderer.setVideoFrame(null, 0, false);
      this.videoLayerShown = false;
    }
  }

  /** Matikan kamera, mikrofon, pengenalan suara, TTS; buang hasil lama. Dipanggil juga oleh tombol UI. */
  stopAllDevices(reason: ResetReason = "user"): void {
    this.camera.disableVideo();
    this.microphone.stop();
    this.speech.cancel();
    this.tts.cancel();
    this.updateVideoLayer();
    this.events.emit("reset", { reason });
    if (reason === "hidden") {
      this.notice({ level: "info", code: "devices-paused", message: "Kamera/mikrofon dimatikan karena tab disembunyikan." });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.stopAllDevices("dispose");
    this.disposed = true;
    for (const u of this.unsubs.splice(0)) u();
    this.unloadDetectors();
    this.factories.dispose?.();
    if (this.runtime.ioDevices.video === this.camera) this.runtime.ioDevices.video = null;
    this.camera.dispose();
    this.microphone.dispose();
    this.events.removeAllListeners();
    if (registry.get(this.runtime) === this) registry.delete(this.runtime);
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}

const registry = new WeakMap<IRuntime, AiServices>();

/** Pasang layanan AI dengan opsi (dipanggil app sekali, atau tes). Mengganti instance lama. */
export function configureAiServices(runtime: IRuntime, options: AiServicesOptions = {}): AiServices {
  registry.get(runtime)?.dispose();
  const services = new AiServices(runtime, options);
  registry.set(runtime, services);
  return services;
}

/** Layanan AI untuk runtime (dibuat dengan opsi default bila belum ada). */
export function getAiServices(runtime: IRuntime): AiServices {
  let s = registry.get(runtime);
  if (!s || s.isDisposed) {
    s = new AiServices(runtime);
    registry.set(runtime, s);
  }
  return s;
}

export function peekAiServices(runtime: IRuntime): AiServices | undefined {
  return registry.get(runtime);
}
