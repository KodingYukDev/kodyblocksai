import { describe, expect, it } from "vitest";
import { makeTranslate } from "../../shell/i18n";
import {
  adaptMonitor,
  availableModes,
  formatMonitorValue,
  getCategoryColor,
  nextMonitorMode,
  normalizeSliderRange,
  parseSliderPrompt,
  sliderPromptInitial,
  sliderStep,
} from "./monitor-adapter";

const en = makeTranslate("en");
const id = makeTranslate("id");
const rec = (opcode: string, params: Record<string, string> = {}, value: never | string | number | boolean | (string | number | boolean)[] = 0, spriteName: string | null = null) => ({
  opcode,
  params,
  value,
  spriteName,
});

describe("monitorAdapter", () => {
  it("label variabel/list dari params, sprite lokal diberi prefix", () => {
    expect(adaptMonitor(rec("data_variable", { VARIABLE: "skor" }), en).label).toBe("skor");
    expect(adaptMonitor(rec("data_variable", { VARIABLE: "hp" }, 1, "Kody"), en).label).toBe("Kody: hp");
    expect(adaptMonitor(rec("data_listcontents", { LIST: "isi" }, []), en)).toMatchObject({ label: "isi", category: "list" });
  });
  it("label opcode bawaan (en & id)", () => {
    expect(adaptMonitor(rec("motion_xposition"), en).label).toBe("x position");
    expect(adaptMonitor(rec("motion_xposition"), id).label).toBe("posisi x");
    expect(adaptMonitor(rec("looks_costumenumbername", { NUMBER_NAME: "number" }), en).label).toBe("costume number");
    expect(adaptMonitor(rec("looks_costumenumbername", { NUMBER_NAME: "name" }), en).label).toBe("costume name");
    expect(adaptMonitor(rec("sensing_current", { CURRENTMENU: "DAYOFWEEK" }), en).label).toBe("day of week");
    expect(adaptMonitor(rec("sensing_timer"), en).category).toBe("sensing");
  });
  it("opcode tak dikenal -> kategori extension, label = opcode; resolver ekstensi menang", () => {
    expect(adaptMonitor(rec("music_getTempo"), en)).toMatchObject({ label: "music_getTempo", category: "extension" });
    expect(adaptMonitor(rec("aiFace_faceCount"), en, () => ({ label: "jumlah wajah" })).label).toBe("jumlah wajah");
  });
  it("nilai: angka 6 desimal, boolean & item list jadi string", () => {
    expect(formatMonitorValue(0.1 + 0.2)).toBe("0.3");
    expect(formatMonitorValue(1 / 3)).toBe("0.333333");
    expect(formatMonitorValue(1e21)).toBe("1e+21");
    expect(formatMonitorValue(true)).toBe("true");
    expect(formatMonitorValue([1, false, "a"])).toEqual(["1", "false", "a"]);
    expect(formatMonitorValue("teks")).toBe("teks");
  });
  it("warna kategori sama dengan scratch-blocks", () => {
    expect(getCategoryColor("data").background).toBe("#FF8C1A");
    expect(getCategoryColor("list").background).toBe("#FF661A");
    expect(getCategoryColor("motion").background).toBe("#4C97FF");
    expect(getCategoryColor("extension").background).toBe("#0FBD8C");
    expect(getCategoryColor("sound").text).toBe("#FFFFFF");
  });
});

describe("mode monitor", () => {
  it("availableModes persis containers/monitor.jsx", () => {
    expect(availableModes("data_variable")).toEqual(["default", "large", "slider"]);
    expect(availableModes("data_listcontents")).toEqual(["list"]);
    expect(availableModes("motion_xposition")).toEqual(["default", "large"]);
  });
  it("klik ganda berpindah mode melingkar", () => {
    expect(nextMonitorMode("data_variable", "default")).toBe("large");
    expect(nextMonitorMode("data_variable", "slider")).toBe("default");
    expect(nextMonitorMode("motion_xposition", "large")).toBe("default");
  });
});

describe("slider", () => {
  it("rentang ditukar bila terbalik; step diskrit", () => {
    expect(normalizeSliderRange(10, -5)).toEqual({ sliderMin: -5, sliderMax: 10 });
    expect(sliderStep(true)).toBe(1);
    expect(sliderStep(false)).toBe(0.01);
  });
  it("isi awal & validasi dialog", () => {
    expect(sliderPromptInitial(0, 100, true)).toEqual({ minText: "0", maxText: "100" });
    expect(sliderPromptInitial(0, 1, false)).toEqual({ minText: "0.00", maxText: "1.00" });
    expect(parseSliderPrompt("0", "50")).toEqual({ min: 0, max: 50, isDiscrete: true });
    expect(parseSliderPrompt("0", "0.5")).toEqual({ min: 0, max: 0.5, isDiscrete: false });
    expect(parseSliderPrompt("abc", "5")).toBeNull();
    expect(parseSliderPrompt("1e2", "300")).toEqual({ min: 100, max: 300, isDiscrete: true });
  });
});
