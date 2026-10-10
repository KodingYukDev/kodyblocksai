/**
 * Tata letak palet vertikal (VerticalFlyout.layout_ scratch-blocks): margin 12, checkbox 25 + 12,
 * tombol/label tinggi 40, posisi kategori untuk scroll-ke-kategori dan sorot kategori saat scroll
 * (recordCategoryScrollPositions_, selectCategoryByScrollPosition, scrollTo dengan animasi 0.3).
 */
import { layoutStack, type LayoutDeps, type StackLayout } from "../workspace/layout";
import type { FlyoutContent, FlyoutItem } from "./content";

export const FLYOUT_MARGIN = 12;
export const CHECKBOX_SIZE = 25;
export const CHECKBOX_MARGIN = FLYOUT_MARGIN;
export const BUTTON_HEIGHT = 40;
export const FLYOUT_WIDTH = 250;
/** Skala palet tetap (startScale scratch-gui). */
export const FLYOUT_SCALE = 0.675;
export const SCROLL_ANIMATION_FRACTION = 0.3;

export interface PlacedFlyoutItem {
  item: FlyoutItem;
  x: number;
  y: number;
  width: number;
  height: number;
  stack?: StackLayout;
  /** Posisi checkbox (unit workspace palet). */
  checkbox?: { x: number; y: number };
}

export interface FlyoutLayout {
  placed: PlacedFlyoutItem[];
  /** Posisi y (unit palet) label tiap kategori. */
  categoryPositions: { categoryId: string; position: number }[];
  contentHeight: number;
}

export function layoutFlyout(content: FlyoutContent, deps: LayoutDeps, measureLabel: (t: string) => number): FlyoutLayout {
  const placed: PlacedFlyoutItem[] = [];
  const categoryPositions: { categoryId: string; position: number }[] = [];
  let cursorY = FLYOUT_MARGIN;
  for (const item of content.items) {
    if (item.kind === "block") {
      const stack = layoutStack(deps, item.rootId);
      let x = FLYOUT_MARGIN;
      let checkbox: { x: number; y: number } | undefined;
      if (item.checkbox) {
        checkbox = { x: FLYOUT_MARGIN, y: cursorY + (stack.height - CHECKBOX_SIZE) / 2 };
        x += CHECKBOX_SIZE + CHECKBOX_MARGIN;
      }
      placed.push({ item, x, y: cursorY, width: stack.width, height: stack.height, stack, checkbox });
      cursorY += stack.height + item.gap;
    } else {
      if (item.kind === "label") categoryPositions.push({ categoryId: item.categoryId, position: cursorY });
      const width = measureLabel(item.text) + (item.kind === "button" ? 80 : 0);
      placed.push({ item, x: FLYOUT_MARGIN, y: cursorY, width, height: BUTTON_HEIGHT });
      cursorY += BUTTON_HEIGHT + item.gap;
    }
  }
  return { placed, categoryPositions, contentHeight: cursorY };
}

/** Tinggi total yang bisa di-scroll (piksel), ditambah padding agar kategori terakhir bisa di puncak. */
export function scrollableHeight(layout: FlyoutLayout, viewHeight: number, scale = FLYOUT_SCALE): number {
  const contentHeight = layout.contentHeight * scale;
  let bottomPadding = FLYOUT_MARGIN;
  const last = layout.categoryPositions[layout.categoryPositions.length - 1];
  if (last) {
    const lastCategoryHeight = contentHeight - last.position * scale;
    if (lastCategoryHeight < viewHeight) bottomPadding = viewHeight - lastCategoryHeight;
  }
  return contentHeight + bottomPadding;
}

/** Target scroll (piksel) untuk kategori; dibatasi agar tidak melewati dasar konten. */
export function scrollTargetForCategory(layout: FlyoutLayout, categoryId: string, viewHeight: number, scale = FLYOUT_SCALE): number | null {
  const hit = layout.categoryPositions.find((c) => c.categoryId === categoryId);
  if (!hit) return null;
  return Math.max(0, Math.min(hit.position * scale, scrollableHeight(layout, viewHeight, scale) - viewHeight));
}

/** Kategori yang disorot untuk posisi scroll (piksel). */
export function categoryAtScroll(layout: FlyoutLayout, scrollPx: number, scale = FLYOUT_SCALE): string | null {
  const pos = Math.round(scrollPx / scale);
  for (let i = layout.categoryPositions.length - 1; i >= 0; i--) {
    const c = layout.categoryPositions[i];
    if (c && pos >= c.position) return c.categoryId;
  }
  return layout.categoryPositions[0]?.categoryId ?? null;
}

/** Satu langkah animasi scroll (stepScrollAnimation); null = selesai di target. */
export function stepScroll(current: number, target: number): number | null {
  const diff = target - current;
  if (Math.abs(diff) < 1) return null;
  return current + diff * SCROLL_ANIMATION_FRACTION;
}
