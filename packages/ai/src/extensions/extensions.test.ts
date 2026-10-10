import { describe, expect, it } from "vitest";
import { AI_OPCODES, extensionBlockOpcode, extensionMenuOpcode, validateExtensionInfo } from "@kody/engine";
import type { BlockArgs, BlockUtility, ExtensionModule, PrimitiveFn } from "@kody/engine";
import { KnnClassifier } from "../classifier/knn";
import { TRAINED_STATE_KEYS } from "../classifier/storage";
import { TextClassifier } from "../classifier/text-nb";
import { AI_EXTENSIONS, AI_EXTRA_OPCODES } from "../catalog";
import { createFakeRuntime, fakeDetector, fakeEmbedder, fakeServices } from "../testing/fakes";
import type { FakeRuntime } from "../testing/fakes";
import type { FaceResult, HandResult, ObjectResult, PoseResult } from "../types";
import { createAiAudioExtension } from "./audio";
import { createAiFaceExtension } from "./face";
import { createAiHandExtension } from "./hand";
import { createAiImageExtension } from "./image";
import { createAiObjectExtension } from "./object";
import { createAiPoseExtension } from "./pose";
import { createAiTextExtension } from "./text";

const util = {} as BlockUtility;
function prims(mod: ExtensionModule): (op: string, args?: BlockArgs) => unknown {
  const p = mod.getPrimitives();
  return (op, args = {}) => {
    const fn: PrimitiveFn | undefined = p[op];
    if (!fn) throw new Error(`primitive ${op} tidak ada`);
    return fn(args, util);
  };
}

describe("cakupan katalog opcode", () => {
  it("setiap opcode AI di katalog engine diimplementasikan, dan sebaliknya (kecuali AI_EXTRA_OPCODES)", async () => {
    const fake = createFakeRuntime();
    const produced = new Set<string>();
    const primitiveOps = new Set<string>();
    for (const entry of AI_EXTENSIONS) {
      const mod = (await entry.load())(fake.runtime);
      const info = mod.getInfo();
      expect(validateExtensionInfo(info)).toEqual([]);
      const primitives = mod.getPrimitives();
      for (const b of info.blocks) {
        if (b === "---") continue;
        produced.add(extensionBlockOpcode(info.id, b.opcode));
        if (primitives[b.opcode]) primitiveOps.add(extensionBlockOpcode(info.id, b.opcode));
        if (b.blockType === "hat") expect(b.isEdgeActivated).toBe(true);
      }
      for (const m of Object.keys(info.menus ?? {})) produced.add(extensionMenuOpcode(info.id, m));
      const dyn = mod.getDynamicMenus?.() ?? {};
      for (const menu of Object.values(info.menus ?? {})) {
        if (typeof menu.items === "string") expect(typeof dyn[menu.items]).toBe("function");
      }
    }
    const catalog = new Set(AI_OPCODES.map((s) => s.opcode));
    const extra = new Set(AI_EXTRA_OPCODES.map((s) => s.opcode));
    expect([...catalog].filter((o) => !produced.has(o))).toEqual([]);
    expect([...produced].filter((o) => !catalog.has(o) && !extra.has(o))).toEqual([]);
    // Semua opcode non-shadow punya primitive (hat edge-activated juga, sebagai predikat).
    for (const s of AI_OPCODES) if (s.vmPrimitive) expect(primitiveOps.has(s.opcode)).toBe(true);
  });
});

function setup(fake: FakeRuntime = createFakeRuntime()) {
  const hands: HandResult[] = [
    { handedness: "Right", landmarks: Array.from({ length: 21 }, (_, i) => ({ x: i, y: -i })), gesture: "Thumb_Up", gestureScore: 1 },
  ];
  const faces: (FaceResult & { dominant: string })[] = [
    { x: 10, y: 20, width: 100, height: 120, landmarks: Array.from({ length: 478 }, (_, i) => ({ x: i, y: 1 })), expressions: { senang: 0.8, terkejut: 0.1, sedih: 0 }, dominant: "senang" },
  ];
  const poses: PoseResult[] = [{ keypoints: Array.from({ length: 33 }, (_, i) => ({ x: i * 2, y: i, visibility: i === 5 ? 0.1 : 0.9 })) }];
  const objects: ObjectResult[] = [
    { x: 1, y: 2, width: 30, height: 40, label: "cup", confidence: 0.6 },
    { x: -5, y: 7, width: 10, height: 10, label: "cup", confidence: 0.9 },
    { x: 0, y: 0, width: 5, height: 5, label: "person", confidence: 0.7 },
  ];
  const det = { hand: fakeDetector([hands]), face: fakeDetector([faces]), pose: fakeDetector([poses]), object: fakeDetector([objects]) };
  let embedding = new Float32Array([1, 0, 0, 0]);
  const embedder = fakeEmbedder(() => embedding);
  const env = fakeServices(fake, {
    hand: async () => det.hand,
    face: async () => det.face,
    pose: async () => det.pose,
    object: async () => det.object,
    imageEmbedder: async () => embedder,
  });
  return { fake, det, env, embedder, setEmbedding: (v: number[]) => (embedding = new Float32Array(v)) };
}

