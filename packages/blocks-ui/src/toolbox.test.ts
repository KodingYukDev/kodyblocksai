import { describe, expect, it } from "vitest";
import type { VariableType } from "@kody/engine";
import { blockDefinitions } from "./blocks/definitions";
import { getDefaultRegistry } from "./blocks/registry";
import { buildFlyoutContent } from "./flyout/content";
import { makeDefaultToolbox } from "./toolbox";
import type { BlockDefinition, ToolboxCategory } from "./types";
import { sequentialIds } from "./workspace/ids";

const defs = new Map<string, BlockDefinition>(blockDefinitions(getDefaultRegistry(), "en").map((d) => [d.opcode, d]));
const lookup = (op: string): BlockDefinition | undefined => defs.get(op);

const opcodes = (cat: ToolboxCategory | undefined): string[] => (cat?.blocks ?? []).flatMap((b) => ("opcode" in b ? [b.opcode] : []));

function flyout(cats: ToolboxCategory[]) {
  return buildFlyoutContent(cats, {
    lookup,
    locale: "en",
    targetId: "spr",
    isStage: false,
    newId: sequentialIds("f"),
    variables: (_t: VariableType) => [],
    procedures: [],
    dynamicOptions: () => null,
  });
}

describe("makeDefaultToolbox (make-toolbox-xml.js)", () => {
  it("urutan kategori & warna Scratch", () => {
    const tb = makeDefaultToolbox(false, "spr", { locale: "en" });
    expect(tb.map((c) => c.id)).toEqual(["motion", "looks", "sound", "events", "control", "sensing", "operators", "variables", "myBlocks"]);
    expect(tb.map((c) => c.colours.primary)).toEqual(["#4C97FF", "#9966FF", "#CF63CF", "#FFBF00", "#FFAB19", "#5CB1D6", "#59C059", "#FF8C1A", "#FF6680"]);
    expect(tb.map((c) => c.name)).toEqual(["Motion", "Looks", "Sound", "Events", "Control", "Sensing", "Operators", "Variables", "My Blocks"]);
  });

  it("isi sprite vs stage seperti scratch-gui", () => {
    const sprite = makeDefaultToolbox(false, "spr", { locale: "en" });
    const stage = makeDefaultToolbox(true, "stage", { locale: "en" });
    expect(opcodes(sprite[0])).toEqual([
      "motion_movesteps", "motion_turnright", "motion_turnleft", "motion_goto", "motion_gotoxy", "motion_glideto",
      "motion_glidesecstoxy", "motion_pointindirection", "motion_pointtowards", "motion_changexby", "motion_setx",
      "motion_changeyby", "motion_sety", "motion_ifonedgebounce", "motion_setrotationstyle", "motion_xposition",
      "motion_yposition", "motion_direction",
    ]);
    expect(stage[0]?.blocks).toEqual([{ label: "Stage selected: no motion blocks" }]);
    expect(opcodes(stage[1])).not.toContain("looks_say");
    expect(opcodes(stage[1])).toContain("looks_switchbackdroptoandwait");
    expect(opcodes(stage[3])).toContain("event_whenstageclicked");
    expect(opcodes(sprite[4])).toEqual([
      "control_wait", "control_repeat", "control_forever", "control_if", "control_if_else", "control_wait_until",
      "control_repeat_until", "control_stop", "control_start_as_clone", "control_create_clone_of", "control_delete_this_clone",
    ]);
    expect(opcodes(stage[4])).not.toContain("control_start_as_clone");
    expect(opcodes(sprite[6])).toHaveLength(18);
  });

  it("gap pemisah 36 pada blok sebelum <sep>", () => {
    const motion = makeDefaultToolbox(false, "spr")[0]!.blocks;
    const gaps = motion.map((b) => ("opcode" in b ? (b.gap ?? 0) : 0));
    expect(gaps).toEqual([0, 0, 36, 0, 0, 0, 36, 0, 36, 0, 0, 0, 36, 36, 36, 0, 0, 0]);
  });

  it("nilai default: Hello!, costume/backdrop/sound dari target, posisi sprite, field kosong tetap kosong", () => {
    const tb = makeDefaultToolbox(false, "spr", { locale: "en", costumeName: "c2", backdropName: "bd", soundName: "Meow", x: 12.4, y: -7.6 });
    const c = flyout(tb);
    const find = (op: string) => Object.values(c.blocks).find((b) => b.opcode === op && b.topLevel)!;
    const shadowOf = (op: string, input: string) => c.blocks[find(op).inputs[input]!.shadow!]!;
    expect(shadowOf("looks_say", "MESSAGE").fields.TEXT?.value).toBe("Hello!");
    expect(shadowOf("looks_switchcostumeto", "COSTUME").fields.COSTUME?.value).toBe("c2");
    expect(shadowOf("looks_switchbackdropto", "BACKDROP").fields.BACKDROP?.value).toBe("bd");
    expect(shadowOf("sound_play", "SOUND_MENU").fields.SOUND_MENU?.value).toBe("Meow");
    expect(shadowOf("motion_gotoxy", "X").fields.NUM?.value).toBe("12");
    expect(shadowOf("motion_gotoxy", "Y").fields.NUM?.value).toBe("-8");
    expect(shadowOf("operator_add", "NUM1").fields.NUM?.value).toBe("");
    expect(shadowOf("operator_join", "STRING1").fields.TEXT?.value).toBe("apple ");
    expect(shadowOf("control_wait", "DURATION").opcode).toBe("math_positive_number");
  });

  it("label kategori bahasa Indonesia resmi scratch-l10n", () => {
    expect(makeDefaultToolbox(false, "s").map((c) => c.name).slice(0, 3)).toEqual(["Gerakan", "Tampilan", "Suara"]);
  });
});
