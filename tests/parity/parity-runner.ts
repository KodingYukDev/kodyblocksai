/** Menjalankan satu kasus di kedua VM, membandingkan trace, dan membuat tabel PARITY per kategori. */
import type { ParityCase, ParityCategory } from "./case-types";
import { PARITY_CATEGORIES } from "./case-types";
import { runEngineDetailed } from "./engine-runner";
import { runOracleDetailed } from "./scratch-vm-oracle";
import type { TraceDiff } from "./trace-diff";
import { diffTraces } from "./trace-diff";
import type { FrameSnapshot } from "./snapshot";

export type CaseStatus = "match" | "mismatch" | "error" | "invalid";

export interface CaseResult {
  id: string;
  category: ParityCategory;
  status: CaseStatus;
  diffs: TraceDiff[];
  /** Pesan error engine kita (atau alasan invalid). */
  error?: string;
  oracleFrames: FrameSnapshot[];
  oursFrames: FrameSnapshot[];
}

function runOpts(c: ParityCase) {
  return {
    frames: c.frames,
    seed: c.seed ?? 1,
    compatibilityMode: c.compatibilityMode ?? true,
    turbo: c.turbo ?? false,
    greenFlag: c.greenFlag ?? true,
    actions: c.actions ?? [],
  };
}

export async function runOracleCase(c: ParityCase) {
  return runOracleDetailed(c.project, runOpts(c));
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 300);
  return String(e).slice(0, 300);
}

export async function runParityCase(c: ParityCase): Promise<CaseResult> {
  const base = { id: c.id, category: c.category };
  const oracle = await runOracleCase(c);
  if (oracle.spinGuardTriggered) {
    return { ...base, status: "invalid", diffs: [], error: "oracle memicu spin guard (loop tanpa yield)", oracleFrames: oracle.frames, oursFrames: [] };
  }
  try {
    const ours = await runEngineDetailed(c.project, runOpts(c));
    const oracleErrFrames = new Set(oracle.stepErrors.map((e) => e.frame));
    const extra = ours.stepErrors.find((e) => !oracleErrFrames.has(e.frame));
    if (extra) {
      return { ...base, status: "error", diffs: [], error: `frame ${extra.frame}: ${extra.message}`.slice(0, 300), oracleFrames: oracle.frames, oursFrames: ours.frames };
    }
    const diffs = diffTraces(oracle.frames, ours.frames);
    const status: CaseStatus = diffs.length === 0 ? "match" : "mismatch";
    const result: CaseResult = { ...base, status, diffs, oracleFrames: oracle.frames, oursFrames: ours.frames };
    if (ours.spinGuardTriggered) result.error = "engine kita memicu spin guard (loop tanpa yield / jam dibaca berlebihan)";
    return result;
  } catch (e) {
    return { ...base, status: "error", diffs: [], error: errorMessage(e), oracleFrames: oracle.frames, oursFrames: [] };
  }
}

// ---------------------------------------------------------------- laporan

interface Row {
  total: number;
  match: number;
  mismatch: number;
  error: number;
  invalid: number;
}

const pad = (s: string | number, n: number): string => String(s).padEnd(n);
const lpad = (s: string | number, n: number): string => String(s).padStart(n);

export function formatParityTable(results: readonly CaseResult[]): string {
  const rows = new Map<ParityCategory, Row>();
  for (const cat of PARITY_CATEGORIES) rows.set(cat, { total: 0, match: 0, mismatch: 0, error: 0, invalid: 0 });
  for (const r of results) {
    const row = rows.get(r.category);
    if (!row) continue;
    row.total++;
    row[r.status]++;
  }
  const header = `${pad("KATEGORI", 11)}${lpad("KASUS", 7)}${lpad("SAMA", 7)}${lpad("BEDA", 7)}${lpad("ERROR", 7)}${lpad("INVALID", 9)}${lpad("PARITY", 9)}`;
  const line = "-".repeat(header.length);
  const out = ["PARITY engine KodyBlocks vs scratch-vm", line, header, line];
  const sum: Row = { total: 0, match: 0, mismatch: 0, error: 0, invalid: 0 };
  for (const [cat, row] of rows) {
    if (row.total === 0) continue;
    for (const k of Object.keys(sum) as (keyof Row)[]) sum[k] += row[k];
    const pct = row.total ? `${Math.round((row.match / row.total) * 100)}%` : "-";
    out.push(`${pad(cat, 11)}${lpad(row.total, 7)}${lpad(row.match, 7)}${lpad(row.mismatch, 7)}${lpad(row.error, 7)}${lpad(row.invalid, 9)}${lpad(pct, 9)}`);
  }
  out.push(line);
  const pct = sum.total ? `${Math.round((sum.match / sum.total) * 100)}%` : "-";
  out.push(`${pad("TOTAL", 11)}${lpad(sum.total, 7)}${lpad(sum.match, 7)}${lpad(sum.mismatch, 7)}${lpad(sum.error, 7)}${lpad(sum.invalid, 9)}${lpad(pct, 9)}`);
  return out.join("\n");
}

/** Ringkasan error engine (dikelompokkan) supaya agent lain tahu stub mana yang menghambat. */
export function formatErrorSummary(results: readonly CaseResult[], limit = 10): string {
  const groups = new Map<string, string[]>();
  for (const r of results) {
    if (r.status !== "error" || !r.error) continue;
    const key = r.error.split("\n")[0] ?? r.error;
    groups.set(key, [...(groups.get(key) ?? []), r.id]);
  }
  const sorted = [...groups.entries()].sort((a, c) => c[1].length - a[1].length).slice(0, limit);
  return sorted.map(([msg, ids]) => `  ${ids.length}x ${msg}\n     mis. ${ids.slice(0, 3).join(", ")}`).join("\n");
}
