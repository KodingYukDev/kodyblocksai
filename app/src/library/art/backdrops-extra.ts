/** Latar tambahan orisinal 480x360: suasana Indonesia (sawah, sekolah), kamar, jalan, bulan. */
import type { BackdropArt } from "./art-types";
import { circle, ellipse, f, path, poly, rect, rng, shade, svgDoc, vGradient } from "./svg-kit";

const W = 480;
const H = 360;

function skyDoc(id: string, top: string, bottom: string, body: string): string {
  const [defs, url] = vGradient(`gx-${id}`, [
    [0, top],
    [1, bottom],
  ]);
  return svgDoc(W, H, defs + rect(0, 0, W, H, { fill: url }) + body);
}

const cloud = (x: number, y: number, s: number): string =>
  ellipse(x, y, 40 * s, 15 * s, { fill: "#ffffff" }) + circle(x - 13 * s, y - 9 * s, 15 * s, { fill: "#ffffff" }) + circle(x + 12 * s, y - 13 * s, 19 * s, { fill: "#ffffff" });

function sawah(): string {
  let terraces = "";
  const greens = ["#7bc96f", "#5fb85a", "#8fd67e", "#4fa64f", "#a3dc8c"];
  for (let i = 0; i < 5; i++) {
    const y = 190 + i * 36;
    const c = greens[i] ?? "#7bc96f";
    terraces += path(`M0 ${f(y)}Q120 ${f(y - 14)} 240 ${f(y)}T480 ${f(y)}V${H}H0Z`, { fill: c, stroke: shade(c, -0.25), sw: 2 });
    for (let x = 10 + (i % 2) * 12; x < W; x += 24) terraces += path(`M${f(x)} ${f(y + 18)}l-3 -9M${f(x)} ${f(y + 18)}l0 -11M${f(x)} ${f(y + 18)}l3 -9`, { stroke: shade(c, -0.35), sw: 1.6 });
  }
  const mountain = poly([[260, 190], [360, 70], [470, 190]], { fill: "#6b8fb8" }) + poly([[340, 94], [360, 70], [382, 96], [368, 92], [356, 100]], { fill: "#ffffff" });
  const hut = rect(60, 150, 50, 34, { fill: "#c48a4a", stroke: "#7a4f2a", sw: 2 }) + poly([[50, 152], [85, 124], [120, 152]], { fill: "#8a5a2b", stroke: "#5a3a1a", sw: 2 });
  return skyDoc("sawah", "#7cc8ff", "#d6f0ff", circle(410, 60, 26, { fill: "#ffd43b" }) + cloud(120, 70, 1) + cloud(250, 50, 0.7) + mountain + hut + terraces);
}

function sekolah(): string {
  let windows = "";
  for (let x = 110; x < 380; x += 50) windows += rect(x, 170, 30, 30, { fill: "#cfe8ff", stroke: "#3d4b6b", sw: 2 });
  for (let x = 110; x < 380; x += 50) windows += rect(x, 112, 30, 30, { fill: "#cfe8ff", stroke: "#3d4b6b", sw: 2 });
  const flag = rect(52, 60, 4, 200, { fill: "#9aa7c7" }) + rect(56, 62, 46, 15, { fill: "#e53935" }) + rect(56, 77, 46, 15, { fill: "#ffffff", stroke: "#d0d6e4", sw: 0.6 });
  return skyDoc(
    "sekolah",
    "#8fd3ff",
    "#e3f6ff",
    cloud(380, 56, 0.9) +
      rect(0, 250, W, 110, { fill: "#9bd36b" }) +
      rect(0, 280, W, 80, { fill: "#d9c7a3" }) +
      rect(90, 96, 300, 160, { fill: "#fff3d6", stroke: "#b8946a", sw: 3 }) +
      poly([[80, 100], [240, 40], [400, 100]], { fill: "#d65c3b", stroke: "#8a3420", sw: 3 }) +
      windows +
      rect(220, 206, 40, 50, { fill: "#8a5a2b", stroke: "#5a3a1a", sw: 2 }) +
      rect(176, 70, 128, 22, { fill: "#2f3a55" }, 4) +
      path("M190 81H290", { stroke: "#ffd43b", sw: 3, extra: 'stroke-dasharray="6 5"' }) +
      flag,
  );
}

