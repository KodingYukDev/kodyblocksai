/**
 * Nama file project & unduh/unggah di browser. Perilaku nama mengikuti scratch-gui
 * (containers/sb3-downloader.jsx getProjectFilename, lib/sb-file-uploader-hoc.jsx getProjectTitleFromFilename).
 */
import type { PickedFile } from "./types";

export const DEFAULT_PROJECT_TITLE = "Project KodyBlocks";
export const MAX_TITLE_LENGTH = 100;
/** Ekstensi yang diterima "Muat dari komputer" (format sama: zip project.json). */
export const PROJECT_FILE_ACCEPT = ".sb3,.sb,.sb2,.kb";

/** Nama file unduhan: judul dipotong 100 karakter + ".sb3"; judul kosong -> judul default. */
export function getProjectFilename(title: string, defaultTitle = DEFAULT_PROJECT_TITLE): string {
  const base = title && title.length > 0 ? title : defaultTitle;
  return `${base.substring(0, MAX_TITLE_LENGTH)}.sb3`;
}

/** Judul dari nama file yang dimuat; "" bila ekstensi tidak dikenal. */
export function getProjectTitleFromFilename(filename: string | null | undefined): string {
  if (!filename) return "";
  const m = filename.match(/^(.*)\.(kb|sb[23]?)$/);
  if (!m) return "";
  return (m[1] ?? "").substring(0, MAX_TITLE_LENGTH);
}

/** Normalisasi judul yang diketik pengguna (dipotong 100 karakter seperti input judul scratch-gui). */
export function normalizeTitle(title: string): string {
  return title.substring(0, MAX_TITLE_LENGTH);
}

/** Unduh bytes sebagai file (downloadBlob scratch-gui). */
export function downloadBytes(filename: string, bytes: Uint8Array | string, mime: string): void {
  const part: BlobPart = typeof bytes === "string" ? bytes : (bytes.slice().buffer as ArrayBuffer);
  const blob = new Blob([part], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Beri waktu browser memulai unduhan sebelum URL dicabut.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Baca File DOM menjadi PickedFile. */
export async function readPickedFile(file: File): Promise<PickedFile> {
  const buf = await file.arrayBuffer();
  return { name: file.name, type: file.type, bytes: new Uint8Array(buf) };
}

/** Buka dialog pilih file. Resolve [] bila dibatalkan (jika browser memberi tahu). */
export function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = "none";
    input.addEventListener("change", () => {
      resolve(input.files ? [...input.files] : []);
      input.remove();
    });
    input.addEventListener("cancel", () => {
      resolve([]);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}
