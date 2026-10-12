/**
 * Sesi AI Lab satu jenis model (gambar, pose, tangan, suara, teks), tanpa React.
 * Alur seperti Teachable Machine: kelas -> contoh -> Latih (dengan progres + perkiraan akurasi)
 * -> pratinjau -> model otomatis disimpan ke project, menu kelas di blok langsung diperbarui.
 *
 * Privasi: contoh disimpan sebagai vektor fitur / hitungan kata. Foto kecil (thumbnail) hanya ada di
 * memori selama AI Lab terbuka, dan HANYA ikut disimpan ke project bila pengguna mencentang opsinya.
 */
import type { IRuntime } from "@kody/engine";
import { BACKGROUND_LABEL } from "../classifier/audio-features";
import { KnnClassifier, KNN_LIMITS } from "../classifier/knn";
import type { VectorKind } from "../classifier/knn";
import { clearTrained, parseModelFile, parseTrained, readTrained, serializeModelFile, writeTrained } from "../classifier/storage";
import { TextClassifier, TEXT_LIMITS } from "../classifier/text-nb";
import { dot, l2Normalize } from "../classifier/vector";
import { AI_LIMITS, sanitizeLabel } from "../security";
import type { ClassificationResult, TrainedClassifier, TrainedKind } from "../types";

export type LabKind = TrainedKind;

export { BACKGROUND_LABEL };

/** Contoh minimum per kelas sebelum boleh dilatih. */
export const MIN_SAMPLES: Record<LabKind, number> = { image: 5, pose: 5, hand: 5, audio: 4, text: 3 };

export interface LabSample {
  id: number;
  /** Vektor fitur (gambar/pose/tangan/suara). */
  features?: Float32Array;
  /** Kalimat contoh (teks). Tidak pernah disimpan ke project. */
  text?: string;
  /** Data URL foto kecil (gambar saja). */
  thumb?: string;
}

export interface LabClass {
  id: number;
  name: string;
  samples: LabSample[];
  /** Teks: jumlah contoh dari model tersimpan (kalimatnya tidak disimpan, jadi tidak bisa ditampilkan). */
  savedCount: number;
}

/** empty = belum ada contoh; untrained = ada contoh, belum dilatih; stale = sudah dilatih lalu diubah. */
export type LabStatus = "empty" | "untrained" | "training" | "trained" | "stale";

export interface TrainReport {
  /** Perkiraan akurasi leave-one-out 0..1 (null bila terlalu sedikit/terlalu banyak contoh). */
  accuracy: number | null;
  perClass: Record<string, number | null>;
  sampleCount: number;
}

export interface LabSessionOptions {
  /** Jeda antar potongan kerja pelatihan supaya UI tetap responsif (tes: tanpa jeda). */
  yieldFn?: () => Promise<void>;
  now?: () => number;
}

const defaultYield = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const MAX_LOO_VECTOR = 400;
const MAX_LOO_TEXT = 120;

export class LabSession {
  private list: LabClass[] = [];
  private nextId = 1;
  private listeners = new Set<() => void>();
  private model: KnnClassifier | TextClassifier | null = null;
  private lastTrained: TrainedClassifier | null = null;
  /** Teks: model tersimpan (hitungan kata) yang jadi dasar pelatihan berikutnya. */
  private textBase: TextClassifier | null = null;
  private readonly yieldFn: () => Promise<void>;
  private readonly now: () => number;
  status: LabStatus = "empty";
  progress = 0;
  report: TrainReport | null = null;
  loadError: string | null = null;
  /** Gambar: simpan foto kecil ke project (default tidak). */
  includeThumbnails = false;

  constructor(
    readonly runtime: IRuntime,
    readonly kind: LabKind,
    opts: LabSessionOptions = {},
  ) {
    this.yieldFn = opts.yieldFn ?? defaultYield;
    this.now = opts.now ?? Date.now;
    const raw = readTrained(runtime, kind);
    if (raw !== undefined && raw !== null) {
      try {
        this.loadModel(raw as TrainedClassifier);
      } catch (err) {
        this.loadError = `Model tersimpan di project tidak bisa dibuka: ${(err as Error).message}`;
        this.resetClasses();
      }
    } else {
      this.resetClasses();
    }
  }

