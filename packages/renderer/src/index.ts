/** @kody/renderer - panggung WebGL/Canvas2D, skin costume, efek, pena, tabrakan. Kontrak: docs/CONTRACTS.md. */
export * from "./types";
export { createRenderer, isWebGLSupported } from "./webgl-renderer";
export { KodyRenderer } from "./renderer-core";
export type { RendererCoreOptions, RenderStats } from "./renderer-core";
export { Drawable, getLocalPosition } from "./drawable";
export { Rectangle } from "./rectangle";
export { EFFECT_INFO, EFFECTS, effectToUniform } from "./effect-info";
export { transformColor, transformPoint } from "./effect-transform";
export { colorMatches, maskMatches } from "./collision";
export { computeStageSize } from "./stage-size";
export type { StageDisplaySize, StageSizeMode } from "./stage-size";
export { registerSvgFonts, sanitizeCss, isSafeHref } from "./skins/svg-loader";
export { createPixelData } from "./pixel-source";
export { BubbleStyle } from "./skins/text-bubble-skin";
