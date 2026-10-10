import { describe, expect, it, vi } from "vitest";
import { createAssetStore } from "./asset-store";
import { createAutosaveStoreWithBackend } from "./autosave";
import { AUTOSAVE_SCHEMA, createMemoryBackend, versionKey } from "./autosave-backend";
import { createAutosaver, type AutosaveTimers } from "./autosaver";
import { deserializeProject } from "./deserialize";
import { serializeProject } from "./serialize";
import { enc, normalizeProject, sampleProject, seqIds, SOUND_MD5, SPRITE_MD5, STAGE_MD5, SVG_SPRITE, SVG_STAGE, WAV_BYTES } from "./test-fixtures";

function fixture() {
  const model = deserializeProject(sampleProject(), { makeId: seqIds() });
  const assets = createAssetStore([
    [`${STAGE_MD5}.svg`, enc(SVG_STAGE)],
    [`${SPRITE_MD5}.svg`, enc(SVG_SPRITE)],
    [`${SOUND_MD5}.wav`, WAV_BYTES],
  ]);
  return { model, assets };
}

function clock(start = 1000) {
  let t = start;
  return { now: () => t, tick: (ms = 1) => (t += ms) };
}

describe("AutosaveStore", () => {
  it("simpan lalu muat mengembalikan project dan asset yang sama", async () => {
    const backend = createMemoryBackend();
    const store = createAutosaveStoreWithBackend(backend);
    const { model, assets } = fixture();
    expect(await store.save("p1", "Proyekku", model, assets, "data:image/png;base64,AA")).toBe(1);
    const loaded = await store.load("p1");
    expect(loaded?.title).toBe("Proyekku");
    expect(normalizeProject(serializeProject(loaded!.model))).toEqual(normalizeProject(serializeProject(model)));
    expect(loaded!.assets.get(`${SOUND_MD5}.wav`)).toEqual(WAV_BYTES);
    expect(loaded!.warnings).toEqual([]);
    const [entry] = await store.list();
    expect(entry).toMatchObject({ id: "p1", title: "Proyekku", version: 1, versionCount: 1, dirty: true });
    expect(entry!.thumbnail).toBe("data:image/png;base64,AA");
  });

  it("menyimpan riwayat versi, memangkas yang lama, dan membersihkan asset tak terpakai", async () => {
    const backend = createMemoryBackend();
    const c = clock();
    const store = createAutosaveStoreWithBackend(backend, { maxVersions: 2, now: c.now });
    const { model, assets } = fixture();
    await store.save("p1", "A", model, assets);
    c.tick();
    // versi 2: sprite tanpa sound -> asset wav hanya dirujuk versi 1
    model.targets[1]!.sounds = [];
    await store.save("p1", "A", model, assets);
    c.tick();
    expect(await backend.hasAsset(`${SOUND_MD5}.wav`)).toBe(true);
    await store.save("p1", "A", model, assets);
    expect((await store.listVersions("p1")).map((v) => v.version)).toEqual([2, 3]);
    expect(await backend.getVersion(versionKey("p1", 1))).toBeUndefined();
    expect(await backend.hasAsset(`${SOUND_MD5}.wav`)).toBe(false);
    expect(await backend.hasAsset(`${SPRITE_MD5}.svg`)).toBe(true);
    const v2 = await store.loadVersion("p1", 2);
    expect(v2?.model.targets[1]!.sounds).toEqual([]);
  });

  it("versi terbaru rusak -> mundur ke versi sebelumnya", async () => {
    const backend = createMemoryBackend();
    const store = createAutosaveStoreWithBackend(backend);
    const { model, assets } = fixture();
    await store.save("p1", "A", model, assets);
    await store.save("p1", "A", model, assets);
    await backend.putVersion({ key: versionKey("p1", 2), projectId: "p1", version: 2, projectJson: "{rusak" });
    expect((await store.load("p1"))?.version).toBe(1);
  });

  it("record skema asing diabaikan", async () => {
    const backend = createMemoryBackend();
    await backend.putProject({ schema: AUTOSAVE_SCHEMA + 1, id: "x", title: "x", updatedAt: 1, dirty: true, versions: [] });
    const store = createAutosaveStoreWithBackend(backend);
    expect(await store.list()).toEqual([]);
    expect(await store.load("x")).toBeNull();
  });

  it("pemulihan: draf dirty terbaru; markClean/manual menghapus status dirty", async () => {
    const c = clock();
    const store = createAutosaveStoreWithBackend(createMemoryBackend(), { now: c.now });
    const { model, assets } = fixture();
    await store.save("lama", "Lama", model, assets);
    c.tick(10);
    await store.save("baru", "Baru", model, assets);
    expect((await store.getRecoverable())?.id).toBe("baru");
    await store.markClean("baru");
    expect((await store.getRecoverable())?.id).toBe("lama");
    c.tick(10);
    await store.saveWithOptions("lama", "Lama", model, assets, { reason: "manual" });
    expect(await store.getRecoverable()).toBeNull();
  });

  it("remove menghapus project, versi, dan asset", async () => {
    const backend = createMemoryBackend();
    const store = createAutosaveStoreWithBackend(backend);
    const { model, assets } = fixture();
    await store.save("p1", "A", model, assets);
    await store.remove("p1");
    expect(await store.list()).toEqual([]);
    expect(await backend.listAssetKeys()).toEqual([]);
    expect(await backend.getVersion(versionKey("p1", 1))).toBeUndefined();
  });

  it("save bersamaan diserialkan (nomor versi tidak bentrok)", async () => {
    const store = createAutosaveStoreWithBackend(createMemoryBackend());
    const { model, assets } = fixture();
    const versions = await Promise.all([1, 2, 3].map(() => store.save("p1", "A", model, assets)));
    expect(versions).toEqual([1, 2, 3]);
  });

  it("thumbnail terlalu besar tidak disimpan", async () => {
    const store = createAutosaveStoreWithBackend(createMemoryBackend(), { maxThumbnailLength: 10 });
    const { model, assets } = fixture();
    await store.save("p1", "A", model, assets, "x".repeat(11));
    expect((await store.list())[0]!.thumbnail).toBeUndefined();
  });
});

