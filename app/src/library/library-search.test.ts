import { describe, expect, it } from "vitest";
import { collectTags, filterLibrary, normalizeSearchText, scoreEntry } from "./library-search";
import type { LibrarySoundEntry } from "./library-types";

const snd = (id: string, name: string, nameEn: string, category: string, tags: string[]): LibrarySoundEntry => ({
  kind: "sound",
  id,
  name,
  nameEn,
  category,
  tags,
  sound: { name, assetId: "a", md5ext: "a.wav", dataFormat: "wav", rate: 22050, sampleCount: 1 },
});

const items = [
  snd("pop", "Pop", "Pop", "effects", ["pendek", "gelembung"]),
  snd("drum-kick", "Drum Kick", "Kick Drum", "percussion", ["drum", "bass"]),
  snd("piano-c", "Piano C", "Piano C", "instruments", ["nada", "musik"]),
  snd("coin", "Koin", "Coin", "game", ["hadiah", "game"]),
];

describe("library-search", () => {
  it("normalisasi menghapus aksen dan tanda baca", () => {
    expect(normalizeSearchText("  Café-Musik!! ")).toBe("cafe musik");
  });

  it("tanpa kueri mengembalikan semua sesuai kategori", () => {
    expect(filterLibrary(items, {}).map((e) => e.id)).toEqual(["pop", "drum-kick", "piano-c", "coin"]);
    expect(filterLibrary(items, { category: "percussion" }).map((e) => e.id)).toEqual(["drum-kick"]);
    expect(filterLibrary(items, { category: "all" })).toHaveLength(4);
  });

  it("kategori juga cocok lewat tag", () => {
    expect(filterLibrary(items, { category: "game" }).map((e) => e.id)).toEqual(["coin"]);
  });

  it("mencari nama Indonesia, Inggris, dan tag; semua kata harus cocok", () => {
    expect(filterLibrary(items, { text: "coin" }).map((e) => e.id)).toEqual(["coin"]);
    expect(filterLibrary(items, { text: "koin" }).map((e) => e.id)).toEqual(["coin"]);
    expect(filterLibrary(items, { text: "musik" }).map((e) => e.id)).toEqual(["piano-c"]);
    expect(filterLibrary(items, { text: "drum bass" }).map((e) => e.id)).toEqual(["drum-kick"]);
    expect(filterLibrary(items, { text: "drum piano" })).toEqual([]);
  });

  it("kecocokan nama lebih tinggi dari kecocokan tag", () => {
    const a = snd("a", "Bass", "Bass", "x", []);
    const b = snd("b", "Gitar", "Guitar", "x", ["bass"]);
    expect(filterLibrary([b, a], { text: "bass" }).map((e) => e.id)).toEqual(["a", "b"]);
    expect(scoreEntry(a, "")).toBe(0);
  });

  it("collectTags unik dan terurut", () => {
    expect(collectTags(items)).toEqual(["bass", "drum", "game", "gelembung", "hadiah", "musik", "nada", "pendek"]);
  });
});
