import { describe, expect, it } from "vitest";
import {
  addCostume,
  addCostumeAndSelect,
  addSound,
  clampSoundSelection,
  defaultCostumeName,
  deleteCostume,
  deleteSound,
  dropIndexFromPointer,
  duplicateCostume,
  duplicateSound,
  formatCostumeDetails,
  normalizeDropIndex,
  renameCostume,
  renameSound,
  reorderCostume,
  reorderSound,
  selectionAfterSoundDelete,
} from "./asset-list-logic";

const items = (...names: string[]) => names.map((name) => ({ name }));
const names = (a: { name: string }[]) => a.map((c) => c.name);

describe("costume list (scratch-vm)", () => {
  it("addCostume memberi nama unik dengan angka", () => {
    const c = items("kostum1", "kostum2");
    addCostume(c, { name: "kostum1" });
    addCostume(c, { name: "" }, 0);
    expect(names(c)).toEqual(["", "kostum1", "kostum2", "kostum3"]);
    addCostume(c, { name: "" }, Number.NaN);
    expect(names(c)[4]).toBe("2");
  });

  it("addCostumeAndSelect memilih costume terakhir", () => {
    const s = { costumes: items("a"), currentCostume: 0 };
    addCostumeAndSelect(s, { name: "b" });
    expect(s.currentCostume).toBe(1);
  });

  it("duplicate menyisip di index+1 dan memilihnya", () => {
    const s = { costumes: items("a", "b"), currentCostume: 1 };
    duplicateCostume(s, 0);
    expect(names(s.costumes)).toEqual(["a", "a2", "b"]);
    expect(s.currentCostume).toBe(1);
  });

  it("rename mengabaikan nama sendiri dan menghindari duplikat", () => {
    const c = items("a", "b");
    expect(renameCostume(c, 0, "b")).toEqual({ oldName: "a", newName: "b2" });
    expect(renameCostume(c, 1, "b")).toEqual({ oldName: "b", newName: "b" });
    expect(renameCostume(c, 5, "x")).toBeNull();
  });

  it("delete mengikuti aturan currentCostume RenderedTarget.deleteCostume", () => {
    const one = { costumes: items("a"), currentCostume: 0 };
    expect(deleteCostume(one, 0)).toBeNull();
    const last = { costumes: items("a", "b", "c"), currentCostume: 2 };
    expect(deleteCostume(last, 2)?.name).toBe("c");
    expect(last.currentCostume).toBe(1);
    const before = { costumes: items("a", "b", "c"), currentCostume: 2 };
    deleteCostume(before, 0);
    expect(before.currentCostume).toBe(1);
    const after = { costumes: items("a", "b", "c"), currentCostume: 0 };
    deleteCostume(after, 1);
    expect(after.currentCostume).toBe(0);
    const same = { costumes: items("a", "b", "c"), currentCostume: 1 };
    deleteCostume(same, 1);
    expect(same.currentCostume).toBe(1);
    expect(deleteCostume(same, 9)).toBeNull();
  });

  it("reorder clamp index & mempertahankan costume aktif lewat nama", () => {
    const s = { costumes: items("a", "b", "c"), currentCostume: 0 };
    expect(reorderCostume(s, 0, 99)).toBe(true);
    expect(names(s.costumes)).toEqual(["b", "c", "a"]);
    expect(s.currentCostume).toBe(2);
    expect(reorderCostume(s, 1, 1)).toBe(false);
  });
});

describe("sound list (scratch-vm)", () => {
  it("add/duplicate/rename/delete/reorder", () => {
    const s = items("pop");
    addSound(s, { name: "pop" });
    expect(names(s)).toEqual(["pop", "pop2"]);
    duplicateSound(s, 0);
    expect(names(s)).toEqual(["pop", "pop3", "pop2"]);
    expect(renameSound(s, 2, "pop")?.newName).toBe("pop2");
    expect(reorderSound(s, 2, 0)).toBe(true);
    expect(names(s)).toEqual(["pop2", "pop", "pop3"]);
    expect(deleteSound(s, 1)?.name).toBe("pop");
    expect(deleteSound(s, 7)).toBeNull();
  });

  it("aturan seleksi sound-tab.jsx", () => {
    expect(selectionAfterSoundDelete(2, 2)).toBe(1);
    expect(selectionAfterSoundDelete(2, 3)).toBe(2);
    expect(selectionAfterSoundDelete(2, 0)).toBe(2);
    expect(selectionAfterSoundDelete(0, 0)).toBe(0);
    expect(clampSoundSelection(5, 3)).toBe(2);
    expect(clampSoundSelection(0, 0)).toBe(0);
  });
});

describe("util", () => {
  it("drop index", () => {
    expect(dropIndexFromPointer([10, 30, 50], 5)).toBe(0);
    expect(dropIndexFromPointer([10, 30, 50], 35)).toBe(2);
    expect(dropIndexFromPointer([10, 30, 50], 99)).toBe(3);
    expect(normalizeDropIndex(0, 3)).toBe(2);
    expect(normalizeDropIndex(2, 0)).toBe(0);
  });

  it("formatCostumeDetails membulatkan ke atas per resolusi", () => {
    expect(formatCostumeDetails([95, 101], 2)).toBe("48 x 51");
    expect(formatCostumeDetails([95.2, 100])).toBe("96 x 100");
    expect(defaultCostumeName(true)).toBe("latar1");
    expect(defaultCostumeName(false, "en")).toBe("costume1");
  });
});
