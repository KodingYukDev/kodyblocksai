/**
 * ShellController di memori untuk tes komponen dan pratinjau UI saat engine belum siap.
 * Perilaku sprite info memakai aturan yang sama dengan RenderedTarget tanpa renderer
 * (arah wrapClamp -179..180, tanpa fencing).
 */
import { MathUtil, type MonitorRecord, type ScratchValue } from "@kody/engine";
import { resolveSpriteRename } from "../sprite-pane/sprite-logic";
import type { AddMethod, PickedFile, ShellController, ShellSnapshot, SpriteInfoPatch, TargetView } from "./types";

export interface MockCall {
  method: string;
  args: unknown[];
}

export interface MockController extends ShellController {
  readonly calls: MockCall[];
  /** Ganti snapshot secara langsung (tes). */
  patch(partial: Partial<ShellSnapshot>): void;
  variables: Map<string, ScratchValue | ScratchValue[]>;
  /** Hasil pickTarget (tes drag panggung). */
  pickHandler: (x: number, y: number) => string | null;
}

const defaultTargets = (): TargetView[] => [
  {
    id: "stage",
    name: "Stage",
    isStage: true,
    x: 0,
    y: 0,
    size: 100,
    direction: 90,
    visible: true,
    draggable: false,
    rotationStyle: "all around",
    currentCostume: 0,
    costumeCount: 1,
    costumeName: "backdrop1",
    thumbnailUrl: null,
  },
  {
    id: "kody",
    name: "Kody",
    isStage: false,
    x: 0,
    y: 0,
    size: 100,
    direction: 90,
    visible: true,
    draggable: false,
    rotationStyle: "all around",
    currentCostume: 0,
    costumeCount: 1,
    costumeName: "kody",
    thumbnailUrl: null,
  },
];

export function createMockController(initial?: Partial<ShellSnapshot>): MockController {
  let snap: ShellSnapshot = {
    targets: defaultTargets(),
    editingTargetId: "kody",
    running: false,
    turbo: false,
    monitors: [],
    question: null,
    ...initial,
  };
  const listeners = new Set<() => void>();
  const calls: MockCall[] = [];
  const variables = new Map<string, ScratchValue | ScratchValue[]>();
  const varKey = (t: string | null, v: string): string => `${t ?? "stage"}:${v}`;
  let dragId: string | null = null;

  const set = (partial: Partial<ShellSnapshot>): void => {
    snap = { ...snap, ...partial };
    for (const l of [...listeners]) l();
  };
  const log = (method: string, ...args: unknown[]): void => {
    calls.push({ method, args });
  };
  const updateTarget = (id: string, fn: (t: TargetView) => TargetView): void => {
    set({ targets: snap.targets.map((t) => (t.id === id ? fn(t) : t)) });
  };

  const ctrl: MockController = {
    pickHandler: () => null,
    calls,
    variables,
    patch: set,
    getSnapshot: () => snap,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    greenFlag() {
      log("greenFlag");
      set({ running: true });
    },
    stopAll() {
      log("stopAll");
      set({ running: false });
    },
    setTurbo(enabled) {
      log("setTurbo", enabled);
      set({ turbo: enabled });
    },
    selectTarget(id) {
      log("selectTarget", id);
      set({ editingTargetId: id });
    },
    postSpriteInfo(p: SpriteInfoPatch) {
      log("postSpriteInfo", p);
      const id = dragId ?? snap.editingTargetId;
      if (!id) return;
      updateTarget(id, (t) => {
        if (t.isStage) return t;
        const n = { ...t };
        if (p.x !== undefined) n.x = p.x;
        if (p.y !== undefined) n.y = p.y;
        if (p.direction !== undefined && Number.isFinite(p.direction)) n.direction = MathUtil.wrapClamp(p.direction, -179, 180);
        if (p.visible !== undefined) n.visible = p.visible;
        if (p.draggable !== undefined) n.draggable = p.draggable;
        if (p.rotationStyle !== undefined) n.rotationStyle = p.rotationStyle;
        if (p.size !== undefined) n.size = p.size;
        return n;
      });
    },
    renameSprite(id, name) {
      log("renameSprite", id, name);
      const others = snap.targets.filter((t) => !t.isStage && t.id !== id).map((t) => t.name);
      const resolved = resolveSpriteRename(name, others);
      if (resolved !== null) updateTarget(id, (t) => ({ ...t, name: resolved }));
    },
    async duplicateSprite(id) {
      log("duplicateSprite", id);
    },
    deleteSprite(id) {
      log("deleteSprite", id);
      const idx = snap.targets.findIndex((t) => t.id === id);
      const targets = snap.targets.filter((t) => t.id !== id);
      const editing =
        snap.editingTargetId === id ? (targets[Math.min(targets.length - 1, idx)]?.id ?? null) : snap.editingTargetId;
      set({ targets, editingTargetId: editing });
    },
    async addSprite(method: AddMethod, files?: readonly PickedFile[]) {
      log("addSprite", method, files?.map((f) => f.name));
    },
    async addBackdrop(method: AddMethod, files?: readonly PickedFile[]) {
      log("addBackdrop", method, files?.map((f) => f.name));
    },
    updateMonitor(partial) {
      log("updateMonitor", partial);
      set({
        monitors: snap.monitors.map((m): MonitorRecord => (m.id === partial.id ? { ...m, ...partial } : m)),
      });
    },
    getVariableValue(t, v) {
      const val = variables.get(varKey(t, v));
      return Array.isArray(val) ? val.slice() : val;
    },
    setVariableValue(t, v, value) {
      log("setVariableValue", t, v, value);
      variables.set(varKey(t, v), value);
      set({ monitors: snap.monitors.map((m) => (m.id === v ? { ...m, value } : m)) });
    },
    getVariableName(_t, v) {
      return v;
    },
    answerQuestion(answer) {
      log("answerQuestion", answer);
      set({ question: null });
    },
    postMouse(d) {
      log("postMouse", d);
    },
    postKeyboard(d) {
      log("postKeyboard", d);
    },
    postWheel(dy) {
      log("postWheel", dy);
    },
    pickTarget(x, y) {
      log("pickTarget", x, y);
      return ctrl.pickHandler(x, y);
    },
    getTargetDragInfo(id) {
      const t = snap.targets.find((x) => x.id === id);
      return t ? { x: t.x, y: t.y, draggable: t.draggable, isStage: t.isStage } : null;
    },
    startDrag(id) {
      log("startDrag", id);
      dragId = id;
    },
    stopDrag(id) {
      log("stopDrag", id);
      dragId = null;
      set({ editingTargetId: id });
    },
    goToFront(id) {
      log("goToFront", id);
    },
    attachStageCanvas(c) {
      log("attachStageCanvas", c ? "canvas" : null);
    },
    resizeStage(w, h) {
      log("resizeStage", w, h);
    },
    async newProject() {
      log("newProject");
    },
    async loadProjectFile(f) {
      log("loadProjectFile", f.name);
    },
    async saveProjectFile() {
      log("saveProjectFile");
      return new Uint8Array([80, 75, 3, 4]);
    },
  };
  return ctrl;
}
