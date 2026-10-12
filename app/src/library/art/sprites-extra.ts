/**
 * Sprite tambahan orisinal: huruf & angka (font goresan buatan sendiri), hewan, anak-anak, dan
 * sprite untuk proyek AI (suit tangan, wajah emosi, lampu lalu lintas, tempat sampah).
 */
import type { SpriteArt } from "./art-types";
import { arc, circle, ellipse, f, path, poly, rect, shade, svgDoc } from "./svg-kit";

const INK = "#1f2a44";

// ---------------------------------------------------------------- huruf & angka

type Stroke = readonly (readonly [number, number])[];

const O: Stroke = [[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]];
const P_BOWL: Stroke = [[0, 6], [0, 0], [3, 0], [4, 0.8], [4, 2.4], [3, 3.2], [0, 3.2]];

/** Font goresan 4x6 (x ke kanan, y ke bawah). Dirancang sendiri untuk pustaka KodyBlocks. */
const GLYPHS: Record<string, readonly Stroke[]> = {
  A: [[[0, 6], [2, 0], [4, 6]], [[0.7, 4], [3.3, 4]]],
  B: [[[0, 6], [0, 0], [2.8, 0], [3.6, 0.6], [3.6, 2.2], [2.8, 3], [0, 3]], [[2.8, 3], [3.8, 3.8], [3.8, 5.2], [2.9, 6], [0, 6]]],
  C: [[[4, 0.8], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5.2]]],
  D: [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]],
  E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
  F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
  G: [[[4, 0.8], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3.2], [2.2, 3.2]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[2, 0], [2, 6]], [[0.8, 0], [3.2, 0]], [[0.8, 6], [3.2, 6]]],
  J: [[[4, 0], [4, 4.8], [3, 6], [1, 6], [0, 4.8]]],
  K: [[[0, 0], [0, 6]], [[4, 0], [0, 3.6]], [[1.4, 2.6], [4, 6]]],
  L: [[[0, 0], [0, 6], [4, 6]]],
  M: [[[0, 6], [0, 0], [2, 3.4], [4, 0], [4, 6]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  O: [O],
  P: [P_BOWL],
  Q: [O, [[2.6, 4.4], [4.2, 6.2]]],
  R: [P_BOWL, [[2, 3.2], [4, 6]]],
  S: [[[4, 0.8], [3, 0], [1, 0], [0, 0.9], [0, 2.2], [1, 3], [3, 3], [4, 3.8], [4, 5.1], [3, 6], [1, 6], [0, 5.2]]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
  V: [[[0, 0], [2, 6], [4, 0]]],
  W: [[[0, 0], [1, 6], [2, 2.6], [3, 6], [4, 0]]],
  X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
  Y: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]],
  Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
  "0": [O, [[1, 4.6], [3, 1.4]]],
  "1": [[[0.8, 1.2], [2, 0], [2, 6]], [[0.8, 6], [3.2, 6]]],
  "2": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2.2], [0, 6], [4, 6]]],
  "3": [[[0, 0.8], [1, 0], [3, 0], [4, 0.9], [4, 2.1], [3, 3], [1.6, 3]], [[3, 3], [4, 3.9], [4, 5.1], [3, 6], [1, 6], [0, 5.2]]],
  "4": [[[3, 6], [3, 0], [0, 4.2], [4, 4.2]]],
  "5": [[[4, 0], [0.4, 0], [0, 2.8], [2.8, 2.6], [4, 3.6], [4, 5], [3, 6], [1, 6], [0, 5.2]]],
  "6": [[[3.8, 0.6], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3.8], [3, 3], [1, 3], [0, 3.8]]],
  "7": [[[0, 0], [4, 0], [1.6, 6]]],
  "8": [[[2, 3], [0.8, 2.4], [0.4, 1.4], [1, 0.2], [2, 0], [3, 0.2], [3.6, 1.4], [3.2, 2.4], [2, 3], [0.6, 3.8], [0, 5], [1, 6], [3, 6], [4, 5], [3.4, 3.8], [2, 3]]],
  "9": [[[4, 2.2], [3, 3], [1, 3], [0, 2.2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0.2, 5.4]]],
};

