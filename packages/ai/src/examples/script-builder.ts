/**
 * Pembuat skrip blok kecil untuk contoh project AI (bentuk Block engine = project.json Scratch
 * versi tak terkompresi). Hanya dipakai examples/, tanpa DOM.
 */
import type { Block } from "@kody/engine";

export type Input =
  | { num: number | string }
  | { text: string }
  | { menu: string; field: string; value: string }
  | { block: BlockSpec };

export interface BlockSpec {
  opcode: string;
  inputs?: Record<string, Input>;
  fields?: Record<string, string>;
  /** Isi SUBSTACK (dan SUBSTACK2) untuk blok C. */
  substack?: BlockSpec[];
  substack2?: BlockSpec[];
}

export const num = (n: number | string): Input => ({ num: n });
export const text = (t: string): Input => ({ text: t });
export const menu = (opcode: string, field: string, value: string): Input => ({ menu: opcode, field, value });
export const reporter = (spec: BlockSpec): Input => ({ block: spec });

export class ScriptBuilder {
  readonly blocks: Record<string, Block> = {};
  private n = 0;
  /** y bebas berikutnya per kolom x, supaya skrip yang ditumpuk tidak saling menutupi. */
  private readonly columnBottom = new Map<number, number>();

  constructor(private readonly prefix: string) {}

  private id(): string {
    return `${this.prefix}${(this.n++).toString(36)}`;
  }

  private shadow(opcode: string, field: string, value: string | number, parent: string): string {
    const id = this.id();
    this.blocks[id] = {
      id,
      opcode,
      next: null,
      parent,
      inputs: {},
      fields: { [field]: { name: field, value } },
      shadow: true,
      topLevel: false,
    };
    return id;
  }

  private input(name: string, input: Input, parent: string): Block["inputs"][string] {
    if ("num" in input) {
      const s = this.shadow("math_number", "NUM", input.num, parent);
      return { name, block: s, shadow: s };
    }
    if ("text" in input) {
      const s = this.shadow("text", "TEXT", input.text, parent);
      return { name, block: s, shadow: s };
    }
    if ("menu" in input) {
      const s = this.shadow(input.menu, input.field, input.value, parent);
      return { name, block: s, shadow: s };
    }
    const child = this.add(input.block, parent, false);
    return { name, block: child, shadow: null };
  }

  /** Tambah satu blok (beserta input & substack). Mengembalikan id. */
  private add(spec: BlockSpec, parent: string | null, topLevel: boolean, pos?: { x: number; y: number }): string {
    const id = this.id();
    const block: Block = {
      id,
      opcode: spec.opcode,
      next: null,
      parent,
      inputs: {},
      fields: {},
      shadow: false,
      topLevel,
      ...(pos ?? {}),
    };
    this.blocks[id] = block;
    for (const [name, value] of Object.entries(spec.fields ?? {})) block.fields[name] = { name, value };
    for (const [name, input] of Object.entries(spec.inputs ?? {})) block.inputs[name] = this.input(name, input, id);
    if (spec.substack) {
      const first = this.chain(spec.substack, id);
      if (first) block.inputs.SUBSTACK = { name: "SUBSTACK", block: first, shadow: null };
    }
    if (spec.substack2) {
      const first = this.chain(spec.substack2, id);
      if (first) block.inputs.SUBSTACK2 = { name: "SUBSTACK2", block: first, shadow: null };
    }
    return id;
  }

  /** Rangkai blok berurutan di bawah `parent`; mengembalikan id blok pertama. */
  private chain(specs: BlockSpec[], parent: string): string | null {
    let first: string | null = null;
    let prev: string | null = null;
    for (const spec of specs) {
      const id = this.add(spec, prev ?? parent, false);
      if (prev) (this.blocks[prev] as Block).next = id;
      else first = id;
      prev = id;
    }
    return first;
  }

  /** Skrip baru: hat + badan. */
  script(x: number, y: number, hat: BlockSpec, body: BlockSpec[] = []): this {
    const free = this.columnBottom.get(x) ?? -Infinity;
    const topY = Math.max(y, free);
    this.columnBottom.set(x, topY + estimateHeight(body) + HAT_HEIGHT + SCRIPT_GAP);
    const top = this.add(hat, null, true, { x, y: topY });
    const first = this.chain(body, top);
    if (first) (this.blocks[top] as Block).next = first;
    return this;
  }
}

const HAT_HEIGHT = 72;
const STACK_HEIGHT = 48;
const C_EXTRA = 40;
const SCRIPT_GAP = 40;

/** Perkiraan tinggi tumpukan blok (unit workspace, skala 1) untuk tata letak contoh. */
function estimateHeight(specs: readonly BlockSpec[]): number {
  let h = 0;
  for (const spec of specs) {
    h += STACK_HEIGHT;
    if (spec.substack) h += C_EXTRA + Math.max(STACK_HEIGHT, estimateHeight(spec.substack));
    if (spec.substack2) h += C_EXTRA + Math.max(STACK_HEIGHT, estimateHeight(spec.substack2));
  }
  return h;
}
