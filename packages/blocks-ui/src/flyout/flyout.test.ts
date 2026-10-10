import { describe, expect, it } from "vitest";
import type { VariableType } from "@kody/engine";
import { CATEGORY_COLOURS } from "../colours";
import type { ToolboxCategory } from "../types";
import { sequentialIds } from "../workspace/ids";
import { approxMeasure } from "../workspace/layout";
import { partsToProcedure } from "../workspace/procedures";
import { testDeps, testLookup } from "../workspace/testing/fixtures";
import type { VarModel } from "../workspace/variables";
import { buildFlyoutContent, CATEGORY_GAP, flyoutBlockId, type FlyoutBuildContext } from "./content";
import { categoryAtScroll, FLYOUT_MARGIN, FLYOUT_SCALE, layoutFlyout, scrollTargetForCategory, stepScroll } from "./layout";

const VARS: Record<VariableType, VarModel[]> = {
  "": [
    { id: "v2", name: "skor", type: "", isLocal: false, isCloud: false },
    { id: "v1", name: "my variable", type: "", isLocal: false, isCloud: false },
  ],
  list: [{ id: "l1", name: "daftar", type: "list", isLocal: true, isCloud: false }],
  broadcast_msg: [],
};

function ctx(extra: Partial<FlyoutBuildContext> = {}): FlyoutBuildContext {
  return {
    lookup: testLookup,
    locale: "en",
    targetId: "spr1",
    isStage: false,
    newId: sequentialIds("f"),
    variables: (t) => VARS[t],
    procedures: [],
    dynamicOptions: () => null,
    ...extra,
  };
}

const MOTION: ToolboxCategory = {
  id: "motion",
  name: "Motion",
  colours: CATEGORY_COLOURS.motion,
  blocks: [
    { opcode: "motion_movesteps", inputs: { STEPS: { shadow: "math_number", field: "NUM", value: 10 } } },
    { opcode: "motion_turnright", inputs: { DEGREES: { shadow: "math_number", field: "NUM", value: 15 } }, gap: 36 },
    { opcode: "motion_xposition" },
  ],
};

describe("isi palet", () => {
  it("label kategori di atas, shadow default, id monitor make-toolbox-xml, gap kategori 36", () => {
    const c = buildFlyoutContent([MOTION], ctx());
    expect(c.items.map((i) => i.kind)).toEqual(["label", "block", "block", "block"]);
    expect(c.sections).toEqual([{ categoryId: "motion", name: "Motion", colours: CATEGORY_COLOURS.motion, iconURI: undefined, itemIndex: 0 }]);
    const move = c.items[1];
    expect(move?.kind === "block" && c.blocks[move.rootId]?.inputs.STEPS).toBeTruthy();
    const shadowId = move?.kind === "block" ? c.blocks[move.rootId]?.inputs.STEPS?.shadow : null;
    expect(shadowId && c.blocks[shadowId]).toMatchObject({ opcode: "math_number", shadow: true, fields: { NUM: { name: "NUM", value: "10" } } });
    const xpos = c.items[3];
    expect(xpos).toMatchObject({ kind: "block", rootId: "spr1_xposition", checkbox: true, gap: CATEGORY_GAP });
    expect(c.items[2]).toMatchObject({ gap: 36 });
    expect(flyoutBlockId("looks_backdropnumbername", "x")).toBe("backdropnumbername");
  });

  it("kategori Variables = DataCategory (tombol, variabel urut, blok set/change/show/hide, list)", () => {
    const vars: ToolboxCategory = { id: "variables", name: "Variables", colours: CATEGORY_COLOURS.data, blocks: [], custom: "VARIABLE" };
    const c = buildFlyoutContent([vars], ctx());
    const desc = c.items.map((i) => (i.kind === "block" ? `${c.blocks[i.rootId]?.opcode}:${i.gap}` : `${i.kind}:${i.kind === "button" ? i.callbackKey : i.text}`));
    expect(desc.slice(0, 8)).toEqual([
      "label:Variables",
      "button:CREATE_VARIABLE",
      "data_variable:8",
      "data_variable:24",
      "data_setvariableto:8",
      "data_changevariableby:8",
      "data_showvariable:8",
      "data_hidevariable:8",
    ]);
    expect(desc[8]).toBe("button:CREATE_LIST");
    expect(desc.slice(9)).toEqual([
      "data_listcontents:24",
      "data_addtolist:36",
      "data_deleteoflist:8",
      "data_deletealloflist:8",
      "data_insertatlist:8",
      "data_replaceitemoflist:36",
      "data_itemoflist:8",
      "data_itemnumoflist:8",
      "data_lengthoflist:8",
      "data_listcontainsitem:36",
      "data_showlist:8",
      `data_hidelist:${CATEGORY_GAP}`,
    ]);
    // Variabel data_variable memakai id variabel (sinkron monitor) dan diurutkan sesuai input ctx.
    const first = c.items[2];
    expect(first?.kind === "block" && first.rootId).toBe("v2");
    const set = c.items[4];
    expect(set?.kind === "block" && c.blocks[set.rootId]?.fields.VARIABLE).toEqual({ name: "VARIABLE", value: "skor", id: "v2", variableType: "" });
  });

  it("kategori My Blocks: tombol + procedures_call per procedure", () => {
    const my: ToolboxCategory = { id: "myBlocks", name: "My Blocks", colours: CATEGORY_COLOURS.more, blocks: [], custom: "PROCEDURE" };
    const proc = partsToProcedure([{ kind: "label", text: "lompat" }, { kind: "input", argType: "s", name: "n", id: "A" }], false);
    const c = buildFlyoutContent([my], ctx({ procedures: [proc] }));
    expect(c.items[1]).toMatchObject({ kind: "button", callbackKey: "CREATE_PROCEDURE" });
    const call = c.items[2];
    expect(call?.kind === "block" && c.blocks[call.rootId]?.mutation?.proccode).toBe("lompat %s");
  });
});

describe("tata letak palet & scroll kategori", () => {
  const cats: ToolboxCategory[] = [MOTION, { ...MOTION, id: "looks", name: "Looks", blocks: [{ opcode: "motion_xposition" }] }];
  const content = buildFlyoutContent(cats, ctx());
  const layout = layoutFlyout(content, testDeps(content.blocks), approxMeasure);

  it("posisi label kategori dan checkbox", () => {
    expect(layout.categoryPositions[0]).toEqual({ categoryId: "motion", position: FLYOUT_MARGIN });
    const second = layout.categoryPositions[1]!;
    expect(second.position).toBeGreaterThan(FLYOUT_MARGIN + 40);
    const xpos = layout.placed.find((p) => p.item.kind === "block" && p.item.rootId === "spr1_xposition")!;
    expect(xpos.checkbox?.x).toBe(FLYOUT_MARGIN);
    expect(xpos.x).toBe(FLYOUT_MARGIN + 25 + 12);
  });

  it("scroll ke kategori & kategori terpilih dari posisi scroll", () => {
    const second = layout.categoryPositions[1]!;
    const target = scrollTargetForCategory(layout, "looks", 600)!;
    expect(target).toBeCloseTo(second.position * FLYOUT_SCALE);
    expect(categoryAtScroll(layout, target)).toBe("looks");
    expect(categoryAtScroll(layout, target - 5)).toBe("motion");
    expect(stepScroll(0, 100)).toBeCloseTo(30);
    expect(stepScroll(99.5, 100)).toBeNull();
  });
});
