/**
 * Perlengkapan tes engine-core: runtime deterministik + paket primitive minimal yang meniru pola
 * scratch-vm (repeat/forever/wait/if/procedure/broadcast/clone) TANPA bergantung pada paket blok
 * agent lain. Tidak dipakai kode produksi.
 */
import { Cast } from "../cast";
import { Runtime, type RuntimeOptions } from "../runtime";
import { Sprite } from "../sprite";
import { StageLayering } from "../stage-layering";
import type { RenderedTarget } from "../target";
import type { ScratchValue } from "../types/project-model";
import type { BlockArgs, BlockPackage, BlockUtility, FieldRef, IThread } from "../types/runtime";
import type { Costume } from "../types/target";
import type { TimeSource } from "../util/timer";
import type { FakeRenderer } from "./fake-renderer";

/** Jam manual; autoStep > 0 membuat setiap now() maju (agar loop tanpa redraw tetap berakhir). */
export class ManualTime implements TimeSource {
  t = 1000;
  autoStep = 0;
  now(): number {
    const v = this.t;
    this.t += this.autoStep;
    return v;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

export interface TestKit {
  runtime: Runtime;
  time: ManualTime;
  log: string[];
  stage: RenderedTarget;
  addSprite(name: string, opts?: { skin?: [number, number] }): RenderedTarget;
  /** Jalankan n frame; waktu maju 1000/30 ms tiap frame. */
  frames(n: number): void;
}

type Prim = (args: BlockArgs, util: BlockUtility) => unknown;

/** Paket primitive tes (opcode scratch asli agar perilaku sequencer bisa diuji). */
export function testPackage(log: string[]): BlockPackage {
  const p: Record<string, Prim> = {
    control_forever: (_a, util) => util.startBranch(1, true),
    control_repeat: (args, util) => {
      const times = Math.round(Cast.toNumber(args.TIMES));
      const frame = util.stackFrame as { loopCounter?: number };
      if (typeof frame.loopCounter === "undefined") frame.loopCounter = times;
      frame.loopCounter--;
      if (frame.loopCounter >= 0) util.startBranch(1, true);
    },
    control_wait: (args, util) => {
      if (util.stackTimerNeedsInit()) {
        const duration = Math.max(0, 1000 * Cast.toNumber(args.DURATION));
        util.startStackTimer(duration);
        util.runtime.requestRedraw();
        util.yield();
      } else if (!util.stackTimerFinished()) {
        util.yield();
      }
    },
    control_if: (args, util) => {
      if (Cast.toBoolean(args.CONDITION)) util.startBranch(1, false);
    },
    control_if_else: (args, util) => util.startBranch(Cast.toBoolean(args.CONDITION) ? 1 : 2, false),
    control_stop: (args, util) => {
      const option = args.STOP_OPTION;
      if (option === "all") util.stopAll();
      else if (option === "other scripts in sprite" || option === "other scripts in stage") util.stopOtherTargetThreads();
      else if (option === "this script") util.stopThisScript();
    },
    control_create_clone_of: (_a, util) => {
      const clone = util.target.makeClone();
      if (clone) {
        util.runtime.addTarget(clone);
        clone.goBehindOther(util.target);
      }
    },
    control_delete_this_clone: (_a, util) => {
      if (util.target.isOriginal) return;
      util.runtime.disposeTarget(util.target);
      util.runtime.stopForTarget(util.target);
    },
    procedures_call: (args, util) => {
      const frame = util.stackFrame as { executed?: boolean };
      if (frame.executed) return;
      const proccode = String(args.mutation?.proccode ?? "");
      const params = util.getProcedureParamNamesIdsAndDefaults(proccode);
      if (params === null) return;
      const [names, ids, defaults] = params;
      util.initParams();
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i] ?? "";
        const name = names[i] ?? "";
        util.pushParam(name, Object.prototype.hasOwnProperty.call(args, id) ? (args[id] as ScratchValue) : (defaults[i] ?? ""));
      }
      frame.executed = true;
      util.startProcedure(proccode);
    },
    argument_reporter_string_number: (args, util) => util.getParam(String(args.VALUE)) ?? 0,
    event_broadcast: (args, util) => {
      const opt = args.BROADCAST_OPTION as FieldRef;
      util.startHats("event_whenbroadcastreceived", { BROADCAST_OPTION: opt.name });
    },
    event_broadcastandwait: (args, util) => {
      const frame = util.stackFrame as { started?: IThread[] };
      const opt = args.BROADCAST_OPTION as FieldRef;
      if (!frame.started) {
        frame.started = util.startHats("event_whenbroadcastreceived", { BROADCAST_OPTION: opt.name });
        if (frame.started.length === 0) return;
      }
      const started = frame.started;
      if (started.some((t) => util.runtime.threads.indexOf(t) !== -1)) {
        if (started.every((t) => util.runtime.isWaitingThread(t))) util.yieldTick();
        else util.yield();
      }
    },
    data_variable: (args, util) => {
      const ref = args.VARIABLE as FieldRef;
      return util.target.lookupOrCreateVariable(ref.id, ref.name).value as ScratchValue;
    },
    data_setvariableto: (args, util) => {
      const ref = args.VARIABLE as FieldRef;
      util.target.lookupOrCreateVariable(ref.id, ref.name).value = args.VALUE as ScratchValue;
    },
    data_changevariableby: (args, util) => {
      const ref = args.VARIABLE as FieldRef;
      const v = util.target.lookupOrCreateVariable(ref.id, ref.name);
      v.value = Cast.toNumber(v.value) + Cast.toNumber(args.VALUE);
    },
    operator_add: (args) => Cast.toNumber(args.NUM1) + Cast.toNumber(args.NUM2),
    operator_join: (args) => Cast.toString(args.STRING1) + Cast.toString(args.STRING2),
    operator_gt: (args) => Cast.compare(args.OPERAND1, args.OPERAND2) > 0,
    motion_changexby: (args, util) => util.target.setXY(util.target.x + Cast.toNumber(args.DX), util.target.y),
    test_log: (args) => {
      log.push(Cast.toString(args.TEXT));
    },
    test_redraw: (args, util) => {
      log.push(Cast.toString(args.TEXT));
      util.runtime.requestRedraw();
    },
    test_async: (args) => Promise.resolve(Cast.toString(args.TEXT)),
    test_yieldtick: (_a, util) => {
      const frame = util.stackFrame as { done?: boolean };
      if (!frame.done) {
        frame.done = true;
        util.yieldTick();
      }
    },
    test_edge: (args, util) => {
      const v = util.runtime.getTargetForStage()?.lookupVariableByNameAndType("edge", "");
      void args;
      return Cast.toBoolean(v?.value ?? false);
    },
  };
  return {
    getPrimitives: () => p as unknown as ReturnType<BlockPackage["getPrimitives"]>,
    getHats: () => ({
      event_whenflagclicked: { restartExistingThreads: true },
      event_whenkeypressed: { restartExistingThreads: false },
      event_whenbroadcastreceived: { restartExistingThreads: true },
      event_whenthisspriteclicked: { restartExistingThreads: true },
      event_whenstageclicked: { restartExistingThreads: true },
      control_start_as_clone: { restartExistingThreads: false },
      test_edge: { restartExistingThreads: false, edgeActivated: true },
    }),
    getMonitored: () => ({
      motion_xposition: { isSpriteSpecific: true, getId: (targetId) => `${targetId}_xposition` },
    }),
  };
}