const LETTER_COLORS = ["#4c97ff", "#ff6680", "#59c059", "#ffab19", "#9966ff", "#0fbd8c", "#ff8c1a", "#5cb1d6"];

/** Huruf bergaya "balon": goresan gelap di bawah, warna di atas, kilau tipis. */
export function glyphSvg(ch: string, color: string): string {
  const strokes = GLYPHS[ch];
  if (!strokes) throw new Error(`Glyph tidak ada: ${ch}`);
  const S = 11;
  const PAD = 12;
  const d = strokes.map((s) => s.map(([x, y], i) => `${i ? "L" : "M"}${f(PAD + x * S)} ${f(PAD + y * S)}`).join("")).join("");
  const W = PAD * 2 + 4 * S;
  const H = PAD * 2 + 6 * S;
  return svgDoc(
    W,
    H,
    path(d, { stroke: shade(color, -0.45), sw: 17 }) + path(d, { stroke: color, sw: 11 }) + path(d, { stroke: "#ffffff", sw: 2.5, opacity: 0.45 }),
  );
}

function letterSprites(): SpriteArt[] {
  const chars = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", ..."0123456789"];
  return chars.map((ch, i) => {
    const isDigit = /\d/.test(ch);
    const c1 = LETTER_COLORS[i % LETTER_COLORS.length] ?? "#4c97ff";
    const c2 = LETTER_COLORS[(i + 3) % LETTER_COLORS.length] ?? "#ff6680";
    return {
      id: isDigit ? `angka-${ch}` : `huruf-${ch.toLowerCase()}`,
      name: ch,
      nameEn: ch,
      category: "huruf",
      tags: isDigit ? ["angka", "nomor", "number", "hitung"] : ["huruf", "abjad", "alfabet", "letter", "nama"],
      costumes: [
        { name: `${ch}-a`, svg: glyphSvg(ch, c1) },
        { name: `${ch}-b`, svg: glyphSvg(ch, c2) },
      ],
      sounds: ["pop"],
    };
  });
}

// ---------------------------------------------------------------- hewan

function elephant(trunkUp: boolean): string {
  const g = "#9aa7c7";
  const d = shade(g, -0.4);
  const trunk = trunkUp ? "M84 50Q100 46 102 30Q103 22 96 24" : "M84 50Q96 62 94 80Q93 86 88 84";
  return svgDoc(
    112,
    100,
    ellipse(50, 58, 36, 26, { fill: g, stroke: d, sw: 2.5 }) +
      rect(22, 70, 12, 24, { fill: g, stroke: d, sw: 2.5 }, 4) +
      rect(58, 70, 12, 24, { fill: g, stroke: d, sw: 2.5 }, 4) +
      circle(76, 40, 22, { fill: g, stroke: d, sw: 2.5 }) +
      ellipse(62, 40, 14, 18, { fill: shade(g, 0.25), stroke: d, sw: 2 }) +
      path(trunk, { stroke: d, sw: 11 }) +
      path(trunk, { stroke: g, sw: 7 }) +
      circle(82, 34, 4, { fill: "#fff", stroke: INK, sw: 1.2 }) +
      circle(83, 34, 2, { fill: INK }) +
      path("M14 54Q6 58 8 66", { stroke: d, sw: 2.5 }),
  );
}

