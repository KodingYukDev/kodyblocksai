/**
 * Bantuan e2e build produksi. Tidak memakai kait window.__kody (hanya ada di dev/mode e2e):
 * semua pemeriksaan lewat DOM, seperti yang dilihat anak.
 */
import { expect, type CDPSession, type Page, type TestInfo } from "@playwright/test";

export type Box = { x: number; y: number; width: number; height: number };
export type Pt = { x: number; y: number };

export interface Problems {
  errors: string[];
  csp: string[];
}

/** Pesan konsol yang memang diharapkan (bukan bug) dan boleh diabaikan. */
const IGNORED = [
  // Chromium headless tanpa GPU: peringatan WebGL performa (bukan error app).
  /GPU stall due to ReadPixels/i,
  /WebGL.*(warning|performance)/i,
];

/** Pasang perekam error konsol, pageerror, dan pelanggaran CSP SEBELUM halaman dibuka. */
export async function watchProblems(page: Page): Promise<Problems> {
  const p: Problems = { errors: [], csp: [] };
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] };
    w.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      w.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  page.on("pageerror", (e) => p.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    const text = m.text();
    if (/Content Security Policy|Refused to/i.test(text)) p.csp.push(text);
    if (m.type() !== "error") return;
    if (IGNORED.some((re) => re.test(text))) return;
    p.errors.push(`console: ${text}`);
  });
  return p;
}

export async function expectNoProblems(page: Page, p: Problems): Promise<void> {
  const fromPage = await page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? []).catch(() => []);
  expect([...p.csp, ...fromPage], "pelanggaran CSP").toEqual([]);
  expect(p.errors, "error konsol / pageerror").toEqual([]);
}

/** Buka app, tunggu menu bar + palet siap + layar memuat hilang. */
export async function openApp(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  await expect(page.locator(".kb-menu-bar")).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => document.querySelectorAll(".kb-flyout-svg g.kb-block[data-opcode]").length > 50, null, {
    timeout: 60_000,
  });
  await expect(page.locator(".kb-loading")).toHaveCount(0, { timeout: 30_000 });
}

export function isTouch(info: TestInfo): boolean {
  return !!info.project.use.hasTouch;
}

export function isChromium(info: TestInfo): boolean {
  return (info.project.use.browserName ?? "chromium") === "chromium";
}

/** Tata letak ponsel: area kode/sprite ada di tab. */
export function isPhone(info: TestInfo): boolean {
  return (info.project.use.viewport?.width ?? 1280) < 600;
}

/** Ketuk (sentuh) atau klik (mouse) sesuai proyek. */
export async function press(page: Page, info: TestInfo, locator: ReturnType<Page["locator"]>): Promise<void> {
  if (isTouch(info)) await locator.tap();
  else await locator.click();
}

const cdpSessions = new WeakMap<Page, CDPSession>();
async function cdp(page: Page): Promise<CDPSession> {
  let s = cdpSessions.get(page);
  if (!s) {
    s = await page.context().newCDPSession(page);
    cdpSessions.set(page, s);
  }
  return s;
}

/**
 * Seret seperti anak: mulai mendatar dulu (palet membedakan "seret blok" dari "gulir palet" lewat sudut
 * awal gerakan, seperti Scratch), lalu ke tujuan.
 */
export async function drag(page: Page, info: TestInfo, from: Pt, to: Pt, steps = 14): Promise<void> {
  const dx = to.x - from.x;
  if (Math.abs(dx) > 60) {
    const mid = { x: from.x + Math.sign(dx) * 40, y: from.y };
    await dragPath(page, info, [from, mid, to], steps);
  } else {
    await dragPath(page, info, [from, to], steps);
  }
}

async function dragPath(page: Page, info: TestInfo, pts: Pt[], steps: number): Promise<void> {
  const path: Pt[] = [pts[0]!];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]!;
    const b = pts[k]!;
    const n = k === 1 && pts.length > 2 ? 4 : steps;
    for (let i = 1; i <= n; i++) path.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  }
  await dragAlong(page, info, path);
}

