/**
 * RenderedTarget (padanan scratch-vm 4.8.102 sprites/rendered-target.js, BSD-3-Clause; lihat
 * THIRD_PARTY.md): posisi + fencing, arah, ukuran (batas dari ukuran costume), efek, layer,
 * sentuhan, clone, variabel. Pemilik: agent engine-core.
 */
import { Cast } from "./cast";
import { asRuntimeInternal, type IRenderedTarget } from "./runtime-internal";
import { StageLayering } from "./stage-layering";
import { TargetBase } from "./target-base";
import { STAGE_HEIGHT, STAGE_WIDTH, type RotationStyle, type TargetState, type VideoState } from "./types/project-model";
import type { IMouse } from "./types/io";
import type { DrawableGroup, GraphicEffect, IRenderer, Rect, RGB } from "./types/renderer";
import type { IRuntime } from "./types/runtime";
import type { Costume, ISprite, ITarget, Sound } from "./types/target";
import { MathUtil } from "./util/math-util";
import { StringUtil } from "./util/string-util";

export const ROTATION_STYLE_ALL_AROUND: RotationStyle = "all around";
export const ROTATION_STYLE_LEFT_RIGHT: RotationStyle = "left-right";
export const ROTATION_STYLE_NONE: RotationStyle = "don't rotate";

export interface CreateTargetOptions {
  id?: string;
  isStage?: boolean;
  /** Clone dari target ini (makeClone). */
  cloneOf?: ITarget;
}

/** Sprite yang bisa membuat clone (diimplementasikan sprite.ts). */
export interface CloneableSprite extends ISprite {
  createClone(optLayerGroup?: DrawableGroup, id?: string): RenderedTarget;
  removeClone(clone: ITarget): void;
  duplicate(): Promise<CloneableSprite>;
}

function emptyEffects(): Record<GraphicEffect, number> {
  return { color: 0, fisheye: 0, whirl: 0, pixelate: 0, mosaic: 0, brightness: 0, ghost: 0 };
}

export class RenderedTarget extends TargetBase implements IRenderedTarget {
  readonly sprite: CloneableSprite;
  drawableId = -1;
  dragging = false;
  effects: Record<GraphicEffect, number> = emptyEffects();
  isOriginal = true;
  isStage = false;
  x = 0;
  y = 0;
  direction = 90;
  draggable = false;
  visible = true;
  size = 100;
  currentCostume = 0;
  rotationStyle: RotationStyle = ROTATION_STYLE_ALL_AROUND;
  volume = 100;
  tempo = 60;
  videoTransparency = 50;
  videoState: VideoState = "on";
  textToSpeechLanguage: string | null = null;
  layerOrder?: number;

  constructor(sprite: CloneableSprite, runtime: IRuntime, id?: string) {
    super(runtime, sprite.blocks, id);
    this.sprite = sprite;
  }

  /** Renderer dibaca dari runtime (null bila headless). */
  get renderer(): IRenderer | null {
    return this.runtime.renderer;
  }

  private visualChange(): void {
    if (this.visible) {
      this.emitter.emit("EVENT_TARGET_VISUAL_CHANGE", { target: this });
      this.runtime.requestRedraw();
    }
  }

  initDrawable(layerGroup: DrawableGroup): void {
    if (this.renderer) this.drawableId = this.renderer.createDrawable(layerGroup);
    if (!this.isOriginal) this.runtime.startHats("control_start_as_clone", undefined, this);
  }

  getName(): string {
    return this.sprite.name;
  }

  isSprite(): boolean {
    return !this.isStage && this.isOriginal;
  }

