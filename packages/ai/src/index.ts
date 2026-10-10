/** @kody/ai - ekstensi AI (visi, teks, suara) yang berjalan lokal di browser. Kontrak: docs/CONTRACTS.md, docs/AI-SAFETY.md. */
export * from "./types";
export { AI_LIMITS, MODEL_BASE_PATH, clampTextInput, isAllowedModelUrl, sanitizeLabel, validateTrainedClassifier } from "./security";
export { AI_COLOURS } from "./colours";
export { AI_EXTENSIONS, AI_EXTRA_OPCODES } from "./catalog";
export { createVideoProvider } from "./video-provider";
export { CameraController } from "./devices/camera";
export type { CameraDeps } from "./devices/camera";
export { AiServices, configureAiServices, getAiServices, peekAiServices } from "./services";
export type { AiServiceEventMap, AiServicesOptions, ResetReason, VisibilitySource } from "./services";
export { MODEL_MANIFEST, ModelIntegrityError, createVerifiedFetcher } from "./models/verified-fetch";
export { TRAINED_STATE_KEYS } from "./classifier/storage";
export { CameraIndicator, useActiveDevices } from "./ui/CameraIndicator";
export type { CameraIndicatorProps } from "./ui/CameraIndicator";

/** AI Lab (React) dimuat lazy supaya tfjs/mediapipe tidak masuk bundle utama. */
export const loadAiLab = (): Promise<typeof import("./lab/AiLab")> => import("./lab/AiLab");
