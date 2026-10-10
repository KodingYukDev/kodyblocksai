/**
 * MD5 (RFC 1321) untuk menamai asset sb3 (`<md5>.<ext>`). Web Crypto tidak menyediakan MD5,
 * jadi diimplementasikan sendiri. Bukan untuk keperluan kriptografi.
 */

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
  21,
];

const K = new Int32Array(64);
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) | 0;

const HEX = "0123456789abcdef";

/** Hash MD5 dari bytes, hasil 32 karakter hex huruf kecil. */
export function md5Hex(input: Uint8Array): string {
  const len = input.length;
  // Panjang total setelah padding: kelipatan 64 byte (data + 0x80 + nol + 8 byte panjang).
  const total = (((len + 8) >>> 6) + 1) << 6;
  const buf = new Uint8Array(total);
  buf.set(input);
  buf[len] = 0x80;
  const bitLenLo = (len << 3) >>> 0;
  const bitLenHi = Math.floor(len / 0x20000000) >>> 0;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, bitLenLo, true);
  view.setUint32(total - 4, bitLenHi, true);

  let a0 = 0x67452301 | 0;
  let b0 = 0xefcdab89 | 0;
  let c0 = 0x98badcfe | 0;
  let d0 = 0x10325476 | 0;
  const m = new Int32Array(16);

  for (let off = 0; off < total; off += 64) {
    for (let j = 0; j < 16; j++) m[j] = view.getInt32(off + j * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) & 15;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) & 15;
      }
      const tmp = d;
      d = c;
      c = b;
      const sum = (a + f + (K[i] as number) + (m[g] as number)) | 0;
      const s = S[i] as number;
      b = (b + ((sum << s) | (sum >>> (32 - s)))) | 0;
      a = tmp;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  let out = "";
  for (const word of [a0, b0, c0, d0]) {
    for (let i = 0; i < 4; i++) {
      const byte = (word >>> (i * 8)) & 0xff;
      out += HEX[byte >>> 4]! + HEX[byte & 15]!;
    }
  }
  return out;
}

/** MD5 dari string UTF-8. */
export function md5String(text: string): string {
  return md5Hex(new TextEncoder().encode(text));
}
