import { describe, expect, it } from "vitest";
import { deserializeProject, deserializeProjectWithReport } from "./deserialize";
import { sampleProject, seqIds } from "./test-fixtures";
import { ProjectLoadError } from "./types";

type Mutable = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const load = (json: unknown = sampleProject()) => deserializeProject(json, { makeId: seqIds("n") });

describe("deserializeProject", () => {
  it("mengurai primitif input menjadi blok shadow terpisah seperti scratch-vm", () => {
    const model = load();
    const blocks = model.targets[1]!.blocks;
    const move = blocks.move!;
    const reporter = blocks[move.inputs.STEPS!.block!]!;
    expect(reporter).toMatchObject({ opcode: "data_variable", parent: "move", shadow: false, topLevel: false });
    const shadowId = move.inputs.STEPS!.shadow!;
    expect(blocks[shadowId]).toEqual({
      id: shadowId,
      opcode: "math_number",
      next: null,
      parent: "move",
      inputs: {},
      fields: { NUM: { name: "NUM", value: "10" } },
      shadow: true,
      topLevel: false,
    });
    // [1, primitif] -> block === shadow
    const call = blocks.callProc!;
    expect(call.inputs.argA!.block).toBe(call.inputs.argA!.shadow);
    expect(blocks[call.inputs.argA!.block!]!.fields.TEXT!.value).toBe("halo");
  });

  it("memberi variableType pada field VARIABLE/LIST/BROADCAST_OPTION", () => {
    const model = load();
    const move = model.targets[1]!.blocks.move!;
    expect(model.targets[1]!.blocks[move.inputs.STEPS!.block!]!.fields.VARIABLE).toEqual({
      name: "VARIABLE",
      value: "kecepatan",
      id: "var-local",
      variableType: "",
    });
    const bcast = model.targets[0]!.blocks.bcast!;
    const menu = model.targets[0]!.blocks[bcast.inputs.BROADCAST_INPUT!.block!]!;
    expect(menu.opcode).toBe("event_broadcast_menu");
    expect(menu.fields.BROADCAST_OPTION).toEqual({
      name: "BROADCAST_OPTION",
      value: "mulai",
      id: "bc-1",
      variableType: "broadcast_msg",
    });
  });

  it("urutan blok = urutan for-in scratch-vm (primitif top-level pindah ke akhir dengan id baru)", () => {
    const model = load();
    const ids = Object.keys(model.targets[0]!.blocks);
    // stageHat, bcast, lalu primitif broadcast (dibuat saat bcast), lalu var top-level
    expect(ids[0]).toBe("stageHat");
    expect(ids[1]).toBe("bcast");
    expect(ids).not.toContain("topVar");
    const top = model.targets[0]!.blocks[ids[3]!]!;
    expect(top).toMatchObject({ opcode: "data_variable", topLevel: true, x: 300, y: 40, parent: null, shadow: false });
  });

  it("variabel, list, broadcast, cloud", () => {
    const stage = load().targets[0]!;
    expect(stage.variables["var-global"]).toEqual({ id: "var-global", name: "skor", type: "", value: 0, isCloud: false });
    expect(stage.variables["var-cloud"]!.isCloud).toBe(true);
    expect(stage.variables["list-1"]).toMatchObject({ type: "list", value: ["a", 1, true] });
    expect(stage.variables["bc-1"]).toMatchObject({ type: "broadcast_msg", name: "mulai", value: "mulai" });
  });

  it("variabel cloud dibatasi 10 dan hanya di Stage", () => {
    const p = sampleProject() as Mutable;
    for (let i = 0; i < 12; i++) p.targets[0].variables[`c${i}`] = [`☁ v${i}`, 0, true];
    p.targets[1].variables.local = ["☁ lokal", 0, true];
    const model = load(p);
    const clouds = Object.values(model.targets[0]!.variables).filter((v) => v.isCloud);
    expect(clouds).toHaveLength(10);
    expect(model.targets[1]!.variables.local!.isCloud).toBe(false);
  });

  it("properti target, wrapClamp arah, clamp currentCostume, default", () => {
    const p = sampleProject() as Mutable;
    p.targets[1].direction = 270;
    p.targets[1].currentCostume = 9;
    delete p.targets[1].size;
    delete p.targets[1].draggable;
    const sprite = load(p).targets[1]!;
    expect(sprite.direction).toBe(-90);
    expect(sprite.currentCostume).toBe(0);
    expect(sprite.size).toBe(100);
    expect(sprite.draggable).toBe(false);
    expect(sprite.volume).toBe(80);
    expect(sprite.x).toBe(12);
  });

  it("layerOrder: urut panel tetap, layerOrder = peringkat lapisan", () => {
    const p = sampleProject() as Mutable;
    const second = structuredClone(p.targets[1]);
    second.name = "Belakang";
    p.targets[1].layerOrder = 5;
    second.layerOrder = 2;
    p.targets.push(second);
    const model = load(p);
    expect(model.targets.map((t) => t.name)).toEqual(["Stage", "Kody", "Belakang"]);
    expect(model.targets.map((t) => t.layerOrder)).toEqual([0, 2, 1]);
  });

  it("mengganti karakter tak aman XML di id variabel dan referensinya", () => {
    const p = sampleProject() as Mutable;
    p.targets[1].variables = { "a<b>&'\"": ["kecepatan", 1] };
    p.targets[1].blocks.move.inputs.STEPS = [3, [12, "kecepatan", "a<b>&'\""], [4, "10"]];
    const sprite = load(p).targets[1]!;
    const reporterId = sprite.blocks.move!.inputs.STEPS!.block!;
    expect(Object.keys(sprite.variables)).toEqual(["altbgtampaposquot"]);
    expect(sprite.variables.altbgtampaposquot!.id).toBe("altbgtampaposquot");
    expect(sprite.blocks[reporterId]!.fields.VARIABLE!.id).toBe("altbgtampaposquot");
  });

  it("monitor: id sprite-spesifik dari id target, LIST diperbaiki ke nama terkini", () => {
    const p = sampleProject() as Mutable;
    p.monitors[1].params.LIST = "nama-lama";
    const model = load(p);
    const sprite = model.targets[1]!;
    expect(model.monitors[2]!.id).toBe(`${sprite.id}_xposition`);
    expect(model.monitors[1]!.params.LIST).toBe("daftar");
    expect(model.monitors[1]).toMatchObject({ mode: "list", sliderMin: 0, sliderMax: 100, isDiscrete: true });
    expect(model.monitors[0]!.id).toBe("var-global");
  });

  it("komentar: ukuran minimal 20 seperti Comment scratch-vm", () => {
    const p = sampleProject() as Mutable;
    p.targets[0].comments.c1.width = 5;
    const c = load(p).targets[0]!.comments.c1!;
    expect(c.width).toBe(20);
    expect(c.blockId).toBeNull();
    expect(load().targets[1]!.comments.c2).toMatchObject({ blockId: "say", minimized: true });
  });

  it("costume tanpa rotationCenter & bitmapResolution memakai hook ukuran gambar", () => {
    const p = sampleProject() as Mutable;
    const c = p.targets[1].costumes[0];
    delete c.rotationCenterX;
    delete c.rotationCenterY;
    delete c.bitmapResolution;
    c.dataFormat = "png";
    delete c.md5ext;
    const { model } = deserializeProjectWithReport(p, {}, { imageSize: () => ({ width: 64, height: 30 }) });
    expect(model.targets[1]!.costumes[0]).toMatchObject({
      rotationCenterX: 32,
      rotationCenterY: 15,
      bitmapResolution: 2,
      md5ext: `${c.assetId}.png`,
    });
  });

  it("sound selain mp3 menjadi wav", () => {
    const p = sampleProject() as Mutable;
    p.targets[1].sounds[0].dataFormat = "wave";
    expect(load(p).targets[1]!.sounds[0]!.dataFormat).toBe("wav");
  });

  it("ekstensi dideteksi dari blok dan monitor", () => {
    const p = sampleProject() as Mutable;
    p.targets[1].blocks.move.opcode = "pen_penDown";
    p.monitors.push({ ...p.monitors[0], id: "tempo", opcode: "music_getTempo", params: {} });
    expect(load(p).extensions).toEqual(["pen", "music"]);
  });

  it("memperbaiki referensi menggantung", () => {
    const p = sampleProject() as Mutable;
    p.targets[1].blocks.move.inputs.STEPS = [3, "hilang", [4, "10"]];
    p.targets[1].blocks.move.next = "hilang2";
    const move = load(p).targets[1]!.blocks.move!;
    expect(move.next).toBeNull();
    expect(move.inputs.STEPS!.block).toBe(move.inputs.STEPS!.shadow);
  });

  it("tidak memodifikasi JSON masukan", () => {
    const p = sampleProject();
    const before = JSON.stringify(p);
    load(p);
    expect(JSON.stringify(p)).toBe(before);
  });

  it("melempar ProjectLoadError dengan daftar masalah", () => {
    const p = sampleProject() as Mutable;
    p.targets[1].blocks.move.opcode = "foo_bar";
    try {
      load(p);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ProjectLoadError);
      expect((e as ProjectLoadError).issues[0]?.code).toBe("unknown-opcode");
    }
  });
});
