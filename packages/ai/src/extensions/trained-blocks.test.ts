import { describe, expect, it } from "vitest";
import type { BlockArgs, BlockUtility, ExtensionModule } from "@kody/engine";
import { getOpcodeSpec } from "@kody/engine";
import { BACKGROUND_LABEL } from "../classifier/audio-features";
import { KnnClassifier } from "../classifier/knn";
import { handFeatures, poseFeatures } from "../classifier/landmark-features";
import { TRAINED_STATE_KEYS } from "../classifier/storage";
import { AI_EXTENSIONS } from "../catalog";
import { createFakeRuntime, fakeDetector, fakeServices } from "../testing/fakes";
import type { HandResult, PoseResult } from "../types";
import { createAiAudioExtension } from "./audio";
import { createAiHandExtension } from "./hand";
import { createAiImageExtension } from "./image";
import { createAiPoseExtension } from "./pose";

const util = {} as BlockUtility;
const prims = (mod: ExtensionModule) => {
  const p = mod.getPrimitives();
  return (op: string, args: BlockArgs = {}): unknown => (p[op] as (a: BlockArgs, u: BlockUtility) => unknown)(args, util);
};

const openHand = (): HandResult => ({
  handedness: "Right",
  landmarks: Array.from({ length: 21 }, (_, i) => ({ x: (i % 5) * 10, y: Math.floor(i / 4) * 20 })),
  gesture: null,
  gestureScore: 0,
});
const fist = (): HandResult => ({
  handedness: "Right",
  landmarks: Array.from({ length: 21 }, (_, i) => ({ x: (i % 3) * 4, y: (i % 2) * 5 })),
  gesture: null,
  gestureScore: 0,
});
const pose = (armsUp: boolean): PoseResult => ({
  keypoints: Array.from({ length: 33 }, (_, i) => ({ x: i * 3, y: armsUp && i >= 13 && i <= 22 ? 150 : -i * 2, visibility: 0.9 })),
});

