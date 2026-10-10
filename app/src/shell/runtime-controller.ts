/**
 * ShellController di atas IRuntime (kontrak engine). Padanan bagian scratch-vm VirtualMachine yang dipakai
 * scratch-gui: postSpriteInfo, renameSprite, deleteSprite, duplicateSprite, startDrag/stopDrag,
 * setVariableValue, postIOData, loadProject, saveProjectSb3.
 */
import type { Costume, IMediaLoader, IRuntime, ITarget, MonitorRecord } from "@kody/engine";
import { resolveSpriteRename } from "../sprite-pane/sprite-logic";
import { runtimeToModel } from "./runtime-model";
import type { AddMethod, PickedFile, ShellController, ShellSnapshot, SpriteInfoPatch, TargetView } from "./types";

/** Hasil memuat project (bentuk LoadedProject @kody/project, tanpa ketergantungan langsung). */
export interface LoadedProjectLike {
  model: import("@kody/engine").ProjectModel;
  assets: { get(k: string): Uint8Array | undefined; keys(): IterableIterator<string> };
}

export interface ProjectIO {
  loadSb3(bytes: Uint8Array): Promise<LoadedProjectLike>;
  saveSb3(model: import("@kody/engine").ProjectModel, assets: Map<string, Uint8Array>): Promise<Uint8Array>;
  defaultProject(): Promise<LoadedProjectLike> | LoadedProjectLike;
}

/** Penambah sprite/backdrop (pustaka, gambar, unggah, kejutan) - diisi agent pustaka/costume. */
export interface AssetActions {
  addSprite(method: AddMethod, files?: readonly PickedFile[]): Promise<void>;
  addBackdrop(method: AddMethod, files?: readonly PickedFile[]): Promise<void>;
}

export interface RuntimeControllerDeps {
  runtime: IRuntime;
  mediaLoader: IMediaLoader;
  projectIO: ProjectIO;
  assetActions?: AssetActions;
  /** Host membuat/melepas renderer di kanvas panggung. */
  onStageCanvas?: (canvas: HTMLCanvasElement | null) => void;
  /** URL gambar costume untuk thumbnail; default data: URL dari asset. */
  costumeThumbnail?: (costume: Costume) => string | null;
}

export class FeatureUnavailableError extends Error {
  constructor(feature: string) {
    super(`Fitur belum tersedia: ${feature}`);
    this.name = "FeatureUnavailableError";
  }
}

const IMAGE_MIME: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  bmp: "image/bmp",
  gif: "image/gif",
};

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** data: URL costume (aman dipakai di <img>: SVG di <img> tidak menjalankan skrip). */
export function costumeDataUrl(costume: Pick<Costume, "dataFormat" | "asset">): string | null {
  const mime = IMAGE_MIME[costume.dataFormat];
  if (!mime || !costume.asset) return null;
  return `data:${mime};base64,${bytesToBase64(costume.asset.data)}`;
}

