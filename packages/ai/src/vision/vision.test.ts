import { describe, expect, it } from "vitest";
import { facesFromMediaPipe, handsFromMediaPipe, objectsFromCoco, posesFromMediaPipe } from "./adapters";
import { AnalysisGate } from "./analysis-gate";
import { normPointsBox, normToStage, pixelBoxToStage } from "./coords";
import { dominantExpression, expressionsFromBlendshapes } from "./face-expressions";
import { classifyGesture } from "./gestures";
import { syntheticHand } from "../testing/hand-fixture";
import type { HandSpec } from "../testing/hand-fixture";

describe("koordinat", () => {
  it("normToStage memetakan sudut frame ke tepi panggung", () => {
    expect(normToStage(0, 0)).toEqual({ x: -240, y: 180 });
    expect(normToStage(1, 1)).toEqual({ x: 240, y: -180 });
    expect(normToStage(0.5, 0.5)).toEqual({ x: 0, y: 0 });
    expect(normToStage(Number.NaN, 2)).toEqual({ x: 0, y: -180 });
  });

  it("kotak piksel & kotak titik -> pusat + ukuran panggung", () => {
    expect(pixelBoxToStage([0, 0, 320, 240], 640, 480)).toEqual({ x: -120, y: 90, width: 240, height: 180 });
    expect(normPointsBox([{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 }])).toEqual({ x: 0, y: 0, width: 240, height: 180 });
    expect(normPointsBox([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe("gestur", () => {
  it.each([
    [{ thumb: "side", index: true, middle: true, ring: true, pinky: true }, "Open_Palm"],
    [{ thumb: "folded" }, "Closed_Fist"],
    [{ thumb: "folded", index: true }, "Pointing_Up"],
    [{ thumb: "folded", index: true, middle: true }, "Victory"],
    [{ thumb: "side", index: true, pinky: true }, "ILoveYou"],
    [{ thumb: "side" }, "Thumb_Up"],
    [{ thumb: "down" }, "Thumb_Down"],
    [{ thumb: "folded", middle: true, ring: true }, null],
  ] as [HandSpec, string | null][])("%o -> %s", (spec, expected) => {
    expect(classifyGesture(syntheticHand(spec))).toBe(expected);
  });

  it("landmark kurang dari 21 -> null", () => {
    expect(classifyGesture([{ x: 0, y: 0 }])).toBeNull();
  });

  it("tahan skala (tangan kecil/jauh)", () => {
    const small = syntheticHand({ thumb: "folded", index: true, middle: true }).map((p) => ({ x: 0.5 + (p.x - 0.5) * 0.3, y: 0.5 + (p.y - 0.5) * 0.3 }));
    expect(classifyGesture(small)).toBe("Victory");
  });
});

describe("ekspresi wajah", () => {
  it("senyum dominan, netral bila skor rendah", () => {
    const smile = expressionsFromBlendshapes([
      { categoryName: "mouthSmileLeft", score: 0.9 },
      { categoryName: "mouthSmileRight", score: 0.8 },
    ]);
    expect(smile.senang).toBeCloseTo(0.85);
    expect(dominantExpression(smile)).toBe("senang");
    expect(dominantExpression(expressionsFromBlendshapes([]))).toBe("netral");
    const surprised = expressionsFromBlendshapes([
      { categoryName: "jawOpen", score: 0.9 },
      { categoryName: "browInnerUp", score: 0.8 },
      { categoryName: "eyeWideLeft", score: 0.7 },
      { categoryName: "eyeWideRight", score: 0.7 },
    ]);
    expect(dominantExpression(surprised)).toBe("terkejut");
    expect(expressionsFromBlendshapes([{ categoryName: "jawOpen", score: 5 }])["mulut terbuka"]).toBe(1);
  });
});

describe("adaptor", () => {
  const lm = syntheticHand({ thumb: "side" });

  it("tangan: koordinat panggung, gestur, kiri/kanan dibalik bila tidak dicerminkan", () => {
    const raw = { landmarks: [lm], handedness: [[{ categoryName: "Left", score: 0.9 }]] };
    const [mirrored] = handsFromMediaPipe(raw, true);
    expect(mirrored?.handedness).toBe("Left");
    expect(mirrored?.gesture).toBe("Thumb_Up");
    expect(mirrored?.landmarks[0]).toEqual({ x: 0, y: -108 });
    expect(handsFromMediaPipe(raw, false)[0]?.handedness).toBe("Right");
  });

  it("wajah: kotak, landmark, ekspresi; tanpa data identitas", () => {
    const [face] = facesFromMediaPipe({
      faceLandmarks: [[{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }]],
      faceBlendshapes: [{ categories: [{ categoryName: "mouthSmileLeft", score: 1 }, { categoryName: "mouthSmileRight", score: 1 }] }],
    });
    expect(face).toMatchObject({ x: 0, y: 0, width: 96, height: 72, dominant: "senang" });
    expect(Object.keys(face ?? {}).sort()).toEqual(["dominant", "expressions", "height", "landmarks", "width", "x", "y"]);
  });

  it("pose & objek", () => {
    const [pose] = posesFromMediaPipe({ landmarks: [[{ x: 0.5, y: 0.5, visibility: 0.33333 }]] });
    expect(pose?.keypoints[0]).toEqual({ x: 0, y: 0, visibility: 0.33 });
    const [obj] = objectsFromCoco([{ bbox: [160, 120, 320, 240], class: "cup", score: 0.876 }], 640, 480);
    expect(obj).toEqual({ x: 0, y: 0, width: 240, height: 180, label: "cup", confidence: 0.88 });
  });
});

describe("AnalysisGate", () => {
  it("membatasi laju, menggabungkan panggilan paralel, dan invalidate membuang hasil", async () => {
    let t = 0;
    let runs = 0;
    const gate = new AnalysisGate<number>(() => -1, 100, () => t);
    const analyse = async (): Promise<number> => ++runs;
    const [a, b] = await Promise.all([gate.run(analyse), gate.run(analyse)]);
    expect([a, b, runs]).toEqual([1, 1, 1]);
    t = 50;
    expect(await gate.run(analyse)).toBe(1);
    expect(runs).toBe(1);
    t = 150;
    expect(await gate.run(analyse)).toBe(2);

    // Hasil analisis yang selesai setelah invalidate dibuang.
    t = 300;
    let release: (v: number) => void = () => {};
    const slow = gate.run(() => new Promise<number>((r) => (release = r)));
    gate.invalidate();
    release(99);
    await slow;
    expect(gate.result).toBe(-1);
  });

  it("error analisis tidak melempar ke thread, hasil lama dipertahankan", async () => {
    const gate = new AnalysisGate<string>(() => "", 0, () => 0);
    await gate.run(async () => "ok");
    await expect(gate.run(async () => Promise.reject(new Error("x")))).resolves.toBe("ok");
  });
});
