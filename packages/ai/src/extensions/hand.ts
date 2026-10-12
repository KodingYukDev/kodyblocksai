/**
 * Ekstensi Deteksi Tangan (aiHand) - MediaPipe HandLandmarker (lokal) + gestur berbasis aturan.
 * Opcode: AI_OPCODES dengan owner "packages/ai/src/extensions/hand.ts" di @kody/engine.
 * Pemilik: agent ai.
 */
import { Cast } from "@kody/engine";
import type { ExtensionFactory, ExtensionInfo, ExtensionModule, IRuntime } from "@kody/engine";
import { AI_COLOURS } from "../colours";
import { handFeatures } from "../classifier/landmark-features";
import { TrainedModelCache } from "../classifier/storage";
import { getAiServices } from "../services";
import type { ClassificationResult, HandResult } from "../types";
import { round2 } from "../vision/coords";
import { classMenuItems, watchProjectModels } from "./class-menu";
import { GESTURES, GESTURE_LABELS_ID } from "../vision/gestures";
import { AXIS_MENU, axisOf, commonVisionBlocks, commonVisionMenus, createVisionCore, toIndex } from "../vision/vision-common";

export const AIHAND_ID = "aiHand";

export const HAND_LANDMARKS: readonly (readonly [index: number, text: string])[] = [
  [0, "pergelangan"],
  [4, "ujung jempol"],
  [8, "ujung telunjuk"],
  [12, "ujung jari tengah"],
  [16, "ujung jari manis"],
  [20, "ujung kelingking"],
  [9, "tengah telapak"],
];

export const ANY_GESTURE = "_any_";

export function getAiHandInfo(): ExtensionInfo {
  return {
    id: AIHAND_ID,
    name: "Deteksi Tangan",
    ...AI_COLOURS,
    blocks: [
      ...commonVisionBlocks({ startAuto: "mulai deteksi tangan terus-menerus", stopAuto: "berhenti deteksi tangan" }),
      "---",
      { opcode: "handCount", blockType: "reporter", text: "jumlah tangan" },
      { opcode: "isHandDetected", blockType: "Boolean", text: "tangan terdeteksi?" },
      {
        opcode: "landmarkPosition",
        blockType: "reporter",
        text: "[AXIS] dari [LANDMARK] tangan [HAND]",
        disableMonitor: true,
        arguments: {
          AXIS: { type: "string", menu: "AXIS", defaultValue: "x" },
          LANDMARK: { type: "string", menu: "LANDMARK", defaultValue: "8" },
          HAND: { type: "number", defaultValue: 1 },
        },
      },
      "---",
      {
        opcode: "gesture",
        blockType: "reporter",
        text: "gestur tangan [HAND]",
        disableMonitor: true,
        arguments: { HAND: { type: "number", defaultValue: 1 } },
      },
      {
        opcode: "isGesture",
        blockType: "Boolean",
        text: "gestur [GESTURE] terdeteksi?",
        arguments: { GESTURE: { type: "string", menu: "GESTURE", defaultValue: "Open_Palm" } },
      },
      {
        opcode: "whenGesture",
        blockType: "hat",
        text: "ketika gestur [GESTURE] terdeteksi",
        isEdgeActivated: true,
        arguments: { GESTURE: { type: "string", menu: "GESTURE", defaultValue: "Thumb_Up" } },
      },
      "---",
      { opcode: "handClass", blockType: "reporter", text: "label gestur dari model AI Lab" },
      {
        opcode: "handClassConfidence",
        blockType: "reporter",
        text: "kepercayaan untuk gestur [CLASS] (%)",
        disableMonitor: true,
        arguments: { CLASS: { type: "string", menu: "CLASS" } },
      },
      {
        opcode: "isHandClass",
        blockType: "Boolean",
        text: "AI mengenali gestur [CLASS]?",
        arguments: { CLASS: { type: "string", menu: "CLASS" } },
      },
      {
        opcode: "whenHandClass",
        blockType: "hat",
        text: "ketika AI mengenali gestur [CLASS]",
        isEdgeActivated: true,
        arguments: { CLASS: { type: "string", menu: "CLASS" } },
      },
    ],
    menus: {
      ...commonVisionMenus(),
      AXIS: AXIS_MENU,
      LANDMARK: { acceptReporters: true, items: HAND_LANDMARKS.map(([i, text]) => ({ text, value: String(i) })) },
      GESTURE: {
        acceptReporters: true,
        items: [{ text: "apa saja", value: ANY_GESTURE }, ...GESTURES.map((g) => ({ text: GESTURE_LABELS_ID[g], value: g }))],
      },
      CLASS: { acceptReporters: true, items: "getClassMenu" },
    },
  };
}

