/** Bantuan DOM paint editor: konversi vektor<->bitmap dan teks bitmap. */
import { canvasToPng, loadImage, pixelsToCanvas } from "../costume-media";
import { BITMAP_H, BITMAP_W, blit, createPixels, type Pixels } from "./bitmap-ops";
import { CANVAS_H, CANVAS_W, previewMarkup, type VectorDoc } from "./vector-doc";

/** SVG ukuran kanvas penuh (480x360) untuk pratinjau <img> (aman: <img> tidak menjalankan skrip). */
export function previewSvg(doc: VectorDoc): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">${previewMarkup(doc)}</svg>`;
}

/** Rasterisasi dokumen vektor ke Pixels 960x720 (resolusi 2). */
export async function vectorToPixels(doc: VectorDoc): Promise<Pixels> {
  const out = createPixels();
  if (doc.shapes.length === 0) return out;
  const img = await loadImage(new TextEncoder().encode(previewSvg(doc)), "image/svg+xml");
  const c = document.createElement("canvas");
  c.width = BITMAP_W;
  c.height = BITMAP_H;
  const g = c.getContext("2d");
  if (!g) return out;
  g.drawImage(img, 0, 0, BITMAP_W, BITMAP_H);
  out.data.set(g.getImageData(0, 0, BITMAP_W, BITMAP_H).data);
  return out;
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Bitmap -> dokumen vektor berisi satu gambar PNG (seperti "Ubah ke Vektor" Scratch). */
export async function pixelsToVectorDoc(p: Pixels): Promise<VectorDoc> {
  const png = await canvasToPng(pixelsToCanvas(p));
  const inner = `<image width="${BITMAP_W}" height="${BITMAP_H}" href="data:image/png;base64,${base64(png)}"/>`;
  return {
    nextId: 2,
    shapes: [{ id: 1, type: "embed", x: 0, y: 0, w: CANVAS_W, h: CANVAS_H, viewBox: `0 0 ${BITMAP_W} ${BITMAP_H}`, inner, rootAttrs: "" }],
  };
}

/** Gambar teks ke Pixels pada titik (x,y) baseline, ukuran dalam piksel bitmap. */
export function drawTextOnPixels(p: Pixels, x: number, y: number, text: string, sizePx: number, color: string): Pixels {
  const c = document.createElement("canvas");
  c.width = p.width;
  c.height = p.height;
  const g = c.getContext("2d");
  if (!g) return p;
  g.font = `${Math.round(sizePx)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  g.fillStyle = color;
  g.fillText(text, x, y);
  const layer = { width: p.width, height: p.height, data: g.getImageData(0, 0, p.width, p.height).data };
  const out = { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) };
  blit(out, layer, 0, 0);
  return out;
}

/** Salin Pixels ke canvas tampilan. */
export function paintPixels(canvas: HTMLCanvasElement, p: Pixels): void {
  const g = canvas.getContext("2d");
  if (!g) return;
  if (canvas.width !== p.width) canvas.width = p.width;
  if (canvas.height !== p.height) canvas.height = p.height;
  g.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
}
