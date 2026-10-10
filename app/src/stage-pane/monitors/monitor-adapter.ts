/**
 * Label, kategori, warna, dan format nilai monitor. Port perilaku scratch-gui lib/monitor-adapter.js,
 * lib/opcode-labels.js, dan containers/monitor.jsx (availableModes). Lihat THIRD_PARTY.md.
 */
import type { MonitorMode, MonitorRecord, ScratchValue } from "@kody/engine";
import { CATEGORY_COLOURS, EXTENSION_COLOURS, UI_COLOURS } from "@kody/blocks-ui";
import type { MessageKey, Translate } from "../../shell/i18n";

export type MonitorCategory = "data" | "list" | "sensing" | "sound" | "looks" | "motion" | "extension";

type LabelFn = (params: Record<string, string>) => MessageKey | { raw: string } | undefined;

interface OpcodeLabel {
  category: MonitorCategory;
  labelFn: LabelFn;
}

const fixed =
  (key: MessageKey): LabelFn =>
  () =>
    key;

const CURRENT_MENU: Record<string, MessageKey> = {
  year: "label.year",
  month: "label.month",
  date: "label.date",
  dayofweek: "label.day of week",
  hour: "label.hour",
  minute: "label.minute",
  second: "label.second",
};

/** Tabel _opcodeMap scratch-gui. */
const OPCODE_LABELS: Record<string, OpcodeLabel> = {
  motion_direction: { category: "motion", labelFn: fixed("label.direction") },
  motion_xposition: { category: "motion", labelFn: fixed("label.x position") },
  motion_yposition: { category: "motion", labelFn: fixed("label.y position") },
  looks_size: { category: "looks", labelFn: fixed("label.size") },
  looks_costumenumbername: {
    category: "looks",
    labelFn: (p) => (p.NUMBER_NAME === "number" ? "label.costume number" : "label.costume name"),
  },
  looks_backdropnumbername: {
    category: "looks",
    labelFn: (p) => (p.NUMBER_NAME === "number" ? "label.backdrop number" : "label.backdrop name"),
  },
  looks_backdropname: { category: "looks", labelFn: fixed("label.backdrop name") },
  data_variable: { category: "data", labelFn: (p) => ({ raw: p.VARIABLE ?? "" }) },
  data_listcontents: { category: "list", labelFn: (p) => ({ raw: p.LIST ?? "" }) },
  sound_volume: { category: "sound", labelFn: fixed("label.volume") },
  sound_tempo: { category: "sound", labelFn: fixed("label.tempo") },
  sensing_answer: { category: "sensing", labelFn: fixed("label.answer") },
  sensing_loudness: { category: "sensing", labelFn: fixed("label.loudness") },
  sensing_username: { category: "sensing", labelFn: fixed("label.username") },
  sensing_current: {
    category: "sensing",
    labelFn: (p) => CURRENT_MENU[(p.CURRENTMENU ?? "").toLowerCase()],
  },
  sensing_timer: { category: "sensing", labelFn: fixed("label.timer") },
};

/** Label monitor ekstensi (padanan runtime.getLabelForOpcode). */
export type ExtensionLabelResolver = (opcode: string) => { label: string; category?: MonitorCategory } | undefined;

export interface AdaptedMonitor {
  label: string;
  category: MonitorCategory;
  value: string | string[];
}

/**
 * Padanan monitorAdapter: label (+ "Sprite: " untuk monitor lokal), angka dibulatkan 6 desimal,
 * boolean jadi string, item list jadi string.
 */
export function adaptMonitor(
  record: Pick<MonitorRecord, "opcode" | "params" | "spriteName" | "value">,
  t: Translate,
  extensionLabel?: ExtensionLabelResolver,
): AdaptedMonitor {
  let label: string;
  let category: MonitorCategory;
  const ext = extensionLabel?.(record.opcode);
  const known = OPCODE_LABELS[record.opcode];
  if (ext) {
    label = ext.label;
    category = ext.category ?? "extension";
  } else if (known) {
    category = known.category;
    const res = known.labelFn(record.params);
    // scratch-gui: labelFn yang tidak cocok mengembalikan undefined -> label kosong.
    label = res === undefined ? "" : typeof res === "string" ? t(res) : res.raw;
  } else {
    category = "extension";
    label = record.opcode;
  }
  if (record.spriteName) label = `${record.spriteName}: ${label}`;
  return { label, category, value: formatMonitorValue(record.value) };
}

export function formatMonitorValue(value: ScratchValue | ScratchValue[]): string | string[] {
  if (Array.isArray(value)) return value.map((item) => item.toString());
  if (typeof value === "number") return String(Number(value.toFixed(6)));
  if (typeof value === "boolean") return value.toString();
  return value;
}

/** Warna latar nilai monitor per kategori (categoryColorMap scratch-gui). */
export function getCategoryColor(category: MonitorCategory): { background: string; text: string } {
  const map: Record<MonitorCategory, string> = {
    data: CATEGORY_COLOURS.data.primary,
    list: CATEGORY_COLOURS.data_lists.primary,
    sensing: CATEGORY_COLOURS.sensing.primary,
    sound: CATEGORY_COLOURS.sounds.primary,
    looks: CATEGORY_COLOURS.looks.primary,
    motion: CATEGORY_COLOURS.motion.primary,
    extension: EXTENSION_COLOURS.primary,
  };
  return { background: map[category], text: UI_COLOURS.text };
}

export const MONITOR_MODES: readonly MonitorMode[] = ["default", "large", "slider", "list"];

/** availableModes scratch-gui. */
export function availableModes(opcode: string): MonitorMode[] {
  return MONITOR_MODES.filter((m) => {
    if (opcode === "data_variable") return m !== "list";
    if (opcode === "data_listcontents") return m === "list";
    return m !== "slider" && m !== "list";
  });
}

/** handleNextMode (klik ganda monitor). */
export function nextMonitorMode(opcode: string, mode: MonitorMode): MonitorMode {
  const modes = availableModes(opcode);
  const idx = modes.indexOf(mode);
  return modes[(idx + 1) % modes.length] ?? mode;
}

/** handleSliderPromptOk: min/max ditukar bila terbalik. */
export function normalizeSliderRange(min: number, max: number): { sliderMin: number; sliderMax: number } {
  return { sliderMin: Math.min(min, max), sliderMax: Math.max(min, max) };
}

/** Step input range slider monitor. */
export function sliderStep(isDiscrete: boolean): number {
  return isDiscrete ? 1 : 0.01;
}

/** Isi awal dialog rentang slider (containers/slider-prompt.jsx). */
export function sliderPromptInitial(min: number, max: number, isDiscrete: boolean): { minText: string; maxText: string } {
  const digits = isDiscrete ? 0 : 2;
  return { minText: min.toFixed(digits), maxText: max.toFixed(digits) };
}

/**
 * handleOk dialog rentang slider: validasi isFinite (string, seperti JS global isFinite),
 * diskrit bila kedua isian tanpa titik. null = batal.
 */
export function parseSliderPrompt(minText: string, maxText: string): { min: number; max: number; isDiscrete: boolean } | null {
  const finite = (s: string): boolean => Number.isFinite(Number(s));
  if (!finite(minText) || !finite(maxText)) return null;
  return {
    min: parseFloat(minText),
    max: parseFloat(maxText),
    isDiscrete: minText.indexOf(".") + maxText.indexOf(".") === -2,
  };
}
