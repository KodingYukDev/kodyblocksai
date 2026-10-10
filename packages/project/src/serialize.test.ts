import { describe, expect, it } from "vitest";
import type { ProjectModel } from "@kody/engine";
import { deserializeProject } from "./deserialize";
import type { SB3Project } from "./sb3-types";
import { KODY_VM_VERSION, serializeProject, stringifyProject } from "./serialize";
import { normalizeProject, sampleProject, seqIds } from "./test-fixtures";
import { validateProjectJson } from "./validate";

type Mutable = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const roundTrip = (p: SB3Project): SB3Project =>
  serializeProject(deserializeProject(p, { makeId: seqIds("r") }), { agent: "test" });

describe("serializeProject", () => {
  it("round-trip project contoh identik (selain id primitif top-level & meta)", () => {
    const original = sampleProject();
    const out = roundTrip(original);
    expect(normalizeProject(out)).toEqual(normalizeProject(original));
    expect(out.meta).toEqual({ semver: "3.0.0", vm: KODY_VM_VERSION, agent: "test" });
  });

  it("hasil serialisasi lolos validasi skema", () => {
    const out = roundTrip(sampleProject());
    expect(validateProjectJson(JSON.parse(stringifyProject(out))).issues.filter((i) => i.severity === "error")).toEqual(
      [],
    );
  });

  it("mengompresi shadow primitif ke dalam input", () => {
    const out = roundTrip(sampleProject());
    const blocks = out.targets[1]!.blocks as Mutable;
    expect(blocks.move.inputs.STEPS).toEqual([3, [12, "kecepatan", "var-local"], [4, "10"]]);
    expect(blocks.callProc.inputs.argA).toEqual([1, [10, "halo"]]);
    expect(out.targets[0]!.blocks.bcast).toMatchObject({ inputs: { BROADCAST_INPUT: [1, [11, "mulai", "bc-1"]] } });
  });

  it("menulis next:null dan topLevel:false, membulatkan x/y top-level", () => {
    const model = deserializeProject(sampleProject(), { makeId: seqIds() });
    model.targets[1]!.blocks.hat!.x = 10.6;
    const out = serializeProject(model);
    const hat = out.targets[1]!.blocks.hat as Mutable;
    expect(hat.x).toBe(11);
    const say = out.targets[1]!.blocks.say as Mutable;
    expect(say).toHaveProperty("next", null);
    expect(say.topLevel).toBe(false);
    expect(say).not.toHaveProperty("x");
  });

  it("membuang shadow primitif yatim (LLK/scratch-vm#1011)", () => {
    const model = deserializeProject(sampleProject(), { makeId: seqIds() });
    const blocks = model.targets[1]!.blocks;
    blocks.orphan = { id: "orphan", opcode: "math_number", next: null, parent: null, inputs: {}, fields: { NUM: { name: "NUM", value: 3 } }, shadow: true, topLevel: false };
    expect(serializeProject(model).targets[1]!.blocks).not.toHaveProperty("orphan");
  });

  it("extensions hanya dari blok; layerOrder stage 0 dan sprite berurutan", () => {
    const model: ProjectModel = deserializeProject(sampleProject(), { makeId: seqIds() });
    model.targets[1]!.blocks.move!.opcode = "pen_penDown";
    model.targets[1]!.layerOrder = 7;
    const out = serializeProject(model);
    expect(out.extensions).toEqual(["pen"]);
    expect(out.targets.map((t) => t.layerOrder)).toEqual([0, 1]);
  });

  it("currentCostume di luar rentang di-clamp", () => {
    const model = deserializeProject(sampleProject(), { makeId: seqIds() });
    model.targets[1]!.currentCostume = 5;
    expect(serializeProject(model).targets[1]!.currentCostume).toBe(0);
  });

  it("extensionState ikut disimpan dan dimuat kembali", () => {
    const model = deserializeProject(sampleProject(), { makeId: seqIds() });
    model.targets[1]!.extensionState = { "Kody.aiImage": { labels: ["kucing"] } };
    const out = serializeProject(model);
    expect((out.targets[1] as Mutable).extensionState).toEqual({ "Kody.aiImage": { labels: ["kucing"] } });
    expect(serializeProject(model, { includeExtensionState: false }).targets[1]).not.toHaveProperty("extensionState");
    const again = deserializeProject(JSON.parse(stringifyProject(out)));
    expect(again.targets[1]!.extensionState).toEqual({ "Kody.aiImage": { labels: ["kucing"] } });
  });

  it("stringifyProject mengganti NaN/Infinity dengan 0", () => {
    const model = deserializeProject(sampleProject(), { makeId: seqIds() });
    model.targets[1]!.x = NaN;
    model.targets[1]!.y = Infinity;
    const parsed = JSON.parse(stringifyProject(serializeProject(model)));
    expect(parsed.targets[1].x).toBe(0);
    expect(parsed.targets[1].y).toBe(0);
  });

  it("variabel cloud ditulis [nama, nilai, true]; broadcast ditulis nama", () => {
    const out = roundTrip(sampleProject());
    expect(out.targets[0]!.variables["var-cloud"]).toEqual(["☁ awan", 5, true]);
    expect(out.targets[0]!.broadcasts).toEqual({ "bc-1": "mulai" });
  });

  it("tidak memodifikasi model", () => {
    const model = deserializeProject(sampleProject(), { makeId: seqIds() });
    const before = JSON.stringify(model);
    serializeProject(model);
    expect(JSON.stringify(model)).toBe(before);
  });
});
