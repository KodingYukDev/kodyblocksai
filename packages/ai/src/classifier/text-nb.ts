/**
 * Classifier teks lokal: Naive Bayes multinomial (Laplace) atas token kata + bigram kata.
 * Dilatih di browser dari contoh kalimat AI Lab. Yang disimpan di project hanya kosakata + hitungan,
 * bukan kalimat contoh aslinya.
 */
import { AI_LIMITS, clampTextInput, sanitizeLabel, validateTrainedClassifier } from "../security";
import type { ClassificationResult, TrainedClassifier } from "../types";
import { softmax } from "./vector";

export const TEXT_LIMITS = {
  maxVocab: 20_000,
  maxTokenLength: 40,
  maxExamplesPerClass: 500,
} as const;

export interface TextNbPayload {
  format: "nb-text";
  vocab: string[];
  /** Per kelas: pasangan [indeks token, hitungan]. */
  counts: [number, number][][];
  /** Jumlah dokumen contoh per kelas. */
  docs: number[];
}

/** Token: huruf kecil, tanpa diakritik, kata + bigram kata. */
export function tokenize(text: string): string[] {
  const words = clampTextInput(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0 && w.length <= TEXT_LIMITS.maxTokenLength);
  const tokens = [...words];
  for (let i = 0; i + 1 < words.length; i++) tokens.push(`${words[i]} ${words[i + 1]}`);
  return tokens;
}

export class TextClassifier {
  readonly labels: string[] = [];
  private readonly vocab = new Map<string, number>();
  private readonly vocabList: string[] = [];
  private counts: Map<number, number>[] = [];
  private docs: number[] = [];

  addLabel(raw: unknown): string {
    const label = sanitizeLabel(raw);
    if (!label) throw new Error("Nama kelas tidak boleh kosong.");
    if (this.labels.includes(label)) return label;
    if (this.labels.length >= AI_LIMITS.maxLabels) throw new Error(`Maksimum ${AI_LIMITS.maxLabels} kelas.`);
    this.labels.push(label);
    this.counts.push(new Map());
    this.docs.push(0);
    return label;
  }

  removeLabel(label: string): void {
    const idx = this.labels.indexOf(label);
    if (idx < 0) return;
    this.labels.splice(idx, 1);
    this.counts.splice(idx, 1);
    this.docs.splice(idx, 1);
  }

  exampleCount(label: string): number {
    const idx = this.labels.indexOf(label);
    return idx < 0 ? 0 : (this.docs[idx] ?? 0);
  }

  get vocabularySize(): number {
    return this.vocabList.length;
  }

