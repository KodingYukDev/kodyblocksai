/**
 * Primitive kategori Event - padanan scratch-vm src/blocks/scratch3_event.js.
 * Opcode wajib: CORE_OPCODES dengan owner "packages/engine/src/blocks/event.ts" di ../opcodes.ts.
 * Pemilik: agent engine-control-events.
 *
 * Diport dari scratch-vm 4.8.102 (BSD-3-Clause, _reference/bsd3-local), lihat THIRD_PARTY.md.
 * Pencocokan field hat (KEY_OPTION, BROADCAST_OPTION, BACKDROP, ...) dilakukan runtime.startHats
 * (huruf besar), edge-trigger dilakukan execute (nilai hat false -> true).
 */
import { Cast } from "../cast";
import type {
  BlockPackage,
  BlockUtility,
  FieldRef,
  HatMetadata,
  IRuntime,
  IThread,
  MonitoredMetadata,
  PrimitiveFn,
} from "../types/runtime";
import type { ITarget, Variable } from "../types/target";

export const HAT_WHEN_FLAG_CLICKED = "event_whenflagclicked";
export const HAT_WHEN_KEY_PRESSED = "event_whenkeypressed";
export const HAT_WHEN_THIS_SPRITE_CLICKED = "event_whenthisspriteclicked";
export const HAT_WHEN_STAGE_CLICKED = "event_whenstageclicked";
export const HAT_WHEN_BACKDROP_SWITCHES_TO = "event_whenbackdropswitchesto";
export const HAT_WHEN_GREATER_THAN = "event_whengreaterthan";
export const HAT_WHEN_BROADCAST_RECEIVED = "event_whenbroadcastreceived";
export const HAT_WHEN_TOUCHING_OBJECT = "event_whentouchingobject";

/** Metadata hat persis Scratch3EventBlocks.getHats(). */
export const EVENT_HATS: Readonly<Record<string, HatMetadata>> = Object.freeze({
  [HAT_WHEN_FLAG_CLICKED]: { restartExistingThreads: true },
  [HAT_WHEN_KEY_PRESSED]: { restartExistingThreads: false },
  [HAT_WHEN_THIS_SPRITE_CLICKED]: { restartExistingThreads: true },
  [HAT_WHEN_TOUCHING_OBJECT]: { restartExistingThreads: false, edgeActivated: true },
  [HAT_WHEN_STAGE_CLICKED]: { restartExistingThreads: true },
  [HAT_WHEN_BACKDROP_SWITCHES_TO]: { restartExistingThreads: true },
  [HAT_WHEN_GREATER_THAN]: { restartExistingThreads: false, edgeActivated: true },
  [HAT_WHEN_BROADCAST_RECEIVED]: { restartExistingThreads: true },
});

export interface EventBlockPackage extends BlockPackage {
  getHats(): Record<string, HatMetadata>;
  getMonitored(): Record<string, MonitoredMetadata>;
}

/** State broadcast-and-wait di util.stackFrame. */
interface BroadcastWaitFrame {
  broadcastVar?: Variable;
  startedThreads?: IThread[];
}

function lookupBroadcast(util: BlockUtility, option: unknown): Variable | undefined {
  const ref = option as FieldRef;
  return util.runtime.getTargetForStage()?.lookupBroadcastMsg(ref.id, ref.name);
}

