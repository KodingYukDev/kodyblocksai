/** Helper tipe untuk validasi JSON tak tepercaya. */
import type { IssueReport } from "./report";
import { PROJECT_LIMITS } from "./types";

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type JsonObject = { [k: string]: Json };

export const isObject = (v: unknown): v is JsonObject =>
  typeof v === "object" && v !== null && !Array.isArray(v);
export const isString = (v: unknown): v is string => typeof v === "string";
export const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const isInteger = (v: unknown): v is number => isNumber(v) && Number.isInteger(v);
export const isBool = (v: unknown): v is boolean => typeof v === "boolean";
export const isScalar = (v: unknown): v is string | number | boolean => isString(v) || isNumber(v) || isBool(v);
export const isOptString = (v: unknown): v is string | null => v === null || isString(v);

export const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Kunci yang berbahaya bila ditulis ke objek biasa (prototype pollution). */
const FORBIDDEN_KEYS = new Set(["__proto__"]);

/**
 * Validasi kunci sebuah record (id blok/variabel/dll). Mengembalikan false bila kunci ditolak.
 */
export function checkKey(report: IssueReport, path: string, key: string): boolean {
  if (FORBIDDEN_KEYS.has(key)) {
    report.error("forbidden-key", path, `kunci "${key}" tidak diizinkan`);
    return false;
  }
  if (key.length > PROJECT_LIMITS.maxIdLength) {
    report.error("id-too-long", path, `id lebih dari ${PROJECT_LIMITS.maxIdLength} karakter`);
    return false;
  }
  return true;
}

/** Pastikan nilai opsional (bila ada) bertipe benar. */
export function optional(
  report: IssueReport,
  obj: JsonObject,
  key: string,
  path: string,
  test: (v: unknown) => boolean,
  expected: string,
): void {
  if (hasOwn(obj, key) && !test(obj[key])) {
    report.error("type", `${path}.${key}`, `harus ${expected}`);
  }
}

/** Pastikan nilai wajib ada dan bertipe benar. */
export function required(
  report: IssueReport,
  obj: JsonObject,
  key: string,
  path: string,
  test: (v: unknown) => boolean,
  expected: string,
): boolean {
  if (!hasOwn(obj, key)) {
    report.error("missing", `${path}.${key}`, `wajib ada (${expected})`);
    return false;
  }
  if (!test(obj[key])) {
    report.error("type", `${path}.${key}`, `harus ${expected}`);
    return false;
  }
  return true;
}

/** Path yang aman ditampilkan (id panjang dipotong). */
export function seg(id: string): string {
  const short = id.length > 40 ? `${id.slice(0, 37)}...` : id;
  return JSON.stringify(short);
}
