/**
 * E2E terhadap BUILD PRODUKSI (dist/) dengan header asli dari _headers (CSP, cache, service worker).
 * Jalankan `npm run build` dulu, lalu: npx playwright test -c playwright.prod.config.ts
 *
 * Proyek: desktop 1280x800, iPad lanskap 1180x820, iPad potret 820x1180, ponsel 390x844 (Chromium).
 * PW_WEBKIT=1 menambah proyek iPad di WebKit (butuh browser webkit terpasang di PLAYWRIGHT_BROWSERS_PATH).
 * Variabel lain sama dengan playwright.config.ts: PW_PORT, PW_EXECUTABLE, PW_BROWSER_HOME, PW_OUTPUT_DIR.
 */
import { defineConfig, devices, type Project } from "@playwright/test";

const port = Number(process.env.PW_PORT ?? 5431);
const executablePath = process.env.PW_EXECUTABLE || undefined;
const home = process.env.PW_BROWSER_HOME;
const env = home
  ? {
      ...(process.env as Record<string, string>),
      TEMP: `${home}/tmp`,
      TMP: `${home}/tmp`,
      LOCALAPPDATA: `${home}/AppData/Local`,
      APPDATA: `${home}/AppData/Roaming`,
      USERPROFILE: home,
    }
  : undefined;

const chromiumLaunch = {
  ...(executablePath ? { executablePath } : {}),
  ...(env ? { env } : {}),
  args: [
    "--enable-unsafe-swiftshader",
    "--no-crashpad",
    // Kamera & mikrofon palsu (pola bergerak + nada bip) tanpa dialog izin.
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
    ...(home ? [`--disk-cache-dir=${home}/cache`] : []),
  ],
};

const IPAD_UA =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const ipad = { hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: IPAD_UA };

const chromiumProjects: Project[] = [
  { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  { name: "ipad-landscape", use: { viewport: { width: 1180, height: 820 }, ...ipad } },
  { name: "ipad-portrait", use: { viewport: { width: 820, height: 1180 }, ...ipad } },
  {
    name: "phone",
    use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3, userAgent: IPHONE_UA },
  },
].map((p) => ({ ...p, use: { ...p.use, browserName: "chromium" as const, launchOptions: chromiumLaunch } }));

const webkitProjects: Project[] = process.env.PW_WEBKIT
  ? [
      { name: "webkit-ipad-landscape", use: { ...devices["iPad Pro 11 landscape"], viewport: { width: 1180, height: 820 } } },
      { name: "webkit-ipad-portrait", use: { ...devices["iPad Pro 11"], viewport: { width: 820, height: 1180 } } },
    ].map((p) => ({ ...p, use: { ...p.use, browserName: "webkit" as const } }))
  : [];

export default defineConfig({
  testDir: "tests/e2e/prod",
  outputDir: process.env.PW_OUTPUT_DIR ?? "test-results",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    permissions: [],
  },
  projects: [...chromiumProjects, ...webkitProjects],
  webServer: {
    command: `node tests/e2e/serve-prod.mjs dist ${port}`,
    url: `http://127.0.0.1:${port}/manifest.webmanifest`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
