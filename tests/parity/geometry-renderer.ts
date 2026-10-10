/**
 * Renderer geometri headless untuk tes parity. Skin dianggap persegi panjang penuh (tanpa piksel
 * transparan), sehingga bounds = AABB persegi panjang ter-rotasi. Engine kita dan scratch-vm
 * dipasangi geometri YANG SAMA, jadi perbedaan trace hanya berasal dari logika VM.
 * Ketepatan renderer sungguhan (convex hull, tabrakan piksel) diuji terpisah oleh agent renderer.
 *
 * Fencing: port getFencedPositionOfDrawable scratch-render 1.2.115 (BSD-3, lihat THIRD_PARTY.md).
 */

export interface GeoRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface GeoSkin {
  size: [number, number];
  rotationCenter: [number, number];
}

interface GeoDrawable {
  id: number;
  group: string;
  skinId: number;
  position: [number, number];
  direction: number;
  scale: [number, number];
  visible: boolean;
}

/** Ukuran skin default ketika asset tidak dimuat (oracle berjalan tanpa storage). */
export const DEFAULT_SKIN: GeoSkin = { size: [96, 100], rotationCenter: [48, 50] };
const FENCE_WIDTH = 15;

export class GeometryWorld {
  readonly xRight = 240;
  readonly yTop = 180;
  private nextId = 1;
  readonly skins = new Map<number, GeoSkin>();
  readonly drawables = new Map<number, GeoDrawable>();
  /** Urutan per grup (bawah -> atas). */
  readonly order = new Map<string, number[]>();
  groupOrdering: string[] = ["background", "video", "pen", "sprite"];

  createSkin(size: [number, number], rotationCenter: [number, number]): number {
    const id = this.nextId++;
    this.skins.set(id, { size, rotationCenter });
    return id;
  }

  createDrawable(group: string): number {
    const id = this.nextId++;
    this.drawables.set(id, { id, group, skinId: -1, position: [0, 0], direction: 90, scale: [100, 100], visible: true });
    const list = this.order.get(group) ?? [];
    list.push(id);
    this.order.set(group, list);
    return id;
  }

  destroyDrawable(id: number): void {
    const d = this.drawables.get(id);
    if (!d) return;
    this.drawables.delete(id);
    const list = this.order.get(d.group);
    if (list) list.splice(list.indexOf(id), 1);
  }

  skinOf(d: GeoDrawable): GeoSkin {
    return this.skins.get(d.skinId) ?? DEFAULT_SKIN;
  }

