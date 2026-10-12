/**
 * Ekstensi Klasifikasi Gambar (aiImage) - fitur MobileNet + classifier KNN/centroid dari AI Lab.
 * Model terlatih dibaca dari state panggung "Kody.aiImage" (divalidasi; input tak tepercaya).
 * Opcode: AI_OPCODES dengan owner "packages/ai/src/extensions/image.ts" di @kody/engine.
 * Pemilik: agent ai.
 */
import { Cast } from "@kody/engine";
import type { ExtensionFactory, ExtensionInfo, ExtensionModule, IRuntime } from "@kody/engine";
import { TrainedModelCache } from "../classifier/storage";
import { AI_COLOURS } from "../colours";
import { getAiServices } from "../services";
import type { ClassificationResult } from "../types";
import { round2 } from "../vision/coords";
import { classMenuItems, watchProjectModels } from "./class-menu";
import { commonVisionBlocks, commonVisionMenus, createVisionCore } from "../vision/vision-common";

export const AIIMAGE_ID = "aiImage";

export function getAiImageInfo(): ExtensionInfo {
  return {
    id: AIIMAGE_ID,
    name: "Klasifikasi Gambar",
    ...AI_COLOURS,
    blocks: [
      ...commonVisionBlocks({ startAuto: "mulai klasifikasi kamera", stopAuto: "berhenti klasifikasi" }),
      "---",
      { opcode: "classLabel", blockType: "reporter", text: "label dari kamera" },
      {
        opcode: "classConfidence",
        blockType: "reporter",
        text: "kepercayaan untuk [CLASS] (%)",
        disableMonitor: true,
        arguments: { CLASS: { type: "string", menu: "CLASS" } },
      },
      {
        opcode: "isClass",
        blockType: "Boolean",
        text: "AI melihat [CLASS]?",
        arguments: { CLASS: { type: "string", menu: "CLASS" } },
      },
      {
        opcode: "whenClass",
        blockType: "hat",
        text: "ketika AI mengenali [CLASS]",
        isEdgeActivated: true,
        arguments: { CLASS: { type: "string", menu: "CLASS" } },
      },
    ],
    menus: {
      ...commonVisionMenus(),
      CLASS: { acceptReporters: true, items: "getClassMenu" },
    },
  };
}

export function confidenceOf(result: ClassificationResult | null, label: string): number {
  return result ? round2((result.scores[label] ?? 0) * 100) : 0;
}

export const createAiImageExtension: ExtensionFactory = (runtime: IRuntime): ExtensionModule => {
  let cache: TrainedModelCache<"image"> | null = null;
  let warnedNoModel = false;
  const model = (): TrainedModelCache<"image"> =>
    (cache ??= new TrainedModelCache(runtime, "image", (message) =>
      getAiServices(runtime).notice({ level: "error", code: "image-model-invalid", message }),
    ));

  const core = createVisionCore<ClassificationResult | null>(runtime, {
    extensionId: AIIMAGE_ID,
    empty: () => null,
    analyse: async (services, frame) => {
      const clf = model().get();
      if (!clf || !clf.isTrained()) {
        if (!warnedNoModel) {
          warnedNoModel = true;
          services.notice({ level: "info", code: "image-no-model", message: "Belum ada model gambar. Latih dulu di AI Lab (minimal 2 kelas)." });
        }
        return null;
      }
      const embedder = await services.detector("imageEmbedder");
      return clf.predict(await embedder.embed(frame));
    },
  });

  const offProject = watchProjectModels(runtime, "image", () => {
    warnedNoModel = false;
  });

  const isClass = (label: unknown): boolean => {
    const r = core.result();
    const wanted = Cast.toString(label);
    return r !== null && wanted !== "" && r.label === wanted;
  };

  return {
    getInfo: getAiImageInfo,
    getPrimitives: () => ({
      ...core.primitives,
      classLabel: () => core.result()?.label ?? "",
      classConfidence: (args) => confidenceOf(core.result(), Cast.toString(args.CLASS)),
      isClass: (args) => isClass(args.CLASS),
      whenClass: (args) => isClass(args.CLASS),
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
