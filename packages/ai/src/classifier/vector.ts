/** Utilitas vektor fitur + serialisasi int8 ringkas (base64) untuk disimpan di project. */

export function l2Normalize(v: ArrayLike<number>): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    const x = v[i] ?? 0;
    sum += x * x;
  }
  const norm = Math.sqrt(sum);
  const out = new Float32Array(v.length);
  if (!(norm > 0) || !Number.isFinite(norm)) return out;
  for (let i = 0; i < v.length; i++) out[i] = (v[i] ?? 0) / norm;
  return out;
}

export function dot(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] as number) * (b[i] as number);
  return s;
}

export function isFiniteVector(v: ArrayLike<number>): boolean {
  for (let i = 0; i < v.length; i++) if (!Number.isFinite(v[i])) return false;
  return true;
}

// ---------------------------------------------------------------------------
// base64 tanpa Buffer (jalan di browser dan Node)
// ---------------------------------------------------------------------------

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw new Error("base64 tidak valid");
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Kuantisasi int8 dengan skala per vektor: [float32 skala][int8 x dim].
 * Galat maksimum = skala/2 per komponen (cukup untuk kemiripan kosinus).
 */
export function encodeInt8Vector(v: Float32Array): string {
  let maxAbs = 0;
  for (const x of v) maxAbs = Math.max(maxAbs, Math.abs(x));
  const scale = maxAbs > 0 ? maxAbs / 127 : 1;
  const buf = new ArrayBuffer(4 + v.length);
  new DataView(buf).setFloat32(0, scale, true);
  const q = new Int8Array(buf, 4);
  for (let i = 0; i < v.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round((v[i] as number) / scale)));
  return bytesToBase64(new Uint8Array(buf));
}

export function decodeInt8Vector(encoded: string, dim: number): Float32Array {
  const bytes = base64ToBytes(encoded);
  if (bytes.length !== 4 + dim) throw new Error(`panjang vektor ${bytes.length - 4} != ${dim}`);
  const scale = new DataView(bytes.buffer, bytes.byteOffset, 4).getFloat32(0, true);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1e6) throw new Error("skala vektor tidak valid");
  const q = new Int8Array(bytes.buffer, bytes.byteOffset + 4, dim);
  const out = new Float32Array(dim);
  for (let i = 0; i < dim; i++) out[i] = (q[i] as number) * scale;
  return out;
}

/** Softmax dengan suhu; aman terhadap overflow. */
export function softmax(values: readonly number[], temperature = 1): number[] {
  if (values.length === 0) return [];
  const scaled = values.map((v) => v * temperature);
  const max = Math.max(...scaled);
  const exp = scaled.map((v) => Math.exp(v - max));
  const sum = exp.reduce((a, b) => a + b, 0) || 1;
  return exp.map((e) => e / sum);
}
