#!/usr/bin/env node
// Gagal (exit 1) kalau kode produksi (packages/, app/) meng-import scratch-* / @scratch/* / blockly.
// Hanya tests/parity yang boleh memakai scratch-vm sebagai oracle.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const roots = ["packages", "app"];
const exts = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const skipDirs = new Set(["node_modules", "dist", ".vite"]);

// import ... from "x" | import("x") | require("x") | export ... from "x" | import "x"
const specRe = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(["'`])([^"'`]+)\1/g;
export const forbidden = (spec) =>
  /^(?:scratch-|@scratch\/|@scratch-|blockly(?:$|\/)|@blockly\/|@turbowarp\/)/.test(spec);

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (skipDirs.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (exts.test(name)) yield full;
  }
}

export function scanSource(text) {
  const hits = [];
  for (const m of text.matchAll(specRe)) if (forbidden(m[2])) hits.push(m[2]);
  return hits;
}

function main() {
  const violations = [];
  for (const r of roots) {
    for (const file of walk(join(root, r))) {
      for (const spec of scanSource(readFileSync(file, "utf8"))) {
        violations.push(`${relative(root, file)}: import "${spec}"`);
      }
    }
  }
  if (violations.length) {
    console.error("check:no-scratch-import GAGAL - kode produksi tidak boleh import Scratch/Blockly:");
    for (const v of violations) console.error("  " + v);
    process.exit(1);
  }
  console.log("check:no-scratch-import OK (packages/, app/ bersih dari scratch-*/blockly)");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
