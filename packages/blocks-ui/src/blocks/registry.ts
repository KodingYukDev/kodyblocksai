/**
 * Registri definisi JSON blok: core scratch-blocks (generated) + override + ekstensi (pen, music, AI)
 * yang dikonversi dari ExtensionInfo. Renderer membaca registri ini.
 */
import type { ExtensionInfo } from "@kody/engine";
import { convertExtension, type ConvertedExtension, type DynamicMenuResolver } from "./extension-json";
import { SCRATCH_BLOCKS_JSON } from "./generated/scratch-blocks-json";
import type { ScratchBlockJson } from "./json-types";
import { BLOCK_OVERRIDES } from "./overrides";

export class BlockRegistry {
  private readonly defs = new Map<string, ScratchBlockJson>();
  private readonly extensions = new Map<string, ExtensionInfo>();

  constructor(withCore = true) {
    if (!withCore) return;
    for (const [opcode, json] of Object.entries(SCRATCH_BLOCKS_JSON)) this.defs.set(opcode, json);
    for (const [opcode, json] of Object.entries(BLOCK_OVERRIDES)) this.defs.set(opcode, json);
  }

  get(opcode: string): ScratchBlockJson | undefined {
    return this.defs.get(opcode);
  }

  has(opcode: string): boolean {
    return this.defs.has(opcode);
  }

  opcodes(): string[] {
    return [...this.defs.keys()];
  }

  register(opcode: string, json: ScratchBlockJson): void {
    this.defs.set(opcode, json);
  }

  /** Daftarkan (atau perbarui) semua blok & menu sebuah ekstensi. */
  registerExtension(
    info: ExtensionInfo,
    opts: { isStage?: boolean; resolveDynamicMenu?: DynamicMenuResolver } = {},
  ): ConvertedExtension {
    const converted = convertExtension(info, opts);
    for (const [opcode, json] of Object.entries(converted.blocks)) this.defs.set(opcode, json);
    this.extensions.set(info.id, info);
    return converted;
  }

  extensionInfo(id: string): ExtensionInfo | undefined {
    return this.extensions.get(id);
  }
}

let shared: BlockRegistry | null = null;

/** Registri bersama (core saja sampai ekstensi didaftarkan). */
export function getDefaultRegistry(): BlockRegistry {
  shared ??= new BlockRegistry();
  return shared;
}
