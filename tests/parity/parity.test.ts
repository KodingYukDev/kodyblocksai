/**
 * Differential test: setiap kasus korpus dijalankan di scratch-vm (oracle) dan engine kita,
 * lalu trace per frame dibandingkan. Lihat README.md untuk aturan expected-fail / PARITY_STRICT.
 */
import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { PARITY_CATEGORIES } from "./case-types";
import { allParityCases } from "./corpus/index";
import { REQUIRED_PASS, isRequired, isStrict } from "./expectations";
import type { CaseResult } from "./parity-runner";
import { formatErrorSummary, formatParityTable, runParityCase } from "./parity-runner";
import { formatDiffs } from "./trace-diff";

const results: CaseResult[] = [];
const filter = process.env.PARITY_FILTER ? new RegExp(process.env.PARITY_FILTER) : null;
const cases = allParityCases().filter((c) => !filter || filter.test(c.id));

function describeFailure(r: CaseResult): string {
  if (r.status === "error") return `engine error: ${r.error ?? "?"}`;
  if (r.status === "invalid") return `kasus tidak sah: ${r.error ?? "?"}`;
  return `trace berbeda:\n${formatDiffs(r.diffs)}`;
}

for (const category of PARITY_CATEGORIES) {
  const inCat = cases.filter((c) => c.category === category);
  if (inCat.length === 0) continue;
  describe(`parity ${category}`, () => {
    for (const c of inCat) {
      it(`${c.id} - ${c.title}`, async (ctx) => {
        const r = await runParityCase(c);
        results.push(r);
        // Kasus tidak sah adalah bug korpus (bukan bug engine): selalu gagal.
        expect(r.status, describeFailure(r)).not.toBe("invalid");
        if (isRequired(c.id)) {
          expect(r.status, describeFailure(r)).toBe("match");
          return;
        }
        // expected-fail: belum diwajibkan -> skip bila berbeda (laporan tetap mencatat).
        if (r.status !== "match") ctx.skip();
      });
    }
  });
}

afterAll(() => {
  if (results.length === 0) return;
  const sorted = [...results].sort((a, c) => (a.id < c.id ? -1 : 1));
  const lines = [formatParityTable(sorted)];
  const errors = formatErrorSummary(sorted);
  if (errors) lines.push("", "ERROR ENGINE TERBANYAK:", errors);
  const mismatches = sorted.filter((r) => r.status === "mismatch").slice(0, 12);
  if (mismatches.length) {
    lines.push("", "CONTOH PERBEDAAN (maks 12 kasus):");
    for (const r of mismatches) lines.push(`- ${r.id}`, formatDiffs(r.diffs.slice(0, 3)));
  }
  const ready = sorted.filter((r) => r.status === "match" && !REQUIRED_PASS.has(r.id)).map((r) => r.id);
  if (ready.length && !isStrict()) lines.push("", `SIAP DIWAJIBKAN (tambahkan ke expectations.ts): ${ready.join(", ")}`);
  console.log(lines.join("\n"));
  const reportPath = process.env.PARITY_REPORT;
  if (reportPath) {
    const slim = sorted.map(({ oracleFrames: _o, oursFrames: _u, ...rest }) => rest);
    writeFileSync(reportPath, JSON.stringify(slim, null, 2));
  }
});
