import { describe, expect, it, vi } from "vitest";
import type { ScratchValue } from "../types/project-model";
import type { BlockArgs, BlockUtility, IRuntime, PrimitiveFn } from "../types/runtime";
import type { ITarget, Variable } from "../types/target";
import { createDataBlocks, LIST_ITEM_LIMIT, listContentsToString } from "./data";

function setup(random = () => 0) {
  const vars: Record<string, Variable> = {};
  const lookup = (id: string, name: string, type: "" | "list"): Variable => {
    const existing = vars[id];
    if (existing) return existing;
    const v: Variable = { id, name, type, value: type === "list" ? [] : 0, isCloud: false };
    vars[id] = v;
    return v;
  };
  const target = {
    lookupOrCreateVariable: (id: string, name: string) => lookup(id, name, ""),
    lookupOrCreateList: (id: string, name: string) => lookup(id, name, "list"),
  } as unknown as ITarget;
  const changeBlock = vi.fn();
  const ioQuery = vi.fn();
  const runtime = {
    monitorBlocks: { changeBlock },
    ioDevices: {} as Record<string, unknown>,
    random,
  } as unknown as IRuntime;
  const thread = { updateMonitor: false };
  const util = { target, runtime, thread, ioQuery } as unknown as BlockUtility;
  const prims = createDataBlocks(runtime).getPrimitives();
  const run = (op: string, args: BlockArgs): unknown => {
    const fn = prims[op] as PrimitiveFn;
    return fn(args, util);
  };
  const L = { id: "L", name: "list" };
  const V = { id: "V", name: "var" };
  const list = (): ScratchValue[] => lookup("L", "list", "list").value as ScratchValue[];
  const setList = (items: ScratchValue[]): void => {
    lookup("L", "list", "list").value = items;
  };
  return { run, L, V, list, setList, vars, changeBlock, thread, ioQuery, runtime };
}

describe("variables", () => {
  it("set menyimpan nilai mentah, change meng-cast ke angka", () => {
    const s = setup();
    s.run("data_setvariableto", { VARIABLE: s.V, VALUE: "007" });
    expect(s.run("data_variable", { VARIABLE: s.V })).toBe("007");
    s.run("data_changevariableby", { VARIABLE: s.V, VALUE: "1" });
    expect(s.run("data_variable", { VARIABLE: s.V })).toBe(8);
    s.run("data_setvariableto", { VARIABLE: s.V, VALUE: "abc" });
    s.run("data_changevariableby", { VARIABLE: s.V, VALUE: "x" });
    expect(s.run("data_variable", { VARIABLE: s.V })).toBe(0);
  });

  it("show/hide variable & list memakai checkbox monitorBlocks", () => {
    const s = setup();
    s.run("data_showvariable", { VARIABLE: s.V });
    s.run("data_hidelist", { LIST: s.L });
    expect(s.changeBlock.mock.calls).toEqual([
      [{ id: "V", element: "checkbox", value: true }],
      [{ id: "L", element: "checkbox", value: false }],
    ]);
  });

  it("variabel cloud memanggil ioQuery hanya bila perangkat cloud ada", () => {
    const s = setup();
    s.run("data_setvariableto", { VARIABLE: s.V, VALUE: 1 });
    const v = s.vars["V"] as Variable;
    v.isCloud = true;
    s.run("data_setvariableto", { VARIABLE: s.V, VALUE: 2 });
    expect(s.ioQuery).not.toHaveBeenCalled();
    (s.runtime.ioDevices as unknown as Record<string, unknown>)["cloud"] = {};
    s.run("data_changevariableby", { VARIABLE: s.V, VALUE: 3 });
    expect(s.ioQuery).toHaveBeenCalledWith("cloud", "requestUpdateVariable", ["var", 5]);
  });
});

