/**
 * Primitive kategori Procedures ("Blok Saya") - port baris demi baris scratch-vm 4.8.102
 * src/blocks/scratch3_procedures.js (BSD-3-Clause, lihat THIRD_PARTY.md).
 * Eksekusi prosedur (frame parameter, warp, rekursi) ada di sequencer.stepToProcedure + thread.
 */
import type { ScratchValue } from "../types/project-model";
import type { BlockArgs, BlockPackage, BlockPackageFactory, BlockUtility, IRuntime } from "../types/runtime";

function definition(): void {
  // No-op: blok di bawah definisi dieksekusi sequencer.
}

function call(args: BlockArgs, util: BlockUtility): void {
  if (util.stackFrame.executed) return;
  const procedureCode = args.mutation?.proccode ?? "";
  const paramNamesIdsAndDefaults = util.getProcedureParamNamesIdsAndDefaults(procedureCode);

  // null: definisi tidak ditemukan (blok diseret antar-sprite tanpa definisi). Seperti Scratch 2: no-op.
  if (paramNamesIdsAndDefaults === null) return;

  const [paramNames, paramIds, paramDefaults] = paramNamesIdsAndDefaults;

  // Frame parameter selalu diinisialisasi (walau tanpa argumen) supaya getParam tidak membaca
  // frame prosedur sebelumnya (scratch-vm #1729).
  util.initParams();
  for (let i = 0; i < paramIds.length; i++) {
    const id = paramIds[i] as string;
    const name = paramNames[i] as string;
    if (Object.prototype.hasOwnProperty.call(args, id)) {
      util.pushParam(name, args[id] as ScratchValue);
    } else {
      util.pushParam(name, paramDefaults[i] as ScratchValue);
    }
  }

  util.stackFrame.executed = true;
  util.startProcedure(procedureCode);
}

function argumentReporter(args: BlockArgs, util: BlockUtility): ScratchValue {
  const value = util.getParam(args.VALUE as string);
  // Parameter tidak ditemukan di pemanggilan prosedur terakhir: default selalu 0.
  if (value === null) return 0;
  return value;
}

export const createProceduresBlocks: BlockPackageFactory = (runtime: IRuntime): BlockPackage => {
  void runtime;
  return {
    getPrimitives: () => ({
      procedures_definition: definition,
      procedures_call: call,
      argument_reporter_string_number: argumentReporter,
      argument_reporter_boolean: argumentReporter,
    }),
    getHats: () => ({}),
    getMonitored: () => ({}),
  };
};
