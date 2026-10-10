/**
 * Format metadata pustaka aset (app/public/assets/library/library.json).
 * Bentuk entri meniru pustaka scratch-gui (name, tags, md5ext, rotationCenter, bitmapResolution)
 * supaya mudah dipetakan ke CostumeState / SoundState. Semua aset ORISINAL buatan KodingYuk.
 */
import type { CostumeState, SoundState } from "@kody/engine";

export type LibraryKind = "sprite" | "costume" | "backdrop" | "sound";

/** Satu costume di pustaka (dipakai sprite, costume, dan backdrop). */
export interface LibraryCostume {
  name: string;
  assetId: string;
  md5ext: string;
  dataFormat: CostumeState["dataFormat"];
  bitmapResolution: number;
  rotationCenterX: number;
  rotationCenterY: number;
}

export interface LibrarySound {
  name: string;
  assetId: string;
  md5ext: string;
  dataFormat: SoundState["dataFormat"];
  rate: number;
  sampleCount: number;
}

interface LibraryEntryBase {
  /** Id stabil (slug), unik per jenis. */
  id: string;
  /** Nama tampil (Indonesia). */
  name: string;
  /** Nama Inggris untuk pencarian & locale en. */
  nameEn: string;
  /** Kategori utama (dipakai tombol filter). */
  category: string;
  /** Kata kunci tambahan untuk pencarian. */
  tags: string[];
}

export interface LibrarySpriteEntry extends LibraryEntryBase {
  kind: "sprite";
  costumes: LibraryCostume[];
  sounds: LibrarySound[];
}

export interface LibraryCostumeEntry extends LibraryEntryBase {
  kind: "costume";
  costume: LibraryCostume;
}

export interface LibraryBackdropEntry extends LibraryEntryBase {
  kind: "backdrop";
  costume: LibraryCostume;
}

export interface LibrarySoundEntry extends LibraryEntryBase {
  kind: "sound";
  sound: LibrarySound;
}

export type LibraryEntry = LibrarySpriteEntry | LibraryCostumeEntry | LibraryBackdropEntry | LibrarySoundEntry;

export interface LibraryCategory {
  id: string;
  name: string;
  nameEn: string;
}

export interface LibraryCatalog {
  version: 1;
  /** Lisensi semua aset di katalog. */
  license: string;
  categories: Record<Exclude<LibraryKind, "costume">, LibraryCategory[]>;
  sprites: LibrarySpriteEntry[];
  costumes: LibraryCostumeEntry[];
  backdrops: LibraryBackdropEntry[];
  sounds: LibrarySoundEntry[];
}

/** Ubah costume pustaka menjadi CostumeState (nama boleh diganti pemanggil). */
export function toCostumeState(c: LibraryCostume): CostumeState {
  return {
    name: c.name,
    assetId: c.assetId,
    md5ext: c.md5ext,
    dataFormat: c.dataFormat,
    bitmapResolution: c.bitmapResolution,
    rotationCenterX: c.rotationCenterX,
    rotationCenterY: c.rotationCenterY,
  };
}

export function toSoundState(s: LibrarySound): SoundState {
  return {
    name: s.name,
    assetId: s.assetId,
    md5ext: s.md5ext,
    dataFormat: s.dataFormat,
    rate: s.rate,
    sampleCount: s.sampleCount,
  };
}
