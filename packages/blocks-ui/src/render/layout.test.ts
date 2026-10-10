import { describe, expect, it } from "vitest";
import { layoutRenderBlock, type BlockLayout, type RenderBlock, type TextMeasurer } from "./index";

/** Pengukur deterministik = fallback Blockly.Field.getCachedWidth (8 px per karakter). */
const m8: TextMeasurer = { measure: (t) => t.length * 8 };
const L = (rb: RenderBlock): BlockLayout => layoutRenderBlock(rb, { locale: "en", measurer: m8 });

const num = (v: string | number): RenderBlock => ({ opcode: "math_number", shadow: true, fields: { NUM: v } });

const NOTCH_L = "c 2,0 3,1 4,2 l 4,4 c 1,1 2,2 4,2 h 12 c 2,0 3,-1 4,-2 l 4,-4 c 1,-1 2,-2 4,-2";
const NOTCH_R = "c -2,0 -3,1 -4,2 l -4,4 c -1,1 -2,2 -4,2 h -12 c -2,0 -3,-1 -4,-2 l -4,-4 c -1,-1 -2,-2 -4,-2";

describe("layout stack block (motion_movesteps)", () => {
  const l = L({ opcode: "motion_movesteps", inputs: { STEPS: num("10") } });

  it("ukuran & path persis renderDraw_", () => {
    expect(l.width).toBe(144);
    expect(l.height).toBe(56);
    expect(l.path).toBe(
      `m 0,4 A 4,4 0 0,1 4,0 H 12 ${NOTCH_L} H 140 a 4,4 0 0,1 4,4 v 40  a 4,4 0 0,1 -4,4 H 48   ${NOTCH_R} H 4 a 4,4 0 0,1 -4,-4 z`,
    );
    expect(l.shapes).toBe("stack");
  });

  it("posisi label & shadow angka", () => {
    expect(l.fields.map((f) => [f.field.text, f.x, f.y])).toEqual([
      ["move", 8, 24],
      ["steps", 96, 24],
    ]);
    const child = l.children[0];
    expect(child?.kind).toBe("value");
    expect([child?.x, child?.y, child?.layout.width, child?.layout.height]).toEqual([48, 8, 40, 32]);
    expect(child?.layout.path).toBe("m 0,0 m 16,0 H 24 a 16 16 0 0 1 0 32 H 16 a 16 16 0 0 1 0 -32 z");
    expect(child?.layout.shapes).toBe("argument round");
  });

  it("shadow teks panjang melebar (min 40)", () => {
    const long = L({ opcode: "motion_movesteps", inputs: { STEPS: num("123456") } });
    // 6*8 + 6 padding editable + 8 + 8 = 70
    expect(long.children[0]?.layout.width).toBe(70);
    expect(long.width).toBe(144 + 30);
  });
});

describe("reporter bulat & boolean heksagon", () => {
  it("operator_add kosong", () => {
    const l = L({ opcode: "operator_add" });
    expect(l.width).toBe(128);
    expect(l.height).toBe(40);
    expect(l.path).toBe("m 0,0 m 20,0 H 108 a 20 20 0 0 1 0 40 H 20 a 20 20 0 0 1 0 -40 z");
    expect(l.inputShapes.map((s) => [s.argType, s.x, s.y])).toEqual([
      ["round", 4, 4],
      ["round", 76, 4],
    ]);
    expect(l.shapes).toBe("reporter round");
  });

  it("operator_add bersarang: padding & tinggi naik", () => {
    const l = L({ opcode: "operator_add", inputs: { NUM1: { opcode: "operator_add" } } });
    expect(l.height).toBe(48);
    expect(l.width).toBe(208);
    expect(l.path).toBe("m 0,0 m 24,0 H 184 a 24 24 0 0 1 0 48 H 24 a 24 24 0 0 1 0 -48 z");
    expect([l.children[0]?.x, l.children[0]?.y]).toEqual([4, 4]);
  });

  it("operator_and kosong (heksagon dalam heksagon)", () => {
    const l = L({ opcode: "operator_and" });
    expect(l.width).toBe(152);
    expect(l.path).toBe("m 0,0 m 20,0 H 132 l 20 20 l -20 20 H 20 l -20 -20 l 20 -20 z");
    expect(l.inputShapes.map((s) => [s.argType, s.x])).toEqual([
      ["boolean", 8],
      ["boolean", 96],
    ]);
    expect(l.shapes).toBe("reporter boolean");
  });

  it("operator_lt: bulat dalam heksagon padding 5 grid", () => {
    const l = L({ opcode: "operator_lt" });
    expect(l.width).toBe(160);
    expect(l.inputShapes.map((s) => s.x)).toEqual([20, 92]);
  });

  it("data_variable: label CENTRE, lebar minimum 48", () => {
    const short = L({ opcode: "data_variable", fields: { VARIABLE: "a" } });
    expect(short.width).toBe(48);
    expect(short.fields[0]?.x).toBe(20);
    const long = L({ opcode: "data_variable", fields: { VARIABLE: "skor" } });
    expect(long.width).toBe(56);
    expect(long.path).toBe("m 0,0 m 20,0 H 36 a 20 20 0 0 1 0 40 H 20 a 20 20 0 0 1 0 -40 z");
  });
});

