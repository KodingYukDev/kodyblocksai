/** Sprite benda orisinal (gaya datar KodyBlocks). */
import type { CostumeArt, SpriteArt } from "./art-types";
import { arc, circle, ellipse, eyes, f, group, line, path, poly, rect, shade, starPoints, svgDoc } from "./svg-kit";

const INK = "#1f2a44";

const ball = (c: string): string =>
  svgDoc(60, 60, circle(30, 30, 26, { fill: c, stroke: shade(c, -0.35), sw: 3 }) + ellipse(21, 20, 7, 5, { fill: "#ffffff", opacity: 0.55 }));

function soccer(rot: number): string {
  let patches = "";
  for (let i = 0; i < 5; i++) {
    const a = ((rot + i * 72 - 90) * Math.PI) / 180;
    patches += circle(32 + 20 * Math.cos(a), 32 + 20 * Math.sin(a), 6, { fill: INK });
  }
  return svgDoc(64, 64, circle(32, 32, 28, { fill: "#ffffff", stroke: INK, sw: 3 }) + poly(starPoints(32, 32, 9, 9, 5, rot - 90), { fill: INK }) + patches);
}

const star = (c: string, rot: number): string =>
  svgDoc(80, 80, poly(starPoints(40, 42, 36, 16, 5, rot - 90), { fill: c, stroke: shade(c, -0.35), sw: 3 }) + eyes(33, 47, 40, 4));

const heart = (s: number, c: string): string =>
  svgDoc(
    80,
    72,
    group(
      path("M40 66C10 46 4 32 4 22A16 16 0 0 1 40 16A16 16 0 0 1 76 22C76 32 70 46 40 66Z", { fill: c, stroke: shade(c, -0.35), sw: 3 }) +
        ellipse(22, 22, 6, 4, { fill: "#fff", opacity: 0.5 }),
      `translate(40 36) scale(${f(s)}) translate(-40 -36)`,
    ),
  );

function rocket(flame: number): string {
  const fl = flame
    ? path(`M30 96Q40 ${f(110 + flame)} 50 96Z`, { fill: "#ffab19", stroke: "#ff661a", sw: 2 }) + path(`M35 96Q40 ${f(104 + flame / 2)} 45 96Z`, { fill: "#ffe066" })
    : "";
  return svgDoc(
    80,
    120,
    fl +
      path("M24 70L8 92L28 88Z", { fill: "#ff6680", stroke: "#a3364d", sw: 2 }) +
      path("M56 70L72 92L52 88Z", { fill: "#ff6680", stroke: "#a3364d", sw: 2 }) +
      path("M40 4C58 20 60 52 56 96H24C20 52 22 20 40 4Z", { fill: "#e9f1fc", stroke: "#575e75", sw: 3 }) +
      circle(40, 46, 10, { fill: "#4c97ff", stroke: "#575e75", sw: 3 }) +
      path("M28 22Q40 10 52 22", { fill: "#ff6680", stroke: "#575e75", sw: 2 }),
    undefined,
  );
}

function robot(armUp: boolean): string {
  const c = "#5cb1d6";
  const s = shade(c, -0.45);
  const armL = armUp ? path("M20 58L6 34", { stroke: s, sw: 6 }) : path("M20 58L8 78", { stroke: s, sw: 6 });
  return svgDoc(
    100,
    120,
    line(50, 14, 50, 4, { stroke: s, sw: 3 }) +
      circle(50, 4, 4, { fill: "#ff6680" }) +
      rect(26, 14, 48, 36, { fill: c, stroke: s, sw: 3 }, 8) +
      circle(40, 30, 6, { fill: "#ffffff", stroke: s, sw: 2 }) +
      circle(60, 30, 6, { fill: "#ffffff", stroke: s, sw: 2 }) +
      circle(40, 30, 3, { fill: INK }) +
      circle(60, 30, 3, { fill: INK }) +
      rect(40, 40, 20, 4, { fill: s }, 2) +
      armL +
      path("M80 58L92 78", { stroke: s, sw: 6 }) +
      rect(20, 52, 60, 40, { fill: c, stroke: s, sw: 3 }, 6) +
      circle(50, 70, 8, { fill: "#ffbf00", stroke: s, sw: 2 }) +
      rect(30, 92, 12, 22, { fill: s }, 3) +
      rect(58, 92, 12, 22, { fill: s }, 3),
  );
}