  // ------------------------------------------------------------ gerak & tampilan
  setXY(x: number, y: number, force = false): void {
    if (this.isStage) return;
    if (this.dragging && !force) return;
    const oldX = this.x;
    const oldY = this.y;
    const renderer = this.renderer;
    if (renderer) {
      const position = renderer.getFencedPositionOfDrawable(this.drawableId, [x, y]);
      this.x = position[0];
      this.y = position[1];
      renderer.updateDrawablePosition(this.drawableId, position);
      this.visualChange();
    } else {
      this.x = x;
      this.y = y;
    }
    this.emitter.emit("TARGET_MOVED", { target: this, oldX, oldY, force });
    this.runtime.requestTargetsUpdate(this);
  }

  _getRenderedDirectionAndScale(): { direction: number; scale: [number, number] } {
    let finalDirection = this.direction;
    let finalScale: [number, number] = [this.size, this.size];
    if (this.rotationStyle === ROTATION_STYLE_NONE) {
      finalDirection = 90;
    } else if (this.rotationStyle === ROTATION_STYLE_LEFT_RIGHT) {
      finalDirection = 90;
      const scaleFlip = this.direction < 0 ? -1 : 1;
      finalScale = [scaleFlip * this.size, this.size];
    }
    return { direction: finalDirection, scale: finalScale };
  }

  setDirection(direction: number): void {
    if (this.isStage) return;
    if (!isFinite(direction)) return;
    this.direction = MathUtil.wrapClamp(direction, -179, 180);
    const renderer = this.renderer;
    if (renderer) {
      const { direction: d, scale } = this._getRenderedDirectionAndScale();
      renderer.updateDrawableDirectionScale(this.drawableId, d, scale);
      this.visualChange();
    }
    this.runtime.requestTargetsUpdate(this);
  }

  setDraggable(draggable: boolean): void {
    if (this.isStage) return;
    this.draggable = !!draggable;
    this.runtime.requestTargetsUpdate(this);
  }

  setVisible(visible: boolean): void {
    if (this.isStage) return;
    this.visible = !!visible;
    const renderer = this.renderer;
    if (renderer) {
      renderer.updateDrawableVisible(this.drawableId, this.visible);
      this.visualChange();
    }
    this.runtime.requestTargetsUpdate(this);
  }

  /** Ukuran dibatasi: min 5px atau 100%, maks 1.5x ukuran panggung (rendered-target.js). */
  setSize(size: number): void {
    if (this.isStage) return;
    const renderer = this.renderer;
    if (renderer) {
      const [origW, origH] = renderer.getCurrentSkinSize(this.drawableId);
      const minScale = Math.min(1, Math.max(5 / origW, 5 / origH));
      const maxScale = Math.min((1.5 * STAGE_WIDTH) / origW, (1.5 * STAGE_HEIGHT) / origH);
      this.size = MathUtil.clamp(size / 100, minScale, maxScale) * 100;
      const { direction, scale } = this._getRenderedDirectionAndScale();
      renderer.updateDrawableDirectionScale(this.drawableId, direction, scale);
      this.visualChange();
    }
    this.runtime.requestTargetsUpdate(this);
  }

  setEffect(effectName: GraphicEffect, value: number): void {
    if (!Object.prototype.hasOwnProperty.call(this.effects, effectName)) return;
    this.effects[effectName] = value;
    const renderer = this.renderer;
    if (renderer) {
      renderer.updateDrawableEffect(this.drawableId, effectName, value);
      this.visualChange();
    }
  }

  clearEffects(): void {
    for (const name of Object.keys(this.effects) as GraphicEffect[]) this.effects[name] = 0;
    const renderer = this.renderer;
    if (renderer) {
      for (const name of Object.keys(this.effects) as GraphicEffect[]) {
        renderer.updateDrawableEffect(this.drawableId, name, 0);
      }
      this.visualChange();
    }
  }

  setCostume(index: number): void {
    let i = Math.round(index);
    if (i === Infinity || i === -Infinity || Number.isNaN(i)) i = 0;
    this.currentCostume = MathUtil.wrapClamp(i, 0, this.sprite.costumes.length - 1);
    const renderer = this.renderer;
    if (renderer) {
      const costume = this.getCostumes()[this.currentCostume];
      if (costume) renderer.updateDrawableSkinId(this.drawableId, costume.skinId);
      this.visualChange();
    }
    this.runtime.requestTargetsUpdate(this);
  }