/** Timer palsu: jalankan callback secara manual menurut waktu. */
function fakeTimers(): AutosaveTimers & { advance(ms: number): void } {
  let now = 0;
  let seq = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = ++seq;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(h) {
      pending.delete(h as number);
    },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...pending]) {
        if (t.at <= now) {
          pending.delete(id);
          t.fn();
        }
      }
    },
  };
}

describe("createAutosaver (debounce)", () => {
  const flushPromises = () => new Promise((r) => setTimeout(r, 0));

  function setup(opts: { delayMs?: number; maxWaitMs?: number } = {}) {
    const timers = fakeTimers();
    const saves: string[] = [];
    const sink = {
      saveWithOptions: vi.fn(async (id: string, title: string) => {
        saves.push(`${id}:${title}`);
        return saves.length;
      }),
    };
    let title = "v0";
    const { model, assets } = fixture();
    const saver = createAutosaver(sink, () => ({ id: "p", title, model, assets }), { ...opts, timers });
    return { timers, saves, sink, saver, setTitle: (t: string) => (title = t) };
  }

  it("menunggu jeda tanpa perubahan lalu menyimpan keadaan terbaru sekali", async () => {
    const { timers, saves, saver, setTitle } = setup({ delayMs: 1000 });
    saver.notifyChange();
    timers.advance(500);
    setTitle("v1");
    saver.notifyChange();
    timers.advance(999);
    expect(saves).toEqual([]);
    timers.advance(1);
    await flushPromises();
    expect(saves).toEqual(["p:v1"]);
    expect(saver.pending).toBe(false);
  });

  it("maxWait memaksa simpan meski perubahan terus-menerus", async () => {
    const { timers, saves, saver } = setup({ delayMs: 1000, maxWaitMs: 3000 });
    for (let i = 0; i < 10; i++) {
      saver.notifyChange();
      timers.advance(500);
    }
    await flushPromises();
    expect(saves.length).toBe(1);
  });

  it("flush menyimpan segera; cancel membatalkan", async () => {
    const { timers, saves, saver } = setup();
    saver.notifyChange();
    await saver.flush();
    expect(saves).toEqual(["p:v0"]);
    saver.notifyChange();
    saver.cancel();
    timers.advance(60_000);
    await flushPromises();
    expect(saves).toHaveLength(1);
    await saver.flush();
    expect(saves).toHaveLength(1);
  });

  it("gagal menyimpan -> onError dan dicoba lagi saat flush", async () => {
    const timers = fakeTimers();
    const onError = vi.fn();
    let fail = true;
    const sink = {
      saveWithOptions: vi.fn(async () => {
        if (fail) throw new Error("kuota penuh");
        return 1;
      }),
    };
    const { model, assets } = fixture();
    const saver = createAutosaver(sink, () => ({ id: "p", title: "t", model, assets }), { timers, onError });
    saver.notifyChange();
    await saver.flush();
    expect(onError).toHaveBeenCalledOnce();
    fail = false;
    await saver.flush();
    expect(sink.saveWithOptions).toHaveBeenCalledTimes(2);
  });
});
