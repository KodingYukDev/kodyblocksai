/**
 * Pembaca zip dengan batas (SB3_LIMITS): ukuran file, jumlah entri, dan total byte setelah unzip
 * dihitung saat streaming sehingga zip-bomb dihentikan sebelum memori habis.
 */
import JSZip from "jszip";
import { ProjectLoadError, SB3_LIMITS } from "./types";

/** Bagian API stream JSZip yang tidak ada di typings resminya. */
interface InternalStream {
  on(event: "data", cb: (chunk: Uint8Array) => void): InternalStream;
  on(event: "end", cb: () => void): InternalStream;
  on(event: "error", cb: (e: unknown) => void): InternalStream;
  resume(): InternalStream;
  pause(): InternalStream;
}

export interface ZipLimits {
  maxFileBytes: number;
  maxZipEntries: number;
  maxUncompressedBytes: number;
  maxProjectJsonBytes: number;
}

export class LimitedZip {
  private used = 0;

  constructor(
    private readonly zip: JSZip,
    private readonly limits: ZipLimits,
  ) {}

  /** Nama semua file (bukan folder). */
  get fileNames(): string[] {
    return Object.values(this.zip.files)
      .filter((f) => !f.dir)
      .map((f) => f.name);
  }

  /** Total byte yang sudah di-unzip. */
  get uncompressedBytes(): number {
    return this.used;
  }

  /**
   * Cari file dengan nama persis, atau di dalam tepat satu folder induk, seperti
   * deserialize-assets.js / scratch-parser unzip.js. Mengembalikan nama entri atau null.
   */
  find(fileName: string): string | null {
    const direct = this.zip.files[fileName];
    if (direct && !direct.dir) return direct.name;
    const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^([^/]*/)?${escaped}$`);
    for (const f of Object.values(this.zip.files)) {
      if (!f.dir && re.test(f.name)) return f.name;
    }
    return null;
  }

  /** Baca entri sebagai bytes; gagal bila melewati batas per-file atau total. */
  read(name: string, perFileLimit = this.limits.maxUncompressedBytes): Promise<Uint8Array> {
    const file = this.zip.files[name];
    if (!file || file.dir) return Promise.reject(new ProjectLoadError(`File "${name}" tidak ada di zip`));
    const stream = (file as unknown as { internalStream(t: "uint8array"): InternalStream }).internalStream("uint8array");
    return new Promise<Uint8Array>((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      let failed = false;
      const fail = (msg: string): void => {
        if (failed) return;
        failed = true;
        stream.pause();
        reject(new ProjectLoadError(msg));
      };
      stream
        .on("data", (chunk) => {
          if (failed) return;
          size += chunk.length;
          this.used += chunk.length;
          if (size > perFileLimit) fail(`File "${name}" terlalu besar setelah diekstrak`);
          else if (this.used > this.limits.maxUncompressedBytes)
            fail("Isi file project terlalu besar setelah diekstrak (kemungkinan zip-bomb)");
          else chunks.push(chunk);
        })
        .on("error", (e) => {
          if (failed) return;
          failed = true;
          reject(new ProjectLoadError(`Gagal membaca "${name}" dari zip: ${String(e)}`));
        })
        .on("end", () => {
          if (failed) return;
          const out = new Uint8Array(size);
          let off = 0;
          for (const c of chunks) {
            out.set(c, off);
            off += c.length;
          }
          resolve(out);
        })
        .resume();
    });
  }
}

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/** Buka zip dengan pemeriksaan ukuran file & jumlah entri. */
export async function openLimitedZip(bytes: Uint8Array, limits: ZipLimits = SB3_LIMITS): Promise<LimitedZip> {
  if (bytes.byteLength > limits.maxFileBytes) {
    throw new ProjectLoadError(`File lebih dari ${Math.round(limits.maxFileBytes / 1024 / 1024)} MB`);
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    throw new ProjectLoadError(`File bukan zip .sb3 yang valid: ${e instanceof Error ? e.message : String(e)}`);
  }
  const count = Object.keys(zip.files).length;
  if (count > limits.maxZipEntries) throw new ProjectLoadError(`Zip berisi lebih dari ${limits.maxZipEntries} entri`);
  return new LimitedZip(zip, limits);
}
