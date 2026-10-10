import { describe, expect, it } from "vitest";
import { AI_LIMITS } from "../security";
import { AUDIO_FEATURE_DIM, AudioFeatureWindow, bandEnergies, bandLayout } from "./audio-features";
import { KNN_LIMITS, KnnClassifier } from "./knn";
import { TextClassifier, tokenize } from "./text-nb";
import { base64ToBytes, bytesToBase64, decodeInt8Vector, encodeInt8Vector, l2Normalize, softmax } from "./vector";

/** Vektor acak deterministik di sekitar pusat tertentu. */
function cluster(center: number[], seed: number, noise = 0.1): number[] {
  let s = seed;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647 - 0.5;
  };
  return center.map((c) => c + rnd() * noise);
}

const A = [1, 0, 0, 0, 0.2, 0, 0, 0];
const B = [0, 1, 0, 0, 0, 0.2, 0, 0];
const C = [0, 0, 1, 0, 0, 0, 0.2, 0];

describe("vector", () => {
  it("normalisasi L2 dan vektor nol", () => {
    const v = l2Normalize([3, 4]);
    expect(v[0]).toBeCloseTo(0.6);
    expect(v[1]).toBeCloseTo(0.8);
    expect([...l2Normalize([0, 0])]).toEqual([0, 0]);
  });

  it("int8 round-trip menjaga nilai dalam galat kuantisasi", () => {
    const v = l2Normalize(cluster(new Array(64).fill(0.3), 7, 1));
    const back = decodeInt8Vector(encodeInt8Vector(v), 64);
    const maxAbs = Math.max(...[...v].map(Math.abs));
    for (let i = 0; i < 64; i++) expect(Math.abs((back[i] ?? 0) - (v[i] ?? 0))).toBeLessThanOrEqual(maxAbs / 127);
  });

  it("decode menolak panjang salah, base64 rusak, dan skala aneh", () => {
    const enc = encodeInt8Vector(new Float32Array([0.5, -0.5]));
    expect(() => decodeInt8Vector(enc, 3)).toThrow();
    expect(() => decodeInt8Vector("<script>", 2)).toThrow();
    const bad = new Uint8Array(6);
    new DataView(bad.buffer).setFloat32(0, Number.NaN, true);
    expect(() => decodeInt8Vector(bytesToBase64(bad), 2)).toThrow();
  });

  it("base64 dan softmax", () => {
    const bytes = new Uint8Array([0, 1, 254, 255]);
    expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([0, 1, 254, 255]);
    const p = softmax([1000, 1000]);
    expect(p[0]).toBeCloseTo(0.5);
    expect(softmax([])).toEqual([]);
  });
});

