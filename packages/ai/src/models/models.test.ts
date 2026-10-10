import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isAllowedModelUrl } from "../security";
import { MODEL_PATHS } from "./loaders";
import { TensorBudgetError, TensorGuard } from "./tensor-guard";
import { loadGraphModelArtifacts } from "./tfjs-artifacts";
import { MODEL_MANIFEST, ModelIntegrityError, createVerifiedFetcher, resolveModelPath, sha256HexWebCrypto } from "./verified-fetch";
import type { FetchLike, ModelManifest } from "./verified-fetch";

const enc = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer;
const sha = (b: ArrayBuffer): string => createHash("sha256").update(Buffer.from(b)).digest("hex");

function server(files: Record<string, ArrayBuffer>, patch: Partial<{ redirected: boolean; url: string; status: number }> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const body = files[url];
    return {
      ok: body !== undefined && (patch.status ?? 200) === 200,
      status: body === undefined ? 404 : (patch.status ?? 200),
      url: patch.url ?? `https://kodyblocks.test${url}`,
      redirected: patch.redirected ?? false,
      arrayBuffer: async () => body ?? new ArrayBuffer(0),
    };
  };
  return { fetch, calls };
}

function manifestFor(files: Record<string, ArrayBuffer>): ModelManifest {
  const out: ModelManifest = { version: 1, files: {} };
  for (const [p, b] of Object.entries(files)) out.files[p] = { sha256: sha(b), bytes: b.byteLength };
  return out;
}

const ORIGIN = "https://kodyblocks.test";

