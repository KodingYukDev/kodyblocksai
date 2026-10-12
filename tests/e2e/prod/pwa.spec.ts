/**
 * Build produksi: manifest + ikon tersaji, service worker terdaftar, muat kedua jalan offline (app shell).
 */
import { expect, test } from "@playwright/test";
import { expectNoProblems, openApp, scriptOpcodes, watchProblems } from "./helpers";

function pngSize(buf: Buffer): { w: number; h: number } {
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test("manifest, ikon, dan header keamanan tersaji", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("manifest+json");
  const manifest = (await res.json()) as { name: string; start_url: string; display: string; icons: { src: string; sizes: string; type: string; purpose: string }[] };
  expect(manifest.name).toBe("KodyBlocks AI");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons) {
    const r = await request.get(icon.src);
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()["content-type"], icon.src).toBe(icon.type);
    if (icon.type === "image/png") {
      const { w, h } = pngSize(await r.body());
      expect(`${w}x${h}`, icon.src).toBe(icon.sizes);
    }
  }
  for (const path of ["/apple-touch-icon.png", "/favicon.ico", "/sw.js", "/sw-register.js"]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
  const apple = pngSize(await (await request.get("/apple-touch-icon.png")).body());
  expect(apple.w).toBe(180);

  const html = await request.get("/");
  expect(html.headers()["content-security-policy"]).toContain("default-src 'self'");
  expect(html.headers()["cache-control"]).toBe("no-cache");
  await page.goto("/");
  expect(await page.locator('link[rel="manifest"]').getAttribute("href")).toBe("/manifest.webmanifest");
  expect(await page.locator('link[rel="apple-touch-icon"]').count()).toBeGreaterThan(0);
  expect(await page.locator('meta[name="theme-color"]').getAttribute("content")).toBeTruthy();
});

test("service worker terdaftar dan app shell jalan offline", async ({ page, context }, info) => {
  const problems = await watchProblems(page);
  await openApp(page);
  const state = await page.evaluate(async () => {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 20_000))]);
    return reg ? (reg.active?.state ?? "none") : "timeout";
  });
  expect(state).toBe("activated");
  // Muat ulang sekali online supaya halaman dikendalikan SW dan cache terisi.
  await page.reload();
  await openApp(page, page.url());
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 }).toBe(true);
  await expectNoProblems(page, problems);

  // Offline: muat ulang tetap membuka editor (dari cache SW).
  await context.setOffline(true);
  const offline = await watchProblems(page);
  const failed: string[] = [];
  page.on("requestfailed", (r) => failed.push(`${r.url()} ${r.failure()?.errorText ?? ""}`));
  try {
    await page.reload();
    await openApp(page, page.url()).catch(async (e) => {
      await page.screenshot({ path: info.outputPath("offline-fail.png") });
      throw e;
    });
    expect(await scriptOpcodes(page)).toEqual([]);
    await page.screenshot({ path: info.outputPath("offline.png") });
    // Kegagalan jaringan yang memang diharapkan saat offline tidak dihitung; error app tetap dihitung.
    // Satu-satunya permintaan yang boleh gagal offline: /sw-register.js (sengaja tidak lewat cache SW agar
    // logika pendaftaran selalu segar; SW sudah mengendalikan halaman, jadi tidak berpengaruh).
    expect(failed.filter((f) => !f.includes("/sw-register.js")), "permintaan gagal saat offline").toEqual([]);
    offline.errors = offline.errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|net::|WebKit encountered an internal error/i.test(e));
    await expectNoProblems(page, offline);
  } finally {
    await context.setOffline(false);
  }
});
