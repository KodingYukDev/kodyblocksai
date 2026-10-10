/**
 * Maskot Kody (milik KodingYuk, dari KodyBlocks) beserta varian warna, pose, dan aksesori.
 * Sumber gambar: app/src/assets/kody.svg (100x100, 6 warna). Varian dibuat dengan menukar
 * palet dan membungkus isi dengan transformasi/aksesori; bentuk asli tidak diubah.
 */
import kodyRaw from "../../assets/kody.svg?raw";
import type { CostumeArt, SpriteArt } from "./art-types";
import { circle, ellipse, f, path, poly, rect, starPoints, svgDoc } from "./svg-kit";

/** Palet asli Kody. */
export const KODY_PALETTE = {
  ink: "#17345f",
  body: "#2b8ee6",
  green: "#6ec664",
  accent: "#f17352",
  yellow: "#ffd43b",
  white: "#ffffff",
} as const;

export type KodyPalette = { [K in keyof typeof KODY_PALETTE]: string };

/** Isi <svg> Kody tanpa tag pembungkus. */
export function kodyInner(raw: string = kodyRaw): string {
  const open = raw.indexOf(">", raw.indexOf("<svg"));
  const close = raw.lastIndexOf("</svg>");
  if (open < 0 || close < 0) throw new Error("kody.svg tidak sah");
  return raw.slice(open + 1, close).trim();
}

/** Tukar warna palet (pencocokan fill="#xxxxxx" persis, tidak peka huruf besar). */
export function recolor(inner: string, palette: Partial<KodyPalette>): string {
  let out = inner;
  const map = new Map<string, string>();
  for (const key of Object.keys(KODY_PALETTE) as (keyof KodyPalette)[]) {
    const to = palette[key];
    if (to) map.set(KODY_PALETTE[key].toLowerCase(), to);
  }
  out = out.replace(/(fill|stroke)="(#[0-9a-fA-F]{6})"/g, (m, attr: string, hex: string) => {
    const to = map.get(hex.toLowerCase());
    return to ? `${attr}="${to}"` : m;
  });
  return out;
}

type Pose = "stand" | "tilt" | "jump" | "wave";

function pose(inner: string, p: Pose): string {
  switch (p) {
    case "tilt":
      return `<g transform="rotate(-8 50 60)">${inner}</g>`;
    case "jump":
      return `<g transform="translate(0 -4) translate(50 50) scale(0.96 1.04) translate(-50 -50)">${inner}</g>`;
    case "wave":
      return `<g transform="rotate(6 50 60)">${inner}</g>`;
    default:
      return inner;
  }
}

/** Kostum Kody 100x100 (pusat rotasi 50,50 agar konsisten dengan sprite default KodyBlocks). */
export function kodyCostume(name: string, palette: Partial<KodyPalette>, p: Pose, accessory = ""): CostumeArt {
  const body = pose(recolor(kodyInner(), palette) + accessory, p);
  if (!accessory) return { name, svg: svgDoc(100, 100, body), center: [50, 50] };
  // Ruang ekstra 16 di atas untuk topi/mahkota supaya tidak terpotong viewBox.
  return { name, svg: svgDoc(100, 116, `<g transform="translate(0 16)">${body}</g>`), center: [50, 66] };
}

const partyHat = (c1: string, c2: string): string =>
  poly(
    [
      [38, 8],
      [44, -14],
      [52, 6],
    ],
    { fill: c1, stroke: KODY_PALETTE.ink, sw: 1.2 },
  ) +
  path(`M${f(40)} ${f(1)}L${f(49)} ${f(-1)}`, { stroke: c2, sw: 2 }) +
  circle(44, -14, 3, { fill: c2 });

const glasses = (): string =>
  rect(29, 31, 18, 10, { fill: "#1f2a44", opacity: 0.88 }, 3) +
  rect(53, 31, 18, 10, { fill: "#1f2a44", opacity: 0.88 }, 3) +
  path("M47 35L53 35", { stroke: "#1f2a44", sw: 2 });

