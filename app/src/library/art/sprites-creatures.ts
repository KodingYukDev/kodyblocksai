/** Sprite makhluk orisinal (gaya datar KodyBlocks). */
import type { SpriteArt } from "./art-types";
import { arc, circle, ellipse, eyes, f, group, path, poly, rect, shade, svgDoc } from "./svg-kit";

const INK = "#1f2a44";

function fish(color: string, tail: number): string {
  const body = ellipse(52, 40, 32, 22, { fill: color, stroke: shade(color, -0.35), sw: 2.5 });
  const t = poly(
    [
      [22, 40],
      [4, 24 + tail],
      [4, 56 - tail],
    ],
    { fill: shade(color, -0.15), stroke: shade(color, -0.35), sw: 2.5 },
  );
  const fin = path(`M50 ${f(20)}Q58 ${f(8 + tail)} 66 ${f(22)}Z`, { fill: shade(color, -0.15), stroke: shade(color, -0.35), sw: 2 });
  return svgDoc(90, 80, t + fin + body + circle(68, 35, 6, { fill: "#fff", stroke: INK, sw: 1.5 }) + circle(70, 35, 3, { fill: INK }) + path(arc(70, 46, 6, 20, 120), { stroke: INK, sw: 2 }));
}

function bird(wingUp: boolean): string {
  const wing = wingUp
    ? path("M40 44Q30 10 58 22Q56 36 40 44Z", { fill: "#ff8c1a", stroke: "#b85c00", sw: 2 })
    : path("M40 44Q34 74 60 60Q56 48 40 44Z", { fill: "#ff8c1a", stroke: "#b85c00", sw: 2 });
  return svgDoc(
    100,
    80,
    ellipse(48, 46, 30, 22, { fill: "#ffbf00", stroke: "#b88600", sw: 2.5 }) +
      poly(
        [
          [76, 40],
          [94, 46],
          [76, 52],
        ],
        { fill: "#ff661a", stroke: "#b84400", sw: 2 },
      ) +
      poly(
        [
          [20, 40],
          [4, 30],
          [8, 50],
        ],
        { fill: "#ffab19", stroke: "#b88600", sw: 2 },
      ) +
      wing +
      circle(66, 38, 5, { fill: "#fff", stroke: INK, sw: 1.5 }) +
      circle(67.5, 38, 2.5, { fill: INK }),
  );
}

function butterfly(open: boolean): string {
  const sx = open ? 1 : 0.45;
  const wings =
    ellipse(30, 30, 22, 18, { fill: "#cf63cf", stroke: "#8a2f8a", sw: 2 }) +
    ellipse(30, 58, 16, 13, { fill: "#ff6680", stroke: "#8a2f8a", sw: 2 }) +
    circle(28, 30, 6, { fill: "#ffd43b" });
  const left = group(wings, `translate(50 0) scale(${f(sx)} 1) translate(-50 0)`);
  const right = group(wings, `translate(50 0) scale(${f(-sx)} 1) translate(-50 0)`);
  return svgDoc(
    100,
    84,
    left +
      right +
      ellipse(50, 44, 5, 24, { fill: INK }) +
      path("M48 22Q40 6 34 8M52 22Q60 6 66 8", { stroke: INK, sw: 2 }),
  );
}

function ghost(happy: boolean): string {
  const mouth = happy ? path(arc(40, 46, 8, 20, 160), { stroke: INK, sw: 2.5 }) : ellipse(40, 50, 5, 7, { fill: INK });
  return svgDoc(
    80,
    90,
    path("M8 84V38A32 32 0 0 1 72 38V84L62 74L52 84L40 74L28 84L18 74Z", { fill: "#f4f7ff", stroke: "#9aa7c7", sw: 3 }) +
      ellipse(28, 34, 5, 7, { fill: INK }) +
      ellipse(52, 34, 5, 7, { fill: INK }) +
      mouth,
  );
}

