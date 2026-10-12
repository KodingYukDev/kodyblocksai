/**
 * Sumber contoh AI Lab: kamera (gambar / pose / tangan), file gambar, mikrofon. Semua lokal:
 * frame hanya digambar ke kanvas di memori, audio hanya dibaca sebagai spektrum.
 */
import { handFeatures, poseFeatures } from "../classifier/landmark-features";
import { AudioListener } from "../devices/audio-listener";
import type { IntervalTimers } from "../devices/audio-listener";
import type { AiServices } from "../services";
import type { FrameSource, HandResult, PoseResult } from "../types";

export const LAB_ID = "aiLab";
const EMBED_SIZE: [number, number] = [224, 224];
const DETECT_SIZE: [number, number] = [480, 360];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 40;

export interface Captured {
  features: Float32Array;
  thumb?: string;
}

/** Hasil pratinjau langsung: fitur + titik untuk digambar di atas video (koordinat panggung). */
export interface PreviewFrame {
  features: Float32Array | null;
  hands?: HandResult[];
  poses?: PoseResult[];
}

export type CameraKind = "image" | "pose" | "hand";

/** Thumbnail JPEG persegi kecil (hanya di memori kecuali pengguna memilih menyimpannya). */
export function makeThumbnail(frame: FrameSource, size = 64): string | undefined {
  if (typeof document === "undefined") return undefined;
  if (typeof ImageData !== "undefined" && frame instanceof ImageData) return undefined;
  try {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(frame as CanvasImageSource, 0, 0, size, size);
    const url = c.toDataURL("image/jpeg", 0.7);
    return url.startsWith("data:image/jpeg") ? url : undefined;
  } catch {
    return undefined;
  }
}

function friendlyCameraError(): Error {
  return new Error("Kamera belum menyala. Tekan \"Nyalakan kamera\" dan izinkan kamera di browser.");
}

/** Fitur dari satu frame kamera untuk jenis model tertentu. */
export async function featuresFromFrame(services: AiServices, kind: CameraKind, frame: FrameSource, mirrored: boolean): Promise<PreviewFrame> {
  if (kind === "image") {
    const embedder = await services.detector("imageEmbedder");
    return { features: await embedder.embed(frame) };
  }
  if (kind === "pose") {
    const poses = await (await services.detector("pose")).detect(frame, services.timestamp(), { mirrored });
    return { features: poseFeatures(poses[0]), poses };
  }
  const hands = await (await services.detector("hand")).detect(frame, services.timestamp(), { mirrored });
  return { features: handFeatures(hands[0]), hands };
}

/** Ambil satu contoh dari kamera. Melempar Error ramah anak bila tidak terdeteksi. */
export async function captureFromCamera(services: AiServices, kind: CameraKind): Promise<Captured> {
  if (!services.camera.enabled && !(await services.ensureCamera(LAB_ID))) throw friendlyCameraError();
  const frame = services.camera.getFrameFor("lab-capture", kind === "image" ? EMBED_SIZE : DETECT_SIZE);
  if (!frame) throw new Error("Kamera sedang bersiap. Coba lagi sebentar.");
  if (kind === "image") {
    // Thumbnail dibuat SEBELUM await: kanvas bisa ditimpa pengambilan berikutnya.
    const thumb = makeThumbnail(frame);
    const { features } = await featuresFromFrame(services, "image", frame, services.camera.isMirrored);
    if (!features) throw new Error("Gambar tidak bisa dibaca.");
    return { features, ...(thumb ? { thumb } : {}) };
  }
  const { features } = await featuresFromFrame(services, kind, frame, services.camera.isMirrored);
  if (!features) {
    throw new Error(
      kind === "pose"
        ? "Tubuhmu belum terlihat jelas. Mundur sedikit supaya kepala, bahu, dan tangan masuk kamera."
        : "Tangan belum terlihat. Tunjukkan satu tangan ke kamera dengan jelas.",
    );
  }
  return { features };
}

