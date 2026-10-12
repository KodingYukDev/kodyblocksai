/** @kody/project - format project, .sb3, autosave. Kontrak: docs/CONTRACTS.md. */
export * from "./types";
export { SB3_PRIMITIVE } from "./sb3-types";
export { deserializeProject, deserializeProjectWithReport, convertValidatedProject } from "./deserialize";
export type { DeserializeHooks, DeserializeResult } from "./deserialize";
export { serializeProject, serializeSprite, stringifyProject, KODY_VM_VERSION } from "./serialize";
export type { SerializeOptions } from "./serialize";
export { validateProjectJson } from "./validate";
export type { ValidateOptions, ValidationResult } from "./validate";
export { formatIssue } from "./report";
export {
  CORE_EXTENSIONS,
  SUPPORTED_EXTENSIONS,
  getExtensionIdForOpcode,
  isKnownOpcode,
  describeUnknownOpcode,
} from "./opcode-check";
export { createAssetStore, addAsset, referencedAssets, MemoryAssetStore } from "./asset-store";
export type { StoredAsset } from "./asset-store";
export { md5Hex, md5String } from "./md5";
export { readImageSize } from "./image-size";
export type { ImageSize } from "./image-size";
export { loadSb3, saveSb3, saveSb3WithReport, parseProjectJsonText } from "./sb3-file";
export type { SaveSb3Result } from "./sb3-file";
export { loadSprite3, saveSprite3, isSprite3Name } from "./sprite3";
export type { LoadedSprite } from "./sprite3";
export { createAutosaveStore, createAutosaveStoreWithBackend, createAutosaver } from "./autosave";
export type {
  AutosaveEntry,
  AutosaveStore,
  AutosaveStoreOptions,
  LoadedDraft,
  SaveDraftOptions,
  Autosaver,
  AutosaverOptions,
  AutosaveSnapshot,
} from "./autosave";
export { createMemoryBackend, createIdbBackend, AUTOSAVE_SCHEMA } from "./autosave-backend";
export type { AutosaveBackend, ProjectRecord, VersionRecord, VersionMeta, SaveReason } from "./autosave-backend";
export { createDefaultProject, WHITE_BACKDROP_SVG } from "./default-project";
export type { DefaultProjectOptions } from "./default-project";
