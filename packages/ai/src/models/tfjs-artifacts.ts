/**
 * Menyusun ModelArtifacts tfjs (graph-model) dari model.json + shard yang SUDAH diverifikasi hash,
 * sehingga tfjs memuat dari memori (tf.io.fromMemory) dan tidak pernah mengambil URL sendiri.
 */
import { ModelIntegrityError, resolveModelPath } from "./verified-fetch";

export interface WeightSpecLike {
  name: string;
  shape: number[];
  dtype: string;
  [key: string]: unknown;
}

export interface GraphModelArtifactsLike {
  format?: string;
  generatedBy?: string;
  convertedBy?: string | null;
  modelTopology: unknown;
  weightSpecs: WeightSpecLike[];
  weightData: ArrayBuffer;
  signature?: unknown;
  userDefinedMetadata?: unknown;
  modelInitializer?: unknown;
}

interface WeightsGroup {
  paths: string[];
  weights: WeightSpecLike[];
}

function parseModelJson(raw: ArrayBuffer, path: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(raw));
    if (typeof parsed !== "object" || parsed === null) throw new Error("bukan objek");
    return parsed as Record<string, unknown>;
  } catch (err) {
    throw new ModelIntegrityError(`model.json rusak (${(err as Error).message})`, path);
  }
}

function asGroups(value: unknown, path: string): WeightsGroup[] {
  if (!Array.isArray(value)) throw new ModelIntegrityError("weightsManifest tidak ada", path);
  return value.map((g: unknown) => {
    const group = g as Partial<WeightsGroup>;
    if (!Array.isArray(group.paths) || !Array.isArray(group.weights)) {
      throw new ModelIntegrityError("weightsManifest tidak valid", path);
    }
    return { paths: group.paths.map(String), weights: group.weights };
  });
}

/**
 * modelJsonPath: path model.json di manifest (mis. /models/coco-ssd/model.json).
 * loadFile: pemuat terverifikasi (createVerifiedFetcher).
 */
export async function loadGraphModelArtifacts(
  modelJsonPath: string,
  loadFile: (path: string) => Promise<ArrayBuffer>,
): Promise<GraphModelArtifactsLike> {
  const json = parseModelJson(await loadFile(modelJsonPath), modelJsonPath);
  const groups = asGroups(json.weightsManifest, modelJsonPath);
  const weightSpecs: WeightSpecLike[] = [];
  const shardPaths: string[] = [];
  for (const group of groups) {
    weightSpecs.push(...group.weights);
    for (const p of group.paths) shardPaths.push(resolveModelPath(modelJsonPath, p));
  }
  const shards = await Promise.all(shardPaths.map((p) => loadFile(p)));
  const total = shards.reduce((n, s) => n + s.byteLength, 0);
  const weightData = new Uint8Array(total);
  let offset = 0;
  for (const shard of shards) {
    weightData.set(new Uint8Array(shard), offset);
    offset += shard.byteLength;
  }
  const artifacts: GraphModelArtifactsLike = {
    modelTopology: json.modelTopology,
    weightSpecs,
    weightData: weightData.buffer,
  };
  if (typeof json.format === "string") artifacts.format = json.format;
  if (typeof json.generatedBy === "string") artifacts.generatedBy = json.generatedBy;
  if (json.signature !== undefined) artifacts.signature = json.signature;
  if (json.userDefinedMetadata !== undefined) artifacts.userDefinedMetadata = json.userDefinedMetadata;
  if (json.modelInitializer !== undefined) artifacts.modelInitializer = json.modelInitializer;
  return artifacts;
}
