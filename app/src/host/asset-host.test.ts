import { describe, expect, it } from "vitest";
import { createRuntime, type IRuntime } from "@kody/engine";
import { createDefaultProject } from "@kody/project";
import { emptyCostume, makeSound } from "../costume-tab/new-asset";
import { createAssetActions } from "./asset-actions";
import { createRuntimeAssetHost } from "./asset-host";
import { createMediaLoader } from "./media-loader";
import { exportSprite } from "./sprite-install";
import type { LibraryLoader } from "../library/library-loader";

const KODY = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';

async function setup(): Promise<{ runtime: IRuntime; host: ReturnType<typeof createRuntimeAssetHost>; media: ReturnType<typeof createMediaLoader> }> {
  const runtime = createRuntime({ autoStart: false });
  const media = createMediaLoader({ getRenderer: () => null, getAudio: () => null });
  const p = createDefaultProject(KODY, { locale: "id" });
  await runtime.loadProject(p.model, media, p.assets);
  return { runtime, host: createRuntimeAssetHost(runtime, media), media };
}

const names = (host: ReturnType<typeof createRuntimeAssetHost>): string[] => host.getEditingTarget()?.costumes.map((c) => c.name) ?? [];

describe("createRuntimeAssetHost (padanan vm.addCostume/deleteCostume/...)", () => {
  it("menambah costume memilih yang terakhir dan membuat nama unik", async () => {
    const { host, runtime } = await setup();
    let notified = 0;
    host.subscribe(() => notified++);
    await host.addCostumes([emptyCostume("kostum1"), emptyCostume("baru")]);
    expect(names(host)).toEqual(["kostum1", "kostum2", "baru"]);
    expect(runtime.getEditingTarget()?.currentCostume).toBe(2);
    expect(host.getEditingTarget()?.currentCostume).toBe(2);
    expect(notified).toBeGreaterThan(0);
  });

  it("hapus costume: terakhir tidak bisa, aturan currentCostume RenderedTarget.deleteCostume", async () => {
    const { host, runtime } = await setup();
    expect(host.deleteCostume(0)).toBe(false);
    await host.addCostumes([emptyCostume("b"), emptyCostume("c")]);
    const t = runtime.getEditingTarget()!;
    expect(t.currentCostume).toBe(2);
    expect(host.deleteCostume(2)).toBe(true); // hapus yang aktif & terakhir -> mundur satu
    expect(t.currentCostume).toBe(1);
    t.setCostume(1);
    expect(host.deleteCostume(0)).toBe(true); // hapus sebelum aktif -> indeks turun
    expect(t.currentCostume).toBe(0);
    expect(names(host)).toEqual(["b"]);
  });

  it("urut ulang mempertahankan costume aktif, ganti nama tetap unik", async () => {
    const { host, runtime } = await setup();
    await host.addCostumes([emptyCostume("b"), emptyCostume("c")]);
    const t = runtime.getEditingTarget()!;
    t.setCostume(0);
    expect(host.reorderCostume(0, 2)).toBe(true);
    expect(names(host)).toEqual(["b", "c", "kostum1"]);
    expect(t.currentCostume).toBe(2);
    expect(host.reorderCostume(1, 1)).toBe(false);
    host.renameCostume(0, "c");
    expect(names(host)).toEqual(["c2", "c", "kostum1"]);
  });

  it("sound: tambah, duplikat, urut ulang, hapus", async () => {
    const { host } = await setup();
    const s = makeSound("pop", "wav", new Uint8Array([1, 2, 3]), 22050, 3);
    await host.addSounds([s, s]);
    expect(host.getEditingTarget()?.sounds.map((x) => x.name)).toEqual(["pop", "pop2"]);
    await host.duplicateSound(0);
    expect(host.getEditingTarget()?.sounds.map((x) => x.name)).toEqual(["pop", "pop3", "pop2"]);
    expect(host.reorderSound(2, 0)).toBe(true);
    expect(host.deleteSound(1)).toBe(true);
    expect(host.getEditingTarget()?.sounds.map((x) => x.name)).toEqual(["pop2", "pop3"]);
  });
});

describe("ganti nama asset memperbarui blok (blocks.updateAssetName)", () => {
  it("kostum dan suara yang dipakai blok ikut berganti nama", async () => {
    const { host, runtime } = await setup();
    const t = runtime.getEditingTarget()!;
    await host.addSounds([makeSound("pop", "wav", new Uint8Array([1, 2, 3]), 22050, 3)]);
    t.blocks.applyEditorEvent({
      type: "create",
      blocks: [
        { id: "m", opcode: "looks_costume", inputs: {}, fields: { COSTUME: { name: "COSTUME", value: "kostum1" } }, next: null, parent: null, shadow: true, topLevel: true, x: 0, y: 0 },
        { id: "s", opcode: "sound_sounds_menu", inputs: {}, fields: { SOUND_MENU: { name: "SOUND_MENU", value: "pop" } }, next: null, parent: null, shadow: true, topLevel: true, x: 0, y: 0 },
      ],
    });
    host.renameCostume(0, "lari");
    host.renameSound(0, "dor");
    expect(t.blocks.getBlock("m")?.fields.COSTUME?.value).toBe("lari");
    expect(t.blocks.getBlock("s")?.fields.SOUND_MENU?.value).toBe("dor");
  });
});

