import { describe, expect, it } from "vitest";
import { CORE_OPCODES, SHADOW_OPCODES, type ExtensionInfo } from "@kody/engine";
import { BlockRegistry, blockDefinitions, convertExtension, getMessages, msg, resolveMessage, toBlockDefinition, tokenizeInterpolation } from "./index";

describe("pesan", () => {
  it("terjemahan resmi Scratch id + fallback en", () => {
    expect(msg("MOTION_MOVESTEPS", "id")).toBe("gerak %1 langkah");
    expect(msg("MOTION_MOVESTEPS", "en")).toBe("move %1 steps");
    expect(msg("CATEGORY_MOTION", "id")).toBe("Gerakan");
    expect(msg("TIDAK_ADA", "id")).toBe("TIDAK_ADA");
    for (const k of Object.keys(getMessages("en"))) expect(typeof getMessages("id")[k]).toBe("string");
  });

  it("resolveMessage & tokenizeInterpolation (port Blockly.utils)", () => {
    expect(resolveMessage("%{BKY_CONTROL_FOREVER}", "id")).toBe("selamanya");
    expect(tokenizeInterpolation("move %1 steps")).toEqual(["move ", 1, " steps"]);
    expect(tokenizeInterpolation("100%% %12x")).toEqual(["100% ", 12, "x"]);
    expect(tokenizeInterpolation("%a")).toEqual(["%a"]);
  });
});

describe("registri core", () => {
  const reg = new BlockRegistry();

  it("memuat SEMUA opcode core + shadow katalog engine", () => {
    const missing = [...CORE_OPCODES, ...SHADOW_OPCODES].map((s) => s.opcode).filter((o) => !reg.has(o));
    expect(missing).toEqual([]);
  });

  it("semua pesan terselesaikan di kedua bahasa (tidak ada token %{BKY_ tersisa)", () => {
    for (const locale of ["id", "en"] as const) {
      for (const def of blockDefinitions(reg, locale)) {
        for (const m of def.messages) expect(m, `${def.opcode} ${locale}`).not.toContain("%{BKY_");
        for (const line of def.args)
          for (const a of line)
            if (a.type === "field_dropdown" && Array.isArray(a.options))
              for (const [t] of a.options) expect(t, def.opcode).not.toContain("%{BKY_");
      }
    }
  });

  it("BlockDefinition memakai bentuk & kategori katalog engine", () => {
    const defs = new Map(blockDefinitions(reg, "id").map((d) => [d.opcode, d]));
    for (const spec of [...CORE_OPCODES, ...SHADOW_OPCODES]) {
      expect(defs.get(spec.opcode)?.shape).toBe(spec.shape);
      expect(defs.get(spec.opcode)?.category).toBe(spec.category);
    }
    const ifElse = defs.get("control_if_else");
    expect(ifElse?.messages).toEqual(["jika %1", "%1", "jika tidak", "%1"]);
    expect(defs.get("event_whenflagclicked")?.isHat).toBe(true);
    expect(defs.get("operator_and")?.output).toBe("Boolean");
    expect(defs.get("motion_xposition")?.checkboxInFlyout).toBe(true);
  });

  it("control_stop override: dropdown STOP_OPTION 3 opsi", () => {
    const d = toBlockDefinition("control_stop", reg.get("control_stop")!, "id");
    expect(d.shape).toBe("cap");
    const arg = d.args[0]?.[0];
    expect(arg?.type === "field_dropdown" && Array.isArray(arg.options) ? arg.options.map((o) => o[1]) : null).toEqual([
      "all",
      "this script",
      "other scripts in sprite",
    ]);
  });
});