const tree = (c: string): string =>
  svgDoc(
    100,
    130,
    rect(42, 80, 16, 46, { fill: "#8b5a2b", stroke: "#5c3a1a", sw: 2 }, 3) +
      circle(50, 50, 34, { fill: c, stroke: shade(c, -0.35), sw: 3 }) +
      circle(30, 70, 18, { fill: c, stroke: shade(c, -0.35), sw: 3 }) +
      circle(70, 70, 18, { fill: c, stroke: shade(c, -0.35), sw: 3 }),
  );

const apple = (c: string, bite: boolean): string =>
  svgDoc(
    70,
    76,
    path("M35 18C20 8 4 18 6 40C8 62 22 74 35 68C48 74 62 62 64 40C66 18 50 8 35 18Z", { fill: c, stroke: shade(c, -0.35), sw: 3 }) +
      (bite ? circle(64, 40, 10, { fill: "#ffffff" }) : "") +
      path("M35 18Q34 8 40 2", { stroke: "#5c3a1a", sw: 3 }) +
      path("M38 10Q50 0 56 10Q46 14 38 10Z", { fill: "#59c059", stroke: "#2f7a2f", sw: 1.5 }),
  );

function car(phase: number): string {
  const wheel = (x: number): string => {
    const a = (phase * Math.PI) / 4;
    return circle(x, 58, 12, { fill: INK }) + circle(x, 58, 5, { fill: "#d9e3f2" }) + line(x + 9 * Math.cos(a), 58 + 9 * Math.sin(a), x - 9 * Math.cos(a), 58 - 9 * Math.sin(a), { stroke: "#d9e3f2", sw: 2 });
  };
  return svgDoc(
    130,
    74,
    path("M8 56V40Q10 32 22 30L40 12H86L104 30Q122 32 124 42V56Z", { fill: "#ff661a", stroke: "#a33d00", sw: 3 }) +
      path("M46 18H64V30H34Z", { fill: "#bfe6ff", stroke: "#a33d00", sw: 2 }) +
      path("M70 18H84L96 30H70Z", { fill: "#bfe6ff", stroke: "#a33d00", sw: 2 }) +
      rect(112, 38, 10, 6, { fill: "#ffe066" }, 2) +
      wheel(34) +
      wheel(98),
  );
}

const ufo = (lightsOn: boolean): string => {
  let lights = "";
  for (let i = 0; i < 5; i++) lights += circle(26 + i * 17, 52, 4, { fill: (i % 2 === 0) === lightsOn ? "#ffe066" : "#ff6680" });
  return svgDoc(
    120,
    80,
    ellipse(60, 30, 24, 22, { fill: "#bfe6ff", stroke: "#575e75", sw: 3, opacity: 0.9 }) +
      ellipse(60, 50, 56, 16, { fill: "#9966ff", stroke: "#4b2a99", sw: 3 }) +
      lights +
      circle(60, 28, 8, { fill: "#59c059" }) +
      circle(57, 26, 2, { fill: INK }) +
      circle(63, 26, 2, { fill: INK }),
  );
};

function sun(rot: number): string {
  let rays = "";
  for (let i = 0; i < 12; i++) {
    const a = ((rot + i * 30) * Math.PI) / 180;
    rays += line(50 + 34 * Math.cos(a), 50 + 34 * Math.sin(a), 50 + 46 * Math.cos(a), 50 + 46 * Math.sin(a), { stroke: "#ffab19", sw: 5 });
  }
  return svgDoc(100, 100, rays + circle(50, 50, 28, { fill: "#ffd43b", stroke: "#ffab19", sw: 3 }) + eyes(41, 59, 46, 4) + path(arc(50, 54, 10, 20, 160), { stroke: INK, sw: 2.5 }));
}

const cloud = (c: string): string =>
  svgDoc(
    140,
    80,
    path("M30 70A20 20 0 0 1 28 32A26 26 0 0 1 76 20A24 24 0 0 1 116 36A18 18 0 0 1 114 70Z", { fill: c, stroke: shade(c, -0.2), sw: 3 }),
  );

