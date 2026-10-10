import { describe, expect, it } from "vitest";
import { KnnClassifier } from "../classifier/knn";
import { TRAINED_STATE_KEYS } from "../classifier/storage";
import { TextClassifier } from "../classifier/text-nb";
import { createFakeRuntime, fakeEmbedder, fakeServices } from "../testing/fakes";
import type { TrainedClassifier } from "../types";
import { AudioLabController, ImageLabController, TextLabController } from "./controllers";

function imageEnv() {
  const fake = createFakeRuntime();
  let n = 0;
  const embedder = fakeEmbedder(() => new Float32Array(n++ % 2 === 0 ? [1, 0.1, 0] : [0, 1, 0.1]));
  const env = fakeServices(fake, { imageEmbedder: async () => embedder });
  return { fake, env, embedder };
}

describe("ImageLabController", () => {
  it("melatih dari kamera dan menyimpan HANYA vektor fitur secara default", async () => {
    const { fake, env } = imageEnv();
    const lab = new ImageLabController(fake.runtime, { makeThumbnail: () => "data:image/jpeg;base64,AAAA" });
    lab.addClass("batu");
    lab.addClass("kertas");
    expect(await lab.captureFromCamera("batu")).toBe(true);
    expect(await lab.captureFromCamera("kertas")).toBe(true);
    expect(env.media.requests).toHaveLength(1);
    expect(lab.trained).toBe(true);
    expect(lab.thumbnails("batu")).toEqual([]);
    expect(lab.save()).toBe(true);
    const saved = fake.stage.getCustomState<TrainedClassifier>(TRAINED_STATE_KEYS.image);
    expect(saved?.labels).toEqual(["batu", "kertas"]);
    expect(saved?.payload).not.toContain("data:image");
    expect(fake.projectChanged).toBe(1);
  });

  it("thumbnail hanya bila pengguna mengizinkan eksplisit, dan dibuang lagi bila izin dicabut", async () => {
    const { fake } = imageEnv();
    const lab = new ImageLabController(fake.runtime, { makeThumbnail: () => "data:image/jpeg;base64,AAAA" });
    lab.setIncludeThumbnails(true);
    lab.addClass("a");
    lab.addClass("b");
    await lab.captureFromCamera("a");
    await lab.captureFromCamera("b");
    expect(lab.thumbnails("a")).toHaveLength(1);
    lab.save();
    expect(fake.stage.getCustomState<TrainedClassifier>(TRAINED_STATE_KEYS.image)?.payload).toContain("data:image/jpeg");
    lab.setIncludeThumbnails(false);
    lab.save();
    expect(fake.stage.getCustomState<TrainedClassifier>(TRAINED_STATE_KEYS.image)?.payload).not.toContain("data:image");
  });

  it("memuat model project yang ada; model rusak dilaporkan, lab mulai kosong", () => {
    const fake = createFakeRuntime();
    fakeServices(fake);
    const clf = new KnnClassifier();
    clf.addLabel("x");
    clf.addLabel("y");
    clf.addExample("x", [1, 0]);
    clf.addExample("y", [0, 1]);
    fake.stage.setCustomState(TRAINED_STATE_KEYS.image, clf.toTrained("image"));
    expect(new ImageLabController(fake.runtime).labels).toEqual(["x", "y"]);
    fake.stage.setCustomState(TRAINED_STATE_KEYS.image, { kind: "image", version: 9 });
    const broken = new ImageLabController(fake.runtime);
    expect(broken.loadError).toMatch(/versi/);
    expect(broken.labels).toEqual([]);
  });

  it("save menolak model yang belum terlatih; clearSaved menghapus", () => {
    const { fake } = imageEnv();
    const lab = new ImageLabController(fake.runtime);
    lab.addClass("a");
    expect(() => lab.save()).toThrow(/minimal 2/);
    fake.stage.setCustomState(TRAINED_STATE_KEYS.image, { dummy: true });
    lab.clearSaved();
    expect(fake.stage.getCustomState(TRAINED_STATE_KEYS.image)).toBeUndefined();
  });

  it("kamera ditolak -> captureFromCamera false", async () => {
    const { fake, env } = imageEnv();
    env.media.deny = true;
    const lab = new ImageLabController(fake.runtime);
    lab.addClass("a");
    expect(await lab.captureFromCamera("a")).toBe(false);
    expect(lab.count("a")).toBe(0);
  });
});

describe("TextLabController & AudioLabController", () => {
  it("teks: latih, uji, simpan", () => {
    const fake = createFakeRuntime();
    fakeServices(fake);
    const lab = new TextLabController(fake.runtime);
    let changes = 0;
    lab.subscribe(() => changes++);
    lab.addClass("buah");
    lab.addClass("hewan");
    lab.addText("buah", "apel jeruk mangga");
    lab.addText("hewan", "kucing anjing sapi");
    expect(lab.predict("mangga")?.label).toBe("buah");
    lab.save();
    const saved = fake.stage.getCustomState<TrainedClassifier>(TRAINED_STATE_KEYS.text);
    expect(TextClassifier.fromTrained(saved).predict("sapi")?.label).toBe("hewan");
    expect(changes).toBe(4);
  });

  it("suara: rekam contoh dari mikrofon (tanpa menyimpan audio), mic bisa dimatikan", async () => {
    const fake = createFakeRuntime();
    const { services, media } = fakeServices(fake);
    let tick: (() => void) | null = null;
    const lab = new AudioLabController(fake.runtime, {
      timers: { setInterval: (fn) => ((tick = fn), 1), clearInterval: () => (tick = null) },
      sleep: async () => {
        for (let i = 0; i < 10; i++) tick?.();
      },
    });
    lab.addClass("tepuk");
    expect(await lab.record("tepuk")).toBe(true);
    expect(lab.count("tepuk")).toBe(1);
    expect(media.requests[0]?.audio).toBeTruthy();
    expect(tick).toBeNull();
    services.microphone.stop();
    expect(media.streams[0]?.tracks[0]?.stopped).toBe(true);
  });
});
