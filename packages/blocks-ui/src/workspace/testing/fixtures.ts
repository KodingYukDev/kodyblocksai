/** KHUSUS TES: definisi blok ringkas (bentuk sama dengan scratch-blocks) agar tes tidak bergantung agent definisi. */
import type { Block } from "@kody/engine";
import type { BlockDefinition } from "../../types";
import { approxMeasure, type LayoutDeps } from "../layout";
import { mk } from "./vm-blocks";

export const TEST_DEFS: BlockDefinition[] = [
  { opcode: "motion_movesteps", category: "motion", shape: "command", messages: ["move %1 steps"], args: [[{ type: "input_value", name: "STEPS" }]] },
  { opcode: "motion_turnright", category: "motion", shape: "command", messages: ["turn %1 degrees"], args: [[{ type: "input_value", name: "DEGREES" }]] },
  { opcode: "event_whenflagclicked", category: "events", shape: "hat", messages: ["when flag clicked"], args: [[]] },
  { opcode: "control_forever", category: "control", shape: "c-cap", messages: ["forever", "%1"], args: [[], [{ type: "input_statement", name: "SUBSTACK" }]] },
  { opcode: "control_repeat", category: "control", shape: "c", messages: ["repeat %1", "%1"], args: [[{ type: "input_value", name: "TIMES" }], [{ type: "input_statement", name: "SUBSTACK" }]] },
  {
    opcode: "control_if_else",
    category: "control",
    shape: "c2",
    messages: ["if %1 then", "%1", "else", "%1"],
    args: [[{ type: "input_value", name: "CONDITION", check: "Boolean" }], [{ type: "input_statement", name: "SUBSTACK" }], [], [{ type: "input_statement", name: "SUBSTACK2" }]],
  },
  { opcode: "control_stop", category: "control", shape: "cap", messages: ["stop %1"], args: [[{ type: "field_dropdown", name: "STOP_OPTION", options: [["all", "all"], ["other scripts in sprite", "other scripts in sprite"]] }]] },
  { opcode: "control_delete_this_clone", category: "control", shape: "cap", messages: ["delete this clone"], args: [[]] },
  { opcode: "motion_xposition", category: "motion", shape: "reporter", messages: ["x position"], args: [[]], checkboxInFlyout: true },
  { opcode: "operator_add", category: "operators", shape: "reporter", messages: ["%1 + %2"], args: [[{ type: "input_value", name: "NUM1" }, { type: "input_value", name: "NUM2" }]] },
  { opcode: "operator_and", category: "operators", shape: "boolean", messages: ["%1 and %2"], args: [[{ type: "input_value", name: "OPERAND1", check: "Boolean" }, { type: "input_value", name: "OPERAND2", check: "Boolean" }]], output: "Boolean" },
  { opcode: "sensing_mousedown", category: "sensing", shape: "boolean", messages: ["mouse down?"], args: [[]], output: "Boolean" },
  { opcode: "math_number", category: "operators", shape: "shadow", messages: ["%1"], args: [[{ type: "field_number", name: "NUM" }]] },
  { opcode: "text", category: "operators", shape: "shadow", messages: ["%1"], args: [[{ type: "field_input", name: "TEXT" }]] },
];

const byOpcode = new Map(TEST_DEFS.map((d) => [d.opcode, d]));
export const testLookup = (op: string): BlockDefinition | undefined => byOpcode.get(op);

export function testDeps(blocks: Record<string, Block>): LayoutDeps {
  return {
    blocks,
    lookup: testLookup,
    measure: approxMeasure,
    fieldText: (b, name) => String(b.fields[name]?.value ?? ""),
  };
}

/** Command dengan shadow math_number di input. */
export function cmdWithNumber(id: string, opcode: string, input: string, value: number, extra: Partial<Block> = {}): Block[] {
  const sid = `${id}_s`;
  return [
    mk(id, opcode, { inputs: { [input]: { name: input, block: sid, shadow: sid } }, ...extra }),
    mk(sid, "math_number", { parent: id, shadow: true, fields: { NUM: { name: "NUM", value: String(value) } } }),
  ];
}

/** Hubungkan daftar id menjadi stack (next/parent), id pertama top-level di (x,y). */
export function chain(blocks: Record<string, Block>, ids: string[], x = 0, y = 0): void {
  ids.forEach((id, i) => {
    const b = blocks[id];
    if (!b) return;
    if (i === 0) {
      b.topLevel = true;
      b.x = x;
      b.y = y;
      b.parent = null;
    } else {
      b.parent = ids[i - 1] ?? null;
    }
    b.next = ids[i + 1] ?? null;
  });
}
