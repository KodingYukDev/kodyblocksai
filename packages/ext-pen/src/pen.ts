/**
 * Ekstensi Pen - perilaku identik scratch-vm 4.8.102 extensions/scratch3_pen (BSD-3-Clause).
 * Opcode: PEN_OPCODES di @kody/engine. State per target (custom state "Scratch.pen").
 * Pena menggambar lewat IRenderer (penPoint/penLine/penStamp/penClear) di layer "pen".
 * Pemilik: agent ext-pen.
 */
import { Cast } from "@kody/engine/cast";
import { StageLayering } from "@kody/engine/stage-layering";
import type { BlockArgs, BlockUtility, ExtensionModule, IRuntime, ITarget, PrimitiveFn, TargetEventMap } from "@kody/engine";
import { getPenInfo, PEN_EXTENSION_ID } from "./pen-info";
import type { PenLocale } from "./pen-info";
import {
  clampPenSize,
  cloneSimple,
  ColorParam,
  defaultPenState,
  legacyUpdatePenColor,
  PEN_STATE_KEY,
  setOrChangeColorParam,
  setPenColorFromRgb,
  setPenShade,
} from "./pen-state";
import type { PenState } from "./pen-state";

export { PEN_EXTENSION_ID };

export interface PenExtensionOptions {
  locale?: PenLocale;
}

export interface PenExtensionModule extends ExtensionModule {
  /** State pena target (dibuat default bila belum ada), untuk tes/inspeksi. */
  getPenState(target: ITarget): PenState;
  /** id skin pena (-1 kalau belum ada renderer / belum dipakai). */
  readonly penSkinId: number;
  readonly penDrawableId: number;
}

