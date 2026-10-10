import { defineConfig } from "@playwright/test";

const port = Number(process.env.PW_PORT ?? 5197);
// Browser: PW_EXECUTABLE (path chrome/headless-shell) > PW_CHANNEL (default "chrome") > chromium bawaan Playwright.
const executablePath = process.env.PW_EXECUTABLE || undefined;
const channel = executablePath ? undefined : (process.env.PW_CHANNEL ?? "chrome") || undefined;
// Drive C: penuh di mesin dev: PW_BROWSER_HOME mengalihkan TEMP/LOCALAPPDATA/APPDATA proses browser.
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

const launchOptions = {
  ...(executablePath ? { executablePath } : {}),
  ...(env ? { env } : {}),
  args: ["--enable-unsafe-swiftshader", "--no-crashpad", ...(home ? [`--disk-cache-dir=${home}/cache`] : [])],
};

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: process.env.PW_OUTPUT_DIR ?? "test-results",
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    ...(channel ? { channel } : {}),
    launchOptions,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "tablet", use: { viewport: { width: 820, height: 1180 }, hasTouch: false } },
  ],
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
