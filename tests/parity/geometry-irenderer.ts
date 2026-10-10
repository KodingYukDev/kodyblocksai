/**
 * Adaptor IRenderer (kontrak engine kita) di atas GeometryWorld. Facade scratch-render untuk oracle
 * ada di geometry-renderer.ts; keduanya memakai world yang SAMA bentuknya sehingga perbedaan trace
 * hanya berasal dari logika VM. Koordinat titik di IRenderer = koordinat panggung (lihat kontrak).
 */
import type {
  BubbleType,
  DrawableGroup,
  DrawableProperties,
  GraphicEffect,
  IRenderer,
  PenAttributes,
  Rect,
  RGB,
  RGBA,
} from "@kody/engine";
import { DEFAULT_SKIN, GeometryWorld } from "./geometry-renderer";

export interface GeometryRendererAdapter {
  renderer: IRenderer;
  world: GeometryWorld;
  /** Panggilan per nama method (untuk diagnosa). */
  calls: Map<string, number>;
}

export function createGeometryIRenderer(world: GeometryWorld = new GeometryWorld()): GeometryRendererAdapter {
  const calls = new Map<string, number>();
  const count = (name: string): void => {
    calls.set(name, (calls.get(name) ?? 0) + 1);
  };
  const drawable = (id: number) => world.drawables.get(id);
  const skinSize = (skinId: number): [number, number] => {
    const s = world.skins.get(skinId) ?? DEFAULT_SKIN;
    return [s.size[0], s.size[1]];
  };

  const renderer: IRenderer = {
    getNativeSize: () => [world.xRight * 2, world.yTop * 2],
    resize: () => count("resize"),
    setLayerGroupOrdering: (groups: readonly DrawableGroup[]) => {
      world.groupOrdering = [...groups];
    },
    draw: () => count("draw"),

    createBitmapSkin: () => world.createSkin(DEFAULT_SKIN.size, DEFAULT_SKIN.rotationCenter),
    createSVGSkin: () => world.createSkin(DEFAULT_SKIN.size, DEFAULT_SKIN.rotationCenter),
    updateBitmapSkin: () => count("updateBitmapSkin"),
    updateSVGSkin: () => count("updateSVGSkin"),
    createTextSkin: (_type: BubbleType, _text: string, _pointsLeft: boolean) => world.createSkin([0, 0], [0, 0]),
    updateTextSkin: () => count("updateTextSkin"),
    createPenSkin: () => world.createSkin([480, 360], [240, 180]),
    destroySkin: (skinId: number) => {
      world.skins.delete(skinId);
    },
    getSkinSize: skinSize,
    getSkinRotationCenter: (skinId: number) => {
      const s = world.skins.get(skinId) ?? DEFAULT_SKIN;
      return [s.rotationCenter[0], s.rotationCenter[1]];
    },

    createDrawable: (group: DrawableGroup) => world.createDrawable(group),
    destroyDrawable: (id: number) => world.destroyDrawable(id),
    setDrawableOrder: (id, order, group, isRelative, optMin) => world.setDrawableOrder(id, order, group, isRelative, optMin),
    getDrawableOrder: (id: number) => world.getDrawableOrder(id),
    updateDrawableSkinId: (id: number, skinId: number) => {
      const d = drawable(id);
      if (d) d.skinId = skinId;
    },
    updateDrawablePosition: (id: number, position: [number, number]) => {
      const d = drawable(id);
      if (d) d.position = [position[0], position[1]];
    },
    updateDrawableDirectionScale: (id: number, direction: number, scale: [number, number]) => {
      const d = drawable(id);
      if (d) {
        d.direction = direction;
        d.scale = [scale[0], scale[1]];
      }
    },
    updateDrawableVisible: (id: number, visible: boolean) => {
      const d = drawable(id);
      if (d) d.visible = visible;
    },
    updateDrawableEffect: (_id: number, _effect: GraphicEffect, _value: number) => count("updateDrawableEffect"),
    updateDrawableProperties: (id: number, props: DrawableProperties) => {
      const d = drawable(id);
      if (!d) return;
      if (props.position) d.position = [props.position[0], props.position[1]];
      if (props.direction !== undefined) d.direction = props.direction;
      if (props.scale) d.scale = [props.scale[0], props.scale[1]];
      if (props.visible !== undefined) d.visible = props.visible;
      if (props.skinId !== undefined) d.skinId = props.skinId;
    },

    getBounds: (id: number): Rect | null => world.getAABB(id),
    getBoundsForBubble: (id: number): Rect | null => world.getAABB(id),
    getAABB: (id: number): Rect | null => world.getAABB(id),
    getCurrentSkinSize: (id: number) => {
      const d = drawable(id);
      return d ? skinSize(d.skinId) : [0, 0];
    },
    getFencedPositionOfDrawable: (id: number, position: [number, number]) => world.getFencedPosition(id, position),
    isTouchingDrawables: (id: number, candidates?: readonly number[]) =>
      world.isTouchingDrawables(id, candidates ?? world.drawList()),
    isTouchingColor: (_id: number, _color: RGB, _mask?: RGB) => false,
    isTouchingPoint: (id: number, x: number, y: number) => world.containsPoint(id, x, y),
    pick: (x: number, y: number, _w?: number, _h?: number, candidates?: readonly number[]) => world.pick(x, y, candidates),
    sampleColor: (): RGBA => [0, 0, 0, 0],

    penClear: () => count("penClear"),
    penPoint: (_skin: number, _attrs: PenAttributes) => count("penPoint"),
    penLine: () => count("penLine"),
    penStamp: () => count("penStamp"),
  };
  return { renderer, world, calls };
}
