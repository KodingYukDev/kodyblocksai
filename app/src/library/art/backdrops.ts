/** Latar orisinal 480x360 (ukuran panggung Scratch, pusat rotasi 240,180). */
import type { BackdropArt } from "./art-types";
import { circle, ellipse, f, line, path, poly, rect, rng, starPoints, svgDoc, vGradient } from "./svg-kit";

const W = 480;
const H = 360;

function sky(id: string, top: string, bottom: string, body: string): string {
  const [defs, url] = vGradient(`g-${id}`, [
    [0, top],
    [1, bottom],
  ]);
  return svgDoc(W, H, defs + rect(0, 0, W, H, { fill: url }) + body);
}

function hills(y: number, c: string, seed: number, amp = 30): string {
  const r = rng(seed);
  let d = `M0 ${H}L0 ${f(y)}`;
  for (let x = 0; x <= W; x += 80) d += `Q${f(x + 40)} ${f(y - amp * (0.4 + r()))} ${f(x + 80)} ${f(y)}`;
  return path(`${d}L${W} ${H}Z`, { fill: c });
}

function stars(n: number, seed: number, maxY = H): string {
  const r = rng(seed);
  let s = "";
  for (let i = 0; i < n; i++) s += circle(r() * W, r() * maxY, 0.6 + r() * 1.8, { fill: "#ffffff", opacity: 0.5 + r() * 0.5 });
  return s;
}

const cloudShape = (x: number, y: number, s: number, c = "#ffffff"): string =>
  ellipse(x, y, 40 * s, 16 * s, { fill: c }) + circle(x - 14 * s, y - 10 * s, 16 * s, { fill: c }) + circle(x + 12 * s, y - 14 * s, 20 * s, { fill: c });

function treeAt(x: number, y: number, s: number, c: string): string {
  return rect(x - 5 * s, y - 30 * s, 10 * s, 30 * s, { fill: "#7a4f2a" }) + circle(x, y - 46 * s, 24 * s, { fill: c }) + circle(x - 16 * s, y - 34 * s, 14 * s, { fill: c }) + circle(x + 16 * s, y - 34 * s, 14 * s, { fill: c });
}

function pine(x: number, y: number, s: number, c: string): string {
  return rect(x - 4 * s, y - 14 * s, 8 * s, 14 * s, { fill: "#6b4423" }) + poly([[x, y - 80 * s], [x - 26 * s, y - 14 * s], [x + 26 * s, y - 14 * s]], { fill: c });
}

function buildings(seed: number): string {
  const r = rng(seed);
  let s = "";
  let x = 0;
  while (x < W) {
    const w = 40 + r() * 50;
    const h = 90 + r() * 150;
    const c = ["#3d4b6b", "#4a5a80", "#2f3a55", "#566890"][Math.floor(r() * 4)] ?? "#3d4b6b";
    s += rect(x, 300 - h, w - 4, h, { fill: c });
    for (let wy = 300 - h + 12; wy < 290; wy += 22) for (let wx = x + 8; wx < x + w - 14; wx += 16) s += rect(wx, wy, 8, 10, { fill: r() > 0.4 ? "#ffe066" : "#28324a" });
    x += w;
  }
  return s;
}

function grid(): string {
  let g = rect(0, 0, W, H, { fill: "#ffffff" });
  for (let x = 0; x <= W; x += 20) g += line(x, 0, x, H, { stroke: x % 100 === 40 ? "#b9c6dc" : "#e3e9f3", sw: 1 });
  for (let y = 0; y <= H; y += 20) g += line(0, y, W, y, { stroke: (y - 180) % 100 === 0 ? "#b9c6dc" : "#e3e9f3", sw: 1 });
  g += line(0, 180, W, 180, { stroke: "#575e75", sw: 2 }) + line(240, 0, 240, H, { stroke: "#575e75", sw: 2 });
  const label = (x: number, y: number, t: string): string => `<text x="${f(x)}" y="${f(y)}" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#575e75">${t}</text>`;
  for (let v = -200; v <= 200; v += 100) if (v) g += label(240 + v + 3, 193, String(v));
  for (let v = -100; v <= 100; v += 100) if (v) g += label(244, 180 - v + 4, String(v));
  g += label(462, 174, "x") + label(246, 12, "y");
  return svgDoc(W, H, g);
}

