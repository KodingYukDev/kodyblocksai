/**
 * Oracle parity: menjalankan project.json di scratch-vm ASLI (devDependency, hanya untuk tes)
 * dan merekam snapshot state per frame. Engine kita harus menghasilkan trace yang sama
 * (lihat tests/parity/README.md). Kode produksi TIDAK boleh mengimpor file ini.
 */
import { createRequire } from "node:module";
import type { ParityAction } from "./case-types";
import { CANVAS } from "./case-types";
import { createDeterministicEnv, flushMicrotasks, installDeterministicGlobals } from "./fake-env";
import { GeometryWorld, createScratchRenderFacade } from "./geometry-renderer";
import type { FrameSnapshot, MonitorSnapshot, TargetSnapshot } from "./snapshot";
import { snapshotTarget, sortMonitors } from "./snapshot";

export { mulberry32 } from "./fake-env";
export type { FrameSnapshot, TargetSnapshot } from "./snapshot";

const require = createRequire(import.meta.url);

/** Permukaan minimal scratch-vm yang dipakai oracle (tanpa tipe resmi). */
interface VmVariable {
  name: string;
  type: string;
  value: unknown;
}
export interface VmTarget {
  id: string;
  isStage: boolean;
  isOriginal: boolean;
  x: number;
  y: number;
  direction: number;
  size: number;
  visible: boolean;
  draggable: boolean;
  rotationStyle: string;
  currentCostume: number;
  drawableID?: number;
  getName(): string;
  getCustomState(key: string): unknown;
  variables: Record<string, VmVariable>;
  effects: Record<string, number>;
  volume: number;
}
interface ImmutableRecordLike {
  get(key: string): unknown;
}
interface VmRuntime {
  targets: VmTarget[];
  threads: unknown[];
  currentStepTime: number;
  _monitorState: { forEach(fn: (rec: ImmutableRecordLike, id: string) => void): void };
  _step(): void;
  on(event: string, fn: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  _primitives: Record<string, unknown>;
  _hats: Record<string, { edgeActivated?: boolean; restartExistingThreads?: boolean }>;
}
export interface ScratchVM {
  runtime: VmRuntime;
  setCompatibilityMode(on: boolean): void;
  setTurboMode(on: boolean): void;
  loadProject(json: string | object): Promise<void>;
  attachRenderer(renderer: object): void;
  postIOData(device: string, data: object): void;
  greenFlag(): void;
  stopAll(): void;
  start(): void;
  quit(): void;
}

/** Modul oracle: default devDependency `scratch-vm`; bisa diganti lewat PARITY_ORACLE_PATH. */
export function oracleModulePath(): string {
  return process.env.PARITY_ORACLE_PATH ?? "scratch-vm";
}

export function createOracleVM(): ScratchVM {
  const VM = require(oracleModulePath()) as new () => ScratchVM;
  return new VM();
}

/** Snapshot target scratch-vm memakai fungsi snapshot bersama. */
export function snapshotVmTarget(t: VmTarget, world: GeometryWorld): TargetSnapshot {
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
      drawableId: t.drawableID,
      effects: t.effects,
      variables: Object.values(t.variables),
      bubble: t.getCustomState("Scratch.looks") as { type?: unknown; text?: unknown } | undefined,
    },
    world,
  );
}

export interface OracleRunOptions {
  frames: number;
  seed?: number;
  compatibilityMode?: boolean;
  turbo?: boolean;
  /** Jalankan green flag sebelum frame pertama (default true). */
  greenFlag?: boolean;
  actions?: readonly ParityAction[];
  /** Geometri bersama (dipakai juga oleh engine kita di tes parity). */
  world?: GeometryWorld;
}

export interface OracleResult {
  frames: FrameSnapshot[];
  /** Loop tanpa redraw/yield memaksa jam melompat; trace tidak sah untuk dibandingkan. */
  spinGuardTriggered: boolean;
  /** Method renderer yang dipanggil scratch-vm tetapi tidak ada di facade. */
  unknownRendererCalls: string[];
  /**
   * Exception yang keluar dari runtime._step(). Di browser, setInterval menelan error dan frame
   * berikutnya tetap jalan; oracle meniru itu (frame terpotong, lanjut ke frame berikutnya).
   * Contoh nyata: switch backdrop and wait + hat "when backdrop switches to" (BlockUtility
   * singleton tertimpa oleh execute() di startHats).
   */
  stepErrors: { frame: number; message: string }[];
}