function kamar(): string {
  const wall = rect(0, 0, W, 250, { fill: "#ffe6c7" }) + rect(0, 250, W, 110, { fill: "#c9925a" });
  let boards = "";
  for (let y = 262; y < H; y += 24) boards += path(`M0 ${f(y)}H${W}`, { stroke: "#a8743f", sw: 2 });
  const bed = rect(270, 200, 180, 70, { fill: "#4c97ff", stroke: "#2b5fb3", sw: 3 }, 8) + rect(270, 186, 56, 30, { fill: "#ffffff", stroke: "#9aa7c7", sw: 2 }, 10) + rect(262, 170, 12, 120, { fill: "#8a5a2b" }, 3) + rect(446, 200, 12, 90, { fill: "#8a5a2b" }, 3);
  const window_ = rect(50, 50, 120, 100, { fill: "#8fd3ff", stroke: "#ffffff", sw: 8 }) + path("M110 50V150M50 100H170", { stroke: "#ffffff", sw: 5 }) + circle(140, 80, 14, { fill: "#ffd43b" });
  const shelf = rect(210, 70, 120, 8, { fill: "#8a5a2b" }) + rect(218, 46, 12, 24, { fill: "#ff6680" }) + rect(232, 40, 12, 30, { fill: "#59c059" }) + rect(246, 50, 12, 20, { fill: "#9966ff" }) + circle(300, 56, 13, { fill: "#ffab19" });
  const rug = ellipse(150, 300, 110, 30, { fill: "#cf63cf", opacity: 0.85 });
  return svgDoc(W, H, wall + boards + window_ + shelf + rug + bed);
}

function jalanRaya(): string {
  const r = rng(51);
  let bld = "";
  let x = 0;
  while (x < W) {
    const w = 50 + r() * 40;
    const h = 70 + r() * 90;
    const c = ["#ffcf99", "#b3d9ff", "#ffb3c6", "#c7e9b0"][Math.floor(r() * 4)] ?? "#ffcf99";
    bld += rect(x, 200 - h, w - 6, h, { fill: c, stroke: shade(c, -0.3), sw: 2 });
    for (let wy = 200 - h + 12; wy < 188; wy += 24) bld += rect(x + 10, wy, w - 26, 12, { fill: "#ffffff", opacity: 0.7 });
    x += w;
  }
  let dashes = "";
  for (let dx = 10; dx < W; dx += 60) dashes += rect(dx, 284, 34, 6, { fill: "#ffffff" });
  let zebra = "";
  for (let zx = 380; zx < 460; zx += 16) zebra += rect(zx, 236, 9, 100, { fill: "#ffffff", opacity: 0.85 });
  return skyDoc("jalan", "#8fd3ff", "#e3f6ff", cloud(90, 50, 0.8) + bld + rect(0, 200, W, 30, { fill: "#c9ced9" }) + rect(0, 230, W, 110, { fill: "#4a4f5c" }) + zebra + dashes + rect(0, 340, W, 20, { fill: "#c9ced9" }));
}

function bulan(): string {
  const r = rng(77);
  let stars = "";
  for (let i = 0; i < 70; i++) stars += circle(r() * W, r() * 200, 0.6 + r() * 1.6, { fill: "#ffffff", opacity: 0.5 + r() * 0.5 });
  let craters = "";
  for (let i = 0; i < 9; i++) {
    const cx = 30 + r() * 420;
    const cy = 250 + r() * 90;
    const rr = 10 + r() * 22;
    craters += ellipse(cx, cy, rr, rr * 0.35, { fill: "#9aa0ad" }) + ellipse(cx, cy - 2, rr * 0.8, rr * 0.25, { fill: "#7f8594" });
  }
  const earth = circle(390, 80, 34, { fill: "#4c97ff" }) + path("M370 60Q384 70 378 86Q396 92 400 108Q384 112 372 100Q362 82 370 60ZM400 56Q414 62 418 76Q408 74 400 56Z", { fill: "#59c059" });
  return svgDoc(W, H, rect(0, 0, W, H, { fill: "#0b1026" }) + stars + earth + path(`M0 230Q120 205 240 228T480 222V${H}H0Z`, { fill: "#c3c7d1" }) + craters);
}

export function extraBackdropArts(): BackdropArt[] {
  return [
    { id: "sawah", name: "Sawah", nameEn: "Rice Field", category: "luar", tags: ["desa", "padi", "gunung", "indonesia", "petani"], svg: sawah() },
    { id: "sekolah", name: "Sekolah", nameEn: "School", category: "kota", tags: ["sekolah", "bendera", "belajar", "indonesia"], svg: sekolah() },
    { id: "kamar", name: "Kamar", nameEn: "Bedroom", category: "dalam", tags: ["rumah", "tidur", "kasur"], svg: kamar() },
    { id: "jalan-raya", name: "Jalan Raya", nameEn: "Street", category: "kota", tags: ["jalan", "mobil", "zebra cross", "gedung"], svg: jalanRaya() },
    { id: "bulan", name: "Permukaan Bulan", nameEn: "Moon Surface", category: "angkasa", tags: ["bulan", "bumi", "astronot", "luar angkasa"], svg: bulan() },
  ];
}
