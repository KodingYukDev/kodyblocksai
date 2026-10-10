import { describe, expect, it } from "vitest";
import { sampleProject } from "./test-fixtures";
import { validateProjectJson } from "./validate";

type Mutable = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const codes = (json: unknown, opts = {}) =>
  validateProjectJson(json, opts)
    .issues.filter((i) => i.severity === "error")
    .map((i) => i.code);

describe("validateProjectJson", () => {
  it("menerima project contoh tanpa error", () => {
    const r = validateProjectJson(sampleProject());
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(r.project).not.toBeNull();
  });

  it("menolak opcode tak dikenal dengan laporan jalur yang jelas", () => {
    const p = sampleProject() as Mutable;
    p.targets[1].blocks.move.opcode = "motion_teleport";
    const r = validateProjectJson(p);
    expect(r.project).toBeNull();
    const err = r.issues.find((i) => i.code === "unknown-opcode");
    expect(err?.path).toBe('targets[1].blocks."move".opcode');
    expect(err?.message).toContain("motion_teleport");
  });

  it("opcode tak dikenal hanya peringatan bila kebijakan 'warn'", () => {
    const p = sampleProject() as Mutable;
    p.targets[1].blocks.move.opcode = "motion_teleport";
    const r = validateProjectJson(p, { unknownOpcodes: "warn" });
    expect(r.project).not.toBeNull();
    expect(r.issues.some((i) => i.severity === "warning" && i.code === "unknown-opcode")).toBe(true);
  });

  it("menyebut nama ekstensi Scratch yang belum didukung", () => {
    const p = sampleProject() as Mutable;
    p.targets[1].blocks.move.opcode = "videoSensing_videoToggle";
    const r = validateProjectJson(p);
    expect(r.issues[0]?.message).toContain("Video Sensing");
  });

  it("menerima opcode ekstensi pen, music, dan AI", () => {
    const p = sampleProject() as Mutable;
    p.targets[1].blocks.move.opcode = "pen_penDown";
    p.targets[1].blocks.callProc.opcode = "aiHand_handCount";
    expect(codes(p)).toEqual([]);
  });

  it("menolak monitor dengan opcode tak dikenal", () => {
    const p = sampleProject() as Mutable;
    p.monitors[0].opcode = "translate_getViewerLanguage";
    expect(codes(p)).toContain("unknown-opcode");
  });

  it("menolak kunci __proto__ (prototype pollution)", () => {
    const text = JSON.stringify(sampleProject()).replace('"var-local"', '"__proto__"');
    expect(codes(JSON.parse(text))).toContain("forbidden-key");
  });

  it("menolak siklus next dan rantai parent", () => {
    const p = sampleProject() as Mutable;
    p.targets[0].blocks.bcast.next = "stageHat";
    expect(codes(p)).toContain("cycle");
    const q = sampleProject() as Mutable;
    q.targets[0].blocks.stageHat.parent = "bcast";
    expect(codes(q)).toContain("cycle");
  });

  it("referensi menggantung hanya peringatan", () => {
    const p = sampleProject() as Mutable;
    p.targets[0].blocks.bcast.next = "hilang";
    const r = validateProjectJson(p);
    expect(r.project).not.toBeNull();
    expect(r.issues.map((i) => i.code)).toContain("dangling-ref");
  });

  it("mengikuti skema sb3: primitif, costume, stage, layerOrder", () => {
    const bad = (mut: (p: Mutable) => void): string[] => {
      const p = sampleProject() as Mutable;
      mut(p);
      return codes(p);
    };
    expect(bad((p) => (p.targets[0].blocks.bcast.inputs.BROADCAST_INPUT = [1, [9, "red"]]))).toContain("primitive");
    expect(bad((p) => (p.targets[0].blocks.bcast.inputs.BROADCAST_INPUT = [4, "x"]))).toContain("input");
    expect(bad((p) => (p.targets[0].blocks.extra = [4, 10]))).toContain("primitive");
    expect(bad((p) => (p.targets[1].costumes = []))).toContain("costume");
    expect(bad((p) => (p.targets[1].costumes[0].assetId = "../../etc/passwd"))).toContain("type");
    expect(bad((p) => (p.targets[1].costumes[0].md5ext = "a/b.svg"))).toContain("type");
    expect(bad((p) => (p.targets[1].sounds[0].dataFormat = "ogg"))).toContain("type");
    expect(bad((p) => (p.targets[0].name = "Panggung"))).toContain("type");
    expect(bad((p) => (p.targets[1].layerOrder = 0))).toContain("type");
    expect(bad((p) => (p.targets[1].isStage = true))).toContain("type");
    expect(bad((p) => (p.targets[1].rotationStyle = "spin"))).toContain("type");
    expect(bad((p) => delete p.targets[1].blocks)).toContain("missing");
    expect(bad((p) => (p.meta.semver = "2.0.0"))).toContain("type");
    expect(bad((p) => (p.meta.vm = "kody"))).toContain("type");
    expect(bad((p) => (p.targets[0].variables.v = ["x", { a: 1 }]))).toContain("variable");
    expect(bad((p) => (p.targets[0].variables.v = ["x", 1, false]))).toContain("variable");
    expect(bad((p) => (p.targets[0].comments.c1.text = "x".repeat(8001)))).toContain("type");
    expect(bad((p) => (p.targets[1].blocks.callProc.mutation.tagName = "xml"))).toContain("mutation");
  });

  it("menolak sb2 dan bukan-objek", () => {
    expect(codes({ objName: "Stage", children: [] })).toEqual(["sb2"]);
    expect(codes([])).toEqual(["type"]);
    expect(codes(null)).toEqual(["type"]);
  });

  it("menegakkan batas ukuran list", () => {
    const p = sampleProject() as Mutable;
    p.targets[0].lists["list-1"][1] = new Array(1_000_001).fill(0);
    expect(codes(p)).toContain("limit");
  });

  it("nilai field null/boolean hanya peringatan", () => {
    const p = sampleProject() as Mutable;
    p.targets[1].blocks.argRep.fields.VALUE = [null];
    const r = validateProjectJson(p);
    expect(r.project).not.toBeNull();
    expect(r.issues.map((i) => i.code)).toContain("field-coerced");
  });
});
