/**
 * Lapisan penyimpanan autosave. `createIdbBackend` memakai IndexedDB (paket idb);
 * `createMemoryBackend` untuk tes dan fallback bila IndexedDB tidak tersedia (mode privat).
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/** Versi format record autosave. Naikkan + tulis migrasi bila bentuk record berubah. */
export const AUTOSAVE_SCHEMA = 1;

export type SaveReason = "auto" | "manual" | "recovery";

export interface VersionMeta {
  version: number;
  savedAt: number;
  reason: SaveReason;
  /** md5ext asset yang dirujuk versi ini (untuk pembersihan asset tak terpakai). */
  assetKeys: string[];
  /** Ukuran project.json (byte) - informasi untuk UI. */
  bytes: number;
}

export interface ProjectRecord {
  schema: number;
  id: string;
  title: string;
  updatedAt: number;
  thumbnail?: string;
  /** true bila ada perubahan sejak disimpan/diunduh sebagai .sb3 (kandidat pemulihan). */
  dirty: boolean;
  /** Urut naik; elemen terakhir = versi terbaru. */
  versions: VersionMeta[];
}

export interface VersionRecord {
  /** `${projectId}#${version}` */
  key: string;
  projectId: string;
  version: number;
  projectJson: string;
}

export interface AutosaveBackend {
  getProject(id: string): Promise<ProjectRecord | undefined>;
  putProject(rec: ProjectRecord): Promise<void>;
  deleteProject(id: string): Promise<void>;
  listProjects(): Promise<ProjectRecord[]>;
  getVersion(key: string): Promise<VersionRecord | undefined>;
  putVersion(rec: VersionRecord): Promise<void>;
  deleteVersion(key: string): Promise<void>;
  hasAsset(md5ext: string): Promise<boolean>;
  getAsset(md5ext: string): Promise<Uint8Array | undefined>;
  putAsset(md5ext: string, data: Uint8Array): Promise<void>;
  deleteAsset(md5ext: string): Promise<void>;
  listAssetKeys(): Promise<string[]>;
}

export const versionKey = (projectId: string, version: number): string => `${projectId}#${version}`;

/** Backend di memori (data hilang saat tab ditutup). Data disalin agar perilakunya mirip IDB. */
export function createMemoryBackend(): AutosaveBackend {
  const projects = new Map<string, ProjectRecord>();
  const versions = new Map<string, VersionRecord>();
  const assets = new Map<string, Uint8Array>();
  const clone = <T>(v: T): T => structuredClone(v);
  return {
    getProject: async (id) => {
      const r = projects.get(id);
      return r ? clone(r) : undefined;
    },
    putProject: async (rec) => {
      projects.set(rec.id, clone(rec));
    },
    deleteProject: async (id) => {
      projects.delete(id);
    },
    listProjects: async () => [...projects.values()].map(clone),
    getVersion: async (key) => {
      const r = versions.get(key);
      return r ? clone(r) : undefined;
    },
    putVersion: async (rec) => {
      versions.set(rec.key, clone(rec));
    },
    deleteVersion: async (key) => {
      versions.delete(key);
    },
    hasAsset: async (k) => assets.has(k),
    getAsset: async (k) => {
      const a = assets.get(k);
      return a ? a.slice() : undefined;
    },
    putAsset: async (k, data) => {
      assets.set(k, data.slice());
    },
    deleteAsset: async (k) => {
      assets.delete(k);
    },
    listAssetKeys: async () => [...assets.keys()],
  };
}

interface AutosaveDB extends DBSchema {
  projects: { key: string; value: ProjectRecord };
  versions: { key: string; value: VersionRecord };
  assets: { key: string; value: Uint8Array };
}

/** Backend IndexedDB. Melempar bila IndexedDB tidak tersedia. */
export function createIdbBackend(dbName = "kodyblocks-ai-v2"): AutosaveBackend {
  let dbPromise: Promise<IDBPDatabase<AutosaveDB>> | null = null;
  const db = (): Promise<IDBPDatabase<AutosaveDB>> => {
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB tidak tersedia"));
    dbPromise ??= openDB<AutosaveDB>(dbName, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("projects")) database.createObjectStore("projects", { keyPath: "id" });
        if (!database.objectStoreNames.contains("versions")) database.createObjectStore("versions", { keyPath: "key" });
        if (!database.objectStoreNames.contains("assets")) database.createObjectStore("assets");
      },
    });
    return dbPromise;
  };
  return {
    getProject: async (id) => (await db()).get("projects", id),
    putProject: async (rec) => {
      await (await db()).put("projects", rec);
    },
    deleteProject: async (id) => {
      await (await db()).delete("projects", id);
    },
    listProjects: async () => (await db()).getAll("projects"),
    getVersion: async (key) => (await db()).get("versions", key),
    putVersion: async (rec) => {
      await (await db()).put("versions", rec);
    },
    deleteVersion: async (key) => {
      await (await db()).delete("versions", key);
    },
    hasAsset: async (k) => (await (await db()).getKey("assets", k)) !== undefined,
    getAsset: async (k) => (await db()).get("assets", k),
    putAsset: async (k, data) => {
      await (await db()).put("assets", data, k);
    },
    deleteAsset: async (k) => {
      await (await db()).delete("assets", k);
    },
    listAssetKeys: async () => (await db()).getAllKeys("assets"),
  };
}