  // ---------------------------------------------------------------------------
  // keadaan
  // ---------------------------------------------------------------------------

  get classes(): readonly LabClass[] {
    return this.list;
  }

  get labels(): string[] {
    return this.list.map((c) => c.name);
  }

  get isTrained(): boolean {
    return this.model !== null;
  }

  get trainedModel(): TrainedClassifier | null {
    return this.lastTrained;
  }

  count(c: LabClass): number {
    return c.samples.length + c.savedCount;
  }

  get totalSamples(): number {
    return this.list.reduce((n, c) => n + this.count(c), 0);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }

  private touched(): void {
    if (this.status === "training") return;
    if (this.model) this.status = "stale";
    else this.status = this.totalSamples > 0 ? "untrained" : "empty";
    this.emit();
  }

  private find(id: number): LabClass {
    const c = this.list.find((x) => x.id === id);
    if (!c) throw new Error("Kelas tidak ditemukan.");
    return c;
  }

  // ---------------------------------------------------------------------------
  // kelas & contoh
  // ---------------------------------------------------------------------------

  private uniqueName(base: string): string {
    let name = sanitizeLabel(base) || "Kelas";
    let n = 2;
    const root = name;
    while (this.list.some((c) => c.name === name)) name = `${root} ${n++}`.slice(0, AI_LIMITS.maxLabelLength);
    return name;
  }

  addClass(name?: string): LabClass {
    if (this.list.length >= AI_LIMITS.maxLabels) throw new Error(`Paling banyak ${AI_LIMITS.maxLabels} kelas.`);
    const fallback = `Kelas ${this.list.filter((c) => c.name !== BACKGROUND_LABEL).length + 1}`;
    const c: LabClass = { id: this.nextId++, name: this.uniqueName(name?.trim() ? name : fallback), samples: [], savedCount: 0 };
    this.list.push(c);
    this.touched();
    return c;
  }

  /**
   * Isi nama kelas awal (dari kartu tutorial, mis. batu/gunting/kertas). Hanya bila sesi masih kosong
   * dan belum ada model terlatih, supaya kerja anak tidak pernah tertimpa. Mengembalikan true bila diterapkan.
   */
  presetClasses(names: readonly string[]): boolean {
    if (this.model || this.totalSamples > 0) return false;
    const clean: string[] = [];
    for (const raw of names) {
      const name = sanitizeLabel(raw);
      if (!name || name === BACKGROUND_LABEL || clean.includes(name)) continue;
      clean.push(name);
    }
    const room = AI_LIMITS.maxLabels - (this.kind === "audio" ? 1 : 0);
    if (clean.length < 2) return false;
    this.list = [];
    if (this.kind === "audio") this.list.push({ id: this.nextId++, name: BACKGROUND_LABEL, samples: [], savedCount: 0 });
    for (const name of clean.slice(0, room)) this.list.push({ id: this.nextId++, name, samples: [], savedCount: 0 });
    this.touched();
    return true;
  }

  isLocked(c: LabClass): boolean {
    return this.kind === "audio" && c.name === BACKGROUND_LABEL;
  }

  renameClass(id: number, raw: string): string {
    const c = this.find(id);
    if (this.isLocked(c)) throw new Error(`Kelas "${BACKGROUND_LABEL}" tidak bisa diganti namanya.`);
    const name = sanitizeLabel(raw);
    if (!name) throw new Error("Nama kelas tidak boleh kosong.");
    if (name === c.name) return name;
    if (this.list.some((x) => x.name === name)) throw new Error(`Sudah ada kelas bernama "${name}".`);
    if (this.kind === "audio" && name === BACKGROUND_LABEL) throw new Error(`Nama "${BACKGROUND_LABEL}" khusus untuk suara latar.`);
    if (this.textBase?.labels.includes(c.name)) this.textBase.renameLabel(c.name, name);
    c.name = name;
    this.touched();
    return name;
  }

  removeClass(id: number): void {
    const c = this.find(id);
    if (this.isLocked(c)) throw new Error(`Kelas "${BACKGROUND_LABEL}" wajib ada supaya AI tahu bedanya hening dan suara.`);
    this.list = this.list.filter((x) => x !== c);
    this.textBase?.removeLabel(c.name);
    this.touched();
  }

