/**
 * Autosave IndexedDB: simpan project (sebagai project.json sb3 + asset ber-md5), riwayat versi,
 * daftar draf, dan pemulihan setelah tab tertutup/crash. Data dari IndexedDB dianggap tak tepercaya
 * dan dimuat ulang lewat validasi yang sama dengan .sb3.
 */
import type { ProjectModel } from "@kody/engine";
import { createAssetStore, referencedAssets } from "./asset-store";
import {
  AUTOSAVE_SCHEMA,
  createIdbBackend,
  createMemoryBackend,
  versionKey,
  type AutosaveBackend,
  type ProjectRecord,
  type SaveReason,
  type VersionMeta,
} from "./autosave-backend";
import { deserializeProjectWithReport } from "./deserialize";
import { parseProjectJsonText } from "./sb3-file";
import { serializeProject, stringifyProject } from "./serialize";
import type { AssetMap, AssetStore } from "./types";

export { createAutosaver } from "./autosaver";
export type { Autosaver, AutosaverOptions, AutosaveSnapshot } from "./autosaver";

export interface AutosaveEntry {
  id: string;
  title: string;
  updatedAt: number;
  thumbnail?: string;
  /** Nomor versi terbaru. */
  version: number;
  versionCount: number;
  /** Ada perubahan yang belum disimpan sebagai .sb3. */
  dirty: boolean;
}

export interface LoadedDraft {
  model: ProjectModel;
  assets: AssetMap;
  title: string;
  version: number;
  /** Peringatan saat memuat (asset hilang, dsb). */
  warnings: string[];
}

export interface SaveDraftOptions {
  thumbnail?: string;
  reason?: SaveReason;
}

export interface AutosaveStore {
  /** Simpan versi baru; mengembalikan nomor versi. */
  save(id: string, title: string, model: ProjectModel, assets: AssetStore, thumbnail?: string): Promise<number>;
  saveWithOptions(id: string, title: string, model: ProjectModel, assets: AssetStore, opts?: SaveDraftOptions): Promise<number>;
  /** Versi terbaru; bila rusak, mundur ke versi sebelumnya. */
  load(id: string): Promise<LoadedDraft | null>;
  loadVersion(id: string, version: number): Promise<LoadedDraft | null>;
  listVersions(id: string): Promise<Omit<VersionMeta, "assetKeys">[]>;
  list(): Promise<AutosaveEntry[]>;
  remove(id: string): Promise<void>;
  /** Tandai sudah disimpan sebagai .sb3 (tidak perlu ditawarkan untuk dipulihkan). */
  markClean(id: string): Promise<void>;
  /** Draf terbaru yang masih dirty, untuk dialog "Pulihkan project terakhir?". */
  getRecoverable(): Promise<AutosaveEntry | null>;
}

export interface AutosaveStoreOptions {
  /** Jumlah versi yang disimpan per project (default 10). */
  maxVersions?: number;
  /** Panjang maksimum data URL thumbnail (default 512 KB). */
  maxThumbnailLength?: number;
  now?: () => number;
}

const toEntry = (r: ProjectRecord): AutosaveEntry => {
  const entry: AutosaveEntry = {
    id: r.id,
    title: r.title,
    updatedAt: r.updatedAt,
    version: r.versions[r.versions.length - 1]?.version ?? 0,
    versionCount: r.versions.length,
    dirty: r.dirty,
  };
  if (r.thumbnail !== undefined) entry.thumbnail = r.thumbnail;
  return entry;
};