async function dragAlong(page: Page, info: TestInfo, path: Pt[]): Promise<void> {
  const from = path[0]!;
  const to = path[path.length - 1]!;
  const moves = path.slice(1);
  if (isTouch(info) && isChromium(info)) {
    const s = await cdp(page);
    const pt = (x: number, y: number) => [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 1, radiusY: 1, force: 1 }];
    await s.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(from.x, from.y) });
    await page.waitForTimeout(60);
    // Seperti jari sungguhan: gerakan dikirim tiap ~16 ms tanpa menunggu halaman selesai memproses
    // gerakan sebelumnya (saat main thread sibuk, gerakan mengantre; lihat deferToNextFrame di gesture.ts).
    const sent: Promise<unknown>[] = [];
    for (const m of moves) {
      sent.push(s.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(m.x, m.y) }));
      await new Promise((r) => setTimeout(r, 16));
    }
    await Promise.all(sent);
    await page.waitForTimeout(80);
    await s.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else if (isTouch(info)) {
    // WebKit: tidak ada CDP. Kirim PointerEvent sentuh sintetis (jalur yang dipakai editor blok).
    await page.evaluate(
      async ({ from, to, moves }) => {
        const at = (x: number, y: number) => document.elementFromPoint(x, y) ?? document.body;
        const ev = (type: string, x: number, y: number, target: Element) =>
          target.dispatchEvent(
            new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, buttons: type === "pointerup" ? 0 : 1 }),
          );
        const start = at(from.x, from.y);
        ev("pointerdown", from.x, from.y, start);
        for (const m of moves) {
          ev("pointermove", m.x, m.y, at(m.x, m.y));
          await new Promise((r) => setTimeout(r, 16));
        }
        ev("pointerup", to.x, to.y, at(to.x, to.y));
      },
      { from, to, moves },
    );
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (const m of moves) await page.mouse.move(m.x, m.y);
    await page.waitForTimeout(80);
    await page.mouse.up();
  }
  await page.waitForTimeout(300);
}

/** Pada ponsel, pastikan tab Kode yang terbuka. */
export async function showCode(page: Page, info: TestInfo): Promise<void> {
  const tab = page.getByRole("tab", { name: "Kode" });
  if ((await tab.count()) && (await tab.getAttribute("aria-selected")) !== "true") await press(page, info, tab);
}

export async function openCategory(page: Page, info: TestInfo, name: string): Promise<void> {
  await showCode(page, info);
  await press(page, info, page.locator(".kb-ws-cat").filter({ hasText: name }).first());
  await page.waitForTimeout(500);
}

/** Kotak blok palet (flyout) dengan opcode tertentu (yang tampil di layar). */
export async function flyoutBlock(page: Page, opcode: string): Promise<Box> {
  const loc = page.locator(`.kb-flyout-svg g.kb-block[data-opcode="${opcode}"]:not([data-shadow])`).first();
  await expect(loc, `blok palet ${opcode}`).toBeVisible();
  const box = await loc.boundingBox();
  expect(box, `kotak ${opcode}`).not.toBeNull();
  return box as Box;
}

export async function workspaceBox(page: Page): Promise<Box> {
  const box = await page.locator(".kb-ws-main").boundingBox();
  expect(box).not.toBeNull();
  return box as Box;
}

/** Opcode skrip di area kode, per stack (dibaca dari DOM). */
export async function scriptOpcodes(page: Page): Promise<string[][]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".kb-main-svg g.kb-stack[data-top-id]"))
      .filter((s) => !s.parentElement?.closest("g.kb-stack"))
      .map((s) =>
        Array.from(s.children)
          .filter((c) => c.matches("g.kb-block"))
          .map((c) => c.getAttribute("data-opcode") ?? "?"),
      ),
  );
}

/** Seret blok dari palet ke titik tertentu di area kode. */
export async function dragFromPalette(page: Page, info: TestInfo, opcode: string, to: Pt): Promise<void> {
  const src = await flyoutBlock(page, opcode);
  await drag(page, info, { x: src.x + 8, y: src.y + Math.min(src.height / 2, 14) }, to);
}

/** Sambungkan blok palet di bawah stack terakhir yang paling atas di area kode. */
export async function appendToTopStack(page: Page, info: TestInfo, opcode: string, category: string): Promise<void> {
  await openCategory(page, info, category);
  const stack = await page.locator(".kb-main-svg g.kb-stack[data-top-id]").first().boundingBox();
  expect(stack).not.toBeNull();
  const s = stack as Box;
  await dragFromPalette(page, info, opcode, { x: s.x + 8, y: s.y + s.height + 8 });
}

