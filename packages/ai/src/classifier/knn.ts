/**
 * Classifier vektor fitur untuk AI Lab (gambar & suara): K-nearest-neighbour atau centroid
 * dengan kemiripan kosinus. Dilatih di browser; disimpan di project sebagai TrainedClassifier
 * (vektor fitur int8, BUKAN foto/rekaman mentah).
 */
import { AI_LIMITS, sanitizeLabel, validateTrainedClassifier } from "../security";
import type { ClassificationResult, TrainedClassifier } from "../types";

/** Jenis model vektor fitur (semua kecuali teks). */
export type VectorKind = "image" | "audio" | "pose" | "hand";
import { decodeInt8Vector, dot, encodeInt8Vector, isFiniteVector, l2Normalize, softmax } from "./vector";

export const KNN_LIMITS = {
  maxDim: 4096,
  maxExamplesPerClass: 200,
  maxExamplesTotal: 1000,
  maxThumbnailsPerClass: 6,
  maxThumbnailChars: 40_000,
} as const;

export type KnnMode = "knn" | "centroid";

export interface KnnPayload {
  format: "knn-int8";
  mode: KnnMode;
  dim: number;
  k: number;
  /** [indeks label, vektor int8 base64]. */
  examples: [number, string][];
  /** Thumbnail JPEG kecil, HANYA bila pengguna memilih menyimpannya secara eksplisit. */
  thumbnails?: [number, string][];
}

const THUMB_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

interface Example {
  label: number;
  vector: Float32Array;
}

export interface KnnOptions {
  k?: number;
  mode?: KnnMode;
}

export class KnnClassifier {
  readonly labels: string[] = [];
  private examples: Example[] = [];
  private thumbs: [number, string][] = [];
  private dim = 0;
  readonly k: number;
  readonly mode: KnnMode;

  constructor(opts: KnnOptions = {}) {
    this.k = Math.max(1, Math.min(25, Math.floor(opts.k ?? 5)));
    this.mode = opts.mode ?? "knn";
  }

  get dimension(): number {
    return this.dim;
  }

  get totalExamples(): number {
    return this.examples.length;
  }

  /** Tambah kelas (label disanitasi). Mengembalikan label bersih. */
  addLabel(raw: unknown): string {
    const label = sanitizeLabel(raw);
    if (!label) throw new Error("Nama kelas tidak boleh kosong.");
    if (this.labels.includes(label)) return label;
    if (this.labels.length >= AI_LIMITS.maxLabels) throw new Error(`Maksimum ${AI_LIMITS.maxLabels} kelas.`);
    this.labels.push(label);
    return label;
  }

  /** Ganti nama kelas (label baru disanitasi, tidak boleh bentrok). Mengembalikan label bersih. */
  renameLabel(oldLabel: string, raw: unknown): string {
    const idx = this.labels.indexOf(oldLabel);
    if (idx < 0) throw new Error(`Kelas "${oldLabel}" belum ada.`);
    const label = sanitizeLabel(raw);
    if (!label) throw new Error("Nama kelas tidak boleh kosong.");
    if (label !== oldLabel && this.labels.includes(label)) throw new Error(`Kelas "${label}" sudah ada.`);
    this.labels[idx] = label;
    return label;
  }

  /** Semua contoh (vektor ternormalisasi) per label, urut sesuai urutan ditambahkan. */
  examplesOf(label: string): Float32Array[] {
    const idx = this.labels.indexOf(label);
    return idx < 0 ? [] : this.examples.filter((e) => e.label === idx).map((e) => e.vector);
  }

  removeLabel(label: string): void {
    const idx = this.labels.indexOf(label);
    if (idx < 0) return;
    this.labels.splice(idx, 1);
    const remap = (i: number): number => (i > idx ? i - 1 : i);
    this.examples = this.examples.filter((e) => e.label !== idx).map((e) => ({ ...e, label: remap(e.label) }));
    this.thumbs = this.thumbs.filter(([l]) => l !== idx).map(([l, t]) => [remap(l), t]);
    if (this.examples.length === 0) this.dim = 0;
  }

