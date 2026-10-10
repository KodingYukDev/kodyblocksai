import { describe, expect, it } from "vitest";
import { BlocksContainer } from "./blocks-container";
import { addScript, makeScriptBlocks, procedureDefinition } from "./testing/script-builder";
import { makeKit } from "./testing/test-kit";

describe("BlocksContainer", () => {
  it("struktur: next, cabang, input tanpa SUBSTACK, top-level script", () => {
    const c = new BlocksContainer(null);
    const top = addScript(c, [
      { opcode: "event_whenflagclicked" },
      { opcode: "control_if_else", inputs: { CONDITION: "true" }, substack: [{ opcode: "test_log", inputs: { TEXT: "a" } }] },
    ]);
    expect(c.getScripts()).toEqual([top]);
    const ifId = c.getNextBlock(top);
    if (!ifId) throw new Error("if");
    const ifBlock = c.getBlock(ifId);
    expect(c.getOpcode(ifBlock)).toBe("control_if_else");
    expect(c.getBranch(ifId, 1)).not.toBeNull();
    expect(c.getBranch(ifId, 2)).toBeNull();
    expect(Object.keys(c.getInputs(ifBlock) ?? {})).toEqual(["CONDITION"]);
    const inner = c.getBranch(ifId, 1) ?? "";
    expect(c.getTopLevelScript(inner)).toBe(top);
    expect(c.getNextBlock("tidak-ada")).toBeNull();
  });

  it("procedure: definisi & parameter (di-cache, null bila tidak ada)", () => {
    const c = new BlocksContainer(null);
    const def = addScript(c, procedureDefinition("gerak %s %n", ["a", "b"], []));
    expect(c.getProcedureDefinition("gerak %s %n")).toBe(def);
    expect(c.getProcedureDefinition("lain")).toBeNull();
    expect(c.getProcedureParamNamesAndIds("gerak %s %n")).toEqual([
      ["a", "b"],
      ["arg_a", "arg_b"],
    ]);
    expect(c.getProcedureParamNamesIdsAndDefaults("gerak %s %n")?.[2]).toEqual(["", ""]);
    expect(c.getProcedureParamNamesAndIds("lain")).toBeNull();
  });

  it("moveBlock: lepas jadi script, sambung ke next, masuk input (shadow lama tetap)", () => {
    const c = new BlocksContainer(null);
    const top = addScript(c, [{ opcode: "a" }, { opcode: "b" }]);
    const b = c.getNextBlock(top) ?? "";
    c.moveBlock({ id: b, oldParent: top, newCoordinate: { x: 5, y: 6 } });
    expect(c.getNextBlock(top)).toBeNull();
    expect(c.getScripts()).toEqual([top, b]);
    expect(c.getBlock(b)).toMatchObject({ parent: null, topLevel: true, x: 5, y: 6 });
    c.moveBlock({ id: b, newParent: top });
    expect(c.getNextBlock(top)).toBe(b);
    expect(c.getScripts()).toEqual([top]);
    const host = addScript(c, [{ opcode: "test_log", inputs: { TEXT: "x" } }]);
    const shadowId = c.getBlock(host)?.inputs.TEXT?.shadow;
    const rep = addScript(c, [{ opcode: "operator_add" }]);
    c.moveBlock({ id: rep, newParent: host, newInput: "TEXT" });
    expect(c.getBlock(host)?.inputs.TEXT).toEqual({ name: "TEXT", block: rep, shadow: shadowId });
    c.moveBlock({ id: rep, oldParent: host, oldInput: "TEXT", newCoordinate: { x: 0, y: 0 } });
    expect(c.getBlock(host)?.inputs.TEXT?.block).toBeNull();
  });

  it("deleteBlock menghapus next, input, dan shadow secara rekursif", () => {
    const c = new BlocksContainer(null);
    const top = addScript(c, [{ opcode: "a" }, { opcode: "test_log", inputs: { TEXT: { opcode: "operator_add", inputs: { NUM1: 1, NUM2: 2 } } } }]);
    expect(Object.keys(c.toRecord())).toHaveLength(5);
    c.deleteBlock(top);
    expect(Object.keys(c.toRecord())).toHaveLength(0);
    expect(c.getScripts()).toEqual([]);
  });

  it("cache startHats: field dinaikkan huruf besar, field shadow input dipakai bila hat tanpa field", () => {
    const c = new BlocksContainer(null);
    const h1 = addScript(c, [{ opcode: "event_whenkeypressed", fields: { KEY_OPTION: "space" } }]);
    const h2 = addScript(c, [{ opcode: "event_whenbroadcastreceived", fields: { BROADCAST_OPTION: { value: "Halo", id: "b1" } } }]);
    expect(c.getScriptsByOpcode("event_whenkeypressed")).toEqual([
      { blockId: h1, fieldsOfInputs: { KEY_OPTION: { name: "KEY_OPTION", value: "SPACE" } } },
    ]);
    expect(c.getScriptsByOpcode("event_whenbroadcastreceived")[0]?.blockId).toBe(h2);
    // Field asli tidak berubah.
    expect(c.getBlock(h1)?.fields.KEY_OPTION?.value).toBe("space");
    const touch = addScript(c, [{ opcode: "event_whentouchingobject", inputs: { TOUCHINGOBJECTMENU: { opcode: "event_touchingobjectmenu", shadow: true, fields: { TOUCHINGOBJECTMENU: "_mouse_" } } } }]);
    expect(c.getScriptsByOpcode("event_whentouchingobject")[0]).toEqual({
      blockId: touch,
      fieldsOfInputs: { TOUCHINGOBJECTMENU: { name: "TOUCHINGOBJECTMENU", value: "_MOUSE_" } },
    });
  });

  it("referensi variabel, rename, duplicate independen", () => {
    const c = new BlocksContainer(null);
    addScript(c, [{ opcode: "data_setvariableto", fields: { VARIABLE: { value: "skor", id: "v1" } }, inputs: { VALUE: 0 } }]);
    const refs = c.getAllVariableAndListReferences();
    expect(refs.v1).toHaveLength(1);
    c.updateBlocksAfterVarRename("v1", "poin");
    expect(refs.v1?.[0]?.referencingField.value).toBe("poin");
    const copy = c.duplicate();
    copy.updateBlocksAfterVarRename("v1", "lain");
    expect(c.getAllVariableAndListReferences().v1?.[0]?.referencingField.value).toBe("poin");
  });

  it("applyEditorEvent: create/var_create/var_rename/delete/comment", () => {
    const kit = makeKit();
    const s = kit.addSprite("Kody");
    kit.runtime.setEditingTarget(s);
    const { blocks, topId } = makeScriptBlocks([{ opcode: "data_setvariableto", fields: { VARIABLE: { value: "skor", id: "v1" } }, inputs: { VALUE: 1 } }]);
    s.blocks.applyEditorEvent({ type: "create", blocks });
    expect(s.blocks.getBlock(topId)).toBeDefined();
    expect(s.blocks.getBlock(topId)).not.toBe(blocks[0]);
    s.blocks.applyEditorEvent({ type: "var_create", varId: "v1", varName: "skor", varType: "", isLocal: false, isCloud: true });
    expect(kit.stage.variables.v1).toMatchObject({ name: "skor", isCloud: false });
    // Nama bentrok dengan variabel global ditolak.
    s.createVariable("lokal", "nama", "");
    s.blocks.applyEditorEvent({ type: "var_create", varId: "v2", varName: "nama", varType: "", isLocal: false, isCloud: false });
    expect(kit.stage.variables.v2).toBeUndefined();
    s.blocks.applyEditorEvent({ type: "var_rename", varId: "v1", newName: "poin" });
    expect(kit.stage.variables.v1?.name).toBe("poin");
    expect(s.blocks.getBlock(topId)?.fields.VARIABLE?.value).toBe("poin");
    s.blocks.applyEditorEvent({ type: "comment_create", commentId: "c1", blockId: topId, text: "catatan", x: 1, y: 2, width: 200, height: 100, minimized: false });
    expect(s.comments.c1?.text).toBe("catatan");
    expect(s.blocks.getBlock(topId)?.comment).toBe("c1");
    s.blocks.applyEditorEvent({ type: "comment_change", commentId: "c1", text: "baru" });
    s.blocks.applyEditorEvent({ type: "comment_move", commentId: "c1", x: 9, y: 9 });
    expect(s.comments.c1).toMatchObject({ text: "baru", x: 9, y: 9 });
    s.blocks.applyEditorEvent({ type: "comment_delete", commentId: "c1" });
    expect(s.comments.c1).toBeUndefined();
    // Shadow tidak bisa dihapus sendiri.
    const shadowId = s.blocks.getBlock(topId)?.inputs.VALUE?.shadow ?? "";
    s.blocks.applyEditorEvent({ type: "delete", blockId: shadowId });
    expect(s.blocks.getBlock(shadowId)).toBeDefined();
    s.blocks.applyEditorEvent({ type: "delete", blockId: topId });
    expect(s.blocks.getBlock(topId)).toBeUndefined();
    s.blocks.applyEditorEvent({ type: "var_delete", varId: "v1" });
    expect(kit.stage.variables.v1).toBeUndefined();
  });

  it("stackclick lewat applyEditorEvent menjalankan skrip di target yang diedit", () => {
    const kit = makeKit();
    const s = kit.addSprite("Kody");
    kit.runtime.setEditingTarget(s);
    const top = addScript(s.blocks, [{ opcode: "test_log", inputs: { TEXT: "klik" } }]);
    s.blocks.applyEditorEvent({ type: "stackclick", blockId: top });
    kit.frames(1);
    expect(kit.log).toEqual(["klik"]);
  });

  it("perubahan blok memancarkan PROJECT_CHANGED (kecuali container flyout/monitor)", () => {
    const kit = makeKit();
    const s = kit.addSprite("Kody");
    let changed = 0;
    kit.runtime.on("PROJECT_CHANGED", () => changed++);
    addScript(s.blocks, [{ opcode: "a" }]);
    expect(changed).toBeGreaterThan(0);
    const before = changed;
    addScript(kit.runtime.flyoutBlocks, [{ opcode: "a" }]);
    expect(changed).toBe(before);
  });
});