describe("C/E block, cap, hat", () => {
  it("control_if kosong", () => {
    const l = L({ opcode: "control_if" });
    expect(l.width).toBe(160);
    expect(l.height).toBe(112);
    expect(l.path).toBe(
      `m 0,4 A 4,4 0 0,1 4,0 H 12 ${NOTCH_L} H 156 a 4,4 0 0,1 4,4 v 40  a 4,4 0 0,1 -4,4 H 64 ${NOTCH_R} h -8  a 4,4 0 0,0 -4,4 v 16 ` +
        `a 4,4 0 0,0 4,4 h  8 ${NOTCH_L} H 156 a 4,4 0 0,1 4,4 v 24  a 4,4 0 0,1 -4,4 H 48   ${NOTCH_R} H 4 a 4,4 0 0,1 -4,-4 z`,
    );
    expect(l.inputShapes).toEqual([expect.objectContaining({ argType: "boolean", x: 48, y: 8 })]);
    expect(l.shapes).toBe("c-block c-1");
  });

  it("control_if berisi 2 blok: tinggi = 48 + isi - takik + 32 + 8", () => {
    const inner: RenderBlock = { opcode: "motion_movesteps", inputs: { STEPS: num(1) }, next: { opcode: "motion_movesteps", inputs: { STEPS: num(1) } } };
    const l = L({ opcode: "control_if", inputs: { SUBSTACK: inner } });
    const sub = l.children.find((c) => c.kind === "statement");
    expect([sub?.x, sub?.y]).toEqual([16, 48]);
    expect(sub?.layout.stackHeight).toBe(56 + 56 - 8);
    expect(l.height).toBe(48 + 96 + 32 + 8);
  });

  it("control_if_else: dua mulut + baris else", () => {
    const l = L({ opcode: "control_if_else" });
    expect(l.height).toBe(48 + 24 + 32 + 24 + 32 + 8);
    expect(l.shapes).toBe("c-block c-2");
    expect(l.fields.map((f) => f.field.text)).toContain("else");
  });

  it("control_forever: tanpa takik bawah, ikon panah rata kanan", () => {
    const l = L({ opcode: "control_forever" });
    expect(l.height).toBe(104);
    expect(l.shapes).toBe("c-block c-1 end");
    const icon = l.fields.find((f) => f.field.kind === "image");
    expect([icon?.x, icon?.y]).toEqual([128, 76]);
    expect(l.path.endsWith("H 4 a 4,4 0 0,1 -4,-4 z")).toBe(true);
    expect(l.path).not.toContain("H 48   c -2,0");
  });

  it("isi C yang diakhiri cap tidak menggambar takik dalam bawah", () => {
    const l = L({ opcode: "control_forever", inputs: { SUBSTACK: { opcode: "control_delete_this_clone" } } });
    // 48 (cap tanpa takik) tanpa dikurangi NOTCH_HEIGHT
    expect(l.height).toBe(48 + 48 + 32);
  });

  it("control_stop: cap dengan dropdown berkotak; hasnext menambah takik", () => {
    const cap = L({ opcode: "control_stop", fields: { STOP_OPTION: "all" } });
    expect(cap.width).toBe(122);
    expect(cap.height).toBe(48);
    expect(cap.shapes).toBe("stack end");
    expect(cap.fields[1]?.size).toEqual({ width: 66, height: 32, arrowWidth: 20, box: true });
    const other = L({ opcode: "control_stop", fields: { STOP_OPTION: "other scripts in sprite" }, mutation: { hasnext: "true" } });
    expect(other.height).toBe(56);
    expect(other.shapes).toBe("stack");
  });

  it("hat event_whenflagclicked", () => {
    const l = L({ opcode: "event_whenflagclicked" });
    expect(l.width).toBe(144);
    expect(l.height).toBe(56);
    expect(l.startHat).toBe(true);
    expect(l.path.startsWith("m 0,0 c 25,-22 71,-22 96,0 H 140 a 4,4 0 0,1 4,4 v 40")).toBe(true);
    expect(l.fields.map((f) => [f.field.kind, f.x, f.y])).toEqual([
      ["label", 8, 24],
      ["image", 48, 12],
      ["label", 80, 24],
    ]);
    expect(l.shapes).toBe("hat");
  });

  it("hat pendek tetap selebar minimal 100", () => {
    const l = L({ opcode: "control_start_as_clone" });
    expect(l.width).toBeGreaterThanOrEqual(100);
  });
});