function lion(roar: boolean): string {
  const mane = "#c46a1a";
  const fur = "#ffbf3b";
  const mouth = roar ? ellipse(50, 60, 7, 9, { fill: "#8a1c1c" }) : path(arc(50, 56, 7, 20, 160), { stroke: INK, sw: 2.5 });
  let rays = "";
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    rays += circle(50 + 32 * Math.cos(a), 48 + 32 * Math.sin(a), 13, { fill: mane });
  }
  return svgDoc(
    100,
    100,
    rays +
      circle(50, 48, 30, { fill: mane }) +
      circle(50, 50, 24, { fill: fur, stroke: shade(fur, -0.35), sw: 2 }) +
      circle(32, 30, 7, { fill: fur, stroke: shade(fur, -0.35), sw: 2 }) +
      circle(68, 30, 7, { fill: fur, stroke: shade(fur, -0.35), sw: 2 }) +
      circle(41, 44, 4, { fill: INK }) +
      circle(59, 44, 4, { fill: INK }) +
      poly([[45, 51], [55, 51], [50, 56]], { fill: "#6b3b1a" }) +
      mouth,
  );
}

function panda(wave: boolean): string {
  const arm = wave ? path("M74 66Q90 50 86 36", { stroke: INK, sw: 12 }) : path("M74 66Q84 80 78 90", { stroke: INK, sw: 12 });
  return svgDoc(
    100,
    110,
    ellipse(50, 78, 28, 26, { fill: "#ffffff", stroke: INK, sw: 2.5 }) +
      path("M26 66Q16 80 22 90", { stroke: INK, sw: 12 }) +
      arm +
      ellipse(36, 102, 10, 7, { fill: INK }) +
      ellipse(64, 102, 10, 7, { fill: INK }) +
      circle(30, 18, 10, { fill: INK }) +
      circle(70, 18, 10, { fill: INK }) +
      circle(50, 38, 26, { fill: "#ffffff", stroke: INK, sw: 2.5 }) +
      ellipse(40, 36, 7, 9, { fill: INK, extra: 'transform="rotate(-20 40 36)"' }) +
      ellipse(60, 36, 7, 9, { fill: INK, extra: 'transform="rotate(20 60 36)"' }) +
      circle(41, 36, 2.5, { fill: "#fff" }) +
      circle(59, 36, 2.5, { fill: "#fff" }) +
      ellipse(50, 47, 4, 3, { fill: INK }) +
      path(arc(50, 49, 5, 30, 150), { stroke: INK, sw: 2 }),
  );
}

function rabbit(hop: boolean): string {
  const c = "#f4f7ff";
  const d = "#9aa7c7";
  const dy = hop ? -8 : 0;
  const legs = hop ? ellipse(30, 92, 16, 6, { fill: c, stroke: d, sw: 2 }) + ellipse(66, 92, 16, 6, { fill: c, stroke: d, sw: 2 }) : ellipse(36, 96, 14, 6, { fill: c, stroke: d, sw: 2 }) + ellipse(60, 96, 14, 6, { fill: c, stroke: d, sw: 2 });
  return svgDoc(
    96,
    104,
    legs +
      ellipse(48, 74 + dy, 24, 20, { fill: c, stroke: d, sw: 2.5 }) +
      ellipse(36, 18 + dy, 7, 20, { fill: c, stroke: d, sw: 2.5 }) +
      ellipse(60, 18 + dy, 7, 20, { fill: c, stroke: d, sw: 2.5 }) +
      ellipse(36, 18 + dy, 3, 13, { fill: "#ffb3c6" }) +
      ellipse(60, 18 + dy, 3, 13, { fill: "#ffb3c6" }) +
      circle(48, 46 + dy, 20, { fill: c, stroke: d, sw: 2.5 }) +
      circle(41, 42 + dy, 3, { fill: INK }) +
      circle(55, 42 + dy, 3, { fill: INK }) +
      ellipse(48, 50 + dy, 3, 2.2, { fill: "#ff6680" }) +
      path(`M44 ${f(54 + dy)}Q48 ${f(58 + dy)} 52 ${f(54 + dy)}`, { stroke: INK, sw: 1.8 }) +
      circle(24, 80 + dy, 6, { fill: c, stroke: d, sw: 2 }),
  );
}

