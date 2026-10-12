/**
 * Kasus tepi produksi dengan paket blok asli (CORE_BLOCK_PACKAGES): project kosong, clone limit,
 * sprite dihapus saat skrip jalan, nilai NaN/Infinity, list sangat panjang. Tujuannya: tidak ada
 * exception yang lolos dari runtime.step() dan state tetap angka berhingga.
 */
import { describe, expect, it } from "vitest";
import { CORE_BLOCK_PACKAGES } from "./blocks/index";
import { LIST_ITEM_LIMIT } from "./blocks/data";
import { Runtime } from "./runtime";
import { FakeRenderer } from "./testing/fake-renderer";
import { addScript, type BlockSpec } from "./testing/script-builder";
import { makeKit } from "./testing/test-kit";
import { MAX_CLONES } from "./types/runtime";

const flag: BlockSpec = { opcode: "event_whenflagclicked" };
const forever = (substack: BlockSpec[]): BlockSpec => ({ opcode: "control_forever", substack });
const cloneMyself: BlockSpec = {
  opcode: "control_create_clone_of",
  inputs: {
    CLONE_OPTION: { opcode: "control_create_clone_of_menu", shadow: true, fields: { CLONE_OPTION: "_myself_" } },
  },
};
const listField = { value: "daftar", id: "list-1", variableType: "list" as const };
const varField = { value: "nilai", id: "var-1" };

function realKit() {
  const renderer = new FakeRenderer();
  const kit = makeKit({ renderer, runtime: { blockPackages: CORE_BLOCK_PACKAGES } });
  const errors: unknown[] = [];
  kit.runtime.on("RUNTIME_ERROR", (e) => errors.push(e));
  return { kit, renderer, errors };
}

