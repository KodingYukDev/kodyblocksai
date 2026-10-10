/**
 * Connection DB: kumpulkan titik sambungan semua stack di workspace (kecuali stack yang diseret),
 * dan sambungan lokal stack yang diseret. Padanan Blockly.ConnectionDB + getConnections_.
 */
import { getBlockInfo, type BlockInfo } from "./block-info";
import {
  connectionsOf,
  forEachPlacement,
  layoutBlock,
  layoutStack,
  type ConnPoint,
  type LayoutDeps,
  type Placement,
} from "./layout";
import { getLastInStack, getTopBlocks } from "./tree";

export function blockPosition(deps: LayoutDeps, topId: string): { x: number; y: number } {
  const b = deps.blocks[topId];
  return { x: b?.x ?? 0, y: b?.y ?? 0 };
}

/** Semua placement (blok + posisi absolut) di workspace. */
export function allPlacements(deps: LayoutDeps): Placement[] {
  const out: Placement[] = [];
  for (const top of getTopBlocks(deps.blocks)) {
    const { x, y } = blockPosition(deps, top);
    forEachPlacement(layoutStack(deps, top), x, y, (p) => out.push(p));
  }
  return out;
}

/** Kandidat sambungan di workspace, tanpa blok yang sedang diseret. */
export function collectCandidates(deps: LayoutDeps, exclude: ReadonlySet<string>): ConnPoint[] {
  const out: ConnPoint[] = [];
  for (const p of allPlacements(deps)) {
    if (exclude.has(p.layout.id)) continue;
    out.push(...connectionsOf(deps.blocks, p));
  }
  // ConnectionDB terurut y (pencarian maju-mundur); urutan stabil untuk hasil seri.
  return out.sort((a, b) => a.y - b.y);
}

/** Sambungan lokal stack yang diseret pada posisi awalnya (x, y). */
export function draggedConnections(deps: LayoutDeps, topId: string, x: number, y: number) {
  const stack = layoutStack(deps, topId);
  const placements: Placement[] = [];
  forEachPlacement(stack, x, y, (p) => placements.push(p));
  const topPlacement = placements.find((p) => p.layout.id === topId);
  const topConns = topPlacement ? connectionsOf(deps.blocks, topPlacement) : [];
  const lastId = getLastInStack(deps.blocks, topId);
  let lastOnStack: ConnPoint | null = null;
  if (lastId !== topId) {
    const lastPlacement = placements.find((p) => p.layout.id === lastId);
    if (lastPlacement) lastOnStack = connectionsOf(deps.blocks, lastPlacement).find((c) => c.type === "next") ?? null;
  }
  return { topConns, lastOnStack, stack, placements };
}

/** Pembuat fungsi info(id) dengan cache per render. */
export function infoGetter(deps: LayoutDeps): (id: string) => BlockInfo {
  const cache = new Map<string, BlockInfo>();
  return (id) => {
    let info = cache.get(id);
    if (!info) {
      const block = deps.blocks[id];
      if (!block) throw new Error(`info: blok ${id} tidak ada`);
      const parent = block.parent ? deps.blocks[block.parent] : undefined;
      const inInput =
        !!parent && Object.entries(parent.inputs).some(([name, inp]) => inp.block === id && !name.startsWith("SUBSTACK"));
      info = getBlockInfo(block, deps.lookup, inInput);
      cache.set(id, info);
    }
    return info;
  };
}

export { layoutBlock };
