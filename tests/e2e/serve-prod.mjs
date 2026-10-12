/**
 * Server statis kecil untuk e2e build produksi: menyajikan dist/ seperti Worker Cloudflare
 * (fallback SPA ke index.html) dan menerapkan header dari dist/_headers (CSP, cache, Service-Worker-Allowed).
 * Pemakaian: node tests/e2e/serve-prod.mjs <dir dist> <port>
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "dist");
const port = Number(process.argv[3] ?? 5431);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream",
  ".tflite": "application/octet-stream",
  ".task": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
};

/** Parser _headers Cloudflare: blok "pola" lalu baris "  Nama: nilai" atau "  ! Nama" (lepas header). */
function parseHeaders(text) {
  const rules = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      cur = { pattern: line.trim(), set: [], detach: [] };
      rules.push(cur);
      continue;
    }
    if (!cur) continue;
    const t = line.trim();
    if (t.startsWith("!")) cur.detach.push(t.slice(1).trim().toLowerCase());
    else {
      const i = t.indexOf(":");
      if (i > 0) cur.set.push([t.slice(0, i).trim(), t.slice(i + 1).trim()]);
    }
  }
  return rules.map((r) => ({
    ...r,
    re: new RegExp("^" + r.pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"),
  }));
}

const rules = existsSync(join(root, "_headers")) ? parseHeaders(readFileSync(join(root, "_headers"), "utf8")) : [];

function headersFor(path) {
  const out = new Map();
  for (const r of rules) {
    if (!r.re.test(path)) continue;
    for (const d of r.detach) out.delete(d);
    for (const [k, v] of r.set) out.set(k.toLowerCase(), [k, v]);
  }
  return [...out.values()];
}

createServer((req, res) => {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  } catch {
    res.statusCode = 400;
    res.end();
    return;
  }
  let file = normalize(join(root, path));
  if (!file.startsWith(root + sep) && file !== root) {
    res.statusCode = 403;
    res.end();
    return;
  }
  let served = path;
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, "index.html");
    served = "/";
  }
  for (const [k, v] of headersFor(path === served ? path : "/")) res.setHeader(k, v);
  res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(readFileSync(file));
}).listen(port, "127.0.0.1", () => console.log(`serve-prod ${root} on http://127.0.0.1:${port}`));
