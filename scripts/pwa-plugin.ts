/**
 * Plugin Vite (khusus build): membuat dist/sw.js dari scripts/pwa/sw-template.js dengan daftar aset
 * build ini, menyalin scripts/pwa/sw-register.js, dan menyisipkan <script> pendaftarannya ke HTML.
 * Versi cache = hash daftar aset, jadi setiap deploy otomatis membuang cache shell lama.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

export interface PwaConfig {
  version: string;
  modelsVersion: string;
  /** Di-precache saat install: HTML, entry JS/CSS, manifest, ikon. */
  shell: string[];
  /** Semua file /assets/* build ini (untuk membuang entri usang). */
  assets: string[];
}

/** Bentuk minimal OutputBundle Rollup yang dibutuhkan (mudah dibuat di tes). */
export interface BundleLike {
  [fileName: string]:
    | { type: "chunk"; fileName: string; isEntry: boolean; imports: string[]; viteMetadata?: { importedCss: Set<string> } }
    | { type: "asset"; fileName: string };
}

/** File statis di app/public yang ikut shell (harus ada di app/public). */
export const STATIC_SHELL = [
  "/manifest.webmanifest",
  "/kody.svg",
  "/favicon.ico",
  "/icons/favicon.svg",
  "/icons/favicon-32.png",
  "/icons/icon-192.png",
  "/apple-touch-icon.png",
];

const shortHash = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 12);

export function collectPwaConfig(bundle: BundleLike, modelsManifestText: string): PwaConfig {
  const files = Object.values(bundle);
  const assets = files
    .map((f) => f.fileName)
    .filter((n) => n.startsWith("assets/"))
    .map((n) => `/${n}`)
    .sort();
  const shellAssets = new Set<string>();
  const visit = (fileName: string): void => {
    const f = bundle[fileName];
    if (!f || f.type !== "chunk" || shellAssets.has(`/${fileName}`)) return;
    shellAssets.add(`/${fileName}`);
    for (const css of f.viteMetadata?.importedCss ?? []) shellAssets.add(`/${css}`);
    for (const dep of f.imports) visit(dep);
  };
  for (const f of files) if (f.type === "chunk" && f.isEntry) visit(f.fileName);
  return {
    version: shortHash(assets.join("\n")),
    modelsVersion: shortHash(modelsManifestText),
    shell: ["/", ...STATIC_SHELL, ...[...shellAssets].sort()],
    assets,
  };
}

export function renderServiceWorker(template: string, config: PwaConfig): string {
  const marker = "const CONFIG = self.__KB_CONFIG__;";
  if (!template.includes(marker)) throw new Error("sw-template.js: penanda CONFIG tidak ditemukan");
  return template.replace(marker, `const CONFIG = ${JSON.stringify(config)};`);
}

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export function kodyPwaPlugin(): Plugin {
  return {
    name: "kody-pwa",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: () => [{ tag: "script", attrs: { src: "/sw-register.js", defer: true }, injectTo: "body" }],
    },
    generateBundle(_options, bundle) {
      const config = collectPwaConfig(bundle as unknown as BundleLike, readFileSync(here("../packages/ai/src/models/manifest.json"), "utf8"));
      const template = readFileSync(here("./pwa/sw-template.js"), "utf8");
      this.emitFile({ type: "asset", fileName: "sw.js", source: renderServiceWorker(template, config) });
      this.emitFile({ type: "asset", fileName: "sw-register.js", source: readFileSync(here("./pwa/sw-register.js"), "utf8") });
    },
  };
}
