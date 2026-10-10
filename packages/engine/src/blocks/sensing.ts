/**
 * Primitive kategori Sensing - port scratch-vm 4.8.102 src/blocks/scratch3_sensing.js (BSD-3-Clause).
 * Antrian "ask and wait", cache loudness per frame, dan atribut "of" mengikuti scratch-vm.
 */
import { getMonitorIdForBlockWithArgs } from "../monitors";
import type { ScratchValue } from "../types/project-model";
import type {
  BlockArgs,
  BlockPackage,
  BlockUtility,
  IRuntime,
  MonitoredMetadata,
  PrimitiveFn,
} from "../types/runtime";
import type { ITarget } from "../types/target";
import { Cast } from "../util/cast";
import { defaultTimeSource, Timer, type TimeSource } from "../util/timer";

export interface SensingBlocksOptions {
  /** Jam untuk cache loudness (default performance.now, seperti Timer scratch-vm). */
  timeSource?: TimeSource;
  /** Tanggal "sekarang" untuk current & days since 2000 (default new Date()). */
  now?: () => Date;
}

interface QueuedQuestion {
  question: string;
  resolve: () => void;
  target: ITarget;
  wasVisible: boolean;
  wasStage: boolean;
}

/** Nilai "current <menu>". */
export function currentDatePart(menu: unknown, date: Date): number {
  switch (Cast.toString(menu).toLowerCase()) {
    case "year":
      return date.getFullYear();
    case "month":
      return date.getMonth() + 1;
    case "date":
      return date.getDate();
    case "dayofweek":
      return date.getDay() + 1;
    case "hour":
      return date.getHours();
    case "minute":
      return date.getMinutes();
    case "second":
      return date.getSeconds();
  }
  return 0;
}

/** Hari (pecahan) sejak 1 Jan 2000 waktu lokal, dengan koreksi DST persis scratch-vm. */
export function daysSince2000(today: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const start = new Date(2000, 0, 1);
  const dstAdjust = today.getTimezoneOffset() - start.getTimezoneOffset();
  let mSecsSinceStart = today.valueOf() - start.valueOf();
  mSecsSinceStart += (today.getTimezoneOffset() - dstAdjust) * 60 * 1000;
  return mSecsSinceStart / msPerDay;
}

/** sensing_of: atribut sprite/stage atau variabel lokal target tsb; 0 bila tidak ada. */
export function getAttributeOf(runtime: IRuntime, objectArg: unknown, property: unknown): ScratchValue {
  let attrTarget: ITarget | undefined;
  if (objectArg === "_stage_") {
    attrTarget = runtime.getTargetForStage();
  } else {
    attrTarget = runtime.getSpriteTargetByName(Cast.toString(objectArg));
  }
  if (!attrTarget) return 0;

  if (attrTarget.isStage) {
    switch (property) {
      case "background #": // Scratch 1.4
      case "backdrop #":
        return attrTarget.currentCostume + 1;
      case "backdrop name":
        return attrTarget.getCostumes()[attrTarget.currentCostume]?.name ?? "";
      case "volume":
        return attrTarget.volume;
    }
  } else {
    switch (property) {
      case "x position":
        return attrTarget.x;
      case "y position":
        return attrTarget.y;
      case "direction":
        return attrTarget.direction;
      case "costume #":
        return attrTarget.currentCostume + 1;
      case "costume name":
        return attrTarget.getCostumes()[attrTarget.currentCostume]?.name ?? "";
      case "size":
        return attrTarget.size;
      case "volume":
        return attrTarget.volume;
    }
  }

  const variable = attrTarget.lookupVariableByNameAndType(String(property), "", true);
  if (variable) return variable.value as ScratchValue;
  return 0;
}

/** Padanan class Scratch3SensingBlocks (state answer, antrian pertanyaan, cache loudness). */
export class SensingBlocks implements BlockPackage {
  private answer = "";
  private questionList: QueuedQuestion[] = [];
  private cachedLoudness = -1;
  private cachedLoudnessTimestamp = 0;
  private readonly timer: Timer;
  private readonly now: () => Date;

  constructor(
    private readonly runtime: IRuntime,
    opts: SensingBlocksOptions = {},
  ) {
    this.timer = new Timer(opts.timeSource ?? defaultTimeSource);
    this.now = opts.now ?? (() => new Date());
    runtime.on("ANSWER", ({ answer }) => this.onAnswer(answer));
    runtime.on("PROJECT_START", () => this.resetAnswer());
    runtime.on("PROJECT_STOP_ALL", () => this.clearAllQuestions());
    runtime.on("STOP_FOR_TARGET", ({ target }) => this.clearTargetQuestions(target));
  }

