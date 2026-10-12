/**
 * Ekstensi Deteksi Wajah (aiFace) - MediaPipe FaceLandmarker (lokal).
 * Hanya posisi, landmark, dan ekspresi sederhana. TIDAK ada pengenalan identitas/umur/gender,
 * dan tidak ada data wajah yang disimpan ke project.
 * Opcode: AI_OPCODES dengan owner "packages/ai/src/extensions/face.ts" di @kody/engine.
 * Pemilik: agent ai.
 */
import { Cast } from "@kody/engine";
import type { ExtensionFactory, ExtensionInfo, ExtensionModule, IRuntime } from "@kody/engine";
import { AI_COLOURS } from "../colours";
import type { FaceResult } from "../types";
import { round2 } from "../vision/coords";
import { NEUTRAL_EXPRESSION, dominantExpression } from "../vision/face-expressions";
import { AXIS_MENU, axisOf, commonVisionBlocks, commonVisionMenus, createVisionCore, toIndex } from "../vision/vision-common";

export const AIFACE_ID = "aiFace";

/** Indeks landmark FaceLandmarker (478 titik, termasuk iris). Kiri/kanan = sisi wajah orangnya. */
export const FACE_LANDMARKS: readonly (readonly [index: number, text: string])[] = [
  [1, "ujung hidung"],
  [473, "mata kiri"],
  [468, "mata kanan"],
  [13, "bibir atas"],
  [14, "bibir bawah"],
  [10, "dahi"],
  [152, "dagu"],
  [454, "pipi kiri"],
  [234, "pipi kanan"],
];

export const FACE_ATTRIBUTES: readonly (readonly [value: string, text: string])[] = [
  ["x", "posisi x"],
  ["y", "posisi y"],
  ["width", "lebar"],
  ["height", "tinggi"],
  ["senang", "senyum (%)"],
  ["mulut terbuka", "mulut terbuka (%)"],
  ["mata tertutup", "mata tertutup (%)"],
  ["terkejut", "terkejut (%)"],
];

export function getAiFaceInfo(): ExtensionInfo {
  return {
    id: AIFACE_ID,
    name: "Deteksi Wajah",
    ...AI_COLOURS,
    blocks: [
      ...commonVisionBlocks({ startAuto: "mulai deteksi wajah terus-menerus", stopAuto: "berhenti deteksi wajah" }),
      "---",
      { opcode: "faceCount", blockType: "reporter", text: "jumlah wajah" },
      { opcode: "isFaceDetected", blockType: "Boolean", text: "wajah terdeteksi?" },
      {
        opcode: "faceAttribute",
        blockType: "reporter",
        text: "[ATTRIBUTE] wajah [FACE]",
        disableMonitor: true,
        arguments: {
          ATTRIBUTE: { type: "string", menu: "ATTRIBUTE", defaultValue: "x" },
          FACE: { type: "number", defaultValue: 1 },
        },
      },
      {
        opcode: "landmarkPosition",
        blockType: "reporter",
        text: "[AXIS] dari [LANDMARK] wajah [FACE]",
        disableMonitor: true,
        arguments: {
          AXIS: { type: "string", menu: "AXIS", defaultValue: "x" },
          LANDMARK: { type: "string", menu: "LANDMARK", defaultValue: "1" },
          FACE: { type: "number", defaultValue: 1 },
        },
      },
      {
        opcode: "expression",
        blockType: "reporter",
        text: "ekspresi wajah [FACE]",
        disableMonitor: true,
        arguments: { FACE: { type: "number", defaultValue: 1 } },
      },
      {
        opcode: "whenFaceDetected",
        blockType: "hat",
        text: "ketika wajah terdeteksi",
        isEdgeActivated: true,
      },
    ],
    menus: {
      ...commonVisionMenus(),
      AXIS: AXIS_MENU,
      ATTRIBUTE: { acceptReporters: false, items: FACE_ATTRIBUTES.map(([value, text]) => ({ text, value })) },
      LANDMARK: { acceptReporters: true, items: FACE_LANDMARKS.map(([i, text]) => ({ text, value: String(i) })) },
    },
  };
}

export function faceAttribute(face: FaceResult | undefined, attribute: string): number {
  if (!face) return 0;
  switch (attribute) {
    case "x":
      return face.x;
    case "y":
      return face.y;
    case "width":
      return face.width;
    case "height":
      return face.height;
    default: {
      const score = face.expressions[attribute];
      return score === undefined ? 0 : round2(score * 100);
    }
  }
}

export const createAiFaceExtension: ExtensionFactory = (runtime: IRuntime): ExtensionModule => {
  const core = createVisionCore<FaceResult[]>(runtime, {
    extensionId: AIFACE_ID,
    empty: () => [],
    analyse: async (services, frame, ts, mirrored) => (await services.detector("face")).detect(frame, ts, { mirrored }),
  });
  const faceAt = (value: unknown): FaceResult | undefined => {
    const faces = core.result();
    return faces[toIndex(value, faces.length)];
  };
  return {
    getInfo: getAiFaceInfo,
    getPrimitives: () => ({
      ...core.primitives,
      faceCount: () => core.result().length,
      isFaceDetected: () => core.result().length > 0,
      faceAttribute: (args) => faceAttribute(faceAt(args.FACE), Cast.toString(args.ATTRIBUTE)),
      landmarkPosition: (args) => axisOf(faceAt(args.FACE)?.landmarks[Math.floor(Cast.toNumber(args.LANDMARK))], args.AXIS),
      expression: (args) => {
        const face = faceAt(args.FACE);
        return face ? dominantExpression(face.expressions) : NEUTRAL_EXPRESSION;
      },
      whenFaceDetected: () => core.result().length > 0,
    }),
    dispose: () => core.dispose(),
  };
};
