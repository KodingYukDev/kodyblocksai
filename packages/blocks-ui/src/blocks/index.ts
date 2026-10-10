/** Definisi visual semua blok (core scratch-blocks + ekstensi via ExtensionInfo) dan pesan bahasa. */
export { BlockRegistry, getDefaultRegistry } from "./registry";
export { convertExtension, convertMenuItems, extensionMenuId, LOOP_ICON_SRC } from "./extension-json";
export type { ConvertedExtension, DynamicMenuResolver } from "./extension-json";
export { blockDefinitions, toBlockDefinition } from "./definitions";
export { getMessages, msg, resolveMessage, tokenizeInterpolation } from "./messages";
export type { BlockLocale } from "./messages";
export { OUTPUT_SHAPE_HEXAGONAL, OUTPUT_SHAPE_ROUND, OUTPUT_SHAPE_SQUARE, jsonLine } from "./json-types";
export type { OutputShape, ScratchArgJson, ScratchBlockJson, DropdownOptions } from "./json-types";
export { BLOCK_OVERRIDES } from "./overrides";
export { BLOCK_MEDIA } from "./generated/media";