describe("KnnClassifier", () => {
  function trained(mode: "knn" | "centroid" = "knn"): KnnClassifier {
    const clf = new KnnClassifier({ k: 3, mode });
    for (const [label, center] of [
      ["kucing", A],
      ["anjing", B],
      ["burung", C],
    ] as const) {
      clf.addLabel(label);
      for (let i = 0; i < 5; i++) clf.addExample(label, cluster(center, i + label.length * 13));
    }
    return clf;
  }

  it("memprediksi kelas terdekat (KNN & centroid)", () => {
    for (const mode of ["knn", "centroid"] as const) {
      const clf = trained(mode);
      expect(clf.predict(cluster(A, 99))?.label).toBe("kucing");
      expect(clf.predict(cluster(B, 98))?.label).toBe("anjing");
      const r = clf.predict(cluster(C, 97));
      expect(r?.label).toBe("burung");
      expect(r?.confidence).toBeGreaterThan(0.5);
      expect(Object.keys(r?.scores ?? {})).toEqual(["kucing", "anjing", "burung"]);
    }
  });

  it("belum terlatih / dimensi salah / NaN -> null", () => {
    const clf = new KnnClassifier();
    clf.addLabel("a");
    clf.addExample("a", A);
    expect(clf.isTrained()).toBe(false);
    expect(clf.predict(A)).toBeNull();
    const t = trained();
    expect(t.predict([1, 2])).toBeNull();
    expect(t.predict(A.map(() => Number.NaN))).toBeNull();
  });

  it("menolak contoh tidak valid dan menegakkan batas", () => {
    const clf = new KnnClassifier();
    clf.addLabel("a");
    expect(() => clf.addExample("b", A)).toThrow();
    expect(() => clf.addExample("a", [Number.POSITIVE_INFINITY])).toThrow();
    clf.addExample("a", A);
    expect(() => clf.addExample("a", [1, 2, 3])).toThrow();
    for (let i = 1; i < KNN_LIMITS.maxExamplesPerClass; i++) clf.addExample("a", A);
    expect(() => clf.addExample("a", A)).toThrow(/Maksimum/);
    expect(() => clf.addLabel("   ")).toThrow();
    const many = new KnnClassifier();
    for (let i = 0; i < AI_LIMITS.maxLabels; i++) many.addLabel(`k${i}`);
    expect(() => many.addLabel("lagi")).toThrow();
  });

  it("serialisasi -> fromTrained menghasilkan prediksi yang sama, tanpa thumbnail default", () => {
    const clf = trained();
    const saved = clf.toTrained("image", 123);
    expect(saved).toMatchObject({ kind: "image", version: 1, labels: ["kucing", "anjing", "burung"], createdAt: 123 });
    expect(saved.payload).not.toContain("thumbnails");
    const back = KnnClassifier.fromTrained(saved, "image");
    expect(back.totalExamples).toBe(15);
    expect(back.predict(cluster(B, 5))?.label).toBe("anjing");
    expect(() => KnnClassifier.fromTrained(saved, "audio")).toThrow(/bukan jenis/);
  });

  it("removeLabel memetakan ulang indeks contoh", () => {
    const clf = trained();
    clf.removeLabel("kucing");
    expect(clf.labels).toEqual(["anjing", "burung"]);
    expect(clf.exampleCount("anjing")).toBe(5);
    expect(clf.predict(cluster(C, 3))?.label).toBe("burung");
  });

  it("thumbnail hanya data URL gambar kecil", () => {
    const clf = trained();
    clf.addThumbnail("kucing", "data:image/jpeg;base64,AAAA");
    clf.addThumbnail("kucing", "javascript:alert(1)");
    clf.addThumbnail("kucing", "data:image/svg+xml;base64,AAAA");
    clf.addThumbnail("kucing", `data:image/jpeg;base64,${"A".repeat(KNN_LIMITS.maxThumbnailChars)}`);
    expect(clf.thumbnails("kucing")).toEqual(["data:image/jpeg;base64,AAAA"]);
    const back = KnnClassifier.fromTrained(clf.toTrained("image"), "image");
    expect(back.thumbnails("kucing")).toHaveLength(1);
  });

  it("menolak payload project yang dimanipulasi", () => {
    const good = trained().toTrained("image");
    const mutate = (fn: (p: Record<string, unknown>) => void): unknown => {
      const p = JSON.parse(good.payload) as Record<string, unknown>;
      fn(p);
      return { ...good, payload: JSON.stringify(p) };
    };
    const bad: unknown[] = [
      { ...good, payload: "not json" },
      mutate((p) => (p.format = "eval")),
      mutate((p) => (p.dim = 1e9)),
      mutate((p) => (p.k = 0)),
      mutate((p) => (p.examples = [[99, (p.examples as [number, string][])[0]?.[1]]])),
      mutate((p) => (p.examples = [[0, "!!!"]])),
      mutate((p) => (p.examples = "x")),
      mutate((p) => (p.thumbnails = [["0", 1]])),
      { ...good, labels: ["a", "a", "b"] },
      { ...good, labels: ["‮jahat"] },
    ];
    for (const b of bad) expect(() => KnnClassifier.fromTrained(b, "image")).toThrow();
  });
});