function crab(clawUp: boolean): string {
  const c = "#ff661a";
  const s = shade(c, -0.35);
  const claw = (x: number, dir: number): string =>
    group(
      path(`M${f(x)} 40L${f(x + dir * 14)} 22`, { stroke: s, sw: 4 }) +
        path(`M${f(x + dir * 14)} 22m-9 -2a10 10 0 1 0 18 0l-9 4z`, { fill: c, stroke: s, sw: 2 }),
      clawUp ? `rotate(${dir * -12} ${f(x)} 40)` : undefined,
    );
  let legs = "";
  for (let i = 0; i < 3; i++) legs += path(`M${30 - i * 2} ${54 + i * 4}L${12 - i * 2} ${62 + i * 6}M${70 + i * 2} ${54 + i * 4}L${88 + i * 2} ${62 + i * 6}`, { stroke: s, sw: 3 });
  return svgDoc(100, 84, legs + claw(28, -1) + claw(72, 1) + ellipse(50, 54, 30, 20, { fill: c, stroke: s, sw: 2.5 }) + eyes(42, 58, 36, 5) + path(arc(50, 58, 8, 30, 150), { stroke: INK, sw: 2 }));
}

function dino(step: boolean): string {
  const g = "#59c059";
  const s = shade(g, -0.4);
  const legA = rect(36, 70, 10, step ? 18 : 22, { fill: g, stroke: s, sw: 2 }, 3);
  const legB = rect(58, 70, 10, step ? 22 : 18, { fill: g, stroke: s, sw: 2 }, 3);
  return svgDoc(
    120,
    96,
    legA +
      legB +
      path("M20 66Q2 60 4 46Q16 58 30 56Z", { fill: g, stroke: s, sw: 2 }) +
      ellipse(52, 58, 30, 18, { fill: g, stroke: s, sw: 2.5 }) +
      path("M70 50Q76 20 92 18Q114 18 112 34Q110 44 92 44L82 48Z", { fill: g, stroke: s, sw: 2.5 }) +
      poly(
        [
          [40, 41],
          [46, 32],
          [52, 40],
          [58, 31],
          [64, 41],
        ],
        { fill: "#ffab19", stroke: "#b87400", sw: 1.5 },
      ) +
      circle(98, 28, 4, { fill: "#fff", stroke: INK, sw: 1.2 }) +
      circle(99, 28, 2, { fill: INK }) +
      path("M96 38L110 37", { stroke: s, sw: 2 }),
  );
}

function bee(wingUp: boolean): string {
  const wing = (x: number): string => ellipse(x, wingUp ? 16 : 22, 10, 14, { fill: "#e8f6ff", stroke: "#8fb8d8", sw: 1.5, opacity: 0.9 });
  return svgDoc(
    90,
    70,
    wing(38) +
      wing(54) +
      ellipse(45, 42, 30, 20, { fill: "#ffd43b", stroke: INK, sw: 2.5 }) +
      rect(32, 23, 8, 38, { fill: INK }) +
      rect(48, 23, 8, 38, { fill: INK }) +
      poly(
        [
          [15, 42],
          [5, 38],
          [5, 46],
        ],
        { fill: INK },
      ) +
      circle(64, 38, 3.5, { fill: INK }) +
      path(arc(64, 46, 5, 20, 140), { stroke: INK, sw: 1.8 }),
  );
}

function dog(tailUp: boolean): string {
  const b = "#c98a4b";
  const s = shade(b, -0.4);
  return svgDoc(
    110,
    96,
    path(tailUp ? "M22 52Q8 30 14 22" : "M22 56Q6 60 6 72", { stroke: s, sw: 6 }) +
      rect(26, 44, 54, 30, { fill: b, stroke: s, sw: 2.5 }, 14) +
      rect(30, 68, 10, 22, { fill: b, stroke: s, sw: 2 }, 4) +
      rect(66, 68, 10, 22, { fill: b, stroke: s, sw: 2 }, 4) +
      circle(80, 36, 20, { fill: b, stroke: s, sw: 2.5 }) +
      ellipse(66, 30, 7, 14, { fill: shade(b, -0.25), stroke: s, sw: 2 }) +
      ellipse(94, 30, 7, 14, { fill: shade(b, -0.25), stroke: s, sw: 2 }) +
      ellipse(80, 44, 9, 7, { fill: "#f3d9bd" }) +
      circle(80, 40, 3.5, { fill: INK }) +
      circle(73, 32, 3, { fill: INK }) +
      circle(87, 32, 3, { fill: INK }),
  );
}

