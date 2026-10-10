import { describe, expect, it, vi } from "vitest";
import { CORE_OPCODES } from "../opcodes";
import type { BlockArgs, BlockUtility, IRuntime, PrimitiveFn, RuntimeEventMap } from "../types/runtime";
import type { ITarget, Variable } from "../types/target";
import { TypedEmitter } from "../util/event-emitter";
import { createSensingBlocks, currentDatePart, daysSince2000, SensingBlocks } from "./sensing";

interface FakeTarget {
  name: string;
  isStage: boolean;
  visible: boolean;
  x: number;
  y: number;
  direction: number;
  size: number;
  volume: number;
  currentCostume: number;
  draggable: boolean;
  vars: Record<string, Variable>;
}

function makeTarget(p: Partial<FakeTarget>): ITarget {
  const t: FakeTarget = {
    name: "Sprite1",
    isStage: false,
    visible: true,
    x: 0,
    y: 0,
    direction: 90,
    size: 100,
    volume: 100,
    currentCostume: 0,
    draggable: false,
    vars: {},
    ...p,
  };
  const target = {
    ...t,
    getCostumes: () => [{ name: "costume1" }, { name: "costume2" }],
    setDraggable(d: boolean) {
      target.draggable = d;
    },
    lookupVariableByNameAndType: (name: string, type: string, skipStage: boolean) => {
      expect(type).toBe("");
      expect(skipStage).toBe(true);
      return Object.values(t.vars).find((v) => v.name === name && v.type === "") ?? null;
    },
    isTouchingObject: vi.fn(() => true),
    isTouchingColor: vi.fn(() => false),
    colorIsTouchingColor: vi.fn(() => true),
  };
  return target as unknown as ITarget;
}

function setup() {
  const emitter = new TypedEmitter<RuntimeEventMap>();
  const stage = makeTarget({ name: "Stage", isStage: true, currentCostume: 1, volume: 50 });
  const sprite = makeTarget({ x: 3, y: 4 });
  const other = makeTarget({
    name: "Other",
    x: -10,
    y: 20,
    direction: -45,
    size: 50,
    currentCostume: 1,
    vars: { v1: { id: "v1", name: "score", type: "", value: 42, isCloud: false } },
  });
  const loudness = vi.fn(() => 33);
  const runtime = {
    audioEngine: { getLoudness: loudness },
    currentStepTime: 1000 / 30,
    getTargetForStage: () => stage,
    getSpriteTargetByName: (n: string) => [sprite, other].find((t) => t.getName?.() === n || (t as unknown as FakeTarget).name === n),
    on: <K extends keyof RuntimeEventMap>(e: K, fn: (p: RuntimeEventMap[K]) => void) => emitter.on(e, fn),
    emit: <K extends keyof RuntimeEventMap>(e: K, p: RuntimeEventMap[K]) => emitter.emit(e, p),
  } as unknown as IRuntime;
  let now = 0;
  const pkg = new SensingBlocks(runtime, {
    timeSource: { now: () => now },
    now: () => new Date(2024, 1, 29, 13, 45, 7),
  });
  const prims = pkg.getPrimitives();
  const io = vi.fn((device: string, fn: string, args?: unknown[]) => `${device}.${fn}${args ? JSON.stringify(args) : ""}`);
  const utilFor = (target: ITarget) => ({ target, ioQuery: io }) as unknown as BlockUtility;
  const run = (op: string, args: BlockArgs = {}, target: ITarget = sprite): unknown =>
    (prims[op] as PrimitiveFn)(args, utilFor(target));
  const events: [string, unknown][] = [];
  emitter.on("SAY", (p) => events.push(["SAY", { name: (p.target as unknown as FakeTarget).name, text: p.text }]));
  emitter.on("QUESTION", (p) => events.push(["QUESTION", p.question]));
  return { pkg, run, sprite, stage, other, io, emitter, events, loudness, advance: (ms: number) => (now += ms) };
}