export function createEventBlocks(runtime: IRuntime): EventBlockPackage {
  const touchingObject: PrimitiveFn = (args, util) =>
    // scratch-vm meneruskan nilai menu apa adanya (tanpa cast).
    util.target.isTouchingObject(args.TOUCHINGOBJECTMENU as string);

  const hatGreaterThanPredicate: PrimitiveFn = (args, util) => {
    const option = Cast.toString(args.WHENGREATERTHANMENU).toLowerCase();
    const value = Cast.toNumber(args.VALUE);
    switch (option) {
      case "timer":
        return (util.ioQuery("clock", "projectTimer") as number) > value;
      case "loudness":
        // scratch-vm: `audioEngine && audioEngine.getLoudness() > value` (falsy tanpa audio).
        return runtime.audioEngine ? runtime.audioEngine.getLoudness() > value : false;
    }
    return false;
  };

  const broadcast: PrimitiveFn = (args, util) => {
    const broadcastVar = lookupBroadcast(util, args.BROADCAST_OPTION);
    if (broadcastVar) {
      util.startHats(HAT_WHEN_BROADCAST_RECEIVED, { BROADCAST_OPTION: broadcastVar.name });
    }
  };

  const broadcastAndWait: PrimitiveFn = (args, util) => {
    const frame = util.stackFrame as BroadcastWaitFrame;
    if (!frame.broadcastVar) {
      frame.broadcastVar = lookupBroadcast(util, args.BROADCAST_OPTION);
    }
    if (!frame.broadcastVar) return;
    const broadcastOption = frame.broadcastVar.name;
    // Sudah pernah memulai thread?
    if (!frame.startedThreads) {
      frame.startedThreads = util.startHats(HAT_WHEN_BROADCAST_RECEIVED, { BROADCAST_OPTION: broadcastOption });
      if (frame.startedThreads.length === 0) {
        // Tidak ada yang dimulai.
        return;
      }
    }
    const started = frame.startedThreads;
    // Seperti Scratch 2: thread dianggap masih ditunggu selama masih ada di runtime.threads
    // (termasuk yang sudah DONE tetapi belum dibersihkan sequencer).
    const waiting = started.some((t) => runtime.threads.indexOf(t) !== -1);
    if (waiting) {
      // Bila semua thread menunggu tick berikutnya atau lebih lama, ikut yield satu tick.
      if (started.every((t) => runtime.isWaitingThread(t))) {
        util.yieldTick();
      } else {
        util.yield();
      }
    }
  };

  const primitives: Record<string, PrimitiveFn> = {
    event_whentouchingobject: touchingObject,
    event_broadcast: broadcast,
    event_broadcastandwait: broadcastAndWait,
    event_whengreaterthan: hatGreaterThanPredicate,
  };

  return {
    getPrimitives: () => ({ ...primitives }),
    getHats: () => {
      const hats: Record<string, HatMetadata> = {};
      for (const [k, v] of Object.entries(EVENT_HATS)) hats[k] = { ...v };
      return hats;
    },
    getMonitored: () => ({}),
  };
}

// ---------------------------------------------------------------------------
// Pemicu hat dari IO / looks (urutan & argumen persis scratch-vm)
// ---------------------------------------------------------------------------

/**
 * Padanan listener KEY_PRESSED di Scratch3EventBlocks: hat tombol spesifik dulu, lalu "any".
 * `scratchKey` = nama Scratch hasil pemetaan keyboard ("space", "left arrow", "a", ...).
 * Dipanggil keyboard (engine-io) setiap keydown.
 */
export function startWhenKeyPressedHats(runtime: IRuntime, scratchKey: string): IThread[] {
  const a = runtime.startHats(HAT_WHEN_KEY_PRESSED, { KEY_OPTION: scratchKey }) ?? [];
  const b = runtime.startHats(HAT_WHEN_KEY_PRESSED, { KEY_OPTION: "any" }) ?? [];
  return a.concat(b);
}

/**
 * Padanan Mouse._activateClickHats: kedua hat klik dipicu untuk target yang diklik
 * (sengaja tanpa cek isStage, persis scratch-vm).
 */
export function startClickHats(runtime: IRuntime, target: ITarget): IThread[] {
  const a = runtime.startHats(HAT_WHEN_THIS_SPRITE_CLICKED, undefined, target) ?? [];
  const b = runtime.startHats(HAT_WHEN_STAGE_CLICKED, undefined, target) ?? [];
  return a.concat(b);
}

/** Padanan looks _setBackdrop: memicu "when backdrop switches to" dengan nama costume stage. */
export function startBackdropHats(runtime: IRuntime, backdropName: string): IThread[] {
  return runtime.startHats(HAT_WHEN_BACKDROP_SWITCHES_TO, { BACKDROP: backdropName }) ?? [];
}