  addExample(label: string, text: string): void {
    const idx = this.labels.indexOf(sanitizeLabel(label));
    if (idx < 0) throw new Error(`Kelas "${label}" belum ada.`);
    if ((this.docs[idx] ?? 0) >= TEXT_LIMITS.maxExamplesPerClass) throw new Error("Contoh terlalu banyak.");
    const tokens = tokenize(text);
    if (tokens.length === 0) throw new Error("Contoh teks kosong.");
    const counts = this.counts[idx] as Map<number, number>;
    for (const t of tokens) {
      let id = this.vocab.get(t);
      if (id === undefined) {
        if (this.vocabList.length >= TEXT_LIMITS.maxVocab) continue;
        id = this.vocabList.length;
        this.vocab.set(t, id);
        this.vocabList.push(t);
      }
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    this.docs[idx] = (this.docs[idx] ?? 0) + 1;
  }

  isTrained(): boolean {
    return this.docs.filter((d) => d > 0).length >= 2;
  }

  predict(text: string): ClassificationResult | null {
    if (!this.isTrained()) return null;
    const tokens = tokenize(text);
    const totalDocs = this.docs.reduce((a, b) => a + b, 0);
    const V = Math.max(1, this.vocabList.length);
    const logits = this.labels.map((_, ci) => {
      const docs = this.docs[ci] ?? 0;
      if (docs === 0) return -Infinity;
      const counts = this.counts[ci] as Map<number, number>;
      let total = 0;
      for (const c of counts.values()) total += c;
      let lp = Math.log(docs / totalDocs);
      for (const t of tokens) {
        const id = this.vocab.get(t);
        const c = id === undefined ? 0 : (counts.get(id) ?? 0);
        lp += Math.log((c + 1) / (total + V));
      }
      return lp;
    });
    const finite = logits.map((l) => (Number.isFinite(l) ? l : -1e9));
    const probs = softmax(finite);
    let best = 0;
    for (let i = 1; i < probs.length; i++) if ((probs[i] as number) > (probs[best] as number)) best = i;
    const scores: Record<string, number> = {};
    this.labels.forEach((l, i) => (scores[l] = Math.round((probs[i] ?? 0) * 1000) / 1000));
    const label = this.labels[best] ?? "";
    return { label, confidence: scores[label] ?? 0, scores };
  }

  toTrained(now = Date.now()): TrainedClassifier {
    const payload: TextNbPayload = {
      format: "nb-text",
      vocab: [...this.vocabList],
      counts: this.counts.map((m) => [...m.entries()].sort((a, b) => a[0] - b[0])),
      docs: [...this.docs],
    };
    const json = JSON.stringify(payload);
    if (json.length > AI_LIMITS.maxTrainedPayloadBytes) throw new Error("Model terlalu besar untuk disimpan di project.");
    return { kind: "text", version: 1, labels: [...this.labels], payload: json, createdAt: now };
  }

  static fromTrained(value: unknown): TextClassifier {
    const problems = validateTrainedClassifier(value);
    if (problems.length > 0) throw new Error(`Model AI tidak valid: ${problems.join(", ")}`);
    const tc = value as TrainedClassifier;
    if (tc.kind !== "text") throw new Error("Model AI bukan jenis text");
    let raw: unknown;
    try {
      raw = JSON.parse(tc.payload);
    } catch {
      throw new Error("Model AI: payload bukan JSON");
    }
    const p = raw as Partial<TextNbPayload>;
    if (typeof raw !== "object" || raw === null || p.format !== "nb-text") throw new Error("Model AI: format tidak dikenal");
    if (!Array.isArray(p.vocab) || p.vocab.length > TEXT_LIMITS.maxVocab) throw new Error("Model AI: kosakata tidak valid");
    if (!p.vocab.every((t) => typeof t === "string" && t.length > 0 && t.length <= TEXT_LIMITS.maxTokenLength * 2 + 1)) {
      throw new Error("Model AI: token tidak valid");
    }
    if (new Set(p.vocab).size !== p.vocab.length) throw new Error("Model AI: token ganda");
    if (!Array.isArray(p.counts) || !Array.isArray(p.docs) || p.counts.length !== tc.labels.length || p.docs.length !== tc.labels.length) {
      throw new Error("Model AI: hitungan tidak cocok dengan label");
    }
    const clf = new TextClassifier();
    for (const l of tc.labels) clf.addLabel(l);
    if (clf.labels.length !== tc.labels.length) throw new Error("Model AI: label ganda");
    p.vocab.forEach((t, i) => {
      clf.vocab.set(t, i);
      clf.vocabList.push(t);
    });
    const vocabSize = p.vocab.length;
    clf.counts = p.counts.map((pairs) => {
      if (!Array.isArray(pairs)) throw new Error("Model AI: hitungan rusak");
      const m = new Map<number, number>();
      for (const pair of pairs) {
        const [id, c] = Array.isArray(pair) ? pair : [];
        if (!Number.isInteger(id) || (id as number) < 0 || (id as number) >= vocabSize) throw new Error("Model AI: indeks token rusak");
        if (!Number.isInteger(c) || (c as number) <= 0 || (c as number) > 1e7) throw new Error("Model AI: hitungan rusak");
        m.set(id as number, c as number);
      }
      return m;
    });
    clf.docs = p.docs.map((d) => {
      if (!Number.isInteger(d) || d < 0 || d > 1e6) throw new Error("Model AI: jumlah dokumen rusak");
      return d;
    });
    return clf;
  }
}
