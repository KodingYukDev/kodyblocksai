import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MONITOR,
  MathUtil,
  TypedEmitter,
  type IMediaLoader,
  type IRuntime,
  type MonitorRecord,
  type ProjectModel,
  type RuntimeEventMap,
} from "@kody/engine";
import { costumeDataUrl, createRuntimeController, FeatureUnavailableError, type ProjectIO } from "./runtime-controller";

interface FakeVar {
  id: string;
  name: string;
  type: string;
  value: unknown;
  isCloud: boolean;
  _monitorUpToDate?: boolean;
}

interface FakeTarget {
  id: string;
  isStage: boolean;
  isOriginal: boolean;
  sprite: { name: string; clones: FakeTarget[] };
  x: number;
  y: number;
  direction: number;
  size: number;
  visible: boolean;
  draggable: boolean;
  rotationStyle: string;
  currentCostume: number;
  dragging: boolean;
  drawableId: number;
  variables: Record<string, FakeVar>;
  log: string[];
  getCurrentCostume(): unknown;
  getCostumes(): unknown[];
  getSounds(): unknown[];
  setXY(x: number, y: number, force?: boolean): void;
  setDirection(d: number): void;
  setDraggable(v: boolean): void;
  setRotationStyle(s: string): void;
  setVisible(v: boolean): void;
  setSize(s: number): void;
  goToFront: ReturnType<typeof vi.fn>;
  goBehindOther: ReturnType<typeof vi.fn>;
  duplicate(): Promise<FakeTarget>;
  toState(): unknown;
}

/** Target palsu: cukup untuk kontrak yang dipakai controller. */
function fakeTarget(id: string, name: string, isStage: boolean, rt: FakeRuntime): FakeTarget {
  const sprite: FakeTarget["sprite"] = { name, clones: [] };
  const t: FakeTarget = {
    id,
    isStage,
    isOriginal: true,
    sprite,
    x: 0,
    y: 0,
    direction: 90,
    size: 100,
    visible: true,
    draggable: false,
    rotationStyle: "all around",
    currentCostume: 0,
    dragging: false,
    drawableId: isStage ? 0 : rt.targets.length + 1,
    variables: {},
    log: [],
    getCurrentCostume: () => ({
      name: "c1",
      assetId: `asset-${id}`,
      md5ext: `asset-${id}.svg`,
      dataFormat: "svg",
      asset: { assetId: `asset-${id}`, dataFormat: "svg", data: new TextEncoder().encode("<svg/>") },
    }),
    getCostumes: () => [t.getCurrentCostume()],
    getSounds: () => [],
    setXY(x: number, y: number, force?: boolean) {
      if (t.isStage) return;
      if (t.dragging && !force) return;
      t.x = x;
      t.y = y;
      t.log.push(`setXY(${x},${y},${String(force)})`);
    },
    setDirection(d: number) {
      if (!Number.isFinite(d)) return;
      t.direction = MathUtil.wrapClamp(d, -179, 180);
      t.log.push("setDirection");
    },
    setDraggable(v: boolean) {
      t.draggable = v;
      t.log.push("setDraggable");
    },
    setRotationStyle(s: string) {
      t.rotationStyle = s;
      t.log.push("setRotationStyle");
    },
    setVisible(v: boolean) {
      t.visible = v;
      t.log.push("setVisible");
    },
    setSize(s: number) {
      t.size = s;
      t.log.push("setSize");
    },
    goToFront: vi.fn(),
    goBehindOther: vi.fn(),
    duplicate: async () => fakeTarget(`${id}-copy`, `${name}2`, false, rt),
    toState: () => ({ id, isStage, name, blocks: {}, variables: {}, comments: {}, costumes: [], sounds: [], currentCostume: 0, volume: 100, layerOrder: 0 }),
  };
  sprite.clones.push(t);
  return t;
}

class FakeRuntime extends TypedEmitter<RuntimeEventMap> {
  targets: FakeTarget[] = [];
  editing: FakeTarget | null = null;
  turboMode = false;
  monitors = new Map<string, MonitorRecord>();
  renderer: { pick: (x: number, y: number) => number; resize: (w: number, h: number) => void } | null = null;
  ioDevices = {
    mouse: { postData: vi.fn() },
    keyboard: { postData: vi.fn() },
    mouseWheel: { postData: vi.fn() },
  };
  loaded: ProjectModel | null = null;
  greenFlag = vi.fn();
  stopAll = vi.fn();
  emitProjectChanged = vi.fn();
  requestTargetsUpdate = vi.fn();
  stopForTarget = vi.fn();
  setTurboMode(v: boolean) {
    this.turboMode = v;
    this.emit(v ? "TURBO_MODE_ON" : "TURBO_MODE_OFF", undefined);
  }
  getEditingTarget() {
    return this.editing;
  }
  setEditingTarget(t: FakeTarget | null) {
    this.editing = t;
    this.emit("EDITING_TARGET_CHANGED", { target: null });
  }
  getTargetById(id: string) {
    return this.targets.find((t) => t.id === id);
  }
  getTargetForStage() {
    return this.targets.find((t) => t.isStage);
  }
  addTarget(t: FakeTarget) {
    this.targets.push(t);
  }
  disposeTarget(t: FakeTarget) {
    this.targets = this.targets.filter((x) => x !== t);
  }
  getMonitorState() {
    return this.monitors;
  }
  requestUpdateMonitor = vi.fn();
  requestRemoveMonitor(id: string) {
    this.monitors.delete(id);
  }
  async loadProject(model: ProjectModel) {
    this.loaded = model;
    this.targets = [];
    this.editing = null;
    this.addTarget(fakeTarget("st", "Stage", true, this));
    this.addTarget(fakeTarget("s1", "Kucing", false, this));
  }
}

