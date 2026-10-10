/**
 * API renderer blok: RenderBlock -> layout -> SVG. Semua fungsi murni (tanpa DOM), dapat dites.
 */
import type { BlockLocale } from "../blocks/messages";
import { getDefaultRegistry, type BlockRegistry } from "../blocks/registry";
import { instantiate, type BlockInstance } from "./instantiate";
import { layoutBlock, type BlockLayout } from "./layout";
import type { RenderBlock } from "./model";
import { renderLayoutToSvg, stackBounds, type SvgOptions } from "./svg";
import { helveticaMeasurer, type TextMeasurer } from "./text-measure";

export interface RenderOptions {
  registry?: BlockRegistry;
  locale?: BlockLocale;
  measurer?: TextMeasurer;
}

export function instantiateBlock(rb: RenderBlock, opts: RenderOptions = {}): BlockInstance {
  return instantiate(rb, { registry: opts.registry ?? getDefaultRegistry(), locale: opts.locale ?? "id" });
}

/** Layout lengkap (ukuran, path, posisi field & anak) untuk satu tumpukan. */
export function layoutRenderBlock(rb: RenderBlock, opts: RenderOptions = {}): BlockLayout {
  return layoutBlock(instantiateBlock(rb, opts), opts.measurer ?? helveticaMeasurer);
}

export interface RenderedSvg {
  svg: string;
  layout: BlockLayout;
  /** Kotak pembatas dalam koordinat blok (y negatif = lengkung topi). */
  bounds: { x: number; y: number; width: number; height: number };
}

/** Render satu tumpukan menjadi dokumen SVG mandiri. */
export function renderBlockToSvg(rb: RenderBlock, opts: RenderOptions & SvgOptions & { scale?: number } = {}): RenderedSvg {
  const layout = layoutRenderBlock(rb, opts);
  return { svg: renderLayoutToSvg(layout, opts), layout, bounds: stackBounds(layout) };
}

export { layoutBlock } from "./layout";
export type { BlockLayout, ChildPlacement, PlacedField, PlacedInputShape } from "./layout";
export { instantiate } from "./instantiate";
export type { BlockInstance, InputInstance, BlockColours } from "./instantiate";
export { renderBlockGroup, renderLayoutToSvg, glowFilterDefs, stackBounds, blockPaint, safeImageHref } from "./svg";
export type { SvgOptions } from "./svg";
export { fromProjectBlocks } from "./model";
export type { RenderBlock, RenderField } from "./model";
export { helveticaMeasurer, createCanvasMeasurer } from "./text-measure";
export type { TextMeasurer } from "./text-measure";
export { BLOCK_METRICS, GRID_UNIT, PATHS, BLOCK_FONT, WORKSPACE_START_SCALE, SHAPE_IN_SHAPE_PADDING } from "./metrics";
