import { describe, expect, it } from "vitest";
import { makeTranslate, MESSAGES } from "./i18n";
import { computeShellLayout, nextSizeMode } from "./layout";
import { getProjectFilename, getProjectTitleFromFilename, normalizeTitle } from "./project-file";
import { collectExtensions, getExtensionIdForOpcode, monitorRecordToState } from "./runtime-model";
import { DEFAULT_MONITOR, type TargetState } from "@kody/engine";

describe("nama file project", () => {
  it("judul + .sb3, dipotong 100, default bila kosong", () => {
    expect(getProjectFilename("Game Saya")).toBe("Game Saya.sb3");
    expect(getProjectFilename("")).toBe("Project KodyBlocks.sb3");
    expect(getProjectFilename("x".repeat(150))).toBe(`${"x".repeat(100)}.sb3`);
  });
  it("judul dari nama file", () => {
    expect(getProjectTitleFromFilename("Game Saya.sb3")).toBe("Game Saya");
    expect(getProjectTitleFromFilename("lama.sb2")).toBe("lama");
    expect(getProjectTitleFromFilename("lama.sb")).toBe("lama");
    expect(getProjectTitleFromFilename("kody.kb")).toBe("kody");
    expect(getProjectTitleFromFilename("a.b.sb3")).toBe("a.b");
    expect(getProjectTitleFromFilename("foto.png")).toBe("");
    expect(getProjectTitleFromFilename(null)).toBe("");
    expect(normalizeTitle("y".repeat(120)).length).toBe(100);
  });
});

describe("tata letak shell", () => {
  it(">= 1096: panggung penuh 480", () => {
    const l = computeShellLayout({ width: 1280, height: 800 }, "normal");
    expect(l.stacked).toBe(false);
    expect(l.dims.width).toBe(480);
    expect(l.stageColumnWidth).toBe(482);
  });
  it("1024..1095: largeConstrained 408", () => {
    const l = computeShellLayout({ width: 1050, height: 800 }, "normal");
    expect(l.stacked).toBe(false);
    expect(l.displaySize).toBe("largeConstrained");
    expect(l.dims.width).toBe(408);
  });
  it("panggung kecil: 240 & info sprite ringkas", () => {
    const l = computeShellLayout({ width: 1280, height: 800 }, "small");
    expect(l.dims.width).toBe(240);
    expect(l.compactSpriteInfo).toBe(true);
    expect(l.stageColumnWidth).toBe(242);
  });
  it("< 1024: ditumpuk tanpa melebihi lebar layar", () => {
    for (const w of [320, 375, 768, 1023]) {
      const l = computeShellLayout({ width: w, height: 700 }, "normal");
      expect(l.stacked).toBe(true);
      expect(l.dims.width + 2 + 16).toBeLessThanOrEqual(w);
      expect(l.dims.height).toBe(Math.round(l.dims.width * 0.75));
    }
  });
  it("layar penuh & pemulihan mode", () => {
    expect(computeShellLayout({ width: 1920, height: 1080 }, "fullscreen").dims.height).toBe(1024);
    expect(nextSizeMode("fullscreen", "normal", "small")).toBe("small");
    expect(nextSizeMode("fullscreen", "normal", "normal")).toBe("normal");
    expect(nextSizeMode("small", "fullscreen", "small")).toBe("fullscreen");
    expect(nextSizeMode("normal", "small", "normal")).toBe("small");
  });
});

describe("i18n", () => {
  it("kunci id & en sama dan interpolasi", () => {
    expect(Object.keys(MESSAGES.en).sort()).toEqual(Object.keys(MESSAGES.id).sort());
    expect(makeTranslate("id")("monitor.length", { n: 3 })).toBe("panjang 3");
    expect(makeTranslate("en")("monitor.length", { n: 3 })).toBe("length 3");
  });
});

describe("runtime-model", () => {
  it("id ekstensi dari opcode", () => {
    expect(getExtensionIdForOpcode("pen_clear")).toBe("pen");
    expect(getExtensionIdForOpcode("aiHand_handCount")).toBe("aiHand");
    expect(getExtensionIdForOpcode("motion_movesteps")).toBeNull();
    expect(getExtensionIdForOpcode("operator_add")).toBeNull();
    expect(getExtensionIdForOpcode("math_number")).toBeNull();
    expect(getExtensionIdForOpcode("text")).toBeNull();
  });
  it("collectExtensions dari blok & monitor", () => {
    const t = {
      blocks: {
        a: { opcode: "pen_clear" },
        b: { opcode: "motion_movesteps" },
        c: { opcode: "music_playDrumForBeats" },
      },
    } as unknown as TargetState;
    const m = monitorRecordToState({ ...DEFAULT_MONITOR, id: "m", opcode: "aiFace_faceCount" });
    expect(collectExtensions([t], [m]).sort()).toEqual(["aiFace", "music", "pen"]);
    expect(m.x).toBe(0);
    expect(m.y).toBe(0);
  });
});
