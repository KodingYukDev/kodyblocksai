/**
 * Primitive kategori Control - padanan scratch-vm src/blocks/scratch3_control.js.
 * Opcode wajib: CORE_OPCODES dengan owner "packages/engine/src/blocks/control.ts" di ../opcodes.ts.
 * Pemilik: agent engine-control-events.
 *
 * Logika tiap primitive diport dari scratch-vm 4.8.102 (BSD-3-Clause, _reference/bsd3-local),
 * lihat THIRD_PARTY.md. Detail yang sengaja dipertahankan demi parity:
 * - repeat: Math.round(Cast.toNumber(TIMES)), counter disimpan di stackFrame, satu cabang per eksekusi.
 * - for_each: memakai Number(VALUE) (bukan Cast), sehingga "abc" -> NaN -> nol iterasi.
 * - wait: yield pertama selalu terjadi (walau durasi 0) dan meminta redraw.
 * - counter (get/incr/clear) adalah state per instance paket, reset saat runtime dibuang.
 */
import { Cast } from "../cast";
import type { BlockMutation } from "../types/project-model";
import type {
  BlockArgs,
  BlockPackage,
  FieldRef,
  HatMetadata,
  IRuntime,
  MonitoredMetadata,
  PrimitiveFn,
} from "../types/runtime";
import type { ITarget } from "../types/target";

/** Nilai field STOP_OPTION persis scratch-blocks / scratch-vm. */
export const STOP_ALL = "all";
export const STOP_THIS_SCRIPT = "this script";
export const STOP_OTHER_SCRIPTS_IN_SPRITE = "other scripts in sprite";
export const STOP_OTHER_SCRIPTS_IN_STAGE = "other scripts in stage";

/** Nilai menu clone untuk diri sendiri. */
export const CLONE_MYSELF = "_myself_";

/** Paket Control + akses counter (dipakai runtime saat dispose dan oleh tes). */
export interface ControlBlockPackage extends BlockPackage {
  getHats(): Record<string, HatMetadata>;
  getMonitored(): Record<string, MonitoredMetadata>;
  /** Nilai counter tersembunyi (control_get_counter). */
  getCounter(): number;
  /** Reset counter (scratch-vm memanggilnya pada RUNTIME_DISPOSED). */
  clearCounter(): void;
}

function readStackNumber(frame: Record<string, unknown>, key: string): number | undefined {
  const v = frame[key];
  return typeof v === "number" ? v : undefined;
}

export function createControlBlocks(runtime: IRuntime): ControlBlockPackage {
  /** "counter" kompatibilitas Scratch 2.0. */
  let counter = 0;
  const clearCounter = (): void => {
    counter = 0;
  };

  // scratch-vm: this.runtime.on('RUNTIME_DISPOSED', this.clearCounter). Event ini belum ada di
  // RuntimeEventMap; didaftarkan longgar agar langsung berfungsi begitu runtime meng-emit-nya.
  subscribeLoose(runtime, "RUNTIME_DISPOSED", clearCounter);

  const repeat: PrimitiveFn = (args, util) => {
    const times = Math.round(Cast.toNumber(args.TIMES));
    const frame = util.stackFrame;
    // Inisialisasi loop.
    if (readStackNumber(frame, "loopCounter") === undefined) {
      frame.loopCounter = times;
    }
    // Hanya satu cabang per eksekusi; saat cabang selesai, repeat dieksekusi lagi.
    const left = (readStackNumber(frame, "loopCounter") ?? 0) - 1;
    frame.loopCounter = left;
    if (left >= 0) {
      util.startBranch(1, true);
    }
  };

  const repeatUntil: PrimitiveFn = (args, util) => {
    const condition = Cast.toBoolean(args.CONDITION);
    if (!condition) {
      util.startBranch(1, true);
    }
  };

  const repeatWhile: PrimitiveFn = (args, util) => {
    const condition = Cast.toBoolean(args.CONDITION);
    if (condition) {
      util.startBranch(1, true);
    }
  };

  const forEach: PrimitiveFn = (args, util) => {
    const ref = args.VARIABLE as FieldRef;
    const variable = util.target.lookupOrCreateVariable(ref.id, ref.name);
    const frame = util.stackFrame;
    if (readStackNumber(frame, "index") === undefined) {
      frame.index = 0;
    }
    const index = readStackNumber(frame, "index") ?? 0;
    // Sengaja Number() (bukan Cast.toNumber) persis scratch-vm.
    if (index < Number(args.VALUE)) {
      frame.index = index + 1;
      variable.value = index + 1;
      util.startBranch(1, true);
    }
  };

  const waitUntil: PrimitiveFn = (args, util) => {
    const condition = Cast.toBoolean(args.CONDITION);
    if (!condition) {
      util.yield();
    }
  };

  const forever: PrimitiveFn = (_args, util) => {
    util.startBranch(1, true);
  };

  const wait: PrimitiveFn = (args, util) => {
    if (util.stackTimerNeedsInit()) {
      const duration = Math.max(0, 1000 * Cast.toNumber(args.DURATION));
      util.startStackTimer(duration);
      runtime.requestRedraw();
      util.yield();
    } else if (!util.stackTimerFinished()) {
      util.yield();
    }
  };

  const ifThen: PrimitiveFn = (args, util) => {
    const condition = Cast.toBoolean(args.CONDITION);
    if (condition) {
      util.startBranch(1, false);
    }
  };

  const ifElse: PrimitiveFn = (args, util) => {
    const condition = Cast.toBoolean(args.CONDITION);
    if (condition) {
      util.startBranch(1, false);
    } else {
      util.startBranch(2, false);
    }
  };

  const stop: PrimitiveFn = (args, util) => {
    const option = args.STOP_OPTION;
    if (option === STOP_ALL) {
      util.stopAll();
    } else if (option === STOP_OTHER_SCRIPTS_IN_SPRITE || option === STOP_OTHER_SCRIPTS_IN_STAGE) {
      util.stopOtherTargetThreads();
    } else if (option === STOP_THIS_SCRIPT) {
      util.stopThisScript();
    }
  };

  const createClone: PrimitiveFn = (args, util) => {
    // scratch-vm meng-cast argumen ke string dan menulisnya kembali ke args.
    const option = Cast.toString(args.CLONE_OPTION);
    args.CLONE_OPTION = option;
    const cloneTarget: ITarget | undefined =
      option === CLONE_MYSELF ? util.target : runtime.getSpriteTargetByName(option);
    if (!cloneTarget) return;
    const newClone = cloneTarget.makeClone();
    if (newClone) {
      runtime.addTarget(newClone);
      // Letakkan di belakang target asal.
      newClone.goBehindOther(cloneTarget);
    }
  };

  const deleteClone: PrimitiveFn = (_args, util) => {
    if (util.target.isOriginal) return;
    runtime.disposeTarget(util.target);
    runtime.stopForTarget(util.target);
  };

  const getCounter: PrimitiveFn = () => counter;
  const incrCounter: PrimitiveFn = () => {
    counter++;
  };
  const clearCounterPrimitive: PrimitiveFn = () => {
    clearCounter();
  };

  const allAtOnce: PrimitiveFn = (_args, util) => {
    // Kompatibilitas 2.0: menjalankan isi seperti "if 1 = 1" (bukan warp).
    util.startBranch(1, false);
  };

  const primitives: Record<string, PrimitiveFn> = {
    control_repeat: repeat,
    control_repeat_until: repeatUntil,
    control_while: repeatWhile,
    control_for_each: forEach,
    control_forever: forever,
    control_wait: wait,
    control_wait_until: waitUntil,
    control_if: ifThen,
    control_if_else: ifElse,
    control_stop: stop,
    control_create_clone_of: createClone,
    control_delete_this_clone: deleteClone,
    control_get_counter: getCounter,
    control_incr_counter: incrCounter,
    control_clear_counter: clearCounterPrimitive,
    control_all_at_once: allAtOnce,
  };

  return {
    getPrimitives: () => ({ ...primitives }),
    getHats: () => ({
      control_start_as_clone: { restartExistingThreads: false },
    }),
    getMonitored: () => ({}),
    getCounter: () => counter,
    clearCounter,
  };
}