  addSample(classId: number, sample: Omit<LabSample, "id">): LabSample {
    const c = this.find(classId);
    const perClass = this.kind === "text" ? TEXT_LIMITS.maxExamplesPerClass : KNN_LIMITS.maxExamplesPerClass;
    if (this.count(c) >= perClass) throw new Error(`Kelas "${c.name}" sudah penuh (${perClass} contoh).`);
    if (this.kind !== "text" && this.totalSamples >= KNN_LIMITS.maxExamplesTotal) {
      throw new Error(`Total contoh sudah ${KNN_LIMITS.maxExamplesTotal}. Hapus beberapa dulu.`);
    }
    if (this.kind === "text") {
      const text = (sample.text ?? "").trim().slice(0, 500);
      if (!text) throw new Error("Tulis dulu contoh kalimatnya.");
      const s: LabSample = { id: this.nextId++, text };
      c.samples.push(s);
      this.touched();
      return s;
    }
    const f = sample.features;
    if (!f || f.length === 0) throw new Error("Contoh kosong.");
    const dim = this.dimension();
    if (dim !== 0 && f.length !== dim) throw new Error("Contoh ini berbeda jenis dengan contoh sebelumnya.");
    const s: LabSample = { id: this.nextId++, features: f, ...(sample.thumb ? { thumb: sample.thumb } : {}) };
    c.samples.push(s);
    this.touched();
    return s;
  }

  removeSample(classId: number, sampleId: number): void {
    const c = this.find(classId);
    c.samples = c.samples.filter((s) => s.id !== sampleId);
    this.touched();
  }

  /** Hapus semua contoh satu kelas (termasuk hitungan tersimpan untuk teks). */
  clearSamples(classId: number): void {
    const c = this.find(classId);
    c.samples = [];
    if (c.savedCount > 0 && this.textBase) {
      this.textBase.removeLabel(c.name);
      this.textBase.addLabel(c.name);
    }
    c.savedCount = 0;
    this.touched();
  }

  setIncludeThumbnails(on: boolean): void {
    this.includeThumbnails = on;
    this.touched();
  }

  private dimension(): number {
    for (const c of this.list) for (const s of c.samples) if (s.features) return s.features.length;
    return 0;
  }

  // ---------------------------------------------------------------------------
  // pelatihan
  // ---------------------------------------------------------------------------

  /** Masalah yang membuat model belum bisa dilatih (kalimat ramah anak). Kosong = siap. */
  problems(): string[] {
    const out: string[] = [];
    const min = MIN_SAMPLES[this.kind];
    if (this.list.length < 2) out.push("Butuh minimal 2 kelas supaya AI bisa membandingkan.");
    for (const c of this.list) {
      const n = this.count(c);
      if (n < min) out.push(`Kelas "${c.name}" butuh minimal ${min} contoh (sekarang ${n}).`);
    }
    return out;
  }

  get canTrain(): boolean {
    return this.status !== "training" && this.problems().length === 0;
  }

  /** Latih model, perkirakan akurasi, lalu simpan ke project. false bila belum memenuhi syarat. */
  async train(onProgress?: (p: number) => void): Promise<boolean> {
    if (!this.canTrain) return false;
    this.status = "training";
    this.progress = 0;
    this.emit();
    const step = (p: number): void => {
      this.progress = p;
      onProgress?.(p);
      this.emit();
    };
    try {
      const model = this.kind === "text" ? await this.trainText(step) : await this.trainVector(step);
      const trained = this.toTrained(model);
      this.model = model;
      this.lastTrained = trained;
      writeTrained(this.runtime, trained);
      step(1);
      this.status = "trained";
      this.emit();
      return true;
    } catch (err) {
      this.status = this.model ? "stale" : "untrained";
      this.emit();
      throw err;
    }
  }

