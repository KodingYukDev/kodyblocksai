/**
 * AssetStore berbasis Map (md5ext -> bytes). Karena turunan Map, store ini juga bisa langsung
 * diberikan ke `runtime.loadProject(model, media, assets)` yang meminta ReadonlyMap.
 */
import { md5Hex } from "./md5";
import type { AssetStore } from "./types";

export class MemoryAssetStore extends Map<string, Uint8Array> implements AssetStore {
  override set(md5ext: string, data: Uint8Array): this {
    return super.set(md5ext, data);
  }
}

export function createAssetStore(initial?: Iterable<readonly [string, Uint8Array]>): MemoryAssetStore {
  const store = new MemoryAssetStore();
  if (initial) for (const [k, v] of initial) store.set(k, v);
  return store;
}

export interface StoredAsset {
  assetId: string;
  md5ext: string;
}

/** Simpan bytes dengan nama `<md5>.<ext>` (seperti storage.createAsset scratch-vm). */
export function addAsset(store: AssetStore, data: Uint8Array, ext: string): StoredAsset {
  const assetId = md5Hex(data);
  const md5ext = `${assetId}.${ext.toLowerCase()}`;
  if (!store.has(md5ext)) store.set(md5ext, data);
  return { assetId, md5ext };
}

/** Asset yang dipakai model (costume + sound semua target), unik, urutan pertama muncul. */
export function referencedAssets(model: {
  targets: readonly { costumes: readonly { md5ext: string }[]; sounds: readonly { md5ext: string }[] }[];
}): string[] {
  const seen = new Set<string>();
  for (const t of model.targets) {
    for (const c of t.costumes) seen.add(c.md5ext);
    for (const s of t.sounds) seen.add(s.md5ext);
  }
  return Array.from(seen);
}
