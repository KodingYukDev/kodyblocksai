import { describe, expect, it } from "vitest";
import type { Block, EditorWorkspaceEvent } from "@kody/engine";
import { chain, cmdWithNumber } from "./testing/fixtures";
import { dragTo, stackIds } from "./testing/harness";
import { mk, VmBlocksSim } from "./testing/vm-blocks";
import { blockingProcedure, copyTree, deleteBlockEvents } from "./ops";
import { applyWithInverse, UndoStack, type InverseDeps } from "./undo";
import { sequentialIds } from "./ids";
import { createCallBlocks, createDefinitionBlocks, partsToProcedure } from "./procedures";

function stackWorld(): VmBlocksSim {
  const blocks: Record<string, Block> = {};
  for (const id of ["a1", "a2", "a3"]) for (const b of cmdWithNumber(id, "motion_movesteps", "STEPS", 1)) blocks[b.id] = b;
  chain(blocks, ["a1", "a2", "a3"], 10, 20);
  return new VmBlocksSim(Object.values(blocks));
}

function deps(sim: VmBlocksSim): InverseDeps {
  return { getBlock: (id) => sim.blocks[id], getVariable: () => undefined };
}

function snapshot(sim: VmBlocksSim): string {
  const sorted = Object.keys(sim.blocks)
    .sort()
    .map((id) => {
      const b = sim.blocks[id] as Block;
      return { id, next: b.next, parent: b.parent, top: b.topLevel, inputs: b.inputs, x: b.topLevel ? b.x : undefined, y: b.topLevel ? b.y : undefined };
    });
  return JSON.stringify({ sorted, scripts: [...sim.scripts].sort() });
}

describe("Delete Block (healStack)", () => {
  it("menghapus blok tengah dan menyambung blok bawah ke atas", () => {
    const sim = stackWorld();
    const events = deleteBlockEvents(sim.blocks, "a2", { x: 10, y: 68 }, { x: 10, y: 116 });
    for (const ev of events) sim.apply(ev);
    expect(stackIds(sim, "a1")).toEqual(["a1", "a3"]);
    expect(sim.blocks.a2).toBeUndefined();
    expect(sim.blocks.a2_s).toBeUndefined();
    expect(sim.scripts).toEqual(["a1"]);
  });

  it("menghapus blok teratas membuat blok berikutnya jadi top-level", () => {
    const sim = stackWorld();
    for (const ev of deleteBlockEvents(sim.blocks, "a1", { x: 10, y: 20 }, { x: 10, y: 68 })) sim.apply(ev);
    expect(stackIds(sim, "a2")).toEqual(["a2", "a3"]);
    expect(sim.blocks.a2).toMatchObject({ topLevel: true, x: 10, y: 68 });
  });

  it("menghapus blok di dalam mulut C menyambung isi mulut", () => {
    const blocks: Record<string, Block> = { f: mk("f", "control_forever", { topLevel: true, x: 0, y: 0 }) };
    for (const id of ["c1", "c2"]) for (const b of cmdWithNumber(id, "motion_movesteps", "STEPS", 1)) blocks[b.id] = b;
    blocks.c1!.parent = "f";
    blocks.c1!.next = "c2";
    blocks.c2!.parent = "c1";
    blocks.f!.inputs.SUBSTACK = { name: "SUBSTACK", block: "c1", shadow: null };
    const sim = new VmBlocksSim(Object.values(blocks));
    for (const ev of deleteBlockEvents(sim.blocks, "c1", { x: 16, y: 48 }, null)) sim.apply(ev);
    expect(sim.blocks.f?.inputs.SUBSTACK?.block).toBe("c2");
    expect(sim.blocks.c2?.parent).toBe("f");
  });
});

describe("Duplicate / copyTree", () => {
  it("menyalin blok dan semua di bawahnya dengan id baru, shadow ikut", () => {
    const sim = stackWorld();
    const copy = copyTree(sim.blocks, "a2", sequentialIds("n"), { x: 100, y: 200 });
    expect(copy.map((b) => b.opcode)).toEqual(["motion_movesteps", "math_number", "motion_movesteps", "math_number"]);
    const root = copy[0]!;
    expect(root).toMatchObject({ topLevel: true, parent: null, x: 100, y: 200 });
    const ids = new Set(copy.map((b) => b.id));
    expect([...ids].some((id) => sim.blocks[id])).toBe(false);
    expect(ids.has(root.inputs.STEPS!.shadow!)).toBe(true);
    expect(ids.has(root.next!)).toBe(true);
    sim.apply({ type: "create", blocks: copy });
    expect(stackIds(sim, root.id)).toHaveLength(2);
  });

  it("includeNext=false (ambil dari palet) tidak menyalin next", () => {
    const sim = stackWorld();
    const copy = copyTree(sim.blocks, "a1", sequentialIds("p"), { x: 0, y: 0 }, false);
    expect(copy).toHaveLength(2);
    expect(copy[0]?.next).toBeNull();
  });
});

