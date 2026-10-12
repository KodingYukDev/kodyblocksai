import { describe, expect, it } from "vitest";
import { KnnClassifier } from "../classifier/knn";
import { TRAINED_STATE_KEYS, parseModelFile, serializeModelFile } from "../classifier/storage";
import { TextClassifier } from "../classifier/text-nb";
import { createFakeRuntime, fakeDetector, fakeEmbedder, fakeServices } from "../testing/fakes";
import type { HandResult, TrainedClassifier } from "../types";
import { BACKGROUND_LABEL, LabSession, MIN_SAMPLES } from "./lab-session";
import { captureFromCamera, recordAudioSamples } from "./sources";

const noYield = { yieldFn: async () => {}, now: () => 1 };
const vec = (...v: number[]): Float32Array => new Float32Array(v);

function fill(session: LabSession, perClass: number, make: (ci: number, i: number) => Float32Array): void {
  session.classes.forEach((c, ci) => {
    for (let i = 0; i < perClass; i++) session.addSample(c.id, { features: make(ci, i) });
  });
}

describe("LabSession (vektor)", () => {
  it("kelas bawaan, tambah/ganti nama/hapus, nama unik dan disanitasi", () => {
    const fake = createFakeRuntime();
    fakeServices(fake);
    const s = new LabSession(fake.runtime, "image", noYield);
    expect(s.labels).toEqual(["Kelas 1", "Kelas 2"]);
    expect(s.status).toBe("empty");
    const c3 = s.addClass("batu");
    expect(s.addClass("batu").name).toBe("batu 2");
    expect(s.renameClass(c3.id, "  gun‮ting  ")).toBe("gunting");
    expect(() => s.renameClass(c3.id, "batu 2")).toThrow(/Sudah ada/);
    expect(() => s.renameClass(c3.id, "   ")).toThrow(/kosong/);
    s.removeClass(c3.id);
    expect(s.labels).toEqual(["Kelas 1", "Kelas 2", "batu 2"]);
  });

  it("syarat minimal contoh dengan pesan ramah; latih -> simpan ke project + menu diperbarui", async () => {
    const fake = createFakeRuntime();
    fakeServices(fake);
    const updates: string[] = [];
    (fake.runtime as unknown as { getExtensionInfo: (id: string) => unknown }).getExtensionInfo = (id) => (id === "aiImage" ? { id } : undefined);
    fake.emitter.on("BLOCKSINFO_UPDATE", ({ info }) => updates.push(info.id));
    const s = new LabSession(fake.runtime, "image", noYield);
    const [a, b] = s.classes;
    s.addSample(a!.id, { features: vec(1, 0, 0) });
    expect(s.status).toBe("untrained");
    expect(s.canTrain).toBe(false);
    expect(s.problems().join(" ")).toContain(`minimal ${MIN_SAMPLES.image} contoh (sekarang 1)`);
    expect(await s.train()).toBe(false);
    fill(s, 5, (ci, i) => (ci === 0 ? vec(1, 0.1 * i, 0) : vec(0, 0.1 * i, 1)));
    const progress: number[] = [];
    expect(await s.train((p) => progress.push(p))).toBe(true);
    expect(progress.at(-1)).toBe(1);
    expect(s.status).toBe("trained");
    expect(s.report?.accuracy).toBe(1);
    const saved = fake.stage.getCustomState<TrainedClassifier>(TRAINED_STATE_KEYS.image);
    expect(saved?.labels).toEqual(["Kelas 1", "Kelas 2"]);
    expect(saved?.payload).not.toContain("data:image");
    expect(updates).toEqual(["aiImage"]);
    expect(s.predictFeatures(vec(0, 0, 1))?.label).toBe("Kelas 2");
    // Perubahan setelah dilatih -> "stale" sampai dilatih ulang; model di project tetap yang lama.
    s.removeSample(b!.id, b!.samples[0]!.id);
    expect(s.status).toBe("stale");
  });

  it("thumbnail hanya disimpan bila dicentang; restore dari project mengembalikan contoh yang bisa diedit", async () => {
    const fake = createFakeRuntime();
    fakeServices(fake);
    const s = new LabSession(fake.runtime, "image", noYield);
    s.classes.forEach((c, ci) => {
      for (let i = 0; i < 5; i++) s.addSample(c.id, { features: vec(ci, 1 - ci, i * 0.01), thumb: "data:image/jpeg;base64,AAAA" });
    });
    await s.train();
    expect(fake.stage.getCustomState<TrainedClassifier>(TRAINED_STATE_KEYS.image)?.payload).not.toContain("data:image");
    s.setIncludeThumbnails(true);
    await s.train();
    expect(fake.stage.getCustomState<TrainedClassifier>(TRAINED_STATE_KEYS.image)?.payload).toContain("data:image/jpeg");
    const again = new LabSession(fake.runtime, "image", noYield);
    expect(again.status).toBe("trained");
    expect(again.classes.map((c) => c.samples.length)).toEqual([5, 5]);
    expect(again.includeThumbnails).toBe(true);
    expect(again.predictFeatures(vec(1, 0, 0.02))?.label).toBe("Kelas 2");
  });

  it("model rusak di project -> pesan, lab mulai kosong; resetAll menghapus model project", async () => {
    const fake = createFakeRuntime();
    fakeServices(fake);
    fake.stage.setCustomState(TRAINED_STATE_KEYS.pose, { kind: "pose", version: 1, labels: ["a"], payload: "{\"format\":\"evil\"}", createdAt: 1 });
    const s = new LabSession(fake.runtime, "pose", noYield);
    expect(s.loadError).toMatch(/tidak bisa dibuka/);
    expect(s.labels).toEqual(["Kelas 1", "Kelas 2"]);
    fill(s, 5, (ci) => vec(ci, 1 - ci));
    await s.train();
    expect(fake.stage.getCustomState(TRAINED_STATE_KEYS.pose)).toBeDefined();
    s.resetAll();
    expect(fake.stage.getCustomState(TRAINED_STATE_KEYS.pose)).toBeUndefined();
    expect(s.status).toBe("empty");
  });

  it("ekspor/impor file model; jenis salah, file palsu, dan file raksasa ditolak", async () => {
    const fake = createFakeRuntime();
    fakeServices(fake);
    const s = new LabSession(fake.runtime, "hand", noYield);
    expect(() => s.exportFile()).toThrow(/Latih model dulu/);
    fill(s, 5, (ci, i) => vec(ci, 1 - ci, i * 0.01));
    await s.train();
    const file = s.exportFile();

    const other = createFakeRuntime();
    fakeServices(other);
    const t = new LabSession(other.runtime, "hand", noYield);
    t.importFile(file);
    expect(t.status).toBe("trained");
    expect(t.classes.map((c) => c.samples.length)).toEqual([5, 5]);
    expect(other.stage.getCustomState<TrainedClassifier>(TRAINED_STATE_KEYS.hand)?.kind).toBe("hand");

    const img = new LabSession(other.runtime, "image", noYield);
    expect(() => img.importFile(file)).toThrow(/model gestur tangan, bukan model gambar/);
    expect(() => parseModelFile("{\"format\":\"x\"}")).toThrow(/bukan file model/);
    expect(() => parseModelFile("bukan json")).toThrow(/bukan file model/);
    expect(() => parseModelFile("x".repeat(9 * 1024 * 1024))).toThrow(/terlalu besar/);
    const tampered = JSON.parse(file) as { model: TrainedClassifier };
    tampered.model.labels = ["<script>", "b\u0000"];
    expect(() => parseModelFile(JSON.stringify(tampered))).toThrow(/label tidak bersih/);
    const badVec = JSON.parse(file) as { model: TrainedClassifier };
    const payload = JSON.parse(badVec.model.payload) as { examples: [number, string][] };
    payload.examples[0] = [9, payload.examples[0]![1]];
    badVec.model.payload = JSON.stringify(payload);
    expect(() => parseModelFile(JSON.stringify(badVec))).toThrow(/indeks label/);
  });
});

