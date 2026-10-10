/**
 * DSL kecil untuk membuat blok sb3 (format terkompresi project.json Scratch 3) secara programatik.
 *
 *   const blocks = buildBlocks([
 *     [b("event_whenflagclicked"), b("motion_movesteps", { STEPS: 10 })],
 *   ]);
 *
 * Aturan encoding input (sama seperti serializer scratch-vm):
 * - angka -> [1, [4, "n"]], teks -> [1, [10, "s"]], broadcast -> [1, [11, nama, id]]
 * - blok shadow (menu) -> [1, id]; reporter -> [3, id, [10, ""]]; slot boolean -> [2, id]
 * - tumpukan (SUBSTACK) -> [2, idPertama]
 */

export type FieldVal = string | number | readonly [string, string];

export interface BNode {
  kind: "block";
  opcode: string;
  inputs: Record<string, Arg>;
  fields: Record<string, FieldVal>;
  shadow: boolean;
  mutation?: Record<string, unknown>;
  /** Input yang slotnya boolean (tanpa shadow). */
  boolInputs?: readonly string[];
}

export interface LitArg {
  kind: "lit";
  /** Kode primitif sb3 (4..10). */
  code: number;
  value: string | number;
}
export interface BroadcastArg {
  kind: "broadcast";
  name: string;
  id: string;
}
export interface CoverArg {
  kind: "cover";
  block: BNode;
  shadow: BNode;
}
/** Variabel/list terkompresi di dalam input: [3, [12, nama, id], [10, ""]]. */
export interface CompressedVarArg {
  kind: "var12" | "list13";
  name: string;
  id: string;
}

export type Arg = number | string | BNode | BNode[] | LitArg | BroadcastArg | CoverArg | CompressedVarArg;

const BOOLEAN_SLOTS: Record<string, readonly string[]> = {
  control_if: ["CONDITION"],
  control_if_else: ["CONDITION"],
  control_wait_until: ["CONDITION"],
  control_repeat_until: ["CONDITION"],
  control_while: ["CONDITION"],
  operator_and: ["OPERAND1", "OPERAND2"],
  operator_or: ["OPERAND1", "OPERAND2"],
  operator_not: ["OPERAND"],
};

export function b(
  opcode: string,
  inputs: Record<string, Arg> = {},
  fields: Record<string, FieldVal> = {},
  mutation?: Record<string, unknown>,
): BNode {
  const node: BNode = { kind: "block", opcode, inputs, fields, shadow: false };
  if (mutation) node.mutation = mutation;
  return node;
}

/** Blok shadow menu, mis. menu("motion_goto_menu", "TO", "_random_"). */
export function menu(opcode: string, field: string, value: string | number): BNode {
  return { kind: "block", opcode, inputs: {}, fields: { [field]: value }, shadow: true };
}

export const lit = (code: number, value: string | number): LitArg => ({ kind: "lit", code, value });
export const cover = (block: BNode, shadow: BNode): CoverArg => ({ kind: "cover", block, shadow });

export const varId = (name: string): string => `var_${name}`;
export const listId = (name: string): string => `list_${name}`;
export const bcId = (name: string): string => `bc_${name}`;

export const bc = (name: string): BroadcastArg => ({ kind: "broadcast", name, id: bcId(name) });
export const varRef = (name: string): BNode => b("data_variable", {}, { VARIABLE: [name, varId(name)] });
export const listRef = (name: string): BNode => b("data_listcontents", {}, { LIST: [name, listId(name)] });
export const var12 = (name: string): CompressedVarArg => ({ kind: "var12", name, id: varId(name) });
export const list13 = (name: string): CompressedVarArg => ({ kind: "list13", name, id: listId(name) });
export const vf = (name: string): readonly [string, string] => [name, varId(name)];
export const lf = (name: string): readonly [string, string] => [name, listId(name)];

/** set [name] to (value). */
export const setVar = (name: string, value: Arg): BNode => b("data_setvariableto", { VALUE: value }, { VARIABLE: vf(name) });
export const changeVar = (name: string, value: Arg): BNode =>
  b("data_changevariableby", { VALUE: value }, { VARIABLE: vf(name) });
export const flag = (): BNode => b("event_whenflagclicked");
export const wait = (secs: Arg): BNode => b("control_wait", { DURATION: secs });
export const repeat = (times: Arg, body: BNode[]): BNode => b("control_repeat", { TIMES: times, SUBSTACK: body });
export const forever = (body: BNode[]): BNode => b("control_forever", { SUBSTACK: body });
/** <not <>> = true (boolean asli), <not <not <>>> = false. */
export const TRUE = (): BNode => b("operator_not");
export const FALSE = (): BNode => b("operator_not", { OPERAND: b("operator_not") });

// ---------------------------------------------------------------- procedures

export interface ProcArgSpec {
  name: string;
  kind: "s" | "b";
}

const procArgId = (proccode: string, name: string): string =>
  `arg_${proccode.replace(/[^A-Za-z0-9]/g, "")}_${name}`;

/** define <proccode> (args) [run without screen refresh = warp] */
export function procDef(proccode: string, args: ProcArgSpec[], warp: boolean, body: BNode[]): BNode[] {
  const ids = args.map((a) => procArgId(proccode, a.name));
  const protoInputs: Record<string, Arg> = {};
  args.forEach((a, i) => {
    const id = ids[i] ?? "";
    protoInputs[id] = {
      kind: "block",
      opcode: a.kind === "b" ? "argument_reporter_boolean" : "argument_reporter_string_number",
      inputs: {},
      fields: { VALUE: a.name },
      shadow: true,
    };
  });
  const proto: BNode = {
    kind: "block",
    opcode: "procedures_prototype",
    inputs: protoInputs,
    fields: {},
    shadow: true,
    mutation: {
      proccode,
      argumentids: JSON.stringify(ids),
      argumentnames: JSON.stringify(args.map((a) => a.name)),
      argumentdefaults: JSON.stringify(args.map((a) => (a.kind === "b" ? "false" : ""))),
      warp: String(warp),
    },
  };
  return [b("procedures_definition", { custom_block: proto }), ...body];
}

