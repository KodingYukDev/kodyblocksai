/**
 * Bagian upload/konversi costume yang butuh DOM (canvas, Image). Logika murninya ada di
 * costume-upload.ts, gif-decoder.ts, dan paint/bitmap-ops.ts.
 */
import {
  MAX_COSTUME_UPLOAD_BYTES,
  classifyCostumeFile,
  defaultBitmapRotationCenter,
  defaultSvgRotationCenter,
  extractFileName,
  frameCostumeName,
  getResizedWidthHeight,
  sanitizeSvgText,
} from "./costume-upload";
import { decodeGif } from "./gif-decoder";
import { makeCostume, mimeForFormat } from "./new-asset";
import { BITMAP_CX, BITMAP_CY, BITMAP_H, BITMAP_W, createPixels, type Pixels } from "./paint/bitmap-ops";
import type { CostumeView, NewCostume } from "./types";

export class CostumeImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostumeImportError";
  }
}

export interface InputFile {
  name: string;
  type: string;
  bytes: Uint8Array;
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext("2d");
  if (!g) throw new CostumeImportError("Canvas 2D tidak tersedia");
  return g;
}

export function loadImage(bytes: Uint8Array, mime: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new CostumeImportError("Gambar tidak bisa dibuka"));
    };
    img.src = url;
  });
}

export function canvasToPng(c: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    c.toBlob((blob) => {
      if (!blob) {
        reject(new CostumeImportError("Gagal membuat PNG"));
        return;
      }
      blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
    }, "image/png");
  });
}

/** Resize nearest-neighbor dua langkah (BitmapAdapter.resize). */
function resizeNearest(img: CanvasImageSource, srcW: number, srcH: number, w: number, h: number): HTMLCanvasElement {
  const a = canvas(w, srcH);
  const ga = ctx2d(a);
  ga.imageSmoothingEnabled = false;
  ga.drawImage(img, 0, 0, a.width, a.height);
  const b = canvas(w, h);
  const gb = ctx2d(b);
  gb.imageSmoothingEnabled = false;
  gb.drawImage(a, 0, 0, b.width, b.height);
  return b;
}

/** BitmapAdapter.importBitmap + load-costume default center: costume bitmap resolusi 2. */
async function bitmapCostume(name: string, bytes: Uint8Array, kind: "png" | "jpg" | "bmp" | "raster", mime?: string): Promise<NewCostume> {
  const img = await loadImage(bytes, kind === "raster" ? mime || "image/webp" : mimeForFormat(kind));
  if (!img.naturalWidth || !img.naturalHeight) throw new CostumeImportError("Gambar kosong atau tidak bisa dibuka");
  const size = getResizedWidthHeight(img.naturalWidth, img.naturalHeight);
  const unchanged = size.width === img.naturalWidth && size.height === img.naturalHeight;
  if (unchanged && kind !== "bmp" && kind !== "raster") {
    const [cx, cy] = defaultBitmapRotationCenter(img.naturalWidth, img.naturalHeight);
    return makeCostume(name, kind, bytes, 2, cx, cy);
  }
  // .bmp selalu diubah ke PNG (file-uploader.js bmpConverter); hasil resize juga PNG (toDataURL).
  const c = unchanged ? resizeNearest(img, img.naturalWidth, img.naturalHeight, img.naturalWidth, img.naturalHeight) : resizeNearest(img, img.naturalWidth, img.naturalHeight, size.width, size.height);
  const png = await canvasToPng(c);
  const [cx, cy] = defaultBitmapRotationCenter(c.width, c.height);
  return makeCostume(name, "png", png, 2, cx, cy);
}

export function svgCostume(name: string, bytes: Uint8Array): NewCostume {
  const text = sanitizeSvgText(new TextDecoder().decode(bytes));
  const data = new TextEncoder().encode(text);
  const [cx, cy] = defaultSvgRotationCenter(text);
  return makeCostume(name, "svg", data, 1, cx, cy);
}

