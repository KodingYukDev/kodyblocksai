/**
 * Baca/tulis file .sb3 (zip: project.json + asset `<md5>.<ext>`) dengan SB3_LIMITS dan validasi
 * ketat. Alur baca meniru scratch-parser (unpack -> parse -> validate) lalu scratch-vm sb3.deserialize
 * + deserialize-assets.js (asset di-hash ulang dari isinya). Alur tulis meniru
 * VirtualMachine.saveProjectSb3 (DEFLATE level 6).
 */
import JSZip from "jszip";
import type { ProjectModel } from "@kody/engine";
import { createAssetStore, referencedAssets } from "./asset-store";
import { convertValidatedProject } from "./deserialize";
import { readImageSize } from "./image-size";
import { md5Hex } from "./md5";
import { formatIssue, IssueReport } from "./report";
import type { SB3Project } from "./sb3-types";
import { serializeProject, stringifyProject, type SerializeOptions } from "./serialize";
import { ProjectLoadError, SB3_LIMITS, type AssetStore, type LoadedProject, type LoadSb3Options } from "./types";
import { validateProjectJson } from "./validate";
import { isZip, openLimitedZip, type LimitedZip } from "./zip-reader";

/** Batas satu file asset setelah diekstrak. */
const MAX_ASSET_BYTES = 50 * 1024 * 1024;

/**
 * Parse teks project.json. Menghapus karakter backspace seperti scratch-parser lib/parse.js
 * (BSD-3-Clause, LLK/scratch-vm#1077): `\b` / `\u0008` dengan jumlah backslash ganjil.
 */
