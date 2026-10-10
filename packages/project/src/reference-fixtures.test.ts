/**
 * Proyek contoh dari repo referensi scratch-vm (test/fixtures/*.sb3, hanya dibaca sebagai data).
 * `__fixtures__/scratch-vm-oracle/*.json` = keluaran vm.toJSON() scratch-vm 5.0.300 untuk file
 * yang sama (dibuat sekali lewat skrip generator di luar repo; lihat README di folder itu).
 * Hasil serialisasi kita harus identik setelah normalisasi id acak.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadSb3, saveSb3 } from "./sb3-file";
import type { SB3Project } from "./sb3-types";
import { serializeProject } from "./serialize";
import { normalizeProject } from "./test-fixtures";

type Mutable = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const FIXTURES = "D:/Aril Saputra/Project/Products/_reference/scratch-vm/test/fixtures";
const ORACLE = new URL("./__fixtures__/scratch-vm-oracle/", import.meta.url);
const hasFixtures = existsSync(FIXTURES);

const ORACLE_CASES = [
  "broadcast_special_chars",
  "cloud_variables_exceeded_limit",
  "cloud_variables_local",
  "comments",
  "comments_no_duplicate_id_serialization",
  "default",
  "draggable",
  "edge-triggered-hat",
  "list-monitor-rename",
  "monitored_variables",
  "origin",
  "timer-monitor",
  "top-level-reporters",
  "variable_characters",
];

const readFixture = (name: string): Uint8Array => new Uint8Array(readFileSync(`${FIXTURES}/${name}.sb3`));

/** Samakan hal yang memang berbeda karena lingkungan oracle (tanpa renderer) atau id acak. */
function comparable(ours: SB3Project, oracle: SB3Project): [unknown, unknown] {
  const a = structuredClone(ours) as Mutable;
  const b = structuredClone(oracle) as Mutable;
  a.targets.forEach((t: Mutable, ti: number) => {
    // oracle tanpa renderer tidak menulis layerOrder; diuji terpisah.
    delete t.layerOrder;
    delete b.targets[ti].layerOrder;
    t.costumes.forEach((c: Mutable, ci: number) => {
      if (!("bitmapResolution" in b.targets[ti].costumes[ci])) delete c.bitmapResolution;
    });
    // SoundState belum menyimpan `format` (lihat open issue).
    for (const s of b.targets[ti].sounds) delete s.format;
  });
  return [normalizeProject(a as SB3Project), normalizeProject({ ...b, meta: { semver: "3.0.0" } } as SB3Project)];
}

describe.skipIf(!hasFixtures)("fixture scratch-vm", () => {
  for (const name of ORACLE_CASES) {
    it(`${name}: serialisasi identik dengan scratch-vm`, async () => {
      const loaded = await loadSb3(readFixture(name));
      const ours = serializeProject(loaded.model, { agent: "test" });
      const oracle = JSON.parse(readFileSync(new URL(`${name}.json`, ORACLE), "utf8")) as SB3Project;
      const [a, b] = comparable(ours, oracle);
      expect(a).toEqual(b);
    });
  }

  it("round-trip .sb3 menjaga project.json & layerOrder", async () => {
    for (const name of ORACLE_CASES) {
      const first = await loadSb3(readFixture(name));
      const second = await loadSb3(await saveSb3(first.model, first.assets));
      expect(normalizeProject(serializeProject(second.model))).toEqual(normalizeProject(serializeProject(first.model)));
      expect(second.model.targets.map((t) => t.layerOrder)).toEqual(first.model.targets.map((t) => t.layerOrder));
      expect([...second.assets.keys()].sort()).toEqual([...first.assets.keys()].sort());
    }
  });

  it("cloud_variables_exceeded_limit: hanya 10 variabel cloud", async () => {
    const { model } = await loadSb3(readFixture("cloud_variables_exceeded_limit"));
    const stage = model.targets.find((t) => t.isStage)!;
    expect(Object.values(stage.variables).filter((v) => v.isCloud)).toHaveLength(10);
  });

  it("origin.sb3 menyimpan meta.origin; origin-absent tidak", async () => {
    expect((await loadSb3(readFixture("origin"))).model.meta.origin).toBe("test origin");
    expect((await loadSb3(readFixture("origin-absent"))).model.meta.origin).toBeUndefined();
  });

  it("asset hilang/rusak tetap memuat dengan peringatan", async () => {
    for (const name of ["missing_png", "missing_svg", "missing_sound"]) {
      const loaded = await loadSb3(readFixture(name));
      expect(loaded.warnings.length).toBeGreaterThan(0);
    }
    for (const name of ["corrupt_png", "corrupt_svg", "corrupt_sound"]) {
      await expect(loadSb3(readFixture(name))).resolves.toBeDefined();
    }
  });

  it("monitors.sb3 ditolak karena memakai ekstensi EV3 yang belum didukung", async () => {
    await expect(loadSb3(readFixture("monitors"))).rejects.toThrow(/EV3/);
    const loaded = await loadSb3(readFixture("monitors"), { unknownOpcodes: "warn" });
    expect(loaded.model.monitors.length).toBeGreaterThan(10);
  });
});