function penguin(flap: boolean): string {
  const wingL = flap ? "M22 50Q6 40 8 28" : "M24 50Q14 66 18 80";
  const wingR = flap ? "M70 50Q86 40 84 28" : "M68 50Q78 66 74 80";
  return svgDoc(
    92,
    104,
    path(wingL, { stroke: "#1f2a44", sw: 10 }) +
      path(wingR, { stroke: "#1f2a44", sw: 10 }) +
      ellipse(46, 58, 26, 38, { fill: "#2f3a55" }) +
      ellipse(46, 64, 18, 30, { fill: "#ffffff" }) +
      circle(39, 34, 4, { fill: "#fff", stroke: INK, sw: 1.2 }) +
      circle(53, 34, 4, { fill: "#fff", stroke: INK, sw: 1.2 }) +
      circle(39.5, 34, 2, { fill: INK }) +
      circle(53.5, 34, 2, { fill: INK }) +
      poly([[40, 42], [52, 42], [46, 50]], { fill: "#ffab19" }) +
      ellipse(36, 98, 9, 4, { fill: "#ffab19" }) +
      ellipse(56, 98, 9, 4, { fill: "#ffab19" }),
  );
}

function frog(jump: boolean): string {
  const g = "#59c059";
  const d = shade(g, -0.4);
  const legs = jump
    ? path("M26 64L8 90M66 64L84 90", { stroke: d, sw: 8 }) + path("M26 64L8 90M66 64L84 90", { stroke: g, sw: 5 })
    : ellipse(22, 74, 14, 8, { fill: g, stroke: d, sw: 2 }) + ellipse(70, 74, 14, 8, { fill: g, stroke: d, sw: 2 });
  return svgDoc(
    92,
    96,
    legs +
      ellipse(46, 58, 30, 22, { fill: g, stroke: d, sw: 2.5 }) +
      ellipse(46, 64, 18, 12, { fill: shade(g, 0.45) }) +
      circle(32, 34, 11, { fill: g, stroke: d, sw: 2.5 }) +
      circle(60, 34, 11, { fill: g, stroke: d, sw: 2.5 }) +
      circle(32, 34, 6, { fill: "#fff" }) +
      circle(60, 34, 6, { fill: "#fff" }) +
      circle(33, 35, 3, { fill: INK }) +
      circle(61, 35, 3, { fill: INK }) +
      path(arc(46, 46, 14, 25, 155), { stroke: d, sw: 2.5 }),
  );
}

function turtle(hide: boolean): string {
  const shell = "#3aa35f";
  const skin = "#9bd36b";
  const head = hide ? "" : circle(88, 52, 11, { fill: skin, stroke: shade(skin, -0.4), sw: 2 }) + circle(92, 49, 2.5, { fill: INK });
  return svgDoc(
    104,
    80,
    ellipse(30, 66, 9, 6, { fill: skin, stroke: shade(skin, -0.4), sw: 2 }) +
      ellipse(70, 66, 9, 6, { fill: skin, stroke: shade(skin, -0.4), sw: 2 }) +
      head +
      path("M10 60Q12 18 50 16Q88 18 90 60Z", { fill: shell, stroke: shade(shell, -0.4), sw: 2.5 }) +
      path("M50 16V60M28 26L36 60M72 26L64 60M14 44H86", { stroke: shade(shell, -0.3), sw: 2 }) +
      rect(8, 56, 84, 8, { fill: shade(shell, 0.3), stroke: shade(shell, -0.4), sw: 2 }, 4),
  );
}

// ---------------------------------------------------------------- anak-anak