export function parseProjectJsonText(text: string): unknown {
  const cleaned = text.replace(/^﻿/, "").replace(/(\\+)(b|u0008)/g, (match, backslash: string, code: string) =>
    backslash.length % 2 ? match.replace(`\\${code}`, "") : match,
  );
  try {
    return JSON.parse(cleaned) as unknown;
  } catch (e) {
    throw new ProjectLoadError(`project.json bukan JSON yang valid: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function toBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

async function readProjectText(bytes: Uint8Array): Promise<{ text: string; zip: LimitedZip | null }> {
  if (bytes.byteLength > SB3_LIMITS.maxFileBytes) {
    throw new ProjectLoadError(`File lebih dari ${Math.round(SB3_LIMITS.maxFileBytes / 1024 / 1024)} MB`);
  }
  // Byte signature "Scr" = Scratch 1.4 (scratch-parser unpack.js).
  if (bytes[0] === 83 && bytes[1] === 99 && bytes[2] === 114) {
    throw new ProjectLoadError("File Scratch 1.x tidak didukung");
  }
  if (!isZip(bytes)) {
    if (bytes.byteLength > SB3_LIMITS.maxProjectJsonBytes) throw new ProjectLoadError("project.json terlalu besar");
    return { text: new TextDecoder().decode(bytes), zip: null };
  }
  const zip = await openLimitedZip(bytes);
  const re = /^([^/]*\/)?project\.json$/;
  const name = zip.fileNames.find((n) => re.test(n));
  if (!name) throw new ProjectLoadError("File .sb3 tidak berisi project.json");
  const json = await zip.read(name, SB3_LIMITS.maxProjectJsonBytes);
  return { text: new TextDecoder().decode(json), zip };
}

interface AssetSlot {
  /** Kunci asli di project.json (md5ext), dipakai hook ukuran gambar. */
  originalKey: string;
  data: Uint8Array | null;
}

/** Muat bytes semua asset yang dirujuk; key = `${targetIndex}:${c|s}:${i}`. */
async function readAssets(project: SB3Project, zip: LimitedZip, report: IssueReport): Promise<Map<string, AssetSlot>> {
  const slots = new Map<string, AssetSlot>();
  const cache = new Map<string, Uint8Array>();
  const load = async (candidates: string[]): Promise<Uint8Array | null> => {
    for (const candidate of candidates) {
      const entry = zip.find(candidate);
      if (!entry) continue;
      const cached = cache.get(entry);
      if (cached) return cached;
      const data = await zip.read(entry, MAX_ASSET_BYTES);
      cache.set(entry, data);
      return data;
    }
    return null;
  };
  for (const [ti, t] of project.targets.entries()) {
    for (const [i, c] of t.costumes.entries()) {
      const md5ext = c.md5ext ?? `${c.assetId}.${c.dataFormat}`;
      const data = await load([`${c.assetId}.${c.dataFormat}`, md5ext]);
      if (!data) report.warn("missing-asset", `targets[${ti}].costumes[${i}]`, `file costume "${c.name}" tidak ada`);
      slots.set(`${ti}:c:${i}`, { originalKey: md5ext, data });
    }
    for (const [i, s] of t.sounds.entries()) {
      const md5ext = s.md5ext ?? `${s.assetId}.${s.dataFormat}`;
      const data = await load([md5ext, `${s.assetId}.${s.dataFormat}`]);
      if (!data) report.warn("missing-asset", `targets[${ti}].sounds[${i}]`, `file sound "${s.name}" tidak ada`);
      slots.set(`${ti}:s:${i}`, { originalKey: md5ext, data });
    }
  }
  return slots;
}

/**
 * Buka .sb3 (atau project.json mentah). Melempar ProjectLoadError dengan `issues` bila ditolak.
 * Peringatan non-fatal dikembalikan di `warnings`.
 */
export async function loadSb3(data: ArrayBuffer | Uint8Array, options: LoadSb3Options = {}): Promise<LoadedProject> {
  const bytes = toBytes(data);
  const { text, zip } = await readProjectText(bytes);
  const json = parseProjectJsonText(text);
  const validation = validateProjectJson(json, { unknownOpcodes: options.unknownOpcodes ?? "reject" });
  if (!validation.project) {
    const errors = validation.issues.filter((i) => i.severity === "error");
    const head = errors.slice(0, 5).map(formatIssue).join("; ");
    throw new ProjectLoadError(`Project tidak valid (${errors.length} masalah): ${head}`, validation.issues);
  }
  const project = validation.project;
  const report = new IssueReport();
  for (const issue of validation.issues) report.issues.push(issue);

  const slots = zip ? await readAssets(project, zip, report) : new Map<string, AssetSlot>();
  const byOriginalKey = new Map<string, Uint8Array>();
  for (const slot of slots.values()) if (slot.data) byOriginalKey.set(slot.originalKey, slot.data);

  const model = convertValidatedProject(project, report, options, {
    imageSize: ({ md5ext, dataFormat }) => {
      const bytesOf = byOriginalKey.get(md5ext);
      return bytesOf ? readImageSize(bytesOf, dataFormat) : null;
    },
  });

  const assets = createAssetStore();
  const rehash = options.rehashAssets !== false;
  model.targets.forEach((target, ti) => {
    const place = (slotKey: string, item: { assetId: string; md5ext: string; dataFormat: string }): void => {
      const slot = slots.get(slotKey);
      if (!slot?.data) return;
      if (rehash) {
        item.assetId = md5Hex(slot.data);
        item.md5ext = `${item.assetId}.${item.dataFormat}`;
      }
      if (!assets.has(item.md5ext)) assets.set(item.md5ext, slot.data);
    };
    target.costumes.forEach((c, i) => place(`${ti}:c:${i}`, c));
    target.sounds.forEach((s, i) => place(`${ti}:s:${i}`, s));
  });

  return {
    model,
    assets,
    warnings: report.warnings.map(formatIssue),
  };
}

export interface SaveSb3Result {
  data: Uint8Array;
  /** md5ext yang dirujuk model tetapi tidak ada di AssetStore (tidak ditulis ke zip). */
  missingAssets: string[];
}

type AssetSource = Pick<AssetStore, "get">;

/** Simpan sebagai .sb3 + laporan asset yang hilang. */
export async function saveSb3WithReport(
  model: ProjectModel,
  assets: AssetSource,
  options: SerializeOptions = {},
): Promise<SaveSb3Result> {
  const project = serializeProject(model, options);
  const zip = new JSZip();
  zip.file("project.json", stringifyProject(project));
  const missingAssets: string[] = [];
  for (const md5ext of referencedAssets(model)) {
    const bytes = assets.get(md5ext);
    if (bytes) zip.file(md5ext, bytes);
    else missingAssets.push(md5ext);
  }
  const data = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return { data, missingAssets };
}

/** Simpan sebagai .sb3 (zip) yang bisa dibuka di Scratch 3. */
export async function saveSb3(model: ProjectModel, assets: AssetSource, options: SerializeOptions = {}): Promise<Uint8Array> {
  return (await saveSb3WithReport(model, assets, options)).data;
}