const emptyModel = (): ProjectModel => ({ targets: [], monitors: [], extensions: [], meta: { semver: "3.0.0", vm: "", agent: "" } });

function setup(withActions = false) {
  const rt = new FakeRuntime();
  rt.addTarget(fakeTarget("stage", "Stage", true, rt));
  rt.addTarget(fakeTarget("a", "Kody", false, rt));
  rt.addTarget(fakeTarget("b", "Bola", false, rt));
  rt.editing = rt.targets[1] ?? null;
  const io: ProjectIO = {
    loadSb3: vi.fn(async () => ({ model: emptyModel(), assets: new Map<string, Uint8Array>([["x.svg", new Uint8Array([1])]]) })),
    saveSb3: vi.fn(async () => new Uint8Array([9])),
    defaultProject: () => ({ model: emptyModel(), assets: new Map<string, Uint8Array>() }),
  };
  const actions = { addSprite: vi.fn(async () => undefined), addBackdrop: vi.fn(async () => undefined) };
  const ctrl = createRuntimeController({
    runtime: rt as unknown as IRuntime,
    mediaLoader: {} as IMediaLoader,
    projectIO: io,
    assetActions: withActions ? actions : undefined,
  });
  return { rt, ctrl, io, actions };
}

describe("runtime controller", () => {
  it("snapshot: stage dulu, thumbnail data URL, cache stabil", () => {
    const { ctrl } = setup();
    const s = ctrl.getSnapshot();
    expect(s.targets.map((t) => t.name)).toEqual(["Stage", "Kody", "Bola"]);
    expect(s.editingTargetId).toBe("a");
    expect(s.targets[1]?.thumbnailUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(ctrl.getSnapshot()).toBe(s);
  });

  it("event runtime membatalkan snapshot dan memberi tahu pendengar", () => {
    const { rt, ctrl } = setup();
    const l = vi.fn();
    ctrl.subscribe(l);
    const before = ctrl.getSnapshot();
    rt.emit("PROJECT_RUN_START", undefined);
    expect(l).toHaveBeenCalled();
    expect(ctrl.getSnapshot()).not.toBe(before);
    expect(ctrl.getSnapshot().running).toBe(true);
    rt.emit("QUESTION", { question: "Siapa namamu?" });
    expect(ctrl.getSnapshot().question).toBe("Siapa namamu?");
    rt.emit("MONITORS_UPDATE", { monitors: new Map([["m", { ...DEFAULT_MONITOR, id: "m", opcode: "data_variable" }]]) });
    expect(ctrl.getSnapshot().monitors).toHaveLength(1);
  });

  it("postSpriteInfo memanggil setter dengan urutan RenderedTarget.postSpriteInfo", () => {
    const { rt, ctrl } = setup();
    ctrl.postSpriteInfo({ size: 50, visible: false, rotationStyle: "left-right", draggable: true, direction: 270, x: 10 });
    const t = rt.targets[1]!;
    expect(t.log).toEqual(["setXY(10,0,undefined)", "setDirection", "setDraggable", "setRotationStyle", "setVisible", "setSize"]);
    expect(t.direction).toBe(-90);
    expect(rt.emitProjectChanged).toHaveBeenCalled();
  });

  it("drag: postSpriteInfo ke target yang diseret, stopDrag memilih sprite asli", () => {
    const { rt, ctrl } = setup();
    ctrl.startDrag("b");
    expect(rt.targets[2]!.dragging).toBe(true);
    ctrl.postSpriteInfo({ x: 5, y: 6, force: true });
    expect(rt.targets[2]!.x).toBe(5);
    expect(rt.targets[1]!.x).toBe(0);
    ctrl.stopDrag("b");
    expect(rt.targets[2]!.dragging).toBe(false);
    expect(rt.editing?.id).toBe("b");
    expect(ctrl.getTargetDragInfo("b")).toEqual({ x: 5, y: 6, draggable: false, isStage: false });
  });

  it("rename: nama unik & nama khusus ditolak", () => {
    const { rt, ctrl } = setup();
    ctrl.renameSprite("a", "Bola");
    expect(rt.targets[1]!.sprite.name).toBe("Bola2");
    ctrl.renameSprite("a", "_mouse_");
    expect(rt.targets[1]!.sprite.name).toBe("Bola2");
    ctrl.renameSprite("a", "");
    expect(rt.targets[1]!.sprite.name).toBe("Bola2");
    expect(() => ctrl.renameSprite("stage", "X")).toThrow();
  });

  it("hapus sprite: monitor lokal dihapus, target berikutnya dipilih", () => {
    const { rt, ctrl } = setup();
    rt.monitors.set("lokal", { ...DEFAULT_MONITOR, id: "lokal", opcode: "data_variable", targetId: "a" });
    rt.monitors.set("global", { ...DEFAULT_MONITOR, id: "global", opcode: "data_variable", targetId: null });
    ctrl.deleteSprite("a");
    expect(rt.targets.map((t) => t.id)).toEqual(["stage", "b"]);
    expect([...rt.monitors.keys()]).toEqual(["global"]);
    expect(rt.editing?.id).toBe("b");
    expect(rt.stopForTarget).toHaveBeenCalled();
  });

  it("duplikat: ditambah, di belakang aslinya, lalu dipilih", async () => {
    const { rt, ctrl } = setup();
    await ctrl.duplicateSprite("a");
    const copy = rt.targets.at(-1)!;
    expect(copy.id).toBe("a-copy");
    expect(copy.goBehindOther).toHaveBeenCalledWith(rt.targets[1]);
    expect(rt.editing).toBe(copy);
  });

  it("variabel: list disalin saat dibaca, setVariableValue menandai monitor", () => {
    const { rt, ctrl } = setup();
    rt.targets[0]!.variables.v = { id: "v", name: "daftar", type: "list", value: ["a"], isCloud: false };
    const got = ctrl.getVariableValue(null, "v") as string[];
    got.push("b");
    expect(rt.targets[0]!.variables.v!.value).toEqual(["a"]);
    ctrl.setVariableValue(null, "v", ["x"]);
    expect(rt.targets[0]!.variables.v!.value).toEqual(["x"]);
    expect(rt.targets[0]!.variables.v!._monitorUpToDate).toBe(false);
    expect(ctrl.getVariableName(null, "v")).toBe("daftar");
  });

  it("jawaban, IO, pick, turbo", () => {
    const { rt, ctrl } = setup();
    const ans = vi.fn();
    rt.on("ANSWER", ans);
    ctrl.answerQuestion("Budi");
    expect(ans).toHaveBeenCalledWith({ answer: "Budi" });
    ctrl.postMouse({ x: 1, y: 2 });
    ctrl.postKeyboard({ key: "a", isDown: true });
    ctrl.postWheel(5);
    expect(rt.ioDevices.mouse.postData).toHaveBeenCalledWith({ x: 1, y: 2 });
    expect(rt.ioDevices.keyboard.postData).toHaveBeenCalledWith({ key: "a", isDown: true });
    expect(rt.ioDevices.mouseWheel.postData).toHaveBeenCalledWith({ deltaY: 5 });
    expect(ctrl.pickTarget(0, 0)).toBeNull();
    rt.renderer = { pick: () => rt.targets[2]!.drawableId, resize: vi.fn() };
    expect(ctrl.pickTarget(0, 0)).toBe("b");
    ctrl.setTurbo(true);
    expect(ctrl.getSnapshot().turbo).toBe(true);
  });

  it("muat file: asset diteruskan, sprite pertama dipilih", async () => {
    const { rt, ctrl, io } = setup();
    await ctrl.loadProjectFile({ name: "a.sb3", type: "", bytes: new Uint8Array([1, 2]) });
    expect(io.loadSb3).toHaveBeenCalled();
    expect(rt.stopAll).toHaveBeenCalled();
    expect(rt.editing?.id).toBe("s1");
    expect(ctrl.getSnapshot().targets.map((t) => t.name)).toEqual(["Stage", "Kucing"]);
  });

  it("simpan: model dari target asli + asset costume", async () => {
    const { ctrl, io } = setup();
    const bytes = await ctrl.saveProjectFile();
    expect(bytes).toEqual(new Uint8Array([9]));
    const [model, assets] = (io.saveSb3 as ReturnType<typeof vi.fn>).mock.calls[0] as [ProjectModel, Map<string, Uint8Array>];
    expect(model.targets).toHaveLength(3);
    expect(model.meta.semver).toBe("3.0.0");
    expect([...assets.keys()].sort()).toEqual(["asset-a.svg", "asset-b.svg", "asset-stage.svg"]);
  });

  it("tambah sprite tanpa penyedia aset -> FeatureUnavailableError", async () => {
    const { ctrl } = setup();
    await expect(ctrl.addSprite("library")).rejects.toBeInstanceOf(FeatureUnavailableError);
    const w = setup(true);
    await w.ctrl.addBackdrop("paint");
    expect(w.actions.addBackdrop).toHaveBeenCalledWith("paint", undefined);
  });

  it("costumeDataUrl hanya untuk format gambar", () => {
    expect(costumeDataUrl({ dataFormat: "png", asset: { assetId: "x", dataFormat: "png", data: new Uint8Array([1, 2, 3]) } })).toBe(
      "data:image/png;base64,AQID",
    );
    expect(costumeDataUrl({ dataFormat: "png", asset: null })).toBeNull();
  });
});