  private async trainVector(step: (p: number) => void): Promise<KnnClassifier> {
    const minPerClass = Math.min(...this.list.map((c) => c.samples.length));
    const clf = new KnnClassifier({ k: Math.max(1, Math.min(5, minPerClass)) });
    for (const c of this.list) clf.addLabel(c.name);
    const all = this.list.flatMap((c) => c.samples.map((s) => ({ label: c.name, s })));
    for (let i = 0; i < all.length; i++) {
      const { label, s } = all[i] as (typeof all)[number];
      clf.addExample(label, s.features as Float32Array);
      if (this.kind === "image" && this.includeThumbnails && s.thumb) clf.addThumbnail(label, s.thumb);
      if (i % 25 === 24) {
        step(0.5 * ((i + 1) / all.length));
        await this.yieldFn();
      }
    }
    step(0.5);
    this.report = await this.vectorAccuracy(clf.k, step);
    return clf;
  }

  /** Perkiraan akurasi leave-one-out dengan KNN (tiap contoh ditebak dari contoh lain). */
  private async vectorAccuracy(k: number, step: (p: number) => void): Promise<TrainReport> {
    const items = this.list.flatMap((c, li) => c.samples.map((s) => ({ li, v: l2Normalize(s.features as Float32Array) })));
    const perClass: Record<string, number | null> = {};
    if (items.length > MAX_LOO_VECTOR) {
      for (const c of this.list) perClass[c.name] = null;
      return { accuracy: null, perClass, sampleCount: items.length };
    }
    const right = new Array<number>(this.list.length).fill(0);
    const total = new Array<number>(this.list.length).fill(0);
    for (let i = 0; i < items.length; i++) {
      const me = items[i] as (typeof items)[number];
      const sims = items.flatMap((o, j) => (j === i ? [] : [{ li: o.li, sim: dot(me.v, o.v) }])).sort((a, b) => b.sim - a.sim);
      const votes = new Array<number>(this.list.length).fill(0);
      for (const t of sims.slice(0, k)) votes[t.li] = (votes[t.li] ?? 0) + 1 + t.sim * 1e-6;
      let best = 0;
      for (let v = 1; v < votes.length; v++) if ((votes[v] as number) > (votes[best] as number)) best = v;
      total[me.li] = (total[me.li] ?? 0) + 1;
      if (best === me.li) right[me.li] = (right[me.li] ?? 0) + 1;
      if (i % 20 === 19) {
        step(0.5 + 0.5 * ((i + 1) / items.length));
        await this.yieldFn();
      }
    }
    return this.makeReport(right, total, items.length);
  }

  private async trainText(step: (p: number) => void): Promise<TextClassifier> {
    const build = (skip: { c: number; s: number } | null): TextClassifier => {
      const clf = this.textBase ? this.textBase.clone() : new TextClassifier();
      this.list.forEach((c, ci) => {
        clf.addLabel(c.name);
        c.samples.forEach((s, si) => {
          if (skip && skip.c === ci && skip.s === si) return;
          clf.addExample(c.name, s.text ?? "");
        });
      });
      // Urutan label mengikuti daftar kelas.
      return clf;
    };
    const clf = build(null);
    step(0.4);
    const fresh = this.list.flatMap((c, ci) => c.samples.map((_, si) => ({ c: ci, s: si })));
    const perClass: Record<string, number | null> = {};
    if (fresh.length > MAX_LOO_TEXT || fresh.length === 0) {
      for (const c of this.list) perClass[c.name] = null;
      this.report = { accuracy: null, perClass, sampleCount: this.totalSamples };
      return clf;
    }
    const right = new Array<number>(this.list.length).fill(0);
    const total = new Array<number>(this.list.length).fill(0);
    for (let i = 0; i < fresh.length; i++) {
      const at = fresh[i] as { c: number; s: number };
      const cls = this.list[at.c] as LabClass;
      const guess = build(at).predict(cls.samples[at.s]?.text ?? "");
      total[at.c] = (total[at.c] ?? 0) + 1;
      if (guess?.label === cls.name) right[at.c] = (right[at.c] ?? 0) + 1;
      if (i % 10 === 9) {
        step(0.4 + 0.6 * ((i + 1) / fresh.length));
        await this.yieldFn();
      }
    }
    this.report = this.makeReport(right, total, this.totalSamples);
    return clf;
  }