export function procCall(proccode: string, args: ProcArgSpec[], values: Arg[]): BNode {
  const ids = args.map((a) => procArgId(proccode, a.name));
  const inputs: Record<string, Arg> = {};
  ids.forEach((id, i) => {
    const v = values[i];
    if (v !== undefined) inputs[id] = v;
  });
  const node = b("procedures_call", inputs, {}, { proccode, argumentids: JSON.stringify(ids), warp: "false" });
  node.boolInputs = ids.filter((_, i) => args[i]?.kind === "b");
  return node;
}

export const argRef = (name: string, boolean = false): BNode =>
  b(boolean ? "argument_reporter_boolean" : "argument_reporter_string_number", {}, { VALUE: name });

// ---------------------------------------------------------------- serialisasi

type SB3Block = Record<string, unknown>;

class Serializer {
  readonly blocks: Record<string, SB3Block> = {};
  private n = 0;
  constructor(private readonly prefix: string) {}

  private nextId(): string {
    this.n++;
    return `${this.prefix}${this.n}`;
  }

  stack(nodes: readonly BNode[], parent: string | null, top?: { x: number; y: number }): string | null {
    let first: string | null = null;
    let prev: string | null = null;
    nodes.forEach((node, i) => {
      const isTop = i === 0 && top !== undefined;
      const id = this.block(node, prev ?? parent, isTop, isTop ? top : undefined);
      if (prev) {
        const p = this.blocks[prev];
        if (p) p.next = id;
      } else first = id;
      prev = id;
    });
    return first;
  }

  block(node: BNode, parent: string | null, topLevel: boolean, pos?: { x: number; y: number }): string {
    const id = this.nextId();
    const out: SB3Block = {
      opcode: node.opcode,
      next: null,
      parent,
      inputs: {},
      fields: {},
      shadow: node.shadow,
      topLevel,
    };
    if (pos) {
      out.x = pos.x;
      out.y = pos.y;
    }
    if (node.mutation) out.mutation = { tagName: "mutation", children: [], ...node.mutation };
    this.blocks[id] = out;
    const inputs: Record<string, unknown> = {};
    for (const [name, arg] of Object.entries(node.inputs)) {
      const enc = this.input(node, name, arg, id);
      if (enc !== undefined) inputs[name] = enc;
    }
    out.inputs = inputs;
    const fields: Record<string, unknown> = {};
    for (const [name, f] of Object.entries(node.fields)) {
      fields[name] = Array.isArray(f) ? [f[0], f[1]] : [f, null];
    }
    out.fields = fields;
    return id;
  }

  private input(owner: BNode, name: string, arg: Arg, ownerId: string): unknown {
    if (typeof arg === "number") return [1, [4, String(arg)]];
    if (typeof arg === "string") return [1, [10, arg]];
    if (Array.isArray(arg)) {
      const first = this.stack(arg, ownerId);
      return first === null ? undefined : [2, first];
    }
    switch (arg.kind) {
      case "lit":
        return [1, [arg.code, arg.value]];
      case "broadcast":
        return [1, [11, arg.name, arg.id]];
      case "var12":
        return [3, [12, arg.name, arg.id], [10, ""]];
      case "list13":
        return [3, [13, arg.name, arg.id], [10, ""]];
      case "cover":
        return [3, this.block(arg.block, ownerId, false), this.block(arg.shadow, ownerId, false)];
      case "block": {
        const id = this.block(arg, ownerId, false);
        if (arg.shadow) return [1, id];
        const boolSlot = owner.boolInputs?.includes(name) || BOOLEAN_SLOTS[owner.opcode]?.includes(name);
        return boolSlot ? [2, id] : [3, id, [10, ""]];
      }
    }
  }
}

/** Ubah daftar skrip (tiap skrip = tumpukan, elemen pertama biasanya hat) menjadi blocks sb3. */
export function buildBlocks(scripts: readonly (readonly BNode[])[], prefix = "b"): Record<string, unknown> {
  const s = new Serializer(prefix);
  scripts.forEach((script, i) => s.stack(script, null, { x: 0, y: i * 400 }));
  return s.blocks;
}

/** Semua opcode (termasuk shadow & reporter bersarang) dalam blocks sb3; primitif terkompresi dihitung. */
export function opcodesInBlocks(blocks: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  const PRIM: Record<number, string> = { 11: "event_broadcast_menu", 12: "data_variable", 13: "data_listcontents" };
  const scan = (v: unknown): void => {
    if (!Array.isArray(v)) return;
    for (const item of v) {
      if (Array.isArray(item) && typeof item[0] === "number") {
        const op = PRIM[item[0]];
        if (op) out.add(op);
      }
    }
  };
  for (const raw of Object.values(blocks)) {
    if (Array.isArray(raw)) {
      const op = PRIM[raw[0] as number];
      if (op) out.add(op);
      continue;
    }
    const blk = raw as { opcode?: string; inputs?: Record<string, unknown> };
    if (blk.opcode) out.add(blk.opcode);
    for (const inp of Object.values(blk.inputs ?? {})) scan(inp);
  }
  return out;
}
