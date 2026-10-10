/**
 * Validasi ketat project.json Scratch 3 sebelum dipakai. Aturan tipe mengikuti skema resmi
 * scratch-parser 5.2.1 (lib/sb3_schema.json + sb3_definitions.json, BSD-3-Clause), ditambah
 * batas ukuran (PROJECT_LIMITS), penolakan opcode tak dikenal, dan pemeriksaan keamanan.
 */
import { IssueReport } from "./report";
import type { SB3Project } from "./sb3-types";
import { PROJECT_LIMITS, type ProjectIssue, type UnknownOpcodePolicy } from "./types";
import { validateBlocks, type BlockCheckContext } from "./validate-blocks";
import {
  checkKey,
  hasOwn,
  isBool,
  isInteger,
  isNumber,
  isObject,
  isOptString,
  isScalar,
  isString,
  optional,
  required,
  seg,
  type Json,
  type JsonObject,
} from "./validate-util";
import { describeUnknownOpcode, isKnownOpcode } from "./opcode-check";

const ASSET_ID_RE = /^[a-fA-F0-9]{32}$/;
const COSTUME_MD5EXT_RE = /^[a-fA-F0-9]{32}\.[a-zA-Z]+$/;
const SOUND_MD5EXT_RE = /^[a-fA-F0-9]{32}\.[a-zA-Z0-9]+$/;
const COSTUME_FORMATS = ["png", "svg", "jpeg", "jpg", "bmp", "gif"];
const SOUND_FORMATS = ["wav", "wave", "mp3"];
const ROTATION_STYLES = ["all around", "don't rotate", "left-right"];
const VIDEO_STATES = ["on", "off", "on-flipped"];
const MONITOR_MODES = ["default", "large", "slider", "list"];

export interface ValidateOptions {
  unknownOpcodes?: UnknownOpcodePolicy;
}

export interface ValidationResult {
  /** Project bertipe bila tidak ada error, selain itu null. */
  project: SB3Project | null;
  issues: ProjectIssue[];
}

const oneOf = (list: readonly string[]) => (v: unknown) => isString(v) && list.includes(v);

function validateCostume(report: IssueReport, path: string, c: Json): void {
  if (!isObject(c)) {
    report.error("type", path, "costume harus objek");
    return;
  }
  required(report, c, "name", path, isString, "teks");
  required(report, c, "assetId", path, (v) => isString(v) && ASSET_ID_RE.test(v), "md5 32 hex");
  required(report, c, "dataFormat", path, oneOf(COSTUME_FORMATS), COSTUME_FORMATS.join("/"));
  optional(report, c, "md5ext", path, (v) => isString(v) && COSTUME_MD5EXT_RE.test(v), "<md5>.<ext>");
  optional(report, c, "bitmapResolution", path, isInteger, "bilangan bulat");
  optional(report, c, "rotationCenterX", path, isNumber, "angka");
  optional(report, c, "rotationCenterY", path, isNumber, "angka");
}

function validateSound(report: IssueReport, path: string, s: Json): void {
  if (!isObject(s)) {
    report.error("type", path, "sound harus objek");
    return;
  }
  required(report, s, "name", path, isString, "teks");
  required(report, s, "assetId", path, (v) => isString(v) && ASSET_ID_RE.test(v), "md5 32 hex");
  required(report, s, "dataFormat", path, oneOf(SOUND_FORMATS), SOUND_FORMATS.join("/"));
  optional(report, s, "md5ext", path, (v) => isString(v) && SOUND_MD5EXT_RE.test(v), "<md5>.<ext>");
  optional(report, s, "rate", path, isInteger, "bilangan bulat");
  optional(report, s, "sampleCount", path, isInteger, "bilangan bulat");
}

function validateRecord(
  report: IssueReport,
  obj: JsonObject,
  key: string,
  path: string,
  isRequired: boolean,
  max: number,
  each: (p: string, v: Json) => void,
): void {
  if (!hasOwn(obj, key)) {
    if (isRequired) report.error("missing", `${path}.${key}`, "wajib ada (objek)");
    return;
  }
  const rec = obj[key];
  if (!isObject(rec)) {
    report.error("type", `${path}.${key}`, "harus objek");
    return;
  }
  const ids = Object.keys(rec);
  if (ids.length > max) {
    report.error("limit", `${path}.${key}`, `lebih dari ${max} entri`);
    return;
  }
  for (const id of ids) {
    const p = `${path}.${key}.${seg(id)}`;
    if (checkKey(report, p, id)) each(p, rec[id] as Json);
  }
}

