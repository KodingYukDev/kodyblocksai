/**
 * Penyimpanan model terlatih di project: custom state target panggung dengan kunci "Kody.<extId>"
 * (ikut tersimpan di TargetState.extensionState oleh paket project). Data dibaca sebagai input
 * TAK TEPERCAYA dan selalu divalidasi sebelum dipakai; hasil parse di-cache per objek.
 *
 * Setiap kali model berubah (disimpan AI Lab, dihapus, project baru dimuat) menu kelas di palet
 * harus ikut berubah: notifyTrainedModelChanged memancarkan BLOCKSINFO_UPDATE untuk ekstensi
 * yang memakai model itu, sehingga app mendaftarkan ulang menu dinamisnya tanpa memuat ulang halaman.
 */
import type { IRuntime } from "@kody/engine";
import { AI_LIMITS, TRAINED_KINDS } from "../security";
import type { TrainedClassifier, TrainedKind } from "../types";
import { KnnClassifier } from "./knn";
import { TextClassifier } from "./text-nb";

export type { TrainedKind } from "../types";

export const TRAINED_STATE_KEYS: Record<TrainedKind, string> = {
  image: "Kody.aiImage",
  text: "Kody.aiText",
  audio: "Kody.aiAudio",
  pose: "Kody.aiPose",
  hand: "Kody.aiHand",
};

/** Ekstensi yang blok kelasnya membaca model jenis ini. */
export const TRAINED_KIND_EXTENSION: Record<TrainedKind, string> = {
  image: "aiImage",
  text: "aiText",
  audio: "aiAudio",
  pose: "aiPose",
  hand: "aiHand",
};

export function readTrained(runtime: IRuntime, kind: TrainedKind): unknown {
  return runtime.getTargetForStage()?.getCustomState<unknown>(TRAINED_STATE_KEYS[kind]);
}

/** Minta palet/menu kelas diperbarui (ekstensi yang sudah dimuat saja). */
export function notifyTrainedModelChanged(runtime: IRuntime, kind: TrainedKind): void {
  const id = TRAINED_KIND_EXTENSION[kind];
  let info;
  try {
    info = runtime.getExtensionInfo?.(id);
  } catch {
    info = undefined;
  }
  if (info) runtime.emit("BLOCKSINFO_UPDATE", { info });
}

export function writeTrained(runtime: IRuntime, model: TrainedClassifier | undefined): boolean {
  const stage = runtime.getTargetForStage();
  if (!stage || !model) return false;
  stage.setCustomState(TRAINED_STATE_KEYS[model.kind], model);
  runtime.emitProjectChanged();
  notifyTrainedModelChanged(runtime, model.kind);
  return true;
}

export function clearTrained(runtime: IRuntime, kind: TrainedKind): void {
  const stage = runtime.getTargetForStage();
  if (!stage) return;
  stage.setCustomState(TRAINED_STATE_KEYS[kind], undefined);
  runtime.emitProjectChanged();
  notifyTrainedModelChanged(runtime, kind);
}

type Parsed<K extends TrainedKind> = K extends "text" ? TextClassifier : KnnClassifier;

/** Parse model sesuai jenisnya (melempar Error berbahasa Indonesia bila rusak). */
export function parseTrained<K extends TrainedKind>(raw: unknown, kind: K): Parsed<K> {
  return (kind === "text" ? TextClassifier.fromTrained(raw) : KnnClassifier.fromTrained(raw, kind as Exclude<TrainedKind, "text">)) as Parsed<K>;
}

/** Memuat classifier dari state panggung dengan cache; error dilaporkan lewat onError (sekali per objek). */
export class TrainedModelCache<K extends TrainedKind> {
  private source: unknown = undefined;
  private parsed: Parsed<K> | null = null;

  constructor(
    private readonly runtime: IRuntime,
    private readonly kind: K,
    private readonly onError: (message: string) => void = () => {},
  ) {}

  get(): Parsed<K> | null {
    const raw = readTrained(this.runtime, this.kind);
    if (raw === this.source) return this.parsed;
    this.source = raw;
    this.parsed = null;
    if (raw === undefined || raw === null) return null;
    try {
      this.parsed = parseTrained(raw, this.kind);
    } catch (err) {
      this.onError((err as Error).message);
    }
    return this.parsed;
  }

  labels(): string[] {
    return this.get()?.labels ?? [];
  }
}

// ---------------------------------------------------------------------------
// File model (.kodyai) untuk dibagikan antar siswa. Isinya sama dengan yang disimpan di project.
// ---------------------------------------------------------------------------

export const MODEL_FILE_FORMAT = "kodyblocks-ai-model";
export const MODEL_FILE_EXTENSION = ".kodyai.json";

export interface ModelFile {
  format: typeof MODEL_FILE_FORMAT;
  version: 1;
  model: TrainedClassifier;
}

export function serializeModelFile(model: TrainedClassifier): string {
  const file: ModelFile = { format: MODEL_FILE_FORMAT, version: 1, model };
  return JSON.stringify(file);
}

/**
 * Baca file model (TAK TEPERCAYA): batas ukuran, JSON, bungkus, lalu parser ketat per jenis.
 * Mengembalikan model yang sudah lolos validasi penuh.
 */
export function parseModelFile(text: string, expectedKind?: TrainedKind): TrainedClassifier {
  if (typeof text !== "string" || text.length === 0) throw new Error("File model kosong.");
  if (text.length > AI_LIMITS.maxModelFileBytes) throw new Error("File model terlalu besar.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("File ini bukan file model KodyBlocks AI.");
  }
  const f = raw as Partial<ModelFile>;
  if (typeof raw !== "object" || raw === null || f.format !== MODEL_FILE_FORMAT || f.version !== 1) {
    throw new Error("File ini bukan file model KodyBlocks AI.");
  }
  const model = f.model as TrainedClassifier | undefined;
  const kind = model?.kind;
  if (!kind || !TRAINED_KINDS.includes(kind)) throw new Error("Jenis model tidak dikenal.");
  if (expectedKind && kind !== expectedKind) throw new Error(`Ini model ${KIND_NAMES[kind]}, bukan model ${KIND_NAMES[expectedKind]}.`);
  parseTrained(model, kind);
  return { kind, version: 1, labels: [...model.labels], payload: model.payload, createdAt: model.createdAt };
}

export const KIND_NAMES: Record<TrainedKind, string> = {
  image: "gambar",
  pose: "pose tubuh",
  hand: "gestur tangan",
  audio: "suara",
  text: "teks",
};