describe("sensing", () => {
  it("mendaftarkan semua opcode sensing di katalog + monitor id", () => {
    const s = setup();
    const want = CORE_OPCODES.filter((o) => o.owner.endsWith("blocks/sensing.ts") && o.vmPrimitive).map((o) => o.opcode);
    expect(Object.keys(s.pkg.getPrimitives()).sort()).toEqual([...want].sort());
    const mon = s.pkg.getMonitored();
    expect(mon.sensing_answer?.getId?.(null, {})).toBe("answer");
    expect(mon.sensing_current?.getId?.(null, { CURRENTMENU: { name: "CURRENTMENU", value: "YEAR" } })).toBe(
      "current_year",
    );
  });

  it("distanceto: stage 10000, sprite tak ada 10000, mouse, sprite", () => {
    const s = setup();
    expect(s.run("sensing_distanceto", { DISTANCETOMENU: "Other" }, s.stage)).toBe(10000);
    expect(s.run("sensing_distanceto", { DISTANCETOMENU: "Nope" })).toBe(10000);
    expect(s.run("sensing_distanceto", { DISTANCETOMENU: "Other" })).toBeCloseTo(Math.sqrt(13 * 13 + 16 * 16));
    s.io.mockImplementation(((_d: string, fn: string) => (fn === "getScratchX" ? 0 : 0)) as never);
    expect(s.run("sensing_distanceto", { DISTANCETOMENU: "_mouse_" })).toBe(5);
  });

  it("io: timer, mouse, key, username", () => {
    const s = setup();
    expect(s.run("sensing_timer")).toBe("clock.projectTimer");
    s.run("sensing_resettimer");
    expect(s.io).toHaveBeenCalledWith("clock", "resetProjectTimer");
    expect(s.run("sensing_mousex")).toBe("mouse.getScratchX");
    expect(s.run("sensing_mousedown")).toBe("mouse.getIsDown");
    expect(s.run("sensing_keypressed", { KEY_OPTION: "space" })).toBe('keyboard.getKeyIsDown["space"]');
    expect(s.run("sensing_username")).toBe("userData.getUsername");
    expect(s.run("sensing_userid")).toBeUndefined();
  });

  it("touching & warna di-cast ke RGB", () => {
    const s = setup();
    expect(s.run("sensing_touchingobject", { TOUCHINGOBJECTMENU: "_edge_" })).toBe(true);
    expect(s.sprite.isTouchingObject).toHaveBeenCalledWith("_edge_");
    s.run("sensing_touchingcolor", { COLOR: "#ff8000" });
    expect(s.sprite.isTouchingColor).toHaveBeenCalledWith([255, 128, 0]);
    s.run("sensing_coloristouchingcolor", { COLOR: "#010203", COLOR2: 0x0000ff });
    expect(s.sprite.colorIsTouchingColor).toHaveBeenCalledWith([0, 0, 255], [1, 2, 3]);
  });

  it("setdragmode", () => {
    const s = setup();
    s.run("sensing_setdragmode", { DRAG_MODE: "draggable" });
    expect(s.sprite.draggable).toBe(true);
    s.run("sensing_setdragmode", { DRAG_MODE: "not draggable" });
    expect(s.sprite.draggable).toBe(false);
  });

  it("of: atribut sprite, stage, variabel lokal, default 0", () => {
    const s = setup();
    const of = (OBJECT: string, PROPERTY: string) => s.run("sensing_of", { OBJECT, PROPERTY });
    expect(of("Other", "x position")).toBe(-10);
    expect(of("Other", "direction")).toBe(-45);
    expect(of("Other", "costume #")).toBe(2);
    expect(of("Other", "costume name")).toBe("costume2");
    expect(of("Other", "size")).toBe(50);
    expect(of("Other", "score")).toBe(42);
    expect(of("Other", "backdrop #")).toBe(0);
    expect(of("_stage_", "backdrop #")).toBe(2);
    expect(of("_stage_", "background #")).toBe(2);
    expect(of("_stage_", "backdrop name")).toBe("costume2");
    expect(of("_stage_", "volume")).toBe(50);
    expect(of("_stage_", "x position")).toBe(0);
    expect(of("Ghost", "x position")).toBe(0);
  });

  it("current & days since 2000", () => {
    const d = new Date(2024, 1, 29, 13, 45, 7);
    expect(currentDatePart("YEAR", d)).toBe(2024);
    expect(currentDatePart("month", d)).toBe(2);
    expect(currentDatePart("date", d)).toBe(29);
    expect(currentDatePart("dayofweek", d)).toBe(5);
    expect(currentDatePart("hour", d)).toBe(13);
    expect(currentDatePart("minute", d)).toBe(45);
    expect(currentDatePart("second", d)).toBe(7);
    expect(currentDatePart("bogus", d)).toBe(0);
    expect(daysSince2000(new Date(2000, 0, 1))).toBeCloseTo(new Date(2000, 0, 1).getTimezoneOffset() / 1440, 10);
    const s = setup();
    expect(s.run("sensing_current", { CURRENTMENU: "YEAR" })).toBe(2024);
  });

  it("loudness diukur sekali per step, -1 tanpa audio", () => {
    const s = setup();
    s.advance(1000);
    expect(s.run("sensing_loudness")).toBe(33);
    s.loudness.mockReturnValue(5);
    s.advance(10);
    expect(s.run("sensing_loudness")).toBe(33);
    s.advance(40);
    expect(s.run("sensing_loudness")).toBe(5);
    expect(s.run("sensing_loud")).toBe(false);
    const rt = { audioEngine: null, on: () => () => {} } as unknown as IRuntime;
    const p = createSensingBlocks(rt).getPrimitives();
    expect((p.sensing_loudness as PrimitiveFn)({}, {} as BlockUtility)).toBe(-1);
  });

  it("ask and wait: antrian, bubble untuk sprite terlihat, answer", async () => {
    const s = setup();
    const p1 = s.run("sensing_askandwait", { QUESTION: "nama?" }) as Promise<void>;
    const p2 = s.run("sensing_askandwait", { QUESTION: 7 }, s.stage) as Promise<void>;
    expect(s.events).toEqual([
      ["SAY", { name: "Sprite1", text: "nama?" }],
      ["QUESTION", ""],
    ]);
    expect(s.pkg.pendingQuestionCount).toBe(2);
    s.emitter.emit("ANSWER", { answer: "Kody" });
    await p1;
    expect(s.run("sensing_answer")).toBe("Kody");
    expect(s.events.slice(2)).toEqual([
      ["SAY", { name: "Sprite1", text: "" }],
      ["QUESTION", "7"],
    ]);
    s.emitter.emit("ANSWER", { answer: "x" });
    await p2;
    expect(s.pkg.pendingQuestionCount).toBe(0);
    s.emitter.emit("PROJECT_START", undefined);
    expect(s.run("sensing_answer")).toBe("");
  });

  it("sprite tersembunyi: pertanyaan di kotak jawaban", () => {
    const s = setup();
    s.sprite.visible = false;
    void s.run("sensing_askandwait", { QUESTION: "hi" });
    expect(s.events).toEqual([["QUESTION", "hi"]]);
  });

  it("stop for target menghapus pertanyaannya dan lanjut ke berikutnya", () => {
    const s = setup();
    void s.run("sensing_askandwait", { QUESTION: "a" });
    void s.run("sensing_askandwait", { QUESTION: "b" }, s.other);
    s.events.length = 0;
    s.emitter.emit("STOP_FOR_TARGET", { target: s.sprite });
    expect(s.events).toEqual([
      ["SAY", { name: "Sprite1", text: "" }],
      ["SAY", { name: "Other", text: "b" }],
      ["QUESTION", ""],
    ]);
    s.events.length = 0;
    s.emitter.emit("PROJECT_STOP_ALL", undefined);
    expect(s.events).toEqual([["QUESTION", null]]);
    expect(s.pkg.pendingQuestionCount).toBe(0);
  });
});