function validateTarget(ctx: BlockCheckContext, path: string, t: Json, index: number, counter: { blocks: number }): void {
  const { report } = ctx;
  if (!isObject(t)) {
    report.error("type", path, "target harus objek");
    return;
  }
  const isStage = index === 0;
  required(report, t, "isStage", path, (v) => v === isStage, isStage ? "true (target pertama = Stage)" : "false");
  if (isStage) {
    required(report, t, "name", path, (v) => v === "Stage", '"Stage"');
    optional(report, t, "tempo", path, isNumber, "angka");
    optional(report, t, "videoTransparency", path, isNumber, "angka");
    optional(report, t, "videoState", path, oneOf(VIDEO_STATES), VIDEO_STATES.join("/"));
    optional(report, t, "textToSpeechLanguage", path, isOptString, "teks atau null");
    optional(report, t, "layerOrder", path, (v) => v === 0, "0");
  } else {
    required(report, t, "name", path, (v) => isString(v) && v !== "_stage_", "teks (bukan _stage_)");
    optional(report, t, "visible", path, isBool, "boolean");
    for (const k of ["x", "y", "size", "direction"]) optional(report, t, k, path, isNumber, "angka");
    optional(report, t, "draggable", path, isBool, "boolean");
    optional(report, t, "rotationStyle", path, oneOf(ROTATION_STYLES), ROTATION_STYLES.join("/"));
    optional(report, t, "layerOrder", path, (v) => isInteger(v) && v >= 1, "bilangan bulat >= 1");
  }
  optional(report, t, "currentCostume", path, (v) => isInteger(v) && v >= 0, "bilangan bulat >= 0");
  optional(report, t, "volume", path, isNumber, "angka");

  const L = PROJECT_LIMITS;
  validateRecord(report, t, "variables", path, true, L.maxVariablesPerTarget, (p, v) => {
    const ok =
      Array.isArray(v) &&
      (v.length === 2 || v.length === 3) &&
      isString(v[0]) &&
      isScalar(v[1]) &&
      (v.length === 2 || v[2] === true);
    if (!ok) report.error("variable", p, "variabel harus [nama, nilai] atau [nama, nilai, true]");
  });
  validateRecord(report, t, "lists", path, false, L.maxVariablesPerTarget, (p, v) => {
    if (!Array.isArray(v) || v.length !== 2 || !isString(v[0]) || !Array.isArray(v[1])) {
      report.error("list", p, "list harus [nama, [isi...]]");
      return;
    }
    if (v[1].length > L.maxListItems) report.error("limit", p, `list lebih dari ${L.maxListItems} item`);
    else if (!v[1].every(isScalar)) report.error("list", p, "isi list harus teks/angka/boolean");
  });
  validateRecord(report, t, "broadcasts", path, false, L.maxVariablesPerTarget, (p, v) => {
    if (!isString(v)) report.error("broadcast", p, "broadcast harus teks");
  });
  validateRecord(report, t, "comments", path, false, L.maxCommentsPerTarget, (p, v) => {
    if (!isObject(v)) {
      report.error("comment", p, "komentar harus objek");
      return;
    }
    required(report, v, "text", p, (x) => isString(x) && x.length <= L.maxCommentText, `teks <= ${L.maxCommentText}`);
    optional(report, v, "blockId", p, isOptString, "teks atau null");
    optional(report, v, "minimized", p, isBool, "boolean");
    optional(report, v, "x", p, (x) => x === null || isNumber(x), "angka atau null");
    optional(report, v, "y", p, (x) => x === null || isNumber(x), "angka atau null");
    optional(report, v, "width", p, isNumber, "angka");
    optional(report, v, "height", p, isNumber, "angka");
  });

  for (const [key, max, each] of [
    ["costumes", L.maxCostumesPerTarget, validateCostume],
    ["sounds", L.maxSoundsPerTarget, validateSound],
  ] as const) {
    if (!hasOwn(t, key)) {
      report.error("missing", `${path}.${key}`, "wajib ada (array)");
      continue;
    }
    const arr = t[key];
    if (!Array.isArray(arr)) {
      report.error("type", `${path}.${key}`, "harus array");
      continue;
    }
    if (key === "costumes" && arr.length < 1) report.error("costume", `${path}.costumes`, "minimal 1 costume");
    if (arr.length > max) {
      report.error("limit", `${path}.${key}`, `lebih dari ${max} item`);
      continue;
    }
    arr.forEach((item, i) => each(report, `${path}.${key}[${i}]`, item));
  }

  if (!hasOwn(t, "blocks")) {
    report.error("missing", `${path}.blocks`, "wajib ada (objek)");
  } else if (!isObject(t.blocks)) {
    report.error("type", `${path}.blocks`, "harus objek");
  } else {
    const n = Object.keys(t.blocks).length;
    if (n > L.maxBlocksPerTarget) {
      report.error("limit", `${path}.blocks`, `lebih dari ${L.maxBlocksPerTarget} blok`);
      return;
    }
    counter.blocks += n;
    if (counter.blocks > L.maxTotalBlocks) {
      report.error("limit", "targets", `total blok lebih dari ${L.maxTotalBlocks}`);
      return;
    }
    validateBlocks(ctx, path, t.blocks);
  }
}