describe("manifest model", () => {
  it("semua path di manifest lolos whitelist dan berformat hash SHA-256", () => {
    const paths = Object.keys(MODEL_MANIFEST.files);
    expect(paths.length).toBeGreaterThanOrEqual(15);
    for (const p of paths) {
      expect(isAllowedModelUrl(p)).toBe(true);
      expect(MODEL_MANIFEST.files[p]?.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(MODEL_MANIFEST.files[p]?.bytes).toBeGreaterThan(0);
    }
    for (const p of [MODEL_PATHS.hand, MODEL_PATHS.face, MODEL_PATHS.pose, MODEL_PATHS.mobilenet, MODEL_PATHS.cocoSsd]) {
      expect(MODEL_MANIFEST.files[p]).toBeDefined();
    }
    for (const v of ["vision_wasm_internal", "vision_wasm_nosimd_internal"]) {
      expect(MODEL_MANIFEST.files[`${MODEL_PATHS.wasmDir}${v}.js`]).toBeDefined();
      expect(MODEL_MANIFEST.files[`${MODEL_PATHS.wasmDir}${v}.wasm`]).toBeDefined();
    }
  });

  it("sha256HexWebCrypto cocok dengan node:crypto", async () => {
    const data = enc("halo kody");
    expect(await sha256HexWebCrypto(data)).toBe(sha(data));
  });
});

describe("createVerifiedFetcher", () => {
  const files = { "/models/a/model.bin": enc("isi-model") };

  it("memuat file yang hash & ukurannya cocok, tanpa kredensial lintas origin & tanpa redirect", async () => {
    const s = server(files);
    const load = createVerifiedFetcher({ fetch: s.fetch, manifest: manifestFor(files), origin: ORIGIN });
    const data = await load("/models/a/model.bin");
    expect(new TextDecoder().decode(data)).toBe("isi-model");
    expect(s.calls[0]?.init).toMatchObject({ credentials: "same-origin", redirect: "error" });
  });

  it("menggabungkan permintaan paralel ke path yang sama", async () => {
    const s = server(files);
    const load = createVerifiedFetcher({ fetch: s.fetch, manifest: manifestFor(files), origin: ORIGIN });
    await Promise.all([load("/models/a/model.bin"), load("/models/a/model.bin")]);
    expect(s.calls).toHaveLength(1);
  });

  it.each([
    ["URL luar", "https://cdn.evil.test/models/a/model.bin", {}, /ditolak/],
    ["traversal", "/models/../secret", {}, /ditolak/],
    ["tidak di manifest", "/models/b/other.bin", {}, /tidak terdaftar/],
    ["redirect", "/models/a/model.bin", { redirected: true }, /redirect/],
    ["origin lain", "/models/a/model.bin", { url: "https://evil.test/models/a/model.bin" }, /origin lain/],
    ["HTTP error", "/models/a/model.bin", { status: 500 }, /HTTP 500/],
  ] as const)("menolak %s", async (_name, path, patch, err) => {
    const s = server({ ...files, "/models/b/other.bin": enc("x") }, patch);
    const load = createVerifiedFetcher({ fetch: s.fetch, manifest: manifestFor(files), origin: ORIGIN });
    await expect(load(path)).rejects.toThrow(err);
  });

  it("menolak file yang diganti (hash/ukuran berbeda)", async () => {
    const manifest = manifestFor(files);
    const tampered = server({ "/models/a/model.bin": enc("isi-jahat") });
    const load = createVerifiedFetcher({ fetch: tampered.fetch, manifest, origin: ORIGIN });
    await expect(load("/models/a/model.bin")).rejects.toThrow(/hash/);
    const longer = server({ "/models/a/model.bin": enc("isi-model-lebih-panjang") });
    await expect(createVerifiedFetcher({ fetch: longer.fetch, manifest, origin: ORIGIN })("/models/a/model.bin")).rejects.toThrow(/ukuran/);
    await expect(load("/models/a/model.bin")).rejects.toBeInstanceOf(ModelIntegrityError);
  });
});

describe("artefak tfjs dari memori", () => {
  it("menggabungkan shard sesuai urutan manifest dan menolak path shard aneh", async () => {
    const modelJson = {
      format: "graph-model",
      modelTopology: { node: [] },
      weightsManifest: [
        { paths: ["s1", "s2"], weights: [{ name: "w", shape: [3], dtype: "float32" }] },
        { paths: ["s3"], weights: [{ name: "v", shape: [1], dtype: "float32" }] },
      ],
    };
    const files: Record<string, ArrayBuffer> = {
      "/models/m/model.json": enc(JSON.stringify(modelJson)),
      "/models/m/s1": new Uint8Array([1, 2]).buffer,
      "/models/m/s2": new Uint8Array([3]).buffer,
      "/models/m/s3": new Uint8Array([4, 5]).buffer,
    };
    const loaded: string[] = [];
    const art = await loadGraphModelArtifacts("/models/m/model.json", async (p) => {
      loaded.push(p);
      const f = files[p];
      if (!f) throw new Error(p);
      return f;
    });
    expect([...new Uint8Array(art.weightData)]).toEqual([1, 2, 3, 4, 5]);
    expect(art.weightSpecs.map((w) => w.name)).toEqual(["w", "v"]);
    expect(art.format).toBe("graph-model");
    expect(loaded).toEqual(["/models/m/model.json", "/models/m/s1", "/models/m/s2", "/models/m/s3"]);

    const evil = { ...modelJson, weightsManifest: [{ paths: ["../../secret"], weights: [] }] };
    await expect(loadGraphModelArtifacts("/models/m/model.json", async () => enc(JSON.stringify(evil)))).rejects.toThrow(/shard/);
    await expect(loadGraphModelArtifacts("/models/m/model.json", async () => enc("{rusak"))).rejects.toThrow(/rusak/);
    expect(() => resolveModelPath("/models/m/model.json", "https://evil/x")).toThrow();
  });
});

describe("TensorGuard", () => {
  it("mencatat tensor bocor dan melempar saat melewati batas", async () => {
    let tensors = 0;
    let bytes = 0;
    const guard = new TensorGuard({ memory: () => ({ numTensors: tensors, numBytes: bytes }) }, { maxTensorBytes: 1000, maxLeakedTensors: 2 });
    expect(await guard.run(async () => "ok")).toBe("ok");
    await guard.run(async () => void (tensors += 2));
    expect(guard.leakedTensors).toBe(2);
    await expect(guard.run(async () => void (tensors += 1))).rejects.toBeInstanceOf(TensorBudgetError);
    guard.reset();
    bytes = 5000;
    await expect(guard.run(async () => 1)).rejects.toThrow(/MB/);
  });
});