export function createRuntimeController(deps: RuntimeControllerDeps): ShellController & { dispose(): void } {
  const { runtime } = deps;
  const listeners = new Set<() => void>();
  const thumbCache = new Map<string, string | null>();
  const thumbnail = deps.costumeThumbnail ?? costumeDataUrl;
  let running = false;
  let question: string | null = null;
  let monitors: readonly MonitorRecord[] = [...runtime.getMonitorState().values()];
  let dragTarget: ITarget | null = null;
  let snapshot: ShellSnapshot | null = null;

  const thumbFor = (c: Costume | undefined): string | null => {
    if (!c) return null;
    const key = `${c.assetId}.${c.dataFormat}`;
    if (!thumbCache.has(key)) thumbCache.set(key, thumbnail(c));
    return thumbCache.get(key) ?? null;
  };

  const viewOf = (t: ITarget): TargetView => {
    const costume = t.getCurrentCostume();
    return {
      id: t.id,
      name: t.isStage ? "Stage" : t.sprite.name,
      isStage: t.isStage,
      x: t.x,
      y: t.y,
      size: t.size,
      direction: t.direction,
      visible: t.visible,
      draggable: t.draggable,
      rotationStyle: t.rotationStyle,
      currentCostume: t.currentCostume,
      costumeCount: t.getCostumes().length,
      costumeName: costume?.name ?? "",
      thumbnailUrl: thumbFor(costume),
    };
  };

  const build = (): ShellSnapshot => {
    const originals = runtime.targets.filter((t) => t.isOriginal);
    const stage = originals.filter((t) => t.isStage);
    const sprites = originals.filter((t) => !t.isStage);
    return {
      targets: [...stage, ...sprites].map(viewOf),
      editingTargetId: runtime.getEditingTarget()?.id ?? null,
      running,
      turbo: runtime.turboMode,
      monitors,
      question,
    };
  };

  const invalidate = (): void => {
    snapshot = null;
    for (const l of [...listeners]) l();
  };

  const offs = [
    runtime.on("TARGETS_UPDATE", invalidate),
    runtime.on("EDITING_TARGET_CHANGED", invalidate),
    runtime.on("TARGET_WAS_CREATED", invalidate),
    runtime.on("TARGET_WAS_REMOVED", invalidate),
    runtime.on("PROJECT_LOADED", () => {
      thumbCache.clear();
      invalidate();
    }),
    runtime.on("PROJECT_RUN_START", () => {
      running = true;
      invalidate();
    }),
    runtime.on("PROJECT_RUN_STOP", () => {
      running = false;
      invalidate();
    }),
    runtime.on("TURBO_MODE_ON", invalidate),
    runtime.on("TURBO_MODE_OFF", invalidate),
    runtime.on("QUESTION", ({ question: q }) => {
      question = q;
      invalidate();
    }),
    runtime.on("MONITORS_UPDATE", ({ monitors: m }) => {
      monitors = [...m.values()];
      invalidate();
    }),
  ];

  const target = (id: string): ITarget => {
    const t = runtime.getTargetById(id);
    if (!t) throw new Error(`Target ${id} tidak ditemukan`);
    return t;
  };

  const varTarget = (targetId: string | null): ITarget | undefined =>
    targetId ? runtime.getTargetById(targetId) : runtime.getTargetForStage();

  const selectAfterLoad = (): void => {
    if (runtime.getEditingTarget()) return;
    const firstSprite = runtime.targets.find((t) => t.isOriginal && !t.isStage);
    runtime.setEditingTarget(firstSprite ?? runtime.getTargetForStage() ?? null);
  };

  const load = async (project: LoadedProjectLike): Promise<void> => {
    runtime.stopAll();
    const assets = new Map<string, Uint8Array>();
    for (const k of project.assets.keys()) {
      const v = project.assets.get(k);
      if (v) assets.set(k, v);
    }
    thumbCache.clear();
    await runtime.loadProject(project.model, deps.mediaLoader, assets);
    selectAfterLoad();
    invalidate();
  };

  return {
    getSnapshot() {
      snapshot ??= build();
      return snapshot;
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    greenFlag: () => runtime.greenFlag(),
    stopAll: () => runtime.stopAll(),
    setTurbo: (enabled) => runtime.setTurboMode(enabled),
    selectTarget(id) {
      runtime.setEditingTarget(target(id));
    },
    postSpriteInfo(patch: SpriteInfoPatch) {
      const t = dragTarget ?? runtime.getEditingTarget();
      if (!t) return;
      const has = (k: keyof SpriteInfoPatch): boolean => Object.prototype.hasOwnProperty.call(patch, k);
      // Urutan persis RenderedTarget.postSpriteInfo.
      if (has("x") || has("y")) t.setXY(patch.x ?? t.x, patch.y ?? t.y, patch.force ?? undefined);
      if (has("direction") && patch.direction !== undefined) t.setDirection(patch.direction);
      if (has("draggable") && patch.draggable !== undefined) t.setDraggable(patch.draggable);
      if (has("rotationStyle") && patch.rotationStyle !== undefined) t.setRotationStyle(patch.rotationStyle);
      if (has("visible") && patch.visible !== undefined) t.setVisible(patch.visible);
      if (has("size") && patch.size !== undefined) t.setSize(patch.size);
      runtime.emitProjectChanged();
    },
    renameSprite(id, newName) {
      const t = target(id);
      if (t.isStage) throw new Error("Stage tidak bisa diganti nama");
      const others = runtime.targets.filter((o) => !o.isStage && o.isOriginal && o.id !== t.id).map((o) => o.sprite.name);
      const resolved = resolveSpriteRename(newName, others);
      if (resolved === null) return;
      const old = t.sprite.name;
      t.sprite.name = resolved;
      if (resolved !== old) {
        runtime.requestTargetsUpdate(t);
        runtime.emit("TARGETS_UPDATE", { emitProjectChanged: true });
      }
    },
    async duplicateSprite(id) {
      const t = target(id);
      if (t.isStage) throw new Error("Stage tidak bisa diduplikat");
      const copy = await t.duplicate();
      runtime.addTarget(copy);
      copy.goBehindOther(t);
      runtime.setEditingTarget(copy);
    },
    deleteSprite(id) {
      const t = target(id);
      if (t.isStage) throw new Error("Stage tidak bisa dihapus");
      const indexBefore = runtime.targets.indexOf(t);
      for (const m of [...runtime.getMonitorState().values()]) {
        if (m.targetId === t.id) runtime.requestRemoveMonitor(m.id);
      }
      const editing = runtime.getEditingTarget();
      for (const clone of [...t.sprite.clones]) {
        runtime.stopForTarget(clone);
        runtime.disposeTarget(clone);
        if (clone === editing) {
          const next = runtime.targets[Math.min(runtime.targets.length - 1, indexBefore)];
          runtime.setEditingTarget(next ?? null);
        }
      }
      runtime.emit("TARGETS_UPDATE", { emitProjectChanged: true });
    },
    async addSprite(method, files) {
      if (!deps.assetActions) throw new FeatureUnavailableError(`addSprite:${method}`);
      await deps.assetActions.addSprite(method, files);
    },
    async addBackdrop(method, files) {
      if (!deps.assetActions) throw new FeatureUnavailableError(`addBackdrop:${method}`);
      await deps.assetActions.addBackdrop(method, files);
    },
    updateMonitor(partial) {
      runtime.requestUpdateMonitor(partial);
    },
    getVariableValue(targetId, variableId) {
      const v = varTarget(targetId)?.variables[variableId];
      if (!v) return undefined;
      return Array.isArray(v.value) ? v.value.slice() : v.value;
    },
    setVariableValue(targetId, variableId, value) {
      const v = varTarget(targetId)?.variables[variableId];
      if (!v) return;
      v.value = value;
      v._monitorUpToDate = false;
    },
    getVariableName(targetId, variableId) {
      return varTarget(targetId)?.variables[variableId]?.name;
    },
    answerQuestion(answer) {
      question = null;
      invalidate();
      runtime.emit("ANSWER", { answer });
    },
    postMouse: (d) => runtime.ioDevices.mouse.postData(d),
    postKeyboard: (d) => runtime.ioDevices.keyboard.postData(d),
    postWheel: (deltaY) => runtime.ioDevices.mouseWheel.postData({ deltaY }),
    pickTarget(x, y) {
      const r = runtime.renderer;
      if (!r) return null;
      const drawableId = r.pick(x, y);
      if (drawableId < 0) return null;
      return runtime.targets.find((t) => t.drawableId === drawableId)?.id ?? null;
    },
    getTargetDragInfo(id) {
      const t = runtime.getTargetById(id);
      return t ? { x: t.x, y: t.y, draggable: t.draggable, isStage: t.isStage } : null;
    },
    startDrag(id) {
      const t = runtime.getTargetById(id);
      if (!t) return;
      dragTarget = t;
      t.dragging = true;
    },
    stopDrag(id) {
      const t = runtime.getTargetById(id);
      if (!t) return;
      dragTarget = null;
      t.dragging = false;
      runtime.setEditingTarget(t.sprite.clones[0] ?? t);
    },
    goToFront(id) {
      runtime.getTargetById(id)?.goToFront();
    },
    attachStageCanvas: (c) => deps.onStageCanvas?.(c),
    resizeStage(w, h) {
      runtime.renderer?.resize(w, h);
    },
    async newProject() {
      await load(await deps.projectIO.defaultProject());
    },
    async loadProjectFile(file) {
      await load(await deps.projectIO.loadSb3(file.bytes));
    },
    async saveProjectFile() {
      const { model, assets } = runtimeToModel(runtime);
      return deps.projectIO.saveSb3(model, assets);
    },
    dispose() {
      for (const off of offs) off();
      listeners.clear();
    },
  };
}
