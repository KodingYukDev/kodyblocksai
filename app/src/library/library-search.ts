/**
 * Pencarian & filter pustaka. Perilaku dasar mengikuti scratch-gui LibraryComponent:
 * filter tag dulu, lalu cocokkan teks pada nama + tag (tanpa membedakan huruf besar/kecil).
 * Tambahan kita: nama Inggris, abaikan aksen, semua kata kueri harus cocok, urutan relevansi.
 */
import type { LibraryEntry } from "./library-types";

export interface LibraryQuery {
  /** Teks pencarian bebas. */
  text?: string;
  /** Id kategori; "all" atau kosong = semua. */
  category?: string;
}

/** Huruf kecil, tanpa aksen, spasi dirapikan. */
export function normalizeSearchText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function haystack(e: LibraryEntry): { name: string; all: string } {
  const name = normalizeSearchText(`${e.name} ${e.nameEn}`);
  const all = normalizeSearchText(`${e.name} ${e.nameEn} ${e.category} ${e.tags.join(" ")}`);
  return { name, all };
}

/** Skor relevansi; -1 = tidak cocok. */
export function scoreEntry(e: LibraryEntry, query: string): number {
  const q = normalizeSearchText(query);
  if (!q) return 0;
  const { name, all } = haystack(e);
  const words = q.split(" ");
  let score = 0;
  for (const w of words) {
    if (!all.includes(w)) return -1;
    if (name.split(" ").some((part) => part.startsWith(w))) score += 3;
    else if (name.includes(w)) score += 2;
    else score += 1;
  }
  if (name === q) score += 10;
  return score;
}

/** Filter + urutkan. Urutan asli dipertahankan untuk skor yang sama (sort stabil). */
export function filterLibrary<T extends LibraryEntry>(entries: readonly T[], query: LibraryQuery): T[] {
  const cat = query.category && query.category !== "all" ? query.category : null;
  const byCat = cat ? entries.filter((e) => e.category === cat || e.tags.includes(cat)) : entries.slice();
  const text = query.text ?? "";
  if (!normalizeSearchText(text)) return byCat;
  return byCat
    .map((e, i) => ({ e, i, s: scoreEntry(e, text) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.e);
}

/** Semua tag unik (urut abjad) untuk saran pencarian. */
export function collectTags(entries: readonly LibraryEntry[]): string[] {
  const set = new Set<string>();
  for (const e of entries) for (const t of e.tags) set.add(t);
  return [...set].sort();
}
