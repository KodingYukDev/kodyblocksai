import { describe, expect, it } from "vitest";
import type { Block } from "@kody/engine";
import { chain, cmdWithNumber, testDeps } from "./testing/fixtures";
import { dragTo, stackIds } from "./testing/harness";
import { mk, VmBlocksSim } from "./testing/vm-blocks";
import { CONNECTING_SNAP_RADIUS, isConnectionAllowed, SNAP_RADIUS, SnapTracker, type SnapContext } from "./snap";
import { infoGetter } from "./connections";
import type { ConnPoint } from "./layout";

function world(...groups: Block[][]): Record<string, Block> {
  const out: Record<string, Block> = {};
  for (const g of groups) for (const b of g) out[b.id] = b;
  return out;
}

/** Stack a1-a2-a3 di (0,0) + blok d di (500,500). */
function basic(): VmBlocksSim {
  const blocks = world(
    cmdWithNumber("a1", "motion_movesteps", "STEPS", 10),
    cmdWithNumber("a2", "motion_movesteps", "STEPS", 20),
    cmdWithNumber("a3", "motion_movesteps", "STEPS", 30),
    cmdWithNumber("d", "motion_turnright", "DEGREES", 15, { topLevel: true, x: 500, y: 500 }),
  );
  chain(blocks, ["a1", "a2", "a3"], 0, 0);
  return new VmBlocksSim(Object.values(blocks));
}

describe("snapping stack", () => {
  it("menempel di bawah blok terakhir (previous -> next)", () => {
    const sim = basic();
    dragTo(sim, "d", { x: 3, y: 144 + 5 });
    expect(stackIds(sim, "a1")).toEqual(["a1", "a2", "a3", "d"]);
    expect(sim.scripts).toEqual(["a1"]);
  });

  it("menyisip di tengah stack: sisa stack pindah ke bawah blok yang dijatuhkan", () => {
    const sim = basic();
    dragTo(sim, "d", { x: 0, y: 50 });
    expect(stackIds(sim, "a1")).toEqual(["a1", "d", "a2", "a3"]);
    expect(sim.blocks.a2?.parent).toBe("d");
  });

  it("menyeret dari tengah stack membawa semua blok di bawahnya (healStack=false)", () => {
    const sim = basic();
    dragTo(sim, "a2", { x: 400, y: 0 });
    expect(stackIds(sim, "a1")).toEqual(["a1"]);
    expect(stackIds(sim, "a2")).toEqual(["a2", "a3"]);
    expect(sim.scripts.sort()).toEqual(["a1", "a2", "d"].sort());
    expect(sim.blocks.a2?.x).toBe(400);
  });

  it("stack yang dijatuhkan di atas stack lain: stack bawah menempel ke blok terakhir (lastOnStack)", () => {
    const sim = basic();
    dragTo(sim, "a2", { x: 400, y: 0 }); // a2-a3 terpisah
    // a2-a3 tinggi 96 -> taruh di atas a1 sehingga next a3 dekat previous a1 (0,0)
    dragTo(sim, "a2", { x: 2, y: -96 - 4 });
    expect(stackIds(sim, "a2")).toEqual(["a2", "a3", "a1"]);
    expect(sim.scripts.sort()).toEqual(["a2", "d"]);
  });

  it("tidak ada yang bisa menempel di atas hat; hat menempel di atas stack", () => {
    const blocks = world([mk("h", "event_whenflagclicked", { topLevel: true, x: 0, y: 0 })], cmdWithNumber("d", "motion_movesteps", "STEPS", 1, { topLevel: true, x: 300, y: 300 }));
    const sim = new VmBlocksSim(Object.values(blocks));
    // d tepat di atas h: tidak menempel (hat tidak punya previous)
    dragTo(sim, "d", { x: 0, y: -48 });
    expect(sim.blocks.d?.parent).toBeNull();
    // hat di atas d: next hat (y = 64) dekat previous d
    dragTo(sim, "d", { x: 300, y: 300 });
    dragTo(sim, "h", { x: 300, y: 300 - 64 - 3 });
    expect(stackIds(sim, "h")).toEqual(["h", "d"]);
  });
});