  exampleCount(label: string): number {
    const idx = this.labels.indexOf(label);
    return idx < 0 ? 0 : this.examples.filter((e) => e.label === idx).length;
  }

  addExample(label: string, features: ArrayLike<number>): void {
    const idx = this.labels.indexOf(sanitizeLabel(label));
    if (idx < 0) throw new Error(`Kelas "${label}" belum ada.`);
    if (features.length === 0 || features.length > KNN_LIMITS.maxDim) throw new Error("Dimensi fitur tidak valid.");
    if (!isFiniteVector(features)) throw new Error("Fitur mengandung NaN/Infinity.");
    if (this.dim !== 0 && features.length !== this.dim) throw new Error("Dimensi fitur berbeda dari contoh sebelumnya.");
    if (this.examples.length >= KNN_LIMITS.maxExamplesTotal) throw new Error("Contoh terlalu banyak.");
    if (this.exampleCount(this.labels[idx] as string) >= KNN_LIMITS.maxExamplesPerClass) {
      throw new Error(`Maksimum ${KNN_LIMITS.maxExamplesPerClass} contoh per kelas.`);
    }
    this.dim = features.length;
    this.examples.push({ label: idx, vector: l2Normalize(features) });
  }

  /** Simpan thumbnail kecil (opsional, hanya dipakai bila pengguna memilih menyimpan foto). */
  addThumbnail(label: string, dataUrl: string): void {
    const idx = this.labels.indexOf(label);
    if (idx < 0 || !THUMB_RE.test(dataUrl) || dataUrl.length > KNN_LIMITS.maxThumbnailChars) return;
    if (this.thumbs.filter(([l]) => l === idx).length >= KNN_LIMITS.maxThumbnailsPerClass) return;
    this.thumbs.push([idx, dataUrl]);
  }

  thumbnails(label: string): string[] {
    const idx = this.labels.indexOf(label);
    return this.thumbs.filter(([l]) => l === idx).map(([, t]) => t);
  }

  /** Bisa memprediksi bila minimal 2 kelas punya contoh. */
  isTrained(): boolean {
    const withExamples = new Set(this.examples.map((e) => e.label));
    return withExamples.size >= 2;
  }

  predict(features: ArrayLike<number>): ClassificationResult | null {
    if (!this.isTrained() || features.length !== this.dim || !isFiniteVector(features)) return null;
    const x = l2Normalize(features);
    const scores = this.mode === "centroid" ? this.centroidScores(x) : this.knnScores(x);
    let bestIdx = 0;
    for (let i = 1; i < scores.length; i++) if ((scores[i] as number) > (scores[bestIdx] as number)) bestIdx = i;
    const record: Record<string, number> = {};
    this.labels.forEach((l, i) => (record[l] = Math.round((scores[i] ?? 0) * 1000) / 1000));
    return { label: this.labels[bestIdx] ?? "", confidence: record[this.labels[bestIdx] ?? ""] ?? 0, scores: record };
  }

  private knnScores(x: Float32Array): number[] {
    const sims = this.examples.map((e) => ({ label: e.label, sim: dot(x, e.vector) }));
    sims.sort((a, b) => b.sim - a.sim);
    const top = sims.slice(0, Math.min(this.k, sims.length));
    const votes = new Array<number>(this.labels.length).fill(0);
    const simSum = new Array<number>(this.labels.length).fill(0);
    for (const t of top) {
      votes[t.label] = (votes[t.label] ?? 0) + 1;
      simSum[t.label] = (simSum[t.label] ?? 0) + t.sim;
    }
    // Seri suara dipecah oleh total kemiripan (epsilon kecil, tidak mengubah confidence nyata).
    return votes.map((v, i) => v / top.length + (simSum[i] ?? 0) * 1e-6);
  }

