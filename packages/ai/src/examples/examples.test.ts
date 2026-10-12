import { describe, expect, it } from "vitest";
import { getOpcodeSpec } from "@kody/engine";
import { loadSb3 } from "@kody/project";
import { TRAINED_STATE_KEYS, parseTrained } from "../classifier/storage";
import { AI_EXTENSIONS } from "../catalog";
import { AI_EXAMPLES, buildAiExample, buildAiExampleSb3 } from "./ai-examples";

const KODY = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="80" viewBox="0 0 60 80"><rect width="60" height="80" fill="#0FBD8C"/></svg>';

describe("contoh project AI", () => {
  it("4-6 contoh dengan kartu tutorial lengkap berbahasa Indonesia", () => {
    expect(AI_EXAMPLES.length).toBeGreaterThanOrEqual(4);
    expect(AI_EXAMPLES.length).toBeLessThanOrEqual(6);
    expect(new Set(AI_EXAMPLES.map((e) => e.id)).size).toBe(AI_EXAMPLES.length);
    const known = new Set(AI_EXTENSIONS.map((e) => e.id));
    for (const e of AI_EXAMPLES) {
      expect(e.title.length).toBeGreaterThan(3);
      expect(e.steps.length).toBeGreaterThanOrEqual(3);
      expect(e.extensions.every((x) => known.has(x))).toBe(true);
      if (e.labTab) expect(e.trainClasses.length).toBeGreaterThanOrEqual(2);
    }
  });

  it.each(AI_EXAMPLES.map((e) => e.id))("%s: blok valid (opcode dikenal, rantai parent/next konsisten)", async (id) => {
    const { model } = await buildAiExample(id, { kodySvg: KODY });
    const sprite = model.targets.find((t) => !t.isStage)!;
    const blocks = sprite.blocks;
    const ids = Object.keys(blocks);
    expect(ids.length).toBeGreaterThan(3);
    for (const b of Object.values(blocks)) {
      expect(getOpcodeSpec(b.opcode), b.opcode).toBeDefined();
      if (b.next) expect(blocks[b.next]?.parent).toBe(b.id);
      if (b.parent) expect(blocks[b.parent]).toBeDefined();
      for (const input of Object.values(b.inputs)) {
        if (input.block) expect(blocks[input.block]?.parent).toBe(b.id);
      }
      if (b.topLevel) expect(b.parent).toBeNull();
    }
    for (const op of new Set(Object.values(blocks).map((b) => b.opcode.split("_")[0]))) {
      if (op?.startsWith("ai")) expect(model.extensions).toContain(op);
    }
  });

  it.each(AI_EXAMPLES.map((e) => e.id))("%s: .sb3 bisa dibuka lagi tanpa peringatan", async (id) => {
    const bytes = await buildAiExampleSb3(id, { kodySvg: KODY });
    const loaded = await loadSb3(bytes);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.model.extensions).toEqual(AI_EXAMPLES.find((e) => e.id === id)?.extensions);
  });

  it("chatbot membawa model teks yang sudah dilatih", async () => {
    const bytes = await buildAiExampleSb3("chatbot-perasaan", { kodySvg: KODY });
    const loaded = await loadSb3(bytes);
    const stage = loaded.model.targets.find((t) => t.isStage)!;
    const clf = parseTrained(stage.extensionState?.[TRAINED_STATE_KEYS.text], "text");
    expect(clf.predict("aku senang sekali hari ini")?.label).toBe("senang");
    expect(clf.predict("aku sedih dan menangis")?.label).toBe("sedih");
  });

  it("id tak dikenal ditolak", async () => {
    await expect(buildAiExample("tidak-ada", { kodySvg: KODY })).rejects.toThrow(/tidak dikenal/);
  });
});

describe("tata letak skrip contoh", () => {
  it.each(AI_EXAMPLES.map((e) => e.id))("%s: skrip di kolom yang sama tidak saling menutupi", async (id) => {
    const { model } = await buildAiExample(id, { kodySvg: KODY });
    for (const target of model.targets) {
      const blocks = target.blocks as Record<string, { topLevel: boolean; shadow: boolean; parent: string | null; next: string | null; x?: number; y?: number }>;
      const size = (topId: string): number => Object.values(blocks).filter((b) => !b.shadow && root(b) === topId).length;
      const root = (b: { parent: string | null }): string | null => {
        let cur = b as { parent: string | null };
        let curId: string | null = Object.keys(blocks).find((k) => blocks[k] === cur) ?? null;
        while (cur.parent) {
          curId = cur.parent;
          cur = blocks[cur.parent]!;
        }
        return curId;
      };
      const tops = Object.entries(blocks)
        .filter(([, b]) => b.topLevel)
        .map(([bid, b]) => ({ x: b.x ?? 0, y: b.y ?? 0, n: size(bid) }))
        .sort((a, b) => a.x - b.x || a.y - b.y);
      for (let i = 1; i < tops.length; i++) {
        const prev = tops[i - 1]!;
        const cur = tops[i]!;
        // Paling sedikit ~48 unit per blok (tinggi blok tumpuk Scratch) (hat + badan) di bawah skrip sebelumnya.
        if (prev.x === cur.x) expect(cur.y - prev.y).toBeGreaterThanOrEqual(prev.n * 48);
      }
    }
  });
});
