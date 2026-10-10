/**
 * Ekstensi Deteksi Tubuh (aiPose) - MediaPipe PoseLandmarker (lokal).
 * Opcode: AI_OPCODES dengan owner "packages/ai/src/extensions/pose.ts" di @kody/engine.
 * Pemilik: agent ai.
 */
import { Cast } from "@kody/engine";
import type { ExtensionFactory, ExtensionInfo, ExtensionModule, IRuntime } from "@kody/engine";
import { AI_COLOURS } from "../colours";
import type { PoseResult } from "../types";
import { AXIS_MENU, axisOf, commonVisionBlocks, commonVisionMenus, createVisionCore } from "../vision/vision-common";

export const AIPOSE_ID = "aiPose";

/** Indeks landmark MediaPipe Pose (33 titik). Kiri/kanan = sisi tubuh orangnya. */
export const POSE_KEYPOINTS: readonly (readonly [index: number, text: string])[] = [
  [0, "hidung"],
  [2, "mata kiri"],
  [5, "mata kanan"],
  [7, "telinga kiri"],
  [8, "telinga kanan"],
  [11, "bahu kiri"],
  [12, "bahu kanan"],
  [13, "siku kiri"],
  [14, "siku kanan"],
  [15, "pergelangan tangan kiri"],
  [16, "pergelangan tangan kanan"],
  [23, "pinggul kiri"],
  [24, "pinggul kanan"],
  [25, "lutut kiri"],
  [26, "lutut kanan"],
  [27, "pergelangan kaki kiri"],
  [28, "pergelangan kaki kanan"],
];

/** Titik dengan visibilitas di bawah ini dianggap tidak terlihat. */
export const MIN_VISIBILITY = 0.5;

export function getAiPoseInfo(): ExtensionInfo {
  return {
    id: AIPOSE_ID,
    name: "Deteksi Tubuh",
    ...AI_COLOURS,
    blocks: [
      ...commonVisionBlocks(),
      "---",
      { opcode: "isPoseDetected", blockType: "Boolean", text: "tubuh terdeteksi?" },
      {
        opcode: "keypointPosition",
        blockType: "reporter",
        text: "[AXIS] dari [KEYPOINT]",
        disableMonitor: true,
        arguments: {
          AXIS: { type: "string", menu: "AXIS", defaultValue: "x" },
          KEYPOINT: { type: "string", menu: "KEYPOINT", defaultValue: "0" },
        },
      },
    ],
    menus: {
      ...commonVisionMenus(),
      AXIS: AXIS_MENU,
      KEYPOINT: { acceptReporters: true, items: POSE_KEYPOINTS.map(([i, text]) => ({ text, value: String(i) })) },
    },
  };
}

export const createAiPoseExtension: ExtensionFactory = (runtime: IRuntime): ExtensionModule => {
  const core = createVisionCore<PoseResult[]>(runtime, {
    extensionId: AIPOSE_ID,
    empty: () => [],
    analyse: async (services, frame, ts, mirrored) => (await services.detector("pose")).detect(frame, ts, { mirrored }),
  });
  return {
    getInfo: getAiPoseInfo,
    getPrimitives: () => ({
      ...core.primitives,
      isPoseDetected: () => core.result().length > 0,
      keypointPosition: (args) => {
        const kp = core.result()[0]?.keypoints[Math.floor(Cast.toNumber(args.KEYPOINT))];
        if (!kp || kp.visibility < MIN_VISIBILITY) return 0;
        return axisOf(kp, args.AXIS);
      },
    }),
    dispose: () => core.dispose(),
  };
};