  setRotationStyle(rotationStyle: RotationStyle | string): void {
    if (rotationStyle === ROTATION_STYLE_NONE) this.rotationStyle = ROTATION_STYLE_NONE;
    else if (rotationStyle === ROTATION_STYLE_ALL_AROUND) this.rotationStyle = ROTATION_STYLE_ALL_AROUND;
    else if (rotationStyle === ROTATION_STYLE_LEFT_RIGHT) this.rotationStyle = ROTATION_STYLE_LEFT_RIGHT;
    const renderer = this.renderer;
    if (renderer) {
      const { direction, scale } = this._getRenderedDirectionAndScale();
      renderer.updateDrawableDirectionScale(this.drawableId, direction, scale);
      this.visualChange();
    }
    this.runtime.requestTargetsUpdate(this);
  }

  updateAllDrawableProperties(): void {
    const renderer = this.renderer;
    if (renderer) {
      const { direction, scale } = this._getRenderedDirectionAndScale();
      renderer.updateDrawablePosition(this.drawableId, [this.x, this.y]);
      renderer.updateDrawableDirectionScale(this.drawableId, direction, scale);
      renderer.updateDrawableVisible(this.drawableId, this.visible);
      const costume = this.getCostumes()[this.currentCostume];
      if (costume) renderer.updateDrawableSkinId(this.drawableId, costume.skinId);
      for (const name of Object.keys(this.effects) as GraphicEffect[]) {
        renderer.updateDrawableEffect(this.drawableId, name, this.effects[name]);
      }
      this.visualChange();
    }
    this.runtime.requestTargetsUpdate(this);
  }

  // ------------------------------------------------------------ costume & sound
  getCostumes(): Costume[] {
    return this.sprite.costumes;
  }
  getSounds(): Sound[] {
    return this.sprite.sounds;
  }
  getCurrentCostume(): Costume | undefined {
    return this.getCostumes()[this.currentCostume];
  }
  getCostumeIndexByName(costumeName: string): number {
    return this.sprite.costumes.findIndex((c) => c.name === costumeName);
  }

  addCostume(costume: Costume, index?: number): void {
    const i = typeof index === "number" && !isNaN(index) ? index : this.sprite.costumes.length;
    this.sprite.addCostumeAt(costume, i);
  }

  renameCostume(costumeIndex: number, newName: string): void {
    const usedNames = this.sprite.costumes.filter((_c, i) => i !== costumeIndex).map((c) => c.name);
    const costume = this.getCostumes()[costumeIndex];
    if (!costume) return;
    const oldName = costume.name;
    const unused = StringUtil.unusedName(newName, usedNames);
    costume.name = unused;
    type Renamer = { updateAssetName?(o: string, n: string, t: string): void };
    if (this.isStage) {
      for (const t of this.runtime.targets) (t.blocks as Renamer).updateAssetName?.(oldName, unused, "backdrop");
    } else {
      (this.blocks as Renamer).updateAssetName?.(oldName, unused, "costume");
    }
  }

  deleteCostume(index: number): Costume | null {
    const count = this.sprite.costumes.length;
    if (count === 1 || index < 0 || index >= count) return null;
    const deleted = this.sprite.deleteCostumeAt(index);
    if (index === this.currentCostume && index === count - 1) this.setCostume(index - 1);
    else if (index < this.currentCostume) this.setCostume(this.currentCostume - 1);
    else this.setCostume(this.currentCostume);
    this.runtime.requestTargetsUpdate(this);
    return deleted;
  }

  addSound(sound: Sound, index?: number): void {
    this.sprite.addSound(sound, typeof index === "number" && !isNaN(index) ? index : undefined);
  }