describe("My Blocks", () => {
  it("define + prototype tanpa argumen", () => {
    const l = L({
      opcode: "procedures_definition",
      inputs: { custom_block: { opcode: "procedures_prototype", shadow: true, mutation: { proccode: "jump", argumentids: "[]" } } },
    });
    expect(l.height).toBe(72);
    expect(l.width).toBe(160);
    expect(l.path).toBe(
      `m 0, 0 a 20,20 0 0,1 20,-20 H 116 a 20,20 0 0,1 20,20 v 60  a 4,4 0 0,1 -4,4 H 48   ${NOTCH_R} H 4 a 4,4 0 0,1 -4,-4 z`,
    );
    const proto = l.children[0];
    expect([proto?.x, proto?.y, proto?.layout.width, proto?.layout.height]).toEqual([64, 0, 64, 56]);
  });

  it("procedures_call: label + slot dari proccode, %b heksagon", () => {
    const l = L({
      opcode: "procedures_call",
      mutation: { proccode: "lompat %s kali %b", argumentids: '["a1","a2"]' },
      inputs: { a1: { opcode: "text", shadow: true, fields: { TEXT: "x" } } },
    });
    expect(l.fields.map((f) => f.field.text)).toEqual(["lompat", "kali"]);
    expect(l.inputShapes.map((s) => s.argType)).toEqual(["boolean"]);
    expect(l.children.filter((c) => c.kind === "value").map((c) => c.inputName)).toEqual(["a1"]);
  });

  it("argument reporter shadow digambar sebagai reporter (bukan field tunggal)", () => {
    const l = L({ opcode: "argument_reporter_string_number", shadow: true, fields: { VALUE: "n" } });
    expect(l.height).toBe(40);
    expect(l.width).toBe(48);
  });
});

describe("blok tak dikenal & data tak tepercaya", () => {
  it("opcode asing dirender sebagai blok perintah berlabel opcode", () => {
    const l = L({ opcode: "foo_bar" });
    expect(l.block.unknown).toBe(true);
    expect(l.fields[0]?.field.text).toBe("foo_bar");
    expect(l.height).toBe(56);
  });

  it("tumpukan sangat panjang tidak meledak", () => {
    let top: RenderBlock = { opcode: "looks_show" };
    for (let i = 0; i < 1500; i++) top = { opcode: "looks_show", next: top };
    const l = L(top);
    expect(l.stackHeight).toBe(1501 * 48 + 8);
  });
});
