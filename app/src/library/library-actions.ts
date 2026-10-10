/**
 * Mengubah entri pustaka menjadi NewCostume/NewSound siap ditambahkan (bytes dimuat & diverifikasi
 * md5 lewat LibraryLoader). Dipakai tab Kostum/Suara dan oleh app-shell untuk "Pilih Sprite".
 */
import { costumeFromLibrary, soundFromLibrary } from "../costume-tab/new-asset";
import type { NewCostume, NewSound } from "../costume-tab/types";
import type { LibraryLoader } from "./library-loader";
import type { LibraryBackdropEntry, LibraryCostumeEntry, LibraryEntry, LibrarySoundEntry, LibrarySpriteEntry } from "./library-types";

export interface LoadedSprite {
  name: string;
  costumes: NewCostume[];
  sounds: NewSound[];
}

export async function loadSpriteEntry(entry: LibrarySpriteEntry, loader: LibraryLoader): Promise<LoadedSprite> {
  const costumes = await Promise.all(entry.costumes.map(async (c) => costumeFromLibrary(c, (await loader.loadAsset(c.md5ext)).data)));
  const sounds = await Promise.all(entry.sounds.map(async (s) => soundFromLibrary(s, (await loader.loadAsset(s.md5ext)).data)));
  return { name: entry.name, costumes, sounds };
}

export async function loadCostumeEntry(entry: LibraryCostumeEntry | LibraryBackdropEntry, loader: LibraryLoader): Promise<NewCostume> {
  const name = entry.kind === "backdrop" ? entry.name : entry.costume.name;
  return costumeFromLibrary(entry.costume, (await loader.loadAsset(entry.costume.md5ext)).data, name);
}

export async function loadSoundEntry(entry: LibrarySoundEntry, loader: LibraryLoader): Promise<NewSound> {
  return soundFromLibrary(entry.sound, (await loader.loadAsset(entry.sound.md5ext)).data, entry.name);
}

/** Pilihan acak untuk tombol "Kejutan" (handleSurprise* scratch-gui). */
export function pickRandom<T>(items: readonly T[], random: () => number = Math.random): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(random() * items.length)];
}

/** md5ext gambar pratinjau sebuah entri, atau null untuk suara. */
export function previewAsset(entry: LibraryEntry, frame = 0): string | null {
  switch (entry.kind) {
    case "sprite": {
      const list = entry.costumes;
      return list.length ? (list[frame % list.length]?.md5ext ?? null) : null;
    }
    case "costume":
    case "backdrop":
      return entry.costume.md5ext;
    case "sound":
      return null;
  }
}

/** Nama tampil sesuai bahasa. */
export function entryName(entry: LibraryEntry, locale: "id" | "en"): string {
  return locale === "en" ? entry.nameEn : entry.name;
}
