/**
 * Titik masuk workspace blok. `packages/blocks-ui/src/workspace.ts` (milik integrator) cukup
 * me-re-export createWorkspace dari sini.
 */
import type { IRuntime } from "@kody/engine";
import type { BlocksEditorProps, WorkspaceController } from "../types";
import { BlocksWorkspace, type WorkspaceExtras } from "./editor";

export function createWorkspace(host: HTMLElement, props: BlocksEditorProps, extras?: WorkspaceExtras): WorkspaceController & {
  /** Ganti target yang diedit (null = editing target runtime). */
  reload(targetId?: string | null): void;
  setLocale(locale: "id" | "en"): void;
  readonly runtime: IRuntime;
} {
  return new BlocksWorkspace(host, props.runtime, props, extras);
}

export { BlocksWorkspace };
export type { WorkspaceExtras };
export { getBlockInfo, splitProccode, readProcedureMutation } from "./block-info";
export type { BlockInfo, ConnCheck, RowSpec, RowItem } from "./block-info";
export { layoutBlock, layoutStack, connectionsOf } from "./layout";
export type { BlockLayout, StackLayout, ConnPoint, LayoutDeps } from "./layout";
export { DragSession } from "./drag";
export { isConnectionAllowed, getCandidate, SnapTracker, SNAP_RADIUS, CONNECTING_SNAP_RADIUS } from "./snap";
export { connectEvents, unplugEvents, deleteBlockEvents, copyTree } from "./ops";
export { UndoStack, inverseOf } from "./undo";
export { cleanUpEvents } from "./cleanup";
export { partsToProcedure, createDefinitionBlocks, createCallBlocks } from "./procedures";
export { validateVariableName, variableDropdownOptions } from "./variables";
export { BlockReducer } from "./reducer";