  /** AABB persegi panjang skin setelah skala + rotasi (arah Scratch: 90 = tanpa rotasi). */
  getAABB(id: number): GeoRect | null {
    const d = this.drawables.get(id);
    if (!d) return null;
    const skin = this.skinOf(d);
    const sx = d.scale[0] / 100;
    const sy = d.scale[1] / 100;
    const [w, h] = skin.size;
    const [cx, cy] = skin.rotationCenter;
    // sudut sumbu: Scratch direction 90 = 0 rad
    const rad = ((90 - d.direction) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const corners: [number, number][] = [
      [-cx, cy],
      [w - cx, cy],
      [w - cx, cy - h],
      [-cx, cy - h],
    ];
    let left = Infinity;
    let right = -Infinity;
    let top = -Infinity;
    let bottom = Infinity;
    for (const [px0, py0] of corners) {
      const px = px0 * sx;
      const py = py0 * sy;
      const x = px * cos - py * sin + d.position[0];
      const y = px * sin + py * cos + d.position[1];
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.max(top, y);
      bottom = Math.min(bottom, y);
    }
    return { left, right, top, bottom };
  }

  getFencedPosition(id: number, position: [number, number]): [number, number] {
    let x = position[0];
    let y = position[1];
    const d = this.drawables.get(id);
    const aabb = this.getAABB(id);
    if (!d || !aabb) return [x, y];
    const dx = x - d.position[0];
    const dy = y - d.position[1];
    const width = aabb.right - aabb.left;
    const height = aabb.top - aabb.bottom;
    const inset = Math.floor(Math.min(width, height) / 2);
    const sx = this.xRight - Math.min(FENCE_WIDTH, inset);
    if (aabb.right + dx < -sx) {
      x = Math.ceil(d.position[0] - (sx + aabb.right));
    } else if (aabb.left + dx > sx) {
      x = Math.floor(d.position[0] + (sx - aabb.left));
    }
    const sy = this.yTop - Math.min(FENCE_WIDTH, inset);
    if (aabb.top + dy < -sy) {
      y = Math.ceil(d.position[1] - (sy + aabb.top));
    } else if (aabb.bottom + dy > sy) {
      y = Math.floor(d.position[1] + (sy - aabb.bottom));
    }
    return [x, y];
  }

  /** setDrawableOrder seperti scratch-render (indeks dalam grup). */
  setDrawableOrder(id: number, order: number, group: string, isRelative = false, optMin = 0): number | null {
    const list = this.order.get(group);
    if (!list) return null;
    const oldIndex = list.indexOf(id);
    if (oldIndex < 0) return null;
    list.splice(oldIndex, 1);
    let newIndex = isRelative ? oldIndex + order : order;
    newIndex = Math.max(newIndex, optMin);
    newIndex = Math.min(newIndex, list.length);
    list.splice(newIndex, 0, id);
    return newIndex;
  }

  /** Semua drawable dari bawah ke atas (urutan grup, lalu urutan dalam grup). */
  drawList(): number[] {
    return this.groupOrdering.flatMap((g) => this.order.get(g) ?? []);
  }

  /** Titik (koordinat panggung) di dalam AABB drawable yang terlihat. */
  containsPoint(id: number, x: number, y: number): boolean {
    const d = this.drawables.get(id);
    const r = this.getAABB(id);
    if (!d || !r || !d.visible) return false;
    return x >= r.left && x <= r.right && y >= r.bottom && y <= r.top;
  }

  /** Drawable sprite/stage teratas yang terlihat di titik panggung, atau -1 (padanan pick). */
  pick(x: number, y: number, candidates?: readonly number[]): number {
    const list = this.drawList().filter((id) => !candidates || candidates.includes(id));
    for (let i = list.length - 1; i >= 0; i--) {
      const id = list[i];
      if (id !== undefined && this.containsPoint(id, x, y)) return id;
    }
    return -1;
  }

  /** Irisan AABB (luas positif) dengan salah satu kandidat yang terlihat. */
  isTouchingDrawables(id: number, candidates: readonly number[]): boolean {
    const a = this.getAABB(id);
    if (!a) return false;
    return candidates.some((cid) => {
      if (cid === id) return false;
      const c = this.drawables.get(cid);
      const b = this.getAABB(cid);
      if (!c || !b || !c.visible) return false;
      return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
    });
  }

  getDrawableOrder(id: number): number {
    let base = 0;
    for (const g of this.groupOrdering) {
      const list = this.order.get(g) ?? [];
      const i = list.indexOf(id);
      if (i >= 0) return base + i;
      base += list.length;
    }
    return -1;
  }
}

/**
 * Facade dengan nama method scratch-render, untuk vm.attachRenderer(). Method yang tidak dikenal
 * dicatat di `unknownCalls` dan mengembalikan undefined (agar tes tidak crash diam-diam).
 */
export function createScratchRenderFacade(world: GeometryWorld): { renderer: object; unknownCalls: Set<string> } {
  const unknownCalls = new Set<string>();
  const impl: Record<string, (...args: never[]) => unknown> = {
    setLayerGroupOrdering: (groups: string[]) => {
      world.groupOrdering = [...groups];
    },
    getNativeSize: () => [480, 360],
    draw: () => undefined,
    createDrawable: (group: string) => world.createDrawable(group),
    destroyDrawable: (id: number) => world.destroyDrawable(id),
    setDrawableOrder: (id: number, order: number, group: string, isRelative?: boolean, optMin?: number) =>
      world.setDrawableOrder(id, order, group, isRelative, optMin),
    getDrawableOrder: (id: number) => world.getDrawableOrder(id),
    updateDrawableSkinId: (id: number, skinId: number) => {
      const d = world.drawables.get(id);
      if (d) d.skinId = skinId;
    },
    updateDrawablePosition: (id: number, position: [number, number]) => {
      const d = world.drawables.get(id);
      if (d) d.position = [position[0], position[1]];
    },
    updateDrawableDirectionScale: (id: number, direction: number, scale: [number, number]) => {
      const d = world.drawables.get(id);
      if (d) {
        d.direction = direction;
        d.scale = [scale[0], scale[1]];
      }
    },
    updateDrawableVisible: (id: number, visible: boolean) => {
      const d = world.drawables.get(id);
      if (d) d.visible = visible;
    },
    updateDrawableEffect: () => undefined,
    updateDrawableProperties: (id: number, props: { position?: [number, number]; direction?: number; scale?: [number, number]; visible?: boolean; skinId?: number }) => {
      const d = world.drawables.get(id);
      if (!d) return;
      if (props.position) d.position = [props.position[0], props.position[1]];
      if (props.direction !== undefined) d.direction = props.direction;
      if (props.scale) d.scale = [props.scale[0], props.scale[1]];
      if (props.visible !== undefined) d.visible = props.visible;
      if (props.skinId !== undefined) d.skinId = props.skinId;
    },
    getFencedPositionOfDrawable: (id: number, position: [number, number]) => world.getFencedPosition(id, position),
    getBounds: (id: number) => world.getAABB(id),
    getBoundsForBubble: (id: number) => world.getAABB(id),
    getAABB: (id: number) => world.getAABB(id),
    getCurrentSkinSize: (id: number) => {
      const d = world.drawables.get(id);
      return d ? world.skinOf(d).size : [0, 0];
    },
    getSkinSize: (skinId: number) => (world.skins.get(skinId) ?? DEFAULT_SKIN).size,
    getSkinRotationCenter: (skinId: number) => (world.skins.get(skinId) ?? DEFAULT_SKIN).rotationCenter,
    createBitmapSkin: () => world.createSkin(DEFAULT_SKIN.size, DEFAULT_SKIN.rotationCenter),
    createSVGSkin: () => world.createSkin(DEFAULT_SKIN.size, DEFAULT_SKIN.rotationCenter),
    createTextSkin: () => world.createSkin([0, 0], [0, 0]),
    updateTextSkin: () => undefined,
    createPenSkin: () => world.createSkin([480, 360], [240, 180]),
    destroySkin: (skinId: number) => {
      world.skins.delete(skinId);
    },
    penClear: () => undefined,
    penPoint: () => undefined,
    penLine: () => undefined,
    penStamp: () => undefined,
    // scratch-render memakai koordinat klien kanvas; harness selalu memakai kanvas 480x360.
    isTouchingDrawables: (id: number, candidates?: number[]) => world.isTouchingDrawables(id, candidates ?? world.drawList()),
    isTouchingColor: () => false,
    pick: (clientX: number, clientY: number) => world.pick(clientX - world.xRight, world.yTop - clientY),
    drawableTouching: (id: number, clientX: number, clientY: number) =>
      world.containsPoint(id, clientX - world.xRight, world.yTop - clientY),
  };
  const renderer = new Proxy(impl, {
    get(target, prop) {
      if (typeof prop === "string" && !(prop in target)) {
        unknownCalls.add(prop);
        return () => undefined;
      }
      return Reflect.get(target, prop);
    },
  });
  return { renderer, unknownCalls };
}
