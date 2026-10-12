/**
 * Simpan otomatis project yang sedang dibuka ke IndexedDB (sebagai bytes .sb3) agar bisa dipulihkan
 * setelah tab tertutup, baterai habis, atau crash. Data yang dibaca kembali dimuat lewat loadSb3 biasa
 * (validasi + batas ukuran yang sama dengan file dari luar), jadi tetap dianggap tak tepercaya.
 */
export interface AutosaveRecord {
  title: string;
  bytes: Uint8Array;
  savedAt: number;
  /** Ada perubahan yang belum disimpan pengguna sebagai .sb3. */
  dirty: boolean;
}

export interface ShellAutosaveStore {
  read(): Promise<AutosaveRecord | null>;
  write(record: AutosaveRecord): Promise<void>;
  markClean(): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = "kodyblocks-ai-shell";
const STORE = "autosave";
const KEY = "current";
/** Batas aman: project lebih besar dari ini tidak disimpan otomatis (kuota iPad terbatas). */
export const AUTOSAVE_MAX_BYTES = 40 * 1024 * 1024;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB gagal"));
  });
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = factory.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB tidak bisa dibuka"));
    r.onblocked = () => reject(new Error("IndexedDB terblokir"));
  });
}

function isRecord(v: unknown): v is AutosaveRecord {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.title === "string" &&
    r.bytes instanceof Uint8Array &&
    typeof r.savedAt === "number" &&
    typeof r.dirty === "boolean" &&
    r.bytes.byteLength > 0 &&
    r.bytes.byteLength <= AUTOSAVE_MAX_BYTES
  );
}

/** Penyimpanan IndexedDB; null bila IndexedDB tidak tersedia (mode privat lama, tes). */
export function createIdbAutosaveStore(factory: IDBFactory | undefined = globalThis.indexedDB): ShellAutosaveStore | null {
  if (!factory) return null;
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    dbPromise ??= openDb(factory).catch((e: unknown) => {
      dbPromise = null;
      throw e;
    });
    return dbPromise;
  };
  const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const d = await db();
    const t = d.transaction(STORE, mode);
    const result = await req(fn(t.objectStore(STORE)));
    await new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error ?? new Error("Transaksi gagal"));
      t.onabort = () => reject(t.error ?? new Error("Transaksi dibatalkan"));
    });
    return result;
  };
  return {
    async read() {
      const v: unknown = await tx("readonly", (s) => s.get(KEY));
      return isRecord(v) ? v : null;
    },
    async write(record) {
      if (record.bytes.byteLength > AUTOSAVE_MAX_BYTES) return;
      await tx("readwrite", (s) => s.put(record, KEY));
    },
    async markClean() {
      const cur = await this.read();
      if (cur && cur.dirty) await this.write({ ...cur, dirty: false });
    },
    async clear() {
      await tx("readwrite", (s) => s.delete(KEY));
    },
  };
}

/** Penyimpanan di memori untuk tes. */
export function createMemoryAutosaveStore(initial: AutosaveRecord | null = null): ShellAutosaveStore & { record: AutosaveRecord | null } {
  const store = {
    record: initial,
    async read() {
      return store.record;
    },
    async write(r: AutosaveRecord) {
      store.record = r;
    },
    async markClean() {
      if (store.record) store.record = { ...store.record, dirty: false };
    },
    async clear() {
      store.record = null;
    },
  };
  return store;
}

/** Jeda setelah perubahan terakhir sebelum disimpan, dan jarak minimum antar-simpan. */
export const AUTOSAVE_DEBOUNCE_MS = 3000;
export const AUTOSAVE_MIN_INTERVAL_MS = 10_000;

export interface AutosaverDeps {
  store: ShellAutosaveStore;
  serialize(): Promise<Uint8Array>;
  getTitle(): string;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  onError?: (e: unknown) => void;
}

export interface ShellAutosaver {
  /** Ada perubahan sejak project dibuka/disimpan sebagai .sb3. */
  readonly dirty: boolean;
  /** Tandai ada perubahan dan jadwalkan simpan. */
  changed(): void;
  /** Simpan sekarang bila ada perubahan yang belum tersimpan otomatis (mis. tab disembunyikan). */
  flush(): Promise<void>;
  /** Project disimpan sebagai .sb3: tidak perlu ditawarkan untuk dipulihkan. */
  markSaved(): void;
  /** Project baru/dimuat: lupakan perubahan sebelumnya dan hapus draf lama. */
  reset(): void;
  dispose(): void;
}

export function createShellAutosaver(deps: AutosaverDeps): ShellAutosaver {
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let dirty = false;
  let pending = false;
  let timer: unknown = null;
  let lastSave = 0;
  let saving: Promise<void> | null = null;
  let disposed = false;

  const cancel = (): void => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const save = async (): Promise<void> => {
    if (saving) {
      await saving;
      if (!pending) return;
    }
    if (!pending || disposed) return;
    pending = false;
    saving = (async () => {
      try {
        const bytes = await deps.serialize();
        await deps.store.write({ title: deps.getTitle(), bytes, savedAt: now(), dirty: true });
        lastSave = now();
      } catch (e) {
        pending = true;
        deps.onError?.(e);
      } finally {
        saving = null;
      }
    })();
    await saving;
  };

  const schedule = (): void => {
    cancel();
    const wait = Math.max(AUTOSAVE_DEBOUNCE_MS, lastSave + AUTOSAVE_MIN_INTERVAL_MS - now());
    timer = setTimer(() => {
      timer = null;
      void save();
    }, wait);
  };

  return {
    get dirty() {
      return dirty;
    },
    changed() {
      if (disposed) return;
      dirty = true;
      pending = true;
      schedule();
    },
    async flush() {
      cancel();
      await save();
    },
    markSaved() {
      dirty = false;
      pending = false;
      cancel();
      // Tunggu simpan otomatis yang sedang berjalan agar tanda "bersih" tidak tertimpa.
      void (saving ?? Promise.resolve())
        .then(() => deps.store.markClean())
        .catch((e: unknown) => deps.onError?.(e));
    },
    reset() {
      dirty = false;
      pending = false;
      cancel();
      void (saving ?? Promise.resolve())
        .then(() => deps.store.clear())
        .catch((e: unknown) => deps.onError?.(e));
    },
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