function rainbow(): string {
  const cols = ["#e5484d", "#ff8c1a", "#ffd43b", "#59c059", "#4c97ff", "#9966ff"];
  let arcs = "";
  cols.forEach((c, i) => {
    const r = 220 - i * 18;
    arcs += path(`M${240 - r} 330A${r} ${r} 0 0 1 ${240 + r} 330`, { stroke: c, sw: 18 });
  });
  return sky("pelangi", "#8fd3ff", "#e6f7ff", arcs + cloudShape(70, 320, 1.6) + cloudShape(410, 320, 1.6) + hills(330, "#7ccf6f", 9, 10));
}

export function backdropArts(): BackdropArt[] {
  const b = (id: string, name: string, nameEn: string, category: string, tags: string[], svg: string): BackdropArt => ({ id, name, nameEn, category, tags, svg });
  return [
    b("langit-biru", "Langit Biru", "Blue Sky", "luar", ["siang", "awan"], sky("langit", "#6ec3ff", "#d7f0ff", cloudShape(110, 90, 1.2) + cloudShape(360, 60, 0.9) + cloudShape(300, 160, 0.7) + hills(300, "#8fd16f", 1))),
    b("malam-berbintang", "Malam Berbintang", "Starry Night", "luar", ["malam", "bulan", "bintang"], sky("malam", "#0b1636", "#2b3b74", stars(90, 2, 260) + circle(390, 70, 32, { fill: "#fff6c8" }) + circle(404, 62, 28, { fill: "#16224a" }) + hills(300, "#1b2a4f", 3))),
    b("laut", "Laut", "Sea", "air", ["pantai", "ombak", "biru"], sky("laut", "#7fd4ff", "#e2f6ff", circle(400, 70, 30, { fill: "#ffd43b" }) + rect(0, 200, W, 160, { fill: "#2b8ee6" }) + path("M0 210Q60 196 120 210T240 210T360 210T480 210V230H0Z", { fill: "#5cb1f0" }) + path("M0 260Q60 248 120 260T240 260T360 260T480 260", { stroke: "#9fd6ff", sw: 3 }))),
    b("bawah-laut", "Bawah Laut", "Underwater", "air", ["laut", "ikan", "terumbu"], sky("bawah", "#2fb6d6", "#0b5c8a", (() => { const r = rng(4); let s = ""; for (let i = 0; i < 25; i++) s += circle(r() * W, r() * 300, 2 + r() * 6, { fill: "#ffffff", opacity: 0.3 }); return s; })() + rect(0, 320, W, 40, { fill: "#e8d29a" }) + path("M60 330Q50 260 70 230M70 330Q90 280 80 250", { stroke: "#ff6680", sw: 8 }) + path("M380 330Q370 270 400 240M400 330Q420 290 430 260", { stroke: "#59c059", sw: 8 }))),
    b("gurun", "Gurun", "Desert", "luar", ["pasir", "panas", "kaktus"], sky("gurun", "#ffd27a", "#fff1cf", circle(90, 70, 36, { fill: "#fff3b0" }) + hills(260, "#f0b75e", 5, 40) + hills(300, "#e3a24a", 6, 30) + rect(350, 210, 18, 80, { fill: "#4aa84a" }, 9) + rect(330, 230, 14, 34, { fill: "#4aa84a" }, 7) + rect(374, 220, 14, 30, { fill: "#4aa84a" }, 7))),
    b("hutan", "Hutan", "Forest", "luar", ["pohon", "alam", "hijau"], sky("hutan", "#a6e3ff", "#e7f8ff", hills(260, "#5aa85a", 7) + pine(40, 300, 1.4, "#2f7a2f") + pine(130, 310, 1.8, "#3a8f3a") + pine(250, 300, 1.3, "#2f7a2f") + pine(340, 315, 1.9, "#3a8f3a") + pine(440, 300, 1.5, "#2f7a2f") + rect(0, 300, W, 60, { fill: "#4b8f3f" }))),
    b("kota", "Kota", "City", "kota", ["gedung", "jalan"], sky("kota", "#ffb27a", "#ffe3c4", buildings(8) + rect(0, 300, W, 60, { fill: "#575e75" }) + (() => { let s = ""; for (let x = 10; x < W; x += 60) s += rect(x, 328, 30, 5, { fill: "#ffd43b" }); return s; })())),
    b("luar-angkasa", "Luar Angkasa", "Outer Space", "angkasa", ["planet", "bintang", "roket"], sky("angkasa", "#050816", "#1c1446", stars(140, 10) + circle(120, 250, 60, { fill: "#ff8c1a" }) + ellipse(120, 250, 95, 16, { stroke: "#ffd43b", sw: 5, opacity: 0.8 }) + circle(390, 90, 26, { fill: "#4c97ff" }) + circle(382, 82, 6, { fill: "#8fc4ff" }))),
    b("kelas", "Ruang Kelas", "Classroom", "dalam", ["sekolah", "papan tulis"], svgDoc(W, H, rect(0, 0, W, H, { fill: "#f6e7c8" }) + rect(0, 290, W, 70, { fill: "#c08a52" }) + rect(90, 50, 300, 170, { fill: "#2f5d46", stroke: "#8b5a2b", sw: 10 }) + `<text x="120" y="110" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#ffffff" opacity="0.85">2 + 3 = 5</text>` + path("M130 160Q170 140 210 160T290 160", { stroke: "#ffffff", sw: 3, opacity: 0.7 }) + rect(150, 222, 180, 8, { fill: "#8b5a2b" }))),
    b("lapangan-bola", "Lapangan Bola", "Soccer Field", "olahraga", ["sepak bola", "rumput"], svgDoc(W, H, rect(0, 0, W, H, { fill: "#4aa84a" }) + (() => { let s = ""; for (let x = 0; x < W; x += 80) s += rect(x, 0, 40, H, { fill: "#53b553" }); return s; })() + rect(20, 20, 440, 320, { stroke: "#ffffff", sw: 4 }) + line(240, 20, 240, 340, { stroke: "#ffffff", sw: 4 }) + circle(240, 180, 50, { stroke: "#ffffff", sw: 4 }) + rect(20, 110, 60, 140, { stroke: "#ffffff", sw: 4 }) + rect(400, 110, 60, 140, { stroke: "#ffffff", sw: 4 }))),
    b("pantai", "Pantai", "Beach", "air", ["pasir", "laut", "liburan"], sky("pantai", "#78d0ff", "#dff5ff", cloudShape(120, 70, 1) + rect(0, 170, W, 90, { fill: "#2b9be6" }) + path("M0 250Q120 230 240 250T480 240V360H0Z", { fill: "#f3dc9a" }) + rect(380, 180, 10, 120, { fill: "#8b5a2b" }) + path("M385 180Q340 160 330 190M385 180Q430 160 440 190M385 180Q360 140 340 150M385 180Q410 140 430 150", { stroke: "#3a8f3a", sw: 8 }))),
    b("gunung", "Pegunungan", "Mountains", "luar", ["gunung", "salju"], sky("gunung", "#8fd3ff", "#eaf8ff", poly([[0, 300], [130, 110], [260, 300]], { fill: "#7d8bb0" }) + poly([[130, 110], [104, 150], [156, 150]], { fill: "#ffffff" }) + poly([[180, 300], [330, 80], [480, 300]], { fill: "#6a789c" }) + poly([[330, 80], [300, 124], [360, 124]], { fill: "#ffffff" }) + rect(0, 290, W, 70, { fill: "#6cbf5f" }))),
    b("salju", "Musim Salju", "Snowy Day", "luar", ["dingin", "salju", "musim dingin"], sky("salju", "#b9d7f0", "#eef6ff", (() => { const r = rng(12); let s = ""; for (let i = 0; i < 70; i++) s += circle(r() * W, r() * 280, 1.5 + r() * 3, { fill: "#ffffff" }); return s; })() + hills(290, "#ffffff", 13, 40) + pine(90, 300, 1.5, "#2f6f5a") + pine(400, 310, 1.8, "#2f6f5a"))),
    b("senja", "Senja", "Sunset", "luar", ["sore", "matahari terbenam"], sky("senja", "#ff6a5c", "#ffd48a", circle(240, 250, 70, { fill: "#ffe38a" }) + rect(0, 250, W, 110, { fill: "#4a2d5c" }) + path("M0 270Q240 240 480 270", { stroke: "#ffb27a", sw: 3, opacity: 0.6 }))),
    b("panggung", "Panggung", "Theater Stage", "dalam", ["pertunjukan", "tirai", "konser"], svgDoc(W, H, rect(0, 0, W, H, { fill: "#2a1630" }) + ellipse(240, 300, 220, 40, { fill: "#8b5a2b" }) + rect(0, 290, W, 70, { fill: "#6b4423" }) + ellipse(240, 300, 140, 30, { fill: "#ffe38a", opacity: 0.25 }) + path("M0 0H150Q110 160 140 360H0Z", { fill: "#c0213a" }) + path("M480 0H330Q370 160 340 360H480Z", { fill: "#c0213a" }) + rect(0, 0, W, 34, { fill: "#a01a30" }))),
    b("grid-xy", "Grid Koordinat", "XY Grid", "belajar", ["koordinat", "matematika", "x y"], grid()),
    b("pelangi", "Pelangi", "Rainbow", "luar", ["warna", "langit"], rainbow()),
    b("taman", "Taman", "Park", "luar", ["bermain", "pohon", "rumput"], sky("taman", "#8fd8ff", "#e6f7ff", cloudShape(380, 80, 1) + rect(0, 250, W, 110, { fill: "#6cc35f" }) + treeAt(80, 270, 1.4, "#3a9a3a") + treeAt(400, 260, 1.2, "#4aa84a") + path("M180 360Q240 280 300 250", { stroke: "#e3c08a", sw: 26 }) + rect(260, 230, 60, 8, { fill: "#8b5a2b" }) + rect(266, 238, 6, 16, { fill: "#8b5a2b" }) + rect(308, 238, 6, 16, { fill: "#8b5a2b" }))),
    b("peternakan", "Peternakan", "Farm", "luar", ["kandang", "desa"], sky("peternakan", "#9ed9ff", "#eaf8ff", hills(260, "#8fd16f", 14) + rect(0, 280, W, 80, { fill: "#7cc35f" }) + rect(300, 160, 130, 120, { fill: "#c0392b" }) + poly([[290, 165], [365, 110], [440, 165]], { fill: "#8e2a20" }) + rect(345, 210, 40, 70, { fill: "#ffffff" }) + line(345, 210, 385, 280, { stroke: "#c0392b", sw: 4 }) + line(385, 210, 345, 280, { stroke: "#c0392b", sw: 4 }) + (() => { let s = ""; for (let x = 0; x < 280; x += 24) s += rect(x, 270, 6, 34, { fill: "#d9b27a" }); return s + rect(0, 280, 280, 6, { fill: "#d9b27a" }); })())),
    b("laboratorium", "Laboratorium", "Laboratory", "dalam", ["sains", "eksperimen", "sekolah"], svgDoc(W, H, rect(0, 0, W, H, { fill: "#dfeaf5" }) + rect(0, 250, W, 110, { fill: "#9fb3c8" }) + rect(0, 240, W, 14, { fill: "#6b7f99" }) + path("M90 238V190L70 150H130L110 190V238Z", { fill: "#0fbd8c", opacity: 0.8, stroke: "#46607a", sw: 3 }) + rect(200, 150, 18, 88, { fill: "#ff6680", opacity: 0.8, stroke: "#46607a", sw: 3 }, 9) + circle(330, 210, 28, { fill: "#9966ff", opacity: 0.8, stroke: "#46607a", sw: 3 }) + rect(322, 160, 16, 26, { stroke: "#46607a", sw: 3 }) + rect(40, 40, 140, 80, { fill: "#ffffff", stroke: "#46607a", sw: 3 }) + path("M60 100L90 70L120 90L160 55", { stroke: "#4c97ff", sw: 3 }))),
    b("kastil", "Kastil", "Castle", "fantasi", ["kerajaan", "dongeng"], sky("kastil", "#c6b4ff", "#f3eaff", hills(300, "#7cc35f", 15) + rect(150, 140, 180, 160, { fill: "#b9c0d4" }) + rect(120, 100, 60, 200, { fill: "#a7aec4" }) + rect(300, 100, 60, 200, { fill: "#a7aec4" }) + poly([[115, 100], [150, 40], [185, 100]], { fill: "#9966ff" }) + poly([[295, 100], [330, 40], [365, 100]], { fill: "#9966ff" }) + path("M215 300V240A25 25 0 0 1 265 240V300Z", { fill: "#6b4423" }) + poly(starPoints(240, 180, 14, 6), { fill: "#ffd43b" }))),
  ];
}

/** Ukuran latar (dipakai tes). */
export const BACKDROP_SIZE = { width: W, height: H } as const;
