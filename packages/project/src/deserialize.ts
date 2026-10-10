/**
 * project.json (sb3) -> ProjectModel. Port logika parseScratchObject, deserializeMonitor,
 * replaceUnsafeCharsInVariableIds, dan deserialize dari scratch-vm 4.8.102
 * src/serialization/sb3.js (BSD-3-Clause, lihat THIRD_PARTY.md).
 * Input divalidasi dulu (validate.ts); project tidak valid -> ProjectLoadError berisi laporan.
 */
import {
  getMonitorIdForBlockWithArgs,
  MathUtil,
  type BlockField,
  type CommentState,
  type CostumeState,
  type MonitorState,
  type ProjectModel,
  type ScratchValue,
  type SoundState,
  type TargetState,
  type VariableState,
} from "@kody/engine";
import { StringUtil, uid } from "@kody/engine/util/string-util";
import { deserializeBlocks } from "./deserialize-blocks";
import { getExtensionIdForOpcode } from "./opcode-check";
import { formatIssue, IssueReport } from "./report";
import type { SB3Comment, SB3Costume, SB3Monitor, SB3Project, SB3Sound, SB3Target } from "./sb3-types";
import { ProjectLoadError, type DeserializeOptions, type ProjectIssue } from "./types";
import { validateProjectJson } from "./validate";
import { hasOwn, type JsonObject } from "./validate-util";

/** Batas variabel cloud per project (runtime.js cloudDataManager). */
const CLOUD_VARIABLE_LIMIT = 10;
const COMMENT_MIN_SIZE = 20;
const COMMENT_DEFAULT_SIZE = 100;

export interface DeserializeHooks {
  /** Ukuran gambar costume (untuk rotationCenter yang hilang). Dipanggil dengan md5ext asli. */
  imageSize?: (costume: { md5ext: string; assetId: string; dataFormat: string }) => {
    width: number;
    height: number;
  } | null;
}

export interface DeserializeResult {
  model: ProjectModel;
  warnings: ProjectIssue[];
}

interface ParseContext {
  report: IssueReport;
  makeId: () => string;
  cloudCount: number;
  extensionIds: Set<string>;
  hooks: DeserializeHooks;
}

function parseCostume(ctx: ParseContext, path: string, c: SB3Costume): CostumeState {
  const dataFormat = (c.dataFormat || "png").toLowerCase() as CostumeState["dataFormat"];
  const md5ext = hasOwn(c, "md5ext") ? c.md5ext : `${c.assetId}.${dataFormat}`;
  const bitmapResolution = typeof c.bitmapResolution === "number" ? c.bitmapResolution : dataFormat === "svg" ? 1 : 2;
  let rotationCenterX = c.rotationCenterX;
  let rotationCenterY = c.rotationCenterY;
  if (typeof rotationCenterX !== "number" || typeof rotationCenterY !== "number") {
    const size = ctx.hooks.imageSize?.({ md5ext, assetId: c.assetId, dataFormat }) ?? null;
    if (size) {
      rotationCenterX = size.width / 2;
      rotationCenterY = size.height / 2;
    } else {
      rotationCenterX = 0;
      rotationCenterY = 0;
      ctx.report.warn("rotation-center", path, "rotationCenter tidak ada dan ukuran gambar tidak terbaca; dipakai 0,0");
    }
  }
  return { name: c.name, assetId: c.assetId, md5ext, dataFormat, bitmapResolution, rotationCenterX, rotationCenterY };
}

function parseSound(s: SB3Sound): SoundState {
  // deserialize-assets.js: semua selain mp3 diperlakukan sebagai WAV.
  const dataFormat: SoundState["dataFormat"] = s.dataFormat.toLowerCase() === "mp3" ? "mp3" : "wav";
  return {
    name: s.name,
    assetId: s.assetId,
    md5ext: hasOwn(s, "md5ext") ? s.md5ext : `${s.assetId}.${dataFormat}`,
    dataFormat,
    rate: typeof s.rate === "number" ? s.rate : 0,
    sampleCount: typeof s.sampleCount === "number" ? s.sampleCount : 0,
  };
}

function parseComment(ctx: ParseContext, path: string, id: string, c: SB3Comment): CommentState {
  const size = (v: unknown, key: string): number => {
    const n = Math.max(Number(v), COMMENT_MIN_SIZE);
    if (Number.isNaN(n)) {
      ctx.report.warn("comment-size", `${path}.${key}`, `ukuran komentar tidak ada; dipakai ${COMMENT_DEFAULT_SIZE}`);
      return COMMENT_DEFAULT_SIZE;
    }
    return n;
  };
  return {
    id,
    blockId: c.blockId ? c.blockId : null,
    x: c.x as number,
    y: c.y as number,
    width: size(c.width, "width"),
    height: size(c.height, "height"),
    minimized: c.minimized || false,
    text: c.text,
  };
}

