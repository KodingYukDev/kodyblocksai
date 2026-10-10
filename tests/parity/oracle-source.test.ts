/**
 * Oracle = scratch-vm 5.0.300 (npm), sedangkan engine kita mengikuti scratch-vm 4.8.102 (BSD-3,
 * _reference/bsd3-local). Tes ini memastikan file perilaku inti keduanya identik, sehingga trace
 * oracle sah sebagai spesifikasi 4.8.102. Dilewati bila folder _reference tidak ada (mis. di CI).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const bsdRoot = process.env.PARITY_BSD_VM_SRC ?? join(repoRoot, "..", "_reference", "bsd3-local", "scratch-vm", "src");
const oracleRoot = join(repoRoot, "node_modules", "scratch-vm", "src");

const CORE_FILES = [
  "engine/runtime.js",
  "engine/sequencer.js",
  "engine/execute.js",
  "engine/thread.js",
  "engine/block-utility.js",
  "engine/blocks.js",
  "sprites/rendered-target.js",
  "sprites/sprite.js",
  "engine/target.js",
  "util/cast.js",
  "util/math-util.js",
  "blocks/scratch3_motion.js",
  "blocks/scratch3_looks.js",
  "blocks/scratch3_sound.js",
  "blocks/scratch3_event.js",
  "blocks/scratch3_control.js",
  "blocks/scratch3_sensing.js",
  "blocks/scratch3_operators.js",
  "blocks/scratch3_data.js",
  "blocks/scratch3_procedures.js",
  "io/mouse.js",
  "io/keyboard.js",
  "io/clock.js",
];

const normalize = (text: string): string => text.split(/\r?\n/).map((l) => l.trimEnd()).join("\n");

describe.skipIf(!existsSync(bsdRoot) || !existsSync(oracleRoot))("oracle scratch-vm == spesifikasi BSD 4.8.102", () => {
  for (const file of CORE_FILES) {
    it(file, () => {
      const bsd = normalize(readFileSync(join(bsdRoot, file), "utf8"));
      const oracle = normalize(readFileSync(join(oracleRoot, file), "utf8"));
      expect(oracle === bsd, `${file} berbeda antara oracle dan BSD 4.8.102`).toBe(true);
    });
  }
});
