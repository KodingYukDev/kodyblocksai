/**
 * Logika murni upload costume. Port perilaku:
 * - scratch-gui lib/file-uploader.js (jenis file, nama dari file, satu costume per frame GIF),
 * - scratch-svg-renderer bitmap-adapter.js getResizedWidthHeight (BSD-3),
 * - scratch-vm import/load-costume.js (pusat rotasi default = tengah gambar, bitmap resolusi 2).
 * Konversi piksel (canvas) ada di costume-media.ts karena butuh DOM.
 */
import { STAGE_HEIGHT, STAGE_WIDTH } from "@kody/engine";

/** "raster" = gambar lain yang bisa didekode browser (webp, heic dari iPad, avif): disimpan sebagai PNG. */
export type CostumeFileKind = "svg" | "png" | "jpg" | "bmp" | "gif" | "raster";

export const MAX_COSTUME_UPLOAD_BYTES = 10 * 1024 * 1024;
/** `image/*` agar pemilih iPad menampilkan Foto (Safari mengubah HEIC ke JPEG bila perlu). */
export const COSTUME_ACCEPT = "image/*,.svg,.png,.bmp,.jpg,.jpeg,.gif,.webp";
const RASTER_EXT = new Set(["webp", "heic", "heif", "avif"]);

/** extractFileName: teks sebelum titik pertama. */
export function extractFileName(nameExt: string): string {
  return nameExt.split(".", 1)[0] ?? "";
}

/** Tentukan jenis costume dari MIME; kalau kosong, dari ekstensi lalu tanda tangan isi. */
export function classifyCostumeFile(name: string, mime: string, bytes?: Uint8Array): CostumeFileKind | null {
  switch (mime) {
    case "image/svg+xml":
      return "svg";
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/bmp":
      return "bmp";
    case "image/gif":
      return "gif";
    case "image/webp":
    case "image/heic":
    case "image/heif":
    case "image/avif":
      return "raster";
    default:
      break;
  }
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "svg") return "svg";
  if (ext === "png") return "png";
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  if (ext === "bmp") return "bmp";
  if (ext === "gif") return "gif";
  if (RASTER_EXT.has(ext)) return "raster";
  if (bytes) return sniffImage(bytes);
  return null;
}

/** Deteksi jenis dari tanda tangan byte. */
export function sniffImage(b: Uint8Array): CostumeFileKind | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8) return "jpg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
  if (b[0] === 0x42 && b[1] === 0x4d) return "bmp";
  const head = new TextDecoder().decode(b.subarray(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "svg";
  // RIFF....WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "raster";
  return null;
}

/** BitmapAdapter.getResizedWidthHeight. */
export function getResizedWidthHeight(oldWidth: number, oldHeight: number): { width: number; height: number } {
  const STAGE_RATIO = STAGE_WIDTH / STAGE_HEIGHT;
  if (oldWidth <= STAGE_WIDTH && oldHeight <= STAGE_HEIGHT) return { width: oldWidth * 2, height: oldHeight * 2 };
  if (oldWidth <= STAGE_WIDTH * 2 && oldHeight <= STAGE_HEIGHT * 2) return { width: oldWidth, height: oldHeight };
  const imageRatio = oldWidth / oldHeight;
  if (imageRatio >= STAGE_RATIO) return { width: STAGE_WIDTH * 2, height: (STAGE_WIDTH * 2) / imageRatio };
  return { width: STAGE_HEIGHT * 2 * imageRatio, height: STAGE_HEIGHT * 2 };
}

/** Nama costume dari upload multi-frame: `nama`, `nama2`, `nama3`, ... */
export function frameCostumeName(fileName: string, frameIndex: number): string {
  return `${fileName}${frameIndex ? frameIndex + 1 : ""}`;
}

const num = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(px)?\s*$/i.exec(s);
  return m ? Number(m[1]) : null;
};

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, "i");
  return re.exec(tag)?.[2] ?? null;
}

/**
 * Ukuran SVG seperti scratch-svg-renderer: viewBox (x, y, w, h) bila ada, kalau tidak dari
 * width/height, default 0. Dipakai untuk pusat rotasi default (tengah viewBox, relatif x/y).
 */
export function svgViewBox(svgText: string): { x: number; y: number; width: number; height: number } {
  const tag = /<svg\b[^>]*>/i.exec(svgText)?.[0] ?? "";
  const vb = attr(tag, "viewBox");
  const w = num(attr(tag, "width"));
  const h = num(attr(tag, "height"));
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((p) => Number.isFinite(p))) {
      const [x = 0, y = 0, vw = 0, vh = 0] = parts;
      return { x, y, width: vw, height: vh };
    }
  }
  return { x: 0, y: 0, width: w ?? 0, height: h ?? 0 };
}

/** Pusat rotasi default costume vektor (dalam satuan SVG relatif pojok kiri atas viewBox). */
export function defaultSvgRotationCenter(svgText: string): [number, number] {
  const { width, height } = svgViewBox(svgText);
  return [width / 2, height / 2];
}

/** Pusat rotasi default bitmap resolusi 2 (load-costume.js: getSkinRotationCenter * 2 = ukuran piksel / 2). */
export function defaultBitmapRotationCenter(pixelWidth: number, pixelHeight: number): [number, number] {
  return [pixelWidth / 2, pixelHeight / 2];
}

const EXTERNAL_HREF = /^\s*(?!#|data:image\/(?:png|jpe?g|gif|bmp|webp);)/i;

/**
 * Sanitasi SVG dari pengguna (padanan sanitizeSvg.sanitizeByteStream + aturan CONTRACTS bagian 13):
 * buang <script>, <foreignObject>, atribut on*, href/xlink:href eksternal, dan url() eksternal di style.
 * Memakai DOMParser bila ada; kalau tidak ada (worker/Node), fallback regex yang konservatif.
 */
export function sanitizeSvgText(svg: string): string {
  if (typeof DOMParser !== "undefined" && typeof XMLSerializer !== "undefined") {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length > 0) {
      return sanitizeSvgRegex(svg);
    }
    const all = [root, ...Array.from(root.getElementsByTagName("*"))];
    for (const el of all) {
      const name = el.localName.toLowerCase();
      if (name === "script" || name === "foreignobject" || name === "iframe" || name === "embed" || name === "object") {
        el.parentNode?.removeChild(el);
        continue;
      }
      for (const a of Array.from(el.attributes)) {
        const an = a.name.toLowerCase();
        if (an.startsWith("on")) el.removeAttribute(a.name);
        else if ((an === "href" || an === "xlink:href") && EXTERNAL_HREF.test(a.value)) el.removeAttribute(a.name);
        else if (/url\(\s*['"]?\s*(?!#)/i.test(a.value) && an !== "href") el.setAttribute(a.name, a.value.replace(/url\(\s*['"]?\s*(?!#)[^)]*\)/gi, "none"));
      }
      if (name === "style" && el.textContent) {
        el.textContent = el.textContent.replace(/@import[^;]*;?/gi, "").replace(/url\(\s*['"]?\s*(?!#|data:)[^)]*\)/gi, "none");
      }
    }
    return new XMLSerializer().serializeToString(root);
  }
  return sanitizeSvgRegex(svg);
}

export function sanitizeSvgRegex(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:xlink:)?href\s*=\s*("|')\s*(?!#|data:image\/(?:png|jpe?g|gif|bmp|webp);)[^"']*\1/gi, "")
    .replace(/@import[^;]*;?/gi, "");
}