const button = (pressed: boolean): string =>
  svgDoc(
    120,
    56,
    (pressed ? "" : rect(6, 10, 108, 42, { fill: "#2f7a2f" }, 14)) +
      rect(6, pressed ? 10 : 4, 108, 42, { fill: pressed ? "#4aa84a" : "#59c059", stroke: "#2f7a2f", sw: 3 }, 14) +
      poly(
        [
          [50, pressed ? 18 : 12],
          [50, pressed ? 44 : 38],
          [72, pressed ? 31 : 25],
        ],
        { fill: "#ffffff" },
      ),
  );

const arrow = (c: string): string =>
  svgDoc(
    100,
    60,
    poly(
      [
        [4, 20],
        [60, 20],
        [60, 4],
        [96, 30],
        [60, 56],
        [60, 40],
        [4, 40],
      ],
      { fill: c, stroke: shade(c, -0.35), sw: 3 },
    ),
  );

const pencil = (c: string): string =>
  svgDoc(
    40,
    130,
    rect(8, 20, 24, 82, { fill: c, stroke: shade(c, -0.4), sw: 2.5 }) +
      rect(8, 6, 24, 16, { fill: "#ff99aa", stroke: "#a3364d", sw: 2.5 }, 4) +
      rect(8, 18, 24, 6, { fill: "#d9e3f2", stroke: "#575e75", sw: 1.5 }) +
      poly(
        [
          [8, 102],
          [32, 102],
          [20, 126],
        ],
        { fill: "#f3d9bd", stroke: "#8b5a2b", sw: 2.5 },
      ) +
      poly(
        [
          [16, 118],
          [24, 118],
          [20, 126],
        ],
        { fill: INK },
      ),
  );

function flower(c: string): string {
  let petals = "";
  for (let i = 0; i < 6; i++) petals += group(ellipse(50, 22, 10, 16, { fill: c, stroke: shade(c, -0.35), sw: 2 }), `rotate(${i * 60} 50 40)`);
  return svgDoc(100, 130, path("M50 56Q46 96 50 126", { stroke: "#2f7a2f", sw: 5 }) + path("M50 96Q30 80 22 92Q36 104 50 100Z", { fill: "#59c059", stroke: "#2f7a2f", sw: 2 }) + petals + circle(50, 40, 12, { fill: "#ffd43b", stroke: "#b88600", sw: 2 }), undefined);
}

const gem = (c: string): string =>
  svgDoc(
    80,
    70,
    poly(
      [
        [16, 4],
        [64, 4],
        [78, 22],
        [40, 66],
        [2, 22],
      ],
      { fill: c, stroke: shade(c, -0.4), sw: 3 },
    ) + path("M2 22H78M16 4L28 22L40 66L52 22L64 4M28 22L40 4L52 22", { stroke: shade(c, -0.4), sw: 1.5, opacity: 0.7 }),
  );

const cupcake = (c: string): string =>
  svgDoc(
    80,
    90,
    path("M14 46H66L58 86H22Z", { fill: "#ffab19", stroke: "#b87400", sw: 2.5 }) +
      path("M26 48L30 86M40 48V86M54 48L50 86", { stroke: "#b87400", sw: 1.5 }) +
      path("M10 48Q8 26 28 24Q34 6 50 14Q72 14 70 48Z", { fill: c, stroke: shade(c, -0.3), sw: 2.5 }) +
      circle(46, 8, 6, { fill: "#e5484d" }) +
      circle(24, 36, 2, { fill: "#ffffff" }) +
      circle(52, 30, 2, { fill: "#4c97ff" }) +
      circle(38, 40, 2, { fill: "#ffd43b" }),
  );

const balloon = (c: string): string =>
  svgDoc(60, 120, path("M30 74Q24 96 34 116", { stroke: "#575e75", sw: 2 }) + ellipse(30, 38, 26, 34, { fill: c, stroke: shade(c, -0.35), sw: 2.5 }) + poly([[26, 72], [34, 72], [30, 78]], { fill: shade(c, -0.35) }) + ellipse(20, 24, 5, 9, { fill: "#fff", opacity: 0.5 }));

const gift = (c: string, open: boolean): string =>
  svgDoc(
    90,
    100,
    rect(10, 46, 70, 50, { fill: c, stroke: shade(c, -0.35), sw: 3 }, 4) +
      rect(40, 46, 10, 50, { fill: "#ffd43b" }) +
      group(rect(4, 32, 82, 16, { fill: shade(c, 0.15), stroke: shade(c, -0.35), sw: 3 }, 4) + rect(40, 32, 10, 16, { fill: "#ffd43b" }) + path("M45 32Q30 10 24 22Q28 32 45 32Q60 10 66 22Q62 32 45 32Z", { fill: "#ffd43b", stroke: "#b88600", sw: 2 }), open ? "rotate(-18 4 48) translate(0 -8)" : undefined),
  );