describe("kasus tepi runtime", () => {
  it("project kosong (tanpa target) bisa bendera hijau, step, stop", () => {
    const rt = new Runtime({ autoStart: false });
    expect(() => {
      rt.greenFlag();
      rt.step();
      rt.stopAll();
      rt.step();
      rt.clear();
      rt.step();
    }).not.toThrow();
  });

  it("clone dibatasi 300 dan stop membebaskan kuota lagi", () => {
    const { kit, errors } = realKit();
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [flag, forever([cloneMyself])]);
    // Setelah batas tercapai tidak ada redraw lagi: jam harus maju agar WORK_TIME frame habis.
    kit.time.autoStep = 1;
    kit.runtime.greenFlag();
    kit.frames(MAX_CLONES + 20);
    const clones = kit.runtime.targets.filter((t) => !t.isOriginal);
    expect(clones.length).toBe(MAX_CLONES);
    expect(kit.runtime.clonesAvailable()).toBe(false);
    kit.runtime.stopAll();
    expect(kit.runtime.targets.filter((t) => !t.isOriginal)).toHaveLength(0);
    expect(kit.runtime.clonesAvailable()).toBe(true);
    expect(errors).toEqual([]);
  });

  it("menghapus sprite yang skripnya sedang jalan tidak membuat step melempar", () => {
    const { kit, errors } = realKit();
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [flag, forever([{ opcode: "motion_movesteps", inputs: { STEPS: 10 } }, cloneMyself])]);
    kit.runtime.greenFlag();
    kit.frames(3);
    // Alur runtime-controller.deleteSprite: hentikan thread lalu buang target + clone.
    for (const t of [...kit.runtime.targets]) {
      if (t.sprite === sprite.sprite) {
        kit.runtime.stopForTarget(t);
        kit.runtime.disposeTarget(t);
      }
    }
    expect(() => kit.frames(5)).not.toThrow();
    expect(kit.runtime.targets.some((t) => t.sprite === sprite.sprite)).toBe(false);
    expect(errors).toEqual([]);
  });

  it("nilai NaN/Infinity tidak membuat posisi, ukuran, arah, efek jadi NaN", () => {
    const { kit, errors } = realKit();
    const sprite = kit.addSprite("Kody");
    const div0: BlockSpec = { opcode: "operator_divide", inputs: { NUM1: 1, NUM2: 0 } };
    const nan: BlockSpec = { opcode: "operator_mathop", fields: { OPERATOR: "sqrt" }, inputs: { NUM: -1 } };
    addScript(sprite.blocks, [
      flag,
      { opcode: "motion_gotoxy", inputs: { X: div0, Y: nan } },
      { opcode: "motion_turnright", inputs: { DEGREES: nan } },
      { opcode: "motion_pointindirection", inputs: { DIRECTION: div0 } },
      { opcode: "looks_setsizeto", inputs: { SIZE: div0 } },
      { opcode: "looks_changesizeby", inputs: { CHANGE: nan } },
      { opcode: "looks_seteffectto", fields: { EFFECT: "GHOST" }, inputs: { VALUE: nan } },
      { opcode: "looks_changeeffectby", fields: { EFFECT: "COLOR" }, inputs: { CHANGE: div0 } },
      { opcode: "looks_sayforsecs", inputs: { MESSAGE: div0, SECS: nan } },
      { opcode: "control_wait", inputs: { DURATION: nan } },
      { opcode: "motion_glidesecstoxy", inputs: { SECS: nan, X: div0, Y: 0 } },
      { opcode: "data_setvariableto", fields: { VARIABLE: varField }, inputs: { VALUE: div0 } },
      { opcode: "data_changevariableby", fields: { VARIABLE: varField }, inputs: { VALUE: nan } },
    ]);
    kit.runtime.greenFlag();
    kit.frames(20);
    expect(errors).toEqual([]);
    expect(Number.isFinite(sprite.x)).toBe(true);
    expect(Number.isFinite(sprite.y)).toBe(true);
    expect(Number.isFinite(sprite.direction)).toBe(true);
    expect(Number.isFinite(sprite.size)).toBe(true);
    for (const v of Object.values(sprite.effects)) expect(Number.isNaN(v)).toBe(false);
  });

  it("list dibatasi LIST_ITEM_LIMIT dan item/indeks ekstrem aman", () => {
    const { kit, errors } = realKit();
    const sprite = kit.addSprite("Kody");
    const list = kit.stage.lookupOrCreateList(listField.id, listField.value);
    list.value = Array.from({ length: LIST_ITEM_LIMIT - 1 }, (_, i) => i);
    addScript(sprite.blocks, [
      flag,
      { opcode: "data_addtolist", fields: { LIST: listField }, inputs: { ITEM: "a" } },
      { opcode: "data_addtolist", fields: { LIST: listField }, inputs: { ITEM: "b" } },
      { opcode: "data_insertatlist", fields: { LIST: listField }, inputs: { ITEM: "c", INDEX: 1 } },
      { opcode: "data_deleteoflist", fields: { LIST: listField }, inputs: { INDEX: "Infinity" } },
      { opcode: "data_replaceitemoflist", fields: { LIST: listField }, inputs: { INDEX: -5, ITEM: "x" } },
      {
        opcode: "data_setvariableto",
        fields: { VARIABLE: varField },
        inputs: { VALUE: { opcode: "data_itemoflist", fields: { LIST: listField }, inputs: { INDEX: "NaN" } } },
      },
      {
        opcode: "data_setvariableto",
        fields: { VARIABLE: { value: "isi", id: "var-2" } },
        inputs: { VALUE: { opcode: "data_listcontents", fields: { LIST: listField } } },
      },
    ]);
    kit.runtime.greenFlag();
    kit.frames(5);
    expect(errors).toEqual([]);
    expect(list.value.length).toBeLessThanOrEqual(LIST_ITEM_LIMIT);
  });

  it("primitive yang melempar dilaporkan sebagai RUNTIME_ERROR, frame tetap jalan", () => {
    const errors: unknown[] = [];
    const boom = () => ({
      getPrimitives: () => ({
        test_boom: () => {
          throw new Error("boom");
        },
      }),
    });
    const kit = makeKit({ runtime: { blockPackages: [...CORE_BLOCK_PACKAGES, boom] } });
    kit.runtime.on("RUNTIME_ERROR", (e) => errors.push(e));
    const sprite = kit.addSprite("Kody");
    addScript(sprite.blocks, [flag, { opcode: "test_boom" }, { opcode: "motion_changexby", inputs: { DX: 5 } }]);
    kit.runtime.greenFlag();
    expect(() => kit.frames(2)).not.toThrow();
    expect(errors.length).toBeGreaterThan(0);
    expect(sprite.x).toBe(5);
  });

  it("renderer yang melempar saat draw tidak menghentikan event frame", () => {
    const renderer = new FakeRenderer();
    const kit = makeKit({ renderer, runtime: { blockPackages: CORE_BLOCK_PACKAGES } });
    let steps = 0;
    kit.runtime.on("RUNTIME_STEP", () => steps++);
    renderer.draw = () => {
      throw new Error("context lost");
    };
    const errors: unknown[] = [];
    kit.runtime.on("RUNTIME_ERROR", (e) => errors.push(e));
    expect(() => kit.frames(2)).not.toThrow();
    expect(steps).toBe(2);
    expect(errors).toHaveLength(2);
  });
});