describe("TextClassifier", () => {
  function trained(): TextClassifier {
    const clf = new TextClassifier();
    clf.addLabel("senang");
    clf.addLabel("sedih");
    for (const t of ["aku senang sekali", "hari ini bahagia", "senang bermain bola", "seru dan gembira"]) clf.addExample("senang", t);
    for (const t of ["aku sedih", "hari ini menangis", "sedih sekali kehilangan", "kecewa dan murung"]) clf.addExample("sedih", t);
    return clf;
  }

  it("tokenize: huruf kecil, tanpa diakritik, bigram", () => {
    expect(tokenize("Café  HEBAT!")).toEqual(["cafe", "hebat", "cafe hebat"]);
    expect(tokenize("")).toEqual([]);
  });

  it("memprediksi dan memberi skor per kelas", () => {
    const clf = trained();
    expect(clf.predict("aku senang")?.label).toBe("senang");
    const r = clf.predict("menangis sedih");
    expect(r?.label).toBe("sedih");
    expect((r?.scores.senang ?? 0) + (r?.scores.sedih ?? 0)).toBeCloseTo(1, 2);
  });

  it("round-trip project tanpa menyimpan kalimat asli", () => {
    const clf = trained();
    const saved = clf.toTrained(1);
    expect(saved.payload).not.toContain("kehilangan sedih");
    const back = TextClassifier.fromTrained(saved);
    expect(back.predict("bahagia gembira")?.label).toBe("senang");
    expect(back.exampleCount("sedih")).toBe(4);
  });

  it("menolak data rusak", () => {
    const saved = trained().toTrained(1);
    const p = JSON.parse(saved.payload) as { vocab: string[]; counts: [number, number][][]; docs: number[] };
    const variants = [
      { ...p, vocab: [...p.vocab, p.vocab[0]] },
      { ...p, counts: [[[999999, 1]], []] },
      { ...p, counts: [[[0, -1]], []] },
      { ...p, docs: [1] },
      { ...p, vocab: [""] },
    ];
    for (const v of variants) expect(() => TextClassifier.fromTrained({ ...saved, payload: JSON.stringify(v) })).toThrow();
    expect(() => TextClassifier.fromTrained({ ...saved, kind: "image" })).toThrow();
  });

  it("belum terlatih -> null; contoh kosong ditolak", () => {
    const clf = new TextClassifier();
    clf.addLabel("a");
    expect(() => clf.addExample("a", "!!!")).toThrow();
    expect(clf.predict("x")).toBeNull();
  });
});

describe("fitur suara", () => {
  it("layout pita menutupi rentang bin yang valid", () => {
    const layout = bandLayout(512, 48000);
    expect(layout.ranges).toHaveLength(24);
    for (const [s, e] of layout.ranges) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(e).toBeGreaterThan(s);
      expect(e).toBeLessThanOrEqual(512);
    }
  });

  it("energi pita ternormalisasi dan jendela fitur berdimensi 48", () => {
    const layout = bandLayout(512, 48000);
    const loud = bandEnergies(new Float32Array(512).fill(-20), layout);
    const quiet = bandEnergies(new Float32Array(512).fill(-Infinity), layout);
    expect(loud[0]).toBeCloseTo(0.8);
    expect(quiet[0]).toBe(0);
    const w = new AudioFeatureWindow(3);
    expect(w.features()).toBeNull();
    w.push(loud);
    w.push(quiet);
    const f = w.features();
    expect(f).toHaveLength(AUDIO_FEATURE_DIM);
    expect(f?.[0]).toBeCloseTo(0.4);
    expect(f?.[24]).toBeCloseTo(0.4);
    for (let i = 0; i < 5; i++) w.push(loud);
    expect(w.size).toBe(3);
    expect(w.level()).toBeCloseTo(0.8);
  });
});
