import { describe, expect, it } from "vitest";
import { Runtime } from "./runtime";
import { FakeRenderer } from "./testing/fake-renderer";
import { makeScriptBlocks } from "./testing/script-builder";
import { testPackage } from "./testing/test-kit";
import type { CostumeState, ProjectModel, SoundState, TargetState } from "./types/project-model";
import type { AssetData, Costume, IMediaLoader, Sound } from "./types/target";

function costume(name: string): CostumeState {
  return { name, assetId: name, md5ext: `${name}.svg`, dataFormat: "svg", bitmapResolution: 1, rotationCenterX: 0, rotationCenterY: 0 };
}

function target(partial: Partial<TargetState> & { name: string }): TargetState {
  return {
    id: `id-${partial.name}`,
    isStage: false,
    variables: {},
    blocks: {},
    comments: {},
    currentCostume: 0,
    costumes: [costume(`${partial.name}-a`)],
    sounds: [],
    volume: 100,
    layerOrder: 1,
    ...partial,
  };
}

class Media implements IMediaLoader {
  seen: (AssetData | null)[] = [];
  constructor(private readonly renderer: FakeRenderer | null) {}
  loadCostume(c: CostumeState, asset: AssetData | null): Promise<Costume> {
    this.seen.push(asset);
    return Promise.resolve({ ...c, skinId: this.renderer ? this.renderer.addSkin(50, 50) : -1, size: [50, 50], asset });
  }
  loadSound(s: SoundState, asset: AssetData | null): Promise<Sound> {
    return Promise.resolve({ ...s, soundId: s.assetId, asset });
  }
}

function project(): ProjectModel {
  const script = makeScriptBlocks([{ opcode: "event_whenflagclicked" }, { opcode: "test_log", inputs: { TEXT: "jalan" } }]);
  const blocks = Object.fromEntries(script.blocks.map((b) => [b.id, b]));
  return {
    targets: [
      target({
        name: "Stage",
        isStage: true,
        layerOrder: 0,
        tempo: 90,
        variables: {
          g1: { id: "g1", name: "skor", type: "", value: 5, isCloud: true },
          l1: { id: "l1", name: "daftar", type: "list", value: ["a", "b"], isCloud: false },
          b1: { id: "b1", name: "pesan1", type: "broadcast_msg", value: "pesan1", isCloud: false },
        },
      }),
      target({ name: "Depan", layerOrder: 2, x: 10, y: 20, direction: 270, size: 80, blocks }),
      target({ name: "Belakang", layerOrder: 1, currentCostume: 9, costumes: [costume("x"), costume("x")] }),
    ],
    monitors: [
      {
        id: "g1",
        mode: "default",
        opcode: "data_variable",
        params: { VARIABLE: "skor" },
        spriteName: null,
        value: 5,
        width: 0,
        height: 0,
        x: 5,
        y: 5,
        visible: true,
        sliderMin: 0,
        sliderMax: 100,
        isDiscrete: true,
      },
      {
        id: "lama",
        mode: "default",
        opcode: "motion_xposition",
        params: {},
        spriteName: "Depan",
        value: 10,
        width: 0,
        height: 0,
        x: null as unknown as number,
        y: null as unknown as number,
        visible: true,
        sliderMin: 0,
        sliderMax: 100,
        isDiscrete: true,
      },
    ],
    extensions: [],
    meta: { semver: "3.0.0", vm: "0.0.0", agent: "test" },
  };
}

describe("loadProject", () => {
  it("membuat target sesuai urutan panel, layer sesuai layerOrder, properti tanpa fencing", async () => {
    const renderer = new FakeRenderer();
    const log: string[] = [];
    const rt = new Runtime({ autoStart: false, blockPackages: [() => testPackage(log)], renderer });
    const media = new Media(renderer);
    const events: string[] = [];
    rt.on("PROJECT_LOADED", () => events.push("loaded"));
    rt.on("TARGETS_UPDATE", () => events.push("targets"));
    await rt.loadProject(project(), media, new Map([["Stage-a.svg", new Uint8Array([1, 2])]]));

    expect(rt.targets.map((t) => t.getName())).toEqual(["Stage", "Depan", "Belakang"]);
    expect(rt.executableTargets.map((t) => t.getName())).toEqual(["Stage", "Belakang", "Depan"]);
    expect(renderer.drawList.map((id) => rt.getTargetByDrawableId(id)?.getName())).toEqual(["Stage", "Belakang", "Depan"]);
    const depan = rt.getSpriteTargetByName("Depan");
    expect(depan).toMatchObject({ id: "id-Depan", x: 10, y: 20, direction: -90, size: 80 });
    const belakang = rt.getSpriteTargetByName("Belakang");
    expect(belakang?.currentCostume).toBe(1);
    expect(belakang?.getCostumes().map((c) => c.name)).toEqual(["x", "x2"]);
    const stage = rt.getTargetForStage();
    expect(stage?.tempo).toBe(90);
    expect(stage?.variables.g1).toMatchObject({ value: 5, isCloud: false });
    expect(stage?.variables.l1?.value).toEqual(["a", "b"]);
    expect(stage?.lookupBroadcastMsg("", "PESAN1")?.id).toBe("b1");
    expect(media.seen[0]?.data).toEqual(new Uint8Array([1, 2]));
    expect(rt.getEditingTarget()?.getName()).toBe("Depan");
    expect(events).toEqual(["targets", "loaded"]);

    // Monitor: variabel global dan monitor sprite-spesifik (id dihitung ulang).
    expect(rt.getMonitorState().get("g1")).toMatchObject({ value: 5, x: 5, targetId: null });
    expect(rt.getMonitorState().get("id-Depan_xposition")).toMatchObject({ spriteName: "Depan", targetId: "id-Depan" });
    expect(rt.monitorBlocks.getBlock("g1")?.fields.VARIABLE?.id).toBe("g1");

    rt.greenFlag();
    rt.step();
    expect(log).toEqual(["jalan"]);
  });

  it("memuat ulang project mengosongkan target, thread, dan monitor lama", async () => {
    const rt = new Runtime({ autoStart: false, blockPackages: [() => testPackage([])] });
    const media = new Media(null);
    await rt.loadProject(project(), media);
    rt.greenFlag();
    const removed: string[] = [];
    rt.on("TARGET_WAS_REMOVED", (e) => removed.push(e.target.getName()));
    const empty: ProjectModel = { ...project(), targets: [target({ name: "Stage", isStage: true, layerOrder: 0 })], monitors: [] };
    await rt.loadProject(empty, media);
    expect(removed.sort()).toEqual(["Belakang", "Depan", "Stage"]);
    expect(rt.targets.map((t) => t.getName())).toEqual(["Stage"]);
    expect(rt.threads).toHaveLength(0);
    expect(rt.getMonitorState().size).toBe(0);
    expect(rt.getEditingTarget()?.getName()).toBe("Stage");
  });

  it("costume yang gagal dimuat tidak menggagalkan project", async () => {
    const rt = new Runtime({ autoStart: false, blockPackages: [] });
    const media: IMediaLoader = {
      loadCostume: () => Promise.reject(new Error("rusak")),
      loadSound: (s) => Promise.resolve({ ...s, soundId: "", asset: null }),
    };
    await rt.loadProject({ ...project(), monitors: [] }, media);
    expect(rt.getSpriteTargetByName("Depan")?.getCostumes()[0]?.skinId).toBe(-1);
  });
});
