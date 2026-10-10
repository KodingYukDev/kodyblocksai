/**
 * Menjalankan project parity di engine KodyBlocks (@kody/engine) dengan kondisi yang sama persis
 * dengan oracle: GeometryWorld yang sama bentuknya, jam palsu, PRNG blok dengan seed yang sama,
 * compatibilityMode, dan aksi IO per frame yang sama.
 */
import type {
  AssetData,
  Costume,
  CostumeState,
  IMediaLoader,
  IRuntime,
  ITarget,
  Sound,
  SoundState,
} from "@kody/engine";
import type { ParityAction } from "./case-types";
import { CANVAS } from "./case-types";
import { createDeterministicEnv, flushMicrotasks, installDeterministicGlobals } from "./fake-env";
import { DEFAULT_SKIN, GeometryWorld } from "./geometry-renderer";
import { createGeometryIRenderer } from "./geometry-irenderer";
import { sb3ToModel } from "./sb3-to-model";
import type { FrameSnapshot, MonitorSnapshot, TargetSnapshot } from "./snapshot";
import { snapshotTarget, sortMonitors } from "./snapshot";

/** Setara oracle tanpa storage: costume tidak punya skin (renderer memakai DEFAULT_SKIN). */
export const parityMediaLoader: IMediaLoader = {
  loadCostume(costume: CostumeState, asset: AssetData | null): Promise<Costume> {
    return Promise.resolve({ ...costume, skinId: -1, size: [DEFAULT_SKIN.size[0], DEFAULT_SKIN.size[1]], asset });
  },
  loadSound(sound: SoundState, asset: AssetData | null): Promise<Sound> {
    return Promise.resolve({ ...sound, soundId: "", asset });
  },
};

export interface EngineRunOptions {
  frames: number;
  seed?: number;
  compatibilityMode?: boolean;
  turbo?: boolean;
  greenFlag?: boolean;
  actions?: readonly ParityAction[];
  world?: GeometryWorld;
}

export interface EngineResult {
  frames: FrameSnapshot[];
  spinGuardTriggered: boolean;
  /** Exception dari runtime.step() per frame (ditangkap seperti oracle). */
  stepErrors: { frame: number; message: string }[];
}

export function snapshotEngineTarget(t: ITarget, world: GeometryWorld): TargetSnapshot {
  return snapshotTarget(
    {
      name: t.getName(),
      isStage: t.isStage,
      isOriginal: t.isOriginal,
      x: t.x,
      y: t.y,
      direction: t.direction,
      size: t.size,
      visible: t.visible,
      currentCostume: t.currentCostume,
      volume: t.volume,
      rotationStyle: t.rotationStyle,
      draggable: t.draggable,
      drawableId: t.drawableId,
      effects: t.effects,
      variables: Object.values(t.variables),
      bubble: t.getCustomState<{ type?: unknown; text?: unknown }>("Scratch.looks"),
    },
    world,
  );
}

function applyEngineAction(runtime: IRuntime, a: ParityAction): void {
  const io = runtime.ioDevices;
  switch (a.kind) {
    case "key":
      io.keyboard.postData({ key: a.key, isDown: a.isDown });
      break;
    case "mouse": {
      const data: Parameters<typeof io.mouse.postData>[0] = {
        x: a.x,
        y: a.y,
        canvasWidth: CANVAS.width,
        canvasHeight: CANVAS.height,
      };
      if (a.isDown !== undefined) data.isDown = a.isDown;
      io.mouse.postData(data);
      break;
    }
    case "wheel":
      io.mouseWheel.postData({ deltaY: a.deltaY });
      break;
    case "answer":
      runtime.emit("ANSWER", { answer: a.text });
      break;
    case "username":
      io.userData.postData({ username: a.name });
      break;
    case "greenFlag":
      runtime.greenFlag();
      break;
    case "stopAll":
      runtime.stopAll();
      break;
  }
}

function monitorSnapshot(runtime: IRuntime): MonitorSnapshot[] {
  const out: MonitorSnapshot[] = [];
  for (const [id, rec] of runtime.getMonitorState()) {
    const value = rec.value;
    out.push({ id, visible: rec.visible, value: Array.isArray(value) ? [...value] : value });
  }
  return sortMonitors(out);
}

export async function runEngineDetailed(project: object, opts: EngineRunOptions): Promise<EngineResult> {
  const compat = opts.compatibilityMode ?? true;
  const stepTime = compat ? 1000 / 30 : 1000 / 60;
  const env = createDeterministicEnv(opts.seed ?? 1, stepTime);
  // Math.random global hanya untuk id; blok WAJIB memakai RuntimeOptions.random.
  const restore = installDeterministicGlobals(env, "id-only");
  let runtime: IRuntime | null = null;
  try {
    const engine = await import("@kody/engine");
    const world = opts.world ?? new GeometryWorld();
    const { renderer } = createGeometryIRenderer(world);
    runtime = engine.createRuntime({
      renderer,
      audioEngine: null,
      compatibilityMode: compat,
      time: env.clock,
      random: env.blockRandom,
      autoStart: false,
    });
    if (opts.turbo) runtime.setTurboMode(true);
    await runtime.loadProject(sb3ToModel(project), parityMediaLoader);
    const rt = runtime;
    const says: FrameSnapshot["says"] = [];
    const questions: string[] = [];
    rt.on("SAY", ({ target, type, text }) => {
      says.push({ target: target.getName(), type, text: String(text) });
    });
    rt.on("QUESTION", ({ question }) => {
      if (question !== null) questions.push(String(question));
    });
    if (opts.greenFlag ?? true) rt.greenFlag();
    const frames: FrameSnapshot[] = [];
    const stepErrors: EngineResult["stepErrors"] = [];
    for (let frame = 1; frame <= opts.frames; frame++) {
      env.clock.beginFrame();
      env.timers.runDue();
      says.length = 0;
      questions.length = 0;
      for (const a of opts.actions ?? []) if (a.frame === frame) applyEngineAction(rt, a);
      // Seperti browser: microtask (resolve Promise blok, mis. ask) jalan di antara frame.
      await flushMicrotasks();
      try {
        rt.step();
      } catch (e) {
        stepErrors.push({ frame, message: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
      }
      await flushMicrotasks();
      frames.push({
        frame,
        threads: rt.threads.length,
        targets: rt.targets.map((t) => snapshotEngineTarget(t, world)),
        says: [...says],
        questions: [...questions],
        monitors: monitorSnapshot(rt),
      });
    }
    rt.stopAll();
    return { frames, spinGuardTriggered: env.clock.spinGuardTriggered, stepErrors };
  } finally {
    try {
      runtime?.dispose();
    } catch {
      // dispose stub boleh gagal; hasil sudah direkam.
    }
    restore();
  }
}

export async function runEngine(project: object, opts: EngineRunOptions): Promise<FrameSnapshot[]> {
  return (await runEngineDetailed(project, opts)).frames;
}
