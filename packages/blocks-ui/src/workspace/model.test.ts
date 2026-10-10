import { describe, expect, it } from "vitest";
import type { Block } from "@kody/engine";
import { getBlockInfo, splitProccode } from "./block-info";
import { cleanUpEvents, orderedTopBlocks } from "./cleanup";
import { genUid, sequentialIds } from "./ids";
import { connectionsOf, layoutBlock, layoutStack, MIN_BLOCK_Y } from "./layout";
import { createCallBlocks, createDefinitionBlocks, partsToProcedure, procedureToParts } from "./procedures";
import { chain, cmdWithNumber, testDeps, testLookup } from "./testing/fixtures";
import { mk } from "./testing/vm-blocks";
import { CLOUD_PREFIX, DELETE_VARIABLE_ID, NEW_BROADCAST_MESSAGE_ID, RENAME_VARIABLE_ID, resolveBroadcastName, validateVariableName, variableDropdownOptions, type VarModel } from "./variables";
import { applyWheel, clampScroll, resetZoom, zoomAt, ZOOM_OPTIONS, type Viewport } from "./viewport";
import { numberRestrictor } from "./actions";
import { statementPath } from "./paths";

describe("BlockInfo & layout", () => {
  it("bentuk sambungan per jenis blok", () => {
    const hat = getBlockInfo(mk("h", "event_whenflagclicked"), testLookup);
    expect([hat.hasPrevious, hat.hasNext, hat.output]).toEqual([false, true, false]);
    const forever = getBlockInfo(mk("f", "control_forever"), testLookup);
    expect([forever.hasPrevious, forever.hasNext, forever.statementInputs]).toEqual([true, false, ["SUBSTACK"]]);
    const stop = getBlockInfo(mk("s", "control_stop", { mutation: { tagName: "mutation", children: [], hasnext: "true" } }), testLookup);
    expect(stop.hasNext).toBe(true);
    const stopAll = getBlockInfo(mk("s", "control_stop", { mutation: { tagName: "mutation", children: [], hasnext: "false" } }), testLookup);
    expect(stopAll.hasNext).toBe(false);
    const and = getBlockInfo(mk("a", "operator_and"), testLookup);
    expect(and.output).toEqual(["Boolean"]);
    expect(and.outputShape).toBe("hexagon");
  });

  it("ukuran minimum dan posisi sambungan sesuai konstanta scratch-blocks", () => {
    const blocks: Record<string, Block> = {};
    for (const b of cmdWithNumber("m", "motion_movesteps", "STEPS", 10, { topLevel: true, x: 0, y: 0 })) blocks[b.id] = b;
    blocks.f = mk("f", "control_forever", { topLevel: true, x: 0, y: 200 });
    const deps = testDeps(blocks);
    const m = layoutBlock(deps, "m");
    expect(m.height).toBe(MIN_BLOCK_Y);
    const shadow = layoutBlock(deps, "m_s", true);
    expect([shadow.height, shadow.width]).toEqual([32, 40]);
    const conns = connectionsOf(blocks, { layout: m, x: 0, y: 0 });
    expect(conns.map((c) => `${c.type}@${c.x},${c.y}`)).toEqual(["previous@0,0", "next@0,48", `input@${m.elements.find((e) => e.kind === "input")!.x},8`]);
    const f = layoutBlock(deps, "f");
    expect(f.width).toBe(160);
    expect(f.height).toBe(48 + 24 + 24);
    const fc = connectionsOf(blocks, { layout: f, x: 0, y: 200 });
    expect(fc.find((c) => c.type === "statement")).toMatchObject({ x: 16, y: 248 });
    expect(statementPath(f)).toContain("c -2,0 -3,1 -4,2");
  });

  it("splitProccode persis createAllInputs_", () => {
    expect(splitProccode("jump %s high %b now")).toEqual([
      { label: "jump", argType: null },
      { label: "", argType: "s" },
      { label: "high", argType: null },
      { label: "", argType: "b" },
      { label: "now", argType: null },
    ]);
    expect(splitProccode("100\\% sure")).toEqual([{ label: "100% sure", argType: null }]);
  });
});

