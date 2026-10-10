/**
 * MouseWheel (padanan scratch-vm 4.8.102 io/mouseWheel.js, BSD-3-Clause; lihat THIRD_PARTY.md):
 * scroll -> hat "when [up/down arrow] key pressed". Pemilik: agent engine-core.
 */
import type { IMouseWheel } from "../types/io";
import type { IRuntime } from "../types/runtime";

export class MouseWheel implements IMouseWheel {
  constructor(private readonly runtime: IRuntime) {}

  postData(data: { deltaY: number }): void {
    let key: string;
    if (data.deltaY < 0) key = "up arrow";
    else if (data.deltaY > 0) key = "down arrow";
    else return;
    this.runtime.startHats("event_whenkeypressed", { KEY_OPTION: key });
  }
}

export function createMouseWheel(runtime: IRuntime): IMouseWheel {
  return new MouseWheel(runtime);
}
