/**
 * Ambil ProjectModel + asset dari runtime yang sedang berjalan (untuk "Simpan ke komputer").
 * Mengikuti sb3.serialize scratch-vm: hanya target asli (tanpa clone), monitor apa adanya
 * (field slider hanya untuk mode non-list ditangani serializer), ekstensi = prefix opcode non-core.
 */
import type { AssetData, IRuntime, ITarget, MonitorRecord, MonitorState, ProjectModel, TargetState } from "@kody/engine";

/** Prefix opcode bawaan (bukan ekstensi), sama dengan CORE_EXTENSIONS + kategori internal scratch-vm. */
export const CORE_OPCODE_PREFIXES: readonly string[] = [
  "argument",
  "control",
  "data",
  "event",
  "looks",
  "math",
  "motion",
  "operator",
  "procedures",
  "sensing",
  "sound",
  "colour",
  "text",
  "matrix",
  "note",
  "checkbox",
];

/** Id ekstensi dari opcode (getExtensionIdForOpcode): bagian sebelum "_" pertama bila bukan core. */
export function getExtensionIdForOpcode(opcode: string): string | null {
  const i = opcode.indexOf("_");
  if (i <= 0) return null;
  const prefix = opcode.substring(0, i);
  return CORE_OPCODE_PREFIXES.includes(prefix) ? null : prefix;
}

export function monitorRecordToState(m: MonitorRecord): MonitorState {
  return {
    id: m.id,
    mode: m.mode,
    opcode: m.opcode,
    params: m.params,
    spriteName: m.spriteName,
    value: m.value,
    width: m.width,
    height: m.height,
    x: m.x ?? 0,
    y: m.y ?? 0,
    visible: m.visible,
    sliderMin: m.sliderMin,
    sliderMax: m.sliderMax,
    isDiscrete: m.isDiscrete,
  };
}

export function collectExtensions(targets: readonly TargetState[], monitors: readonly MonitorState[]): string[] {
  const set = new Set<string>();
  for (const t of targets) {
    for (const b of Object.values(t.blocks)) {
      const id = getExtensionIdForOpcode(b.opcode);
      if (id) set.add(id);
    }
  }
  for (const m of monitors) {
    const id = getExtensionIdForOpcode(m.opcode);
    if (id) set.add(id);
  }
  return [...set];
}

/** Semua asset costume & sound dari target asli, kunci md5ext. */
export function collectAssets(targets: readonly ITarget[]): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const put = (md5ext: string, asset: AssetData | null): void => {
    if (asset && md5ext && !out.has(md5ext)) out.set(md5ext, asset.data);
  };
  for (const t of targets) {
    for (const c of t.getCostumes()) put(c.md5ext, c.asset);
    for (const s of t.getSounds()) put(s.md5ext, s.asset);
  }
  return out;
}

export interface RuntimeSnapshotModel {
  model: ProjectModel;
  assets: Map<string, Uint8Array>;
}

export function runtimeToModel(runtime: IRuntime, vmVersion = "kodyblocks-ai-v2"): RuntimeSnapshotModel {
  const originals = runtime.targets.filter((t) => t.isOriginal);
  const targets = originals.map((t) => t.toState());
  const monitors = [...runtime.getMonitorState().values()].map(monitorRecordToState);
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return {
    model: {
      targets,
      monitors,
      extensions: collectExtensions(targets, monitors),
      meta: { semver: "3.0.0", vm: vmVersion, agent, origin: "kodyblocks.ai" },
    },
    assets: collectAssets(originals),
  };
}
