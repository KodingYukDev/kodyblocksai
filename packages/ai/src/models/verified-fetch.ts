/**
 * Pemuatan file model dengan verifikasi SHA-256.
 * - Hanya path di manifest (packages/ai/src/models/manifest.json) yang boleh dimuat.
 * - Path wajib lolos isAllowedModelUrl (same-origin, di bawah /models/).
 * - fetch tanpa redirect, tanpa kredensial lintas origin; ukuran dan hash harus cocok.
 * Hash di-pin di bundle, jadi server/CDN yang disusupi tidak bisa menukar model diam-diam.
 */
import { isAllowedModelUrl } from "../security";
import manifestJson from "./manifest.json";

export interface ModelFileEntry {
  sha256: string;
  bytes: number;
  source?: string;
}

export interface ModelManifest {
  version: number;
  files: Record<string, ModelFileEntry>;
}

export const MODEL_MANIFEST: ModelManifest = manifestJson as ModelManifest;

export class ModelIntegrityError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(message);
    this.name = "ModelIntegrityError";
  }
}

export interface FetchLike {
  (input: string, init: RequestInit): Promise<Pick<Response, "ok" | "status" | "url" | "arrayBuffer" | "redirected">>;
}

export interface VerifiedFetchDeps {
  fetch?: FetchLike;
  /** SHA-256 hex dari bytes. Default: crypto.subtle. */
  sha256Hex?: (data: ArrayBuffer) => Promise<string>;
  manifest?: ModelManifest;
  /** Origin halaman (untuk memastikan respons tidak berasal dari origin lain). */
  origin?: string;
}

export async function sha256HexWebCrypto(data: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto tidak tersedia (butuh HTTPS atau localhost)");
  const digest = await subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Resolve path model relatif terhadap path lain di manifest (dipakai shard tfjs). */
export function resolveModelPath(basePath: string, relative: string): string {
  if (relative.includes("/") || relative.includes("\\") || relative.includes("..")) {
    throw new ModelIntegrityError(`path shard tidak sah: ${relative}`, relative);
  }
  const dir = basePath.slice(0, basePath.lastIndexOf("/") + 1);
  return dir + relative;
}

export function createVerifiedFetcher(deps: VerifiedFetchDeps = {}): (path: string) => Promise<ArrayBuffer> {
  const manifest = deps.manifest ?? MODEL_MANIFEST;
  const doFetch: FetchLike = deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const hash = deps.sha256Hex ?? sha256HexWebCrypto;
  const cache = new Map<string, Promise<ArrayBuffer>>();

  const load = async (path: string): Promise<ArrayBuffer> => {
    if (!isAllowedModelUrl(path)) throw new ModelIntegrityError(`URL model ditolak: ${path}`, path);
    const entry = manifest.files[path];
    if (!entry) throw new ModelIntegrityError(`model tidak terdaftar di manifest: ${path}`, path);
    const res = await doFetch(path, { credentials: "same-origin", redirect: "error", cache: "default" });
    if (!res.ok) throw new ModelIntegrityError(`gagal memuat ${path} (HTTP ${res.status})`, path);
    if (res.redirected) throw new ModelIntegrityError(`model dialihkan (redirect) dari ${path}`, path);
    const origin = deps.origin ?? globalThis.location?.origin;
    if (origin && res.url && !res.url.startsWith(origin + "/")) {
      throw new ModelIntegrityError(`model berasal dari origin lain: ${res.url}`, path);
    }
    const data = await res.arrayBuffer();
    if (data.byteLength !== entry.bytes) {
      throw new ModelIntegrityError(`ukuran ${path} ${data.byteLength} != ${entry.bytes}`, path);
    }
    const actual = await hash(data);
    if (actual.toLowerCase() !== entry.sha256.toLowerCase()) {
      throw new ModelIntegrityError(`hash SHA-256 ${path} tidak cocok`, path);
    }
    return data;
  };

  return (path: string) => {
    let pending = cache.get(path);
    if (!pending) {
      pending = load(path);
      cache.set(path, pending);
      // Hanya menggabungkan permintaan yang sedang berjalan; bytes tidak ditahan di memori setelahnya.
      const clear = (): void => void cache.delete(path);
      pending.then(clear, clear);
    }
    return pending;
  };
}
