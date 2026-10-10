/**
 * Daftar gambar (draw list) dengan grup layer, urutan bawah -> atas.
 * Port logika layer scratch-render 1.2.115 `RenderWebGL.js` (setLayerGroupOrdering, _addToDrawList,
 * _updateOffsets, _endIndexForKnownLayerGroup, destroyDrawable, setDrawableOrder) - BSD-3-Clause.
 */

interface LayerGroup {
  groupIndex: number;
  drawListOffset: number;
}

export class LayerList {
  /** Id drawable, indeks 0 = paling belakang. */
  readonly drawList: number[] = [];
  private groupOrdering: string[] = [];
  private readonly groups = new Map<string, LayerGroup>();

  setLayerGroupOrdering(ordering: readonly string[]): void {
    this.groupOrdering = ordering.slice();
    for (let i = 0; i < this.groupOrdering.length; i++) {
      this.groups.set(this.groupOrdering[i] as string, { groupIndex: i, drawListOffset: 0 });
    }
  }

  hasGroup(group: string | undefined): group is string {
    return group !== undefined && this.groups.has(group);
  }

  private endIndexFor(layer: LayerGroup): number {
    if (layer.groupIndex === this.groupOrdering.length - 1) return this.drawList.length;
    const next = this.groups.get(this.groupOrdering[layer.groupIndex + 1] as string) as LayerGroup;
    return next.drawListOffset;
  }

  private updateOffsets(kind: "add" | "delete", groupIndex: number): void {
    for (let i = groupIndex + 1; i < this.groupOrdering.length; i++) {
      const g = this.groups.get(this.groupOrdering[i] as string) as LayerGroup;
      g.drawListOffset += kind === "add" ? 1 : -1;
    }
  }

  /** Tambah di paling depan grupnya. */
  add(id: number, group: string): boolean {
    const layer = this.groups.get(group);
    if (!layer) return false;
    this.drawList.splice(this.endIndexFor(layer), 0, id);
    this.updateOffsets("add", layer.groupIndex);
    return true;
  }

  remove(id: number, group: string): boolean {
    const layer = this.groups.get(group);
    if (!layer) return false;
    const end = this.endIndexFor(layer);
    let index = layer.drawListOffset;
    while (index < end) {
      if (this.drawList[index] === id) break;
      index++;
    }
    if (index >= end) return false;
    this.drawList.splice(index, 1);
    this.updateOffsets("delete", layer.groupIndex);
    return true;
  }

  indexOf(id: number): number {
    return this.drawList.indexOf(id);
  }

  /** setDrawableOrder scratch-render: indeks baru (global di draw list), atau null. */
  setOrder(id: number, order: number, group: string, isRelative?: boolean, optMin?: number): number | null | undefined {
    const layer = this.groups.get(group);
    if (!layer) return undefined;
    const startIndex = layer.drawListOffset;
    const endIndex = this.endIndexFor(layer);
    let oldIndex = startIndex;
    while (oldIndex < endIndex) {
      if (this.drawList[oldIndex] === id) break;
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
    this.drawList.splice(newIndex, 0, id);
    return newIndex;
  }
}