  private centroidScores(x: Float32Array): number[] {
    const sims = this.labels.map((_, li) => {
      const members = this.examples.filter((e) => e.label === li);
      if (members.length === 0) return -1;
      const c = new Float32Array(this.dim);
      for (const m of members) for (let i = 0; i < this.dim; i++) c[i] = (c[i] as number) + (m.vector[i] as number);
      return dot(x, l2Normalize(c));
    });
    return softmax(sims, 12);
  }

  toTrained(kind: VectorKind, now = Date.now()): TrainedClassifier {
    const payload: KnnPayload = {
      format: "knn-int8",
      mode: this.mode,
      dim: this.dim,
      k: this.k,
      examples: this.examples.map((e) => [e.label, encodeInt8Vector(e.vector)]),
    };
    if (this.thumbs.length > 0) payload.thumbnails = this.thumbs.map(([l, t]) => [l, t]);
    const json = JSON.stringify(payload);
    if (json.length > AI_LIMITS.maxTrainedPayloadBytes) throw new Error("Model terlalu besar untuk disimpan di project.");
    return { kind, version: 1, labels: [...this.labels], payload: json, createdAt: now };
  }

  /** Muat dari data project (TAK TEPERCAYA). Melempar Error dengan pesan jelas bila rusak. */
  static fromTrained(value: unknown, expectedKind: VectorKind): KnnClassifier {
    const problems = validateTrainedClassifier(value);
    if (problems.length > 0) throw new Error(`Model AI tidak valid: ${problems.join(", ")}`);
    const tc = value as TrainedClassifier;
    if (tc.kind !== expectedKind) throw new Error(`Model AI bukan jenis ${expectedKind}`);
    const p = parsePayload(tc.payload);
    const clf = new KnnClassifier({ k: p.k, mode: p.mode });
    for (const l of tc.labels) clf.addLabel(l);
    if (clf.labels.length !== tc.labels.length) throw new Error("Model AI: label ganda");
    for (const [labelIdx, vec] of p.examples) {
      const label = clf.labels[labelIdx];
      if (label === undefined) throw new Error("Model AI: indeks label di luar batas");
      clf.addExample(label, decodeInt8Vector(vec, p.dim));
    }
    for (const [labelIdx, t] of p.thumbnails ?? []) {
      const label = clf.labels[labelIdx];
      if (label !== undefined) clf.addThumbnail(label, t);
    }
    return clf;
  }
}

function parsePayload(payload: string): KnnPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    throw new Error("Model AI: payload bukan JSON");
  }
  const p = raw as Partial<KnnPayload>;
  if (typeof raw !== "object" || raw === null || p.format !== "knn-int8") throw new Error("Model AI: format tidak dikenal");
  if (p.mode !== "knn" && p.mode !== "centroid") throw new Error("Model AI: mode tidak valid");
  if (!Number.isInteger(p.dim) || (p.dim as number) <= 0 || (p.dim as number) > KNN_LIMITS.maxDim) {
    throw new Error("Model AI: dimensi tidak valid");
  }
  if (!Number.isInteger(p.k) || (p.k as number) < 1 || (p.k as number) > 25) throw new Error("Model AI: k tidak valid");
  if (!Array.isArray(p.examples) || p.examples.length > KNN_LIMITS.maxExamplesTotal) {
    throw new Error("Model AI: daftar contoh tidak valid");
  }
  const okPair = (e: unknown): boolean =>
    Array.isArray(e) && e.length === 2 && Number.isInteger(e[0]) && (e[0] as number) >= 0 && typeof e[1] === "string";
  if (!p.examples.every(okPair)) throw new Error("Model AI: contoh rusak");
  if (p.thumbnails !== undefined && (!Array.isArray(p.thumbnails) || !p.thumbnails.every(okPair))) {
    throw new Error("Model AI: thumbnail rusak");
  }
  return p as KnnPayload;
}
