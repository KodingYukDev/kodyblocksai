/**
 * Kamera bersama (IVideoProvider) untuk semua ekstensi AI visi dan lapisan video panggung.
 * Aturan privasi:
 * - getUserMedia HANYA dipanggil dari enableVideo() (dipicu blok AI / tombol pengguna);
 * - frame hanya digambar ke kanvas lokal; tidak ada kode yang mengirim frame ke jaringan;
 * - disableVideo() menghentikan semua track (lampu kamera mati) dan membatalkan permintaan yang tertunda;
 * - tidak menyala bila tab sedang tersembunyi.
 */
import type { IVideoProvider, VideoFrameRequest } from "@kody/engine";
import { TypedEmitter } from "@kody/engine";
import type { CameraFacing } from "../types";

export interface MediaTrackLike {
  stop(): void;
}
export interface MediaStreamLike {
  getTracks(): MediaTrackLike[];
}
export interface VideoElementLike {
  srcObject: unknown;
  setAttribute?(name: string, value: string): void;
  muted: boolean;
  playsInline: boolean;
  readonly videoWidth: number;
  readonly videoHeight: number;
  play(): Promise<void>;
  pause(): void;
}
export interface Canvas2DLike {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  drawImage(img: unknown, x: number, y: number, w: number, h: number): void;
  getImageData(x: number, y: number, w: number, h: number): ImageData;
}
export interface CanvasLike {
  width: number;
  height: number;
  getContext(kind: "2d", opts?: { willReadFrequently?: boolean }): Canvas2DLike | null;
}

export interface CameraDeps {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStreamLike>;
  createVideo?: () => VideoElementLike;
  createCanvas?: (width: number, height: number) => CanvasLike;
  /** true bila tab sedang tersembunyi (kamera tidak boleh dinyalakan). */
  isHidden?: () => boolean;
}

export type CameraEventMap = {
  "permission-requested": void;
  "permission-result": { granted: boolean; reason?: string };
  "active-change": { active: boolean };
};

export const DEFAULT_FRAME_SIZE: [number, number] = [480, 360];

export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
};

/** Batasan kamera untuk sisi tertentu. facingMode "ideal" supaya laptop tanpa kamera belakang tetap jalan. */
export function cameraConstraints(facing: CameraFacing): MediaStreamConstraints {
  return { audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: { ideal: facing } } };
}

/** Batasan paling longgar (cadangan bila perangkat menolak batasan di atas, mis. iPad lama). */
export const FALLBACK_CAMERA_CONSTRAINTS: MediaStreamConstraints = { audio: false, video: true };

function defaultGetUserMedia(): CameraDeps["getUserMedia"] {
  const md = globalThis.navigator?.mediaDevices;
  if (!md?.getUserMedia) return undefined;
  return (c) => md.getUserMedia(c);
}

export class CameraController implements IVideoProvider {
  readonly events = new TypedEmitter<CameraEventMap>();
  private stream: MediaStreamLike | null = null;
  private video: VideoElementLike | null = null;
  private pending: Promise<boolean> | null = null;
  private generation = 0;
  private mirrored = true;
  private facing: CameraFacing = "user";
  private canvas: CanvasLike | null = null;
  /** Kanvas terpisah per pemakai supaya pratinjau AI Lab tidak menimpa frame yang sedang dianalisis. */
  private readonly keyed = new Map<string, CanvasLike>();

  constructor(private readonly deps: CameraDeps = {}) {}

  get enabled(): boolean {
    return this.stream !== null;
  }

  get isMirrored(): boolean {
    return this.mirrored;
  }

  /** Elemen video aktif (untuk lapisan video panggung), atau null. */
  getVideoElement(): VideoElementLike | null {
    return this.stream && this.video && this.video.videoWidth > 0 ? this.video : null;
  }

  enableVideo(): Promise<boolean> {
    if (this.stream) return Promise.resolve(true);
    if (this.pending) return this.pending;
    if ((this.deps.isHidden ?? documentHidden)()) {
      this.events.emit("permission-result", { granted: false, reason: "hidden" });
      return Promise.resolve(false);
    }
    const generation = this.generation;
    const run = async (): Promise<boolean> => {
      const getUserMedia = this.deps.getUserMedia ?? defaultGetUserMedia();
      if (!getUserMedia) {
        this.events.emit("permission-result", { granted: false, reason: "unsupported" });
        return false;
      }
      this.events.emit("permission-requested", undefined);
      const opened = await openStream(getUserMedia, this.facing);
      if (!opened.stream) {
        this.events.emit("permission-result", { granted: false, reason: opened.reason });
        return false;
      }
      const stream = opened.stream;
      if (generation !== this.generation) {
        stopStream(stream);
        return false;
      }
      const video = this.video ?? this.createVideo();
      // iOS Safari: video hanya diputar inline tanpa gestur bila muted + playsinline (atribut juga).
      video.muted = true;
      video.playsInline = true;
      video.setAttribute?.("playsinline", "");
      video.setAttribute?.("muted", "");
      video.setAttribute?.("autoplay", "");
      video.srcObject = stream;
      try {
        await video.play();
      } catch (err) {
        stopStream(stream);
        video.srcObject = null;
        this.events.emit("permission-result", { granted: false, reason: (err as { name?: string }).name ?? "Error" });
        return false;
      }
      if (generation !== this.generation) {
        stopStream(stream);
        video.srcObject = null;
        return false;
      }
      this.video = video;
      this.stream = stream;
      this.events.emit("permission-result", { granted: true });
      this.events.emit("active-change", { active: true });
      return true;
    };
    const pending = run().finally(() => {
      if (this.pending === pending) this.pending = null;
    });
    this.pending = pending;
    return pending;
  }

