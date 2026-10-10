/**
 * Konversi dan perbandingan nilai Scratch.
 * Port baris-demi-baris dari scratch-vm 4.8.102 src/util/cast.js (BSD-3-Clause), lihat THIRD_PARTY.md.
 * Setiap cabang sengaja dibiarkan identik (termasuk keanehannya) karena perilaku blok bergantung padanya.
 */
import type { RGB } from "../types/renderer";

export const LIST_INVALID = "INVALID" as const;
export const LIST_ALL = "ALL" as const;
export type ListIndex = number | typeof LIST_INVALID | typeof LIST_ALL;

export interface CastRgbObject {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/** Number(x) ala JS, tanpa melempar untuk symbol (Scratch tidak pernah menerima symbol). */
function jsNumber(value: unknown): number {
  if (typeof value === "symbol") return NaN;
  return Number(value);
}

/** String(x) ala JS. */
function jsString(value: unknown): string {
  return String(value);
}

/** scratch-vm Color.decimalToRgb. */
function decimalToRgb(decimal: number): CastRgbObject {
  const a = (decimal >> 24) & 0xff;
  const r = (decimal >> 16) & 0xff;
  const g = (decimal >> 8) & 0xff;
  const b = decimal & 0xff;
  return { r, g, b, a: a > 0 ? a : 255 };
}

/** scratch-vm Color.hexToRgb (F00, #03F, #0033FF); null bila gagal. */
function hexToRgb(hexIn: string): CastRgbObject | null {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const hex = hexIn.replace(shorthandRegex, (_m, r: string, g: string, b: string) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return {
    r: parseInt(result[1] ?? "0", 16),
    g: parseInt(result[2] ?? "0", 16),
    b: parseInt(result[3] ?? "0", 16),
  };
}

export const Cast = {
  LIST_INVALID,
  LIST_ALL,

  /** Number(x); NaN -> 0. "" -> 0, "0x1A" -> 26, " 5 " -> 5, "Infinity" -> Infinity. */
  toNumber(value: unknown): number {
    if (typeof value === "number") {
      if (Number.isNaN(value)) return 0;
      return value;
    }
    const n = jsNumber(value);
    if (Number.isNaN(n)) return 0;
    return n;
  },

  /** "false" (case-insensitive), "0", "" -> false; string lain true; selain itu Boolean(x). */
  toBoolean(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value === "" || value === "0" || value.toLowerCase() === "false") return false;
      return true;
    }
    return Boolean(value);
  },

  toString(value: unknown): string {
    return jsString(value);
  },

  /** [r,g,b] 0..255 dari "#rrggbb"/"#rgb" atau angka desimal Scratch. */
  toRgbColorList(value: unknown): RGB {
    const color = Cast.toRgbColorObject(value);
    return [color.r, color.g, color.b];
  },

  toRgbColorObject(value: unknown): CastRgbObject {
    if (typeof value === "string" && value.substring(0, 1) === "#") {
      // Bukan hex sungguhan -> hitam.
      return hexToRgb(value) ?? { r: 0, g: 0, b: 0, a: 255 };
    }
    return decimalToRgb(Cast.toNumber(value));
  },

  /** true untuk null atau string yang isinya hanya whitespace (termasuk ""). */
  isWhiteSpace(value: unknown): boolean {
    return value === null || (typeof value === "string" && value.trim().length === 0);
  },

  /**
   * Perbandingan Scratch: numerik bila keduanya bisa jadi angka (whitespace bukan angka),
   * selain itu string case-insensitive. Negatif bila a<b, 0 bila sama, positif bila a>b.
   */
  compare(v1: unknown, v2: unknown): number {
    let n1 = jsNumber(v1);
    let n2 = jsNumber(v2);
    // Sengaja "else if" seperti scratch-vm: hanya satu sisi yang diperiksa whitespace-nya.
    if (n1 === 0 && Cast.isWhiteSpace(v1)) {
      n1 = NaN;
    } else if (n2 === 0 && Cast.isWhiteSpace(v2)) {
      n2 = NaN;
    }
    if (Number.isNaN(n1) || Number.isNaN(n2)) {
      const s1 = jsString(v1).toLowerCase();
      const s2 = jsString(v2).toLowerCase();
      if (s1 < s2) return -1;
      if (s1 > s2) return 1;
      return 0;
    }
    if ((n1 === Infinity && n2 === Infinity) || (n1 === -Infinity && n2 === -Infinity)) return 0;
    return n1 - n2;
  },

  /** Apakah nilai "terlihat" bulat: number bulat/NaN, boolean, atau string tanpa titik. */
  isInt(value: unknown): boolean {
    if (typeof value === "number") {
      if (Number.isNaN(value)) return true;
      return value === parseInt(jsString(value), 10);
    }
    if (typeof value === "boolean") return true;
    if (typeof value === "string") return value.indexOf(".") < 0;
    return false;
  },

  /**
   * Indeks list 1-based; "all" (jika acceptAll), "last", "random"/"any".
   * `random` default Math.random seperti scratch-vm; runtime boleh menyuntik sumber deterministik.
   */
  toListIndex(index: unknown, length: number, acceptAll: boolean, random: () => number = Math.random): ListIndex {
    if (typeof index !== "number") {
      if (index === "all") return acceptAll ? LIST_ALL : LIST_INVALID;
      if (index === "last") {
        if (length > 0) return length;
        return LIST_INVALID;
      } else if (index === "random" || index === "any") {
        if (length > 0) return 1 + Math.floor(random() * length);
        return LIST_INVALID;
      }
    }
    const i = Math.floor(Cast.toNumber(index));
    if (i < 1 || i > length) return LIST_INVALID;
    return i;
  },
};