  private makeReport(right: number[], total: number[], sampleCount: number): TrainReport {
    const perClass: Record<string, number | null> = {};
    this.list.forEach((c, i) => (perClass[c.name] = (total[i] ?? 0) > 0 ? (right[i] ?? 0) / (total[i] as number) : null));
    const sumT = total.reduce((a, b) => a + b, 0);
    const sumR = right.reduce((a, b) => a + b, 0);
    return { accuracy: sumT > 0 ? sumR / sumT : null, perClass, sampleCount };
  }

  private toTrained(model: KnnClassifier | TextClassifier): TrainedClassifier {
    const now = this.now();
    if (model instanceof TextClassifier) return model.toTrained(now);
    return model.toTrained(this.kind as VectorKind, now);
  }

  // ---------------------------------------------------------------------------
  // prediksi
  // ---------------------------------------------------------------------------

  predictFeatures(features: ArrayLike<number> | null): ClassificationResult | null {
    if (!features || !(this.model instanceof KnnClassifier)) return null;
    return this.model.predict(features);
  }

  predictText(text: string): ClassificationResult | null {
    if (!(this.model instanceof TextClassifier) || !text.trim()) return null;
    return this.model.predict(text);
  }

  // ---------------------------------------------------------------------------
  // simpan / bagikan
  // ---------------------------------------------------------------------------

  /** Isi file model untuk diunduh (hanya model yang sudah dilatih). */
  exportFile(): string {
    if (!this.lastTrained) throw new Error("Latih model dulu sebelum dibagikan.");
    return serializeModelFile(this.lastTrained);
  }

  /** Muat file model dari teman/guru (divalidasi penuh), lalu simpan ke project. */
  importFile(text: string): void {
    const model = parseModelFile(text, this.kind);
    this.loadModel(model);
    writeTrained(this.runtime, model);
    this.loadError = null;
    this.emit();
  }

  /** Hapus semua kelas, contoh, dan model di project untuk jenis ini. */
  resetAll(): void {
    this.model = null;
    this.lastTrained = null;
    this.textBase = null;
    this.report = null;
    this.loadError = null;
    this.resetClasses();
    clearTrained(this.runtime, this.kind);
    this.status = "empty";
    this.emit();
  }

  private resetClasses(): void {
    this.list = [];
    if (this.kind === "audio") this.list.push({ id: this.nextId++, name: BACKGROUND_LABEL, samples: [], savedCount: 0 });
    while (this.list.length < 2) {
      const n = this.list.filter((c) => c.name !== BACKGROUND_LABEL).length + 1;
      this.list.push({ id: this.nextId++, name: `Kelas ${n}`, samples: [], savedCount: 0 });
    }
    this.status = "empty";
  }

  /** Muat model (dari project / file) menjadi kelas & contoh yang bisa diedit. */
  private loadModel(raw: TrainedClassifier): void {
    const parsed = parseTrained(raw, this.kind);
    this.list = [];
    this.textBase = null;
    if (parsed instanceof TextClassifier) {
      this.textBase = parsed.clone();
      for (const label of parsed.labels) {
        this.list.push({ id: this.nextId++, name: label, samples: [], savedCount: parsed.exampleCount(label) });
      }
    } else {
      for (const label of parsed.labels) {
        const thumbs = parsed.thumbnails(label);
        const samples = parsed.examplesOf(label).map((features, i) => ({
          id: this.nextId++,
          features,
          ...(thumbs[i] ? { thumb: thumbs[i] } : {}),
        }));
        this.list.push({ id: this.nextId++, name: label, samples, savedCount: 0 });
      }
      if (this.kind === "image" && parsed.labels.some((l) => parsed.thumbnails(l).length > 0)) this.includeThumbnails = true;
    }
    this.model = parsed;
    this.lastTrained = raw;
    this.report = null;
    this.status = "trained";
    if (this.kind === "audio" && !this.list.some((c) => c.name === BACKGROUND_LABEL)) {
      // Model lama tanpa suara latar: kelasnya ditambahkan, anak perlu merekam & melatih ulang.
      this.list.unshift({ id: this.nextId++, name: BACKGROUND_LABEL, samples: [], savedCount: 0 });
      this.status = "stale";
    }
  }
}

/** Untuk tes & UI: buat sesi untuk semua jenis. */
export const LAB_KINDS: readonly LabKind[] = ["image", "pose", "hand", "audio", "text"];