  getPrimitives(): Record<string, PrimitiveFn> {
    return {
      sensing_touchingobject: (a, u) => u.target.isTouchingObject(a.TOUCHINGOBJECTMENU as string),
      sensing_touchingcolor: (a, u) => u.target.isTouchingColor(Cast.toRgbColorList(a.COLOR)),
      sensing_coloristouchingcolor: (a, u) => {
        const maskColor = Cast.toRgbColorList(a.COLOR);
        const targetColor = Cast.toRgbColorList(a.COLOR2);
        return u.target.colorIsTouchingColor(targetColor, maskColor);
      },
      sensing_distanceto: (a, u) => this.distanceTo(a, u),
      sensing_timer: (_a, u) => u.ioQuery("clock", "projectTimer") as number,
      sensing_resettimer: (_a, u) => {
        u.ioQuery("clock", "resetProjectTimer");
      },
      sensing_of: (a) => getAttributeOf(this.runtime, a.OBJECT, a.PROPERTY),
      sensing_mousex: (_a, u) => u.ioQuery("mouse", "getScratchX") as number,
      sensing_mousey: (_a, u) => u.ioQuery("mouse", "getScratchY") as number,
      sensing_setdragmode: (a, u) => u.target.setDraggable(a.DRAG_MODE === "draggable"),
      sensing_mousedown: (_a, u) => u.ioQuery("mouse", "getIsDown") as boolean,
      sensing_keypressed: (a, u) => u.ioQuery("keyboard", "getKeyIsDown", [a.KEY_OPTION]) as boolean,
      sensing_current: (a) => currentDatePart(a.CURRENTMENU, this.now()),
      sensing_dayssince2000: () => daysSince2000(this.now()),
      sensing_loudness: () => this.getLoudness(),
      sensing_loud: () => this.getLoudness() > 10,
      sensing_askandwait: (a, u) => this.askAndWait(a, u),
      sensing_answer: () => this.answer,
      sensing_username: (_a, u) => u.ioQuery("userData", "getUsername") as string,
      sensing_userid: () => undefined, // blok lama, no-op
    };
  }

  getHats(): Record<string, never> {
    return {};
  }

  getMonitored(): Record<string, MonitoredMetadata> {
    return {
      sensing_answer: { getId: () => "answer" },
      sensing_loudness: { getId: () => "loudness" },
      sensing_timer: { getId: () => "timer" },
      // Berbeda dari id toolbox agar beberapa monitor "current" dari sb2 bisa diimpor.
      sensing_current: { getId: (_targetId, fields) => getMonitorIdForBlockWithArgs("current", fields) },
    };
  }

  /** Untuk tes/devtools: jumlah pertanyaan yang menunggu. */
  get pendingQuestionCount(): number {
    return this.questionList.length;
  }

  private distanceTo(args: BlockArgs, util: BlockUtility): number {
    if (util.target.isStage) return 10000;
    let targetX = 0;
    let targetY = 0;
    if (args.DISTANCETOMENU === "_mouse_") {
      targetX = util.ioQuery("mouse", "getScratchX") as number;
      targetY = util.ioQuery("mouse", "getScratchY") as number;
    } else {
      const distTarget = this.runtime.getSpriteTargetByName(Cast.toString(args.DISTANCETOMENU));
      if (!distTarget) return 10000;
      targetX = distTarget.x;
      targetY = distTarget.y;
    }
    const dx = util.target.x - targetX;
    const dy = util.target.y - targetY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getLoudness(): number {
    const audio = this.runtime.audioEngine;
    if (!audio) return -1;
    // Ukur sekali per step.
    const timeSinceLoudness = this.timer.time() - this.cachedLoudnessTimestamp;
    if (timeSinceLoudness < this.runtime.currentStepTime) return this.cachedLoudness;
    this.cachedLoudnessTimestamp = this.timer.time();
    this.cachedLoudness = audio.getLoudness();
    return this.cachedLoudness;
  }

  private askAndWait(args: BlockArgs, util: BlockUtility): Promise<void> {
    const target = util.target;
    return new Promise<void>((resolve) => {
      const isQuestionAsked = this.questionList.length > 0;
      this.questionList.push({
        question: String(args.QUESTION),
        resolve,
        target,
        wasVisible: target.visible,
        wasStage: target.isStage,
      });
      if (!isQuestionAsked) this.askNextQuestion();
    });
  }

  private onAnswer(answer: string): void {
    this.answer = answer;
    const q = this.questionList.shift();
    if (q) {
      // Sembunyikan balon "say" pertanyaan kalau penanya terlihat dan bukan stage.
      if (q.wasVisible && !q.wasStage) this.runtime.emit("SAY", { target: q.target, type: "say", text: "" });
      q.resolve();
      this.askNextQuestion();
    }
  }

  private resetAnswer(): void {
    this.answer = "";
  }

  private askNextQuestion(): void {
    const q = this.questionList[0];
    if (!q) return;
    // Penanya terlihat (bukan stage): pertanyaan di balon, kotak jawaban tanpa teks.
    if (q.wasVisible && !q.wasStage) {
      this.runtime.emit("SAY", { target: q.target, type: "say", text: q.question });
      this.runtime.emit("QUESTION", { question: "" });
    } else {
      this.runtime.emit("QUESTION", { question: q.question });
    }
  }

  private clearAllQuestions(): void {
    this.questionList = [];
    this.runtime.emit("QUESTION", { question: null });
  }

  private clearTargetQuestions(stopTarget: ITarget): void {
    const currentlyAsking = this.questionList.length > 0 && this.questionList[0]?.target === stopTarget;
    this.questionList = this.questionList.filter((q) => q.target !== stopTarget);
    if (currentlyAsking) {
      this.runtime.emit("SAY", { target: stopTarget, type: "say", text: "" });
      if (this.questionList.length > 0) {
        this.askNextQuestion();
      } else {
        this.runtime.emit("QUESTION", { question: null });
      }
    }
  }
}

export function createSensingBlocks(runtime: IRuntime, opts?: SensingBlocksOptions): BlockPackage {
  return new SensingBlocks(runtime, opts);
}
