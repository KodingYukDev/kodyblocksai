#!/usr/bin/env node
/**
 * Menyalin file model AI ke folder statis app (default app/public/models) dan MEMVERIFIKASI hash
 * SHA-256 tiap file terhadap packages/ai/src/models/manifest.json (hash yang di-pin di bundle).
 *
 * Pemakaian:
 *   node packages/ai/tools/vendor-models.mjs --check                 # hanya cek sumber
 *   node packages/ai/tools/vendor-models.mjs [--out app/public/models] [--legacy ../kodyblocks-ai/public/models]
 *
 * Sumber:
 *   - wasm MediaPipe : node_modules/@mediapipe/tasks-vision/wasm/
 *   - model .task, mobilenet, coco-ssd : salinan yang sudah di-vendor di repo kodyblocks-ai lama
 *     (asal: Google MediaPipe & TF Hub, Apache-2.0). Tidak ada unduhan dari internet di skrip ini.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const manifest = JSON.parse(readFileSync(join(here, "../src/models/manifest.json"), "utf8"));

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const checkOnly = args.includes("--check");
const out = resolve(repo, opt("--out", "app/public/models"));
const legacy = resolve(repo, opt("--legacy", "../kodyblocks-ai/public/models"));
const wasmDir = join(repo, "node_modules/@mediapipe/tasks-vision/wasm");

function sourceFor(path) {
  const rel = path.replace(/^\/models\//, "");
  if (rel.startsWith("mediapipe/wasm/")) return join(wasmDir, rel.slice("mediapipe/wasm/".length));
  if (rel.startsWith("mediapipe/")) return join(legacy, rel.slice("mediapipe/".length));
  return join(legacy, rel);
}

let failed = 0;
for (const [path, entry] of Object.entries(manifest.files)) {
  const src = sourceFor(path);
  if (!existsSync(src)) {
    console.error(`HILANG  ${path}  (${src})`);
    failed++;
    continue;
  }
  const data = readFileSync(src);
  const hash = createHash("sha256").update(data).digest("hex");
  if (hash !== entry.sha256 || data.length !== entry.bytes) {
    console.error(`BEDA    ${path}  sha256=${hash} bytes=${data.length}`);
    failed++;
    continue;
  }
  if (!checkOnly) {
    const dest = join(out, path.replace(/^\/models\//, ""));
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
  console.log(`OK      ${path}`);
}
if (failed > 0) {
  console.error(`${failed} file gagal diverifikasi.`);
  process.exit(1);
}
console.log(checkOnly ? "Semua sumber model cocok dengan manifest." : `Model disalin ke ${out}`);