function parseVariables(ctx: ParseContext, t: SB3Target): Record<string, VariableState> {
  const out: Record<string, VariableState> = {};
  for (const id of Object.keys(t.variables)) {
    const v = t.variables[id]!;
    const isCloud = v.length === 3 && !!v[2] && t.isStage && ctx.cloudCount < CLOUD_VARIABLE_LIMIT;
    if (isCloud) ctx.cloudCount++;
    out[id] = { id, name: v[0], type: "", value: v[1], isCloud };
  }
  for (const id of Object.keys(t.lists ?? {})) {
    const l = t.lists[id]!;
    out[id] = { id, name: l[0], type: "list", value: l[1].slice() as ScratchValue[], isCloud: false };
  }
  for (const id of Object.keys(t.broadcasts ?? {})) {
    const name = t.broadcasts[id]!;
    out[id] = { id, name, type: "broadcast_msg", value: name, isCloud: false };
  }
  return out;
}

function parseTarget(ctx: ParseContext, path: string, t: SB3Target): TargetState {
  const blocks = deserializeBlocks({ report: ctx.report, path, makeId: ctx.makeId }, t.blocks as unknown as JsonObject);
  for (const block of Object.values(blocks)) {
    const ext = getExtensionIdForOpcode(block.opcode);
    if (ext) ctx.extensionIds.add(ext);
  }
  const comments: Record<string, CommentState> = {};
  for (const id of Object.keys(t.comments ?? {})) {
    comments[id] = parseComment(ctx, `${path}.comments`, id, t.comments[id]!);
  }
  const costumes = t.costumes.map((c, i) => parseCostume(ctx, `${path}.costumes[${i}]`, c));
  const target: TargetState = {
    id: ctx.makeId(),
    isStage: t.isStage,
    name: t.name,
    variables: parseVariables(ctx, t),
    blocks,
    comments,
    currentCostume: hasOwn(t, "currentCostume") ? MathUtil.clamp(t.currentCostume, 0, t.costumes.length - 1) : 0,
    costumes,
    sounds: t.sounds.map(parseSound),
    volume: hasOwn(t, "volume") ? t.volume : 100,
    layerOrder: 0,
  };
  if (t.isStage) {
    target.tempo = hasOwn(t, "tempo") ? (t.tempo as number) : 60;
    target.videoTransparency = hasOwn(t, "videoTransparency") ? (t.videoTransparency as number) : 50;
    target.videoState = hasOwn(t, "videoState") ? t.videoState! : "on";
    target.textToSpeechLanguage = hasOwn(t, "textToSpeechLanguage") ? (t.textToSpeechLanguage ?? null) : null;
  } else {
    target.visible = hasOwn(t, "visible") ? (t.visible as boolean) : true;
    target.x = hasOwn(t, "x") ? (t.x as number) : 0;
    target.y = hasOwn(t, "y") ? (t.y as number) : 0;
    // LLK/scratch-gui#5806: arah bisa di luar rentang -> wrapClamp seperti setDirection.
    target.size = hasOwn(t, "size") ? (t.size as number) : 100;
    target.direction = hasOwn(t, "direction") ? MathUtil.wrapClamp(t.direction as number, -179, 180) : 90;
    target.draggable = hasOwn(t, "draggable") ? (t.draggable as boolean) : false;
    target.rotationStyle = hasOwn(t, "rotationStyle") ? t.rotationStyle! : "all around";
  }
  const extState = (t as unknown as { extensionState?: unknown }).extensionState;
  if (extState !== undefined && typeof extState === "object" && extState !== null && !Array.isArray(extState)) {
    target.extensionState = structuredClone(extState as Record<string, unknown>);
  }
  return target;
}

/** Ganti karakter tak aman XML di id variabel dan semua referensinya (proyek lama dari 2.0). */
function replaceUnsafeCharsInVariableIds(targets: TargetState[]): void {
  const refs: Record<string, BlockField[]> = {};
  for (const t of targets) {
    for (const block of Object.values(t.blocks)) {
      const f = block.fields.VARIABLE ?? block.fields.LIST ?? block.fields.BROADCAST_OPTION;
      if (!f) continue;
      const key = String(f.id);
      (refs[key] ??= []).push(f);
    }
  }
  for (const t of targets) {
    for (const id of Object.keys(t.variables)) {
      const newId = StringUtil.replaceUnsafeChars(id);
      if (newId === id) continue;
      const v = t.variables[id]!;
      v.id = newId;
      t.variables[newId] = v;
      delete t.variables[id];
    }
  }
  for (const [id, fields] of Object.entries(refs)) {
    const original = fields[0]?.id;
    if (typeof original !== "string") continue;
    const newId = StringUtil.replaceUnsafeChars(original);
    if (newId === id) continue;
    for (const f of fields) f.id = newId;
  }
}

/** Monitor sprite-spesifik: id dibentuk ulang dari id target (getMonitored scratch-vm). */
const SPRITE_SPECIFIC_MONITORS: Readonly<Record<string, (targetId: string, fields: Record<string, BlockField>) => string>> =
  {
    motion_xposition: (t) => `${t}_xposition`,
    motion_yposition: (t) => `${t}_yposition`,
    motion_direction: (t) => `${t}_direction`,
    looks_size: (t) => `${t}_size`,
    looks_costumenumbername: (t, f) => getMonitorIdForBlockWithArgs(`${t}_costumenumbername`, f),
    sound_volume: (t) => `${t}_volume`,
  };

