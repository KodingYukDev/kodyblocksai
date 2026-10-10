/**
 * "Clean up Blocks" = WorkspaceSvg.cleanUp scratch-blocks: urutkan blok top-level dengan
 * getTopBlocks(ordered) (y + sin(3 derajat) * x), tumpuk di x=0 mulai y=0 dengan jarak MIN_BLOCK_Y.
 */
import type { EditorWorkspaceEvent } from "@kody/engine";
import { layoutStack, MIN_BLOCK_Y, type LayoutDeps } from "./layout";
import { moveToEvent } from "./ops";
import { getTopBlocks, type BlockMap } from "./tree";

export const SCAN_ANGLE = 3;

/** Urutan blok top-level seperti Workspace.getTopBlocks(true) (LTR). */
export function orderedTopBlocks(blocks: BlockMap): string[] {
  const offset = Math.sin((SCAN_ANGLE * Math.PI) / 180);
  return getTopBlocks(blocks)
    .map((id, index) => ({ id, index, b: blocks[id] }))
    .sort((a, b) => {
      const ka = (a.b?.y ?? 0) + offset * (a.b?.x ?? 0);
      const kb = (b.b?.y ?? 0) + offset * (b.b?.x ?? 0);
      return ka - kb || a.index - b.index;
    })
    .map((e) => e.id);
}

export function cleanUpEvents(deps: LayoutDeps): EditorWorkspaceEvent[] {
  const events: EditorWorkspaceEvent[] = [];
  let cursorY = 0;
  for (const id of orderedTopBlocks(deps.blocks)) {
    const b = deps.blocks[id];
    if (!b) continue;
    if ((b.x ?? 0) !== 0 || (b.y ?? 0) !== cursorY) events.push(moveToEvent(id, { x: 0, y: cursorY }));
    cursorY += layoutStack(deps, id).height + MIN_BLOCK_Y;
  }
  return events;
}
