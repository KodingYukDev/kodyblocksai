/**
 * Membangun katalog pustaka + isi file aset secara deterministik dari generator orisinal.
 * Dipakai oleh generate-library.test.ts (menulis app/public/assets/library) dan oleh tes
 * konsistensi yang memastikan file di public sama dengan hasil generator.
 */
import { defaultSvgRotationCenter } from "../costume-tab/costume-upload";
import { encodeWav } from "../sound-tab/wav";
import type { BackdropArt, CostumeArt, SoundArt, SpriteArt } from "./art/art-types";
import { backdropArts } from "./art/backdrops";
import { extraBackdropArts } from "./art/backdrops-extra";
import { kodySprites } from "./art/kody";
import { creatureSprites } from "./art/sprites-creatures";
import { objectSprites } from "./art/sprites-objects";
import { extraSprites } from "./art/sprites-extra";
import { soundArts } from "./audio/sound-recipes";
import type {
  LibraryBackdropEntry,
  LibraryCatalog,
  LibraryCategory,
  LibraryCostume,
  LibraryCostumeEntry,
  LibrarySound,
  LibrarySoundEntry,
  LibrarySpriteEntry,
} from "./library-types";
import { md5 } from "./md5";

export const LIBRARY_LICENSE = "Aset orisinal KodingYuk untuk KodyBlocks. Maskot Kody milik KodingYuk. Semua gambar dan suara dibuat sendiri.";

const CATEGORY_NAMES: Record<string, [string, string]> = {
  kody: ["Kody", "Kody"],
  hewan: ["Hewan", "Animals"],
  fantasi: ["Fantasi", "Fantasy"],
  olahraga: ["Olahraga", "Sports"],
  benda: ["Benda", "Things"],
  transportasi: ["Transportasi", "Transportation"],
  alam: ["Alam", "Nature"],
  makanan: ["Makanan", "Food"],
  antarmuka: ["Antarmuka", "Interface"],
  luar: ["Luar Ruang", "Outdoors"],
  air: ["Air", "Underwater"],
  kota: ["Kota", "City"],
  angkasa: ["Angkasa", "Space"],
  dalam: ["Dalam Ruang", "Indoors"],
  belajar: ["Belajar", "Learning"],
  efek: ["Efek", "Effects"],
  kartun: ["Kartun", "Cartoon"],
  musik: ["Musik", "Music"],
  game: ["Game", "Game"],
  perkusi: ["Perkusi", "Percussion"],
  orang: ["Orang", "People"],
  ai: ["Proyek AI", "AI Projects"],
  huruf: ["Huruf & Angka", "Letters & Numbers"],
};

function categories(ids: Iterable<string>): LibraryCategory[] {
  return [...new Set(ids)].map((id) => {
    const [name, nameEn] = CATEGORY_NAMES[id] ?? [id, id];
    return { id, name, nameEn };
  });
}

export interface BuiltLibrary {
  catalog: LibraryCatalog;
  /** md5ext -> isi file. */
  files: Map<string, Uint8Array>;
}

const enc = new TextEncoder();

export function buildLibrary(): BuiltLibrary {
  const files = new Map<string, Uint8Array>();

  const putCostume = (art: CostumeArt): LibraryCostume => {
    const data = enc.encode(art.svg);
    const assetId = md5(data);
    const md5ext = `${assetId}.svg`;
    files.set(md5ext, data);
    const [cx, cy] = art.center ?? defaultSvgRotationCenter(art.svg);
    return { name: art.name, assetId, md5ext, dataFormat: "svg", bitmapResolution: 1, rotationCenterX: cx, rotationCenterY: cy };
  };

  const sounds = soundArts();
  const soundById = new Map<string, { art: SoundArt; sound: LibrarySound }>();
  for (const art of sounds) {
    const data = encodeWav(art.samples, art.rate);
    const assetId = md5(data);
    const md5ext = `${assetId}.wav`;
    files.set(md5ext, data);
    soundById.set(art.id, { art, sound: { name: art.name, assetId, md5ext, dataFormat: "wav", rate: art.rate, sampleCount: art.samples.length } });
  }

  const spriteArts: SpriteArt[] = [...kodySprites(), ...creatureSprites(), ...extraSprites(), ...objectSprites()];
  const sprites: LibrarySpriteEntry[] = spriteArts.map((s) => ({
    kind: "sprite",
    id: s.id,
    name: s.name,
    nameEn: s.nameEn,
    category: s.category,
    tags: s.tags,
    costumes: s.costumes.map(putCostume),
    sounds: s.sounds.map((id) => {
      const found = soundById.get(id);
      if (!found) throw new Error(`Sprite ${s.id} memakai suara tak dikenal: ${id}`);
      return { ...found.sound };
    }),
  }));

  const costumes: LibraryCostumeEntry[] = sprites.flatMap((s) =>
    s.costumes.map((c) => ({ kind: "costume" as const, id: `${s.id}/${c.name}`, name: c.name, nameEn: `${s.nameEn} ${c.name.slice(-1)}`, category: s.category, tags: [...s.tags, s.name.toLowerCase()], costume: c })),
  );

  const backdrops: LibraryBackdropEntry[] = [...backdropArts(), ...extraBackdropArts()].map((b: BackdropArt) => ({
    kind: "backdrop",
    id: b.id,
    name: b.name,
    nameEn: b.nameEn,
    category: b.category,
    tags: b.tags,
    costume: putCostume({ name: b.id, svg: b.svg, center: [240, 180] }),
  }));

  const soundEntries: LibrarySoundEntry[] = [...soundById.values()].map(({ art, sound }) => ({
    kind: "sound",
    id: art.id,
    name: art.name,
    nameEn: art.nameEn,
    category: art.category,
    tags: art.tags,
    sound,
  }));

  const catalog: LibraryCatalog = {
    version: 1,
    license: LIBRARY_LICENSE,
    categories: {
      sprite: categories(sprites.map((s) => s.category)),
      backdrop: categories(backdrops.map((b) => b.category)),
      sound: categories(soundEntries.map((s) => s.category)),
    },
    sprites,
    costumes,
    backdrops,
    sounds: soundEntries,
  };
  return { catalog, files };
}

/** Serialisasi stabil katalog (indentasi 1 spasi, newline akhir). */
export function serializeCatalog(catalog: LibraryCatalog): string {
  return `${JSON.stringify(catalog, null, 1)}\n`;
}
