/** KHUSUS TES: simulasi drag/drop lengkap di atas VmBlocksSim. */
import type { EditorWorkspaceEvent } from "@kody/engine";
import { allPlacements } from "../connections";
import { DragSession, type DropResult } from "../drag";
import { unplugEvents } from "../ops";
import type { Vec } from "../snap";
import { testDeps } from "./fixtures";
import type { VmBlocksSim } from "./vm-blocks";

export function absolutePosition(sim: VmBlocksSim, id: string): Vec {
  const p = allPlacements(testDeps(sim.blocks)).find((pl) => pl.layout.id === id);
  if (!p) throw new Error(`posisi ${id} tidak ditemukan`);
  return { x: p.x, y: p.y };
}

export interface DragOutcome {
  events: EditorWorkspaceEvent[];
  result: DropResult;
}

/** Seret blok `id` (beserta blok di bawahnya) sehingga pojok kiri-atasnya berada di `to`. */
export function dragTo(sim: VmBlocksSim, id: string, to: Vec, overDelete = false): DragOutcome {
  const events: EditorWorkspaceEvent[] = [];
  const from = absolutePosition(sim, id);
  for (const ev of unplugEvents(sim.blocks, id, from)) {
    events.push(ev);
    sim.apply(ev);
  }
  const session = new DragSession(testDeps(sim.blocks), id);
  const dxy = { x: to.x - session.start.x, y: to.y - session.start.y };
  session.move({ x: dxy.x / 2, y: dxy.y / 2 }, overDelete);
  const result = session.drop(dxy, overDelete);
  if (result.kind === "events") {
    for (const ev of result.events) {
      events.push(ev);
      sim.apply(ev);
    }
  }
  return { events, result };
}

/** Urutan id stack mulai id. */
export function stackIds(sim: VmBlocksSim, id: string | null): string[] {
  const out: string[] = [];
  let cur = id;
  while (cur && sim.blocks[cur]) {
    out.push(cur);
    cur = sim.blocks[cur]?.next ?? null;
  }
  return out;
}
