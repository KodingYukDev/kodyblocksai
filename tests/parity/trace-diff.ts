/**
 * Pembanding trace. Kesetaraan primitif memakai Object.is (sama seperti toEqual vitest):
 * 0 vs -0 dan "10" vs 10 dianggap BERBEDA, NaN sama dengan NaN.
 */
import type { FrameSnapshot } from "./snapshot";

export interface TraceDiff {
  frame: number;
  /** Jalur properti, mis. `targets[1](Sprite1).x`. */
  path: string;
  oracle: unknown;
  ours: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function diffValue(frame: number, path: string, a: unknown, c: unknown, out: TraceDiff[], limit: number): void {
  if (out.length >= limit) return;
  if (Array.isArray(a) && Array.isArray(c)) {
    if (a.length !== c.length) out.push({ frame, path: `${path}.length`, oracle: a.length, ours: c.length });
    const n = Math.min(a.length, c.length);
    for (let i = 0; i < n; i++) {
      const label = isPlainObject(a[i]) && typeof (a[i] as { name?: unknown }).name === "string"
        ? `${path}[${i}](${String((a[i] as { name: string }).name)})`
        : `${path}[${i}]`;
      diffValue(frame, label, a[i], c[i], out, limit);
    }
    return;
  }
  if (isPlainObject(a) && isPlainObject(c)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(c)]);
    for (const k of [...keys].sort()) {
      if (!(k in c)) out.push({ frame, path: `${path}.${k}`, oracle: a[k], ours: "<tidak ada>" });
      else if (!(k in a)) out.push({ frame, path: `${path}.${k}`, oracle: "<tidak ada>", ours: c[k] });
      else diffValue(frame, `${path}.${k}`, a[k], c[k], out, limit);
      if (out.length >= limit) return;
    }
    return;
  }
  if (!Object.is(a, c)) out.push({ frame, path, oracle: a, ours: c });
}

/** Bandingkan dua trace; kembalikan maksimal `limit` perbedaan pertama (urut frame). */
export function diffTraces(oracle: readonly FrameSnapshot[], ours: readonly FrameSnapshot[], limit = 8): TraceDiff[] {
  const out: TraceDiff[] = [];
  if (oracle.length !== ours.length) {
    out.push({ frame: 0, path: "frames.length", oracle: oracle.length, ours: ours.length });
  }
  const n = Math.min(oracle.length, ours.length);
  for (let i = 0; i < n && out.length < limit; i++) {
    const a = oracle[i];
    const c = ours[i];
    if (!a || !c) continue;
    const { frame: _f1, ...restA } = a;
    const { frame: _f2, ...restC } = c;
    diffValue(a.frame, "", restA, restC, out, limit);
  }
  return out.map((d) => ({ ...d, path: d.path.replace(/^\./, "") }));
}

function show(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" && Object.is(v, -0)) return "-0";
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s.length > 80 ? `${s.slice(0, 77)}...` : s;
  } catch {
    return String(v);
  }
}

export function formatDiffs(diffs: readonly TraceDiff[]): string {
  return diffs.map((d) => `  frame ${d.frame} ${d.path}: scratch-vm=${show(d.oracle)} kita=${show(d.ours)}`).join("\n");
}
