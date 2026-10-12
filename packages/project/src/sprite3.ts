/**
 * Baca/tulis .sprite3 (zip: sprite.json + asset `<md5>.<ext>`), padanan vm.addSprite (_addSprite3) dan
 * vm.exportSprite scratch-vm 4.8.102 (BSD-3-Clause). sprite.json = satu target sb3 (isStage false).
 *
 * Validasi memakai jalur yang sama dengan .sb3: sprite dibungkus project sementara (Stage pengganti +
 * sprite), divalidasi dengan validateProjectJson, lalu dikonversi. Batas SB3_LIMITS tetap berlaku.
 */
import JSZip from "jszip";
import type { TargetState } from "@kody/engine";
import { createAssetStore } from "./asset-store";
import { convertValidatedProject } from "./deserialize";
import { readImageSize } from "./image-size";
import { md5Hex } from "./md5";
import { formatIssue, IssueReport } from "./report";
import { parseProjectJsonText, readAssets, rejectionMessage, toBytes, type AssetSlot } from "./sb3-file";
import type { SB3Project } from "./sb3-types";
import { serializeSprite, stringifyProject, type SerializeOptions } from "./serialize";
import { ProjectLoadError, SB3_LIMITS, type AssetMap, type DeserializeOptions } from "./types";
import { validateProjectJson } from "./validate";
import { isZip, openLimitedZip } from "./zip-reader";

export interface LoadedSprite {
  /** Target sprite (id baru, layerOrder 0). */
  target: TargetState;
  /** Ekstensi yang dipakai blok sprite (dari opcode). */
  extensions: string[];
  assets: AssetMap;
  warnings: string[];
}

/** Ukuran sprite.json maksimum. */
const MAX_SPRITE_JSON_BYTES = SB3_LIMITS.maxProjectJsonBytes;

/** Stage pengganti agar sprite bisa divalidasi dengan skema project; tidak pernah dipasang. */
const STUB_STAGE = {
  isStage: true,
  name: "Stage",
  variables: {},
  lists: {},
  broadcasts: {},
  blocks: {},
  comments: {},
  currentCostume: 0,
  costumes: [{ name: "stub", assetId: "00000000000000000000000000000000", md5ext: "00000000000000000000000000000000.svg", dataFormat: "svg", rotationCenterX: 0, rotationCenterY: 0 }],
  sounds: [],
  volume: 100,
};

export function isSprite3Name(name: string): boolean {
  return /\.sprite3$/i.test(name);
}

/**
 * Buka .sprite3. Melempar ProjectLoadError (dengan pesan ramah) bila bukan sprite Scratch 3 yang valid.
 */
export async function loadSprite3(data: ArrayBuffer | Uint8Array, options: DeserializeOptions = {}): Promise<LoadedSprite> {
  const bytes = toBytes(data);
  if (bytes.byteLength > SB3_LIMITS.maxFileBytes) {
    throw new ProjectLoadError(`File sprite lebih dari ${Math.round(SB3_LIMITS.maxFileBytes / 1024 / 1024)} MB`);
  }
  if (!isZip(bytes)) throw new ProjectLoadError("File ini bukan sprite Scratch 3 (.sprite3)");
  const zip = await openLimitedZip(bytes);
  const name = zip.fileNames.find((n) => /^([^/]*\/)?sprite\.json$/.test(n));
  if (!name) {
    if (zip.fileNames.some((n) => /^([^/]*\/)?project\.json$/.test(n))) {
      throw new ProjectLoadError("Ini file project (.sb3), bukan sprite. Buka lewat menu File.");
    }
    throw new ProjectLoadError("File .sprite3 tidak berisi sprite.json");
  }
  const json = parseProjectJsonText(new TextDecoder().decode(await zip.read(name, MAX_SPRITE_JSON_BYTES)));
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new ProjectLoadError("sprite.json harus objek");
  }
  const raw = { ...(json as Record<string, unknown>) };
  if ("objName" in raw) throw new ProjectLoadError("Sprite Scratch 2 (.sprite2) belum didukung; buka di Scratch 3 lalu ekspor ulang");
  // Properti yang tidak relevan untuk satu sprite (scratch-vm mengabaikannya juga).
  delete raw.layerOrder;
  delete raw.extensions;
  delete raw.id;
  delete raw.targetPaneOrder;
  if (raw.isStage !== false) throw new ProjectLoadError("sprite.json harus sprite (bukan Stage)");

  const wrapped = { targets: [STUB_STAGE, raw], monitors: [], extensions: [], meta: { semver: "3.0.0" } };
  const validation = validateProjectJson(wrapped, { unknownOpcodes: options.unknownOpcodes ?? "reject" });
  if (!validation.project) {
    const errors = validation.issues.filter((i) => i.severity === "error");
    throw new ProjectLoadError(
      rejectionMessage("Sprite", errors, (p) => p.replace(/^targets\[1\]/, "sprite")),
      validation.issues,
    );
  }
  const project: SB3Project = validation.project;
  const report = new IssueReport();
  for (const issue of validation.issues) if (!issue.path.startsWith("targets[0]")) report.issues.push(issue);

  const slots: Map<string, AssetSlot> = await readAssets(project, zip, report, new Set([1]));
  const byOriginalKey = new Map<string, Uint8Array>();
  for (const slot of slots.values()) if (slot.data) byOriginalKey.set(slot.originalKey, slot.data);

  const model = convertValidatedProject(project, report, options, {
    imageSize: ({ md5ext, dataFormat }) => {
      const b = byOriginalKey.get(md5ext);
      return b ? readImageSize(b, dataFormat) : null;
    },
  });
  const target = model.targets[1];
  if (!target) throw new ProjectLoadError("Sprite kosong");
  target.layerOrder = 0;

  const assets = createAssetStore();
  const place = (slotKey: string, item: { assetId: string; md5ext: string; dataFormat: string }): void => {
    const slot = slots.get(slotKey);
    if (!slot?.data) return;
    item.assetId = md5Hex(slot.data);
    item.md5ext = `${item.assetId}.${item.dataFormat}`;
    if (!assets.has(item.md5ext)) assets.set(item.md5ext, slot.data);
  };
  target.costumes.forEach((c, i) => place(`1:c:${i}`, c));
  target.sounds.forEach((s, i) => place(`1:s:${i}`, s));

  return {
    target,
    extensions: model.extensions,
    assets,
    warnings: report.warnings.filter((w) => !w.path.startsWith("targets[0]")).map((w) => formatIssue({ ...w, path: w.path.replace(/^targets\[1\]/, "sprite") })),
  };
}

/** Ekspor satu sprite sebagai .sprite3 (vm.exportSprite: DEFLATE level 6). */
export async function saveSprite3(
  target: TargetState,
  assets: { get(md5ext: string): Uint8Array | undefined },
  options: SerializeOptions = {},
): Promise<{ data: Uint8Array; missingAssets: string[] }> {
  const sprite = serializeSprite(target, options);
  const zip = new JSZip();
  zip.file("sprite.json", stringifyProject(sprite as unknown as SB3Project));
  const missingAssets: string[] = [];
  const written = new Set<string>();
  for (const item of [...target.costumes, ...target.sounds]) {
    const key = item.md5ext || `${item.assetId}.${item.dataFormat}`;
    if (written.has(key)) continue;
    written.add(key);
    const data = assets.get(key);
    if (data) zip.file(key, data);
    else missingAssets.push(key);
  }
  const data = await zip.generateAsync({
    type: "uint8array",
    mimeType: "application/x.scratch.sprite3",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return { data, missingAssets };
}