describe("LabSession (suara & teks)", () => {
  it("suara: kelas Suara latar wajib ada dan terkunci", () => {
    const fake = createFakeRuntime();
    fakeServices(fake);
    const s = new LabSession(fake.runtime, "audio", noYield);
    expect(s.labels).toEqual([BACKGROUND_LABEL, "Kelas 1"]);
    const bg = s.classes[0]!;
    expect(() => s.renameClass(bg.id, "x")).toThrow();
    expect(() => s.removeClass(bg.id)).toThrow(/wajib/);
    expect(() => s.renameClass(s.classes[1]!.id, BACKGROUND_LABEL)).toThrow();
  });

  it("teks: latih dengan perkiraan akurasi; kalimat contoh TIDAK ikut ke project; model lama jadi dasar", async () => {
    const fake = createFakeRuntime();
    fakeServices(fake);
    const s = new LabSession(fake.runtime, "text", noYield);
    const [a, b] = s.classes;
    s.renameClass(a!.id, "buah");
    s.renameClass(b!.id, "hewan");
    for (const t of ["apel merah segar", "jeruk manis sekali", "mangga harum wangi"]) s.addSample(a!.id, { text: t });
    for (const t of ["kucing lucu", "anjing setia", "sapi gemuk"]) s.addSample(b!.id, { text: t });
    expect(() => s.addSample(a!.id, { text: "   " })).toThrow(/Tulis dulu/);
    expect(await s.train()).toBe(true);
    expect(s.report?.accuracy).not.toBeNull();
    const saved = fake.stage.getCustomState<TrainedClassifier>(TRAINED_STATE_KEYS.text);
    expect(saved?.payload).not.toContain("apel merah segar");
    expect(s.predictText("mangga")?.label).toBe("buah");

    const again = new LabSession(fake.runtime, "text", noYield);
    expect(again.classes.map((c) => c.savedCount)).toEqual([3, 3]);
    again.renameClass(again.classes[0]!.id, "buahan");
    again.addSample(again.classes[0]!.id, { text: "pisang" });
    await again.train();
    const restored = TextClassifier.fromTrained(fake.stage.getCustomState(TRAINED_STATE_KEYS.text));
    expect(restored.labels).toEqual(["buahan", "hewan"]);
    expect(restored.exampleCount("buahan")).toBe(4);
    expect(restored.predict("jeruk")?.label).toBe("buahan");
  });
});

