import { describe, expect, it, vi } from "vitest";
import { createMemoryAssetHost } from "./memory-host";
import { emptyCostume, makeCostume, makeSound, mimeForFormat } from "./new-asset";

const svg = (n: number) => makeCostume(`c${n}`, "svg", new TextEncoder().encode(`<svg id="${n}"/>`), 1, 0, 0);

function host() {
  return createMemoryAssetHost({ id: "t1", name: "Kody", isStage: false, costumes: [], currentCostume: 0, sounds: [] });
}

describe("memory host", () => {
  it("addCostumes memilih costume terakhir dan memberi tahu listener", async () => {
    const h = host();
    const spy = vi.fn();
    h.subscribe(spy);
    await h.addCostumes([svg(1), svg(2)]);
    const t = h.getEditingTarget();
    expect(t?.costumes.map((c) => c.name)).toEqual(["c1", "c2"]);
    expect(t?.currentCostume).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(h.getEditingTarget()).toBe(t); // snapshot stabil sampai berubah
  });

  it("duplicate, rename, reorder, delete", async () => {
    const h = host();
    await h.addCostumes([svg(1), svg(2)]);
    await h.duplicateCostume(0);
    expect(h.getEditingTarget()?.costumes.map((c) => c.name)).toEqual(["c1", "c3", "c2"]);
    h.renameCostume(2, "c1");
    expect(h.getEditingTarget()?.costumes[2]?.name).toBe("c2"); // unusedName: "c2" belum dipakai costume lain
    expect(h.reorderCostume(2, 0)).toBe(true);
    expect(h.deleteCostume(0)).toBe(true);
    expect(h.deleteCostume(0)).toBe(true);
    expect(h.deleteCostume(0)).toBe(false);
  });

  it("updateCostume mempertahankan nama", async () => {
    const h = host();
    await h.addCostumes([svg(1)]);
    await h.updateCostume(0, svg(9));
    const c = h.getEditingTarget()?.costumes[0];
    expect(c?.name).toBe("c1");
    expect(c?.assetId).toBe(svg(9).state.assetId);
  });

  it("sounds", async () => {
    const h = host();
    const s = makeSound("pop", "wav", new Uint8Array([1, 2, 3]), 22050, 1);
    await h.addSounds([s, s]);
    await h.duplicateSound(1);
    expect(h.getEditingTarget()?.sounds.map((x) => x.name)).toEqual(["pop", "pop2", "pop3"]);
    h.renameSound(0, "dor");
    expect(h.reorderSound(0, 2)).toBe(true);
    expect(h.getEditingTarget()?.sounds.map((x) => x.name)).toEqual(["pop2", "pop3", "dor"]);
    expect(h.deleteSound(5)).toBe(false);
    await h.updateSound(2, makeSound("x", "wav", new Uint8Array([9]), 8000, 1));
    expect(h.getEditingTarget()?.sounds[2]).toMatchObject({ name: "dor", rate: 8000 });
  });

  it("emptyCostume = SVG 2x2 pusat 0,0; makeCostume memakai md5", () => {
    const e = emptyCostume("kostum1");
    expect(e.state).toMatchObject({ name: "kostum1", dataFormat: "svg", bitmapResolution: 1, rotationCenterX: 0, rotationCenterY: 0 });
    expect(e.state.md5ext).toMatch(/^[0-9a-f]{32}\.svg$/);
    expect(e.asset.assetId).toBe(e.state.assetId);
    expect(mimeForFormat("jpg")).toBe("image/jpeg");
  });
});