  deleteSound(index: number): Sound | null {
    if (index < 0 || index >= this.sprite.sounds.length) return null;
    const deleted = this.sprite.deleteSoundAt(index);
    this.runtime.requestTargetsUpdate(this);
    return deleted;
  }

  // ------------------------------------------------------------ sentuhan
  getBounds(): Rect | null {
    return this.renderer ? this.renderer.getBounds(this.drawableId) : null;
  }
  getBoundsForBubble(): Rect | null {
    return this.renderer ? this.renderer.getBoundsForBubble(this.drawableId) : null;
  }

  isTouchingObject(requestedObject: string): boolean {
    if (requestedObject === "_mouse_") {
      const mouse = this.runtime.ioDevices.mouse as IMouse & { getStageX?(): number; getStageY?(): number };
      if (!mouse) return false;
      const x = mouse.getStageX ? mouse.getStageX() : mouse.getScratchX();
      const y = mouse.getStageY ? mouse.getStageY() : mouse.getScratchY();
      return this.isTouchingPoint(x, y);
    } else if (requestedObject === "_edge_") {
      return this.isTouchingEdge();
    }
    return this.isTouchingSprite(requestedObject);
  }

  isTouchingPoint(stageX: number, stageY: number): boolean {
    return this.renderer ? this.renderer.isTouchingPoint(this.drawableId, stageX, stageY) : false;
  }

  isTouchingEdge(): boolean {
    if (!this.renderer) return false;
    const bounds = this.getBounds();
    if (!bounds) return false;
    return (
      bounds.left < -STAGE_WIDTH / 2 ||
      bounds.right > STAGE_WIDTH / 2 ||
      bounds.top > STAGE_HEIGHT / 2 ||
      bounds.bottom < -STAGE_HEIGHT / 2
    );
  }

  isTouchingSprite(spriteName: string): boolean {
    const name = Cast.toString(spriteName);
    const firstClone = this.runtime.getSpriteTargetByName(name);
    if (!firstClone || !this.renderer) return false;
    const candidates = firstClone.sprite.clones.filter((c) => !c.dragging).map((c) => c.drawableId);
    return this.renderer.isTouchingDrawables(this.drawableId, candidates);
  }

  isTouchingColor(rgb: RGB): boolean {
    return this.renderer ? this.renderer.isTouchingColor(this.drawableId, rgb) : false;
  }

  colorIsTouchingColor(targetRgb: RGB, maskRgb: RGB): boolean {
    return this.renderer ? this.renderer.isTouchingColor(this.drawableId, targetRgb, maskRgb) : false;
  }

  // ------------------------------------------------------------ layer
  /** Urutan drawable; tanpa renderer: indeks di executableTargets (scratch-vm: null). */
  getLayerOrder(): number {
    if (this.renderer) return this.renderer.getDrawableOrder(this.drawableId);
    return this.runtime.executableTargets.indexOf(this);
  }

  goToFront(): void {
    this.renderer?.setDrawableOrder(this.drawableId, Infinity, StageLayering.SPRITE_LAYER);
    asRuntimeInternal(this.runtime)?.setExecutablePosition(this, Infinity);
  }

  goToBack(): void {
    this.renderer?.setDrawableOrder(this.drawableId, -Infinity, StageLayering.SPRITE_LAYER, false);
    asRuntimeInternal(this.runtime)?.setExecutablePosition(this, -Infinity);
  }

  goForwardLayers(nLayers: number): void {
    this.renderer?.setDrawableOrder(this.drawableId, nLayers, StageLayering.SPRITE_LAYER, true);
    asRuntimeInternal(this.runtime)?.moveExecutable(this, nLayers);
  }

  goBackwardLayers(nLayers: number): void {
    this.renderer?.setDrawableOrder(this.drawableId, -nLayers, StageLayering.SPRITE_LAYER, true);
    asRuntimeInternal(this.runtime)?.moveExecutable(this, -nLayers);
  }