describe("Procedure blocks", () => {
  it("mutation & blok define/call seperti scratch-blocks", () => {
    const proc = partsToProcedure(
      [
        { kind: "label", text: "lompat 50%" },
        { kind: "input", argType: "s", name: "tinggi", id: "A" },
        { kind: "input", argType: "b", name: "cepat", id: "B" },
      ],
      true,
    );
    expect(proc).toEqual({ proccode: "lompat 50\\% %s %b", argumentIds: ["A", "B"], argumentNames: ["tinggi", "cepat"], argumentDefaults: ["", "false"], warp: true });
    const def = createDefinitionBlocks(proc, sequentialIds("d"), { x: 30, y: 40 });
    expect(def.map((b) => b.opcode)).toEqual(["procedures_definition", "procedures_prototype", "argument_reporter_string_number", "argument_reporter_boolean"]);
    const proto = def[1]!;
    expect(proto.shadow).toBe(true);
    expect(proto.mutation).toMatchObject({ proccode: "lompat 50\\% %s %b", argumentids: '["A","B"]', argumentnames: '["tinggi","cepat"]', argumentdefaults: '["","false"]', warp: "true" });
    expect(def[0]!.inputs.custom_block).toEqual({ name: "custom_block", block: proto.id, shadow: proto.id });
    const call = createCallBlocks(proc, sequentialIds("c"));
    expect(call.map((b) => b.opcode)).toEqual(["procedures_call", "text"]);
    expect(call[0]!.mutation).toEqual({ tagName: "mutation", children: [], proccode: "lompat 50\\% %s %b", argumentids: '["A","B"]', warp: "true" });
    expect(call[0]!.inputs.B).toBeUndefined();
    expect(procedureToParts(proc)).toEqual([
      { kind: "label", text: "lompat 50%" },
      { kind: "input", argType: "s", name: "tinggi", id: "A" },
      { kind: "input", argType: "b", name: "cepat", id: "B" },
    ]);
  });
});

describe("Variabel", () => {
  const vars: VarModel[] = [
    { id: "v1", name: "skor", type: "", isLocal: false, isCloud: false },
    { id: "l1", name: "daftar", type: "list", isLocal: false, isCloud: false },
  ];
  it("validasi nama: trim, kosong batal, bentrok peka huruf, awan", () => {
    expect(validateVariableName("  nyawa ", "", vars, [], false, "id")).toEqual({ ok: true, name: "nyawa" });
    expect(validateVariableName("   ", "", vars, [], false, "id")).toEqual({ ok: false, error: null });
    expect(validateVariableName("skor", "", vars, [], false, "en")).toEqual({ ok: false, error: 'A variable named "skor" already exists.' });
    expect(validateVariableName("Skor", "", vars, [], false, "en").ok).toBe(true);
    expect(validateVariableName("skor", "list", vars, [], false, "en").ok).toBe(true);
    expect(validateVariableName("x", "", vars, ["x"], false, "en").ok).toBe(false);
    expect(validateVariableName("hi", "", vars, [], true, "en")).toEqual({ ok: true, name: `${CLOUD_PREFIX}hi` });
  });
  it("opsi dropdown variabel dan pesan", () => {
    expect(variableDropdownOptions(vars, "", "skor", "en")).toEqual([["skor", "v1"], ["Rename variable", RENAME_VARIABLE_ID], ['Delete the "skor" variable', DELETE_VARIABLE_ID]]);
    const msgs: VarModel[] = [{ id: "m1", name: "message1", type: "broadcast_msg", isLocal: false, isCloud: false }];
    expect(variableDropdownOptions(msgs, "broadcast_msg", "message1", "en")[0]).toEqual(["New message", NEW_BROADCAST_MESSAGE_ID]);
    expect(resolveBroadcastName(" message1 ", msgs)).toEqual({ name: "message1", existingId: "m1" });
    expect(resolveBroadcastName("", msgs)).toBeNull();
  });
});

