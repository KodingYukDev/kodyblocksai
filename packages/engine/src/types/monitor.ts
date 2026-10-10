/**
 * Monitor (scratch-vm engine/monitor-record.js). Disimpan runtime dalam Map id -> record.
 * UI monitor (kotak variabel/list di panggung) milik app.
 */
import type { MonitorMode, ScratchValue } from "./project-model";

export interface MonitorRecord {
  id: string;
  /** Untuk monitor sprite-spesifik (x position, variabel lokal), null untuk global. */
  spriteName: string | null;
  targetId: string | null;
  opcode: string;
  params: Record<string, string>;
  value: ScratchValue | ScratchValue[];
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  visible: boolean;
  mode: MonitorMode;
  sliderMin: number;
  sliderMax: number;
  isDiscrete: boolean;
}

export const DEFAULT_MONITOR: Omit<MonitorRecord, "id" | "opcode"> = {
  spriteName: null,
  targetId: null,
  params: {},
  value: "",
  width: 0,
  height: 0,
  x: null,
  y: null,
  visible: true,
  mode: "default",
  sliderMin: 0,
  sliderMax: 100,
  isDiscrete: true,
};
