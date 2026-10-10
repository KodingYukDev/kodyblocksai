/** Blob URL untuk bytes asset (thumbnail/pratinjau), otomatis dicabut saat berganti/unmount. */
import type { AssetData } from "@kody/engine";
import { useEffect, useMemo, useReducer, useState } from "react";
import { mimeForFormat } from "./new-asset";

export function assetBlobUrl(asset: AssetData | null, dataFormat?: string): string | null {
  if (!asset || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  return URL.createObjectURL(new Blob([asset.data as BlobPart], { type: mimeForFormat(dataFormat ?? asset.dataFormat) }));
}

export function useAssetUrl(asset: AssetData | null, dataFormat?: string): string | null {
  // Dibuat di effect (bukan useMemo) agar StrictMode yang melepas-memasang ulang tidak memakai URL yang sudah dicabut.
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = assetBlobUrl(asset, dataFormat);
    setUrl(u);
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [asset, dataFormat]);
  return url;
}

/**
 * Blob URL untuk banyak asset sekaligus (thumbnail daftar), di-cache per assetId supaya URL tidak
 * dibuat ulang setiap render; URL asset yang hilang dari daftar dicabut.
 */
export function useAssetUrls(items: readonly { asset: AssetData | null; dataFormat: string }[]): (string | null)[] {
  const cache = useMemo(() => new Map<string, string>(), []);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const urls = items.map((it) => {
    if (!it.asset) return null;
    const key = `${it.asset.assetId}.${it.dataFormat}`;
    let url = cache.get(key);
    if (!url) {
      url = assetBlobUrl(it.asset, it.dataFormat) ?? undefined;
      if (url) cache.set(key, url);
    }
    return url ?? null;
  });
  const live = new Set(urls.filter((u): u is string => u !== null));
  useEffect(() => {
    for (const [key, url] of cache) {
      if (!live.has(url)) {
        URL.revokeObjectURL(url);
        cache.delete(key);
      }
    }
  });
  const hasAssets = items.some((it) => it.asset);
  useEffect(() => {
    // StrictMode: unmount sementara mencabut semua URL; saat dipasang lagi render ulang agar URL dibuat baru.
    if (cache.size === 0 && hasAssets) rerender();
    return () => {
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache]);
  return urls;
}

/** Unduh bytes sebagai file (ekspor costume/sound). */
export function downloadBytes(bytes: Uint8Array, fileName: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Baca File dari <input type=file> menjadi bytes. */
export async function readInputFiles(list: FileList | null): Promise<{ name: string; type: string; bytes: Uint8Array }[]> {
  if (!list) return [];
  const out: { name: string; type: string; bytes: Uint8Array }[] = [];
  for (const f of Array.from(list)) out.push({ name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) });
  return out;
}
