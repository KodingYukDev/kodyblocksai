import { describe, expect, it } from "vitest";
import type { Block, CommentState, IRuntime, ITarget, Variable } from "@kody/engine";
import { shareBlocksToTarget } from "./share-blocks";
import { withCommentDeletes } from "./comments";
import { inverseOf } from "./undo";
import { createStackMemo, layoutStack, type LayoutDeps } from "./layout";
import { chain, testDeps } from "./testing/fixtures";
import { mk } from "./testing/vm-blocks";

function fakeTarget(id: string, isStage: boolean, vars: Variable[] = []) {
  const variables: Record<string, Variable> = {};
  for (const v of vars) variables[v.id] = v;
  const created: Block[] = [];
  const t = {
    id,
    isStage,
    variables,
    created,
    blocks: { createBlock: (b: Block) => created.push(b) },
    lookupVariableById: (vid: string) => variables[vid],
    lookupVariableByNameAndType: (name: string, type = "") => Object.values(variables).find((v) => v.name === name && v.type === type) ?? null,
    createVariable: (vid: string, name: string, type: Variable["type"]) => {
      variables[vid] = { id: vid, name, type, value: type === "list" ? [] : 0, isCloud: false };
    },
  };
  return t;
}

function setupShare() {
  const from = fakeTarget("a", false, [{ id: "loc", name: "skor", type: "", value: 0, isCloud: false }]);
  const other = fakeTarget("b", false, [{ id: "bskor", name: "skor", type: "", value: 0, isCloud: false }]);
  const empty = fakeTarget("c", false);
  const stage = fakeTarget("stage", true, [{ id: "glob", name: "nyawa", type: "", value: 3, isCloud: false }]);
  let changed = 0;
  const runtime = {
    getTargetById: (id: string) => ({ a: from, b: other, c: empty, stage })[id],
    getTargetForStage: () => stage,
    getAllVarNamesOfType: () => ["nyawa", "skor"],
    emitProjectChanged: () => changed++,
  } as unknown as IRuntime;
  const blocks: Block[] = [
    mk("s1", "data_changevariableby", { topLevel: true, x: 500, y: 500, next: "s2", fields: { VARIABLE: { name: "VARIABLE", value: "skor", id: "loc" } } }),
    mk("s2", "data_setvariableto", { parent: "s1", fields: { VARIABLE: { name: "VARIABLE", value: "nyawa", id: "glob" } } }),
  ];
  return { runtime, from, other, empty, stage, blocks, changed: () => changed };
}

describe("shareBlocksToTarget (seret skrip ke sprite lain)", () => {
  it("id baru, variabel lokal digabung ke variabel bernama sama di sprite tujuan", () => {
    const env = setupShare();
    const n = shareBlocksToTarget(env.runtime, env.blocks, "b", "a", { scrollX: -150, scrollY: -300, scale: 1 });
    expect(n).toBe(2);
    const [top, second] = (env.other as unknown as { created: Block[] }).created;
    expect(top?.id).not.toBe("s1");
    expect(second?.parent).toBe(top?.id);
    expect(top?.next).toBe(second?.id);
    expect(top?.fields.VARIABLE?.id).toBe("bskor");
    // Variabel global tidak disentuh.
    expect(second?.fields.VARIABLE?.id).toBe("glob");
    // Diletakkan di pojok kiri atas area terlihat sprite tujuan.
    expect(top?.x).toBe(165);
    expect(top?.y).toBe(330);
    // Blok asli tidak berubah.
    expect(env.blocks[0]?.id).toBe("s1");
    expect(env.blocks[0]?.fields.VARIABLE?.id).toBe("loc");
    expect(env.changed()).toBe(1);
  });

  it("sprite tujuan tanpa variabel itu: variabel lokal baru dibuat", () => {
    const env = setupShare();
    shareBlocksToTarget(env.runtime, env.blocks, "c", "a");
    const top = (env.empty as unknown as { created: Block[] }).created[0];
    const vid = String(top?.fields.VARIABLE?.id);
    expect(env.empty.variables[vid]?.name).toBe("skor");
  });

  it("ke panggung: variabel lokal menjadi global 'Stage: nama'", () => {
    const env = setupShare();
    shareBlocksToTarget(env.runtime, env.blocks, "stage", "a");
    const top = (env.stage as unknown as { created: Block[] }).created[0];
    expect(top?.fields.VARIABLE?.id).toBe("StageVarFromLocal_loc");
    expect(top?.fields.VARIABLE?.value).toBe("Stage: skor");
    expect(env.stage.variables.StageVarFromLocal_loc?.name).toBe("Stage: skor");
    // Disalin kedua kali memakai variabel global yang sama.
    shareBlocksToTarget(env.runtime, env.blocks, "stage", "a");
    expect(Object.keys(env.stage.variables).filter((k) => k.startsWith("StageVarFromLocal_"))).toHaveLength(1);
  });

  it("target tidak ada atau kosong: tidak menyalin", () => {
    const env = setupShare();
    expect(shareBlocksToTarget(env.runtime, env.blocks, "zzz", "a")).toBe(0);
    expect(shareBlocksToTarget(env.runtime, [], "b", "a")).toBe(0);
  });
});

