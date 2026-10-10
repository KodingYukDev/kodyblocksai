/**
 * Glow skrip per frame (padanan Runtime._updateGlows / quietGlow scratch-vm 4.8.102, BSD-3-Clause)
 * dan status run project (_emitProjectRunStatus). Pemilik: agent engine-core.
 */
import type { BlockField } from "./types/project-model";
import type { IBlocksContainer, IThread } from "./types/runtime";
import type { ITarget } from "./types/target";

export class GlowTracker {
  private previousFrame: string[] = [];
  private nonMonitorThreadCount = 0;

  constructor(
    private readonly glowScript: (topBlockId: string, isGlowing: boolean) => void,
    private readonly onRunStatus: (running: boolean) => void,
  ) {}

  /** Bandingkan skrip yang meminta glow frame ini dengan frame sebelumnya; kirim ON/OFF. */
  update(threads: readonly IThread[], editingTarget: ITarget | null, flyoutBlocks: IBlocksContainer): void {
    const requested: string[] = [];
    const finalGlows: string[] = [];
    for (const thread of threads) {
      const target = thread.target;
      if (target !== editingTarget) continue;
      const blockForThread = thread.blockGlowInFrame;
      if ((thread.requestScriptGlowInFrame || thread.stackClick) && blockForThread) {
        const script = target.blocks.getTopLevelScript(blockForThread) ?? flyoutBlocks.getTopLevelScript(blockForThread);
        if (script) requested.push(script);
      }
    }
    for (const prev of this.previousFrame) {
      if (requested.indexOf(prev) < 0) this.glowScript(prev, false);
      else finalGlows.push(prev);
    }
    for (const current of requested) {
      if (this.previousFrame.indexOf(current) < 0) {
        this.glowScript(current, true);
        finalGlows.push(current);
      }
    }
    this.previousFrame = finalGlows;
  }

  reset(): void {
    this.previousFrame = [];
  }

  quiet(scriptBlockId: string): void {
    const i = this.previousFrame.indexOf(scriptBlockId);
    if (i > -1) this.previousFrame.splice(i, 1);
  }

  /** PROJECT_RUN_START saat 0 -> >0 thread non-monitor, PROJECT_RUN_STOP saat >0 -> 0. */
  updateRunStatus(threads: readonly IThread[]): void {
    const count = threads.length - threads.filter((t) => t.updateMonitor).length;
    if (this.nonMonitorThreadCount === 0 && count > 0) this.onRunStatus(true);
    if (this.nonMonitorThreadCount > 0 && count === 0) this.onRunStatus(false);
    this.nonMonitorThreadCount = count;
  }
}

/** Salinan field dengan nilai string dinaikkan ke huruf besar (RuntimeScriptCache). */
export function upperFields(fields: Record<string, BlockField>): Record<string, BlockField> {
  const out: Record<string, BlockField> = {};
  for (const key in fields) {
    const f = fields[key];
    if (!f) continue;
    out[key] = { ...f, value: typeof f.value === "string" ? f.value.toUpperCase() : f.value };
  }
  return out;
}