describe("createAssetActions", () => {
  const loader = { loadCatalog: () => Promise.reject(new Error("tidak dipakai")) } as unknown as LibraryLoader;

  it("Gambar sprite baru: nama unik, posisi acak seperti scratch-gui, langsung diedit", async () => {
    const { runtime, media } = await setup();
    const actions = createAssetActions({ runtime, media, loader, chooseFromLibrary: async () => null, random: () => 0.75 });
    await actions.addSprite("paint");
    await actions.addSprite("paint");
    const sprites = runtime.targets.filter((t) => !t.isStage).map((t) => t.sprite.name);
    expect(sprites).toEqual(["Kody", "Sprite1", "Sprite2"]);
    const t = runtime.getEditingTarget()!;
    expect(t.sprite.name).toBe("Sprite2");
    expect([t.x, t.y]).toEqual([50, 25]);
    expect(t.getCostumes().map((c) => c.name)).toEqual(["kostum1"]);
  });

  it("Gambar latar: costume baru di stage, dipakai, stage terpilih; pustaka dibatalkan = tanpa perubahan", async () => {
    const { runtime, media } = await setup();
    const actions = createAssetActions({ runtime, media, loader, chooseFromLibrary: async () => null });
    await actions.addBackdrop("paint");
    const stage = runtime.getTargetForStage()!;
    expect(stage.getCostumes().map((c) => c.name)).toEqual(["latar1", "latar2"]);
    expect(stage.currentCostume).toBe(1);
    expect(runtime.getEditingTarget()).toBe(stage);
    await actions.addSprite("library");
    expect(runtime.targets.length).toBe(2);
  });

  it(".sprite3 rusak ditolak dengan pesan jelas; .sprite2 belum didukung", async () => {
    const { runtime, media } = await setup();
    const actions = createAssetActions({ runtime, media, loader, chooseFromLibrary: async () => null });
    await expect(actions.addSprite("upload", [{ name: "a.sprite3", type: "", bytes: new Uint8Array([1, 2]) }])).rejects.toThrow(/bukan sprite/);
    await expect(actions.addSprite("upload", [{ name: "a.sprite2", type: "", bytes: new Uint8Array() }])).rejects.toThrow(/belum didukung/);
    expect(runtime.targets.length).toBe(2);
  });

  it("ekspor sprite lalu unggah .sprite3: sprite baru lengkap dengan blok, variabel, costume", async () => {
    const { runtime, media } = await setup();
    const kody = runtime.targets.find((t) => !t.isStage)!;
    const stage = runtime.getTargetForStage()!;
    stage.createVariable("g1", "skor", "");
    kody.createVariable("l1", "nyawa", "");
    kody.blocks.applyEditorEvent({
      type: "create",
      blocks: [
        { id: "h", opcode: "event_whenflagclicked", inputs: {}, fields: {}, next: "set", parent: null, shadow: false, topLevel: true, x: 0, y: 0 },
        { id: "set", opcode: "data_changevariableby", inputs: {}, fields: { VARIABLE: { name: "VARIABLE", value: "skor", id: "g1", variableType: "" } }, next: "b", parent: "h", shadow: false, topLevel: false },
        { id: "b", opcode: "event_broadcast", inputs: { BROADCAST_INPUT: { name: "BROADCAST_INPUT", block: "bm", shadow: "bm" } }, fields: {}, next: null, parent: "set", shadow: false, topLevel: false },
        { id: "bm", opcode: "event_broadcast_menu", inputs: {}, fields: { BROADCAST_OPTION: { name: "BROADCAST_OPTION", value: "menang", id: "bc1", variableType: "broadcast_msg" } }, next: null, parent: "b", shadow: true, topLevel: false },
      ],
    });
    const { data, fileName } = await exportSprite(runtime, kody.id);
    expect(fileName).toBe("Kody.sprite3");

    // Project baru tanpa variabel "skor": variabel global dibuat ulang di Stage.
    const fresh = await setup();
    const actions = createAssetActions({ runtime: fresh.runtime, media: fresh.media, loader, chooseFromLibrary: async () => null });
    await actions.addSprite("upload", [{ name: fileName, type: "", bytes: data }]);
    const added = fresh.runtime.getEditingTarget()!;
    expect(added.sprite.name).toBe("Kody2");
    expect(added.isOriginal).toBe(true);
    expect(fresh.runtime.targets).toContain(added);
    expect(Object.values(added.blocks.toRecord()).map((b) => b.opcode)).toContain("data_changevariableby");
    expect(Object.values(added.variables).map((v) => v.name)).toContain("nyawa");
    expect(added.getCostumes().length).toBe(1);
    const freshStage = fresh.runtime.getTargetForStage()!;
    expect(freshStage.lookupVariableByNameAndType("skor", "")).toBeTruthy();
    expect(freshStage.lookupBroadcastByInputValue("menang")).toBeTruthy();

    // Unggah lagi ke project yang SUDAH punya "skor": rujukan digabung ke variabel global yang ada.
    const before = Object.keys(freshStage.variables).length;
    await actions.addSprite("upload", [{ name: fileName, type: "", bytes: data }]);
    const again = fresh.runtime.getEditingTarget()!;
    expect(again.sprite.name).toBe("Kody3");
    expect(Object.keys(freshStage.variables).length).toBe(before);
  });

  it("variabel lokal yang bentrok dengan variabel global diganti nama (fixUpVariableReferences)", async () => {
    const { runtime, media } = await setup();
    const kody = runtime.targets.find((t) => !t.isStage)!;
    kody.createVariable("l1", "skor", "");
    const { data } = await exportSprite(runtime, kody.id);
    runtime.getTargetForStage()!.createVariable("g9", "skor", "");
    const actions = createAssetActions({ runtime, media, loader, chooseFromLibrary: async () => null });
    await actions.addSprite("upload", [{ name: "Kody.sprite3", type: "", bytes: data }]);
    const added = runtime.getEditingTarget()!;
    expect(Object.values(added.variables).map((v) => v.name)).toEqual(["Kody2: skor"]);
  });
});