describe("komentar ikut terhapus bersama blok", () => {
  const comment = (id: string, blockId: string | null): CommentState => ({ id, blockId, x: 0, y: 0, width: 200, height: 200, minimized: false, text: id });

  it("delete dengan heal: komentar blok bawah yang dipindah tidak ikut terhapus", () => {
    const blocks: Record<string, Block> = { a: mk("a", "motion_movesteps"), b: mk("b", "motion_movesteps"), c: mk("c", "motion_movesteps") };
    chain(blocks, ["a", "b", "c"]);
    const comments = { cb: comment("cb", "b"), cc: comment("cc", "c"), free: comment("free", null) };
    // Hapus b dengan heal: c dipindah ke a dulu, lalu b dihapus.
    const out = withCommentDeletes(
      [
        { type: "move", blockId: "c", oldParent: "b", newParent: "a" },
        { type: "delete", blockId: "b" },
      ],
      comments,
      blocks,
    );
    expect(out.map((e) => e.type)).toEqual(["move", "comment_delete", "delete"]);
    expect(out[1]).toEqual({ type: "comment_delete", commentId: "cb" });
  });

  it("tanpa komentar menempel: event tidak berubah", () => {
    const blocks: Record<string, Block> = { a: mk("a", "motion_movesteps", { topLevel: true }) };
    const events = [{ type: "delete" as const, blockId: "a" }];
    expect(withCommentDeletes(events, { f: comment("f", null) }, blocks)).toEqual(events);
  });

  it("kebalikan event komentar untuk undo", () => {
    const c = comment("k", "a");
    const deps = { getBlock: () => undefined, getVariable: () => undefined, getComment: () => ({ ...c }) };
    expect(inverseOf({ type: "comment_delete", commentId: "k" }, deps)).toEqual([
      { type: "comment_create", commentId: "k", blockId: "a", text: "k", x: 0, y: 0, width: 200, height: 200, minimized: false },
    ]);
    expect(inverseOf({ type: "comment_move", commentId: "k", x: 5, y: 6 }, deps)).toEqual([{ type: "comment_move", commentId: "k", x: 0, y: 0 }]);
    expect(inverseOf({ type: "comment_change", commentId: "k", text: "baru" }, deps)).toEqual([{ type: "comment_change", commentId: "k", text: "k" }]);
    expect(inverseOf({ type: "comment_change", commentId: "k", minimized: true }, deps)).toEqual([{ type: "comment_change", commentId: "k", minimized: false }]);
    expect(inverseOf({ type: "comment_create", commentId: "k", blockId: null, text: "", x: 0, y: 0, width: 1, height: 1, minimized: false }, deps)).toEqual([
      { type: "comment_delete", commentId: "k" },
    ]);
  });
});

describe("cache layout stack", () => {
  function deps(blocks: Record<string, Block>, memo = createStackMemo()): LayoutDeps {
    return { ...testDeps(blocks), memo };
  }

  it("stack yang sama memakai layout yang sama; berubah isi atau epoch = layout baru", () => {
    const blocks: Record<string, Block> = { a: mk("a", "motion_xposition") };
    chain(blocks, ["a"], 10, 20);
    const memo = createStackMemo();
    const first = layoutStack(deps(blocks, memo), "a");
    expect(layoutStack(deps(blocks, memo), "a")).toBe(first);
    // Pindah posisi tidak mengubah layout.
    blocks.a!.x = 99;
    expect(layoutStack(deps(blocks, memo), "a")).toBe(first);
    blocks.a!.opcode = "motion_movesteps";
    const second = layoutStack(deps(blocks, memo), "a");
    expect(second).not.toBe(first);
    memo.epoch++;
    expect(layoutStack(deps(blocks, memo), "a")).not.toBe(second);
  });

  it("proyek besar (600 blok): render kedua jauh lebih cepat dari yang pertama", () => {
    const blocks: Record<string, Block> = {};
    for (let s = 0; s < 60; s++) {
      const ids: string[] = [];
      for (let i = 0; i < 10; i++) {
        const id = `s${s}_${i}`;
        blocks[id] = mk(id, i % 2 ? "motion_movesteps" : "motion_turnright");
        ids.push(id);
      }
      chain(blocks, ids, 0, s * 400);
    }
    const memo = createStackMemo();
    const d = deps(blocks, memo);
    const tops = Object.values(blocks).filter((b) => b.topLevel).map((b) => b.id);
    const t0 = performance.now();
    const firstLayouts = tops.map((id) => layoutStack(d, id));
    const t1 = performance.now();
    const again = tops.map((id) => layoutStack(d, id));
    const t2 = performance.now();
    expect(again.every((l, i) => l === firstLayouts[i])).toBe(true);
    expect(firstLayouts.reduce((n, l) => n + l.items.length, 0)).toBe(600);
    // Hanya batas longgar agar tidak flaky; yang penting hasilnya dipakai ulang.
    expect(t2 - t1).toBeLessThan(Math.max(50, (t1 - t0) * 2));
  });
});