function kid(shirt: string, hair: string, girl: boolean, wave: boolean): string {
  const skin = "#f2c29b";
  const armR = wave ? "M60 58Q74 44 72 28" : "M60 58Q68 74 66 86";
  const hairShape = girl
    ? path("M24 34Q22 8 46 8Q70 8 68 34Q70 52 76 60Q66 58 64 40Q46 26 28 40Q26 58 16 60Q22 52 24 34Z", { fill: hair })
    : path("M24 32Q24 8 46 8Q68 8 68 32Q60 20 46 22Q32 20 24 32Z", { fill: hair });
  return svgDoc(
    92,
    130,
    rect(34, 92, 10, 30, { fill: "#2f3a55" }, 3) +
      rect(48, 92, 10, 30, { fill: "#2f3a55" }, 3) +
      ellipse(39, 124, 9, 5, { fill: INK }) +
      ellipse(53, 124, 9, 5, { fill: INK }) +
      path("M32 58Q20 72 24 86", { stroke: skin, sw: 9 }) +
      path(armR, { stroke: skin, sw: 9 }) +
      path(girl ? "M30 54H62L68 98H24Z" : "M30 54H62V96H30Z", { fill: shirt, stroke: shade(shirt, -0.35), sw: 2 }) +
      circle(46, 32, 22, { fill: skin, stroke: shade(skin, -0.3), sw: 2 }) +
      hairShape +
      circle(38, 34, 3, { fill: INK }) +
      circle(54, 34, 3, { fill: INK }) +
      circle(33, 41, 3.5, { fill: "#ff8fa3", opacity: 0.6 }) +
      circle(59, 41, 3.5, { fill: "#ff8fa3", opacity: 0.6 }) +
      path(arc(46, 40, 7, 25, 155), { stroke: INK, sw: 2.2 }),
  );
}

// ---------------------------------------------------------------- sprite untuk proyek AI

/** Tangan untuk permainan suit (batu, gunting, kertas): cocok untuk AI pengenal tangan/gambar. */
function hand(kind: "batu" | "gunting" | "kertas"): string {
  const skin = "#f2c29b";
  const d = shade(skin, -0.35);
  const finger = (x: number, len: number, angle = 0): string =>
    rect(x, 50 - len, 13, len + 10, { fill: skin, stroke: d, sw: 2.2, extra: angle ? `transform="rotate(${angle} ${f(x + 6.5)} 56)"` : "" }, 6.5);
  let fingers = "";
  if (kind === "kertas") fingers = finger(22, 40, -8) + finger(36, 46, -3) + finger(50, 46, 3) + finger(64, 40, 8);
  if (kind === "gunting") fingers = finger(30, 44, -14) + finger(50, 44, 14);
  const knuckles = kind === "batu" ? path("M28 54H80M28 66H80", { stroke: d, sw: 2 }) + path("M41 46V74M54 46V74M67 46V74", { stroke: d, sw: 1.6 }) : "";
  const thumb = kind === "kertas" ? path("M24 82Q6 70 10 56", { stroke: d, sw: 15 }) + path("M24 82Q6 70 10 56", { stroke: skin, sw: 11 }) : path("M30 78Q20 70 30 62H48", { stroke: d, sw: 13 }) + path("M30 78Q20 70 30 62H48", { stroke: skin, sw: 9 });
  return svgDoc(104, 120, fingers + rect(24, 44, 60, 52, { fill: skin, stroke: d, sw: 2.5 }, 18) + knuckles + thumb + rect(30, 94, 48, 22, { fill: "#4c97ff", stroke: shade("#4c97ff", -0.35), sw: 2 }, 4));
}

/** Wajah emosi: untuk proyek AI ekspresi wajah dan perasaan. */
function face(kind: "senang" | "sedih" | "kaget" | "marah" | "biasa"): string {
  const c = kind === "marah" ? "#ff8c66" : "#ffd43b";
  const d = shade(c, -0.4);
  let eyesS = circle(36, 42, 5, { fill: INK }) + circle(64, 42, 5, { fill: INK });
  let mouth = "";
  let extra = "";
  switch (kind) {
    case "senang":
      mouth = path("M30 60Q50 82 70 60Z", { fill: "#8a1c1c", stroke: INK, sw: 2.5 });
      break;
    case "sedih":
      mouth = path(arc(50, 78, 14, 200, 340), { stroke: INK, sw: 3 });
      extra = ellipse(30, 54, 3, 6, { fill: "#4c97ff" });
      break;
    case "kaget":
      eyesS = circle(36, 40, 7, { fill: "#fff", stroke: INK, sw: 2 }) + circle(64, 40, 7, { fill: "#fff", stroke: INK, sw: 2 }) + circle(36, 40, 3, { fill: INK }) + circle(64, 40, 3, { fill: INK });
      mouth = ellipse(50, 68, 8, 10, { fill: "#8a1c1c", stroke: INK, sw: 2.5 });
      break;
    case "marah":
      extra = path("M26 30L44 38M74 30L56 38", { stroke: INK, sw: 3.5 });
      mouth = path(arc(50, 76, 12, 210, 330), { stroke: INK, sw: 3 });
      break;
    case "biasa":
      mouth = path("M36 66H64", { stroke: INK, sw: 3 });
      break;
  }
  return svgDoc(100, 100, circle(50, 50, 44, { fill: c, stroke: d, sw: 3 }) + eyesS + mouth + extra);
}

