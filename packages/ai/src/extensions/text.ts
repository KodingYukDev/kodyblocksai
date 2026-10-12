/**
 * Ekstensi Klasifikasi Teks (aiText) - Naive Bayes lokal dari AI Lab - plus text-to-speech.
 * Teks tidak pernah dikirim ke server. TTS memakai suara offline perangkat; suara online hanya
 * setelah persetujuan eksplisit (lihat speech/tts.ts).
 * Opcode: AI_OPCODES dengan owner "packages/ai/src/extensions/text.ts" di @kody/engine
 * (+ speak / setSpeechLanguage: belum ada di katalog, lihat AI_EXTRA_OPCODES).
 * Pemilik: agent ai.
 */
import { Cast } from "@kody/engine";
import type { ExtensionFactory, ExtensionInfo, ExtensionModule, IRuntime } from "@kody/engine";
import { TrainedModelCache } from "../classifier/storage";
import { AI_COLOURS } from "../colours";
import { clampTextInput } from "../security";
import { getAiServices } from "../services";
import { DEFAULT_SPEECH_LANGUAGE, parseLanguage } from "../speech/language";
import { TTS_LANGUAGES } from "../speech/tts";
import { round2 } from "../vision/coords";
import type { ClassificationResult } from "../types";
import { classMenuItems, watchProjectModels } from "./class-menu";

export const AITEXT_ID = "aiText";

export function getAiTextInfo(): ExtensionInfo {
  return {
    id: AITEXT_ID,
    name: "Klasifikasi Teks",
    ...AI_COLOURS,
    blocks: [
      {
        opcode: "classifyText",
        blockType: "reporter",
        text: "label dari teks [TEXT]",
        disableMonitor: true,
        arguments: { TEXT: { type: "string", defaultValue: "halo" } },
      },
      {
        opcode: "isTextClass",
        blockType: "Boolean",
        text: "AI menganggap teks [TEXT] sebagai [CLASS]?",
        arguments: { TEXT: { type: "string", defaultValue: "halo" }, CLASS: { type: "string", menu: "CLASS" } },
      },
      {
        opcode: "textConfidence",
        blockType: "reporter",
        text: "kepercayaan untuk [CLASS] dari teks [TEXT] (%)",
        disableMonitor: true,
        arguments: { CLASS: { type: "string", menu: "CLASS" }, TEXT: { type: "string", defaultValue: "halo" } },
      },
      "---",
      {
        opcode: "speak",
        blockType: "command",
        text: "ucapkan [TEXT]",
        arguments: { TEXT: { type: "string", defaultValue: "halo" } },
      },
      {
        opcode: "setSpeechLanguage",
        blockType: "command",
        text: "atur bahasa suara ke [LANGUAGE]",
        arguments: { LANGUAGE: { type: "string", menu: "LANGUAGE", defaultValue: DEFAULT_SPEECH_LANGUAGE } },
      },
    ],
    menus: {
      CLASS: { acceptReporters: true, items: "getClassMenu" },
      LANGUAGE: { acceptReporters: true, items: TTS_LANGUAGES.map(([value, text]) => ({ text, value })) },
    },
  };
}

export const createAiTextExtension: ExtensionFactory = (runtime: IRuntime): ExtensionModule => {
  let cache: TrainedModelCache<"text"> | null = null;
  let warnedNoModel = false;
  const model = (): TrainedModelCache<"text"> =>
    (cache ??= new TrainedModelCache(runtime, "text", (message) =>
      getAiServices(runtime).notice({ level: "error", code: "text-model-invalid", message }),
    ));
  let held = false;
  const services = (): ReturnType<typeof getAiServices> => {
    const s = getAiServices(runtime);
    if (!held) {
      s.hold(AITEXT_ID);
      held = true;
    }
    return s;
  };

  const offProject = watchProjectModels(runtime, "text", () => {
    warnedNoModel = false;
  });

  const classify = (text: unknown): ClassificationResult | null => {
    const clf = model().get();
    if (!clf || !clf.isTrained()) {
      if (!warnedNoModel) {
        warnedNoModel = true;
        services().notice({ level: "info", code: "text-no-model", message: "Belum ada model teks. Latih dulu di AI Lab (minimal 2 kelas)." });
      }
      return null;
    }
    return clf.predict(clampTextInput(Cast.toString(text)));
  };

  return {
    getInfo: getAiTextInfo,
    getPrimitives: () => ({
      classifyText: (args) => classify(args.TEXT)?.label ?? "",
      isTextClass: (args) => {
        const wanted = Cast.toString(args.CLASS);
        return wanted !== "" && classify(args.TEXT)?.label === wanted;
      },
      textConfidence: (args) => round2((classify(args.TEXT)?.scores[Cast.toString(args.CLASS)] ?? 0) * 100),
      speak: async (args) => {
        const lang = runtime.getTargetForStage()?.textToSpeechLanguage ?? DEFAULT_SPEECH_LANGUAGE;
        await services().tts.speak(Cast.toString(args.TEXT), lang);
      },
      setSpeechLanguage: (args) => {
        const stage = runtime.getTargetForStage();
        if (stage) stage.textToSpeechLanguage = parseLanguage(args.LANGUAGE);
      },
    }),
    getDynamicMenus: () => ({
      getClassMenu: () => classMenuItems(model().labels()),
    }),
    dispose: () => {
      offProject();
      if (held) getAiServices(runtime).release(AITEXT_ID);
      held = false;
    },
  };
};
