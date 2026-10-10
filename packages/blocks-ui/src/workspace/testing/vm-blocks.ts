/** KHUSUS TES: alias reducer + pembuat blok ringkas. */
import type { Block } from "@kody/engine";
import { BlockReducer } from "../reducer";

export { BlockReducer as VmBlocksSim };

/** Pembuat blok ringkas untuk tes. */
export function mk(id: string, opcode: string, extra: Partial<Block> = {}): Block {
  return {
    id,
    opcode,
    next: null,
    parent: null,
    inputs: {},
    fields: {},
    shadow: false,
    topLevel: false,
    ...extra,
  };
}
