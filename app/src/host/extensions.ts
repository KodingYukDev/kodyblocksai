/**
 * Ekstensi yang dikenal app: Pen, Music (sama id dengan Scratch) + 7 ekstensi AI (lazy).
 * Memuat ekstensi = buat modul -> daftarkan definisi blok ke registri blocks-ui -> runtime.registerExtension
 * (yang memancarkan EXTENSION_ADDED sehingga workspace menyegarkan palet).
 * Padanan scratch-gui extension library + vm.extensionManager.loadExtensionURL untuk ekstensi bawaan.
 */
import type { ExtensionCatalogEntry, ExtensionFactory, ExtensionInfo, ExtensionModule, IRuntime } from "@kody/engine";
import { AI_EXTENSIONS } from "@kody/ai";
import { convertExtension } from "@kody/blocks-ui/blocks/extension-json";
import { getDefaultRegistry } from "@kody/blocks-ui/blocks/registry";
import type { ToolboxBlock, ToolboxCategory } from "@kody/blocks-ui";

export type AppLocale = "id" | "en";

/** Entri galeri ekstensi (deskripsi bahasa Indonesia). */
export interface AppExtensionEntry extends ExtensionCatalogEntry {
  group: "scratch" | "ai";
}

const PEN: AppExtensionEntry = {
  id: "pen",
  name: "Pena",
  description: "Gambar dengan sprite-mu.",
  group: "scratch",
  load: async () => {
    const m = await import("@kody/ext-pen");
    return (runtime: IRuntime) => m.createPenExtensionWithOptions(runtime, { locale: "id" });
  },
};

const MUSIC: AppExtensionEntry = {
  id: "music",
  name: "Musik",
  description: "Mainkan alat musik dan drum.",
  group: "scratch",
  load: async () => {
    const m = await import("@kody/ext-music");
    return (runtime: IRuntime) => m.createMusicExtensionWithOptions(runtime, { locale: "id" });
  },
};

export const APP_EXTENSIONS: readonly AppExtensionEntry[] = [PEN, MUSIC, ...AI_EXTENSIONS.map((e) => ({ ...e, group: "ai" as const }))];

export function findExtensionEntry(id: string): AppExtensionEntry | undefined {
  return APP_EXTENSIONS.find((e) => e.id === id);
}

interface LoadedExtension {
  module: ExtensionModule;
  info: ExtensionInfo;
}

/** Kategori toolbox untuk satu ekstensi (warna, ikon, palet dengan pemisah gap 36). */
export function extensionCategory(info: ExtensionInfo, isStage: boolean): ToolboxCategory {
  const converted = convertExtension(info, { isStage });
  const blocks: ToolboxCategory["blocks"] = [];
  for (const item of converted.palette) {
    if ("separator" in item) {
      const last = blocks[blocks.length - 1];
      if (last && "opcode" in last) (last as ToolboxBlock).gap = 36;
      continue;
    }
    blocks.push({ ...item });
  }
  const icon = info.menuIconURI ?? info.blockIconURI;
  return {
    id: info.id,
    name: info.name,
    colours: { primary: info.color1, secondary: info.color2, tertiary: info.color3, quaternary: info.color3 },
    ...(icon ? { iconURI: icon } : {}),
    blocks,
  };
}

export class ExtensionHost {
  private readonly loaded = new Map<string, LoadedExtension>();
  private readonly pending = new Map<string, Promise<ExtensionInfo>>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly runtime: IRuntime) {}

  isLoaded(id: string): boolean {
    return this.loaded.has(id);
  }

  loadedIds(): string[] {
    return [...this.loaded.keys()];
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Kategori semua ekstensi yang sudah dimuat (urutan dimuat), untuk toolbox target. */
  categories(isStage: boolean): ToolboxCategory[] {
    return [...this.loaded.values()].map((e) => extensionCategory(this.runtime.getExtensionInfo(e.info.id) ?? e.info, isStage));
  }

  /** Muat ekstensi bawaan berdasarkan id. Id tak dikenal ditolak (tidak ada URL ekstensi dari project). */
  load(id: string): Promise<ExtensionInfo> {
    const done = this.loaded.get(id);
    if (done) return Promise.resolve(done.info);
    const inFlight = this.pending.get(id);
    if (inFlight) return inFlight;
    const entry = findExtensionEntry(id);
    if (!entry) return Promise.reject(new Error(`Ekstensi tidak dikenal: ${id}`));
    const p = entry
      .load()
      .then((factory: ExtensionFactory) => this.install(factory))
      .finally(() => this.pending.delete(id));
    this.pending.set(id, p);
    return p;
  }

  /** Muat semua ekstensi yang dipakai project sebelum loadProject (urutan model.extensions). */
  async loadForProject(ids: readonly string[]): Promise<string[]> {
    const unknown: string[] = [];
    for (const id of ids) {
      if (!findExtensionEntry(id)) {
        unknown.push(id);
        continue;
      }
      await this.load(id);
    }
    return unknown;
  }

  private install(factory: ExtensionFactory): ExtensionInfo {
    const module = factory(this.runtime);
    const info = module.getInfo();
    // Registri blok dulu: EXTENSION_ADDED dari runtime memicu workspace membangun ulang definisi.
    getDefaultRegistry().registerExtension(info, {
      resolveDynamicMenu: (_menu, fn) => module.getDynamicMenus?.()[fn]?.(this.runtime.getEditingTarget()?.id ?? null) ?? [],
    });
    this.loaded.set(info.id, { module, info });
    const registered = this.runtime.registerExtension(module);
    for (const l of [...this.listeners]) l();
    return registered;
  }

  dispose(): void {
    for (const { module } of this.loaded.values()) module.dispose?.();
    this.loaded.clear();
    this.listeners.clear();
  }
}