function applyOracleAction(vm: ScratchVM, a: ParityAction): void {
  switch (a.kind) {
    case "key":
      vm.postIOData("keyboard", { key: a.key, isDown: a.isDown });
      break;
    case "mouse": {
      const data: Record<string, unknown> = { x: a.x, y: a.y, canvasWidth: CANVAS.width, canvasHeight: CANVAS.height };
      if (a.isDown !== undefined) data.isDown = a.isDown;
      vm.postIOData("mouse", data);
      break;
    }
    case "wheel":
      vm.postIOData("mouseWheel", { deltaY: a.deltaY });
      break;
    case "answer":
      vm.runtime.emit("ANSWER", a.text);
      break;
    case "username":
      vm.postIOData("userData", { username: a.name });
      break;
    case "greenFlag":
      vm.greenFlag();
      break;
    case "stopAll":
      vm.stopAll();
      break;
  }
}

function monitorSnapshot(vm: ScratchVM): MonitorSnapshot[] {
  const out: MonitorSnapshot[] = [];
  vm.runtime._monitorState.forEach((rec, id) => {
    const value = rec.get("value");
    out.push({ id, visible: Boolean(rec.get("visible")), value: Array.isArray(value) ? [...value] : value });
  });
  return sortMonitors(out);
}

/**
 * Jalankan project di scratch-vm selama N frame dan rekam snapshot setiap akhir frame.
 * Jam palsu beku di dalam frame (lihat fake-env.ts), jadi hasilnya deterministik selama
 * project tidak memicu spin guard.
 */
export async function runOracleDetailed(project: object, opts: OracleRunOptions): Promise<OracleResult> {
  const compat = opts.compatibilityMode ?? true;
  const stepTime = compat ? 1000 / 30 : 1000 / 60;
  const env = createDeterministicEnv(opts.seed ?? 1, stepTime);
  const restore = installDeterministicGlobals(env, "oracle-split");
  try {
    // VM dibuat SETELAH jam palsu terpasang (Timer scratch-vm menyimpan referensi Date).
    const vm = createOracleVM();
    const world = opts.world ?? new GeometryWorld();
    const facade = createScratchRenderFacade(world);
    vm.attachRenderer(facade.renderer);
    vm.setCompatibilityMode(compat);
    if (opts.turbo) vm.setTurboMode(true);
    await vm.loadProject(JSON.parse(JSON.stringify(project)) as object);
    const says: FrameSnapshot["says"] = [];
    const questions: string[] = [];
    vm.runtime.on("SAY", (...args: unknown[]) => {
      const [target, type, text] = args as [VmTarget, string, unknown];
      says.push({ target: target.getName(), type, text: String(text) });
    });
    vm.runtime.on("QUESTION", (...args: unknown[]) => {
      if (args[0] !== null && args[0] !== undefined) questions.push(String(args[0]));
    });
    // runtime.start() (setInterval) tidak dipanggil; isi currentStepTime manual agar
    // WORK_TIME sequencer = 75% frame seperti saat berjalan normal.
    vm.runtime.currentStepTime = stepTime;
    if (opts.greenFlag ?? true) vm.greenFlag();
    const frames: FrameSnapshot[] = [];
    const stepErrors: OracleResult["stepErrors"] = [];
    for (let frame = 1; frame <= opts.frames; frame++) {
      env.clock.beginFrame();
      env.timers.runDue();
      says.length = 0;
      questions.length = 0;
      for (const a of opts.actions ?? []) if (a.frame === frame) applyOracleAction(vm, a);
      // Seperti browser: microtask (resolve Promise blok, mis. ask) jalan di antara frame.
      await flushMicrotasks();
      try {
        vm.runtime._step();
      } catch (e) {
        stepErrors.push({ frame, message: e instanceof Error ? e.message : String(e) });
      }
      await flushMicrotasks();
      frames.push({
        frame,
        threads: vm.runtime.threads.length,
        targets: vm.runtime.targets.map((t) => snapshotVmTarget(t, world)),
        says: [...says],
        questions: [...questions],
        monitors: monitorSnapshot(vm),
      });
    }
    vm.stopAll();
    vm.quit();
    return {
      frames,
      spinGuardTriggered: env.clock.spinGuardTriggered,
      unknownRendererCalls: [...facade.unknownCalls].sort(),
      stepErrors,
    };
  } finally {
    restore();
  }
}

export async function runOracle(project: object, opts: OracleRunOptions): Promise<FrameSnapshot[]> {
  return (await runOracleDetailed(project, opts)).frames;
}