/** Daftarkan listener untuk event yang (belum) ada di RuntimeEventMap. */
export function subscribeLoose(runtime: IRuntime, event: string, fn: () => void): void {
  const on = (runtime as unknown as { on?: (e: string, f: () => void) => unknown }).on;
  if (typeof on === "function") on.call(runtime, event, fn);
}

// ---------------------------------------------------------------------------
// Pembantu editor (dipakai blocks-ui) - perilaku scratch-blocks control_stop & scratch-gui cloneMenu
// ---------------------------------------------------------------------------

/** Mutasi control_stop: hasnext "true" hanya untuk "other scripts in sprite/stage". */
export function controlStopHasNext(option: unknown): boolean {
  return option === STOP_OTHER_SCRIPTS_IN_SPRITE || option === STOP_OTHER_SCRIPTS_IN_STAGE;
}

export function controlStopMutation(option: unknown): BlockMutation {
  return { tagName: "mutation", children: [], hasnext: controlStopHasNext(option) ? "true" : "false" };
}

/** Membaca hasnext dari mutation (atribut string "true" atau boolean). */
export function mutationHasNext(mutation: BlockArgs["mutation"]): boolean {
  if (!mutation) return false;
  const v = mutation.hasnext;
  return v === true || v === "true";
}

/**
 * Opsi dropdown control_stop [label, value]. Bila ada blok tersambung di bawahnya, hanya opsi
 * "other scripts" (scratch-blocks). Stage memakai nilai "other scripts in stage".
 */
export function controlStopOptions(
  nextConnected: boolean,
  isStage: boolean,
  labels: { all: string; thisScript: string; other: string } = {
    all: "all",
    thisScript: "this script",
    other: isStage ? "other scripts in stage" : "other scripts in sprite",
  },
): [string, string][] {
  const other: [string, string] = [labels.other, isStage ? STOP_OTHER_SCRIPTS_IN_STAGE : STOP_OTHER_SCRIPTS_IN_SPRITE];
  if (nextConnected) return [other];
  return [[labels.all, STOP_ALL], [labels.thisScript, STOP_THIS_SCRIPT], other];
}

/** Nama sprite asli (bukan stage, bukan target yang sedang diedit) urut seperti runtime.targets. */
export function spriteMenuNames(targets: readonly ITarget[], editingTarget: ITarget | null): string[] {
  const names: string[] = [];
  for (const t of targets) {
    if (!t.isOriginal || t.isStage || t === editingTarget) continue;
    names.push(t.sprite.name);
  }
  return names;
}

/** Menu control_create_clone_of_menu persis scratch-gui cloneMenu. */
export function cloneMenuOptions(
  targets: readonly ITarget[],
  editingTarget: ITarget | null,
  myselfLabel = "myself",
): [string, string][] {
  const sprites = spriteMenuNames(targets, editingTarget).map((n): [string, string] => [n, n]);
  if (editingTarget?.isStage) {
    return sprites.length === 0 ? [["", ""]] : sprites;
  }
  return [[myselfLabel, CLONE_MYSELF] as [string, string]].concat(sprites);
}
