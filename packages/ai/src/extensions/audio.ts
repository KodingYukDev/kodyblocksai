/**
 * Ekstensi Suara (aiAudio):
 * - klasifikasi suara dari AI Lab (fitur pita frekuensi + KNN), sepenuhnya lokal;
 * - pengenalan ucapan (Web Speech API): on-device bila tersedia, selain itu butuh izin internet.
 * Mikrofon hanya menyala setelah blok "mulai dengarkan"/"dengarkan ucapan" dijalankan,
 * dan mati saat stop / tab disembunyikan / "berhenti dengarkan".
 * Opcode: AI_OPCODES dengan owner "packages/ai/src/extensions/audio.ts" di @kody/engine
 * (+ recognizeSpeech / speechText: belum ada di katalog, lihat AI_EXTRA_OPCODES).
 * Pemilik: agent ai.
 */
import { Cast } from "@kody/engine";
import type { ExtensionFactory, ExtensionInfo, ExtensionModule, IRuntime } from "@kody/engine";
import { SILENCE_LEVEL } from "../classifier/audio-features";
import { TrainedModelCache } from "../classifier/storage";
import { AI_COLOURS } from "../colours";
import { AudioListener } from "../devices/audio-listener";
import { getAiServices } from "../services";
import type { AiServices } from "../services";
import { DEFAULT_SPEECH_LANGUAGE, parseLanguage } from "../speech/language";
import { TTS_LANGUAGES } from "../speech/tts";
import type { ClassificationResult } from "../types";
import { classMenuItems } from "./class-menu";

export const AIAUDIO_ID = "aiAudio";
/** Jumlah frame minimum di jendela sebelum diklasifikasi. */
const MIN_FRAMES = 5;

export function getAiAudioInfo(): ExtensionInfo {
  return {
    id: AIAUDIO_ID,
    name: "Suara AI",
    ...AI_COLOURS,
    blocks: [
      { opcode: "startListening", blockType: "command", text: "mulai dengarkan suara" },
      { opcode: "stopListening", blockType: "command", text: "berhenti dengarkan suara" },
      { opcode: "soundClass", blockType: "reporter", text: "kelas suara" },
      {
        opcode: "isSoundClass",
        blockType: "Boolean",
        text: "suara adalah [CLASS]?",
        arguments: { CLASS: { type: "string", menu: "CLASS" } },
      },
      {
        opcode: "whenSoundClass",
        blockType: "hat",
        text: "ketika terdengar [CLASS]",
        isEdgeActivated: true,
        arguments: { CLASS: { type: "string", menu: "CLASS" } },
      },
      "---",
      {
        opcode: "recognizeSpeech",
        blockType: "command",
        text: "dengarkan ucapan bahasa [LANGUAGE]",
        arguments: { LANGUAGE: { type: "string", menu: "LANGUAGE", defaultValue: DEFAULT_SPEECH_LANGUAGE } },
      },
      { opcode: "speechText", blockType: "reporter", text: "hasil ucapan" },
    ],
    menus: {
      CLASS: { acceptReporters: true, items: "getClassMenu" },
      LANGUAGE: { acceptReporters: true, items: TTS_LANGUAGES.map(([value, text]) => ({ text, value })) },
    },
  };
}

export const createAiAudioExtension: ExtensionFactory = (runtime: IRuntime): ExtensionModule => {
  let cache: TrainedModelCache<"audio"> | null = null;
  let warnedNoModel = false;
  let result: ClassificationResult | null = null;
  let speechText = "";
  let state: { services: AiServices; listener: AudioListener; offReset: () => void } | null = null;

  const model = (): TrainedModelCache<"audio"> =>
    (cache ??= new TrainedModelCache(runtime, "audio", (message) =>
      getAiServices(runtime).notice({ level: "error", code: "audio-model-invalid", message }),
    ));

  const classifyWindow = (listener: AudioListener): void => {
    if (listener.window.size < MIN_FRAMES) return;
    if (listener.window.level() < SILENCE_LEVEL) {
      result = null;
      return;
    }
    const clf = model().get();
    const features = listener.window.features();
    result = clf && clf.isTrained() && features ? clf.predict(features) : null;
  };

  const init = (): NonNullable<typeof state> => {
    if (state && !state.services.isDisposed) return state;
    const services = getAiServices(runtime);
    services.hold(AIAUDIO_ID);
    const listener = new AudioListener(services.microphone, classifyWindow);
    const offReset = services.events.on("reset", () => {
      listener.stop();
      result = null;
    });
    state = { services, listener, offReset };
    return state;
  };

  const isClass = (label: unknown): boolean => {
    const wanted = Cast.toString(label);
    return result !== null && wanted !== "" && result.label === wanted;
  };

  return {
    getInfo: getAiAudioInfo,
    getPrimitives: () => ({
      startListening: async () => {
        const { services, listener } = init();
        const clf = model().get();
        if ((!clf || !clf.isTrained()) && !warnedNoModel) {
          warnedNoModel = true;
          services.notice({ level: "info", code: "audio-no-model", message: "Belum ada model suara. Latih dulu di AI Lab (minimal 2 kelas)." });
        }
        if (await services.ensureMicrophone(AIAUDIO_ID)) listener.start();
      },
      stopListening: () => {
        if (!state) return;
        state.listener.stop();
        state.services.microphone.stop();
        result = null;
      },
      soundClass: () => result?.label ?? "",
      isSoundClass: (args) => isClass(args.CLASS),
      whenSoundClass: (args) => isClass(args.CLASS),
      recognizeSpeech: async (args) => {
        const { services } = init();
        speechText = await services.speech.recognizeOnce(parseLanguage(args.LANGUAGE));
      },
      speechText: () => speechText,
    }),
    getDynamicMenus: () => ({
      getClassMenu: () => classMenuItems(model().labels()),
    }),
    dispose: () => {
      if (!state) return;
      const s = state;
      state = null;
      s.listener.stop();
      s.offReset();
      s.services.release(AIAUDIO_ID);
    },
  };
};