function cs(prefix: string, svgs: string[]): CostumeArt[] {
  return svgs.map((svg, i) => ({ name: `${prefix}-${String.fromCharCode(97 + i)}`, svg }));
}

export function objectSprites(): SpriteArt[] {
  const s = (id: string, name: string, nameEn: string, category: string, tags: string[], svgs: string[], sounds: string[]): SpriteArt => ({
    id,
    name,
    nameEn,
    category,
    tags,
    costumes: cs(id, svgs),
    sounds,
  });
  return [
    s("bola", "Bola", "Ball", "olahraga", ["bulat", "mainan"], [ball("#4c97ff"), ball("#ff6680"), ball("#ffbf00"), ball("#59c059")], ["boing"]),
    s("bola-sepak", "Bola Sepak", "Soccer Ball", "olahraga", ["sepak bola", "futsal"], [soccer(0), soccer(36)], ["tendang"]),
    s("bintang", "Bintang", "Star", "benda", ["langit", "hadiah"], [star("#ffd43b", 0), star("#ffd43b", 18)], ["sihir"]),
    s("hati", "Hati", "Heart", "benda", ["cinta", "nyawa", "game"], [heart(1, "#e5484d"), heart(0.85, "#e5484d"), heart(1, "#ff6680")], ["pop"]),
    s("roket", "Roket", "Rocket", "transportasi", ["luar angkasa", "terbang"], [rocket(0), rocket(10), rocket(18)], ["roket"]),
    s("robot", "Robot", "Robot", "fantasi", ["mesin", "teknologi"], [robot(false), robot(true)], ["robot-bip"]),
    s("pohon", "Pohon", "Tree", "alam", ["taman", "hutan"], [tree("#59c059"), tree("#ffab19")], ["angin"]),
    s("apel", "Apel", "Apple", "makanan", ["buah"], [apple("#e5484d", false), apple("#e5484d", true), apple("#59c059", false)], ["kriuk"]),
    s("mobil", "Mobil", "Car", "transportasi", ["kendaraan", "balap"], [car(0), car(1), car(2)], ["klakson"]),
    s("ufo", "UFO", "UFO", "fantasi", ["luar angkasa", "alien"], [ufo(true), ufo(false)], ["laser"]),
    s("matahari", "Matahari", "Sun", "alam", ["langit", "siang"], [sun(0), sun(15)], ["chime"]),
    s("awan", "Awan", "Cloud", "alam", ["langit", "cuaca"], [cloud("#ffffff"), cloud("#c9d3e3")], ["angin"]),
    s("tombol", "Tombol Mulai", "Start Button", "antarmuka", ["tombol", "menu", "game"], [button(false), button(true)], ["klik"]),
    s("panah", "Panah", "Arrow", "antarmuka", ["arah", "petunjuk"], [arrow("#4c97ff"), arrow("#ff661a")], ["klik"]),
    s("pensil", "Pensil", "Pencil", "benda", ["sekolah", "menggambar"], [pencil("#ffbf00"), pencil("#4c97ff")], ["klik"]),
    s("bunga", "Bunga", "Flower", "alam", ["taman"], [flower("#ff6680"), flower("#9966ff"), flower("#ffffff")], ["chime"]),
    s("permata", "Permata", "Gem", "benda", ["hadiah", "game", "koin"], [gem("#0fbd8c"), gem("#4c97ff"), gem("#e5484d")], ["koin"]),
    s("kue", "Kue Mangkuk", "Cupcake", "makanan", ["ulang tahun", "manis"], [cupcake("#ff99c8"), cupcake("#a0e7ff")], ["tada"]),
    s("balon", "Balon", "Balloon", "benda", ["pesta", "terbang"], [balloon("#e5484d"), balloon("#4c97ff"), balloon("#ffd43b")], ["pop"]),
    s("hadiah", "Kotak Hadiah", "Gift Box", "benda", ["pesta", "ulang tahun"], [gift("#9966ff", false), gift("#9966ff", true)], ["tada"]),
  ];
}
