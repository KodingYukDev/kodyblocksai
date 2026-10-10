/**
 * Ekstensi Deteksi Objek (aiObject) - COCO-SSD tfjs (lokal, model di-host sendiri + hash diverifikasi).
 * Opcode: AI_OPCODES dengan owner "packages/ai/src/extensions/object.ts" di @kody/engine.
 * Pemilik: agent ai.
 */
import { Cast } from "@kody/engine";
import type { ExtensionFactory, ExtensionInfo, ExtensionModule, IRuntime } from "@kody/engine";
import { AI_COLOURS } from "../colours";
import type { ObjectResult } from "../types";
import { ANY_OBJECT, COCO_CLASSES } from "../vision/coco-classes";
import { round2 } from "../vision/coords";
import { commonVisionBlocks, commonVisionMenus, createVisionCore } from "../vision/vision-common";

export const AIOBJECT_ID = "aiObject";

export const OBJECT_ATTRIBUTES: readonly (readonly [value: string, text: string])[] = [
  ["x", "posisi x"],
  ["y", "posisi y"],
  ["width", "lebar"],
  ["height", "tinggi"],
  ["confidence", "keyakinan (%)"],
];

export function getAiObjectInfo(): ExtensionInfo {
  return {
    id: AIOBJECT_ID,
    name: "Deteksi Objek",
    ...AI_COLOURS,
    blocks: [
      ...commonVisionBlocks(),
      "---",
      { opcode: "objectCount", blockType: "reporter", text: "jumlah objek" },
      {
        opcode: "isObjectDetected",
        blockType: "Boolean",
        text: "[OBJECT] terdeteksi?",
        arguments: { OBJECT: { type: "string", menu: "OBJECT", defaultValue: "person" } },
      },
      {
        opcode: "objectAttribute",
        blockType: "reporter",
        text: "[ATTRIBUTE] dari [OBJECT]",
        disableMonitor: true,
        arguments: {
          ATTRIBUTE: { type: "string", menu: "ATTRIBUTE", defaultValue: "x" },
          OBJECT: { type: "string", menu: "OBJECT", defaultValue: "person" },
        },
      },
    ],
    menus: {
      ...commonVisionMenus(),
      OBJECT: {
        acceptReporters: true,
        items: [{ text: "objek apa saja", value: ANY_OBJECT }, ...COCO_CLASSES.map(([value, text]) => ({ text, value }))],
      },
      ATTRIBUTE: { acceptReporters: false, items: OBJECT_ATTRIBUTES.map(([value, text]) => ({ text, value })) },
    },
  };
}

const textToValue = new Map(COCO_CLASSES.map(([value, text]) => [text, value]));

/** Objek pertama (keyakinan tertinggi) yang cocok; menerima nilai menu Inggris atau teks Indonesia. */
export function findObject(objects: readonly ObjectResult[], wanted: string): ObjectResult | undefined {
  const w = wanted.trim().toLowerCase();
  const value = textToValue.get(w) ?? w;
  const matches = w === ANY_OBJECT ? [...objects] : objects.filter((o) => o.label.toLowerCase() === value);
  return matches.sort((a, b) => b.confidence - a.confidence)[0];
}

export function objectAttribute(obj: ObjectResult | undefined, attribute: string): number {
  if (!obj) return 0;
  switch (attribute) {
    case "y":
      return obj.y;
    case "width":
      return obj.width;
    case "height":
      return obj.height;
    case "confidence":
      return round2(obj.confidence * 100);
    default:
      return obj.x;
  }
}

export const createAiObjectExtension: ExtensionFactory = (runtime: IRuntime): ExtensionModule => {
  const core = createVisionCore<ObjectResult[]>(runtime, {
    extensionId: AIOBJECT_ID,
    empty: () => [],
    analyse: async (services, frame, ts, mirrored) => (await services.detector("object")).detect(frame, ts, { mirrored }),
  });
  return {
    getInfo: getAiObjectInfo,
    getPrimitives: () => ({
      ...core.primitives,
      objectCount: () => core.result().length,
      isObjectDetected: (args) => findObject(core.result(), Cast.toString(args.OBJECT)) !== undefined,
      objectAttribute: (args) => objectAttribute(findObject(core.result(), Cast.toString(args.OBJECT)), Cast.toString(args.ATTRIBUTE)),
    }),
    dispose: () => core.dispose(),
  };
};