export function createPenExtensionWithOptions(runtime: IRuntime, options: PenExtensionOptions = {}): PenExtensionModule {
  const locale = options.locale ?? "id";
  let penSkinId = -1;
  let penDrawableId = -1;
  /** Listener TARGET_MOVED per target (padanan target.addListener(EVENT_TARGET_MOVED)). */
  const moveListeners = new Map<ITarget, () => void>();

  /** _getPenLayerID: skin & drawable pena dibuat malas saat pertama dibutuhkan. */
  const getPenLayerID = (): number => {
    const renderer = runtime.renderer;
    if (penSkinId < 0 && renderer) {
      penSkinId = renderer.createPenSkin();
      penDrawableId = renderer.createDrawable(StageLayering.PEN_LAYER);
      renderer.updateDrawableSkinId(penDrawableId, penSkinId);
    }
    return penSkinId;
  };

  const getPenState = (target: ITarget): PenState => {
    let penState = target.getCustomState<PenState>(PEN_STATE_KEY);
    if (!penState) {
      penState = defaultPenState();
      target.setCustomState(PEN_STATE_KEY, penState);
    }
    return penState;
  };

  const onTargetMoved = (e: TargetEventMap["TARGET_MOVED"]): void => {
    // Pena hanya bergerak kalau perpindahan tidak dipaksa (mis. di-drag pengguna).
    if (e.force) return;
    const skinId = getPenLayerID();
    const renderer = runtime.renderer;
    if (skinId >= 0 && renderer) {
      const penState = getPenState(e.target);
      renderer.penLine(skinId, penState.penAttributes, e.oldX, e.oldY, e.target.x, e.target.y);
      runtime.requestRedraw();
    }
  };

  const addMoveListener = (target: ITarget): void => {
    if (moveListeners.has(target)) return;
    moveListeners.set(target, target.on("TARGET_MOVED", onTargetMoved));
  };

  const removeMoveListener = (target: ITarget): void => {
    const off = moveListeners.get(target);
    if (off) {
      off();
      moveListeners.delete(target);
    }
  };

  const offCreated = runtime.on("TARGET_WAS_CREATED", ({ target, source }) => {
    if (!source) return;
    const penState = source.getCustomState<PenState>(PEN_STATE_KEY);
    if (penState) {
      target.setCustomState(PEN_STATE_KEY, cloneSimple(penState));
      if (penState.penDown) addMoveListener(target);
    }
  });

  const offRemoved = runtime.on("TARGET_WAS_REMOVED", ({ target }) => {
    removeMoveListener(target);
  });

  const clear = (): void => {
    const skinId = getPenLayerID();
    const renderer = runtime.renderer;
    if (skinId >= 0 && renderer) {
      renderer.penClear(skinId);
      runtime.requestRedraw();
    }
  };

  const stamp = (_args: BlockArgs, util: BlockUtility): void => {
    const skinId = getPenLayerID();
    const renderer = runtime.renderer;
    if (skinId >= 0 && renderer) {
      renderer.penStamp(skinId, util.target.drawableId);
      runtime.requestRedraw();
    }
  };

  const penDown = (_args: BlockArgs, util: BlockUtility): void => {
    const target = util.target;
    const penState = getPenState(target);
    if (!penState.penDown) {
      penState.penDown = true;
      addMoveListener(target);
    }
    const skinId = getPenLayerID();
    const renderer = runtime.renderer;
    if (skinId >= 0 && renderer) {
      renderer.penPoint(skinId, penState.penAttributes, target.x, target.y);
      runtime.requestRedraw();
    }
  };

  const penUp = (_args: BlockArgs, util: BlockUtility): void => {
    const target = util.target;
    const penState = getPenState(target);
    if (penState.penDown) {
      penState.penDown = false;
      removeMoveListener(target);
    }
  };

  const setPenColorToColor = (args: BlockArgs, util: BlockUtility): void => {
    setPenColorFromRgb(getPenState(util.target), Cast.toRgbColorObject(args.COLOR));
  };

  const changePenColorParamBy = (args: BlockArgs, util: BlockUtility): void => {
    setOrChangeColorParam(args.COLOR_PARAM, Cast.toNumber(args.VALUE), getPenState(util.target), true);
  };

  const setPenColorParamTo = (args: BlockArgs, util: BlockUtility): void => {
    setOrChangeColorParam(args.COLOR_PARAM, Cast.toNumber(args.VALUE), getPenState(util.target), false);
  };

  const changePenSizeBy = (args: BlockArgs, util: BlockUtility): void => {
    const attrs = getPenState(util.target).penAttributes;
    attrs.diameter = clampPenSize(attrs.diameter + Cast.toNumber(args.SIZE));
  };

  const setPenSizeTo = (args: BlockArgs, util: BlockUtility): void => {
    getPenState(util.target).penAttributes.diameter = clampPenSize(Cast.toNumber(args.SIZE));
  };

  // --- legacy (Scratch 2) ---
  const setPenHueToNumber = (args: BlockArgs, util: BlockUtility): void => {
    const penState = getPenState(util.target);
    const colorValue = Cast.toNumber(args.HUE) / 2;
    setOrChangeColorParam(ColorParam.COLOR, colorValue, penState, false);
    setOrChangeColorParam(ColorParam.TRANSPARENCY, 0, penState, false);
    legacyUpdatePenColor(penState);
  };

  const changePenHueBy = (args: BlockArgs, util: BlockUtility): void => {
    const penState = getPenState(util.target);
    const colorChange = Cast.toNumber(args.HUE) / 2;
    setOrChangeColorParam(ColorParam.COLOR, colorChange, penState, true);
    legacyUpdatePenColor(penState);
  };

  const setPenShadeToNumber = (args: BlockArgs, util: BlockUtility): void => {
    setPenShade(getPenState(util.target), Cast.toNumber(args.SHADE));
  };

  const changePenShadeBy = (args: BlockArgs, util: BlockUtility): void => {
    const penState = getPenState(util.target);
    const shadeChange = Cast.toNumber(args.SHADE);
    // Scratch memanggil setPenShadeToNumber({SHADE: _shade + change}) -> lewat Cast.toNumber lagi.
    setPenShade(penState, Cast.toNumber(penState._shade + shadeChange));
  };

  const primitives: Record<string, PrimitiveFn> = {
    clear,
    stamp,
    penDown,
    penUp,
    setPenColorToColor,
    changePenColorParamBy,
    setPenColorParamTo,
    changePenSizeBy,
    setPenSizeTo,
    setPenShadeToNumber,
    changePenShadeBy,
    setPenHueToNumber,
    changePenHueBy,
  };

  return {
    getInfo: () => getPenInfo(locale),
    getPrimitives: () => primitives,
    getPenState,
    get penSkinId() {
      return penSkinId;
    },
    get penDrawableId() {
      return penDrawableId;
    },
    dispose: () => {
      // Scratch: RUNTIME_DISPOSED -> clear(). Tidak membuat layer pena baru hanya untuk dihapus.
      if (penSkinId >= 0) clear();
      offCreated();
      offRemoved();
      for (const off of moveListeners.values()) off();
      moveListeners.clear();
    },
  };
}

export function createPenExtension(runtime: IRuntime): PenExtensionModule {
  return createPenExtensionWithOptions(runtime);
}
