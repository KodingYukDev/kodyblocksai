/**
 * Renderer palsu untuk tes engine: drawable = persegi panjang sejajar sumbu (skin w x h, skala size%).
 * Urutan layer & fencing mengikuti algoritma scratch-render 1.2.115 (RenderWebGL.setDrawableOrder,
 * getFencedPositionOfDrawable; BSD-3-Clause). Tidak dipakai kode produksi.
 */
import { LAYER_GROUPS, type DrawableGroup, type GraphicEffect, type IRenderer, type Rect, type RGB, type RGBA } from "../types/renderer";

interface FakeDrawable {
  id: number;
  group: DrawableGroup;
  skinId: number;
  position: [number, number];
  direction: number;
  scale: [number, number];
  visible: boolean;
  effects: Partial<Record<GraphicEffect, number>>;
}

const FENCE_WIDTH = 15;

export class FakeRenderer implements IRenderer {
  readonly drawables = new Map<number, FakeDrawable>();
  readonly skins = new Map<number, [number, number]>();
  drawList: number[] = [];
  groupOrdering: readonly DrawableGroup[] = LAYER_GROUPS;
  drawCount = 0;
  private nextDrawable = 0;
  private nextSkin = 1;

  /** Skin dengan ukuran tertentu (untuk costume tes). */
  addSkin(w: number, h: number): number {
    const id = this.nextSkin++;
    this.skins.set(id, [w, h]);
    return id;
  }

  getNativeSize(): [number, number] {
    return [480, 360];
  }
  resize(): void {}
  setLayerGroupOrdering(groups: readonly DrawableGroup[]): void {
    this.groupOrdering = groups;
  }
  draw(): void {
    this.drawCount++;
  }
  createBitmapSkin(): number {
    return this.addSkin(2, 2);
  }
  createSVGSkin(): number {
    return this.addSkin(2, 2);
  }
  updateBitmapSkin(): void {}
  updateSVGSkin(): void {}
  createTextSkin(): number {
    return this.addSkin(10, 10);
  }
  updateTextSkin(): void {}
  createPenSkin(): number {
    return this.addSkin(480, 360);
  }
  destroySkin(skinId: number): void {
    this.skins.delete(skinId);
  }
  getSkinSize(skinId: number): [number, number] {
    return this.skins.get(skinId) ?? [0, 0];
  }
  getSkinRotationCenter(skinId: number): [number, number] {
    const [w, h] = this.getSkinSize(skinId);
    return [w / 2, h / 2];
  }

  private groupRange(group: DrawableGroup): [number, number] {
    let start = 0;
    for (const g of this.groupOrdering) {
      const count = this.drawList.filter((id) => this.drawables.get(id)?.group === g).length;
      if (g === group) return [start, start + count];
      start += count;
    }
    return [start, start];
  }

  createDrawable(group: DrawableGroup): number {
    const id = this.nextDrawable++;
    this.drawables.set(id, {
      id,
      group,
      skinId: -1,
      position: [0, 0],
      direction: 90,
      scale: [100, 100],
      visible: true,
      effects: {},
    });
    const [, end] = this.groupRange(group);
    this.drawList.splice(end, 0, id);
    return id;
  }

  destroyDrawable(drawableId: number): void {
    this.drawables.delete(drawableId);
    this.drawList = this.drawList.filter((id) => id !== drawableId);
  }

  setDrawableOrder(drawableId: number, order: number, group: DrawableGroup, isRelative?: boolean, optMin?: number): number | null {
    const [startIndex, endIndex] = this.groupRange(group);
    let oldIndex = startIndex;
    while (oldIndex < endIndex) {
      if (this.drawList[oldIndex] === drawableId) break;
      oldIndex++;
    }
    if (oldIndex >= endIndex) return null;
    if (order === 0) return oldIndex;
    this.drawList.splice(oldIndex, 1);
    let newIndex = order;
    if (isRelative) newIndex += oldIndex;
    const possibleMin = (optMin || 0) + startIndex;
    const min = possibleMin >= startIndex && possibleMin < endIndex ? possibleMin : startIndex;
    newIndex = Math.max(newIndex, min);
    newIndex = Math.min(newIndex, endIndex);
    this.drawList.splice(newIndex, 0, drawableId);
    return newIndex;
  }

  getDrawableOrder(drawableId: number): number {
    return this.drawList.indexOf(drawableId);
  }

