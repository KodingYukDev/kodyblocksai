/**
 * Primitive kategori Looks - padanan scratch-vm src/blocks/scratch3_looks.js.
 * Port baris-demi-baris dari scratch-vm 4.8.102 (BSD-3-Clause), lihat THIRD_PARTY.md.
 * Batas ukuran (min/maks berdasar costume & panggung), wrap indeks costume, dan layer ada di
 * RenderedTarget (target.ts); di sini hanya aturan blok (cast nama/angka, clamp efek, balon).
 * Pemilik: agent engine-motion-looks.
 */
import { getMonitorIdForBlockWithArgs } from "../monitors";
import { ThreadStatus } from "../types/runtime";
import { StageLayering } from "../stage-layering";
import { Cast } from "../util/cast";
import { getRuntimeRandom, MathUtil } from "../util/math-util";
import type { GraphicEffect, Rect } from "../types/renderer";
import type {
  BlockPackage,
  BlockPackageFactory,
  BlockUtility,
  IRuntime,
  IThread,
  PrimitiveFn,
  SayType,
} from "../types/runtime";
import type { ITarget } from "../types/target";

/** State balon per target (scratch-vm BubbleState), disimpan di custom state "Scratch.looks". */
export interface BubbleState {
  drawableId: number | null;
  onSpriteRight: boolean;
  skinId: number | null;
  text: string;
  type: SayType;
  usageId: string | null;
}

export const LOOKS_STATE_KEY = "Scratch.looks";
/** Batas panjang teks balon (SAY_BUBBLE_LIMIT). */
export const SAY_BUBBLE_LIMIT = 330;
export const EFFECT_GHOST_LIMIT = { min: 0, max: 100 } as const;
export const EFFECT_BRIGHTNESS_LIMIT = { min: -100, max: 100 } as const;

const defaultBubbleState = (): BubbleState => ({
  drawableId: null,
  onSpriteRight: true,
  skinId: null,
  text: "",
  type: "say",
  usageId: null,
});

/**
 * Format teks balon: bilangan non-bulat (|x| >= 0.01) dibulatkan 2 desimal, lalu dipotong 330
 * unit UTF-16 (String.prototype.substr) persis Scratch 3.
 */
export function formatBubbleText(text: unknown): string {
  if (text === "") return "";
  let value: unknown = text;
  if (typeof value === "number" && Math.abs(value) >= 0.01 && value % 1 !== 0) {
    value = value.toFixed(2);
  }
  return String(value).substring(0, SAY_BUBBLE_LIMIT);
}

/** clampEffect: hanya ghost (0..100) dan brightness (-100..100) yang dibatasi. */
export function clampEffect(effect: string, value: number): number {
  switch (effect) {
    case "ghost":
      return MathUtil.clamp(value, EFFECT_GHOST_LIMIT.min, EFFECT_GHOST_LIMIT.max);
    case "brightness":
      return MathUtil.clamp(value, EFFECT_BRIGHTNESS_LIMIT.min, EFFECT_BRIGHTNESS_LIMIT.max);
    default:
      return value;
  }
}

/** isNaN global JS (meng-cast dulu ke Number). */
const jsIsNaN = (value: unknown): boolean => typeof value === "symbol" || Number.isNaN(Number(value));

/** `value.toString()` ala JS: melempar TypeError untuk null/undefined seperti scratch-vm. */
const jsToString = (value: unknown): string => (value as { toString(): string }).toString();