  goBehindOther(other: ITarget): void {
    const renderer = this.renderer;
    if (renderer) {
      const otherLayer = renderer.setDrawableOrder(other.drawableId, 0, StageLayering.SPRITE_LAYER, true);
      renderer.setDrawableOrder(this.drawableId, otherLayer ?? 0, StageLayering.SPRITE_LAYER);
    }
    const position = this.runtime.executableTargets.indexOf(other);
    asRuntimeInternal(this.runtime)?.setExecutablePosition(this, position);
  }

  /** Posisi yang dijaga tetap di dalam pagar (rendered-target.js keepInFence). */
  keepInFence(newX: number, newY: number, optFence?: Rect): [number, number] {
    const fence = optFence ?? {
      left: -STAGE_WIDTH / 2,
      right: STAGE_WIDTH / 2,
      top: STAGE_HEIGHT / 2,
      bottom: -STAGE_HEIGHT / 2,
    };
    const raw = this.getBounds();
    if (!raw) return [newX, newY];
    const bounds = { ...raw };
    bounds.left += newX - this.x;
    bounds.right += newX - this.x;
    bounds.top += newY - this.y;
    bounds.bottom += newY - this.y;
    let dx = 0;
    let dy = 0;
    if (bounds.left < fence.left) dx += fence.left - bounds.left;
    if (bounds.right > fence.right) dx += fence.right - bounds.right;
    if (bounds.top > fence.top) dy += fence.top - bounds.top;
    if (bounds.bottom < fence.bottom) dy += fence.bottom - bounds.bottom;
    return [newX + dx, newY + dy];
  }

  // ------------------------------------------------------------ clone
  makeClone(): ITarget | null {
    if (!this.runtime.clonesAvailable() || this.isStage) return null;
    this.runtime.changeCloneCounter(1);
    const newClone = this.sprite.createClone();
    newClone.x = this.x;
    newClone.y = this.y;
    newClone.direction = this.direction;
    newClone.draggable = this.draggable;
    newClone.visible = this.visible;
    newClone.size = this.size;
    newClone.currentCostume = this.currentCostume;
    newClone.rotationStyle = this.rotationStyle;
    newClone.effects = { ...this.effects };
    newClone.variables = this.duplicateVariables();
    newClone._edgeActivatedHatValues = { ...this._edgeActivatedHatValues };
    newClone.initDrawable(StageLayering.SPRITE_LAYER);
    newClone.updateAllDrawableProperties();
    return newClone;
  }

  /** Duplikat sprite (menu editor). Pemanggil (app) wajib runtime.addTarget + goBehindOther. */
  async duplicate(): Promise<ITarget> {
    const newSprite = await this.sprite.duplicate();
    const target = newSprite.createClone();
    const random = asRuntimeInternal(this.runtime)?.random() ?? Math.random();
    target.x = ((random - 0.5) * 400) / 2;
    target.y = (((asRuntimeInternal(this.runtime)?.random() ?? Math.random()) - 0.5) * 300) / 2;
    target.direction = this.direction;
    target.draggable = this.draggable;
    target.visible = this.visible;
    target.size = this.size;
    target.currentCostume = this.currentCostume;
    target.rotationStyle = this.rotationStyle;
    target.effects = { ...this.effects };
    target.variables = this.duplicateVariables(target.blocks);
    target.updateAllDrawableProperties();
    return target;
  }

  onGreenFlag(): void {
    this.clearEffects();
  }
  onStopAll(): void {
    this.clearEffects();
  }

