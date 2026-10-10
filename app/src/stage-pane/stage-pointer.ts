/**
 * Mesin status mouse/sentuh panggung. Port perilaku scratch-gui containers/stage.jsx:
 * postIOData('mouse') di setiap down/move/up, drag sprite setelah bergerak > 3px atau ditahan 400 ms,
 * drag membawa sprite ke depan, posisi selama drag dikirim dengan force=true.
 * Penyimpangan: gaya drag editor (kanvas salinan, sprite disembunyikan selama drag) belum ada;
 * di sini posisi diperbarui terus seperti gaya player. Lihat open issue app-shell.
 */
import type { ShellController } from "../shell/types";
import {
  canvasToStagePoint,
  computeDragOffset,
  DRAG_HOLD_MS,
  dragPosition,
  exceedsDragThreshold,
  getScratchCoords,
} from "./stage-geometry";

export interface StageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface StagePointerEnv {
  controller: Pick<
    ShellController,
    "postMouse" | "postWheel" | "pickTarget" | "getTargetDragInfo" | "startDrag" | "stopDrag" | "goToFront" | "postSpriteInfo"
  >;
  getRect(): StageRect;
  /** true di editor: semua sprite bisa diseret (useEditorDragStyle). false = hanya yang draggable. */
  editorDragStyle: boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface StagePointer {
  down(clientX: number, clientY: number, primary: boolean): void;
  move(clientX: number, clientY: number): void;
  up(clientX: number, clientY: number): void;
  wheel(deltaY: number): void;
  readonly isDragging: boolean;
  readonly dragId: string | null;
  dispose(): void;
}

export function createStagePointer(env: StagePointerEnv): StagePointer {
  const setTimer = env.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = env.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const c = env.controller;
  let rect: StageRect = env.getRect();
  let mouseDown = false;
  let mouseDownPos: [number, number] | null = null;
  let holdTimer: unknown = null;
  let dragging = false;
  let dragId: string | null = null;
  let dragOffset: [number, number] = [0, 0];

  const cancelHold = (): void => {
    if (holdTimer !== null) clearTimer(holdTimer);
    holdTimer = null;
  };

  const startDrag = (x: number, y: number): void => {
    if (dragId) return;
    const [sx, sy] = canvasToStagePoint(x, y, rect.width, rect.height);
    const id = c.pickTarget(sx, sy);
    if (id === null) return;
    const info = c.getTargetDragInfo(id);
    if (!info) return;
    if (!(env.editorDragStyle || info.draggable)) return;
    // Stage tidak bergerak (setXY stage diabaikan) tetapi tetap "diseret" seperti scratch-gui.
    if (!info.isStage) c.goToFront(id);
    dragOffset = computeDragOffset(info.x, info.y, getScratchCoords(x, y, rect.width, rect.height));
    c.startDrag(id);
    dragging = true;
    dragId = id;
  };

  const stopDrag = (): void => {
    const id = dragId;
    dragging = false;
    dragId = null;
    if (id) c.stopDrag(id);
  };

  return {
    get isDragging() {
      return dragging;
    },
    get dragId() {
      return dragId;
    },
    down(clientX, clientY, primary) {
      rect = env.getRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (primary) {
        mouseDown = true;
        mouseDownPos = [x, y];
        cancelHold();
        holdTimer = setTimer(() => {
          holdTimer = null;
          startDrag(x, y);
        }, DRAG_HOLD_MS);
      }
      c.postMouse({ isDown: true, x, y, canvasWidth: rect.width, canvasHeight: rect.height });
    },
    move(clientX, clientY) {
      rect = env.getRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (mouseDown && !dragging && mouseDownPos && exceedsDragThreshold([x, y], mouseDownPos)) {
        cancelHold();
        startDrag(mouseDownPos[0], mouseDownPos[1]);
      }
      if (mouseDown && dragging) {
        const pos = dragPosition(getScratchCoords(x, y, rect.width, rect.height), dragOffset);
        c.postSpriteInfo({ x: pos.x, y: pos.y, force: true });
      }
      c.postMouse({ x, y, canvasWidth: rect.width, canvasHeight: rect.height });
    },
    up(clientX, clientY) {
      rect = env.getRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      cancelHold();
      mouseDown = false;
      mouseDownPos = null;
      const wasDragged = dragging;
      if (dragging) stopDrag();
      c.postMouse({ isDown: false, x, y, canvasWidth: rect.width, canvasHeight: rect.height, wasDragged });
    },
    wheel(deltaY) {
      c.postWheel(deltaY);
    },
    dispose() {
      cancelHold();
    },
  };
}

/**
 * Kunci keyboard untuk IO (vm-listener-hoc): event.key, atau keyCode bila key kosong/"Dead".
 * Kontrak KeyboardData.key berupa string, jadi keyCode dikirim sebagai karakternya.
 */
export function keyForIO(e: { key?: string; keyCode?: number }): string | null {
  if (e.key && e.key !== "Dead") return e.key;
  if (typeof e.keyCode === "number" && e.keyCode > 0) return String.fromCharCode(e.keyCode);
  return null;
}

/** Spasi & panah dicegah agar halaman tidak menggulir (keyCode 32, 37-40). */
export function shouldPreventKeyScroll(keyCode: number): boolean {
  return keyCode === 32 || (keyCode >= 37 && keyCode <= 40);
}
