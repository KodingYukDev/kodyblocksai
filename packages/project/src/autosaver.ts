/**
 * Debounce autosave: setiap perubahan memanggil `notifyChange()`; penyimpanan terjadi setelah
 * `delayMs` tanpa perubahan, atau paling lambat `maxWaitMs` sejak perubahan pertama yang belum
 * tersimpan. Tidak pernah ada dua penyimpanan berjalan bersamaan.
 */
import type { ProjectModel } from "@kody/engine";
import type { SaveDraftOptions } from "./autosave";
import type { AssetStore } from "./types";

export interface AutosaveSnapshot {
  id: string;
  title: string;
  model: ProjectModel;
  assets: AssetStore;
  thumbnail?: string;
}

/** Bagian AutosaveStore yang dibutuhkan autosaver. */
export interface AutosaveSink {
  saveWithOptions(id: string, title: string, model: ProjectModel, assets: AssetStore, opts?: SaveDraftOptions): Promise<number>;
}

export interface AutosaveTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

export interface AutosaverOptions {
  delayMs?: number;
  maxWaitMs?: number;
  timers?: AutosaveTimers;
  onSaved?: (version: number, snapshot: AutosaveSnapshot) => void;
  onError?: (error: unknown) => void;
}

export interface Autosaver {
  /** Panggil setiap kali project berubah. */
  notifyChange(): void;
  /** Simpan sekarang bila ada perubahan tertunda (mis. saat `visibilitychange`/`pagehide`). */
  flush(): Promise<void>;
  /** Batalkan penyimpanan tertunda. */
  cancel(): void;
  readonly pending: boolean;
  dispose(): void;
}

const defaultTimers: AutosaveTimers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
  now: () => Date.now(),
};

/**
 * `getSnapshot` dipanggil tepat sebelum menyimpan (bukan saat perubahan) sehingga yang disimpan
 * selalu keadaan terbaru. Kembalikan null untuk melewati (mis. project kosong).
 */
export function createAutosaver(
  sink: AutosaveSink,
  getSnapshot: () => AutosaveSnapshot | null,
  options: AutosaverOptions = {},
): Autosaver {
  const delay = options.delayMs ?? 2000;
  const maxWait = options.maxWaitMs ?? 15000;
  const timers = options.timers ?? defaultTimers;
  let timer: unknown = null;
  let firstChangeAt: number | null = null;
  let dirty = false;
  let running: Promise<void> | null = null;
  let disposed = false;

  const clear = (): void => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };

  const run = async (): Promise<void> => {
    clear();
    if (!dirty || disposed) return;
    if (running) {
      // Perubahan saat menyimpan: tunggu yang berjalan lalu simpan lagi.
      await running;
      return run();
    }
    dirty = false;
    firstChangeAt = null;
    const snapshot = getSnapshot();
    if (!snapshot) return;
    const opts: SaveDraftOptions = { reason: "auto" };
    if (snapshot.thumbnail !== undefined) opts.thumbnail = snapshot.thumbnail;
    running = sink
      .saveWithOptions(snapshot.id, snapshot.title, snapshot.model, snapshot.assets, opts)
      .then((version) => options.onSaved?.(version, snapshot))
      .catch((e: unknown) => {
        dirty = true; // coba lagi pada perubahan/flush berikutnya
        options.onError?.(e);
      })
      .finally(() => {
        running = null;
      });
    await running;
  };

  const schedule = (): void => {
    clear();
    const now = timers.now();
    firstChangeAt ??= now;
    const wait = Math.max(0, Math.min(delay, firstChangeAt + maxWait - now));
    timer = timers.setTimeout(() => {
      timer = null;
      void run();
    }, wait);
  };

  return {
    notifyChange() {
      if (disposed) return;
      dirty = true;
      schedule();
    },
    flush: () => run(),
    cancel() {
      clear();
      dirty = false;
      firstChangeAt = null;
    },
    get pending() {
      return dirty || running !== null;
    },
    dispose() {
      clear();
      disposed = true;
    },
  };
}