  postSpriteInfo(data: Record<string, unknown>): void {
    const has = (k: string): boolean => Object.prototype.hasOwnProperty.call(data, k);
    const force = has("force") ? Boolean(data.force) : false;
    if (has("x") || has("y")) {
      this.setXY(has("x") ? Number(data.x) : this.x, has("y") ? Number(data.y) : this.y, force);
    }
    if (has("direction")) this.setDirection(Number(data.direction));
    if (has("draggable")) this.setDraggable(Boolean(data.draggable));
    if (has("rotationStyle")) this.setRotationStyle(String(data.rotationStyle));
    if (has("visible")) this.setVisible(Boolean(data.visible));
    if (has("size")) this.setSize(Number(data.size));
  }

  startDrag(): void {
    this.dragging = true;
  }
  stopDrag(): void {
    this.dragging = false;
  }

  toState(): TargetState {
    const variables: TargetState["variables"] = {};
    for (const id in this.variables) {
      const v = this.variables[id];
      if (!v) continue;
      variables[id] = { id: v.id, name: v.name, type: v.type, value: Array.isArray(v.value) ? [...v.value] : v.value, isCloud: false };
    }
    const strip = <T extends object>(o: T, keys: string[]): T => {
      const copy = { ...o } as Record<string, unknown>;
      for (const k of keys) delete copy[k];
      return copy as T;
    };
    const base: TargetState = {
      id: this.id,
      isStage: this.isStage,
      name: this.getName(),
      variables,
      blocks: JSON.parse(JSON.stringify(this.blocks.toRecord())) as TargetState["blocks"],
      comments: JSON.parse(JSON.stringify(this.comments)) as TargetState["comments"],
      currentCostume: this.currentCostume,
      costumes: this.getCostumes().map((c) => strip(c, ["skinId", "size", "asset"])),
      sounds: this.getSounds().map((s) => strip(s, ["soundId", "asset"])),
      volume: this.volume,
      layerOrder: this.getLayerOrder(),
    };
    const extensionState: Record<string, unknown> = { ...this._customState };
    if (Object.keys(extensionState).length > 0) base.extensionState = extensionState;
    if (this.isStage) {
      return {
        ...base,
        tempo: this.tempo,
        videoTransparency: this.videoTransparency,
        videoState: this.videoState,
        textToSpeechLanguage: this.textToSpeechLanguage,
      };
    }
    return {
      ...base,
      visible: this.visible,
      x: this.x,
      y: this.y,
      size: this.size,
      direction: this.direction,
      draggable: this.draggable,
      rotationStyle: this.rotationStyle,
    };
  }

  dispose(): void {
    // Persis scratch-vm: penghitung clone dikurangi juga untuk target asli.
    this.runtime.changeCloneCounter(-1);
    this.runtime.stopForTarget(this);
    asRuntimeInternal(this.runtime)?.removeExecutable(this);
    this.sprite.removeClone(this);
    const renderer = this.renderer;
    if (renderer && this.drawableId !== -1) {
      renderer.destroyDrawable(this.drawableId, this.isStage ? StageLayering.BACKGROUND_LAYER : StageLayering.SPRITE_LAYER);
      this.visualChange();
    }
  }
}

/**
 * Buat target baru. Tanpa cloneOf: target asli (sprite.createClone) di grup background (stage)
 * atau sprite. Dengan cloneOf: makeClone (bisa null bila batas clone tercapai -> melempar).
 */
export function createTarget(runtime: IRuntime, sprite: ISprite, opts: CreateTargetOptions = {}): ITarget {
  if (opts.cloneOf) {
    const clone = opts.cloneOf.makeClone();
    if (!clone) throw new Error("createTarget: batas clone tercapai atau target adalah stage");
    return clone;
  }
  const cloneable = sprite as Partial<CloneableSprite>;
  if (typeof cloneable.createClone !== "function") {
    throw new Error(`createTarget: sprite "${sprite.name}" harus dibuat dengan createSprite()`);
  }
  const target = cloneable.createClone(opts.isStage ? StageLayering.BACKGROUND_LAYER : StageLayering.SPRITE_LAYER, opts.id);
  if (opts.isStage) target.isStage = true;
  void runtime;
  return target;
}
