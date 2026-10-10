/**
 * Pratinjau saat drag (InsertionMarkerManager): insertion marker abu-abu = salinan blok yang akan
 * tersambung, disambungkan ke peta blok TIRUAN memakai logika connect yang sama dengan drop,
 * sehingga blok di bawahnya ikut bergeser seperti Scratch. Untuk reporter (output) tidak ada
 * marker; input tujuan disorot (highlightForReplacement / highlightShapeForInput).
 */
import type { Block } from "@kody/engine";
import { infoGetter } from "./connections";
import type { DragPreview } from "./drag";
import type { LayoutDeps } from "./layout";
import { connectEvents } from "./ops";
import { BlockReducer } from "./reducer";
import { getDescendants, type BlockMap } from "./tree";

export const MARKER_PREFIX = "__marker__";

export interface PreviewState {
  blocks: Record<string, Block>;
  /** id marker (digambar abu-abu), null untuk reporter. */
  markerId: string | null;
  /** Input yang disorot untuk reporter: blok induk + nama input. */
  highlight: { blockId: string; input: string } | null;
}

/** Salinan satu blok (tanpa next, tanpa isi input non-shadow) sebagai marker. */
function markerCopy(blocks: BlockMap, id: string): Block[] {
  const src = blocks[id];
  if (!src) return [];
  const out: Block[] = [];
  const rootId = MARKER_PREFIX + id;
  const root: Block = JSON.parse(JSON.stringify(src)) as Block;
  root.id = rootId;
  root.next = null;
  root.parent = null;
  root.topLevel = true;
  out.push(root);
  for (const name of Object.keys(root.inputs)) {
    const inp = root.inputs[name];
    if (!inp) continue;
    if (inp.shadow && blocks[inp.shadow]) {
      for (const sid of getDescendants(blocks, inp.shadow, false)) {
        const s = JSON.parse(JSON.stringify(blocks[sid])) as Block;
        s.id = MARKER_PREFIX + sid;
        s.parent = s.parent ? MARKER_PREFIX + s.parent : null;
        for (const k of Object.keys(s.inputs)) {
          const si = s.inputs[k];
          if (si) {
            si.block = si.block ? MARKER_PREFIX + si.block : null;
            si.shadow = si.shadow ? MARKER_PREFIX + si.shadow : null;
          }
        }
        out.push(s);
      }
      inp.block = MARKER_PREFIX + inp.shadow;
      inp.shadow = MARKER_PREFIX + inp.shadow;
    } else {
      inp.block = null;
      inp.shadow = null;
    }
  }
  return out;
}

/**
 * Hitung peta blok pratinjau. `blocks` = keadaan workspace TANPA stack yang diseret.
 * `localOffset` = posisi sambungan lokal relatif terhadap pojok blok pemiliknya.
 */
export function buildPreview(
  deps: LayoutDeps,
  dragged: ReadonlySet<string>,
  preview: DragPreview,
  localOffset: { x: number; y: number },
): PreviewState {
  const base: Block[] = Object.values(deps.blocks).filter((b) => !dragged.has(b.id));
  const reducer = new BlockReducer(base);
  if (preview.local.type === "output") {
    return {
      blocks: reducer.blocks,
      markerId: null,
      highlight: preview.closest.input ? { blockId: preview.closest.blockId, input: preview.closest.input } : null,
    };
  }
  const marker = markerCopy(deps.blocks, preview.local.blockId);
  const root = marker[0];
  if (!root) return { blocks: reducer.blocks, markerId: null, highlight: null };
  root.x = preview.closest.x - localOffset.x;
  root.y = preview.closest.y - localOffset.y;
  for (const b of marker) reducer.create(b);
  const markerDeps: LayoutDeps = { ...deps, blocks: reducer.blocks };
  const local = { ...preview.local, blockId: root.id, occupant: null };
  const events = connectEvents(reducer.blocks, infoGetter(markerDeps), root.id, local, preview.closest);
  for (const ev of events) reducer.apply(ev);
  return { blocks: reducer.blocks, markerId: root.id, highlight: null };
}
