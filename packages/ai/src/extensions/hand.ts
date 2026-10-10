/**
 * Ekstensi Deteksi Tangan (aiHand) - MediaPipe HandLandmarker (lokal) + gestur berbasis aturan.
 * Opcode: AI_OPCODES dengan owner "packages/ai/src/extensions/hand.ts" di @kody/engine.
 * Pemilik: agent ai.
 */
import { Cast } from "@kody/engine";
import type { ExtensionFactory, ExtensionInfo, ExtensionModule, IRuntime } from "@kody/engine";
import { AI_COLOURS } from "../colours";
import type { HandResult } from "../types";
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
      ...commonVisionBlocks(),
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
    ],
    menus: {
      ...commonVisionMenus(),
      AXIS: AXIS_MENU,
      LANDMARK: { acceptReporters: true, items: HAND_LANDMARKS.map(([i, text]) => ({ text, value: String(i) })) },
      GESTURE: {
        acceptReporters: true,
        items: [{ text: "apa saja", value: ANY_GESTURE }, ...GESTURES.map((g) => ({ text: GESTURE_LABELS_ID[g], value: g }))],
      },
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

export const createAiHandExtension: ExtensionFactory = (runtime: IRuntime): ExtensionModule => {
  const core = createVisionCore<HandResult[]>(runtime, {
    extensionId: AIHAND_ID,
    empty: () => [],
    analyse: async (services, frame, ts, mirrored) => (await services.detector("hand")).detect(frame, ts, { mirrored }),
  });
  return {
    getInfo: getAiHandInfo,
    getPrimitives: () => ({
      ...core.primitives,
      handCount: () => core.result().length,
      isHandDetected: () => core.result().length > 0,
      landmarkPosition: (args) => {
        const hands = core.result();
        const hand = hands[toIndex(args.HAND, hands.length)];
        const idx = Math.floor(Cast.toNumber(args.LANDMARK));
        return axisOf(hand?.landmarks[idx], args.AXIS);
      },
      gesture: (args) => {
        const hands = core.result();
        return gestureText(hands[toIndex(args.HAND, hands.length)]?.gesture ?? null);
      },
      isGesture: (args) => matchesGesture(core.result(), Cast.toString(args.GESTURE)),
      whenGesture: (args) => matchesGesture(core.result(), Cast.toString(args.GESTURE)),
    }),
    dispose: () => core.dispose(),
  };
};