describe("Undo/redo", () => {
  it("undo mengembalikan keadaan persis setelah drag sisip + hapus, redo mengulang", () => {
    const sim = stackWorld();
    for (const b of cmdWithNumber("d", "motion_turnright", "DEGREES", 15, { topLevel: true, x: 500, y: 500 })) sim.create(b);
    const before = snapshot(sim);
    const stack = new UndoStack();
    // rekam drag: jalankan di salinan untuk mendapatkan event, lalu terapkan dengan inverse
    const probe = new VmBlocksSim(Object.values(JSON.parse(JSON.stringify(sim.blocks)) as Record<string, Block>));
    const { events } = dragTo(probe, "d", { x: 10, y: 68 + 2 });
    const inverse = applyWithInverse(events, deps(sim), (ev) => sim.apply(ev));
    stack.push({ forward: events, inverse });
    expect(stackIds(sim, "a1")).toEqual(["a1", "d", "a2", "a3"]);
    const afterDrag = snapshot(sim);
    const delEvents: EditorWorkspaceEvent[] = deleteBlockEvents(sim.blocks, "a2", { x: 10, y: 116 }, { x: 10, y: 164 });
    stack.push({ forward: delEvents, inverse: applyWithInverse(delEvents, deps(sim), (ev) => sim.apply(ev)) });
    expect(stackIds(sim, "a1")).toEqual(["a1", "d", "a3"]);

    const g2 = stack.popUndo()!;
    for (const ev of g2.inverse) sim.apply(ev);
    expect(snapshot(sim)).toBe(afterDrag);
    const g1 = stack.popUndo()!;
    for (const ev of g1.inverse) sim.apply(ev);
    expect(snapshot(sim)).toBe(before);
    for (const ev of stack.popRedo()!.forward) sim.apply(ev);
    expect(snapshot(sim)).toBe(afterDrag);
  });

  it("undo reporter yang dimasukkan ke input mengembalikan shadow", () => {
    const sim = new VmBlocksSim([...cmdWithNumber("a", "motion_movesteps", "STEPS", 10, { topLevel: true, x: 0, y: 0 }), mk("r", "motion_xposition", { topLevel: true, x: 300, y: 300 })]);
    const before = snapshot(sim);
    const probe = new VmBlocksSim(Object.values(JSON.parse(JSON.stringify(sim.blocks)) as Record<string, Block>));
    const { events } = dragTo(probe, "r", { x: 46, y: 8 });
    const inverse = applyWithInverse(events, deps(sim), (ev) => sim.apply(ev));
    expect(sim.blocks.a?.inputs.STEPS?.block).toBe("r");
    for (const ev of inverse) sim.apply(ev);
    expect(snapshot(sim)).toBe(before);
    expect(sim.blocks.a?.inputs.STEPS).toEqual({ name: "STEPS", block: "a_s", shadow: "a_s" });
  });
});

describe("Procedure", () => {
  it("define tidak boleh dihapus selama masih dipanggil (PROCEDURE_USED)", () => {
    const ids = sequentialIds("q");
    const proc = partsToProcedure([{ kind: "label", text: "jump" }, { kind: "input", argType: "s", name: "height", id: "argH" }], false);
    const def = createDefinitionBlocks(proc, ids, { x: 0, y: 0 });
    const call = createCallBlocks(proc, ids, { x: 0, y: 300 });
    const sim = new VmBlocksSim([...def, ...call]);
    const defId = def[0]!.id;
    expect(blockingProcedure(sim.blocks, defId)).toBe("jump %s");
    sim.apply({ type: "delete", blockId: call[0]!.id });
    expect(blockingProcedure(sim.blocks, defId)).toBeNull();
    const { result } = dragTo(sim, defId, { x: -500, y: 0 }, true);
    expect(result).toEqual({ kind: "events", events: [{ type: "delete", blockId: defId }] });
  });
});

describe("Edit procedure", () => {
  it("ganti nama argumen, tambah argumen, hapus argumen (reporter di pemanggil dilepas)", async () => {
    const { editProcedureEvents } = await import("./procedure-edit");
    const ids = sequentialIds("e");
    const proc = partsToProcedure(
      [
        { kind: "label", text: "lompat" },
        { kind: "input", argType: "s", name: "tinggi", id: "A" },
        { kind: "input", argType: "s", name: "lama", id: "B" },
      ],
      false,
    );
    const def = createDefinitionBlocks(proc, ids, { x: 0, y: 0 });
    const call = createCallBlocks(proc, ids, { x: 0, y: 300 });
    const sim = new VmBlocksSim([...def, ...call, mk("rep", "motion_xposition", { topLevel: true, x: 500, y: 500 })]);
    const callId = call[0]!.id;
    dragTo(sim, "rep", { x: 999, y: 999 });
    // taruh reporter di input B pemanggil secara langsung
    sim.apply({ type: "move", blockId: "rep", newParent: callId, newInput: "B" });
    const next = partsToProcedure(
      [
        { kind: "label", text: "lompat" },
        { kind: "input", argType: "s", name: "ketinggian", id: "A" },
        { kind: "input", argType: "b", name: "cepat", id: "C" },
      ],
      true,
    );
    const events = editProcedureEvents(sim.blocks, def[0]!.id, next, sequentialIds("z"));
    for (const ev of events) sim.apply(ev);
    const proto = sim.blocks[def[1]!.id]!;
    expect(proto.mutation).toMatchObject({ proccode: "lompat %s %b", argumentids: '["A","C"]', warp: "true" });
    expect(sim.blocks[proto.inputs.A!.block!]?.fields.VALUE?.value).toBe("ketinggian");
    expect(sim.blocks[proto.inputs.C!.block!]?.opcode).toBe("argument_reporter_boolean");
    const c = sim.blocks[callId]!;
    expect(c.mutation).toMatchObject({ proccode: "lompat %s %b", argumentids: '["A","C"]' });
    expect(sim.blocks.rep?.parent).toBeNull();
    expect(sim.scripts).toContain("rep");
    expect(c.inputs.C).toBeUndefined();
  });
});