describe("sumber contoh", () => {
  it("kamera: pose/tangan memakai detektor; tidak terdeteksi -> pesan ramah", async () => {
    const fake = createFakeRuntime();
    let hands: HandResult[] = [];
    const det = fakeDetector(() => hands);
    const { services } = fakeServices(fake, { hand: async () => det, imageEmbedder: async () => fakeEmbedder(() => vec(1, 2, 3)) });
    await expect(captureFromCamera(services, "hand")).rejects.toThrow(/Tangan belum terlihat/);
    hands = [{ handedness: "Right", landmarks: Array.from({ length: 21 }, (_, i) => ({ x: i, y: i * 2 })), gesture: null, gestureScore: 0 }];
    const got = await captureFromCamera(services, "hand");
    expect(got.features).toHaveLength(42);
    const img = await captureFromCamera(services, "image");
    expect(Array.from(img.features)).toEqual([1, 2, 3]);
  });

  it("kamera ditolak -> error yang menjelaskan cara mengizinkan", async () => {
    const fake = createFakeRuntime();
    const { media, services } = fakeServices(fake);
    media.deny = true;
    await expect(captureFromCamera(services, "image")).rejects.toThrow(/izinkan kamera/);
  });

  it("suara: rekaman dipecah jadi beberapa jendela; mikrofon ditolak -> error", async () => {
    const fake = createFakeRuntime();
    const { services, media } = fakeServices(fake);
    let tick: (() => void) | null = null;
    const timers = { setInterval: (fn: () => void) => ((tick = fn), 1), clearInterval: () => (tick = null) };
    const windows = await recordAudioSamples(services, {
      seconds: 2,
      timers,
      sleep: async () => {
        for (let i = 0; i < 3; i++) tick?.();
      },
    });
    expect(windows.length).toBeGreaterThanOrEqual(3);
    expect(windows[0]).toHaveLength(48);
    expect(tick).toBeNull();
    services.microphone.stop();
    media.deny = true;
    await expect(recordAudioSamples(services, { seconds: 1, timers, sleep: async () => {} })).rejects.toThrow(/Mikrofon/);
  });
});

describe("format model lama tetap terbaca", () => {
  it("KnnClassifier image tersimpan sebelum AI Lab baru", () => {
    const clf = new KnnClassifier();
    clf.addLabel("x");
    clf.addLabel("y");
    clf.addExample("x", [1, 0]);
    clf.addExample("y", [0, 1]);
    const text = serializeModelFile(clf.toTrained("image"));
    expect(parseModelFile(text, "image").labels).toEqual(["x", "y"]);
  });
});

describe("LabSession.presetClasses (kartu tutorial)", () => {
  it("mengisi nama kelas saat sesi kosong, menjaga Suara latar, dan tidak menimpa kerja anak", () => {
    const fake = createFakeRuntime();
    fakeServices(fake);
    const s = new LabSession(fake.runtime, "image", noYield);
    expect(s.presetClasses(["batu", "gunting", "kertas", "batu"])).toBe(true);
    expect(s.labels).toEqual(["batu", "gunting", "kertas"]);
    s.addSample(s.classes[0]!.id, { features: vec(1, 0) });
    expect(s.presetClasses(["a", "b"])).toBe(false);
    expect(s.labels).toEqual(["batu", "gunting", "kertas"]);

    const audio = new LabSession(fake.runtime, "audio", noYield);
    expect(audio.presetClasses(["tepuk", BACKGROUND_LABEL, "siul"])).toBe(true);
    expect(audio.labels).toEqual([BACKGROUND_LABEL, "tepuk", "siul"]);
    expect(audio.presetClasses(["satu"])).toBe(false);
  });
});
