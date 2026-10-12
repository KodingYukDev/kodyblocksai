/**
 * Ekstensi Deteksi Tubuh (aiPose) - MediaPipe PoseLandmarker (lokal).
 * Opcode: AI_OPCODES dengan owner "packages/ai/src/extensions/pose.ts" di @kody/engine.
 * Pemilik: agent ai.
 */
import { Cast } from "@kody/engine";
import type { ExtensionFactory, ExtensionInfo, ExtensionModule, IRuntime } from "@kody/engine";
import { AI_COLOURS } from "../colours";
import { poseFeatures } from "../classifier/landmark-features";
import { TrainedModelCache } from "../classifier/storage";
import { getAiServices } from "../services";
import type { ClassificationResult, PoseResult } from "../types";
import { round2 } from "../vision/coords";
import { classMenuItems, watchProjectModels } from "./class-menu";
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
      ...commonVisionBlocks({ startAuto: "mulai deteksi tubuh terus-menerus", stopAuto: "berhenti deteksi tubuh" }),
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
      "---",
      { opcode: "poseClass", blockType: "reporter", text: "label pose dari model AI Lab" },
      {
        opcode: "poseClassConfidence",
        blockType: "reporter",
        text: "kepercayaan untuk pose [CLASS] (%)",
        disableMonitor: true,
        arguments: { CLASS: { type: "string", menu: "CLASS" } },
      },
      {
        opcode: "isPoseClass",
        blockType: "Boolean",
        text: "AI mengenali pose [CLASS]?",
        arguments: { CLASS: { type: "string", menu: "CLASS" } },
      },
      {
        opcode: "whenPoseClass",
        blockType: "hat",
        text: "ketika AI mengenali pose [CLASS]",
        isEdgeActivated: true,
        arguments: { CLASS: { type: "string", menu: "CLASS" } },
      },
    ],
    menus: {
      ...commonVisionMenus(),
      AXIS: AXIS_MENU,
      KEYPOINT: { acceptReporters: true, items: POSE_KEYPOINTS.map(([i, text]) => ({ text, value: String(i) })) },
      CLASS: { acceptReporters: true, items: "getClassMenu" },
    },
  };
}

interface PoseFrame {
  poses: PoseResult[];
  /** Hasil model AI Lab (pose buatan anak), atau null. */
  cls: ClassificationResult | null;
}

export const createAiPoseExtension: ExtensionFactory = (runtime: IRuntime): ExtensionModule => {
  let cache: TrainedModelCache<"pose"> | null = null;
  const model = (): TrainedModelCache<"pose"> =>
    (cache ??= new TrainedModelCache(runtime, "pose", (message) =>
      getAiServices(runtime).notice({ level: "error", code: "pose-model-invalid", message }),
    ));
  const core = createVisionCore<PoseFrame>(runtime, {
    extensionId: AIPOSE_ID,
    empty: () => ({ poses: [], cls: null }),
    analyse: async (services, frame, ts, mirrored) => {
      const poses = await (await services.detector("pose")).detect(frame, ts, { mirrored });
      const clf = model().get();
      const features = clf?.isTrained() ? poseFeatures(poses[0]) : null;
      return { poses, cls: clf && features ? clf.predict(features) : null };
    },
  });
  const offProject = watchProjectModels(runtime, "pose");
  const isClass = (label: unknown): boolean => {
    const r = core.result().cls;
    const wanted = Cast.toString(label);
    return r !== null && wanted !== "" && r.label === wanted;
  };
  return {
    getInfo: getAiPoseInfo,
    getPrimitives: () => ({
      ...core.primitives,
      isPoseDetected: () => core.result().poses.length > 0,
      keypointPosition: (args) => {
        const kp = core.result().poses[0]?.keypoints[Math.floor(Cast.toNumber(args.KEYPOINT))];
        if (!kp || kp.visibility < MIN_VISIBILITY) return 0;
        return axisOf(kp, args.AXIS);
      },
      poseClass: () => core.result().cls?.label ?? "",
      poseClassConfidence: (args) => round2((core.result().cls?.scores[Cast.toString(args.CLASS)] ?? 0) * 100),
      isPoseClass: (args) => isClass(args.CLASS),
      whenPoseClass: (args) => isClass(args.CLASS),
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
