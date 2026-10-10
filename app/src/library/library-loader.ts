/**
 * Memuat katalog & aset pustaka dari origin sendiri (/assets/library/). Katalog divalidasi
 * strukturnya, nama file harus `<md5>.<ext>`, dan isi file dicek ulang md5-nya sebelum dipakai,
 * jadi file yang rusak/tertukar tidak pernah masuk ke project.
 */
import type { AssetData } from "@kody/engine";
import type {
  LibraryCatalog,
  LibraryCostume,
  LibraryEntry,
  LibrarySound,
} from "./library-types";
import { MD5EXT_RE, md5 } from "./md5";

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> }>;

export class LibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryError";
  }
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function checkCostume(c: unknown, where: string): asserts c is LibraryCostume {
  if (!isObj(c) || !isStr(c.name) || !isStr(c.assetId) || !isStr(c.md5ext) || !MD5EXT_RE.test(c.md5ext) || !c.md5ext.startsWith(c.assetId)) {
    throw new LibraryError(`Costume tidak sah di ${where}`);
  }
  if (!isNum(c.bitmapResolution) || !isNum(c.rotationCenterX) || !isNum(c.rotationCenterY) || !isStr(c.dataFormat)) {
    throw new LibraryError(`Costume tidak sah di ${where}`);
  }
}

function checkSound(s: unknown, where: string): asserts s is LibrarySound {
  if (!isObj(s) || !isStr(s.name) || !isStr(s.assetId) || !isStr(s.md5ext) || !MD5EXT_RE.test(s.md5ext) || !s.md5ext.startsWith(s.assetId)) {
    throw new LibraryError(`Sound tidak sah di ${where}`);
  }
  if (!isNum(s.rate) || !isNum(s.sampleCount) || !isStr(s.dataFormat)) throw new LibraryError(`Sound tidak sah di ${where}`);
}

function checkEntryBase(e: unknown, kind: string): asserts e is LibraryEntry {
  if (!isObj(e) || e.kind !== kind || !isStr(e.id) || !isStr(e.name) || !isStr(e.nameEn) || !isStr(e.category) || !Array.isArray(e.tags) || !e.tags.every(isStr)) {
    throw new LibraryError(`Entri ${kind} tidak sah`);
  }
}

/** Validasi struktur katalog (data dari jaringan dianggap tak tepercaya). */
export function validateCatalog(raw: unknown): LibraryCatalog {
  if (!isObj(raw) || raw.version !== 1) throw new LibraryError("Versi katalog tidak dikenal");
  const lists = ["sprites", "costumes", "backdrops", "sounds"] as const;
  for (const k of lists) if (!Array.isArray(raw[k])) throw new LibraryError(`Katalog tanpa ${k}`);
  for (const s of raw.sprites as unknown[]) {
    checkEntryBase(s, "sprite");
    const sp = s as unknown as Record<string, unknown>;
    if (!Array.isArray(sp.costumes) || sp.costumes.length === 0 || !Array.isArray(sp.sounds)) throw new LibraryError("Sprite tidak sah");
    sp.costumes.forEach((c, i) => checkCostume(c, `${String(sp.id)}#${i}`));
    sp.sounds.forEach((x, i) => checkSound(x, `${String(sp.id)}#${i}`));
  }
  for (const c of raw.costumes as unknown[]) {
    checkEntryBase(c, "costume");
    checkCostume((c as unknown as Record<string, unknown>).costume, "costume");
  }
  for (const b of raw.backdrops as unknown[]) {
    checkEntryBase(b, "backdrop");
    checkCostume((b as unknown as Record<string, unknown>).costume, "backdrop");
  }
  for (const s of raw.sounds as unknown[]) {
    checkEntryBase(s, "sound");
    checkSound((s as unknown as Record<string, unknown>).sound, "sound");
  }
  return raw as unknown as LibraryCatalog;
}

export function defaultLibraryBase(): string {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
  return `${base.endsWith("/") ? base : `${base}/`}assets/library/`;
}

export interface LibraryLoader {
  loadCatalog(): Promise<LibraryCatalog>;
  /** Bytes asset terverifikasi md5. */
  loadAsset(md5ext: string): Promise<AssetData>;
  /** URL file (untuk <img> thumbnail / pratinjau). */
  assetUrl(md5ext: string): string;
}

export function createLibraryLoader(options: { base?: string; fetch?: FetchLike } = {}): LibraryLoader {
  const base = options.base ?? defaultLibraryBase();
  const doFetch: FetchLike = options.fetch ?? ((url) => fetch(url));
  let catalog: Promise<LibraryCatalog> | null = null;
  const assets = new Map<string, Promise<AssetData>>();

  const assetUrl = (md5ext: string): string => {
    if (!MD5EXT_RE.test(md5ext)) throw new LibraryError(`Nama asset tidak sah: ${md5ext}`);
    return `${base}${md5ext}`;
  };

  return {
    assetUrl,
    loadCatalog() {
      catalog ??= doFetch(`${base}library.json`)
        .then(async (res) => {
          if (!res.ok) throw new LibraryError(`Gagal memuat katalog (${res.status})`);
          return validateCatalog(JSON.parse(await res.text()) as unknown);
        })
        .catch((e: unknown) => {
          catalog = null;
          throw e;
        });
      return catalog;
    },
    loadAsset(md5ext: string) {
      let p = assets.get(md5ext);
      if (!p) {
        p = (async () => {
          const res = await doFetch(assetUrl(md5ext));
          if (!res.ok) throw new LibraryError(`Gagal memuat ${md5ext} (${res.status})`);
          const data = new Uint8Array(await res.arrayBuffer());
          const [assetId = "", dataFormat = ""] = md5ext.split(".");
          if (md5(data) !== assetId) throw new LibraryError(`Isi ${md5ext} tidak cocok dengan md5`);
          return { assetId, dataFormat, data };
        })();
        p.catch(() => assets.delete(md5ext));
        assets.set(md5ext, p);
      }
      return p;
    },
  };
}