/** Nilai posisi x sprite terpilih (input "x" di info sprite; di ponsel ada di tab Sprite). */
export async function spriteX(page: Page): Promise<number> {
  const v = await page.locator('input[aria-label="x"]').first().inputValue();
  return Number(v);
}

/** Buka menu bar (File, Belajar AI, ...). */
export async function menu(page: Page, info: TestInfo, name: string, item: string | RegExp): Promise<void> {
  await press(page, info, page.locator(".kb-menu-bar").getByRole("button", { name, exact: true }));
  await press(page, info, page.getByRole("menuitem", { name: item }).first());
}

/** Tidak ada scroll horizontal di halaman. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    bw: document.body.scrollWidth,
  }));
  expect(m.sw, `scrollWidth ${m.sw} > clientWidth ${m.cw}`).toBeLessThanOrEqual(m.cw);
  expect(m.bw).toBeLessThanOrEqual(m.cw);
}

/**
 * Menu tambah bulat (sprite/kostum/suara). Mouse: sorot lalu klik pilihan. Sentuh: ketukan pertama membuka
 * pilihan. `item` = null menjalankan aksi utama (sentuh: ketuk kedua kali).
 */
export async function addMenu(page: Page, info: TestInfo, mainTitle: string, item: string | null): Promise<void> {
  const main = page.getByRole("button", { name: mainTitle, exact: true }).first();
  if (isTouch(info)) {
    await main.tap();
    await page.waitForTimeout(250);
    if (item === null) await main.tap();
    else await page.getByRole(/* item buttons */ "menuitem", { name: item, exact: true }).or(page.getByRole("button", { name: item, exact: true })).first().tap();
  } else {
    if (item === null) {
      await main.click();
      return;
    }
    await main.hover();
    await page.waitForTimeout(250);
    await page.getByRole("menuitem", { name: item, exact: true }).or(page.getByRole("button", { name: item, exact: true })).first().click();
  }
}

/** Pada iPad/iPhone app menyimpan lewat navigator.share: ganti dengan penangkap file untuk tes. */
export async function stubShare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared?: { name: string; b64: string }[] };
    w.__shared = [];
    const nav = navigator as Navigator & { share: unknown; canShare: unknown };
    Object.defineProperty(nav, "canShare", { configurable: true, value: (d: { files?: File[] }) => !!d?.files?.length });
    Object.defineProperty(nav, "share", {
      configurable: true,
      value: async (d: { files: File[] }) => {
        for (const f of d.files) {
          const bytes = new Uint8Array(await f.arrayBuffer());
          let s = "";
          for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          w.__shared!.push({ name: f.name, b64: btoa(s) });
        }
      },
    });
  });
}

/** Simpan .sb3 lewat menu File; kembalikan nama + isi file (unduhan biasa atau lembar Bagikan iPad). */
export async function saveProject(page: Page, info: TestInfo): Promise<{ name: string; buffer: Buffer }> {
  const apple = /iPad|iPhone/.test(String(info.project.use.userAgent ?? "")) || !isChromium(info);
  if (apple) {
    const before = await page.evaluate(() => (window as unknown as { __shared?: unknown[] }).__shared?.length ?? 0);
    await menu(page, info, "File", "Simpan .sb3");
    // Bila Safari menolak share (aktivasi habis), app menampilkan tombol "Simpan file".
    const again = page.getByRole("button", { name: "Simpan file" });
    const got = await page
      .waitForFunction((n) => ((window as unknown as { __shared?: unknown[] }).__shared?.length ?? 0) > n, before, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (!got && (await again.count())) await press(page, info, again);
    const f = await page.evaluate(() => {
      const s = (window as unknown as { __shared: { name: string; b64: string }[] }).__shared;
      return s[s.length - 1];
    });
    expect(f, "file dibagikan").toBeTruthy();
    return { name: f!.name, buffer: Buffer.from(f!.b64, "base64") };
  }
  const dl = page.waitForEvent("download");
  await menu(page, info, "File", "Simpan .sb3");
  const d = await dl;
  const path = info.outputPath(d.suggestedFilename());
  await d.saveAs(path);
  const { readFileSync } = await import("node:fs");
  return { name: d.suggestedFilename(), buffer: readFileSync(path) };
}

/** Buka file .sb3 lewat menu File. */
export async function loadProject(page: Page, info: TestInfo, file: { name: string; buffer: Buffer }): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await menu(page, info, "File", "Buka .sb3");
  await (await chooser).setFiles({ name: file.name, mimeType: "application/octet-stream", buffer: file.buffer });
}

