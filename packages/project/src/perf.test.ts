import { describe, expect, it } from "vitest";
import { loadSb3, saveSb3 } from "./sb3-file";
import type { SB3Project } from "./sb3-types";
import { sampleProject, zipProject } from "./test-fixtures";

/** Project besar: banyak sprite, masing-masing skrip panjang + variabel + list besar. */
function bigProject(sprites: number, blocksPerSprite: number): SB3Project {
  const p = sampleProject();
  const base = p.targets[1]!;
  for (let s = 0; s < sprites; s++) {
    const blocks: Record<string, unknown> = {};
    blocks.h = { opcode: "event_whenflagclicked", next: "b0", parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 0, y: 0 };
    for (let i = 0; i < blocksPerSprite; i++) {
      blocks[`b${i}`] = {
        opcode: i % 2 ? "motion_movesteps" : "looks_sayforsecs",
        next: i + 1 < blocksPerSprite ? `b${i + 1}` : null,
        parent: i ? `b${i - 1}` : "h",
        inputs: i % 2 ? { STEPS: [1, [4, String(i)]] } : { MESSAGE: [1, [10, `halo ${i}`]], SECS: [1, [4, "1"]] },
        fields: {},
        shadow: false,
        topLevel: false,
      };
    }
    p.targets.push({
      ...structuredClone(base),
      name: `Sprite${s}`,
      blocks: blocks as SB3Project["targets"][number]["blocks"],
      variables: { [`v${s}`]: ["nilai", s] },
      lists: { [`l${s}`]: ["data", Array.from({ length: 2000 }, (_, i) => i)] },
      layerOrder: s + 2,
    });
  }
  return p;
}

describe("performa project besar", () => {
  it("100 sprite x 500 blok (+ list 2000 item per sprite) dimuat & disimpan dalam batas wajar", async () => {
    const bytes = await zipProject(bigProject(100, 500));
    const t0 = performance.now();
    const loaded = await loadSb3(bytes);
    const t1 = performance.now();
    const saved = await saveSb3(loaded.model, loaded.assets);
    const t2 = performance.now();
    const blockCount = loaded.model.targets.reduce((n, t) => n + Object.keys(t.blocks).length, 0);
    console.log(`blok=${blockCount} muat=${Math.round(t1 - t0)}ms simpan=${Math.round(t2 - t1)}ms ukuran=${Math.round(bytes.length / 1024)}KB`);
    expect(loaded.model.targets.length).toBe(102);
    expect(blockCount).toBeGreaterThan(50_000);
    expect(saved.length).toBeGreaterThan(0);
    // Batas longgar (mesin CI lambat); menangkap regresi kuadratik, bukan mengukur mikro.
    expect(t1 - t0).toBeLessThan(20_000);
    expect(t2 - t1).toBeLessThan(20_000);
  }, 60_000);
});
