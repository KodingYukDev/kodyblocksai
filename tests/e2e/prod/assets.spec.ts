/**
 * Build produksi: sprite dari pustaka, gambar kostum, rekam + unggah suara, simpan .sb3 lalu buka lagi.
 */
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  addMenu,
  expectNoHorizontalScroll,
  expectNoProblems,
  isPhone,
  loadProject,
  makeWav,
  newProject,
  openApp,
  press,
  saveProject,
  stubShare,
  watchProblems,
} from "./helpers";

async function showSprites(page: Page, info: TestInfo): Promise<void> {
  if (isPhone(info)) await press(page, info, page.getByRole("tab", { name: "Sprite" }));
}

const spriteNames = (page: Page) =>
  page.locator(".kb-sprite-grid").first().locator("li").evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));

const assetCount = (page: Page) => page.locator('.kb-assetlist__items [role="option"]').count();

test("sprite pustaka, gambar kostum, rekam & unggah suara, simpan .sb3 lalu buka lagi", async ({ page, context }, info) => {
  const problems = await watchProblems(page);
  await stubShare(page);
  await context.grantPermissions(["microphone", "camera"]).catch(() => undefined);
  await openApp(page);

  // 1. Sprite dari pustaka.
  await showSprites(page, info);
  expect(await spriteNames(page)).toHaveLength(1);
  await addMenu(page, info, "Pilih Sprite", null);
  const lib = page.getByRole("dialog", { name: "Pilih Sprite" });
  await expect(lib).toBeVisible();
  await expect(lib.locator(".kb-library__card").first()).toBeVisible({ timeout: 30_000 });
  await expectNoHorizontalScroll(page);
  const pickedName = ((await lib.locator(".kb-library__card .kb-library__name").first().textContent()) ?? "").trim();
  await press(page, info, lib.locator(".kb-library__card").first());
  await expect(lib).toHaveCount(0);
  await expect.poll(() => spriteNames(page).then((n) => n.length), { timeout: 30_000 }).toBe(2);
  const names = await spriteNames(page);
  expect(names.some((n) => n.startsWith(pickedName.slice(0, 4)))).toBe(true);

  // 2. Kostum baru digambar: kotak di kanvas paint.
  await press(page, info, page.getByRole("tab", { name: "Kostum" }));
  await expect(page.locator(".kb-paint")).toBeVisible();
  const costumes0 = await assetCount(page);
  await addMenu(page, info, "Pilih Kostum", "Gambar");
  await expect.poll(() => assetCount(page)).toBe(costumes0 + 1);
  await press(page, info, page.getByRole("button", { name: "Kotak", exact: true }));
  const canvas = (await page.locator(".kb-paint__stagewrap").boundingBox())!;
  const from = { x: canvas.x + canvas.width * 0.3, y: canvas.y + canvas.height * 0.3 };
  const to = { x: canvas.x + canvas.width * 0.6, y: canvas.y + canvas.height * 0.6 };
  const { drag } = await import("./helpers");
  await drag(page, info, from, to);
  // Gambar tersimpan ke kostum: thumbnail kostum terpilih berubah (bukan kanvas kosong).
  await page.waitForTimeout(1200);
  await page.screenshot({ path: info.outputPath("paint.png") });
  // Ukuran kostum baru (keterangan "L x T" di daftar) menunjukkan kotak yang digambar, bukan kanvas kosong.
  await expect
    .poll(async () => {
      const t = (await page.locator('.kb-assetlist__items [role="option"]').last().locator(".kb-assetlist__detail").textContent()) ?? "";
      return Number(/(\d+)\s*x/.exec(t)?.[1] ?? 0);
    })
    .toBeGreaterThan(50);

  // 3. Suara: unggah WAV + rekam dari mikrofon palsu.
  await press(page, info, page.getByRole("tab", { name: "Suara" }));
  const sounds0 = await assetCount(page);
  const chooser = page.waitForEvent("filechooser");
  await addMenu(page, info, "Pilih Suara", "Unggah Suara");
  await (await chooser).setFiles({ name: "nada.wav", mimeType: "audio/wav", buffer: makeWav() });
  await expect.poll(() => assetCount(page), { timeout: 20_000 }).toBe(sounds0 + 1);
  await expect(page.locator(".kb-assetlist__items").getByText("nada")).toBeVisible();

  if (info.project.use.browserName === "chromium" || !info.project.use.browserName) {
    await addMenu(page, info, "Pilih Suara", "Rekam");
    const rec = page.getByRole("dialog", { name: "Rekam Suara" });
    await expect(rec).toBeVisible();
    await press(page, info, rec.getByRole("button", { name: "Rekam", exact: true }));
    await expect(rec.getByRole("button", { name: "Berhenti Merekam" })).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1500);
    await press(page, info, rec.getByRole("button", { name: "Berhenti Merekam" }));
    await press(page, info, rec.getByRole("button", { name: "Simpan", exact: true }));
    await expect(rec).toHaveCount(0);
    await expect.poll(() => assetCount(page), { timeout: 20_000 }).toBe(sounds0 + 2);
  }
  const soundsSaved = await assetCount(page);
  await press(page, info, page.getByRole("tab", { name: "Kostum" }));
  const costumesSaved = await assetCount(page);

  // 4. Simpan, proyek baru, buka lagi: sprite, kostum, suara kembali.
  const file = await saveProject(page, info);
  expect(file.name).toMatch(/\.sb3$/);
  expect(file.buffer.subarray(0, 2).toString()).toBe("PK");
  await newProject(page, info);
  await showSprites(page, info);
  await expect.poll(() => spriteNames(page).then((n) => n.length), { timeout: 20_000 }).toBe(1);
  await loadProject(page, info, file);
  await showSprites(page, info);
  await expect.poll(() => spriteNames(page), { timeout: 30_000 }).toEqual(names);
  // Sprite terakhir yang dipilih saat disimpan = sprite pustaka.
  await press(page, info, page.locator(".kb-sprite-grid li").nth(1).locator("[aria-label]").first());
  await press(page, info, page.getByRole("tab", { name: "Kostum" }));
  await expect.poll(() => assetCount(page)).toBe(costumesSaved);
  await press(page, info, page.getByRole("tab", { name: "Suara" }));
  await expect.poll(() => assetCount(page)).toBe(soundsSaved);
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath("reloaded.png") });
  await expectNoProblems(page, problems);
});
