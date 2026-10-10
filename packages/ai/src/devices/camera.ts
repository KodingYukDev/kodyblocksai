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

export interface MediaTrackLike {
  stop(): void;
}
export interface MediaStreamLike {
  getTracks(): MediaTrackLike[];
}
export interface VideoElementLike {
  srcObject: unknown;
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
  private canvas: CanvasLike | null = null;

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
      let stream: MediaStreamLike;
      try {
        stream = await getUserMedia(CAMERA_CONSTRAINTS);
      } catch (err) {
        const name = (err as { name?: string }).name ?? "Error";
        this.events.emit("permission-result", { granted: false, reason: name });
        return false;
      }
      if (generation !== this.generation) {
        stopStream(stream);
        return false;
      }
      const video = this.video ?? this.createVideo();
      video.muted = true;
      video.playsInline = true;
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
    if (this.canvas) {
      // Hapus sisa frame terakhir dari memori kanvas.
      this.canvas.getContext("2d")?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (wasActive) this.events.emit("active-change", { active: false });
  }

  setMirrored(mirrored: boolean): void {
    this.mirrored = mirrored;
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

  dispose(): void {
    this.disableVideo();
    this.video = null;
    this.canvas = null;
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
    return document.createElement("video");
  }

  private createCanvas(w: number, h: number): CanvasLike {
    if (this.deps.createCanvas) return this.deps.createCanvas(w, h);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c as unknown as CanvasLike;
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
