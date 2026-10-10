/**
 * PenSkin: lapisan pena seukuran panggung. Dirasterisasi di CPU (bukan framebuffer GPU) dengan rumus
 * yang sama dengan shader garis scratch-render: cakupan = clamp(1 - (jarak ke segmen - (tebal-1)/2), 0, 1),
 * ujung bulat, blend premultiplied ONE / ONE_MINUS_SRC_ALPHA, simpan 8-bit. Offset 0.5 untuk diameter 1 & 3
 * dan atribut default = port scratch-render 1.2.115 `src/PenSkin.js` (BSD-3-Clause).
 * Keuntungan CPU: silhouette selalu sinkron (tanpa readPixels) dan hasil sama di WebGL/Canvas2D/headless.
 */
import type { PenAttributes } from "@kody/engine";
import { createPixelData } from "../pixel-source";
import type { PixelData } from "../pixel-source";
import { Skin, makeTexture } from "./skin";
import type { SkinTexture } from "./skin";

const DEFAULT_COLOR: readonly [number, number, number, number] = [0, 0, 1, 1];
const DEFAULT_DIAMETER = 1;

/** Area kotor dalam piksel buffer (x,y kiri-atas). */
export interface DirtyRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class PenSkin extends Skin {
  readonly kind = "pen" as const;
  private _size: [number, number] = [0, 0];
  private pixels: PixelData = createPixelData(1, 1);
  private texture: SkinTexture;
  /** Gabungan area yang berubah sejak backend terakhir mengunggah. */
  dirty: DirtyRect | null = null;

  constructor(id: number, nativeSize: readonly [number, number]) {
    super(id);
    this.texture = makeTexture(this.pixels, 1, 1, true, this.pixels);
    this.setCanvasSize(nativeSize);
  }

  get size(): [number, number] {
    return this._size;
  }

  get buffer(): PixelData {
    return this.pixels;
  }

  override useNearest(scale: readonly number[]): boolean {
    return Math.max(scale[0] as number, scale[1] as number) >= 100;
  }

  override getTexture(): SkinTexture {
    return this.texture;
  }

  setCanvasSize(size: readonly [number, number]): void {
    const width = Math.floor(size[0]);
    const height = Math.floor(size[1]);
    this._size = [size[0], size[1]];
    this._rotationCenter[0] = size[0] / 2;
    this._rotationCenter[1] = size[1] / 2;
    this.pixels = createPixelData(width, height);
    this.texture = makeTexture(this.pixels, width, height, true, this.pixels);
    this.silhouette.update(this.pixels, true);
    this.markDirty(0, 0, width, height);
  }

  override updateSilhouette(): void {
    // Silhouette berbagi buffer piksel yang sama: selalu mutakhir.
  }

  clear(): void {
    this.pixels.data.fill(0);
    this.markDirty(0, 0, this.pixels.width, this.pixels.height);
  }

  drawPoint(attrs: Partial<PenAttributes>, x: number, y: number): void {
    this.drawLine(attrs, x, y, x, y);
  }

  drawLine(attrs: Partial<PenAttributes>, x0: number, y0: number, x1: number, y1: number): void {
    const diameter = attrs.diameter || DEFAULT_DIAMETER;
    // Kompatibilitas Scratch 2: garis lebar 1 dan 3 digeser 0.5 agar sejajar piksel.
    const offset = diameter === 1 || diameter === 3 ? 0.5 : 0;
    const c = attrs.color4f || DEFAULT_COLOR;
    const a = c[3] as number;
    rasterizeLine(
      this.pixels,
      [(c[0] as number) * a, (c[1] as number) * a, (c[2] as number) * a, a],
      diameter,
      x0 + offset,
      y0 + offset,
      x1 + offset,
      y1 + offset,
      (rx0, ry0, rx1, ry1) => this.markDirty(rx0, ry0, rx1, ry1),
    );
  }

  /** Tandai area berubah (koordinat buffer, eksklusif di x1/y1). */
  markDirty(x0: number, y0: number, x1: number, y1: number): void {
    this.texture.revision++;
    if (!this.dirty) this.dirty = { x0, y0, x1, y1 };
    else {
      this.dirty.x0 = Math.min(this.dirty.x0, x0);
      this.dirty.y0 = Math.min(this.dirty.y0, y0);
      this.dirty.x1 = Math.max(this.dirty.x1, x1);
      this.dirty.y1 = Math.max(this.dirty.y1, y1);
    }
  }

  /** Ambil lalu kosongkan area kotor (dipakai backend saat unggah sebagian). */
  takeDirty(): DirtyRect | null {
    const d = this.dirty;
    this.dirty = null;
    return d;
  }
}

/**
 * Rasterisasi segmen ber-ujung-bulat ke buffer premultiplied. Koordinat panggung Scratch;
 * pusat piksel buffer (i, r) = (i + 0.5 - w/2, h/2 - r - 0.5).
 */
export function rasterizeLine(
  target: PixelData,
  premultColor: readonly [number, number, number, number],
  thickness: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  onDirty?: (x0: number, y0: number, x1: number, y1: number) => void,
): void {
  const { width, height, data } = target;
  const halfW = width / 2;
  const halfH = height / 2;
  // Ruang piksel buffer (y ke bawah), sama dengan u_penPoints [x0, -y0, dx, -dy] + offset viewport.
  const ax = x0 + halfW;
  const ay = halfH - y0;
  const dx = x1 - x0;
  const dy = -(y1 - y0);
  const length = Math.sqrt(dx * dx + dy * dy);
  const epsilon = 1e-3;
  let nx: number;
  let ny: number;
  if (Math.abs(dx) < epsilon && Math.abs(dy) < epsilon) {
    nx = 1;
    ny = 0;
  } else {
    const l = Math.max(length, epsilon);
    nx = dx / l;
    ny = dy / l;
  }
  const reach = thickness * 0.5 + 0.5;
  const minX = Math.max(0, Math.floor(Math.min(ax, ax + dx) - reach - 1));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(ax, ax + dx) + reach + 1));
  const minY = Math.max(0, Math.floor(Math.min(ay, ay + dy) - reach - 1));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(ay, ay + dy) + reach + 1));
  if (minX > maxX || minY > maxY) return;

  const [cr, cg, cb, ca] = premultColor;
  const thickTerm = (thickness - 1) * 0.5;
  for (let py = minY; py <= maxY; py++) {
    const ry = py + 0.5 - ay;
    let rowOffset = (py * width + minX) * 4;
    for (let px = minX; px <= maxX; px++, rowOffset += 4) {
      const rx = px + 0.5 - ax;
      // Koordinat sepanjang garis (tx) dan tegak lurus (ty), seperti v_texCoord di shader.
      const tx = nx * rx + ny * ry;
      const ty = -ny * rx + nx * ry;
      const along = tx - Math.min(Math.max(tx, 0), length);
      const dist = Math.sqrt(along * along + ty * ty) - thickTerm;
      const cover = Math.min(Math.max(1 - dist, 0), 1);
      if (cover <= 0) continue;
      const sa = ca * cover;
      const inv = 1 - sa;
      data[rowOffset] = (cr * cover + ((data[rowOffset] as number) / 255) * inv) * 255;
      data[rowOffset + 1] = (cg * cover + ((data[rowOffset + 1] as number) / 255) * inv) * 255;
      data[rowOffset + 2] = (cb * cover + ((data[rowOffset + 2] as number) / 255) * inv) * 255;
      data[rowOffset + 3] = (sa + ((data[rowOffset + 3] as number) / 255) * inv) * 255;
    }
  }
  onDirty?.(minX, minY, maxX + 1, maxY + 1);
}