/** Teks gestur untuk reporter (Indonesia; kosong bila tidak ada). */
export function gestureText(g: string | null): string {
  if (!g) return "";
  return (GESTURE_LABELS_ID as Record<string, string>)[g] ?? g;
}

function matchesGesture(hands: readonly HandResult[], wanted: string): boolean {
  if (wanted === ANY_GESTURE) return hands.some((h) => h.gesture !== null);
  // Terima nilai menu (Thumb_Up) maupun teks Indonesia (jempol ke atas) dari reporter.
  return hands.some((h) => h.gesture !== null && (h.gesture === wanted || gestureText(h.gesture) === wanted));
}

interface HandFrame {
  hands: HandResult[];
  /** Hasil model AI Lab (gestur buatan anak) untuk tangan pertama, atau null. */
  cls: ClassificationResult | null;
}

export const createAiHandExtension: ExtensionFactory = (runtime: IRuntime): ExtensionModule => {
  let cache: TrainedModelCache<"hand"> | null = null;
  const model = (): TrainedModelCache<"hand"> =>
    (cache ??= new TrainedModelCache(runtime, "hand", (message) =>
      getAiServices(runtime).notice({ level: "error", code: "hand-model-invalid", message }),
    ));
  const core = createVisionCore<HandFrame>(runtime, {
    extensionId: AIHAND_ID,
    empty: () => ({ hands: [], cls: null }),
    analyse: async (services, frame, ts, mirrored) => {
      const hands = await (await services.detector("hand")).detect(frame, ts, { mirrored });
      const clf = model().get();
      const features = clf?.isTrained() ? handFeatures(hands[0]) : null;
      return { hands, cls: clf && features ? clf.predict(features) : null };
    },
  });
  const offProject = watchProjectModels(runtime, "hand");
  const hands = (): HandResult[] => core.result().hands;
  const isClass = (label: unknown): boolean => {
    const r = core.result().cls;
    const wanted = Cast.toString(label);
    return r !== null && wanted !== "" && r.label === wanted;
  };
  return {
    getInfo: getAiHandInfo,
    getPrimitives: () => ({
      ...core.primitives,
      handCount: () => hands().length,
      isHandDetected: () => hands().length > 0,
      landmarkPosition: (args) => {
        const list = hands();
        const hand = list[toIndex(args.HAND, list.length)];
        const idx = Math.floor(Cast.toNumber(args.LANDMARK));
        return axisOf(hand?.landmarks[idx], args.AXIS);
      },
      gesture: (args) => {
        const list = hands();
        return gestureText(list[toIndex(args.HAND, list.length)]?.gesture ?? null);
      },
      isGesture: (args) => matchesGesture(hands(), Cast.toString(args.GESTURE)),
      whenGesture: (args) => matchesGesture(hands(), Cast.toString(args.GESTURE)),
      handClass: () => core.result().cls?.label ?? "",
      handClassConfidence: (args) => round2((core.result().cls?.scores[Cast.toString(args.CLASS)] ?? 0) * 100),
      isHandClass: (args) => isClass(args.CLASS),
      whenHandClass: (args) => isClass(args.CLASS),
    }),
    getDynamicMenus: () => ({
      getClassMenu: () => classMenuItems(model().labels()),
    }),
    dispose: () => {
      offProject();
      core.dispose();
    },
  };
};