describe("ekstensi visi", () => {
  it("hat & reporter TIDAK menyalakan kamera; analisis yang menyalakannya", async () => {
    const { fake, det, env } = setup();
    const run = prims(createAiHandExtension(fake.runtime));
    expect(run("whenGesture", { GESTURE: "_any_" })).toBe(false);
    expect(run("handCount")).toBe(0);
    expect(env.media.requests).toHaveLength(0);
    await run("analyse", { SOURCE: "camera" });
    expect(env.media.requests).toHaveLength(1);
    expect(det.hand.calls).toBe(1);
    expect(run("handCount")).toBe(1);
    expect(run("isHandDetected")).toBe(true);
    expect(run("landmarkPosition", { AXIS: "y", LANDMARK: "8", HAND: 1 })).toBe(-8);
    expect(run("landmarkPosition", { AXIS: "x", LANDMARK: "8", HAND: 2 })).toBe(0);
    expect(run("gesture", { HAND: 1 })).toBe("jempol ke atas");
    expect(run("isGesture", { GESTURE: "Thumb_Up" })).toBe(true);
    expect(run("isGesture", { GESTURE: "jempol ke atas" })).toBe(true);
    expect(run("whenGesture", { GESTURE: "Victory" })).toBe(false);

    // Stop membuang hasil lama: hat tidak terpicu dari data basi.
    fake.emitter.emit("PROJECT_STOP_ALL", undefined);
    expect(run("handCount")).toBe(0);
    expect(env.services.camera.enabled).toBe(false);
  });

  it("izin kamera ditolak -> hasil kosong tanpa error", async () => {
    const { fake, det, env } = setup();
    env.media.deny = true;
    const run = prims(createAiFaceExtension(fake.runtime));
    await run("analyse", { SOURCE: "camera" });
    expect(det.face.calls).toBe(0);
    expect(run("faceCount")).toBe(0);
    expect(run("expression", { FACE: 1 })).toBe("netral");
  });

  it("wajah: atribut, landmark, ekspresi", async () => {
    const { fake } = setup();
    const run = prims(createAiFaceExtension(fake.runtime));
    await run("analyse", { SOURCE: "camera" });
    expect(run("faceAttribute", { ATTRIBUTE: "width", FACE: 1 })).toBe(100);
    expect(run("faceAttribute", { ATTRIBUTE: "senang", FACE: 1 })).toBe(80);
    expect(run("landmarkPosition", { AXIS: "x", LANDMARK: "473", FACE: 1 })).toBe(473);
    expect(run("expression", { FACE: "1" })).toBe("senang");
    expect(run("whenFaceDetected")).toBe(true);
  });

  it("pose: titik dengan visibilitas rendah = 0", async () => {
    const { fake } = setup();
    const run = prims(createAiPoseExtension(fake.runtime));
    await run("analyse", { SOURCE: "camera" });
    expect(run("isPoseDetected")).toBe(true);
    expect(run("keypointPosition", { AXIS: "x", KEYPOINT: "11" })).toBe(22);
    expect(run("keypointPosition", { AXIS: "x", KEYPOINT: "5" })).toBe(0);
  });

  it("objek: keyakinan tertinggi, teks Indonesia diterima, analisis panggung tanpa kamera", async () => {
    const { fake, env } = setup();
    const run = prims(createAiObjectExtension(fake.runtime));
    await run("analyse", { SOURCE: "stage" });
    expect(env.media.requests).toHaveLength(0);
    expect(run("objectCount")).toBe(3);
    expect(run("isObjectDetected", { OBJECT: "cangkir" })).toBe(true);
    expect(run("objectAttribute", { ATTRIBUTE: "x", OBJECT: "cup" })).toBe(-5);
    expect(run("objectAttribute", { ATTRIBUTE: "confidence", OBJECT: "_any_" })).toBe(90);
    expect(run("isObjectDetected", { OBJECT: "dog" })).toBe(false);
  });

  it("videoToggle mengatur stage.videoState dan off mematikan kamera", async () => {
    const { fake, env } = setup();
    const run = prims(createAiHandExtension(fake.runtime));
    await run("videoToggle", { VIDEO_STATE: "on-flipped" });
    expect(fake.stage.videoState).toBe("on-flipped");
    expect(env.services.camera.enabled).toBe(true);
    expect(env.services.camera.isMirrored).toBe(false);
    run("setVideoTransparency", { TRANSPARENCY: "-20" });
    expect(fake.stage.videoTransparency).toBe(0);
    await run("videoToggle", { VIDEO_STATE: "off" });
    expect(env.services.camera.enabled).toBe(false);
  });
});