describe("Clean up", () => {
  it("urut y + sin(3)*x lalu tumpuk di x=0 dengan jarak MIN_BLOCK_Y", () => {
    const blocks: Record<string, Block> = {};
    for (const [id, x, y] of [["p", 400, 300], ["q", 0, 100], ["r", 900, 90]] as const) {
      for (const b of cmdWithNumber(id, "motion_movesteps", "STEPS", 1)) blocks[b.id] = b;
      chain(blocks, [id], x, y);
    }
    // r: 90 + 0.0523*900 = 137 > q: 100
    expect(orderedTopBlocks(blocks)).toEqual(["q", "r", "p"]);
    const evs = cleanUpEvents(testDeps(blocks));
    expect(evs).toEqual([
      { type: "move", blockId: "q", newCoordinate: { x: 0, y: 0 } },
      { type: "move", blockId: "r", newCoordinate: { x: 0, y: 96 } },
      { type: "move", blockId: "p", newCoordinate: { x: 0, y: 192 } },
    ]);
    expect(layoutStack(testDeps(blocks), "q").height).toBe(48);
  });
});

describe("Viewport", () => {
  const v: Viewport = { scrollX: 0, scrollY: 0, scale: 0.675, viewWidth: 800, viewHeight: 600 };
  it("zoom mempertahankan titik di bawah kursor dan dibatasi 0.3..3", () => {
    const z = zoomAt(v, 400, 300, 1);
    expect(z.scale).toBeCloseTo(0.675 * 1.2);
    const before = { x: (400 - v.scrollX) / v.scale, y: (300 - v.scrollY) / v.scale };
    expect((400 - z.scrollX) / z.scale).toBeCloseTo(before.x);
    expect((300 - z.scrollY) / z.scale).toBeCloseTo(before.y);
    expect(zoomAt(v, 0, 0, 50).scale).toBe(ZOOM_OPTIONS.maxScale);
    expect(zoomAt(v, 0, 0, -50).scale).toBe(ZOOM_OPTIONS.minScale);
  });
  it("reset zoom = startScale 0.675 dan konten di tengah", () => {
    const r = resetZoom({ ...v, scale: 2 }, { left: 0, top: 0, right: 200, bottom: 100 });
    expect(r.scale).toBe(0.675);
    const centerX = r.scrollX + 100 * 0.675;
    expect(centerX).toBeCloseTo(400);
  });
  it("wheel: scroll biasa, shift = horizontal, ctrl = zoom", () => {
    const content = { left: -2000, top: -2000, right: 2000, bottom: 2000 };
    expect(applyWheel(v, { deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false, shiftKey: false, x: 0, y: 0 }, content).scrollY).toBe(-100);
    expect(applyWheel(v, { deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false, shiftKey: true, x: 0, y: 0 }, content)).toMatchObject({ scrollX: -100, scrollY: 0 });
    expect(applyWheel(v, { deltaX: 0, deltaY: -50, deltaMode: 0, ctrlKey: true, shiftKey: false, x: 400, y: 300 }, content).scale).toBeCloseTo(0.81);
    expect(clampScroll({ ...v, scrollY: 1e6 }, content).scrollY).toBeLessThan(1e6);
  });
});

describe("ids & restrictor", () => {
  it("genUid 20 karakter", () => {
    expect(genUid()).toHaveLength(20);
  });
  it("number restrictor sesuai FieldNumber", () => {
    const whole = numberRestrictor({ type: "field_number", name: "NUM" }, "math_whole_number")!;
    expect(whole.test("5")).toBe(true);
    expect(whole.test(".")).toBe(false);
    expect(whole.test("-")).toBe(false);
    const num = numberRestrictor({ type: "field_number", name: "NUM" }, "math_number")!;
    expect(["-", ".", "e", "7"].every((c) => num.test(c))).toBe(true);
    expect(num.test("a")).toBe(false);
    const int = numberRestrictor({ type: "field_number", name: "NUM" }, "math_integer")!;
    expect([int.test("-"), int.test(".")]).toEqual([true, false]);
    expect(numberRestrictor({ type: "field_input", name: "TEXT" }, "text")).toBeNull();
  });
});