function validateMonitor(ctx: BlockCheckContext, path: string, m: Json): void {
  const { report } = ctx;
  if (!isObject(m)) {
    report.error("type", path, "monitor harus objek");
    return;
  }
  required(report, m, "id", path, (v) => isString(v) && v.length <= PROJECT_LIMITS.maxIdLength, "teks");
  if (required(report, m, "opcode", path, isString, "teks") && isString(m.opcode) && !isKnownOpcode(m.opcode)) {
    const msg = describeUnknownOpcode(m.opcode);
    if (ctx.unknownOpcodes === "reject") report.error("unknown-opcode", `${path}.opcode`, msg);
    else report.warn("unknown-opcode", `${path}.opcode`, msg);
  }
  optional(report, m, "mode", path, oneOf(MONITOR_MODES), MONITOR_MODES.join("/"));
  optional(report, m, "spriteName", path, isOptString, "teks atau null");
  optional(report, m, "visible", path, isBool, "boolean");
  optional(report, m, "isDiscrete", path, isBool, "boolean");
  for (const k of ["width", "height", "x", "y", "sliderMin", "sliderMax"]) {
    optional(report, m, k, path, (v) => v === null || isNumber(v), "angka");
  }
  optional(
    report,
    m,
    "value",
    path,
    (v) => isScalar(v) || (Array.isArray(v) && v.length <= PROJECT_LIMITS.maxListItems && v.every(isScalar)),
    "teks/angka/boolean atau array",
  );
  if (hasOwn(m, "params")) {
    const params = m.params;
    if (!isObject(params)) report.error("type", `${path}.params`, "harus objek");
    else
      for (const k of Object.keys(params)) {
        const p = `${path}.params.${seg(k)}`;
        if (checkKey(report, p, k) && !isString(params[k]) && !isNumber(params[k]))
          report.error("type", p, "parameter monitor harus teks");
      }
  }
}

/** Validasi lengkap. Tidak memodifikasi `json`. */
export function validateProjectJson(json: unknown, options: ValidateOptions = {}): ValidationResult {
  const report = new IssueReport();
  const ctx: BlockCheckContext = { report, unknownOpcodes: options.unknownOpcodes ?? "reject" };
  const done = (): ValidationResult => ({
    project: report.hasErrors ? null : (json as SB3Project),
    issues: report.issues,
  });

  if (!isObject(json)) {
    report.error("type", "$", "project.json harus objek");
    return done();
  }
  if (hasOwn(json, "objName") || hasOwn(json, "info")) {
    report.error("sb2", "$", "file Scratch 2 (.sb2) belum didukung; buka & simpan ulang di Scratch 3");
    return done();
  }
  if (required(report, json, "meta", "$", isObject, "objek")) {
    const meta = json.meta as JsonObject;
    required(report, meta, "semver", "meta", (v) => isString(v) && /^3\.[0-9]+\.[0-9]+$/.test(v), '"3.x.y"');
    optional(report, meta, "vm", "meta", (v) => isString(v) && /^([0-9]+\.[0-9]+\.[0-9]+)($|-)/.test(v), "versi semver");
    optional(report, meta, "agent", "meta", isString, "teks");
    optional(report, meta, "origin", "meta", isString, "teks");
  }
  optional(report, json, "extensions", "$", (v) => Array.isArray(v) && v.every(isString), "array teks");

  if (required(report, json, "targets", "$", Array.isArray, "array")) {
    const targets = json.targets as Json[];
    if (targets.length < 1) report.error("missing", "targets", "minimal ada Stage");
    if (targets.length > PROJECT_LIMITS.maxTargets) {
      report.error("limit", "targets", `lebih dari ${PROJECT_LIMITS.maxTargets} target`);
      return done();
    }
    const counter = { blocks: 0 };
    targets.forEach((t, i) => validateTarget(ctx, `targets[${i}]`, t, i, counter));
  }

  if (hasOwn(json, "monitors")) {
    const monitors = json.monitors;
    if (!Array.isArray(monitors)) report.error("type", "monitors", "harus array");
    else if (monitors.length > PROJECT_LIMITS.maxMonitors)
      report.error("limit", "monitors", `lebih dari ${PROJECT_LIMITS.maxMonitors} monitor`);
    else monitors.forEach((m, i) => validateMonitor(ctx, `monitors[${i}]`, m));
  }
  return done();
}