describe("convertExtension (port runtime._convertForScratchBlocks)", () => {
  const info: ExtensionInfo = {
    id: "aiHand",
    name: "Tangan AI",
    color1: "#0FBD8C",
    color2: "#0DA57A",
    color3: "#0B8E69",
    blockIconURI: "data:image/svg+xml;base64,QQ==",
    menus: {
      GESTURE: { acceptReporters: true, items: [{ text: "jempol", value: "thumb" }, "peace"] },
      AXIS: { items: ["x", "y"] },
      DYN: { items: "getDyn" },
    },
    blocks: [
      { opcode: "videoToggle", blockType: "command", text: "kamera [STATE]", arguments: { STATE: { type: "string", menu: "DYN" } } },
      "---",
      { opcode: "handCount", blockType: "reporter", text: "jumlah tangan" },
      { opcode: "landmark", blockType: "reporter", text: "posisi [AXIS] titik [N]", arguments: { AXIS: { type: "string", menu: "AXIS", defaultValue: "x" }, N: { type: "number", defaultValue: 8 } } },
      { opcode: "isGesture", blockType: "Boolean", text: "gestur [G]?", arguments: { G: { type: "string", menu: "GESTURE", defaultValue: "thumb" } } },
      { opcode: "whenGesture", blockType: "hat", text: "ketika gestur [G]", arguments: { G: { type: "string", menu: "GESTURE" } } },
      { opcode: "loopIt", blockType: "loop", text: "ulangi" },
      { opcode: "secret", blockType: "command", text: "rahasia", hideFromPalette: true },
      { opcode: "stageOnly", blockType: "command", text: "panggung", filter: ["stage"] },
    ],
  };
  const conv = convertExtension(info, { isStage: false, resolveDynamicMenu: () => ["nyala", { text: "mati", value: "off" }] });

  it("blok command dengan ikon + separator, argumen dinomori lanjut", () => {
    expect(conv.blocks.aiHand_landmark).toEqual({
      inputsInline: true,
      category: "Tangan AI",
      colour: "#0FBD8C",
      colourSecondary: "#0DA57A",
      colourTertiary: "#0B8E69",
      extensions: ["scratch_extension"],
      message0: "%1 %2posisi %3 titik %4",
      args0: [
        { type: "field_image", src: "data:image/svg+xml;base64,QQ==", width: 40, height: 40 },
        { type: "field_vertical_separator" },
        { type: "field_dropdown", name: "AXIS", options: [["x", "x"], ["y", "y"]] },
        { type: "input_value", name: "N" },
      ],
      output: "String",
      outputShape: 2,
    });
  });

  it("menu acceptReporters jadi shadow bulat, lainnya kotak; menu dinamis di-resolve", () => {
    expect(conv.blocks.aiHand_menu_GESTURE?.outputShape).toBe(2);
    expect(conv.blocks.aiHand_menu_AXIS?.outputShape).toBe(3);
    expect(conv.blocks.aiHand_menu_GESTURE?.args0?.[0]?.options).toEqual([["jempol", "thumb"], ["peace", "peace"]]);
    expect(conv.blocks.aiHand_videoToggle?.args0?.[2]).toEqual({ type: "field_dropdown", name: "STATE", options: [["nyala", "nyala"], ["mati", "off"]] });
  });

  it("checkbox monitor hanya reporter tanpa argumen; hat tanpa previous; loop punya ikon kanan", () => {
    expect(conv.blocks.aiHand_handCount?.checkboxInFlyout).toBe(true);
    expect(conv.blocks.aiHand_landmark?.checkboxInFlyout).toBeUndefined();
    expect(conv.blocks.aiHand_whenGesture?.previousStatement).toBeUndefined();
    expect(conv.blocks.aiHand_whenGesture?.nextStatement).toBeNull();
    expect(conv.blocks.aiHand_loopIt?.message1).toBe("%1");
    expect(conv.blocks.aiHand_loopIt?.lastDummyAlign2).toBe("RIGHT");
    expect(conv.blocks.aiHand_isGesture?.outputShape).toBe(1);
  });

  it("palet: shadow default, pemisah, hideFromPalette & filter", () => {
    const ops = conv.palette.map((p) => ("separator" in p ? "---" : p.opcode));
    expect(ops).toEqual(["aiHand_videoToggle", "---", "aiHand_handCount", "aiHand_landmark", "aiHand_isGesture", "aiHand_whenGesture", "aiHand_loopIt"]);
    const landmark = conv.palette.find((p) => !("separator" in p) && p.opcode === "aiHand_landmark");
    expect(landmark && !("separator" in landmark) ? landmark.inputs : null).toEqual({ N: { shadow: "math_number", field: "NUM", value: "8" } });
    expect(landmark && !("separator" in landmark) ? landmark.fields : null).toEqual({ AXIS: "x" });
    expect(conv.blocks.aiHand_secret).toBeDefined();
  });

  it("registerExtension menambah definisi ke registri; definisi kontrak berkategori ai", () => {
    const reg = new BlockRegistry();
    reg.registerExtension(info);
    const d = toBlockDefinition("aiHand_isGesture", reg.get("aiHand_isGesture")!, "id");
    expect(d.category).toBe("ai");
    expect(d.shape).toBe("boolean");
    expect(d.iconURI).toBe("data:image/svg+xml;base64,QQ==");
    expect(d.colours?.primary).toBe("#0FBD8C");
  });
});
