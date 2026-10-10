/**
 * Logika AI Lab (tanpa React): mengumpulkan contoh, melatih di browser, menyimpan ke project.
 * Privasi: yang disimpan hanya vektor fitur/hitungan token. Foto kecil (thumbnail) HANYA disimpan
 * bila pengguna mencentang opsi itu secara eksplisit (includeThumbnails = true).
 */
import type { IRuntime } from "@kody/engine";
import { KnnClassifier } from "../classifier/knn";
import { clearTrained, readTrained, writeTrained } from "../classifier/storage";
import type { TrainedKind } from "../classifier/storage";
import { TextClassifier } from "../classifier/text-nb";
import { AudioListener } from "../devices/audio-listener";
import type { IntervalTimers } from "../devices/audio-listener";
import { getAiServices } from "../services";
import type { AiServices } from "../services";
import type { ClassificationResult, FrameSource } from "../types";

export const LAB_ID = "aiLab";

abstract class LabBase<C extends { labels: string[]; addLabel(l: unknown): string; removeLabel(l: string): void; exampleCount(l: string): number; isTrained(): boolean }> {
  protected clf: C;
  private listeners = new Set<() => void>();
  loadError: string | null = null;

  constructor(
    protected readonly runtime: IRuntime,
    protected readonly kind: TrainedKind,
    create: () => C,
    restore: (raw: unknown) => C,
  ) {
    const raw = readTrained(runtime, kind);
    let clf = create();
    if (raw !== undefined && raw !== null) {
      try {
        clf = restore(raw);
      } catch (err) {
        this.loadError = (err as Error).message;
      }
    }
    this.clf = clf;
  }

  protected get services(): AiServices {
    return getAiServices(this.runtime);
  }

  get labels(): readonly string[] {
    return this.clf.labels;
  }

  count(label: string): number {
    return this.clf.exampleCount(label);
  }

  get trained(): boolean {
    return this.clf.isTrained();
  }

  addClass(name: unknown): string {
    const label = this.clf.addLabel(name);
    this.changed();
    return label;
  }

  removeClass(label: string): void {
    this.clf.removeLabel(label);
    this.changed();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  protected changed(): void {
    for (const fn of [...this.listeners]) fn();
  }

  /** Simpan model ke project (state panggung). */
  save(): boolean {
    if (!this.clf.isTrained()) throw new Error("Butuh minimal 2 kelas yang masing-masing punya contoh.");
    return writeTrained(this.runtime, this.toTrained());
  }

  /** Hapus model dari project. */
  clearSaved(): void {
    clearTrained(this.runtime, this.kind);
  }

  protected abstract toTrained(): ReturnType<KnnClassifier["toTrained"]>;
}

export interface ImageLabOptions {
  /** Simpan foto kecil di project. Default false: hanya vektor fitur yang disimpan. */
  includeThumbnails?: boolean;
  /** Pembuat thumbnail JPEG kecil (tes bisa mengganti). */
  makeThumbnail?: (frame: FrameSource) => string | null;
}

function defaultThumbnail(frame: FrameSource): string | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 48;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  if (typeof ImageData !== "undefined" && frame instanceof ImageData) return null;
  ctx.drawImage(frame as CanvasImageSource, 0, 0, 64, 48);
  return c.toDataURL("image/jpeg", 0.6);
}

export class ImageLabController extends LabBase<KnnClassifier> {
  includeThumbnails: boolean;
  private readonly makeThumbnail: (frame: FrameSource) => string | null;

  constructor(runtime: IRuntime, opts: ImageLabOptions = {}) {
    super(runtime, "image", () => new KnnClassifier({ k: 5 }), (raw) => KnnClassifier.fromTrained(raw, "image"));
    this.includeThumbnails = opts.includeThumbnails ?? false;
    this.makeThumbnail = opts.makeThumbnail ?? defaultThumbnail;
  }

  setIncludeThumbnails(value: boolean): void {
    this.includeThumbnails = value;
    this.changed();
  }

  /** Tambah contoh dari gambar (unggahan atau frame kamera). Gambar tidak disimpan kecuali opsi thumbnail aktif. */
  async addImage(label: string, frame: FrameSource): Promise<void> {
    const embedder = await this.services.detector("imageEmbedder");
    const features = await embedder.embed(frame);
    this.clf.addExample(label, features);
    if (this.includeThumbnails) {
      const thumb = this.makeThumbnail(frame);
      if (thumb) this.clf.addThumbnail(label, thumb);
    }
    this.changed();
  }

  /** Ambil satu contoh dari kamera (menyalakan kamera bila perlu). */
  async captureFromCamera(label: string): Promise<boolean> {
    if (!(await this.services.ensureCamera(LAB_ID))) return false;
    const frame = this.services.camera.getFrame({ format: "canvas", dimensions: [224, 224] });
    if (!frame) return false;
    await this.addImage(label, frame as FrameSource);
    return true;
  }

  async predict(frame: FrameSource): Promise<ClassificationResult | null> {
    if (!this.clf.isTrained()) return null;
    const embedder = await this.services.detector("imageEmbedder");
    return this.clf.predict(await embedder.embed(frame));
  }

  thumbnails(label: string): string[] {
    return this.clf.thumbnails(label);
  }

  protected toTrained(): ReturnType<KnnClassifier["toTrained"]> {
    const t = this.clf.toTrained("image");
    if (this.includeThumbnails) return t;
    // Tanpa izin eksplisit: buang thumbnail sebelum disimpan.
    const payload = JSON.parse(t.payload) as { thumbnails?: unknown };
    delete payload.thumbnails;
    return { ...t, payload: JSON.stringify(payload) };
  }
}

export class TextLabController extends LabBase<TextClassifier> {
  constructor(runtime: IRuntime) {
    super(runtime, "text", () => new TextClassifier(), (raw) => TextClassifier.fromTrained(raw));
  }

  addText(label: string, text: string): void {
    this.clf.addExample(label, text);
    this.changed();
  }

  predict(text: string): ClassificationResult | null {
    return this.clf.predict(text);
  }

  protected toTrained(): ReturnType<KnnClassifier["toTrained"]> {
    return this.clf.toTrained();
  }
}

export interface AudioLabOptions {
  timers?: IntervalTimers;
  /** Penunda (tes bisa mempercepat). */
  sleep?: (ms: number) => Promise<void>;
}

export class AudioLabController extends LabBase<KnnClassifier> {
  private readonly timers: IntervalTimers | undefined;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(runtime: IRuntime, opts: AudioLabOptions = {}) {
    super(runtime, "audio", () => new KnnClassifier({ k: 5 }), (raw) => KnnClassifier.fromTrained(raw, "audio"));
    this.timers = opts.timers;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Rekam satu contoh suara (~1 detik). Hanya vektor fitur yang disimpan, bukan audionya. */
  async record(label: string, durationMs = 1000): Promise<boolean> {
    const services = this.services;
    if (!(await services.ensureMicrophone(LAB_ID))) return false;
    const listener = new AudioListener(services.microphone, undefined, this.timers);
    listener.start();
    try {
      await this.sleep(durationMs);
      const features = listener.window.features();
      if (!features || listener.window.size < 3) return false;
      this.clf.addExample(label, features);
      this.changed();
      return true;
    } finally {
      listener.stop();
    }
  }

  protected toTrained(): ReturnType<KnnClassifier["toTrained"]> {
    return this.clf.toTrained("audio");
  }
}