export function pixelsToCanvas(p: Pixels): HTMLCanvasElement {
  const c = canvas(p.width, p.height);
  ctx2d(c).putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  return c;
}

/** Costume dari satu file pengguna (GIF = banyak costume). Urutan & nama seperti costumeUpload. */
export async function costumesFromFile(file: InputFile): Promise<NewCostume[]> {
  if (file.bytes.length > MAX_COSTUME_UPLOAD_BYTES) throw new CostumeImportError(`File ${file.name} terlalu besar (maks 10 MB)`);
  const kind = classifyCostumeFile(file.name, file.type, file.bytes);
  const base = extractFileName(file.name) || "kostum";
  switch (kind) {
    case "svg":
      return [svgCostume(base, file.bytes)];
    case "png":
    case "jpg":
    case "bmp":
      return [await bitmapCostume(base, file.bytes, kind)];
    case "raster":
      return [await bitmapCostume(base, file.bytes, "raster", file.type)];
    case "gif": {
      const frames = decodeGif(file.bytes);
      const out: NewCostume[] = [];
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        if (!f) continue;
        const png = await canvasToPng(pixelsToCanvas({ width: f.width, height: f.height, data: f.rgba }));
        out.push(await bitmapCostume(frameCostumeName(base, i), png, "png"));
      }
      return out;
    }
    default:
      throw new CostumeImportError(`Jenis file tidak didukung: ${file.name}`);
  }
}

/** Gambar costume (view) ke Pixels 960x720 dengan pusat rotasi di (480,360). */
export async function costumeToPixels(c: CostumeView): Promise<Pixels> {
  const out = createPixels();
  if (!c.asset) return out;
  const img = await loadImage(c.asset.data, mimeForFormat(c.dataFormat));
  const scale = c.dataFormat === "svg" ? 2 : 2 / (c.bitmapResolution || 1);
  const cv = canvas(BITMAP_W, BITMAP_H);
  const g = ctx2d(cv);
  g.imageSmoothingEnabled = c.dataFormat === "svg";
  const w = (c.dataFormat === "svg" ? svgSize(c) : [img.naturalWidth, img.naturalHeight]) as [number, number];
  g.drawImage(img, BITMAP_CX - c.rotationCenterX * scale, BITMAP_CY - c.rotationCenterY * scale, w[0] * scale, w[1] * scale);
  out.data.set(g.getImageData(0, 0, BITMAP_W, BITMAP_H).data);
  return out;
}

function svgSize(c: CostumeView): [number, number] {
  if (!c.asset) return [0, 0];
  const text = new TextDecoder().decode(c.asset.data);
  const m = /viewBox\s*=\s*["']\s*[-\d.e]+[\s,]+[-\d.e]+[\s,]+([\d.e]+)[\s,]+([\d.e]+)/i.exec(text);
  if (m) return [Number(m[1]), Number(m[2])];
  const center = defaultSvgRotationCenter(text);
  return [center[0] * 2, center[1] * 2];
}

/** Simpan Pixels terpotong sebagai costume PNG resolusi 2. */
export async function pixelsToCostume(name: string, p: Pixels, rotationCenterX: number, rotationCenterY: number): Promise<NewCostume> {
  const png = await canvasToPng(pixelsToCanvas(p));
  return makeCostume(name, "png", png, 2, rotationCenterX, rotationCenterY);
}

/** Tangkap frame video (kamera) sebagai costume bitmap, dicerminkan seperti scratch-gui camera modal. */
export async function captureVideoFrame(video: HTMLVideoElement, name: string, mirror = true): Promise<NewCostume> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new CostumeImportError("Kamera belum siap");
  const size = getResizedWidthHeight(w, h);
  const c = canvas(size.width, size.height);
  const g = ctx2d(c);
  if (mirror) {
    g.translate(c.width, 0);
    g.scale(-1, 1);
  }
  g.drawImage(video, 0, 0, c.width, c.height);
  const png = await canvasToPng(c);
  const [cx, cy] = defaultBitmapRotationCenter(c.width, c.height);
  return makeCostume(name, "png", png, 2, cx, cy);
}
