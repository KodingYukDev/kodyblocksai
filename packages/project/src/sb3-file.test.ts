import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { md5Hex } from "./md5";
import { loadSb3, parseProjectJsonText, saveSb3, saveSb3WithReport } from "./sb3-file";
import { serializeProject } from "./serialize";
import { enc, normalizeProject, sampleProject, SOUND_MD5, SPRITE_MD5, STAGE_MD5, SVG_SPRITE, WAV_BYTES, zipProject } from "./test-fixtures";
import { ProjectLoadError, SB3_LIMITS } from "./types";

type Mutable = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function expectLoadError(p: Promise<unknown>, text: string): Promise<ProjectLoadError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ProjectLoadError);
    expect((e as Error).message).toContain(text);
    return e as ProjectLoadError;
  }
  throw new Error("seharusnya ditolak");
}

describe("loadSb3 / saveSb3", () => {
  it("memuat .sb3 beserta asset (md5ext tetap karena isinya cocok)", async () => {
    const loaded = await loadSb3(await zipProject(sampleProject()));
    expect(loaded.model.targets.map((t) => t.name)).toEqual(["Stage", "Kody"]);
    expect([...loaded.assets.keys()].sort()).toEqual(
      [`${STAGE_MD5}.svg`, `${SPRITE_MD5}.svg`, `${SOUND_MD5}.wav`].sort(),
    );
    expect(loaded.assets.get(`${SOUND_MD5}.wav`)).toEqual(WAV_BYTES);
    expect(loaded.warnings).toEqual([]);
  });

  it("round-trip zip: simpan lalu muat ulang memberi project.json yang sama", async () => {
    const first = await loadSb3(await zipProject(sampleProject()));
    const bytes = await saveSb3(first.model, first.assets);
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).sort()).toEqual(
      ["project.json", `${STAGE_MD5}.svg`, `${SPRITE_MD5}.svg`, `${SOUND_MD5}.wav`].sort(),
    );
    const second = await loadSb3(bytes);
    expect(normalizeProject(serializeProject(second.model))).toEqual(normalizeProject(serializeProject(first.model)));
    expect(normalizeProject(serializeProject(second.model))).toEqual(normalizeProject(sampleProject()));
  });

  it("menghitung ulang md5 asset dari isinya seperti scratch-vm", async () => {
    const p = sampleProject() as Mutable;
    const wrong = "0".repeat(32);
    p.targets[1].costumes[0].assetId = wrong;
    p.targets[1].costumes[0].md5ext = `${wrong}.svg`;
    const loaded = await loadSb3(await zipProject(p, { [`${wrong}.svg`]: SVG_SPRITE }));
    const costume = loaded.model.targets[1]!.costumes[0]!;
    expect(costume.assetId).toBe(md5Hex(enc(SVG_SPRITE)));
    expect(costume.md5ext).toBe(`${SPRITE_MD5}.svg`);
    expect(loaded.assets.has(`${SPRITE_MD5}.svg`)).toBe(true);
  });

  it("asset di dalam satu folder tetap ditemukan; asset hilang hanya peringatan", async () => {
    const zip = new JSZip();
    zip.file("proyek/project.json", JSON.stringify(sampleProject()));
    zip.file(`proyek/${STAGE_MD5}.svg`, "<svg width='480' height='360'/>");
    const loaded = await loadSb3(await zip.generateAsync({ type: "uint8array" }));
    expect(loaded.assets.size).toBe(1);
    expect(loaded.warnings.some((w) => w.includes("missing-asset"))).toBe(true);
    const { missingAssets } = await saveSb3WithReport(loaded.model, loaded.assets);
    expect(missingAssets.sort()).toEqual([`${SOUND_MD5}.wav`, `${SPRITE_MD5}.svg`].sort());
  });

  it("rotationCenter yang hilang diisi dari ukuran gambar asset", async () => {
    const p = sampleProject() as Mutable;
    delete p.targets[1].costumes[0].rotationCenterX;
    delete p.targets[1].costumes[0].rotationCenterY;
    const loaded = await loadSb3(await zipProject(p));
    expect(loaded.model.targets[1]!.costumes[0]).toMatchObject({ rotationCenterX: 48, rotationCenterY: 50 });
  });

  it("menerima project.json mentah (bukan zip)", async () => {
    const loaded = await loadSb3(enc(JSON.stringify(sampleProject())));
    expect(loaded.model.targets).toHaveLength(2);
    expect(loaded.assets.size).toBe(0);
  });

  it("menolak opcode tak dikenal dengan laporan", async () => {
    const p = sampleProject() as Mutable;
    p.targets[1].blocks.move.opcode = "videoSensing_videoOn";
    const err = await expectLoadError(loadSb3(await zipProject(p)), "Video Sensing");
    expect(err.issues.some((i) => i.code === "unknown-opcode")).toBe(true);
    // kebijakan warn tetap memuat
    const loaded = await loadSb3(await zipProject(p), { unknownOpcodes: "warn" });
    expect(loaded.warnings.some((w) => w.includes("unknown-opcode"))).toBe(true);
  });

  it("menolak zip tanpa project.json, JSON rusak, Scratch 1.x, dan zip rusak", async () => {
    const z = new JSZip();
    z.file("lain.txt", "x");
    await expectLoadError(loadSb3(await z.generateAsync({ type: "uint8array" })), "project.json");
    await expectLoadError(loadSb3(enc("{bukan json")), "JSON");
    await expectLoadError(loadSb3(enc("ScratchV02")), "Scratch 1");
    await expectLoadError(loadSb3(new Uint8Array([0x50, 0x4b, 1, 2, 3])), "zip");
  });

  it("menolak zip-bomb: total hasil ekstrak melewati batas", async () => {
    // project.json 20 MB nol (terkompresi sangat kecil) > maxProjectJsonBytes
    const bomb = new JSZip();
    bomb.file("project.json", new Uint8Array(SB3_LIMITS.maxProjectJsonBytes + 1024));
    const bytes = await bomb.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    expect(bytes.length).toBeLessThan(1_000_000);
    await expectLoadError(loadSb3(bytes), "terlalu besar");
  });

  it("menolak file lebih besar dari batas dan zip dengan terlalu banyak entri", async () => {
    await expectLoadError(loadSb3(new Uint8Array(SB3_LIMITS.maxFileBytes + 1)), "MB");
    const z = new JSZip();
    for (let i = 0; i <= SB3_LIMITS.maxZipEntries; i++) z.file(`f${i}`, "");
    await expectLoadError(loadSb3(await z.generateAsync({ type: "uint8array" })), "entri");
  });

  it("parseProjectJsonText menghapus backspace seperti scratch-parser", () => {
    expect(parseProjectJsonText('{"a":"x\\by"}')).toEqual({ a: "xy" });
    expect(parseProjectJsonText('{"a":"x\\u0008y"}')).toEqual({ a: "xy" });
    expect(parseProjectJsonText('{"a":"x\\\\by"}')).toEqual({ a: "x\\by" });
    expect(parseProjectJsonText('﻿{"a":1}')).toEqual({ a: 1 });
  });

  it("menolak __proto__ di project.json", async () => {
    const text = JSON.stringify(sampleProject()).replace('"var-global"', '"__proto__"');
    await expectLoadError(loadSb3(await zipProject(text)), "__proto__");
    expect(({} as Mutable).skor).toBeUndefined();
  });
});