function cat(blink: boolean): string {
  const c = "#9aa7c7";
  const s = "#4b5675";
  const eye = (x: number): string => (blink ? path(`M${x - 4} 40Q${x} 44 ${x + 4} 40`, { stroke: INK, sw: 2 }) : ellipse(x, 40, 3.5, 5, { fill: INK }));
  return svgDoc(
    100,
    100,
    path("M70 82Q96 80 88 54", { stroke: s, sw: 6 }) +
      ellipse(50, 74, 24, 20, { fill: c, stroke: s, sw: 2.5 }) +
      poly(
        [
          [28, 30],
          [30, 8],
          [44, 22],
        ],
        { fill: c, stroke: s, sw: 2.5 },
      ) +
      poly(
        [
          [72, 30],
          [70, 8],
          [56, 22],
        ],
        { fill: c, stroke: s, sw: 2.5 },
      ) +
      circle(50, 40, 24, { fill: c, stroke: s, sw: 2.5 }) +
      eye(41) +
      eye(59) +
      poly(
        [
          [47, 48],
          [53, 48],
          [50, 52],
        ],
        { fill: "#ff6680" },
      ) +
      path("M30 50L42 52M30 56L42 55M70 50L58 52M70 56L58 55", { stroke: s, sw: 1.2 }),
  );
}

export function creatureSprites(): SpriteArt[] {
  return [
    {
      id: "ikan",
      name: "Ikan",
      nameEn: "Fish",
      category: "hewan",
      tags: ["laut", "air", "berenang"],
      costumes: [
        { name: "ikan-a", svg: fish("#4c97ff", 0) },
        { name: "ikan-b", svg: fish("#4c97ff", 6) },
        { name: "ikan-c", svg: fish("#ff8c1a", 3) },
      ],
      sounds: ["gelembung"],
    },
    {
      id: "burung",
      name: "Burung",
      nameEn: "Bird",
      category: "hewan",
      tags: ["terbang", "sayap"],
      costumes: [
        { name: "burung-a", svg: bird(true) },
        { name: "burung-b", svg: bird(false) },
      ],
      sounds: ["cicit"],
    },
    {
      id: "kupu-kupu",
      name: "Kupu-kupu",
      nameEn: "Butterfly",
      category: "hewan",
      tags: ["terbang", "serangga", "taman"],
      costumes: [
        { name: "kupu-kupu-a", svg: butterfly(true) },
        { name: "kupu-kupu-b", svg: butterfly(false) },
      ],
      sounds: ["sihir"],
    },
    {
      id: "hantu",
      name: "Hantu",
      nameEn: "Ghost",
      category: "fantasi",
      tags: ["seram", "halloween"],
      costumes: [
        { name: "hantu-a", svg: ghost(true) },
        { name: "hantu-b", svg: ghost(false) },
      ],
      sounds: ["whoosh"],
    },
    {
      id: "kepiting",
      name: "Kepiting",
      nameEn: "Crab",
      category: "hewan",
      tags: ["laut", "pantai"],
      costumes: [
        { name: "kepiting-a", svg: crab(false) },
        { name: "kepiting-b", svg: crab(true) },
      ],
      sounds: ["klik"],
    },
    {
      id: "dino",
      name: "Dino",
      nameEn: "Dino",
      category: "hewan",
      tags: ["dinosaurus", "purba"],
      costumes: [
        { name: "dino-a", svg: dino(false) },
        { name: "dino-b", svg: dino(true) },
      ],
      sounds: ["auman"],
    },
    {
      id: "lebah",
      name: "Lebah",
      nameEn: "Bee",
      category: "hewan",
      tags: ["serangga", "terbang", "madu"],
      costumes: [
        { name: "lebah-a", svg: bee(true) },
        { name: "lebah-b", svg: bee(false) },
      ],
      sounds: ["dengung"],
    },
    {
      id: "anjing",
      name: "Anjing",
      nameEn: "Dog",
      category: "hewan",
      tags: ["peliharaan"],
      costumes: [
        { name: "anjing-a", svg: dog(true) },
        { name: "anjing-b", svg: dog(false) },
      ],
      sounds: ["guk"],
    },
    {
      id: "kucing-abu",
      name: "Kucing Abu",
      nameEn: "Gray Cat",
      category: "hewan",
      tags: ["peliharaan", "kucing"],
      costumes: [
        { name: "kucing-abu-a", svg: cat(false) },
        { name: "kucing-abu-b", svg: cat(true) },
      ],
      sounds: ["meong"],
    },
  ];
}
