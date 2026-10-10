/**
 * Sesi seret satu stack (padanan Blockly.BlockDragger + InsertionMarkerManager), murni tanpa DOM.
 * Dipanggil setelah stack sudah top-level (di-unplug / baru dibuat dari palet).
 */
import type { EditorWorkspaceEvent } from "@kody/engine";
import { collectCandidates, draggedConnections, infoGetter } from "./connections";
import type { ConnPoint, LayoutDeps } from "./layout";
import { blockingProcedure, connectEvents, moveToEvent } from "./ops";
import { availableConnections, shouldReplace, SnapTracker, type SnapContext, type Vec } from "./snap";
import { getDescendants } from "./tree";

export interface DragPreview {
  local: ConnPoint;
  closest: ConnPoint;
  /** true = mengganti (reporter di input / terminal menimpa terminal), false = menyisip. */
  replace: boolean;
}

export type DropResult =
  | { kind: "events"; events: EditorWorkspaceEvent[] }
  /** Menghapus define yang masih dipakai: ditolak (Blockly.Msg.PROCEDURE_USED). */
  | { kind: "refused"; proccode: string };

export class DragSession {
  readonly topId: string;
  readonly start: Vec;
  readonly dragged: ReadonlySet<string>;
  private readonly tracker: SnapTracker;
  private readonly ctx: SnapContext;
  private preview: DragPreview | null = null;

  constructor(
    private readonly deps: LayoutDeps,
    topId: string,
  ) {
    this.topId = topId;
    const top = deps.blocks[topId];
    this.start = { x: top?.x ?? 0, y: top?.y ?? 0 };
    this.dragged = new Set(getDescendants(deps.blocks, topId));
    const info = infoGetter(deps);
    this.ctx = { blocks: deps.blocks, info, topId, dragged: this.dragged };
    const { topConns, lastOnStack } = draggedConnections(deps, topId, this.start.x, this.start.y);
    const locals = availableConnections(topConns, lastOnStack);
    const candidates = collectCandidates(deps, this.dragged);
    this.tracker = new SnapTracker(this.ctx, locals, candidates);
  }

  /** Geser sejauh dxy (unit workspace) dari posisi awal. */
  move(dxy: Vec, overDeleteArea: boolean): DragPreview | null {
    const active = this.tracker.update(dxy, overDeleteArea);
    this.preview = active ? { ...active, replace: shouldReplace(this.ctx, active.local, active.closest) } : null;
    return this.preview;
  }

  get currentPreview(): DragPreview | null {
    return this.preview;
  }

  drop(dxy: Vec, overDeleteArea: boolean): DropResult {
    if (overDeleteArea) {
      const blocking = blockingProcedure(this.deps.blocks, this.topId);
      if (blocking !== null) return { kind: "refused", proccode: blocking };
      return { kind: "events", events: [{ type: "delete", blockId: this.topId }] };
    }
    const preview = this.move(dxy, false);
    const events: EditorWorkspaceEvent[] = [moveToEvent(this.topId, { x: this.start.x + dxy.x, y: this.start.y + dxy.y })];
    if (preview) {
      events.push(...connectEvents(this.deps.blocks, this.ctx.info, this.topId, preview.local, preview.closest));
    }
    return { kind: "events", events };
  }
}
