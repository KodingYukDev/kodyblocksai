import { describe, expect, it, vi } from "vitest";
import { buildLibrary, serializeCatalog } from "./catalog-build";
import { LibraryError, createLibraryLoader, validateCatalog, type FetchLike } from "./library-loader";
import { loadCostumeEntry, loadSoundEntry, loadSpriteEntry, pickRandom, previewAsset } from "./library-actions";

const built = buildLibrary();
const json = serializeCatalog(built.catalog);

function fakeFetch(files: Map<string, Uint8Array>, catalogText = json): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    const name = url.split("/").pop() ?? "";
    if (name === "library.json") return { ok: true, status: 200, text: async () => catalogText, arrayBuffer: async () => new ArrayBuffer(0) };
    const data = files.get(name);
    if (!data) return { ok: false, status: 404, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, status: 200, text: async () => "", arrayBuffer: async () => data.slice().buffer };
  }) as FetchLike & { calls: string[] };
  fn.calls = calls;
  return fn;
}

describe("library-loader", () => {
  it("memuat & memvalidasi katalog, cache satu kali", async () => {
    const f = fakeFetch(built.files);
    const loader = createLibraryLoader({ base: "/assets/library/", fetch: f });
    const c1 = await loader.loadCatalog();
    const c2 = await loader.loadCatalog();
    expect(c1).toBe(c2);
    expect(c1.sprites.length).toBe(built.catalog.sprites.length);
    expect(f.calls.filter((u) => u.endsWith("library.json"))).toHaveLength(1);
  });

  it("menolak katalog rusak / path aneh", () => {
    expect(() => validateCatalog({ version: 2 })).toThrow(LibraryError);
    const bad = JSON.parse(json) as { backdrops: { costume: { md5ext: string } }[] };
    const first = bad.backdrops[0];
    if (first) first.costume.md5ext = "../../etc/passwd";
    expect(() => validateCatalog(bad)).toThrow(/tidak sah/);
  });

  it("asset diverifikasi md5", async () => {
    const files = new Map(built.files);
    const entry = built.catalog.sounds[0];
    if (!entry) throw new Error("tidak ada suara");
    files.set(entry.sound.md5ext, new Uint8Array([1, 2, 3]));
    const loader = createLibraryLoader({ base: "/x/", fetch: fakeFetch(files) });
    await expect(loader.loadAsset(entry.sound.md5ext)).rejects.toThrow(/tidak cocok/);
    expect(() => loader.assetUrl("evil.js")).toThrow(LibraryError);
  });

  it("aksi pustaka menghasilkan NewCostume/NewSound siap pakai", async () => {
    const loader = createLibraryLoader({ base: "/x/", fetch: fakeFetch(built.files) });
    const kody = built.catalog.sprites.find((s) => s.id === "kody");
    if (!kody) throw new Error("kody hilang");
    const sprite = await loadSpriteEntry(kody, loader);
    expect(sprite.costumes).toHaveLength(kody.costumes.length);
    expect(sprite.costumes[0]?.state).toMatchObject({ dataFormat: "svg", rotationCenterX: 50, rotationCenterY: 50 });
    expect(sprite.sounds[0]?.asset.data.length).toBeGreaterThan(44);
    const bd = built.catalog.backdrops[0];
    if (!bd) throw new Error("latar hilang");
    expect((await loadCostumeEntry(bd, loader)).state.name).toBe(bd.name);
    const snd = built.catalog.sounds[1];
    if (!snd) throw new Error("suara hilang");
    expect((await loadSoundEntry(snd, loader)).state.name).toBe(snd.name);
    expect(previewAsset(kody, 1)).toBe(kody.costumes[1]?.md5ext);
    expect(previewAsset(snd)).toBeNull();
    expect(pickRandom([1, 2, 3], () => 0.99)).toBe(3);
    expect(pickRandom([], () => 0)).toBeUndefined();
  });

  it("gagal muat katalog boleh dicoba lagi", async () => {
    let fail = true;
    const f: FetchLike = vi.fn(async () => {
      if (fail) return { ok: false, status: 500, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
      return { ok: true, status: 200, text: async () => json, arrayBuffer: async () => new ArrayBuffer(0) };
    });
    const loader = createLibraryLoader({ base: "/x/", fetch: f });
    await expect(loader.loadCatalog()).rejects.toThrow(/500/);
    fail = false;
    await expect(loader.loadCatalog()).resolves.toBeTruthy();
  });
});
