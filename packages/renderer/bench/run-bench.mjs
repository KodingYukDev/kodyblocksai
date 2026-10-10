#!/usr/bin/env node
// Jalankan benchmark renderer di Chromium (Playwright): bundle bench-entry.ts dengan esbuild,
// buka di halaman lokal, cetak fps untuk backend webgl & canvas2d.
// Pemakaian: node packages/renderer/bench/run-bench.mjs [outDir] [--headed]
// Catatan: GPU headless bisa jatuh ke SwiftShader (CPU); pakai --headed untuk angka GPU nyata.
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const outDir = path.resolve(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : path.join(repo, ".bench-out"));
const headed = process.argv.includes("--headed");
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [path.join(here, "bench-entry.ts")],
  bundle: true,
  format: "esm",
  outfile: path.join(outDir, "bench.js"),
  alias: { "@kody/engine": path.join(repo, "packages/engine/src/index.ts") },
  logLevel: "warning",
});
const bundle = readFileSync(path.join(outDir, "bench.js"), "utf8");

// Browser: KODY_BENCH_CHROME (path) > Chrome terpasang (GPU asli) > Chromium bawaan Playwright.
const launchOpts = process.env.KODY_BENCH_CHROME ? { executablePath: process.env.KODY_BENCH_CHROME } : { channel: "chrome" };
const browser = await chromium.launch({
  ...launchOpts,
  headless: !headed,
  args: [...(process.env.KODY_BENCH_ARGS ? process.env.KODY_BENCH_ARGS.split(" ") : [])],
});
try {
  for (const backend of (process.env.KODY_BENCH_BACKENDS ?? "webgl canvas2d").split(" ")) {
    const page = await browser.newPage();
    page.on("console", (m) => process.env.KODY_BENCH_VERBOSE && console.log(`[page] ${m.text()}`));
    page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
    page.on("crash", () => console.log("[crash] halaman crash"));
    await page.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0"></body>');
    await page.evaluate((q) => { window.__benchQuery = q; }, `backend=${backend}&count=${process.env.KODY_BENCH_COUNT ?? 300}&ms=4000`);
    await page.addScriptTag({ content: bundle, type: "module" });
    await page.waitForFunction(() => window.__bench !== undefined, null, { timeout: 60000 });
    const result = await page.evaluate(() => window.__bench);
    const gpu = await page.evaluate(() => {
      const c = document.createElement("canvas").getContext("webgl");
      const ext = c && c.getExtension("WEBGL_debug_renderer_info");
      return ext && c ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "n/a";
    });
    console.log(JSON.stringify({ requested: backend, gpu, ...result }));
    await page.close();
  }
} finally {
  await browser.close();
}
