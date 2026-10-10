/**
 * Aturan keamanan AI (final, dipakai semua ekstensi AI):
 * - model hanya dari origin sendiri (/models/...), tidak ada CDN / URL dari project;
 * - label & teks dari project/pengguna disanitasi dan dibatasi panjangnya;
 * - ukuran model terlatih yang disimpan di project dibatasi.
 */
export const AI_LIMITS = {
  maxLabelLength: 64,
  maxLabels: 50,
  maxTextInputLength: 2000,
  maxTrainedPayloadBytes: 8 * 1024 * 1024,
  /** Analisis kamera maksimum per detik (hemat CPU, juga di HP murah). */
  maxAnalysesPerSecond: 15,
} as const;

/** Prefix path model yang diizinkan (disajikan dari app/public/models). */
export const MODEL_BASE_PATH = "/models/";

/** true hanya untuk path relatif same-origin di bawah /models/ (tanpa "..", tanpa skema/host). */
export function isAllowedModelUrl(url: string): boolean {
  if (!url.startsWith(MODEL_BASE_PATH)) return false;
  if (url.includes("..") || url.includes("\\") || url.includes("//", 1)) return false;
  return /^[A-Za-z0-9_./-]+$/.test(url);
}

/** Bersihkan label kelas: buang karakter kontrol, trim, potong panjang. */
export function sanitizeLabel(raw: unknown): string {
  const text = typeof raw === "string" ? raw : String(raw ?? "");
  // eslint-disable-next-line no-control-regex
  const cleaned = text.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2066-\u2069]/g, "").trim();
  return cleaned.slice(0, AI_LIMITS.maxLabelLength);
}

/** Potong input teks untuk klasifikasi teks. */
export function clampTextInput(raw: unknown): string {
  const text = typeof raw === "string" ? raw : String(raw ?? "");
  return text.slice(0, AI_LIMITS.maxTextInputLength);
}

/** Validasi model terlatih yang dibaca dari project (input tak tepercaya). */
export function validateTrainedClassifier(value: unknown): string[] {
  const problems: string[] = [];
  if (typeof value !== "object" || value === null) return ["bukan objek"];
  const v = value as Record<string, unknown>;
  if (v.kind !== "image" && v.kind !== "text" && v.kind !== "audio") problems.push("kind tidak valid");
  if (v.version !== 1) problems.push("versi tidak didukung");
  if (!Array.isArray(v.labels)) problems.push("labels bukan array");
  else {
    if (v.labels.length > AI_LIMITS.maxLabels) problems.push("label terlalu banyak");
    if (v.labels.some((l) => typeof l !== "string" || sanitizeLabel(l) !== l)) problems.push("label tidak bersih");
  }
  if (typeof v.payload !== "string") problems.push("payload bukan string");
  else if (v.payload.length > AI_LIMITS.maxTrainedPayloadBytes) problems.push("payload terlalu besar");
  if (typeof v.createdAt !== "number" || !Number.isFinite(v.createdAt)) problems.push("createdAt tidak valid");
  return problems;
}