export function createAutosaveStoreWithBackend(backend: AutosaveBackend, options: AutosaveStoreOptions = {}): AutosaveStore {
  const maxVersions = Math.max(1, options.maxVersions ?? 10);
  const maxThumb = options.maxThumbnailLength ?? 512 * 1024;
  const now = options.now ?? Date.now;
  // Serialisasi operasi tulis agar dua save bersamaan tidak saling menimpa daftar versi.
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  const validRecord = (r: ProjectRecord | undefined): r is ProjectRecord =>
    !!r && r.schema === AUTOSAVE_SCHEMA && Array.isArray(r.versions) && typeof r.id === "string";

  async function collectGarbage(): Promise<void> {
    const live = new Set<string>();
    for (const r of await backend.listProjects()) {
      if (!validRecord(r)) continue;
      for (const v of r.versions) for (const k of v.assetKeys) live.add(k);
    }
    for (const key of await backend.listAssetKeys()) if (!live.has(key)) await backend.deleteAsset(key);
  }

  async function saveImpl(
    id: string,
    title: string,
    model: ProjectModel,
    assets: AssetStore,
    opts: SaveDraftOptions,
  ): Promise<number> {
    const json = stringifyProject(serializeProject(model));
    const assetKeys = referencedAssets(model).filter((k) => assets.has(k));
    for (const key of assetKeys) {
      if (!(await backend.hasAsset(key))) await backend.putAsset(key, assets.get(key)!);
    }
    const existing = await backend.getProject(id);
    const record: ProjectRecord = validRecord(existing)
      ? existing
      : { schema: AUTOSAVE_SCHEMA, id, title, updatedAt: 0, dirty: true, versions: [] };
    const version = (record.versions[record.versions.length - 1]?.version ?? 0) + 1;
    const savedAt = now();
    await backend.putVersion({ key: versionKey(id, version), projectId: id, version, projectJson: json });
    record.versions.push({ version, savedAt, reason: opts.reason ?? "auto", assetKeys, bytes: json.length });
    const pruned = record.versions.splice(0, Math.max(0, record.versions.length - maxVersions));
    record.title = title;
    record.updatedAt = savedAt;
    record.dirty = opts.reason !== "manual";
    if (opts.thumbnail !== undefined && opts.thumbnail.length <= maxThumb) record.thumbnail = opts.thumbnail;
    await backend.putProject(record);
    for (const p of pruned) await backend.deleteVersion(versionKey(id, p.version));
    if (pruned.length > 0) await collectGarbage();
    return version;
  }

  async function loadVersionImpl(record: ProjectRecord, meta: VersionMeta): Promise<LoadedDraft | null> {
    const rec = await backend.getVersion(versionKey(record.id, meta.version));
    if (!rec || typeof rec.projectJson !== "string") return null;
    try {
      // Validasi penuh; opcode tak dikenal hanya diperingatkan agar karya pengguna tidak hilang.
      const { model, warnings } = deserializeProjectWithReport(parseProjectJsonText(rec.projectJson), {
        unknownOpcodes: "warn",
      });
      const assets = createAssetStore();
      const messages = warnings.map((w) => `${w.path}: ${w.message}`);
      for (const key of referencedAssets(model)) {
        const data = await backend.getAsset(key);
        if (data) assets.set(key, data);
        else messages.push(`asset ${key} tidak ada di penyimpanan lokal`);
      }
      return { model, assets, title: record.title, version: meta.version, warnings: messages };
    } catch {
      return null;
    }
  }

  async function listEntries(): Promise<AutosaveEntry[]> {
    const records = (await backend.listProjects()).filter(validRecord);
    return records.map(toEntry).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  return {
    save: (id, title, model, assets, thumbnail) =>
      exclusive(() => saveImpl(id, title, model, assets, thumbnail === undefined ? {} : { thumbnail })),
    saveWithOptions: (id, title, model, assets, opts = {}) => exclusive(() => saveImpl(id, title, model, assets, opts)),

    async load(id) {
      const record = await backend.getProject(id);
      if (!validRecord(record)) return null;
      for (let i = record.versions.length - 1; i >= 0; i--) {
        const loaded = await loadVersionImpl(record, record.versions[i]!);
        if (loaded) return loaded;
      }
      return null;
    },

    async loadVersion(id, version) {
      const record = await backend.getProject(id);
      if (!validRecord(record)) return null;
      const meta = record.versions.find((v) => v.version === version);
      return meta ? loadVersionImpl(record, meta) : null;
    },

    async listVersions(id) {
      const record = await backend.getProject(id);
      if (!validRecord(record)) return [];
      return record.versions.map(({ version, savedAt, reason, bytes }) => ({ version, savedAt, reason, bytes }));
    },

    list: listEntries,

    remove: (id) =>
      exclusive(async () => {
        const record = await backend.getProject(id);
        if (validRecord(record)) for (const v of record.versions) await backend.deleteVersion(versionKey(id, v.version));
        await backend.deleteProject(id);
        await collectGarbage();
      }),

    markClean: (id) =>
      exclusive(async () => {
        const record = await backend.getProject(id);
        if (!validRecord(record)) return;
        record.dirty = false;
        await backend.putProject(record);
      }),

    async getRecoverable() {
      const entries = (await listEntries()).filter((e) => e.dirty && e.versionCount > 0);
      return entries[0] ?? null;
    },
  };
}

/** Autosave di IndexedDB; bila IndexedDB tidak tersedia, jatuh ke memori. */
export function createAutosaveStore(dbName = "kodyblocks-ai-v2", options: AutosaveStoreOptions = {}): AutosaveStore {
  const backend = typeof indexedDB === "undefined" ? createMemoryBackend() : createIdbBackend(dbName);
  return createAutosaveStoreWithBackend(backend, options);
}
