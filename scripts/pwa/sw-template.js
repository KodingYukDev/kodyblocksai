/* KodyBlocks AI service worker. Dibuat saat build oleh scripts/pwa-plugin.ts (jangan diedit di dist).
 *
 * Strategi:
 * - Navigasi (HTML): jaringan dulu, cadangan salinan terakhir bila offline / jaringan sangat lambat.
 *   Salinan HTML diperbarui setiap kali jaringan berhasil, jadi HTML tidak pernah basi selamanya.
 * - /assets/* (nama ber-hash, isi tidak pernah berubah): cache dulu, diisi saat pertama dipakai.
 *   Entri yang tidak dipakai build sekarang/sebelumnya dibuang saat SW baru aktif.
 * - /models/* (model AI 69 MB): TIDAK di-precache. Disimpan saat pertama dipakai ekstensi AI, di cache
 *   per versi manifest model; integritas tetap dicek SHA-256 oleh aplikasi.
 * - Respons HTML untuk permintaan aset (fallback SPA Cloudflare saat file hilang) tidak pernah disimpan.
 */
/* global self, caches, fetch, Response, URL */
const CONFIG = self.__KB_CONFIG__;

const SHELL_CACHE = `kb-shell-${CONFIG.version}`;
const ASSET_CACHE = "kb-assets";
const MODEL_CACHE = `kb-models-${CONFIG.modelsVersion}`;
const META_CACHE = "kb-meta";
const META_KEY = "/__kb/asset-lists";
const OWN_PREFIX = "kb-";
const NAV_TIMEOUT_MS = 4000;
const INDEX_URL = "/";

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function isHtml(response) {
  const type = response.headers.get("content-type") || "";
  return type.includes("text/html");
}

/** Hanya respons 200 penuh, same-origin, bukan HTML (kecuali memang diminta HTML). */
function cacheable(response, allowHtml) {
  if (!response || response.status !== 200) return false;
  // Same-origin = "basic"; "opaque"/"error" tidak pernah disimpan.
  if (response.type !== "basic" && response.type !== "default") return false;
  if (!allowHtml && isHtml(response)) return false;
  return true;
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(
    CONFIG.shell.map(async (path) => {
      try {
        const res = await fetch(new Request(new URL(path, self.location.origin).href, { cache: "reload", credentials: "same-origin" }));
        if (cacheable(res, path === INDEX_URL)) await cache.put(path, res);
      } catch {
        // Offline saat install: file diisi saat dipakai nanti.
      }
    }),
  );
  // Entry JS/CSS juga masuk cache aset (dipakai halaman yang sama).
  const assets = await caches.open(ASSET_CACHE);
  await Promise.all(
    CONFIG.shell
      .filter((p) => p.startsWith("/assets/"))
      .map(async (path) => {
        const hit = await cache.match(path);
        if (hit) await assets.put(path, hit.clone());
      }),
  );
}

async function pruneCaches() {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE, MODEL_CACHE, META_CACHE]);
  const names = await caches.keys();
  await Promise.all(names.filter((n) => n.startsWith(OWN_PREFIX) && !keep.has(n)).map((n) => caches.delete(n)));

  // Simpan aset build sekarang + build sebelumnya (tab lama yang masih terbuka tetap bisa memuat chunk).
  const meta = await caches.open(META_CACHE);
  let previous = [];
  try {
    const stored = await meta.match(META_KEY);
    if (stored) previous = (await stored.json()).current || [];
  } catch {
    previous = [];
  }
  const allowed = new Set([...CONFIG.assets, ...previous]);
  const assets = await caches.open(ASSET_CACHE);
  for (const req of await assets.keys()) {
    const path = new URL(req.url).pathname;
    if (!allowed.has(path) && !path.startsWith("/assets/library/")) await assets.delete(req);
  }
  const lists = { current: CONFIG.assets, previous };
  await meta.put(META_KEY, new Response(JSON.stringify(lists), { headers: { "content-type": "application/json" } }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(pruneCaches().then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data === "kb:skip-waiting") self.skipWaiting();
});

async function cacheFirst(request, cacheName, allowHtml = false) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (cacheable(res, allowHtml)) {
    try {
      await cache.put(request, res.clone());
    } catch {
      // Kuota penuh (iPad dengan ruang sempit): tetap kembalikan respons jaringan.
    }
  }
  return res;
}

async function staleWhileRevalidate(request, cacheName, event) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then(async (res) => {
      if (cacheable(res, false)) await cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(network);
    return hit;
  }
  const res = await network;
  return res || Response.error();
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(INDEX_URL);
  const network = fetch(request).then(async (res) => {
    if (cacheable(res, true) && isHtml(res)) await cache.put(INDEX_URL, res.clone());
    return res;
  });
  if (!cached) return network;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), NAV_TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
    // Jaringan lambat: pakai salinan; jaringan tetap memperbarui cache di belakang.
    network.catch(() => null);
    return cached;
  } catch {
    return cached;
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!sameOrigin(url)) return;
  // Media dengan Range (audio/video) dan file SW sendiri dibiarkan ke jaringan.
  if (request.headers.has("range")) return;
  const path = url.pathname;
  if (path === "/sw.js" || path === "/sw-register.js") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (path.startsWith("/models/")) {
    event.respondWith(cacheFirst(request, MODEL_CACHE));
    return;
  }
  if (path === "/assets/library/library.json") {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE, event));
    return;
  }
  if (path.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }
  // Ikon, manifest, maskot, dll.
  event.respondWith(staleWhileRevalidate(request, SHELL_CACHE, event));
});