describe("snapping reporter", () => {
  function withReporter(): VmBlocksSim {
    const blocks = world(cmdWithNumber("a1", "motion_movesteps", "STEPS", 10, { topLevel: true, x: 0, y: 0 }), [
      mk("r", "motion_xposition", { topLevel: true, x: 300, y: 300 }),
      mk("r2", "operator_add", { topLevel: true, x: 300, y: 500 }),
    ]);
    return new VmBlocksSim(Object.values(blocks));
  }

  it("reporter masuk input angka; shadow tetap tersimpan dan kembali saat ditarik keluar", () => {
    const sim = withReporter();
    const { events } = dragTo(sim, "r", { x: 68, y: 8 });
    expect(sim.blocks.a1?.inputs.STEPS).toEqual({ name: "STEPS", block: "r", shadow: "a1_s" });
    expect(sim.blocks.r?.parent).toBe("a1");
    expect(events.at(-1)).toMatchObject({ type: "move", blockId: "r", newParent: "a1", newInput: "STEPS" });
    dragTo(sim, "r", { x: 300, y: 300 });
    expect(sim.blocks.a1?.inputs.STEPS).toEqual({ name: "STEPS", block: "a1_s", shadow: "a1_s" });
    expect(sim.scripts.sort()).toEqual(["a1", "r", "r2"]);
  });

  it("reporter baru menggeser (bump) reporter lama di input", () => {
    const sim = withReporter();
    dragTo(sim, "r", { x: 68, y: 8 });
    dragTo(sim, "r2", { x: 66, y: 6 });
    expect(sim.blocks.a1?.inputs.STEPS?.block).toBe("r2");
    expect(sim.blocks.r?.parent).toBeNull();
    expect(sim.scripts).toContain("r");
  });

  it("boolean hanya ke slot heksagon; reporter bulat ditolak di slot Boolean", () => {
    const blocks = world([
      mk("and", "operator_and", { topLevel: true, x: 0, y: 0 }),
      mk("x", "motion_xposition", { topLevel: true, x: 300, y: 0 }),
      mk("md", "sensing_mousedown", { topLevel: true, x: 300, y: 300 }),
    ]);
    const deps = testDeps(blocks);
    const ctx: SnapContext = { blocks, info: infoGetter(deps), topId: "x", dragged: new Set(["x"]) };
    const slot: ConnPoint = { blockId: "and", type: "input", input: "OPERAND1", x: 20, y: 4, check: ["Boolean"], occupant: null };
    const xOut: ConnPoint = { blockId: "x", type: "output", input: null, x: 20, y: 4, check: ["String", "Number"], occupant: null };
    const mdOut: ConnPoint = { blockId: "md", type: "output", input: null, x: 20, y: 4, check: ["Boolean"], occupant: null };
    expect(isConnectionAllowed(ctx, xOut, slot)).toBe(false);
    expect(isConnectionAllowed({ ...ctx, topId: "md", dragged: new Set(["md"]) }, mdOut, slot)).toBe(true);
    const roundSlot: ConnPoint = { blockId: "and", type: "input", input: "X", x: 0, y: 0, check: null, occupant: null };
    expect(isConnectionAllowed({ ...ctx, topId: "md", dragged: new Set(["md"]) }, mdOut, roundSlot)).toBe(true);
    const sim = new VmBlocksSim(Object.values(blocks));
    dragTo(sim, "md", { x: 22, y: 4 });
    expect(sim.blocks.and?.inputs.OPERAND1?.block).toBe("md");
  });
});

