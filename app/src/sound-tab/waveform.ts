/** Geometri tampilan gelombang & seleksi editor suara (murni). */

/** Path SVG gelombang simetris dari level RMS per chunk; titik tengah di height/2. */
export function waveformPath(levels: readonly number[], width: number, height: number): string {
  if (levels.length === 0 || width <= 0) return `M0 ${height / 2}H${width}`;
  const step = Math.max(1, Math.ceil(levels.length / width));
  const picked: number[] = [0];
  for (let i = 0; i < levels.length; i += step) picked.push(Math.min(1, levels[i] ?? 0));
  picked.push(0);
  const mid = height / 2;
  const xs = picked.map((_, i) => (width * i) / (picked.length - 1));
  const r = (n: number): string => String(Math.round(n * 10) / 10);
  let d = `M${r(xs[0] ?? 0)} ${r(mid)}`;
  for (let i = 1; i < picked.length; i++) d += `L${r(xs[i] ?? 0)} ${r(mid - (picked[i] ?? 0) * mid)}`;
  for (let i = picked.length - 1; i >= 0; i--) d += `L${r(xs[i] ?? 0)} ${r(mid + (picked[i] ?? 0) * mid)}`;
  return `${d}Z`;
}

/** Seleksi dari seret piksel; terlalu kecil (< 1% lebar) = tanpa seleksi. */
export function selectionFromDrag(x0: number, x1: number, width: number): { trimStart: number; trimEnd: number } | null {
  if (width <= 0) return null;
  const a = Math.max(0, Math.min(1, Math.min(x0, x1) / width));
  const b = Math.max(0, Math.min(1, Math.max(x0, x1) / width));
  return b - a < 0.01 ? null : { trimStart: a, trimEnd: b };
}

/** Format durasi "0,42 dtk" / "1.5 s". */
export function formatDuration(sampleCount: number, rate: number, locale: "id" | "en" = "id"): string {
  const sec = rate > 0 ? sampleCount / rate : 0;
  const v = sec.toFixed(2);
  return locale === "id" ? `${v.replace(".", ",")} dtk` : `${v} s`;
}