  private d(id: number): FakeDrawable | undefined {
    return this.drawables.get(id);
  }
  updateDrawableSkinId(drawableId: number, skinId: number): void {
    const d = this.d(drawableId);
    if (d) d.skinId = skinId;
  }
  updateDrawablePosition(drawableId: number, position: [number, number]): void {
    const d = this.d(drawableId);
    if (d) d.position = [position[0], position[1]];
  }
  updateDrawableDirectionScale(drawableId: number, direction: number, scale: [number, number]): void {
    const d = this.d(drawableId);
    if (d) {
      d.direction = direction;
      d.scale = [scale[0], scale[1]];
    }
  }
  updateDrawableVisible(drawableId: number, visible: boolean): void {
    const d = this.d(drawableId);
    if (d) d.visible = visible;
  }
  updateDrawableEffect(drawableId: number, effect: GraphicEffect, value: number): void {
    const d = this.d(drawableId);
    if (d) d.effects[effect] = value;
  }
  updateDrawableProperties(): void {}

  getBounds(drawableId: number): Rect | null {
    const d = this.d(drawableId);
    if (!d) return null;
    const [w, h] = this.getSkinSize(d.skinId);
    const sw = (w * Math.abs(d.scale[0])) / 100;
    const sh = (h * Math.abs(d.scale[1])) / 100;
    return {
      left: d.position[0] - sw / 2,
      right: d.position[0] + sw / 2,
      top: d.position[1] + sh / 2,
      bottom: d.position[1] - sh / 2,
    };
  }
  getBoundsForBubble(drawableId: number): Rect | null {
    return this.getBounds(drawableId);
  }
  getAABB(drawableId: number): Rect | null {
    return this.getBounds(drawableId);
  }
  getCurrentSkinSize(drawableId: number): [number, number] {
    const d = this.d(drawableId);
    return d ? this.getSkinSize(d.skinId) : [0, 0];
  }

  getFencedPositionOfDrawable(drawableId: number, position: [number, number]): [number, number] {
    let [x, y] = position;
    const d = this.d(drawableId);
    const aabb = this.getBounds(drawableId);
    if (!d || !aabb) return [x, y];
    const dx = x - d.position[0];
    const dy = y - d.position[1];
    const width = aabb.right - aabb.left;
    const height = aabb.top - aabb.bottom;
    const inset = Math.floor(Math.min(width, height) / 2);
    const sx = 240 - Math.min(FENCE_WIDTH, inset);
    if (aabb.right + dx < -sx) x = Math.ceil(d.position[0] - (sx + aabb.right));
    else if (aabb.left + dx > sx) x = Math.floor(d.position[0] + (sx - aabb.left));
    const sy = 180 - Math.min(FENCE_WIDTH, inset);
    if (aabb.top + dy < -sy) y = Math.ceil(d.position[1] - (sy + aabb.top));
    else if (aabb.bottom + dy > sy) y = Math.floor(d.position[1] + (sy - aabb.bottom));
    return [x, y];
  }

  private overlaps(a: Rect, b: Rect): boolean {
    return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
  }
  isTouchingDrawables(drawableId: number, candidateIds: readonly number[] = []): boolean {
    const a = this.getBounds(drawableId);
    if (!a) return false;
    return candidateIds.some((id) => {
      const other = this.d(id);
      const b = this.getBounds(id);
      return id !== drawableId && other?.visible === true && b !== null && this.overlaps(a, b);
    });
  }
  isTouchingColor(_drawableId: number, _color: RGB): boolean {
    return false;
  }
  isTouchingPoint(drawableId: number, stageX: number, stageY: number): boolean {
    const b = this.getBounds(drawableId);
    return b !== null && stageX >= b.left && stageX <= b.right && stageY >= b.bottom && stageY <= b.top;
  }
  pick(stageX: number, stageY: number): number {
    for (let i = this.drawList.length - 1; i >= 0; i--) {
      const id = this.drawList[i];
      if (id === undefined) continue;
      const d = this.d(id);
      if (d?.visible && d.group === "sprite" && this.isTouchingPoint(id, stageX, stageY)) return id;
    }
    return -1;
  }
  sampleColor(): RGBA {
    return [255, 255, 255, 255];
  }
  penClear(): void {}
  penPoint(): void {}
  penLine(): void {}
  penStamp(): void {}
}
