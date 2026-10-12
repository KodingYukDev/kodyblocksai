import { describe, expect, it, vi } from "vitest";
import { createMemoryAutosaveStore, createShellAutosaver } from "./autosave";
import { makeTranslate, MESSAGES } from "./i18n";
import { computeShellLayout, nextSizeMode } from "./layout";
import { acceptForDevice, getProjectFilename, getProjectTitleFromFilename, isAppleTouchDevice, matchesAccept, normalizeTitle, saveFile } from "./project-file";
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

describe("tata letak tablet & ponsel", () => {
  const VIEWPORTS: [number, number][] = [
    [1024, 768],
    [1180, 820],
    [1366, 1024],
    [768, 1024],
    [820, 1180],
    [1280, 800],
    [800, 1280],
    [390, 844],
    [844, 390],
    [1440, 900],
  ];
  it("panggung selalu muat (lebar & tinggi), rasio 4:3, untuk semua ukuran & mode", () => {
    for (const [w, h] of VIEWPORTS) {
      for (const mode of ["normal", "small"] as const) {
        for (const keypad of [false, true]) {
          const l = computeShellLayout({ width: w, height: h }, mode, { keypad });
          expect(l.dims.width + 2 + 16).toBeLessThanOrEqual(w);
          expect(Math.abs(l.dims.height - l.dims.width * 0.75)).toBeLessThanOrEqual(1);
          const used = 48 + 44 + l.dims.height + 2 + 8 + (keypad ? 60 : 0);
          expect(used).toBeLessThanOrEqual(h);
          if (l.mode === "wide" && !l.spritesInTab) expect(h - used).toBeGreaterThanOrEqual(200);
          if (l.mode === "split" || l.mode === "phone") expect(h - (l.topRowHeight + 48 + 8)).toBeGreaterThanOrEqual(300);
        }
      }
    }
  });
  it("mode per ukuran", () => {
    expect(computeShellLayout({ width: 1024, height: 768 }, "normal").mode).toBe("wide");
    expect(computeShellLayout({ width: 768, height: 1024 }, "normal").mode).toBe("split");
    expect(computeShellLayout({ width: 800, height: 1280 }, "normal").mode).toBe("split");
    expect(computeShellLayout({ width: 390, height: 844 }, "normal").mode).toBe("phone");
    const land = computeShellLayout({ width: 844, height: 390 }, "normal");
    expect(land.mode).toBe("wide");
    expect(land.spritesInTab).toBe(true);
  });
  it("tablet potret: panggung kecil lebih kecil, panel sprite lebih lebar", () => {
    const n = computeShellLayout({ width: 768, height: 1024 }, "normal");
    const s = computeShellLayout({ width: 768, height: 1024 }, "small");
    expect(s.dims.width).toBeLessThan(n.dims.width);
    expect(n.dims.width).toBeGreaterThanOrEqual(400);
  });
  it("layar penuh dengan keypad menyisakan ruang untuk tombol", () => {
    const a = computeShellLayout({ width: 1024, height: 768 }, "fullscreen");
    const b = computeShellLayout({ width: 1024, height: 768 }, "fullscreen", { keypad: true });
    expect(b.dims.height).toBe(a.dims.height - 60);
  });
});

describe("file project di iPad", () => {
  it("deteksi iPad/iPhone termasuk iPadOS desktop UA", () => {
    expect(isAppleTouchDevice({ userAgent: "Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X)", maxTouchPoints: 5 })).toBe(true);
    expect(isAppleTouchDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 5 })).toBe(true);
    expect(isAppleTouchDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 0 })).toBe(false);
    expect(isAppleTouchDevice({ userAgent: "Mozilla/5.0 (Linux; Android 13; SM-X200)", maxTouchPoints: 10 })).toBe(false);
  });
  it("accept dimatikan di iOS untuk .sb3, gambar tetap", () => {
    expect(acceptForDevice(".sb3,.sb,.sb2,.kb", true)).toBe("");
    expect(acceptForDevice(".sb3,.sb,.sb2,.kb", false)).toBe(".sb3,.sb,.sb2,.kb");
    expect(acceptForDevice(".svg,.png,.jpg", true)).toBe(".svg,.png,.jpg");
    expect(matchesAccept("Game.SB3", ".sb3,.sb2")).toBe(true);
    expect(matchesAccept("foto.png", ".sb3,.sb2")).toBe(false);
    expect(matchesAccept("apa.saja", "")).toBe(true);
  });
  it("iOS: simpan lewat lembar Bagikan; ditolak tanpa gesture -> needs-gesture; dibatalkan -> cancelled", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const mk = (err?: string) =>
      ({
        canShare: () => true,
        share: vi.fn(async () => {
          if (err) {
            const e = new Error(err);
            e.name = err;
            throw e;
          }
        }),
      }) as unknown as Navigator;
    expect(await saveFile("a.sb3", bytes, "x", { appleTouch: true, nav: mk() })).toBe("shared");
    expect(await saveFile("a.sb3", bytes, "x", { appleTouch: true, nav: mk("NotAllowedError") })).toBe("needs-gesture");
    expect(await saveFile("a.sb3", bytes, "x", { appleTouch: true, nav: mk("AbortError") })).toBe("cancelled");
  });
});

describe("simpan otomatis", () => {
  it("debounce, satu simpan per rentetan perubahan, markSaved membersihkan, reset menghapus", async () => {
    let now = 100_000;
    const timers: { fn: () => void; at: number }[] = [];
    const store = createMemoryAutosaveStore();
    const serialize = vi.fn(async () => new Uint8Array([9]));
    const a = createShellAutosaver({
      store,
      serialize,
      getTitle: () => "Game",
      now: () => now,
      setTimer: (fn, ms) => {
        const t = { fn, at: now + ms };
        timers.push(t);
        return t;
      },
      clearTimer: (h) => {
        const i = timers.indexOf(h as (typeof timers)[number]);
        if (i >= 0) timers.splice(i, 1);
      },
    });
    const run = async (ms: number) => {
      now += ms;
      for (const t of timers.filter((x) => x.at <= now)) {
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };
    a.changed();
    a.changed();
    a.changed();
    expect(a.dirty).toBe(true);
    await run(3000);
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(store.record).toMatchObject({ title: "Game", dirty: true });
    a.markSaved();
    await run(0);
    expect(a.dirty).toBe(false);
    expect(store.record?.dirty).toBe(false);
    a.changed();
    a.reset();
    await run(20_000);
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(store.record).toBeNull();
    a.dispose();
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