describe("C-block", () => {
  function cWorld(): VmBlocksSim {
    const blocks = world(
      cmdWithNumber("a1", "motion_movesteps", "STEPS", 1),
      cmdWithNumber("a2", "motion_movesteps", "STEPS", 2),
      [mk("f", "control_forever", { topLevel: true, x: 600, y: 600 })],
      [mk("ie", "control_if_else", { topLevel: true, x: 900, y: 900 })],
      cmdWithNumber("d", "motion_turnright", "DEGREES", 15, { topLevel: true, x: 100, y: 300 }),
    );
    chain(blocks, ["a1", "a2"], 0, 0);
    return new VmBlocksSim(Object.values(blocks));
  }

  it("forever kosong membungkus stack top-level (mulut di atas previous blok teratas)", () => {
    const sim = cWorld();
    // mulut forever: x+16, y+48. Sejajarkan dengan (0,0)
    dragTo(sim, "f", { x: -16, y: -48 });
    expect(sim.blocks.f?.inputs.SUBSTACK?.block).toBe("a1");
    expect(stackIds(sim, "a1")).toEqual(["a1", "a2"]);
    expect(sim.scripts.sort()).toEqual(["d", "f", "ie"]);
  });

  it("forever kosong di tengah stack membungkus sisa stack", () => {
    const sim = cWorld();
    // previous a2 di (0,48). Mulut forever di (x+16, y+48)
    dragTo(sim, "f", { x: -16, y: 0 });
    expect(sim.blocks.a1?.next).toBe("f");
    expect(sim.blocks.f?.inputs.SUBSTACK?.block).toBe("a2");
  });

  it("forever (tanpa next) tidak boleh menyisip di tengah stack lewat previous, tapi boleh di ujung", () => {
    const sim = cWorld();
    // pakai blok cap: delete this clone
    sim.create(mk("cap", "control_delete_this_clone", { topLevel: true, x: 400, y: 400 }));
    dragTo(sim, "cap", { x: 0, y: 40 });
    expect(sim.blocks.cap?.parent).toBeNull();
    dragTo(sim, "cap", { x: 0, y: 96 + 2 });
    expect(stackIds(sim, "a1")).toEqual(["a1", "a2", "cap"]);
  });

  it("cabang kedua if-else tidak dipakai untuk membungkus", () => {
    const sim = cWorld();
    const deps = testDeps(sim.blocks);
    const info = infoGetter(deps);
    expect(info("ie").statementInputs).toEqual(["SUBSTACK", "SUBSTACK2"]);
    const ctx: SnapContext = { blocks: sim.blocks, info, topId: "ie", dragged: new Set(["ie"]) };
    const local2: ConnPoint = { blockId: "ie", type: "statement", input: "SUBSTACK2", x: 0, y: 0, check: null, occupant: null };
    const local1: ConnPoint = { ...local2, input: "SUBSTACK" };
    const prevA1: ConnPoint = { blockId: "a1", type: "previous", input: null, x: 0, y: 0, check: null, occupant: null };
    expect(isConnectionAllowed(ctx, local2, prevA1)).toBe(false);
    expect(isConnectionAllowed(ctx, local1, prevA1)).toBe(true);
  });

  it("blok masuk ke mulut C", () => {
    const sim = cWorld();
    dragTo(sim, "d", { x: 600 + 16, y: 600 + 48 + 3 });
    expect(sim.blocks.f?.inputs.SUBSTACK?.block).toBe("d");
  });
});

describe("SnapTracker preferensi sambungan aktif", () => {
  it("memakai radius 48 lalu 68 dan mempertahankan sambungan lama kecuali lebih dekat 20px", () => {
    const blocks = world(cmdWithNumber("a1", "motion_movesteps", "STEPS", 1, { topLevel: true, x: 0, y: 0 }), cmdWithNumber("d", "motion_movesteps", "STEPS", 1, { topLevel: true, x: 0, y: 1000 }));
    const deps = testDeps(blocks);
    const ctx: SnapContext = { blocks, info: infoGetter(deps), topId: "d", dragged: new Set(["d", "d_s"]) };
    const local: ConnPoint = { blockId: "d", type: "previous", input: null, x: 0, y: 1000, check: null, occupant: null };
    const c1: ConnPoint = { blockId: "a1", type: "next", input: null, x: 0, y: 48, check: null, occupant: null };
    const c2: ConnPoint = { blockId: "a1", type: "statement", input: "SUBSTACK", x: 0, y: 200, check: null, occupant: null };
    const tracker = new SnapTracker(ctx, [local], [c1, c2]);
    expect(tracker.update({ x: 0, y: -1000 + 48 + SNAP_RADIUS + 1 })).toBeNull();
    expect(tracker.update({ x: 0, y: -1000 + 48 + 40 })?.closest).toBe(c1);
    // sekarang radius 68: masih c1 walau 60 jauhnya
    expect(tracker.update({ x: 0, y: -1000 + 48 + 60 })?.closest).toBe(c1);
    // c2 dist 10, c1 dist 142: 10 <= 142-20 -> pindah
    expect(tracker.update({ x: 0, y: -1000 + 190 })?.closest).toBe(c2);
    expect(CONNECTING_SNAP_RADIUS).toBe(68);
  });
});
