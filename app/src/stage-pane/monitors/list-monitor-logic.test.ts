import { describe, expect, it } from "vitest";
import {
  appendItem,
  clampListSize,
  commitEdit,
  csvColumn,
  exportListText,
  handleListKey,
  initialListSize,
  parseCsv,
  removeActiveItem,
  scrollTopForIndex,
  visibleRowRange,
  wrapListIndex,
} from "./list-monitor-logic";

describe("list monitor", () => {
  it("wrapListIndex melingkar", () => {
    expect(wrapListIndex(-1, 3)).toBe(2);
    expect(wrapListIndex(3, 3)).toBe(0);
  });
  it("ukuran awal & batas resize", () => {
    expect(initialListSize(0, 0)).toEqual({ width: 100, height: 200 });
    expect(initialListSize(150, 120)).toEqual({ width: 150, height: 120 });
    expect(clampListSize(1000, 10)).toEqual({ width: 480, height: 60 });
    expect(clampListSize(50, 1000)).toEqual({ width: 100, height: 360 });
  });
  it("commitEdit menulis item aktif", () => {
    expect(commitEdit(["a", "b"], { activeIndex: 1, activeValue: "x" })).toEqual(["a", "x"]);
    expect(commitEdit(["a"], { activeIndex: null, activeValue: null })).toBeNull();
  });
  it("Tab / panah berpindah dan menyimpan edit", () => {
    const r = handleListKey(["a", "b", "c"], { activeIndex: 2, activeValue: "C" }, "Tab", false);
    expect(r.list).toEqual(["a", "b", "C"]);
    expect(r.edit).toEqual({ activeIndex: 0, activeValue: "a" });
    expect(r.preventDefault).toBe(true);
    const up = handleListKey(["a", "b"], { activeIndex: 0, activeValue: "a" }, "ArrowUp", false);
    expect(up.edit.activeIndex).toBe(1);
    const shiftTab = handleListKey(["a", "b"], { activeIndex: 1, activeValue: "b" }, "Tab", true);
    expect(shiftTab.edit.activeIndex).toBe(0);
  });
  it("Enter menyisip di bawah, Shift+Enter di atas", () => {
    const below = handleListKey(["a", "b"], { activeIndex: 0, activeValue: "A" }, "Enter", false);
    expect(below.list).toEqual(["A", "", "b"]);
    expect(below.edit).toEqual({ activeIndex: 1, activeValue: "" });
    const above = handleListKey(["a", "b"], { activeIndex: 1, activeValue: "b" }, "Enter", true);
    expect(above.list).toEqual(["a", "", "b"]);
    expect(above.edit.activeIndex).toBe(1);
    expect(handleListKey(["a"], { activeIndex: 0, activeValue: "a" }, "x", false).handled).toBe(false);
  });
  it("hapus & tambah item", () => {
    expect(removeActiveItem(["a", "b", "c"], { activeIndex: 2, activeValue: "c" })).toEqual({
      list: ["a", "b"],
      edit: { activeIndex: 1, activeValue: "b" },
    });
    expect(removeActiveItem(["a"], { activeIndex: 0, activeValue: "a" }).edit.activeIndex).toBeNull();
    expect(appendItem(["a"])).toEqual({ list: ["a", ""], edit: { activeIndex: 1, activeValue: "" } });
  });
  it("virtualisasi & scrollToIndex", () => {
    expect(visibleRowRange(0, 156, 1000, 0)).toEqual({ start: 0, end: 7 });
    expect(visibleRowRange(240, 156, 1000, 2)).toEqual({ start: 8, end: 19 });
    expect(visibleRowRange(0, 100, 0)).toEqual({ start: 0, end: 0 });
    expect(scrollTopForIndex(10, 0, 100)).toBe(164);
    expect(scrollTopForIndex(1, 100, 100)).toBe(24);
    expect(scrollTopForIndex(5, 100, 100)).toBe(100);
  });
  it("ekspor CRLF & impor CSV", () => {
    expect(exportListText(["a", 1, true])).toBe("a\r\n1\r\ntrue");
    const rows = parseCsv('nama,umur\r\n"Budi, S",10\n"kata ""kutip""",\n');
    expect(rows).toEqual([
      ["nama", "umur"],
      ["Budi, S", "10"],
      ['kata "kutip"', ""],
    ]);
    expect(csvColumn([["a", "b"], ["c"]], 2)).toEqual(["b"]);
  });
});