function parseMonitor(ctx: ParseContext, m: SB3Monitor, targets: TargetState[]): MonitorState {
  let targetId: string | undefined;
  if (m.spriteName) {
    const found = targets.filter((t) => t.name === m.spriteName);
    if (found.length > 0) targetId = found[0]!.id;
    else ctx.report.warn("monitor-sprite", `monitors.${m.id}`, `sprite "${m.spriteName}" untuk monitor tidak ada`);
  }
  const params: Record<string, string> = {};
  for (const k of Object.keys(m.params ?? {})) params[k] = String(m.params[k]);
  if (m.opcode === "data_listcontents") {
    const listTarget = targetId ? targets.find((t) => t.id === targetId) : targets.find((t) => t.isStage);
    if (listTarget && hasOwn(listTarget.variables, m.id)) params.LIST = listTarget.variables[m.id]!.name;
  }
  const fields: Record<string, BlockField> = {};
  for (const k of Object.keys(params)) fields[k] = { name: k, value: params[k]! };
  const getId = SPRITE_SPECIFIC_MONITORS[m.opcode];
  // scratch-vm memakai targetId apa adanya (bisa undefined -> "undefined_xposition").
  const id = getId ? getId(String(targetId), fields) : StringUtil.replaceUnsafeChars(m.id);
  const ext = getExtensionIdForOpcode(m.opcode);
  if (ext) ctx.extensionIds.add(ext);
  const value = Array.isArray(m.value) ? m.value.slice() : (m.value ?? "");
  return {
    id,
    mode: m.mode ?? "default",
    opcode: m.opcode,
    params,
    spriteName: m.spriteName ?? null,
    value,
    width: m.width ?? 0,
    height: m.height ?? 0,
    // null = posisi otomatis (MonitorRecord scratch-vm); dipertahankan apa adanya.
    x: m.x as number,
    y: m.y as number,
    visible: m.visible ?? true,
    sliderMin: m.sliderMin ?? 0,
    sliderMax: m.sliderMax ?? 100,
    isDiscrete: m.isDiscrete ?? true,
  };
}

/** Konversi project yang SUDAH tervalidasi. */
export function convertValidatedProject(
  json: SB3Project,
  report: IssueReport,
  options: DeserializeOptions = {},
  hooks: DeserializeHooks = {},
): ProjectModel {
  const ctx: ParseContext = {
    report,
    makeId: options.makeId ?? (() => uid()),
    cloudCount: 0,
    extensionIds: new Set(),
    hooks,
  };
  // Urutkan menurut layerOrder (stabil; undefined -> NaN -> dianggap sama) seperti scratch-vm,
  // parse dalam urutan itu, lalu kembalikan ke urutan panel sprite dengan layerOrder = peringkat.
  const order = json.targets
    .map((t, paneOrder) => ({ t, paneOrder }))
    .sort((a, b) => (a.t.layerOrder as number) - (b.t.layerOrder as number));
  const parsed: { target: TargetState; paneOrder: number }[] = order.map(({ t, paneOrder }, rank) => {
    const target = parseTarget(ctx, `targets[${paneOrder}]`, t);
    target.layerOrder = rank;
    return { target, paneOrder };
  });
  const targets = parsed.sort((a, b) => a.paneOrder - b.paneOrder).map((p) => p.target);
  replaceUnsafeCharsInVariableIds(targets);
  const monitors = (json.monitors ?? []).map((m) => parseMonitor(ctx, m, targets));
  const meta: ProjectModel["meta"] = {
    semver: "3.0.0",
    vm: json.meta.vm ?? "0.0.0",
    agent: json.meta.agent ?? "",
  };
  if (json.meta.origin) meta.origin = json.meta.origin;
  return { targets, monitors, extensions: Array.from(ctx.extensionIds), meta };
}

/** Validasi + konversi; melempar ProjectLoadError bila ada error. */
export function deserializeProjectWithReport(
  json: unknown,
  options: DeserializeOptions = {},
  hooks: DeserializeHooks = {},
): DeserializeResult {
  const validation = validateProjectJson(json, { unknownOpcodes: options.unknownOpcodes ?? "reject" });
  const report = new IssueReport();
  for (const issue of validation.issues) report.issues.push(issue);
  if (!validation.project) {
    const errors = validation.issues.filter((i) => i.severity === "error");
    const head = errors.slice(0, 5).map(formatIssue).join("; ");
    throw new ProjectLoadError(`Project tidak valid (${errors.length} masalah): ${head}`, validation.issues);
  }
  const model = convertValidatedProject(validation.project, report, options, hooks);
  return { model, warnings: report.warnings };
}

/** project.json (objek hasil JSON.parse) -> ProjectModel. Melempar ProjectLoadError bila tidak valid. */
export function deserializeProject(json: unknown, options: DeserializeOptions = {}): ProjectModel {
  return deserializeProjectWithReport(json, options).model;
}

