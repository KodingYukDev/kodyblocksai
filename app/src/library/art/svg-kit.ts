/**
 * Helper kecil untuk menggambar aset SVG orisinal pustaka KodyBlocks secara deterministik.
 * Semua bentuk ditulis tangan dari primitif geometri; tidak ada aset Scratch yang disalin.
 */

/** Format angka ringkas & stabil (maks 2 desimal). */
export function f(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}

export interface Paint {
  fill?: string;
  stroke?: string;
  sw?: number;
  opacity?: number;
  extra?: string;
}

function paint(p: Paint = {}): string {
  let s = "";
  s += ` fill="${p.fill ?? "none"}"`;
  if (p.stroke) s += ` stroke="${p.stroke}" stroke-width="${f(p.sw ?? 2)}" stroke-linecap="round" stroke-linejoin="round"`;
  if (p.opacity !== undefined) s += ` opacity="${f(p.opacity)}"`;
  if (p.extra) s += ` ${p.extra}`;
  return s;
}

export function svgDoc(w: number, h: number, body: string, bg?: string): string {
  const back = bg ? `<rect x="0" y="0" width="${f(w)}" height="${f(h)}" fill="${bg}"/>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${f(w)}" height="${f(h)}" viewBox="0 0 ${f(w)} ${f(h)}">` +
    `<!-- KodyBlocks library asset by KodingYuk -->${back}${body}</svg>`
  );
}

export const circle = (cx: number, cy: number, r: number, p?: Paint): string =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"${paint(p)}/>`;

export const ellipse = (cx: number, cy: number, rx: number, ry: number, p?: Paint): string =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}"${paint(p)}/>`;

export const rect = (x: number, y: number, w: number, h: number, p?: Paint, r = 0): string =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${r ? ` rx="${f(r)}"` : ""}${paint(p)}/>`;

export const path = (d: string, p?: Paint): string => `<path d="${d}"${paint(p)}/>`;

export const line = (x1: number, y1: number, x2: number, y2: number, p: Paint): string =>
  `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"${paint({ ...p, fill: undefined })}/>`;

export const poly = (pts: readonly (readonly [number, number])[], p?: Paint): string =>
  `<polygon points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" ")}"${paint(p)}/>`;

export const group = (body: string, transform?: string): string =>
  transform ? `<g transform="${transform}">${body}</g>` : `<g>${body}</g>`;

/** Titik bintang n-sudut. */
export function starPoints(cx: number, cy: number, outer: number, inner: number, n = 5, rot = -90): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/** Path busur sederhana (senyum dsb). */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p0 = [cx + r * Math.cos((a0 * Math.PI) / 180), cy + r * Math.sin((a0 * Math.PI) / 180)] as const;
  const p1 = [cx + r * Math.cos((a1 * Math.PI) / 180), cy + r * Math.sin((a1 * Math.PI) / 180)] as const;
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${f(p0[0])} ${f(p0[1])}A${f(r)} ${f(r)} 0 ${large} 1 ${f(p1[0])} ${f(p1[1])}`;
}

/** Gradien linear vertikal; kembalikan [defs, url]. */
export function vGradient(id: string, stops: readonly (readonly [number, string])[]): [string, string] {
  const s = stops.map(([o, c]) => `<stop offset="${f(o)}" stop-color="${c}"/>`).join("");
  return [`<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${s}</linearGradient></defs>`, `url(#${id})`];
}

/** Pencerah/penggelap warna hex (#rrggbb) sebesar k (-1..1). */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = k >= 0 ? c + (255 - c) * k : c * (1 + k);
    return Math.max(0, Math.min(255, Math.round(v)));
  });
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** PRNG deterministik (mulberry32) agar aset identik setiap kali dibangun. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mata kartun standar (putih + pupil). */
export function eyes(x1: number, x2: number, y: number, r: number, look: [number, number] = [0, 0], ink = "#1f2a44"): string {
  return (
    circle(x1, y, r, { fill: "#ffffff", stroke: ink, sw: r * 0.25 }) +
    circle(x2, y, r, { fill: "#ffffff", stroke: ink, sw: r * 0.25 }) +
    circle(x1 + look[0] * r * 0.35, y + look[1] * r * 0.35, r * 0.5, { fill: ink }) +
    circle(x2 + look[0] * r * 0.35, y + look[1] * r * 0.35, r * 0.5, { fill: ink })
  );
}