  disableVideo(): void {
    this.generation++;
    this.pending = null;
    const wasActive = this.stream !== null;
    if (this.stream) stopStream(this.stream);
    this.stream = null;
    if (this.video) {
      try {
        this.video.pause();
      } catch {
        // abaikan: elemen mungkin sudah dilepas
      }
      this.video.srcObject = null;
    }
    for (const c of [this.canvas, ...this.keyed.values()]) {
      // Hapus sisa frame terakhir dari memori kanvas.
      if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    }
    if (wasActive) this.events.emit("active-change", { active: false });
  }

  setMirrored(mirrored: boolean): void {
    this.mirrored = mirrored;
  }

  get facingMode(): CameraFacing {
    return this.facing;
  }

  /**
   * Pilih kamera depan/belakang. Kamera belakang tidak dicerminkan. Bila kamera sedang menyala,
   * stream diganti (track lama dihentikan dulu). Mengembalikan status kamera setelahnya.
   */
  async setFacingMode(facing: CameraFacing): Promise<boolean> {
    const changed = facing !== this.facing;
    this.facing = facing;
    this.mirrored = facing === "user";
    if (!changed || (!this.stream && !this.pending)) return this.enabled;
    this.disableVideo();
    return this.enableVideo();
  }

  /**
   * Frame terbaru (dicerminkan bila mode cermin), atau null bila kamera mati/belum siap.
   * "bitmap" mengembalikan kanvas (ImageBitmap tidak bisa dibuat sinkron).
   */
  getFrame(req: VideoFrameRequest): ImageData | HTMLCanvasElement | ImageBitmap | null {
    const video = this.getVideoElement();
    if (!video) return null;
    const [w, h] = req.dimensions ?? DEFAULT_FRAME_SIZE;
    const canvas = this.ensureCanvas(w, h);
    const ctx = canvas.getContext("2d", { willReadFrequently: req.format === "image-data" });
    if (!ctx) return null;
    ctx.save();
    if (this.mirrored) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
    if (req.format === "image-data") return ctx.getImageData(0, 0, w, h);
    return canvas as unknown as HTMLCanvasElement;
  }

  /**
   * Seperti getFrame tetapi menggambar ke kanvas milik `key` sendiri. Dipakai saat frame harus tetap
   * utuh selama analisis async (AI Lab, ekstensi) walau pemakai lain meminta frame lain.
   */
  getFrameFor(key: string, dimensions: [number, number] = DEFAULT_FRAME_SIZE): HTMLCanvasElement | null {
    const video = this.getVideoElement();
    if (!video) return null;
    const [w, h] = dimensions;
    let canvas = this.keyed.get(key);
    if (!canvas) {
      canvas = this.createCanvas(w, h);
      this.keyed.set(key, canvas);
    }
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.save();
    if (this.mirrored) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
    return canvas as unknown as HTMLCanvasElement;
  }

  dispose(): void {
    this.disableVideo();
    this.video = null;
    this.canvas = null;
    this.keyed.clear();
    this.events.removeAllListeners();
  }

  private ensureCanvas(w: number, h: number): CanvasLike {
    if (!this.canvas) this.canvas = this.createCanvas(w, h);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    return this.canvas;
  }

  private createVideo(): VideoElementLike {
    if (this.deps.createVideo) return this.deps.createVideo();
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    return v;
  }

  private createCanvas(w: number, h: number): CanvasLike {
    if (this.deps.createCanvas) return this.deps.createCanvas(w, h);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c as unknown as CanvasLike;
  }
}

/** getUserMedia dengan satu percobaan ulang tanpa batasan bila batasan tidak bisa dipenuhi. */
async function openStream(
  getUserMedia: NonNullable<CameraDeps["getUserMedia"]>,
  facing: CameraFacing,
): Promise<{ stream: MediaStreamLike | null; reason: string }> {
  try {
    return { stream: await getUserMedia(cameraConstraints(facing)), reason: "" };
  } catch (err) {
    const name = (err as { name?: string }).name ?? "Error";
    if (name !== "OverconstrainedError" && name !== "ConstraintNotSatisfiedError" && name !== "TypeError") {
      return { stream: null, reason: name };
    }
  }
  try {
    return { stream: await getUserMedia(FALLBACK_CAMERA_CONSTRAINTS), reason: "" };
  } catch (err) {
    return { stream: null, reason: (err as { name?: string }).name ?? "Error" };
  }
}

function stopStream(stream: MediaStreamLike): void {
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // track sudah berhenti
    }
  }
}

function documentHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}