describe("klasifikasi gambar/teks/suara dari model project", () => {
  it("image: memakai model tersimpan; menu kelas dinamis; model rusak -> notice", async () => {
    const { fake, env, setEmbedding } = setup();
    const clf = new KnnClassifier({ k: 1 });
    clf.addLabel("apel");
    clf.addLabel("jeruk");
    clf.addExample("apel", [1, 0, 0, 0]);
    clf.addExample("jeruk", [0, 1, 0, 0]);
    fake.stage.setCustomState(TRAINED_STATE_KEYS.image, clf.toTrained("image"));
    const mod = createAiImageExtension(fake.runtime);
    const run = prims(mod);
    expect(mod.getDynamicMenus?.().getClassMenu?.(null)).toEqual([
      { text: "apel", value: "apel" },
      { text: "jeruk", value: "jeruk" },
    ]);
    await run("analyse", { SOURCE: "camera" });
    expect(run("classLabel")).toBe("apel");
    expect(run("isClass", { CLASS: "apel" })).toBe(true);
    expect(run("whenClass", { CLASS: "" })).toBe(false);
    expect(run("classConfidence", { CLASS: "apel" })).toBe(100);

    const notices: string[] = [];
    env.services.events.on("notice", (n) => notices.push(n.code));
    fake.stage.setCustomState(TRAINED_STATE_KEYS.image, { kind: "image", version: 1, labels: ["x"], payload: "{\"format\":\"evil\"}", createdAt: 1 });
    setEmbedding([0, 1, 0, 0]);
    await new Promise((r) => setTimeout(r, 80));
    await run("analyse", { SOURCE: "camera" });
    expect(notices).toContain("image-model-invalid");
    expect(run("classLabel")).toBe("");
    expect(mod.getDynamicMenus?.().getClassMenu?.(null)).toEqual([{ text: "(latih model di AI Lab)", value: "" }]);
  });

  it("text: klasifikasi lokal + TTS dengan suara offline", async () => {
    const spoken: string[] = [];
    const fake = createFakeRuntime();
    fakeServices(fake, {}, {
      tts: {
        synth: {
          getVoices: () => [{ name: "Damayanti", lang: "id-ID", localService: true }],
          speak: (u) => {
            spoken.push(`${u.lang}:${u.text}`);
            u.onend?.();
          },
          cancel: () => {},
        },
        createUtterance: (text) => ({ text, lang: "", voice: null, rate: 1, pitch: 1, volume: 1, onend: null, onerror: null }),
      },
    });
    const clf = new TextClassifier();
    clf.addLabel("sapaan");
    clf.addLabel("pamit");
    clf.addExample("sapaan", "halo apa kabar");
    clf.addExample("pamit", "sampai jumpa dadah");
    fake.stage.setCustomState(TRAINED_STATE_KEYS.text, clf.toTrained());
    const run = prims(createAiTextExtension(fake.runtime));
    expect(run("classifyText", { TEXT: "halo" })).toBe("sapaan");
    expect(run("isTextClass", { TEXT: "dadah", CLASS: "pamit" })).toBe(true);
    expect(run("textConfidence", { TEXT: "dadah", CLASS: "pamit" })).toBeGreaterThan(50);
    run("setSpeechLanguage", { LANGUAGE: "Indonesia" });
    expect(fake.stage.textToSpeechLanguage).toBe("id-ID");
    await run("speak", { TEXT: "halo kody" });
    expect(spoken).toEqual(["id-ID:halo kody"]);
    run("setSpeechLanguage", { LANGUAGE: "<script>" });
    expect(fake.stage.textToSpeechLanguage).toBe("id-ID");
  });

  it("audio: mendengarkan, mengklasifikasi jendela, berhenti mematikan mic", async () => {
    const { fake, env } = setup();
    const clf = new KnnClassifier({ k: 1 });
    clf.addLabel("tepuk");
    clf.addLabel("hening");
    clf.addExample("tepuk", new Array(48).fill(0).map((_, i) => (i < 24 ? 0.7 : 0.01)));
    clf.addExample("hening", new Array(48).fill(0).map((_, i) => (i < 24 ? 0.1 : 0.3)));
    fake.stage.setCustomState(TRAINED_STATE_KEYS.audio, clf.toTrained("audio"));
    const run = prims(createAiAudioExtension(fake.runtime));
    expect(run("soundClass")).toBe("");
    await run("startListening");
    expect(env.services.microphone.active).toBe(true);
    await new Promise((r) => setTimeout(r, 500));
    expect(run("soundClass")).toBe("tepuk");
    expect(run("whenSoundClass", { CLASS: "tepuk" })).toBe(true);
    run("stopListening");
    expect(env.services.microphone.active).toBe(false);
    expect(run("soundClass")).toBe("");
  });

  it("audio: pengenalan ucapan tanpa dukungan browser -> string kosong + notice", async () => {
    const { fake, env } = setup();
    const notices: string[] = [];
    env.services.events.on("notice", (n) => notices.push(n.code));
    const run = prims(createAiAudioExtension(fake.runtime));
    await run("recognizeSpeech", { LANGUAGE: "id-ID" });
    expect(run("speechText")).toBe("");
    expect(notices).toContain("speech-unsupported");
  });
});
