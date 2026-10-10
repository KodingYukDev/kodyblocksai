import type { BlockPackageFactory } from "../types/runtime";
import { createControlBlocks } from "./control";
import { createDataBlocks } from "./data";
import { createEventBlocks } from "./event";
import { createLooksBlocks } from "./looks";
import { createMotionBlocks } from "./motion";
import { createOperatorsBlocks } from "./operators";
import { createProceduresBlocks } from "./procedures";
import { createSensingBlocks } from "./sensing";
import { createSoundBlocks } from "./sound";

/** Urutan pendaftaran sama dengan runtime.js defaultBlockPackages. */
export const CORE_BLOCK_PACKAGES: readonly BlockPackageFactory[] = [
  createControlBlocks,
  createEventBlocks,
  createLooksBlocks,
  createMotionBlocks,
  createOperatorsBlocks,
  createSoundBlocks,
  createSensingBlocks,
  createDataBlocks,
  createProceduresBlocks,
];

export {
  createControlBlocks,
  createDataBlocks,
  createEventBlocks,
  createLooksBlocks,
  createMotionBlocks,
  createOperatorsBlocks,
  createProceduresBlocks,
  createSensingBlocks,
  createSoundBlocks,
};
