/**
 * Stamp: gambar drawable ke buffer pena CPU, setara RenderWebGL.penStamp (viewport = touchingBounds,
 * mode default, efek lengkap termasuk ghost, abaikan visibilitas). Fragment per pusat piksel buffer
 * memakai emulasi shader (gpu-sampler), blend premultiplied ONE / ONE_MINUS_SRC_ALPHA.
 */
import type { Drawable } from "./drawable";
import { shadeFragment } from "./gpu-sampler";
import type { ShadeContext } from "./gpu-sampler";
import type { PixelData } from "./pixel-source";
import type { Rectangle } from "./rectangle";
import type { PenSkin } from "./skins/pen-skin";

export function stampDrawable(pen: PenSkin, drawable: Drawable, bounds: Rectangle, texPixels: PixelData, premultiplied: boolean): void {
  const skin = drawable.skin;
  if (!skin) return;
  const buffer = pen.buffer;
  const { width: bw, height: bh, data } = buffer;
  const [nw, nh] = pen.size;
  drawable.updateMatrix();
  const m = drawable.inverseMatrix;
  const scale = drawable.scale;
  const ctx: ShadeContext = { subject: drawable, tex: texPixels, premultiplied, nearest: skin.useNearest(scale, drawable) };
  const out = new Float64Array(4);

  // Kolom/baris buffer yang dicakup viewport stamp.
  const col0 = Math.max(0, Math.floor(nw / 2 + bounds.left));
  const col1 = Math.min(bw, Math.floor(nw / 2 + bounds.right));
  const row0 = Math.max(0, Math.floor(nh / 2 - bounds.top));
  const row1 = Math.min(bh, Math.floor(nh / 2 - bounds.bottom));
  if (col0 >= col1 || row0 >= row1) return;

  const i0 = m[0] as number;
  const i1 = m[1] as number;
  const i4 = m[4] as number;
  const i5 = m[5] as number;
  const i12 = m[12] as number;
  const i13 = m[13] as number;
  for (let r = row0; r < row1; r++) {
    const y = nh / 2 - r - 0.5;
    let o = (r * bw + col0) * 4;
    for (let c = col0; c < col1; c++, o += 4) {
      const x = c + 0.5 - nw / 2;
      const u = 0.5 - (x * i0 + y * i4 + i12);
      const v = x * i1 + y * i5 + i13 + 0.5;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      shadeFragment(ctx, u, v, out);
      const sa = out[3] as number;
      if (sa <= 0) continue;
      const inv = 1 - sa;
      data[o] = ((out[0] as number) + ((data[o] as number) / 255) * inv) * 255;
      data[o + 1] = ((out[1] as number) + ((data[o + 1] as number) / 255) * inv) * 255;
      data[o + 2] = ((out[2] as number) + ((data[o + 2] as number) / 255) * inv) * 255;
      data[o + 3] = (sa + ((data[o + 3] as number) / 255) * inv) * 255;
    }
  }
  pen.markDirty(col0, row0, col1, row1);
}