export const createLooksBlocks: BlockPackageFactory = (runtime: IRuntime): BlockPackage => {
  const random = getRuntimeRandom(runtime);
  /** Pelepas listener EVENT_TARGET_VISUAL_CHANGE per target (padanan removeListener). */
  const visualListeners = new WeakMap<ITarget, () => void>();
  let usageCounter = 0;
  let bubbleTimeout: ReturnType<typeof setTimeout> | null = null;

  const getBubbleState = (target: ITarget): BubbleState => {
    let bubbleState = target.getCustomState<BubbleState>(LOOKS_STATE_KEY);
    if (!bubbleState) {
      bubbleState = defaultBubbleState();
      target.setCustomState(LOOKS_STATE_KEY, bubbleState);
    }
    return bubbleState;
  };

  const onTargetWillExit = (target: ITarget): void => {
    const bubbleState = getBubbleState(target);
    const renderer = runtime.renderer;
    if (renderer && bubbleState.drawableId !== null && bubbleState.skinId !== null) {
      renderer.destroyDrawable(bubbleState.drawableId, StageLayering.SPRITE_LAYER);
      renderer.destroySkin(bubbleState.skinId);
      bubbleState.drawableId = null;
      bubbleState.skinId = null;
      runtime.requestRedraw();
    }
    const off = visualListeners.get(target);
    if (off) {
      off();
      visualListeners.delete(target);
    }
  };

  const positionBubble = (target: ITarget): void => {
    if (!target.visible) return;
    const renderer = runtime.renderer;
    const bubbleState = getBubbleState(target);
    if (!renderer || bubbleState.drawableId === null) return;
    const [bubbleWidth, bubbleHeight] = renderer.getCurrentSkinSize(bubbleState.drawableId);
    let targetBounds: Rect | null = null;
    try {
      targetBounds = target.getBoundsForBubble();
    } catch {
      targetBounds = null;
    }
    // Bounds bisa gagal (mis. costume kosong): pakai posisi x/y target.
    if (!targetBounds) {
      targetBounds = { left: target.x, right: target.x, top: target.y, bottom: target.y };
    }
    const stageSize = renderer.getNativeSize();
    const stageBounds = {
      left: -stageSize[0] / 2,
      right: stageSize[0] / 2,
      top: stageSize[1] / 2,
      bottom: -stageSize[1] / 2,
    };
    if (
      bubbleState.onSpriteRight &&
      bubbleWidth + targetBounds.right > stageBounds.right &&
      targetBounds.left - bubbleWidth > stageBounds.left
    ) {
      // Balik hanya kalau muat di sisi lain.
      bubbleState.onSpriteRight = false;
      renderBubble(target);
    } else if (
      !bubbleState.onSpriteRight &&
      targetBounds.left - bubbleWidth < stageBounds.left &&
      bubbleWidth + targetBounds.right < stageBounds.right
    ) {
      bubbleState.onSpriteRight = true;
      renderBubble(target);
    } else {
      renderer.updateDrawablePosition(bubbleState.drawableId, [
        bubbleState.onSpriteRight
          ? Math.max(stageBounds.left, Math.min(stageBounds.right - bubbleWidth, targetBounds.right))
          : Math.min(stageBounds.right - bubbleWidth, Math.max(stageBounds.left, targetBounds.left - bubbleWidth)),
        Math.min(stageBounds.top, targetBounds.bottom + bubbleHeight),
      ]);
      runtime.requestRedraw();
    }
  };

  const onTargetChanged = ({ target }: { target: ITarget }): void => {
    const bubbleState = getBubbleState(target);
    if (bubbleState.drawableId !== null) positionBubble(target);
  };

  function renderBubble(target: ITarget): void {
    const renderer = runtime.renderer;
    if (!renderer) return;
    const bubbleState = getBubbleState(target);
    const { type, text, onSpriteRight } = bubbleState;
    // Hapus balon bila target tersembunyi atau teks kosong.
    if (!target.visible || text === "") {
      onTargetWillExit(target);
      return;
    }
    if (bubbleState.skinId !== null) {
      renderer.updateTextSkin(bubbleState.skinId, type, text, onSpriteRight);
    } else {
      if (!visualListeners.has(target)) {
        visualListeners.set(target, target.on("EVENT_TARGET_VISUAL_CHANGE", onTargetChanged));
      }
      bubbleState.drawableId = renderer.createDrawable(StageLayering.SPRITE_LAYER);
      bubbleState.skinId = renderer.createTextSkin(type, text, bubbleState.onSpriteRight);
      renderer.updateDrawableSkinId(bubbleState.drawableId, bubbleState.skinId);
    }
    positionBubble(target);
  }

  const updateBubble = (target: ITarget, type: SayType, text: unknown): void => {
    const bubbleState = getBubbleState(target);
    bubbleState.type = type;
    bubbleState.text = formatBubbleText(text);
    usageCounter += 1;
    bubbleState.usageId = `u${usageCounter}`;
    renderBubble(target);
  };

  const onResetBubbles = (): void => {
    for (const target of runtime.targets) {
      const bubbleState = getBubbleState(target);
      bubbleState.text = "";
      onTargetWillExit(target);
    }
    if (bubbleTimeout !== null) clearTimeout(bubbleTimeout);
  };

  // Reset semua balon saat stop; bersihkan saat target dihapus; blok lain (ask) memakai event SAY.
  runtime.on("PROJECT_STOP_ALL", onResetBubbles);
  runtime.on("TARGET_WAS_REMOVED", ({ target }) => onTargetWillExit(target));
  runtime.on("SAY", ({ target, type, text }) => updateBubble(target, type, text));

  /**
   * Emit SAY dengan nilai MENTAH seperti scratch-vm (`runtime.emit(SAY, target, type, message)`):
   * angka tetap angka, teks >330 karakter tidak dipotong. Pemformatan (2 desimal, batas 330) hanya
   * untuk balon, di listener updateBubble. Tipe payload `string` di kontrak; nilai bisa number/boolean.
   */
  const emitSay = (target: ITarget, type: SayType, message: unknown): void => {
    runtime.emit("SAY", { target, type, text: message as string });
  };

  const sayOrThinkForSecs = (type: SayType, message: unknown, secs: unknown, util: BlockUtility) => {
    emitSay(util.target, type, message);
    const target = util.target;
    const usageId = getBubbleState(target).usageId;
    return new Promise<void>((resolve) => {
      bubbleTimeout = setTimeout(
        () => {
          bubbleTimeout = null;
          // Hapus balon hanya bila belum diganti blok say/think lain.
          if (getBubbleState(target).usageId === usageId) {
            updateBubble(target, type, "");
          }
          resolve();
        },
        1000 * (typeof secs === "symbol" ? NaN : Number(secs)),
      );
    });
  };

  const say: PrimitiveFn = (args, util) => emitSay(util.target, "say", args.MESSAGE);
  const think: PrimitiveFn = (args, util) => emitSay(util.target, "think", args.MESSAGE);
  const sayforsecs: PrimitiveFn = (args, util) => sayOrThinkForSecs("say", args.MESSAGE, args.SECS, util);
  const thinkforsecs: PrimitiveFn = (args, util) => sayOrThinkForSecs("think", args.MESSAGE, args.SECS, util);

  const show: PrimitiveFn = (_args, util) => {
    util.target.setVisible(true);
    renderBubble(util.target);
  };

  const hide: PrimitiveFn = (_args, util) => {
    util.target.setVisible(false);
    renderBubble(util.target);
  };

  /** _setCostume: angka = indeks; string = nama, lalu "next/previous costume", lalu angka dalam teks. */
  const setCostume = (target: ITarget, requestedCostume: unknown, optZeroIndex = false): IThread[] => {
    if (typeof requestedCostume === "number") {
      target.setCostume(optZeroIndex ? requestedCostume : requestedCostume - 1);
    } else {
      const costumeIndex = target.getCostumeIndexByName(jsToString(requestedCostume));
      if (costumeIndex !== -1) {
        target.setCostume(costumeIndex);
      } else if (requestedCostume === "next costume") {
        target.setCostume(target.currentCostume + 1);
      } else if (requestedCostume === "previous costume") {
        target.setCostume(target.currentCostume - 1);
      } else if (!(jsIsNaN(requestedCostume) || Cast.isWhiteSpace(requestedCostume))) {
        // Teks angka (bukan spasi saja) dianggap indeks.
        target.setCostume(optZeroIndex ? Number(requestedCostume) : Number(requestedCostume) - 1);
      }
    }
    // Seperti 2.0, ganti costume tidak memulai thread bahkan di Stage.
    return [];
  };

  /** _setBackdrop: seperti setCostume + "random backdrop", lalu memicu "when backdrop switches to". */
  const setBackdrop = (stage: ITarget | undefined, requestedBackdrop: unknown, optZeroIndex = false): IThread[] => {
    if (!stage) return [];
    if (typeof requestedBackdrop === "number") {
      stage.setCostume(optZeroIndex ? requestedBackdrop : requestedBackdrop - 1);
    } else {
      const costumeIndex = stage.getCostumeIndexByName(jsToString(requestedBackdrop));
      if (costumeIndex !== -1) {
        stage.setCostume(costumeIndex);
      } else if (requestedBackdrop === "next backdrop") {
        stage.setCostume(stage.currentCostume + 1);
      } else if (requestedBackdrop === "previous backdrop") {
        stage.setCostume(stage.currentCostume - 1);
      } else if (requestedBackdrop === "random backdrop") {
        const numCostumes = stage.getCostumes().length;
        if (numCostumes > 1) {
          // Jangan pilih backdrop yang sedang aktif agar blok selalu terlihat efeknya.
          const nextCostume = MathUtil.inclusiveRandIntWithout(0, numCostumes - 1, stage.currentCostume, random);
          stage.setCostume(nextCostume);
        }
      } else if (!(jsIsNaN(requestedBackdrop) || Cast.isWhiteSpace(requestedBackdrop))) {
        stage.setCostume(optZeroIndex ? Number(requestedBackdrop) : Number(requestedBackdrop) - 1);
      }
    }
    const newName = stage.getCostumes()[stage.currentCostume]?.name ?? "";
    return runtime.startHats("event_whenbackdropswitchesto", { BACKDROP: newName });
  };

  const switchCostume: PrimitiveFn = (args, util) => {
    setCostume(util.target, args.COSTUME);
  };

  const nextCostume: PrimitiveFn = (_args, util) => {
    setCostume(util.target, util.target.currentCostume + 1, true);
  };

  const switchBackdrop: PrimitiveFn = (args) => {
    setBackdrop(runtime.getTargetForStage(), args.BACKDROP);
  };

  const switchBackdropAndWait: PrimitiveFn = (args, util) => {
    const frame = util.stackFrame as { startedThreads?: IThread[] };
    // _setBackdrop memanggil runtime.startHats langsung (bukan util.startHats) sehingga execute() hat
    // menimpa konteks util. Simpan thread pemanggil supaya yield mengenai thread yang benar.
    const callerThread = util.thread;
    if (!frame.startedThreads) {
      // Belum pernah jalan: ganti backdrop.
      frame.startedThreads = setBackdrop(runtime.getTargetForStage(), args.BACKDROP);
      if (frame.startedThreads.length === 0) return; // Tidak ada thread yang dimulai.
    }
    // Seperti Scratch 2: thread dianggap masih ditunggu selama masih ada di runtime.threads.
    const started = frame.startedThreads;
    const waiting = started.some((thread) => runtime.threads.indexOf(thread) !== -1);
    if (waiting) {
      callerThread.status = started.every((thread) => runtime.isWaitingThread(thread)) ? ThreadStatus.YIELD_TICK : ThreadStatus.YIELD;
    }
  };

  const nextBackdrop: PrimitiveFn = () => {
    const stage = runtime.getTargetForStage();
    if (!stage) return;
    setBackdrop(stage, stage.currentCostume + 1, true);
  };

  const changeEffect: PrimitiveFn = (args, util) => {
    const effect = Cast.toString(args.EFFECT).toLowerCase();
    const change = Cast.toNumber(args.CHANGE);
    if (!Object.prototype.hasOwnProperty.call(util.target.effects, effect)) return;
    let newValue = change + util.target.effects[effect as GraphicEffect];
    newValue = clampEffect(effect, newValue);
    util.target.setEffect(effect as GraphicEffect, newValue);
  };

  const setEffect: PrimitiveFn = (args, util) => {
    const effect = Cast.toString(args.EFFECT).toLowerCase();
    let value = Cast.toNumber(args.VALUE);
    value = clampEffect(effect, value);
    // target.setEffect sendiri mengabaikan nama efek yang tidak dikenal (seperti RenderedTarget).
    util.target.setEffect(effect as GraphicEffect, value);
  };

  const clearEffects: PrimitiveFn = (_args, util) => {
    util.target.clearEffects();
  };

  const changeSize: PrimitiveFn = (args, util) => {
    const change = Cast.toNumber(args.CHANGE);
    util.target.setSize(util.target.size + change);
  };

  const setSize: PrimitiveFn = (args, util) => {
    const size = Cast.toNumber(args.SIZE);
    util.target.setSize(size);
  };

  const goToFrontBack: PrimitiveFn = (args, util) => {
    if (!util.target.isStage) {
      if (args.FRONT_BACK === "front") {
        util.target.goToFront();
      } else {
        util.target.goToBack();
      }
    }
  };

  const goForwardBackwardLayers: PrimitiveFn = (args, util) => {
    if (!util.target.isStage) {
      if (args.FORWARD_BACKWARD === "forward") {
        util.target.goForwardLayers(Cast.toNumber(args.NUM));
      } else {
        util.target.goBackwardLayers(Cast.toNumber(args.NUM));
      }
    }
  };

  const getSize: PrimitiveFn = (_args, util) => Math.round(util.target.size);

  const getBackdropNumberName: PrimitiveFn = (args) => {
    const stage = runtime.getTargetForStage();
    if (!stage) return "";
    if (args.NUMBER_NAME === "number") return stage.currentCostume + 1;
    return stage.getCostumes()[stage.currentCostume]?.name ?? "";
  };

  const getCostumeNumberName: PrimitiveFn = (args, util) => {
    if (args.NUMBER_NAME === "number") return util.target.currentCostume + 1;
    return util.target.getCostumes()[util.target.currentCostume]?.name ?? "";
  };

  const noop: PrimitiveFn = () => undefined;

  return {
    getPrimitives: () => ({
      looks_say: say,
      looks_sayforsecs: sayforsecs,
      looks_think: think,
      looks_thinkforsecs: thinkforsecs,
      looks_show: show,
      looks_hide: hide,
      looks_hideallsprites: noop, // blok lama, no-op
      looks_switchcostumeto: switchCostume,
      looks_switchbackdropto: switchBackdrop,
      looks_switchbackdroptoandwait: switchBackdropAndWait,
      looks_nextcostume: nextCostume,
      looks_nextbackdrop: nextBackdrop,
      looks_changeeffectby: changeEffect,
      looks_seteffectto: setEffect,
      looks_cleargraphiceffects: clearEffects,
      looks_changesizeby: changeSize,
      looks_setsizeto: setSize,
      looks_changestretchby: noop, // blok lama, no-op
      looks_setstretchto: noop,
      looks_gotofrontback: goToFrontBack,
      looks_goforwardbackwardlayers: goForwardBackwardLayers,
      looks_size: getSize,
      looks_costumenumbername: getCostumeNumberName,
      looks_backdropnumbername: getBackdropNumberName,
    }),
    getHats: () => ({}),
    getMonitored: () => ({
      looks_size: { isSpriteSpecific: true, getId: (targetId) => `${targetId}_size` },
      looks_costumenumbername: {
        isSpriteSpecific: true,
        getId: (targetId, fields) => getMonitorIdForBlockWithArgs(`${targetId}_costumenumbername`, fields),
      },
      looks_backdropnumbername: {
        getId: (_targetId, fields) => getMonitorIdForBlockWithArgs("backdropnumbername", fields),
      },
    }),
  };
};
