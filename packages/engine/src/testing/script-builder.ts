/**
 * Pembuat skrip untuk tes engine (tidak dipakai kode produksi). Menghasilkan blok tak terkompresi
 * persis bentuk memori scratch-vm: setiap input literal menjadi shadow (math_number / text).
 * Agent blok lain boleh memakai helper ini di tes mereka.
 */
import type { Block, BlockField, BlockMutation, ScratchValue } from "../types/project-model";
import type { IBlocksContainer } from "../types/runtime";

export interface BlockSpec {
  opcode: string;
  id?: string;
  /** Field: string/angka, atau {value, id} untuk VARIABLE/LIST/BROADCAST_OPTION. */
  fields?: Record<string, ScratchValue | { value: string; id: string; variableType?: "" | "list" | "broadcast_msg" }>;
  /** Input: literal (shadow math_number/text) atau blok reporter. */
  inputs?: Record<string, ScratchValue | BlockSpec | InputWithShadow>;
  substack?: BlockSpec[];
  substack2?: BlockSpec[];
  mutation?: Partial<BlockMutation>;
  shadow?: boolean;
}

/** Reporter yang menutupi shadow (mis. variabel di atas angka). */
export interface InputWithShadow {
  block: BlockSpec;
  shadow: ScratchValue | BlockSpec;
}

let counter = 0;
export function resetIds(): void {
  counter = 0;
}
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}${counter}`;
}

function isSpec(v: unknown): v is BlockSpec {
  return typeof v === "object" && v !== null && "opcode" in v;
}
function isWithShadow(v: unknown): v is InputWithShadow {
  return typeof v === "object" && v !== null && "block" in v && "shadow" in v;
}

function literalShadow(value: ScratchValue): BlockSpec {
  if (typeof value === "number") return { opcode: "math_number", fields: { NUM: value }, shadow: true };
  return { opcode: "text", fields: { TEXT: String(value) }, shadow: true };
}

function toFields(spec: BlockSpec): Record<string, BlockField> {
  const fields: Record<string, BlockField> = {};
  for (const name in spec.fields ?? {}) {
    const raw = spec.fields?.[name];
    if (raw === undefined) continue;
    if (typeof raw === "object") {
      fields[name] = { name, value: raw.value, id: raw.id, ...(raw.variableType !== undefined ? { variableType: raw.variableType } : {}) };
    } else {
      fields[name] = { name, value: typeof raw === "boolean" ? String(raw) : raw };
    }
  }
  return fields;
}

/** Buat satu blok (beserta anak) dan kembalikan id-nya. */
function buildBlock(out: Block[], spec: BlockSpec, parent: string | null, topLevel: boolean): string {
  const id = spec.id ?? nextId(spec.shadow ? "s" : "b");
  const block: Block = {
    id,
    opcode: spec.opcode,
    next: null,
    parent,
    inputs: {},
    fields: toFields(spec),
    shadow: Boolean(spec.shadow),
    topLevel,
    ...(topLevel ? { x: 0, y: 0 } : {}),
  };
  if (spec.mutation) block.mutation = { tagName: "mutation", children: [], ...spec.mutation };
  out.push(block);
  for (const name in spec.inputs ?? {}) {
    const raw = spec.inputs?.[name];
    if (raw === undefined) continue;
    if (isWithShadow(raw)) {
      const shadowSpec = isSpec(raw.shadow) ? { ...raw.shadow, shadow: true } : literalShadow(raw.shadow);
      const shadowId = buildBlock(out, shadowSpec, id, false);
      const blockId = buildBlock(out, raw.block, id, false);
      block.inputs[name] = { name, block: blockId, shadow: shadowId };
    } else if (isSpec(raw)) {
      const childId = buildBlock(out, raw, id, false);
      block.inputs[name] = { name, block: childId, shadow: raw.shadow ? childId : null };
    } else {
      const shadowId = buildBlock(out, literalShadow(raw), id, false);
      block.inputs[name] = { name, block: shadowId, shadow: shadowId };
    }
  }
  if (spec.substack) {
    const first = buildStack(out, spec.substack, id);
    block.inputs.SUBSTACK = { name: "SUBSTACK", block: first, shadow: null };
  }
  if (spec.substack2) {
    const first = buildStack(out, spec.substack2, id);
    block.inputs.SUBSTACK2 = { name: "SUBSTACK2", block: first, shadow: null };
  }
  return id;
}

function buildStack(out: Block[], specs: BlockSpec[], parent: string | null, topLevel = false): string | null {
  let firstId: string | null = null;
  let prev: Block | null = null;
  for (const spec of specs) {
    const id = buildBlock(out, spec, prev ? prev.id : parent, topLevel && prev === null);
    const block = out.find((b) => b.id === id) ?? null;
    if (prev) prev.next = id;
    else firstId = id;
    prev = block;
  }
  return firstId;
}

/** Buat blok-blok sebuah stack (top-level). */
export function makeScriptBlocks(specs: BlockSpec[]): { topId: string; blocks: Block[] } {
  const out: Block[] = [];
  const topId = buildStack(out, specs, null, true);
  if (!topId) throw new Error("makeScriptBlocks: stack kosong");
  return { topId, blocks: out };
}

/** Tambahkan skrip ke container; kembalikan id blok paling atas. */
export function addScript(container: IBlocksContainer, specs: BlockSpec[]): string {
  const { topId, blocks } = makeScriptBlocks(specs);
  for (const block of blocks) container.createBlock(block);
  return topId;
}

/** Definisi procedure: procedures_definition -> custom_block (procedures_prototype + argumen). */
export function procedureDefinition(
  proccode: string,
  argNames: string[],
  body: BlockSpec[],
  warp = false,
  argIds: string[] = argNames.map((n) => `arg_${n}`),
): BlockSpec[] {
  return [
    {
      opcode: "procedures_definition",
      inputs: {
        custom_block: {
          opcode: "procedures_prototype",
          shadow: true,
          mutation: {
            proccode,
            argumentids: JSON.stringify(argIds),
            argumentnames: JSON.stringify(argNames),
            argumentdefaults: JSON.stringify(argNames.map(() => "")),
            warp: String(warp),
          },
        },
      },
    },
    ...body,
  ];
}

/** Pemanggilan procedure dengan argumen literal/reporter berdasarkan id argumen. */
export function procedureCall(
  proccode: string,
  args: Record<string, ScratchValue | BlockSpec>,
  argIds: string[] = Object.keys(args).map((n) => `arg_${n}`),
): BlockSpec {
  const inputs: Record<string, ScratchValue | BlockSpec> = {};
  Object.keys(args).forEach((name, i) => {
    const value = args[name];
    const id = argIds[i];
    if (value !== undefined && id !== undefined) inputs[id] = value;
  });
  return {
    opcode: "procedures_call",
    inputs,
    mutation: { proccode, argumentids: JSON.stringify(argIds), warp: "false" },
  };
}