function timers() {
  const fns = new Map<number, () => void>();
  let n = 0;
  return {
    fns,
    setInterval: (fn: () => void) => (fns.set(++n, fn), n),
    clearInterval: (h: unknown) => void fns.delete(h as number),
    tick: () => [...fns.values()].forEach((f) => f()),
  };
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("blok model AI Lab untuk tangan & pose", () => {
  it("tangan: label, kepercayaan, hat; menu kelas dari model", async () => {
    const fake = createFakeRuntime();
    let current = openHand();
    fakeServices(fake, { hand: async () => fakeDetector(() => [current]) });
    const clf = new KnnClassifier({ k: 1 });
    clf.addLabel("lima");
    clf.addLabel("kepal");
    clf.addExample("lima", handFeatures(openHand())!);
    clf.addExample("kepal", handFeatures(fist())!);
    fake.stage.setCustomState(TRAINED_STATE_KEYS.hand, clf.toTrained("hand"));
    const mod = createAiHandExtension(fake.runtime);
    const run = prims(mod);
    expect(mod.getDynamicMenus?.().getClassMenu?.(null)).toEqual([
      { text: "lima", value: "lima" },
      { text: "kepal", value: "kepal" },
    ]);
    expect(run("handClass")).toBe("");
    await run("analyse", { SOURCE: "camera" });
    expect(run("handClass")).toBe("lima");
    expect(run("handClassConfidence", { CLASS: "lima" })).toBe(100);
    expect(run("whenHandClass", { CLASS: "lima" })).toBe(true);
    expect(run("isHandClass", { CLASS: "kepal" })).toBe(false);
    expect(run("handCount")).toBe(1);
    current = fist();
    await new Promise((r) => setTimeout(r, 80));
    await run("analyse", { SOURCE: "camera" });
    expect(run("handClass")).toBe("kepal");
  });

  it("pose: model AI Lab mengenali pose; tanpa model -> kosong tanpa error", async () => {
    const fake = createFakeRuntime();
    fakeServices(fake, { pose: async () => fakeDetector(() => [pose(true)]) });
    const run = prims(createAiPoseExtension(fake.runtime));
    await run("analyse", { SOURCE: "camera" });
    expect(run("poseClass")).toBe("");
    expect(run("isPoseDetected")).toBe(true);
    const clf = new KnnClassifier({ k: 1 });
    clf.addLabel("atas");
    clf.addLabel("bawah");
    clf.addExample("atas", poseFeatures(pose(true))!);
    clf.addExample("bawah", poseFeatures(pose(false))!);
    fake.stage.setCustomState(TRAINED_STATE_KEYS.pose, clf.toTrained("pose"));
    await new Promise((r) => setTimeout(r, 80));
    await run("analyse", { SOURCE: "camera" });
    expect(run("poseClass")).toBe("atas");
    expect(run("whenPoseClass", { CLASS: "atas" })).toBe(true);
  });
});

describe("analisis terus-menerus & pilih kamera", () => {
  it("startAuto menganalisis berkala; stop/tombol Matikan menghentikannya; tidak meminta izin berulang", async () => {
    const fake = createFakeRuntime();
    const t = timers();
    const det = fakeDetector(() => [openHand()]);
    const { services, media } = fakeServices(fake, { hand: async () => det }, { timers: t });
    const run = prims(createAiHandExtension(fake.runtime));
    await run("startAuto");
    await flush();
    expect(det.calls).toBe(1);
    expect(t.fns.size).toBe(1);
    expect(run("handCount")).toBe(1);
    await new Promise((r) => setTimeout(r, 80));
    t.tick();
    await flush();
    expect(det.calls).toBe(2);
    // Tombol stop panggung: loop berhenti dan hasil dibuang.
    fake.emitter.emit("PROJECT_STOP_ALL", undefined);
    expect(t.fns.size).toBe(0);
    expect(run("handCount")).toBe(0);
    // Mulai lagi, lalu kamera dimatikan pengguna lewat indikator: loop berhenti sendiri.
    await run("startAuto");
    expect(t.fns.size).toBe(1);
    services.camera.disableVideo();
    t.tick();
    expect(t.fns.size).toBe(0);
    // Izin ditolak: loop tidak dimulai.
    media.deny = true;
    await run("startAuto");
    expect(t.fns.size).toBe(0);
    await run("stopAuto");
  });

  it("model gagal dimuat -> loop berhenti (notice tidak berulang)", async () => {
    const fake = createFakeRuntime();
    const t = timers();
    const { services } = fakeServices(fake, { face: async () => Promise.reject(new Error("rusak")) }, { timers: t });
    const notices: string[] = [];
    services.events.on("notice", (n) => notices.push(n.code));
    const { createAiFaceExtension } = await import("./face");
    const run = prims(createAiFaceExtension(fake.runtime));
    await run("startAuto");
    await flush();
    await flush();
    expect(t.fns.size).toBe(0);
    expect(notices.filter((c) => c === "model-load-failed")).toHaveLength(1);
  });

  it("pakai kamera belakang: tidak dicerminkan dan stage.videoState mengikuti", async () => {
    const fake = createFakeRuntime();
    const { services, media } = fakeServices(fake);
    const run = prims(createAiImageExtension(fake.runtime));
    await run("videoToggle", { VIDEO_STATE: "on" });
    await run("setCamera", { CAMERA: "environment" });
    expect(services.camera.facingMode).toBe("environment");
    expect(services.camera.isMirrored).toBe(false);
    expect(fake.stage.videoState).toBe("on-flipped");
    expect(media.requests).toHaveLength(2);
    expect(media.streams[0]?.tracks[0]?.stopped).toBe(true);
  });
});

describe("menu kelas diperbarui tanpa memuat ulang", () => {
  it("project baru dimuat -> BLOCKSINFO_UPDATE untuk ekstensi classifier yang terpasang", () => {
    const fake = createFakeRuntime();
    fakeServices(fake);
    (fake.runtime as unknown as { getExtensionInfo: (id: string) => unknown }).getExtensionInfo = (id) => ({ id });
    const updates: string[] = [];
    fake.emitter.on("BLOCKSINFO_UPDATE", ({ info }) => updates.push(info.id));
    const mods = [createAiImageExtension(fake.runtime), createAiHandExtension(fake.runtime), createAiAudioExtension(fake.runtime)];
    fake.emitter.emit("PROJECT_LOADED", undefined);
    expect(updates.sort()).toEqual(["aiAudio", "aiHand", "aiImage"]);
    for (const m of mods) m.dispose?.();
    fake.emitter.emit("PROJECT_LOADED", undefined);
    expect(updates).toHaveLength(3);
  });
});

describe("suara latar", () => {
  it("hening dianggap Suara latar bila model punya kelas itu", async () => {
    const fake = createFakeRuntime();
    const { services } = fakeServices(fake, {}, { microphone: { getUserMedia: async () => ({ getTracks: () => [] }), createAudioContext: () => quietContext() } });
    const clf = new KnnClassifier({ k: 1 });
    clf.addLabel(BACKGROUND_LABEL);
    clf.addLabel("tepuk");
    clf.addExample(BACKGROUND_LABEL, new Array(48).fill(0.01));
    clf.addExample("tepuk", new Array(48).fill(0).map((_, i) => (i < 24 ? 0.8 : 0.1)));
    fake.stage.setCustomState(TRAINED_STATE_KEYS.audio, clf.toTrained("audio"));
    const run = prims(createAiAudioExtension(fake.runtime));
    await run("startListening");
    expect(services.microphone.active).toBe(true);
    await new Promise((r) => setTimeout(r, 450));
    expect(run("soundClass")).toBe(BACKGROUND_LABEL);
    expect(run("soundConfidence", { CLASS: BACKGROUND_LABEL })).toBe(100);
    expect(run("whenSoundClass", { CLASS: "tepuk" })).toBe(false);
    run("stopListening");
  });
});

function quietContext() {
  return {
    sampleRate: 48000,
    createMediaStreamSource: () => ({ connect: () => {}, disconnect: () => {} }),
    createAnalyser: () => ({
      fftSize: 1024,
      smoothingTimeConstant: 0,
      frequencyBinCount: 512,
      getFloatFrequencyData: (out: Float32Array) => out.fill(-100),
    }),
    close: async () => {},
  };
}

describe("katalog", () => {
  it("semua blok AI dikenal katalog engine (file .sb3 dimuat tanpa peringatan)", async () => {
    const fake = createFakeRuntime();
    for (const entry of AI_EXTENSIONS) {
      const info = (await entry.load())(fake.runtime).getInfo();
      for (const b of info.blocks) if (b !== "---") expect(getOpcodeSpec(`${info.id}_${b.opcode}`), `${info.id}_${b.opcode}`).toBeDefined();
      for (const m of Object.keys(info.menus ?? {})) expect(getOpcodeSpec(`${info.id}_menu_${m}`), m).toBeDefined();
    }
  });
});
