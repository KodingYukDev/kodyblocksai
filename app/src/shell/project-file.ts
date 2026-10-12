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

/** iPhone / iPad (termasuk iPadOS yang mengaku "Macintosh"). */
export function isAppleTouchDevice(nav: Pick<Navigator, "userAgent" | "maxTouchPoints"> | undefined = globalThis.navigator): boolean {
  if (!nav) return false;
  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true;
  return /Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1;
}

/**
 * Atribut accept untuk input file. Safari iOS memetakan ekstensi ke tipe sistem; ekstensi yang tidak
 * dikenalnya (.sb3) membuat file berwarna abu-abu dan tidak bisa dipilih, jadi di iOS filter dimatikan
 * dan ekstensi dicek sesudah file dipilih.
 */
export function acceptForDevice(accept: string, appleTouch = isAppleTouchDevice()): string {
  if (!appleTouch) return accept;
  const exts = accept.split(",").map((x) => x.trim().toLowerCase());
  const onlyImages = exts.every((x) => [".svg", ".png", ".bmp", ".jpg", ".jpeg", ".gif"].includes(x));
  return onlyImages ? accept : "";
}

/** Nama file cocok dengan daftar accept (".sb3,.sb2"). Daftar kosong = semua boleh. */
export function matchesAccept(filename: string, accept: string): boolean {
  const exts = accept
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.startsWith("."));
  if (exts.length === 0) return true;
  const lower = filename.toLowerCase();
  return exts.some((x) => lower.endsWith(x));
}

function triggerAnchorDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari iOS memproses unduhan secara asinkron; cabut URL cukup lama sesudahnya.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const toBlob = (bytes: Uint8Array | string, mime: string): Blob => {
  const part: BlobPart = typeof bytes === "string" ? bytes : (bytes.slice().buffer as ArrayBuffer);
  return new Blob([part], { type: mime });
};

/** Unduh bytes sebagai file (downloadBlob scratch-gui). */
export function downloadBytes(filename: string, bytes: Uint8Array | string, mime: string): void {
  triggerAnchorDownload(filename, toBlob(bytes, mime));
}

/** Hasil menyimpan: "downloaded"/"shared" berhasil, "cancelled" dibatalkan pengguna, "needs-gesture" perlu ketukan baru. */
export type SaveFileResult = "downloaded" | "shared" | "cancelled" | "needs-gesture";

/**
 * Simpan file. Di iPad/iPhone memakai lembar Bagikan (bisa "Simpan ke File"), karena unduhan blob di
 * Safari iOS sering hanya membuka pratinjau. Bila Safari menolak (aktivasi pengguna sudah habis
 * karena membuat .sb3 butuh waktu), hasilnya "needs-gesture": tampilkan tombol agar anak mengetuk lagi.
 */
export async function saveFile(
  filename: string,
  bytes: Uint8Array,
  mime: string,
  opts: { appleTouch?: boolean; nav?: Navigator } = {},
): Promise<SaveFileResult> {
  const appleTouch = opts.appleTouch ?? isAppleTouchDevice();
  const nav = opts.nav ?? globalThis.navigator;
  if (appleTouch) {
    const file = typeof File === "function" ? new File([bytes.slice().buffer as ArrayBuffer], filename, { type: "application/octet-stream" }) : null;
    if (file && nav && typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: filename });
        return "shared";
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        if (name === "AbortError") return "cancelled";
        if (name === "NotAllowedError") return "needs-gesture";
        // Lainnya: jatuh ke unduhan biasa.
      }
    }
    // Safari iOS 13+ mendukung a[download]; octet-stream agar tidak dibuka sebagai teks/zip.
    triggerAnchorDownload(filename, toBlob(bytes, "application/octet-stream"));
    return "downloaded";
  }
  triggerAnchorDownload(filename, toBlob(bytes, mime));
  return "downloaded";
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
    const deviceAccept = acceptForDevice(accept);
    if (deviceAccept) input.accept = deviceAccept;
    input.multiple = multiple;
    // Safari iOS tidak membuka dialog untuk input display:none; sembunyikan di luar layar.
    input.style.cssText = "position:fixed;left:-1000px;top:0;width:1px;height:1px;opacity:0";
    let done = false;
    const finish = (files: File[]): void => {
      if (done) return;
      done = true;
      resolve(files);
      input.remove();
    };
    // Di iOS filter bisa dimatikan (acceptForDevice): pemanggil wajib mengecek ekstensi (matchesAccept).
    input.addEventListener("change", () => finish(input.files ? [...input.files] : []));
    input.addEventListener("cancel", () => finish([]));
    document.body.appendChild(input);
    input.click();
  });
}
