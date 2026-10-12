import { existsSync, readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { loadSb3 } from "./sb3-file";
import { loadSprite3, saveSprite3 } from "./sprite3";
import { SOUND_MD5, SPRITE_MD5, SVG_SPRITE, WAV_BYTES, sampleProject, zipProject } from "./test-fixtures";
import { ProjectLoadError } from "./types";

type Mutable = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Fixture dari repo referensi scratch-vm (hanya dibaca sebagai data, dilewati bila tidak ada). */
const FIXTURES = "D:/Aril Saputra/Project/Products/_reference/scratch-vm/test/fixtures";
const hasFixtures = existsSync(`${FIXTURES}/cat.sprite3`);

async function spriteZip(json: unknown, files: Record<string, Uint8Array | string> = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("sprite.json", JSON.stringify(json));
  for (const [k, v] of Object.entries(files)) zip.file(k, v);
  return zip.generateAsync({ type: "uint8array" });
}

async function expectError(p: Promise<unknown>, text: string): Promise<void> {
  await expect(p).rejects.toBeInstanceOf(ProjectLoadError);
  await expect(p).rejects.toThrow(text);
}

describe("sprite3", () => {
  it("ekspor lalu impor sprite: blok, variabel lokal, costume, sound kembali", async () => {
    const project = await loadSb3(await zipProject(sampleProject()));
    const kody = project.model.targets[1]!;
    const { data, missingAssets } = await saveSprite3(kody, project.assets);
    expect(missingAssets).toEqual([]);

    const zip = await JSZip.loadAsync(data);
    expect(Object.keys(zip.files).sort()).toEqual(["sprite.json", `${SPRITE_MD5}.svg`, `${SOUND_MD5}.wav`].sort());
    const json = JSON.parse(await zip.file("sprite.json")!.async("string")) as Mutable;
    expect(json.isStage).toBe(false);
    expect(json.name).toBe("Kody");
    expect(json.layerOrder).toBeUndefined();

    const loaded = await loadSprite3(data);
    expect(loaded.target.name).toBe("Kody");
    expect(loaded.target.isStage).toBe(false);
    expect(loaded.target.id).not.toBe(kody.id);
    expect(Object.values(loaded.target.blocks).map((b) => b.opcode).sort()).toEqual(
      Object.values(kody.blocks).map((b) => b.opcode).sort(),
    );
    expect(Object.values(loaded.target.variables).map((v) => v.name)).toContain("kecepatan");
    expect(loaded.target.costumes.map((c) => c.md5ext)).toEqual([`${SPRITE_MD5}.svg`]);
    expect(loaded.assets.get(`${SOUND_MD5}.wav`)).toEqual(WAV_BYTES);
    expect(loaded.warnings).toEqual([]);
  });

  it("extensionState (mis. model AI terlatih) ikut tersimpan di sprite", async () => {
    const project = await loadSb3(await zipProject(sampleProject()));
    const kody = project.model.targets[1]!;
    kody.extensionState = { "Kody.aiImage": { labels: ["kucing"] } };
    const loaded = await loadSprite3((await saveSprite3(kody, project.assets)).data);
    expect(loaded.target.extensionState).toEqual({ "Kody.aiImage": { labels: ["kucing"] } });
  });

  it("menolak file yang bukan sprite dengan pesan jelas", async () => {
    await expectError(loadSprite3(new TextEncoder().encode("halo")), "bukan sprite");
    await expectError(loadSprite3(await zipProject(sampleProject())), "file project (.sb3)");
    await expectError(loadSprite3(await spriteZip({ objName: "Kucing" })), ".sprite2");
    const stage = sampleProject().targets[0];
    await expectError(loadSprite3(await spriteZip(stage)), "bukan Stage");
  });

  it("menolak sprite.json yang tidak valid (validasi sama dengan .sb3)", async () => {
    const sprite = structuredClone(sampleProject().targets[1]) as Mutable;
    sprite.costumes = [];
    await expectError(loadSprite3(await spriteZip(sprite)), "Sprite tidak valid");
    const evil = structuredClone(sampleProject().targets[1]) as Mutable;
    evil.blocks.hat.opcode = "text2speech_speakAndWait";
    await expectError(loadSprite3(await spriteZip(evil)), "ekstensi yang belum ada di KodyBlocks: Text to Speech");
  });

  it("asset hilang = peringatan, bukan gagal; layerOrder/extensions di sprite.json diabaikan", async () => {
    const sprite = structuredClone(sampleProject().targets[1]) as Mutable;
    sprite.layerOrder = 0;
    sprite.extensions = ["pen"];
    const loaded = await loadSprite3(await spriteZip(sprite, { [`${SPRITE_MD5}.svg`]: SVG_SPRITE }));
    expect(loaded.target.name).toBe("Kody");
    expect(loaded.warnings.some((w) => w.includes("tidak ada"))).toBe(true);
    expect(loaded.warnings.filter((w) => w.startsWith("targets["))).toEqual([]);
  });

  it("ekspor stage ditolak", async () => {
    const project = await loadSb3(await zipProject(sampleProject()));
    await expect(saveSprite3(project.model.targets[0]!, project.assets)).rejects.toThrow("Stage");
  });

  it.skipIf(!hasFixtures)("membuka cat.sprite3 asli dari Scratch 3", async () => {
    const loaded = await loadSprite3(new Uint8Array(readFileSync(`${FIXTURES}/cat.sprite3`)));
    expect(loaded.target.isStage).toBe(false);
    expect(loaded.target.costumes.length).toBeGreaterThan(0);
    for (const c of loaded.target.costumes) expect(loaded.assets.has(c.md5ext)).toBe(true);
    // Round trip: ekspor ulang lalu impor lagi memberi isi yang sama.
    const again = await loadSprite3((await saveSprite3(loaded.target, loaded.assets)).data);
    expect(again.target.name).toBe(loaded.target.name);
    expect(Object.keys(again.target.blocks).length).toBe(Object.keys(loaded.target.blocks).length);
    expect(again.target.costumes.map((c) => c.md5ext)).toEqual(loaded.target.costumes.map((c) => c.md5ext));
  });

  it.skipIf(!hasFixtures)("missing_png.sprite3: costume hilang hanya peringatan", async () => {
    const loaded = await loadSprite3(new Uint8Array(readFileSync(`${FIXTURES}/missing_png.sprite3`)));
    expect(loaded.target.costumes.length).toBeGreaterThan(0);
    expect(loaded.warnings.length).toBeGreaterThan(0);
  });
});
