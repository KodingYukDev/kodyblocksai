/**
 * Oracle harus deterministik: dua kali jalan = trace identik dan tidak memicu spin guard.
 * Kalau gagal, kasusnya yang salah (bergantung jam dinding / loop tanpa yield), bukan engine kita.
 * Set PARITY_SKIP_DETERMINISM=1 untuk melewati (mis. saat iterasi cepat di satu kasus).
 */
import { describe, expect, it } from "vitest";
import { allParityCases } from "./corpus/index";
import { runOracleCase } from "./parity-runner";
import { diffTraces, formatDiffs } from "./trace-diff";

const skip = process.env.PARITY_SKIP_DETERMINISM === "1";
const filter = process.env.PARITY_FILTER ? new RegExp(process.env.PARITY_FILTER) : null;

describe.skipIf(skip)("oracle scratch-vm deterministik", () => {
  for (const c of allParityCases().filter((x) => !filter || filter.test(x.id))) {
    it(c.id, async () => {
      const first = await runOracleCase(c);
      const second = await runOracleCase(c);
      expect(first.spinGuardTriggered, "loop tanpa yield memicu spin guard").toBe(false);
      expect(first.unknownRendererCalls, "scratch-vm memanggil method renderer yang belum ada di facade").toEqual([]);
      const diffs = diffTraces(first.frames, second.frames);
      expect(diffs, formatDiffs(diffs)).toEqual([]);
      expect(first.frames).toHaveLength(c.frames);
    });
  }
});
