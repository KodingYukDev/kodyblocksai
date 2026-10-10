/**
 * Ukuran gambar dari header file (tanpa decode) untuk mengisi rotationCenter costume yang tidak
 * ada di project.json. scratch-vm memakai pusat skin renderer (= setengah ukuran gambar).
 */

export interface ImageSize {
  width: number;
  height: number;
}

function pngSize(b: Uint8Array): ImageSize | null {
  // Signature 8 byte + chunk IHDR: panjang(4) "IHDR"(4) width(4) height(4), big-endian.
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

function gifSize(b: Uint8Array): ImageSize | null {
  if (b.length < 10 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: v.getUint16(6, true), height: v.getUint16(8, true) };
}

function bmpSize(b: Uint8Array): ImageSize | null {
  if (b.length < 26 || b[0] !== 0x42 || b[1] !== 0x4d) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: Math.abs(v.getInt32(18, true)), height: Math.abs(v.getInt32(22, true)) };
}

function jpegSize(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] as number;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = v.getUint16(i + 2);
    // SOF0..SOF15 kecuali DHT (C4), JPG (C8), DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: v.getUint16(i + 7), height: v.getUint16(i + 5) };
    }
    i += 2 + len;
  }
  return null;
}

function parseLength(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const m = /^\s*([0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?)\s*(px)?\s*$/i.exec(raw);
  return m && m[1] !== undefined ? parseFloat(m[1]) : null;
}

function svgSize(b: Uint8Array): ImageSize | null {
  // Cukup baca awal file sampai tag <svg ...> pertama.
  const head = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 64 * 1024)));
  const tag = /<svg\b[^>]*>/i.exec(head)?.[0];
  if (!tag) return null;
  const attr = (name: string): string | undefined =>
    new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag)?.slice(2, 4).find((x) => x !== undefined);
  const width = parseLength(attr("width"));
  const height = parseLength(attr("height"));
  if (width !== null && height !== null) return { width, height };
  const vb = attr("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (vb && vb.length === 4 && vb.every(Number.isFinite)) return { width: vb[2] as number, height: vb[3] as number };
  return null;
}

/** Ukuran gambar berdasarkan format costume, atau null bila tidak bisa dibaca. */
export function readImageSize(data: Uint8Array, dataFormat: string): ImageSize | null {
  switch (dataFormat.toLowerCase()) {
    case "svg":
      return svgSize(data);
    case "png":
      return pngSize(data);
    case "gif":
      return gifSize(data);
    case "bmp":
      return bmpSize(data);
    case "jpg":
    case "jpeg":
      return jpegSize(data);
    default:
      return pngSize(data) ?? jpegSize(data) ?? gifSize(data) ?? bmpSize(data);
  }
}
