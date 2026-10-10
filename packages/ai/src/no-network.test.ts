/**
 * Tes statis privasi: kode produksi paket AI tidak boleh punya jalur kirim data ke jaringan
 * selain pemuat model terverifikasi, dan tidak boleh memakai eval/innerHTML.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "testing" ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

const files = sourceFiles(ROOT).map((p) => ({ path: relative(ROOT, p).replace(/\\/g, "/"), text: readFileSync(p, "utf8") }));

describe("tidak ada jalur kirim data", () => {
  it("fetch hanya di pemuat model terverifikasi", () => {
    const offenders = files.filter((f) => /\bfetch\s*\(/.test(f.text) && f.path !== "models/verified-fetch.ts").map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it.each([
    ["XMLHttpRequest", /XMLHttpRequest/],
    ["WebSocket", /new\s+WebSocket/],
    ["sendBeacon", /sendBeacon/],
    ["EventSource", /new\s+EventSource/],
    ["eval", /\beval\s*\(|new\s+Function\s*\(/],
    ["innerHTML", /innerHTML|dangerouslySetInnerHTML|outerHTML|insertAdjacentHTML/],
    ["URL http(s) absolut", /["'`]https?:\/\//],
    ["MediaRecorder", /MediaRecorder/],
  ])("tidak memakai %s", (_name, re) => {
    expect(files.filter((f) => re.test(f.text)).map((f) => f.path)).toEqual([]);
  });

  it("getUserMedia hanya di pengendali perangkat", () => {
    const users = files.filter((f) => /getUserMedia\s*\(/.test(f.text)).map((f) => f.path).sort();
    expect(users).toEqual(["devices/camera.ts", "devices/microphone.ts"]);
  });

  it("tidak mengimpor scratch-* / blockly", () => {
    expect(files.filter((f) => /from\s+["'](scratch-|@scratch\/|blockly)/.test(f.text)).map((f) => f.path)).toEqual([]);
  });
});