function trafficLight(on: 0 | 1 | 2): string {
  const colors = ["#ff4d4d", "#ffd43b", "#3ecf5a"];
  let lamps = "";
  colors.forEach((c, i) => {
    lamps += circle(40, 28 + i * 38, 14, { fill: i === on ? c : shade(c, -0.65), stroke: INK, sw: 2 });
    if (i === on) lamps += circle(35, 23 + i * 38, 4, { fill: "#ffffff", opacity: 0.6 });
  });
  return svgDoc(80, 170, rect(36, 120, 8, 48, { fill: "#566890" }) + rect(14, 6, 52, 116, { fill: "#2f3a55", stroke: INK, sw: 2.5 }, 12) + lamps);
}

/** Tempat sampah organik / anorganik: untuk AI memilah sampah. */
function trashBin(organic: boolean): string {
  const c = organic ? "#3aa35f" : "#ffab19";
  const d = shade(c, -0.4);
  const icon = organic
    ? path("M50 52Q36 52 36 66Q50 70 56 58Q58 52 50 52ZM44 66Q50 60 54 56", { fill: "#ffffff", stroke: "#ffffff", sw: 1.5 })
    : rect(42, 50, 16, 24, { fill: "#ffffff" }, 3) + rect(46, 46, 8, 5, { fill: "#ffffff" }, 1);
  return svgDoc(100, 110, rect(20, 22, 60, 12, { fill: d }, 4) + rect(42, 14, 16, 10, { fill: d }, 3) + path("M24 34H76L70 104H30Z", { fill: c, stroke: d, sw: 2.5 }) + path("M38 44V96M50 44V96M62 44V96", { stroke: shade(c, -0.15), sw: 3 }) + circle(50, 64, 18, { fill: d }) + icon);
}

