import { describe, expect, it } from "vitest";
import type { Block } from "@kody/engine";
import { blockDefinitions } from "../blocks/definitions";
import { getDefaultRegistry } from "../blocks/registry";
import type { BlockDefinition } from "../types";
import { getBlockInfo } from "./block-info";
import { approxMeasure, connectionsOf, layoutBlock, type LayoutDeps } from "./layout";
import { mk } from "./testing/vm-blocks";

const defs = new Map<string, BlockDefinition>(blockDefinitions(getDefaultRegistry(), "en").map((d) => [d.opcode, d]));
const lookup = (op: string) => defs.get(op);

describe("integrasi dengan definisi registri scratch-blocks", () => {
  it("semua opcode bisa di-layout tanpa galat", () => {
    expect(defs.size).toBeGreaterThan(100);
    for (const op of defs.keys()) {
      const blocks: Record<string, Block> = { b: mk("b", op, { topLevel: true, x: 0, y: 0 }) };
      const deps: LayoutDeps = { blocks, lookup, measure: approxMeasure, fieldText: (b, n) => String(b.fields[n]?.value ?? "") };
      const layout = layoutBlock(deps, "b");
      expect(layout.width, op).toBeGreaterThan(0);
      expect(layout.height, op).toBeGreaterThan(0);
      connectionsOf(blocks, { layout, x: 0, y: 0 });
    }
  });

  it("bentuk sambungan blok inti sesuai Scratch", () => {
    const info = (op: string) => getBlockInfo(mk("x", op), lookup);
    expect(info("control_forever")).toMatchObject({ hasPrevious: true, hasNext: false, statementInputs: ["SUBSTACK"] });
    expect(info("control_if_else").statementInputs).toEqual(["SUBSTACK", "SUBSTACK2"]);
    expect(info("control_repeat")).toMatchObject({ hasPrevious: true, hasNext: true });
    expect(info("event_whenflagclicked")).toMatchObject({ isHat: true, hasPrevious: false, hasNext: true });
    expect(info("control_delete_this_clone")).toMatchObject({ hasNext: false });
    expect(info("operator_and").output).toEqual(["Boolean"]);
    expect(info("motion_xposition").output).not.toContain("Boolean");
    const and = info("operator_and").rows[0];
    expect(and?.kind === "inline" && and.items.filter((i) => i.kind === "input").map((i) => (i.kind === "input" ? i.check : null))).toEqual([["Boolean"], ["Boolean"]]);
    const move = info("motion_movesteps").rows[0];
    expect(move?.kind === "inline" && move.items.find((i) => i.kind === "input")).toMatchObject({ name: "STEPS", check: null });
  });

  it("ikon loop di lengan bawah repeat rata kanan", () => {
    const blocks: Record<string, Block> = { r: mk("r", "control_repeat", { topLevel: true }) };
    const deps: LayoutDeps = { blocks, lookup, measure: approxMeasure, fieldText: () => "" };
    const l = layoutBlock(deps, "r");
    const img = l.elements.find((e) => e.kind === "image");
    expect(img && img.x + img.width).toBe(l.width - 8);
  });
});
