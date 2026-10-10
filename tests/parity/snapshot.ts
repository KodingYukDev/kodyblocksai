/**
 * Format jejak (trace) per frame yang dibandingkan antara scratch-vm dan engine kita.
 * Kedua sisi diubah ke `TargetView` dulu agar fungsi snapshot-nya SATU (tidak ada bias).
 */
import type { GeometryWorld } from "./geometry-renderer";

export interface BubbleSnapshot {
  type: string;
  text: string;
}

export interface TargetSnapshot {
  name: string;
  isStage: boolean;
  isOriginal: boolean;
  x: number;
  y: number;
  direction: number;
  size: number;
  visible: boolean;
  currentCostume: number;
  volume: number;
  rotationStyle: string;
  draggable: boolean;
  /** Indeks global di daftar gambar GeometryWorld (bawah -> atas), -1 bila tidak ada drawable. */
  layer: number;
  effects: Record<string, number>;
  /** `${"var"|"list"}:${nama}` -> nilai (salinan list). */
  variables: Record<string, unknown>;
  /** Balon say/think aktif (custom state "Scratch.looks"), null bila kosong. */
  bubble: BubbleSnapshot | null;
}

export interface MonitorSnapshot {
  id: string;
  visible: boolean;
  value: unknown;
}

export interface FrameSnapshot {
  frame: number;
  threads: number;
  targets: TargetSnapshot[];
  /** Event SAY yang dipancarkan selama frame ini. */
  says: { target: string; type: string; text: string }[];
  /** Pertanyaan (ask) yang dipancarkan selama frame ini. */
  questions: string[];
  monitors: MonitorSnapshot[];
}

/** Pandangan netral atas satu target (diisi oleh adaptor oracle / engine). */
export interface TargetView {
  name: string;
  isStage: boolean;
  isOriginal: boolean;
  x: number;
  y: number;
  direction: number;
  size: number;
  visible: boolean;
  currentCostume: number;
  volume: number;
  rotationStyle: string;
  draggable: boolean;
  drawableId: number | undefined | null;
  effects: Record<string, number>;
  variables: { name: string; type: string; value: unknown }[];
  bubble: { type?: unknown; text?: unknown } | undefined | null;
}

function cloneValue(v: unknown): unknown {
  return Array.isArray(v) ? [...(v as unknown[])] : v;
}

export function snapshotTarget(t: TargetView, world: GeometryWorld): TargetSnapshot {
  const variables: Record<string, unknown> = {};
  for (const v of t.variables) {
    if (v.type === "broadcast_msg") continue;
    variables[`${v.type === "list" ? "list" : "var"}:${v.name}`] = cloneValue(v.value);
  }
  const text = t.bubble?.text;
  const bubble =
    t.bubble && typeof text === "string" && text !== "" ? { type: String(t.bubble.type), text } : null;
  return {
    name: t.name,
    isStage: t.isStage,
    isOriginal: t.isOriginal,
    x: t.x,
    y: t.y,
    direction: t.direction,
    size: t.size,
    visible: t.visible,
    currentCostume: t.currentCostume,
    volume: t.volume,
    rotationStyle: t.rotationStyle,
    draggable: t.draggable,
    layer: typeof t.drawableId === "number" && t.drawableId >= 0 ? world.getDrawableOrder(t.drawableId) : -1,
    effects: { ...t.effects },
    variables,
    bubble,
  };
}

export function sortMonitors(list: MonitorSnapshot[]): MonitorSnapshot[] {
  return [...list].sort((a, c) => (a.id < c.id ? -1 : a.id > c.id ? 1 : 0));
}