export function extraSprites(): SpriteArt[] {
  return [
    {
      id: "gajah",
      name: "Gajah",
      nameEn: "Elephant",
      category: "hewan",
      tags: ["belalai", "besar", "kebun binatang"],
      costumes: [
        { name: "gajah-a", svg: elephant(false) },
        { name: "gajah-b", svg: elephant(true) },
      ],
      sounds: ["auman"],
    },
    {
      id: "singa",
      name: "Singa",
      nameEn: "Lion",
      category: "hewan",
      tags: ["raja hutan", "kebun binatang"],
      costumes: [
        { name: "singa-a", svg: lion(false) },
        { name: "singa-b", svg: lion(true) },
      ],
      sounds: ["auman"],
    },
    {
      id: "panda",
      name: "Panda",
      nameEn: "Panda",
      category: "hewan",
      tags: ["beruang", "lucu"],
      costumes: [
        { name: "panda-a", svg: panda(false) },
        { name: "panda-b", svg: panda(true) },
      ],
      sounds: ["pop"],
    },
    {
      id: "kelinci",
      name: "Kelinci",
      nameEn: "Rabbit",
      category: "hewan",
      tags: ["lompat", "peliharaan", "wortel"],
      costumes: [
        { name: "kelinci-a", svg: rabbit(false) },
        { name: "kelinci-b", svg: rabbit(true) },
      ],
      sounds: ["boing"],
    },
    {
      id: "penguin",
      name: "Penguin",
      nameEn: "Penguin",
      category: "hewan",
      tags: ["es", "salju", "burung"],
      costumes: [
        { name: "penguin-a", svg: penguin(false) },
        { name: "penguin-b", svg: penguin(true) },
      ],
      sounds: ["cicit"],
    },
    {
      id: "katak",
      name: "Katak",
      nameEn: "Frog",
      category: "hewan",
      tags: ["lompat", "kolam", "hijau"],
      costumes: [
        { name: "katak-a", svg: frog(false) },
        { name: "katak-b", svg: frog(true) },
      ],
      sounds: ["boing"],
    },
    {
      id: "kura-kura",
      name: "Kura-kura",
      nameEn: "Turtle",
      category: "hewan",
      tags: ["lambat", "cangkang", "pantai"],
      costumes: [
        { name: "kura-kura-a", svg: turtle(false) },
        { name: "kura-kura-b", svg: turtle(true) },
      ],
      sounds: ["pop"],
    },
    {
      id: "budi",
      name: "Budi",
      nameEn: "Budi",
      category: "orang",
      tags: ["anak", "laki-laki", "teman", "cerita", "kid", "boy"],
      costumes: [
        { name: "budi-a", svg: kid("#4c97ff", "#3b2a1a", false, false) },
        { name: "budi-b", svg: kid("#4c97ff", "#3b2a1a", false, true) },
      ],
      sounds: ["tada"],
    },
    {
      id: "rani",
      name: "Rani",
      nameEn: "Rani",
      category: "orang",
      tags: ["anak", "perempuan", "teman", "cerita", "kid", "girl"],
      costumes: [
        { name: "rani-a", svg: kid("#ff6680", "#2a1f17", true, false) },
        { name: "rani-b", svg: kid("#ff6680", "#2a1f17", true, true) },
      ],
      sounds: ["tada"],
    },
    {
      id: "suit",
      name: "Suit Tangan",
      nameEn: "Rock Paper Scissors",
      category: "ai",
      tags: ["batu", "gunting", "kertas", "tangan", "ai", "game", "rock", "paper", "scissors"],
      costumes: [
        { name: "batu", svg: hand("batu") },
        { name: "gunting", svg: hand("gunting") },
        { name: "kertas", svg: hand("kertas") },
      ],
      sounds: ["tepuk"],
    },
    {
      id: "wajah-emosi",
      name: "Wajah Emosi",
      nameEn: "Emotion Face",
      category: "ai",
      tags: ["senang", "sedih", "kaget", "marah", "perasaan", "ekspresi", "ai", "emoji"],
      costumes: [
        { name: "senang", svg: face("senang") },
        { name: "sedih", svg: face("sedih") },
        { name: "kaget", svg: face("kaget") },
        { name: "marah", svg: face("marah") },
        { name: "biasa", svg: face("biasa") },
      ],
      sounds: ["pop"],
    },
    {
      id: "lampu-lalu-lintas",
      name: "Lampu Lalu Lintas",
      nameEn: "Traffic Light",
      category: "ai",
      tags: ["merah", "kuning", "hijau", "jalan", "warna", "ai"],
      costumes: [
        { name: "merah", svg: trafficLight(0) },
        { name: "kuning", svg: trafficLight(1) },
        { name: "hijau", svg: trafficLight(2) },
      ],
      sounds: ["beep"],
    },
    {
      id: "tempat-sampah",
      name: "Tempat Sampah",
      nameEn: "Trash Bin",
      category: "ai",
      tags: ["organik", "anorganik", "pilah", "lingkungan", "ai", "daur ulang"],
      costumes: [
        { name: "organik", svg: trashBin(true) },
        { name: "anorganik", svg: trashBin(false) },
      ],
      sounds: ["benar"],
    },
    ...letterSprites(),
  ];
}