const helmet = (): string =>
  ellipse(50, 38, 34, 32, { fill: "#bfe6ff", opacity: 0.35, stroke: "#dfe7f2", sw: 3 }) + rect(30, 66, 40, 6, { fill: "#dfe7f2" }, 3);

const crown = (): string =>
  poly(
    [
      [36, 6],
      [38, -8],
      [44, -1],
      [50, -10],
      [56, -1],
      [62, -8],
      [64, 6],
    ],
    { fill: "#ffd43b", stroke: "#b8860b", sw: 1.2 },
  ) + circle(50, -3, 2, { fill: "#f17352" });

const sparkle = (x: number, y: number, s: number, c: string): string => poly(starPoints(x, y, s, s * 0.4, 4, 0), { fill: c });

interface KodyVariant {
  id: string;
  name: string;
  nameEn: string;
  palette: Partial<KodyPalette>;
  accessory?: string;
  tags: string[];
}

const VARIANTS: KodyVariant[] = [
  { id: "kody", name: "Kody", nameEn: "Kody", palette: {}, tags: ["maskot", "robot", "kodingyuk"] },
  { id: "kody-merah", name: "Kody Merah", nameEn: "Red Kody", palette: { body: "#e5484d", yellow: "#ffb224" }, tags: ["maskot", "merah"] },
  { id: "kody-hijau", name: "Kody Hijau", nameEn: "Green Kody", palette: { body: "#30a46c", green: "#ffd43b" }, tags: ["maskot", "hijau"] },
  { id: "kody-ungu", name: "Kody Ungu", nameEn: "Purple Kody", palette: { body: "#8e4ec6", yellow: "#ff8dc7" }, tags: ["maskot", "ungu"] },
  {
    id: "kody-malam",
    name: "Kody Malam",
    nameEn: "Night Kody",
    palette: { body: "#3e4a6b", yellow: "#7ce2fe", white: "#d8e3ff" },
    accessory: sparkle(82, 14, 6, "#ffe066") + sparkle(14, 26, 4, "#ffe066"),
    tags: ["maskot", "malam", "gelap"],
  },
  {
    id: "kody-pesta",
    name: "Kody Pesta",
    nameEn: "Party Kody",
    palette: {},
    accessory: partyHat("#ff6680", "#ffd43b"),
    tags: ["maskot", "pesta", "ulang tahun"],
  },
  { id: "kody-keren", name: "Kody Keren", nameEn: "Cool Kody", palette: { body: "#0fbd8c" }, accessory: glasses(), tags: ["maskot", "kacamata"] },
  {
    id: "kody-astronot",
    name: "Kody Astronot",
    nameEn: "Astronaut Kody",
    palette: { body: "#dfe7f2", accent: "#4c97ff" },
    accessory: helmet(),
    tags: ["maskot", "luar angkasa", "astronot"],
  },
  { id: "kody-raja", name: "Kody Raja", nameEn: "King Kody", palette: { body: "#ffab19", yellow: "#ffffff" }, accessory: crown(), tags: ["maskot", "raja", "mahkota"] },
];

export function kodySprites(): SpriteArt[] {
  return VARIANTS.map((v, i) => ({
    id: v.id,
    name: v.name,
    nameEn: v.nameEn,
    category: "kody",
    tags: v.tags,
    costumes: [
      kodyCostume(`${v.id}-a`, v.palette, "stand", v.accessory ?? ""),
      kodyCostume(`${v.id}-b`, v.palette, i % 2 === 0 ? "jump" : "tilt", v.accessory ?? ""),
      kodyCostume(`${v.id}-c`, v.palette, "wave", v.accessory ?? ""),
    ],
    sounds: [i % 3 === 0 ? "pop" : i % 3 === 1 ? "boing" : "chime"],
  }));
}
