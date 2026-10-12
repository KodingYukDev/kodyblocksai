/** @kody/ai - ekstensi AI (visi, teks, suara) yang berjalan lokal di browser. Kontrak: docs/CONTRACTS.md, docs/AI-SAFETY.md. */
export * from "./types";
export {
  AI_LIMITS,
  MODEL_BASE_PATH,
  TRAINED_KINDS,
  clampTextInput,
  isAllowedModelUrl,
  sanitizeLabel,
  validateTrainedClassifier,
} from "./security";
export { AI_COLOURS } from "./colours";
export { AI_EXTENSIONS, AI_EXTRA_OPCODES } from "./catalog";
export { createVideoProvider } from "./video-provider";
export { CameraController } from "./devices/camera";
export type { CameraDeps } from "./devices/camera";
export { AiServices, configureAiServices, getAiServices, peekAiServices } from "./services";
export type { AiServiceEventMap, AiServicesOptions, ResetReason, VisibilitySource } from "./services";
export { MODEL_MANIFEST, ModelIntegrityError, createVerifiedFetcher } from "./models/verified-fetch";
export {
  MODEL_FILE_EXTENSION,
  TRAINED_STATE_KEYS,
  notifyTrainedModelChanged,
  parseModelFile,
  serializeModelFile,
} from "./classifier/storage";
export { isSpeechRecognitionSupported, SPEECH_UNSUPPORTED_MESSAGE } from "./speech/speech-recognition";
export { CameraIndicator, useActiveDevices } from "./ui/CameraIndicator";
export type { CameraIndicatorProps } from "./ui/CameraIndicator";
export { AiConsentDialog, aiNetworkConsent, createNetworkConsent } from "./ui/NetworkConsent";
export type { AiConsentDialogProps, ConsentRequest, NetworkConsentController } from "./ui/NetworkConsent";

/** AI Lab (React) dimuat lazy supaya tfjs/mediapipe tidak masuk bundle utama. */
export const loadAiLab = (): Promise<typeof import("./lab/AiLab")> => import("./lab/AiLab");

/**
 * Contoh project AI + kartu tutorial (lazy). Pemakaian di app:
 *   const ex = await loadAiExamples();
 *   ex.AI_EXAMPLES              // kartu: title, summary, concept, steps, labTab, trainClasses
 *   const bytes = await ex.buildAiExampleSb3(id, { kodySvg });  // buka lewat alur .sb3 biasa
 */
export const loadAiExamples = (): Promise<typeof import("./examples/ai-examples")> => import("./examples/ai-examples");
export type { AiExample, BuildExampleOptions } from "./examples/ai-examples";