describe("lists", () => {
  it("add, length, item, item#, contains", () => {
    const s = setup();
    for (const x of ["a", 123, "B", true]) s.run("data_addtolist", { LIST: s.L, ITEM: x });
    expect(s.run("data_lengthoflist", { LIST: s.L })).toBe(4);
    expect(s.run("data_itemoflist", { LIST: s.L, INDEX: 1 })).toBe("a");
    expect(s.run("data_itemoflist", { LIST: s.L, INDEX: "last" })).toBe(true);
    expect(s.run("data_itemoflist", { LIST: s.L, INDEX: 5 })).toBe("");
    expect(s.run("data_itemoflist", { LIST: s.L, INDEX: "1.9" })).toBe("a");
    expect(s.run("data_itemnumoflist", { LIST: s.L, ITEM: "123" })).toBe(2);
    expect(s.run("data_itemnumoflist", { LIST: s.L, ITEM: "b" })).toBe(3);
    expect(s.run("data_itemnumoflist", { LIST: s.L, ITEM: "zz" })).toBe(0);
    expect(s.run("data_listcontainsitem", { LIST: s.L, ITEM: "A" })).toBe(true);
    expect(s.run("data_listcontainsitem", { LIST: s.L, ITEM: "true" })).toBe(true);
    expect(s.run("data_listcontainsitem", { LIST: s.L, ITEM: "c" })).toBe(false);
  });

  it("item# memakai kecocokan pertama dengan Cast.compare", () => {
    const s = setup();
    s.setList([4, 7, 123, "123", 9]);
    expect(s.run("data_itemnumoflist", { LIST: s.L, ITEM: "123" })).toBe(3);
  });

  it("deleteoflist: angka, last, random, all, invalid", () => {
    const s = setup(() => 0.5);
    s.setList(["a", "b", "c", "d", "e"]);
    s.run("data_deleteoflist", { LIST: s.L, INDEX: 2 });
    expect(s.list()).toEqual(["a", "c", "d", "e"]);
    s.run("data_deleteoflist", { LIST: s.L, INDEX: "last" });
    expect(s.list()).toEqual(["a", "c", "d"]);
    s.run("data_deleteoflist", { LIST: s.L, INDEX: "random" });
    expect(s.list()).toEqual(["a", "d"]);
    s.run("data_deleteoflist", { LIST: s.L, INDEX: 9 });
    expect(s.list()).toEqual(["a", "d"]);
    s.run("data_deleteoflist", { LIST: s.L, INDEX: "all" });
    expect(s.list()).toEqual([]);
  });

  it("deletealloflist mengganti dengan array baru", () => {
    const s = setup();
    s.setList([1, 2]);
    const before = s.list();
    s.run("data_deletealloflist", { LIST: s.L });
    expect(s.list()).toEqual([]);
    expect(s.list()).not.toBe(before);
  });

  it("insertatlist: posisi 1..length+1, last = sisip sebelum terakhir+1", () => {
    const s = setup();
    s.setList(["a", "b"]);
    s.run("data_insertatlist", { LIST: s.L, INDEX: 1, ITEM: "x" });
    s.run("data_insertatlist", { LIST: s.L, INDEX: 4, ITEM: "y" });
    s.run("data_insertatlist", { LIST: s.L, INDEX: "last", ITEM: "z" });
    s.run("data_insertatlist", { LIST: s.L, INDEX: 99, ITEM: "no" });
    s.run("data_insertatlist", { LIST: s.L, INDEX: "all", ITEM: "no" });
    expect(s.list()).toEqual(["x", "a", "b", "y", "z"]);
  });

  it("replaceitemoflist hanya untuk indeks valid", () => {
    const s = setup();
    s.setList(["a", "b"]);
    s.run("data_replaceitemoflist", { LIST: s.L, INDEX: 2, ITEM: 5 });
    s.run("data_replaceitemoflist", { LIST: s.L, INDEX: 3, ITEM: 6 });
    s.run("data_replaceitemoflist", { LIST: s.L, INDEX: "all", ITEM: 6 });
    expect(s.list()).toEqual(["a", 5]);
  });

  it(`batas ${LIST_ITEM_LIMIT} item`, () => {
    const s = setup();
    s.setList(new Array<ScratchValue>(LIST_ITEM_LIMIT).fill(0));
    s.run("data_addtolist", { LIST: s.L, ITEM: 1 });
    expect(s.list().length).toBe(LIST_ITEM_LIMIT);
    s.run("data_insertatlist", { LIST: s.L, INDEX: 1, ITEM: "first" });
    expect(s.list().length).toBe(LIST_ITEM_LIMIT);
    expect(s.list()[0]).toBe("first");
    expect(s.list()[LIST_ITEM_LIMIT - 1]).toBe(0);
  });

  it("contentsoflist: tanpa spasi bila semua 1 karakter string", () => {
    expect(listContentsToString(["a", "b", "c"])).toBe("abc");
    expect(listContentsToString(["a", "bc"])).toBe("a bc");
    expect(listContentsToString(["a", 1])).toBe("a 1");
    expect(listContentsToString([1, 2])).toBe("1 2");
    expect(listContentsToString([])).toBe("");
    expect(listContentsToString([" ", "x"])).toBe(" x");
  });

  it("listcontents untuk monitor: salinan saat berubah, objek sama bila up-to-date", () => {
    const s = setup();
    s.run("data_addtolist", { LIST: s.L, ITEM: "a" });
    expect(s.run("data_listcontents", { LIST: s.L })).toBe("a");
    s.thread.updateMonitor = true;
    const first = s.run("data_listcontents", { LIST: s.L });
    expect(first).toEqual(["a"]);
    expect(first).not.toBe(s.list());
    expect(s.run("data_listcontents", { LIST: s.L })).toBe(s.list());
  });
});