/** Pratinjau: fitur frame kamera terbaru (null bila kamera mati). */
export async function previewFromCamera(services: AiServices, kind: CameraKind): Promise<PreviewFrame | null> {
  const frame = services.camera.getFrameFor("lab-preview", kind === "image" ? EMBED_SIZE : DETECT_SIZE);
  if (!frame) return null;
  return featuresFromFrame(services, kind, frame, services.camera.isMirrored);
}

/** Gambar dari file -> kanvas 224x224 (dipotong tengah supaya tidak gepeng). */
async function decodeImageFile(file: Blob): Promise<HTMLCanvasElement> {
  let source: CanvasImageSource & { width: number; height: number };
  let cleanup = (): void => {};
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file);
    source = bmp;
    cleanup = () => bmp.close();
  } else {
    // Safari lama: tanpa createImageBitmap untuk Blob.
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } finally {
      URL.revokeObjectURL(url);
    }
    source = img;
  }
  try {
    const [w, h] = EMBED_SIZE;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Kanvas tidak tersedia.");
    const side = Math.min(source.width, source.height);
    ctx.drawImage(source, (source.width - side) / 2, (source.height - side) / 2, side, side, 0, 0, w, h);
    return c;
  } finally {
    cleanup();
  }
}

/** Contoh dari file gambar unggahan (PNG/JPEG/WebP/HEIC yang bisa dibaca browser). */
export async function captureFromFile(services: AiServices, file: File): Promise<Captured> {
  if (!file.type.startsWith("image/")) throw new Error(`"${file.name}" bukan gambar.`);
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`"${file.name}" terlalu besar (maks 10 MB).`);
  let canvas: HTMLCanvasElement;
  try {
    canvas = await decodeImageFile(file);
  } catch {
    throw new Error(`"${file.name}" tidak bisa dibuka.`);
  }
  const thumb = makeThumbnail(canvas);
  const { features } = await featuresFromFrame(services, "image", canvas, false);
  if (!features) throw new Error(`"${file.name}" tidak bisa dibaca.`);
  return { features, ...(thumb ? { thumb } : {}) };
}

export interface RecordOptions {
  seconds: number;
  timers?: IntervalTimers;
  sleep?: (ms: number) => Promise<void>;
  /** Level suara 0..1 tiap tick (untuk meteran). */
  onLevel?: (level: number) => void;
  /** Dibatalkan (mis. tab berganti). */
  signal?: { aborted: boolean };
}

/**
 * Rekam suara selama `seconds` detik dan pecah jadi beberapa jendela 1 detik (geser 0.5 detik).
 * Mengembalikan vektor fitur per jendela; audionya sendiri tidak disimpan.
 */
export async function recordAudioSamples(services: AiServices, opts: RecordOptions): Promise<Float32Array[]> {
  if (!(await services.ensureMicrophone(LAB_ID))) {
    throw new Error("Mikrofon belum diizinkan. Izinkan mikrofon di browser lalu coba lagi.");
  }
  const out: Float32Array[] = [];
  let sinceLast = 0;
  const listener = new AudioListener(
    services.microphone,
    (l) => {
      opts.onLevel?.(l.window.level());
      sinceLast++;
      const half = Math.max(1, Math.floor(l.window.maxFrames / 2));
      if (l.window.size >= l.window.maxFrames && sinceLast >= half) {
        sinceLast = 0;
        const f = l.window.features();
        if (f) out.push(f);
      }
    },
    opts.timers,
  );
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  listener.start();
  try {
    const end = Math.max(1, Math.min(10, opts.seconds)) * 1000;
    for (let t = 0; t < end && !opts.signal?.aborted; t += 100) await sleep(100);
    // Rekaman pendek: pakai apa yang ada (minimal beberapa frame).
    if (out.length === 0 && listener.window.size >= 5) {
      const f = listener.window.features();
      if (f) out.push(f);
    }
  } finally {
    listener.stop();
  }
  if (out.length === 0) throw new Error("Suara tidak terekam. Pastikan mikrofon menyala lalu coba lagi.");
  return out;
}
