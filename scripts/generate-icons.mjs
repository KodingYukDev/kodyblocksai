#!/usr/bin/env node
/**
 * Membuat ikon app (favicon, apple-touch-icon, ikon PWA biasa + maskable) dari maskot Kody
 * (app/public/kody.svg). Hasil ditulis ke app/public/icons/ dan app/public/favicon.ico.
 *
 *   node scripts/generate-icons.mjs
 *
 * Desain: latar gradien menu KodyBlocks (#15364c -> #08786f), lingkaran putih agar garis navy
 * maskot tetap kontras, lalu Kody di tengah. Ikon "maskable" memakai latar penuh dan maskot di dalam
 * zona aman 80% (Android memotong ikon jadi lingkaran/squircle).
 */
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "app", "public");
const outDir = join(publicDir, "icons");
mkdirSync(outDir, { recursive: true });

const mascot = readFileSync(join(publicDir, "kody.svg"), "utf8");
const inner = mascot.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

/**
 * @param {object} o
 * @param {number} o.radius   sudut latar (0..0.5 dari sisi); 0 = persegi penuh
 * @param {number} o.circle   jari-jari lingkaran putih (fraksi sisi)
 * @param {number} o.kody     lebar maskot (fraksi sisi)
 * @param {boolean} [o.transparent] tanpa latar (favicon kecil)
 */
function iconSvg({ radius, circle, kody, transparent = false }) {
  const S = 100;
  const k = kody * S;
  const off = (S - k) / 2;
  const bg = transparent
    ? ""
    : `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0" stop-color="#15364c"/><stop offset="1" stop-color="#08786f"/>
       </linearGradient></defs>
       <rect width="${S}" height="${S}" rx="${radius * S}" fill="url(#g)"/>`;
  const disc = circle > 0 ? `<circle cx="50" cy="50" r="${circle * S}" fill="#ffffff"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    ${bg}${disc}
    <svg x="${off}" y="${off}" width="${k}" height="${k}" viewBox="0 0 100 100">${inner}</svg>
  </svg>`;
}

function png(svg, size) {
  return new Resvg(svg, { fitTo: { mode: "width", value: size }, background: "rgba(0,0,0,0)" }).render().asPng();
}

const standard = iconSvg({ radius: 0.22, circle: 0.4, kody: 0.68 });
const fullBleed = iconSvg({ radius: 0, circle: 0.4, kody: 0.68 });
const maskable = iconSvg({ radius: 0, circle: 0.33, kody: 0.56 });
const small = iconSvg({ radius: 0.2, circle: 0.44, kody: 0.8 });

const outputs = [
  ["icon-192.png", standard, 192],
  ["icon-512.png", standard, 512],
  ["icon-maskable-512.png", maskable, 512],
  ["icon-maskable-192.png", maskable, 192],
  // iOS memotong sudut sendiri dan mengisi transparan dengan hitam: pakai latar penuh.
  ["apple-touch-icon.png", fullBleed, 180],
  ["favicon-32.png", small, 32],
  ["favicon-16.png", small, 16],
  // Gambar pratinjau tautan (og:image) 512 persegi.
  ["og-image.png", fullBleed, 512],
];

const written = {};
for (const [name, svg, size] of outputs) {
  const buf = png(svg, size);
  writeFileSync(join(outDir, name), buf);
  written[name] = buf;
  console.log(`icons/${name} ${size}x${size} ${buf.length} B`);
}
// apple-touch-icon juga di akar: Safari mencarinya di /apple-touch-icon.png tanpa tag <link>.
writeFileSync(join(publicDir, "apple-touch-icon.png"), written["apple-touch-icon.png"]);

/** favicon.ico berisi PNG 16/32/48 (format ICO dengan entri PNG, didukung semua browser modern). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}
const icoBuf = ico([16, 32, 48].map((size) => ({ size, data: png(small, size) })));
writeFileSync(join(publicDir, "favicon.ico"), icoBuf);
console.log(`favicon.ico ${icoBuf.length} B`);

// Favicon SVG (tajam di semua ukuran, dipakai browser yang mendukung).
writeFileSync(join(outDir, "favicon.svg"), small.replace(/\s+\n/g, "\n"));
console.log("icons/favicon.svg");
