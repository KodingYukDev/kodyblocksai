import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDefaultProject, WHITE_BACKDROP_SVG } from "./default-project";
import { readImageSize } from "./image-size";
import { md5String } from "./md5";
import { loadSb3, saveSb3 } from "./sb3-file";
import { serializeProject, stringifyProject } from "./serialize";
import { validateProjectJson } from "./validate";

const KODY_SVG = readFileSync(new URL("../../../app/public/kody.svg", import.meta.url), "utf8");

describe("createDefaultProject", () => {
  it("Stage putih + sprite Kody dengan asset ber-md5", () => {
    const { model, assets } = createDefaultProject(KODY_SVG);
    const [stage, kody] = model.targets;
    expect(stage).toMatchObject({ isStage: true, name: "Stage", layerOrder: 0, tempo: 60, videoState: "on" });
    expect(kody).toMatchObject({ name: "Kody", x: 0, y: 0, size: 100, direction: 90, visible: true, layerOrder: 1 });
    expect(stage!.costumes[0]).toMatchObject({
      md5ext: `${md5String(WHITE_BACKDROP_SVG)}.svg`,
      rotationCenterX: 240,
      rotationCenterY: 180,
      bitmapResolution: 1,
    });
    const size = readImageSize(new TextEncoder().encode(KODY_SVG), "svg")!;
    expect(kody!.costumes[0]).toMatchObject({ rotationCenterX: size.width / 2, rotationCenterY: size.height / 2 });
    expect(assets.has(kody!.costumes[0]!.md5ext)).toBe(true);
    expect(Object.values(stage!.variables)).toMatchObject([{ name: "variabelku", type: "", value: 0 }]);
  });

  it("locale en memakai nama Scratch", () => {
    const { model } = createDefaultProject(KODY_SVG, { locale: "en" });
    expect(model.targets[0]!.costumes[0]!.name).toBe("backdrop1");
    expect(Object.values(model.targets[0]!.variables)[0]!.name).toBe("my variable");
  });

  it("lolos skema sb3 dan bisa disimpan/dimuat ulang", async () => {
    const { model, assets } = createDefaultProject(KODY_SVG);
    const json = JSON.parse(stringifyProject(serializeProject(model)));
    expect(validateProjectJson(json).issues.filter((i) => i.severity === "error")).toEqual([]);
    const reloaded = await loadSb3(await saveSb3(model, assets));
    expect(reloaded.model.targets.map((t) => t.name)).toEqual(["Stage", "Kody"]);
    expect(reloaded.warnings).toEqual([]);
  });
});