/** Proyek baru (konfirmasi dialog di dalam app atau window.confirm). */
export async function newProject(page: Page, info: TestInfo): Promise<void> {
  page.once("dialog", (d) => void d.accept());
  await menu(page, info, "File", "Baru");
  const ok = page.locator(".kb-dialog, [role=alertdialog], [role=dialog]").getByRole("button", { name: /^(Ya|OK|Ganti|Lanjut|Baru)/ });
  if (await ok.count()) await press(page, info, ok.first());
}

/** WAV mono 16-bit pendek (nada 440 Hz) untuk uji unggah suara. */
export function makeWav(seconds = 0.5, rate = 22050): Buffer {
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), 44 + i * 2);
  return buf;
}

/** Tahan tombol (jari atau mouse) selama `ms`. */
export async function hold(page: Page, info: TestInfo, locator: ReturnType<Page["locator"]>, ms: number): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  expect(b).not.toBeNull();
  const x = b!.x + b!.width / 2;
  const y = b!.y + b!.height / 2;
  if (isTouch(info) && isChromium(info)) {
    const s = await cdp(page);
    await s.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 2 }] });
    await page.waitForTimeout(ms);
    await s.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else if (isTouch(info)) {
    await locator.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 9, isPrimary: true, button: 0, clientX: x, clientY: y });
    await page.waitForTimeout(ms);
    await locator.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 9, isPrimary: true, button: 0, clientX: x, clientY: y });
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(ms);
    await page.mouse.up();
  }
}

/** Tambah ekstensi dari galeri (tombol kiri bawah area kode). */
export async function addExtension(page: Page, info: TestInfo, id: string): Promise<void> {
  await showCode(page, info);
  await press(page, info, page.getByRole("button", { name: "Tambah Ekstensi" }).first());
  const lib = page.getByRole("dialog", { name: "Pilih Ekstensi" });
  await expect(lib).toBeVisible();
  await press(page, info, lib.locator(`[data-extension-id="${id}"]`));
  await expect(lib).toHaveCount(0);
}

/** Tunggu blok palet ber-opcode akhiran tertentu lalu kembalikan locator-nya. */
export function paletteBlock(page: Page, suffix: string) {
  return page.locator(`.kb-flyout-svg g.kb-block[data-opcode$="${suffix}"]:not([data-shadow])`).first();
}

/** Teks semua field (dropdown dll) pada blok. */
export async function blockText(loc: ReturnType<Page["locator"]>): Promise<string> {
  return ((await loc.locator("text").allTextContents()).join(" ") || "").replace(/\s+/g, " ").trim();
}

/** Seret blok palet (locator) ke area kode, lalu ketuk/klik untuk menjalankannya; kembalikan isi gelembung nilai. */
export async function runReporterFromPalette(
  page: Page,
  info: TestInfo,
  block: ReturnType<Page["locator"]>,
  slot = 0,
  expectReport = true,
): Promise<string> {
  await block.scrollIntoViewIfNeeded();
  const b = (await block.boundingBox())!;
  const ws = await workspaceBox(page);
  const to = { x: ws.x + ws.width * 0.45, y: ws.y + 60 + slot * 70 };
  await drag(page, info, { x: b.x + Math.min(24, b.width / 3), y: b.y + b.height / 2 }, to);
  const opcode = await block.getAttribute("data-opcode");
  const placed = page.locator(`.kb-main-svg g.kb-stack > g.kb-block[data-opcode="${opcode}"]`).last();
  await expect(placed)
    .toBeVisible({ timeout: 5_000 })
    .catch(async (e) => {
      await page.screenshot({ path: info.outputPath(`drop-fail-${opcode}.png`) });
      throw e;
    });
  const pb = (await placed.boundingBox())!;
  const tapAt = { x: pb.x + 6, y: pb.y + pb.height / 2 };
  await page.locator(".kb-report").evaluateAll((els) => els.forEach((e) => e.remove()));
  if (isTouch(info)) await page.touchscreen.tap(tapAt.x, tapAt.y);
  else await page.mouse.click(tapAt.x, tapAt.y);
  if (!expectReport) return "";
  const report = page.locator(".kb-report").last();
  await expect(report).toBeVisible({ timeout: 60_000 });
  return ((await report.textContent()) ?? "").trim();
}
