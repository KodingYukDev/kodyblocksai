/**
 * Tes plugin PWA + service worker hasil build, dijalankan di lingkungan SW palsu (vm) dengan
 * CacheStorage dan fetch tiruan.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { STATIC_SHELL, collectPwaConfig, renderServiceWorker, type BundleLike, type PwaConfig } from "./pwa-plugin";

const ORIGIN = "https://kodyblocksai.kodingyuk.id";
const template = readFileSync(fileURLToPath(new URL("./pwa/sw-template.js", import.meta.url)), "utf8");

function bundle(entryName = "index-AAA.js"): BundleLike {
  return {
    [`assets/${entryName}`]: {
      type: "chunk",
      fileName: `assets/${entryName}`,
      isEntry: true,
      imports: ["assets/react-vendor-BBB.js"],
      viteMetadata: { importedCss: new Set(["assets/index-CCC.css"]) },
    },
    "assets/react-vendor-BBB.js": { type: "chunk", fileName: "assets/react-vendor-BBB.js", isEntry: false, imports: [] },
    "assets/tfjs-DDD.js": { type: "chunk", fileName: "assets/tfjs-DDD.js", isEntry: false, imports: [] },
    "assets/index-CCC.css": { type: "asset", fileName: "assets/index-CCC.css" },
    "assets/drum-EEE.mp3": { type: "asset", fileName: "assets/drum-EEE.mp3" },
    "index.html": { type: "asset", fileName: "index.html" },
  } as unknown as BundleLike;
}

describe("collectPwaConfig", () => {
  it("shell = HTML + file statis + entry dan import statisnya, tanpa chunk lazy (tfjs)", () => {
    const c = collectPwaConfig(bundle(), "{}");
    expect(c.shell[0]).toBe("/");
    for (const s of STATIC_SHELL) expect(c.shell).toContain(s);
    expect(c.shell).toContain("/assets/index-AAA.js");
    expect(c.shell).toContain("/assets/react-vendor-BBB.js");
    expect(c.shell).toContain("/assets/index-CCC.css");
    expect(c.shell).not.toContain("/assets/tfjs-DDD.js");
    expect(c.shell.some((p) => p.startsWith("/models/"))).toBe(false);
    expect(c.assets).toContain("/assets/tfjs-DDD.js");
    expect(c.assets).not.toContain("/index.html");
  });

  it("versi berubah bila aset berubah; versi model mengikuti manifest model", () => {
    const a = collectPwaConfig(bundle("index-AAA.js"), "{}");
    const b = collectPwaConfig(bundle("index-ZZZ.js"), "{}");
    expect(a.version).not.toBe(b.version);
    expect(collectPwaConfig(bundle(), '{"v":1}').modelsVersion).not.toBe(a.modelsVersion);
  });

  it("STATIC_SHELL hanya berisi file yang ada di app/public", () => {
    for (const p of STATIC_SHELL) {
      expect(() => readFileSync(fileURLToPath(new URL(`../app/public${p}`, import.meta.url)))).not.toThrow();
    }
  });

  it("template SW tanpa penanda ditolak", () => {
    expect(() => renderServiceWorker("console.log(1)", collectPwaConfig(bundle(), "{}"))).toThrow();
  });
});

// ------------------------------------------------------------------ lingkungan SW palsu
class FakeCache {
  readonly store = new Map<string, Response>();
  private key(r: RequestInfo | URL): string {
    const u = typeof r === "string" ? r : r instanceof URL ? r.href : r.url;
    return new URL(u, ORIGIN).href;
  }
  async match(r: RequestInfo): Promise<Response | undefined> {
    return this.store.get(this.key(r))?.clone();
  }
  async put(r: RequestInfo, res: Response): Promise<void> {
    this.store.set(this.key(r), res);
  }
  async delete(r: RequestInfo): Promise<boolean> {
    return this.store.delete(this.key(r));
  }
  async keys(): Promise<Request[]> {
    return [...this.store.keys()].map((u) => new Request(u));
  }
}

class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>();
  async open(name: string): Promise<FakeCache> {
    let c = this.caches.get(name);
    if (!c) this.caches.set(name, (c = new FakeCache()));
    return c;
  }
  async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }
  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }
}

type Handler = (e: unknown) => void;

function bootSw(config: PwaConfig, net: (url: string) => Response | Promise<Response>, cacheStorage = new FakeCacheStorage()) {
  const handlers = new Map<string, Handler>();
  const fetched: string[] = [];
  let skipped = 0;
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
    skipWaiting: async () => {
      skipped++;
    },
    clients: { claim: async () => {} },
  };
  const fetchFn = async (input: RequestInfo) => {
    const url = new URL(typeof input === "string" ? input : input.url, ORIGIN).href;
    fetched.push(new URL(url).pathname);
    return net(url);
  };
  vm.runInNewContext(renderServiceWorker(template, config), {
    self,
    caches: cacheStorage,
    fetch: fetchFn,
    Request,
    Response,
    URL,
    Promise,
    Set,
    JSON,
    setTimeout,
    clearTimeout,
  });

  async function lifecycle(type: "install" | "activate"): Promise<void> {
    const waits: Promise<unknown>[] = [];
    handlers.get(type)?.({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }

  async function request(path: string, mode: RequestMode = "cors"): Promise<Response | null> {
    let responded: Promise<Response> | null = null;
    const waits: Promise<unknown>[] = [];
    const req = new Request(new URL(path, ORIGIN).href);
    const event = {
      request: { method: "GET", url: req.url, mode, headers: req.headers },
      respondWith: (p: Promise<Response>) => {
        responded = p;
      },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    };
    // Request asli dipakai saat fetch(request) dipanggil SW.
    Object.setPrototypeOf(event.request, req);
    handlers.get("fetch")?.(event);
    const res = responded ? await responded : null;
    await Promise.all(waits);
    return res;
  }

  return { lifecycle, request, fetched, cacheStorage, skipped: () => skipped };
}

const ok = (body: string, type = "application/javascript") =>
  new Response(body, { status: 200, headers: { "content-type": type } });

describe("service worker", () => {
  const config = collectPwaConfig(bundle(), "{}");

  it("install mem-precache shell, bukan model; lalu skipWaiting", async () => {
    const sw = bootSw(config, (url) => ok(url, url.endsWith("/") ? "text/html" : "application/javascript"));
    await sw.lifecycle("install");
    expect(sw.skipped()).toBe(1);
    expect(new Set(sw.fetched)).toEqual(new Set(config.shell));
    const shell = sw.cacheStorage.caches.get(`kb-shell-${config.version}`);
    expect(shell?.store.size).toBe(config.shell.length);
    expect([...sw.cacheStorage.caches.keys()].some((n) => n.startsWith("kb-models"))).toBe(false);
  });

  it("/assets/*: cache dulu; respons HTML (fallback SPA) tidak disimpan", async () => {
    const sw = bootSw(config, (url) => (url.includes("missing") ? ok("<html>", "text/html") : ok("js")));
    await sw.request("/assets/tfjs-DDD.js");
    await sw.request("/assets/tfjs-DDD.js");
    expect(sw.fetched.filter((p) => p === "/assets/tfjs-DDD.js")).toHaveLength(1);
    await sw.request("/assets/missing-X.js");
    await sw.request("/assets/missing-X.js");
    expect(sw.fetched.filter((p) => p === "/assets/missing-X.js")).toHaveLength(2);
  });

  it("/models/*: disimpan saat pertama dipakai di cache versi model", async () => {
    const sw = bootSw(config, () => ok("weights", "application/octet-stream"));
    await sw.request("/models/mobilenet/weights.bin");
    await sw.request("/models/mobilenet/weights.bin");
    expect(sw.fetched.filter((p) => p.startsWith("/models/"))).toHaveLength(1);
    expect(sw.cacheStorage.caches.get(`kb-models-${config.modelsVersion}`)?.store.size).toBe(1);
  });

  it("navigasi: jaringan dulu (HTML selalu baru), salinan dipakai saat offline", async () => {
    let online = true;
    let html = "<html>v1";
    const sw = bootSw(config, (url) => {
      if (!online) throw new TypeError("offline");
      return ok(url.endsWith("/") || url.includes("/proyek") ? html : "x", url.endsWith("/") || url.includes("/proyek") ? "text/html" : "x");
    });
    await sw.lifecycle("install");
    html = "<html>v2";
    const fresh = await sw.request("/proyek/123", "navigate");
    expect(await fresh?.text()).toBe("<html>v2");
    online = false;
    const offline = await sw.request("/", "navigate");
    expect(await offline?.text()).toBe("<html>v2");
  });

  it("activate membuang cache shell lama dan aset di luar build sekarang/sebelumnya", async () => {
    const storage = new FakeCacheStorage();
    (await storage.open("kb-shell-lama")).store.set(`${ORIGIN}/`, ok("old"));
    (await storage.open("cache-orang-lain")).store.set(`${ORIGIN}/x`, ok("x"));
    const assets = await storage.open("kb-assets");
    assets.store.set(`${ORIGIN}/assets/tfjs-DDD.js`, ok("keep"));
    assets.store.set(`${ORIGIN}/assets/sangat-lama.js`, ok("drop"));
    assets.store.set(`${ORIGIN}/assets/library/abc.svg`, ok("lib"));
    const sw = bootSw(config, () => ok("x"), storage);
    await sw.lifecycle("activate");
    const names = [...storage.caches.keys()];
    expect(names).not.toContain("kb-shell-lama");
    expect(names).toContain("cache-orang-lain");
    expect([...assets.store.keys()].map((u) => new URL(u).pathname).sort()).toEqual([
      "/assets/library/abc.svg",
      "/assets/tfjs-DDD.js",
    ]);
  });

  it("permintaan lintas origin dan non-GET tidak disentuh", async () => {
    const sw = bootSw(config, () => ok("x"));
    expect(await sw.request("https://example.com/a.js")).toBeNull();
  });
});