export function makeKit(opts: { renderer?: FakeRenderer; runtime?: Partial<RuntimeOptions> } = {}): TestKit {
  const time = new ManualTime();
  const log: string[] = [];
  const runtime = new Runtime({
    autoStart: false,
    blockPackages: [() => testPackage(log)],
    time,
    renderer: opts.renderer ?? null,
    ...opts.runtime,
  });
  const costumeFor = (skin: [number, number] | undefined, name: string): Costume => ({
    name,
    assetId: name,
    md5ext: `${name}.svg`,
    dataFormat: "svg",
    bitmapResolution: 1,
    rotationCenterX: 0,
    rotationCenterY: 0,
    skinId: opts.renderer ? opts.renderer.addSkin(skin?.[0] ?? 100, skin?.[1] ?? 100) : -1,
    size: skin ?? [100, 100],
    asset: null,
  });
  const stageSprite = new Sprite(null, runtime);
  stageSprite.name = "Stage";
  const stage = stageSprite.createClone(StageLayering.BACKGROUND_LAYER);
  stage.isStage = true;
  stageSprite.costumes = [costumeFor([480, 360], "backdrop1")];
  runtime.addTarget(stage);
  stage.updateAllDrawableProperties();
  const kit: TestKit = {
    runtime,
    time,
    log,
    stage,
    addSprite(name, o = {}) {
      const sprite = new Sprite(null, runtime);
      sprite.name = name;
      const target = sprite.createClone(StageLayering.SPRITE_LAYER);
      sprite.costumes = [costumeFor(o.skin, `${name}-c1`), costumeFor(o.skin, `${name}-c2`)];
      runtime.addTarget(target);
      target.updateAllDrawableProperties();
      return target;
    },
    frames(n) {
      for (let i = 0; i < n; i++) {
        runtime.step();
        time.advance(1000 / 30);
      }
    },
  };
  return kit;
}
